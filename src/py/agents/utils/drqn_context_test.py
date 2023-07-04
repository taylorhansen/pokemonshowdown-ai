"""Tests for DRQNContext."""
import numpy as np
import tensorflow as tf

from ...utils.typing import Trajectory
from .drqn_context import DRQNContext


# pylint: disable=unbalanced-tuple-unpacking
class DRQNContextTest(tf.test.TestCase):
    """Tests for DRQNContext."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.hiddens = (
            [tf.constant([0.0])],
            [tf.constant([-1.0])],
            [tf.constant([-2.0])],
            [tf.constant([-3.0])],
            [tf.constant([-4.0])],
        )
        cls.states = (
            tf.constant([1.0]),
            tf.constant([2.0]),
            tf.constant([3.0]),
            tf.constant([4.0]),
        )
        cls.choices = (
            np.array([1.0], dtype=np.float32),
            np.array([2.0], dtype=np.float32),
            np.array([3.0], dtype=np.float32),
            np.array([4.0], dtype=np.float32),
        )
        cls.actions = (0, 1, 2, 3)
        cls.rewards = (1.0, 2.0, 3.0, 4.0)

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        del cls.hiddens
        del cls.states
        del cls.actions
        del cls.rewards

    def test_1step(self):
        """Test 1-step returns (without burn-in)."""
        ctx = DRQNContext(
            hidden=self.hiddens[0],
            unroll_length=3,
            burn_in=0,
            n_steps=1,
            discount_factor=0.99,
        )
        traj1 = Trajectory(
            hidden=self.hiddens[0],
            mask=tf.constant([True, True, True, True]),
            states=tf.stack(self.states[:4]),
            choices=tf.stack(self.choices[:4]),
            actions=tf.constant(self.actions[:3]),
            rewards=tf.constant(self.rewards[:3]),
        )
        traj2 = Trajectory(
            hidden=self.hiddens[3],
            mask=tf.constant([True, False, False, False]),
            states=tf.stack(self.states[3:4] + ([0.0],) * 3),
            choices=tf.stack(self.choices[3:4] + ([0.0],) * 3),
            actions=tf.constant(self.actions[3:4] + (-1,) * 2),
            rewards=tf.constant(self.rewards[3:4] + (0.0,) * 2),
        )
        self._test_1step(traj1, traj2, ctx)

    def test_1step_burnin(self):
        """Test 1-step returns with burn-in."""
        ctx = DRQNContext(
            hidden=self.hiddens[0],
            unroll_length=2,
            burn_in=1,
            n_steps=1,
            discount_factor=0.99,
        )
        traj1 = Trajectory(
            hidden=self.hiddens[0],
            mask=tf.constant([True, True, True, True]),
            states=tf.stack(self.states[:4]),
            choices=tf.stack(self.choices[:4]),
            actions=tf.constant(self.actions[:3]),
            rewards=tf.constant(self.rewards[:3]),
        )
        traj2 = Trajectory(
            hidden=self.hiddens[2],
            mask=tf.constant([True, True, False, False]),
            states=tf.stack(self.states[2:4] + ([0.0],) * 2),
            choices=tf.stack(self.choices[2:4] + ([0.0],) * 2),
            actions=tf.constant(self.actions[2:4] + (-1,)),
            rewards=tf.constant(self.rewards[2:4] + (0.0,)),
        )
        self._test_1step(traj1, traj2, ctx)

    def _test_1step(
        self, traj1: Trajectory, traj2: Trajectory, ctx: DRQNContext
    ):
        for i in range(3):
            self.assertEqual(
                [],
                ctx.update(
                    action=self.actions[i - 1] if i > 0 else -1,
                    reward=self.rewards[i - 1] if i > 0 else 0.0,
                    next_state=self.states[i],
                    choices=self.choices[i],
                ),
            )
            # New hidden state obtained by calling model on current state.
            # Here we have a_0, h_1 = agent(s_0, h_0) as our first env step.
            ctx.hidden = self.hiddens[i + 1]
        self._assert_equal_trajs(
            [traj1],
            ctx.update(
                action=self.actions[2],
                reward=self.rewards[2],
                next_state=self.states[3],
                choices=self.choices[3],
            ),
        )
        ctx.hidden = self.hiddens[4]
        self._assert_equal_trajs(
            [traj2],
            ctx.update(
                action=self.actions[3],
                reward=self.rewards[3],
                # Terminal state.
                next_state=tf.constant([0.0]),
                choices=np.array([0.0]),
                terminated=True,
            ),
        )

    def test_1step_truncate(self):
        """Test 1-step returns with truncated trajectory."""
        ctx = DRQNContext(
            hidden=self.hiddens[0],
            unroll_length=2,
            burn_in=1,
            n_steps=1,
            discount_factor=0.99,
        )
        traj = Trajectory(
            hidden=self.hiddens[0],
            mask=tf.constant([True, True, False, False]),
            states=tf.stack(self.states[:2] + ([0.0],) * 2),
            choices=tf.stack(self.choices[:2] + ([0.0],) * 2),
            actions=tf.constant(self.actions[:2] + (-1,)),
            rewards=tf.constant(self.rewards[:2] + (0.0,)),
        )
        for i in range(3):
            self.assertEqual(
                [],
                ctx.update(
                    action=self.actions[i - 1] if i > 0 else -1,
                    reward=self.rewards[i - 1] if i > 0 else 0.0,
                    # At i=2, next state treated as terminal due to truncation.
                    next_state=self.states[i],
                    choices=self.choices[i],
                ),
            )
            ctx.hidden = self.hiddens[i + 1]
        self._assert_equal_trajs([traj], ctx.truncate())

    def test_no_burnin_only_unroll(self):
        """
        Ensures that unrolled sequences containing only burn-in steps are not
        emitted.
        """
        ctx = DRQNContext(
            hidden=self.hiddens[0],
            unroll_length=1,
            burn_in=2,
            n_steps=1,
            discount_factor=0.99,
        )
        traj = Trajectory(
            hidden=self.hiddens[0],
            mask=tf.constant([True, True, True, False]),
            states=tf.stack(self.states[:3] + ([0.0],)),
            choices=tf.stack(self.choices[:3] + ([0.0],)),
            actions=tf.constant(self.actions[:3]),
            rewards=tf.constant(self.rewards[:3]),
        )
        for i in range(3):
            self.assertEqual(
                [],
                ctx.update(
                    action=self.actions[i - 1] if i > 0 else -1,
                    reward=self.rewards[i - 1] if i > 0 else 0.0,
                    next_state=self.states[i],
                    choices=self.choices[i],
                ),
            )
            ctx.hidden = self.hiddens[i + 1]
        self._assert_equal_trajs(
            [traj],
            ctx.update(
                action=self.actions[2],
                reward=self.rewards[2],
                next_state=tf.constant([0.0]),
                choices=tf.constant([0.0]),
                terminated=True,
            ),
        )

    def test_2step(self):
        """Tests 2-step returns (without burn-in)."""
        ctx = DRQNContext(
            hidden=self.hiddens[0],
            unroll_length=2,
            burn_in=0,
            n_steps=2,
            discount_factor=0.99,
        )
        # Note additional overlap by n-steps for states.
        traj1 = Trajectory(
            hidden=self.hiddens[0],
            mask=tf.constant([True, True, True, False]),
            states=tf.stack(self.states[:3] + ([0.0],)),
            choices=tf.stack(self.choices[:3] + ([0.0],)),
            actions=tf.constant(self.actions[:2]),
            rewards=tf.constant(self.rewards[:2])
            + (ctx.discount_factor * tf.constant(self.rewards[1:3])),
        )
        traj2 = Trajectory(
            hidden=self.hiddens[2],
            mask=tf.constant([True, False, False, False]),
            states=tf.stack(self.states[2:3] + ([0.0],) * 3),
            choices=tf.stack(self.choices[2:3] + ([0.0],) * 3),
            actions=tf.constant(self.actions[2:3] + (-1,)),
            rewards=tf.constant(self.rewards[2:3] + (0.0,)),
        )
        for i in range(3):
            self.assertEqual(
                [],
                ctx.update(
                    action=self.actions[i - 1] if i > 0 else -1,
                    reward=self.rewards[i - 1] if i > 0 else 0.0,
                    next_state=self.states[i],
                    choices=self.choices[i],
                ),
            )
            ctx.hidden = self.hiddens[i + 1]
        ctx.hidden = self.hiddens[4]
        self._assert_equal_trajs(
            [traj1, traj2],
            ctx.update(
                action=self.actions[2],
                reward=self.rewards[2],
                # Terminal state.
                next_state=tf.constant([0.0]),
                choices=np.array([0.0]),
                terminated=True,
            ),
        )

    # pylint: disable-next=invalid-name
    def _assert_equal_trajs(self, a: list[Trajectory], b: list[Trajectory]):
        self.assertLen(b, len(a))
        # pylint: disable-next=invalid-name
        for i, (x, y) in enumerate(zip(a, b)):
            self.assertAllEqual(
                x.mask, y.mask, msg=f"Comparing a[{i}].mask, b[{i}].mask"
            )
            self.assertAllEqual(
                x.hidden,
                y.hidden,
                msg=f"Comparing a[{i}].hidden, b[{i}].hidden",
            )
            self.assertAllEqual(
                x.states, y.states, msg=f"Comparing a[{i}].state, b[{i}].state"
            )
            self.assertAllEqual(
                x.choices,
                y.choices,
                msg=f"Comparing a[{i}].choices, b[{i}].choices",
            )
            self.assertAllEqual(
                x.actions,
                y.actions,
                msg=f"Comparing a[{i}].actions, b[{i}].actions",
            )
            self.assertAllCloseAccordingToType(
                x.rewards,
                y.rewards,
                msg=f"Comparing a[{i}].rewards, b[{i}].rewards",
            )
