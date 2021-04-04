import * as tf from "@tensorflow/tfjs";
import * as os from "os";
import { intToChoice } from "../../../battle/agent/Choice";
import { NetworkProcessorLearnData } from
    "../worker/helpers/NetworkProcessorRequest";
import { AugmentedExperience } from "./AugmentedExperience";
import { AExpDecoderPool } from "./decoder/AExpDecoderPool";
import { klDivergence } from "./helpers";
import { AlgorithmArgs } from "./LearnArgs";

/** Parameters for policy gradient loss function. */
interface LossArgs
{
    /** Model that will be trained. */
    readonly model: tf.LayersModel;
    /** States for each sample. */
    readonly state: tf.Tensor;
    /** Baseline probabilities. */
    readonly oldProbs: tf.Tensor;
    /** Choice ids for each sample. Must be an int32 tensor. */
    readonly action: tf.Tensor;
    /** Discounted cumulatively-summed rewards for each sample. */
    readonly returns: tf.Tensor;
    /** Advantage estimates for each sample. */
    readonly advantage: tf.Tensor;
    /** Learning algorithm config. */
    readonly algorithm: AlgorithmArgs;
}

/** Metrics data for the loss function. */
type LossResult =
{
    /** Total mean loss for this batch. */
    loss: tf.Scalar;
    /** Policy gradient loss. */
    pgLoss?: tf.Scalar;
    /** State-value loss. */
    vLoss?: tf.Scalar;
    /** Entropy bonus. */
    entropy?: tf.Scalar;
    /** Average probability ratio. */
    ratio?: tf.Scalar;
    /** Average KL divergence from old policy. */
    kl?: tf.Scalar;
    /** Adaptive KL penalty coefficient after adjusting. */
    beta?: tf.Scalar;
};

/** Policy gradient loss function. */
function loss(
    {model, state, oldProbs, action, returns, advantage, algorithm}:
        LossArgs): LossResult
{
    return tf.tidy(function()
    {
        // get initial prediction
        const [probs, stateValue] = model.predictOnBatch(state) as tf.Tensor[];

        // isolate the probability for the action we took in each sample
        const mask = tf.oneHot(action, intToChoice.length);
        const probsMasked = tf.mul(mask, probs);
        const actProbs = tf.sum(probsMasked, 1);

        // loss needs a placeholder value so the typings work out
        const result: LossResult = {loss: tf.scalar(0)};

        // calculate policy gradient objective function
        let pgObjs: tf.Tensor;
        if (algorithm.type === "ppo")
        {
            // mask baseline prob distribution
            const oldActProbs = tf.sum(tf.mul(mask, oldProbs), 1);

            // calc probability ratio between current and old policy
            const ratio = tf.div(actProbs, oldActProbs);
            result.ratio = tf.keep(tf.mean(ratio).asScalar());

            switch (algorithm.variant)
            {
                case "clipped":
                {
                    // simplified version of the PPO clipped loss function
                    const bounds = tf.where(
                            tf.greaterEqual(advantage, tf.zerosLike(advantage)),
                            tf.fill(advantage.shape, 1 + algorithm.epsilon),
                            tf.fill(advantage.shape, 1 - algorithm.epsilon));
                    pgObjs = tf.minimum(tf.mul(ratio, advantage),
                            tf.mul(bounds, advantage));
                    break;
                }
                case "klFixed":
                case "klAdaptive":
                {
                    const rScaled = tf.mul(ratio, advantage);
                    const kl = tf.keep(
                        tf.mean(klDivergence(oldProbs, probs)).asScalar());
                    result.kl = kl;

                    const beta = algorithm.beta ?? 1;
                    const klPenalty = tf.mul(beta, kl);
                    pgObjs = tf.sub(rScaled, klPenalty);
                    break;
                }
            }
        }
        // vanilla policy gradient
        else pgObjs = tf.mul(tf.log(actProbs), advantage);

        // calculate main policy gradient loss
        // by minimizing loss, we maximize the objective
        const pgLoss = tf.keep(tf.neg(tf.mean(pgObjs)).asScalar());
        tf.dispose(result.loss);
        result.loss = result.pgLoss = pgLoss;

        const losses: tf.Scalar[] = [pgLoss];

        // calc state-value loss using mse
        // assumes the value function shares weights with the policy
        if (algorithm.valueCoeff)
        {
            result.vLoss = tf.keep(
                tf.losses.meanSquaredError(returns,
                    stateValue.reshapeAs(returns)).asScalar());
            losses.push(tf.mul(result.vLoss, algorithm.valueCoeff));
        }

        // subtract an entropy bonus from the loss function in order to maximize
        //  it along with minimizing the other loss functions
        if (algorithm.entropyCoeff)
        {
            // note: max possible entropy (where each action is equally likely)
            //  is log(#probs) where #probs is the # of possible actions
            const negEnt = tf.mean(tf.sum(tf.mul(probs, tf.log(probs)), -1))
                .asScalar();
            result.entropy = tf.keep(tf.neg(negEnt));
            losses.push(tf.mul(negEnt, algorithm.entropyCoeff));
        }

        // sum all the losses together
        if (losses.length > 1) result.loss = tf.keep(tf.addN(losses));

        return result;
    });
}

