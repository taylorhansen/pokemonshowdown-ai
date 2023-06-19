"""Common types."""
from typing import NamedTuple

import numpy as np
import tensorflow as tf

from .state import State, TensorState


class Experience(NamedTuple):
    """Stores information about a state transition for use in learning."""

    state: State
    """State at beginning of transition."""

    action: int
    """Action id."""

    reward: float
    """Reward from state transition."""

    next_state: State
    """State at end of transition."""

    choices: np.ndarray
    """Available choices for the `next_state`. Represented as a float mask."""

    done: bool
    """Whether the `next_state` is a terminal state."""


class TensorExperience(NamedTuple):
    """Experience where fields are replaced with tensors. Can be batched."""

    state: TensorState
    action: tf.Tensor
    reward: tf.Tensor
    next_state: TensorState
    choices: tf.Tensor
    done: tf.Tensor
