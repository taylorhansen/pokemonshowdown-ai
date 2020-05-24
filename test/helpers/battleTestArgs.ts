/** @file Contains test arguments for battle messages. */
import { PokemonDetails, PokemonID, PokemonStatus } from
    "../../src/psbot/helpers";
import { AnyBattleEvent, TurnEvent } from
    "../../src/psbot/parser/BattleEvent";
import { BattleInitMessage, BattleProgressMessage, RequestMessage } from
    "../../src/psbot/parser/Message";

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
    {hp: 353, hpMax: 353, condition: null},
    {hp: 100, hpMax: 100, condition: null},
    {hp: 300, hpMax: 300, condition: null}
];

/** Test BattleEvents except turn/upkeep. */
export const battleEvent: AnyBattleEvent[] =
[
    {type: "\n"},
    {type: "-ability", id: pokemonId[0], ability: "Pressure"},
    {type: "-activate", id: pokemonId[1], volatile: "ingrain", otherArgs: []},
    {
        type: "-activate", id: pokemonId[0], volatile: "confustion",
        otherArgs: [], fatigue: true
    },
    {
        type: "-boost", id: pokemonId[1], stat: "atk", amount: -1,
        from: "ability: Intimidate", of: pokemonId[0]
    },
    {type: "cant", id: pokemonId[1], reason: "recharge"},
    {type: "cant", id: pokemonId[1], reason: "taunt", moveName: "Thunder Wave"},
    {type: "-clearallboost"},
    {type: "-clearboost", id: pokemonId[2]},
    {type: "-clearnegativeboost", id: pokemonId[0]},
    {type: "-clearpositiveboost", id: pokemonId[1]},
    {type: "-copyboost", source: pokemonId[2], target: pokemonId[0]},
    {type: "-crit", id: pokemonId[0]},
    {type: "-curestatus", id: pokemonId[0], majorStatus: "psn"},
    {type: "-cureteam", id: pokemonId[2]},
    {type: "-damage", id: pokemonId[1], status: pokemonStatus[1]},
    {
        type: "detailschange", id: pokemonId[0], ...pokemonDetails[0],
        ...pokemonStatus[0]
    },
    {
        type: "drag", id: pokemonId[1], ...pokemonDetails[1],
        ...pokemonStatus[1]
    },
    {type: "-end", id: pokemonId[2], volatile: "confusion"},
    {type: "-endability", id: pokemonId[1], ability: "Swift Swim"},
    {type: "-enditem", id: pokemonId[0], item: "Lum Berry", eat: true},
    {
        type: "-enditem", id: pokemonId[2], item: "Sitrus Berry",
        from: "stealeat"
    },
    {type: "-fail", id: pokemonId[1]},
    {type: "faint", id: pokemonId[2]},
    {type: "-fieldend", effect: "move: Gravity"},
    {type: "-fieldstart", effect: "move: Gravity"},
    {
        type: "-formechange", id: pokemonId[0], ...pokemonDetails[0],
        ...pokemonStatus[0]
    },
    {
        type: "-heal", id: pokemonId[1], status: pokemonStatus[1],
        from: "item: Leftovers"
    },
    {type: "-hitcount", id: pokemonId[2], count: 3},
    {type: "-immune", id: pokemonId[0]},
    {type: "-invertboost", id: pokemonId[2]},
    {type: "-item", id: pokemonId[2], item: "Leftovers", from: "move: Trick"},
    {type: "-miss", id: pokemonId[2], targetId: pokemonId[0]},
    {
        type: "move", id: pokemonId[0], moveName: "Splash",
        targetId: pokemonId[1]
    },
    {type: "move", id: pokemonId[1], moveName: "Splash", miss: true},
    {
        type: "move", id: pokemonId[1], moveName: "Splash",
        targetId: pokemonId[0], from: "lockedmove"
    },
    {type: "-mustrecharge", id: pokemonId[2]},
    {
        type: "-prepare", id: pokemonId[1], moveName: "Solar Beam",
        targetId: pokemonId[0]
    },
    {type: "-prepare", id: pokemonId[0], moveName: "Razor Wind"},
    {type: "-resisted", id: pokemonId[1]},
    {type: "-setboost", id: pokemonId[2], stat: "evasion", amount: 6},
    {type: "-sethp", id: pokemonId[0], status: pokemonStatus[0]},
    {type: "-singlemove", id: pokemonId[1], move: "Destiny Bond"},
    {type: "-singleturn", id: pokemonId[2], status: "Protect"},
    {type: "-sideend", id: "p1", condition: "Spikes"},
    {type: "-sidestart", id: "p2", condition: "move: Stealth Rock"},
    {
        type: "-start", id: pokemonId[0], volatile: "confusion", otherArgs: [],
        fatigue: true
    },
    {
        type: "-start", id: pokemonId[1], volatile: "Disable",
        otherArgs: ["Splash"]
    },
    {type: "-status", id: pokemonId[0], majorStatus: "slp"},
    {type: "-supereffective", id: pokemonId[1]},
    {
        type: "-swapboost", source: pokemonId[2], target: pokemonId[1],
        stats: ["atk", "accuracy"]
    },
    {
        type: "switch", id: pokemonId[0], ...pokemonDetails[0],
        ...pokemonStatus[0]
    },
    {type: "tie"},
    {type: "-transform", source: pokemonId[0], target: pokemonId[1]},
    {
        type: "-weather", weatherType: "Hail", upkeep: false,
        from: "ability: Snow Warning",
        of: {owner: "p2", position: "a", nickname: "Abomasnow"}
    },
    {type: "-unboost", id: pokemonId[2], stat: "evasion", amount: 2},
    {type: "-weather", weatherType: "none", upkeep: false},
    {type: "-weather", weatherType: "RainDance", upkeep: true},
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
        type: "battleinit", id: "p1", username: username[0],
        gameType: "singles", gen: 4, teamSizes: {p1: 6, p2: 6},
        events: battleEvent.slice(0, 6).concat(startTurn)
    },
    {
        type: "battleinit", id: "p1", username: username[0],
        gameType: "singles", gen: 4, teamSizes: {p1: 6, p2: 6},
        events: battleEvent.slice(6, 10).concat(startTurn)
    },
    {
        type: "battleinit", id: "p2", username: username[1],
        gameType: "singles", gen: 4, teamSizes: {p1: 6, p2: 6},
        events: battleEvent.slice(10, 14).concat(startTurn)
    }
];

