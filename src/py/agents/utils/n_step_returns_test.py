"""Test for n-step returns utilities."""
import unittest

from .n_step_returns import propagate_n_step_returns


class PropagateNStepReturnsTest(unittest.TestCase):
    """Test for `propagate_n_step_returns()`."""

    def test_1step(self):
        """Test 1-step returns."""
        rewards = [1, 2, 3, 4]
        propagate_n_step_returns(rewards, n_steps=1, discount_factor=0.99)
        self.assertEqual([1, 2, 3, 4], rewards)

    def test_2step(self):
        """Test 2-step returns."""
        rewards = [1, 2, 3, 4]
        propagate_n_step_returns(rewards, n_steps=2, discount_factor=0.99)
        self.assertEqual([1, 2, 3 + (0.99 * 4), 4], rewards)

    def test_3step(self):
        """Test 3-step returns."""
        rewards = [1, 2, 3, 4]
        propagate_n_step_returns(rewards, n_steps=3, discount_factor=0.99)
        self.assertEqual([1, 2 + (0.99**2 * 4), 3 + (0.99 * 4), 4], rewards)

    def test_monte_carlo(self):
        """Test Monte-Carlo returns."""
        rewards = [1, 2, 3, 4]
        propagate_n_step_returns(rewards, n_steps=-1, discount_factor=0.99)
        self.assertEqual(
            [1 + (0.99**3 * 4), 2 + (0.99**2 * 4), 3 + (0.99 * 4), 4],
            rewards,
        )
