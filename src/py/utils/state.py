"""Utilities for handling battle state data."""
from typing import Any

import numpy as np

from ..gen.shapes import STATE_SIZE


def decode_state(buffer: Any) -> np.ndarray:
    """Decodes a buffer into an encoded state array without copying."""
    state_flat = np.frombuffer(buffer, dtype=np.float32)
    assert state_flat.size == STATE_SIZE
    return state_flat