/** AugmentedExperience tensors. */
type TensorAExp =
{
    [T in keyof AugmentedExperience]:
        AugmentedExperience[T] extends number ? tf.Scalar : tf.Tensor1D
};

/** Batched AugmentedExperience stacked tensors. */
type BatchedAExp =
{
    [T in keyof AugmentedExperience]:
        AugmentedExperience[T] extends number ? tf.Tensor1D : tf.Tensor2D
};
/**
 * Wraps a set of `.tfrecord` files as a TensorFlow Dataset, parsing each file
 * in parallel and shuffling according to the preftech buffer.
 * @param aexpPaths Array of paths to the `.tfrecord` files holding the
 * AugmentedExperiences.
 * @param batchSize AugmentedExperience batch size.
 * @param numThreads Max number of files to read in parallel. Defaults to the
 * number of CPUs on the current system.
 * @param prefetch Amount to buffer for prefetching/shuffling.
 * @returns A TensorFlow Dataset that contains batched AugmentedExperience
 * objects.
 */
function createAExpDataset(aexpPaths: readonly string[],
    batchSize: number, prefetch = 128, numThreads?: number):
    tf.data.Dataset<BatchedAExp>
{
    const pool = new AExpDecoderPool(numThreads);

    return tf.data.generator<TensorAExp>(
            // tensorflow supports async generators, but the typings don't
            () => pool.decode(aexpPaths, prefetch) as any)
        .prefetch(prefetch)
        .shuffle(prefetch)
        // after the batch operation, each entry of a generated AExp will
        //  contain stacked tensors according to the batch size
        .batch(batchSize)
        // make sure action indexes are integers
        .map(((batch: BatchedAExp) =>
            ({...batch, action: batch.action.cast("int32")})) as any) as
                tf.data.Dataset<BatchedAExp>;
}

/** Data to train on. */
export interface LearnConfig
{
    /** Path to the `.tfrecord` file storing the AugmentedExperiences. */
    readonly aexpPaths: readonly string[];
    /** Total number of AugmentedExperiences. */
    readonly numAExps: number;
    /** Learning algorithm config. */
    readonly algorithm: AlgorithmArgs;
    /** Number of epochs to run training. */
    readonly epochs: number;
    /** Mini-batch size. */
    readonly batchSize: number;
}

/** Args for `learn()`. */
export interface LearnArgs extends LearnConfig
{
    /** Model to train. */
    readonly model: tf.LayersModel;
    /** Callback for tracking the training process. */
    callback?(data: NetworkProcessorLearnData): void;
    /** Custom callbacks for training. */
    trainCallback?: tf.CustomCallback;
}

