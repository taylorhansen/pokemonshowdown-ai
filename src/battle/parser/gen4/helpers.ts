import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import { Pokemon } from "../../state/Pokemon";
import { SubReason } from "./EventInference";

// TODO: make these into classes?

/**
 * SubReason value that asserts that the inference is dependent on random
 * factors outside what can be deduced.
 */
export const chanceReason: SubReason =
    // TODO: what should delay() do?
    {assert() {}, reject() {}, delay() { return () => {}; }};

/**
 * Creates a SubReason that asserts that the move being used by the given
 * pokemon is of one of the specified type(s).
 * @param move Move to track.
 * @param user Move user to track.
 * @param types Set of possible move types. Will be owned by this function.
 * @param negative Whether to flip the assertion.
 */
export function moveIsType(move: dex.Move, user: Pokemon,
    types: Set<dexutil.Type>, negative?: boolean): SubReason
{
    const {hpType, item} = user; // snapshot in case user changes
    return {
        assert: () => move.assertTypes(types, {hpType, item}, negative),
        reject: () => move.assertTypes(types, {hpType, item}, !negative),
        delay: cb => move.onUpdateTypes(types, {hpType, item},
            negative ? held => cb(!held) : cb)
    };
}

/**
 * Creates a SubReason that asserts that the holder isn't the same type as the
 * move being used against it.
 */
export function diffMoveType(mon: Pokemon, hitBy: dexutil.MoveAndUser):
    SubReason
{
    return moveIsType(hitBy.move, hitBy.user, new Set(mon.types),
        /*negative*/ true);
}

/** Creates a SubReason that asserts that the pokemon has the given ability. */
export function hasAbility(mon: Pokemon, abilities: Set<string>,
    negative?: boolean): SubReason
{
    const {ability} = mon.traits; // snapshot in case traits changes
    return {
        // TODO: guard against overnarrowing? need a better framework for error
        //  handling/logging
        assert: () => negative ? ability.remove(abilities)
            : ability.narrow(abilities),
        reject: () => negative ? ability.narrow(abilities)
            : ability.remove(abilities),
        delay: cb => ability.onUpdate(abilities,
            negative ? kept => cb(!kept) : cb)
    };
}

/** Klutz check wrapped in a bounds check. */
export function cantHaveKlutz(mon: Pokemon): Set<SubReason> | null
{
    const klutz = checkKlutz(mon);
    if (klutz.size <= 0) return new Set();
    if (klutz.size >= mon.traits.ability.size) return null;
    return new Set([hasAbility(mon, klutz, /*negative*/ true)]);
}

/**
 * Checks for item-ignoring abilities.
 * @returns A Set of possible item-ignoring abilities (empty if none are
 * possible).
 */
export function checkKlutz(mon: Pokemon): Set<string>
{
    if (mon.volatile.suppressAbility) return new Set();

    const {ability} = mon.traits;
    const abilities = new Set<string>();
    for (const n of ability.possibleValues)
    {
        if (ability.map[n].flags?.ignoreItem) abilities.add(n);
    }
    return abilities;
}

/**
 * Creates a SubReason that asserts that the pokemon has the given item.
 * @param mon Potential item holder.
 * @param items Item names to track.
 * @param negative Whether to flip the assertion.
 */
export function hasItem(mon: Pokemon, items: Set<string>, negative?: boolean):
    SubReason
{
    const {item} = mon; // snapshot in case item changes
    return {
        assert: () => negative ? item.remove(items) : item.narrow(items),
        reject: () => negative ? item.narrow(items) : item.remove(items),
        delay: cb => item.onUpdate(items, negative ? kept => cb(!kept) : cb)
    };
}

/** Creates a SubReason that asserts that the opponent has a held item. */
export function opponentHasItem(opp: Pokemon): SubReason
{
    return hasItem(opp, new Set(["none"]), /*negative*/ true);
}
