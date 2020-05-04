import { AugmentedExperience } from "../../nn/learn/AugmentedExperience";
import { augmentExperiences } from "../../nn/learn/augmentExperiences";
import { AdvantageConfig } from "../../nn/learn/LearnArgs";
import { SimArgs, SimName, SimResult, simulators } from "../../sim/simulators";

/** Result of a game after it has been completed and processed. */
export interface GameResult extends Omit<SimResult, "experiences">
{
    /** Processed Experience objects. */
    experiences: AugmentedExperience[];
}

/**
 * Plays a single game.
 * @param simName Name of the simulator to use.
 * @param args Arguments for the simulator.
 * @param rollout Config for processing Experiences if any BattleAgents are
 * configured to emit them. If omitted, the Experiences will be ignored.
 */
export async function playGame(simName: SimName, args: SimArgs,
    rollout?: AdvantageConfig): Promise<GameResult>
{
    const sim = simulators[simName];
    const {experiences, winner} = await sim(args);

    const aexps: AugmentedExperience[] = [];
    if (rollout)
    {
        // process experiences
        for (const batch of experiences)
        {
            aexps.push(...augmentExperiences(batch, rollout));
        }
    }

    return {experiences: aexps, ...(winner === undefined ? {} : {winner})};
}
