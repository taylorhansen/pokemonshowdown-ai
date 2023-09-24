"""Module for encoding the battle state."""
from dataclasses import dataclass
from itertools import chain
from typing import Any, Optional

import tensorflow as tf

from ...gen.shapes import (
    NUM_ACTIVE,
    NUM_POKEMON,
    NUM_TEAMS,
    STATE_NAMES,
    STATE_SHAPES,
    STATE_SHAPES_FLAT,
    STATE_SIZE,
)
from .model import create_dense_stack, pooling_attention, self_attention_block
from .noisy_dense import NoisyDense


@dataclass
class StateEncoderConfig:
    """Config for the state encoder layer."""

    input_units: dict[str, tuple[int, ...]]
    """Size of hidden layers for encoding individual state features."""

    active_units: tuple[int, ...]
    """Size of hidden layers for encoding active pokemon."""

    bench_units: tuple[int, ...]
    """Size of hidden layers for encoding non-active pokemon."""

    global_units: tuple[int, ...]
    """Size of hidden layers for encoding the global state vector."""

    # TODO: Make into another json dataclass.
    move_attention: Optional[tuple[int, int]] = None
    """
    Tuple of `(num_heads, depth)` for set-based attention on the movesets of
    each pokemon. Omit to not include an attention layer.
    """

    move_pooling_type: str = "max"
    """
    Pooling method to use for movesets. Can be `attention`, `mean`, or `max`.
    """

    move_pooling_attention: Optional[tuple[int, int]] = None
    """
    If `move_pooling_type="attention"`, tuple of `(num_heads, depth)` for
    pooling via set-based attention on the movesets of each pokemon. Otherwise
    ignored.
    """

    bench_attention: Optional[tuple[int, int]] = None
    """
    Tuple of `(num_heads, depth)` for set-based attention on each non-active
    pokemon. Omit to not include an attention layer.
    """

    bench_pooling_type: str = "max"
    """
    Pooling method to use for movesets. Can be `attention`, `mean`, or `max`.
    """

    bench_pooling_attention: Optional[tuple[int, int]] = None
    """
    If `bench_pooling_type="attention"`, tuple of `(num_heads, depth)` for
    pooling via set-based attention on each non-active pokemon. Otherwise
    ignored.
    """

    use_layer_norm: bool = False
    """Whether to use layer normalization."""

    relu_options: Optional[dict[str, float]] = None
    """Options for the ReLU layers."""

    std_init: Optional[float] = None
    """Enables NoisyNet with the given initial standard deviation."""

    def to_dict(self) -> dict[str, Any]:
        """Converts this object to a JSON dictionary."""
        return {
            "input_units": {
                label: list(units) for label, units in self.input_units.items()
            },
            "active_units": list(self.active_units),
            "bench_units": list(self.bench_units),
            "global_units": list(self.global_units),
            "move_attention": list(self.move_attention)
            if self.move_attention is not None
            else None,
            "move_pooling_type": self.move_pooling_type,
            "move_pooling_attention": list(self.move_pooling_attention)
            if self.move_pooling_attention is not None
            else None,
            "bench_pooling_type": self.bench_pooling_type,
            "bench_pooling_attention": list(self.bench_pooling_attention)
            if self.bench_pooling_attention is not None
            else None,
            "use_layer_norm": self.use_layer_norm,
            "relu_options": self.relu_options,
            "std_init": self.std_init,
        }

    @classmethod
    def from_dict(cls, config: dict):
        """Creates a StateEncoderConfig from a JSON dictionary."""
        config["input_units"] = {
            label: tuple(map(int, config["input_units"][label]))
            for label in STATE_NAMES
        }
        config["active_units"] = tuple(map(int, config["active_units"]))
        config["bench_units"] = tuple(map(int, config["bench_units"]))
        config["global_units"] = tuple(map(int, config["global_units"]))
        return cls(**config)


