"""Model building utilities for recurrent networks."""
import tensorflow as tf


@tf.keras.saving.register_keras_serializable()
class LayerNormLSTMCell(tf.keras.layers.LSTMCell):
    """
    LSTMCell with layer normalization applied before the nonlinearities.

    Adapted from base LSTMCell source code and the LayerNormLSTMCell from
    TensorFlow Addons.
    """

    def __init__(
        self,
        units: int,
        activation="tanh",
        recurrent_activation="sigmoid",
        use_bias=True,
        kernel_initializer="glorot_uniform",
        recurrent_initializer="orthogonal",
        bias_initializer="zeros",
        unit_forget_bias=True,
        norm_beta_initializer="zeros",
        norm_gamma_initializer="ones",
        norm_epsilon=1e-3,
        **kwargs,
    ):
        """
        Creates a LayerNormLSTMCell.

        :param units: Dimensionality of the output space.
        :param activation: Output activation function.
        :param recurrent_activation: Activation function for the recurrent step.
        :param use_bias: Whether to use a bias vector.
        :param kernel_initializer: Initializer for kernel weights.
        :param recurrent_initializer: Initializer for recurrent kernel weights.
        :param bias_initializer: Initializer for the bias vector.
        :param unit_forget_bias: Add 1 to the bias of the forget gate at
        initialization. Forces `bias_initializer="zeros"`.
        :param norm_beta_initializer: Initializer for layer normalization beta
        weights.
        :param norm_gamma_initializer: Initializer for layer normalization gamma
        weights.
        :param norm_epsilon: Small float added to the variance in layer
        normalization to avoid zeros.
        :param kwargs: Other keyword arguments passed to the base LSTMCell
        instance.
        """
        super().__init__(
            units=units,
            activation=activation,
            recurrent_activation=recurrent_activation,
            use_bias=use_bias,
            kernel_initializer=kernel_initializer,
            recurrent_initializer=recurrent_initializer,
            bias_initializer=bias_initializer,
            unit_forget_bias=unit_forget_bias,
            **kwargs,
        )
        self.norm_beta_initializer = tf.keras.initializers.get(
            norm_beta_initializer
        )
        self.norm_gamma_initializer = tf.keras.initializers.get(
            norm_gamma_initializer
        )
        self.norm_epsilon = norm_epsilon

        self.kernel_ln = tf.keras.layers.LayerNormalization(
            beta_initializer=self.norm_beta_initializer,
            gamma_initializer=self.norm_gamma_initializer,
            epsilon=self.norm_epsilon,
            name="kernel_ln",
        )
        self.recurrent_ln = tf.keras.layers.LayerNormalization(
            beta_initializer=self.norm_beta_initializer,
            gamma_initializer=self.norm_gamma_initializer,
            epsilon=self.norm_epsilon,
            name="recurrent_ln",
        )
        self.state_ln = tf.keras.layers.LayerNormalization(
            beta_initializer=self.norm_beta_initializer,
            gamma_initializer=self.norm_gamma_initializer,
            epsilon=self.norm_epsilon,
            name="state_ln",
        )

    def call(self, inputs, states, training=None):
        # Adapted from LSTMCell source code.
        h_tm1 = states[0]  # previous memory state
        c_tm1 = states[1]  # previous carry state
        # pylint: disable=invalid-name
        z = self.kernel_ln(tf.keras.backend.dot(inputs, self.kernel))
        z += self.recurrent_ln(
            tf.keras.backend.dot(h_tm1, self.recurrent_kernel)
        )
        if self.use_bias:
            z = tf.keras.backend.bias_add(z, self.bias)

        z = tf.split(z, 4, axis=1)
        c, o = self._compute_carry_and_output_fused(z, c_tm1)
        c = self.state_ln(c)
        h = o * self.activation(c)
        # pylint: enable=invalid-name
        return h, [h, c]

    def get_config(self):
        return super().get_config() | {
            "norm_beta_initializer": tf.keras.initializers.serialize(
                self.norm_beta_initializer
            ),
            "norm_gamma_initializer": tf.keras.initializers.serialize(
                self.norm_gamma_initializer
            ),
            "norm_epsilon": self.norm_epsilon,
        }
