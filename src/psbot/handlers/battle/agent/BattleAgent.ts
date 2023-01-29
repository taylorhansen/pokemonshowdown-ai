import {Logger} from "../../../../util/logging/Logger";
import {ReadonlyBattleState} from "../state";
import {Choice} from "./Choice";

/**
 * Generic function type alias that makes decisions during a battle.
 *
 * @template TInfo Optional decision info type to return.
 * @template TArgs Optional additional arguments.
 * @param state State data for decision making.
 * @param choices Available choices to choose from. This method will sort the
 * choices array in-place from most to least preferable.
 * @param logger Optional logger object.
 * @param args Optional additional arguments.
 * @returns Optional data returned after making a decision.
 */
export type BattleAgent<TInfo = unknown, TArgs extends unknown[] = []> = (
    state: ReadonlyBattleState,
    choices: Choice[],
    logger?: Logger,
    ...args: TArgs
) => Promise<TInfo>;
