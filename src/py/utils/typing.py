"""Common types."""
from typing import NamedTuple, Union

import numpy as np
import tensorflow as tf


class Experience(NamedTuple):
    """Stores information about a state transition for use in learning."""

    state: Union[np.ndarray, tf.Tensor]
    """State at beginning of transition."""

    action: int
    """Id of action taken at state."""

    reward: float
    """Reward from action, or pre-computed n-step returns."""

    next_state: Union[np.ndarray, tf.Tensor]
    """
    State at end of transition. Zero if `done`. Could be multiple steps ahead if
    using n-step returns.
    """

    choices: np.ndarray
    """
    Available choices for the `next_state`. Represented as a float mask over the
    action space. Zero if `done`.
    """

    done: bool
    """
    Whether the `next_state` is a terminal state and should be ignored during
    learning.
    """


class TensorExperience(NamedTuple):
    """Experience where fields are replaced with tensors. Can be batched."""

    state: tf.Tensor
    action: tf.Tensor
    reward: tf.Tensor
    next_state: tf.Tensor
    choices: tf.Tensor
    done: tf.Tensor


class Trajectory(NamedTuple):
    """
    Unrolled sequence of experience for use in learning. Might not be a complete
    episode.
    """

    hidden: list[tf.Tensor]
    """
    Initial hidden states for the recurrent component at the beginning of this
    trajectory. Zeroed at the start of an episode.
    """

    mask: tf.Tensor
    """
    Right-filled boolean mask used to exclude terminal or empty timesteps.
    Equivalent to the `Experience.done` boolean. May contain extra entries
    beyond the actual unroll length for n-step returns.
    """

    states: Union[np.ndarray, tf.Tensor]
    """
    States at each timestep, excluding terminal. First entry is initial state.
    Empty (i.e. masked) entries are 0. May contain extra entries beyond the
    actual unroll length for n-step returns and burn-in.
    """

    choices: tf.Tensor
    """
    Available choices for each state, excluding terminal. Represented as a float
    mask over the action space. Empty (i.e. masked) entries are 0. May contain
    extra entries beyond the actual unroll length for n-step returns.
    """

    actions: tf.Tensor
    """
    List of action ids for each state transition, including terminal. First
    entry is the id of the first completed action from the initial state. Empty
    (i.e. masked) entries are -1.
    """

    rewards: tf.Tensor
    """
    Rewards corresponding to actions, including terminal. First entry is the
    reward after completing the first action from the initial state. Empty (i.e.
    masked) entries are 0.
    """
