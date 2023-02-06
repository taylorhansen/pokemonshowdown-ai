import * as tf from "@tensorflow/tfjs";
import {Initializer, Kwargs, LayerArgs} from "../layerUtil";
import {attention} from "./attention";

/** Args for {@link setAttention}. */
export interface SetAttentionArgs extends LayerArgs {
    /** Number of attention heads. */
    heads: number;
    /** Dimensionality of the inner attention space for each head. */
    headUnits: number;
    /** Dimensionality of the output space for each set element. */
    units: number;
    /** Aggregation method used to combine attention heads. Default concat. */
    headAggregate?: "concat" | "mean";
    /** Initializer for kernel weights matrix. */
    kernelInitializer?: Initializer;
}

class SetAttention extends tf.layers.Layer {
    public static className = "SetAttention";

    private readonly heads: number;
    private readonly headUnits: number;
    private readonly units: number;
    private readonly headAggregate: "concat" | "mean";
    private queryWeights: tf.LayerVariable | null = null;
    private keyWeights: tf.LayerVariable | null = null;
    private valueWeights: tf.LayerVariable | null = null;
    private outWeights: tf.LayerVariable | null = null;

    private readonly kernelInitializer: Initializer;

    public constructor(args: SetAttentionArgs) {
        super(args);
        this.heads = args.heads;
        this.headUnits = args.headUnits;
        this.units = args.units;
        this.headAggregate = args.headAggregate ?? "concat";
        this.kernelInitializer =
            args.kernelInitializer ?? tf.initializers.glorotUniform({});
    }

    public override build(inputShape: tf.Shape | tf.Shape[]): void {
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

        const inputFeatures = set[set.length - 1]!;
        const totalAttentionUnits = this.heads * this.headUnits;
        this.queryWeights ??= this.addWeight(
            "query",
            [inputFeatures, totalAttentionUnits],
            undefined /*dtype*/,
            this.kernelInitializer,
            undefined /*regularizer*/,
            true /*trainable*/,
        );
        this.keyWeights ??= this.addWeight(
            "key",
            [inputFeatures, totalAttentionUnits],
            undefined /*dtype*/,
            this.kernelInitializer,
            undefined /*regularizer*/,
            true /*trainable*/,
        );
        this.valueWeights ??= this.addWeight(
            "value",
            [inputFeatures, totalAttentionUnits],
            undefined /*dtype*/,
            this.kernelInitializer,
            undefined /*regularizer*/,
            true /*trainable*/,
        );
        this.outWeights ??= this.addWeight(
            "out",
            [
                this.headAggregate === "concat"
                    ? totalAttentionUnits
                    : this.headUnits,
                this.units,
            ],
            undefined /*dtype*/,
            this.kernelInitializer,
            undefined /*regularizer*/,
            true /*trainable*/,
        );

        // eslint-disable-next-line @typescript-eslint/naming-convention
        this.inputSpec = [{minNDim: 2, axes: {[-1]: inputFeatures}}];
        if (mask) {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            this.inputSpec.push({minNDim: 1});
        }
        this.built = true;
    }

    public override computeOutputShape(
        inputShape: tf.Shape | tf.Shape[],
    ): tf.Shape {
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
                    `Mask size ${maskSize} does not match number of set ` +
                        `elements ${numElements}`,
                );
            }
        }

        return [...set.slice(0, -1), this.units];
    }

    public override call(
        inputs: tf.Tensor | tf.Tensor[],
        kwargs: Kwargs,
    ): tf.Tensor {
        return tf.tidy(() => {
            this.invokeCallHook(inputs, kwargs);
            if (Array.isArray(inputs)) {
                if (inputs.length > 2) {
                    throw new Error(
                        `Expected 1-2 input tensors but got ${inputs.length}`,
                    );
                }
            } else {
                inputs = [inputs];
            }
            const [set] = inputs;
            let [, mask] = inputs;
            const batchShape = set.shape.slice(0, -2);
            const [numElements, inputFeatures] = set.shape.slice(-2);

            const splitShape = [
                ...batchShape,
                numElements,
                this.heads,
                this.headUnits,
            ];
            const perm = splitShape.map((_, i) => i);
            [perm[perm.length - 3], perm[perm.length - 2]] = [
                perm[perm.length - 2],
                perm[perm.length - 3],
            ];
            const [queries, keys, values] = [
                this.queryWeights!,
                this.keyWeights!,
                this.valueWeights!,
            ].map(w => {
                // Calculate per-head Q/K/V all at once, shape [..., N, h*Dh].
                let qkv = dot(set, w.read());
                // Split into the separate heads, shape [..., N, h, Dh].
                qkv = tf.reshape(qkv, splitShape);
                // Transpose for attention dot product, shape [..., h, N, Dh].
                qkv = tf.transpose(qkv, perm);
                return qkv;
            });

            // Expand mask for broadcasting onto each head, shape [..., 1, N].
            mask &&= tf.expandDims(mask, -2);

            // Apply attention model to each head, shape [..., h, N, Dh].
            let attn = attention(
                queries,
                keys,
                values,
                1 / Math.sqrt(inputFeatures),
                mask,
                mask,
            );

            // Transpose to swap back head dimension, shape [..., N, h, Dh].
            attn = tf.transpose(attn, perm);
            if (this.headAggregate === "concat") {
                // Concatenate per-head attention outputs, shape [..., N, h*Dh].
                attn = tf.reshape(attn, [
                    ...batchShape,
                    numElements,
                    this.heads * this.headUnits,
                ]);
            } else {
                // Average per-head attention outputs, shape [..., N, Dh].
                attn = tf.mean(attn, -2);
            }
            // Calculate final output, shape [..., N, U].
            return dot(attn, this.outWeights!.read());
        });
    }

    public override getConfig(): tf.serialization.ConfigDict {
        const config: tf.serialization.ConfigDict = {
            heads: this.heads,
            headUnits: this.headUnits,
            units: this.units,
            headAggregate: this.headAggregate,
            // Serialization method copied from source since it's not exported.
            ...(this.kernelInitializer && {
                kernelInitializer: {
                    className: this.kernelInitializer.getClassName?.(),
                    config: this.kernelInitializer.getConfig?.(),
                },
            }),
        };
        const baseConfig = super.getConfig();
        Object.assign(config, baseConfig);
        return config;
    }
}

tf.serialization.registerClass(SetAttention);

/**
 * Creates a multi-head attention layer for unordered input.
 *
 * Takes up to two inputs:
 * * `set`: Tensor of shape `[batch..., N, D]` containing the sets of elements,
 *   where `N` is the (max) number of elements and `D` is the size of the
 *   feature embedding for each element.
 * * `mask`: Optional tensor of shape `[batch..., N]` indicating which elements
 *   should be processed (=1) or not (=0).
 *
 * Outputs a tensor of shape `[batch..., N, U]` where `U` is the configured
 * {@link SetAttentionArgs.units units} argument, containing the aggregated
 * multi-head attention output for each element in the input set.
 */
export function setAttention(args: SetAttentionArgs) {
    return new SetAttention(args);
}

/**
 * Tensor dot product. Unlike {@link tf.dot}, supports arbitrary-rank tensors.
 *
 * Derived from {@link tf.layers.dense} source code.
 */
function dot(a: tf.Tensor, b: tf.Tensor): tf.Tensor {
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
