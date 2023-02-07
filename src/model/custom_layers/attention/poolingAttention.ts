import * as tf from "@tensorflow/tfjs";
import {Initializer, Kwargs, LayerArgs} from "../layerUtil";
import {
    attention,
    combineHeads,
    dot,
    extractSetAndMaskInputs,
    extractSetAndMaskShapes,
    projectHeads,
} from "./util";

/** Args for {@link poolingAttention}. */
export interface PoolingAttentionArgs extends LayerArgs {
    /** Number of seed vectors. */
    seeds: number;
    /** Number of attention heads. */
    heads: number;
    /** Dimensionality of the inner attention space for each head. */
    headUnits: number;
    /** Dimensionality of the output space for each set element. */
    units: number;
    /** Aggregation method used to combine attention heads. Default concat. */
    headAggregate?: "concat" | "mean";
    /** Whether to collapse the seed dimension. */
    collapseSeedDim?: boolean;
    /** Initializer for kernel weights matrix. */
    kernelInitializer?: Initializer;
}

class PoolingAttention extends tf.layers.Layer {
    public static className = "PoolingAttention";

    private readonly seeds: number;
    private readonly heads: number;
    private readonly headUnits: number;
    private readonly units: number;
    private readonly headAggregate: "concat" | "mean";
    private readonly collapseSeedDim: boolean;
    private seedWeights: tf.LayerVariable | null = null;
    private keyWeights: tf.LayerVariable | null = null;
    private valueWeights: tf.LayerVariable | null = null;
    private outWeights: tf.LayerVariable | null = null;

    private readonly kernelInitializer: Initializer;

    public constructor(args: PoolingAttentionArgs) {
        super(args);
        this.seeds = args.seeds;
        this.heads = args.heads;
        this.headUnits = args.headUnits;
        this.units = args.units;
        this.headAggregate = args.headAggregate ?? "concat";
        this.collapseSeedDim = args.collapseSeedDim ?? false;
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
        this.seedWeights ??= this.addWeight(
            "seed",
            // Pre-projected seed vectors, suitable for directly applying to
            // attention model.
            [this.heads, this.seeds, this.headUnits],
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
        const {set} = extractSetAndMaskShapes(inputShape);
        const preShape = set.slice(0, -2);
        if (this.collapseSeedDim) {
            return [...preShape, this.seeds * this.units];
        }
        return [...preShape, this.seeds, this.units];
    }

    public override call(
        inputs: tf.Tensor | tf.Tensor[],
        kwargs: Kwargs,
    ): tf.Tensor {
        return tf.tidy(() => {
            this.invokeCallHook(inputs, kwargs);
            const extract = extractSetAndMaskInputs(inputs);
            let {set, mask} = extract;
            const batchShape = set.shape.slice(0, -2);
            const [numElements, inputFeatures] = set.shape.slice(-2);

            // Note that TFJS doesn't support gradients for 5D tensor broadcasts
            // yet so we have to collapse the batch dimension first.
            const flatBatch = batchShape.reduce((a, b) => a * b, 1);
            set = tf.reshape(set, [flatBatch, numElements, inputFeatures]);
            mask &&= tf.reshape(mask, [flatBatch, 1, numElements]);

            // Broadcast seed vector onto query batch: [B, h, Ns, Dh].
            let queries = this.seedWeights!.read();
            queries = tf.broadcastTo(queries, [flatBatch, ...queries.shape]);
            // Project K/V into heads all at once: [B, h, N, Dh].
            const [keys, values] = [this.keyWeights!, this.valueWeights!].map(
                w => projectHeads(set, w.read(), this.heads, this.headUnits),
            );

            // Apply attention model to each head: [B, h, Ns, Dh].
            let attn = attention(
                queries,
                keys,
                values,
                1 / Math.sqrt(inputFeatures) /*scale*/,
                undefined /*queryMask*/,
                mask,
            );

            // Combine attention heads: [B, Ns, h*Dh or Dh].
            attn = combineHeads(attn, this.headAggregate);

            // Calculate final output: [B, Ns, U].
            let out = dot(attn, this.outWeights!.read());
            if (this.collapseSeedDim) {
                // Combine seed vectors and un-flatten batch: [B..., Ns*U].
                out = tf.reshape(out, [...batchShape, this.seeds * this.units]);
            } else {
                // Un-flatten batch dimension: [B..., Ns, U].
                out = tf.reshape(out, [...batchShape, this.seeds, this.units]);
            }
            return out;
        });
    }

    public override getConfig(): tf.serialization.ConfigDict {
        const config: tf.serialization.ConfigDict = {
            seeds: this.seeds,
            heads: this.heads,
            headUnits: this.headUnits,
            units: this.units,
            headAggregate: this.headAggregate,
            collapseSeedDim: this.collapseSeedDim,
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

tf.serialization.registerClass(PoolingAttention);

/**
 * Creates a multi-head attention layer for pooling unordered input. Essentially
 * the same as setAttention but with the query vector replaced with a trainable
 * weight vector.
 *
 * Takes up to two inputs:
 * * `set`: Tensor of shape `[batch..., N, D]` containing the sets of elements,
 *   where `N` is the (max) number of elements and `D` is the size of the
 *   feature embedding for each element.
 * * `mask`: Optional tensor of shape `[batch..., N]` indicating which elements
 *   should be processed (=1) or not (=0).
 *
 * Outputs a tensor of shape `[batch..., Ns, U]` where `Ns` is the configured
 * number of {@link PoolingAttentionArgs.seeds seed} vectors and `U` is the
 * {@link PoolingAttentionArgs.units units} argument, containing the aggregated
 * multi-head attention output for each seed vector. If
 * {@link PoolingAttentionArgs.collapseSeedDim collapseSeedDim} is true, then
 * the output shape is `[batch..., Ns*U]`.
 */
export function poolingAttention(args: PoolingAttentionArgs) {
    return new PoolingAttention(args);
}
