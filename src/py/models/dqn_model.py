"""DQN implementation."""
from typing import Optional

import numpy as np
import tensorflow as tf

from ..config import DQNModelConfig
from ..gen.shapes import (
    ACTION_NAMES,
    MAX_REWARD,
    MIN_REWARD,
    NUM_ACTIVE,
    NUM_MOVES,
    NUM_POKEMON,
    NUM_TEAMS,
    STATE_NAMES,
    STATE_SHAPES,
    STATE_SHAPES_FLAT,
    STATE_SIZE,
)
from .utils.model import (
    create_dense_stack,
    pooling_attention,
    self_attention_block,
    state_input_spec,
    state_tensor_spec,
    value_function,
)


class DQNModel(tf.keras.Model):
    """
    DQN model implementation for Pokemon AI.

    Call args:
    - inputs: List of tensors describing the battle state, including batch dim.
    - return_activations: Whether to also return a dictionary containing all the
      layer activations.

    Output: Tensor of shape `[batch, num_actions]` containing Q-values, or
    `[batch, num_actions, dist]` describing Q-value distributions if `dist`
    parameter is provided upon construction. The output is a tuple if
    `return_activations` is true, with the first element being the model output
    and the second being the dictionary of layer activations.

    For inference, recommended to use the `greedy()` method instead of calling
    directly.
    """

    def __init__(
        self,
        config: Optional[DQNModelConfig] = None,
        name: Optional[str] = None,
    ):
        """
        Creates a DQNModel.

        :param config: Config for constructing the model.
        :param name: Name of the model.
        """
        super().__init__(name=name)
        if config is None:
            config = DQNModelConfig()
        self.config = config

        self.input_fcs = {
            label: create_dense_stack(
                units=units,
                use_layer_norm=config.use_layer_norm,
                name=f"{self.name}/{label}",
            )
            for label, units in {
                "room_status": (64,),
                "team_status": (64,),
                "volatile": (128,),
                "basic": (64,),
                "species": (128,),
                "types": (128,),
                "stats": (128,),
                "ability": (128,),
                "item": (128,),
                "moves": (128,),
            }.items()
        }
        assert set(STATE_NAMES) == (set(self.input_fcs.keys()) | {"alive"})
        if config.attention:
            self.moveset_encoder = self_attention_block(
                num_heads=4,
                depth=32,
                rff_units=128,
                use_layer_norm=config.use_layer_norm,
                name=f"{self.name}/pokemon/moves",
            )
        if config.pooling == "attention":
            self.moveset_pooling = pooling_attention(
                num_seeds=1,
                num_heads=4,
                depth=32,
                rff_units=128,
                rff_s_units=128,
                use_layer_norm=config.use_layer_norm,
                name=f"{self.name}/pokemon/moves",
            )
        self.active_fcs = create_dense_stack(
            units=(256,),
            use_layer_norm=config.use_layer_norm,
            name=f"{self.name}/active",
        )
        self.bench_fcs = create_dense_stack(
            units=(256,),
            use_layer_norm=config.use_layer_norm,
            name=f"{self.name}/bench",
        )
        if config.attention:
            self.bench_encoder = self_attention_block(
                num_heads=8,
                depth=32,
                rff_units=256,
                use_layer_norm=config.use_layer_norm,
                name=f"{self.name}/bench",
            )
        if config.pooling == "attention":
            self.bench_pooling = pooling_attention(
                num_seeds=1,
                num_heads=8,
                depth=32,
                rff_units=256,
                rff_s_units=256,
                use_layer_norm=config.use_layer_norm,
                name=f"{self.name}/bench",
            )
        self.global_fcs = create_dense_stack(
            units=(256,),
            use_layer_norm=config.use_layer_norm,
            name=f"{self.name}/global",
        )
        self.action_move = value_function(
            units=(256,),
            dist=config.dist,
            use_layer_norm=config.use_layer_norm,
            name=f"{self.name}/action/move",
        )
        self.action_switch = value_function(
            units=(256,),
            dist=config.dist,
            use_layer_norm=config.use_layer_norm,
            name=f"{self.name}/action/switch",
        )
        if config.dueling:
            self.state_value = value_function(
                units=(256,),
                dist=config.dist,
                use_layer_norm=config.use_layer_norm,
                name=f"{self.name}/state",
            )

    def init(self):
        """Initializes model weights."""
        self.input_spec = state_input_spec()
        self.build((None, STATE_SIZE))

    # pylint: disable-next=too-many-branches
    def call(
        self,
        inputs,
        training=False,
        mask=None,
        return_activations=False,
    ):
        batch_shape = tf.shape(inputs)[:-1]

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

        if return_activations:
            activations = {}

        # Initial input features.
        for label in STATE_NAMES:
            features[label] = tf.reshape(
                features[label], (-1, *STATE_SHAPES[label])
            )
            for layer in self.input_fcs.get(label, []):
                features[label] = layer(features[label], training=training)
                if return_activations:
                    activations[layer.name] = features[label]

        # (B,2,7,4,X)
        moveset = features["moves"]
        if self.config.attention:
            moveset = self.moveset_encoder(moveset)
            if return_activations:
                activations[self.moveset_encoder.name] = moveset

        # (B,2,7,X)
        if self.config.pooling == "attention":
            pooled_moveset = self.moveset_pooling(moveset, training=training)
            # Collapse PMA seed dimension.
            pooled_moveset = tf.squeeze(pooled_moveset, axis=-2)
            if return_activations:
                activations[self.moveset_pooling.name] = pooled_moveset
        elif self.config.pooling == "mean":
            pooled_moveset = tf.reduce_mean(moveset, axis=-2)
        elif self.config.pooling == "max":
            pooled_moveset = tf.reduce_max(moveset, axis=-2)
        else:
            raise ValueError(
                f"Invalid config.pooling type '{self.config.pooling}'"
            )

        # Note: tf.concat() seems to be broken for pylint.
        # pylint: disable=unexpected-keyword-arg, no-value-for-parameter

        # Concat pre-batched item + last_item tensors.
        # (B,2,6,2,X) -> (B,2,6,2*X)
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

        # (B,2,7,X)
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

        # (B,2,6,X)
        pokemon = tf.concat([features["basic"], item_flat], axis=-1)

        # (B,2,7,X) -> (B,2,2,X), (B,2,5,X)
        active1, bench1 = tf.split(
            pokemon_with_override,
            [NUM_ACTIVE * 2, NUM_POKEMON - NUM_ACTIVE],
            axis=-2,
        )
        # (B,2,2,X) -> (B,2,1,2*X)
        active1 = tf.reshape(
            active1,
            shape=tf.concat(
                [batch_shape, [NUM_TEAMS, NUM_ACTIVE, 2 * active1.shape[-1]]],
                axis=-1,
            ),
        )

        # (B,2,6,X) -> (B,2,1,X), (B,2,5,X)
        active2, bench2 = tf.split(
            pokemon,
            [NUM_ACTIVE, NUM_POKEMON - NUM_ACTIVE],
            axis=-2,
        )

        # Broadcast mask.
        # (B,2,6) -> (B,2,6,1)
        features["alive"] = tf.expand_dims(features["alive"], axis=-1)
        # (B,2,6,1) -> (B,2,1,1), (B,2,5,1)
        alive_active, alive_bench = tf.split(
            features["alive"], [NUM_ACTIVE, NUM_POKEMON - NUM_ACTIVE], axis=-2
        )

        # (B,2,1,X)
        active = tf.concat([features["volatile"], active1, active2], axis=-1)
        active *= alive_active
        for layer in self.active_fcs:
            active = layer(active, training=training)

        # (B,2,5,X)
        bench = tf.concat([bench1, bench2], axis=-1)
        bench *= alive_bench
        for layer in self.bench_fcs:
            bench = layer(bench, training=training)
            if return_activations:
                activations[layer.name] = bench

        if self.config.attention:
            bench = self.bench_encoder(
                bench,
                training=training,
                mask=tf.squeeze(alive_bench, axis=-1),
            )
            if return_activations:
                activations[self.bench_encoder.name] = bench

        # (B,2,X)
        if self.config.pooling == "attention":
            pooled_bench = self.bench_pooling(
                bench, training=training, mask=tf.squeeze(alive_bench, axis=-1)
            )
            # Collapse PMA seed dimension.
            pooled_bench = tf.squeeze(pooled_bench, axis=-2)
            if return_activations:
                activations[self.bench_pooling.name] = pooled_bench
        elif self.config.pooling == "mean":
            pooled_bench = tf.reduce_mean(bench, axis=-2)
        elif self.config.pooling == "max":
            pooled_bench = tf.reduce_max(bench, axis=-2)
        else:
            raise ValueError(
                f"Invalid config.pooling type '{self.config.pooling}'"
            )

        # (B,X)
        global_features_list = [features["room_status"]] + [
            tf.reshape(
                tensor,
                shape=tf.concat(
                    [
                        batch_shape,
                        tf.expand_dims(
                            tf.reduce_prod(tensor.shape[1:]), axis=0
                        ),
                    ],
                    axis=-1,
                ),
            )
            for tensor in [features["team_status"], active, pooled_bench]
        ]
        global_features = tf.concat(global_features_list, axis=-1)
        for layer in self.global_fcs:
            global_features = layer(global_features, training=training)
            if return_activations:
                activations[layer.name] = global_features

        # Broadcast: (B,1,X)
        global_features = tf.expand_dims(global_features, axis=-2)

        # (B,2,6,4,X) -> (B,4,X)
        our_active_moves = moveset[:, 0, 0, :, :]
        action_move = tf.concat(
            [
                our_active_moves,
                tf.repeat(global_features, repeats=NUM_MOVES, axis=-2),
            ],
            axis=-1,
        )
        for layer in self.action_move:
            action_move = layer(action_move, training=training)
            if return_activations:
                activations[layer.name] = action_move

        # (B,2,5,X) -> (B,5,X)
        our_bench = bench[:, 0, :, :]
        action_switch = tf.concat(
            [
                our_bench,
                tf.repeat(
                    global_features, repeats=NUM_POKEMON - NUM_ACTIVE, axis=-2
                ),
            ],
            axis=-1,
        )
        for layer in self.action_switch:
            action_switch = layer(action_switch, training=training)
            if return_activations:
                activations[layer.name] = action_switch

        # (B,9,D) where D=dist or 1
        action_value = tf.concat([action_move, action_switch], axis=-2)

        # pylint: enable=unexpected-keyword-arg, no-value-for-parameter

        if self.config.dueling:
            # (B,1,D)
            state_value = global_features
            for layer in self.state_value:
                state_value = layer(state_value, training=training)
                if return_activations:
                    activations[layer.name] = state_value

            action_value -= tf.reduce_mean(action_value, axis=-2, keepdims=True)
            action_value += state_value

        if self.config.dist is None:
            # (B,9)
            action_value = tf.squeeze(action_value, axis=-1)
            # Reward in range [-1, 1].
            output = tf.nn.tanh(action_value)
        else:
            # (B,9,D)
            output = tf.nn.softmax(action_value, axis=-1)

        if return_activations:
            return output, activations
        return output

    def get_config(self):
        return super().get_config() | {"config": self.config.__dict__}

    @classmethod
    def from_config(cls, config, custom_objects=None):
        config["config"] = DQNModelConfig(**config["config"])
        return cls(**config)

    @tf.function(input_signature=[state_tensor_spec()], jit_compile=True)
    def greedy(self, state):
        """
        Creates action id rankings based on predicted Q-values.

        :param state: Encoded battle state input.
        :returns: A tensor containing all possible action ids sorted by
        predicted Q-value for each sample in the batch of input states. If
        `return_output` is true, then a tuple is returned with the first element
        being the sorted action ids and the second being the actual list of
        estimated Q-values indexed by action id (i.e. unsorted).
        """
        return self._greedy(state)

    @tf.function(input_signature=[state_tensor_spec()], jit_compile=True)
    def greedy_with_q(self, state):
        """
        Creates action id rankings based on predicted Q-values, while also
        providing the Q-values that informed those rankings.

        :param state: Encoded battle state input.
        :returns: A tuple with the first element being a tensor containing all
        possible action ids sorted by predicted Q-value for each sample in the
        batch of input states, and the second element being the actual list of
        predicted Q-values indexed by action id (i.e. unsorted).
        """
        return self._greedy(state, return_output=True)

    def _greedy(self, state: tf.Tensor, return_output=False):
        # Get Q-values for all possible actions.
        q_values = self(state)
        if self.config.dist is not None:
            # Get expected Q-value (mean) of each Q distribution output.
            support = tf.expand_dims(
                tf.linspace(
                    float(MIN_REWARD), float(MAX_REWARD), self.config.dist
                ),
                axis=0,
            )
            q_values = tf.reduce_mean(q_values * support, -1)
        # Create action id rankings based on the Q-values.
        # Note: Let the battle simulator filter out illegal actions so the code
        # is simpler here.
        ranked_actions = tf.argsort(q_values, axis=-1, direction="DESCENDING")

        if return_output:
            return ranked_actions, q_values
        return ranked_actions

    @staticmethod
    def decode_ranked_actions(ranked_actions: tf.Tensor) -> list[list[str]]:
        """
        Decodes the tensor returned by `greedy()` into a 2D list of action
        strings.
        """
        return [
            [ACTION_NAMES[index] for index in action]
            for action in np.asarray(memoryview(ranked_actions))
        ]

    @staticmethod
    def decode_q_values(q_values: tf.Tensor) -> list[dict[str, float]]:
        """
        Decodes the Q-value tensor returned by `greedy(return_output=True)` into
        a list of dictionaries containing the Q-values for each mapped action
        name.
        """
        return [
            {
                action: value.item()
                for action, value in zip(ACTION_NAMES, values)
            }
            for values in np.asarray(memoryview(q_values))
        ]
