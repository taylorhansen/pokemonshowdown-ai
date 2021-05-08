import { Logger } from "../../Logger";
import { BattleAgent } from "../agent/BattleAgent";
import { Choice } from "../agent/Choice";
import { BattleState, ReadonlyBattleState } from "../state/BattleState";
import * as events from "./BattleEvent";

/** Config for `startBattleParser()`. */
export type StartBattleParserArgs = Omit<BattleParserConfig, "iter">;

/**
 * Initializes a BattleParser.
 * @param cfg Config and dependencies for the BattleParser.
 * @param parser BattleParser to use.
 * @returns An iterator for sending BattleEvents to the BattleParser, as well as
 * a Promise that resolves when the battle is over with the final battle state.
 */
export function startBattleParser(cfg: StartBattleParserArgs,
    parser: BattleParser): {iter: BattleIterator, finish: Promise<BattleState>}
{
    const {eventIt, battleIt} = createBattleEventIterators();
    const finish = (async function asyncBattleParserCtx()
    {
        try
        {
            const result = await parser({...cfg, iter: eventIt});
            // once the parser finishes, terminate both iterators
            await eventIt.return();
            await battleIt.return();
            return result;
        }
        catch (e)
        {
            // if the BattleParser threw an exception, make sure both iterators
            //  also get the error to settle any pending next() calls
            // TODO: wrap errors to preserve current stack and make it clear in
            //  the logs that the next() errors came from these rethrows here
            await eventIt.throw(e);
            await battleIt.throw(e);
            // rethrow the error here so that the final Promise as well as the
            //  last iterator.next() Promises contain the error
            throw e;
        }
    })();
    return {iter: battleIt, finish};
}

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
 * Main entry point parser type for handling events.
 * @param cfg Parser options and dependencies.
 * @returns A Promise that resolves when the battle is over, returning the final
 * battle state after handling all the events.
 */
export type BattleParser<TAgent extends BattleAgent = BattleAgent> =
    (cfg: BattleParserConfig<TAgent>) => Promise<BattleState>;

/** Arguments for BattleParser dependencies. */
export interface BattleParserConfig<TAgent extends BattleAgent = BattleAgent>
{
    /** Function that makes the decisions for this battle. */
    readonly agent: TAgent;
    /**
     * Iterator for getting the next event and logging the latest BattleState.
     */
    readonly iter: EventIterator;
    /** Logger object. */
    readonly logger: Logger;
    /** Function for sending the BattleAgent's Choice to the game. */
    readonly sender: ChoiceSender;
}

/**
 * Sub-parser type used in BattleParser sub-compositions. Essentially represents
 * a parser production in a recursive-descent parser.
 * @template TResult Extend returned SubParserResult.
 * @template TArgs Additional argument types.
 * @param cfg Parser options and dependencies.
 * @param args Additional arguments.
 */
export type SubParser<TResult extends SubParserResult = SubParserResult,
        TArgs extends any[] = any[]> =
    (cfg: SubParserConfig, ...args: TArgs) => Promise<TResult>;

/** Arguments for SubParser dependencies. */
export interface SubParserConfig extends BattleParserConfig
{
    /** Current battle state. */
    readonly state: BattleState;
}

/** Return type of a SubParser. */
export interface SubParserResult
{
    /**
     * Whether a permanent halt event was detected or that no more events can be
     * received.
     */
    permHalt?: true;
}

/**
 * Iterator for retreiving the next event. Also takes the latest BattleState for
 * logging.
 */
export interface EventIterator extends
    PeekableAsyncIterator<events.Any, void, ReadonlyBattleState>
{
    /**
     * Gets the next event.
     * @param state Current BattleState for logging.
     * @override
     */
    next(state: ReadonlyBattleState): Promise<IteratorResult<events.Any, void>>;
    /**
     * Peeks at the next event.
     * @override
     */
    peek(): Promise<IteratorResult<events.Any, void>>;
    /**
     * Finishes the iterator. If this is connected to a BattleIterator, the
     * `#return()` call will be propagated to it.
     * @override
     */
    return(): Promise<IteratorResult<events.Any, void>>;
    /**
     * Finishes the iterator with an error, causing any pending
     * `#next()`/`#peek()` Promises to reject. If this is connected to a
     * BattleIterator, the `#throw()` call will be propagated to it.
     * @override
     */
    throw(e?: any): Promise<IteratorResult<events.Any, void>>;
}

/**
 * Iterator for sending the next event to the BattleParser. Also outputs the
 * latest BattleState for logging.
 */
