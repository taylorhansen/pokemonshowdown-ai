"""DRQN implementation."""
from typing import Final, Optional

import tensorflow as tf

from ..config import DRQNModelConfig
from ..gen.shapes import STATE_SIZE
from .utils.q_value import QValue, rank_q
from .utils.recurrent import LayerNormLSTMCell
from .utils.state_encoder import StateEncoder

RECURRENT_UNITS: Final = 256

HIDDEN_SHAPES: Final = ((None, RECURRENT_UNITS), (None, RECURRENT_UNITS))
"""Shapes of recurrent hidden states for the DRQNModel."""


def hidden_spec():
    """
    Gets the TensorSpec list used for the DRQNModel's recurrent hidden state.
    """
    return [
        tf.TensorSpec(shape=shape, dtype=tf.float32) for shape in HIDDEN_SHAPES
    ]


class DRQNModel(tf.keras.Model):
    """
    Deep Recurrent Q-Network (DRQN) model implementation for Pokemon AI.

    Call args:
    - inputs: A list containing:
      - state: Tensor of shape `(N, L, Ds)` describing the battle state, where
        N=batch, L=timesteps, and Ds=`STATE_SIZE`.
      - hidden: Optional list of recurrent hidden states used to continue a
        battle, either returned from the last call or created for a new battle
        via `new_hidden()`.
    - mask: Optional boolean tensor of shape `(N, L)` to mask out certain
      timesteps.
    - return_activations: Whether to also return a dictionary containing all the
      layer activations.

    Output: A tuple containing:
    - q_values: Tensor of shape `(N, L, A)` containing Q-values, or
      `(N, L, A, D)` describing Q-value distributions if `dist!=None`.
    - hidden: List of recurrent hidden states that can be used to continue a
      battle.
    - activations: If `return_activations` is true, contains layer activations
      in a dictionary. Otherwise not provided.

    For inference, recommended to use the `greedy()` method instead of calling
    directly.
    """

    def __init__(
        self,
        config: Optional[DRQNModelConfig] = None,
        name: Optional[str] = None,
    ):
        """
        Creates a DRQNModel.

        :param config: Config for constructing the model.
        :param name: Name of the model.
        """
        super().__init__(name=name)
        if config is None:
            config = DRQNModelConfig()
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
        # Note: Don't use an actual LSTM layer since its optional cuDNN kernel
        # doesn't seem to work with XLA compilation. Instead force it to use the
        # pure TF implementation by wrapping the base LSTMCell in an RNN layer.
        self.recurrent = tf.keras.layers.RNN(
            cell=LayerNormLSTMCell(RECURRENT_UNITS, name="lstm_cell")
            if config.use_layer_norm
            else tf.keras.layers.LSTMCell(RECURRENT_UNITS, name="lstm_cell"),
            return_sequences=True,
            return_state=True,
            name=f"{self.name}/state/global/lstm",
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

    @staticmethod
    def new_hidden(batch_size: Optional[int] = None) -> list[tf.Tensor]:
        """Creates a new initial hidden state for use in model calls."""
        return [
            tf.zeros(
                shape=(batch_size, RECURRENT_UNITS)
                if batch_size is not None
                else (RECURRENT_UNITS,)
            )
            for _ in range(2)
        ]

    def init(self):
        """Initializes model weights."""
        self.build((None, None, STATE_SIZE))

    def call(self, inputs, training=False, mask=None, return_activations=False):
        if isinstance(inputs, (list, tuple)):
            state, hidden = inputs
        else:
            state = inputs
            hidden = None
        (
            global_features,
            our_active_moves,
            our_bench,
            activations,
        ) = self.state_encoder(state, return_activations=return_activations)

        global_features, *hidden = self.recurrent(
            global_features,
            training=training,
            mask=mask,
            initial_state=hidden,
        )
        if return_activations:
            activations[self.recurrent.name] = global_features

        # (N,L,1,4,X) -> (N,L,4,X)
        our_active_moves = tf.squeeze(our_active_moves, axis=-3)

        q_values, q_activations = self.q_value(
            [our_active_moves, our_bench, global_features],
            return_activations=return_activations,
        )
        activations |= q_activations

        if return_activations:
            return q_values, hidden, activations
        return q_values, hidden

    def get_config(self):
        return super().get_config() | {"config": self.config.__dict__}

    @classmethod
    def from_config(cls, config, custom_objects=None):
        config["config"] = DRQNModelConfig(**config["config"])
        return cls(**config)

    @tf.function(
        input_signature=[
            tf.TensorSpec(
                shape=(None, None, STATE_SIZE), dtype=tf.float32, name="state"
            ),
            hidden_spec(),
        ],
        jit_compile=True,
    )
    def greedy(self, state, hidden):
        """
        Creates action id rankings based on predicted Q-values.

        :param state: Tensor of shape `(N, L, Ds)` encoding battle states.
        :param hidden: Initial hidden state for recurrent component. Used to
        continue a battle.
        :returns: A tuple containing:
        - ranked_actions: Integer tensor of shape `(N, L, A)` containing all
          possible action ids sorted by predicted Q-value for each sample in the
          batch of input states.
        - hidden: List of final recurrent hidden states at the end of the
          sequence, to be used in future calls to continue the same battle.
        """
        output, hidden = self([state, hidden])
        ranked_actions = rank_q(output, dist=self.config.dist)
        return ranked_actions, hidden

    @tf.function(
        input_signature=[
            tf.TensorSpec(
                shape=(None, None, STATE_SIZE), dtype=tf.float32, name="state"
            ),
            hidden_spec(),
        ],
        jit_compile=True,
    )
    def greedy_with_q(self, state, hidden):
        """
        Creates action id rankings based on predicted Q-values, while also
        providing the Q-values that informed those rankings.

        :param state: Tensor of shape `(N, L, Ds)` encoding battle states.
        :param hidden: Initial hidden state for recurrent component. Used to
        continue a battle.
        :returns: A tuple containing:
        - ranked_actions: Integer tensor of shape `(N, L, A)` containing all
          possible action ids sorted by predicted Q-value for each sample in the
          batch of input states.
        - hidden: List of final recurrent hidden states at the end of the
          sequence, to be used in future calls to continue the same battle.
        - q_values: Tensor of shape `(N, L, A)` containing the predicted
          Q-values indexed by action id (i.e. unsorted).
        """
        output, hidden = self([state, hidden])
        ranked_actions, q_values = rank_q(
            output, dist=self.config.dist, return_q=True
        )
        return ranked_actions, hidden, q_values
