import { AugmentedExperience } from "../../nn/learn/AugmentedExperience";
import { augmentExperiences } from "../../nn/learn/augmentExperiences";
import { AdvantageConfig } from "../../nn/learn/LearnArgs";
import { SimArgs, SimName, SimResult, simulators } from "../../sim/simulators";

/** Result of a game after it has been completed and processed by the worker. */
export interface AugmentedSimResult extends Omit<SimResult, "experiences">
{
    /** Processed Experience objects. */
    experiences: AugmentedExperience[];
}

/**
 * Plays a single game and processes the results.
 * @param simName Name of the simulator to use.
 * @param args Arguments for the simulator.
 * @param rollout Config for processing Experiences if any BattleAgents are
 * configured to emit them. If omitted, the Experiences will be ignored.
 */
export async function playGame(simName: SimName, args: SimArgs,
    rollout?: AdvantageConfig): Promise<AugmentedSimResult>
{
    const sim = simulators[simName];
    const {experiences, winner, err} = await sim(args);

    const aexps: AugmentedExperience[] = [];
    if (rollout && !err)
    {
        // process experiences as long as the game wasn't errored
        for (const batch of experiences)
        {
            aexps.push(...augmentExperiences(batch, rollout));
        }
    }

    return {
        experiences: aexps, ...winner === undefined ? {} : {winner},
        ...err && {err}
    };
}
