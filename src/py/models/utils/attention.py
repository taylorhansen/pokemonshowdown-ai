"""Attention mechanisms for the neural network."""
import tensorflow as tf


def scaled_dot_product_attention(
    query, key, value, query_mask=None, value_mask=None
):
    """
    Scaled dot product attention. Adapted from original paper
    (https://arxiv.org/abs/1706.03762).

    :param query: Tensor of shape `(B..., T, Q)` where B is the batch dimension,
    T is the number of queries, and Q is the query dimension.
    :param key: Tensor of shape `(B..., S, K)` where S is the number of keys and
    K is the key dimension.
    :param value: Tensor of shape `(B..., S, V)` where V is the value dimension.
    :param query_mask: Optional tensor of shape `(B..., T)`, containing 1 for
    attention and 0 for no attention, to be applied to the queries.
    :param value_mask: Optional tensor of shape `(B..., S)`, containing 1 for
    attention and 0 for no attention, to be applied to the key/value pairs.
    :returns: Attention output of shape `(B..., T, V)`, and attention weights of
    shape `(B..., T, S)` after masking and softmax.
    """
    scores = tf.matmul(query, key, transpose_b=True)  # (B..., T, S)
    scores /= tf.sqrt(tf.cast(key.shape[-1], scores.dtype))
    if value_mask is not None:
        value_mask = tf.expand_dims(value_mask, axis=-2)  # (B..., 1, S)
        scores += (
            tf.constant(1.0, scores.dtype) - tf.cast(value_mask, scores.dtype)
        ) * (
            tf.constant(-1e9, scores.dtype)
            if scores.dtype != tf.float16
            else tf.float16.min
        )
    weights = tf.nn.softmax(scores, axis=-1)
    output = tf.matmul(weights, value)  # (B..., T, V)
    if query_mask is not None:
        query_mask = tf.expand_dims(query_mask, axis=-1)  # (B..., T, 1)
        output *= tf.cast(query_mask, output.dtype)
    return output, weights


