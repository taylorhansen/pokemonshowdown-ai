import * as tf from "@tensorflow/tfjs";
import seedrandom from "seedrandom";
import {LearnConfig} from "../../config/types";
import {hash} from "../../util/hash";
import {shuffle} from "../../util/shuffle";
import {ModelLearnData} from "../model/worker";
import {Metrics} from "../model/worker/Metrics";
import {TrainingExampleDecoderPool} from "../tfrecord/decoder";
import {BatchedExample, createTrainingDataset} from "./dataset";
import {loss} from "./loss";

/** Factored-out high level config from {@link LearnArgs}. */
export interface LearnArgsPartial extends LearnConfig {
    /** Name of the current training run, under which to store logs. */
    readonly name: string;
    /** Current episode iteration of the training run. 1-based. */
    readonly step: number;
    /** Path to the `.tfrecord` files storing the encoded TrainingExamples. */
    readonly examplePaths: readonly string[];
    /** Total number of TrainingExamples for logging. */
    readonly numExamples: number;
    /** Seed for shuffling training examples. */
    readonly seed?: string;
}

/** Args for {@link learn}. */
export interface LearnArgs extends LearnArgsPartial {
    /** Model to train. */
    readonly model: tf.LayersModel;
    /** Callback for tracking the training process. */
    readonly callback?: (data: ModelLearnData) => void;
}

/** Trains the network over a number of epochs. */
export async function learn({
    name,
    step,
    model,
    examplePaths,
    numExamples,
    epochs,
    numDecoderThreads,
    batchSize,
    shufflePrefetch,
    learningRate,
    callback,
    seed,
}: LearnArgs): Promise<void> {
    const metrics = Metrics.get(name);

    let seedCounter = 0;
    const seedRandom = seed
        ? () => hash(seed + String(seedCounter++))
        : undefined;
    const shuffleRandom = seedRandom && seedrandom.alea(seedRandom());

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

    const decoderPool = new TrainingExampleDecoderPool(numDecoderThreads);

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
                        epochLayerInputs[layer.name] = tf.keep(
                            epochLayerInputs[layer.name].add(input),
                        );
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
        await decoderPool.close();
        optimizer.dispose();
        Metrics.flush();

        for (const layer of denseLayers) {
            layer.clearCallHook();
        }
    }
}
