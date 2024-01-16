/** @file Useful BattleParser-related helper functions. */
import {Protocol} from "@pkmn/protocol";
import {Event} from "../../protocol/Event";
import {BattleAgent} from "../agent";
import {BattleParser, BattleParserContext} from "./BattleParser";

/**
 * Maps an event type to a BattleParser handler.
 *
 * @template TAgent Battle agent type.
 * @template TArgs Additional parameter types.
 * @template TResult Result type.
 */
export type EventHandlerMap<TAgent extends BattleAgent = BattleAgent> = {
    readonly [_ in Protocol.ArgName]?: BattleParser<TAgent>;
};

/**
 * Creates a BattleParser that dispatches to an appropriate event handler using
 * the given map. Does nothing on unknown events.
 *
 * @template TAgent Battle agent type.
 * @template TArgs Additional parameter types.
 * @template TResult Result type.
 * @param handlers Map of event handlers.
 */
export function createDispatcher<TAgent extends BattleAgent = BattleAgent>(
    handlers: EventHandlerMap<TAgent>,
): BattleParser<TAgent> {
    return async function eventDispatcher(
        ctx: BattleParserContext<TAgent>,
        event: Event,
    ): Promise<void> {
        const key = Protocol.key(event.args);
        if (!key) {
            return;
        }
        const handler = handlers[key];
        if (!handler) {
            return;
        }
        await handler(ctx, event);
    };
}

/** Creates a BattleParser that does nothing but verifies a given event type. */
export function defaultParser<TName extends Protocol.ArgName>(
    key: TName,
): BattleParser {
    return eventParser(key, async () => await Promise.resolve());
}

/** Creates a BattleParser that logs an error for an unsupported event type. */
export function unsupportedParser<TName extends Protocol.ArgName>(
    key: TName,
): BattleParser {
    return eventParser(key, async ctx => {
        ctx.logger.error(`Unsupported event type '${key}'`);
        return await Promise.resolve();
    });
}

/** Creates a BattleParser for a specific event type. */
export function eventParser<
    TName extends Protocol.ArgName,
    TAgent extends BattleAgent = BattleAgent,
>(
    key: TName,
    f: (
        ctx: BattleParserContext<TAgent>,
        event: Event<TName>,
    ) => void | Promise<void>,
): BattleParser<TAgent> {
    return async function eventParserImpl(ctx, event) {
        verify(key, event);
        return await f(ctx, event);
    };
}

/**
 * Asserts an event's type.
 *
 * @template TName Expected event type.
 * @param expectedKey Expected event type.
 * @param event Actual event.
 */
export function verify<TName extends Protocol.ArgName>(
    expectedKey: TName,
    event: Event,
): asserts event is Event<TName> {
    const key = Protocol.key(event.args);
    if (key !== expectedKey) {
        throw new Error(
            `Expected event type '${expectedKey}' but got '${key}'`,
        );
    }
}
