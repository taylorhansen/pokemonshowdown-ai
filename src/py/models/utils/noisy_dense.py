"""NoisyNet implementation."""
import math

import tensorflow as tf


class NoisyDense(tf.keras.layers.Layer):
    """
    Noisy dense layer for NoisyNet. Uses factorized Gaussian noise. Stateless.

    Call args:
    - inputs: Input tensor or list of:
      - inputs: Tensor of batched input vectors, of shape `(N, input)`.
      - seed: Optional integer tensor of shape `(2,)` used for applying
        factorized Gaussian noise onto the weights for the entire batch. If
        omitted, the parameterized mean of the weights is used instead (i.e.
        base Dense layer behavior).

    Output: Tensor of shape `(N, units)` containing the noisy output.
    """

    def __init__(
        self,
        units: int,
        std_init: float = 0.5,
        activation=None,
        use_bias=True,
        **kwargs,
    ):
        """
        Creates a NoisyDense layer.

        :param units: Size of the layer.
        :param std_init: Initial standard deviation scaling for the noise.
        :param activation: Layer activation function. Default linear.
        :param use_bias: Whether to use a (noisy) bias vector.
        """
        super().__init__(**kwargs)
        self.units = units
        self.std_init = std_init
        self.activation = tf.keras.activations.get(activation)
        self.use_bias = use_bias

    def build(self, input_shape):
        if isinstance(input_shape, (list, tuple)) and isinstance(
            input_shape[0], (list, tuple, tf.TensorShape)
        ):
            input_shape, seed_shape = input_shape
            tf.debugging.assert_equal([2], seed_shape)
        input_shape = tf.TensorShape(input_shape)
        input_dim = input_shape[-1]

        sqrt_input_dim = math.sqrt(input_dim)

        mu_range = 1.0 / sqrt_input_dim
        # pylint: disable-next=attribute-defined-outside-init
        self.kernel_mu = self.add_weight(
            "kernel_mu",
            shape=[input_dim, self.units],
            initializer=tf.keras.initializers.random_uniform(
                -mu_range, mu_range
            ),
            dtype=self.dtype,
            trainable=True,
        )
        if self.use_bias:
            # pylint: disable-next=attribute-defined-outside-init
            self.bias_mu = self.add_weight(
                "bias_mu",
                shape=[self.units],
                initializer=tf.keras.initializers.random_uniform(
                    -mu_range, mu_range
                ),
                dtype=self.dtype,
                trainable=True,
            )

        sigma_init = self.std_init / sqrt_input_dim
        # pylint: disable-next=attribute-defined-outside-init
        self.kernel_sigma = self.add_weight(
            "kernel_sigma",
            shape=[input_dim, self.units],
            initializer=tf.keras.initializers.constant(sigma_init),
            dtype=self.dtype,
            trainable=True,
        )
        if self.use_bias:
            # pylint: disable-next=attribute-defined-outside-init
            self.bias_sigma = self.add_weight(
                "bias_sigma",
                shape=[self.units],
                initializer=tf.keras.initializers.constant(sigma_init),
                dtype=self.dtype,
                trainable=True,
            )

        self.built = True

    def call(
        self,
        inputs,
        *args,
        **kwargs,
    ):
        if isinstance(inputs, (list, tuple)):
            inputs, seed = inputs
        else:
            seed = None

        if seed is not None:
            # Factorized Gaussian noise.
            # Sample noise for the entire batch.
            input_dim = inputs.shape[-1]
            epsilon = tf.random.stateless_normal(
                shape=(input_dim + self.units,),
                seed=seed,
                dtype=self.dtype,
            )
            epsilon = tf.sign(epsilon) * tf.sqrt(tf.abs(epsilon))
            epsilon_in, epsilon_out = tf.split(
                epsilon, [input_dim, self.units], axis=-1
            )

            # Outer product: (input_dim, units)
            kernel_epsilon = tf.matmul(
                tf.expand_dims(epsilon_in, axis=-1),  # (I, 1)
                tf.expand_dims(epsilon_out, axis=-2),  # (1, U)
            )
            kernel_epsilon = tf.stop_gradient(kernel_epsilon)
            kernel = self.kernel_mu + self.kernel_sigma * kernel_epsilon
        else:
            kernel = self.kernel_mu  # (I, U)

        # Kernel code adapted from tf.keras.layers.Dense source.
        rank = inputs.shape.rank
        if rank == 2 or rank is None:
            # Non-broadcasting.
            outputs = tf.matmul(inputs, kernel)
        else:
            # Broadcast kernel to inputs.
            outputs = tf.tensordot(inputs, kernel, [[rank - 1], [0]])
            if not tf.executing_eagerly():
                output_shape = inputs.shape.as_list()[:-1] + [self.units]
                outputs.set_shape(output_shape)

        if self.use_bias:
            if seed is not None:
                bias_epsilon = tf.stop_gradient(epsilon_out)  # (U,)
                bias = self.bias_mu + self.bias_sigma * bias_epsilon
            else:
                bias = self.bias_mu

            outputs = tf.nn.bias_add(outputs, bias)

        if self.activation is not None:
            outputs = self.activation(outputs)

        return outputs

    def get_config(self):
        return super().get_config() | {
            "units": self.units,
            "std_init": self.std_init,
            "activation": self.activation,
            "use_bias": self.use_bias,
        }
