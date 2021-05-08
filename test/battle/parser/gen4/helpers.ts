import { expect } from "chai";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { BattleIterator, BattleParser, BattleParserConfig, startBattleParser,
    StartBattleParserArgs, SubParser, SubParserConfig, SubParserResult } from
    "../../../../src/battle/parser/BattleParser";
import { dispatch } from "../../../../src/battle/parser/gen4/base";
import { baseEventLoop } from "../../../../src/battle/parser/helpers";
import { BattleState, ReadonlyBattleState } from
    "../../../../src/battle/state/BattleState";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { smeargle } from "../../../helpers/switchOptions";
import { BattleParserContext, ParserContext } from "./Context";

// TODO: should this be merged with ParserContext?
/**
 * Helper class for manipulating the ParserContext.
 * @template TResult Return type of the BattleParser/SubParser.
 */
export class ParserHelpers<TResult = any>
{
    /**
     * Whether the BattleParser threw an exception and it has already been
     * handled or tested. This is so that `#close()` doesn't rethrow the error
     * while awaiting the `ParserContext#finish` Promise.
     */
    private errored = false;

    /**
     * Constructs parser helper functions.
     * @param pctx Function that gets the ParserContext. This is called each
     * time a method wants to access the ParserContext in order to provide a
     * level of indirection in case it gets reassigned later.
     * @param state BattleState getter function.
     */
    constructor(private readonly pctx: () => ParserContext<TResult>,
        private readonly state: () => ReadonlyBattleState) {}

    /**
     * Fully closes the current BattleParser and resets the state for the next
     * test.
     */
    public async close(): Promise<void>
    {
        try
        {
            // use ?. in case pctx wasn't initialized yet
            await this.pctx()?.battleIt.return();
            // the only way for the finish Promise to throw would be if the
            //  underlying iterators also threw, and so they should've been
            //  handled by the time we get here
            if (!this.errored) await this.pctx()?.finish;
            else await expect(this.pctx()?.finish).to.eventually.be.rejected;
        }
        catch (e) { throw e; }
        // reset error state for the next test
        finally { this.errored = false; }
    }

    /**
     * Handles an event normally.
     * @param event Event to handle.
     */
    public async handle(event: events.Any): Promise<void>
    {
        const result = await this.next(event);
        expect(result).to.not.have.property("done", true);
        // override error message so we don't end up printing the entire state
        expect(result).to.have.property("value");
        expect(result).to.have.property("value", this.state(),
            "Returned BattleState doesn't match");
    }

    // TODO: make ret required
    /**
     * Handles an event normally that should cause the BattleParser to return.
     * @param event Event to handle.
     * @param ret Optional return value to compare.
     */
    public async handleEnd(event: events.Any, ret?: TResult): Promise<void>
    {
        await this.handle(event);
        await this.return(ret);
    }

    // TODO: make ret required
    /**
     * Handles an event that should reject and cause the BattleParser to return
     * without handling it.
     * @param event Event to handle.
     * @param ret Optional return value to compare.
     */
    public async reject(event: events.Any, ret?: TResult): Promise<void>
    {
        const result = await this.next(event);
        expect(result).to.have.property("done", true);
        expect(result).to.have.property("value", undefined);
        await this.return(ret);
    }

    // TODO: make ret required
    /**
     * Passes a halt event and expects the BattleParser to return.
     * @param event Event to handle.
     * @param ret Optional return value to compare.
     */
    public async halt(ret?: TResult): Promise<void>
    {
        await this.reject({type: "halt", reason: "decide"}, ret);
    }

    /**
     * Expects the BattleParser to return.
     * @param ret Optional return value to compare.
     */
    public async return(ret?: TResult): Promise<void>
    {
        if (ret) await expect(this.pctx().finish).to.eventually.become(ret);
        else await this.pctx().finish;
    }

    /**
     * Handles an event that should throw.
     * @param event Event to handle.
     * @param errorCtor Error type.
     * @param message Optional error message.
     */
    public async rejectError(event: events.Any, errorCtor: ErrorConstructor,
        message?: string): Promise<void>
    {
        await expect(this.next(event))
            .to.eventually.be.rejectedWith(errorCtor, message);
        // exception should propagate to the finish promise as well
        await expect(this.pctx().finish)
            .to.eventually.be.rejectedWith(errorCtor, message);
    }

    /**
     * Passes a halt event and expects the BattleParser to throw.
     * @param errorCtor Error type.
     * @param message Optional error message.
     */
    public async haltError(errorCtor: ErrorConstructor, message?: string):
        Promise<void>
    {
        await this.rejectError({type: "halt", reason: "decide"}, errorCtor,
            message);
    }

    /**
     * Calls the ParserContext's `BattleIterator#next()` while checking for
     * errors.
     */
    private async next(event: events.Any): ReturnType<BattleIterator["next"]>
    {
        try { return await this.pctx().battleIt.next(event); }
        // rethrow while setting error state
        catch (e) { this.errored = true; throw e; }
    }
}

