"""DQN implementation."""
from typing import Optional

import tensorflow as tf

from ..config import DQNModelConfig
from ..gen.shapes import STATE_SIZE
from .utils.q_value import QValue, rank_q
from .utils.state_encoder import StateEncoder


class DQNModel(tf.keras.Model):
    """
    DQN model implementation for Pokemon AI.

    Call args:
    - inputs: Tensor of shape `(N, Ds)` describing the battle state where
      N=batch and Ds=`STATE_SIZE`.
    - return_activations: Whether to also return a dictionary containing all the
      layer activations.

    Output: Tensor of shape `(N, A)` containing Q-values, or `(N, A, D)`
    describing Q-value distributions if the `dist` parameter is provided upon
    construction. The output is a tuple if `return_activations` is true, with
    the first element being the model output and the second being the dictionary
    of layer activations.

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

        self.state_encoder = StateEncoder(
            input_units={
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
            },
            active_units=(256,),
            bench_units=(256,),
            global_units=(256,),
            move_attention=(4, 32) if config.attention else None,
            move_pooling_type=config.pooling,
            move_pooling_attention=(4, 32)
            if config.pooling == "attention"
            else None,
            bench_attention=(8, 32) if config.attention else None,
            bench_pooling_type=config.pooling,
            bench_pooling_attention=(8, 32)
            if config.pooling == "attention"
            else None,
            use_layer_norm=config.use_layer_norm,
            relu_options=config.relu_options,
            name=f"{self.name}/state",
        )
        self.q_value = QValue(
            move_units=(256,),
            switch_units=(256,),
            state_units=(256,),
            dist=config.dist,
            use_layer_norm=config.use_layer_norm,
            relu_options=config.relu_options,
            name=f"{self.name}/q_value",
        )

    def init(self):
        """Initializes model weights."""
        self.build((None, STATE_SIZE))

    def call(self, inputs, training=False, mask=None, return_activations=False):
        (
            global_features,
            our_active_moves,
            our_bench,
            activations,
        ) = self.state_encoder(inputs, return_activations=return_activations)

        # (N,1,4,X) -> (N,4,X)
        our_active_moves = tf.squeeze(our_active_moves, axis=-3)

        q_values, q_activations = self.q_value(
            [our_active_moves, our_bench, global_features],
            return_activations=return_activations,
        )
        activations |= q_activations

        if return_activations:
            return q_values, activations
        return q_values

    def get_config(self):
        return super().get_config() | {"config": self.config.__dict__}

    @classmethod
    def from_config(cls, config, custom_objects=None):
        config["config"] = DQNModelConfig(**config["config"])
        return cls(**config)

    @tf.function(
        input_signature=[
            tf.TensorSpec(
                shape=(None, STATE_SIZE), dtype=tf.float32, name="state"
            )
        ],
        jit_compile=True,
    )
    def greedy(self, state):
        """
        Creates action id rankings based on predicted Q-values.

        :param state: Tensor of shape `(N, Ds)` encoding battle states.
        :returns: An integer tensor of shape `(N, A)` tensor containing all
        possible action ids sorted by predicted Q-value for each sample in the
        batch of input states.
        """
        output = self(state)
        ranked_actions = rank_q(output, dist=self.config.dist)
        return ranked_actions

    @tf.function(
        input_signature=[
            tf.TensorSpec(
                shape=(None, STATE_SIZE), dtype=tf.float32, name="state"
            )
        ],
        jit_compile=True,
    )
    def greedy_with_q(self, state):
        """
        Creates action id rankings based on predicted Q-values, while also
        providing the Q-values that informed those rankings.

        :param state: Tensor of shape `(N, Ds)` encoding battle states.
        :returns: A tuple containing:
        - ranked_actions: Integer tensor of shape `(N, A)` containing all
          possible action ids sorted by predicted Q-value for each sample in the
          batch of input states.
        - q_values: Tensor of shape `(N, A)` containing the predicted Q-values
          indexed by action id (i.e. unsorted).
        """
        output = self(state)
        ranked_actions, q_values = rank_q(
            output, dist=self.config.dist, return_q=True
        )
        return ranked_actions, q_values
