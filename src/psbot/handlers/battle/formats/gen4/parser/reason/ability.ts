/** @file SubReason helpers related to abilities. */
import { inference } from "../../../../parser";
import { Pokemon } from "../../state/Pokemon";
import { PossibilityClass } from "../../state/PossibilityClass";

/** Reduced interface type for ability inference helpers. */
export interface PokemonAbilitySnapshot extends Pick<Pokemon, "traits">
{
    readonly volatile: {readonly suppressAbility: boolean};
}

/** Creates a SubReason that asserts that the pokemon has the given ability. */
export function hasAbility(mon: PokemonAbilitySnapshot, abilities: Set<string>):
    inference.SubReason
{
    return new HasAbility(mon, abilities, /*negative*/ false);
}

/**
 * Creates a SubReason that asserts that the pokemon doesn't have the given
 * ability.
 */
export function doesntHaveAbility(mon: PokemonAbilitySnapshot,
    abilities: Set<string>): inference.SubReason
{
    return new HasAbility(mon, abilities, /*negative*/ true);
}

/**
 * Creates a SubReason that asserts that the pokemon's ability ignores items.
 */
export function abilityCanIgnoreItem(mon: PokemonAbilitySnapshot):
    inference.SubReason
{
    const abilities = itemIgnoringAbilities(mon);
    return hasAbility(mon, abilities);
}

/**
 * Creates a SubReason that asserts that the pokemon's ability doesn't ignore
 * items.
 */
export function abilityCantIgnoreItem(mon: PokemonAbilitySnapshot):
    inference.SubReason
{
    const abilities = itemIgnoringAbilities(mon);
    return doesntHaveAbility(mon, abilities);
}

/**
 * Gets the possible item-ignoring abilities that the pokemon can have, if
 * they're able to activate.
 */
export function itemIgnoringAbilities(mon: PokemonAbilitySnapshot): Set<string>
{
    if (mon.volatile.suppressAbility) return new Set();

    const {ability} = mon.traits;
    const abilities = new Set<string>();
    for (const name of ability.possibleValues)
    {
        if (ability.map[name].flags?.ignoreItem) abilities.add(name);
    }
    return abilities;
}

/**
 * Creates a SubReason that asserts that the pokemon's ability doesn't ignore
 * other abilities.
 */
export function abilityCantIgnoreTarget(mon: PokemonAbilitySnapshot):
    inference.SubReason
{
    const abilities = targetIgnoringAbilities(mon);
    return doesntHaveAbility(mon, abilities);
}

/**
 * Gets the possible abilities from the pokemon that can ignore other abilities,
 * if they're able to activate.
 */
export function targetIgnoringAbilities(mon: PokemonAbilitySnapshot):
    Set<string>
{
    if (mon.volatile.suppressAbility) return new Set();

    const {ability} = mon.traits;
    const abilities = new Set<string>();
    for (const name of ability.possibleValues)
    {
        if (ability.map[name].flags?.ignoreTargetAbility) abilities.add(name);
    }
    return abilities;
}

class HasAbility extends inference.SubReason
{
    /** Ability snapshot for making inferences in retrospect. */
    private readonly ability: PossibilityClass<string>;

    constructor(mon: PokemonAbilitySnapshot,
        private readonly abilities: Set<string>,
        private readonly negative: boolean)
    {
        super();
        this.ability = mon.traits.ability;
    }

    /** @override */
    public canHold(): boolean | null
    {
        return subsetOrIndependent(this.abilities, this.ability.possibleValues,
            this.negative);
    }

    /** @override */
    public assert(): void
    {
        if (this.negative) this.rejectImpl();
        else this.acceptImpl();
    }

    /** @override */
    public reject(): void
    {
        if (this.negative) this.acceptImpl();
        else this.rejectImpl();
    }

    private acceptImpl(): void
    {
        // TODO: guard against overnarrowing?
        // may need a better framework for error handling/logging
        this.ability.narrow(this.abilities);
    }

    private rejectImpl(): void
    {
        this.ability.remove(this.abilities);
    }

    /** @override */
    protected delayImpl(cb: inference.DelayCallback): inference.CancelCallback
    {
        return this.ability.onUpdate(this.abilities,
            this.negative ? kept => cb(!kept) : cb);
    }
}
