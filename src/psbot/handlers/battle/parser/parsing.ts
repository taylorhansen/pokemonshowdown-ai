/** @file Useful BattleParser-related helper functions. */
import {Protocol} from "@pkmn/protocol";
import {WrappedError} from "../../../../util/errors/WrappedError";
import {Event} from "../../../parser";
import {BattleAgent} from "../agent";
import {BattleState} from "../state";
import {BattleParser, BattleParserContext} from "./BattleParser";
import {BattleIterator, IteratorPair} from "./iterators";

/**
 * Config for {@link startBattleParser}.
 *
 * @template TAgent Battle agent type.
 */
export interface StartBattleParserArgs<TAgent extends BattleAgent = BattleAgent>
    extends Omit<BattleParserContext<TAgent>, "iter" | "state"> {
    /**
     * Gets or constructs the battle state tracker object that will be used by
     * the BattleParser. Only called once.
     */
    readonly getState: () => BattleState;
}

/**
 * Initializes a BattleParser.
 *
 * @template TAgent Battle agent type.
 * @template TArgs Additional parameter types.
 * @template TResult Result type.
 * @param cfg Parser config.
 * @param parser Parser function to call.
 * @param args Additional args to supply to the parser.
 * @returns An iterator for sending TEvents to the BattleParser, as well as a
 * Promise that resolves when the BattleParser returns or throws. Note that if
 * one of the iterators throws then the promise returned by this function will
 * throw the same error, which must be caught immediately or the process will
 * log an uncaught promise rejection (which can crash Workers during training).
 */
export function startBattleParser<
    TAgent extends BattleAgent = BattleAgent,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
>(
    cfg: StartBattleParserArgs<TAgent>,
    parser: BattleParser<TAgent, TArgs, TResult>,
    ...args: TArgs
): {iter: BattleIterator; finish: Promise<TResult>} {
    const {eventIt, battleIt} = new IteratorPair();
    const ctx: BattleParserContext<TAgent> = {
        agent: cfg.agent,
        iter: eventIt,
        logger: cfg.logger,
        sender: cfg.sender,
        state: cfg.getState(),
    };
    const finish = (async function asyncBattleParserCtx() {
        try {
            return await parser(ctx, ...args);
        } catch (e) {
            // Wrap the error here so that the stack trace of whoever's awaiting
            // the finish promise is included.
            throw new WrappedError(
                e as Error,
                msg => "BattleParser error: " + msg,
            );
        } finally {
            // Resolve any pending iterator.next() calls.
            await eventIt.return?.();
            await battleIt.return?.();
        }
    })();
    return {iter: battleIt, finish};
}

/**
 * Maps an event type to a BattleParser handler.
 *
 * @template TAgent Battle agent type.
 * @template TArgs Additional parameter types.
 * @template TResult Result type.
 */
export type EventHandlerMap<
    TAgent extends BattleAgent = BattleAgent,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
> = {
    readonly [_ in Protocol.ArgName]?: BattleParser<TAgent, TArgs, TResult>;
};

/**
 * Creates a BattleParser that dispatches to an appropriate event handler using
 * the given map, or can return `null` if there are no events left or there is
 * no handler defined to handle it.
 *
 * @template TAgent Battle agent type.
 * @template TArgs Additional parameter types.
 * @template TResult Result type.
 * @param handlers Map of event handlers.
 */
export function dispatcher<
    TAgent extends BattleAgent = BattleAgent,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
>(
    handlers: EventHandlerMap<TAgent, TArgs, TResult>,
): BattleParser<TAgent, TArgs, TResult | null> {
    return async function eventDispatcher(
        ctx: BattleParserContext<TAgent>,
        ...args: TArgs
    ): Promise<TResult | null> {
        const event = await tryPeek(ctx);
        if (!event) {
            return null;
        }
        const key = Protocol.key(event.args);
        if (!key) {
            return null;
        }
        const handler = handlers[key];
        if (!handler) {
            return null;
        }
        return await handler(ctx, ...args);
    };
}

/**
 * Keeps calling a BattleParser with the given args until it doesn't consume an
 * event or until the end of the event stream.
 *
 * @template TAgent Battle agent type.
 * @template TArgs Additional parameter types.
 * @template TResult Result type.
 * @param ctx Parser context.
 * @param parser Parser function to use.
 * @param args Args to supply to the parser.
 * @returns All of the returned `TResult`s in an array.
 */
export async function eventLoop<
    TAgent extends BattleAgent = BattleAgent,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
>(
    ctx: BattleParserContext<TAgent>,
    parser: BattleParser<TAgent, TArgs, TResult>,
    ...args: TArgs
): Promise<TResult[]> {
    const results: TResult[] = [];

    while (true) {
        // No more events to parse.
        const preEvent = await tryPeek(ctx);
        if (!preEvent) {
            break;
        }

        results.push(await parser(ctx, ...args));

        // Can't parse any more events.
        const postEvent = await tryPeek(ctx);
        if (preEvent === postEvent) {
            break;
        }
    }
    return results;
}

/**
 * Peeks at the next event.
 *
 * @template TAgent Battle agent type.
 * @param ctx Parser context.
 * @throws Error if there are no events left.
 */
export async function peek(ctx: BattleParserContext): Promise<Event> {
    const event = await tryPeek(ctx);
    if (!event) {
        throw new Error("Expected event");
    }
    return event;
}

/**
 * Peeks at the next event.
 *
 * @param ctx Parser context.
 * @returns The next event, or `undefined` if there are no events left.
 */
export async function tryPeek(
    ctx: BattleParserContext,
): Promise<Event | undefined> {
    const result = await ctx.iter.peek();
    return result.done ? undefined : result.value;
}

/**
 * Peeks and verifies the next event according to the given event type.
 *
 * @template TName Event type identifier.
 * @param ctx Parser context.
 * @param expectedKey Expected event type.
 * @returns The next event if it matches, `null` if it doesn't match, or
 * `undefined` if there are no events left.
 */
export async function tryVerify<TName extends Protocol.ArgName>(
    ctx: BattleParserContext,
    ...expectedKeys: TName[]
): Promise<Event<TName> | null | undefined> {
    const event = await tryPeek(ctx);
    if (!event) {
        return;
    }

    const key = Protocol.key(event.args);
    if (!key || !expectedKeys.includes(key as TName)) {
        return null;
    }
    return event as Event<TName>;
}

/**
 * Peeks and verifies the next event according to the given event type.
 *
 * @template TName Event type identifier.
 * @param ctx Parser context.
 * @param expectedKey Expected event type.
 * @throws Error if the event type doesn't match or if there are no events left.
 */
export async function verify<TName extends Protocol.ArgName>(
    ctx: BattleParserContext,
    ...expectedKeys: TName[]
): Promise<Event<TName>> {
    const event = await peek(ctx);

    const key = Protocol.key(event.args);
    if (!key || !expectedKeys.includes(key as TName)) {
        throw new Error(
            "Invalid event: Expected type " +
                `[${expectedKeys.map(k => `'${k}'`).join(", ")}] but got ` +
                `'${key}'`,
        );
    }
    return event as Event<TName>;
}

/**
 * Consumes an event.
 *
 * @template TAgent Battle agent type.
 * @param ctx Parser context.
 * @throws Error if there are no events left.
 */
export async function consume<TAgent extends BattleAgent = BattleAgent>(
    ctx: BattleParserContext<TAgent>,
): Promise<Event> {
    const result = await ctx.iter.next();
    if (result.done) {
        throw new Error("Expected event");
    }
    return result.value;
}
