"""Test for replay buffer."""
import numpy as np
import tensorflow as tf

from ...utils.typing import Experience, TensorExperience, Trajectory
from .replay_buffer import PriorityConfig, ReplayBuffer


class ReplayBufferTest(tf.test.TestCase):
    """Test for ReplayBuffer."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.exps = (
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
        cls.trajs = (
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

    @classmethod
    def tearDownClass(cls) -> None:
        super().tearDownClass()
        del cls.exps
        del cls.trajs

    def test_experience(self) -> None:
        """Test experience replay."""
        replay_buffer = ReplayBuffer[Experience, TensorExperience](
            max_size=3, batch_cls=TensorExperience
        )
        self.assertLen(replay_buffer, 0)

        for i, exp in enumerate(self.exps):
            replay_buffer.add(exp)
            self.assertLen(replay_buffer, min(i + 1, replay_buffer.max_size))

        batch, is_weights, indices = replay_buffer.sample(
            replay_buffer.max_size
        )
        self.assertAllEqual((3, 1), batch.state.shape)
        self.assertAllEqual((3,), batch.action.shape)
        self.assertAllEqual((3,), batch.reward.shape)
        self.assertAllEqual((3, 1), batch.next_state.shape)
        self.assertAllEqual((3, 1), batch.choices.shape)
        self.assertAllEqual((3,), batch.done.shape)
        self.assertAllEqual(tf.ones((3,)), is_weights)
        self.assertAllInRange(indices, 0, 3, open_upper_bound=True)

    def test_trajectory(self) -> None:
        """Test trajectory replay."""
        replay_buffer = ReplayBuffer[Trajectory, Trajectory](
            max_size=3, batch_cls=Trajectory
        )
        self.assertLen(replay_buffer, 0)

        for i, traj in enumerate(self.trajs):
            replay_buffer.add(traj)
            self.assertLen(replay_buffer, min(i + 1, replay_buffer.max_size))

        batch, is_weights, indices = replay_buffer.sample(
            replay_buffer.max_size
        )
        self.assertIsInstance(batch.hidden, list)
        self.assertLen(batch.hidden, 2)
        self.assertAllEqual((3, 1), batch.hidden[0].shape)
        self.assertAllEqual((3, 1), batch.hidden[1].shape)
        self.assertAllEqual((3, 3), batch.mask.shape)
        self.assertAllEqual((3, 3, 1), batch.states.shape)
        self.assertAllEqual((3, 3, 1), batch.choices.shape)
        self.assertAllEqual((3, 3), batch.actions.shape)
        self.assertAllEqual((3, 3), batch.rewards.shape)
        self.assertAllEqual(tf.ones((3,)), is_weights)
        self.assertAllInRange(indices, 0, 3, open_upper_bound=True)

    def test_priority(self) -> None:
        """Test priority replay."""
        replay_buffer = ReplayBuffer[Experience, TensorExperience](
            max_size=3,
            batch_cls=TensorExperience,
            priority=PriorityConfig(exponent=0.5, importance=0.5),
        )
        for exp in self.exps:
            replay_buffer.add(exp)

        step = tf.Variable(0, name="step", dtype=tf.int64)
        batch, is_weights, indices = replay_buffer.sample(2, step=step)
        self.assertAllEqual((2, 1), batch.state.shape)
        self.assertAllEqual((2,), batch.action.shape)
        self.assertAllEqual((2,), batch.reward.shape)
        self.assertAllEqual((2, 1), batch.next_state.shape)
        self.assertAllEqual((2, 1), batch.choices.shape)
        self.assertAllEqual((2,), batch.done.shape)
        self.assertAllEqual(tf.ones((2,)), is_weights)
        self.assertAllInRange(indices, 0, 3, open_upper_bound=True)

        # Update priorities after a learning update.
        replay_buffer.update_priorities(
            indices, tf.constant([2, 3], dtype=tf.float32)
        )
        step.assign_add(1, read_value=False)

        batch, is_weights, indices = replay_buffer.sample(2, step=step)
        self.assertAllEqual((2, 1), batch.state.shape)
        self.assertAllEqual((2,), batch.action.shape)
        self.assertAllEqual((2,), batch.reward.shape)
        self.assertAllEqual((2, 1), batch.next_state.shape)
        self.assertAllEqual((2, 1), batch.choices.shape)
        self.assertAllEqual((2,), batch.done.shape)
        self.assertAllLessEqual(is_weights, 1.0)
        self.assertAllInRange(indices, 0, 3, open_upper_bound=True)
