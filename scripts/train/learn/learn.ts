import * as tf from "@tensorflow/tfjs-node";
import ProgressBar from "progress";
import { intToChoice } from "../../../src/battle/agent/Choice";
import { ensureDir } from "../ensureDir";
import { klDivergence } from "../learn/helpers";
import { Logger } from "../../../src/Logger";
import { AugmentedExperience } from "./AugmentedExperience";

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

/** Parameters for policy gradient loss function. */
interface LossArgs
{
    /** Model that will be trained. */
    readonly model: tf.LayersModel;
    /** States for each sample. */
    readonly state: tf.Tensor;
    /** Baseline log probabilities. */
    readonly oldLogProbs: tf.Tensor;
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
    {model, state, oldLogProbs, action, returns, advantage, algorithm}:
        LossArgs): LossResult
{
    return tf.tidy(function()
    {
        // get initial prediction
        const [logits, stateValue] = model.predictOnBatch(state) as
            tf.Tensor[];

        // isolate the log probability for the action we took in each sample
        const mask = tf.oneHot(action, intToChoice.length);
        const logProbs = tf.logSoftmax(logits);
        const logProbsMasked = tf.mul(mask, logProbs);
        const logActProbs = tf.sum(logProbsMasked, 1);

        // loss needs a placeholder value so the typings work out
        const result: LossResult = {loss: tf.scalar(0)};

        let pgObjs: tf.Tensor;
        if (algorithm.type === "ppo")
        {
            // mask baseline log-prob distribution
            const oldLogActProbs = tf.sum(tf.mul(mask, oldLogProbs), 1);

            // calc probability ratio and scale by advantage
            const ratio = tf.exp(tf.sub(logActProbs, oldLogActProbs));
            const rScaled = tf.mul(ratio, advantage);
            result.ratio = tf.keep(tf.mean(ratio).asScalar());

            switch (algorithm.variant)
            {
                case "clipped":
                {
                    const clippedRatio = tf.clipByValue(ratio,
                        1 - algorithm.epsilon, 1 + algorithm.epsilon);
                    const clippedRScaled = tf.mul(clippedRatio, advantage);
                    pgObjs = tf.minimum(rScaled, clippedRScaled);
                    break;
                }
                case "klFixed":
                case "klAdaptive":
                {
                    const kl = tf.keep(
                        tf.mean(klDivergence(oldLogProbs, logProbs))
                            .asScalar());
                    result.kl = kl;

                    const beta = algorithm.beta ?? 1;
                    const klPenalty = tf.mul(beta, kl);
                    pgObjs = tf.sub(rScaled, klPenalty);
                }
            }
        }
        // vanilla policy gradient
        else pgObjs = tf.mul(logActProbs, advantage);

        // calculate main policy gradient loss
        const pgLoss = tf.keep(tf.neg(tf.mean(pgObjs)).asScalar());
        tf.dispose(result.loss);
        result.loss = result.pgLoss = pgLoss;

        const losses: tf.Scalar[] = [pgLoss];

        // calc state-value loss using mse
        if (algorithm.valueCoeff)
        {
            result.vLoss = tf.keep(tf.losses.meanSquaredError(returns,
                    tf.squeeze(stateValue)).asScalar());
            losses.push(tf.mul(result.vLoss, algorithm.valueCoeff));
        }

        // subtract an entropy bonus from the loss function in order to maximize
        //  it along with minimizing the other loss functions
        if (algorithm.entropyCoeff)
        {
            const negEnt =
                tf.sum(tf.mul(tf.exp(logProbs), logProbs)).asScalar();
            result.entropy = tf.keep(tf.neg(negEnt));
            losses.push(tf.mul(negEnt, algorithm.entropyCoeff));
        }

        // sum all the losses together
        if (losses.length > 1) result.loss = tf.keep(tf.addN(losses));

        return result;
    });
}

/** Args for `learn()`. */
export interface LearnArgs
{
    /** Model to train. */
    readonly model: tf.LayersModel;
    /** Processed Experience tuples to sample from. */
    readonly samples: readonly AugmentedExperience[];
    /** Learning algorithm config. */
    readonly algorithm: AlgorithmArgs;
    /** Number of epochs to run training. */
    readonly epochs: number;
    /** Mini-batch size. */
    readonly batchSize: number;
    /** Logger object. */
    readonly logger: Logger;
    /**
     * Path to the folder to store TensorBoard logs in. Omit to not store logs.
     */
    readonly logPath?: string;
}

