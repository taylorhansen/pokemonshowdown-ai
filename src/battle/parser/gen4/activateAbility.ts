import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import { Pokemon, ReadonlyPokemon } from "../../state/Pokemon";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { eventLoop } from "../helpers";
import { handlers as base } from "./base";
import { createEventInference, EventInference, expectEvents, ExpectEventsResult,
    SubInference, SubReason } from "./EventInference";
import { hasAbility } from "./helpers";

/** Result from `expectAbilities()` and variants like `onStart()`. */
export type ExpectAbilitiesResult = ExpectEventsResult<AbilityResult>;

/**
 * Expects an on-`switchOut` ability to activate.
 * @param eligible Eligible pokemon.
 */
export async function* onSwitchOut(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    const pendingAbilities = getAbilities(pstate, eligible,
        (ability, mon) => ability.canSwitchOut(mon));

    return yield* expectAbilities(pstate, "switchOut", pendingAbilities,
        /*hitBy*/ undefined, lastEvent);
}

/**
 * Expects an on-`start` ability to activate.
 * @param eligible Eligible pokemon.
 */
export async function* onStart(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    const pendingAbilities = getAbilities(pstate, eligible,
        (ability, mon) => ability.canStart(mon));

    return yield* expectAbilities(pstate, "start", pendingAbilities,
        /*hitBy*/ undefined, lastEvent);
}

// TODO: allow for other non-move effects (e.g. abilities/items)
/**
 * Expects an on-`block` ability to activate on a certain blockable effect.
 * @param eligible Eligible pokemon.
 * @param userRef Pokemon reference using the `hitByMove`.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onBlock(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    hitBy: dexutil.MoveAndUserRef, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    // if move user ignores the target's abilities, then this function can't be
    //  called
    const user = pstate.state.teams[hitBy.userRef].active;
    if (ignoresTargetAbility(user))
    {
        return {...lastEvent && {event: lastEvent}, results: []};
    }
    const moveTypes = hitBy.move.getPossibleTypes(user);
    // only the main status effects can be visibly blocked by an ability
    const status = hitBy.move.getMainStatusEffects("hit", user.types);

    const pendingAbilities = getAbilities(pstate, eligible,
        // block move's main status effect
        ability => ability.canBlockStatusEffect(status,
                pstate.state.status.weather.type) ??
            // block move based on its type
            ability.canBlockMoveType(moveTypes, hitBy.move, user) ??
            // block move based on damp, etc
            ability.canBlockEffect(hitBy.move.data.flags?.explosive));

    return yield* expectAbilities(pstate, "block", pendingAbilities, hitBy,
        lastEvent);
}

// TODO: refactor hitByMove to support other unboost effects, e.g. intimidate
/**
 * Expects an on-`tryUnboost` ability to activate on a certain unboost effect.
 * @param eligible Eligible pokemon.
 * @param userRef Pokemon reference using the `hitByMove`.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onTryUnboost(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    hitBy: dexutil.MoveAndUserRef, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    // if move user ignores the target's abilities, then this function can't be
    //  called
    const user = pstate.state.teams[hitBy.userRef].active;
    if (ignoresTargetAbility(user))
    {
        return {...lastEvent && {event: lastEvent}, results: []};
    }

    const boostEffect = hitBy.move.getBoostEffects("hit", user.types);
    let {boosts} = boostEffect;
    if (boostEffect.set) boosts = {};

    const pendingAbilities = getAbilities(pstate, eligible,
        ability => ability.canBlockUnboost(boosts));

    return yield* expectAbilities(pstate, "tryUnboost", pendingAbilities,
        hitBy, lastEvent);
}

/** Checks if a pokemon's ability definitely ignores the target's abilities. */
function ignoresTargetAbility(mon: ReadonlyPokemon): boolean
{
    if (!mon.volatile.suppressAbility)
    {
        const userAbility = mon.traits.ability;
        if ([...userAbility.possibleValues]
            .every(n => userAbility.map[n].flags?.ignoreTargetAbility))
        {
            return true;
        }
    }
    return false;
}

