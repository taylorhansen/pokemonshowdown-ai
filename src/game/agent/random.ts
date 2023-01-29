import {Choice} from "../../psbot/handlers/battle/agent";
import {ReadonlyBattleState} from "../../psbot/handlers/battle/state";
import {Rng, shuffle} from "../../util/random";

/** BattleAgent that chooses actions randomly. */
export async function randomAgent(
    state: ReadonlyBattleState,
    choices: Choice[],
    random?: Rng,
): Promise<void> {
    shuffle(choices, random);
    return await Promise.resolve();
}