@tf.keras.saving.register_keras_serializable()
class MHA(tf.keras.layers.Layer):
    """
    Multi-head attention layer. Adapted from original paper
    (https://arxiv.org/abs/1706.03762).

    Call args:
    - input: List of:
      - query: Tensor of shape `(B..., T, Q)` where B is the batch dimension, T
      is the number of queries, and Q is the query dimension.
      - key: Tensor of shape `(B..., S, K)` where S is the number of key/value
      pairs and K is the key dimension.
      - value: Optional tensor of shape `(B..., S, V)` where S is the number of
      key/value pairs and V is the value dimension. Defaults to key, in which
      case K=V.
    - mask: List of:
      - query_mask: Optional tensor of shape `(B..., T)`, containing 1 for
      attention and 0 for no attention, to be applied to the queries.
      - value_mask: Optional tensor of shape `(B..., S)`, containing 1 for
      attention and 0 for no attention, to be applied to the key/value pairs.

    Output: Tensor of shape `(B..., T, H*D)` where H=num_heads and D=depth.
    """

    def __init__(
        self,
        num_heads: int,
        depth: int,
        use_bias=True,
        query_kernel_initializer="glorot_uniform",
        query_bias_initializer="zeros",
        key_kernel_initializer="glorot_uniform",
        key_bias_initializer="zeros",
        value_kernel_initializer="glorot_uniform",
        value_bias_initializer="zeros",
        output_kernel_initializer="glorot_uniform",
        output_bias_initializer="zeros",
        **kwargs,
    ):
        """
        Creates a MHA layer.

        :param num_heads: Number of attention heads.
        :param depth: Size of each attention head.
        :param use_bias: Whether to use bias.
        """
        super().__init__(**kwargs)
        self.num_heads = num_heads
        self.depth = depth
        self.use_bias = use_bias

        dim = num_heads * depth
        self.query = tf.keras.layers.Dense(
            units=dim,
            use_bias=use_bias,
            kernel_initializer=query_kernel_initializer,
            bias_initializer=query_bias_initializer,
            name="query",
            dtype=self.dtype,
        )
        self.key = tf.keras.layers.Dense(
            units=dim,
            use_bias=use_bias,
            kernel_initializer=key_kernel_initializer,
            bias_initializer=key_bias_initializer,
            name="key",
            dtype=self.dtype,
        )
        self.value = tf.keras.layers.Dense(
            units=dim,
            use_bias=use_bias,
            kernel_initializer=value_kernel_initializer,
            bias_initializer=value_bias_initializer,
            name="value",
            dtype=self.dtype,
        )
        self.out = tf.keras.layers.Dense(
            units=dim,
            use_bias=use_bias,
            kernel_initializer=output_kernel_initializer,
            bias_initializer=output_bias_initializer,
            name="out",
            dtype=self.dtype,
        )

    def call(self, inputs, *args, training=None, mask=None, **kwargs):
        query, key = inputs[:2]
        value = inputs[2] if len(inputs) > 2 else key
        query_mask, value_mask = mask if mask is not None else [None, None]

        query = self.query(query, training=training)  # (B..., T, H*D)
        key = self.key(key, training=training)  # (B..., S, H*D)
        value = self.value(value, training=training)  # (B..., S, H*D)

        query = self._split_heads(query)  # (B..., H, T, D)
        key = self._split_heads(key)  # (B..., H, S, D)
        value = self._split_heads(value)  # (B..., H, S, D)

        # Broadcast masks along attention heads.
        if query_mask is not None:
            query_mask = tf.expand_dims(query_mask, axis=-2)  # (B..., 1, T)
        if value_mask is not None:
            value_mask = tf.expand_dims(value_mask, axis=-2)  # (B..., 1, S)
        attention, _ = scaled_dot_product_attention(
            query=query,
            key=key,
            value=value,
            query_mask=query_mask,
            value_mask=value_mask,
        )  # (B..., H, T, D)
        output = MHA._combine_heads(attention)  # (B..., T, H*D)
        output = self.out(output, training=training)
        return output

    def _split_heads(self, qkv):
        """
        Splits the tensor into multiple attention heads.

        :param qkv: Query/key/value tensor of shape `(B..., N, H*D)` where B is
        the batch dimension, N is the number of elements, H=num_heads, and
        D=depth.
        :returns: A tensor of shape `(B..., H, N, D)`.
        """
        batch_shape = tf.shape(qkv)[:-2]
        num_elements = qkv.shape[-2]
        qkv = tf.reshape(
            qkv,
            # pylint: disable=unexpected-keyword-arg, no-value-for-parameter
            shape=tf.concat(
                [batch_shape, (num_elements, self.num_heads, self.depth)],
                axis=0,
            ),
            # pylint: enable=unexpected-keyword-arg, no-value-for-parameter
        )
        perm = [i for i, _ in enumerate(qkv.shape)]
        perm[-3], perm[-2] = perm[-2], perm[-3]  # Swap N and H dims.
        return tf.transpose(qkv, perm=perm)  # (B..., H, N, D)

    @staticmethod
    def _combine_heads(heads):
        """
        Combines attention heads.

        :param heads: Tensor of shape `(B..., H, N, D)` where B is the batch
        dimension, H is the number of attention heads, N is the number of
        elements, and D is the size of each attention head.
        :returns: A tensor of shape `(B..., N, H*D)`.
        """
        batch_shape = tf.shape(heads)[:-3]
        num_heads, num_elements, depth = heads.shape[-3:]
        perm = [i for i, _ in enumerate(heads.shape)]
        perm[-3], perm[-2] = perm[-2], perm[-3]  # Swap N and H dims.
        heads = tf.transpose(heads, perm=perm)  # (B..., N, H, D)
        return tf.reshape(
            heads,
            # pylint: disable=unexpected-keyword-arg, no-value-for-parameter
            shape=tf.concat(
                [batch_shape, (num_elements, num_heads * depth)], axis=0
            ),
            # pylint: enable=unexpected-keyword-arg, no-value-for-parameter
        )

    def get_initializer_config(self):
        """Gets config dict for initializer arguments."""
        return {
            "query_kernel_initializer": tf.keras.initializers.serialize(
                self.query.kernel_initializer
            ),
            "query_bias_initializer": tf.keras.initializers.serialize(
                self.query.bias_initializer
            ),
            "key_kernel_initializer": tf.keras.initializers.serialize(
                self.key.kernel_initializer
            ),
            "key_bias_initializer": tf.keras.initializers.serialize(
                self.key.bias_initializer
            ),
            "value_kernel_initializer": tf.keras.initializers.serialize(
                self.value.kernel_initializer
            ),
            "value_bias_initializer": tf.keras.initializers.serialize(
                self.value.bias_initializer
            ),
            "output_kernel_initializer": tf.keras.initializers.serialize(
                self.out.kernel_initializer
            ),
            "output_bias_initializer": tf.keras.initializers.serialize(
                self.out.bias_initializer
            ),
        }

    def get_config(self):
        return (
            super().get_config()
            | self.get_initializer_config()
            | {
                "num_heads": self.num_heads,
                "depth": self.depth,
                "use_bias": self.use_bias,
            }
        )


