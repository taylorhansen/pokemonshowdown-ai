/** @file Parsers related to ability activations. */
import { Protocol } from "@pkmn/protocol";
import { SideID } from "@pkmn/types";
import { toIdName } from "../../../../../../helpers";
import { Event } from "../../../../../../parser";
import { BattleAgent } from "../../../../agent";
import { BattleParserContext, consume, inference, unordered, verify } from
    "../../../../parser";
import * as dex from "../../dex";
import { AbilityBlockResult } from "../../dex/wrappers/Ability";
import { Pokemon, ReadonlyPokemon } from "../../state/Pokemon";
import { hasAbility } from "../reason/ability";

/** UnorderedDeadline type for ability onX() functions. */
type AbilityParser<TResult = dex.Ability> =
    unordered.UnorderedDeadline<"gen4", BattleAgent<"gen4">, TResult>;

/**
 * Creates an EventInference parser that expects an on-`switchOut` ability to
 * activate if possible.
 * @param side Pokemon reference who could have such an ability.
 * @returns An EventInference for handling ability possibilities.
 */
export const onSwitchOut = onX("onSwitchOut",
    (ctx, side) =>
    {
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability => ability.canSwitchOut(mon));
    },
    onXInferenceParser("onSwitchOutInference",
        onXUnorderedParser("onSwitchOutUnordered",
            async (ctx, accept, ability, side) =>
                await ability.onSwitchOut(ctx, accept, side))));

/**
 * Creates an EventInference parser that expects an on-`start` ability to
 * activate if possible.
 * @param side Pokemon reference who could have such an ability.
 * @returns An EventInference for handling ability possibilities.
 */
export const onStart = onX("onStart",
    (ctx, side) =>
    {
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability => ability.canStart(mon));
    },
    // note: this function internally handles the special trace ability logic
    onXInferenceParser("onStartInference",
        onXUnorderedParser("onStartUnordered",
            async (ctx, accept, ability, side) =>
                await ability.onStart(ctx, accept, side))));

/**
 * Creates an EventInference parser that expects an on-`block` ability to
 * activate if possible.
 * @param side Pokemon reference who could have such an ability.
 * @param hitBy Move+user ref that the holder is being hit by.
 * @returns An EventInference that returns info about any blocked effects.
 */
export const onBlock = onX("onBlock",
    (ctx, side, hitBy: dex.MoveAndUserRef) =>
    {
        const mon = ctx.state.getTeam(side).active;
        const hitBy2: dex.MoveAndUser =
            {move: hitBy.move, user: ctx.state.getTeam(hitBy.userRef).active};
        return getAbilities(mon,
            ability => ability.canBlock(ctx.state.status.weather.type, hitBy2));
    },
    onXInferenceParser("onBlockInference",
        onXUnorderedParser("onBlockUnordered",
            async (ctx, accept, ability, side, hitBy) =>
                await ability.onBlock(ctx, accept, side, hitBy))));

// TODO: refactor hitBy to include other unboost effect sources, e.g. intimidate
/**
 * Creates an EventInference parser that expects an on-`tryUnboost` ability to
 * activate if possible.
 * @param side Pokemon reference who could have such an ability.
 * @param hitBy Move+user ref that the holder is being hit by.
 * @returns An EventInference that returns the boosts that were blocked.
 */
export const onTryUnboost = onX("onTryUnboost",
    (ctx, side, hitBy: dex.MoveAndUserRef) =>
    {
        const mon = ctx.state.getTeam(side).active;
        const hitBy2: dex.MoveAndUser =
            {move: hitBy.move, user: ctx.state.getTeam(hitBy.userRef).active};
        return getAbilities(mon, ability => ability.canBlockUnboost(hitBy2));
    },
    onXInferenceParser("onTryUnboostInference",
        onXUnorderedParser("onTryUnboostUnordered",
            async (ctx, accept, ability, side) =>
                await ability.onTryUnboost(ctx, accept, side))));

/**
 * Creates an EventInference parser that expects an on-`status` ability to
 * activate if possible.
 * @param side Pokemon reference who could have such an ability.
 * @param statusType Status that was afflicted.
 * @returns An EventInference for handling ability possibilities.
 */
export const onStatus = onX("onStatus",
    (ctx, side, statusType: dex.StatusType) =>
    {
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability => ability.canStatus(mon, statusType));
    },
    onXInferenceParser("onStatusInference",
        onXUnorderedParser("onStatusUnordered",
            async (ctx, accept, ability, side) =>
                await ability.onStatus(ctx, accept, side))));

export type MoveDamageQualifier = "damage" | "contact" | "contactKO";

