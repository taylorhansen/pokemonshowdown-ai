"""Tetst for segment tree implementations."""
import unittest

import numpy as np

from .segment_tree import MinTree, SumTree


class SumTreeTest(unittest.TestCase):
    """Test for SumTree."""

    def test_capacity_constraint(self):
        """Test constraint on capacity."""
        with self.assertRaises(AssertionError) as ctx:
            SumTree(3)
        self.assertIn("capacity must be a power of 2", str(ctx.exception))

    def test_get(self):
        """Test get."""
        sum_tree = SumTree(4)
        self.assertEqual(0, sum_tree.get(0))
        self.assertEqual(0, sum_tree.get(1))
        self.assertEqual(0, sum_tree.get(2))
        self.assertEqual(0, sum_tree.get(3))

    def test_update(self):
        """Test update."""
        sum_tree = SumTree(4)
        sum_tree.update(0, 2)
        sum_tree.update(3, 4)
        self.assertEqual(2, sum_tree.get(0))
        self.assertEqual(0, sum_tree.get(1))
        self.assertEqual(0, sum_tree.get(2))
        self.assertEqual(4, sum_tree.get(3))

    def test_get_vectorized(self):
        """Test vectorized get."""
        sum_tree = SumTree(4)
        np.testing.assert_equal(
            np.array([0, 0, 0, 0], dtype=np.float32),
            sum_tree.get(np.array([0, 1, 2, 3])),
        )

        sum_tree.update(0, 2)
        sum_tree.update(3, 4)
        np.testing.assert_equal(
            np.array([2, 4, 0, 0], dtype=np.float32),
            sum_tree.get(np.array([0, 3, 2, 1])),
        )

    def test_update_vectorized(self):
        """Test vectorized update."""
        sum_tree = SumTree(4)
        sum_tree.update(np.array([0, 3]), np.array([2, 4], dtype=np.float32))
        np.testing.assert_equal(
            np.array([2, 0, 0, 4], dtype=np.float32),
            sum_tree.get(np.array([0, 1, 2, 3])),
        )

        sum_tree.update(np.array([2, 3]), np.array([3, 5], dtype=np.float32))
        np.testing.assert_equal(
            np.array([2, 0, 3, 5], dtype=np.float32),
            sum_tree.get(np.array([0, 1, 2, 3])),
        )

    def test_sum(self):
        """Test sum reduction."""
        sum_tree = SumTree(4)

        sum_tree.update(0, 2)
        self.assertEqual(2, sum_tree.reduce())

        sum_tree.update(2, 4)
        self.assertEqual(6, sum_tree.reduce())

        sum_tree.update(3, 1)
        self.assertEqual(7, sum_tree.reduce())

        sum_tree.update(1, -1)
        self.assertEqual(6, sum_tree.reduce())

        sum_tree.update(1, -10)
        self.assertEqual(-3, sum_tree.reduce())

    def test_prefix_sum(self):
        """Test prefix sum finder algorithm."""
        sum_tree = SumTree(4)
        sum_tree.update(
            np.array([0, 1, 2, 3]), np.array([5, 9, 1, 3], dtype=np.float32)
        )

        for i in range(-100, 0):
            self.assertEqual(0, sum_tree.find_prefix_sum(i))
        for i in range(0, 5):
            self.assertEqual(0, sum_tree.find_prefix_sum(i))
        for i in range(5, 14):
            self.assertEqual(1, sum_tree.find_prefix_sum(i))
        for i in range(14, 15):
            self.assertEqual(2, sum_tree.find_prefix_sum(i))
        for i in range(15, 18):
            self.assertEqual(3, sum_tree.find_prefix_sum(i))
        for i in range(18, 100):
            self.assertEqual(3, sum_tree.find_prefix_sum(i))

    def test_prefix_sum_partial_init(self):
        """
        Test prefix sum finder algorithm on a partially-initialized sum tree.
        """
        sum_tree = SumTree(4)
        sum_tree.update(np.array([1, 2]), np.array([9, 1], dtype=np.float32))

        for i in range(-100, 0):
            self.assertEqual(0, sum_tree.find_prefix_sum(i))
        for i in range(0, 9):
            self.assertEqual(1, sum_tree.find_prefix_sum(i))
        for i in range(9, 10):
            self.assertEqual(2, sum_tree.find_prefix_sum(i))
        for i in range(10, 100):
            self.assertEqual(3, sum_tree.find_prefix_sum(i))

    def test_prefix_sum_vectorized(self):
        """Test vectorized prefix sum finder."""
        sum_tree = SumTree(4)
        sum_tree.update(np.array([1, 2]), np.array([9, 1], dtype=np.float32))

        np.testing.assert_equal(
            np.array([0, 1, 2, 3]),
            sum_tree.find_prefix_sum(np.array([-1, 1, 9, 10])),
        )


class MinTreeTest(unittest.TestCase):
    """Test for MinTree."""

    def test_min(self):
        """Test min reduction."""
        min_tree = MinTree(4)
        np.testing.assert_equal(
            np.array([np.inf] * 4, dtype=np.float32),
            min_tree.get(np.array([0, 1, 2, 3])),
        )

        min_tree.update(0, 2)
        self.assertEqual(2, min_tree.get(0))
        self.assertEqual(2, min_tree.reduce())

        min_tree.update(2, 4)
        self.assertEqual(4, min_tree.get(2))
        self.assertEqual(2, min_tree.reduce())

        min_tree.update(3, 1)
        self.assertEqual(1, min_tree.get(3))
        self.assertEqual(1, min_tree.reduce())

        min_tree.update(1, -1)
        self.assertEqual(-1, min_tree.get(1))
        self.assertEqual(-1, min_tree.reduce())

        min_tree.update(1, -10)
        min_tree.update(np.array([1, 2]), np.array([-10, -5], dtype=np.float32))
        np.testing.assert_equal(
            np.array([-10, -5], dtype=np.float32),
            min_tree.get(np.array([1, 2])),
        )
        self.assertEqual(-10, min_tree.reduce())
