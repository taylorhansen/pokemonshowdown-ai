"""Module for calculating Q-values."""
from dataclasses import dataclass
from itertools import chain
from typing import Any, Optional

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
from .noisy_dense import NoisyDense


def rank_q(
    output: tf.Tensor, dist: Optional[int] = None
) -> tuple[tf.Tensor, tf.Tensor]:
    """
    Interprets QValue layer output into action rankings.

    :param output: Layer output of shape `(N,A)` (or `(N,A,D)` where D=dist).
    :param dist: Number of atoms for Q-value distribution.
    :returns: Integer tensor of shape `(N,A)` containing action rankings and the
    unranked Q-values of shape `(N,A)` that were used to generate the rankings.
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
    # Note: Let the battle simulator filter out illegal actions so the code is
    # simpler here.
    ranked_actions = tf.argsort(q_values, axis=-1, direction="DESCENDING")
    return ranked_actions, q_values


def decode_q_values(q_values: tf.Tensor) -> list[dict[str, float]]:
    """
    Decodes the Q-value output from `rank_q(return_q=True)` into a list of
    dictionaries containing the Q-values for each mapped action name.
    """
    return [
        {action: value.item() for action, value in zip(ACTION_NAMES, values)}
        for values in np.asarray(memoryview(q_values))
    ]


@dataclass
class QValueConfig:
    """Config for the Q-value output layer."""

    move_units: tuple[int, ...]
    """Size of hidden layers for processing move actions."""

    switch_units: tuple[int, ...]
    """Size of hidden layers for processing switch actions."""

    state_units: Optional[tuple[int, ...]] = None
    """
    If provided, use a dueling architecture where the sizes of the hidden layers
    used to process the state value is defined here.
    """

    dist: Optional[int] = None
    """Number of atoms for Q-value distribution."""

    use_layer_norm: bool = False
    """Whether to use layer normalization in hidden layers."""

    relu_options: Optional[dict[str, float]] = None
    """Options for the ReLU layers."""

    std_init: Optional[float] = None
    """Enables NoisyNet with the given initial standard deviation."""

    def to_dict(self) -> dict[str, Any]:
        """Converts this object to a JSON dictionary."""
        return {
            "move_units": list(self.move_units),
            "switch_units": list(self.switch_units),
            "state_units": list(self.state_units)
            if self.state_units is not None
            else None,
            "dist": self.dist,
            "use_layer_norm": self.use_layer_norm,
            "relu_options": self.relu_options,
            "std_init": self.std_init,
        }

    @classmethod
    def from_dict(cls, config: dict):
        """Creates a QValueConfig from a JSON dictionary."""
        config["move_units"] = tuple(map(int, config["move_units"]))
        config["switch_units"] = tuple(map(int, config["switch_units"]))
        config["state_units"] = tuple(map(int, config["state_units"]))
        return cls(**config)


@tf.keras.saving.register_keras_serializable()
class QValue(tf.keras.layers.Layer):
    """
    Output layer for DQN.

    Call args:
    - inputs: List of:
      - moves: Tensor of shape `(*N, NUM_MOVES, Dm)` for encoding move actions.
      - bench: Tensor of shape `(*N, NUM_POKEMON - NUM_ACTIVE, Dp)` for encoding
        switch actions.
      - global: Tensor of shape `(*N, Dg)` for encoding all actions.
        Concatenated onto both move and bench vectors.
      - seed: Stacked random seed tensors for NoisyDense layers. Integers of
        shape `(2, self.num_noisy)`. Omit to not use random.
    - return_activations: Whether to also return a dictionary containing all the
      layer activations. Default false.

    Output: A tuple containing:
    - q_values: Q-value output of shape `(*N, A)` if `dist` is None, else
      `(*N, A, D)` where `dist=D`.
    - activations: If `return_activations` is true, contains all the layer
      activations in a dictionary. Otherwise empty.
    """

    def __init__(
        self,
        config: QValueConfig,
        **kwargs,
    ):
        """Creates a QValue layer."""
        super().__init__(**kwargs)
        self.config = config

        self.action_move = value_function(
            units=config.move_units,
            dist=config.dist,
            use_layer_norm=config.use_layer_norm,
            relu_options=config.relu_options,
            std_init=config.std_init,
            name="move",
        )
        self.action_switch = value_function(
            units=config.switch_units,
            dist=config.dist,
            use_layer_norm=config.use_layer_norm,
            relu_options=config.relu_options,
            std_init=config.std_init,
            name="switch",
        )
        if config.state_units is not None:
            self.state_value = value_function(
                units=config.state_units,
                dist=config.dist,
                use_layer_norm=config.use_layer_norm,
                relu_options=config.relu_options,
                std_init=config.std_init,
                name="state",
            )

        self.num_noisy = 0
        for layer in chain(
            self.action_move,
            self.action_switch,
            self.state_value if config.state_units is not None else [],
        ):
            if isinstance(layer, NoisyDense):
                self.num_noisy += 1

    def call(self, inputs, *args, return_activations=False, **kwargs):
        if len(inputs) == 4:
            moves, bench, global_features, seed = inputs
        else:
            moves, bench, global_features = inputs
            seed = None

        activations = {}

        seed_index = 0

        def apply_layer(layer, inputs):
            if not isinstance(layer, NoisyDense) or seed is None:
                output = layer(inputs)
            else:
                nonlocal seed_index
                # pylint: disable-next=used-before-assignment
                output = layer([inputs, seed[:, seed_index]])
                seed_index += 1
            return output

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
            action_move = apply_layer(layer, action_move)
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
            action_switch = apply_layer(layer, action_switch)
            if return_activations:
                activations[f"{self.name}/{layer.name}"] = action_switch

        # (N,9,D) where D=dist or 1
        action_value = tf.concat([action_move, action_switch], axis=-2)

        # pylint: enable=unexpected-keyword-arg, no-value-for-parameter

        if self.config.state_units is not None:
            # Dueling DQN.
            # (N,1,D)
            state_value = global_features
            for layer in self.state_value:
                state_value = apply_layer(layer, state_value)
                if return_activations:
                    activations[f"{self.name}/{layer.name}"] = state_value

            action_value -= tf.reduce_mean(action_value, axis=-2, keepdims=True)
            action_value += state_value

        if self.config.dist is None:
            # (N,9)
            action_value = tf.squeeze(action_value, axis=-1)
            # Reward in range [-1, 1].
            q_values = tf.nn.tanh(action_value)
        else:
            # (N,9,D)
            q_values = tf.nn.softmax(action_value, axis=-1)

        assert (
            seed is None or seed_index == self.num_noisy
        ), f"seed_index mismatch: {seed_index} != {self.num_noisy}"

        return q_values, activations

    def get_config(self):
        return super().get_config() | {"config": self.config.__dict__}

    @classmethod
    def from_config(cls, config):
        config["config"] = QValueConfig.from_dict(config["config"])
        return cls(**config)


def value_function(
    units: tuple[int, ...],
    name: str,
    dist: Optional[int] = None,
    use_layer_norm=False,
    relu_options: Optional[dict[str, float]] = None,
    std_init: Optional[float] = None,
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
    :param std_init: Enables NoisyNet with the given initial standard deviation.
    """
    return create_dense_stack(
        units=units,
        name=name,
        use_layer_norm=use_layer_norm,
        omit_last_ln=True,
        relu_options=relu_options,
        std_init=std_init,
    ) + [
        tf.keras.layers.Dense(
            units=dist or 1,
            kernel_initializer="glorot_normal",
            bias_initializer="zeros",
            name=f"{name}/dense_{len(units)+1}",
        )
        if std_init is None
        else NoisyDense(
            units=dist or 1,
            std_init=std_init,
            name=f"{name}/noisy_dense_{len(units)+1}",
        )
    ]
