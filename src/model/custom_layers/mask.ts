import * as tf from "@tensorflow/tfjs";
import {LayerArgs, Kwargs} from "./layerUtil";

class Mask extends tf.layers.Layer {
    public static className = "Mask";

    public override computeOutputShape(inputShape: tf.Shape[]): tf.Shape {
        return inputShape[0];
    }

    public override call(
        inputs: tf.Tensor | tf.Tensor[],
        kwargs: Kwargs,
    ): tf.Tensor | tf.Tensor[] {
        return tf.tidy(() => {
            this.invokeCallHook(inputs, kwargs);
            if (!Array.isArray(inputs)) {
                throw new Error("Expected 2 input tensors but got 1");
            }
            if (inputs.length !== 2) {
                throw new Error(
                    `Expected 2 input tensors but got ${inputs.length}`,
                );
            }
            const [input, inputMask] = inputs;
            return tf.mul(input, tf.expandDims(inputMask, -1));
        });
    }
}

tf.serialization.registerClass(Mask);

/**
 * Creates a custom layer that multiplies the input by a mask tensor,
 * broadcasting it as necessary.
 *
 * The input should be of shape `[batch, ...dims, channels]` and the mask
 * should be of shape `[batch, ...dims]` containing 0s and 1s.
 */
export function mask(args?: LayerArgs) {
    return new Mask(args);
}
