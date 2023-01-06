import * as tf from "@tensorflow/tfjs";
import {LayerArgs} from "./LayerArgs";

class Mask extends tf.layers.Layer {
    public static className = "Mask";

    public override call(
        inputs: tf.Tensor | tf.Tensor[],
    ): tf.Tensor | tf.Tensor[] {
        if (!Array.isArray(inputs)) {
            throw new Error("Expected 2 input tensors but got 1");
        }
        if (inputs.length !== 2) {
            throw new Error(
                `Expected 2 input tensors but got ${inputs.length}`,
            );
        }
        const [input, inputMask] = inputs;
        return tf.mul(input, inputMask);
    }

    public override computeOutputShape(inputShape: tf.Shape[]): tf.Shape {
        return inputShape[0];
    }
}

tf.serialization.registerClass(Mask);

/**
 * Creates a custom layer that multiplies the input by a mask tensor,
 * broadcasting it as necessary.
 *
 * The input should be of shape `[batch, ...dims, channels]` and the mask
 * should be of shape `[batch, ...dims, 1]` containing 0s and 1s.
 */
export function mask(args?: LayerArgs) {
    return new Mask(args);
}
