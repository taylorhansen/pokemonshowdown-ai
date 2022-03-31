import * as tf from "@tensorflow/tfjs";

/** Args for the {@link tf.layers.Layer} constructor. */
export type LayerArgs = NonNullable<
    ConstructorParameters<typeof tf.layers.Layer>[0]
>;