export interface BattleIterator extends
    AsyncIterator<ReadonlyBattleState, void, events.Any>
{
    /**
     * Sends the next event. Once consumed, the latest BattleState is returned.
     * @override
     */
    next(event: events.Any): Promise<IteratorResult<ReadonlyBattleState, void>>;
    /**
     * Finishes the iterator. If this is connected to an EventIterator, the
     * `#return()` call will be propagated to it.
     * @override
     */
    return(): Promise<IteratorResult<ReadonlyBattleState, void>>;
    /**
     * Finishes the iterator with an error. If this is connected to an
     * EventIterator, the `#throw()` call will be propagated to it.
     * @override
     */
    throw(e?: any): Promise<IteratorResult<ReadonlyBattleState, void>>;
}

/**
 * Creates two corresponding iterators, one for sending BattleEvents and the
 * other for receiving them. Also sends the latest version of the BattleState
 * the other way after handling the received event. Note that `#next()` or
 * `#peek()` cannot be called on a single iterator more than once if the first
 * call hadn't resolved yet.
 * @returns An EventIterator for the BattleParser and a corresponding
 * BattleIterator for the game/sim parser.
 */
function createBattleEventIterators():
    {eventIt: EventIterator, battleIt: BattleIterator}
{
    let error: Error | undefined;

    // TODO: could implement this more easily by using duplex/transform streams?
    let nextEventPromise: Promise<events.Any | undefined> | null = null;
    let nextEventRes: ((event?: events.Any) => void) | null = null;
    let nextEventRej: ((reason?: any) => void) | null = null;
    const eventIt: EventIterator =
    {
        async next(state)
        {
            // give back the new battlestate after handling the last event
            if (battleRes) battleRes(state);
            else battlePromise = Promise.resolve(state);

            // wait for a response or consume the cached response
            nextEventPromise ??= new Promise(
                    (res, rej) => [nextEventRes, nextEventRej] = [res, rej]);
            if (error) nextEventRej!(error);
            const event = await nextEventPromise
                .finally(() =>
                    nextEventPromise = nextEventRes = nextEventRej = null);

            if (!event) return {value: undefined, done: true};
            return {value: event};
        },
        async peek()
        {
            // wait for a response and cache it, or get the cached response
            nextEventPromise ??= new Promise(
                    (res, rej) => [nextEventRes, nextEventRej] = [res, rej]);
            if (error) nextEventRej!(error);
            const event = await nextEventPromise
                .finally(() => nextEventRes = nextEventRej = null);

            if (!event) return {value: undefined, done: true};
            return {value: event};
        },
        async return()
        {
            // disable iterator
            this.next = this.peek = this.return = this.throw =
                async () => ({value: undefined, done: true});

            // resolve any pending eventIt.next()/peek() calls
            nextEventRes?.();

            // make sure the corresponding iterator doesn't hang
            await battleIt.return?.();

            return {value: undefined, done: true};
        },
        async throw(e)
        {
            error = e;
            // disable iterator
            this.next = this.peek = this.return = this.throw =
                async () => ({value: undefined, done: true});

            // resolve any pending eventIt.next()/peek() calls
            nextEventRej?.(e);

            // make sure the corresponding iterator doesn't hang
            await battleIt.throw(e);

            return {value: undefined, done: true};
        }
    };

    let battlePromise: Promise<ReadonlyBattleState | undefined> | null = null;
    let battleRes: ((state?: ReadonlyBattleState) => void) | null = null;
    let battleRej: ((reason?: any) => void) | null = null;
    const battleIt: BattleIterator =
    {
        async next(event)
        {
            // send the next event
            if (nextEventRes) nextEventRes(event);
            else nextEventPromise = Promise.resolve(event);

            // wait for a response or consume the cached response
            battlePromise ??= new Promise(
                    (res, rej) => [battleRes, battleRej] = [res, rej]);
            if (error) battleRej!(error);
            const state = await battlePromise
                .finally(() => battlePromise = battleRes = battleRej = null);

            if (!state) return {value: undefined, done: true};
            return {value: state};
        },
        async return()
        {
            // disable iterator
            this.next = this.return = this.throw =
                async () => ({value: undefined, done: true});

            // resolve any pending battleIt.next() calls
            battleRes?.();

            // make sure the corresponding iterator doesn't hang
            await eventIt.return();

            return {value: undefined, done: true};
        },
        async throw(e)
        {
            error = e;
            // disable iterator
            this.next = this.return = this.throw =
                async () => ({value: undefined, done: true});

            // resolve any pending battleIt.next() calls
            battleRej?.(e);

            // make sure the corresponding iterator doesn't hang
            await eventIt.throw(e);

            return {value: undefined, done: true};
        }
    };
    return {eventIt, battleIt};
}

/** AsyncIterator with peek operation. */
interface PeekableAsyncIterator<T, TReturn = any, TNext = unknown> extends
    AsyncIterator<T, TReturn, TNext>
{
    /** Gets the next T/TReturn without consuming it. */
    peek(): Promise<IteratorResult<T, TReturn>>;
}
