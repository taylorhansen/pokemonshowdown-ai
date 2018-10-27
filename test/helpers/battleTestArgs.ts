/** @file Contains test arguments for battle messages. */
import { BattleInitArgs, BattleProgressArgs, RequestArgs } from
    "../../src/AnyMessageListener";
import { BattleEventAddon, MoveEvent, PokemonDetails, PokemonID, PokemonStatus,
    SwitchInEvent } from "../../src/messageData";

export const username: string[] = ["user1", "user2"];

/** Test PokemonIDs. */
export const pokemonId: PokemonID[] =
[
    {owner: "p1", position: "a", nickname: "hi"},
    {owner: "p2", position: "b", nickname: "nou"},
    {owner: "p1", position: "a", nickname: "Pentagon"}
];

/** Test PokemonDetails. */
export const pokemonDetails: PokemonDetails[] =
[
    {species: "Magikarp", shiny: true, gender: "M", level: 50},
    {species: "Mewtwo", shiny: false, gender: null, level: 100},
    {species: "Porygon", shiny: false, gender: null, level: 100}
];

/** Test PokemonStatuses. */
export const pokemonStatus: PokemonStatus[] =
[
    {hp: 100, hpMax: 100, condition: "par"},
    {hp: 9001, hpMax: 9001, condition: ""},
    {hp: 0, hpMax: 0, condition: ""}
];

/** Test BattleEventAddons. */
export const addon: BattleEventAddon[] =
[
    {type: "ability", id: pokemonId[0], ability: "Pressure"},
    {type: "curestatus", id: pokemonId[0], majorStatus: "psn"},
    {type: "cureteam", id: pokemonId[2]},
    {type: "damage", id: pokemonId[1], status: pokemonStatus[1]},
    {type: "faint", id: pokemonId[2]},
    {
        type: "heal", id: pokemonId[1], status: pokemonStatus[1],
        cause: {type: "item", item: "Leftovers"}
    },
    {type: "start", id: pokemonId[0], volatile: "confusion"},
    {type: "status", id: pokemonId[0], majorStatus: "slp"}
];

/** Test MoveEvents. */
export const moveEvent: MoveEvent[] =
[
    {
        type: "move", id: pokemonId[0], moveName: "Splash",
        targetId: pokemonId[1], addons: [addon[0], addon[1]]
    },
    {
        type: "move", id: pokemonId[1], moveName: "Splash",
        targetId: pokemonId[0], addons: [], cause: {type: "lockedmove"}
    }
];

/** Test SwitchInEvents. */
export const switchInEvent: SwitchInEvent[] =
[
    {
        type: "switch", id: pokemonId[0], details: pokemonDetails[0],
        status: pokemonStatus[0], addons: []
    },
    {
        type: "switch", id: pokemonId[1], details: pokemonDetails[1],
        status: pokemonStatus[1], addons: [addon[2], addon[3]]
    }
];

/** Test BattleInitArgs. */
export const battleInit: BattleInitArgs[] =
[
    {
        id: "p1", username: username[0], gameType: "singles", gen: 4,
        teamSizes: {p1: 6, p2: 6},
        switchIns: [switchInEvent[0], switchInEvent[1]]
    }
];

/** Invalid `battleinit` messages. */
export const battleInitInvalid: string[][][] =
[
    // empty teamsize command
    [
        ["player", "p2", username[1]],
        ["teamsize"],
        ["teamsize", "p2", "6"],
        ["gametype", "singles"],
        ["gen", "4"]
    ],
    // no teamsize number
    [
        ["player", "p2", username[1]],
        ["teamsize", "p1"],
        ["teamsize", "p2", "6"],
        ["gametype", "singles"],
        ["gen", "4"]
    ]
];

/** Test BattleProgressArgs. */
export const battleProgress: BattleProgressArgs[] =
[
    {
        events: [moveEvent[0], moveEvent[1]],
        upkeep: {addons: [addon[4], addon[5], addon[6], addon[7]]},
        turn: 2
    }
];

/** Test RequestArgs. */
export const request: RequestArgs[] =
[
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
            name: username[0], id: "p1",
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
                    ident: pokemonId[1],
                    details: pokemonDetails[1],
                    condition: pokemonStatus[1],
                    active: false,
                    stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                    moves: ["hyperbeam"], baseAbility: "pressure",
                    item: "choicespecs", pokeball: "nestball"
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
        },
        rqid: 10
    }
];
