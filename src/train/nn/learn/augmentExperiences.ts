import { Experience } from "../../sim/helpers/Experience";
import { AugmentedExperience } from "./AugmentedExperience";
import { AdvantageConfig } from "./LearnArgs";

/**
 * Computes `log(softmax(logits))` but with an optimization to help preserve
 * precision.
 */
function logSoftmax(logits: Float32Array): Float32Array
{
    const max = Math.max(...logits);
    const shifted = logits.map(n => n - max);
    const shiftedLogSumExp =
        Math.log(shifted.map(Math.exp).reduce((a, b) => a + b));
    return shifted.map(n => n - shiftedLogSumExp);
}

/**
 * Processes a set of game Experience into a set of AugmentedExperiences
 * suitable for learning.
 * @param games Game to read from.
 * @param advantage Config for advantage estimation.
 */
export function augmentExperiences(game: readonly Experience[],
    advantage: AdvantageConfig): AugmentedExperience[]
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
            logProbs: logSoftmax(exp.logits),
            returns: lastRet, advantage: lastAdv
        });
    }

    // optionally standardize the set of advantage values for this game
    if (advantage.standardize)
    {
        let sum = 0;
        let squaredSum = 0;
        for (const sample of samples)
        {
            sum += sample.advantage;
            squaredSum += sample.advantage * sample.advantage;
        }
        const mean = sum / samples.length;
        const stdev = Math.sqrt(squaredSum / samples.length - (mean * mean));

        for (const sample of samples)
        {
            sample.advantage = (sample.advantage - mean) / stdev;
        }
    }

    return samples;
}
