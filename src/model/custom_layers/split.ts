import * as tf from "@tensorflow/tfjs";
import {LayerArgs, Kwargs} from "./layerUtil";

/** Args for {@link split}. */
export interface SplitArgs extends LayerArgs {
    /**
     * Number of splits along the {@link axis}, or array of output sizes along
     * {@link axis}.
     */
    numOrSizeSplits: number | number[];
    /**
     * Dimension along which to split, excluding batch dimension. Default 0
     * (first dim).
     */
    axis?: number;
}

class Split extends tf.layers.Layer {
    public static className = "Split";

    private readonly numOrSizeSplits: number | number[];
    private readonly axis: number;

    public constructor(args: SplitArgs) {
        super(args);
        this.numOrSizeSplits = args.numOrSizeSplits;
        this.axis = args.axis ?? 0;
    }

    public override computeOutputShape(
        inputShape: tf.Shape | tf.Shape[],
    ): tf.Shape[] {
        if (Array.isArray(inputShape[0])) {
            if (inputShape.length !== 1) {
                throw new Error(
                    `Expected 1 input tensor but got ${inputShape.length}`,
                );
            }
            [inputShape] = inputShape;
        }
        inputShape = inputShape as tf.Shape;

        if (inputShape[0] !== null) {
            throw new Error("Expected batch dimension to be on first axis");
        }
        for (let axis = 1; axis < inputShape.length; ++axis) {
            if (inputShape[axis] === null) {
                throw new Error(
                    `Expected non-null input shape for axis ${axis} but got ` +
                        JSON.stringify(inputShape),
                );
            }
        }

        const splitSizes = tf.backend_util.prepareSplitSize(
            {
                shape: inputShape.slice(1) as number[],
                dataId: {},
                dtype: "float32",
            },
            this.numOrSizeSplits,
            this.axis,
        );
        return splitSizes.map(size => {
            const shape = [...(inputShape as tf.Shape)];
            shape[this.axis + 1] = size;
            return shape;
        });
    }

    public override call(
        inputs: tf.Tensor | tf.Tensor[],
        kwargs: Kwargs,
    ): tf.Tensor[] {
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
            // Note axis+1 to account for batch dimension.
            return tf.split(inputs, this.numOrSizeSplits, this.axis + 1);
        });
    }

    public override getConfig(): tf.serialization.ConfigDict {
        const config = super.getConfig();
        Object.assign(config, {
            numOrSizeSplits: this.numOrSizeSplits,
            axis: this.axis,
        });
        return config;
    }
}

tf.serialization.registerClass(Split);

/**
 * Creates a custom layer that splits an input tensor into sub-tensors.
 *
 * @see {@link tf.split}
 */
export function split(args: SplitArgs): Split {
    return new Split(args);
}
