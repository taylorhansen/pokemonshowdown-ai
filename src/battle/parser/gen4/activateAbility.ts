import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import * as effects from "../../dex/effects";
import { Pokemon, ReadonlyPokemon } from "../../state/Pokemon";
import { otherSide, Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser, SubParserResult } from "../BattleParser";
import { eventLoop } from "../helpers";
import { dispatch, handlers as base } from "./base";
import { EventInference, expectEvents } from "./helpers";
import * as parsers from "./parsers";

/** Result from `expectAbilities()` and variants like `onStart()`. */
export interface ExpectAbilitiesResult extends SubParserResult
{
    /** Results from each ability activation. */
    results: AbilityResult[];
}

/**
 * Expects an on-`switchOut` ability to activate.
 * @param eligible Eligible pokemon.
 */
export async function* onSwitchOut(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    const pendingAbilities = getAbilities(pstate, eligible,
        function switchoutFilter(data, monRef)
        {
            if (!data.on?.switchOut) return null;
            const mon = pstate.state.teams[monRef].active;
            // cure a major status condition
            return data.on.switchOut.cure && mon.majorStatus.current ?
                {} : null;
        });

    return yield* expectAbilities(pstate, "switchOut", pendingAbilities,
        /*hitByMove*/ undefined, lastEvent);
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
        function startFilter(data, monRef)
        {
            if (!data.on?.start) return null;
            // TODO: add trace/forewarn restrictions
            // activate on a certain status
            if (data.on.start.cure && data.statusImmunity)
            {
                const mon = pstate.state.teams[monRef].active;
                for (const statusType in data.statusImmunity)
                {
                    if (data.statusImmunity.hasOwnProperty(statusType) &&
                        hasStatus(mon, statusType as effects.StatusType))
                    {
                        return {};
                    }
                }
                return null;
            }
            if (data.on.start.revealItem) return {opponentHasItem: true};
            return {};
        });

    return yield* expectAbilities(pstate, "start", pendingAbilities,
        /*hitByMove*/ undefined, lastEvent);
}

// TODO: move to a helper library?
/** Checks whether the pokemon has the given status. */
function hasStatus(mon: ReadonlyPokemon, statusType: effects.StatusType):
    boolean
{
    switch (statusType)
    {
        case "aquaRing": case "attract": case "curse": case "flashFire":
        case "focusEnergy": case "imprison": case "ingrain":
        case "leechSeed": case "mudSport": case "nightmare":
        case "powerTrick": case "substitute": case "suppressAbility":
        case "torment": case "waterSport":
        case "destinyBond": case "grudge": case "rage": // singlemove
        case "magicCoat": case "roost": case "snatch": // singleturn
            return mon.volatile[statusType];
        case "bide": case "confusion": case "charge": case "magnetRise":
        case "embargo": case "healBlock": case "slowStart": case "taunt":
        case "uproar": case "yawn":
            return mon.volatile[statusType].isActive;
        case "encore":
            return mon.volatile[statusType].ts.isActive;
        case "endure": case "protect": // stall
            return mon.volatile.stalling;
        case "foresight": case "miracleEye":
            return mon.volatile.identified === statusType;
        default:
            if (dexutil.isMajorStatus(statusType))
            {
                return mon.majorStatus.current === statusType;
            }
            // istanbul ignore next: should never happen
            throw new Error(`Invalid status effect '${statusType}'`);
    }
}

