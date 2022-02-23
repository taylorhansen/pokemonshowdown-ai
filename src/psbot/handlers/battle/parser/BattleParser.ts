/** @file Defines the core BattleParser function type. */
import {Logger} from "../../../../util/logging/Logger";
import {BattleAgent, Choice} from "../agent";
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
 * Context container needed to call a BattleParser.
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
    /** Function for sending the BattleAgent's Choice to the game. */
    readonly sender: ChoiceSender;
    /** Battle state tracker. */
    readonly state: BattleState;
}

/** Function type for sending a Choice to the game. */
export type ChoiceSender = (choice: Choice) => Promise<SenderResult>;

// TODO: Make this into a proper enum?
/**
 * Result after sending a Choice to the game.
 *
 * - `<falsy>` - Choice was accepted.
 * - `true` - Choice was rejected for an unknown reason.
 * - `"disabled"` - Choice was rejected because the chosen move is disabled by
 *   some effect.
 * - `"trapped"` - Choice was rejected because the client's pokemon is trapped
 *   by some effect.
 */
export type SenderResult = undefined | null | boolean | "disabled" | "trapped";
