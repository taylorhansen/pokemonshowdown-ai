import {inference} from "../../../../parser";
import {doesntHave, PokemonAbilitySnapshot} from "./ability";

/**
 * Creates a SubReason that asserts that the weather can activate.
 *
 * @param actives List of currently-active pokemon. Searches for
 * weather-suppressant abilities (e.g. cloudnine).
 * @returns A Set of assertions if it's possible for the weather to activate, or
 * `null` if it's not possible.
 */
export function canActivate(
    actives: readonly PokemonAbilitySnapshot[],
): Set<inference.SubReason> | null {
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
    return new Set(args.map(({mon, abilities}) => doesntHave(mon, abilities)));
}
