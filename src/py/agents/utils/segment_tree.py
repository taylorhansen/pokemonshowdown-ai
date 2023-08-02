"""Segment tree implementations."""
from typing import Callable, Union, overload

import numpy as np


class SegmentTree:
    """
    Segment tree implementation. Used as an array that tracks a reduction
    operation on the entire array while allowing arbitrary updates to the array
    in O(log N) time.
    """

    def __init__(
        self,
        capacity: int,
        operation: Callable[[float, float], float],
        initial: float,
    ):
        """
        Creates a SegmentTree.

        :param capacity: Tree capacity. Must be a power of 2.
        :param operation: Reduction operation.
        :param initial: Initial neutral value. Must have that
        `operator(initial, initial) == initial`.
        """
        assert (
            capacity > 0 and capacity & (capacity - 1) == 0
        ), "capacity must be a power of 2"
        self.capacity = capacity
        self.operation = operation

        # Note: Only the leaves (i >= capacity) are exposed to the user. The
        # rest is a binary heap-like layout for the internal nodes that contain
        # the results of the reduction operation on each node's children.
        # Root starts at index i=1 (0 is unused), with children at 2i and 2i+1.
        self._tree = np.empty((2 * capacity,), dtype=np.float32)
        self._tree.fill(initial)

    @overload
    def get(self, index: int) -> float:
        ...

    @overload
    def get(self, index: np.ndarray) -> np.ndarray:
        ...

    def get(self, index: Union[int, np.ndarray]) -> Union[float, np.ndarray]:
        """Gets a value at an index. Vectorized."""
        tree_index = self.capacity + index
        return self._tree[tree_index]

    @overload
    def update(self, index: int, value: float):
        ...

    @overload
    def update(self, index: np.ndarray, value: np.ndarray):
        ...

    def update(
        self, index: Union[int, np.ndarray], value: Union[float, np.ndarray]
    ):
        """Sets a value at an index in O(log N) time. Vectorized."""

        tree_index = self.capacity + index
        self._tree[tree_index] = value

        # Propagate up the tree.
        parent = tree_index // 2
        while np.any(parent > 0):
            left = self._tree[2 * parent]  # Children/sibling.
            right = self._tree[2 * parent + 1]
            # Note: Due to possible floating point error in the sum-tree case,
            # it's safer to recompute the parent nodes directly rather than to
            # accumulate an "update" up the tree which could be faster.
            self._tree[parent] = self.operation(left, right)
            parent = parent // 2

    def reduce(self) -> float:
        """Reduces the operation over the entire array in O(1) time."""
        # Note: Reduction over segments not supported/needed for now.
        return self._tree[1]


class SumTree(SegmentTree):
    """Sum tree implementation. Useful for proportional sampling."""

    def __init__(self, capacity: int):
        """
        Creates a SumTree.

        :param capacity: Tree capacity. Must be a power of 2.
        """
        super().__init__(capacity, operation=np.add, initial=0.0)

    @overload
    def find_prefix_sum(self, bound: float) -> int:
        ...

    @overload
    def find_prefix_sum(self, bound: np.ndarray) -> np.ndarray:
        ...

    def find_prefix_sum(
        self, bound: Union[float, np.ndarray]
    ) -> Union[int, np.ndarray]:
        """
        Finds the highest index `i` such that `sum(arr[:i]) <= bound` in
        O(log N) time. Vectorized.
        """
        if isinstance(bound, (int, float)):
            return self.find_prefix_sum(
                np.array([bound], dtype=np.float32)
            ).item()
        indices = np.ones_like(bound, dtype=int)
        bound = bound.astype(np.float32)
        # Traverse down the tree until leaf for each request.
        is_non_leaf = indices < self.capacity
        while np.any(is_non_leaf):
            # Consider left child.
            indices = np.where(is_non_leaf, indices * 2, indices)
            # Instead select right child when appropriate.
            use_right = np.where(self._tree[indices] <= bound)
            bound[use_right] -= self._tree[indices[use_right]]
            indices[use_right] += 1
            is_non_leaf = indices < self.capacity
        # Convert to leaf index.
        return indices - self.capacity


class MinTree(SegmentTree):
    """Min tree implementation."""

    def __init__(self, capacity: int):
        """
        Creates a MinTree.

        :param capacity: Tree capacity. Must be a power of 2.
        """
        super().__init__(capacity, operation=np.minimum, initial=np.inf)