/** Helper class for manipulating the BattleState. */
// tslint:disable-next-line: max-classes-per-file
export class StateHelpers
{
    /**
     * Constructs state helper functions.
     * @param state Function that gets the ParserContext. This is called each
     * time a method wants to access the BattleState in order to provide a level
     * of indirection in case it gets reassigned later.
     */
    constructor(private readonly state: () => BattleState) {}

    /** Initializes a team of pokemon. */
    public initTeam(teamRef: Side, options: readonly events.SwitchOptions[]):
        Pokemon[]
    {
        const team = this.state().teams[teamRef];
        team.size = options.length;
        const result: Pokemon[] = [];
        let i = 0;
        for (const op of options)
        {
            const mon = team.switchIn(op);
            expect(mon, `Switch-in slot ${i++} couldn't be filled`)
                .to.not.be.null;
            result.push(mon!);
        }
        return result;
    }

    /** Initializes a team of one pokemon. */
    public initActive(monRef: Side, options = smeargle): Pokemon
    {
        return this.initTeam(monRef, [options])[0];
    }
}

/**
 * Starts the main gen4 parser.
 * @param startArgs Arguments for starting the BattleParser.
 * @param state Initial battle state that the parser will use.
 * @param parserCtor Function that gives a complete BattleParser once the
 * BattleState is provided. The function and its return value are called
 * immediately, just after constructing the BattleState and BattleIterators.
 * @returns An appropriate ParserContext for the constructed BattleParser.
 */
export function initParser(startArgs: StartBattleParserArgs, state: BattleState,
    parserCtor: (state: BattleState) => BattleParser =
        s => baseEventLoop(dispatch, () => s)):
    BattleParserContext
{
    const parser = parserCtor(state);

    const {iter, finish} = startBattleParser(startArgs, parser);
    return {battleIt: iter, finish};
}

// TODO: thisArg for SubParser?
/**
 * Calls the SubParser within a self-contained BattleParser context.
 * @param startArgs Arguments for starting the BattleParser.
 * @param state Initial battle state that the parser will use.
 * @param sub SubParser to call.
 * @param args SubParser args.
 */
export function setupSubParser<
        TResult extends SubParserResult, TArgs extends any[]>(
    startArgs: StartBattleParserArgs, state: BattleState,
    sub: SubParser<TResult, TArgs>, ...args: TArgs): ParserContext<TResult>
{
    let ret: Promise<TResult> | undefined;
    const pctx = initParser(startArgs, state,
        function (s)
        {
            const wrapper = subParserToBattleParser(() => s, sub, ...args);
            ({ret} = wrapper);
            return wrapper.parser;
        });
    if (!ret) throw new Error("parserCtor wasn't called");
    return {...pctx, finish: pctx.finish.then(() => ret!)};
}

/**
 * Returns a function that calls the SubParser within a self-contained
 * BattleParser context. Can be called multiple times with different SubParser
 * args to start a new Parsercontext. This function is a curried version of
 * `setupSubParser()` with deferred BattleState construction.
 * @param startArgs Arguments for starting the BattleParser.
 * @param stateCtor Function to get the initial battle state that the parser
 * will use. Called once when the returned function is called.
 * @param sub SubParser to call. Called once when the returned function is
 * called.
 */
export function setupSubParserPartial<
        TResult extends SubParserResult, TArgs extends any[]>(
    startArgs: StartBattleParserArgs, stateCtor: () => BattleState,
    sub: SubParser<TResult, TArgs>): (...args: TArgs) => ParserContext<TResult>
{
    return function(...args: TArgs)
    {
        return setupSubParser(startArgs, stateCtor(), sub, ...args);
    };
}

/**
 * Wraps a SubParser into a BattleParser.
 * @param stateCtor Function to get the initial battle state that the parser
 * will use.
 * @param sub SubParser to call.
 * @param args SubParser args.
 * @returns The BattleParser wrapper, as well as a Promise to get the
 * SubParser's return value.
 */
function subParserToBattleParser<
        TResult extends SubParserResult, TArgs extends any[]>(
    stateCtor: () => BattleState, sub: SubParser<TResult, TArgs>,
    ...args: TArgs): {parser: BattleParser, ret: Promise<TResult>}
{
    let retRes: (result: TResult) => void;
    let retRej: (err: Error) => void;
    const ret = new Promise<TResult>(
        (res, rej) => [retRes, retRej] = [res, rej]);
    const parser = async function wrappedSubParser(cfg: BattleParserConfig):
        Promise<BattleState>
    {
        const subConfig: SubParserConfig = {...cfg, state: stateCtor()};
        // send the sub-parser's return value to a separate promise
        try { retRes(await sub(subConfig, ...args)); }
        catch (e) { retRej(e); throw e; }
        return subConfig.state;
    };
    return {parser, ret};
}
