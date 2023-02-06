import * as tf from "@tensorflow/tfjs";
import {LayerArgs, Kwargs} from "./layerUtil";

class Sub extends tf.layers.Layer {
    public static className = "Sub";

    public constructor(args: LayerArgs) {
        super(args);
    }

    public override computeOutputShape(inputShape: tf.Shape[]): tf.Shape {
        let [a, b] = inputShape;

        let batchDim = false;
        if (a[0] === null) {
            batchDim = true;
            a = a.slice(1);
        }
        if (b[0] === null) {
            batchDim = true;
            b = b.slice(1);
        }

        const shape: tf.Shape = tf.backend_util.assertAndGetBroadcastShape(
            a as number[],
            b as number[],
        );
        if (batchDim) {
            shape.unshift(null);
        }
        return shape;
    }

    public override call(
        inputs: tf.Tensor | tf.Tensor[],
        kwargs: Kwargs,
    ): tf.Tensor | tf.Tensor[] {
        return tf.tidy(() => {
            this.invokeCallHook(inputs, kwargs);
            if (Array.isArray(inputs)) {
                if (inputs.length !== 2) {
                    throw new Error(
                        `Expected 2 input tensors but got ${inputs.length}`,
                    );
                }
            } else {
                throw new Error("Expected 2 input tensors but got 1");
            }
            return tf.sub(inputs[0], inputs[1]);
        });
    }
}

tf.serialization.registerClass(Sub);

/**
 * Creates a custom layer that subtracts two layers elementwise. Supports
 * broadcasting and single batch dimension.
 *
 * @see {@link tf.sub}
 */
export function sub(args: LayerArgs) {
    return new Sub(args);
}
