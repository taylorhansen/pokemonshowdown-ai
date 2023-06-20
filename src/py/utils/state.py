"""Utilities for handling battle state data."""
from typing import Any

import numpy as np
import tensorflow as tf

from ..gen.shapes import (
    STATE_NAMES,
    STATE_SHAPES,
    STATE_SHAPES_FLAT,
    STATE_SIZE,
)

State = dict[str, np.ndarray]
"""Model input dictionary representing the current game state."""

TensorState = dict[str, tf.Tensor]
"""State as a tensor."""


def decode_state(buffer: Any) -> State:
    """Decodes a buffer into an encoded state array dict without copying."""
    state_flat = _decode_state_flat(buffer)
    state_flat_split = np.split(
        state_flat,
        np.cumsum([STATE_SHAPES_FLAT[name] for name in STATE_NAMES[:-1]]),
    )
    state = {
        name: np.reshape(array, STATE_SHAPES[name])
        for name, array in zip(STATE_NAMES, state_flat_split)
    }
    return state


def decode_tensor_state(buffer: Any) -> TensorState:
    """Decodes a buffer into an encoded state tensor dict."""
    state_flat = tf.convert_to_tensor(
        _decode_state_flat(buffer), dtype=tf.float32
    )
    state_flat_split = tf.split(
        state_flat,
        [STATE_SHAPES_FLAT[name] for name in STATE_NAMES],
    )
    state = {
        name: tf.reshape(tensor, STATE_SHAPES[name])
        for name, tensor in zip(STATE_NAMES, state_flat_split)
    }
    return state


def _decode_state_flat(buffer: Any) -> np.ndarray:
    state_flat = np.frombuffer(buffer, dtype=np.float32)
    assert state_flat.size == STATE_SIZE
    return state_flat
