import {Logger} from "../../../../Logger";
import {FormatType, ReadonlyState} from "../formats";
import {Choice} from "./Choice";

/**
 * Generic function type alias that makes decisions during a battle.
 *
 * @template T Format type.
 * @template TInfo Optional decision info type to return.
 * @param state State data for decision making.
 * @param choices Available choices to choose from. This method will sort the
 * choices array in-place from most to least preferable.
 * @param logger Optional logger object.
 * @returns Optional data returned after making a decision.
 */
export type BattleAgent<T extends FormatType = FormatType, TInfo = unknown> = (
    state: ReadonlyState<T>,
    choices: Choice[],
    logger?: Logger,
) => Promise<TInfo>;
