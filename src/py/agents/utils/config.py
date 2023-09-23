"""Common config typings for agent utils."""
from dataclasses import dataclass


@dataclass
class AnnealConfig:
    """Config for annealing a hyperparameter during training."""

    start: float
    """Starting value."""

    end: float
    """End value."""

    steps: int
    """Number of steps to linearly anneal from `start` to `end`."""
