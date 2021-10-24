import * as tf from "@tensorflow/tfjs";
import { intToChoice } from "../../psbot/handlers/battle/agent";
import { AlgorithmArgs } from "./learn";

/** Parameters for policy gradient loss function. */
export interface LossArgs
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
export type LossResult =
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
};

/** Policy gradient loss function. */
export function loss(
    {model, state, oldProbs, action, returns, advantage, algorithm}:
        LossArgs): LossResult
{
    return tf.tidy("loss", function lossImpl()
    {
        // Get initial prediction.
        const [probs, stateValue] = model.predictOnBatch(state) as tf.Tensor[];

        // Isolate the probability for the action we took in each sample.
        const mask = tf.oneHot(action, intToChoice.length);
        const probsMasked = tf.mul(mask, probs);
        const actProbs = tf.sum(probsMasked, 1);

        // Loss needs a placeholder value so the typings work out.
        const result: LossResult = {loss: tf.scalar(0)};

        // Calculate policy gradient objective function.
        let pgObjs: tf.Tensor;
        if (algorithm.type === "ppo")
        {
            // Mask baseline prob distribution.
            const oldActProbs = tf.sum(tf.mul(mask, oldProbs), 1);

            // Calc probability ratio between current and old policy.
            const ratio = tf.div(actProbs, oldActProbs);
            result.ratio = tf.keep(tf.mean(ratio).asScalar());

            switch (algorithm.variant)
            {
                case "clipped":
                {
                    // Simplified version of the PPO clipped loss function.
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
        // Vanilla policy gradient.
        else pgObjs = tf.mul(tf.log(actProbs), advantage);

        // Calculate main policy gradient loss.
        // By minimizing loss, we maximize the objective.
        const pgLoss = tf.keep(tf.neg(tf.mean(pgObjs)).asScalar());
        result.loss = result.pgLoss = pgLoss;

        const losses: tf.Scalar[] = [pgLoss];

        // Calc state-value loss using mse.
        // Assumes the value function shares weights with the policy.
        if (algorithm.valueCoeff)
        {
            result.vLoss = tf.keep(
                tf.losses.meanSquaredError(returns,
                    stateValue.reshapeAs(returns)).asScalar());
            losses.push(tf.mul(result.vLoss, algorithm.valueCoeff));
        }

        // Subtract an entropy bonus from the loss function in order to maximize
        // it along with minimizing the other loss functions.
        if (algorithm.entropyCoeff)
        {
            // Note: Max possible entropy (where each action is equally likely)
            // is log(#probs) where #probs is the # of possible actions.
            const negEnt = tf.mean(tf.sum(tf.mul(probs, tf.log(probs)), -1))
                .asScalar();
            result.entropy = tf.keep(tf.neg(negEnt));
            losses.push(tf.mul(negEnt, algorithm.entropyCoeff));
        }

        // Sum all the losses together.
        if (losses.length > 1) result.loss = tf.keep(tf.addN(losses));

        return result;
    });
}

/**
 * Calculates the KL divergence of two discrete probability distributions.
 *
 * @param p Probabilities of the first distribution.
 * @param q Probabilities of the second distribution. Must be the same shape
 * as `p`.
 * @returns A Tensor one rank lower than `p` containing `KL(P || Q)`, the KL
 * divergence of `p` from `q`, in nats.
 */
export function klDivergence(p: tf.Tensor, q: tf.Tensor): tf.Tensor
{
    return tf.tidy(() => tf.sum(tf.mul(p, tf.log(tf.div(p, q))), -1));
}
