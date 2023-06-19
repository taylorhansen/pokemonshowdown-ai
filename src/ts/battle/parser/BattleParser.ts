/** @file Defines the core BattleParser function type. */
import {Logger} from "../../utils/logging/Logger";
import {BattleAgent, Action} from "../agent";
import {BattleState} from "../state";
import {EventIterator} from "./iterators";

/**
 * Function type for parsing battle events.
 *
 * @template TAgent Battle agent type.
 * @template TArgs Additional parameter types.
 * @template TResult Result type.
 * @param ctx General args.
 * @param args Additional args.
 * @returns A custom result value to be handled by the caller.
 */
export type BattleParser<
    TAgent extends BattleAgent = BattleAgent,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
> = (ctx: BattleParserContext<TAgent>, ...args: TArgs) => Promise<TResult>;

/**
 * Required context arguments for the {@link BattleParser}.
 *
 * @template TAgent Battle agent type.
 */
export interface BattleParserContext<TAgent extends BattleAgent = BattleAgent> {
    /** Function that makes the decisions for this battle. */
    readonly agent: TAgent;
    /** Iterator for getting the next event.  */
    readonly iter: EventIterator;
    /** Logger object. */
    readonly logger: Logger;
    /**
     * Function for executing the {@link agent}'s preferred {@link Action} in
     * the battle.
     */
    readonly executor: ActionExecutor;
    /** Battle state tracker. */
    readonly state: BattleState;
}

/**
 * Function type for executing an {@link Action} in the battle.
 *
 * @param action Action to send.
 * @param debug Optional debug information to display publicly.
 * @returns Info on whether the game accepted the choice, or if a different
 * action has to be chosen instead.
 */
export type ActionExecutor = (
    action: Action,
    debug?: unknown,
) => Promise<ExecutorResult>;

// TODO: Make this into a proper enum?
/**
 * Result after attempting to execute an {@link Action}.
 *
 * - `<falsy>` - Action was accepted.
 * - `true` - Action was rejected for an unknown reason.
 * - `"disabled"` - Move action was rejected because the chosen move is disabled
 *   by some effect.
 * - `"trapped"` - Switch action was rejected because the active pokemon is
 *   trapped by some effect.
 */
export type ExecutorResult =
    | undefined
    | null
    | boolean
    | "disabled"
    | "trapped";
