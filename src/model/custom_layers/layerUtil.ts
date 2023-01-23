import * as tf from "@tensorflow/tfjs";

export type LayerArgs = NonNullable<
    ConstructorParameters<typeof tf.layers.Layer>[0]
>;

export type Kwargs = Parameters<typeof tf.layers.Layer.prototype.call>[1];

export type Initializer = ReturnType<typeof tf.initializers.ones>;
