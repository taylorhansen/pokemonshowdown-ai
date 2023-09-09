"""Q-value distribution utils."""
import tensorflow as tf

from ...gen.shapes import MAX_REWARD, MIN_REWARD


def zero_q_dist(dist: int) -> tf.Tensor:
    """
    Creates a Q-value distribution to represent `Q(s,a) = 0`.

    :param dist: Number of atoms to use for the discrete distribution.
    :returns: Tensor of shape `(D,)` where D=num_atoms.
    """
    index = _get_projection_index(tf.constant(0.0), dist)
    if dist % 2 == 0:
        # Split probability between the middle two values around zero.
        return tf.scatter_nd(
            tf.cast([[tf.math.floor(index), tf.math.ceil(index)]], tf.int32),
            [0.5, 0.5],
            shape=(dist,),
        )
    # Concentrate all probability on the middle value representing zero.
    return tf.scatter_nd(tf.cast([[index]], tf.int32), [1.0], shape=(dist,))


def project_target_update(
    reward: tf.Tensor,
    target_next_q: tf.Tensor,
    done: tf.Tensor,
    n_steps: int,
    discount_factor: float,
):
    """
    Projects the sample Bellman update onto the support of the original Q-value
    distribution for learning a categorical DQN. Adapted from distributional RL
    paper.
    https://arxiv.org/pdf/1707.06887.pdf

    Requires concrete tensor ranks, but more efficient if all shapes are known.
    Supports multiple batch dimensions.

    :param reward: Tensor of shape `(*N,)` containing returns.
    :param target_next_q: Tensor of shape `(*N,D)` containing the target
    Q-value distributions for the next states.
    :param done: Boolean tensor of shape `(*N,)` to mask out target Q-values
    of terminal states.
    :param n_steps: Lookahead steps for n-step returns, or zero for infinite.
    :param discount_factor: Discount factor for future rewards.
    :returns: Tensor containing the projected distribution, of shape
    `(*N,D)`.
    """
    *batch_shape, dist = target_next_q.shape

    # Make sure masked target Q-dists use the proper zero distribution.
    zero_q = tf.cast(zero_q_dist(dist), target_next_q.dtype)
    for _ in batch_shape:
        zero_q = tf.expand_dims(zero_q, axis=0)  # (1...,D)
    target_next_q = tf.where(
        tf.expand_dims(done, axis=-1), zero_q, target_next_q
    )

    # Supports of Q-value distribution (projection target).
    q_support = tf.linspace(
        tf.constant(
            MIN_REWARD, dtype=target_next_q.dtype, shape=(1,) * len(batch_shape)
        ),
        tf.constant(
            MAX_REWARD, dtype=target_next_q.dtype, shape=(1,) * len(batch_shape)
        ),
        dist,
        axis=-1,
    )  # (1...,D)

    # Supports of discrete TD target distribution (projection source).
    if n_steps <= 0:
        # Infinite n-step reduces to episodic Monte Carlo returns.
        td_target_support = tf.tile(
            tf.expand_dims(reward, axis=-1), ([1] * len(batch_shape)) + [dist]
        )  # (*N,D)
        # Note: The done vector should be all true since we're using episodic
        # returns, which should force the target Q distribution (which shouldn't
        # have been calculated in the first place) to zero.
    else:
        scale = tf.constant(discount_factor**n_steps, q_support.dtype)
        td_target_support = tf.expand_dims(reward, axis=-1) + tf.where(
            tf.expand_dims(done, axis=-1),
            tf.constant(0, dtype=q_support.dtype),
            scale * q_support,
        )  # (*N,D)
    td_target_support = tf.clip_by_value(
        td_target_support, MIN_REWARD, MAX_REWARD
    )

    # Scatter indices for batch dims.
    if len(batch_shape) > 0:
        batch_indices = [
            tf.tile(
                tf.reshape(
                    tf.range(dim, dtype=tf.int32),
                    ((1,) * i) + (dim,) + ((1,) * (len(batch_shape) - i + 1)),
                ),
                [dim2 if i != j else 1 for j, dim2 in enumerate(batch_shape)]
                + [dist, 1],
            )
            for i, dim in enumerate(batch_shape)
        ]  # [(*N,D,1)] * |N|

    # Perform the projection.
    # Should be correct and efficient for batched dist RL projections.
    proj_index = _get_projection_index(td_target_support, dist)
    proj_lo = tf.math.floor(proj_index)
    proj_hi = tf.math.ceil(proj_index)

    # m_l <- m_l + p_j(x_{t+1},a^*)*(u-b_j)
    indices_lo = tf.expand_dims(tf.cast(proj_lo, tf.int32), axis=-1)
    if len(batch_shape) > 0:
        # pylint: disable-next=unexpected-keyword-arg, no-value-for-parameter
        indices_lo = tf.concat([*batch_indices, indices_lo], axis=-1)
    # Note: Also check for l=u=b_j which can produce an invalid distribution.
    updates_lo = tf.where(
        proj_lo == proj_hi,  # == proj_index (implied)
        target_next_q,
        target_next_q * (proj_hi - proj_index),
    )
    td_target = tf.scatter_nd(indices_lo, updates_lo, (*batch_shape, dist))

    # m_u <- m_u + p_j(x_{t+1},a^*)*(b_j-l)
    indices_hi = tf.expand_dims(tf.cast(proj_hi, tf.int32), axis=-1)
    if len(batch_shape) > 0:
        # pylint: disable-next=unexpected-keyword-arg, no-value-for-parameter
        indices_hi = tf.concat([*batch_indices, indices_hi], axis=-1)
    updates_hi = target_next_q * (proj_index - proj_lo)
    td_target = tf.tensor_scatter_nd_add(td_target, indices_hi, updates_hi)

    # pylint: enable=unexpected-keyword-arg, no-value-for-parameter

    return td_target  # (*N,D)


def _get_projection_index(td_target_support: tf.Tensor, dist: int):
    if dist <= 1:
        return tf.zeros_like(td_target_support, dtype=tf.int32)
    atom_diff = tf.constant(
        (MAX_REWARD - MIN_REWARD) / (dist - 1),
        dtype=td_target_support.dtype,
    )
    return (td_target_support - MIN_REWARD) / atom_diff
