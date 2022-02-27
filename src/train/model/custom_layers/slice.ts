import * as tf from "@tensorflow/tfjs";

type LayerArgs = NonNullable<ConstructorParameters<typeof tf.layers.Layer>[0]>;

/** Args for {@link slice}. */
export interface SliceArgs extends LayerArgs {
    /**
     * Coordinates to start the slice from, excluding batch. Unspecified axes
     * use 0 implicitly and a single number specifies the first axis.
     */
    begin: number | number[];
    /**
     * Size of the slice, in each dimension excluding batch. Unspecified axes
     * implicitly use -1 (i.e., the rest of the axis) and a single number
     * specifies the size of the first axis.
     */
    size?: number | number[];
}

class Slice extends tf.layers.Layer {
    public static className = "Slice";

    private readonly begin: number[];
    private readonly size: number[];

    public constructor(args: SliceArgs) {
        super(args);
        this.begin = Array.isArray(args.begin) ? args.begin : [args.begin];
        this.size = Array.isArray(args.size)
            ? args.size
            : args.size !== undefined
            ? [args.size]
            : [];
    }

    public override call(inputs: tf.Tensor | tf.Tensor[]): tf.Tensor {
        if (Array.isArray(inputs)) {
            if (inputs.length !== 1) {
                throw new Error(
                    `Expected 1 input tensor but got ${inputs.length}`,
                );
            }
            [inputs] = inputs;
        }
        return tf.slice(inputs, [0, ...this.begin], [-1, ...this.size]);
    }

    public override computeOutputShape(inputShape: tf.Shape): tf.Shape {
        if (inputShape[0] !== null) {
            throw new Error("Expected batch dimension to be on first axis");
        }
        const size: tf.Shape = [null];
        for (let axis = 1; axis < inputShape.length; ++axis) {
            if (inputShape[axis] === null) {
                throw new Error(
                    `Expected non-null input shape for axis ${axis} but got ` +
                        JSON.stringify(inputShape),
                );
            }
            size[axis] =
                this.size[axis - 1] ??
                inputShape[axis]! - (this.begin[axis - 1] ?? 0);
        }
        return size;
    }

    public override getConfig(): tf.serialization.ConfigDict {
        const config = super.getConfig();
        Object.assign(config, {begin: this.begin, size: this.size});
        return config;
    }
}

tf.serialization.registerClass(Slice);

/**
 * Creates a custom layer that extracts a tensor slice from the input tensor.
 *
 * @see {@link tf.slice}
 */
export function slice(args: SliceArgs): Slice {
    return new Slice(args);
}
