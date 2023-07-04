"""Test for Q-value distribution utilities."""
import tensorflow as tf

from .q_dist import project_target_update, zero_q_dist

if __name__ == "__main__":
    tf.print(
        project_target_update(
            reward=[1.0, -1.0],
            target_next_q=tf.tile(tf.constant([[0.25, 0.5, 0.25]]), [2, 1]),
            done=[False, False],
            n_steps=1,
            discount_factor=0.99,
        ),
    )


class ZeroQDistTest(tf.test.TestCase):
    """Test for `zero_q_dist()`."""

    def test_1(self):
        """Test `num_atoms=1`."""
        self.assertAllEqual([1], zero_q_dist(1))

    def test_11(self):
        """Test `num_atoms=11`."""
        self.assertAllEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], zero_q_dist(11))


class ProjectTargetUpdateTest(tf.test.TestCase):
    """Test for `project_target_update()`."""

    def test_0d(self):
        """Test 0-D call with 1-step returns."""
        self.assertAllClose(
            [0.0, 0.25 * 0.99, 0.75 + (0.25 * 0.01)],
            project_target_update(
                reward=1.0,
                target_next_q=tf.constant([0.25, 0.5, 0.25]),
                done=False,
                n_steps=1,
                discount_factor=0.99,
            ),
        )

    def test_1d(self):
        """Test 1-D call with 1-step returns."""
        self.assertAllClose(
            [
                [0.0, 0.25 * 0.99, 0.75 + (0.25 * 0.01)],
                [0.75 + (0.25 * 0.01), 0.25 * 0.99, 0.0],
                [0.25 * 0.99, 0.5 + (0.25 * 0.02), 0.25 * 0.99],
            ],
            project_target_update(
                reward=[1.0, -1.0, 0.0],
                target_next_q=tf.tile(tf.constant([[0.25, 0.5, 0.25]]), [3, 1]),
                done=[False, False, False],
                n_steps=1,
                discount_factor=0.99,
            ),
        )

    def test_2d(self):
        """Test 2-D call with 1-step returns."""
        self.assertAllClose(
            [
                [
                    [0.0, 0.25 * 0.99, 0.75 + (0.25 * (1 - 0.99))],
                    [0.75 + (0.25 * (1 - 0.99)), 0.25 * 0.99, 0.0],
                ],
                [
                    [0.25 * 0.99, 0.5 + 2 * (0.25 * (1 - 0.99)), 0.25 * 0.99],
                    [0.0, 1.0, 0.0],
                ],
            ],
            project_target_update(
                reward=[[1.0, -1.0], [0.0, 0.0]],
                target_next_q=tf.tile(
                    tf.constant([[[0.25, 0.5, 0.25]]]), [2, 2, 1]
                ),
                done=[[False, False], [False, True]],
                n_steps=1,
                discount_factor=0.99,
            ),
        )

    def test_2step(self):
        """Test 2-step returns."""
        self.assertAllClose(
            [
                [0.0, 0.25 * 0.99**2, 0.75 + (0.25 * (1 - 0.99**2))],
                [0.75 + (0.25 * (1 - 0.99**2)), 0.25 * 0.99**2, 0.0],
                [
                    0.25 * 0.99**2,
                    0.5 + 2 * (0.25 * (1 - 0.99**2)),
                    0.25 * 0.99**2,
                ],
                [0.0, 1.0, 0.0],
            ],
            project_target_update(
                reward=[1.0, -1.0, 0.0, 0.0],
                target_next_q=tf.tile(tf.constant([[0.25, 0.5, 0.25]]), [4, 1]),
                done=[False, False, False, True],
                n_steps=2,
                discount_factor=0.99,
            ),
        )

    def test_monte_carlo(self):
        """Test Monte Carlo returns."""
        self.assertAllClose(
            [
                [0.0, 0.0, 1.0],
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 1.0, 0.0],
            ],
            project_target_update(
                reward=[1.0, -1.0, 0.0, 0.0],
                target_next_q=tf.tile(tf.constant([[0.25, 0.5, 0.25]]), [4, 1]),
                done=[True, True, True, True],
                n_steps=0,
                discount_factor=0.99,
            ),
        )
