"""Module for calculating Q-values."""
from typing import Optional, Union

import numpy as np
import tensorflow as tf

from ...gen.shapes import (
    ACTION_NAMES,
    MAX_REWARD,
    MIN_REWARD,
    NUM_ACTIVE,
    NUM_MOVES,
    NUM_POKEMON,
)
from .model import create_dense_stack


def rank_q(
    output: tf.Tensor, dist: Optional[int] = None, return_q=False
) -> Union[tf.Tensor, tuple[tf.Tensor, tf.Tensor]]:
    """
    Interprets QValue layer output into action rankings.

    :param output: Layer output of shape `(N,A)` (or `(N,A,D)` where D=dist).
    :param dist: Number of atoms for Q-value distribution.
    :param return_q: Whether to also return Q-values.
    :returns: Integer tensor of shape `(N,A)` containing action rankings and,
    if `return_q` is true, the unranked Q-values of shape `(N,A)` that were used
    to generate the rankings.
    """
    if dist is None:
        q_values = output
    else:
        # Get expected Q-value (mean) of each Q distribution output.
        support = tf.linspace(
            tf.constant(
                MIN_REWARD,
                dtype=output.dtype,
                shape=(1,) * (output.shape.rank - 2),
            ),
            tf.constant(
                MAX_REWARD,
                dtype=output.dtype,
                shape=(1,) * (output.shape.rank - 2),
            ),
            dist,
            axis=-1,
        )  # (1..., D)
        q_values = tf.reduce_sum(output * support, -1)
    # Create action id rankings based on the Q-values.
    # Note: Let the battle simulator filter out illegal actions so the code
    # is simpler here.
    ranked_actions = tf.argsort(q_values, axis=-1, direction="DESCENDING")
    if return_q:
        return ranked_actions, q_values
    return ranked_actions


def decode_q_values(q_values: tf.Tensor) -> list[dict[str, float]]:
    """
    Decodes the Q-value output from `rank_q(return_q=True)` into a list of
    dictionaries containing the Q-values for each mapped action name.
    """
    return [
        {action: value.item() for action, value in zip(ACTION_NAMES, values)}
        for values in np.asarray(memoryview(q_values))
    ]


@tf.keras.saving.register_keras_serializable()
class QValue(tf.keras.layers.Layer):
    """
    Output layer for DQN.

    Call args:
    - inputs: List of:
      - moves: Tensor of shape `(N, NUM_MOVES, Dm)` for encoding move actions.
      - bench: Tensor of shape `(N, NUM_POKEMON - NUM_ACTIVE, Dp)` for encoding
        switch actions.
      - global: Tensor of shape `(N, Dg)` for encoding all actions.
        Concattenated onto both move and bench vectors.
    - return_activations: Whether to also return a dictionary containing all the
      layer activations. Default false.

    Output: A tuple containing:
    - q_values: Q-value output of shape `(N, A)` if `dist` is None, else
      `(N, A, D)` where `dist=D`.
    - activations: If `return_activations` is true, contains all the layer
      activations in a dictionary. Otherwise empty.
    """

    def __init__(
        self,
        move_units: tuple[int, ...],
        switch_units: tuple[int, ...],
        state_units: Optional[tuple[int, ...]] = None,
        dist: Optional[int] = None,
        use_layer_norm=False,
        relu_options: Optional[dict[str, float]] = None,
        **kwargs,
    ):
        """
        Creates a QValue layer.

        :param move_units: Size of hidden layers for processing move actions.
        :param switch_units: Size of hidden layers for processing switch
        actions.
        :param state_units: Size of hidden layers for processing state value.
        :param dist: Number of atoms for Q-value distribution.
        :param use_layer_norm: Whether to use layer normalization.
        :param relu_options: Options for the ReLU layers.
        """
        super().__init__(**kwargs)
        self.move_units = move_units
        self.switch_units = switch_units
        self.state_units = state_units
        self.dist = dist
        self.use_layer_norm = use_layer_norm
        self.relu_options = relu_options

        self.action_move = value_function(
            units=move_units,
            dist=dist,
            use_layer_norm=use_layer_norm,
            relu_options=relu_options,
            name="move",
        )
        self.action_switch = value_function(
            units=switch_units,
            dist=dist,
            use_layer_norm=use_layer_norm,
            relu_options=relu_options,
            name="switch",
        )
        if state_units is not None:
            self.state_value = value_function(
                units=state_units,
                dist=dist,
                use_layer_norm=use_layer_norm,
                relu_options=relu_options,
                name="state",
            )

    def call(self, inputs, *args, return_activations=False, **kwargs):
        moves, bench, global_features = inputs

        activations = {}

        # Broadcast: (N,1,X)
        global_features = global_features[..., tf.newaxis, :]

        # Note: tf.concat() seems to be broken for pylint.
        # pylint: disable=unexpected-keyword-arg, no-value-for-parameter

        # (N,4,X)
        action_move = tf.concat(
            [moves, tf.repeat(global_features, repeats=NUM_MOVES, axis=-2)],
            axis=-1,
        )
        for layer in self.action_move:
            action_move = layer(action_move)
            if return_activations:
                activations[f"{self.name}/{layer.name}"] = action_move

        # (N,5,X)
        action_switch = tf.concat(
            [
                bench,
                tf.repeat(
                    global_features, repeats=NUM_POKEMON - NUM_ACTIVE, axis=-2
                ),
            ],
            axis=-1,
        )
        for layer in self.action_switch:
            action_switch = layer(action_switch)
            if return_activations:
                activations[f"{self.name}/{layer.name}"] = action_switch

        # (N,9,D) where D=dist or 1
        action_value = tf.concat([action_move, action_switch], axis=-2)

        # pylint: enable=unexpected-keyword-arg, no-value-for-parameter

        if self.state_units is not None:
            # Dueling DQN.
            # (N,1,D)
            state_value = global_features
            for layer in self.state_value:
                state_value = layer(state_value)
                if return_activations:
                    activations[f"{self.name}/{layer.name}"] = state_value

            action_value -= tf.reduce_mean(action_value, axis=-2, keepdims=True)
            action_value += state_value

        if self.dist is None:
            # (N,9)
            action_value = tf.squeeze(action_value, axis=-1)
            # Reward in range [-1, 1].
            q_values = tf.nn.tanh(action_value)
        else:
            # (N,9,D)
            q_values = tf.nn.softmax(action_value, axis=-1)

        return q_values, activations

    def get_config(self):
        return super().get_config() | {
            "move_units": self.move_units,
            "switch_units": self.switch_units,
            "state_units": self.state_units,
            "dist": self.dist,
            "use_layer_norm": self.use_layer_norm,
            "relu_options": self.relu_options,
        }


def value_function(
    units: tuple[int, ...],
    name: str,
    dist: Optional[int] = None,
    use_layer_norm=False,
    relu_options: Optional[dict[str, float]] = None,
) -> list[tf.keras.layers.Layer]:
    """
    Creates a stack of layers to compute action advantage values or state
    value.

    :param units: Size of each hidden layer.
    :param name: Name scope prefix.
    :param dist: Number of units for distributional Q-network. Default None
    (i.e. disabled).
    :param use_layer_norm: Whether to use layer normalization.
    :param relu_options: Options for the ReLU layers.
    """
    return create_dense_stack(
        units=units,
        name=name,
        use_layer_norm=use_layer_norm,
        omit_last_ln=True,
        relu_options=relu_options,
    ) + [
        tf.keras.layers.Dense(
            units=dist or 1,
            kernel_initializer="glorot_normal",
            bias_initializer="zeros",
            name=f"{name}/dense_{len(units)+1}",
        )
    ]