/** Trains the network over a number of epochs. */
export async function learn(
    {model, samples, algorithm, epochs, batchSize, logPath, logger}: LearnArgs):
    Promise<void>
{
    // setup training callbacks for metrics logging
    const callbacks = new tf.CallbackList();
    if (logPath)
    {
        await ensureDir(logPath);
        callbacks.append(tf.node.tensorBoard(logPath));
    }

    // have to do this manually (instead of #compile()-ing the model and calling
    //  #fit()) since the loss function changes based on the advantage values
    // TODO: tune optimizer hyperparams
    const optimizer = tf.train.adam();
    const variables = model.trainableWeights.map(w => w.read() as tf.Variable);

    callbacks.setModel(model);
    await callbacks.onTrainBegin();

    const numBatches = Math.ceil(samples.length / batchSize);
    for (let i = 0; i < epochs; ++i)
    {
        const progress = new ProgressBar(
            `Batch :current/:total: eta=:etas :bar loss=:loss`,
            {
                total: numBatches, head: ">", clear: true,
                width: Math.floor((process.stderr.columns ?? 80) / 3)
            });
        await callbacks.onEpochBegin(i);

        const metricsPerBatch:
            {[name: string]: tf.Scalar[], loss: tf.Scalar[]} = {loss: []};

        let batchId = 0;
        for (let j = 0; j < samples.length; ++j, ++batchId)
        {
            // get experiences from the shuffled samples to get an unzipped
            //  mini-batch
            const states: tf.Tensor[] = [];
            const oldLogProbs: tf.Tensor[] = [];
            const actions: number[] = [];
            const returns: number[] = [];
            const advantages: number[] = [];
            const k = j;
            for (; j - k < batchSize && j < samples.length; ++j)
            {
                const sample = samples[j];
                states.push(sample.state);
                oldLogProbs.push(sample.logProbs);
                actions.push(sample.action);
                returns.push(sample.returns);
                advantages.push(sample.advantage);
            }
            --j;

            await callbacks.onBatchBegin(batchId,
                {batch: batchId, size: states.length});

            // loss function that records the metrics data
            let kl: tf.Scalar | undefined;
            function f()
            {
                const result = tf.tidy(() => loss(
                {
                    model, state: tf.stack(states),
                    oldLogProbs: tf.stack(oldLogProbs),
                    action: tf.tensor(actions, undefined, "int32"),
                    returns: tf.tensor(returns),
                    advantage: tf.tensor(advantages), algorithm
                }));

                for (const name in result)
                {
                    if (!result.hasOwnProperty(name)) continue;
                    const metric = result[name as keyof LossResult];
                    if (!metric) continue;

                    if (!metricsPerBatch.hasOwnProperty(name))
                    {
                        metricsPerBatch[name] = [metric];
                    }
                    else metricsPerBatch[name].push(metric);

                    // record kl for adaptive penalty
                    if (name === "kl") kl = metric;
                }
                return result.loss;
            }

            // compute the gradients for this batch
            // don't dispose() the cost tensor since it's being used in
            //  metricsPerBatch as well
            const cost = optimizer.minimize(f, /*returnCost*/true, variables)!;
            progress.tick({loss: await cost.array()});

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

            await callbacks.onBatchEnd(batchId);
        }

        // average all batch metrics
        const epochMetrics: {[name: string]: tf.Scalar, loss: tf.Scalar} =
            {} as any;
        for (const name in metricsPerBatch)
        {
            if (!metricsPerBatch.hasOwnProperty(name)) continue;
            epochMetrics[name] = tf.tidy(() =>
                tf.mean(tf.stack(metricsPerBatch[name])).asScalar());
        }

        progress.terminate();
        logger.debug(`Epoch ${i + 1}/${epochs}: Avg loss = ` +
            await epochMetrics.loss.array());

        await callbacks.onEpochEnd(i, epochMetrics);
        tf.dispose([metricsPerBatch, epochMetrics]);
    }
    await callbacks.onTrainEnd();

    optimizer.dispose();
    for (const sample of samples) tf.dispose([sample.state, sample.logProbs]);
    logger.debug("Done");
}
