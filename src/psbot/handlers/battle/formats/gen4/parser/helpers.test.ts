/** @file Helpers for unit testing BattleParsers. */
import { Protocol } from "@pkmn/protocol";
import { FieldCondition, ID, SideCondition, SideID, TypeName, Weather } from
    "@pkmn/types";
import { expect } from "chai";
import { toIdName } from "../../../../../helpers";
import { Event } from "../../../../../parser";
import { BattleAgent } from "../../../agent";
import { BattleIterator, BattleParser, BattleParserContext } from
    "../../../parser";
import { startBattleParser, StartBattleParserArgs } from
    "../../../parser/helpers";
import * as unordered from "../../../parser/unordered";
import { FormatType } from "../../formats";
import * as dex from "../dex";
import { BattleState } from "../state/BattleState";
import { Pokemon } from "../state/Pokemon";
import { smeargle } from "../state/switchOptions.test";
import { SwitchOptions } from "../state/Team";
import { ParserContext } from "./Context.test";

// TODO: should this be merged with ParserContext?
/**
 * Helper class for manipulating the ParserContext.
 * @template TResult Return type of the BattleParser/SubParser.
 */
export class ParserHelpers<TResult = unknown>
{
    /**
     * Whether the BattleParser threw an exception and it has already been
     * handled or tested. This is so that {@link ParserHelpers.close} doesn't
     * rethrow the error while awaiting the {@link ParserContext.finish}
     * Promise.
     */
    private handledError = false;

    /**
     * Constructs parser helper functions.
     * @param pctx Function that gets the {@link ParserContext}. This is called
     * each time a method wants to access the ParserContext in order to provide
     * a level of indirection in case it gets reassigned later.
     */
    constructor(private readonly pctx: () => ParserContext<TResult> | undefined)
    {}

    /**
     * Fully closes the current BattleParser and resets the state for the next
     * test. Should be invoked at the end of a test or in an {@link afterEach}
     * block.
     */
    public async close(): Promise<void>
    {
        try
        {
            // use ?. in case pctx wasn't initialized yet
            await this.pctx()?.battleIt.return();
            // the only way for the finish Promise to reject would be if the
            //  underlying BattleIterators also threw, and so they should've
            //  been handled via expect() by the time we get to this point
            if (!this.handledError) await this.pctx()?.finish;
            else
            {
                await expect(this.guaranteePctx().finish)
                    .to.eventually.be.rejected;
            }
        }
        catch (e) { throw e; }
        // reset error state for the next test
        finally { this.handledError = false; }
    }

    /**
     * Handles an event normally.
     * @param event Event to handle.
     */
    public async handle(event: Event): Promise<void>
    {
        const result = await this.next(event);
        expect(result).to.not.have.property("done", true);
        expect(result).to.have.property("value", undefined);
    }

    /**
     * Handles an event that should reject and cause the BattleParser to return
     * without handling it.
     * @param event Event to handle.
     */
    public async reject(event: Event): Promise<void>
    {
        const result = await this.next(event);
        expect(result).to.have.property("done", true);
        expect(result).to.have.property("value", undefined);
    }

    /**
     * Handles an event that should throw.
     * @param event Event to handle.
     * @param errorCtor Error type.
     * @param message Optional error message.
     */
    public async rejectError(event: Event, errorCtor: ErrorConstructor,
        message?: string): Promise<void>
    {
        await expect(this.next(event))
            .to.eventually.be.rejectedWith(errorCtor, message);
        // exception should propagate to the finish promise as well
        await expect(this.guaranteePctx().finish)
            .to.eventually.be.rejectedWith(errorCtor, message);
    }

    /**
     * Passes a halt event and expects the BattleParser to reject it.
     * @param event Event to handle.
     */
    public async halt(): Promise<void>
    {
        await this.reject(
            {args: ["request", "{}" as Protocol.RequestJSON], kwArgs: {}});
    }

    /**
     * Passes a halt event and expects the BattleParser to throw.
     * @param errorCtor Error type.
     * @param message Optional error message.
     */
    public async haltError(errorCtor: ErrorConstructor, message?: string):
        Promise<void>
    {
        await this.rejectError(
            {args: ["request", "{}" as Protocol.RequestJSON], kwArgs: {}},
            errorCtor, message);
    }

    /**
     * Expects the BattleParser to return after handling all the events or after
     * rejecting one.
     * @param ret Return value to compare, or a callback to verify it.
     */
    public async return(
        ret: TResult | ((ret: Promise<TResult>) => PromiseLike<unknown>)):
        Promise<void>
    {
        if (typeof ret === "function")
        {
            const f = ret as (ret: Promise<TResult>) => PromiseLike<unknown>;
            await f(this.guaranteePctx().finish);
        }
        else
        {
            await expect(this.guaranteePctx().finish).to.eventually.become(ret);
        }
    }

