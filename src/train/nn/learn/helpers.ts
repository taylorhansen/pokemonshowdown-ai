import * as tf from "@tensorflow/tfjs";

/** Does a Fisher-Yates shuffle on the given array. */
export function shuffle<T>(arr: T[]): void
{
    for (let i = arr.length - 1; i > 0; --i)
    {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

/**
 * Calculates the KL divergence of two discrete probability distributions.
 * @param p Probabilities of the first distribution.
 * @param q Probabilities of the second distribution. Must be the same shape
 * as `p`.
 * @returns The KL divergence between the two distributions, as a Tensor 1 rank
 * lower than the given ones.
 */
export function klDivergence(p: tf.Tensor, q: tf.Tensor): tf.Tensor
{
    return tf.tidy(() => tf.sum(tf.mul(p, tf.log(tf.div(p, q))), -1));
}
