"""Replay buffer for DQN."""
import numpy as np
import tensorflow as tf

from ...gen.shapes import ACTION_NAMES, STATE_NAMES, STATE_SHAPES
from ...utils.typing import Experience, TensorExperience


class ReplayBuffer:
    """Circular buffer for storing experiences for learning."""

    def __init__(self, max_size: int):
        """
        Creates a ReplayBuffer.

        :param max_size: Max number of experiences to keep in the buffer.
        """
        self.max_size = max_size
        self.states = np.empty((max_size,), dtype=np.object_)
        self.actions = np.empty((max_size,), dtype=np.int32)
        self.rewards = np.empty((max_size,), dtype=np.float32)
        self.next_states = np.empty((max_size,), dtype=np.object_)
        self.choices = np.empty((max_size, len(ACTION_NAMES)), dtype=np.int32)
        self.dones = np.empty((max_size,), dtype=np.bool_)
        self.index = 0
        self.size = 0

        # Dedup terminal states.
        self._zero_state = {
            name: np.zeros(shape, dtype=np.float32)
            for name, shape in STATE_SHAPES.items()
        }

    def add(self, experience: Experience):
        """
        Adds an experience to the buffer. If the buffer is full, the oldest
        experience is discarded.
        """
        self.states[self.index] = experience.state
        self.actions[self.index] = experience.action
        self.rewards[self.index] = experience.reward
        self.next_states[self.index] = (
            experience.next_state if not experience.done else self._zero_state
        )
        self.choices[self.index, :] = experience.choices
        self.dones[self.index] = experience.done

        self.index = (self.index + 1) % self.max_size
        self.size = min(self.size + 1, self.max_size)

    def sample(self, batch_size: int) -> TensorExperience:
        """
        Randomly samples a batch of experience from the buffer.

        :param batch_size: Number of experiences to sample.
        :returns: The batched experiences converted into tensors.
        """
        if batch_size > self.size:
            raise ValueError(
                f"Not enough samples in the buffer. Have {self.size} but "
                f"requested {batch_size}"
            )

        indices = np.random.choice(self.size, size=batch_size, replace=False)
        states = self.states[indices]
        actions = self.actions[indices]
        rewards = self.rewards[indices]
        next_states = self.next_states[indices]
        choices = self.choices[indices, :]
        dones = self.dones[indices]

        batch_states = {
            name: tf.constant(
                np.stack([state[name] for state in states]),
                dtype=tf.float32,
                name=f"state/{name}",
            )
            for name in STATE_NAMES
        }
        batch_actions = tf.constant(actions, dtype=tf.int32, name="action")
        batch_rewards = tf.constant(rewards, dtype=tf.float32, name="reward")
        batch_next_states = {
            name: tf.constant(
                np.stack([next_state[name] for next_state in next_states]),
                dtype=tf.float32,
                name=f"next_state/{name}",
            )
            for name in STATE_NAMES
        }
        batch_choices = tf.constant(choices, dtype=tf.float32, name="choices")
        batch_dones = tf.constant(dones, dtype=tf.bool, name="done")
        return TensorExperience(
            state=batch_states,
            action=batch_actions,
            reward=batch_rewards,
            next_state=batch_next_states,
            choices=batch_choices,
            done=batch_dones,
        )
