import * as tf from "@tensorflow/tfjs";
import { ModelLearnData } from "../model/worker";
import { BatchedAExp, createAExpDataset } from "./dataset";
import { loss, LossResult } from "./loss";

/** Base type for AdvantageConfigs. */
interface AdvantageConfigBase<T extends string>
{
    readonly type: T;
    /** Discount factor for future rewards. */
    readonly gamma: number;
    /**
     * Whether to standardize the advantage estimates (subtract by mean, divide
     * by standard deviation). This generally leads to better stability during
     * training by encouraging half of the performed actions and discouraging
     * the other half.
     */
    readonly standardize?: boolean;
}

/**
 * Estimate advantage using the REINFORCE algorithm, meaning only the discount
 * reward sums are used.
 */
export interface ReinforceConfig extends AdvantageConfigBase<"reinforce"> {}

/**
 * Estimate advantage using the actor-critic model (advantage actor critic, or
 * A2C), where the discount returns are subtracted by a baseline (i.e.
 * state-value in this case) rather than standardizing them like in REINFORCE.
 * This works under the definition of the Q-learning function
 * `Q(s,a) = V(s) + A(s,a)`.
 */
export interface A2CConfig extends AdvantageConfigBase<"a2c"> {}

/**
 * Generalized advantage estimation. Usually better at controlling bias and
 * variance.
 */
export interface GAEConfig extends AdvantageConfigBase<"generalized">
{
    /** Controls bias-variance tradeoff. Must be between 0 and 1 inclusive. */
    readonly lambda: number;
}

/** Args object for advantage estimator. */
export type AdvantageConfig = ReinforceConfig | A2CConfig | GAEConfig;

/** Base class for AlgorithmArgs. */
interface AlgorithmArgsBase<T extends string>
{
    type: T;
    /** Type of advantage estimator to use. */
    readonly advantage: AdvantageConfig;
    /**
     * If provided, fit the value function separately and weigh it by the
     * provided value with respect to the actual policy gradient loss.
     */
    readonly valueCoeff?: number;
    /**
     * If provided, subtract an entropy bonus from the loss, weighing it by the
     * provided value with respect to the actual policy gradient loss. This
     * generally makes the network favor situations that give it multiple
     * favorable options to promote adaptability and unpredictability.
     */
    readonly entropyCoeff?: number;
}

/** Vanilla policy gradient algorithm. */
export interface PGArgs extends AlgorithmArgsBase<"pg"> {}

/** Base interface for PPOVariantArgs. */
interface PPOVariantBase<T extends string>
{
    /**
     * Type of PPO variant to use.
     * `clipped` - Clipped probability ratio.
     * `klFixed` - Fixed coefficient for a KL-divergence penalty.
     * `klAdaptive` - Adaptive coefficient for a KL-divergence penalty.
     * @see https://arxiv.org/pdf/1707.06347.pdf
     */
    readonly variant: T;
}

/** PPO variant that uses ratio clipping instead of. */
interface PPOVariantClipped extends PPOVariantBase<"clipped">
{
    /** Ratio clipping hyperparameter. */
    readonly epsilon: number;
}

/** PPO variant that uses a fixed coefficient for a KL-divergence penalty. */
interface PPOVariantKLFixed extends PPOVariantBase<"klFixed">
{
    /** Penalty coefficient. */
    readonly beta: number;
}

/**
 * PPO variant that uses an adaptive coefficient for a KL-divergence penalty.
 */
interface PPOVariantKLAdaptive extends PPOVariantBase<"klAdaptive">
{
    /**
     * Target KL-divergence penalty. The penalty coefficient will adapt to
     * produce this value after each learning step.
     */
    readonly klTarget: number;
    /**
     * Adaptive penalty coefficient. This will change for each learning step.
     * Usually it's best to omit this argument (will assume 1 by default) since
     * it usually adjusts to an optimal value quickly.
     */
    beta?: number;
}

/** Additional parameters for selecting a variant of PPO. */
type PPOVariantArgs = PPOVariantClipped | PPOVariantKLFixed |
    PPOVariantKLAdaptive;

/** Proximal policy optimization algorithm. */
export type PPOArgs = AlgorithmArgsBase<"ppo"> & PPOVariantArgs;

/** Arguments for customizing the learning algorithm. */
export type AlgorithmArgs = PGArgs | PPOArgs;

/** Data to train on. */
export interface LearnConfig
{
    /** Path to the `.tfrecord` file storing the AugmentedExperiences. */
    readonly aexpPaths: readonly string[];
    /** Total number of AugmentedExperiences for logging. */
    readonly numAExps: number;
    /** Learning algorithm config. */
    readonly algorithm: AlgorithmArgs;
    /** Number of epochs to run training. */
    readonly epochs: number;
    /** Number of `.tfrecord` files to read in parallel. */
    readonly numDecoderThreads: number;
    /** Mini-batch size. */
    readonly batchSize: number;
    /** Prefetch buffer size for shuffling. */
    readonly shufflePrefetch: number;
}

/** Args for the {@link learn learning} function. */
export interface LearnArgs extends LearnConfig
{
    /** Model to train. */
    readonly model: tf.LayersModel;
    /** Callback for tracking the training process. */
    callback?(data: ModelLearnData): void;
    /** Custom callbacks for training. */
    trainCallback?: tf.CustomCallback;
}

/** Trains the network over a number of epochs. */
export async function learn(
    {
        model, aexpPaths, numAExps, algorithm, epochs, numDecoderThreads,
        batchSize, shufflePrefetch, callback, trainCallback
    }:
        LearnArgs): Promise<void>
{
    // setup training callbacks for metrics logging
    const callbacks = new tf.CallbackList();
    // TODO: early stopping
    if (trainCallback) callbacks.append(trainCallback);

    // have to do this manually (instead of #compile()-ing the model and calling
    //  #fit()) since the loss function changes based on the advantage values
    // TODO: tuning
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

        await createAExpDataset(aexpPaths, numDecoderThreads, batchSize,
                shufflePrefetch)
            // training loop
            .forEachAsync(async function(batch: BatchedAExp)
            {
                const batchLogs: {[name: string]: tf.Scalar | number} =
                    {batch: batchId, size: batch.state.shape[0]};
                await callbacks.onBatchBegin(batchId, batchLogs);
                // create loss function that records the metrics data
                let kl: tf.Scalar | undefined;
                // note: internally this is wrapped in a tf.tidy context
                function f()
                {
                    const result = loss(
                    {
                        model, state: batch.state, oldProbs: batch.probs,
                        action: batch.action, returns: batch.returns,
                        advantage: batch.advantage, algorithm
                    });

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
            });

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
