import {Logger} from "../../utils/logging/Logger";
import {ReadonlyBattleState} from "../state";
import {Action} from "./Action";

/**
 * Generic function type that makes decisions during a battle.
 *
 * @template TInfo Optional decision info type to return.
 * @template TArgs Optional additional arguments.
 * @param state State data for decision making.
 * @param choices Available actions to choose from. This function must sort the
 * choices array in-place from most to least preferable.
 * @param logger Optional logger object.
 * @param args Optional additional arguments.
 * @returns Optional data returned after making a decision.
 */
export type BattleAgent<TInfo = unknown, TArgs extends unknown[] = []> = (
    state: ReadonlyBattleState,
    choices: Action[],
    logger?: Logger,
    ...args: TArgs
) => Promise<TInfo>;
