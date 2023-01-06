import {ExperienceConfig} from "../../../config/types";
import {Experience} from "./Experience";
import {TrainingExample} from "./TrainingExample";

/**
 * Processes a list of game {@link Experience} objs into a list of
 * {@link TrainingExample TrainingExamples} suitable for learning.
 *
 * @param game Game experience to process.
 * @param config Config for processing Experience objs.
 */
export function createTrainingExamples(
    game: readonly Experience[],
    config: ExperienceConfig,
): TrainingExample[] {
    const examples: TrainingExample[] = [];
    let lastRet = 0;
    // Iterate backwards so we know the sum of the future rewards down to the
    // current experience.
    for (let i = game.length - 1; i >= 0; --i) {
        const exp = game[i];
        lastRet = exp.reward + config.rewardDecay * lastRet;
        examples.push({state: exp.state, action: exp.action, returns: lastRet});
    }
    return examples;
}
