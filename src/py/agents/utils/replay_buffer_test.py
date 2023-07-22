"""Test for replay buffer."""
import numpy as np
import tensorflow as tf

from ...utils.typing import Experience, TensorExperience, Trajectory
from .replay_buffer import ReplayBuffer


class ReplayBufferTest(tf.test.TestCase):
    """Test for ReplayBuffer."""

    def test_experience(self) -> None:
        """Test experience replay."""
        replay_buffer = ReplayBuffer[Experience, TensorExperience](
            max_size=3, batch_cls=TensorExperience
        )
        self.assertLen(replay_buffer, 0)

        exps: tuple[Experience, ...] = (
            Experience(
                state=np.array([0.0]),
                action=0,
                reward=0.0,
                next_state=np.array([1.0]),
                choices=np.array([1.0]),
                done=False,
            ),
            Experience(
                state=np.array([1.0]),
                action=1,
                reward=1.0,
                next_state=np.array([2.0]),
                choices=np.array([2.0]),
                done=False,
            ),
            Experience(
                state=np.array([2.0]),
                action=2,
                reward=2.0,
                next_state=np.array([3.0]),
                choices=np.array([3.0]),
                done=False,
            ),
            Experience(
                state=np.array([3.0]),
                action=3,
                reward=3.0,
                next_state=np.array([4.0]),
                choices=np.array([4.0]),
                done=True,
            ),
        )
        for i, exp in enumerate(exps):
            replay_buffer.add(exp)
            self.assertLen(replay_buffer, min(i + 1, replay_buffer.max_size))

        batch = replay_buffer.sample(replay_buffer.max_size)
        self.assertAllEqual(batch.state.shape, (3, 1))
        self.assertAllEqual(batch.action.shape, (3,))
        self.assertAllEqual(batch.reward.shape, (3,))
        self.assertAllEqual(batch.next_state.shape, (3, 1))
        self.assertAllEqual(batch.choices.shape, (3, 1))
        self.assertAllEqual(batch.done.shape, (3,))

    def test_trajectory(self) -> None:
        """Test trajectory replay."""
        replay_buffer = ReplayBuffer[Trajectory, Trajectory](
            max_size=3, batch_cls=Trajectory
        )
        self.assertLen(replay_buffer, 0)

        trajs: tuple[Trajectory, ...] = (
            Trajectory(
                hidden=[tf.constant([0.0]), tf.constant([1.0])],
                mask=tf.constant([True, True, True]),
                states=np.array([[0.0], [1.0], [2.0]]),
                choices=tf.constant([[0.0], [1.0], [2.0]]),
                actions=tf.constant([0, 1, 2]),
                rewards=tf.constant([0.0, 1.0, 2.0]),
            ),
            Trajectory(
                hidden=[tf.constant([2.0]), tf.constant([3.0])],
                mask=tf.constant([True, True, False]),
                states=np.array([[3.0], [4.0], [0.0]]),
                choices=tf.constant([[3.0], [4.0], [0.0]]),
                actions=tf.constant([3, 4, -1]),
                rewards=tf.constant([3.0, 4.0, 0.0]),
            ),
            Trajectory(
                hidden=[tf.constant([4.0]), tf.constant([5.0])],
                mask=tf.constant([True, True, True]),
                states=np.array([[5.0], [6.0], [7.0]]),
                choices=tf.constant([[5.0], [6.0], [7.0]]),
                actions=tf.constant([5, 6, 7]),
                rewards=tf.constant([5.0, 6.0, 7.0]),
            ),
            Trajectory(
                hidden=[tf.constant([6.0]), tf.constant([7.0])],
                mask=tf.constant([True, False, False]),
                states=np.array([[8.0], [0.0], [0.0]]),
                choices=tf.constant([[8.0], [0.0], [0.0]]),
                actions=tf.constant([8, -1, -1]),
                rewards=tf.constant([8.0, 0.0, 0.0]),
            ),
        )
        for i, traj in enumerate(trajs):
            replay_buffer.add(traj)
            self.assertLen(replay_buffer, min(i + 1, replay_buffer.max_size))

        batch = replay_buffer.sample(replay_buffer.max_size)
        self.assertIsInstance(batch.hidden, list)
        self.assertLen(batch.hidden, 2)
        self.assertAllEqual(batch.hidden[0].shape, (3, 1))
        self.assertAllEqual(batch.hidden[1].shape, (3, 1))
        self.assertAllEqual(batch.mask.shape, (3, 3))
        self.assertAllEqual(batch.states.shape, (3, 3, 1))
        self.assertAllEqual(batch.choices.shape, (3, 3, 1))
        self.assertAllEqual(batch.actions.shape, (3, 3))
        self.assertAllEqual(batch.rewards.shape, (3, 3))
