/** @file Useful BattleParser-related helper functions. */
import {Protocol} from "@pkmn/protocol";
import {Event} from "../../../parser";
import {BattleAgent} from "../agent";
import {FormatType, State} from "../formats";
import {BattleParser, BattleParserContext} from "./BattleParser";
import {BattleIterator, IteratorPair} from "./iterators";

/**
 * Config for {@link startBattleParser}.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 */
export interface StartBattleParserArgs<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
> extends Omit<BattleParserContext<T, TAgent>, "iter" | "state"> {
    /**
     * Gets or constructs the battle state tracker object that will be used by
     * the BattleParser. Only called once.
     */
    readonly getState: () => State<T>;
}

/**
 * Initializes a BattleParser.
 *
 * @template T Format type.
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
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
>(
    cfg: StartBattleParserArgs<T, TAgent>,
    parser: BattleParser<T, TAgent, TArgs, TResult>,
    ...args: TArgs
): {iter: BattleIterator; finish: Promise<TResult>} {
    const {eventIt, battleIt} = new IteratorPair();
    const ctx: BattleParserContext<T, TAgent> = {
        agent: cfg.agent,
        iter: eventIt,
        logger: cfg.logger,
        sender: cfg.sender,
        state: cfg.getState(),
    };
    const finish = (async function asyncBattleParserCtx() {
        try {
            const result = await parser(ctx, ...args);
            await eventIt.return?.();
            await battleIt.return?.();
            return result;
        } catch (e) {
            // If the BattleParser threw an exception, make sure both iterators
            // also get the error to settle any pending next() calls.
            // TODO: Wrap errors to preserve current stack and make it clear in
            // the logs that the next() errors came from these rethrows here.
            // TODO: Also include startBattleParser() parent's stack?
            await eventIt.throw?.(e);
            await battleIt.throw?.(e);
            // Rethrow the error here so that the final Promise as well as the
            // last iterator.next() Promises contain the error.
            throw e;
        }
    })();
    return {iter: battleIt, finish};
}

/**
 * Maps an event type to a BattleParser handler.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TArgs Additional parameter types.
 * @template TResult Result type.
 */
export type EventHandlerMap<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
> = {
    readonly [_ in Protocol.ArgName]?: BattleParser<T, TAgent, TArgs, TResult>;
};

/**
 * Creates a BattleParser that dispatches to an appropriate event handler using
 * the given map, or can return `null` if there are no events left or there is
 * no handler defined to handle it.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TArgs Additional parameter types.
 * @template TResult Result type.
 * @param handlers Map of event handlers.
 */
export function dispatcher<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
>(
    handlers: EventHandlerMap<T, TAgent, TArgs, TResult>,
): BattleParser<T, TAgent, TArgs, TResult | null> {
    return async function eventDispatcher(
        ctx: BattleParserContext<T, TAgent>,
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
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TArgs Additional parameter types.
 * @template TResult Result type.
 * @param ctx Parser context.
 * @param parser Parser function to use.
 * @param args Args to supply to the parser.
 * @returns All of the returned `TResult`s in an array.
 */
export async function eventLoop<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
>(
    ctx: BattleParserContext<T, TAgent>,
    parser: BattleParser<T, TAgent, TArgs, TResult>,
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
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @param ctx Parser context.
 * @throws Error if there are no events left.
 */
export async function peek<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
>(ctx: BattleParserContext<T, TAgent>): Promise<Event> {
    const event = await tryPeek(ctx);
    if (!event) {
        throw new Error("Expected event");
    }
    return event;
}

/**
 * Peeks at the next event.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @param ctx Parser context.
 * @returns The next event, or `undefined` if there are no events left.
 */
export async function tryPeek<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
>(ctx: BattleParserContext<T, TAgent>): Promise<Event | undefined> {
    const result = await ctx.iter.peek();
    return result.done ? undefined : result.value;
}

/**
 * Peeks and verifies the next event according to the given event type.
 *
 * @template TName Event type identifier.
 * @template T Format type.
 * @param ctx Parser context.
 * @param expectedKey Expected event type.
 * @returns The next event if it matches, "null` if it doesn't match, or
 * `undefined" if there are no events left.
 */
export async function tryVerify<
    TName extends Protocol.ArgName,
    T extends FormatType = FormatType,
>(
    ctx: BattleParserContext<T>,
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
 * @template T Format type.
 * @param ctx Parser context.
 * @param expectedKey Expected event type.
 * @throws Error if the event type doesn't match or if there are no events left.
 */
export async function verify<
    TName extends Protocol.ArgName,
    T extends FormatType = FormatType,
>(
    ctx: BattleParserContext<T>,
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
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @param ctx Parser context.
 * @throws Error if there are no events left.
 */
export async function consume<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
>(ctx: BattleParserContext<T, TAgent>): Promise<Event> {
    const result = await ctx.iter.next();
    if (result.done) {
        throw new Error("Expected event");
    }
    return result.value;
}
