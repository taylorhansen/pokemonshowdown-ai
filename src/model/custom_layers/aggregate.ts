import * as tf from "@tensorflow/tfjs";
import {Kwargs, LayerArgs} from "./layerUtil";

/** Args for {@link aggregate}. */
export interface AggregateArgs extends LayerArgs {
    /** Type of reduction operation. */
    type: "sum" | "mean" | "max";
    /** Axis or axes to reduce. Default all. */
    axis?: number | number[];
    /**
     * Whether to retain reduced dimensions by leaving them at size 1. Default
     * false.
     */
    keepDims?: boolean;
}

class Aggregate extends tf.layers.Layer {
    public static className = "Aggregate";

    private readonly type: "sum" | "mean" | "max";
    private readonly func: (
        x: tf.Tensor,
        axis?: number | number[],
        keepDims?: boolean,
    ) => tf.Tensor;
    private readonly axis?: number | number[];
    private readonly keepDims?: boolean;

    public constructor(args: AggregateArgs) {
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
        kwargs: Kwargs,
    ): tf.Tensor | tf.Tensor[] {
        return tf.tidy(() => {
            this.invokeCallHook(inputs, kwargs);
            if (Array.isArray(inputs)) {
                if (inputs.length !== 1) {
                    throw new Error(
                        `Expected 1 input tensor but got ${inputs.length}`,
                    );
                }
                [inputs] = inputs;
            }
            return this.func(inputs, this.axis, this.keepDims);
        });
    }

    public override computeOutputShape(
        inputShape: tf.Shape | tf.Shape[],
    ): tf.Shape {
        if (Array.isArray(inputShape[0])) {
            if (inputShape.length !== 1) {
                throw new Error(
                    `Expected 1 input tensor but got ${inputShape.length}`,
                );
            }
            [inputShape] = inputShape;
        }

        // Note: Utility function takes care of missing axis (defaults to all
        // axes) and negative axes.
        inputShape = [...inputShape] as tf.Shape;
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

tf.serialization.registerClass(Aggregate);

/**
 * Creates a custom layer that summarizes elements across dimensions of the
 * input tensor.
 */
export function aggregate(args: AggregateArgs) {
    return new Aggregate(args);
}

/**
 * Creates a custom layer that sums the elements across dimensions of the input
 * tensor.
 *
 * @see {@link tf.sum}
 */
export function sum(args: Omit<AggregateArgs, "type">) {
    return aggregate({...args, type: "sum"});
}

/**
 * Creates a custom layer that computes the mean of elements across dimensions
 * of the input tensor.
 *
 * @see {@link tf.mean}
 */
export function mean(args: Omit<AggregateArgs, "type">) {
    return aggregate({...args, type: "mean"});
}

/**
 * Creates a custom layer that computes the max of elements across dimensions of
 * the input tensor.
 *
 * @see {@link tf.max}
 */
export function max(args: Omit<AggregateArgs, "type">) {
    return aggregate({...args, type: "max"});
}
