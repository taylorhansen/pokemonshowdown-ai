/** @file Contains test arguments for battle messages. */
import { AnyBattleEvent, Cause, TurnEvent } from
    "../../src/bot/dispatcher/BattleEvent";
import { BattleInitMessage, BattleProgressMessage, RequestMessage } from
    "../../src/bot/dispatcher/Message";
import { PokemonDetails, PokemonID, PokemonStatus } from
    "../../src/bot/helpers";

export const username: string[] = ["user1", "user2"];

/** Test PokemonIDs. Even indexes belong to p1 while odd ones belong to p2. */
export const pokemonId: PokemonID[] =
[
    {owner: "p1", position: "a", nickname: "hi"},
    {owner: "p2", position: "b", nickname: "nou"},
    {owner: "p1", position: "a", nickname: "Pentagon"}
];

/** Test PokemonIDs for RequestMessages. Corresponds to pokemonId array. */
const requestId: PokemonID[] =
[
    {owner: "p1", nickname: "hi"},
    {owner: "p2", nickname: "nou"},
    {owner: "p1", nickname: "Pentagon"}
];

/** Test PokemonDetails. Matches corresponding pokemonId. */
export const pokemonDetails: PokemonDetails[] =
[
    {species: "Mewtwo", shiny: false, gender: null, level: 100},
    {species: "Magikarp", shiny: true, gender: "M", level: 50},
    {species: "Porygon", shiny: false, gender: null, level: 100}
];

/** Test PokemonStatuses. Matches corresponding pokemonId. */
export const pokemonStatus: PokemonStatus[] =
[
    {hp: 100, hpMax: 100, condition: "par"},
    {hp: 9001, hpMax: 9001, condition: ""},
    {hp: 0, hpMax: 0, condition: ""}
];

/** Test Causes. */
export const cause: Cause[] =
[
    {type: "ability", ability: "Intimidate", of: pokemonId[0]},
    {type: "fatigue"}, {type: "item", item: "Leftovers"}, {type: "lockedmove"}
];

/** Test BattleEvents except turn/upkeep. */
export const battleEvent: AnyBattleEvent[] =
[
    {type: "ability", id: pokemonId[0], ability: "Pressure"},
    {type: "activate", id: pokemonId[1], volatile: "ingrain"},
    {type: "boost", id: pokemonId[2], stat: "atk", amount: -1, cause: cause[0]},
    {type: "boost", id: pokemonId[2], stat: "evasion", amount: 2},
    {type: "cant", id: pokemonId[1], reason: "recharge"},
    {type: "cant", id: pokemonId[1], reason: "taunt", moveName: "Thunder Wave"},
    {type: "curestatus", id: pokemonId[0], majorStatus: "psn"},
    {type: "cureteam", id: pokemonId[2]},
    {type: "damage", id: pokemonId[1], status: pokemonStatus[1]},
    {
        type: "damage", id: pokemonId[1], status: pokemonStatus[1],
        cause: cause[1]
    },
    {type: "end", id: pokemonId[2], volatile: "confusion"},
    {type: "faint", id: pokemonId[2]},
    {type: "fieldend", effect: "move: Gravity"},
    {type: "fieldstart", effect: "move: Gravity"},
    {
        type: "move", id: pokemonId[0], moveName: "Splash",
        targetId: pokemonId[1]
    },
    {
        type: "move", id: pokemonId[1], moveName: "Splash",
        targetId: pokemonId[0], cause: cause[2]
    },
    {type: "mustrecharge", id: pokemonId[2]},
    {
        type: "prepare", id: pokemonId[1], moveName: "Solar Beam",
        targetId: pokemonId[0]
    },
    {
        type: "sethp",
        newHPs:
        [
            {id: pokemonId[0], status: pokemonStatus[0]},
            {id: pokemonId[1], status: pokemonStatus[1]}
        ]
    },
    {type: "singleturn", id: pokemonId[2], status: "Protect"},
    {
        type: "start", id: pokemonId[0], volatile: "confusion", otherArgs: [],
        cause: cause[3]
    },
    {
        type: "start", id: pokemonId[1], volatile: "Disable",
        otherArgs: ["Splash"]
    },
    {type: "status", id: pokemonId[0], majorStatus: "slp"},
    {
        type: "switch", id: pokemonId[0], details: pokemonDetails[0],
        status: pokemonStatus[0]
    },
    {
        type: "switch", id: pokemonId[1], details: pokemonDetails[1],
        status: pokemonStatus[1]
    },
    {type: "tie"},
    {
        type: "weather", weatherType: "Hail", upkeep: false,
        cause:
        {
            type: "ability", ability: "Snow Warning",
            of: {owner: "p2", position: "a", nickname: "Abomasnow"}
        }
    },
    {type: "weather", weatherType: "none", upkeep: false},
    {type: "weather", weatherType: "RainDance", upkeep: true},
    {type: "win", winner: username[1]}
];

const startTurn: TurnEvent = {type: "turn", num: 1};

/**
 * Test BattleInitMessages. Even indexes belong to p1 while odd ones belong to
 * p2.
 */
export const battleInit: BattleInitMessage[] =
[
    {
        id: "p1", username: username[0], gameType: "singles", gen: 4,
        teamSizes: {p1: 6, p2: 6},
        events: battleEvent.slice(0, 4).concat(startTurn)
    },
    {
        id: "p1", username: username[0], gameType: "singles", gen: 4,
        teamSizes: {p1: 6, p2: 6},
        events: battleEvent.slice(4, 8).concat(startTurn)
    },
    {
        id: "p2", username: username[1], gameType: "singles", gen: 4,
        teamSizes: {p1: 6, p2: 6},
        events: battleEvent.slice(8, 10).concat(startTurn)
    }
];

/** Test BattleProgressMessages. */
export const battleProgress: BattleProgressMessage[] =
[
    {
        events: battleEvent.slice(10, 13)
            .concat({type: "upkeep"}, {type: "turn", num: 2})
    },
    {
        events: battleEvent.slice(13, 17)
            .concat({type: "upkeep"}, ...battleEvent.slice(17, 20),
                {type: "turn", num: 100})
    },
    {
        events: battleEvent.slice(20, 24)
            .concat({type: "upkeep"}, ...battleEvent.slice(24, 30),
                {type: "turn", num: 9})
    }
];

/**
 * Test RequestMessages. Even indexes belong to p1 while odd ones belong to p2.
 */
export const request: RequestMessage[] =
[
    {
        side:
        {
            pokemon:
            [
                {
                    ident: requestId[0], details: pokemonDetails[0],
                    condition: pokemonStatus[0], active: true,
                    stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                    moves: ["psychocut"], baseAbility: "pressure",
                    item: "leftovers", pokeball: "masterball"
                },
                {
                    ident: requestId[2], details: pokemonDetails[2],
                    condition: pokemonStatus[2], active: false,
                    stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                    moves: ["tackle"], baseAbility: "trace",
                    item: "choicescarf", pokeball: "greatball"
                }
            ]
        }
    },
    {
        active:
        [
            {
                moves:
                [
                    {
                        move: "Splash", id: "splash", pp: 64, maxpp: 64,
                        target: "self", disabled: false
                    }
                ]
            }
        ],
        side:
        {
            pokemon:
            [
                {
                    ident: requestId[1], details: pokemonDetails[1],
                    condition: pokemonStatus[1], active: true,
                    stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                    moves: ["splash", "tackle"], baseAbility: "swiftswim",
                    item: "lifeorb", pokeball: "pokeball"
                }
            ]
        }
    }
];
