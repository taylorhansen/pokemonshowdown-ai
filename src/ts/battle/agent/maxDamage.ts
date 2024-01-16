import {Generations} from "@pkmn/data";
import {Dex, TypeName} from "@pkmn/dex";
import {Logger} from "../../utils/logging/Logger";
import {Rng} from "../../utils/random";
import * as dex from "../dex";
import {ReadonlyBattleState} from "../state";
import {Action} from "./Action";
import {BattleAgent} from "./BattleAgent";
import {randomAgent} from "./random";

const gens = new Generations(Dex);
const psDex = gens.get(4);

// Enforce type compatibility.
const _: BattleAgent = maxDamage;
void _;

/**
 * BattleAgent that chooses the move with the max expected damage against the
 * opposing active pokemon. Also chooses switches randomly when needed.
 *
 * @param random Controlled random.
 */
export async function maxDamage(
    state: ReadonlyBattleState,
    choices: Action[],
    logger?: Logger,
    random?: Rng,
): Promise<string | undefined> {
    await randomAgent(state, choices, logger, true /*moveOnly*/, random);

    const {damage, debug} = calcDamge(state, choices);
    const info = Object.fromEntries(
        choices.map((c, i) => [c, {index: i, dmg: damage[i], debug: debug[i]}]),
    ) as Record<Action, {index: number; dmg: number; debug: string}>;

    // Stable sort desc(dmg) + asc(index).
    choices.sort(
        (a, b) => info[b].dmg - info[a].dmg || info[a].index - info[b].index,
    );

    const debugStr = choices.map(c => info[c].debug).join(", ");
    logger?.debug(debugStr);
    return debugStr;
}

/**
 * Calculates expected damage against the opposing active pokemon for each of
 * the choices as a fraction of the opponent's hp.
 */
