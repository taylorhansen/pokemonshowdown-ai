"""Greedy agent interpretation."""
import numpy as np
import tensorflow as tf

from ...gen.shapes import ACTION_NAMES


def decode_action_rankings(ranked_actions: tf.Tensor) -> list[list[str]]:
    """
    Interprets action rankings into a 2D list of action names.

    :param ranked_actions: Integer tensor of shape `(N,A)` containing action
    rankings.
    :returns: List of translated action names for each sample in the batch.
    """
    return [
        [ACTION_NAMES[index] for index in action]
        for action in np.asarray(memoryview(ranked_actions))
    ]
