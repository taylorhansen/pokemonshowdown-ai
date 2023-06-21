"""Common types."""
from typing import NamedTuple

import numpy as np
import tensorflow as tf


class Experience(NamedTuple):
    """Stores information about a state transition for use in learning."""

    state: tf.Tensor
    """State at beginning of transition."""

    action: int
    """Action id."""

    reward: float
    """Reward from state transition."""

    next_state: tf.Tensor
    """State at end of transition."""

    choices: np.ndarray
    """Available choices for the `next_state`. Represented as a float mask."""

    done: bool
    """Whether the `next_state` is a terminal state."""


class TensorExperience(NamedTuple):
    """Experience where fields are replaced with tensors. Can be batched."""

    state: tf.Tensor
    action: tf.Tensor
    reward: tf.Tensor
    next_state: tf.Tensor
    choices: tf.Tensor
    done: tf.Tensor