function calcDamge(
    state: ReadonlyBattleState,
    choices: readonly Action[],
): {damage: number[]; debug: string[]} {
    // Some code adapted from PS source.

    //#region Active traits.

    const ourTeam = state.getTeam(state.ourSide!);
    const theirTeam = state.getTeam(state.ourSide! === "p1" ? "p2" : "p1");

    const [ourActive, theirActive] = [ourTeam, theirTeam].map(t => t.active);
    const ourMoves = [...ourActive.moveset.moves.values()];
    const [
        [ourSpecies, ourItem, ourStats],
        [theirSpecies, theirItem, theirStats],
    ] = [ourActive, theirActive].map(m => [
        psDex.species.get(m.species)!,
        m.ability === "klutz" && psDex.items.get(m.item)?.ignoreKlutz
            ? null
            : psDex.items.get(m.item),
        // Estimate stats using average.
        Object.fromEntries(
            dex.statKeys.map(s => [s, (m.stats[s].min + m.stats[s].max) / 2]),
        ) as Record<dex.StatName, number>,
    ]);
    const ignoringAbility = ourActive.ability === "moldbreaker";
    const theirHp =
        theirStats.hp * (theirActive.hp.current / theirActive.hp.max);

    const theirTypes = theirActive.types.map(t => psDex.types.get(t)!.name);
    const isGrounded =
        state.status.gravity.isActive ||
        theirItem?.id === "ironball" ||
        theirActive.volatile.ingrain ||
        (!theirTypes.includes("Flying") &&
            (ignoringAbility || theirActive.ability !== "levitate"));

    const weather = [ourActive.ability, theirActive.ability].some(a =>
        ["airlock", "cloudnine"].includes(a),
    )
        ? "none"
        : state.status.weather.type;

    //#endregion

    //#region Stat modifiers.

    const [ourBoostModifier, theirBoostModifier] = [ourActive, theirActive].map(
        m => {
            const isOpp = m === theirActive;
            const m2 = isOpp ? ourActive : theirActive;
            const mod = {...m.volatile.boosts};
            if (!isOpp || !ignoringAbility) {
                if (m.ability === "simple") {
                    for (const key of dex.boostKeys) {
                        mod[key] *= 2;
                    }
                }
                if (m2.ability === "unaware") {
                    for (const key of isOpp
                        ? // Attacker.
                          (["atk", "def", "spa", "accuracy"] as const)
                        : // Defender.
                          (["def", "spd", "evasion"] as const)) {
                        mod[key] = 0;
                    }
                }
            }
            if (m.volatile.identified && mod.evasion > 0) {
                mod.evasion = 0;
            }
            for (const key of dex.boostKeys) {
                mod[key] = Math.max(-6, Math.min(6, mod[key]));
                const mods =
                    key === "accuracy" || key === "evasion"
                        ? accBoostModifier
                        : boostModifier;
                if (mod[key] >= 0) {
                    mod[key] = mods[mod[key]];
                } else {
                    mod[key] = 1 / mods[-mod[key]];
                }
            }
            return mod;
        },
    );

    const [ourStatModifier, theirStatModifier] = (
        [
            [ourActive, ourSpecies, ourItem],
            [theirActive, theirSpecies, theirItem],
        ] as const
    ).map(([m, s, item]) => {
        const isOpp = m === theirActive;
        const item2 = isOpp ? ourItem : theirItem;
        const mod: Record<dex.BoostName, number> = {
            atk: 1,
            def: 1,
            spa: 1,
            spd: 1,
            spe: 1,
            accuracy: 1,
            evasion: 1,
        };
        if (state.status.gravity.isActive) {
            mod.accuracy *= 5 / 3;
        }
        if (!isOpp || !ignoringAbility) {
            switch (m.ability) {
                case "chlorophyll":
                    if (weather === "SunnyDay") {
                        mod.spe *= 2;
                    }
                    break;
                case "compoundeyes":
                    mod.accuracy *= 1.3;
                    break;
                case "flowergift":
                    if (weather === "SunnyDay") {
                        mod.atk *= 1.5;
                        mod.spd *= 1.5;
                    }
                    break;
                case "guts":
                    if (m.majorStatus.current) {
                        mod.atk *= 1.5;
                    }
                    break;
                case "hugepower":
                case "purepower":
                    mod.atk *= 2;
                    break;
                case "hustle":
                    mod.atk *= 1.5;
                    mod.accuracy *= 0.8;
                    break;
                case "marvelscale":
                    if (m.majorStatus.current) {
                        mod.def *= 1.5;
                    }
                    break;
                case "sandveil":
                    if (weather === "Sandstorm") {
                        mod.evasion *= 5 / 4;
                    }
                    break;
                case "snowcloak":
                    if (weather === "Hail") {
                        mod.evasion *= 5 / 4;
                    }
                    break;
                case "solarpower":
                    if (weather === "SunnyDay") {
                        mod.spa *= 1.5;
                    }
                    break;
                case "swiftswim":
                    if (weather === "RainDance") {
                        mod.spe *= 2;
                    }
                    break;
                case "tangledfeet":
                    if (m.volatile.confusion.isActive) {
                        mod.evasion *= 2;
                    }
                    break;
                case "unburden":
                    // TODO: Not currently tracked by BattleState.
                    break;
            }
        }
        if (m.majorStatus.current === "par") {
            if ((!isOpp || !ignoringAbility) && m.ability === "quickfeet") {
                mod.spe *= 1.5;
            } else {
                mod.spe /= 4;
            }
        }
        switch (item?.id) {
            case "choiceband":
                mod.atk *= 1.5;
                break;
            case "choicescarf":
                mod.spe *= 1.5;
                break;
            case "choicespecs":
                mod.spa *= 1.5;
                break;
            case "deepseascale":
                if (m.species === "clamperl") {
                    mod.spd *= 2;
                }
                break;
            case "deepseatooth":
                if (m.species === "clamperl") {
                    mod.spa *= 2;
                }
                break;
            case "eviolite":
                if (s.nfe) {
                    mod.def *= 1.5;
                    mod.spd *= 1.5;
                }
                break;
            case "ironball":
            case "machobrace":
            case "poweranklet":
            case "powerband":
            case "powerbelt":
            case "powerbracer":
            case "powerlens":
            case "powerweight":
                mod.spe /= 2;
                break;
            case "metalpowder":
                if (m.species === "ditto" && !m.volatile.transformed) {
                    mod.def *= 2;
                }
                break;
            case "quickpowder":
                if (m.species === "ditto" && !m.volatile.transformed) {
                    mod.spe *= 2;
                }
                break;
            case "thickclub":
                if (["cubone", "marowak"].includes(m.species)) {
                    mod.atk *= 2;
                }
                break;
            case "widelens":
                mod.accuracy *= 1.1;
                break;
            default:
        }
        if (item2 && ["brightpowder", "laxincense"].includes(item2.id)) {
            mod.accuracy *= 0.9;
        }
        if (m.volatile.slowstart.isActive) {
            mod.atk /= 2;
            mod.spe /= 2;
        }
        return mod;
    });

    const [ourSpe, theirSpe] = (
        [
            [ourStats, ourBoostModifier, ourStatModifier],
            [theirStats, theirBoostModifier, theirStatModifier],
        ] as const
    ).map(([{spe}, {spe: boostMod}, {spe: mod}]) => spe * boostMod * mod);

    // Separate case after resolving most other stat modifiers.
    for (const [mod, item, spe] of [
        [ourStatModifier, ourItem, ourSpe],
        [theirStatModifier, theirItem, theirSpe],
    ] as const) {
        if (item?.id === "zoomlens") {
            // Assume opponent is faster and will pick a move of the same
            // priority.
            // TODO: Turn order lookahead shouldn't consider moldbreaker.
            const spe2 = mod === ourStatModifier ? theirSpe : ourSpe;
            if (spe2 > spe) {
                mod.accuracy *= 1.2;
            }
        }
    }

    for (const [m, stats] of [
        [ourActive, ourStats],
        [theirActive, theirStats],
    ] as const) {
        if (m.volatile.powertrick) {
            [stats.atk, stats.def] = [stats.def, stats.atk];
        }
    }

    //#endregion

    const oneMove =
        choices.reduce((a, c) => a + (c.startsWith("move") ? 1 : 0), 1) <= 1;

    const info = choices.map<[number, string]>(choice => {
        if (choice.startsWith("switch")) {
            const i = parseInt(choice.substring("switch ".length), 10);
            const benchMon = ourTeam.pokemon[i];
            // Switch does no direct damage.
            return [
                0,
                benchMon === undefined
                    ? "<empty>"
                    : benchMon === null
                      ? "<unknown>"
                      : benchMon.species,
            ];
        }

        // Handle locked choices, struggle, etc.
        if (oneMove) {
            return [0.0001, "<locked>"];
        }

        const i = parseInt(choice.substring("move ".length), 10) - 1;
        const move = ourMoves[i];
        let psMove = psDex.moves.get(move.name)!;
        if (move.pp <= 0) {
            psMove = psDex.moves.get("struggle")!;
        }

        if (psMove.category === "Status") {
            // Status move does no direct damage.
            // TODO: Not always the case.
            return [0.0001, psMove.id];
        }

        // Due to the opponent pokemon having some of its traits not fully known
        // to the agent, these traits will be ignored for now in order to
        // prevent a possible state explosion.

        // A more complex AI could consider a probability distribution over each
        // trait (abilities, items, stats, etc) to compute a less biased damage
        // estimate, but that's out of scope for now.

        //#region Resolve move type.

        let moveType = psDex.types.get(psMove.type);
        switch (psMove.id) {
            case "beatup":
                moveType = undefined;
                break;
            case "doomdesire":
            case "futuresight":
                if (
                    theirTeam.status.futureMoves[psMove.id as dex.FutureMove]
                        .isActive
                ) {
                    return [0, psMove.id];
                }
                moveType = undefined;
                break;
            case "hiddenpower":
                moveType = psDex.types.get(ourActive.stats.hpType ?? "dark")!;
                break;
            case "naturalgift":
                if (ourItem?.naturalGift) {
                    moveType = psDex.types.get(ourItem.naturalGift.type)!;
                }
                break;
            case "judgment":
                if (ourItem?.onPlate) {
                    moveType = psDex.types.get(ourItem.onPlate)!;
                }
                break;
            case "weatherball":
                switch (weather) {
                    case "SunnyDay":
                        moveType = psDex.types.get("fire")!;
                        break;
                    case "RainDance":
                        moveType = psDex.types.get("water")!;
                        break;
                    case "Sandstorm":
                        moveType = psDex.types.get("rock")!;
                        break;
                    case "Hail":
                        moveType = psDex.types.get("ice")!;
                        break;
                    default:
                }
                break;
            default:
        }
        if (ourActive.ability === "normalize") {
            moveType = psDex.types.get("normal")!;
        }

        //#endregion

        //#region Type effectiveness and immunity checks.

        let typeEffectiveness = theirTypes
            .map(t => {
                const typeMod = moveType?.effectiveness[t] ?? 1;
                if (typeMod !== 0 || !moveType) {
                    return typeMod;
                }
                if (
                    psMove.ignoreImmunity &&
                    (psMove.ignoreImmunity === true ||
                        (moveType &&
                            (
                                psMove.ignoreImmunity as unknown as Record<
                                    TypeName,
                                    boolean
                                >
                            )[moveType.name]))
                ) {
                    return 1;
                }
                if (
                    (ourActive.ability === "scrappy" ||
                        theirActive.volatile.identified === "foresight") &&
                    moveType &&
                    ["Normal", "Fighting"].includes(moveType.name)
                ) {
                    return 1;
                }
                if (
                    theirActive.volatile.identified === "miracleeye" &&
                    moveType?.name === "Psychic"
                ) {
                    return 1;
                }
                if (moveType.name === "Ground" && isGrounded) {
                    return 1;
                }
                return typeMod;
            })
            .reduce<number>((a, b) => a * b, 1);
        if (moveType?.name === "Ground" && !isGrounded) {
            typeEffectiveness = 0;
        }
        if (typeEffectiveness <= 0) {
            return [0, psMove.id];
        }

        if (!ignoringAbility) {
            switch (theirActive.ability) {
                case "damp":
                    if (["explosion", "selfdestruct"].includes(psMove.id)) {
                        return [0, psMove.id];
                    }
                    break;
                case "dryskin":
                case "waterabsorb":
                    if (moveType?.name === "Water") {
                        return [0, psMove.id];
                    }
                    break;
                case "flashfire":
                    if (
                        moveType?.name === "Fire" &&
                        theirActive.majorStatus.current !== "frz"
                    ) {
                        return [0, psMove.id];
                    }
                    break;
                case "motordrive":
                case "voltabsorb":
                    if (moveType?.name === "Electric") {
                        return [0, psMove.id];
                    }
                    break;
                case "soundproof":
                    if (psMove.flags.sound) {
                        return [0, psMove.id];
                    }
                    break;
                case "sturdy":
                    if (psMove.ohko) {
                        return [0, psMove.id];
                    }
                    break;
                case "wonderguard":
                    if (typeEffectiveness <= 1 && psMove.id !== "firefang") {
                        return [0, psMove.id];
                    }
                    break;
            }
        }

        //#endregion

        //#region Accuracy checks.

        let {accuracy} = psMove;
        switch (psMove.id) {
            case "blizzard":
                if (weather === "Hail") {
                    accuracy = true;
                }
                break;
            case "hurricane":
            case "thunder":
                if (weather === "RainDance") {
                    accuracy = true;
                } else if (weather === "SunnyDay") {
                    accuracy = 50;
                }
                break;
            default:
        }
        if (psMove.ohko) {
            // Not affected by accuracy modifiers.
            if (
                !["bounce", "dive", "fly", "shadowforce"].includes(
                    theirActive.volatile.twoTurn.type,
                ) &&
                (psMove.id === "fissure" ||
                    theirActive.volatile.twoTurn.type !== "dig")
            ) {
                if (ourActive.stats.level < theirActive.stats.level) {
                    return [0, psMove.id];
                }
                accuracy =
                    0.3 +
                    (ourActive.stats.level - theirActive.stats.level) / 100;
            }
        } else if (accuracy !== true) {
            // Run accuracy modifiers.
            if (!psMove.ignoreAccuracy) {
                accuracy *= ourBoostModifier.accuracy;
            }
            if (!psMove.ignoreEvasion) {
                accuracy /= theirBoostModifier.evasion;
            }
            accuracy *= ourStatModifier.accuracy;
            accuracy /= theirStatModifier.evasion;
        }
        if (psMove.alwaysHit) {
            // Skip check.
            accuracy = true;
        } else {
            // Run accuracy checks.
            if (ourActive.ability === "noguard") {
                accuracy = true;
            }
            if (!ignoringAbility && theirActive.ability === "noguard") {
                accuracy = true;
            }
            if (theirActive.volatile.lockOnTurns.isActive) {
                accuracy = true;
            }
            if (theirActive.volatile.minimize && psMove.id === "stomp") {
                accuracy = true;
            }
            if (ourActive.volatile.micleberry && accuracy !== true) {
                accuracy *= 1.2;
            }
        }

        if (accuracy === true || accuracy > 1) {
            accuracy = 1;
        }
        if (accuracy <= 0) {
            return [0, psMove.id];
        }

        //#endregion

        //#region Direct-damage and OHKO moves.

        let fixedDamage: number | undefined;
        switch (psMove.id) {
            case "dragonrage":
                fixedDamage = 40;
                break;
            case "endeavor": {
                if (ourActive.hp.current > theirHp) {
                    return [0, psMove.id];
                }
                fixedDamage = theirHp - ourActive.hp.current;
                break;
            }
            case "nightshade":
            case "seismictoss":
                fixedDamage = ourActive.stats.level;
                break;
            case "psywave":
                // Average damage.
                fixedDamage = ourActive.stats.level;
                break;
            case "sonicboom":
                fixedDamage = 20;
                break;
            case "superfang":
                fixedDamage = Math.max(1, Math.floor(theirHp / 2));
                break;
            // Counterattacking moves.
            // Too complicated to anticipate the opponent's move, so just use a
            // simple heuristic and prefer most other moves over them for now.
            case "counter":
                fixedDamage = theirStats.atk > theirStats.spa ? 2 : 1;
                break;
            case "metalburst":
                fixedDamage = 1.5;
                break;
            case "mirrorcoat":
                fixedDamage = theirStats.spa > theirStats.atk ? 2 : 1;
                break;
            default:
        }
        if (psMove.ohko) {
            if (theirActive.ability === "sturdy") {
                return [0, psMove.id];
            }
            fixedDamage = theirHp;
        }
        if (fixedDamage) {
            return [(accuracy * fixedDamage) / theirStats.hp, psMove.id];
        }

        //#endregion

        //#region Critical hit.

        let critRatio: boolean | number = psMove.critRatio ?? 1;
        if (psMove?.willCrit === true) {
            critRatio = true;
        } else if (psMove.willCrit === false) {
            critRatio = false;
        }
        if (
            !ignoringAbility &&
            ["battlearmor", "shellarmor"].includes(theirActive.ability)
        ) {
            critRatio = false;
        }
        if (theirTeam.status.luckychant.isActive) {
            critRatio = false;
        }
        if (typeof critRatio === "number") {
            if (ourActive.ability === "superluck") {
                ++critRatio;
            }
            if (["razorclaw", "scopelens"].includes(ourActive.item)) {
                ++critRatio;
            }
            if (ourActive.volatile.focusenergy) {
                critRatio += 2;
            }
            if (
                ["stick", "leek"].includes(ourActive.item) &&
                ourSpecies.id === "farfetchd"
            ) {
                critRatio += 2;
            }
            if (
                ourActive.item === "luckypunch" &&
                ourSpecies.id === "chansey"
            ) {
                critRatio += 2;
            }
        }

        const critChance =
            critRatio === true
                ? 1
                : critRatio === false
                  ? 0
                  : critRatio < 1
                    ? 1 / 16
                    : critRatio < 2
                      ? 1 / 8
                      : critRatio < 3
                        ? 1 / 4
                        : critRatio < 4
                          ? 1 / 3
                          : 1 / 2;

        let critModifier = psMove.critModifier ?? 2;
        if (ourActive.ability === "sniper") {
            critModifier *= 1.5;
        }

        //#endregion

        //#region Base power.

        let {basePower} = psMove;
        switch (psMove.id) {
            case "beatup":
                basePower = 10;
                break;
            case "crushgrip":
                basePower =
                    1 +
                    Math.floor(
                        (120 * theirActive.hp.current) / theirActive.hp.max,
                    );
                break;
            case "electroball": {
                const ratio = ourSpe / theirSpe;
                basePower =
                    ratio < 1
                        ? 40
                        : ratio < 2
                          ? 60
                          : ratio < 3
                            ? 80
                            : ratio < 4
                              ? 120
                              : 150;
                break;
            }
            case "eruption":
            case "waterspout":
                basePower = Math.max(
                    1,
                    Math.floor((150 * ourActive.hp.current) / ourActive.hp.max),
                );
                break;
            case "flail":
            case "reversal": {
                const ratio = Math.max(
                    1,
                    Math.floor((64 * ourActive.hp.current) / ourActive.hp.max),
                );
                basePower =
                    ratio < 2
                        ? 200
                        : ratio < 6
                          ? 150
                          : ratio < 13
                            ? 100
                            : ratio < 22
                              ? 80
                              : ratio < 43
                                ? 40
                                : 20;
                break;
            }
            case "fling":
                if (ourItem?.fling) {
                    ({basePower} = ourItem.fling);
                }
                break;
            case "frustration":
                basePower = Math.max(
                    1,
                    (255 - (ourActive.happiness ?? 0)) / 2.5,
                );
                break;
            case "grassknot":
            case "lowkick":
                basePower =
                    theirSpecies.weightkg < 10
                        ? 20
                        : theirSpecies.weightkg < 25
                          ? 40
                          : theirSpecies.weightkg < 50
                            ? 60
                            : theirSpecies.weightkg < 100
                              ? 80
                              : theirSpecies.weightkg < 200
                                ? 100
                                : 120;
                break;
            case "gyroball":
                basePower = 1 + Math.floor((25 * theirSpe) / ourSpe);
                if (!isFinite(basePower)) {
                    basePower = 1;
                } else if (basePower > 150) {
                    basePower = 150;
                }
                break;
            case "hiddenpower":
                // Assume that team generator selected the correct IVs to get
                // max power.
                basePower = 70;
                break;
            case "magnitude":
                // Average power.
                basePower = 71;
                break;
            case "naturalgift":
                if (ourItem?.naturalGift) {
                    ({basePower} = ourItem.naturalGift);
                }
                break;
            case "payback":
                // Assume opponent is using a move of the same priority.
                if (ourSpe < theirSpe) {
                    basePower *= 2;
                }
                break;
            case "present":
                // Average power.
                basePower = 52;
                break;
            case "punishment":
                basePower =
                    60 +
                    20 *
                        Math.min(
                            7,
                            dex.boostKeys.reduce(
                                (a, b) =>
                                    a +
                                    Math.max(0, theirActive.volatile.boosts[b]),
                                0,
                            ),
                        );
                break;
            case "return":
                basePower = Math.max(
                    1,
                    Math.floor((ourActive.happiness ?? 255) / 2.5),
                );
                break;
            case "spitup":
                if (!ourActive.volatile.stockpile) {
                    // Move will fail.
                    return [0, psMove.id];
                }
                basePower = 100 * ourActive.volatile.stockpile;
                break;
            case "trumpcard":
                basePower =
                    move.pp > 3
                        ? 40
                        : move.pp > 2
                          ? 50
                          : move.pp > 1
                            ? 60
                            : move.pp > 0
                              ? 80
                              : 200;
                break;
            case "wringout":
                basePower =
                    1 +
                    Math.floor(
                        (120 * theirActive.hp.current) / theirActive.hp.max,
                    );
                break;
            case "weatherball":
                if (weather !== "none") {
                    basePower = 100;
                }
                break;
            default:
        }
        if (basePower <= 0) {
            return [0, psMove.id];
        }
        if (ourActive.ability === "reckless" && psMove.recoil) {
            basePower *= 1.2;
        }
        if (
            ["gust", "twister"].includes(psMove.id) &&
            ["fly", "bounce"].includes(theirActive.volatile.twoTurn.type)
        ) {
            basePower *= 2;
        }
        if (psMove.id === "stomp" && theirActive.volatile.minimize) {
            basePower *= 2;
        }
        if (
            ["surf", "whirlpool"].includes(psMove.id) &&
            theirActive.volatile.twoTurn.type === "dive"
        ) {
            basePower *= 2;
        }
        if (
            ["earthquake", "magnitude"].includes(psMove.id) &&
            theirActive.volatile.twoTurn.type === "dig"
        ) {
            basePower *= 2;
        }
        if (
            psMove.id === "facade" &&
            ["brn", "par", "psn", "tox"].includes(
                ourActive.majorStatus.current!,
            )
        ) {
            basePower *= 2;
        }
        if (
            psMove.id === "smellingsalts" &&
            theirActive.majorStatus.current === "par"
        ) {
            basePower *= 2;
        }
        if (
            psMove.id === "brine" &&
            2 * theirActive.hp.current <= theirActive.hp.max
        ) {
            basePower *= 2;
        }
        if (
            ourActive.volatile.charge.isActive &&
            moveType?.name === "Electric"
        ) {
            basePower *= 2;
        }
        if (ourActive.ability === "technician" && basePower < 60) {
            basePower *= 1.5;
        }
        if (
            ourItem &&
            (moveType?.name === typeEnhancingItems[ourItem.id] ||
                moveType?.name === ourItem.onPlate)
        ) {
            basePower *= 1.2;
        }
        if (ourSpecies.id === "pikachu" && ourItem?.id === "lightball") {
            basePower *= 2;
        }
        if (
            moveType &&
            ((ourSpecies.id === "dialga" &&
                ourItem?.id === "adamantorb" &&
                ["Dragon", "Steel"].includes(moveType.name)) ||
                (ourSpecies.name === "palkia" &&
                    ourItem?.name === "lustrousorb" &&
                    ["Dragon", "Water"].includes(moveType.name)) ||
                (["giratina", "giratinaorigin"].includes(ourSpecies.id) &&
                    ourItem?.id === "griseousorb" &&
                    ["Dragon", "Ghost"].includes(moveType.name)))
        ) {
            basePower *= 1.2;
        }
        if (
            (psMove.category === "Physical" && ourItem?.id === "muscleband") ||
            (psMove.category === "Special" && ourItem?.id === "wiseglasses")
        ) {
            basePower *= 1.1;
        }
        if (
            !ignoringAbility &&
            theirActive.ability === "thickfat" &&
            moveType &&
            ["Fire", "Ice"].includes(moveType.name)
        ) {
            basePower /= 2;
        }
        if (
            ((ourActive.volatile.mudsport || theirActive.volatile.mudsport) &&
                moveType?.name === "Electric") ||
            ((ourActive.volatile.watersport ||
                theirActive.volatile.watersport) &&
                moveType?.name === "Water")
        ) {
            basePower /= 2;
        }
        if (
            ((ourActive.ability === "blaze" && moveType?.name === "Fire") ||
                (ourActive.ability === "overgrow" &&
                    moveType?.name === "Grass") ||
                (ourActive.ability === "swarm" && moveType?.name === "Bug") ||
                (ourActive.ability === "torrent" &&
                    moveType?.name === "Water")) &&
            3 * ourActive.hp.current <= ourActive.hp.max
        ) {
            basePower *= 1.5;
        }
        if (
            !ignoringAbility &&
            theirActive.ability === "heatproof" &&
            moveType?.name === "Fire"
        ) {
            basePower /= 2;
        }
        if (
            !ignoringAbility &&
            theirActive.ability === "dryskin" &&
            moveType?.name === "Fire"
        ) {
            basePower *= 1.25;
        }
        if (ourActive.gender && theirActive.gender) {
            if (ourActive.gender === theirActive.gender) {
                basePower *= 1.25;
            } else {
                basePower *= 0.75;
            }
        }
        if (ourActive.ability === "ironfist" && psMove.flags.punch) {
            basePower *= 1.2;
        }

        //#endregion

        //#region Offensive and defensive stats.

        // Note: Damage modifiers from abilities and items still come from the
        // real attacker/defender, just not boosts.
        const [attackerStats, attackerBoosts] =
            psMove.overrideOffensivePokemon === "target"
                ? [theirStats, theirBoostModifier]
                : [ourStats, ourBoostModifier];
        const [defenderStats, defenderBoosts] =
            psMove.overrideDefensivePokemon === "source"
                ? [theirStats, theirBoostModifier]
                : [ourStats, ourBoostModifier];

        const offensiveStatName =
            psMove.overrideOffensiveStat ??
            (psMove.category === "Physical" ? "atk" : "spa");
        const defensiveStatName =
            psMove.overrideDefensiveStat ??
            (psMove.category === "Physical" ? "def" : "spd");

        let offensiveStat = attackerStats[offensiveStatName];
        let defensiveStat = defenderStats[defensiveStatName];

        // Run stat modifiers for real attacker/defender (ability/item/etc).
        // Note attacker modifiers use real stat corresponding to move category.
        offensiveStat *=
            ourStatModifier[psMove.category === "Physical" ? "atk" : "spa"];
        defensiveStat *= theirStatModifier[defensiveStatName];

        if (
            ["explosion", "selfdestruct"].includes(psMove.id) &&
            defensiveStatName === "def"
        ) {
            defensiveStat /= 2;
        }

        // Add split path for crit effects.
        let offensiveStatCrit = offensiveStat;
        let defensiveStatCrit = offensiveStat;

        // Run boost modifiers.
        const offensiveBoostMod = attackerBoosts[offensiveStatName];
        const defensiveBoostMod = defenderBoosts[defensiveStatName];
        if (
            !psMove.ignoreOffensive &&
            (!psMove.ignoreNegativeOffensive || offensiveBoostMod >= 1)
        ) {
            offensiveStat *= offensiveBoostMod;
            if (offensiveBoostMod > 1) {
                offensiveStatCrit *= offensiveBoostMod;
            }
        }
        if (
            !psMove.ignoreDefensive &&
            (!psMove.ignorePositiveDefensive || defensiveBoostMod <= 1)
        ) {
            defensiveStat *= defensiveBoostMod;
            if (defensiveBoostMod < 1) {
                defensiveStatCrit *= defensiveBoostMod;
            }
        }

        offensiveStat = Math.max(1, offensiveStat);
        offensiveStatCrit = Math.max(1, offensiveStatCrit);
        defensiveStat = Math.max(1, defensiveStat);
        defensiveStatCrit = Math.max(1, defensiveStatCrit);

        //#endregion

        //#region Damage.

        // Note: Since we're calculating an average over both RNG and
        // uncertainties about opponent traits, we won't do any rounding here.
        let [damage, damageCrit] = [
            [offensiveStat, defensiveStat],
            [offensiveStatCrit, defensiveStatCrit],
        ].map(
            ([a, d]) =>
                (((2 * ourActive.stats.level) / 5 + 2) * basePower * a) /
                d /
                50,
        );
        if (
            psMove.category === "Physical" &&
            ourActive.majorStatus.current === "brn" &&
            ourActive.ability !== "guts"
        ) {
            damage /= 2;
            damageCrit /= 2;
        }
        if (
            !psMove.infiltrates &&
            ((psMove.category === "Physical" &&
                theirTeam.status.reflect.isActive) ||
                (psMove.category === "Special" &&
                    theirTeam.status.lightscreen.isActive))
        ) {
            // Note: Screens ignored on crit.
            damage *= 0.5;
        }
        if (weather === "RainDance") {
            if (moveType?.name === "Water") {
                damage *= 1.5;
                damageCrit *= 1.5;
            } else if (moveType?.name === "Fire") {
                damage /= 2;
                damageCrit /= 2;
            }
        }
        if (weather === "SunnyDay") {
            if (moveType?.name === "Fire") {
                damage *= 1.5;
                damageCrit *= 1.5;
            } else if (moveType?.name === "Water") {
                damage /= 2;
                damageCrit /= 2;
            }
        }
        if (
            psMove.id === "solarbeam" &&
            weather !== "SunnyDay" &&
            weather !== "none"
        ) {
            damage /= 2;
            damageCrit /= 2;
        }
        if (moveType?.name === "Fire" && ourActive.volatile.flashfire) {
            damage *= 1.5;
            damageCrit *= 1.5;
        }
        damage += 2;
        damageCrit += 2;
        damageCrit *= critModifier;
        if (ourItem?.id === "lifeorb") {
            damage *= 1.3;
            damageCrit *= 1.3;
        }
        if (psMove.id !== "spitup") {
            // Average random modifier.
            damage *= 0.925;
            damageCrit *= 0.925;
        }
        // Stab.
        if (
            moveType &&
            ourActive.types.some(
                t => psDex.types.get(t)!.name === moveType!.name,
            )
        ) {
            const stab = ourActive.ability === "adaptability" ? 2 : 1.5;
            damage *= stab;
            damageCrit *= stab;
        }
        damage *= typeEffectiveness;
        if (typeEffectiveness > 1) {
            if (
                !ignoringAbility &&
                ["filter", "solidrock"].includes(theirActive.ability)
            ) {
                damage *= 0.75;
                damageCrit *= 0.75;
            }
            if (ourItem?.id === "expertbelt") {
                damage *= 1.2;
                damageCrit *= 1.2;
            }
            if (theirItem && resistBerries[theirItem?.id]) {
                damage /= 2;
                damageCrit /= 2;
            }
        } else if (typeEffectiveness < 1) {
            if (ourActive.ability === "tintedlens") {
                damage *= 2;
                damageCrit *= 2;
            }
        } else if (
            moveType?.name === "Normal" &&
            theirItem?.id === "chilanberry"
        ) {
            damage /= 2;
            damageCrit /= 2;
        }

        let damageAvg = (1 - critChance) * damage + critChance * damageCrit;
        damageAvg *= accuracy;

        //#endregion

        //#region Multi-hit.

        let {multihit, multiaccuracy} = psMove;
        if (multihit) {
            if (Array.isArray(multihit)) {
                if (multihit.length > 1) {
                    if (ourActive.ability === "skilllink") {
                        [, multihit] = multihit;
                        multiaccuracy = false;
                    } else if (!multiaccuracy) {
                        // Currently only refers to 2-5 hit moves, which hit 3.0
                        // times on average.
                        multihit = 3;
                    }
                } else {
                    [multihit] = multihit;
                }
            }

            let multiDmg = damageAvg;
            for (let j = 1; j < (multihit as number); ++j) {
                // TODO: Move triplekick has variable base power for each hit.
                multiDmg +=
                    damageAvg * (multiaccuracy ? accuracy ** (i + 1) : 1);
            }
            damageAvg = multiDmg;
        }

        //#endregion

        return [damageAvg / theirStats.hp, psMove.id];
    });

    const debug = choices.map(
        (c, i) => `${c} (${info[i][1]}): ${info[i][0].toFixed(4)}`,
    );

    return {damage: info.map(([dmg]) => dmg), debug};
}

