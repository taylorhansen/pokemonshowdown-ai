import * as tf from "@tensorflow/tfjs";
import {LayerArgs} from "./LayerArgs";

/** Args for {@link reduce}. */
export interface ReduceArgs extends LayerArgs {
    /** Type of reduction operation. */
    type: "mean" | "max";
    /** Axis or axes to reduce. Default all. */
    axis?: number | number[];
    /**
     * Whether to retain reduced dimensions by leaving them at size 1. Default
     * false.
     */
    keepDims?: boolean;
}

class Reduce extends tf.layers.Layer {
    public static className = "Reduce";

    private readonly type: "mean" | "max";
    private readonly func: (
        x: tf.Tensor,
        axis?: number | number[],
        keepDims?: boolean,
    ) => tf.Tensor;
    private readonly axis?: number | number[];
    private readonly keepDims?: boolean;

    public constructor(args: ReduceArgs) {
        super(args);
        this.type = args.type;
        this.func = tf[args.type];
        if (args.axis !== undefined) {
            this.axis = args.axis;
        }
        if (args.keepDims) {
            this.keepDims = args.keepDims;
        }
    }

    public override call(
        inputs: tf.Tensor | tf.Tensor[],
    ): tf.Tensor | tf.Tensor[] {
        if (Array.isArray(inputs)) {
            if (inputs.length !== 1) {
                throw new Error(
                    `Expected 1 input tensor but got ${inputs.length}`,
                );
            }
            [inputs] = inputs;
        }
        return this.func(inputs, this.axis, this.keepDims);
    }

    public override computeOutputShape(inputShape: tf.Shape): tf.Shape {
        // Note: Utility function takes care of missing axis (defaults to all
        // axes) and negative axes.
        inputShape = [...inputShape];
        const axis = tf.util.parseAxisParam(this.axis!, inputShape as number[]);
        for (let i = inputShape.length - 1; i > 0; --i) {
            if (!axis.includes(i)) {
                continue;
            }
            if (this.keepDims) {
                inputShape[i] = 1;
            } else {
                inputShape.splice(i, 1);
            }
        }
        return inputShape;
    }

    public override getConfig(): tf.serialization.ConfigDict {
        const config = super.getConfig();
        Object.assign(config, {
            type: this.type,
            ...(this.axis !== undefined && {axis: this.axis}),
            ...(this.keepDims && {keepDims: true}),
        });
        return config;
    }
}

tf.serialization.registerClass(Reduce);

/**
 * Creates a custom layer that summarizes elements across dimensions of the
 * input tensor.
 */
export function reduce(args: ReduceArgs) {
    return new Reduce(args);
}

/**
 * Creates a custom layer that computes the mean of elements across dimensions
 * of the input tensor.
 *
 * @see {@link tf.mean}
 */
export function mean(args: Omit<ReduceArgs, "type">) {
    return new Reduce({...args, type: "mean"});
}

/**
 * Creates a custom layer that computes the max of elements across dimensions of
 * the input tensor.
 *
 * @see {@link tf.max}
 */
export function max(args: Omit<ReduceArgs, "type">) {
    return new Reduce({...args, type: "max"});
}
