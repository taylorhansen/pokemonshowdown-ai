"""DRQN implementation."""
from dataclasses import dataclass
from typing import Any, Final, Optional

import tensorflow as tf

from ..gen.shapes import STATE_SIZE
from .utils.q_value import QValue, QValueConfig, rank_q
from .utils.recurrent import LayerNormLSTMCell
from .utils.state_encoder import StateEncoder, StateEncoderConfig

RECURRENT_UNITS: Final = 256

HIDDEN_SHAPES: Final = ((None, RECURRENT_UNITS), (None, RECURRENT_UNITS))
"""Shapes of recurrent hidden states for the DRQNModel."""


@dataclass
class RecurrentConfig:
    """Config for a recurrent module."""

    # TODO: Include layer size rather than using RECURRENT_UNITS constant.

    use_layer_norm: bool = False
    """Whether to use layer normalization."""


@dataclass
class DRQNModelConfig:
    """Config for the DRQN model."""

    state_encoder: StateEncoderConfig
    """Config for the state encoder layer."""

    recurrent: RecurrentConfig
    """Config for the recurrent layer."""

    q_value: QValueConfig
    """Config for the Q-value output layer."""

    def to_dict(self) -> dict[str, Any]:
        """Converts this object to a JSON dictionary."""
        return {
            "state_encoder": self.state_encoder.to_dict(),
            "recurrent": self.recurrent.__dict__,
            "q_value": self.q_value.to_dict(),
        }

    @classmethod
    def from_dict(cls, config: dict):
        """Creates a DQNModelConfig from a JSON dictionary."""
        config["state_encoder"] = StateEncoderConfig.from_dict(
            config["state_encoder"]
        )
        config["recurrent"] = RecurrentConfig(**config["recurrent"])
        config["q_value"] = QValueConfig.from_dict(config["q_value"])
        return cls(**config)


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
    - inputs: Input tensor, or a list of:
      - state: Tensor of shape `(N, L, Ds)` describing the battle state, where
        N=batch, L=timesteps, and Ds=`STATE_SIZE`.
      - hidden: Optional list of recurrent hidden states used to continue a
        battle, either returned from the last call or created for a new battle
        via `new_hidden()`.
      - seed: Stacked random seed tensors for NoisyDense layers. Integers of
        shape `(2, self.num_noisy)`. Omit to not use random.
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
        config: DRQNModelConfig,
        name: Optional[str] = None,
    ):
        """
        Creates a DRQNModel.

        :param config: Config for constructing the model.
        :param name: Name of the model.
        """
        super().__init__(name=name)
        self.config = config

        self.state_encoder = StateEncoder(
            config=config.state_encoder, name=f"{self.name}/state"
        )
        # Note: Don't use an actual LSTM layer since its optional cuDNN kernel
        # doesn't seem to work with XLA compilation. Instead force it to use the
        # pure TF implementation by wrapping the base LSTMCell in an RNN layer.
        self.recurrent = tf.keras.layers.RNN(
            cell=LayerNormLSTMCell(RECURRENT_UNITS, name="lstm_cell")
            if config.recurrent.use_layer_norm
            else tf.keras.layers.LSTMCell(RECURRENT_UNITS, name="lstm_cell"),
            return_sequences=True,
            return_state=True,
            name=f"{self.name}/state/global/lstm",
        )
        self.q_value = QValue(
            config=config.q_value, name=f"{self.name}/q_value"
        )

        self.num_noisy = self.state_encoder.num_noisy + self.q_value.num_noisy

        if self.num_noisy > 0:
            self.greedy_noisy = tf.function(
                self._greedy_noisy,
                input_signature=[
                    tf.TensorSpec(
                        shape=(None, None, STATE_SIZE),
                        dtype=tf.float32,
                        name="state",
                    ),
                    hidden_spec(),
                    tf.TensorSpec(
                        shape=(2, self.num_noisy), dtype=tf.int64, name="seed"
                    ),
                ],
                jit_compile=True,
            )
            """
            Like `greedy()` but with additional seed input for generating random
            values for the NoisyNet component.
            """

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

    def make_seeds(self, rng: Optional[tf.random.Generator] = None):
        """Creates the seed vector required for a model call."""
        if rng is None:
            rng = tf.random.get_global_generator()
        return rng.make_seeds(self.num_noisy)

    def call(self, inputs, training=False, mask=None, return_activations=False):
        if isinstance(inputs, (list, tuple)):
            if len(inputs) == 3:
                state, hidden, seed = inputs
                state_seed, q_seed = tf.split(
                    seed,
                    [self.state_encoder.num_noisy, self.q_value.num_noisy],
                    axis=-1,
                )
            else:
                state, hidden = inputs
                state_seed = None
                q_seed = None
        else:
            state = inputs
            hidden = None
            state_seed = None
            q_seed = None

        (
            global_features,
            our_active_moves,
            our_bench,
            activations,
        ) = self.state_encoder(
            state if state_seed is None else [state, state_seed],
            return_activations=return_activations,
        )

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
            [our_active_moves, our_bench, global_features]
            + ([q_seed] if q_seed is not None else []),
            return_activations=return_activations,
        )
        activations |= q_activations

        if return_activations:
            return q_values, hidden, activations
        return q_values, hidden

    def get_config(self):
        return super().get_config() | {"config": self.config.to_dict()}

    @classmethod
    def from_config(cls, config, custom_objects=None):
        config["config"] = DRQNModelConfig.from_dict(config["config"])
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
        ranked_actions = rank_q(output, dist=self.config.q_value.dist)
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
        ranked_actions, q_values = rank_q(output, dist=self.config.q_value.dist)
        return ranked_actions, hidden, q_values

    def _greedy_noisy(self, state, hidden, seed):
        output, hidden = self([state, hidden, seed])
        ranked_actions, _ = rank_q(output, dist=self.config.q_value.dist)
        return ranked_actions, hidden
