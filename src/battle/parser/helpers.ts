import { BattleState } from "../state/BattleState";
import * as events from "./BattleEvent";
import { BattleParser, BattleParserArgs, BattleParserFunc, ParserState,
    SubParser, SubParserFunc } from "./BattleParser";

/** Maps BattleEvent type to a SubParser handler. */
export type EventHandlerMap = {readonly [T in events.Type]: EventHandler<T>};

/** Generic type for a sub-parser declaration. */
export type EventHandler<T extends events.Type, TArgs extends any[] = []> =
    SubParserFunc<[events.Event<T>, ...TArgs]>

/**
 * Creates a sub-parser that dispatches to an appropriate event handler using
 * the given map.
 */
export function baseHandler(handlers: EventHandlerMap):
    EventHandler<events.Type>
{
    return function f<T extends events.Type>(pstate: ParserState,
        event: events.Event<T>): SubParser
    {
        return (handlers[event.type] as typeof f)(pstate, event);
    }
}

/**
 * Creates a top-level BattleParser that loops a SubParser.
 * @param f Parser function to use. Must accept any BattleEvent.
 */
export function baseEventLoop(f: EventHandler<events.Type>): BattleParserFunc
{
    return async function*(args: BattleParserArgs): BattleParser
    {
        const pstate = {...args, state: new BattleState()};
        // the first yield should provide initialization info to the caller
        let event: events.Any = yield pstate.state;
        // base event loop, stopping the parser on the first truthy value which
        //  indicates a detected permanent halt
        let result: void | boolean | events.Any;
        while (true)
        {
            result = yield* f(pstate, event);
            // parser rejected an event
            if (typeof result === "object")
            {
                // event handler rejected the event it was initially given
                if (result === event)
                {
                    throw new Error("BattleParser rejected an event: " +
                        `'${JSON.stringify(event)}'`);
                }
                event = result;
            }
            // true indicates a detected permanent halt
            else if (result) break;
            // falsy indicates continue
            else event = yield;
        }
    };
}

/**
 * Creates a sub-parser event loop within a SubParser context.
 * @param f Event handler function. This will be called on newly-yielded
 * BattleEvents until it returns a truthy value, either a BattleEvent if the
 * event was rejected or `true` if a permanent halt event was detected.
 */
export async function* eventLoop(f: (event: events.Any) => SubParser): SubParser
{
    let result: void | boolean | events.Any;
    while (!(result = yield* f(yield)));
    return result;
}
