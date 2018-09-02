import { RequestArgs } from "../src/AnyMessageListener";

/** Test arguments for request messages. */
export const requestTestArgs: RequestArgs[] =
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
            name: "somebody", id: "p1",
            pokemon:
            [
                {
                    ident: {owner: "p1", position: "a", nickname: "hi"},
                    details:
                    {
                        species: "Magikarp", shiny: true, gender: "M", level: 50
                    },
                    condition: {hp: 100, hpMax: 100, condition: "par"},
                    active: true,
                    stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                    moves: ["splash"], baseAbility: "swiftswim",
                    item: "choiceband", pokeball: "masterball"
                },
                {
                    ident: {owner: "p1", position: "a", nickname: "hi"},
                    details:
                    {
                        species: "Mewtwo", shiny: false, gender: null,
                        level: 100
                    },
                    condition: {hp: 9001, hpMax: 9001, condition: ""},
                    active: false,
                    stats: {atk: 1, def: 1, spa: 1, spd: 1, spe: 1},
                    moves: ["hyperbeam"], baseAbility: "pressure",
                    item: "choicespecs", pokeball: "nestball"
                },
                {
                    ident: {owner: "p1", position: "a", nickname: "Pentagon"},
                    details:
                    {
                        species: "Porygon", shiny: false, gender: null,
                        level: 100
                    },
                    condition: {hp: 0, hpMax: 0, condition: ""},
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
