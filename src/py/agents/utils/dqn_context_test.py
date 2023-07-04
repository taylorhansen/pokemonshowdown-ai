"""Tests for DQNContext."""
import unittest

import numpy as np
import tensorflow as tf

from ...utils.typing import Experience
from .dqn_context import DQNContext


class DQNContextTest(unittest.TestCase):
    """Tests for DQNContext."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.states = (
            tf.constant([0]),
            tf.constant([1]),
            tf.constant([2]),
            tf.constant([3]),
            tf.constant([4]),
        )
        cls.choices = (
            np.array([0], dtype=np.float32),
            np.array([1], dtype=np.float32),
            np.array([2], dtype=np.float32),
            np.array([3], dtype=np.float32),
            np.array([4], dtype=np.float32),
        )

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        del cls.states
        del cls.choices

    def test_1step(self):
        """Test 1-step returns."""
        ctx = DQNContext(n_steps=1, discount_factor=0.99)
        exp1 = Experience(
            state=self.states[0],
            action=0,
            reward=1,
            next_state=self.states[1],
            choices=self.choices[1],
            done=False,
        )
        self.assertEqual(
            [],
            ctx.update(
                action=-1,
                reward=0,
                next_state=exp1.state,
                choices=self.choices[0],
            ),
        )
        self.assertEqual(
            [exp1],
            ctx.update(exp1.action, exp1.reward, exp1.next_state, exp1.choices),
        )
        exp2 = Experience(
            state=self.states[1],
            action=1,
            reward=2,
            next_state=self.states[2],
            choices=self.choices[2],
            done=False,
        )
        self.assertEqual(
            [exp2],
            ctx.update(exp2.action, exp2.reward, exp2.next_state, exp2.choices),
        )
        exp3 = Experience(
            state=self.states[2],
            action=2,
            reward=3,
            next_state=self.states[3],
            choices=self.choices[3],
            done=True,
        )
        self.assertEqual(
            [exp3],
            ctx.update(
                exp3.action,
                exp3.reward,
                exp3.next_state,
                exp3.choices,
                terminated=True,
            ),
        )

    def test_2step(self):
        """Test 2-step returns."""
        ctx = DQNContext(n_steps=2, discount_factor=0.99)
        self.assertEqual(
            [],
            ctx.update(
                action=-1,
                reward=0,
                next_state=self.states[0],
                choices=self.choices[0],
            ),
        )
        self.assertEqual(
            [],
            ctx.update(
                action=0,
                reward=1,
                next_state=self.states[1],
                choices=self.choices[1],
            ),
        )
        self.assertEqual(
            [
                Experience(
                    state=self.states[0],
                    action=0,
                    reward=1 + (0.99 * 2),
                    next_state=self.states[2],
                    choices=self.choices[2],
                    done=False,
                )
            ],
            ctx.update(
                action=1,
                reward=2,
                next_state=self.states[2],
                choices=self.choices[2],
            ),
        )
        self.assertEqual(
            [
                Experience(
                    state=self.states[1],
                    action=1,
                    reward=2 + (0.99 * 3),
                    next_state=self.states[3],
                    choices=self.choices[3],
                    done=False,
                )
            ],
            ctx.update(
                action=2,
                reward=3,
                next_state=self.states[3],
                choices=self.choices[3],
            ),
        )
        self.assertEqual(
            [
                Experience(
                    state=self.states[2],
                    action=2,
                    reward=3 + (0.99 * 4),
                    next_state=self.states[4],
                    choices=self.choices[4],
                    done=True,
                ),
                Experience(
                    state=self.states[3],
                    action=3,
                    reward=4,
                    next_state=self.states[4],
                    choices=self.choices[4],
                    done=True,
                ),
            ],
            ctx.update(
                action=3,
                reward=4,
                next_state=self.states[4],
                choices=self.choices[4],
                terminated=True,
            ),
        )

    def test_3step(self):
        """Test 3-step returns."""
        ctx = DQNContext(n_steps=3, discount_factor=0.99)
        self.assertEqual(
            [],
            ctx.update(
                action=-1,
                reward=0,
                next_state=self.states[0],
                choices=self.choices[0],
            ),
        )
        self.assertEqual(
            [],
            ctx.update(
                action=0,
                reward=1,
                next_state=self.states[1],
                choices=self.choices[1],
            ),
        )
        self.assertEqual(
            [],
            ctx.update(
                action=1,
                reward=2,
                next_state=self.states[2],
                choices=self.choices[2],
            ),
        )
        self.assertEqual(
            [
                Experience(
                    state=self.states[0],
                    action=0,
                    reward=1 + (0.99 * 2) + (0.99**2 * 3),
                    next_state=self.states[3],
                    choices=self.choices[3],
                    done=False,
                )
            ],
            ctx.update(
                action=2,
                reward=3,
                next_state=self.states[3],
                choices=self.choices[3],
            ),
        )
        self.assertEqual(
            [
                Experience(
                    state=self.states[1],
                    action=1,
                    reward=2 + (0.99 * 3) + (0.99**2 * 4),
                    next_state=self.states[4],
                    choices=self.choices[4],
                    done=True,
                ),
                Experience(
                    state=self.states[2],
                    action=2,
                    reward=3 + (0.99 * 4),
                    next_state=self.states[4],
                    choices=self.choices[4],
                    done=True,
                ),
                Experience(
                    state=self.states[3],
                    action=3,
                    reward=4,
                    next_state=self.states[4],
                    choices=self.choices[4],
                    done=True,
                ),
            ],
            ctx.update(
                action=3,
                reward=4,
                next_state=self.states[4],
                choices=self.choices[4],
                terminated=True,
            ),
        )
