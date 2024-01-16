/** @file Defines the core BattleParser function type. */
import {Event} from "../../protocol/Event";
import {Logger} from "../../utils/logging/Logger";
import {BattleAgent, Action} from "../agent";
import {BattleState} from "../state";

/**
 * Function type for parsing battle events.
 *
 * @template TAgent Battle agent type.
 * @param ctx Battle and parser state, to be persisted between calls.
 * @param events Battle event to parse.
 * @param args Additional args.
 */
export type BattleParser<TAgent extends BattleAgent = BattleAgent> = (
    ctx: BattleParserContext<TAgent>,
    event: Event,
) => Promise<void>;

/**
 * Required context arguments for the {@link BattleParser}.
 *
 * @template TAgent Battle agent type.
 */
export interface BattleParserContext<TAgent extends BattleAgent = BattleAgent> {
    /** Function that makes the decisions for this battle. */
    readonly agent: TAgent;
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