@tf.keras.saving.register_keras_serializable()
class StateEncoder(tf.keras.layers.Layer):
    """
    Layer that processes a battle state vector.

    Call args:
    - inputs: Input tensor, or list of:
      - inputs: Batched tensor of shape `(*N, STATE_SIZE)` describing the battle
        state(s).
      - seed: Stacked random seed tensors for NoisyDense layers. Integers of
        shape `(2, self.num_noisy)`. Omit to not use random.
    - return_activations: Whether to also return a dictionary containing all the
      layer activations. Default false.

    Output: A tuple containing:
    - global: Tensor of shape `(N, Dg)` describing the entire battle state.
    - moves: Tensor of shape `(N, NUM_ACTIVE, NUM_MOVES, Dm)` describing the
      moveset of the client's active pokemon. Used for processing move actions.
    - bench: Tensor of shape `(N, NUM_POKEMON - NUM_ACTIVE, Dp)` describing the
      client's non-active pokemon. Used for processing switch actions.
    - activations: If `return_activations` is true, contains all the layer
      activations in a dictionary. Otherwise empty.
    """

    def __init__(
        self,
        config: StateEncoderConfig,
        **kwargs,
    ):
        """Creates a StateEncoder layer."""
        super().__init__(**kwargs)
        self.config = config

        assert set(STATE_NAMES) == set(config.input_units.keys())
        self.input_fcs = {
            label: create_dense_stack(
                units=units,
                use_layer_norm=config.use_layer_norm,
                relu_options=config.relu_options,
                std_init=config.std_init,
                name=label,
            )
            for label, units in config.input_units.items()
        }
        self.active_fcs = create_dense_stack(
            units=config.active_units,
            use_layer_norm=config.use_layer_norm,
            relu_options=config.relu_options,
            std_init=config.std_init,
            name="active",
        )
        self.bench_fcs = create_dense_stack(
            units=config.bench_units,
            use_layer_norm=config.use_layer_norm,
            relu_options=config.relu_options,
            std_init=config.std_init,
            name="bench",
        )
        if config.move_attention is not None:
            num_heads, depth = config.move_attention
            self.moveset_encoder = self_attention_block(
                num_heads=num_heads,
                depth=depth,
                rff_units=num_heads * depth,
                use_layer_norm=config.use_layer_norm,
                relu_options=config.relu_options,
                name="pokemon/moves",
            )
        if config.move_pooling_type == "attention":
            assert config.move_pooling_attention is not None
            num_heads, depth = config.move_pooling_attention
            self.move_pooling = pooling_attention(
                num_seeds=1,
                num_heads=num_heads,
                depth=depth,
                rff_units=num_heads * depth,
                rff_s_units=num_heads * depth,
                use_layer_norm=config.use_layer_norm,
                relu_options=config.relu_options,
                name="pokemon/moves",
            )
        if config.bench_attention is not None:
            num_heads, depth = config.bench_attention
            self.bench_encoder = self_attention_block(
                num_heads=num_heads,
                depth=depth,
                rff_units=num_heads * depth,
                use_layer_norm=config.use_layer_norm,
                relu_options=config.relu_options,
                name="bench",
            )
        if config.bench_pooling_type == "attention":
            assert config.bench_pooling_attention is not None
            num_heads, depth = config.bench_pooling_attention
            self.bench_pooling = pooling_attention(
                num_seeds=1,
                num_heads=num_heads,
                depth=depth,
                rff_units=num_heads * depth,
                rff_s_units=num_heads * depth,
                use_layer_norm=config.use_layer_norm,
                relu_options=config.relu_options,
                name="bench",
            )
        self.global_fcs = create_dense_stack(
            units=config.global_units,
            use_layer_norm=config.use_layer_norm,
            relu_options=config.relu_options,
            std_init=config.std_init,
            name="global",
        )

        self.num_noisy = 0
        for layer in chain(
            *self.input_fcs.values(),
            self.active_fcs,
            self.bench_fcs,
            self.global_fcs,
        ):
            if isinstance(layer, NoisyDense):
                self.num_noisy += 1

    # pylint: disable-next=too-many-branches
    def call(self, inputs, *args, return_activations=False, **kwargs):
        if isinstance(inputs, (list, tuple)):
            inputs, seed = inputs
        else:
            seed = None

        batch_shape = tf.shape(inputs)[:-1]  # = [N] or [N, L]

        inputs = tf.ensure_shape(inputs, [*inputs.shape[:-1], STATE_SIZE])
        features = dict(
            zip(
                STATE_NAMES,
                tf.split(
                    inputs,
                    [STATE_SHAPES_FLAT[label] for label in STATE_NAMES],
                    axis=-1,
                ),
            )
        )

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

        # Note: tf.concat() seems to be broken for pylint.
        # pylint: disable=unexpected-keyword-arg, no-value-for-parameter

        # Initial input features.
        for label in STATE_NAMES:
            features[label] = tf.reshape(
                features[label],
                shape=tf.concat([batch_shape, STATE_SHAPES[label]], axis=0),
            )
            for layer in self.input_fcs.get(label, []):
                features[label] = apply_layer(layer, features[label])
                if return_activations:
                    activations[f"{self.name}/{layer.name}"] = features[label]

        # (N,2,7,4,X)
        moveset = features["moves"]
        if self.config.move_attention is not None:
            moveset = self.moveset_encoder(moveset)
            if return_activations:
                activations[
                    f"{self.name}/{self.moveset_encoder.name}"
                ] = moveset

        # (N,2,7,X)
        if self.config.move_pooling_type == "attention":
            pooled_moveset = self.move_pooling(moveset)
            # Collapse PMA seed dimension.
            pooled_moveset = tf.squeeze(pooled_moveset, axis=-2)
            if return_activations:
                activations[
                    f"{self.name}/{self.move_pooling.name}"
                ] = pooled_moveset
        elif self.config.move_pooling_type == "mean":
            pooled_moveset = tf.reduce_mean(moveset, axis=-2)
        elif self.config.move_pooling_type == "max":
            pooled_moveset = tf.reduce_max(moveset, axis=-2)
        else:
            raise ValueError(
                f"Invalid move_pooling_type '{self.config.move_pooling_type}'"
            )

        # Concat pre-batched item + last_item tensors.
        # (N,2,6,2,X) -> (N,2,6,2*X)
        item = features["item"]
        item_flat = tf.reshape(
            item,
            shape=tf.concat(
                [
                    batch_shape,
                    [NUM_TEAMS, NUM_POKEMON, 2 * item.shape[-1]],
                ],
                axis=-1,
            ),
        )

        # (N,2,7,X)
        pokemon_with_override = tf.concat(
            [
                features["species"],
                features["types"],
                features["stats"],
                features["ability"],
                pooled_moveset,
            ],
            axis=-1,
        )

        # (N,2,6,X)
        pokemon = tf.concat([features["basic"], item_flat], axis=-1)

        # (N,2,7,X) -> (N,2,2,X), (N,2,5,X)
        active1, bench1 = tf.split(
            pokemon_with_override,
            [NUM_ACTIVE * 2, NUM_POKEMON - NUM_ACTIVE],
            axis=-2,
        )
        # (N,2,2,X) -> (N,2,1,2*X)
        active1 = tf.reshape(
            active1,
            shape=tf.concat(
                [batch_shape, [NUM_TEAMS, NUM_ACTIVE, 2 * active1.shape[-1]]],
                axis=-1,
            ),
        )

        # (N,2,6,X) -> (N,2,1,X), (N,2,5,X)
        active2, bench2 = tf.split(
            pokemon,
            [NUM_ACTIVE, NUM_POKEMON - NUM_ACTIVE],
            axis=-2,
        )

        # (N,2,1,X)
        active = tf.concat([features["volatile"], active1, active2], axis=-1)
        for layer in self.active_fcs:
            active = apply_layer(layer, active)

        # (N,2,5,X)
        bench = tf.concat([bench1, bench2], axis=-1)
        for layer in self.bench_fcs:
            bench = apply_layer(layer, bench)
            if return_activations:
                activations[f"{self.name}/{layer.name}"] = bench
        if self.config.bench_attention is not None:
            bench = self.bench_encoder(
                bench,
            )
            if return_activations:
                activations[f"{self.name}/{self.bench_encoder.name}"] = bench

        # (N,2,X)
        if self.config.bench_pooling_type == "attention":
            pooled_bench = self.bench_pooling(
                bench,
            )
            # Collapse PMA seed dimension.
            pooled_bench = tf.squeeze(pooled_bench, axis=-2)
            if return_activations:
                activations[
                    f"{self.name}/{self.bench_pooling.name}"
                ] = pooled_bench
        elif self.config.bench_pooling_type == "mean":
            pooled_bench = tf.reduce_mean(bench, axis=-2)
        elif self.config.bench_pooling_type == "max":
            pooled_bench = tf.reduce_max(bench, axis=-2)
        else:
            raise ValueError(
                f"Invalid bench_pooling_type '{self.config.bench_pooling_type}'"
            )

        # (N,X)
        global_features_list = [features["room_status"]]
        for tensor in (features["team_status"], active, pooled_bench):
            tensor = tf.reshape(
                tensor,
                shape=tf.concat(
                    [
                        batch_shape,
                        [tf.reduce_prod(tensor.shape[batch_shape.shape[0] :])],
                    ],
                    axis=-1,
                ),
            )
            global_features_list.append(tensor)
        global_features = tf.concat(global_features_list, axis=-1)
        for layer in self.global_fcs:
            global_features = apply_layer(layer, global_features)
            if return_activations:
                activations[f"{self.name}/{layer.name}"] = global_features

        # pylint: enable=unexpected-keyword-arg, no-value-for-parameter

        # (N,2,7,4,X) -> (N,1,4,X)
        our_active_moves = moveset[..., 0, :NUM_ACTIVE, :, :]

        # (N,2,5,X) -> (N,5,X)
        our_bench = bench[..., 0, :, :]

        assert (
            seed is None or seed_index == self.num_noisy
        ), f"seed_index mismatch: {seed_index} != {self.num_noisy}"

        return global_features, our_active_moves, our_bench, activations

    def get_config(self):
        return super().get_config() | {"config": self.config.__dict__}

    @classmethod
    def from_config(cls, config):
        config["config"] = StateEncoderConfig.from_dict(config["config"])
        return cls(**config)
