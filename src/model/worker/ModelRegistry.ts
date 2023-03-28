import {MessagePort} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {BatchPredictConfig} from "../../config/types";
import {intToChoice} from "../../psbot/handlers/battle/agent";
import {createSupport, ModelMetadata, verifyModel} from "../model";
import {flattenedInputShapes, modelInputShapes} from "../shapes";
import {BatchPredict} from "./BatchPredict";

/** Manages a neural network registry. */
export class ModelRegistry {
    /** Neural network object. */
    public get model(): tf.LayersModel {
        if (!this._model) {
            throw new Error(`Model '${this.name}' not loaded`);
        }
        return this._model;
    }
    /** Whether the model has been loaded. */
    public get isLoaded(): boolean {
        return !!this._model;
    }
    private _model?: tf.LayersModel;

    /** Batch predict profiles attached to this model. */
    private readonly profiles = new Map<string, BatchPredict>();

    /**
     * Support of the Q value distribution. Used for distributional RL if
     * configured.
     */
    private support?: tf.Tensor;

    /** Resolves when not spending time in {@link predictOnBatch}. */
    private busy: Promise<void> | null = null;

    /**
     * Creates a ModelRegistry.
     *
     * @param name Name of the model.
     */
    public constructor(public readonly name: string) {}

    /** Sets or replaces the model. */
    public async load(model: tf.LayersModel): Promise<void> {
        verifyModel(model);

        while (this.busy) {
            await this.busy;
        }
        this._model?.dispose();
        this._model = model;

        this.support?.dispose();
        const metadata = model.getUserDefinedMetadata() as
            | ModelMetadata
            | undefined;
        if (metadata?.config?.dist) {
            this.support = tf.tidy(() =>
                createSupport(metadata.config!.dist!).reshape([
                    1,
                    1,
                    metadata.config!.dist!,
                ]),
            );
        } else {
            this.support = undefined;
        }
    }

    /**
     * Safely closes ports and disposes the model once all pending predict
     * requests have resolved.
     */
    public async unload(disposeModel = true): Promise<void> {
        const closePromises: Promise<void>[] = [];
        for (const [, profile] of this.profiles) {
            closePromises.push(profile.destroy());
        }
        this.profiles.clear();
        await Promise.all(closePromises);

        while (this.busy) {
            await this.busy;
        }
        this.support?.dispose();
        if (disposeModel) {
            this.model.dispose();
        }
    }

    /**
     * Configures and attaches a batch predict profile onto this model.
     *
     * @param name Name of the profile.
     * @param config Batch predict config.
     */
    public configure(name: string, config: BatchPredictConfig): BatchPredict {
        if (this.profiles.has(name)) {
            throw new Error(
                `Batch predict profile '${name}' for model '${this.name}' ` +
                    "already exists",
            );
        }
        const profile = new BatchPredict(name, this, config);
        this.profiles.set(name, profile);
        return profile;
    }

    /**
     * Removes an attached batch predict profile. Returned promise also awaits
     * any pending predict requests for the removed profile.
     */
    public async deconfigure(name: string): Promise<void> {
        const profile = this.profiles.get(name);
        if (!profile) {
            throw new Error(
                `Batch predict profile '${name}' for model '${this.name}' ` +
                    "doesn't exist",
            );
        }
        this.profiles.delete(name);
        await profile.destroy();
    }

    /**
     * Executes a batched prediction on the model.
     *
     * @param inputs Pre-batch stacked encoded state data inputs. The outer
     * length of the array should be the number of inputs and the inner length
     * should be the size of the batch.
     * @returns The Q-value outputs of each action for each requested inference.
     */
    public async predictOnBatch(
        inputs: Float32Array[][],
    ): Promise<Float32Array[]> {
        if (inputs.length !== modelInputShapes.length) {
            throw new Error(
                `Expected ${modelInputShapes.length} inputs but found ` +
                    `${inputs.length}`,
            );
        }

        await this.busy;
        let done!: () => void;
        this.busy = new Promise<void>(res => (done = res)).finally(
            () => (this.busy = null),
        );
        try {
            const results = tf.tidy(() => {
                const stateTensors = inputs.map((input, i) => {
                    const size = flattenedInputShapes[i];
                    const values = new Float32Array(input.length * size);
                    for (let j = 0; j < input.length; ++j) {
                        values.set(input[j], j * size);
                    }
                    return tf.tensor(
                        values,
                        [input.length, ...modelInputShapes[i]],
                        "float32",
                    );
                });

                const output = this.model.predictOnBatch(
                    stateTensors,
                ) as tf.Tensor;
                tf.dispose(stateTensors);

                if (this.support) {
                    // Distributional RL: Take the expectation (mean) of the
                    // Q-value probability distribution.
                    tf.util.assertShapesMatch(
                        [
                            inputs[0].length,
                            intToChoice.length,
                            this.support.size,
                        ],
                        output.shape,
                        "Misshaped predict results:",
                    );
                    return tf.sum(tf.mul(output, this.support), -1);
                }
                tf.util.assertShapesMatch(
                    [inputs[0].length, intToChoice.length],
                    output.shape,
                    "Misshaped predict results:",
                );
                return output;
            });
            const resultData = await results.data<"float32">();
            results.dispose();
            return Array.from({length: inputs[0].length}, (_, i) =>
                resultData.subarray(
                    i * intToChoice.length,
                    (i + 1) * intToChoice.length,
                ),
            );
        } finally {
            done();
        }
    }

    /**
     * Creates a unique message port for requesting predictions from one of the
     * configured batch predict profiles. Requests from multiple ports are
     * batched and executed as one inference. Obeys the ModelPort protocol.
     */
    public subscribe(name: string): MessagePort {
        const profile = this.profiles.get(name);
        if (!profile) {
            throw new Error(
                `Model '${this.name}' has no batch predict profile under ` +
                    `name '${name}'`,
            );
        }
        return profile.subscribe();
    }
}
