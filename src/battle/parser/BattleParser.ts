import { Logger } from "../../Logger";
import { BattleAgent } from "../agent/BattleAgent";
import { Choice } from "../agent/Choice";
import { BattleState, ReadonlyBattleState } from "../state/BattleState";
import * as events from "./BattleEvent";

/** Function type for sending a Choice to the game. */
export type ChoiceSender = (choice: Choice) => Promise<SenderResult>;

// tslint:disable: no-trailing-whitespace (force newline in doc)
/**
 * Result after sending a Choice to the game.  
 * `<falsy>` - Choice was accepted.  
 * `true` - Choice was rejected for an unknown reason.  
 * `"disabled"` - Choice was rejected because the chosen move is disabled by
 * some effect.  
 * `"trapped"` - Choice was rejected because the client's pokemon is trapped by
 * some effect.
 */
// tslint:enable: no-trailing-whitespace
export type SenderResult = void | undefined | null | boolean | "disabled" |
    "trapped";

/**
 * BattleDriver parser type. Pass in a BattleEvent whenever it yields to
 * continue handling events.
 *
 * The first `next()` call will initialize the BattleState and yield a reference
 * to it, so nothing should be passed on this first call. All subsequent calls
 * yield nothing but must provide a BattleEvent to parse.
 */
export type BattleParser =
    AsyncGenerator<void | ReadonlyBattleState, void, events.Any>;

/** Arguments for BattleParserFunc. */
export interface BattleParserArgs<TAgent = BattleAgent>
{
    /** Function that makes the decisions for this battle. */
    readonly agent: TAgent;
    /** Function for sending the BattleAgent's Choice to the game. */
    readonly sender: ChoiceSender;
    /** Logger object. */
    readonly logger: Logger;
}

/**
 * Function type for creating a BattleParser.
 * @param args Parser args.
 * @see BattleParserArgs
 */
export type BattleParserFunc<TArgs = BattleParserArgs> =
    (args: TArgs) => BattleParser;

/** Internal state for all sub-parsers. */
export interface ParserState extends BattleParserArgs
{
    /** Internal battle state. */
    readonly state: BattleState;
}

/** Sub-parser type used in BattleParsers. */
export type SubParser<TReturn = SubParserResult> =
    AsyncGenerator<void, TReturn, events.Any>;

/** Return type of a SubParser. */
export interface SubParserResult
{
    /** Whether a permanent halt event was detected. */
    permHalt?: true;
    /**
     * Failed lookahead token. Should be used in place of a yield on the next
     * event handler.
     */
    event?: events.Any;
}

/**
 * Function type for creating a SubParser.
 * @param pstate Parser state.
 * @param args Additional required args.
 * @see BattleParserArgs
 */
export type SubParserFunc<TArgs extends any[]> =
    (pstate: ParserState, ...args: TArgs) => SubParser;
