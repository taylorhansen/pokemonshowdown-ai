import * as tf from "@tensorflow/tfjs-node";

/** Config for LayerMax layers. */
export interface LayerMaxArgs
{
    inputShape?: tf.Shape;
    batchInputShape?: tf.Shape;
    batchSize?: number;
    dtype?: tf.DataType;
    name?: string;
}

/**
 * Custom layer that finds the maximum element of its input tensor. Inputs a
 * single tensor and outputs a scalar.
 */
export function layerMax(config: LayerMaxArgs) { return new LayerMax(config); }

class LayerMax extends tf.layers.Layer
{
    public static readonly className = "LayerMax";

    constructor(config: LayerMaxArgs) { super(config); }

    /** @override */
    public computeOutputShape(inputShape: tf.Shape | tf.Shape[]):
        tf.Shape | tf.Shape[]
    {
        if (inputShape.length > 0)
        {
            if (Array.isArray(inputShape[0]))
            {
                // dealing with an array of shapes
                return (inputShape as tf.Shape[])
                    .map(s => this.computeOutputShape(s) as tf.Shape);
            }
            // outputs a scalar instead of the last axis' tensor
            const shape = inputShape as tf.Shape;
            return [...shape.slice(0, shape.length - 1), 1];
        }
        // can't handle empty shape
        return super.computeOutputShape(inputShape);
    }

    /** @override */
    public call(inputs: tf.Tensor | tf.Tensor[]): tf.Tensor | tf.Tensor[]
    {
        return tf.tidy(() =>
        {
            let input = inputs;
            // can only take 1 tensor input
            if (Array.isArray(input)) input = input[0];
            return tf.max(input, input.shape.length - 1, /*keepDims*/true);
        });
    }
}

// required for serialization
tf.serialization.registerClass(LayerMax);