/**
 * Expects an on-`status` ability to activate after afflicting a status
 * condition.
 * @param eligible Eligible pokemon with the status.
 * @param statusType Status that was afflicted.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onStatus(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    statusType: dexutil.StatusType, hitBy?: dexutil.MoveAndUserRef,
    lastEvent?: events.Any): SubParser<ExpectAbilitiesResult>
{
    const pendingAbilities = getAbilities(pstate, eligible,
        (ability, mon) => ability.canStatus(mon, statusType));

    return yield* expectAbilities(pstate, "status", pendingAbilities, hitBy,
        lastEvent);
}

/**
 * Expects an on-`moveDamage` ability (or variants of this condition) to
 * activate.
 * @param eligible Eligible pokemon.
 * @param qualifier The qualifier of which effects the ability may activate.
 * @param userRef Pokemon reference using the `hitByMove`.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onMoveDamage(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    qualifier: "damage" | "contact" | "contactKO",
    hitBy: dexutil.MoveAndUserRef, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    let on: dexutil.AbilityOn;
    switch (qualifier)
    {
        case "damage": on = "moveDamage"; break;
        case "contact": on = "moveContact"; break;
        case "contactKO": on = "moveContactKO"; break;
    }

    const user = pstate.state.teams[hitBy.userRef].active;
    const hitByArg: dexutil.MoveAndUser = {move: hitBy.move, user};
    const pendingAbilities = getAbilities(pstate, eligible,
        (ability, mon) => ability.canMoveDamage(mon, on, hitByArg));

    return yield* expectAbilities(pstate, on, pendingAbilities,
        hitBy, lastEvent);
}

/**
 * Expects an on-`moveDrain` ability to activate.
 * @param eligible Eligible pokemon.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onMoveDrain(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    hitBy: dexutil.MoveAndUserRef, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    const pendingAbilities = getAbilities(pstate, eligible,
        ability => ability.canMoveDrain());

    return yield* expectAbilities(pstate, "moveDrain", pendingAbilities,
        hitBy, lastEvent);
}

/**
 * Filters out ability possibilities that don't match the given predicate.
 * @param monRefs Eligible ability holders.
 * @param f Callback for filtering eligible abilities. Should return a set of
 * reasons that prove the ability should activate, or null if it definitely
 * shouldn't.
 * @returns An object mapping the given `monRefs` keys to Maps of ability
 * possibility name to a SubInference modeling the restrictions on each ability
 * possibility.
 */
function getAbilities(pstate: ParserState,
    monRefs: {readonly [S in Side]?: any},
    f: (ability: dex.Ability, mon: Pokemon, monRef: Side) =>
        Set<SubReason> | null):
    {[S in Side]?: Map<string, SubInference>}
{
    const result: {[S in Side]?: Map<string, SubInference>} = {};
    for (const monRef in monRefs)
    {
        if (!monRefs.hasOwnProperty(monRef)) continue;
        // can't activate ability if suppressed
        const mon = pstate.state.teams[monRef as Side].active;
        if (mon.volatile.suppressAbility) continue;

        // put the callback through each possible ability
        const inferences = new Map<string, SubInference>();
        for (const name of mon.traits.ability.possibleValues)
        {
            const cbResult = f(dex.getAbility(mon.traits.ability.map[name]),
                    mon, monRef as Side);
            if (!cbResult) continue;
            cbResult.add(hasAbility(mon, new Set([name])));
            inferences.set(name, {reasons: cbResult});
        }
        if (inferences.size > 0) result[monRef as Side] = inferences;
    }
    return result;
}

/**
 * Expects an ability activation.
 * @param on Context in which the ability would activate.
 * @param pendingAbilities Eligible ability possibilities.
 * @param hitByMove Move that the eligible ability holders were hit by, if
 * applicable.
 */
function expectAbilities(pstate: ParserState, on: dexutil.AbilityOn,
    pendingAbilities:
        {readonly [S in Side]?: ReadonlyMap<string, SubInference>},
    hitBy?: dexutil.MoveAndUserRef, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    const inferences: EventInference<AbilityResult>[] = [];
    for (const monRef in pendingAbilities)
    {
        if (!pendingAbilities.hasOwnProperty(monRef)) continue;
        const abilities = pendingAbilities[monRef as Side]!;
        inferences.push(createEventInference(new Set(abilities.values()),
            async function* expectAbilitiesTaker(event, accept)
            {
                if (event.type !== "activateAbility") return {event};
                if (event.monRef !== monRef) return {event};

                // match pending ability possibilities with current item event
                const inf = abilities.get(event.ability);
                if (!inf) return {event};

                // indicate accepted event
                accept(inf);
                return yield* activateAbility(pstate, event, on, hitBy);
            }));
    }
    return expectEvents(inferences, lastEvent);
}

