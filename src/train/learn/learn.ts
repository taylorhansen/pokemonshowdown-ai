import * as tf from "@tensorflow/tfjs";
import {LearnConfig} from "../../config/types";
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
}: LearnArgs): Promise<void> {
    const metrics = Metrics.get(name);

    // Log initial weights.
    if (step === 1) {
        metrics?.logWeights("weights", model, 0);
    }

    // Have to do this manually (instead of #compile()-ing the model and calling
    // #fit()) since the loss function changes based on the action and reward.
    const optimizer = tf.train.sgd(learningRate);
    const variables = model.trainableWeights.map(w => w.read() as tf.Variable);

    const decoderPool = new TrainingExampleDecoderPool(numDecoderThreads);

    callback?.({type: "start", numBatches: Math.ceil(numExamples / batchSize)});

    try {
        const epochLosses: tf.Scalar[] = [];
        for (let i = 0; i < epochs; ++i) {
            const batchLosses: tf.Scalar[] = [];
            let batchId = 0;

            // Note: We reload the dataset from disk on each epoch to conserve
            // memory.
            await createTrainingDataset(
                // Shuffle paths each time to reduce bias.
                shuffle([...examplePaths]),
                decoderPool,
                batchSize,
                shufflePrefetch,
            )
                // Training loop.
                .mapAsync(async function (batch: BatchedExample) {
                    // Convert object with integer keys back into array due to
                    // dataset batching process.
                    const batchState: tf.Tensor[] = [];
                    for (const key of Object.keys(batch.state)) {
                        const index = Number(key);
                        batchState[index] = batch.state[index];
                    }

                    // Compute gradient step for this batch.
                    const batchLoss = optimizer.minimize(
                        () =>
                            loss({
                                model,
                                state: batchState,
                                action: batch.action,
                                returns: batch.returns,
                            }),
                        true /*returnCost*/,
                        variables,
                    )!;
                    batchLosses.push(batchLoss);

                    if (callback) {
                        const batchLossData = await batchLoss.array();
                        callback({
                            type: "batch",
                            epoch: i + 1,
                            batch: batchId,
                            loss: batchLossData,
                        });
                    }

                    tf.dispose(batch);
                    ++batchId;
                })
                .forEachAsync(() => {});

            const epochLoss = tf.tidy(() =>
                tf.mean(tf.stack(batchLosses)).asScalar(),
            );
            tf.dispose(batchLosses);
            epochLosses.push(epochLoss);

            if (callback) {
                const epochLossData = await epochLoss.array();
                callback({
                    type: "epoch",
                    epoch: i + 1,
                    loss: epochLossData,
                });
            }
        }

        const avgEpochLoss = tf.tidy(() =>
            tf.mean(tf.stack(epochLosses)).asScalar(),
        );
        tf.dispose(epochLosses);
        metrics?.scalar("avg_epoch_loss", avgEpochLoss, step);
        tf.dispose(avgEpochLoss);

        metrics?.logWeights("weights", model, step);
    } finally {
        await decoderPool.close();
        optimizer.dispose();
        Metrics.flush();
    }
}
