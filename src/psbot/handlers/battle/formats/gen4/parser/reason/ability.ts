/** @file SubReason helpers related to abilities. */
import { inference } from "../../../../parser";
import { Pokemon } from "../../state/Pokemon";
import { PossibilityClass } from "../../state/PossibilityClass";
import { subsetOrIndependent } from "./helpers";

/** Reduced interface type for ability inference helpers. */
export interface PokemonAbilitySnapshot extends Pick<Pokemon, "traits">
{
    readonly volatile: {readonly suppressAbility: boolean};
}

/** Creates a SubReason that asserts that the pokemon has the given ability. */
export function has(mon: PokemonAbilitySnapshot, abilities: Set<string>):
    inference.SubReason
{
    return new HasAbility(mon, abilities, /*negative*/ false);
}

/**
 * Creates a SubReason that asserts that the pokemon doesn't have the given
 * ability.
 */
export function doesntHave(mon: PokemonAbilitySnapshot, abilities: Set<string>):
    inference.SubReason
{
    return new HasAbility(mon, abilities, /*negative*/ true);
}

/**
 * Creates a SubReason that asserts that the pokemon's ability ignores items.
 */
export function canIgnoreItem(mon: PokemonAbilitySnapshot): inference.SubReason
{
    const abilities = itemIgnoring(mon);
    return has(mon, abilities);
}

/**
 * Creates a SubReason that asserts that the pokemon's ability doesn't ignore
 * items.
 */
export function cantIgnoreItem(mon: PokemonAbilitySnapshot): inference.SubReason
{
    const abilities = itemIgnoring(mon);
    return doesntHave(mon, abilities);
}

/**
 * Gets the possible item-ignoring abilities that the pokemon can have, if
 * they're able to activate.
 */
export function itemIgnoring(mon: PokemonAbilitySnapshot): Set<string>
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
export function cantIgnoreTargetAbility(mon: PokemonAbilitySnapshot):
    inference.SubReason
{
    const abilities = targetIgnoring(mon);
    return doesntHave(mon, abilities);
}

/**
 * Gets the possible abilities from the pokemon that can ignore other abilities,
 * if they're able to activate.
 */
export function targetIgnoring(mon: PokemonAbilitySnapshot): Set<string>
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

    /** @override */
    public toString(indentInner = 4, indentOuter = 0): string
    {
        const inner = " ".repeat(indentInner);
        const outer = " ".repeat(indentOuter);
        return `\
${outer}HasAbility(
${outer}${inner}mon = (
${outer}${inner}${inner}traits = (
${outer}${inner}${inner}${inner}ability = [${this.ability.toString()}]
${outer}${inner}${inner})
${outer}${inner}),
${outer}${inner}abilities = [${[...this.abilities].join(", ")}],
${outer}${inner}negative = ${this.negative}
${outer})`;
    }
}