/**
 * Expects an on-`block` ability to activate on a certain blockable effect.
 * @param eligible Eligible pokemon.
 * @param userRef Pokemon reference using the `hitByMove`.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onBlock(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, userRef: Side,
    hitByMove: dexutil.MoveData, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    // if move user ignores the target's abilities, then this function can't be
    //  called
    const user = pstate.state.teams[userRef].active;
    if (ignoresTargetAbility(user))
    {
        return {...lastEvent && {event: lastEvent}, results: []};
    }
    const moveTypes = dexutil.getMoveTypes(hitByMove, user);

    // TODO: account for ghost flag? no move currently exists that would be
    //  affected
    const status = !hitByMove.effects?.status?.chance ?
        hitByMove.effects?.status?.hit : undefined;

    const pendingAbilities = getAbilities(pstate, eligible,
        function blockFilter(data)
        {
            if (!data.on?.block) return null;
            // block move's main status effect
            if (data.on.block.status && data.statusImmunity &&
                status?.some(s => data.statusImmunity![s]))
            {
                return {};
            }
            // block move based on its type
            // can't activate unless the ability could block one of the move's
            //  possible types
            if (data.on.block.move && moveTypes.has(data.on.block.move.type))
            {
                return {moveType: data.on.block.move.type};
            }
            // block move based on damp
            if (hitByMove.flags?.explosive && data.on.block.effect?.explosive)
            {
                return {};
            }
            return null;
        });

    return yield* expectAbilities(pstate, "block", pendingAbilities,
        hitByMove, lastEvent);
}

// TODO: refactor hitByMove to support other unboost effects, e.g. intimidate
/**
 * Expects an on-`tryUnboost` ability to activate on a certain unboost effect.
 * @param eligible Eligible pokemon.
 * @param userRef Pokemon reference using the `hitByMove`.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onTryUnboost(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>, userRef: Side,
    hitByMove: dexutil.MoveData, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    // if move user ignores the target's abilities, then this function can't be
    //  called
    const user = pstate.state.teams[userRef].active;
    if (ignoresTargetAbility(user))
    {
        return {...lastEvent && {event: lastEvent}, results: []};
    }

    const boosts =
        !hitByMove.effects?.boost?.chance && !hitByMove.effects?.boost?.set ?
            hitByMove.effects?.boost?.hit ?? {} : {};

    const pendingAbilities = getAbilities(pstate, eligible,
        function tryUnboostFilter(data)
        {
            if (!data.on?.tryUnboost) return null;
            // make sure an unboost can be blocked
            if ((Object.keys(boosts) as dexutil.BoostName[]).every(
                b => boosts[b]! >= 0 || !data.on!.tryUnboost!.block?.[b]))
            {
                return null;
            }
            return {};
        });

    return yield* expectAbilities(pstate, "tryUnboost", pendingAbilities,
        hitByMove, lastEvent);
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
    statusType: effects.StatusType, hitByMove?: dexutil.MoveData,
    lastEvent?: events.Any): SubParser<ExpectAbilitiesResult>
{
    const pendingAbilities = getAbilities(pstate, eligible,
        d => d.on?.status?.cure && d.statusImmunity?.[statusType] ? {} : null);

    return yield* expectAbilities(pstate, "status", pendingAbilities, hitByMove,
        lastEvent);
}

/**
 * Expects an on-`moveDamage` ability (or variants of this condition) to
 * activate.
 * @param eligible Eligible pokemon.
 * @param qualifier The qualifier of which effects the ability may activate.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onMoveDamage(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    qualifier: "damage" | "contact" | "contactKO", hitByMove: dexutil.MoveData,
    lastEvent?: events.Any): SubParser<ExpectAbilitiesResult>
{
    const pendingAbilities = getAbilities(pstate, eligible,
        function moveDamageFilter(data, monRef)
        {
            if (!data.on) return null;
            if (data.on.moveDamage && ["damage", "contact"].includes(qualifier))
            {
                const mon = pstate.state.teams[monRef].active;
                if (data.on.moveDamage.changeToMoveType && !mon.fainted)
                {
                    return {diffMoveType: true};
                }
            }
            else if (data.on.moveContact &&
                ["contact", "contactKO"].includes(qualifier))
            {
                return {chance: data.on.moveContact.chance ?? 100};
            }
            else if (data.on.moveContactKO && qualifier === "contactKO")
            {
                return {};
            }
            return null;
        });

    let on: dexutil.AbilityOn;
    switch (qualifier)
    {
        case "damage": on = "moveDamage"; break;
        case "contact": on = "moveContact"; break;
        case "contactKO": on = "moveContactKO"; break;
    }

    return yield* expectAbilities(pstate, on, pendingAbilities,
        hitByMove, lastEvent);
}

/**
 * Expects an on-`moveDrain` ability to activate.
 * @param eligible Eligible pokemon.
 * @param hitByMove Move by which the eligible pokemon are being hit.
 */
export async function* onMoveDrain(pstate: ParserState,
    eligible: Partial<Readonly<Record<Side, true>>>,
    hitByMove: dexutil.MoveData, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    const pendingAbilities = getAbilities(pstate, eligible,
        d => d.on?.moveDrain ? {} : null);

    return yield* expectAbilities(pstate, "moveDrain", pendingAbilities,
        hitByMove, lastEvent);
}

/** Describes an ability possibility restriction. */
interface AbilityInference
{
    /** Chance of the ability activating. Default 100 if omitted. */
    chance?: number;
    /** Whether this ability activates if the opponent has a held item. */
    opponentHasItem?: true;
    /**
     * Whether this ability activates if the holder isn't the same type as the
     * move being used against it.
     */
    diffMoveType?: true;
    /**
     * The ability activates iff the move being used against the holder is of
     * the type specified here.
     */
    moveType?: dexutil.Type;
}

