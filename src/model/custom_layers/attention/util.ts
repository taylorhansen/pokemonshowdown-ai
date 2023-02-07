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

/**
 * Extracts the shape of the input set and optional mask after performing
 * assertions.
 */
export function extractSetAndMaskShapes(inputShape: tf.Shape | tf.Shape[]): {
    set: tf.Shape;
    mask?: tf.Shape;
} {
    if (Array.isArray(inputShape[0])) {
        if (inputShape.length > 2) {
            throw new Error(
                `Expected 1-2 input tensors but got ${inputShape.length}`,
            );
        }
        inputShape = inputShape as tf.Shape[];
    } else {
        inputShape = [inputShape as tf.Shape];
    }

    const [set, mask] = inputShape;
    if (mask) {
        const numElements = set[set.length - 2];
        const maskSize = mask[mask.length - 1];
        if (numElements !== maskSize) {
            throw new Error(
                `Mask size ${maskSize} does not match number of set elements ` +
                    `${numElements}`,
            );
        }
    }
    return {set, mask};
}

/** Extracts input set and optional mask tensors after performing assertions. */
export function extractSetAndMaskInputs(inputs: tf.Tensor | tf.Tensor[]): {
    set: tf.Tensor;
    mask?: tf.Tensor;
} {
    if (Array.isArray(inputs)) {
        if (inputs.length > 2) {
            throw new Error(
                `Expected 1-2 input tensors but got ${inputs.length}`,
            );
        }
    } else {
        inputs = [inputs];
    }
    const [set, mask] = inputs;
    return {set, mask};
}

/**
 * Projects input into heads for multi-head attention.
 *
 * @param input Input features, shape `[..., N, D]`.
 * @param weights Projection matrix, shape `[D, h*Dh]`.
 * @param heads Number of heads.
 * @param headUnits Size of each head.
 * @returns Projected attention heads, shape `[..., h, N, Dh]`.
 */
export function projectHeads(
    input: tf.Tensor,
    weights: tf.Tensor,
    heads: number,
    headUnits: number,
): tf.Tensor {
    return tf.tidy(() => {
        const batchShape = input.shape.slice(0, -2);
        const [numElements] = input.shape.slice(-2);
        // Projection: [..., N, h*Dh].
        let projected = dot(input, weights);
        // Split: [..., N, h, Dh].
        const splitShape = [...batchShape, numElements, heads, headUnits];
        projected = tf.reshape(projected, splitShape);
        // Rearranged: [..., h, N, Dh].
        // Perm = [0, 1, 2, ..., n, n+2, n+1].
        const perm = splitShape.map((_, i) => i);
        [perm[perm.length - 3], perm[perm.length - 2]] = [
            perm[perm.length - 2],
            perm[perm.length - 3],
        ];
        projected = tf.transpose(projected, perm);
        return projected;
    });
}

/**
 * Combines multi-head attention heads into a single head. Reverse op of
 * {@link projectHead}.
 *
 * @param input Input heads, shape `[..., h, N, Dh]`.
 * @param aggregate Whether to combine heads via concat or mean.
 * @returns Combined attention heads, shape `[..., N, h*Dh or Dh]`.
 */
export function combineHeads(
    input: tf.Tensor,
    aggregate: "concat" | "mean",
): tf.Tensor {
    return tf.tidy(() => {
        const batchShape = input.shape.slice(0, -3);
        const [heads, numElements, headUnits] = input.shape.slice(-3);

        // Rearranged: [..., N, h, Dh].
        // Perm = [0, 1, 2, ..., n, n+2, n+1, n+3].
        const perm = input.shape.map((_, i) => i);
        [perm[perm.length - 3], perm[perm.length - 2]] = [
            perm[perm.length - 2],
            perm[perm.length - 3],
        ];
        input = tf.transpose(input, perm);

        if (aggregate === "concat") {
            // Concatenate attention heads: [..., N, h*Dh].
            input = tf.reshape(input, [
                ...batchShape,
                numElements,
                heads * headUnits,
            ]);
        } else {
            // Average pool attention heads: [..., N, Dh].
            input = tf.mean(input, -2);
        }
        return input;
    });
}

/**
 * Tensor dot product. Unlike {@link tf.dot}, supports arbitrary-rank tensors.
 *
 * Derived from {@link tf.layers.dense} source code.
 */
export function dot(a: tf.Tensor, b: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
        // Reshape a into the analogous 2D Tensor.
        const aFirstDims = a.shape.slice(); // Holds all but the last dim of a.
        const aLastDim = aFirstDims.pop()!;
        a = tf.reshape(a, [-1, aLastDim]);
        // Reshape b into the analogous 2D Tensor, and keep track of the
        // required dimensions to reproduce the output shape.
        const bShape = b.shape.slice();
        const bLastDim = bShape.pop()!;
        const bSecondLastDim = bShape.pop()!;
        const bOtherDims = [...bShape, bLastDim];
        // Permutation should be like [r-2, 0, 1, 2, ... r-4, r-3, r-1] where r
        // is the rank of b.
        const perm = Array.from({length: b.rank}, (_, i) => {
            if (i === 0) {
                return b.rank - 2;
            }
            if (i <= b.rank - 2) {
                return i - 1;
            }
            return i;
        });
        b = tf.reshape(tf.transpose(b, perm), [bSecondLastDim, -1]);
        // Multiply a and b as 2D Tensors, and then reshape back to original.
        const outputShape = [...aFirstDims, ...bOtherDims];
        return tf.reshape(tf.matMul(a, b), outputShape);
    });
}
