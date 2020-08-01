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
 * @param logProbs1 Log-probabilities of the first distribution.
 * @param logProbs2 Log-probabilities of the second distribution. Must be the
 * same shape as `logProbs1`.
 */
export function klDivergence(logProbs1: tf.Tensor, logProbs2: tf.Tensor):
    tf.Tensor
{
    return tf.tidy(() =>
        tf.exp(logProbs1).mul(tf.sub(logProbs1, logProbs2)).sum(-1));
}
