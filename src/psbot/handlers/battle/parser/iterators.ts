/** @file Defines iterator types used by BattleParsers. */
import {Event} from "../../../parser";

/**
 * Holds two corresponding iterators, one for sending BattleEvents and the other
 * for receiving them.
 */
export class IteratorPair {
    /** Event iterator for receiving events in a BattleParserContext. */
    public readonly eventIt: EventIterator;
    /** Battle iterator for sending events to the BattleParser. */
    public readonly battleIt: BattleIterator;

    private nextEventPromise: Promise<Event | undefined> | null = null;
    private nextEventRes: ((event?: Event) => void) | null = null;

    private battlePromise: Promise<boolean> | null = null;
    private battleRes: ((done: boolean | PromiseLike<boolean>) => void) | null =
        null;

    /**
     * Creates a pair of corresponding AsyncIterators, one for sending
     * BattleEvents to the BattleParser and one for receiving them in a
     * BattleParserContext.
     *
     * Note that `#next()` or `#peek()` cannot be called on a single iterator
     * more than once if the first call hadn't resolved yet.
     */
    public constructor() {
        this.eventIt = {
            next: async () => await this.eventNext(),
            peek: async () => await this.eventPeek(),
            return: async () => await this.eventReturn(),
        };
        this.battleIt = {
            next: async (...args) => await this.battleNext(...args),
            return: async () => await this.battleReturn(),
        };
    }

    /** Implementation for {@link EventIterator.next}. */
    private async eventNext(): Promise<IteratorResult<Event, void>> {
        // Indicate that we're receiving the next event
        if (this.battleRes) {
            this.battleRes(false /*done*/);
        } else {
            this.battlePromise = Promise.resolve(false);
        }

        // Wait for a response or consume the cached response
        this.nextEventPromise ??= new Promise(res => (this.nextEventRes = res));
        const event = await this.nextEventPromise.finally(
            () => (this.nextEventPromise = this.nextEventRes = null),
        );

        if (!event) {
            return {value: undefined, done: true};
        }
        return {value: event};
    }

    /** Implementation for {@link EventIterator.peek}. */
    private async eventPeek(): Promise<IteratorResult<Event, void>> {
        // Wait for a response and cache it, or get the cached response.
        this.nextEventPromise ??= new Promise(res => (this.nextEventRes = res));
        const event = await this.nextEventPromise.finally(
            () => (this.nextEventRes = null),
        );

        if (!event) {
            return {value: undefined, done: true};
        }
        return {value: event};
    }

    /** Implementation for {@link EventIterator.return}. */
    private async eventReturn(): Promise<IteratorReturnResult<void>> {
        this.disableEvent();

        // Resolve any pending iterator calls so they don't hang.
        this.nextEventRes?.();
        await this.battleIt.return?.();

        return {value: undefined, done: true};
    }

    /** Disables the EventIterator and activates cleanup. */
    private disableEvent() {
        this.eventIt.next =
            this.eventIt.peek =
            this.eventIt.return =
            this.eventIt.throw =
                async () =>
                    await Promise.resolve({value: undefined, done: true});
    }

    /** Implementation for {@link BattleIterator.next}. */
    private async battleNext(
        event?: Event,
    ): Promise<IteratorResult<void, void>> {
        // Send the next event.
        if (this.nextEventRes) {
            this.nextEventRes(event);
        } else {
            this.nextEventPromise = Promise.resolve(event);
        }

        // Wait for a response or consume the cached response.
        this.battlePromise ??= new Promise(res => (this.battleRes = res));
        const done = await this.battlePromise.finally(
            () => (this.battlePromise = this.battleRes = null),
        );

        return {value: undefined, done};
    }

    /** Implementation for {@link BattleIterator.return}. */
    private async battleReturn(): Promise<IteratorReturnResult<void>> {
        this.disableBattle();

        // Resolve any pending battleIt.next() calls.
        this.battleRes?.(true /*done*/);

        // Make sure the corresponding iterator doesn't hang.
        await this.eventIt.return?.();

        return {value: undefined, done: true};
    }

    /** Disables the BattleIterator and activates cleanup. */
    private disableBattle() {
        this.battleIt.next =
            this.battleIt.return =
            this.battleIt.throw =
                async () =>
                    await Promise.resolve({value: undefined, done: true});
    }
}

/**
 * Iterator for receiving the next event, includeing a peek operation.
 *
 * Calling {@link return} will call the same respective method of the
 * corresponding {@link BattleIterator} and resolve/reject any pending
 * {@link next}/{@link peek} promises.
 */
export interface EventIterator
    extends PeekableAsyncIterator<Event, void, void> {
    /**
     * Peeks at the next event.
     *
     * @override
     */
    peek: () => Promise<IteratorResult<Event, void>>;
}

/**
 * Iterator for sending the next event to the BattleParser.
 *
 * Calling {@link next} will resolve once the corresponding
 * {@link EventIterator} consumes it via {@link EventIterator.next}.
 *
 * Calling {@link return} will call the same respective method of the
 * corresponding {@link BattleIterator} and resolve/reject any pending
 * {@link next} promises.
 */
export type BattleIterator = AsyncIterator<void, void, Event>;

/** AsyncIterator with peek operation. */
interface PeekableAsyncIterator<T, TReturn = unknown, TNext = unknown>
    extends AsyncIterator<T, TReturn, TNext> {
    /** Gets the next `T`/`TReturn` without consuming it. */
    peek: () => Promise<IteratorResult<T, TReturn>>;
}
