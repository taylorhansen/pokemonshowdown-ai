import { BattleAgent } from "../../../../src/battle/agent/BattleAgent";
import { BattleIterator, BattleParser, ChoiceSender, StartBattleParserArgs }
    from "../../../../src/battle/parser/BattleParser";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Logger } from "../../../../src/Logger";

/** Initial context from the main `testEvents()` function. */
export interface InitialContext extends StartBattleParserArgs
{
    /** Initial args for starting the BattleParser. */
    readonly startArgs: StartBattleParserArgs;
    /**
     * Agent deconstructed from `#startArgs`. Can be overridden.
     * @override
     */
    agent: BattleAgent;
    /**
     * Logger deconstructed from `#startArgs`. Can be overridden.
     * @override
     */
    logger: Logger;
    /**
     * Sender deconstructed from `#startArgs`. Can be overridden
     * @override
     */
    sender: ChoiceSender;
}

/** Parser context from the main `testEvents()` function. */
export interface ParserContext<TResult = any>
{
    /** Iterator for sending events to the BattleParser. */
    readonly battleIt: BattleIterator;
    /** Return value of the BattleParser/SubParser. */
    readonly finish: Promise<TResult>;
}

/** ParserContext type for BattleParsers. */
export type BattleParserContext =
    ParserContext<UnwrapPromise<ReturnType<BattleParser>>>

/** Helper type that unwraps a Promise type. */
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;
