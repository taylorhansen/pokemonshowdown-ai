import * as tf from "@tensorflow/tfjs";

/**
 * Standard scaled dot-product attention mechanism. Adapted from original paper.
 *
 * @param queries Query vector. Shape `[..., Nq, Dk]`.
 * @param keys Key vector which queries are matched to. Shape `[..., Nk, Dk]`.
 * @param values Corresponding values for keys. Shape `[..., Nk, Dv]`.
 * @param scale Scale parameter for query-key scores before softmax. Ideally
 * this should be set to the reciprocal of the standard deviation of the dot
 * product of queries and values, which if both are independent standard normal
 * random variables is `1/sqrt(Dk)`.
 * @param queryMask Queries which should (=1) or should not (=0) be processed.
 * Shape `[..., Nq]`.
 * @param valueMask Values which should (=1) or should not (=0) be processed.
 * Shape `[..., Nk]`.
 * @returns Attention output `softmax(Q*K^T/temp)*V`, shape `[..., Nk, Dv]`.
 * @see https://arxiv.org/abs/1706.03762v5
 */
export function attention(
    queries: tf.Tensor,
    keys: tf.Tensor,
    values: tf.Tensor,
    scale?: tf.Scalar | number,
    queryMask?: tf.Tensor,
    valueMask?: tf.Tensor,
): tf.Tensor {
    return tf.tidy(() => {
        // Dot product scores, shape [..., Nq, Nk].
        // Note: TF matmul ops support batching.
        let scores = tf.matMul(
            queries,
            keys,
            false /*transposeA*/,
            true /*transposeB*/,
        );
        if (scale) {
            scores = tf.mul(scores, scale);
        }
        if (valueMask) {
            // Very small value forces corresponding softmax to be zero.
            scores = tf.add(
                scores,
                tf.mul(tf.sub(1, tf.expandDims(valueMask, -2)), -1e9),
            );
        }

        // Query-key weight distribution, shape [..., Nq, Nk].
        const weights = tf.softmax(scores);

        // Apply weights onto values, shape [..., Nq, Dv].
        let result = tf.matMul(weights, values);
        if (queryMask) {
            result = tf.mul(result, tf.expandDims(queryMask, -1));
        }
        return result;
    });
}
