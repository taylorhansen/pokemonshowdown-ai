import {expect} from "chai";
import "mocha";
import {Event} from "../../protocol/Event";
import {Mutable} from "../../utils/types";
import {
    benchInfo,
    ditto,
    requestEvent,
    smeargle,
} from "../state/switchOptions.test";
import {BattleParserContext} from "./BattleParser";
import {
    createTestContext,
    setupOverrideAgent,
    setupOverrideExecutor,
} from "./contextHelpers.test";
import {gen4Parser} from "./gen4";
import {
    toDetails,
    toEffectName,
    toFormatName,
    toHPStatus,
    toID,
    toIdent,
    toMoveName,
    toNum,
    toRequestJSON,
    toRule,
    toUsername,
} from "./protocolHelpers.test";

export const test = () =>
    describe("gen4", function () {
        let ctx: Mutable<BattleParserContext>;

        beforeEach("Initialize BattleParserContext", function () {
            ctx = createTestContext();
            ctx.state.started = false;
        });

        const handle = async (event: Event) =>
            void (await expect(gen4Parser(ctx, event)).to.eventually.be
                .fulfilled);

        const agent = setupOverrideAgent(() => ctx);
        const executor = setupOverrideExecutor(() => ctx);

        // This is more of an integration test but hard to setup DI/mocking.
        it("Should handle init and 1st turn and subsequent turns until game-over", async function () {
            // Note: the initial |request| event is repeated, once to initialize
            // the team during init(), and another as the actual request for a
            // decision after the initial switch-ins.
            const req1Event = requestEvent("move", benchInfo.slice(0, 2), {
                moves: [
                    {
                        id: toID("tackle"),
                        name: toMoveName("tackle"),
                        pp: 32,
                        maxpp: 32,
                        target: "normal",
                    },
                    {
                        id: toID("ember"),
                        name: toMoveName("ember"),
                        pp: 10,
                        maxpp: 40,
                        target: "normal",
                    },
                ],
            });

            // Init phase.

            const team1 = ctx.state.getTeam("p1");
            expect(team1.size).to.equal(0);
            const team2 = ctx.state.getTeam("p2");
            expect(team2.size).to.equal(0);
            await handle({args: ["init", "battle"], kwArgs: {}});
            await handle({args: ["gametype", "singles"], kwArgs: {}});
            await handle({
                args: ["player", "p1", toUsername("username"), "", ""],
                kwArgs: {},
            });
            await handle(req1Event);
            await handle({
                args: ["player", "p2", toUsername("player2"), "", ""],
                kwArgs: {},
            });
            await handle({args: ["teamsize", "p1", toNum(2)], kwArgs: {}});
            await handle({args: ["teamsize", "p2", toNum(2)], kwArgs: {}});
            await handle({args: ["gen", 4], kwArgs: {}});
            await handle({args: ["rated"], kwArgs: {}});
            await handle({
                args: ["tier", toFormatName("[Gen 4] Random Battle")],
                kwArgs: {},
            });
            await handle({
                args: [
                    "rule",
                    toRule("Sleep Clause: Limit one foe put to sleep"),
                ],
                kwArgs: {},
            });
            await handle({args: ["start"], kwArgs: {}});
            expect(team1.size).to.equal(2);
            expect(team2.size).to.equal(2);

            // Turn 1: Switch in smeargle on both sides.

            await handle({
                args: [
                    "switch",
                    toIdent("p1", smeargle),
                    toDetails(smeargle),
                    toHPStatus(100, 100),
                ],
                kwArgs: {},
            });
            await handle({
                args: [
                    "switch",
                    toIdent("p2", smeargle),
                    toDetails(smeargle),
                    toHPStatus(100, 100),
                ],
                kwArgs: {},
            });
            await handle({args: ["turn", toNum(1)], kwArgs: {}});

            // P1 move request.
            const req1 = handle(req1Event);
            await expect(agent.receiveChoices()).to.eventually.have.members([
                "move 1",
                "move 2",
                "switch 2",
            ]);
            agent.resolve();
            await expect(executor.receiveAction()).to.eventually.equal(
                "move 1",
            );
            executor.resolve(false /*i.e., accept the choice*/);
            await req1;

            // Turn 2: P2 switches out, p1 attacks.

            await handle({
                args: [
                    "switch",
                    toIdent("p2", ditto),
                    toDetails(ditto),
                    toHPStatus(100, 100),
                ],
                kwArgs: {},
            });
            await handle({
                args: ["move", toIdent("p1", smeargle), toMoveName("tackle")],
                kwArgs: {},
            });
            await handle({
                args: ["-damage", toIdent("p2", ditto), toHPStatus(50, 100)],
                kwArgs: {},
            });
            // Residual.
            await handle({
                args: ["-heal", toIdent("p2", ditto), toHPStatus(56, 100)],
                kwArgs: {from: toEffectName("leftovers", "item")},
            });
            await handle({args: ["turn", toNum(2)], kwArgs: {}});

            // P1 move request.
            const req2 = handle(
                requestEvent("move", benchInfo.slice(0, 2), {
                    moves: [
                        {
                            id: toID("tackle"),
                            name: toMoveName("tackle"),
                            pp: 31,
                            maxpp: 32,
                            target: "normal",
                        },
                        {
                            id: toID("ember"),
                            name: toMoveName("ember"),
                            pp: 10,
                            maxpp: 40,
                            target: "normal",
                        },
                    ],
                }),
            );
            await expect(agent.receiveChoices()).to.eventually.have.members([
                "move 1",
                "move 2",
                "switch 2",
            ]);
            agent.resolve();
            await expect(executor.receiveAction()).to.eventually.equal(
                "move 1",
            );
            executor.resolve(false /*i.e., accept the choice*/);
            await req2;

            // Turn 3: P1 attacks, p2 faints and is forced to switch.

            await handle({
                args: ["move", toIdent("p1", smeargle), toMoveName("tackle")],
                kwArgs: {},
            });
            await handle({
                args: ["-damage", toIdent("p2", ditto), toHPStatus("faint")],
                kwArgs: {},
            });
            await handle({
                args: ["faint", toIdent("p2", ditto)],
                kwArgs: {},
            });
            // P1 wait request as p2 chooses switch-in.
            await handle({args: ["upkeep"], kwArgs: {}});
            await handle({
                args: [
                    "request",
                    toRequestJSON({
                        requestType: "wait",
                        side: undefined,
                        rqid: 3,
                    }),
                ],
                kwArgs: {},
            });
            // P2 chose switch-in.
            await handle({
                args: [
                    "switch",
                    toIdent("p2", smeargle),
                    toDetails(smeargle),
                    toHPStatus(100, 100),
                ],
                kwArgs: {},
            });
            await handle({args: ["turn", toNum(3)], kwArgs: {}});

            // P1 move request.
            const req3 = handle(
                requestEvent("move", benchInfo.slice(0, 2), {
                    moves: [
                        {
                            id: toID("tackle"),
                            name: toMoveName("tackle"),
                            pp: 30,
                            maxpp: 32,
                            target: "normal",
                        },
                        {
                            id: toID("ember"),
                            name: toMoveName("ember"),
                            pp: 10,
                            maxpp: 40,
                            target: "normal",
                        },
                    ],
                }),
            );
            await expect(agent.receiveChoices()).to.eventually.have.members([
                "move 1",
                "move 2",
                "switch 2",
            ]);
            agent.resolve();
            await expect(executor.receiveAction()).to.eventually.equal(
                "move 1",
            );
            executor.resolve(false /*i.e., accept the choice*/);
            await req3;

            // Turn 4: P2 attacks, p1 faints and is forced to switch.

            await handle({
                args: ["move", toIdent("p2", smeargle), toMoveName("tackle")],
                kwArgs: {},
            });
            await handle({
                args: ["-damage", toIdent("p1", smeargle), toHPStatus("faint")],
                kwArgs: {},
            });
            await handle({
                args: ["faint", toIdent("p1", smeargle)],
                kwArgs: {},
            });
            // P1 chooses switch-in.
            await handle({args: ["upkeep"], kwArgs: {}});

            // P1 switch request.
            const req4s = handle(
                requestEvent("switch", [
                    {...benchInfo[0], condition: toHPStatus("faint")},
                    benchInfo[1],
                ]),
            );
            // Note: BattleAgent isn't invoked since there's only 1 switch
            // choice.
            await expect(executor.receiveAction()).to.eventually.equal(
                "switch 2",
            );
            executor.resolve(false /*i.e., accept the choice*/);
            await req4s;

            // P1 chose switch-in.
            await handle({
                args: [
                    "switch",
                    toIdent("p1", ditto),
                    toDetails(ditto),
                    toHPStatus(100, 100),
                ],
                kwArgs: {},
            });
            await handle({args: ["turn", toNum(4)], kwArgs: {}});

            // P1 move request.
            const req4 = handle(
                requestEvent(
                    "move",
                    [
                        {...benchInfo[1], active: true},
                        {
                            ...benchInfo[0],
                            active: false,
                            condition: toHPStatus("faint"),
                        },
                    ],
                    {
                        moves: [
                            {
                                id: toID("transform"),
                                name: toMoveName("transform"),
                                pp: 32,
                                maxpp: 32,
                                target: "normal",
                            },
                        ],
                    },
                ),
            );
            // Note: BattleAgent isn't invoked since there's only 1 move choice.
            await expect(executor.receiveAction()).to.eventually.equal(
                "move 1",
            );
            executor.resolve(false); // I.e., accept the choice
            await req4;

            // Turn 5: P2 attacks again, p1 faints again, game over.

            await handle({
                args: ["move", toIdent("p2", smeargle), toMoveName("tackle")],
                kwArgs: {},
            });
            await handle({
                args: ["-damage", toIdent("p1", ditto), toHPStatus("faint")],
                kwArgs: {},
            });
            await handle({
                args: ["faint", toIdent("p1", ditto)],
                kwArgs: {},
            });
            await handle({args: ["win", toUsername("player2")], kwArgs: {}});
        });
    });
