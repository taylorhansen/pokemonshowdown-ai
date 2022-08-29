import {workerData} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {rng, seeder} from "../../../util/random";
import {shuffle} from "../../../util/shuffle";
import {TrainingExampleDecoderPool} from "../../tfrecord/decoder";
import {Metrics} from "../worker/Metrics";
import {ModelLearnData, ModelWorkerData} from "../worker/ModelProtocol";
import {LearnArgs} from "./LearnArgs";
import {BatchedExample, createTrainingDataset} from "./dataset";
import {loss} from "./loss";

const {numDecoderThreads} = workerData as ModelWorkerData;

/**
 * Manages a thread pool for decoding multiple TrainingExample `.tfrecord` files
 * in parallel.
 */
const decoderPool = new TrainingExampleDecoderPool(numDecoderThreads);

/**
 * Closes the TrainingExample decoder pool.
 *
 * Must be called when the worker is shutting down.
 */
export async function closeDecoderPool() {
    await decoderPool.close();
}

/**
 * Trains the network over a number of epochs.
 *
 * @param model Model to train.
 * @param callback Callback for tracking the learning process.
 */
export async function learn(
    {
        name,
        step,
        examplePaths,
        numExamples,
        epochs,
        batchSize,
        shufflePrefetch,
        learningRate,
        seed,
    }: LearnArgs,
    model: tf.LayersModel,
    callback?: (data: ModelLearnData) => void,
): Promise<void> {
    const metrics = Metrics.get(name);

    const seedRandom = seed ? seeder(seed) : undefined;
    const shuffleRandom = seedRandom && rng(seedRandom());

    // Have to do this manually (instead of #compile()-ing the model and calling
    // #fit()) since the loss function changes based on the action and reward.
    const optimizer = tf.train.sgd(learningRate);
    const variables = model.trainableWeights.map(w => w.read() as tf.Variable);

    // Log initial weights.
    if (step === 1) {
        for (const weights of variables) {
            metrics?.histogram(`learn/${weights.name}/weights`, weights, 0);
        }
    }

    // Used for logging inputs.
    const denseLayers = model.layers.filter(
        layer => layer.getClassName() === "Dense",
    );

    callback?.({type: "start", numBatches: Math.ceil(numExamples / batchSize)});

    try {
        let stepLoss = tf.scalar(0);
        const stepGrads: tf.NamedTensorMap = {};
        const stepLayerInputs: tf.NamedTensorMap = {};

        for (let i = 0; i < epochs; ++i) {
            let batchId = 0;

            let epochLoss = tf.scalar(0);
            const epochGrads: tf.NamedTensorMap = {};
            const epochLayerInputs: tf.NamedTensorMap = {};

            for (const layer of denseLayers) {
                // Note: Call hook already wrapped in tf.tidy().
                layer.setCallHook(function learnCallHook(inputs) {
                    let input = Array.isArray(inputs) ? inputs[0] : inputs;

                    // Average along all axes except last one.
                    input = input
                        .mean(input.shape.map((_, j) => j).slice(0, -1))
                        .flatten();

                    if (epochLayerInputs[layer.name]) {
                        const oldInput = epochLayerInputs[layer.name];
                        epochLayerInputs[layer.name] = tf.keep(
                            epochLayerInputs[layer.name].add(input),
                        );
                        tf.dispose(oldInput);
                    } else {
                        epochLayerInputs[layer.name] = tf.keep(input);
                    }
                });
            }

            // Note: We reload the dataset from disk on each epoch to conserve
            // memory.
            await createTrainingDataset(
                // Shuffle paths each time to reduce bias.
                shuffle([...examplePaths], shuffleRandom),
                decoderPool,
                batchSize,
                shufflePrefetch,
                seedRandom?.() /*seed*/,
            )
                // Training loop.
                .mapAsync(async function learnBatch(batch: BatchedExample) {
                    // Convert object with integer keys back into array due to
                    // dataset batching process.
                    const batchState: tf.Tensor[] = [];
                    for (const key of Object.keys(batch.state)) {
                        const index = Number(key);
                        batchState[index] = batch.state[index];
                    }

                    // Compute gradient step for this batch.
                    const {value: batchLoss, grads: batchGrads} =
                        optimizer.computeGradients(
                            () =>
                                loss({
                                    model,
                                    state: batchState,
                                    action: batch.action,
                                    returns: batch.returns,
                                }),
                            variables,
                        );
                    tf.dispose(batch);
                    optimizer.applyGradients(batchGrads);

                    const oldEpochLoss = epochLoss;
                    epochLoss = epochLoss.add(batchLoss);
                    tf.dispose(oldEpochLoss);

                    callback?.({
                        type: "batch",
                        epoch: i + 1,
                        batch: batchId,
                        loss: await batchLoss.array(),
                    });
                    tf.dispose(batchLoss);

                    for (const key of Object.keys(batchGrads)) {
                        const grad = batchGrads[key];
                        if (epochGrads[key]) {
                            const oldEpochGrad = epochGrads[key];
                            epochGrads[key] = oldEpochGrad.add(grad);
                            tf.dispose([oldEpochGrad, grad]);
                        } else {
                            epochGrads[key] = grad;
                        }
                    }

                    ++batchId;
                })
                .forEachAsync(() => {});

            const oldEpochLoss = epochLoss;
            epochLoss = tf.div(epochLoss, batchId);
            tf.dispose(oldEpochLoss);

            const oldStepLoss = stepLoss;
            stepLoss = stepLoss.add(epochLoss);
            tf.dispose(oldStepLoss);

            callback?.({
                type: "epoch",
                epoch: i + 1,
                loss: await epochLoss.array(),
            });
            tf.dispose(epochLoss);

            for (const key of Object.keys(epochGrads)) {
                const oldEpochGrad = epochGrads[key];
                const grad = oldEpochGrad.div(batchId);
                tf.dispose(oldEpochGrad);

                if (stepGrads[key]) {
                    const oldStepGrad = stepGrads[key];
                    stepGrads[key] = oldStepGrad.add(grad);
                    tf.dispose([oldStepGrad, grad]);
                } else {
                    stepGrads[key] = grad;
                }
            }

            for (const key of Object.keys(epochLayerInputs)) {
                const oldEpochLayerInput = epochLayerInputs[key];
                const input = oldEpochLayerInput.div(batchId);
                tf.dispose(oldEpochLayerInput);

                if (stepLayerInputs[key]) {
                    const oldStepLayerInput = stepLayerInputs[key];
                    stepLayerInputs[key] = oldStepLayerInput.add(input);
                    tf.dispose([oldStepLayerInput, input]);
                } else {
                    stepLayerInputs[key] = input;
                }
            }
        }

        const oldStepLoss = stepLoss;
        stepLoss = tf.div(stepLoss, epochs);
        tf.dispose(oldStepLoss);
        metrics?.scalar("learn/loss", stepLoss, step);
        tf.dispose(stepLoss);

        for (const key of Object.keys(stepGrads)) {
            const oldStepGrad = stepGrads[key];
            stepGrads[key] = oldStepGrad.div(epochs);
            tf.dispose(oldStepGrad);
            metrics?.histogram(`learn/${key}/grads`, stepGrads[key], step);
            tf.dispose(stepGrads[key]);
        }

        for (const key of Object.keys(stepLayerInputs)) {
            const oldStepLayerInput = stepLayerInputs[key];
            stepLayerInputs[key] = oldStepLayerInput.div(epochs);
            tf.dispose(oldStepLayerInput);
            metrics?.histogram(
                `learn/${key}/input`,
                stepLayerInputs[key],
                step,
            );
            tf.dispose(stepLayerInputs[key]);
        }

        for (const weights of variables) {
            metrics?.histogram(`learn/${weights.name}/weights`, weights, step);
        }
    } finally {
        optimizer.dispose();
        Metrics.flush();

        for (const layer of denseLayers) {
            layer.clearCallHook();
        }
    }
}
