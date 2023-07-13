"""Replay buffer for DRQN."""
import numpy as np
import tensorflow as tf

from ...utils.typing import Trajectory


class TrajectoryReplayBuffer:
    """
    Circular buffer for storing trajectories for learning. Unlike ReplayBuffer,
    stores unrolled Experience sequences instead of individual state
    transitions.
    """

    def __init__(self, max_size: int):
        """
        Creates a TrajectoryReplayBuffer.

        :param max_size: Max number of trajectories to keep in the buffer.
        """
        self.max_size = max_size

        self.hiddens = np.empty((max_size,), dtype=np.object_)
        self.masks = np.empty((max_size,), dtype=np.object_)
        self.states = np.empty((max_size,), dtype=np.object_)
        self.actions = np.empty((max_size,), dtype=np.object_)
        self.rewards = np.empty((max_size,), dtype=np.object_)
        self.choices = np.empty((max_size,), dtype=np.object_)
        self.index = 0
        self.size = 0

    def add(self, traj: Trajectory):
        """
        Adds a trajectory in the buffer. If the buffer is full, the oldest
        trajectory is discarded.
        """
        self.hiddens[self.index] = traj.hidden
        self.masks[self.index] = traj.mask
        self.states[self.index] = traj.states
        self.choices[self.index] = traj.choices
        self.actions[self.index] = traj.actions
        self.rewards[self.index] = traj.rewards

        self.index = (self.index + 1) % self.max_size
        self.size = min(self.size + 1, self.max_size)

    def sample(self, batch_size: int) -> Trajectory:
        """
        Randomly samples a batch of trajectories from the buffer.

        :param batch_size: Number of trajectories to sample.
        :returns: Trajectory tuple containing batched tensor sequences.
        """
        if batch_size > self.size:
            raise ValueError(
                f"Not enough samples in the buffer. Have {self.size} but "
                f"requested {batch_size}"
            )
        indices = np.random.choice(self.size, size=batch_size, replace=False)
        hidden = list(map(tf.stack, zip(*self.hiddens[indices])))
        mask = tf.stack(self.masks[indices], name="mask")
        if tf.is_tensor(self.states[indices[0]]):
            states = tf.stack(self.states[indices], name="state")
        else:
            states = tf.convert_to_tensor(
                np.stack(self.states[indices]), dtype=tf.float32, name="state"
            )
        choices = tf.stack(self.choices[indices], name="choices")
        actions = tf.stack(self.actions[indices], name="action")
        rewards = tf.stack(self.rewards[indices], name="reward")
        return Trajectory(
            hidden=hidden,
            mask=mask,
            states=states,
            choices=choices,
            actions=actions,
            rewards=rewards,
        )
