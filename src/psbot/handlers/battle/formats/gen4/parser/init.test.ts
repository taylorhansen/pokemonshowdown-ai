import {expect} from "chai";
import "mocha";
import {BattleState} from "../state";
import {smeargle} from "../state/switchOptions.test";
import {createInitialContext, ParserContext} from "./Context.test";
import {ParserHelpers} from "./ParserHelpers.test";
import {
    initParser,
    toDetails,
    toFormatName,
    toHPStatus,
    toID,
    toIdent,
    toMoveName,
    toNum,
    toRequestJSON,
    toRule,
    toSearchID,
    toSpeciesName,
    toUsername,
} from "./helpers.test";
import {init} from "./init";

export const test = () =>
    describe("init", function () {
        const ictx = createInitialContext();

        let state: BattleState;

        beforeEach("Extract BattleState", function () {
            state = ictx.getState();
        });

        let pctx: ParserContext<void> | undefined;
        const ph = new ParserHelpers(() => pctx);

        beforeEach("Initialize init BattleParser", function () {
            pctx = initParser(ictx.startArgs, init);
        });

        afterEach("Close ParserContext", async function () {
            await ph.close().finally(() => (pctx = undefined));
        });

        it("Should initialize battle", async function () {
            const team1 = state.getTeam("p1");
            expect(team1.size).to.equal(0);
            const team2 = state.getTeam("p2");
            expect(team2.size).to.equal(0);

            ictx.sender = async () => await Promise.resolve(false);

            pctx = initParser(ictx.startArgs, init);
            await ph.handle({args: ["init", "battle"], kwArgs: {}});
            await ph.handle({args: ["gametype", "singles"], kwArgs: {}});
            await ph.handle({
                args: ["player", "p1", toUsername("username"), "", ""],
                kwArgs: {},
            });
            await ph.handle({
                args: [
                    "request",
                    toRequestJSON({
                        requestType: "move",
                        active: [
                            {
                                moves: [
                                    {
                                        id: toID("tackle"),
                                        name: toMoveName("tackle"),
                                        pp: 32,
                                        maxpp: 32,
                                        target: "normal",
                                    },
                                ],
                            },
                        ],
                        side: {
                            name: toUsername("username"),
                            id: "p1",
                            pokemon: [
                                {
                                    active: true,
                                    details: toDetails(smeargle),
                                    ident: toIdent("p1", smeargle),
                                    pokeball: toID("pokeball"),
                                    ability: toID("owntempo"),
                                    baseAbility: toID("owntempo"),
                                    condition: toHPStatus(100, 100),
                                    item: toID("mail"),
                                    moves: [toID("tackle")],
                                    stats: {
                                        atk: 18,
                                        def: 29,
                                        spa: 18,
                                        spd: 36,
                                        spe: 58,
                                    },
                                    hp: smeargle.hp,
                                    maxhp: smeargle.hpMax,
                                    hpcolor: "g",
                                    name: toSpeciesName(smeargle.species),
                                    speciesForme: toSpeciesName(
                                        smeargle.species,
                                    ),
                                    level: smeargle.level,
                                    shiny: true,
                                    gender: smeargle.gender,
                                    searchid: toSearchID("p1", smeargle),
                                },
                            ],
                        },
                        rqid: 1,
                    }),
                ],
                kwArgs: {},
            });
            await ph.handle({
                args: ["player", "p2", toUsername("player2"), "", ""],
                kwArgs: {},
            });
            await ph.handle({args: ["teamsize", "p1", toNum(1)], kwArgs: {}});
            await ph.handle({args: ["teamsize", "p2", toNum(1)], kwArgs: {}});
            await ph.handle({args: ["gen", 4], kwArgs: {}});
            await ph.handle({args: ["rated"], kwArgs: {}}); // Ignored.
            await ph.handle({
                args: ["tier", toFormatName("[Gen 4] Random Battle")],
                kwArgs: {},
            });
            await ph.handle({
                args: [
                    "rule",
                    toRule("Sleep Clause: Limit one foe put to sleep"),
                ],
                kwArgs: {},
            });
            await ph.handle({args: ["start"], kwArgs: {}});
            await ph.return();
            expect(team1.size).to.equal(1);
            expect(team1.active).to.not.be.null;
            expect(team2.size).to.equal(1);
            expect(team2.active).to.be.null;
        });
    });
