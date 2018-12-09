/** @file Contains test arguments for battle messages. */
import { BattleInitArgs, BattleProgressArgs, RequestArgs } from
    "../../src/bot/AnyMessageListener";
import { BattleEvent, Cause, PokemonDetails, PokemonID, PokemonStatus } from
    "../../src/bot/messageData";

export const username: string[] = ["user1", "user2"];

/** Test PokemonIDs. Even indexes belong to p1 while odd ones belong to p2. */
export const pokemonId: PokemonID[] =
[
    {owner: "p1", position: "a", nickname: "hi"},
    {owner: "p2", position: "b", nickname: "nou"},
    {owner: "p1", position: "a", nickname: "Pentagon"}
];

/** Test PokemonDetails. Matches corresponding pokemonId. */
export const pokemonDetails: PokemonDetails[] =
[
    {species: "Magikarp", shiny: true, gender: "M", level: 50},
    {species: "Mewtwo", shiny: false, gender: null, level: 100},
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
    {type: "fatigue"}, {type: "item", item: "Leftovers"}, {type: "lockedmove"}
];

/** Test BattleEvents. */
export const battleEvent: BattleEvent[] =
[
    {type: "ability", id: pokemonId[0], ability: "Pressure"},
    {type: "activate", id: pokemonId[1], volatile: "ingrain"},
    {type: "boost", id: pokemonId[2], stat: "atk", amount: 2},
    {type: "boost", id: pokemonId[2], stat: "evasion", amount: -1},
    {type: "cant", id: pokemonId[1], reason: "recharge"},
    {type: "curestatus", id: pokemonId[0], majorStatus: "psn"},
    {type: "cureteam", id: pokemonId[2]},
    {type: "damage", id: pokemonId[1], status: pokemonStatus[1]},
    {type: "end", id: pokemonId[2], volatile: "confusion"},
    {type: "faint", id: pokemonId[2]},
    {
        type: "heal", id: pokemonId[1], status: pokemonStatus[1],
        cause: cause[1]
    },
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
    {type: "start", id: pokemonId[0], volatile: "confusion", cause: cause[0]},
    {type: "status", id: pokemonId[0], majorStatus: "slp"},
    {
        type: "switch", id: pokemonId[0], details: pokemonDetails[0],
        status: pokemonStatus[0]
    },
    {
        type: "switch", id: pokemonId[1], details: pokemonDetails[1],
        status: pokemonStatus[1]
    },
    {type: "tie"}, {type: "win", winner: username[1]}
];

/**
 * Test BattleInitArgs. Even indexes belong to p1 while odd ones belong to p2.
 */
export const battleInit: BattleInitArgs[] =
[
    {
        id: "p1", username: username[0], gameType: "singles", gen: 4,
        teamSizes: {p1: 6, p2: 6},
        events: [battleEvent[0], battleEvent[1], battleEvent[2]]
    },
    {
        id: "p1", username: username[0], gameType: "singles", gen: 4,
        teamSizes: {p1: 6, p2: 6},
        events: [battleEvent[3], battleEvent[4]]
    },
    {
        id: "p2", username: username[1], gameType: "singles", gen: 4,
        teamSizes: {p1: 6, p2: 6},
        events: [battleEvent[5], battleEvent[6]]
    }
];

/** Test BattleProgressArgs. */
export const battleProgress: BattleProgressArgs[] =
[
    {
        events: [battleEvent[7], battleEvent[8]],
        upkeep: {pre: [battleEvent[9], battleEvent[10]], post: []},
        turn: 2
    },
    {
        events: [battleEvent[11], battleEvent[12]],
        upkeep:
        {
            pre: [battleEvent[13]], post: [battleEvent[14], battleEvent[15]]
        },
        turn: 100
    },
    {
        events: [battleEvent[16], battleEvent[17], battleEvent[18]],
        upkeep:
        {
            pre: [], post: [battleEvent[19], battleEvent[20], battleEvent[21]]
        },
        turn: 9
    }
];

/** Test RequestArgs. Even indexes belong to p1 while odd ones belong to p2. */
export const request: RequestArgs[] =
[
    {
        side:
        {
            pokemon:
            [
                {
                    ident: pokemonId[0],
                    details: pokemonDetails[0],
                    condition: pokemonStatus[0],
                    active: true,
                    stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                    moves: ["splash"], baseAbility: "swiftswim",
                    item: "choiceband", pokeball: "masterball"
                },
                {
                    ident: pokemonId[2],
                    details: pokemonDetails[2],
                    condition: pokemonStatus[2],
                    active: false,
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
                        move: "Splash", id: "splash", pp: 24, maxpp: 24,
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
                    ident: pokemonId[1],
                    details: pokemonDetails[1],
                    condition: pokemonStatus[1],
                    active: true,
                    stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                    moves: ["hiddenpowerfire70", "splash"],
                    baseAbility: "pressure", item: "lifeorb",
                    pokeball: "pokeball"
                }
            ]
        }
    }
];
