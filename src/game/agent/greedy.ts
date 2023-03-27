import {BattleAgent, Choice} from "../../psbot/handlers/battle/agent";
import {createMaxAgent} from "../../psbot/handlers/battle/ai/maxAgent";
import {ReadonlyBattleState} from "../../psbot/handlers/battle/state";
import {rng} from "../../util/random";
import {AgentExploreConfig} from "../pool/worker";
import {randomAgent} from "./random";

/**
 * Creates a wrapper over {@link createMaxAgent maxAgent} to implement an
 * epsilon-greedy policy.
 *
 * @param evaluator Function for ranking actions greedily.
 * @param explore Config for random exploration.
 * @param debugRankings If true, the returned BattleAgent will also return a
 * debug string displaying the evaluation of each choice.
 */
export function createGreedyAgent<TArgs extends unknown[] = []>(
    evaluator: (
        state: ReadonlyBattleState,
        choices: readonly Choice[],
        ...args: TArgs
    ) => Float32Array | Promise<Float32Array>,
    explore?: AgentExploreConfig,
    debugRankings?: boolean,
): BattleAgent<string | undefined, TArgs> {
    const random = explore?.seed ? rng(explore.seed) : Math.random;

    const maxAgent = createMaxAgent<TArgs>(evaluator, debugRankings);

    return async function greedyAgent(state, choices, logger, ...args: TArgs) {
        // While it's more efficient to call this only when not exploring, it's
        // more consistent for debugging if we always call it anyway.
        const info = await maxAgent(state, choices, logger, ...args);

        if (explore && random() < explore.factor) {
            logger?.debug("Exploring");
            await randomAgent(state, choices, false /*moveOnly*/, random);
        }
        return info;
    };
}
