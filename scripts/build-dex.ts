/**
 * @file Generates `dex.ts` through stdout. This should be called from
 * `build-dex.sh`.
 */
import {Generations} from "@pkmn/data";
import {Dex} from "@pkmn/dex";
import {SpeciesAbility} from "@pkmn/dex-types";
import * as dex from "../src/psbot/handlers/battle/formats/gen4/dex/dex-util";
import {toIdName} from "../src/psbot/helpers";

// TODO: Split into multiple scripts with separate dex output files?

void (async function buildDex(): Promise<void> {
    const gen = new Generations(Dex).get(4);

    /** Helper type for converting readonly containers to writable versions. */
    type Writable<T> = {-readonly [K in keyof T]: T[K]};

    /**
     * Wraps a string in quotes.
     *
     * @param str String to quote.
     * @returns The given string in quotes.
     */
    const quote = (s: unknown) => `"${s}"`;

    /**
     * Wraps a string in quotes if it is an invalid identifier (i.e. it contains
     * dashes, spaces, or quotes).
     *
     * @param str String to quote.
     * @returns The given string if it's a valid identifier, otherwise the
     * string wrapped in quotes.
     */
    const maybeQuote = (s: unknown) =>
        /[^a-zA-Z0-9]/.test(`${s}`) ? quote(s) : `${s}`;

    // Counter for the unique identifier of a pokemon, move, etc.
    let uid = 0;

    //#region Moves.

    const moves: (readonly [string, dex.MoveData])[] = [];

    // Adapted from pokemon-showdown/data.

    /** Moves that are blocked by Damp-like abilities. */
    const explosive: {readonly [move: string]: boolean} = {
        explosion: true,
        selfdestruct: true,
    };

    /** Moves that intercept switch-ins. */
    const interceptSwitch: {readonly [move: string]: boolean} = {pursuit: true};

    /** Moves that can't be copied by Mirror Move. */
    const noMirror: {readonly [move: string]: boolean} = {
        acupressure: true,
        aromatherapy: true,
        assist: true,
        chatter: true,
        copycat: true,
        counter: true,
        curse: true,
        doomdesire: true,
        feint: true,
        focuspunch: true,
        futuresight: true,
        gravity: true,
        hail: true,
        haze: true,
        healbell: true,
        helpinghand: true,
        lightscreen: true,
        luckychant: true,
        magiccoat: true,
        mefirst: true,
        metronome: true,
        mimic: true,
        mirrorcoat: true,
        mirrormove: true,
        mist: true,
        mudsport: true,
        naturepower: true,
        perishsong: true,
        psychup: true,
        raindance: true,
        reflect: true,
        roleplay: true,
        safeguard: true,
        sandstorm: true,
        sketch: true,
        sleeptalk: true,
        snatch: true,
        spikes: true,
        spitup: true,
        stealthrock: true,
        struggle: true,
        sunnyday: true,
        tailwind: true,
        toxicspikes: true,
        transform: true,
        watersport: true,
    };
    /** Moves that can't be copied by Copycat. */
    const noCopycat: {readonly [move: string]: boolean} = {
        assist: true,
        chatter: true,
        copycat: true,
        counter: true,
        covet: true,
        destinybond: true,
        detect: true,
        endure: true,
        feint: true,
        focuspunch: true,
        followme: true,
        helpinghand: true,
        mefirst: true,
        metronome: true,
        mimic: true,
        mirrorcoat: true,
        mirrormove: true,
        protect: true,
        sketch: true,
        sleeptalk: true,
        snatch: true,
        struggle: true,
        switcheroo: true,
        thief: true,
        trick: true,
    };

    /** Maps move name to whether it transforms the user into the target. */
    const transformMap: {readonly [move: string]: boolean} = {transform: true};

    /** Maps some move names to CallTypes. */
    const callTypeMap: {readonly [move: string]: dex.CallType} = {
        assist: true,
        copycat: "copycat",
        mefirst: "target",
        metronome: true,
        mirrormove: "mirror",
        naturepower: true,
        sleeptalk: "self",
    };

    /** Moves that have special damage effects. */
    const customDamageMap: {
        readonly [move: string]: NonNullable<dex.MoveData["effects"]>["damage"];
    } = {
        bellydrum: {type: "percent", target: "self", percent: -50},
        curse: {type: "percent", target: "self", percent: -50, ghost: true},
        substitute: {type: "percent", target: "self", percent: -25},

        // TODO: Weather can change this amount.
        moonlight: {type: "percent", target: "self", percent: 50},
        morningsun: {type: "percent", target: "self", percent: 50},
        synthesis: {type: "percent", target: "self", percent: 50},

        painsplit: {type: "split"},
    };

    /** Maps some move names to swap-boost effects. */
    const swapBoostMap: {
        readonly [move: string]: Partial<dex.BoostTable<true>>;
    } = {
        guardswap: {def: true, spd: true},
        heartswap: {
            atk: true,
            def: true,
            spa: true,
            spd: true,
            spe: true,
            accuracy: true,
            evasion: true,
        },
        powerswap: {atk: true, spa: true},
    };

    /** Maps some move names to CountableStatusTypes. */
    const countableStatusTypeMap: {
        readonly [move: string]: dex.CountableStatusType;
    } = {perishsong: "perish", stockpile: "stockpile"};

    /** Maps some move names to FieldTypes. */
    const fieldTypeMap: {
        readonly [move: string]: NonNullable<dex.MoveData["effects"]>["field"];
    } = {
        // Weathers.
        sunnyday: {effect: "SunnyDay"},
        raindance: {effect: "RainDance"},
        sandstorm: {effect: "Sandstorm"},
        hail: {effect: "Hail"},
        // Pseudo-weathers.
        gravity: {effect: "gravity"},
        trickroom: {effect: "trickroom", toggle: true},
    };

    /** Maps some move names or effects to StatusTypes. */
    const statusTypeMap: {
        readonly [move: string]: readonly (dex.StatusType | "splash")[];
    } = {
        // TODO: followme, helpinghand, partiallytrapped, telekinesis (gen5).
        // Normal statuses.
        aquaring: ["aquaring"],
        attract: ["attract"],
        charge: ["charge"],
        embargo: ["embargo"],
        encore: ["encore"],
        focusenergy: ["focusenergy"],
        foresight: ["foresight"],
        healblock: ["healblock"],
        imprison: ["imprison"],
        ingrain: ["ingrain"],
        leechseed: ["leechseed"],
        magnetrise: ["magnetrise"],
        miracleeye: ["miracleeye"],
        mudsport: ["mudsport"],
        nightmare: ["nightmare"],
        powertrick: ["powertrick"],
        substitute: ["substitute"],
        gastroacid: ["suppressAbility"],
        taunt: ["taunt"],
        torment: ["torment"],
        watersport: ["watersport"],
        yawn: ["yawn"],
        // Updatable.
        confusion: ["confusion"],
        bide: ["bide"],
        uproar: ["uproar"],
        // Single-move.
        destinybond: ["destinybond"],
        grudge: ["grudge"],
        rage: ["rage"],
        // Single-turn.
        endure: ["endure"],
        magiccoat: ["magiccoat"],
        protect: ["protect"],
        roost: ["roost"],
        snatch: ["snatch"],
        // Major status.
        brn: ["brn"],
        frz: ["frz"],
        par: ["par"],
        psn: ["psn"],
        slp: ["slp"],
        tox: ["tox"],
        // Nothing.
        splash: ["splash"],
    };

    /**
     * Move names that count as both moves and StatusType names, but the effect
     * the move inflicts either doesn't target the move target but instead the
     * user (e.g. rage), or doesn't have the same name as the status it inflicts
     * (e.g. confusion).
     */
    const explicitMoveEffect: {readonly [move: string]: boolean} = {
        confusion: true,
        rage: true,
        uproar: true,
    };

    /** Moves that have special status effects. */
    const customStatusMap: {
        readonly [move: string]: NonNullable<dex.MoveData["effects"]>["status"];
    } = {
        curse: {ghost: true, hit: ["curse"]},
        triattack: {chance: 20, hit: ["brn", "frz", "par"]},
    };

    /** Maps some move names to ImplicitStatusTypes. */
    const implicitStatusTypeMap: {
        readonly [move: string]: dex.ImplicitStatusType;
    } = {
        defensecurl: "defensecurl",
        lockedmove: "lockedMove",
        minimize: "minimize",
        mustrecharge: "mustRecharge",
    };

    /** Maps some move names to set-boost effects. */
    const setBoostMap: {readonly [move: string]: Partial<dex.BoostTable>} = {
        bellydrum: {atk: 6},
    };

    /** Moves that have special boost effects. */
    const customBoostMap: {
        readonly [move: string]: NonNullable<dex.MoveData["effects"]>["boost"];
    } = {
        curse: {noGhost: true, self: {atk: 1, def: 1, spe: -1}},
        stockpile: {self: {def: 1, spd: 1}},
    };

    /** Maps some move names to TeamEffectTypes. */
    const teamStatusTypeMap: {
        readonly [move: string]: dex.TeamEffectType | "cure";
    } = {
        lightscreen: "lightscreen",
        luckychant: "luckychant",
        mist: "mist",
        reflect: "reflect",
        safeguard: "safeguard",
        spikes: "spikes",
        stealthrock: "stealthrock",
        tailwind: "tailwind",
        toxicspikes: "toxicspikes",
        aromatherapy: "cure",
        healbell: "cure",
        // TODO(gen6): auroraveil, stickyweb
    };

    /** Maps some move names to ImplicitTeamEffectTypes. */
    const implicitTeamTypeMap: {
        readonly [move: string]: dex.ImplicitTeamEffectType;
    } = {healingwish: "healingwish", lunardance: "lunardance", wish: "wish"};

    /** Maps move name to how/whether it changes the target's type. */
    const changeTypeMap: {readonly [move: string]: "conversion"} = {
        conversion: "conversion",
    };

    /** Maps move name to whether it disables moves. */
    const disableMoveMap: {readonly [move: string]: boolean} = {disable: true};

    // Note(gen4): healingwish-like moves send in a replacement immediately
    // after self-faint.
    /** Secondary map for move name to self-switch effect. */
    const selfSwitchMap: {readonly [move: string]: dex.SelfSwitchType} = {
        healingwish: true,
        lunardance: true,
    };

    const futureMoves: string[] = [];
    const lockedMoves: string[] = []; // TODO: Rename to rampage moves.
    const twoTurnMoves: string[] = [];
    const moveCallers: [string, dex.CallType][] = [];

    const sketchableMoves: string[] = [];

    const typeToMoves: {[T in dex.Type]: string[]} = {
        bug: [],
        dark: [],
        dragon: [],
        fire: [],
        flying: [],
        ghost: [],
        electric: [],
        fighting: [],
        grass: [],
        ground: [],
        ice: [],
        normal: [],
        poison: [],
        psychic: [],
        rock: [],
        steel: [],
        water: [],
        "???": [],
    };

    uid = 0;
    for (const move of [...gen.moves].sort((a, b) =>
        a.id < b.id ? -1 : +(a.id > b.id),
    )) {
        if (move.realMove || move.isNonstandard) continue;

        if (!move.noSketch) sketchableMoves.push(move.id);

        const category = move.category.toLowerCase() as dex.MoveCategory;
        const {basePower} = move;

        let damage: dex.MoveDamage | undefined;
        if (move.ohko) damage = "ohko";
        else if (move.damage) ({damage} = move);
        else {
            switch (move.id) {
                case "superfang":
                    damage = "half";
                    break;
                case "bide":
                    damage = "bide";
                    break;
                case "counter":
                case "mirrorcoat":
                    damage = "counter";
                    break;
                case "metalburst":
                    damage = "metalburst";
                    break;
                case "psywave":
                    damage = "psywave";
                    break;
                case "endeavor":
                    damage = "hpdiff";
                    break;
                default:
            }
        }

        const type = move.type.toLowerCase() as dex.Type;
        let modifyType: dex.MoveData["modifyType"];
        switch (move.id) {
            case "hiddenpower":
                modifyType = "hpType";
                break;
            case "judgment":
                modifyType = "plateType";
                break;
            case "struggle":
                modifyType = "???";
                break;
            default:
        }
        typeToMoves[type].push(move.id);

        const {target, nonGhostTarget} = move;

        const maxpp = move.noPPBoosts ? move.pp : Math.floor((move.pp * 8) / 5);
        const pp = [move.pp, maxpp] as const;

        let multihit: [number, number] | undefined;
        if (typeof move.multihit === "number") {
            multihit = [move.multihit, move.multihit];
        } else if (move.multihit) {
            if (move.multihit.length !== 2) {
                throw new Error(
                    `Move '${move.id}': Invalid multihit array ` +
                        `[${move.multihit.join(", ")}]`,
                );
            }
            multihit = move.multihit as [number, number];
        }

        const flags: NonNullable<dex.MoveData["flags"]> = {
            ...(!!move.flags.contact && {contact: true}),
            ...(Object.hasOwnProperty.call(explosive, move.id) && {
                explosive: true,
            }),
            ...(move.id === "focuspunch" && {focus: true}),
            // TODO(gen6): Support type-based ignoreImmunity flag.
            ...(category !== "status" &&
                move.ignoreImmunity && {ignoreImmunity: true}),
            ...(!!move.flags.bypasssub && {ignoreSub: true}),
            ...(Object.hasOwnProperty.call(interceptSwitch, move.id) && {
                interceptSwitch: true,
            }),
            ...(Object.hasOwnProperty.call(noMirror, move.id) && {
                noMirror: true,
            }),
            ...(Object.hasOwnProperty.call(noCopycat, move.id) && {
                noCopycat: true,
            }),
            ...(!!move.flags.reflectable && {reflectable: true}),
        };

        // Setup move effects.

        const self: dex.MoveEffectTarget = "self";
        const hit: dex.MoveEffectTarget = [
            "all",
            "allySide",
            "allyTeam",
            "self",
        ].includes(target)
            ? self
            : "hit";

        type MoveEffects = Writable<NonNullable<dex.MoveData["effects"]>>;

        // Boost.
        let boost: Writable<NonNullable<MoveEffects["boost"]>> =
            Object.hasOwnProperty.call(setBoostMap, move.id)
                ? {set: true, [hit]: setBoostMap[move.id]}
                : {
                      ...(move.boosts && {[hit]: move.boosts}),
                      ...(move.self?.boosts && {[self]: move.self.boosts}),
                      ...(Object.hasOwnProperty.call(customBoostMap, move.id)
                          ? customBoostMap[move.id]
                          : {}),
                  };

        // Status.
        let status: Writable<MoveEffects["status"]> = {
            ...(Object.hasOwnProperty.call(statusTypeMap, move.id) &&
            !Object.hasOwnProperty.call(explicitMoveEffect, move.id)
                ? {[hit]: statusTypeMap[move.id]}
                : move.volatileStatus &&
                  Object.hasOwnProperty.call(statusTypeMap, move.volatileStatus)
                ? {[hit]: statusTypeMap[move.volatileStatus]}
                : move.status &&
                  Object.hasOwnProperty.call(statusTypeMap, move.status)
                ? {[hit]: statusTypeMap[move.status]}
                : {}),
            ...(move.self?.volatileStatus &&
            Object.hasOwnProperty.call(statusTypeMap, move.self.volatileStatus)
                ? {[self]: statusTypeMap[move.self.volatileStatus]}
                : move.self?.status &&
                  Object.hasOwnProperty.call(statusTypeMap, move.self.status)
                ? {[self]: statusTypeMap[move.self.status]}
                : {}),
            ...(Object.hasOwnProperty.call(customStatusMap, move.id)
                ? customStatusMap[move.id]
                : {}),
        };

        // Add boost/status secondary effects.
        const psSecondaries =
            move.secondaries ?? (move.secondary && [move.secondary]) ?? [];
        for (const psSecondary of psSecondaries) {
            const tgt = psSecondary.self ? self : hit;
            const psHitEffect = psSecondary.self
                ? psSecondary.self
                : psSecondary;
            const chance = psSecondary.chance ?? 100;

            if (psHitEffect.boosts) boost = {chance, [tgt]: psHitEffect.boosts};
            if (psHitEffect.volatileStatus) {
                // TODO: Support flinching.
                if (
                    Object.hasOwnProperty.call(
                        statusTypeMap,
                        psHitEffect.volatileStatus,
                    )
                ) {
                    status = {
                        chance,
                        [tgt]: statusTypeMap[psHitEffect.volatileStatus],
                    };
                }
            }
            if (
                psHitEffect.status &&
                Object.hasOwnProperty.call(statusTypeMap, psHitEffect.status)
            ) {
                status = {chance, [tgt]: statusTypeMap[psHitEffect.status]};
            }
        }

        // Team.
        const team: Writable<MoveEffects["team"]> = {
            ...(Object.hasOwnProperty.call(teamStatusTypeMap, move.id)
                ? {[hit]: teamStatusTypeMap[move.id]}
                : move.sideCondition &&
                  Object.hasOwnProperty.call(
                      teamStatusTypeMap,
                      move.sideCondition,
                  )
                ? {[hit]: teamStatusTypeMap[move.sideCondition]}
                : move.slotCondition &&
                  Object.hasOwnProperty.call(
                      teamStatusTypeMap,
                      move.slotCondition,
                  )
                ? {[hit]: teamStatusTypeMap[move.slotCondition]}
                : {}),
            ...(move.self?.sideCondition &&
            Object.hasOwnProperty.call(
                teamStatusTypeMap,
                move.self.sideCondition,
            )
                ? {[self]: teamStatusTypeMap[move.self.sideCondition]}
                : move.self?.slotCondition &&
                  Object.hasOwnProperty.call(
                      teamStatusTypeMap,
                      move.self.slotCondition,
                  )
                ? {[self]: teamStatusTypeMap[move.self.slotCondition]}
                : {}),
        };

        const moveEffects: MoveEffects = {
            ...(Object.hasOwnProperty.call(transformMap, move.id) && {
                transform: true,
            }),

            ...(Object.hasOwnProperty.call(callTypeMap, move.id) && {
                call: callTypeMap[move.id],
            }),

            ...(move.isFutureMove
                ? {delay: {type: "future"}}
                : move.flags.charge
                ? {
                      delay: {
                          // TODO: Add effect for skullbash raising def on
                          // prepare.
                          type: "twoTurn",
                          ...(move.id === "solarbeam" && {solar: true}),
                      },
                  }
                : {}),

            ...(move.heal
                ? {
                      damage: {
                          type: "percent",
                          target: self,
                          // TODO: Should the fraction tuple be preserved in the
                          // MoveData?
                          percent: (100 * move.heal[0]) / move.heal[1],
                      },
                  }
                : Object.hasOwnProperty.call(customDamageMap, move.id)
                ? {damage: customDamageMap[move.id]}
                : {}),

            ...(Object.hasOwnProperty.call(countableStatusTypeMap, move.id) && {
                count: countableStatusTypeMap[move.id],
            }),

            ...(Object.keys(boost).length > 0 && {boost}),

            ...(Object.hasOwnProperty.call(swapBoostMap, move.id) && {
                swapBoosts: swapBoostMap[move.id],
            }),

            ...(Object.keys(status).length > 0 && {status}),

            ...(Object.keys(team).length > 0 && {team}),

            ...(Object.hasOwnProperty.call(fieldTypeMap, move.id)
                ? {field: fieldTypeMap[move.id]}
                : move.weather &&
                  Object.hasOwnProperty.call(fieldTypeMap, move.weather)
                ? {field: fieldTypeMap[move.weather]}
                : move.pseudoWeather &&
                  Object.hasOwnProperty.call(fieldTypeMap, move.pseudoWeather)
                ? {field: fieldTypeMap[move.pseudoWeather]}
                : {}),

            ...(Object.hasOwnProperty.call(changeTypeMap, move.id) && {
                changeType: changeTypeMap[move.id],
            }),

            ...(Object.hasOwnProperty.call(disableMoveMap, move.id) && {
                disableMove: true,
            }),

            ...(move.drain && {drain: move.drain}),

            ...(move.recoil
                ? {
                      recoil: {
                          ratio: move.recoil,
                          ...(move.struggleRecoil && {struggle: true}),
                      },
                  }
                : move.struggleRecoil
                ? {recoil: {ratio: [1, 4], struggle: true}}
                : {}),

            ...(move.selfdestruct && {
                selfFaint: move.selfdestruct as dex.MoveSelfFaint,
            }),

            ...(move.selfSwitch && {
                selfSwitch: move.selfSwitch as dex.SelfSwitchType,
            }),
            ...(Object.hasOwnProperty.call(selfSwitchMap, move.id) && {
                selfSwitch: selfSwitchMap[move.id],
            }),
        };

        if (moveEffects.call) moveCallers.push([move.id, moveEffects.call]);

        // Two turn/future moves are also recorded in a different object.
        switch (moveEffects.delay?.type) {
            case "future":
                futureMoves.push(move.id);
                break;
            case "twoTurn":
                twoTurnMoves.push(move.id);
                break;
            default:
        }

        // Implicit.
        const implicit: Writable<dex.MoveData["implicit"]> = {
            ...(Object.hasOwnProperty.call(implicitStatusTypeMap, move.id)
                ? {status: implicitStatusTypeMap[move.id]}
                : move.volatileStatus &&
                  Object.hasOwnProperty.call(
                      implicitStatusTypeMap,
                      move.volatileStatus,
                  )
                ? {status: implicitStatusTypeMap[move.volatileStatus]}
                : move.status &&
                  Object.hasOwnProperty.call(implicitStatusTypeMap, move.status)
                ? {status: implicitStatusTypeMap[move.status]}
                : move.self?.volatileStatus &&
                  Object.hasOwnProperty.call(
                      implicitStatusTypeMap,
                      move.self.volatileStatus,
                  )
                ? {status: implicitStatusTypeMap[move.self.volatileStatus]}
                : move.self?.status &&
                  Object.hasOwnProperty.call(
                      implicitStatusTypeMap,
                      move.self.status,
                  )
                ? {status: implicitStatusTypeMap[move.self.status]}
                : {}),

            ...(Object.hasOwnProperty.call(implicitTeamTypeMap, move.id)
                ? {team: implicitTeamTypeMap[move.id]}
                : move.sideCondition &&
                  Object.hasOwnProperty.call(
                      implicitTeamTypeMap,
                      move.sideCondition,
                  )
                ? {team: implicitTeamTypeMap[move.sideCondition]}
                : move.slotCondition &&
                  Object.hasOwnProperty.call(
                      implicitTeamTypeMap,
                      move.slotCondition,
                  )
                ? {team: implicitTeamTypeMap[move.slotCondition]}
                : move.self?.sideCondition &&
                  Object.hasOwnProperty.call(
                      implicitTeamTypeMap,
                      move.self.sideCondition,
                  )
                ? {team: implicitTeamTypeMap[move.self.sideCondition]}
                : move.self?.slotCondition &&
                  Object.hasOwnProperty.call(
                      implicitTeamTypeMap,
                      move.self.slotCondition,
                  )
                ? {team: implicitTeamTypeMap[move.self.slotCondition]}
                : {}),
        };

        // Add to lockedmove dict.
        if (
            implicit.status === "lockedMove" &&
            !lockedMoves.includes(move.id)
        ) {
            lockedMoves.push(move.id);
        }

        moves[uid] = [
            move.id,
            {
                uid,
                name: move.id,
                display: move.name,
                category,
                basePower,
                ...(damage && {damage}),
                type,
                ...(modifyType && {modifyType}),
                target,
                ...(nonGhostTarget && {nonGhostTarget}),
                pp,
                ...(multihit && {multihit}),
                ...(Object.keys(flags).length > 0 && {flags}),
                ...(Object.keys(moveEffects).length > 0 && {
                    effects: moveEffects,
                }),
                ...(Object.keys(implicit).length > 0 && {implicit}),
            },
        ];
        ++uid;
    }

    // Guarantee order.
    futureMoves.sort();
    lockedMoves.sort();
    twoTurnMoves.sort();
    moveCallers.sort((a, b) => (a[0] < b[0] ? -1 : +(a[0] > b[0])));

    //#endregion

    //#region Pokemon data and abilities.

    const pokemon: (readonly [string, dex.PokemonData])[] = [];

    const abilityNames = new Set<string>();

    uid = 0;
    for (const mon of [...gen.species].sort((a, b) =>
        a.id < b.id ? -1 : +(a.id > b.id),
    )) {
        const baseAbilities: string[] = [];
        for (const index in mon.abilities) {
            if (!Object.hasOwnProperty.call(mon.abilities, index)) continue;
            const abilityName = mon.abilities[index as keyof SpeciesAbility];
            if (!abilityName) continue;
            const abilityId = toIdName(abilityName);
            baseAbilities.push(abilityId);
            if (!abilityNames.has(abilityId)) abilityNames.add(abilityId);
        }

        const typeArr = mon.types.map(s => s.toLowerCase()) as dex.Type[];
        if (typeArr.length > 2) {
            console.error(`Error: Too many types for species '${mon.id}'`);
        } else if (typeArr.length === 1) typeArr.push("???");
        else if (typeArr.length <= 0) typeArr.push("???", "???");
        const types = typeArr as [dex.Type, dex.Type];

        const stats = mon.baseStats;

        let movepool: string[] = [];
        const learnset = await gen.learnsets.learnable(mon.id);
        for (const moveName in learnset) {
            if (!Object.hasOwnProperty.call(learnset, moveName)) continue;
            const sources = learnset[moveName];
            if (!sources || sources.length <= 0) continue;
            movepool.push(moveName);

            if (moveName === "sketch") {
                movepool = [...new Set([...movepool, ...sketchableMoves])];
            }
        }
        movepool.sort();

        const baseSpecies = mon.baseSpecies && toIdName(mon.baseSpecies);
        const baseForm = mon.baseForme && toIdName(mon.baseForme);
        const form = mon.forme && toIdName(mon.forme);
        let otherForms: string[] | undefined;
        if (mon.otherFormes) {
            const tmp = mon.otherFormes.map(toIdName);
            if (tmp.length > 0) otherForms = tmp.sort();
        }

        const entry: [string, dex.PokemonData] = [
            mon.id,
            {
                uid,
                id: mon.num,
                name: mon.id,
                display: mon.name,
                abilities: baseAbilities,
                types,
                baseStats: stats,
                weightkg: mon.weightkg,
                movepool,
                ...(baseSpecies && baseSpecies !== mon.id && {baseSpecies}),
                ...(baseForm && {baseForm}),
                ...(form && {form}),
                ...(otherForms && {otherForms}),
            },
        ];
        pokemon.push(entry);

        // Also add cosmetic forms.
        // These should have the same uids as the original since they are
        // functionally identical.
        for (const forme of mon.cosmeticFormes ?? []) {
            const mon2 = gen.species.get(forme);
            if (!mon2) continue;
            const [, entryData] = entry;
            // Omit baseForm/otherForms since that's part of the base form entry
            //  But here we're adding a derived form
            const {
                baseForm: _baseForm,
                otherForms: _otherForms,
                ...data
            } = entryData;
            void _baseForm, _otherForms;
            const name = toIdName(forme);
            pokemon.push([
                name,
                {
                    ...data,
                    name,
                    display: forme,
                    ...(baseSpecies && {baseSpecies}),
                    form: toIdName(mon2.forme),
                },
            ]);

            // Add alt form to list.
            entry[1] = {
                ...entry[1],
                otherForms: [...(entry[1].otherForms ?? []), name].sort(),
            };
        }

        // Cherrimsunshine is technically a "cosmetic" form but it changes to it
        // during battle, so keep the same uid for that form.
        if (mon.name !== "Cherrim") ++uid;
    }

    //#endregion

    //#region Ability data.

    const statusImmunityOn: dex.AbilityData["on"] = {
        start: {cure: true},
        block: {status: true},
        status: {cure: true},
    };

    /** Maps ability name to data. */
    const abilityData: {
        readonly [ability: string]: Pick<
            dex.AbilityData,
            "on" | "statusImmunity" | "flags"
        >;
    } = {
        naturalcure: {on: {switchOut: {cure: true}}},

        // TODO(insomnia/vitalspirit): when using rest, ability causes it to
        // fail if hp not full (`|-fail|mon|heal`).
        immunity: {
            on: statusImmunityOn,
            statusImmunity: {psn: true, tox: true},
        },
        insomnia: {on: statusImmunityOn, statusImmunity: {slp: true}},
        limber: {on: statusImmunityOn, statusImmunity: {par: true}},
        magmaarmor: {on: statusImmunityOn, statusImmunity: {frz: true}},
        // TODO: Oblivious should also be immune to captivate.
        oblivious: {on: statusImmunityOn, statusImmunity: {attract: true}},
        owntempo: {on: statusImmunityOn, statusImmunity: {confusion: true}},
        vitalspirit: {on: statusImmunityOn, statusImmunity: {slp: true}},
        waterveil: {on: statusImmunityOn, statusImmunity: {brn: true}},

        leafguard: {
            // Can block statuses during sun, but only when attempting to
            // afflict them.
            on: {block: {status: "SunnyDay"}},
            statusImmunity: {
                // Status is blocked silently (gen4) except for yawn.
                brn: "silent",
                par: "silent",
                psn: "silent",
                tox: "silent",
                slp: "silent",
                frz: "silent",
                yawn: true,
            },
        },

        trace: {on: {start: {copyFoeAbility: true}}},
        frisk: {on: {start: {revealItem: true}}},
        forewarn: {on: {start: {warnStrongestMove: true}}},
        moldbreaker: {on: {start: {}}, flags: {ignoreTargetAbility: true}},
        pressure: {on: {start: {}}},

        // TODO(dryskin): Sun/fire weakness.
        dryskin: {on: {block: {move: {type: "water", percentDamage: 25}}}},
        // TODO(gen3-4): Doesn't work while frozen.
        flashfire: {on: {block: {move: {type: "fire", status: "flashfire"}}}},
        levitate: {on: {block: {move: {type: "ground"}}}},
        motordrive: {on: {block: {move: {type: "electric", boost: {spe: 1}}}}},
        voltabsorb: {
            on: {block: {move: {type: "electric", percentDamage: 25}}},
        },
        waterabsorb: {on: {block: {move: {type: "water", percentDamage: 25}}}},
        // TODO(gen4 glitch): Firefang move ignores this ability.
        wonderguard: {on: {block: {move: {type: "nonSuper"}}}},

        damp: {on: {block: {effect: {explosive: true}}}},

        clearbody: {on: {tryUnboost: {block: dex.boostNames}}},
        hypercutter: {on: {tryUnboost: {block: {atk: true}}}},
        keeneye: {on: {tryUnboost: {block: {accuracy: true}}}},
        whitesmoke: {on: {tryUnboost: {block: dex.boostNames}}},

        aftermath: {on: {moveContactKo: {explosive: true, percentDamage: -25}}},

        cutecharm: {on: {moveContact: {chance: 30, status: ["attract"]}}},
        effectspore: {
            on: {moveContact: {chance: 30, status: ["par", "psn", "slp"]}},
        },
        flamebody: {on: {moveContact: {chance: 30, status: ["brn"]}}},
        poisonpoint: {on: {moveContact: {chance: 30, status: ["psn"]}}},
        roughskin: {on: {moveContact: {percentDamage: -6.25}}},
        static: {on: {moveContact: {chance: 30, status: ["par"]}}},

        colorchange: {on: {moveDamage: {changeToMoveType: true}}},

        liquidooze: {on: {moveDrain: {invert: true}}},

        gluttony: {flags: {earlyBerry: true}},

        // Note(gen3-4): No on-switchIn msg.
        airlock: {flags: {suppressWeather: true}},
        cloudnine: {flags: {suppressWeather: true}},

        klutz: {flags: {ignoreItem: true}},

        skilllink: {flags: {maxMultihit: true}},

        magicguard: {flags: {noIndirectDamage: true}},
        rockhead: {flags: {noIndirectDamage: "recoil"}},
    };

    const abilities: (readonly [string, dex.AbilityData])[] = [];

    uid = 0;
    for (const ability of [...gen.abilities].sort((a, b) =>
        a.id < b.id ? -1 : +(a.id > b.id),
    )) {
        abilities.push([
            ability.id,
            {
                uid,
                name: ability.id,
                display: ability.name,
                ...abilityData[ability.id],
            },
        ]);
        ++uid;
    }

    //#endregion

    //#region Items and berries.

    /** Maps some item names to item effects. */
    const itemOnMap: {
        readonly [item: string]: NonNullable<dex.ItemData["on"]>;
    } = {
        custapberry: {preMove: {threshold: 25, moveFirst: true}},

        powerherb: {moveCharge: {shorten: true, consume: true}},

        // Resist berries.
        tangaberry: {preHit: {resistSuper: "bug"}},
        colburberry: {preHit: {resistSuper: "dark"}},
        habanberry: {preHit: {resistSuper: "dragon"}},
        wacanberry: {preHit: {resistSuper: "electric"}},
        chopleberry: {preHit: {resistSuper: "fighting"}},
        occaberry: {preHit: {resistSuper: "fire"}},
        cobaberry: {preHit: {resistSuper: "flying"}},
        kasibberry: {preHit: {resistSuper: "ghost"}},
        rindoberry: {preHit: {resistSuper: "grass"}},
        shucaberry: {preHit: {resistSuper: "ground"}},
        yacheberry: {preHit: {resistSuper: "ice"}},
        chilanberry: {preHit: {resistSuper: "normal"}},
        kebiaberry: {preHit: {resistSuper: "poison"}},
        payapaberry: {preHit: {resistSuper: "psychic"}},
        chartiberry: {preHit: {resistSuper: "rock"}},
        babiriberry: {preHit: {resistSuper: "steel"}},
        passhoberry: {preHit: {resistSuper: "water"}},

        // TODO: Focusband.
        focussash: {tryOhko: {block: true, consume: true}},

        enigmaberry: {super: {heal: 25}},

        jabocaberry: {postHit: {condition: "physical", damage: 12.5}},
        rowapberry: {postHit: {condition: "special", damage: 12.5}},

        lifeorb: {movePostDamage: {percentDamage: -10}},

        // Fixed-heal berries.
        oranberry: {
            update: {condition: "hp", threshold: 50},
            eat: {type: "healFixed", heal: 10},
        },
        berryjuice: {
            update: {condition: "hp", threshold: 50},
            eat: {type: "healFixed", heal: 20},
        },
        // Percent-heal berries.
        sitrusberry: {
            update: {condition: "hp", threshold: 50},
            eat: {type: "healPercent", heal: 25},
        },
        figyberry: {
            update: {condition: "hp", threshold: 50},
            eat: {type: "healPercent", heal: 12.5, dislike: "atk"},
        },
        iapapaberry: {
            update: {condition: "hp", threshold: 50},
            eat: {type: "healPercent", heal: 12.5, dislike: "def"},
        },
        wikiberry: {
            update: {condition: "hp", threshold: 50},
            eat: {type: "healPercent", heal: 12.5, dislike: "spa"},
        },
        aguavberry: {
            update: {condition: "hp", threshold: 50},
            eat: {type: "healPercent", heal: 12.5, dislike: "spd"},
        },
        magoberry: {
            update: {condition: "hp", threshold: 50},
            eat: {type: "healPercent", heal: 12.5, dislike: "spe"},
        },
        // Stat-boost berries.
        liechiberry: {
            update: {condition: "hp", threshold: 25},
            eat: {type: "boost", boostOne: {atk: 1}},
        },
        ganlonberry: {
            update: {condition: "hp", threshold: 25},
            eat: {type: "boost", boostOne: {def: 1}},
        },
        petayaberry: {
            update: {condition: "hp", threshold: 25},
            eat: {type: "boost", boostOne: {spa: 1}},
        },
        apicotberry: {
            update: {condition: "hp", threshold: 25},
            eat: {type: "boost", boostOne: {spd: 1}},
        },
        salacberry: {
            update: {condition: "hp", threshold: 25},
            eat: {type: "boost", boostOne: {spe: 1}},
        },
        starfberry: {
            update: {condition: "hp", threshold: 25},
            eat: {
                type: "boost",
                boostOne: {atk: 2, def: 2, spa: 2, spd: 2, spe: 2},
            },
        },
        // Focusenergy berry.
        lansatberry: {
            update: {condition: "hp", threshold: 25},
            eat: {type: "focusenergy"},
        },
        // TODO: White herb.
        // Status items/berries.
        rawstberry: {
            update: {condition: "status", status: {brn: true}},
            eat: {type: "cure", cure: {brn: true}},
        },
        cheriberry: {
            update: {condition: "status", status: {par: true}},
            eat: {type: "cure", cure: {par: true}},
        },
        pechaberry: {
            update: {condition: "status", status: {psn: true, tox: true}},
            eat: {type: "cure", cure: {psn: true, tox: true}},
        },
        chestoberry: {
            update: {condition: "status", status: {slp: true}},
            eat: {type: "cure", cure: {slp: true}},
        },
        aspearberry: {
            update: {condition: "status", status: {frz: true}},
            eat: {type: "cure", cure: {frz: true}},
        },
        persimberry: {
            update: {condition: "status", status: {confusion: true}},
            eat: {type: "cure", cure: {confusion: true}},
        },
        lumberry: {
            update: {
                condition: "status",
                status: {
                    brn: true,
                    par: true,
                    psn: true,
                    tox: true,
                    slp: true,
                    frz: true,
                    confusion: true,
                },
            },
            eat: {
                type: "cure",
                cure: {
                    brn: true,
                    par: true,
                    psn: true,
                    tox: true,
                    slp: true,
                    frz: true,
                    confusion: true,
                },
            },
        },
        // Note(gen4): only cures attract.
        mentalherb: {
            update: {
                condition: "status",
                status: {attract: true},
                cure: true,
                consume: true,
            },
        },
        // Move-restoring berries.
        leppaberry: {
            update: {condition: "depleted"},
            eat: {type: "restore", restore: 10},
        },

        blacksludge: {residual: {poisonDamage: 6.25, noPoisonDamage: -12.5}},
        leftovers: {residual: {poisonDamage: 6.25, noPoisonDamage: 6.25}},
        stickybarb: {residual: {poisonDamage: -12.5, noPoisonDamage: -12.5}},
        flameorb: {residual: {status: "brn"}},
        toxicorb: {residual: {status: "tox"}},
        micleberry: {
            residual: {threshold: 25},
            eat: {type: "status", status: "micleberry"},
        },
    };

    const items: (readonly [string, dex.ItemData])[] = [
        // Make sure that having no item is possible.
        ["none", {uid: 0, name: "none", display: "None"}],
    ];
    const berries: (readonly [string, dex.NaturalGiftData])[] = [];

    uid = 1;
    for (const item of [...gen.items].sort((a, b) =>
        a.id < b.id ? -1 : +(a.id > b.id),
    )) {
        if (item.isBerry && item.naturalGift) {
            berries.push([
                item.id,
                {
                    basePower: item.naturalGift.basePower,
                    type: item.naturalGift.type.toLowerCase() as dex.Type,
                },
            ]);
        }

        items.push([
            item.id,
            {
                uid,
                name: item.id,
                display: item.name,
                ...(item.isChoice && {isChoice: true}),
                ...(item.isBerry && {isBerry: true}),
                ...(item.onPlate && {
                    plateType: item.onPlate.toLowerCase() as dex.Type,
                }),
                ...(Object.hasOwnProperty.call(itemOnMap, item.id) && {
                    on: itemOnMap[item.id],
                }),
            },
        ]);
        ++uid;
    }

    //#endregion

    //#region Print data.

    /**
     * Creates an export dictionary for an array of dictionary entries.
     *
     * @param entries Array to stringify.
     * @param name Name of the dictionary.
     * @param typeName Type name for the dictionary values.
     * @param converter Stringifier for dictionary values.
     * @param indent Number of indent spaces. Default 4.
     */
    function exportEntriesToDict<T>(
        entries: (readonly [string, T])[],
        name: string,
        typeName: string,
        converter: (t: T) => string,
        indent = 4,
    ): string {
        let result =
            `export const ${name}: {readonly [name: string]: ` +
            `${typeName}} = {`;
        const s = " ".repeat(indent);

        for (const [key, value] of entries) {
            result += `\n${s}${maybeQuote(key)}: ${converter(value)},`;
        }
        return result + "\n};";
    }

    /**
     * Creates an export dictionary for a dictionary, sorting the keys in
     * alphabetic order.
     *
     * @param dict Dictionary to stringify.
     * @param name Name of the dictionary.
     * @param typeName Type name for the dictionary.
     * @param converter Stringifier for dictionary keys.
     * @param indent Number of indent spaces. Default 4.
     */
    function exportDict<T>(
        dict: {readonly [name: string]: T},
        name: string,
        typeName: string,
        converter: (value: T) => string,
        indent = 4,
    ): string {
        const s = " ".repeat(indent);
        return (
            Object.keys(dict)
                .sort()
                .reduce(
                    (prev, key) =>
                        prev +
                        `\n${s}${maybeQuote(key)}: ${converter(dict[key])},`,
                    `export const ${name}: ${typeName} = {`,
                ) + "\n};"
        );
    }

    /**
     * Stringifies a dictionary.
     *
     * @param dict Dictionary to stringify.
     * @param converter Stringifier for dictionary values.
     */
    function stringifyDict(
        dict: {readonly [name: string]: unknown},
        converter: (value: unknown) => string,
    ): string {
        const entries: string[] = [];
        for (const key in dict) {
            if (!Object.hasOwnProperty.call(dict, key)) continue;
            entries.push(`${maybeQuote(key)}: ${converter(dict[key])}`);
        }
        return "{" + entries.join(", ") + "}";
    }

    /**
     * Recursively stringifies a dictionary.
     *
     * @param dict Dictionary to stringify.
     * @param converter Stringifier for dictionary values.
     */
    function deepStringifyDict(
        dict: Record<string, unknown>,
        converter: (value: unknown) => string,
    ): string {
        const entries: string[] = [];
        for (const key in dict) {
            if (!Object.hasOwnProperty.call(dict, key)) continue;

            let str: string;
            const value = dict[key];
            if (Array.isArray(value)) {
                str = deepStringifyArray(value, converter);
            } else if (typeof value === "object" && value) {
                str = deepStringifyDict(
                    value as {[name: string]: unknown},
                    converter,
                );
            } else str = converter(value);

            entries.push(`${maybeQuote(key)}: ${str}`);
        }
        return "{" + entries.join(", ") + "}";
    }

    /**
     * Recursively stringifies an array.
     *
     * @param arr Array to stringify.
     * @param converter Stringifier for array values.
     */
    function deepStringifyArray(
        arr: unknown[],
        converter: (value: unknown) => string,
    ): string {
        const values: string[] = [];
        for (const value of arr) {
            let str: string;
            if (Array.isArray(value)) {
                str = deepStringifyArray(value, converter);
            } else if (typeof value === "object" && value) {
                str = deepStringifyDict(
                    value as {[name: string]: unknown},
                    converter,
                );
            } else str = converter(value);

            values.push(str);
        }
        return `[${values.join(", ")}]`;
    }

    /**
     * Creates an export array.
     *
     * @param arr Array to stringify.
     * @param name Name of the dictionary.
     * @param typeName Type name for the array values.
     * @param converter Stringifier for array values.
     */
    const exportArray = <T>(
        arr: readonly T[],
        name: string,
        typeName: string,
        converter: (t: T) => string,
    ): string =>
        `export const ${name}: readonly ${typeName}[] = [` +
        arr.map(converter).join(", ") +
        "];";

    /**
     * Creates an export dictionary, string union, etc. for a specific set of
     * moves.
     *
     * @param moves Array of the move names.
     * @param name Name for the variable.
     * @param display Name in the docs. Omit to assume `name` argument.
     */
    function exportSpecificMoves(
        moveNames: readonly string[],
        name: string,
        display = name,
        indent = 4,
    ): string {
        const s = " ".repeat(indent);
        const cap = name.slice(0, 1).toUpperCase() + name.slice(1);

        // Build set of all moves of this specific type.
        return (
            moveNames.reduce(
                (prev, moveName, i) => prev + `\n${s}${moveName}: ${i},`,
                `/**\n * Set of all {@link ${cap}Move ${display}} moves.` +
                    "\n *\n * Maps move name to its id within this object." +
                    `\n */\nexport const ${name}Moves = {`,
            ) +
            `\n} as const;

/** Types of ${display} moves. */
export type ${cap}Move = keyof typeof ${name}Moves;

/** Sorted array of all {@link ${cap}Move ${display}} moves. */
${exportArray(moveNames, `${name}MoveKeys`, `${cap}Move`, quote)}

/** Checks if a value is a {@link ${cap}Move}. */
export function is${cap}Move(value: unknown): value is ${cap}Move {
    return Object.hasOwnProperty.call(${name}Moves, value as PropertyKey);
}`
        );
    }

    /**
     * Creates an exported memoized function for wrapping mapped `dex`
     * structures.
     *
     * @param name Name of the wrapper class.
     * @param dataName Name of the `dex` wrapped type.
     * @param mapName Name of the `dex` type map.
     */
    function exportDataWrapper(
        name: string,
        dataName: string,
        mapName: string,
    ): string {
        const lower = name.charAt(0).toLowerCase() + name.substr(1);
        return `\
/** Memoization of {@link get${name}}. */
const ${lower}Memo = new Map<${dataName}, wrappers.${name}>();

/**
 * Gets or creates a {@link ${dataName}} wrapper.
 *
 * @param data Data to wrap.
 * @returns The wrapper.
 */
export function get${name}(data: ${dataName}): wrappers.${name};
/**
 * Gets or creates a {@link ${dataName}} wrapper.
 *
 * @param name Name of the {@link ${dataName}}.
 * @returns A {@link ${dataName}} wrapper, or \`null\` if not found in
 * {@link ${mapName}}.
 */
export function get${name}(name: string): wrappers.${name} | null;
export function get${name}(name: string | ${dataName}): wrappers.${name} | null
{
    if (typeof name === "string") {
        if (!Object.hasOwnProperty.call(${mapName}, name)) return null;
        name = ${mapName}[name];
    }
    let result = ${lower}Memo.get(name);
    if (!result) ${lower}Memo.set(name, (result = new wrappers.${name}(name)));
    return result;
}`;
    }

    console.log(`\
// istanbul ignore file
/**
 * @file Generated file containing all the dex data taken from Pokemon Showdown.
 */
import * as dex from "./dex-util";
import * as wrappers from "./wrappers";

/**
 * Contains {@link dex.PokemonData info} about each species, with alternate
 * forms as separate entries.
 */
${exportEntriesToDict(pokemon, "pokemon", "dex.PokemonData", p =>
    deepStringifyDict({...p}, v => (typeof v === "string" ? quote(v) : `${v}`)),
)}

/** Sorted array of all pokemon names. */
${exportArray(pokemon, "pokemonKeys", "string", ([name]) => quote(name))}

${exportDataWrapper("Ability", "dex.AbilityData", "abilities")}

/** Contains {@link dex.AbilityData info} about each ability. */
${exportEntriesToDict(abilities, "abilities", "dex.AbilityData", a =>
    deepStringifyDict({...a}, v => (typeof v === "string" ? quote(v) : `${v}`)),
)}

/** Sorted array of all ability names. */
${exportArray(abilities, "abilityKeys", "string", ([name]) => quote(name))}

${exportDataWrapper("Move", "dex.MoveData", "moves")}

/** Contains {@link dex.MoveData info} about each move. */
${exportEntriesToDict(moves, "moves", "dex.MoveData", m =>
    deepStringifyDict({...m}, v => (typeof v === "string" ? quote(v) : `${v}`)),
)}

/** Sorted array of all move names. */
${exportArray(moves, "moveKeys", "string", ([name]) => quote(name))}

${exportSpecificMoves(futureMoves, "future")}

${exportSpecificMoves(lockedMoves, "locked")}

${exportSpecificMoves(twoTurnMoves, "twoTurn", "two-turn")}

/** Maps a move name to its {@link dex.CallType}, if any. */
${exportEntriesToDict(moveCallers, "moveCallers", "dex.CallType", v =>
    typeof v === "string" ? quote(v) : v.toString(),
)}

/** Maps move type to each move of that type. */
${exportDict(
    typeToMoves,
    "typeToMoves",
    "{readonly [T in dex.Type]: readonly string[]}",
    a => `[${a.map(quote).join(", ")}]`,
)}

${exportDataWrapper("Item", "dex.ItemData", "items")}

/** Contains {@link dex.ItemData info} about each item. */
${exportEntriesToDict(items, "items", "dex.ItemData", i =>
    deepStringifyDict({...i}, v => (typeof v === "string" ? quote(v) : `${v}`)),
)}

/** Sorted array of all item names, except with \`none\` at position 0. */
${exportArray(items, "itemKeys", "string", i => quote(i[0]))}

/**
 * Contains {@link dex.NaturalGiftData additional info} about each berry item.
 */
${exportEntriesToDict(berries, "berries", "dex.NaturalGiftData", b =>
    stringifyDict({...b}, v => (typeof v === "string" ? quote(v) : `${v}`)),
)}`);

    //#endregion
})();
