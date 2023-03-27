import * as tf from "@tensorflow/tfjs";

/** Clones a TensorFlow model. */
export async function cloneModel(
    model: tf.LayersModel,
): Promise<tf.LayersModel> {
    return await deserializeModel(await serializeModel(model));
}

/** Serializes a TensorFlow model. */
export async function serializeModel(
    model: tf.LayersModel,
): Promise<tf.io.ModelArtifacts> {
    return await new Promise<tf.io.ModelArtifacts>(
        res =>
            void model.save({
                // eslint-disable-next-line @typescript-eslint/require-await
                save: async artifact => {
                    res(artifact);
                    return {} as tf.io.SaveResult;
                },
            }),
    );
}

/** Deserializes a TensorFlow model. */
export async function deserializeModel(
    artifact: tf.io.ModelArtifacts,
): Promise<tf.LayersModel> {
    return await tf.loadLayersModel({
        load: async () => await Promise.resolve(artifact),
    });
}
