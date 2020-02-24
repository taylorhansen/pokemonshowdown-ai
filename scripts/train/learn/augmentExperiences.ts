import * as tf from "@tensorflow/tfjs-node";
import { Experience } from "../sim/helpers/Experience";
import { AugmentedExperience } from "./AugmentedExperience";
import { AdvantageConfig } from "./learn";

/**
 * Processes Experience tuples into a set of AugmentedExperiences.
 * @param games Game to read from. Some tensors contained by these Experiences
 * will be moved to the AugmentedExperiences, while others will be disposed.
 * @param advantage Config for advantage estimation.
 */
export async function augmentExperiences(game: readonly Experience[],
    advantage: AdvantageConfig): Promise<AugmentedExperience[]>
{
    // compute returns/advantages for each exp then add them to exp tuples
    const samples: AugmentedExperience[] = [];
    let lastRet = 0;
    let lastAdv = 0;
    for (let i = game.length - 1; i >= 0; --i)
    {
        const exp = game[i];

        // calculate discounted summed rewards
        lastRet = exp.reward + advantage.gamma * lastRet;

        // estimate advantage
        switch (advantage.type)
        {
            case "a2c": lastAdv = lastRet - exp.value, i; break;
            case "generalized":
            {
                // temporal difference residual
                const nextValue = game[i + 1]?.value ?? 0;
                const delta = exp.reward - exp.value +
                    advantage.gamma * nextValue;

                // exponentially-decayed sum of residual terms
                lastAdv = delta +
                    advantage.gamma * advantage.lambda * lastAdv;
            }
            case "reinforce": lastAdv = lastRet; break;
        }

        samples.push(
        {
            state: exp.state, value: exp.value, action: exp.action,
            logProbs: exp.logits.logSoftmax(),
            returns: lastRet, advantage: lastAdv
        });
        exp.logits.dispose();
    }

    // optionally standardize the set of advantage values for this game
    if (advantage.standardize)
    {
        let advantages = samples.map(sample => sample.advantage);
        const standardized = tf.tidy(function()
        {
            const advTensor = tf.tensor(advantages);
            const {mean, variance} = tf.moments(advTensor);
            return tf.sub(advTensor, mean)
                .divNoNan(variance.sqrt()).as1D();
        });
        advantages = await standardized.array();
        standardized.dispose();
    }

    return samples;
}