/**
 * Creates an EventInference parser that expects an on-`moveDamage` ability or
 * its variants to activate if possible.
 * @param side Pokemon reference who could have such an ability.
 * @param qualifier The qualifier of which effects the ability may activate.
 * @param hitBy Move+user ref the holder was hit by.
 * @returns An EventInference for handling ability possibilities.
 */
export const onMoveDamage = onX("onMoveDamage",
    (ctx, side, qualifier: MoveDamageQualifier, hitBy: dex.MoveAndUserRef) =>
    {
        const mon = ctx.state.getTeam(side).active;
        const on = qualifierToOn[qualifier];
        const hitBy2: dex.MoveAndUser =
            {move: hitBy.move, user: ctx.state.getTeam(hitBy.userRef).active};
        return getAbilities(mon, ability =>
            ability.canMoveDamage(mon, on, hitBy2));
    },
    onXInferenceParser("onMoveDamageInference",
        onXUnorderedParser("onMoveDamageUnordered",
            async (ctx, accept, ability, side, qualifier, hitBy) =>
                await ability.onMoveDamage(ctx, accept, side,
                    qualifierToOn[qualifier], hitBy))));

const qualifierToOn: {readonly [T in MoveDamageQualifier]: dex.AbilityOn} =
    {damage: "moveDamage", contact: "moveContact", contactKO: "moveContactKO"};

// TODO: refactor hitBy to support non-move drain effects, e.g. leechseed
/**
 * Creates an EventInference parser that expects an on-`moveDrain` ability to
 * activate if possible (e.g. Liquid Ooze).
 * @param side Pokemon reference who could have such an ability.
 * @param hitByUserRef Pokemon reference to the user of the draining move.
 * @returns An EventInference that returns whether drain damage was deducted
 * instead of healed.
 */
export const onMoveDrain = onX("onMoveDrain",
    (ctx, side, hitByUserRef: SideID) =>
    {
        const mon = ctx.state.getTeam(side).active;
        return getAbilities(mon, ability => ability.canMoveDrain());
    },
    onXInferenceParser("onStatusInference",
        onXUnorderedParser("onStatusUnordered",
            async (ctx, accept, ability, side, hitByUserRef) =>
                await ability.onMoveDrain(ctx, accept, side, hitByUserRef))));

/**
 * Searches for possible ability pathways based on the given predicate.
 * @param mon Pokemon to search.
 * @param prove Callback for filtering eligible abilities. Should return a set
 * of {@link inference.SubReason reasons} that would prove that the ability
 * could activate, or null if it can't.
 * @returns A Map of {@link dex.Ability} to a {@link inference.SubInference}
 * modeling its restrictions given by the predicate.
 */
function getAbilities(mon: Pokemon,
    prove: (ability: dex.Ability) => Set<inference.SubReason> | null):
    Map<dex.Ability, inference.SubInference>
{
    const res = new Map<dex.Ability, inference.SubInference>();
    if (mon.volatile.suppressAbility) return res;

    for (const name of mon.traits.ability.possibleValues)
    {
        const ability = dex.getAbility(mon.traits.ability.map[name]);
        const reasons = prove(ability);
        if (!reasons) continue;
        reasons.add(hasAbility(mon, new Set([name])));
        res.set(ability, new inference.SubInference(reasons));
    }
    return res;
}

function onX<TArgs extends unknown[] = [], TResult = unknown>(name: string,
    f: (ctx: BattleParserContext<"gen4">, side: SideID, ...args: TArgs) =>
        Map<dex.Ability, inference.SubInference>,
    inferenceParser:
        inference.InferenceParser<"gen4", BattleAgent<"gen4">,
            [
                side: SideID,
                abilities: Map<dex.Ability, inference.SubInference>,
                ...args: TArgs
            ],
            TResult>)
{
    // force named function so that stack traces make sense
    return {[name](ctx: BattleParserContext<"gen4">, side: SideID,
        ...args: TArgs)
    {
        const abilities = f(ctx, side, ...args);
        return new inference.EventInference(new Set(abilities.values()),
            inferenceParser, side, abilities, ...args);
    }}[name];
}