/** Test BattleProgressMessages. */
export const battleProgress: BattleProgressMessage[] =
[
    {
        type: "battleprogress",
        events: battleEvent.slice(14, 21)
            .concat({type: "upkeep"}, {type: "turn", num: 2})
    },
    {
        type: "battleprogress",
        events: battleEvent.slice(21, 26)
            .concat({type: "upkeep"}, ...battleEvent.slice(26, 29),
                {type: "turn", num: 100})
    },
    {
        type: "battleprogress",
        events: battleEvent.slice(29, 39)
            .concat({type: "upkeep"}, ...battleEvent.slice(39),
                {type: "turn", num: 9})
    }
];

/**
 * Test RequestMessages. Even indexes belong to p1 while odd ones belong to p2.
 */
export const request: RequestMessage[] =
[
    {
        type: "request",
        side:
        {
            pokemon:
            [
                {
                    ...requestId[0], ...pokemonDetails[0], ...pokemonStatus[0],
                    active: true,
                    stats: {atk: 256, def: 216, spa: 344, spd: 216, spe: 296},
                    moves: ["psychocut"], baseAbility: "pressure",
                    item: "leftovers", pokeball: "masterball"
                },
                {
                    ...requestId[2], ...pokemonDetails[2], ...pokemonStatus[2],
                    active: false,
                    stats: {atk: 156, def: 176, spa: 206, spd: 186, spe: 116},
                    moves: ["tackle"], baseAbility: "trace",
                    item: "choicescarf", pokeball: "greatball"
                }
            ]
        }
    },
    {
        type: "request",
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
                    ...requestId[1], ...pokemonDetails[1],
                    ...pokemonStatus[1], active: true,
                    stats: {atk: 30, def: 75, spa: 35, spd: 40, spe: 100},
                    moves: ["splash", "tackle"], baseAbility: "swiftswim",
                    item: "lifeorb", pokeball: "pokeball"
                }
            ]
        }
    }
];
