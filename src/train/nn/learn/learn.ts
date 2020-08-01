import * as tf from "@tensorflow/tfjs";
import { intToChoice } from "../../../battle/agent/Choice";
import { NetworkProcessorLearnData } from
    "../worker/helpers/NetworkProcessorRequest";
import { AugmentedExperience } from "./AugmentedExperience";
import { klDivergence, shuffle } from "./helpers";
import { AlgorithmArgs } from "./LearnArgs";

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
                    stateValue.reshapeAs(returns)).asScalar());
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

/** Data to train on. */
export interface LearnConfig
{
    /** Processed Experience tuples to sample from. */
    readonly samples: AugmentedExperience[];
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
    {model, samples, algorithm, epochs, batchSize, callback, trainCallback}:
        LearnArgs): Promise<void>
{
    // setup training callbacks for metrics logging
    const callbacks = new tf.CallbackList();
    if (trainCallback) callbacks.append(trainCallback);

    // have to do this manually (instead of #compile()-ing the model and calling
    //  #fit()) since the loss function changes based on the advantage values
    // TODO: tune optimizer hyperparams
    const optimizer = tf.train.adam();
    const variables = model.trainableWeights.map(w => w.read() as tf.Variable);

    callback?.(
        {type: "start", numBatches: Math.ceil(samples.length / batchSize)});
    callbacks.setModel(model);
    await callbacks.onTrainBegin();

    for (let i = 0; i < epochs; ++i)
    {
        await callbacks.onEpochBegin(i);

        // make sure our batches are randomly sampled
        shuffle(samples);

        const metricsPerBatch:
            {[name: string]: tf.Scalar[], loss: tf.Scalar[]} = {loss: []};

        let batchId = 0;
        for (let j = 0; j < samples.length; ++j, ++batchId)
        {
            // get experiences from the shuffled samples to get an unzipped
            //  mini-batch
            const states: Float32Array[] = [];
            const oldLogProbs: Float32Array[] = [];
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

            const batchBegin = callbacks.onBatchBegin(batchId,
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
                batchBegin.then(() => callbacks.onBatchEnd(batchId)),
                ...(callback ?
                    [cost.array().then(costData => callback(
                        {
                            type: "batch", epoch: i + 1, batch: batchId,
                            loss: costData
                        }))] : [])
            ]);
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

        await Promise.all(
        [
            callbacks.onEpochEnd(i, epochMetrics),
            ...(callback ?
            [
                epochMetrics.loss.array()
                    .then(lossData =>
                        callback({type: "epoch", epoch: i + 1, loss: lossData}))
            ] : [])
        ]);
        tf.dispose([metricsPerBatch, epochMetrics]);
    }
    await callbacks.onTrainEnd();

    optimizer.dispose();
}