/** Filters out ability possibilities that don't match the given predicate. */
function getAbilities(pstate: ParserState,
    monRefs: Partial<Readonly<Record<Side, any>>>,
    f: (data: dexutil.AbilityData, monRef: Side) => AbilityInference | null):
    Partial<Record<Side, Map<string, AbilityInference>>>
{
    const result: ReturnType<typeof getAbilities> = {};
    for (const monRef in monRefs)
    {
        if (!monRefs.hasOwnProperty(monRef)) continue;
        // can't activate ability if suppressed
        const mon = pstate.state.teams[monRef as Side].active;
        if (mon.volatile.suppressAbility) continue;

        // put the callback through each possible ability
        const inferences = new Map<string, AbilityInference>();
        for (const name of mon.traits.ability.possibleValues)
        {
            const cbResult = f(mon.traits.ability.map[name], monRef as Side);
            if (!cbResult) continue;
            inferences.set(name, cbResult);
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
    pendingAbilities: Readonly<Partial<Record<Side,
        ReadonlyMap<string, AbilityInference>>>>,
    hitByMove?: dexutil.MoveData, lastEvent?: events.Any):
    SubParser<ExpectAbilitiesResult>
{
    const inferences: EventInference[] = [];
    for (const monRef in pendingAbilities)
    {
        if (!pendingAbilities.hasOwnProperty(monRef)) continue;
        const abilities = pendingAbilities[monRef as Side]!;
        inferences.push(
        {
            take: event => expectAbilitiesTake(pstate, event, monRef as Side,
                on, abilities, hitByMove),
            absent: () => expectAbilitiesAbsent(pstate, monRef as Side, on,
                abilities, hitByMove)
        });
    }
    return expectEvents(inferences, lastEvent);
}

async function* expectAbilitiesTake(pstate: ParserState, event: events.Any,
    monRef: Side, on: dexutil.AbilityOn,
    abilities: ReadonlyMap<string, AbilityInference>,
    hitByMove?: dexutil.MoveData): SubParser<AbilityResult>
{
    if (event.type !== "activateAbility") return {event};
    if (event.monRef !== monRef) return {event};

    // match pending ability possibilities with current item event
    const abilityInf = abilities.get(event.ability);
    if (!abilityInf) return {event};

    // accept event
    return yield* activateAbility(pstate, event, on, hitByMove?.name);
}

function expectAbilitiesAbsent(pstate: ParserState, monRef: Side,
    on: dexutil.AbilityOn, abilities: ReadonlyMap<string, AbilityInference>,
    hitByMove?: dexutil.MoveData): void
{
    const mon = pstate.state.teams[monRef as Side].active;
    // TODO(doubles): track actual targets
    const opp = pstate.state.teams[otherSide(monRef as Side)].active;

    // collective AbilityInference flags
    // TODO: these are incomplete, since there are ambiguous cases where more
    //  information is needed in addition to this information, which is
    //  forgotten after this function returns
    // whether all kept abilities have opponentHasItem=true
    let allOpponentHasItem: boolean | undefined;
    // whether all kept abilities have diffMoveType=true
    let allDiffMoveType: boolean | undefined;
    // whether all kept abilities block the same move type
    let allMoveType: dexutil.Type | false | undefined;

    // figure out move type
    const hitByMoveType = hitByMove ?
        dexutil.getDefiniteMoveType(hitByMove, opp) : null;

    // figure out which abilities to remove
    const removeCandidates: string[] = [];
    for (const [name, inf] of abilities)
    {
        // don't remove abilities that only had a chance of
        //  activating
        const guaranteed = (inf.chance ?? 100) >= 100;

        // ability should activate if opponent has an item
        if (inf.opponentHasItem)
        {
            // if the opponent definitely had an item, then the
            //  ability should've activated
            if (!opp.item.isSet("none"))
            {
                removeCandidates.push(name);
                continue;
            }
            // TODO: if opponent's item is unknown, add onNarrow
            //  callbacks
            // update collective flags
            allOpponentHasItem ??= true;
            allOpponentHasItem &&= true;
            allDiffMoveType = false;
            allMoveType = false;
        }
        // ability should activate if holder is a different type than the move
        else if (inf.diffMoveType)
        {
            if (!hitByMove)
            {
                removeCandidates.push(name);
                continue;
            }
            // if holder isn't move type, remove
            if (hitByMoveType && !mon.types.every(t => t === hitByMoveType))
            {
                removeCandidates.push(name);
                continue;
            }

            // update collective flags
            allOpponentHasItem = false;
            allDiffMoveType ??= true;
            allDiffMoveType &&= true;
            allMoveType = false;
        }
        else if (inf.moveType)
        {
            // if ability definitely blocks the move, remove the ability
            if (!hitByMove || inf.moveType === hitByMoveType)
            {
                removeCandidates.push(name);
                continue;
            }

            // update collective flags
            allOpponentHasItem = false;
            allDiffMoveType = false;
            allMoveType ??= inf.moveType;
            if (allMoveType !== inf.moveType) allMoveType = false;
        }
        // ability definitely should've activated
        else if (guaranteed) removeCandidates.push(name);
        else
        {
            allOpponentHasItem = false;
            allDiffMoveType = false;
            allMoveType = false;
        }
    }
    // if all remaining abilities have opponentHasItem=true, then
    //  the opponent must not have had an item
    if (allOpponentHasItem) opp.setItem("none");
    // if they all have diffMoveType=true, infer/match move type to the holder's
    //  type
    if (allDiffMoveType)
    {
        switch (hitByMove?.modifyType)
        {
            case "hpType": opp.hpType.narrow(...mon.types); break;
            case "plateType":
                opp.item.narrow(...[...opp.item.possibleValues].filter(n =>
                    mon.types.every(t => t === opp.item.map[n].plateType)));
                break;
            default:
                if (!mon.types.every(t => t === hitByMoveType))
                {
                    throw new Error("diffMoveType (colorchange) ability " +
                    `expected holder's type [${mon.types.join(", ")}] to ` +
                    `match the move type '${hitByMoveType}'`);
                }
        }
    }
    // if they all block the same move type, remove it from the move's type
    //  possibilities
    // TODO: handle delayed cases where both ability and hpType/plateType are
    //  unknown
    if (allMoveType)
    {
        switch (hitByMove?.modifyType)
        {
            case "hpType": opp.hpType.remove(allMoveType); break;
            case "plateType":
                opp.item.remove(...[...opp.item.possibleValues].filter(n =>
                        allMoveType === opp.item.map[n].plateType));
                break;
            default:
                // sanity check
                if (allMoveType !== hitByMoveType)
                {
                    // istanbul ignore next: can't reproduce since
                    //  onMoveDamage() already checked for this
                    throw new Error("moveType immunity ability expected " +
                    `type '${allMoveType} to match the move type ` +
                    `'${hitByMoveType}'`);
                }
        }
    }

    try { mon.traits.ability.remove(...removeCandidates); }
    catch (e)
    {
        throw new Error(`Pokemon '${monRef}' should've activated ability ` +
            `[${removeCandidates.join(", ")}] but it wasn't activated ` +
            `on-${on}`);
    }
}

/** Result from `expectAbility()`. */
export interface ExpectAbilityResult extends SubParserResult
{
    /** Results from each ability activation. */
    results: AbilityResult[];
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
    readonly ability: dexutil.AbilityData;
    /** Circumstances in which the ability is activating. */
    readonly on: dexutil.AbilityOn | null;
    /** Move that the holder was hit by, if applicable. */
    readonly hitByMove?: dexutil.MoveData;
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
    blockStatus?: {readonly [T in effects.StatusType]?: true};

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
 * @param hitByMoveName Name of the move that the pokemon was just hit by, if
 * applicable.
 */
export async function* activateAbility(pstate: ParserState,
    initialEvent: events.ActivateAbility,
    on: dexutil.AbilityOn | null = null, hitByMoveName?: string):
    SubParser<AbilityResult>
{
    if (!dex.abilities.hasOwnProperty(initialEvent.ability))
    {
        throw new Error(`Unknown ability '${initialEvent.ability}'`);
    }

    const ctx: AbilityContext =
    {
        pstate, holder: pstate.state.teams[initialEvent.monRef].active,
        holderRef: initialEvent.monRef,
        ability: dex.abilities[initialEvent.ability], on,
        ...hitByMoveName && dex.moves.hasOwnProperty(hitByMoveName) &&
            {hitByMove: dex.moves[hitByMoveName]}
    };

    // infer ability being activated
    ctx.holder.traits.setAbility(ctx.ability.name);

    // handle supported ability effects
    const baseResult = yield* dispatchEffects(ctx);

    // handle other ability effects (TODO: support)
    const result = yield* eventLoop(async function* loop(event): SubParser
    {
        switch (event.type)
        {
            case "activateFieldEffect":
                // see if the weather can be caused by the current ability
                if (event.start && dexutil.isWeatherType(event.effect) &&
                    weatherAbilities[event.effect] === ctx.ability.name)
                {
                    // fill in infinite duration (gen3-4) and source
                    return yield* base.activateFieldEffect(pstate, event,
                        ctx.holder, /*weatherInfinite*/ true);
                }
                break;
            case "immune":
                // TODO: check whether this is possible
                if (event.monRef !== ctx.holderRef) break;
                baseResult.immune = true;
                return yield* base.immune(pstate, event);
        }
        return {event};
    }, baseResult.event);
    return {...baseResult, ...result};
}

/**
 * Dispatches the effects of an ability. Assumes that the initial
 * activateAbility event has already been handled.
 * @param ctx Ability SubParser context.
 * @param lastEvent Last unconsumed event if any.
 */
async function* dispatchEffects(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    switch (ctx.on)
    {
        case "switchOut":
            if (!ctx.ability.on?.switchOut)
            {
                throw new Error("On-switchOut effect shouldn't activate for " +
                    `ability '${ctx.ability.name}'`);
            }
            if (ctx.ability.on.switchOut.cure)
            {
                return yield* cureMajorStatus(ctx, lastEvent);
            }
            // if nothing is set, then the ability shouldn't have activated
            throw new Error("On-switchOut effect shouldn't activate for " +
                `ability '${ctx.ability.name}'`);
        case "start":
            if (!ctx.ability.on?.start)
            {
                throw new Error("On-start effect shouldn't activate for " +
                    `ability '${ctx.ability.name}'`);
            }
            if (ctx.ability.on.start.cure && ctx.ability.statusImmunity)
            {
                return yield* cure(ctx, lastEvent);
            }
            if (ctx.ability.on.start.copyFoeAbility)
            {
                return yield* copyFoeAbility(ctx, lastEvent);
            }
            if (ctx.ability.on.start.revealItem)
            {
                return yield* revealItem(ctx, lastEvent);
            }
            if (ctx.ability.on.start.warnStrongestMove)
            {
                return yield* warnStrongestMove(ctx, lastEvent);
            }
            // if nothing is set, then the ability just reveals itself
            return {...lastEvent && {event: lastEvent}};
        case "block":
            if (!ctx.ability.on?.block)
            {
                throw new Error("On-block effect shouldn't activate for " +
                    `ability '${ctx.ability.name}'`);
            }
            // TODO: assert non-ignoreTargetAbility (moldbreaker) after handling
            if (ctx.ability.on.block.status && ctx.ability.statusImmunity)
            {
                return yield* blockStatus(ctx, ctx.ability.statusImmunity,
                    lastEvent);
            }
            if (ctx.ability.on.block.move)
            {
                return yield* blockMove(ctx, ctx.ability.on.block.move.type,
                    ctx.ability.on.block.move.effects, lastEvent);
            }
            if (ctx.ability.on.block.effect)
            {
                return yield* blockEffect(ctx,
                    ctx.ability.on.block.effect.explosive, lastEvent);
            }
            throw new Error("On-block effect shouldn't activate for " +
                `ability '${ctx.ability.name}'`);
        case "tryUnboost":
            if (!ctx.ability.on?.tryUnboost)
            {
                throw new Error("On-tryUnboost effect shouldn't activate for " +
                    `ability '${ctx.ability.name}'`);
            }
            // TODO: assert non-ignoreTargetAbility (moldbreaker) after handling
            if (ctx.ability.on.tryUnboost.block)
            {
                return yield* blockUnboost(ctx, ctx.ability.on.tryUnboost.block,
                    lastEvent);
            }
            throw new Error("On-tryUnboost effect shouldn't activate for " +
                `ability '${ctx.ability.name}'`);
        case "status":
            if (!ctx.ability.on?.status)
            {
                throw new Error("On-status effect shouldn't activate for " +
                    `ability '${ctx.ability.name}'`);
            }
            if (ctx.ability.on.status.cure && ctx.ability.statusImmunity)
            {
                return yield* cure(ctx, lastEvent);
            }
            throw new Error("On-status effect shouldn't activate for " +
                `ability '${ctx.ability.name}'`);
        case "moveContactKO":
            if (ctx.ability.on?.moveContactKO)
            {
                // TODO: track hitByMove user
                return yield* moveContactKO(ctx, otherSide(ctx.holderRef),
                    ctx.ability.on.moveContactKO.effects,
                    ctx.ability.on.moveContactKO.explosive, lastEvent);
            }
            // if no moveContactKO effects registered, try moveContact
            // fallthrough
        case "moveContact":
            if (ctx.ability.on?.moveContact &&
                // try moveContact if on=moveContactKO and the moveContact
                //  effect doesn't target the ability holder
                (ctx.on !== "moveContactKO" ||
                    ctx.ability.on.moveContact.tgt !== "holder"))
            {
                // TODO: track hitByMove user
                const targetRef = ctx.ability.on.moveContact.tgt === "holder" ?
                    ctx.holderRef : otherSide(ctx.holderRef);
                return yield* moveContact(ctx, targetRef,
                    ctx.ability.on.moveContact.effects, lastEvent);
            }
            // if no moveContact effects registered, try moveDamage
            // fallthrough
        case "moveDamage":
            if (ctx.ability.on?.moveDamage &&
                // try moveDamage if on=moveContactKO and the moveDamage
                //  effect doesn't target the ability holder
                (ctx.on !== "moveContactKO" ||
                    !ctx.ability.on.moveDamage.changeToMoveType))
            {
                if (ctx.ability.on.moveDamage.changeToMoveType)
                {
                    return yield* changeToMoveType(ctx, lastEvent);
                }
                // if nothing is set, then the ability shouldn't have activated
                throw new Error(`On-${ctx.on} effect shouldn't activate for ` +
                    `ability '${ctx.ability.name}'`);
            }
            throw new Error(`On-${ctx.on} effect shouldn't activate for ` +
                `ability '${ctx.ability.name}'`);
        case "moveDrain":
            if (!ctx.ability.on?.moveDrain) break;
            if (ctx.ability.on.moveDrain.invert)
            {
                return yield* invertDrain(ctx, lastEvent);
            }
            // if nothing is set, then the ability shouldn't have activated
            throw new Error("On-moveDrain effect shouldn't activate for " +
                `ability '${ctx.ability.name}'`);
    }
    return {...lastEvent && {event: lastEvent}};
}

// on-switchOut handlers

async function* cureMajorStatus(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    const next = lastEvent ?? (yield);
    if (next.type !== "activateStatusEffect" || next.start ||
        next.monRef !== ctx.holderRef || !dexutil.isMajorStatus(next.effect))
    {
        // TODO: better error messages
        throw new Error(`On-${ctx.on} cure effect failed`);
    }
    return yield* base.activateStatusEffect(ctx.pstate, next);
}

// on-start handlers

/**
 * Handles events due to a statusImmunity ability curing a status (e.g.
 * Insomnia).
 */
async function* cure(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    const next = lastEvent ?? (yield);
    if (next.type !== "activateStatusEffect" || next.start ||
        next.monRef !== ctx.holderRef ||
        !ctx.ability.statusImmunity?.[next.effect])
    {
        // TODO: better error messages
        throw new Error(`On-${ctx.on} cure effect failed`);
    }
    return yield* base.activateStatusEffect(ctx.pstate, next);
}

/** Handles events due to a copeFoeAbility ability (e.g. Trace). */
async function* copyFoeAbility(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    // handle trace events
    // activateAbility holder <ability> (copied ability)
    const next = lastEvent ?? (yield);
    if (next.type !== "activateAbility" || next.monRef !== ctx.holderRef)
    {
        throw new Error("On-start copeFoeAbility effect failed");
    }
    ctx.holder.traits.setAbility(next.ability);

    // TODO: these should be revealAbility events
    // activateAbility target <ability> (describe trace target)
    const next2 = yield;
    if (next2.type !== "activateAbility" || next2.monRef === ctx.holderRef ||
        next2.ability !== next.ability)
    {
        throw new Error("On-start copeFoeAbility effect failed");
    }
    const targetRef = next2.monRef;
    const target = ctx.pstate.state.teams[targetRef].active;
    target.traits.setAbility(next2.ability);

    // possible on-start activation for holder's new ability
    // if no activation, don't need to consume anymore events
    const next3 = yield;
    if (next3.type !== "activateAbility") return {event: next3};
    if (next3.monRef !== ctx.holderRef) return {event: next3};
    if (next3.ability !== next.ability) return {event: next3};
    const data = dex.abilities[next3.ability];
    if (!data?.on?.start) return {event: next3};
    return yield* activateAbility(ctx.pstate, next3, "start");
}

/** Handles events due to a revealItem ability (e.g. Frisk). */
async function* revealItem(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    // handle frisk events
    // revealItem target <item>
    const next = lastEvent ?? (yield);
    if (next.type !== "revealItem" || next.monRef === ctx.holderRef ||
        next.gained)
    {
        throw new Error("On-start revealItem effect failed");
    }
    return yield* base.revealItem(ctx.pstate, next);
}

/** Handles events due to a warnStrongestMove ability (e.g. Forewarn). */
async function* warnStrongestMove(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    // handle forewarn events
    // revealMove target <move>
    const next = lastEvent ?? (yield);
    if (next.type !== "revealMove" || next.monRef === ctx.holderRef)
    {
        throw new Error("On-start warnStrongestMove effect failed");
    }
    const subResult = yield* base.revealMove(ctx.pstate, next);

    // rule out moves stronger than this one
    const {moveset} = ctx.pstate.state.teams[next.monRef].active;
    const bp = getForewarnPower(next.move);
    const strongerMoves = [...moveset.constraint]
        .filter(m => getForewarnPower(m) > bp);
    moveset.inferDoesntHave(strongerMoves);

    return subResult;
}

/**
 * Looks up the base power of a move based on how the Forewarn ability evaluates
 * it.
 */
function getForewarnPower(move: string): number
{
    const data = dex.moves[move];
    const bp = data?.basePower;
    // ohko moves
    if (bp === "ohko") return 160;
    // counter moves
    if (["counter", "metalburst", "mirrorcoat"].includes(move)) return 120;
    // fixed damage/variable power moves (hiddenpower, lowkick, etc)
    if (!bp && data && data.category !== "status") return 80;
    // regular base power, eruption/waterspout and status moves
    return bp ?? 0;
}

// TODO: track weather in AbilityData

// TODO: move to dex ability effects
/** Maps weather type to the ability that can cause it. */
const weatherAbilities: {readonly [T in dexutil.WeatherType]: string} =
{
    Hail: "snowwarning", RainDance: "drizzle", Sandstorm: "sandstream",
    SunnyDay: "drought"
};

// on-block handlers

/**
 * Handles events due to a status-blocking ability (e.g. Immunity).
 * @param statuses Map of the statuses being blocked.
 */
async function* blockStatus(ctx: AbilityContext,
    statuses: {readonly [T in effects.StatusType]?: true},
    lastEvent?: events.Any): SubParser<AbilityResult>
{
    // should have a fail or immune event
    const next = lastEvent ?? (yield);
    if (next.type !== "fail" &&
        (next.type !== "immune" || next.monRef !== ctx.holderRef))
    {
        throw new Error("On-block status effect failed");
    }
    return {...yield* dispatch(ctx.pstate, next), blockStatus: statuses};
}

/**
 * Handles events due to an ability immunity to a move (e.g. Water Absorb).
 * @param blockType Type of move to block.
 * @param blockEffects Effects that happen once blocked.
 */
async function* blockMove(ctx: AbilityContext, blockType: dexutil.Type,
    blockEffects?: readonly effects.ability.Absorb[], lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    if (!ctx.hitByMove)
    {
        throw new Error("On-block move effect failed: " +
            "Attacking move not specified.");
    }

    // TODO(doubles): track actual hitByMove user
    const opp = ctx.pstate.state.teams[otherSide(ctx.holderRef)].active;
    assertMoveType(ctx.hitByMove, blockType, opp);

    let allSilent = true;
    for (const effect of blockEffects ?? [])
    {
        switch (effect.type)
        {
            case "boost":
            {
                const boostResult = yield* parsers.boost(ctx.pstate,
                    ctx.holderRef, effect, /*silent*/ true, lastEvent);
                if (Object.keys(boostResult.remaining).length > 0)
                {
                    throw new Error("On-block move boost effect failed");
                }
                // TODO: permHalt check?
                lastEvent = boostResult.event;
                allSilent &&= !!boostResult.allSilent;
                break;
            }
            case "percentDamage":
            {
                const damageResult = yield* parsers.percentDamage(ctx.pstate,
                    ctx.holderRef, effect.value, lastEvent);
                if (!damageResult.success)
                {
                    throw new Error("On-block move percentDamage effect " +
                        "failed");
                }
                lastEvent = damageResult.event;
                allSilent &&= damageResult.success === "silent";
                break;
            }
            case "status":
            {
                const statusResult = yield* parsers.status(ctx.pstate,
                    ctx.holderRef, [effect.value], lastEvent);
                if (!statusResult.success)
                {
                    throw new Error("On-block move status effect failed");
                }
                lastEvent = statusResult.event;
                allSilent &&= statusResult.success === true;
                break;
            }
            default:
                // istanbul ignore next: should never happen
                throw new Error("Unknown on-block move effect " +
                    `'${effect!.type}'`);
        }
    }

    // if the ability effects can't cause an explicit game event, then the least
    //  it can do is give an immune event
    if (allSilent)
    {
        lastEvent ??= yield;
        if (lastEvent.type !== "immune" || lastEvent.monRef !== ctx.holderRef)
        {
            throw new Error("On-block move effect failed");
        }
        return {...yield* base.immune(ctx.pstate, lastEvent), immune: true};
    }

    return {...lastEvent && {event: lastEvent}, immune: true};
}

/**
 * Handles events due to a certain effect type being blocked (e.g. Damp vs
 * Explosion)
 * @param explosive Explosive effect flag.
 */
async function* blockEffect(ctx: AbilityContext, explosive?: boolean,
    lastEvent?: events.Any): SubParser<AbilityResult>
{
    // should see a fail event
    const next = lastEvent ?? (yield);
    if (next.type !== "fail")
    {
        throw new Error(`On-block effect${explosive ? " explosive" : ""} ` +
            "failed");
    }

    return {...yield* base.fail(ctx.pstate, next), failed: true};
}

// on-tryUnboost handlers

/**
 * Handles events due to an unboost-blocking ability (e.g. Clear Body).
 * @param boosts Map of the unboosts being blocked.
 */
async function* blockUnboost(ctx: AbilityContext,
    boosts: {readonly [T in dexutil.BoostName]?: true}, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    // should see a fail event
    const next = lastEvent ?? (yield);
    if (next.type !== "fail")
    {
        throw new Error("On-tryUnboost block effect failed");
    }
    const subResult = yield* base.fail(ctx.pstate, next);
    return {...subResult, blockUnboost: boosts};
}

// on-moveContactKO handlers

/**
 * Handles events due to a moveContactKO ability (e.g. Aftermath).
 * @param targetRef Target of ability effects.
 * @param expectedEffects Expected effects.
 * @param explosive Explosive effect flag, meaning this ability's effects are
 * blocked by abilities with `#on.block.effect.explosive=true` (e.g. Damp).
 */
async function* moveContactKO(ctx: AbilityContext, targetRef: Side,
    expectedEffects: readonly effects.ability.MoveContactKO[],
    explosive?: boolean, lastEvent?: events.Any): SubParser<AbilityResult>
{
    let allSilent = true;
    for (const effect of expectedEffects ?? [])
    {
        switch (effect.type)
        {
            case "percentDamage":
            {
                const damageResult = yield* parsers.percentDamage(ctx.pstate,
                    targetRef, effect.value, lastEvent);
                if (!damageResult.success)
                {
                    throw new Error("On-moveContactKO " +
                        `${explosive ? "explosive " : ""}effect ` +
                        "percentDamage effect failed");
                }
                // TODO: permHalt check?
                lastEvent = damageResult.event;
                allSilent &&= damageResult.success === "silent";
                break;
            }
            default:
                // istanbul ignore next: should never happen
                throw new Error("Unknown on-moveContactKO effect " +
                    `'${effect!.type}'`);
        }
    }

    // if the ability effects can't cause an explicit game event, then it
    //  shouldn't have activated in the first place
    if (allSilent) throw new Error("On-moveContactKO effect failed");

    if (explosive)
    {
        // assert non-explosive-blocking ability
        const target = ctx.pstate.state.teams[targetRef].active;
        if (!target.volatile.suppressAbility)
        {
            const {ability} = target.traits;
            const blockExplosive = [...ability.possibleValues]
                .filter(n => ability.map[n].on?.block?.effect?.explosive);
            ability.remove(...blockExplosive);
        }
    }

    return {...lastEvent && {event: lastEvent}};
}

// on-moveContact handlers

/**
 * Handles events due to a moveContact ability (e.g. Rough Skin).
 * @param targetRef Target of ability effects.
 * @param expectedEffects Expected effects.
 */
async function* moveContact(ctx: AbilityContext, targetRef: Side,
    expectedEffects: readonly effects.ability.MoveContact[],
    lastEvent?: events.Any): SubParser<AbilityResult>
{
    let allSilent = true;
    for (const effect of expectedEffects)
    {
        switch (effect.type)
        {
            case "percentDamage":
            {
                const damageResult = yield* parsers.percentDamage(ctx.pstate,
                    targetRef, effect.value, lastEvent);
                if (!damageResult.success)
                {
                    throw new Error("On-moveContact percentDamage effect " +
                        "failed");
                }
                lastEvent = damageResult.event;
                allSilent &&= damageResult.success === "silent";
                break;
            }
            case "status":
            {
                const statusResult = yield* parsers.status(ctx.pstate,
                    targetRef, [effect.value], lastEvent);
                if (!statusResult.success)
                {
                    throw new Error("On-moveContact status effect failed");
                }
                lastEvent = statusResult.event;
                allSilent &&= statusResult.success === true;
                break;
            }
            default:
                // istanbul ignore next: should never happen
                throw new Error("Unknown on-moveContact effect " +
                    `'${effect!.type}'`);
        }
    }

    // if the ability effects can't cause an explicit game event, then it
    //  shouldn't have activated in the first place
    if (allSilent) throw new Error("On-moveContact effect failed");

    return {...lastEvent && {event: lastEvent}};
}

// on-moveDamage handlers

/**
 * Handles events due to a changeMoveType ability (e.g. Color Change). Always
 * targets ability holder.
 */
async function* changeToMoveType(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    if (!ctx.hitByMove)
    {
        throw new Error("On-moveDamage changeToMoveType effect failed: " +
            "Attacking move not specified.");
    }

    const next = lastEvent ?? (yield);
    if (next.type !== "changeType" || next.monRef !== ctx.holderRef)
    {
        throw new Error("On-moveDamage changeToMoveType effect failed");
    }
    if (next.newTypes[1] !== "???")
    {
        throw new Error("On-moveDamage changeToMoveType effect failed: " +
            `Expected one type but got multiple (${next.newTypes.join(", ")})`);
    }

    // TODO(doubles): track actual hitByMove user
    const opp = ctx.pstate.state.teams[otherSide(ctx.holderRef)].active;
    assertMoveType(ctx.hitByMove, next.newTypes[0], opp);

    return yield* base.changeType(ctx.pstate, next);
}

// on-moveDrain handlers

/**
 * Handles events due to an invertDrain ability (e.g. Liquid Ooze). Always
 * targets the drain move's user.
 */
async function* invertDrain(ctx: AbilityContext, lastEvent?: events.Any):
    SubParser<AbilityResult>
{
    // TODO: track hitByMove user
    const userRef = otherSide(ctx.holderRef);

    // expect the takeDamage event
    const damageResult = yield* parsers.damage(ctx.pstate, userRef,
        /*from*/ null, -1, lastEvent);
    if (!damageResult.success)
    {
        throw new Error("On-moveDrain invert effect failed");
    }

    // TODO: include damage delta
    return {
        ...damageResult.event && {event: damageResult.event}, invertDrain: true
    };
}

// helpers

/**
 * Compares the given move with its expected type, making inferences on the user
 * if the move type varies with the user's traits.
 * @param move Given move.
 * @param type Expected move type.
 * @param user User of the move.
 */
function assertMoveType(move: dexutil.MoveData, type: dexutil.Type,
    user: Pokemon): void
{
    // assert move type if known
    const moveType = dexutil.getDefiniteMoveType(move, user);
    if (moveType)
    {
        if (type !== moveType)
        {
            throw new Error("On-moveDamage changeToMoveType effect failed: " +
                `Expected type-change to '${moveType}' but got '${type}'`);
        }
        return;
    }

    // if move type is unknown, reverse the assertion into an inference
    switch (move.modifyType)
    {
        // asserted type is the user's hiddenpower type
        case "hpType": user.hpType.narrow(type); break;
        // asserted type is the type of plate the user is holding
        case "plateType":
            // TODO: add an inverse map for plateTypes to optimize this case
            user.item.narrow(...[...user.item.possibleValues].filter(
                    n => type === user.item.map[n].plateType));
            break;
    }
}
