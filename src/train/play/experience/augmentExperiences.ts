/* eslint-disable no-mixed-operators */
import {AdvantageConfig} from "../../learn";
import {AugmentedExperience} from "./AugmentedExperience";
import {Experience} from "./Experience";

/**
 * Processes a set of game Experience into a set of AugmentedExperiences
 * suitable for learning.
 *
 * @param games Game experience batch to process.
 * @param advantage Config for advantage estimation.
 */
export function augmentExperiences(
    game: readonly Experience[],
    advantage: AdvantageConfig,
): AugmentedExperience[] {
    // Compute returns/advantages for each exp then add them to exp tuples.
    const samples: AugmentedExperience[] = [];
    let lastRet = 0;
    let lastAdv = 0;
    // Iterate backwards so we know the sum of the future rewards down to the
    // current experience.
    for (let i = game.length - 1; i >= 0; --i) {
        const exp = game[i];

        // Calculate discounted summed rewards
        lastRet = exp.reward + advantage.gamma * lastRet;

        // Estimate advantage.
        switch (advantage.type) {
            case "a2c":
                lastAdv = lastRet - exp.value;
                break;
            case "generalized": {
                // Temporal difference residual.
                const nextValue = game[i + 1]?.value ?? 0;
                const delta =
                    exp.reward - exp.value + advantage.gamma * nextValue;

                // Exponentially-decayed sum of residual terms.
                lastAdv = delta + advantage.gamma * advantage.lambda * lastAdv;
                break;
            }
            case "reinforce":
                lastAdv = lastRet;
                break;
        }

        samples.push({
            state: exp.state,
            probs: exp.probs,
            value: exp.value,
            action: exp.action,
            returns: lastRet,
            advantage: lastAdv,
        });
    }

    // Optionally standardize the set of advantage values for this game.
    // TODO: Apply this to the entire batch of rollout games instead of just
    // individually, probably by moving this step to the learning phase.
    if (advantage.standardize) {
        let sum = 0;
        let squaredSum = 0;
        for (const sample of samples) {
            sum += sample.advantage;
            squaredSum += sample.advantage * sample.advantage;
        }
        const mean = sum / samples.length;
        const stdev = Math.sqrt(squaredSum / samples.length - mean * mean);

        for (const sample of samples) {
            sample.advantage = (sample.advantage - mean) / stdev;
        }
    }

    return samples;
}

/* eslint-enable no-mixed-operators */
