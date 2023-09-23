"""Replay buffer for DQN."""
from dataclasses import dataclass
from typing import Generic, Optional, TypeVar, Union

import numpy as np
import tensorflow as tf

from .config import AnnealConfig
from .segment_tree import MinTree, SumTree


@dataclass
class PriorityConfig:
    """Config for priority replay."""

    exponent: float
    """Priority exponent."""

    importance: Union[float, AnnealConfig]
    """Importance sampling exponent."""

    epsilon: float = 1e-6
    """Epsilon for priority calculation."""

    @classmethod
    def from_dict(cls, config: dict):
        """Creates a PriorityConfig from a JSON dictionary."""
        if isinstance(config["importance"], dict):
            config["importance"] = AnnealConfig(**config["importance"])
        else:
            config["importance"] = float(config["importance"])
        return cls(**config)


ExampleT = TypeVar("ExampleT", bound=tuple)
BatchT = TypeVar("BatchT", bound=tuple)


class ReplayBuffer(Generic[ExampleT, BatchT]):
    """Circular buffer for storing experiences for learning."""

    def __init__(
        self,
        max_size: int,
        batch_cls: type[BatchT],
        priority: Optional[PriorityConfig] = None,
        random: Optional[np.random.Generator] = None,
    ):
        """
        Creates a ReplayBuffer.

        :param max_size: Max number of experiences to keep in the buffer.
        :param batch_cls: Named tuple class for batching.
        :param priority: Optional config for prioritized replay.
        :param random: Random number generator.
        """
        self.max_size = max_size
        self.batch_cls = batch_cls
        self.priority = priority
        if random is None:
            random = np.random.default_rng()
        self.random = random

        self._buffer = np.empty((max_size,), dtype=np.object_)
        self._index = 0
        self._size = 0

        if priority is not None:
            # Round to next highest power of two (required for segment trees).
            tree_size = 2 ** max_size.bit_length()
            max_size.bit_length()
            self._priorities_sum = SumTree(tree_size)
            self._priorities_min = MinTree(tree_size)
            self._max_priority = 1.0

    def __len__(self) -> int:
        return self._size

    def add(self, example: ExampleT):
        """
        Adds an example to the buffer. If the buffer is full, the oldest example
        is discarded.
        """
        self._buffer[self._index] = example
        if self.priority is not None:
            self._priorities_sum.update(self._index, self._max_priority)
            self._priorities_min.update(self._index, self._max_priority)
        self._index = (self._index + 1) % self.max_size
        self._size = min(self._size + 1, self.max_size)

    def sample(
        self, batch_size: int, step: Optional[tf.Variable] = None
    ) -> tuple[BatchT, tf.Tensor, tf.Tensor]:
        """
        Randomly samples a batch of examples from the buffer.

        :param batch_size: Number of examples to sample.
        :param step: Learn step counter.
        :returns: A tuple containing:
        1. batch: A tuple of batched tensor examples.
        2. is_weights: Importance sampling weights for each example.
        3. indices: Positions of examples within the replay buffer. Used for
        later priority updates via `update_priorities()`.
        """
        if batch_size > self._size:
            raise ValueError(
                f"Not enough samples in the buffer. Have {self._size} but "
                f"requested {batch_size}"
            )

        if self.priority is None:
            indices = self.random.choice(
                self._size, size=batch_size, replace=False
            )
            # Uniform weight.
            is_weights = tf.ones((batch_size,), dtype=tf.float32)
        else:
            assert step is not None
            indices, priorities = self._sample_proportional(batch_size)
            is_weights = self._calculate_is_weights(
                priorities,
                step,
                total_priority=self._priorities_sum.reduce(),
                min_priority=self._priorities_min.reduce(),
                capacity=len(self),
            )

        # Unpack tuple fields for batching.
        examples = self._buffer[indices]
        fields = (ReplayBuffer._batch(values) for values in zip(*examples))
        batch = self.batch_cls(*fields)

        return batch, is_weights, indices

    def update_priorities(self, indices: np.ndarray, td_error: tf.Tensor):
        """Updates the priorities of the sampled transitions."""
        priorities, max_priority = self._calculate_priorities(td_error)
        self._priorities_sum.update(indices, priorities)
        self._priorities_min.update(indices, priorities)
        self._max_priority = max(self._max_priority, max_priority.numpy())

    @tf.function(
        input_signature=[
            tf.TensorSpec(shape=(None,), dtype=tf.float32, name="td_error")
        ],
        jit_compile=True,
    )
    def _calculate_priorities(self, td_error):
        assert self.priority is not None
        priority = (td_error + self.priority.epsilon) ** self.priority.exponent
        max_priority = tf.reduce_max(priority)
        return priority, max_priority

    def _sample_proportional(
        self, batch_size: int
    ) -> tuple[np.ndarray, np.ndarray]:
        # Uniformly sample from each segment.
        segment_len = self._priorities_sum.reduce() / batch_size
        segment_starts = np.arange(batch_size, dtype=np.int32) * segment_len
        bounds = segment_starts + self.random.uniform(
            0.0, segment_len, (batch_size,)
        )

        indices = self._priorities_sum.find_prefix_sum(bounds)
        # Note: Since unpopulated priorities on the right (postfix) side of
        # the sum tree are zeroed on init, this may cause find_prefix_sum to
        # instead return a higher out-of-bounds index, since
        # sum(0, ..., 0) <= bound).
        # The upper bound on the indices fixes this corner case.
        indices = np.minimum(indices, self._size - 1)
        priorities = self._priorities_sum.get(indices)
        return indices, priorities

    @tf.function(
        input_signature=[
            tf.TensorSpec(shape=(None,), dtype=tf.float32, name="priorities"),
            tf.TensorSpec(shape=(), dtype=tf.int64, name="step"),
            tf.TensorSpec(shape=(), dtype=tf.float32, name="total_priority"),
            tf.TensorSpec(shape=(), dtype=tf.float32, name="min_priority"),
            tf.TensorSpec(shape=(), dtype=tf.int32, name="capacity"),
        ],
        jit_compile=True,
    )
    def _calculate_is_weights(
        self, priorities, step, total_priority, min_priority, capacity
    ):
        """Calculates importance sampling weights."""
        capacity = tf.cast(capacity, tf.float32)
        beta = self.get_beta(step)
        probs = priorities / total_priority
        is_weights = (probs * capacity) ** -beta

        # Normalize by max weight over the buffer for stability.
        min_prob = min_priority / total_priority
        max_weight = (min_prob * capacity) ** -beta
        is_weights /= max_weight
        return is_weights

    @tf.function(
        input_signature=[tf.TensorSpec(shape=(), dtype=tf.int64, name="step")],
        jit_compile=True,
    )
    def get_beta(self, step):
        """Gets current importance sampling weight exponent."""
        assert self.priority is not None
        importance = self.priority.importance
        if isinstance(importance, float):
            return tf.constant(importance, tf.float32)
        # Linear anneal beta.
        per_step = tf.constant(
            (importance.start - importance.end) / importance.steps,
            dtype=tf.float32,
        )
        beta = importance.start - (tf.cast(step, dtype=tf.float32) * per_step)
        beta = tf.clip_by_value(
            beta, *sorted((importance.start, importance.end))
        )
        return beta

    @staticmethod
    def _batch(values):
        if isinstance(values[0], (bool, int, float)):
            return tf.constant(values)
        if tf.is_tensor(values[0]):
            return tf.stack(values)
        if isinstance(values[0], np.ndarray):
            return tf.convert_to_tensor(np.stack(values))
        # Nested structure.
        if isinstance(values[0], list):
            return list(map(ReplayBuffer._batch, zip(*values)))
        if isinstance(values[0], tuple):
            return tuple(map(ReplayBuffer._batch, zip(*values)))
        return tf.nest.map_structure(ReplayBuffer._batch, values)
