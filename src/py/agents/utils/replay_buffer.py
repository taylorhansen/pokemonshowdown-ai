"""Replay buffer for DQN."""
import numpy as np
import tensorflow as tf

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
        self.choices = np.empty((max_size,), dtype=np.object_)
        self.dones = np.empty((max_size,), dtype=np.bool_)
        self.index = 0
        self.size = 0

    def add(self, experience: Experience):
        """
        Adds an experience to the buffer. If the buffer is full, the oldest
        experience is discarded.
        """
        self.states[self.index] = experience.state
        self.actions[self.index] = experience.action
        self.rewards[self.index] = experience.reward
        self.next_states[self.index] = experience.next_state
        self.choices[self.index] = experience.choices
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
        choices = self.choices[indices]
        dones = self.dones[indices]

        if tf.is_tensor(states[0]):
            batch_states = tf.stack(states, name="state")
        else:
            batch_states = tf.convert_to_tensor(
                np.stack(states), dtype=tf.float32, name="state"
            )
        batch_actions = tf.convert_to_tensor(
            actions, dtype=tf.int32, name="action"
        )
        batch_rewards = tf.convert_to_tensor(
            rewards, dtype=tf.float32, name="reward"
        )
        if tf.is_tensor(next_states[0]):
            batch_next_states = tf.stack(next_states, name="next_state")
        else:
            batch_next_states = tf.convert_to_tensor(
                np.stack(next_states), dtype=tf.float32, name="next_state"
            )
        batch_choices = tf.convert_to_tensor(
            np.stack(choices), dtype=tf.float32, name="choices"
        )
        batch_dones = tf.convert_to_tensor(dones, dtype=tf.bool, name="done")
        return TensorExperience(
            state=batch_states,
            action=batch_actions,
            reward=batch_rewards,
            next_state=batch_next_states,
            choices=batch_choices,
            done=batch_dones,
        )