function onXInferenceParser<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    unorderedParser:
        unordered.UnorderedParser<"gen4", BattleAgent<"gen4">,
            [ability: dex.Ability, side: SideID, ...args: TArgs],
            [ability: dex.Ability, res: TResult]>)
{
    // used in trace check special logic
    const isOnStart = name === "onStartInference";

    // force named function so that stack traces make sense
    return {async [name](ctx: BattleParserContext<"gen4">,
        accept: inference.AcceptCallback, side: SideID,
        abilities: Map<dex.Ability, inference.SubInference>, ...args: TArgs):
        Promise<TResult | undefined>
    {
        const parsers:
            unordered.UnorderedDeadline<"gen4", BattleAgent<"gen4">,
                [ability: dex.Ability, res: TResult]>[] = [];
        let trace: dex.Ability | undefined;
        for (const ability of abilities.keys())
        {
            if (isOnStart && ability.data.on?.start?.copyFoeAbility)
            {
                // NOTE(gen4): traced ability is shown before trace effect
                // parse the possibly-traced ability first before seeing if it
                //  was traced
                // this handles ambiguous cases where a traced ability may be
                //  one of the holder's possible abilities that could activate
                //  on-start
                trace = ability;
                continue;
            }
            parsers.push(unordered.createUnorderedDeadline(
                unorderedParser, /*reject*/ undefined, ability, side, ...args));
        }

        const oneOfRes = await unordered.oneOf(ctx, parsers);
        if (!oneOfRes[0]) return;

        if (trace)
        {
            // now we can check if the ability originally came from trace
            // TODO: unorderedParser already narrowed ability incorrectly
            const traced = await trace.copyFoeAbility(ctx, side);
            if (traced)
            {
                ctx.state.getTeam(traced.side).active
                    .setAbility(traced.ability);
                accept(abilities.get(trace)!);
                return;
            }
        }

        const [acceptedAbility, result] = oneOfRes[1];
        accept(abilities.get(acceptedAbility)!);
        return result;
    }}[name];
}

function onXUnorderedParser<TArgs extends unknown[] = [], TResult = unknown>(
    name: string,
    parser: unordered.UnorderedParser<"gen4", BattleAgent<"gen4">,
        [ability: dex.Ability, side: SideID, ...args: TArgs], TResult>):
    unordered.UnorderedParser<"gen4", BattleAgent<"gen4">,
        [ability: dex.Ability, side: SideID, ...args: TArgs],
        [ability: dex.Ability, res: TResult]>
{
    return {async [name](ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback, ability: dex.Ability, side: SideID,
        ...args: TArgs):
        Promise<[ability: dex.Ability, res: TResult]>
    {
        return [ability, await parser(ctx, accept, ability, side, ...args)];
    }}[name];
}

/**
 * Parses an `|-ability|` event.
 * @param on Describes the circumstances of this event in order to handle
 * ability effects. If null, then the ability is just being set or revealed.
 */
export async function abilityEvent(ctx: BattleParserContext<"gen4">)
{
    const event = await verify(ctx, "|-ability|");
    const [, identStr, abilityStr] = event.args;
    const abilityId = toIdName(abilityStr);
    handleAbility(ctx, identStr, abilityId)
    await consume(ctx);
}

// TODO: necessary?
/** Parses an ability activation as a suffix of another event, if present. */
export function abilitySuffix(ctx: BattleParserContext<"gen4">,
    event: Event):
    {
        holder: Pokemon, ident: ReturnType<typeof Protocol.parsePokemonIdent>,
        ability: dex.Ability
    } | null
{
    // TODO: parse suffix into separate ability event
    // TODO: for trace, ?
    switch (event.args[0])
    {
        case "cant":
        {
            const [, identStr, reason] = event.args;
            const abilityId = parseAbilityEffectId(reason);
            if (!abilityId) break;
            const {holder, ident, ability} =
                handleAbility(ctx, identStr, abilityId);

            // TODO: delegate to Ability obj?
            if (ability.data.name === "truant")
            {
                holder.volatile.activateTruant();
                // recharge turn overlaps with truant turn
                holder.volatile.mustRecharge = false;
            }
            return {holder, ident, ability};
        }
    }
    return null;
}

function parseAbilityEffectId(str?: string): string | null
{
    if (!str?.startsWith("ability: ")) return null;
    return toIdName(str.substr("ability: ".length));
}

/** Sets ability and returns holder/ability data. */
function handleAbility(ctx: BattleParserContext<"gen4">,
    identStr: Protocol.PokemonIdent, abilityId: string):
    {
        holder: Pokemon, ident: ReturnType<typeof Protocol.parsePokemonIdent>,
        ability: dex.Ability
    }
{
    const ability = dex.getAbility(abilityId);
    if (!ability) throw new Error(`Unknown ability '${abilityId}'`);

    const ident = Protocol.parsePokemonIdent(identStr);
    const holder = ctx.state.getTeam(ident.player).active;
    holder.setAbility(ability.data.name);
    return {holder, ident, ability};
}
