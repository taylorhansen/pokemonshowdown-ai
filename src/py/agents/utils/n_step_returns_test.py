# pylint: disable=missing-module-docstring, missing-class-docstring, missing-function-docstring
import unittest

import numpy as np

from ...utils.typing import Experience
from .n_step_returns import NStepReturns


class NStepReturnsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.states = (
            {"0": np.array([0])},
            {"1": np.array([1])},
            {"2": np.array([2])},
            {"3": np.array([3])},
            {"4": np.array([4])},
        )

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        del cls.states

    def test_1step(self):
        nsr = NStepReturns(steps=1, discount_factor=0.99)

        exp1 = Experience(
            state=self.states[0],
            action=0,
            reward=1,
            next_state=self.states[1],
            choices=np.array([1]),
            done=False,
        )
        exps1 = nsr.add_experience(exp1)
        self.assertEqual([exp1], exps1)

        exp2 = Experience(
            state=self.states[1],
            action=1,
            reward=2,
            next_state=self.states[2],
            choices=np.array([2]),
            done=False,
        )
        exps2 = nsr.add_experience(exp2)
        self.assertEqual([exp2], exps2)

        exp3 = Experience(
            state=self.states[2],
            action=2,
            reward=3,
            next_state=self.states[3],
            choices=np.array([3]),
            done=True,
        )
        exps3 = nsr.add_experience(exp3)
        self.assertEqual([exp3], exps3)

    def test_2step(self):
        nsr = NStepReturns(steps=2, discount_factor=0.99)

        exp1 = Experience(
            state=self.states[0],
            action=0,
            reward=1,
            next_state=self.states[1],
            choices=np.array([1]),
            done=False,
        )
        exps1 = nsr.add_experience(exp1)
        self.assertEqual([], exps1)

        exp2 = Experience(
            state=self.states[1],
            action=1,
            reward=2,
            next_state=self.states[2],
            choices=np.array([2]),
            done=False,
        )
        exps2 = nsr.add_experience(exp2)
        expected_exp1 = Experience(
            state=exp1.state,
            action=exp1.action,
            reward=exp1.reward + nsr.discount_factor * exp2.reward,
            next_state=exp2.next_state,
            choices=exp2.choices,
            done=False,
        )
        self.assertEqual([expected_exp1], exps2)

        exp3 = Experience(
            state=self.states[2],
            action=2,
            reward=3,
            next_state=self.states[3],
            choices=np.array([3]),
            done=True,
        )
        exps3 = nsr.add_experience(exp3)
        expected_exp2 = Experience(
            state=exp2.state,
            action=exp2.action,
            reward=exp2.reward + nsr.discount_factor * exp3.reward,
            next_state=exp3.next_state,
            choices=exp3.choices,
            done=True,
        )
        self.assertEqual([expected_exp2, exp3], exps3)

    def test_3step(self):
        nsr = NStepReturns(steps=3, discount_factor=0.99)

        exp1 = Experience(
            state=self.states[0],
            action=0,
            reward=1,
            next_state=self.states[1],
            choices=np.array([1]),
            done=False,
        )
        exps1 = nsr.add_experience(exp1)
        self.assertEqual([], exps1)

        exp2 = Experience(
            state=self.states[1],
            action=1,
            reward=2,
            next_state=self.states[2],
            choices=np.array([2]),
            done=False,
        )
        exps2 = nsr.add_experience(exp2)
        self.assertEqual([], exps2)

        exp3 = Experience(
            state=self.states[2],
            action=2,
            reward=3,
            next_state=self.states[3],
            choices=np.array([3]),
            done=False,
        )
        exps3 = nsr.add_experience(exp3)
        expected_exp1 = Experience(
            state=exp1.state,
            action=exp1.action,
            reward=exp1.reward
            + nsr.discount_factor * exp2.reward
            + nsr.discount_factor**2 * exp3.reward,
            next_state=exp3.next_state,
            choices=exp3.choices,
            done=False,
        )
        self.assertEqual([expected_exp1], exps3)

        exp4 = Experience(
            state=self.states[3],
            action=3,
            reward=4,
            next_state=self.states[4],
            choices=np.array([4]),
            done=True,
        )
        exps4 = nsr.add_experience(exp4)
        expected_exp2 = Experience(
            state=exp2.state,
            action=exp2.action,
            reward=exp2.reward
            + nsr.discount_factor * exp3.reward
            + nsr.discount_factor**2 * exp4.reward,
            next_state=exp4.next_state,
            choices=exp4.choices,
            done=True,
        )
        expected_exp3 = Experience(
            state=exp3.state,
            action=exp3.action,
            reward=exp3.reward + nsr.discount_factor * exp4.reward,
            next_state=exp4.next_state,
            choices=exp4.choices,
            done=True,
        )
        self.assertEqual([expected_exp2, expected_exp3, exp4], exps4)
