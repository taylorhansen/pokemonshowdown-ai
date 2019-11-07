import { ReadonlyBattleState } from "../state/BattleState";
import { Choice } from "./Choice";

/**
 * Makes decisions in a battle. Can be reused for multiple battles of the same
 * format.
 */
export interface BattleAgent
{
    /**
     * Decides which action should be taken.
     * @param state State data for decision making.
     * @param choices Available choices to choose from. This method will sort
     * the choices array in-place from most to least preferable.
     */
    decide(state: ReadonlyBattleState, choices: Choice[]): Promise<void>;
}
