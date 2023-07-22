"""Replay buffer for DQN."""
from typing import Generic, TypeVar

import numpy as np
import tensorflow as tf

ExampleT = TypeVar("ExampleT", bound=tuple)
BatchT = TypeVar("BatchT", bound=tuple)


class ReplayBuffer(Generic[ExampleT, BatchT]):
    """Circular buffer for storing experiences for learning."""

    def __init__(
        self,
        max_size: int,
        batch_cls: type[BatchT],
    ):
        """
        Creates a ReplayBuffer.

        :param max_size: Max number of experiences to keep in the buffer.
        :param batch_cls: Named tuple class for batching.
        """
        self.max_size = max_size
        self.batch_cls = batch_cls

        self._buffer = np.empty((max_size,), dtype=np.object_)
        self._index = 0
        self._size = 0

    def __len__(self) -> int:
        return self._size

    def add(self, example: ExampleT):
        """
        Adds an example to the buffer. If the buffer is full, the oldest example
        is discarded.
        """
        self._buffer[self._index] = example
        self._index = (self._index + 1) % self.max_size
        self._size = min(self._size + 1, self.max_size)

    def sample(self, batch_size: int) -> BatchT:
        """
        Randomly samples a batch of examples from the buffer.

        :param batch_size: Number of examples to sample.
        :returns: Tuple containing batched tensor examples.
        """
        if batch_size > self._size:
            raise ValueError(
                f"Not enough samples in the buffer. Have {self._size} but "
                f"requested {batch_size}"
            )
        indices = np.random.choice(self._size, size=batch_size, replace=False)
        examples = self._buffer[indices]
        # Unpack tuple fields for batching.
        fields = (ReplayBuffer._batch(values) for values in zip(*examples))
        return self.batch_cls(*fields)

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
