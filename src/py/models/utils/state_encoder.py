"""Module for encoding the battle state."""
from itertools import chain
from typing import Optional

import tensorflow as tf

from ...gen.shapes import (
    NUM_ACTIVE,
    NUM_POKEMON,
    NUM_TEAMS,
    STATE_NAMES,
    STATE_SHAPES,
    STATE_SHAPES_FLAT,
)
from .model import create_dense_stack, pooling_attention, self_attention_block
from .noisy_dense import NoisyDense


@tf.keras.saving.register_keras_serializable()
class StateEncoder(tf.keras.layers.Layer):
    """
    Layer that processes a battle state vector.

    Call args:
    - inputs: Input tensor, or list of:
      - inputs: Tensor with batch dim that describes the battle state.
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
        input_units: dict[str, tuple[int, ...]],
        active_units: tuple[int, ...],
        bench_units: tuple[int, ...],
        global_units: tuple[int, ...],
        move_attention: Optional[tuple[int, int]] = None,
        move_pooling_type="max",
        move_pooling_attention: Optional[tuple[int, int]] = None,
        bench_attention: Optional[tuple[int, int]] = None,
        bench_pooling_type="max",
        bench_pooling_attention: Optional[tuple[int, int]] = None,
        use_layer_norm=False,
        relu_options: Optional[dict[str, float]] = None,
        std_init: Optional[float] = None,
        **kwargs,
    ):
        """
        Creates a StateEncoder layer.

        :param input_units: Size of hidden layers for encoding individual state
        features.
        :param active_units: Size of hidden layers for encoding active pokemon.
        :param bench_units: Size of hidden layers for encoding non-active
        pokemon.
        :param global_units: Size of hidden layers for encoding the global
        state vector.
        :param move_attention: Tuple of `(num_heads, depth)` for set-based
        attention on the movesets of each pokemon.
        :param move_pooling_type: Pooling method to use for movesets. Can be
        `attention`, `mean`, and `max`.
        :param move_pooling_attention: If `move_pooling="attention"`, tuple of
        `(num_heads, depth)` for pooling via set-based attention on the movesets
        of each pokemon. Otherwise ignored.
        :param bench_attention: Tuple of `(num_heads, depth)` for set-based
        attention on each non-active pokemon.
        :param bench_pooling_type: Pooling method to use for movesets. Can be
        `attention`, `mean`, and `max`.
        :param bench_pooling_attention: If `bench_pooling="attention"`, tuple of
        `(num_heads, depth)` for pooling via set-based attention on each
        non-active pokemon. Otherwise ignored.
        :param use_layer_norm: Whether to use layer normalization.
        :param relu_options: Options for the ReLU layers.
        :param std_init: Enables NoisyNet with the given initial standard
        deviation.
        """
        super().__init__(**kwargs)
        self.input_units = input_units
        self.active_units = active_units
        self.bench_units = bench_units
        self.global_units = global_units
        self.move_attention = move_attention
        self.move_pooling_type = move_pooling_type
        self.move_pooling_attention = move_pooling_attention
        self.bench_attention = bench_attention
        self.bench_pooling_type = bench_pooling_type
        self.bench_pooling_attention = bench_pooling_attention
        self.use_layer_norm = use_layer_norm
        self.relu_options = relu_options
        self.std_init = std_init

        assert set(STATE_NAMES) == set(input_units.keys())
        self.input_fcs = {
            label: create_dense_stack(
                units=units,
                use_layer_norm=use_layer_norm,
                relu_options=relu_options,
                std_init=std_init,
                name=label,
            )
            for label, units in input_units.items()
        }
        self.active_fcs = create_dense_stack(
            units=active_units,
            use_layer_norm=use_layer_norm,
            relu_options=relu_options,
            std_init=std_init,
            name="active",
        )
        self.bench_fcs = create_dense_stack(
            units=bench_units,
            use_layer_norm=use_layer_norm,
            relu_options=relu_options,
            std_init=std_init,
            name="bench",
        )
        if move_attention is not None:
            num_heads, depth = move_attention
            self.moveset_encoder = self_attention_block(
                num_heads=num_heads,
                depth=depth,
                rff_units=num_heads * depth,
                use_layer_norm=use_layer_norm,
                relu_options=relu_options,
                name="pokemon/moves",
            )
        if move_pooling_type == "attention":
            assert move_pooling_attention is not None
            num_heads, depth = move_pooling_attention
            self.move_pooling = pooling_attention(
                num_seeds=1,
                num_heads=num_heads,
                depth=depth,
                rff_units=num_heads * depth,
                rff_s_units=num_heads * depth,
                use_layer_norm=use_layer_norm,
                relu_options=relu_options,
                name="pokemon/moves",
            )
        if bench_attention is not None:
            num_heads, depth = bench_attention
            self.bench_encoder = self_attention_block(
                num_heads=num_heads,
                depth=depth,
                rff_units=num_heads * depth,
                use_layer_norm=use_layer_norm,
                relu_options=relu_options,
                name="bench",
            )
        if bench_pooling_type == "attention":
            assert bench_pooling_attention is not None
            num_heads, depth = bench_pooling_attention
            self.bench_pooling = pooling_attention(
                num_seeds=1,
                num_heads=num_heads,
                depth=depth,
                rff_units=num_heads * depth,
                rff_s_units=num_heads * depth,
                use_layer_norm=use_layer_norm,
                relu_options=relu_options,
                name="bench",
            )
        self.global_fcs = create_dense_stack(
            units=global_units,
            use_layer_norm=use_layer_norm,
            relu_options=relu_options,
            std_init=std_init,
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
        if self.move_attention is not None:
            moveset = self.moveset_encoder(moveset)
            if return_activations:
                activations[
                    f"{self.name}/{self.moveset_encoder.name}"
                ] = moveset

        # (N,2,7,X)
        if self.move_pooling_type == "attention":
            pooled_moveset = self.move_pooling(moveset)
            # Collapse PMA seed dimension.
            pooled_moveset = tf.squeeze(pooled_moveset, axis=-2)
            if return_activations:
                activations[
                    f"{self.name}/{self.move_pooling.name}"
                ] = pooled_moveset
        elif self.move_pooling_type == "mean":
            pooled_moveset = tf.reduce_mean(moveset, axis=-2)
        elif self.move_pooling_type == "max":
            pooled_moveset = tf.reduce_max(moveset, axis=-2)
        else:
            raise ValueError(f"Invalid move_pooling_type '{self.move_pooling}'")

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
        if self.bench_attention is not None:
            bench = self.bench_encoder(
                bench,
            )
            if return_activations:
                activations[f"{self.name}/{self.bench_encoder.name}"] = bench

        # (N,2,X)
        if self.bench_pooling_type == "attention":
            pooled_bench = self.bench_pooling(
                bench,
            )
            # Collapse PMA seed dimension.
            pooled_bench = tf.squeeze(pooled_bench, axis=-2)
            if return_activations:
                activations[
                    f"{self.name}/{self.bench_pooling.name}"
                ] = pooled_bench
        elif self.bench_pooling_type == "mean":
            pooled_bench = tf.reduce_mean(bench, axis=-2)
        elif self.bench_pooling_type == "max":
            pooled_bench = tf.reduce_max(bench, axis=-2)
        else:
            raise ValueError(
                f"Invalid bench_pooling_type '{self.bench_pooling}'"
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
        return super().get_config() | {
            "input_units": self.input_units,
            "active_units": self.active_units,
            "bench_units": self.bench_units,
            "global_units": self.global_units,
            "move_attention": self.move_attention,
            "move_pooling_type": self.move_pooling_type,
            "move_pooling_attention": self.move_pooling_attention,
            "bench_attention": self.bench_attention,
            "bench_pooling_type": self.bench_pooling_type,
            "bench_pooling_attention": self.bench_pooling_attention,
            "use_layer_norm": self.use_layer_norm,
            "relu_options": self.relu_options,
            "std_init": self.std_init,
        }