const boostModifier = [1, 1.5, 2, 2.5, 3, 3.5, 4];
const accBoostModifier = [1, 4 / 3, 5 / 3, 2, 7 / 3, 8 / 3, 3];

const typeEnhancingItems: Record<string, TypeName> = {
    blackbelt: "Fighting",
    blackglasses: "Dark",
    charcoal: "Fire",
    dragonfang: "Dragon",
    hardstone: "Rock",
    magnet: "Electric",
    metalcoat: "Steel",
    miracleseed: "Grass",
    mysticwater: "Water",
    nevermeltice: "Ice",
    poisonbarb: "Poison",
    sharpbeak: "Flying",
    silkscarf: "Normal",
    silverpowder: "Bug",
    softsand: "Ground",
    spelltag: "Ghost",
    twistedspoon: "Psychic",
    oddincense: "Psychic",
    rockincense: "Rock",
    roseincense: "Grass",
    seaincense: "Water",
    waveincense: "Water",
};

const resistBerries: Record<string, TypeName> = {
    babiriberry: "Steel",
    chartiberry: "Rock",
    chilanberry: "Normal",
    chopleberry: "Fighting",
    cobaberry: "Flying",
    colburberry: "Dark",
    habanberry: "Dragon",
    kasibberry: "Ghost",
    kebiaberry: "Poison",
    occaberry: "Fire",
    passhoberry: "Water",
    payapaberry: "Psychic",
    rindoberry: "Grass",
    roesliberry: "Fairy",
    shucaberry: "Ground",
    tangaberry: "Bug",
    wacanberry: "Electric",
    yacheberry: "Ice",
};