    /**
     * Calls the ParserContext's `BattleIterator#next()` while checking for
     * errors.
     */
    private async next(event: Event): ReturnType<BattleIterator["next"]>
    {
        try { return await this.guaranteePctx().battleIt.next(event); }
        // rethrow while setting error state
        // if the caller expected this and handled it, we'll be able to continue
        //  as normal with #close() expecting the same error
        catch (e) { this.handledError = true; throw e; }
    }

    private guaranteePctx(): ParserContext<TResult>
    {
        const pctx = this.pctx();
        if (!pctx) throw new Error("ParserContext not initialized");
        return pctx;
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

    /**
     * Initializes a team of pokemon, some of which may be unknown. The last
     * defined one in the array will be switched in if any.
     */
    public initTeam(teamRef: SideID,
        options: readonly (SwitchOptions | undefined)[]): Pokemon[]
    {
        const team = this.state().getTeam(teamRef);
        team.size = options.length;
        const result: Pokemon[] = [];
        let i = 0;
        for (const op of options)
        {
            if (!op) continue;
            const mon = team.switchIn(op);
            expect(mon, `Switch-in slot ${i} couldn't be filled`)
                .to.not.be.null;
            result.push(mon!);
            ++i;
        }
        return result;
    }

    /** Initializes a team of one pokemon. */
    public initActive(monRef: SideID, options = smeargle, size = 1): Pokemon
    {
        const opt = new Array<SwitchOptions | undefined>(size);
        opt[0] = options;
        return this.initTeam(monRef, opt)[0];
    }
}

/**
 * Starts a {@link BattleParser}.
 * @param startArgs Arguments for starting the BattleParser.
 * @param parser Parser to call immediately, just after constructing the
 * BattleState and BattleIterators.
 * @returns An appropriate {@link ParserContext} for the constructed
 * BattleParser.
 */
export function initParser
<
    T extends FormatType = FormatType,
    TArgs extends unknown[] = unknown[],
    TResult = unknown
>(
    startArgs: StartBattleParserArgs<T>,
    parser: BattleParser<T, BattleAgent<T>, TArgs, TResult>,
    ...args: TArgs):
    ParserContext<TResult>
{
    const {iter, finish} = startBattleParser(startArgs, parser, ...args);
    return {battleIt: iter, finish};
}

/**
 * Returns a function that calls the {@link BattleParser} within a
 * self-contained {@link BattleParserContext} and returns the associated
 * {@link ParserContext}. Can be called multiple times with different args to
 * start a new ParserContext. This function is a curried version of
 * {@link initParser} with deferred arguments and {@link BattleState}
 * construction.
 * @param startArgs Initial arguments for starting the BattleParser.
 * @param stateCtor Function to get the initial battle state that the parser
 * will use when the returned function is called.
 * @param parser Parser to call when the returned function is called.
 * @returns A function that takes the rest of the BattleParser's custom `TArgs`
 * before calling `initParser()`.
 */
export function setupBattleParser
<
    T extends FormatType = FormatType,
    TArgs extends unknown[] = unknown[], TResult = unknown
>(
    startArgs: StartBattleParserArgs<T>,
    parser: BattleParser<T, BattleAgent<T>, TArgs, TResult>):
    (...args: TArgs) => ParserContext<TResult>
{
    return (...args: TArgs) => initParser(startArgs, parser, ...args)
}

/**
 * Creates a {@link ParserContext} initialization function for an
 * {@link UnorderedDeadline}.
 * @template T Format type.
 * @template TArgs Parser ctor args, minus the {@link BattleParserContext} which
 * is filled in for the first parameter.
 * @template TResult Parser result. Wrapped into an array by
 * {@link unordered.parse}.
 * @param startArgs Arguments for starting the BattleParser.
 * @param parserCtor Function to create the UnorderedDeadline.
 * @returns A function that initializes a {@link BattleParser} to evaluate the
 * UnorderedDeadline, returning the parser's ParserContext.
 */
export function setupUnorderedDeadline
<
    T extends FormatType = FormatType,
    TArgs extends unknown[] = unknown[],
    TResult = unknown
>(
    startArgs: StartBattleParserArgs<T>,
    parserCtor:
        (ctx: BattleParserContext<T>, ...args: TArgs) =>
            unordered.UnorderedDeadline<T, BattleAgent<T>, TResult>):
    (...args: TArgs) => ParserContext<[] | [TResult]>
{
    return setupBattleParser(startArgs,
        // create a BattleParser that evaluates the UnorderedDeadline
        async (ctx, ...args) =>
            await unordered.parse(ctx, parserCtor(ctx, ...args)));
}

//#region protocol helpers

export function toIdent(side: SideID, opt = smeargle,
    pos: Protocol.PositionLetter = "a"): Protocol.PokemonIdent
{
    const species = dex.pokemon[opt.species];
    return `${side}${pos}: ${species?.display ?? opt.species}` as
        Protocol.PokemonIdent;
}

export function toDetails(opt = smeargle): Protocol.PokemonDetails
{
    const words = [dex.pokemon[opt.species]?.display ?? opt.species];
    if (opt.level !== 100) words.push(`L${opt.level}`);
    if (opt.gender !== "N") words.push(opt.gender);
    return words.join(", ") as Protocol.PokemonDetails;
}

export function toHPStatus(faint: "faint"): Protocol.PokemonHPStatus;
export function toHPStatus(hp: number, maxhp?: number, status?: string):
    Protocol.PokemonHPStatus;
export function toHPStatus(hp: number | "faint", maxhp = 100,
    status?: string): Protocol.PokemonHPStatus
{
    if (hp === "faint") return "0 fnt" as Protocol.PokemonHPStatus;
    let s = `${hp}/${maxhp}`;
    if (status) s += " " + status
    return s as Protocol.PokemonHPStatus;
}

export function toEffectName(name: string): Protocol.EffectName;
// tslint:disable-next-line: unified-signatures
export function toEffectName(id: string, type: "ability" | "item" | "move"):
    Protocol.EffectName;
export function toEffectName(id: string, type?: "ability" | "item" | "move"):
    Protocol.EffectName
{
    let name: string;
    switch (type)
    {
        case "ability": name = toAbilityName(id); break;
        case "item": name = toItemName(id); break;
        case "move": name = toMoveName(id); break;
        default: return id as Protocol.EffectName;
    }
    return `${type}: ${name}` as Protocol.EffectName;
}

export function toAbilityName(id: string): Protocol.AbilityName
{
    return (dex.abilities[id]?.display ?? id) as Protocol.AbilityName;
}

export function toItemName(id: string): Protocol.ItemName
{
    return (dex.items[id]?.display ?? id) as Protocol.ItemName;
}

export function toMoveName(id: string): Protocol.MoveName
{
    return (dex.moves[id]?.display ?? id) as Protocol.MoveName;
}

export function toSpeciesName(id: string): Protocol.SpeciesName
{
    return (dex.pokemon[id]?.display ?? id) as Protocol.SpeciesName;
}

export function toNum(num: number): Protocol.Num
{
    return num.toString() as Protocol.Num;
}

export function toTypes(...types: dex.Type[]): Protocol.Types
{
    return types.map(toTypeName).join("/") as Protocol.Types;
}

export function toTypeName(type: dex.Type): TypeName
{
    return (type[0].toUpperCase() + type.substr(1)) as Capitalize<dex.Type>;
}

export function toMessage(msg: string): Protocol.Message
{
    return msg as Protocol.Message;
}

export function toWeather(weather: dex.WeatherType): Weather
{
    return weather as Weather;
}

export function toFieldCondition(
    effect: Exclude<dex.FieldEffectType, dex.WeatherType>): FieldCondition
{
    return toMoveName(effect) as any as FieldCondition;
}

export function toSideCondition(
    effect: dex.TeamEffectType | dex.ImplicitTeamEffectType): SideCondition
{
    return toMoveName(effect) as any as SideCondition;
}

export function toBoostIDs(...boosts: dex.BoostName[]): Protocol.BoostIDs
{
    return boosts.join(", ") as Protocol.BoostIDs;
}

export function toSide(side: SideID, username: string): Protocol.Side
{
    return `${side}: ${username}` as Protocol.Side;
}

export function toRequestJSON(obj: Protocol.Request): Protocol.RequestJSON
{
    return JSON.stringify(obj) as Protocol.RequestJSON;
}

export function toUsername(username: string): Protocol.Username
{
    return username as Protocol.Username;
}

export function toID(name: string): ID
{
    return toIdName(name) as ID;
}

export function toSearchID(side: SideID, opt = smeargle,
    pos: Protocol.PositionLetter = "a"): Protocol.PokemonSearchID
{
    return `${toIdent(side, opt, pos)}|${toDetails(opt)}` as
        Protocol.PokemonSearchID;
}

export function toFormatName(name: string): Protocol.FormatName
{
    return name as Protocol.FormatName;
}

export function toRule(name: string): Protocol.Rule
{
    return name as Protocol.Rule;
}

//#endregion
