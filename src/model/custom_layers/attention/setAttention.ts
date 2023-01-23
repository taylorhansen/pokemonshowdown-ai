import * as tf from "@tensorflow/tfjs";
import {Kwargs, LayerArgs} from "../layerUtil";
import {attention} from "./attention";

type Initializer = ReturnType<typeof tf.initializers.ones>;

/** Args for {@link setAttention}. */
export interface SetAttentionArgs extends LayerArgs {
    /** Initializer for scale parameter. */
    scaleInitializer?: Initializer;
}

class SetAttention extends tf.layers.Layer {
    public static className = "SetAttention";

    private scale: tf.LayerVariable | null = null;
    private scaleInitializer?: Initializer;

    public constructor(args: SetAttentionArgs) {
        super(args);
        this.scaleInitializer = args.scaleInitializer;
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
        this.scale ??= this.addWeight(
            "scale",
            [],
            undefined,
            (this.scaleInitializer ??= tf.initializers.constant({
                value: 1 / Math.sqrt(inputFeatures),
            })),
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
        if (mask) {
            const numElements = set[set.length - 2];
            const maskSize = mask[mask.length - 1];
            if (numElements !== maskSize) {
                throw new Error(
                    `Mask size ${maskSize} does not match number of set ` +
                        `elements ${numElements}`,
                );
            }
        }

        return set;
    }

    public override call(
        inputs: tf.Tensor | tf.Tensor[],
        kwargs: Kwargs,
    ): tf.Tensor {
        return tf.tidy(() => {
            this.invokeCallHook(inputs, kwargs);
            if (Array.isArray(inputs)) {
                if (inputs.length > 2) {
                    throw new Error(
                        `Expected 1-2 input tensors but got ${inputs.length}`,
                    );
                }
            } else {
                inputs = [inputs];
            }
            const [set, mask] = inputs;
            return attention(
                set,
                set,
                set,
                this.scale!.read().asScalar(),
                mask,
                mask,
            );
        });
    }

    public override getConfig(): tf.serialization.ConfigDict {
        const config: tf.serialization.ConfigDict = {
            // Serialization method copied from source since it's not exported.
            ...(this.scaleInitializer && {
                scaleInitializer: {
                    className: this.scaleInitializer.getClassName?.(),
                    config: this.scaleInitializer.getConfig?.(),
                },
            }),
        };
        const baseConfig = super.getConfig();
        Object.assign(config, baseConfig);
        return config;
    }
}

tf.serialization.registerClass(SetAttention);

/**
 * Creates an attention layer for unordered input.
 *
 * Takes up to two inputs:
 * * `set`: Tensor of shape `[batch..., N, D]` containing the sets of elements.
 * * `mask`: Optional tensor of shape `[batch..., N]` indicating which elements
 *   should be processed (=1) or not (=0).
 *
 * Outputs a tensor of shape `[batch..., N, D]` containing the attention output
 * for each element in the input set.
 */
export function setAttention(args: SetAttentionArgs) {
    return new SetAttention(args);
}