@tf.keras.saving.register_keras_serializable()
class MAB(tf.keras.layers.Layer):
    """
    Multi-head Attention Block. Adapted from Set Transformer paper
    (https://arxiv.org/abs/1810.00825).

    When called, takes the following arguments:

    Call args:
    - inputs: List of:
      - query: Tensor of shape `(B..., T, Q)` where B is the batch dimension, T
      is the number of queries, and Q is the query dimension.
      - key: Tensor of shape `(B..., S, K)` where S is the number of key/value
      pairs and K is the key and value dimension.
    - mask: List of:
      - query_mask: Optional tensor of shape `(B..., T)`, containing 1 for
      attention and 0 for no attention, to be applied to the queries.
      - value_mask: Optional tensor of shape `(B..., S)`, containing 1 for
      attention and 0 for no attention, to be applied to the key/value pairs.

    Output: Tensor of shape `(B..., T, H*D)` where H=num_heads and D=depth. Note
    that `Q=K=H*D` in order for the skip connections to work.
    """

    def __init__(
        self,
        num_heads: int,
        depth: int,
        rff: tf.keras.layers.Layer,
        use_layer_norm=False,
        use_bias=True,
        query_kernel_initializer="glorot_uniform",
        query_bias_initializer="zeros",
        key_kernel_initializer="glorot_uniform",
        key_bias_initializer="zeros",
        value_kernel_initializer="glorot_uniform",
        value_bias_initializer="zeros",
        output_kernel_initializer="glorot_uniform",
        output_bias_initializer="zeros",
        **kwargs,
    ):
        """
        Creates a MAB layer.

        :param num_heads: Number of attention heads.
        :param depth: Size of each attention head.
        :param rff: Row-wise feedforward layers to apply between the first and
        second skip connections, e.g. a stack of convolutional or dense layers.
        Must have the same input and output shape as the layer output.
        :param use_layer_norm: Whether to use layer norm.
        :param use_bias: Whether to use bias.
        """
        super().__init__(**kwargs)
        self.rff = rff
        self.use_layer_norm = use_layer_norm
        self.mha = MHA(
            num_heads=num_heads,
            depth=depth,
            use_bias=use_bias,
            query_kernel_initializer=query_kernel_initializer,
            query_bias_initializer=query_bias_initializer,
            key_kernel_initializer=key_kernel_initializer,
            key_bias_initializer=key_bias_initializer,
            value_kernel_initializer=value_kernel_initializer,
            value_bias_initializer=value_bias_initializer,
            output_kernel_initializer=output_kernel_initializer,
            output_bias_initializer=output_bias_initializer,
            name="mha",
            dtype=self.dtype,
        )
        if use_layer_norm:
            self.ln_att = tf.keras.layers.LayerNormalization(name="ln_att")
            self.ln_rff = tf.keras.layers.LayerNormalization(name="ln_rff")

    def call(self, inputs, *args, training=None, mask=None, **kwargs):
        query, _ = inputs
        output = query + self.mha(inputs, training=training, mask=mask)
        if self.use_layer_norm:
            output = self.ln_att(output, training=training)
        output += self.rff(output, training=training)
        if self.use_layer_norm:
            output = self.ln_rff(output, training=training)
        return output

    def get_config(self):
        return (
            super().get_config()
            | self.mha.get_initializer_config()
            | {
                "num_heads": self.mha.num_heads,
                "depth": self.mha.depth,
                "rff": self.rff,
                "use_layer_norm": self.use_layer_norm,
                "use_bias": self.mha.use_bias,
            }
        )


@tf.keras.saving.register_keras_serializable()
class SAB(tf.keras.layers.Layer):
    """
    Self Attention Block. Adapted from Set Transformer paper
    (https://arxiv.org/abs/1810.00825).

    Call args:
    - inputs: Tensor of shape `(B..., N, X)` where B is the batch dimension, N
    is the number of elements, and X is the dimension of each element.
    - mask: Optional tensor of shape `(B..., N)`, containing 1 for attention
    and 0 for no attention, to be applied onto the set of inputs.

    Output: Tensor of shape `(B..., N, H*D)` where H=num_heads and D=depth.
    """

    def __init__(
        self,
        num_heads: int,
        depth: int,
        rff: tf.keras.layers.Layer,
        use_layer_norm=False,
        use_bias=True,
        query_kernel_initializer="glorot_uniform",
        query_bias_initializer="zeros",
        key_kernel_initializer="glorot_uniform",
        key_bias_initializer="zeros",
        value_kernel_initializer="glorot_uniform",
        value_bias_initializer="zeros",
        output_kernel_initializer="glorot_uniform",
        output_bias_initializer="zeros",
        **kwargs,
    ):
        """
        Creates a SAB layer.

        :param num_heads: Number of attention heads.
        :param depth: Size of each attention head.
        :param rff: Row-wise feedforward layers to apply between the first and
        second skip connections, e.g. a stack of convolutional or dense layers.
        Must have the same input and output shape as the layer output.
        :param use_layer_norm: Whether to use layer norm.
        :param use_bias: Whether to use bias.
        """
        super().__init__(**kwargs)
        self.mab = MAB(
            num_heads=num_heads,
            depth=depth,
            rff=rff,
            use_layer_norm=use_layer_norm,
            use_bias=use_bias,
            query_kernel_initializer=query_kernel_initializer,
            query_bias_initializer=query_bias_initializer,
            key_kernel_initializer=key_kernel_initializer,
            key_bias_initializer=key_bias_initializer,
            value_kernel_initializer=value_kernel_initializer,
            value_bias_initializer=value_bias_initializer,
            output_kernel_initializer=output_kernel_initializer,
            output_bias_initializer=output_bias_initializer,
            name="mab",
            dtype=self.dtype,
        )

    def call(self, inputs, *args, training=None, mask=None, **kwargs):
        return self.mab([inputs, inputs], training=training, mask=[mask, mask])

    def get_config(self):
        return (
            super().get_config()
            | self.mab.mha.get_initializer_config()
            | {
                "num_heads": self.mab.mha.num_heads,
                "depth": self.mab.mha.depth,
                "rff": self.mab.rff,
                "use_layer_norm": self.mab.use_layer_norm,
                "use_bias": self.mab.mha.use_bias,
            }
        )


