import * as tf from "@tensorflow/tfjs";

/** Clones a TensorFlow model. */
export async function cloneModel(
    model: tf.LayersModel,
): Promise<tf.LayersModel> {
    const modelArtifact = new Promise<tf.io.ModelArtifacts>(
        res =>
            void model.save({
                // eslint-disable-next-line @typescript-eslint/require-await
                save: async _modelArtifact => {
                    res(_modelArtifact);
                    return {} as tf.io.SaveResult;
                },
            }),
    );
    return await tf.loadLayersModel({
        load: async () => await Promise.resolve(modelArtifact),
    });
}
