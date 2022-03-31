import * as tf from "@tensorflow/tfjs";
import {LayerArgs} from "./LayerArgs";

/** Args for {@link mean}. */
export interface MeanArgs extends LayerArgs {
    /** Axis or axes to reduce. Default all. */
    axis?: number | number[];
    /**
     * Whether to retain reduced dimensions by leaving them at size 1. Default
     * false.
     */
    keepDims?: boolean;
}

class Mean extends tf.layers.Layer {
    public static className = "Mean";

    private readonly axis?: number | number[];
    private readonly keepDims?: boolean;

    public constructor(args: MeanArgs) {
        super(args);
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
        return tf.mean(inputs, this.axis, this.keepDims);
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
            ...(this.axis !== undefined && {axis: this.axis}),
            ...(this.keepDims && {keepDims: true}),
        });
        return config;
    }
}

tf.serialization.registerClass(Mean);

/**
 * Creates a custom layer that computes the mean of elements across dimensions
 * of the input tensor.
 *
 * @see {@link tf.mean}
 */
export function mean(args: MeanArgs) {
    return new Mean(args);
}