/** Context for handling ability activation. */
interface AbilityContext
{
    /** Parser state. */
    readonly pstate: ParserState;
    /** Ability holder. */
    readonly holder: Pokemon;
    /** Ability holder Pokemon reference. */
    readonly holderRef: Side;
    /** Ability data. */
    readonly ability: dex.Ability;
    /** Circumstances in which the ability is activating. */
    readonly on: dexutil.AbilityOn | null;
    /** Move+user-ref that the ability holder was hit by, if applicable. */
    readonly hitBy?: dexutil.MoveAndUserRef;
}

// TODO: make this generic based on activateAbility()'s 'on' argument
/** Result from handling an ActivateAbility event. */
export interface AbilityResult extends SubParserResult
{
    // on-block
    /**
     * Whether the ability is the source of an immunity to the move on
     * `block`.
     */
    immune?: true;
    /** Whether the ability caused the move to fail on `block`. */
    failed?: true;
    /** Status effects being blocked for the ability holder. */
    blockStatus?: {readonly [T in dexutil.StatusType]?: true};

    // on-tryUnboost
    /** Unboost effects being blocked for the ability holder. */
    blockUnboost?: {readonly [T in dexutil.BoostName]?: true};

    // on-moveDrain
    /** Whether an invertDrain ability is activating on `damage`. */
    invertDrain?: true;
}

/**
 * Handles events within the context of an ability activation. Returns the last
 * event that it didn't handle.
 * @param on Context in which the ability is activating.
 * @param hitBy Move+user that the ability holder was hit by, if applicable.
 */
export async function* activateAbility(pstate: ParserState,
    initialEvent: events.ActivateAbility, on: dexutil.AbilityOn | null = null,
    hitBy?: dexutil.MoveAndUserRef): SubParser<AbilityResult>
{
    const ability = dex.getAbility(initialEvent.ability);
    if (!ability) throw new Error(`Unknown ability '${initialEvent.ability}'`);

    const ctx: AbilityContext =
    {
        pstate, holder: pstate.state.teams[initialEvent.monRef].active,
        holderRef: initialEvent.monRef, ability, on, ...hitBy && {hitBy}
    };

    // infer ability being activated
    ctx.holder.setAbility(ctx.ability.data.name);

    // handle supported ability effects
    const baseResult = yield* dispatchEffects(ctx);

    // handle other ability effects (TODO: support)
    const result = yield* eventLoop(async function* loop(event): SubParser
    {
        switch (event.type)
        {
            case "activateFieldEffect": // weather ability
                if (event.start && dexutil.isWeatherType(event.effect) &&
                    weatherAbilities[event.effect] === ctx.ability.data.name)
                {
                    // fill in infinite duration (gen3-4) and source
                    return yield* base.activateFieldEffect(pstate, event,
                        ctx.holder, /*weatherInfinite*/ true);
                }
                break;
        }
        return {event};
    }, baseResult.event);
    return {...baseResult, ...result};
}

/**
 * Dispatches the effects of an ability. Assumes that the initial
 * activateAbility event has already been handled.
 * @param ctx Ability SubParser context.
 */
async function* dispatchEffects(ctx: AbilityContext): SubParser<AbilityResult>
{
    switch (ctx.on)
    {
        case "switchOut":
            return yield* ctx.ability.onSwitchOut(ctx.pstate, ctx.holderRef);
        case "start":
            return yield* ctx.ability.onStart(ctx.pstate, ctx.holderRef);
        case "block":
            return yield* ctx.ability.onBlock(ctx.pstate, ctx.holderRef,
                ctx.hitBy);
        case "tryUnboost":
            return yield* ctx.ability.onTryUnboost(ctx.pstate);
        case "status":
            return yield* ctx.ability.onStatus(ctx.pstate, ctx.holderRef);
        case "moveContactKO": case "moveContact": case "moveDamage":
            return yield* ctx.ability.onMoveDamage(ctx.pstate, ctx.on,
                ctx.holderRef, ctx.hitBy);
        case "moveDrain":
            return yield* ctx.ability.onMoveDrain(ctx.pstate,
                ctx.hitBy?.userRef);
        default:
            // TODO: throw once parsers can fully track ability activation
            return {};
    }
}

// TODO: track weather in AbilityData

// TODO: move to dex ability effects
/** Maps weather type to the ability that can cause it. */
const weatherAbilities: {readonly [T in dexutil.WeatherType]: string} =
{
    Hail: "snowwarning", RainDance: "drizzle", Sandstorm: "sandstream",
    SunnyDay: "drought"
};