@tf.keras.saving.register_keras_serializable()
class PMA(tf.keras.layers.Layer):
    """
    Pooling by Multi-head Attention. Adapted from Set Transformer paper.

    Call args:
    - inputs: Tensor of shape `(B..., N, D)` where B is the batch dimension, N
    is the number of elements, and D is the dimension of each element.
    - mask: Optional tensor of shape `(B..., N)`, containing 1 for attention
    and 0 for no attention, to be applied onto the set of inputs.

    Output: Tensor of shape `(B..., S, H*D)` where S=num_seeds, H=num_heads, and
    D=depth.
    """

    def __init__(
        self,
        num_seeds: int,
        num_heads: int,
        depth: int,
        rff: tf.keras.layers.Layer,
        rff_s: tf.keras.layers.Layer,
        use_layer_norm=False,
        use_bias=True,
        seed_initializer="glorot_uniform",
        query_kernel_initializer="glorot_uniform",
        query_bias_initializer="zeros",
        key_kernel_initializer="glorot_uniform",
        key_bias_initializer="zeros",
        value_kernel_initializer="glorot_uniform",
        value_bias_initializer="zeros",
        output_kernel_initializer="glorot_uniform",
        output_bias_initializer="zeros",
        **kwargs,
    ):
        """
        Creates a PMA layer.

        :param num_seeds: Number of seed vectors for pooling.
        :param num_heads: Number of attention heads.
        :param depth: Size of each attention head.
        :param rff: Row-wise feedforward layers to apply between the first and
        second skip connections in the internal multi-head attention block
        (MAB), e.g. a stack of convolutional or dense layers. Must have the same
        input and output shape as the layer output.
        :param rff_s: Row-wise feedforward layers to apply before the attention
        block. No shape restriction.
        :param use_layer_norm: Whether to use layer norm.
        :param use_bias: Whether to use bias.
        """
        super().__init__(**kwargs)
        self.num_seeds = num_seeds
        self.rff_s = rff_s
        self.seed_initializer = tf.keras.initializers.get(seed_initializer)

        self.mab = MAB(
            num_heads=num_heads,
            depth=depth,
            rff=rff,
            use_layer_norm=use_layer_norm,
            use_bias=use_bias,
            query_kernel_initializer=query_kernel_initializer,
            query_bias_initializer=query_bias_initializer,
            key_kernel_initializer=key_kernel_initializer,
            key_bias_initializer=key_bias_initializer,
            value_kernel_initializer=value_kernel_initializer,
            value_bias_initializer=value_bias_initializer,
            output_kernel_initializer=output_kernel_initializer,
            output_bias_initializer=output_bias_initializer,
            name="mab",
            dtype=self.dtype,
        )

    def build(self, input_shape):
        # pylint: disable-next=attribute-defined-outside-init
        self.seed = self.add_weight(
            name="seed",
            shape=(self.num_seeds, self.mab.mha.num_heads * self.mab.mha.depth),
            dtype=self.dtype,
            initializer=self.seed_initializer,
            trainable=True,
        )

    def call(self, inputs, *args, training=None, mask=None, **kwargs):
        return self.mab(
            [self.seed, self.rff_s(inputs, training=training)],
            training=training,
            mask=[None, mask],
        )

    def get_config(self):
        return (
            super().get_config()
            | self.mab.mha.get_initializer_config()
            | {
                "num_seeds": self.num_seeds,
                "num_heads": self.mab.mha.num_heads,
                "depth": self.mab.mha.depth,
                "rff": self.mab.rff,
                "rff_s": self.rff_s,
                "use_layer_norm": self.mab.use_layer_norm,
                "use_bias": self.mab.mha.use_bias,
                "seed_initializer": tf.keras.initializers.serialize(
                    self.seed_initializer
                ),
            }
        )
