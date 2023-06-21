"""Utilities for handling battle state data."""
from typing import Any

import numpy as np
import tensorflow as tf

from ..gen.shapes import STATE_SIZE


def decode_state(buffer: Any) -> np.ndarray:
    """Decodes a buffer into an encoded state array without copying."""
    state_flat = np.frombuffer(buffer, dtype=np.float32)
    assert state_flat.size == STATE_SIZE
    return state_flat


def decode_tensor_state(buffer: Any) -> tf.Tensor:
    """Decodes a buffer into an encoded state tensor."""
    return tf.convert_to_tensor(decode_state(buffer), dtype=tf.float32)
