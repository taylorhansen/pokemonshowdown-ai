import {expect} from "chai";
import {Event} from "../../../../../parser";
import {BattleIterator} from "../../../parser";
import {ParserContext} from "./Context.test";

// TODO: Should this be merged with ParserContext?
/**
 * Helper class for manipulating the {@link ParserContext}.
 *
 * @template TResult Return type of the BattleParser/SubParser.
 */
export class ParserHelpers<TResult = unknown> {
    /**
     * Whether the BattleParser threw an exception and it has already been
     * handled or tested. This is so that {@link ParserHelpers.close} doesn't
     * rethrow the error while awaiting the {@link ParserContext.finish}
     * Promise.
     */
    private handledError = false;

    /**
     * Constructs parser helper functions.
     *
     * @param pctx Function that gets the {@link ParserContext}. This is called
     * each time a method wants to access the ParserContext in order to provide
     * a level of indirection in case it gets reassigned later in a separate
     * test.
     */
    public constructor(
        private readonly pctx: () => ParserContext<TResult> | undefined,
    ) {}

    /**
     * Fully closes the current BattleParser and resets the state for the next
     * test.
     *
     * Should be invoked at the end of a test or in an {@link afterEach} block.
     */
    public async close(): Promise<void> {
        try {
            await this.pctx()?.battleIt.return?.();
            // The only way for the finish Promise to reject would be if the
            // underlying BattleIterators also threw, and so they should've
            // been handled via expect() by the time we get to this point.
            if (!this.handledError) {
                await this.pctx()?.finish;
            } else {
                await expect(this.guaranteePctx().finish).to.eventually.be
                    .rejected;
            }
        } finally {
            // Reset error state for the next test.
            this.handledError = false;
        }
    }

    /**
     * Handles an event normally.
     *
     * @param event Event to handle.
     */
    public async handle(event: Event): Promise<void> {
        const result = await this.next(event);
        expect(result).to.not.have.property("done", true);
        expect(result).to.have.property("value", undefined);
    }

    /**
     * Handles an event that should reject and cause the BattleParser to return
     * without consuming it.
     *
     * @param event Event to handle.
     */
    public async reject(event: Event): Promise<void> {
        const result = await this.next(event);
        expect(result).to.have.property("done", true);
        expect(result).to.have.property("value", undefined);
    }

    /**
     * Expects the BattleParser to throw.
     *
     * @param event Event to handle.
     * @param errorCtor Error type.
     * @param message Optional error message.
     */
    public async error(
        errorCtor: ErrorConstructor,
        message?: string | RegExp,
    ): Promise<void> {
        await expect(this.guaranteePctx().finish).to.eventually.be.rejectedWith(
            errorCtor,
            message,
        );
        this.handledError = true;
    }

    // TODO: Why not just return TResult and let the caller make its own
    // assertions?
    /**
     * Expects the BattleParser to return after handling all the events or after
     * rejecting one.
     *
     * @param ret Return value to compare, or a callback to verify it.
     */
    public async return(
        ret: TResult | ((ret: Promise<TResult>) => PromiseLike<unknown>),
    ): Promise<void> {
        if (typeof ret === "function") {
            const f = ret as (ret: Promise<TResult>) => PromiseLike<unknown>;
            await f(this.guaranteePctx().finish);
        } else {
            await expect(this.guaranteePctx().finish).to.eventually.become(ret);
        }
    }

    /**
     * Calls the ParserContext's {@link BattleIterator.next} while checking for
     * errors.
     */
    private async next(event: Event): ReturnType<BattleIterator["next"]> {
        try {
            return await this.guaranteePctx().battleIt.next(event);
        } catch (e) {
            // Rethrow while setting error state.
            // If the caller expected this and handled it, we'll be able to
            // continue as normal with #close() expecting the same error.
            this.handledError = true;
            throw e;
        }
    }

    /** Wraps an assertion around the ParserContext getter function. */
    private guaranteePctx(): ParserContext<TResult> {
        const pctx = this.pctx();
        if (!pctx) {
            throw new Error("ParserContext not initialized");
        }
        return pctx;
    }
}