/** Trains the network over a number of epochs. */
export async function learn(
    {
        model, aexpPaths, numAExps, algorithm, epochs, batchSize, callback,
        trainCallback
    }:
        LearnArgs): Promise<void>
{
    // setup training callbacks for metrics logging
    const callbacks = new tf.CallbackList();
    // TODO: add early stopping?
    if (trainCallback) callbacks.append(trainCallback);

    // have to do this manually (instead of #compile()-ing the model and calling
    //  #fit()) since the loss function changes based on the advantage values
    // TODO: hyperparameter tuning
    const optimizer = tf.train.adam(1e-5);
    const variables = model.trainableWeights.map(w => w.read() as tf.Variable);

    callback?.({type: "start", numBatches: Math.ceil(numAExps / batchSize)});
    await callbacks.onTrainBegin();

    for (let i = 0; i < epochs; ++i)
    {
        const epochLogs:
            {[name: string]: tf.Scalar | number, loss: tf.Scalar} = {} as any;
        await callbacks.onEpochBegin(i, epochLogs);

        const metricsPerBatch:
            {[name: string]: tf.Scalar[], loss: tf.Scalar[]} = {loss: []};
        let batchId = 0;

        await createAExpDataset(aexpPaths, batchSize,
                /*prefetch*/ 16 * 128,
                /*numThreads*/ Math.ceil(os.cpus().length / 2))
            // setup dataset loop
            .mapAsync(async function(batch: BatchedAExp)
            {
                const batchLogs: {[name: string]: tf.Scalar | number} =
                    {batch: batchId, size: batch.state.shape[0]};
                await callbacks.onBatchBegin(batchId, batchLogs);
                // create loss function that records the metrics data
                let kl: tf.Scalar | undefined;
                function f()
                {
                    const result = tf.tidy(() => loss(
                    {
                        model, state: batch.state, oldProbs: batch.probs,
                        action: batch.action, returns: batch.returns,
                        advantage: batch.advantage, algorithm
                    }));

                    for (const name in result)
                    {
                        if (!result.hasOwnProperty(name)) continue;
                        const metric = result[name as keyof LossResult];
                        if (!metric) continue;

                        // record metrics for epoch average later
                        if (!metricsPerBatch.hasOwnProperty(name))
                        {
                            metricsPerBatch[name] = [metric];
                        }
                        else metricsPerBatch[name].push(metric);

                        // record metrics for batch summary
                        // if using tensorboard, requires updateFreq=batch
                        batchLogs[name] = tf.keep(metric.clone());

                        // record kl for adaptive penalty
                        if (name === "kl") kl = metric;
                    }
                    return result.loss;
                }

                // compute the gradients for this batch
                // don't dispose() the cost tensor since it's being used in
                //  metricsPerBatch as well
                const cost = optimizer.minimize(f, /*returnCost*/true,
                    variables)!;

                // update adaptive kl penalty if applicable
                if (algorithm.type === "ppo" &&
                    algorithm.variant === "klAdaptive" && kl)
                {
                    const klValue = await kl.array();
                    if (algorithm.beta === undefined) algorithm.beta = 1;

                    // adapt penalty coefficient
                    const target = algorithm.klTarget;
                    if (klValue < target / 1.5) algorithm.beta /= 2;
                    else if (klValue > target * 1.5) algorithm.beta *= 2;

                    // record new coefficient value
                    if (!metricsPerBatch.hasOwnProperty("beta"))
                    {
                        metricsPerBatch.beta = [tf.scalar(algorithm.beta)];
                    }
                    else metricsPerBatch.beta.push(tf.scalar(algorithm.beta));
                }

                await Promise.all(
                [
                    callbacks.onBatchEnd(batchId, batchLogs),
                    ...(callback ?
                        [cost.array().then(costData => callback(
                            {
                                type: "batch", epoch: i + 1, batch: batchId,
                                loss: costData
                            }))] : [])
                ]);
                tf.dispose(batchLogs);

                ++batchId;
            })
            // execute dataset loop
            .forEachAsync(() => {});

        // average all batch metrics
        for (const name in metricsPerBatch)
        {
            if (!metricsPerBatch.hasOwnProperty(name)) continue;
            epochLogs[name] = tf.tidy(() =>
                tf.mean(tf.stack(metricsPerBatch[name])).asScalar());
        }

        await Promise.all(
        [
            callbacks.onEpochEnd(i, epochLogs),
            ...(callback ?
            [
                epochLogs.loss.array()
                    .then(lossData =>
                        callback({type: "epoch", epoch: i + 1, loss: lossData}))
            ] : [])
        ]);
        tf.dispose([metricsPerBatch, epochLogs]);
    }
    await callbacks.onTrainEnd();

    optimizer.dispose();
}
