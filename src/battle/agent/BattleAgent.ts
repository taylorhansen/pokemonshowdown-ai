import { Logger } from "../../Logger";
import { ReadonlyBattleState } from "../state/BattleState";
import { Choice } from "./Choice";

/**
 * Makes decisions in a battle. Can be reused for multiple battles of the same
 * format.
 * @param state State data for decision making.
 * @param choices Available choices to choose from. This method will sort the
 * choices array in-place from most to least preferable.
 * @param logger Optional logger object.
 */
export type BattleAgent<T = any> =
    (state: ReadonlyBattleState, choices: Choice[], logger?: Logger) =>
        Promise<T>;
