"""DQN implementation."""

from dataclasses import dataclass
from typing import Any, Optional

import tensorflow as tf

from ..gen.shapes import STATE_SIZE
from .utils.q_value import QValue, QValueConfig, rank_q
from .utils.state_encoder import StateEncoder, StateEncoderConfig


@dataclass
class DQNModelConfig:
    """Config for the DQN model."""

    state_encoder: StateEncoderConfig
    """Config for the state encoder layer."""

    q_value: QValueConfig
    """Config for the Q-value output layer."""

    def to_dict(self) -> dict[str, Any]:
        """Converts this object to a JSON dictionary."""
        return {
            "state_encoder": self.state_encoder.to_dict(),
            "q_value": self.q_value.to_dict(),
        }

    @classmethod
    def from_dict(cls, config: dict):
        """Creates a DQNModelConfig from a JSON dictionary."""
        config["state_encoder"] = StateEncoderConfig.from_dict(
            config["state_encoder"]
        )
        config["q_value"] = QValueConfig.from_dict(config["q_value"])
        return cls(**config)


class DQNModel(tf.keras.Model):
    """
    DQN model implementation for Pokemon AI.

    Call args:
    - inputs: Input tensor, or list of:
      - state: Tensor of shape `(N, Ds)` describing the battle state, where
        N=batch and Ds=`STATE_SIZE`.
      - seed: Stacked random seed tensors for NoisyDense layers. Integers of
        shape `(2, self.num_noisy)`. Omit to not use random.
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
        config: DQNModelConfig,
        name: Optional[str] = None,
    ):
        """
        Creates a DQNModel.

        :param config: Config for constructing the model.
        :param name: Name of the model.
        """
        super().__init__(name=name)
        self.config = config

        self.state_encoder = StateEncoder(
            config=config.state_encoder, name=f"{self.name}/state"
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
                        shape=(None, STATE_SIZE), dtype=tf.float32, name="state"
                    ),
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

    def init(self):
        """Initializes model weights."""
        self.build((None, STATE_SIZE))

    def make_seeds(self, rng: Optional[tf.random.Generator] = None):
        """Creates the seed vector required for a model call."""
        if rng is None:
            rng = tf.random.get_global_generator()
        return rng.make_seeds(self.num_noisy)

    def call(
        self,
        inputs,
        training: bool = False,
        mask=None,
        return_activations=False,
    ):
        if isinstance(inputs, (list, tuple)):
            state, seed = inputs
            state_seed, q_seed = tf.split(
                seed,
                [self.state_encoder.num_noisy, self.q_value.num_noisy],
                axis=-1,
            )
        else:
            state = inputs
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

        # (N,1,4,X) -> (N,4,X)
        our_active_moves = tf.squeeze(our_active_moves, axis=-3)

        q_values, q_activations = self.q_value(
            [our_active_moves, our_bench, global_features]
            + ([q_seed] if q_seed is not None else []),
            return_activations=return_activations,
        )
        activations |= q_activations

        if return_activations:
            return q_values, activations
        return q_values

    def get_config(self):
        return super().get_config() | {"config": self.config.to_dict()}

    @classmethod
    def from_config(cls, config, custom_objects=None):
        config["config"] = DQNModelConfig.from_dict(config["config"])
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
        ranked_actions, _ = rank_q(output, dist=self.config.q_value.dist)
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
        ranked_actions, q_values = rank_q(output, dist=self.config.q_value.dist)
        return ranked_actions, q_values

    def _greedy_noisy(self, state, seed):
        output = self([state, seed])
        ranked_actions, _ = rank_q(output, dist=self.config.q_value.dist)
        return ranked_actions
