import {inference} from "../../../../parser";
import {
    doesntHave as abilityDoesntHave,
    has as abilityHas,
    PokemonAbilitySnapshot,
} from "./ability";

/**
 * Creates a Reason that asserts that the weather can activate.
 *
 * @param actives List of currently-active pokemon. Searches for
 * weather-suppressant abilities (e.g. cloudnine).
 * @returns A Set of Reasons if it's possible for the weather to activate, or
 * `null` if it's not possible.
 */
export function canActivate(
    actives: readonly PokemonAbilitySnapshot[],
): Set<inference.Reason> | null {
    const args: {mon: PokemonAbilitySnapshot; abilities: Set<string>}[] = [];
    for (const mon of actives) {
        if (mon.volatile.suppressAbility) continue;

        const {ability} = mon.traits;
        const abilities = new Set<string>();
        for (const name of ability.possibleValues) {
            if (ability.map[name].flags?.suppressWeather) {
                abilities.add(name);
            }
        }
        // One pokemon definitely has weather-suppressant ability.
        if (abilities.size >= ability.size) return null;
        if (abilities.size <= 0) continue;
        args.push({mon, abilities});
    }
    return new Set(
        args.map(({mon, abilities}) => abilityDoesntHave(mon, abilities)),
    );
}

/**
 * Creates a Reason that asserts that the weather is being suppressed.
 *
 * @param actives List of currently-active pokemon. Searches for
 * weather-suppressant abilities (e.g. cloudnine).
 * @returns A Set of Reasons if it's possible for the weather to be suppressed,
 * or `null` if is definitely not suppressed.
 */
export function isSuppressed(
    actives: readonly PokemonAbilitySnapshot[],
): Set<inference.Reason> | null {
    const args: {mon: PokemonAbilitySnapshot; abilities: Set<string>}[] = [];
    for (const mon of actives) {
        if (mon.volatile.suppressAbility) continue;

        const {ability} = mon.traits;
        const abilities = new Set<string>();
        for (const name of ability.possibleValues) {
            if (ability.map[name].flags?.suppressWeather) {
                abilities.add(name);
            }
        }
        // One pokemon definitely has weather-suppressant ability.
        if (abilities.size >= ability.size) return new Set();
        if (abilities.size <= 0) continue;
        args.push({mon, abilities});
    }
    // No weather-suppressant ability.
    if (args.length <= 0) return null;
    // Could have weather-suppressant ability.
    return new Set(args.map(({mon, abilities}) => abilityHas(mon, abilities)));
}
