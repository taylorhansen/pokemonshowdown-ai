import {Protocol} from "@pkmn/protocol";
import {FieldCondition, SideCondition, SideID, Weather} from "@pkmn/types";
import {expect} from "chai";
import "mocha";
import {Event} from "../../../../../../parser";
import * as dex from "../../dex";
import {BattleState} from "../../state";
import {Pokemon, ReadonlyPokemon} from "../../state/Pokemon";
import {ReadonlyTeam, SwitchOptions} from "../../state/Team";
import {ReadonlyVariableTempStatus} from "../../state/VariableTempStatus";
import {
    castform,
    castformrainy,
    castformsnowy,
    castformsunny,
    ditto,
    smeargle,
} from "../../state/switchOptions.test";
import {createInitialContext} from "../Context.test";
import {ParserHelpers} from "../ParserHelpers.test";
import {
    setupBattleParser,
    toBoostIDs,
    toDetails,
    toEffectName,
    toHPStatus,
    toIdent,
    toItemName,
    toMessage,
    toMoveName,
    toNum,
    toRequestJSON,
    toSide,
    toSpeciesName,
    toTypes,
    toUsername,
} from "../helpers.test";
import * as actionMove from "./move";

// TODO: Decrease the amount of required indentation so this isn't as cumbersome
// to read.
// Might need to split this and move.ts into separate files.
export const test = (): void =>
    void describe("move", function () {
        const ictx = createInitialContext();
        const {sh} = ictx;

        let state: BattleState;

        beforeEach("Extract BattleState", function () {
            state = ictx.getState();
        });

        describe("moveAction()", function () {
            const init = setupBattleParser(
                ictx.startArgs,
                actionMove.moveAction,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                // Reset variable so it doesn't leak into other tests.
                await ph.close().finally(() => (pctx = undefined));
            });

            void init;
            it("TODO");
            // Pre-move effects, verify that move is handled normally, etc.
        });

        describe("interceptSwitch()", function () {
            const init = setupBattleParser(
                ictx.startArgs,
                actionMove.interceptSwitch,
            );
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                await ph.close().finally(() => (pctx = undefined));
            });

            it("Should handle switch intercept", async function () {
                sh.initActive("p1");
                sh.initActive("p2");

                pctx = init("p2", "p1"); // P2 is interrupting p1's switch-out.
                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p1"),
                        toEffectName("pursuit", "move"),
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["move", toIdent("p2"), toMoveName("pursuit")],
                    kwArgs: {from: toMoveName("pursuit")},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p1"), toHPStatus(90, 100)],
                    kwArgs: {},
                });
                await ph.halt();
                // Should indicate that p2 spent its action interrupting the
                // switch.
                await ph.return({actioned: {p2: true}});
            });

            it("Should handle self-faint before switch", async function () {
                sh.initTeam("p1", [ditto, smeargle]);
                sh.initActive("p2");

                pctx = init("p2", "p1");
                await ph.handle({
                    args: [
                        "-activate",
                        toIdent("p1"),
                        toEffectName("pursuit", "move"),
                    ],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["move", toIdent("p2"), toMoveName("pursuit")],
                    kwArgs: {from: toMoveName("pursuit")},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p1"), toHPStatus(90, 100)],
                    kwArgs: {},
                });
                await ph.handle({
                    args: ["-damage", toIdent("p2"), toHPStatus("faint")],
                    kwArgs: {from: toEffectName("lifeorb", "item")},
                });
                await ph.handle({
                    args: ["faint", toIdent("p2")],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return({actioned: {p2: true}});
            });

            it("TODO");
            // Pre-move effects, verify that move is handled normally, etc.
        });

        describe("useMove()", function () {
            const init = setupBattleParser(ictx.startArgs, actionMove.useMove);
            let pctx: ReturnType<typeof init> | undefined;
            const ph = new ParserHelpers(() => pctx);

            afterEach("Close ParserContext", async function () {
                await ph.close().finally(() => (pctx = undefined));
            });

            describe("move event checks", function () {
                it("Should handle move", async function () {
                    const us = sh.initActive("p1");
                    const them = sh.initActive("p2");
                    expect(us.moveset.get("tackle")).to.be.null;
                    expect(them.hp.current).to.equal(100);

                    pctx = init("p1");
                    await ph.handle({
                        args: ["move", toIdent("p1"), toMoveName("tackle")],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-damage", toIdent("p2"), toHPStatus(90, 100)],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return({});

                    const move = us.moveset.get("tackle");
                    expect(move).to.not.be.null;
                    expect(move!.pp).to.equal(move!.maxpp - 1);
                    expect(them.hp.current).to.equal(90);
                });

                it("Should throw if unknown move", async function () {
                    sh.initActive("p1");
                    pctx = init("p1");
                    await ph.rejectError(
                        {
                            args: [
                                "move",
                                toIdent("p1"),
                                toMoveName("Invalid Move"),
                            ],
                            kwArgs: {},
                        },
                        Error,
                        "Unknown move 'invalidmove'",
                    );
                });

                it("Should handle expected move", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2");

                    pctx = init("p1", dex.getMove(dex.moves["tackle"]));
                    await ph.handle({
                        args: ["move", toIdent("p1"), toMoveName("tackle")],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-damage", toIdent("p2"), toHPStatus(90, 100)],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return({});
                });

                it("Should throw if unexpected move", async function () {
                    sh.initActive("p1");
                    pctx = init("p1", dex.getMove(dex.moves["ember"]));
                    await ph.rejectError(
                        {
                            args: [
                                "move",
                                toIdent("p1"),
                                toMoveName("watergun"),
                            ],
                            kwArgs: {},
                        },
                        Error,
                        "Expected move [ember] but got 'watergun'",
                    );
                });

                it("Should handle expected slp-based move", async function () {
                    sh.initActive("p1").majorStatus.afflict("slp");
                    sh.initActive("p2");

                    pctx = init("p1", "slp");
                    await ph.handle({
                        args: ["move", toIdent("p1"), toMoveName("snore")],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["-damage", toIdent("p2"), toHPStatus(90, 100)],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return({});
                });

                it("Should throw if expected slp-based move", async function () {
                    sh.initActive("p1").majorStatus.afflict("slp");
                    sh.initActive("p2");

                    pctx = init("p1", "slp");
                    await ph.rejectError(
                        {
                            args: ["move", toIdent("p1"), toMoveName("ember")],
                            kwArgs: {},
                        },
                        Error,
                        "Expected move [sleeptalk, snore] but got 'ember'",
                    );
                });
            });

            /** Handles Splash move for the given pokemon reference. */
            async function moveSplash(
                side: SideID,
                kwArgs: Event<"|move|">["kwArgs"] = {},
                opt = smeargle,
            ): Promise<void> {
                pctx = init(side);
                await moveEvent(side, "splash", kwArgs, opt);
                await ph.handle({
                    args: ["-activate", "", toEffectName("splash", "move")],
                    kwArgs: {},
                });
                await ph.halt();
                await ph.return({});
            }

            async function moveEvent(
                side: SideID,
                moveId: string,
                kwArgs: Event<"|move|">["kwArgs"] = {},
                opt = smeargle,
            ): Promise<void> {
                await ph.handle({
                    args: ["move", toIdent(side, opt), toMoveName(moveId)],
                    kwArgs,
                });
            }

            async function moveDamage(
                side: SideID,
                hp: number,
                maxhp = 100,
                kwArgs: Event<"|-damage|">["kwArgs"] = {},
                opt = smeargle,
            ): Promise<void> {
                await ph.handle({
                    args: [
                        "-damage",
                        toIdent(side, opt),
                        toHPStatus(hp, maxhp),
                    ],
                    kwArgs,
                });
            }

            describe("setup", function () {
                it("Should reveal move and deduct pp", async function () {
                    sh.initActive("p1");
                    const {moveset, volatile} = sh.initActive("p2");
                    expect(moveset.get("splash")).to.be.null;
                    expect(state.status.lastMove).to.be.undefined;
                    expect(volatile.lastMove).to.be.null;

                    await moveSplash("p2");
                    expect(moveset.get("splash")).to.not.be.null;
                    expect(moveset.get("splash")).to.have.property("pp", 63);
                    expect(state.status.lastMove).to.equal("splash");
                    expect(volatile.lastMove).to.equal("splash");
                });

                it("Should not deduct pp if '[from]lockedmove' suffix", async function () {
                    sh.initActive("p1");
                    const {moveset, volatile} = sh.initActive("p2");
                    const move = moveset.reveal("splash");
                    expect(state.status.lastMove).to.be.undefined;
                    expect(volatile.lastMove).to.be.null;

                    await moveSplash("p2", {from: toEffectName("lockedmove")});
                    expect(move).to.have.property("pp", move.maxpp);
                    expect(state.status.lastMove).to.equal("splash");
                    expect(volatile.lastMove).to.be.null;
                });

                it("Should reset single-move statuses", async function () {
                    const {volatile: v} = sh.initActive("p1");
                    v.destinybond = true;
                    sh.initActive("p2");

                    await moveSplash("p1");
                    expect(v.destinybond).to.be.false;
                });

                it("Should not deduct pp if releasing two-turn move", async function () {
                    sh.initActive("p2");
                    const {moveset, volatile} = sh.initActive("p1");
                    // Assume pp was already deducted by preparing the move.
                    volatile.twoTurn.start("fly");
                    expect(moveset.get("fly")).to.be.null;
                    expect(volatile.lastMove).to.be.null;

                    // Start a new turn.
                    state.postTurn();
                    state.preTurn();

                    // Indicate that the two-turn move is being released.
                    pctx = init("p1");
                    await moveEvent("p1", "fly", {
                        from: toEffectName("lockedmove"),
                    });
                    await moveDamage("p2", 90);
                    await ph.halt();
                    await ph.return({});
                    expect(volatile.twoTurn.isActive).to.be.false;
                    // Should not deduct pp or even reveal the move, since the
                    // start turn could've been called by an effect earlier.
                    expect(moveset.get("fly")).to.be.null;
                    // Shouldn't set when releasing two-turn move.
                    expect(volatile.lastMove).to.be.null;
                });

                it("Should not deduct pp if continuing rampage move", async function () {
                    sh.initActive("p2");
                    const {moveset, volatile} = sh.initActive("p1");
                    // Assume pp was already deducted by starting the move.
                    volatile.lockedMove.start("thrash");

                    // Indicate that the locked move is continuing.
                    pctx = init("p1");
                    await moveEvent("p1", "thrash", {
                        from: toEffectName("lockedmove"),
                    });
                    await moveDamage("p2", 90);
                    await ph.halt();
                    await ph.return({});
                    expect(volatile.lockedMove.isActive).to.be.true;
                    expect(moveset.get("thrash")).to.be.null;
                    expect(volatile.lastMove).to.be.null;
                });

                it("Should not deduct pp if continuing momentum move", async function () {
                    sh.initActive("p2");
                    const {moveset, volatile} = sh.initActive("p1");
                    // Assume pp was already deducted by starting the move.
                    volatile.rollout.start("iceball");

                    // Indicate that the rollout move is continuing.
                    pctx = init("p1");
                    await moveEvent("p1", "iceball", {
                        from: toEffectName("lockedmove"),
                    });
                    await moveDamage("p2", 90);
                    await ph.halt();
                    await ph.return({});
                    expect(volatile.rollout.isActive).to.be.true;
                    expect(moveset.get("iceball")).to.be.null;
                    expect(volatile.lastMove).to.be.null;
                });

                it("Should not reveal move if struggle", async function () {
                    sh.initActive("p2");
                    const {moveset, volatile} = sh.initActive("p1");

                    pctx = init("p1");
                    await moveEvent("p1", "struggle");
                    await moveDamage("p2", 90);
                    await moveDamage("p1", 90, 100, {
                        from: toEffectName("recoil"),
                    });
                    await ph.halt();
                    await ph.return({});
                    expect(moveset.get("struggle")).to.be.null;
                    // Should still set last move though.
                    expect(volatile.lastMove).to.equal("struggle");
                });

                it("Should set choice item lock", async function () {
                    sh.initActive("p2");
                    const mon = sh.initActive("p1");
                    mon.item.narrow("choicescarf");
                    expect(mon.volatile.choiceLock).to.be.null;

                    await moveSplash("p1");
                    expect(mon.volatile.choiceLock).to.equal("splash");
                });

                describe("called move", function () {
                    it("Should not reset single-move statuses", async function () {
                        sh.initActive("p2");
                        const {volatile} = sh.initActive("p1");
                        volatile.destinybond = true;

                        await moveSplash("p1", {
                            from: toEffectName("metronome", "move"),
                        });
                        expect(volatile.destinybond).to.be.true;
                    });

                    it("Shoud not reveal move", async function () {
                        sh.initActive("p2");
                        const {moveset, volatile} = sh.initActive("p1");

                        await moveSplash("p1", {
                            from: toEffectName("copycat", "move"),
                        });
                        expect(moveset.get("splash")).to.be.null;
                        expect(volatile.lastMove).to.be.null;
                    });

                    it("Should indicate called rampage move", async function () {
                        sh.initActive("p2");
                        const {volatile} = sh.initActive("p1");
                        expect(volatile.lockedMove.isActive).to.be.false;
                        expect(volatile.lockedMove.type).to.equal("none");
                        expect(volatile.lockedMove.called).to.be.false;
                        expect(volatile.lastMove).to.be.null;

                        pctx = init("p1");
                        await moveEvent("p1", "thrash", {
                            from: toEffectName("assist", "move"),
                        });
                        await moveDamage("p2", 90);
                        await ph.halt();
                        await ph.return({});
                        expect(volatile.lockedMove.isActive).to.be.true;
                        expect(volatile.lockedMove.type).to.equal("thrash");
                        expect(volatile.lockedMove.called).to.be.true;
                        expect(volatile.lastMove).to.be.null;
                    });

                    it("Should indicate called momentum move", async function () {
                        sh.initActive("p2");
                        const {volatile} = sh.initActive("p1");
                        expect(volatile.rollout.isActive).to.be.false;
                        expect(volatile.rollout.type).to.equal("none");
                        expect(volatile.rollout.called).to.be.false;
                        expect(volatile.lastMove).to.be.null;

                        pctx = init("p1");
                        await moveEvent("p1", "rollout", {
                            from: toEffectName("sleeptalk", "move"),
                        });
                        await moveDamage("p2", 90);
                        await ph.halt();
                        await ph.return({});
                        expect(volatile.rollout.isActive).to.be.true;
                        expect(volatile.rollout.type).to.equal("rollout");
                        expect(volatile.rollout.called).to.be.true;
                        expect(volatile.lastMove).to.be.null;
                    });
                });
            });

            describe("fail check", function () {
                it("Should cancel move effects", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2");

                    pctx = init("p1");
                    await moveEvent("p1", "thunderwave");
                    await ph.handle({
                        args: ["-fail", toIdent("p1")],
                        kwArgs: {},
                    });
                    await ph.return({});
                });

                it("Should end micleberry status", async function () {
                    sh.initActive("p1").faint();
                    const mon = sh.initActive("p2");
                    mon.volatile.micleberry = true;

                    pctx = init("p2");
                    await moveEvent("p2", "thunderwave");
                    await ph.handle({
                        args: ["-notarget", toIdent("p2")],
                        kwArgs: {},
                    });
                    await ph.return({});
                    expect(mon.volatile.micleberry).to.be.false;
                });
            });

            async function prepareEvent(
                side: SideID,
                moveId: string,
                opt = smeargle,
            ): Promise<void> {
                await ph.handle({
                    args: ["-prepare", toIdent(side, opt), toMoveName(moveId)],
                    kwArgs: {},
                });
            }

            describe("two-turn delay check", function () {
                describe("Future", function () {
                    it("Should handle future move", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p1");
                        await moveEvent("p1", "futuresight");
                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("futuresight", "move"),
                            ],
                            kwArgs: {},
                        });
                        await ph.return({});
                    });

                    it("Should throw if mismatched move", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "futuresight");
                        await ph.rejectError(
                            {
                                args: [
                                    "-start",
                                    toIdent("p2"),
                                    toEffectName("doomdesire", "move"),
                                ],
                                kwArgs: {},
                            },
                            Error,
                            "Future effect 'futuresight' failed: " +
                                "Expected 'futuresight' but got 'doomdesire'",
                        );
                    });

                    it("Should throw if invalid event", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "doomdesire");
                        await ph.rejectError(
                            {
                                args: [
                                    "-start",
                                    toIdent("p2"),
                                    toEffectName("futuresight", "move"),
                                ],
                                kwArgs: {},
                            },
                            Error,
                            "Future effect 'doomdesire' failed: " +
                                "Expected 'doomdesire' but got 'futuresight'",
                        );
                    });
                });

                describe("Two-turn", function () {
                    async function animEvent(
                        side1: SideID,
                        moveId: string,
                        side2: SideID,
                        opt1 = smeargle,
                        opt2 = smeargle,
                    ): Promise<void> {
                        await ph.handle({
                            args: [
                                "-anim",
                                toIdent(side1, opt1),
                                toMoveName(moveId),
                                toIdent(side2, opt2),
                            ],
                            kwArgs: {},
                        });
                    }

                    it("Should handle two-turn move", async function () {
                        sh.initActive("p1");
                        const mon = sh.initActive("p2");
                        const move = mon.moveset.reveal("fly");
                        expect(move.pp).to.equal(move.maxpp);

                        // Prepare turn.
                        pctx = init("p2");
                        await moveEvent("p2", "fly", {still: true});
                        await prepareEvent("p2", "fly");
                        await ph.halt();
                        await ph.return({});
                        expect(move.pp).to.equal(move.maxpp - 1);
                        expect(mon.volatile.twoTurn.isActive).to.be.true;
                        expect(mon.volatile.twoTurn.type).to.equal("fly");

                        // Release turn.
                        pctx = init("p2");
                        await moveEvent("p2", "fly", {
                            from: toEffectName("lockedmove"),
                        });
                        await moveDamage("p1", 80);
                        await ph.halt();
                        await ph.return({});
                        expect(mon.volatile.twoTurn.isActive).to.be.false;
                        expect(move.pp).to.equal(move.maxpp - 1);
                    });

                    it("Should handle shortened two-turn move via sun", async function () {
                        const mon = sh.initActive("p1");
                        const move = mon.moveset.reveal("solarbeam");
                        expect(move.pp).to.equal(move.maxpp);
                        sh.initActive("p2");
                        state.status.weather.start(null /*source*/, "SunnyDay");

                        // Prepare initially.
                        pctx = init("p1");
                        await moveEvent("p1", "solarbeam", {still: true});
                        await prepareEvent("p1", "solarbeam");
                        // Release in same turn via special |-anim| event.
                        await animEvent("p1", "solarbeam", "p2");
                        await moveDamage("p2", 80);
                        await ph.halt();
                        await ph.return({});
                        expect(mon.volatile.twoTurn.isActive).to.be.false;
                        expect(move.pp).to.equal(move.maxpp - 1);
                    });

                    it("Should handle shortened two-turn move via powerherb", async function () {
                        const mon = sh.initActive("p2");
                        const move = mon.moveset.reveal("dig");
                        expect(move.pp).to.equal(move.maxpp);
                        mon.setItem("powerherb");
                        sh.initActive("p1");

                        // Prepare.
                        pctx = init("p2");
                        await moveEvent("p2", "dig", {still: true});
                        await prepareEvent("p2", "dig");
                        // Consume item to shorten delay.
                        await ph.handle({
                            args: [
                                "-enditem",
                                toIdent("p2"),
                                toItemName("powerherb"),
                            ],
                            kwArgs: {},
                        });
                        // Release in same turn via special |-anim| event.
                        await animEvent("p2", "dig", "p1");
                        await moveDamage("p1", 70);
                        await ph.halt();
                        await ph.return({});
                        expect(mon.volatile.twoTurn.isActive).to.be.false;
                        expect(move.pp).to.equal(move.maxpp - 1);
                        expect(mon.item.definiteValue).to.equal("none");
                        expect(mon.lastItem.definiteValue).to.equal(
                            "powerherb",
                        );
                    });

                    it("Should throw if monRef mismatch", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "dive");
                        await ph.rejectError(
                            {
                                args: [
                                    "-prepare",
                                    toIdent("p1"),
                                    toMoveName("dive"),
                                ],
                                kwArgs: {},
                            },
                            Error,
                            "TwoTurn effect 'dive' failed",
                        );
                    });

                    it("Should throw if mismatched prepareMove event", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "razorwind");
                        await ph.rejectError(
                            {
                                args: [
                                    "-prepare",
                                    toIdent("p2"),
                                    toMoveName("bounce"),
                                ],
                                kwArgs: {},
                            },
                            Error,
                            "TwoTurn effect 'razorwind' failed: " +
                                "Expected 'razorwind' but got 'bounce'",
                        );
                    });
                });
            });

            describe("micleberry item implicit effect", function () {
                it("Should end micleberry status after block", async function () {
                    sh.initActive("p1").volatile.stall(true);
                    const mon = sh.initActive("p2");
                    mon.volatile.micleberry = true;

                    pctx = init("p2");
                    await moveEvent("p2", "tackle");
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p1"),
                            toEffectName("protect", "move"),
                        ],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return({});
                    expect(mon.volatile.micleberry).to.be.false;
                });

                it("Should end micleberry status after two-turn hit", async function () {
                    sh.initActive("p1").volatile.stall(true);
                    const mon = sh.initActive("p2");
                    mon.volatile.micleberry = true;

                    // Prepare turn shouldn't reset.
                    pctx = init("p2");
                    await moveEvent("p2", "bounce", {still: true});
                    await prepareEvent("p2", "bounce");
                    await ph.halt();
                    await ph.return({});
                    expect(mon.volatile.micleberry).to.be.true;

                    // Should only reset once the move hits on the release turn.
                    pctx = init("p2");
                    await moveEvent("p2", "bounce", {
                        from: toEffectName("lockedmove"),
                    });
                    await moveDamage("p1", 85);
                    await ph.halt();
                    await ph.return({});
                    expect(mon.volatile.micleberry).to.be.false;
                });
            });

            describe("block checks", function () {
                it("Should cancel move effects", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2").team!.status.safeguard.start();

                    pctx = init("p1");
                    await moveEvent("p1", "thunderwave");
                    await ph.handle({
                        args: [
                            "-activate",
                            toIdent("p2"),
                            toEffectName("safeguard", "move"),
                        ],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return({});
                });

                it("Should handle |-miss| event", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2");

                    pctx = init("p2");
                    await moveEvent("p2", "takedown");
                    await ph.handle({
                        args: ["-miss", toIdent("p2"), toIdent("p1")],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return({});
                });

                it("Should handle |-immune| event", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2").volatile.changeTypes(["dark", "???"]);

                    pctx = init("p1");
                    await moveEvent("p1", "psychic");
                    await ph.handle({
                        args: ["-immune", toIdent("p2")],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return({});
                });

                it("Should handle ability type immunity", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2").setAbility("waterabsorb");

                    pctx = init("p1");
                    await moveEvent("p1", "surf");
                    await ph.handle({
                        args: ["-immune", toIdent("p2")],
                        kwArgs: {from: toEffectName("waterabsorb", "ability")},
                    });
                    await ph.halt();
                    await ph.return({});
                });

                describe("reflected moves (magiccoat)", function () {
                    it("Should handle", async function () {
                        sh.initActive("p1").volatile.magiccoat = true;
                        sh.initActive("p2");

                        // Use reflectable move.
                        pctx = init("p2");
                        await moveEvent("p2", "yawn");
                        // Block and reflect the move.
                        await moveEvent("p1", "yawn", {
                            from: toEffectName("magiccoat", "move"),
                        });
                        await ph.handle({
                            args: ["-fail", toIdent("p1")],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should throw if reflecting move without an active magiccoat status", async function () {
                        // P1 has no immunity.
                        sh.initActive("p1").setAbility("illuminate");
                        sh.initActive("p2");

                        // Use reflectable move.
                        pctx = init("p2");
                        await moveEvent("p2", "yawn");
                        // Try to block and reflect the move.
                        await ph.rejectError(
                            {
                                args: [
                                    "move",
                                    toIdent("p1"),
                                    toMoveName("yawn"),
                                ],
                                kwArgs: {
                                    from: toEffectName("magiccoat", "move"),
                                },
                            },
                            Error,
                            // Since there's no yawn effect, the parser thinks
                            // it was blocked by a different effect, e.g.
                            // ability.
                            "Move 'yawn' status [yawn] was blocked by target " +
                                "'p1' but target's ability [illuminate] " +
                                "can't block it",
                        );
                    });

                    it("Should throw if reflecting an already reflected move", async function () {
                        sh.initActive("p1").volatile.magiccoat = true;
                        const mon = sh.initActive("p2");
                        mon.volatile.magiccoat = true;
                        mon.setAbility("illuminate"); // No immunity.

                        // Use reflectable move.
                        pctx = init("p2");
                        await moveEvent("p2", "yawn");
                        // Block and reflect the move.
                        await moveEvent("p1", "yawn", {
                            from: toEffectName("magiccoat", "move"),
                        });
                        // Try to block and reflect the move again.
                        await ph.rejectError(
                            {
                                args: [
                                    "move",
                                    toIdent("p2"),
                                    toMoveName("yawn"),
                                ],
                                kwArgs: {
                                    from: toEffectName("magiccoat", "move"),
                                },
                            },
                            Error,
                            // Since there's no yawn effect, the parser thinks
                            // it was blocked by a different effect, e.g.
                            // ability.
                            "Move 'yawn' status [yawn] was blocked by target " +
                                "'p2' but target's ability [illuminate] " +
                                "can't block it",
                        );
                    });

                    it("Should throw if reflecting unreflectable move", async function () {
                        const mon = sh.initActive("p1");
                        mon.volatile.magiccoat = true;
                        mon.setAbility("illuminate"); // No immunity.
                        sh.initActive("p2");

                        // Use reflectable move.
                        pctx = init("p2");
                        await moveEvent("p2", "taunt");
                        // Try to block and reflect the move.
                        await ph.rejectError(
                            {
                                args: [
                                    "move",
                                    toIdent("p1"),
                                    toMoveName("yawn"),
                                ],
                                kwArgs: {
                                    from: toEffectName("magiccoat", "move"),
                                },
                            },
                            Error,
                            // Since there's no taunt effect, the parser thinks
                            // it was blocked by a different effect, e.g.
                            // ability.
                            "Move 'taunt' status [taunt] was blocked by " +
                                "target 'p1' but target's ability " +
                                "[illuminate] can't block it",
                        );
                    });
                });

                // TODO: Type assertions once handleTypeEffectiveness() is
                // implemented.
            });

            describe("pre-hit effects", function () {
                describe("on-preHit items (resist berries)", function () {
                    it("Should handle resist berry", async function () {
                        sh.initActive("p1").volatile.changeTypes([
                            "water",
                            "???",
                        ]);
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "thunder");
                        await ph.handle({
                            args: [
                                "-enditem",
                                toIdent("p1"),
                                toItemName("wacanberry"),
                            ],
                            kwArgs: {eat: true},
                        });
                        await ph.handle({
                            args: [
                                "-enditem",
                                toIdent("p1"),
                                toItemName("wacanberry"),
                            ],
                            kwArgs: {weaken: true},
                        });
                        await ph.handle({
                            args: ["-supereffective", toIdent("p1")],
                            kwArgs: {},
                        });
                        await moveDamage("p1", 64);
                        await ph.halt();
                        await ph.return({});
                    });

                    // TODO: Implement type effectiveness assertions then add
                    // more tests.
                });
            });

            describe("hit effects", function () {
                it("Should handle |-crit| event", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2");

                    pctx = init("p2");
                    await moveEvent("p2", "slash");
                    await ph.handle({
                        args: ["-crit", toIdent("p1")],
                        kwArgs: {},
                    });
                    await moveDamage("p1", 80);
                    await ph.halt();
                    await ph.return({});
                });

                describe("type effectiveness assertions", function () {
                    it("Should handle regular type effectiveness", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "icebeam");
                        await moveDamage("p1", 72);
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should handle |-resisted| event", async function () {
                        sh.initActive("p1").volatile.changeTypes([
                            "ice",
                            "???",
                        ]);
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "icebeam");
                        await ph.handle({
                            args: ["-resisted", toIdent("p1")],
                            kwArgs: {},
                        });
                        await moveDamage("p1", 54);
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should handle |-supereffective| event", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").volatile.changeTypes([
                            "rock",
                            "???",
                        ]);

                        pctx = init("p1");
                        await moveEvent("p1", "surf");
                        await ph.handle({
                            args: ["-supereffective", toIdent("p2")],
                            kwArgs: {},
                        });
                        await moveDamage("p2", 40);
                        await ph.halt();
                        await ph.return({});
                    });

                    // TODO: Type assertions once handleTypeEffectiveness() is
                    // implemented.
                });

                describe("Substitute", function () {
                    let them: Pokemon;

                    beforeEach("Initialize active and substitute", function () {
                        sh.initActive("p1").volatile.substitute = true;
                        (them = sh.initActive("p2")).volatile.substitute = true;
                    });

                    const subBlockedEvent = (
                        side: SideID,
                        opt = smeargle,
                    ): Event<"|-activate|"> => ({
                        args: [
                            "-activate",
                            toIdent(side, opt),
                            toEffectName("substitute", "move"),
                        ],
                        kwArgs: {},
                    });

                    const subBrokenEvent = (
                        side: SideID,
                        opt = smeargle,
                    ): Event<"|-end|"> => ({
                        args: [
                            "-end",
                            toIdent(side, opt),
                            toEffectName("substitute", "move"),
                        ],
                        kwArgs: {},
                    });

                    it("Should not throw if sub-ignoring move", async function () {
                        pctx = init("p1");
                        await moveEvent("p1", "torment");
                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("torment", "move"),
                            ],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should block hit status effects", async function () {
                        pctx = init("p1");
                        // Note: Status moves should fail so we're testing a
                        // damaging+status move here.
                        await moveEvent("p1", "zapcannon");
                        await ph.handle(subBlockedEvent("p2"));
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should block hit boost effects", async function () {
                        pctx = init("p2");
                        await moveEvent("p2", "rocktomb");
                        await ph.handle(subBlockedEvent("p1"));
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should not block self effects", async function () {
                        pctx = init("p2");
                        await moveEvent("p2", "leafstorm");
                        await ph.handle(subBlockedEvent("p1"));
                        await ph.handle({
                            args: ["-unboost", toIdent("p2"), "spa", toNum(2)],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should handle substitute broken", async function () {
                        expect(them.volatile.substituteBroken).to.be.null;

                        pctx = init("p1");
                        await moveEvent("p1", "leafstorm");
                        await ph.handle(subBrokenEvent("p2"));
                        await ph.handle({
                            args: ["-unboost", toIdent("p1"), "spa", toNum(2)],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                        expect(them.volatile.substituteBroken).to.equal(
                            "leafstorm",
                        );
                    });

                    it("Should throw if sub-ignoring move doesn't ignore sub", async function () {
                        pctx = init("p1");
                        await moveEvent("p1", "torment");
                        await ph.rejectError(
                            subBlockedEvent("p2"),
                            Error,
                            "Move 'torment' status [torment] was blocked by " +
                                "target 'p2' but target's ability " +
                                "[technician, owntempo] can't block it",
                        );
                    });

                    it("Should throw if non-sub-ignoring move ignores sub", async function () {
                        pctx = init("p1");
                        await moveEvent("p1", "tackle");
                        await ph.rejectError(
                            {
                                args: [
                                    "-damage",
                                    toIdent("p2"),
                                    toHPStatus(80),
                                ],
                                kwArgs: {},
                            },
                            Error,
                            "Move should've been blocked by target's " +
                                "Substitute",
                        );
                    });
                });

                describe("item on-tryOhko (focussash)", function () {
                    const focussashEvent = (
                        side: SideID,
                        opt = smeargle,
                    ): Event<"|-enditem|"> => ({
                        args: [
                            "-enditem",
                            toIdent(side, opt),
                            toItemName("focussash"),
                        ],
                        kwArgs: {},
                    });

                    it("Should handle OHKO-blocking item", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "brickbreak");
                        await ph.handle({
                            args: ["-supereffective", toIdent("p1")],
                            kwArgs: {},
                        });
                        await moveDamage("p1", 1);
                        await ph.handle(focussashEvent("p1"));
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should reject if not an OHKO (not at full hp initially)", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").hp.set(99);

                        pctx = init("p1");
                        await moveEvent("p1", "brickbreak");
                        await ph.handle({
                            args: ["-supereffective", toIdent("p2")],
                            kwArgs: {},
                        });
                        await moveDamage("p2", 1);
                        await ph.reject(focussashEvent("p2"));
                        await ph.return({});
                    });

                    it("Should reject if not an ohko (not at 1hp)", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p1");
                        await moveEvent("p1", "brickbreak");
                        await ph.handle({
                            args: ["-supereffective", toIdent("p2")],
                            kwArgs: {},
                        });
                        await moveDamage("p2", 3);
                        await ph.reject(focussashEvent("p2"));
                        await ph.return({});
                    });
                });
            });

            describe("post-hit effects", function () {
                describe("damage", function () {
                    // TODO(gen5): Self/hit distinction, e.g. healpulse.
                    it("Should handle heal effect", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").hp.set(50);

                        pctx = init("p2");
                        await moveEvent("p2", "recover");
                        await ph.handle({
                            args: ["-heal", toIdent("p2"), toHPStatus(100)],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should handle split-damage effect (painsplit)", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").hp.set(50);

                        pctx = init("p2");
                        await moveEvent("p2", "painsplit");
                        await ph.handle({
                            args: ["-sethp", toIdent("p2"), toHPStatus(75)],
                            kwArgs: {from: toEffectName("painsplit", "move")},
                        });
                        await ph.handle({
                            args: ["-sethp", toIdent("p1"), toHPStatus(75)],
                            kwArgs: {from: toEffectName("painsplit", "move")},
                        });
                        await ph.halt();
                        await ph.return({});
                    });
                });

                describe("countable status", function () {
                    it("Should handle perishsong", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p1");
                        await moveEvent("p1", "perishsong");
                        // Note: The actual non-silent |-start| events happen
                        // later.
                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("perish3"),
                            ],
                            kwArgs: {silent: true},
                        });
                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("perish3"),
                            ],
                            kwArgs: {silent: true},
                        });
                        await ph.handle({
                            args: [
                                "-fieldactivate",
                                toEffectName("perishsong", "move"),
                            ],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should handle stockpile", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p1");
                        await moveEvent("p1", "stockpile");
                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("stockpile1"),
                            ],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: ["-boost", toIdent("p1"), "def", toNum(1)],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: ["-boost", toIdent("p1"), "spd", toNum(1)],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });
                });

                describe("boost", function () {
                    type BoostEvent<TPos extends boolean = true> =
                        TPos extends true
                            ? Event<"|-boost|">
                            : TPos extends false
                            ? Event<"|-unboost|">
                            : never;
                    const boostEvent = <TPos extends boolean = true>(
                        pos: TPos,
                        side: SideID,
                        stat: dex.BoostName,
                        amount: number,
                        kwArgs: BoostEvent<TPos>["kwArgs"] = {},
                        opt = smeargle,
                    ): BoostEvent<TPos> =>
                        ({
                            args: [
                                pos ? "-boost" : "-unboost",
                                toIdent(side, opt),
                                stat,
                                toNum(amount),
                            ],
                            kwArgs,
                        } as const as BoostEvent<TPos>);

                    const boostTests: {
                        [T in dex.MoveEffectTarget]: (() => void)[];
                    } = {self: [], hit: []};

                    function shouldHandleBoost(
                        ctg: "self" | "hit",
                        move: string,
                        stat: dex.BoostName,
                        posBoost: boolean,
                        amount: number,
                        abilityImmunity?: string,
                        immunityHolder?: SwitchOptions,
                    ): void {
                        boostTests[ctg].push(function () {
                            const target = ctg === "self" ? "p1" : "p2";

                            const remainingJson: {
                                [T in dex.BoostName]?: number;
                            } = {[stat]: (posBoost ? 1 : -1) * amount};

                            it("Should handle boost", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.handle(
                                    boostEvent(posBoost, target, stat, amount),
                                );
                                await ph.halt();
                                await ph.return({});
                            });

                            it("Should throw if reject before effect", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.haltError(
                                    Error,
                                    "Expected effect that didn't happen: " +
                                        `p1 move boost ${target} add ` +
                                        `${JSON.stringify(remainingJson)} ` +
                                        "(remaining: " +
                                        `${JSON.stringify(remainingJson)})`,
                                );
                            });

                            it("Should allow no boost message if maxed out", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");
                                state.getTeam(target).active.volatile.boosts[
                                    stat
                                ] = 6 * (posBoost ? 1 : -1);

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.halt();
                                await ph.return({});
                            });

                            it("Should allow boost message with amount=0 if maxed out", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");
                                state.getTeam(target).active.volatile.boosts[
                                    stat
                                ] = 6 * (posBoost ? 1 : -1);

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.handle(
                                    boostEvent(posBoost, target, stat, 0),
                                );
                                await ph.halt();
                                await ph.return({});
                            });

                            if (ctg !== "hit" || !abilityImmunity) return;

                            it(`Should fail unboost effect if ${abilityImmunity} activates`, async function () {
                                sh.initActive("p1");
                                sh.initActive("p2", immunityHolder);

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.handle({
                                    args: [
                                        "-fail",
                                        toIdent(target),
                                        "unboost",
                                        stat,
                                    ],
                                    kwArgs: {
                                        from: toEffectName(
                                            abilityImmunity,
                                            "ability",
                                        ),
                                        of: toIdent(target),
                                    },
                                });
                                await ph.halt();
                                await ph.return({});
                            });

                            it(`Should pass if moldbreaker broke through ${abilityImmunity}`, async function () {
                                sh.initActive("p1").setAbility("moldbreaker");
                                sh.initActive("p2").setAbility(abilityImmunity);

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.handle(
                                    boostEvent(posBoost, target, stat, amount),
                                );
                                await ph.halt();
                                await ph.return({});
                            });

                            it(`Should rule out ${abilityImmunity} if it didn't activate`, async function () {
                                sh.initActive("p1");
                                // Blocking ability or useless ability
                                // (illuminate).
                                const mon = sh.initActive("p2");
                                mon.setAbility(abilityImmunity, "illuminate");
                                expect(
                                    mon.traits.ability.possibleValues,
                                ).to.have.keys(abilityImmunity, "illuminate");

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.handle(
                                    boostEvent(posBoost, target, stat, amount),
                                );
                                await ph.halt();
                                await ph.return({});
                                expect(
                                    mon.traits.ability.possibleValues,
                                ).to.have.keys("illuminate");
                            });

                            it(`Should throw if ${abilityImmunity} didn't activate when it's known`, async function () {
                                sh.initActive("p1");
                                sh.initActive("p2").setAbility(abilityImmunity);

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                // Due to the way on-tryUnboost is handled,
                                // it'll parse the effect immediately and then
                                // reject the abilityImmunity, causing an error.
                                await ph.handle(
                                    boostEvent(posBoost, target, stat, amount),
                                );
                                await ph.haltError(
                                    Error,
                                    /^Supposed to reject one Reason but all of them asserted\./,
                                );
                            });
                        });
                    }
                    shouldHandleBoost(
                        "self",
                        "leafstorm",
                        "spa",
                        false /*posBoost*/,
                        2,
                    );
                    // Can have hypercutter.
                    const pinsir: SwitchOptions = {
                        species: "pinsir",
                        gender: "M",
                        level: 100,
                        hp: 100,
                        hpMax: 100,
                    };
                    shouldHandleBoost(
                        "hit",
                        "charm",
                        "atk",
                        false /*posBoost*/,
                        2,
                        "hypercutter",
                        pinsir,
                    );

                    // Set boost.
                    boostTests.self.push(() =>
                        describe("set-boost", function () {
                            it("Should handle set boost", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p1");
                                await moveEvent("p1", "bellydrum");
                                await moveDamage("p1", 50);
                                await ph.handle({
                                    args: [
                                        "-setboost",
                                        toIdent("p1"),
                                        "atk",
                                        toNum(6),
                                    ],
                                    kwArgs: {},
                                });
                                await ph.halt();
                                await ph.return({});
                            });

                            it("Should activate berry from bellydrum", async function () {
                                sh.initActive("p1").item.narrow("sitrusberry");
                                sh.initActive("p2");

                                pctx = init("p1");
                                await moveEvent("p1", "bellydrum");
                                await moveDamage("p1", 50);
                                await ph.handle({
                                    args: [
                                        "-setboost",
                                        toIdent("p1"),
                                        "atk",
                                        toNum(6),
                                    ],
                                    kwArgs: {},
                                });
                                await ph.handle({
                                    args: [
                                        "-enditem",
                                        toIdent("p1"),
                                        toItemName("sitrusberry"),
                                    ],
                                    kwArgs: {eat: true},
                                });
                                await ph.handle({
                                    args: [
                                        "-heal",
                                        toIdent("p1"),
                                        toHPStatus(75),
                                    ],
                                    kwArgs: {
                                        from: toEffectName(
                                            "sitrusberry",
                                            "item",
                                        ),
                                    },
                                });
                                await ph.halt();
                                await ph.return({});
                            });
                        }),
                    );

                    function shouldHandlePartialBoost(
                        ctg: "self" | "hit",
                        move: string,
                        stat: dex.BoostName,
                        amount: 2 | -2,
                    ): void {
                        const sign = Math.sign(amount);
                        const target = ctg === "self" ? "p1" : "p2";
                        boostTests[ctg].push(function () {
                            it("Should allow partial boost if maxing out", async function () {
                                let mon = sh.initActive("p1");
                                if (target === "p2") mon = sh.initActive("p2");
                                else sh.initActive("p2");
                                mon.volatile.boosts[stat] = sign * 5;

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.handle(
                                    boostEvent(
                                        amount > 0 /*pos*/,
                                        target,
                                        stat,
                                        1,
                                    ),
                                );
                                await ph.halt();
                                await ph.return({});
                            });

                            it("Should allow 0 boost if maxed out", async function () {
                                let mon = sh.initActive("p1");
                                if (target === "p2") mon = sh.initActive("p2");
                                else sh.initActive("p2");
                                mon.volatile.boosts[stat] = sign * 6;

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.handle(
                                    boostEvent(
                                        amount > 0 /*pos*/,
                                        target,
                                        stat,
                                        0,
                                    ),
                                );
                                await ph.halt();
                            });
                        });
                    }
                    shouldHandlePartialBoost("self", "swordsdance", "atk", 2);
                    shouldHandlePartialBoost("hit", "captivate", "spa", -2);

                    function shouldHandleSecondaryBoost(
                        ctg: "self" | "hit",
                        move: string,
                        stat: dex.BoostName,
                        posBoost: boolean,
                        amount: number,
                    ): void {
                        boostTests[ctg].push(function () {
                            it(`Should handle boost via secondary effect using ${move}`, async function () {
                                const target = ctg === "self" ? "p1" : "p2";
                                sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.handle(
                                    boostEvent(posBoost, target, stat, amount),
                                );
                                await ph.halt();
                                await ph.return({});
                            });

                            it(`Shouldn't throw if no secondary boost using ${move}`, async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.halt();
                                await ph.return({});
                            });
                        });
                    }
                    shouldHandleSecondaryBoost(
                        "self",
                        "chargebeam",
                        "spa",
                        true /*posBoost*/,
                        1,
                    );
                    shouldHandleSecondaryBoost(
                        "hit",
                        "psychic",
                        "spd",
                        false /*posBoost*/,
                        1,
                    );

                    function shouldHandle100SecondaryBoost(
                        ctg: "self" | "hit",
                        move: string,
                        stat: dex.BoostName,
                        amount: number,
                    ): void {
                        const sign = Math.sign(amount);
                        const target = ctg === "self" ? "p1" : "p2";

                        const remainingJson: {
                            [T in dex.BoostName]?: number;
                        } = {[stat]: amount};

                        boostTests[ctg].push(function () {
                            it("Should throw if reject before 100% secondary effect", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.haltError(
                                    Error,
                                    "Expected effect that didn't happen: " +
                                        `p1 move boost ${target} add ` +
                                        `${JSON.stringify(remainingJson)} ` +
                                        "(remaining: " +
                                        `${JSON.stringify(remainingJson)})`,
                                );
                            });

                            it("Should allow no boost event for 100% secondary effect if maxed out", async function () {
                                let mon = sh.initActive("p1");
                                if (target === "p2") mon = sh.initActive("p2");
                                mon.volatile.boosts[stat] = sign * 6;

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.halt();
                                await ph.return({});
                            });
                        });
                    }
                    shouldHandle100SecondaryBoost("hit", "rocktomb", "spe", -1);

                    boostTests.self.push(() =>
                        describe("Curse (non-ghost)", function () {
                            it("Should expect boosts", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p2");
                                await moveEvent("p2", "curse");
                                await ph.handle(
                                    boostEvent(false /*pos*/, "p2", "spe", 1),
                                );
                                await ph.handle(
                                    boostEvent(true /*pos*/, "p2", "atk", 1),
                                );
                                await ph.handle(
                                    boostEvent(true /*pos*/, "p2", "def", 1),
                                );
                                await ph.halt();
                                await ph.return({});
                            });
                        }),
                    );

                    for (const name of ["self", "hit"] as const) {
                        describe(name, function () {
                            for (const f of boostTests[name]) f();
                        });
                    }
                });

                describe("status", function () {
                    const statusTests: {
                        [T in dex.MoveEffectTarget]: (() => void)[];
                    } = {self: [], hit: []};

                    interface TestNonRemovableArgs {
                        readonly ctg: dex.MoveEffectTarget;
                        readonly name: string;
                        readonly moveId: string;
                        readonly preEvents?: readonly Event[];
                        readonly startEvent: Event;
                        readonly postEvents?: readonly Event[];
                        readonly abilityImmunity?: string;
                        readonly abilityCondition?: dex.WeatherType;
                    }

                    function testNonRemovable({
                        ctg,
                        name,
                        moveId,
                        preEvents,
                        startEvent,
                        postEvents,
                        abilityImmunity,
                        abilityCondition,
                    }: TestNonRemovableArgs): void {
                        statusTests[ctg].push(() =>
                            describe(name, function () {
                                let user: Pokemon;
                                let opp: Pokemon;

                                beforeEach("Initialize active", function () {
                                    user = sh.initActive("p2");
                                    user.hp.set(50); // For roost.

                                    opp = sh.initActive("p1");
                                    // Bypassing type effectiveness assertions.
                                    opp.volatile.changeTypes(["???", "???"]);
                                });

                                it("Should pass if expected", async function () {
                                    // Set last move in case of encore.
                                    state.getTeam(
                                        "p1",
                                    ).active.volatile.lastMove = "splash";

                                    pctx = init("p2");
                                    await moveEvent("p2", moveId);
                                    for (const event of preEvents ?? []) {
                                        await ph.handle(event);
                                    }
                                    await ph.handle(startEvent);
                                    for (const event of postEvents ?? []) {
                                        await ph.handle(event);
                                    }
                                    await ph.halt();
                                    await ph.return({});
                                });

                                it("Should reject if mismatched flags", async function () {
                                    pctx = init("p2");
                                    await moveEvent("p2", "tackle");
                                    await ph.reject(startEvent);
                                    await ph.return({});
                                });

                                if (abilityImmunity) {
                                    it("Should cancel status move effects if ability immunity", async function () {
                                        // Setup ability so it can activate.
                                        const us = state.getTeam("p1").active;
                                        us.setAbility(abilityImmunity);
                                        if (abilityCondition) {
                                            state.status.weather.start(
                                                null /*source*/,
                                                abilityCondition,
                                            );
                                        }

                                        pctx = init("p2");
                                        await moveEvent("p2", moveId);
                                        for (const event of preEvents ?? []) {
                                            await ph.handle(event);
                                        }
                                        await ph.handle({
                                            args: ["-immune", toIdent("p1")],
                                            kwArgs: {
                                                from: toEffectName(
                                                    abilityImmunity,
                                                    "ability",
                                                ),
                                            },
                                        });
                                        for (const event of postEvents ?? []) {
                                            await ph.handle(event);
                                        }
                                        await ph.halt();
                                        await ph.return({});
                                    });
                                }
                            }),
                        );
                    }

                    interface TestRemovableArgs {
                        readonly ctg: dex.MoveEffectTarget;
                        readonly name: string;
                        readonly effect: dex.StatusType;
                        readonly moveId?: string;
                        startEvent: Event;
                        endEvent: Event;
                        readonly secondaryMove?: string;
                        readonly secondaryMove100?: string;
                        readonly abilityImmunity?: string;
                        readonly clauseEvent?: Event;
                    }

                    function testRemovable({
                        ctg,
                        name,
                        effect,
                        moveId,
                        startEvent,
                        endEvent,
                        secondaryMove,
                        secondaryMove100,
                        abilityImmunity,
                        clauseEvent,
                    }: TestRemovableArgs): void {
                        // Adjust perspective.
                        const target = ctg === "self" ? "p2" : "p1";

                        statusTests[ctg].push(() =>
                            describe(name, function () {
                                beforeEach("Initialize active", function () {
                                    // Bypassing type effectiveness assertions.
                                    sh.initActive("p1").volatile.changeTypes([
                                        "???",
                                        "???",
                                    ]);
                                    sh.initActive("p2");
                                });

                                if (moveId) {
                                    it("Should pass if expected", async function () {
                                        pctx = init("p2");
                                        await moveEvent("p2", moveId);
                                        await ph.handle(startEvent);
                                        await ph.halt();
                                        await ph.return({});
                                    });
                                }

                                if (moveId && abilityImmunity) {
                                    it("Should cancel status move effects if ability immunity", async function () {
                                        // Setup ability so it can activate.
                                        const us = state.getTeam("p1").active;
                                        us.setAbility(abilityImmunity);

                                        pctx = init("p2");
                                        await moveEvent("p2", moveId);
                                        await ph.handle({
                                            args: ["-immune", toIdent("p1")],
                                            kwArgs: {
                                                from: toEffectName(
                                                    abilityImmunity,
                                                    "ability",
                                                ),
                                            },
                                        });
                                        await ph.halt();
                                        await ph.return({});
                                    });
                                }

                                it("Should still pass if end event on an unrelated move", async function () {
                                    if (dex.isMajorStatus(effect)) {
                                        // Make sure majorStatus assertion
                                        // passes.
                                        state
                                            .getTeam(target)
                                            .active.majorStatus.afflict(effect);
                                    }

                                    pctx = init("p2");
                                    await moveEvent("p2", "tackle");
                                    // TODO: Track moves that can do this.
                                    await ph.handle(endEvent);
                                    await ph.halt();
                                    await ph.return({});
                                });

                                if (secondaryMove) {
                                    it("Should pass if expected via secondary effect", async function () {
                                        pctx = init("p2");
                                        await moveEvent("p2", secondaryMove);
                                        await ph.handle(startEvent);
                                        await ph.halt();
                                        await ph.return({});
                                    });
                                }

                                it("Should reject if mismatched flags", async function () {
                                    pctx = init("p2");
                                    await moveEvent("p2", "tackle");
                                    await ph.reject(startEvent);
                                    await ph.return({});
                                });

                                if (secondaryMove100) {
                                    it("Should pass if exit before 100% secondary effect if the target is already afflicted", async function () {
                                        const mon =
                                            state.getTeam(target).active;
                                        if (dex.isMajorStatus(effect)) {
                                            mon.majorStatus.afflict(effect);
                                        } else if (effect === "confusion") {
                                            mon.volatile[effect].start();
                                        } else {
                                            throw new Error(
                                                "Unsupported test " + effect,
                                            );
                                        }

                                        pctx = init("p2");
                                        await moveEvent("p2", secondaryMove100);
                                        await ph.halt();
                                        await ph.return({});
                                    });

                                    it("Should throw if reject before 100% secondary effect", async function () {
                                        // Remove owntempo possibility from
                                        // smeargle.
                                        state
                                            .getTeam("p1")
                                            .active.setAbility("technician");

                                        pctx = init("p2");
                                        await moveEvent("p2", secondaryMove100);
                                        await ph.haltError(
                                            Error,
                                            `Move '${secondaryMove100}' ` +
                                                `status [${effect}] was ` +
                                                `blocked by target ` +
                                                `'${target}' but target's ` +
                                                "ability [technician] can't " +
                                                "block it",
                                        );
                                    });

                                    it("Should pass without 100% secondary effect if target fainted", async function () {
                                        pctx = init("p2");
                                        await moveEvent("p2", secondaryMove100);
                                        await ph.handle({
                                            args: [
                                                "-damage",
                                                toIdent("p1"),
                                                toHPStatus("faint"),
                                            ],
                                            kwArgs: {},
                                        });
                                        await ph.handle({
                                            args: ["faint", toIdent("p1")],
                                            kwArgs: {},
                                        });
                                        await ph.halt();
                                        await ph.return({});
                                    });
                                }

                                if (secondaryMove100 && abilityImmunity) {
                                    it("Should narrow ability if no status event due to silent ability immunity vs 100% secondary effect", async function () {
                                        const mon = state.getTeam("p1").active;
                                        mon.setAbility(
                                            abilityImmunity,
                                            "illuminate",
                                        );

                                        pctx = init("p2");
                                        await moveEvent("p2", secondaryMove100);
                                        await ph.halt();
                                        await ph.return({});
                                        expect(
                                            mon.traits.ability.possibleValues,
                                        ).to.have.keys(abilityImmunity);
                                    });
                                }

                                if (moveId && clauseEvent) {
                                    it("Should be blocked by clause", async function () {
                                        pctx = init("p2");
                                        await moveEvent("p2", moveId);
                                        await ph.handle(clauseEvent);
                                        await ph.halt();
                                        await ph.return({});
                                    });
                                }
                            }),
                        );
                    }

                    testNonRemovable({
                        ctg: "self",
                        name: "aquaring",
                        moveId: "aquaring",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("aquaring", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "hit",
                        name: "attract",
                        moveId: "attract",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("attract", "move"),
                            ],
                            kwArgs: {},
                        },
                        abilityImmunity: "oblivious",
                    });
                    testNonRemovable({
                        ctg: "self",
                        name: "charge",
                        moveId: "charge",
                        preEvents: [
                            {
                                args: [
                                    "-boost",
                                    toIdent("p2"),
                                    "spd",
                                    toNum(1),
                                ],
                                kwArgs: {},
                            },
                        ],
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("charge", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    statusTests.hit.push(() =>
                        describe("curse (ghost)", function () {
                            const curseEvent: Event<"|-start|"> = {
                                args: [
                                    "-start",
                                    toIdent("p1"),
                                    toEffectName("curse", "move"),
                                ],
                                kwArgs: {},
                            };

                            it("Should expect curse status", async function () {
                                sh.initActive("p1");
                                sh.initActive(
                                    "p2",
                                    smeargle,
                                ).volatile.addedType = "ghost";

                                pctx = init("p2");
                                await moveEvent("p2", "curse");
                                await ph.handle(curseEvent);
                                await moveDamage("p2", 50);
                                await ph.halt();
                                await ph.return({});
                            });

                            it("Should reject if mismatched flags", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p2");
                                await moveEvent("p2", "tackle");
                                await ph.reject(curseEvent);
                                await ph.return({});
                            });
                        }),
                    );
                    testNonRemovable({
                        ctg: "hit",
                        name: "embargo",
                        moveId: "embargo",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("embargo", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "hit",
                        name: "encore",
                        moveId: "encore",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("encore", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    statusTests.hit.push(() =>
                        describe("Flash Fire", function () {
                            // Can have flashfire.
                            const arcanine: SwitchOptions = {
                                species: "arcanine",
                                gender: "F",
                                level: 100,
                                hp: 100,
                                hpMax: 100,
                            };

                            it("Should block move effects", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2", arcanine);

                                // Fire-type move with guaranteed brn effect.
                                pctx = init("p1");
                                await moveEvent("p1", "willowisp");
                                await ph.handle({
                                    args: [
                                        "-start",
                                        toIdent("p2", arcanine),
                                        toEffectName("Flash Fire"),
                                    ],
                                    kwArgs: {
                                        from: toEffectName(
                                            "flashfire",
                                            "ability",
                                        ),
                                    },
                                });
                                await ph.halt();
                                await ph.return({});
                            });
                        }),
                    );
                    testNonRemovable({
                        ctg: "self",
                        name: "focusenergy",
                        moveId: "focusenergy",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("focusenergy", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "hit",
                        name: "foresight",
                        moveId: "foresight",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("foresight", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "hit",
                        name: "healblock",
                        moveId: "healblock",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("healblock", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    // Imprison.
                    statusTests.self.push(() =>
                        describe("imprison", function () {
                            let us: Pokemon;
                            let them: Pokemon;

                            const usVulpix: SwitchOptions = {
                                species: "vulpix",
                                level: 5,
                                gender: "F",
                                hp: 20,
                                hpMax: 20,
                            };
                            const themVulpix: SwitchOptions = {
                                species: "vulpix",
                                level: 10,
                                gender: "M",
                                hp: 100,
                                hpMax: 100,
                            };
                            const themBulbasaur: SwitchOptions = {
                                species: "bulbasaur",
                                level: 10,
                                gender: "M",
                                hp: 100,
                                hpMax: 100,
                            };

                            function setup(
                                imprisonUser: SideID,
                                sameOpponent = true,
                            ): void {
                                us = sh.initActive("p1", usVulpix);
                                us.moveset.reveal(
                                    imprisonUser === "p1"
                                        ? "imprison"
                                        : "protect",
                                );
                                us.moveset.reveal("ember");
                                us.moveset.reveal("tailwhip");
                                us.moveset.reveal("disable");

                                // Switch in a similar pokemon.
                                if (sameOpponent) {
                                    // Opponent should be able to have our
                                    // moveset.
                                    them = sh.initActive("p2", themVulpix);
                                    expect(
                                        them.moveset.constraint,
                                    ).to.include.all.keys([
                                        ...us.moveset.moves.keys(),
                                    ]);
                                } else {
                                    // Opponent should not be able to have our
                                    // moveset.
                                    them = sh.initActive("p2", themBulbasaur);
                                    expect(
                                        them.moveset.constraint,
                                    ).to.not.include.any.keys([
                                        ...us.moveset.moves.keys(),
                                    ]);
                                }
                            }

                            describe("Failed", function () {
                                for (const id of ["p1", "p2"] as const) {
                                    it(`Should infer no common moves if ${id} failed`, async function () {
                                        setup(id);

                                        // If imprison fails, then the opponent
                                        // shouldn't be able to have any of our
                                        // moves.
                                        pctx = init(id);
                                        await moveEvent(id, "imprison");
                                        await ph.handle({
                                            args: [
                                                "-fail",
                                                toIdent(
                                                    id,
                                                    id === "p1"
                                                        ? usVulpix
                                                        : themVulpix,
                                                ),
                                            ],
                                            kwArgs: {},
                                        });
                                        await ph.halt();
                                        await ph.return({});
                                        expect(
                                            them.moveset.constraint,
                                        ).to.not.include.any.keys([
                                            ...us.moveset.moves.keys(),
                                        ]);
                                    });
                                }

                                it("Should throw if shared moves", async function () {
                                    setup("p1");

                                    pctx = init("p2");
                                    await moveEvent("p2", "imprison");
                                    await ph.rejectError(
                                        {
                                            args: [
                                                "-fail",
                                                toIdent("p2", themVulpix),
                                            ],
                                            kwArgs: {},
                                        },
                                        Error,
                                        "Imprison failed but both Pokemon " +
                                            "have common moves: imprison",
                                    );
                                });
                            });

                            describe("Succeeded", function () {
                                for (const id of ["p1", "p2"] as const) {
                                    it(`Should infer a common move if ${id} succeeded`, async function () {
                                        setup(id);

                                        // If imprison succeeds, then the
                                        // opponent should be able to have one
                                        // of our moves.
                                        pctx = init(id);
                                        await moveEvent(id, "imprison");
                                        await ph.handle({
                                            args: [
                                                "-start",
                                                toIdent(
                                                    id,
                                                    id === "p1"
                                                        ? usVulpix
                                                        : themVulpix,
                                                ),
                                                toEffectName(
                                                    "imprison",
                                                    "move",
                                                ),
                                            ],
                                            kwArgs: {},
                                        });
                                        await ph.halt();
                                        await ph.return({});
                                        expect(
                                            them.moveset.moveSlotConstraints,
                                        ).to.have.lengthOf(1);
                                        expect(
                                            them.moveset.moveSlotConstraints[0],
                                        ).to.have.keys([
                                            ...us.moveset.moves.keys(),
                                        ]);
                                    });
                                }

                                it("Should throw if no shared moves", async function () {
                                    setup("p1", false /*sameOpponent*/);

                                    pctx = init("p1");
                                    await moveEvent("p1", "imprison");
                                    await ph.handle({
                                        args: [
                                            "-start",
                                            toIdent("p1", usVulpix),
                                            toEffectName("imprison", "move"),
                                        ],
                                        kwArgs: {},
                                    });
                                    // Assertion kicks in after handling the
                                    // event.
                                    await ph.haltError(
                                        Error,
                                        "Imprison succeeded but both Pokemon " +
                                            "cannot share any moves",
                                    );
                                });
                            });
                        }),
                    );
                    testNonRemovable({
                        ctg: "self",
                        name: "ingrain",
                        moveId: "ingrain",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("ingrain", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testRemovable({
                        ctg: "hit",
                        name: "leechseed",
                        effect: "leechseed",
                        moveId: "leechseed",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("leechseed", "move"),
                            ],
                            kwArgs: {},
                        },
                        endEvent: {
                            args: [
                                "-end",
                                toIdent("p1"),
                                toEffectName("leechseed", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "self",
                        name: "magnetrise",
                        moveId: "magnetrise",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("magnetrise", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "hit",
                        name: "miracleeye",
                        moveId: "miracleeye",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("miracleeye", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "self",
                        name: "mudsport",
                        moveId: "mudsport",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("mudsport", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "hit",
                        name: "nightmare",
                        moveId: "nightmare",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("nightmare", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "self",
                        name: "powertrick",
                        moveId: "powertrick",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("powertrick", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    // Slowstart (ability-only effect).
                    for (const ctg of ["self", "hit"] as const) {
                        const target = ctg === "self" ? "p2" : "p1";
                        statusTests[ctg].push(() =>
                            describe("slowstart", function () {
                                it("Should reject", async function () {
                                    sh.initActive("p1");
                                    sh.initActive("p2");

                                    pctx = init("p2");
                                    await moveEvent("p2", "tackle");
                                    await ph.reject({
                                        args: [
                                            "-start",
                                            toIdent(target),
                                            toEffectName(
                                                "slowstart",
                                                "ability",
                                            ),
                                        ],
                                        kwArgs: {},
                                    });
                                    await ph.return({});
                                });
                            }),
                        );
                    }
                    testNonRemovable({
                        ctg: "self",
                        name: "Substitute",
                        moveId: "substitute",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("substitute", "move"),
                            ],
                            kwArgs: {},
                        },
                        postEvents: [
                            {
                                args: [
                                    "-damage",
                                    toIdent("p2"),
                                    toHPStatus(25),
                                ],
                                kwArgs: {},
                            },
                        ],
                    });
                    testNonRemovable({
                        ctg: "hit",
                        name: "suppressAbility",
                        moveId: "gastroacid",
                        startEvent: {
                            args: ["-endability", toIdent("p1")],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "hit",
                        name: "Taunt",
                        moveId: "taunt",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("taunt", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "hit",
                        name: "torment",
                        moveId: "torment",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("torment", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "self",
                        name: "watersport",
                        moveId: "watersport",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("watersport", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    // TODO: More dynamic way of adding/generating tests.
                    testNonRemovable({
                        ctg: "hit",
                        name: "yawn",
                        moveId: "yawn",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("yawn", "move"),
                            ],
                            kwArgs: {},
                        },
                        abilityImmunity: "leafguard",
                        abilityCondition: "SunnyDay",
                    });

                    // Updatable.
                    testRemovable({
                        ctg: "hit",
                        name: "confusion",
                        effect: "confusion",
                        moveId: "confuseray",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("confusion"),
                            ],
                            kwArgs: {},
                        },
                        endEvent: {
                            args: [
                                "-end",
                                toIdent("p1"),
                                toEffectName("confusion"),
                            ],
                            kwArgs: {},
                        },
                        secondaryMove: "psybeam",
                        secondaryMove100: "dynamicpunch",
                        abilityImmunity: "owntempo",
                    });
                    testNonRemovable({
                        ctg: "self",
                        name: "bide",
                        moveId: "bide",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("bide", "move"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "self",
                        name: "uproar",
                        moveId: "uproar",
                        startEvent: {
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("uproar", "move"),
                            ],
                            kwArgs: {},
                        },
                    });

                    // Singlemove.
                    testNonRemovable({
                        ctg: "self",
                        name: "destinybond",
                        moveId: "destinybond",
                        startEvent: {
                            args: [
                                "-singlemove",
                                toIdent("p2"),
                                toMoveName("destinybond"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "self",
                        name: "grudge",
                        moveId: "grudge",
                        startEvent: {
                            args: [
                                "-singlemove",
                                toIdent("p2"),
                                toMoveName("grudge"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "self",
                        name: "rage",
                        moveId: "rage",
                        startEvent: {
                            args: [
                                "-singlemove",
                                toIdent("p2"),
                                toMoveName("rage"),
                            ],
                            kwArgs: {},
                        },
                    });

                    // Singleturn.
                    testNonRemovable({
                        ctg: "self",
                        name: "endure",
                        moveId: "endure",
                        startEvent: {
                            args: [
                                "-singleturn",
                                toIdent("p2"),
                                toMoveName("endure"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "self",
                        name: "magiccoat",
                        moveId: "magiccoat",
                        startEvent: {
                            args: [
                                "-singleturn",
                                toIdent("p2"),
                                toMoveName("magiccoat"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "self",
                        name: "protect",
                        moveId: "protect",
                        startEvent: {
                            args: [
                                "-singleturn",
                                toIdent("p2"),
                                toMoveName("protect"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "self",
                        name: "roost",
                        moveId: "roost",
                        preEvents: [
                            {
                                args: ["-heal", toIdent("p2"), toHPStatus(100)],
                                kwArgs: {},
                            },
                        ],
                        startEvent: {
                            args: [
                                "-singleturn",
                                toIdent("p2"),
                                toMoveName("roost"),
                            ],
                            kwArgs: {},
                        },
                    });
                    testNonRemovable({
                        ctg: "self",
                        name: "snatch",
                        moveId: "snatch",
                        startEvent: {
                            args: [
                                "-singleturn",
                                toIdent("p2"),
                                toMoveName("snatch"),
                            ],
                            kwArgs: {},
                        },
                    });
                    // Stall.
                    statusTests.self.push(() =>
                        describe("stall effect", function () {
                            it("Should count stall turns then reset if failed", async function () {
                                sh.initActive("p1");
                                const v = sh.initActive("p2").volatile;
                                expect(v.stalling).to.be.false;
                                expect(v.stallTurns).to.equal(0);
                                for (let i = 1; i <= 2; ++i) {
                                    state.preTurn();

                                    pctx = init("p2");
                                    await moveEvent("p2", "protect");
                                    await ph.handle({
                                        args: [
                                            "-singleturn",
                                            toIdent("p2"),
                                            toMoveName("protect"),
                                        ],
                                        kwArgs: {},
                                    });
                                    await ph.halt();
                                    await ph.return({});
                                    expect(v.stalling).to.be.true;
                                    expect(v.stallTurns).to.equal(i);

                                    state.postTurn();
                                    expect(v.stalling).to.be.false;
                                    expect(v.stallTurns).to.equal(i);
                                    await ph.close();
                                }

                                state.preTurn();

                                pctx = init("p2");
                                await moveEvent("p2", "protect");
                                await ph.handle({
                                    args: ["-fail", toIdent("p2")],
                                    kwArgs: {},
                                });
                                await ph.halt();
                                await ph.return({});
                                expect(v.stalling).to.be.false;
                                expect(v.stallTurns).to.equal(0);
                            });

                            it("Should reset stall counter if using another move", async function () {
                                sh.initActive("p1");
                                const mon = sh.initActive("p2");

                                // Stall effect is put in place.
                                state.preTurn();
                                mon.volatile.stall(true);
                                state.postTurn();
                                expect(mon.volatile.stalling).to.be.false;
                                expect(mon.volatile.stallTurns).to.equal(1);

                                // Some other move is used next turn.
                                state.preTurn();

                                pctx = init("p2");
                                await moveSplash("p2");
                                await ph.halt();
                                await ph.return({});
                                expect(mon.volatile.stalling).to.be.false;
                                expect(mon.volatile.stallTurns).to.equal(0);
                            });

                            it("Should not reset counter if called", async function () {
                                sh.initActive("p1");
                                const mon = sh.initActive("p2");

                                pctx = init("p2");
                                await moveEvent("p2", "endure");
                                // Stall effect is put in place.
                                await ph.handle({
                                    args: [
                                        "-singleturn",
                                        toIdent("p2"),
                                        toMoveName("endure"),
                                    ],
                                    kwArgs: {},
                                });
                                await ph.halt();
                                await ph.return({});
                                expect(mon.volatile.stalling).to.be.true;
                                expect(mon.volatile.stallTurns).to.equal(1);
                                await ph.close();

                                // Somehow the pokemon moves again in the same
                                // turn via call effect.
                                pctx = init("p2");
                                await moveEvent("p2", "metronome");
                                await moveEvent("p2", "endure", {
                                    from: toMoveName("metronome"),
                                });
                                await ph.handle({
                                    args: ["-fail", toIdent("p2")],
                                    kwArgs: {},
                                });
                                await ph.halt();
                                await ph.return({});
                                expect(mon.volatile.stalling).to.be.true;
                                expect(mon.volatile.stallTurns).to.equal(1);
                            });
                        }),
                    );

                    // Major status.
                    // TODO: Search for these moves automatically in dex.
                    testRemovable({
                        ctg: "hit",
                        name: "brn",
                        effect: "brn",
                        moveId: "willowisp",
                        startEvent: {
                            args: ["-status", toIdent("p1"), "brn"],
                            kwArgs: {},
                        },
                        endEvent: {
                            args: ["-curestatus", toIdent("p1"), "brn"],
                            kwArgs: {},
                        },
                        secondaryMove: "flamethrower",
                        abilityImmunity: "waterveil",
                    });
                    testRemovable({
                        ctg: "hit",
                        name: "frz",
                        effect: "frz",
                        startEvent: {
                            args: ["-status", toIdent("p1"), "frz"],
                            kwArgs: {},
                        },
                        endEvent: {
                            args: ["-curestatus", toIdent("p1"), "frz"],
                            kwArgs: {},
                        },
                        secondaryMove: "icebeam",
                        abilityImmunity: "magmaarmor",
                    });
                    testRemovable({
                        ctg: "hit",
                        name: "par",
                        effect: "par",
                        moveId: "stunspore",
                        startEvent: {
                            args: ["-status", toIdent("p1"), "par"],
                            kwArgs: {},
                        },
                        endEvent: {
                            args: ["-curestatus", toIdent("p1"), "par"],
                            kwArgs: {},
                        },
                        secondaryMove: "thunderbolt",
                        secondaryMove100: "zapcannon",
                        abilityImmunity: "limber",
                    });
                    testRemovable({
                        ctg: "hit",
                        name: "psn",
                        effect: "psn",
                        moveId: "poisonpowder",
                        startEvent: {
                            args: ["-status", toIdent("p1"), "psn"],
                            kwArgs: {},
                        },
                        endEvent: {
                            args: ["-curestatus", toIdent("p1"), "psn"],
                            kwArgs: {},
                        },
                        secondaryMove: "gunkshot",
                        abilityImmunity: "immunity",
                    });
                    testRemovable({
                        ctg: "hit",
                        name: "slp",
                        effect: "slp",
                        moveId: "spore",
                        startEvent: {
                            args: ["-status", toIdent("p1"), "slp"],
                            kwArgs: {},
                        },
                        endEvent: {
                            args: ["-curestatus", toIdent("p1"), "slp"],
                            kwArgs: {},
                        },
                        abilityImmunity: "insomnia",
                        clauseEvent: {
                            args: [
                                "-message",
                                toMessage("Sleep Clause Mod activated."),
                            ],
                            kwArgs: {},
                        },
                    });
                    testRemovable({
                        ctg: "hit",
                        name: "tox",
                        effect: "tox",
                        moveId: "toxic",
                        startEvent: {
                            args: ["-status", toIdent("p1"), "tox"],
                            kwArgs: {},
                        },
                        endEvent: {
                            args: ["-curestatus", toIdent("p1"), "tox"],
                            kwArgs: {},
                        },
                        secondaryMove: "poisonfang",
                        abilityImmunity: "immunity",
                    });

                    // TODO: Move to target category.
                    statusTests.hit.push(() =>
                        describe("ability on-blockStatus", function () {
                            // TODO: Currently unsupported.
                            // eslint-disable-next-line mocha/no-skipped-tests
                            it.skip("Should handle ability status immunity while leaving other move effects intact", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2").setAbility("owntempo");

                                pctx = init("p1");
                                // Atk+2, confusion.
                                await moveEvent("p1", "swagger");
                                await ph.handle({
                                    args: [
                                        "-boost",
                                        toIdent("p2"),
                                        "atk",
                                        toNum(1),
                                    ],
                                    kwArgs: {},
                                });
                                await ph.handle({
                                    args: [
                                        "-immune",
                                        toIdent("p2"),
                                        "confusion",
                                    ],
                                    kwArgs: {
                                        from: toEffectName(
                                            "owntempo",
                                            "ability",
                                        ),
                                    },
                                });
                                await ph.halt();
                                await ph.return({});
                            });
                        }),
                    );

                    for (const name of ["self", "hit"] as const) {
                        describe(name, function () {
                            for (const f of statusTests[name]) f();
                        });
                    }
                });

                describe("drain", function () {
                    it("Should pass if expected", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").hp.set(1);

                        pctx = init("p2");
                        await moveEvent("p2", "absorb");
                        await moveDamage("p1", 50);
                        await ph.handle({
                            args: ["-heal", toIdent("p2"), toHPStatus(100)],
                            kwArgs: {from: toEffectName("drain")},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should pass without event if full hp", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "absorb");
                        await moveDamage("p1", 50);
                        await ph.halt();
                        await ph.return({});
                    });

                    describe("ability on-moveDrain (liquidooze)", function () {
                        // Can have clearbody or liquidooze.
                        const tentacruel: SwitchOptions = {
                            species: "tentacruel",
                            level: 100,
                            gender: "M",
                            hp: 364,
                            hpMax: 364,
                        };

                        it("Should infer no liquidooze if normal", async function () {
                            const mon = sh.initActive("p1", tentacruel);
                            expect(
                                mon.traits.ability.possibleValues,
                            ).to.have.keys("clearbody", "liquidooze");
                            sh.initActive("p2").hp.set(1);

                            pctx = init("p2");
                            await moveEvent("p2", "gigadrain");
                            await moveDamage("p1", 50, 364, {}, tentacruel);
                            await ph.handle({
                                args: ["-heal", toIdent("p2"), toHPStatus(100)],
                                kwArgs: {from: toEffectName("drain")},
                            });
                            await ph.halt();
                            await ph.return({});
                            expect(
                                mon.traits.ability.possibleValues,
                            ).to.have.keys("clearbody");
                            expect(mon.ability).to.equal("clearbody");
                        });

                        it("Should pass if liquidooze activates", async function () {
                            sh.initActive("p1", tentacruel);
                            sh.initActive("p2");

                            pctx = init("p2");
                            await moveEvent("p2", "absorb");
                            await moveDamage("p1", 50, 364, {}, tentacruel);
                            await moveDamage("p2", 50, 100, {
                                from: toEffectName("liquidooze", "ability"),
                                of: toIdent("p1", tentacruel),
                            });
                            await ph.halt();
                            await ph.return({});
                        });
                    });
                });

                describe("item on-super (enigmaberry)", function () {
                    it("Should handle enigmaberry", async function () {
                        sh.initActive("p1").volatile.addedType = "water";
                        sh.initActive("p2").hp.set(50);

                        pctx = init("p2");
                        await moveEvent("p2", "absorb");
                        await ph.handle({
                            args: ["-supereffective", toIdent("p1")],
                            kwArgs: {},
                        });
                        await moveDamage("p1", 50);
                        await ph.handle({
                            args: ["-heal", toIdent("p2"), toHPStatus(100)],
                            kwArgs: {from: toEffectName("drain")},
                        });
                        // Item activates after drain effect.
                        await ph.handle({
                            args: [
                                "-enditem",
                                toIdent("p1"),
                                toItemName("enigmaberry"),
                            ],
                            kwArgs: {eat: true},
                        });
                        await ph.handle({
                            args: ["-heal", toIdent("p1"), toHPStatus(100)],
                            kwArgs: {from: toEffectName("enigmaberry", "item")},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Shouldn't activate enigmaberry if fainted", async function () {
                        const mon = sh.initActive("p1");
                        mon.volatile.addedType = "water";
                        mon.setItem("enigmaberry");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "thunder");
                        await ph.handle({
                            args: ["-supereffective", toIdent("p1")],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: [
                                "-damage",
                                toIdent("p1"),
                                toHPStatus("faint"),
                            ],
                            kwArgs: {},
                        });
                        // Berry doesn't activate because hp=0.
                        await ph.handle({
                            args: ["faint", toIdent("p1")],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });
                });

                describe("ability on-moveDamage (colorchange)", function () {
                    it("Should handle ability", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").setAbility("colorchange");

                        pctx = init("p1");
                        await moveEvent("p1", "watergun");
                        await moveDamage("p2", 82);
                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p2"),
                                toEffectName("typechange"),
                                toTypes("water"),
                            ],
                            kwArgs: {
                                from: toEffectName("colorchange", "ability"),
                            },
                        });
                        await ph.halt();
                        await ph.return({});
                    });
                });

                describe("ability on-moveContact", function () {
                    it("Should handle ability", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").setAbility("roughskin");

                        pctx = init("p1");
                        await moveEvent("p1", "tackle");
                        await moveDamage("p2", 82);
                        await moveDamage("p1", 90, 100, {
                            from: toEffectName("roughskin", "ability"),
                            of: toIdent("p2"),
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should not handle if not a contact move", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").setAbility("roughskin");

                        pctx = init("p1");
                        await moveEvent("p1", "flashcannon");
                        await moveDamage("p2", 82);
                        await ph.halt();
                        await ph.return({});
                    });
                });

                describe("ability on-moveContactKo (aftermath)", function () {
                    it("Should handle ability", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").setAbility("aftermath");

                        pctx = init("p1");
                        await moveEvent("p1", "tackle");
                        await ph.handle({
                            args: [
                                "-damage",
                                toIdent("p2"),
                                toHPStatus("faint"),
                            ],
                            kwArgs: {},
                        });
                        await moveDamage("p1", 75, 100, {
                            from: toEffectName("aftermath", "ability"),
                            of: toIdent("p2"),
                        });
                        await ph.handle({
                            args: ["faint", toIdent("p2")],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should not handle if not a contact move", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").setAbility("aftermath");

                        pctx = init("p1");
                        await moveEvent("p1", "airslash");
                        await ph.handle({
                            args: [
                                "-damage",
                                toIdent("p2"),
                                toHPStatus("faint"),
                            ],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: ["faint", toIdent("p2")],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should not handle if not KOed", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").setAbility("aftermath");

                        pctx = init("p1");
                        await moveEvent("p1", "tackle");
                        await moveDamage("p2", 82);
                        await ph.halt();
                        await ph.return({});
                    });
                });

                describe("item on-postHit (jabocaberry/rowapberry)", function () {
                    it("Should handle jabocaberry (physical)", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "tackle");
                        await moveDamage("p1", 50);
                        await ph.handle({
                            args: [
                                "-enditem",
                                toIdent("p1"),
                                toItemName("jabocaberry"),
                            ],
                            kwArgs: {eat: true},
                        });
                        await moveDamage("p2", 50, 100, {
                            from: toEffectName("jabocaberry", "item"),
                            of: toIdent("p1"),
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should handle rowapberry (special)", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "ember");
                        await moveDamage("p1", 50);
                        await ph.handle({
                            args: [
                                "-enditem",
                                toIdent("p1"),
                                toItemName("rowapberry"),
                            ],
                            kwArgs: {eat: true},
                        });
                        await moveDamage("p2", 50, 100, {
                            from: toEffectName("rowapberry", "item"),
                            of: toIdent("p1"),
                        });
                        await ph.halt();
                        await ph.return({});
                    });
                });

                describe("item on-update", function () {
                    it("Should handle", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "ember");
                        await moveDamage("p1", 50);
                        await ph.handle({
                            args: [
                                "-enditem",
                                toIdent("p1"),
                                toItemName("sitrusberry"),
                            ],
                            kwArgs: {eat: true},
                        });
                        await ph.handle({
                            args: ["-heal", toIdent("p1"), toHPStatus(100)],
                            kwArgs: {from: toEffectName("sitrusberry", "item")},
                        });
                        await ph.halt();
                        await ph.return({});
                    });
                });
            });

            describe("multi-hit effect", function () {
                it("Should handle multi-hit move", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2");

                    pctx = init("p1");
                    await moveEvent("p1", "doublekick");
                    await ph.handle({
                        args: ["-supereffective", toIdent("p2")],
                        kwArgs: {},
                    });
                    await moveDamage("p2", 75);
                    await ph.handle({
                        args: ["-supereffective", toIdent("p2")],
                        kwArgs: {},
                    });
                    await moveDamage("p2", 50);
                    await ph.handle({
                        args: ["-hitcount", toIdent("p2"), toNum(2)],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return({});
                });

                it("Should throw if invalid |-hitcount| event ident", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2");

                    pctx = init("p2");
                    await moveEvent("p2", "triplekick");
                    await ph.handle({
                        args: ["-supereffective", toIdent("p1")],
                        kwArgs: {},
                    });
                    await moveDamage("p1", 50);
                    await ph.rejectError(
                        {
                            args: ["-hitcount", toIdent("p2"), toNum(1)],
                            kwArgs: {},
                        },
                        Error,
                        "Invalid |-hitcount| event: Expected non-p2 but got p2",
                    );
                });

                it("Should throw if invalid |-hitcount| event count", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2");

                    pctx = init("p2");
                    await moveEvent("p2", "triplekick");
                    await ph.handle({
                        args: ["-supereffective", toIdent("p1")],
                        kwArgs: {},
                    });
                    await moveDamage("p1", 50);
                    await ph.rejectError(
                        {
                            args: ["-hitcount", toIdent("p1"), toNum(2)],
                            kwArgs: {},
                        },
                        Error,
                        "Invalid |-hitcount| event: Expected 1 but got '2'",
                    );
                });

                it("Should throw if no |-hitcount| event", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2");

                    pctx = init("p1");
                    await moveEvent("p1", "doublekick");
                    await ph.handle({
                        args: ["-supereffective", toIdent("p2")],
                        kwArgs: {},
                    });
                    await moveDamage("p2", 75);
                    await ph.handle({
                        args: ["-supereffective", toIdent("p2")],
                        kwArgs: {},
                    });
                    await moveDamage("p2", 50);
                    await ph.haltError(
                        Error,
                        "Expected |-hitcount| event to terminate multi-hit " +
                            "move",
                    );
                });
            });

            describe("other effects", function () {
                describe("swap-boosts", function () {
                    beforeEach("Initialize both mons", function () {
                        sh.initActive("p1");
                        sh.initActive("p2");
                    });

                    it("Should handle swap boost move", async function () {
                        pctx = init("p2");
                        await moveEvent("p2", "guardswap");
                        await ph.handle({
                            args: [
                                "-swapboost",
                                toIdent("p2"),
                                toIdent("p1"),
                                toBoostIDs("def", "spd"),
                            ],
                            kwArgs: {from: toEffectName("guardswap", "move")},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should throw if event doesn't include user", async function () {
                        pctx = init("p2");
                        await moveEvent("p2", "powerswap");
                        await ph.rejectError(
                            {
                                args: [
                                    "-swapboost",
                                    toIdent("p1"),
                                    toIdent("p1"),
                                    toBoostIDs("atk", "spa"),
                                ],
                                kwArgs: {
                                    from: toEffectName("powerswap", "move"),
                                },
                            },
                            Error,
                            "Expected effect that didn't happen: " +
                                "p2 move swap-boosts p1 [atk, spa]",
                        );
                    });

                    it("Should throw if too many stats", async function () {
                        pctx = init("p2");
                        await moveEvent("p2", "powerswap");

                        // Shouldn't handle.
                        await ph.rejectError(
                            {
                                args: [
                                    "-swapboost",
                                    toIdent("p2"),
                                    toIdent("p1"),
                                    toBoostIDs("atk", "spa", "spe"),
                                ],
                                kwArgs: {
                                    from: toEffectName("powerswap", "move"),
                                },
                            },
                            Error,
                            "Expected effect that didn't happen: " +
                                "p2 move swap-boosts p1 [atk, spa]",
                        );
                    });
                });

                describe("team", function () {
                    const teamTests: {
                        [T in dex.MoveEffectTarget]: (() => void)[];
                    } = {self: [], hit: []};

                    it("Should still allow unsupported |-sideend|", async function () {
                        const team = state.getTeam("p2");
                        team.status.spikes = 2;
                        sh.initActive("p1");
                        sh.initActive("p2");

                        // TODO: Support/test these effects.
                        pctx = init("p2");
                        await moveEvent("p2", "rapidspin");
                        await ph.handle({
                            args: [
                                "-sideend",
                                toSide("p2", "player2"),
                                "Spikes" as SideCondition,
                            ],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    // Screen move self team effects.
                    const screenMoves = [
                        ["Light Screen", "lightscreen", "lightscreen"],
                        ["Reflect", "reflect", "reflect"],
                    ] as const;
                    for (const [name, effect, move] of screenMoves) {
                        teamTests.self.push(() =>
                            describe(effect, function () {
                                it("Should infer source via move", async function () {
                                    const team = state.getTeam("p2");
                                    sh.initActive("p1");
                                    const {item} = sh.initActive("p2");

                                    pctx = init("p2");
                                    await moveEvent("p2", move);
                                    await ph.handle({
                                        args: [
                                            "-sidestart",
                                            toSide("p2", "player2"),
                                            name as SideCondition,
                                        ],
                                        kwArgs: {},
                                    });
                                    await ph.halt();
                                    await ph.return({});
                                    expect(
                                        team.status[effect].isActive,
                                    ).to.be.true;
                                    expect(team.status[effect].source).to.equal(
                                        item,
                                    );
                                });

                                it("Should reject if mismatch", async function () {
                                    const {status: ts} = state.getTeam("p2");
                                    sh.initActive("p1");
                                    sh.initActive("p2");

                                    pctx = init("p2");
                                    await moveEvent("p2", move);
                                    const otherName =
                                        effect === "reflect"
                                            ? "Light Screen"
                                            : "Reflect";
                                    await ph.rejectError(
                                        {
                                            args: [
                                                "-sidestart",
                                                toSide("p2", "player2"),
                                                otherName as SideCondition,
                                            ],
                                            kwArgs: {},
                                        },
                                        Error,
                                        "Expected effect that didn't happen: " +
                                            "p2 move team p2 " +
                                            effect,
                                    );
                                    expect(ts.reflect.isActive).to.be.false;
                                    expect(ts.reflect.source).to.be.null;
                                    expect(ts.lightscreen.isActive).to.be.false;
                                    expect(ts.lightscreen.source).to.be.null;
                                });
                            }),
                        );
                    }

                    // Other non-screen self team effects.
                    const otherMoves = [
                        ["Lucky Chant", "luckychant", "luckychant"],
                        ["Mist", "mist", "mist"],
                        ["Safeguard", "safeguard", "safeguard"],
                        ["Tailwind", "tailwind", "tailwind"],
                    ] as const;
                    for (const [name, effect, move] of otherMoves) {
                        teamTests.self.push(() =>
                            describe(effect, function () {
                                it("Should handle", async function () {
                                    sh.initActive("p1");
                                    sh.initActive("p2");

                                    pctx = init("p2");
                                    await moveEvent("p2", move);
                                    await ph.handle({
                                        args: [
                                            "-sidestart",
                                            toSide("p2", "player2"),
                                            name as SideCondition,
                                        ],
                                        kwArgs: {},
                                    });
                                    await ph.halt();
                                    await ph.return({});
                                });
                            }),
                        );
                    }

                    // Hazard move hit team effects.
                    const hazardMoves = [
                        ["Spikes", "spikes", "spikes"],
                        ["Stealth Rock", "stealthRock", "stealthrock"],
                        ["Toxic Spikes", "toxicSpikes", "toxicspikes"],
                    ] as const;
                    for (const [name, effect, move] of hazardMoves) {
                        teamTests.hit.push(() =>
                            describe(effect, function () {
                                it("Should pass if expected", async function () {
                                    sh.initActive("p1");
                                    sh.initActive("p2");

                                    pctx = init("p2");
                                    await moveEvent("p2", move);
                                    await ph.handle({
                                        args: [
                                            "-sidestart",
                                            toSide("p1", "player1"),
                                            name as SideCondition,
                                        ],
                                        kwArgs: {},
                                    });
                                    await ph.halt();
                                    await ph.return({});
                                });

                                if (move === "spikes") {
                                    // Ground move.
                                    it("Should ignore ability type immunity", async function () {
                                        sh.initActive("p1").setAbility(
                                            "levitate",
                                        );
                                        sh.initActive("p2");

                                        pctx = init("p2");
                                        await moveEvent("p2", move);
                                        await ph.handle({
                                            args: [
                                                "-sidestart",
                                                toSide("p1", "player1"),
                                                name as SideCondition,
                                            ],
                                            kwArgs: {},
                                        });
                                        await ph.halt();
                                        await ph.return({});
                                    });
                                }
                            }),
                        );
                    }

                    teamTests.self.push(() =>
                        describe("cure", function () {
                            for (const move of ["healbell", "aromatherapy"]) {
                                it(`Should pass if using ${move}`, async function () {
                                    sh.initActive("p1");
                                    const [mon1, mon2] = sh.initTeam("p2", [
                                        ditto,
                                        smeargle,
                                    ]);
                                    mon1.majorStatus.afflict("slp");
                                    mon2.majorStatus.afflict("brn");

                                    pctx = init("p2");
                                    await moveEvent("p2", move);
                                    // Cure-team indicator event.
                                    await ph.handle({
                                        args: [
                                            "-activate",
                                            // TODO: Incomplete protocol
                                            // typings.
                                            toSide(
                                                "p2",
                                                "player1",
                                            ) as unknown as Protocol.PokemonIdent,
                                            toEffectName(move, "move"),
                                        ],
                                        kwArgs: {},
                                    });
                                    await ph.handle({
                                        args: [
                                            "-curestatus",
                                            toIdent("p2", ditto, null),
                                            "slp",
                                        ],
                                        kwArgs: {silent: true},
                                    });
                                    await ph.handle({
                                        args: [
                                            "-curestatus",
                                            toIdent("p2", smeargle),
                                            "brn",
                                        ],
                                        kwArgs: {silent: true},
                                    });
                                    await ph.halt();
                                    await ph.return({});
                                    expect(mon1.majorStatus.current).to.be.null;
                                    expect(mon2.majorStatus.current).to.be.null;
                                });

                                it(`Should also handle cureteam event if using ${move}`, async function () {
                                    sh.initActive("p1");
                                    const [mon1, mon2] = sh.initTeam("p2", [
                                        ditto,
                                        smeargle,
                                    ]);
                                    mon1.majorStatus.afflict("slp");
                                    mon2.majorStatus.afflict("brn");

                                    pctx = init("p2");
                                    await moveEvent("p2", move);
                                    await ph.handle({
                                        args: ["-cureteam", toIdent("p2")],
                                        kwArgs: {
                                            from: toEffectName(move, "move"),
                                        },
                                    });
                                    await ph.halt();
                                    await ph.return({});
                                    expect(mon1.majorStatus.current).to.be.null;
                                    expect(mon2.majorStatus.current).to.be.null;
                                });
                            }

                            it("Should reject if invalid effect", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2").majorStatus.afflict("frz");

                                pctx = init("p2");
                                await moveEvent("p2", "healbell");
                                await ph.rejectError(
                                    {
                                        args: [
                                            "-activate",
                                            toSide(
                                                "p2",
                                                "player1",
                                            ) as unknown as Protocol.PokemonIdent,
                                            toEffectName("tackle", "move"),
                                        ],
                                        kwArgs: {},
                                    },
                                    Error,
                                    "Expected effect that didn't happen: " +
                                        "p2 move team p2 cure",
                                );
                            });

                            it("Should not handle if no statuses to cure", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p2");
                                await moveEvent("p2", "healbell");
                                await ph.halt();
                                await ph.return({});
                            });
                        }),
                    );

                    for (const name of ["self", "hit"] as const) {
                        describe(name, function () {
                            for (const f of teamTests[name]) f();
                        });
                    }
                });

                describe("field", function () {
                    it("Should pass if expected", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p1");
                        await moveEvent("p1", "trickroom");
                        await ph.handle({
                            args: [
                                "-fieldstart",
                                "Trick Room" as FieldCondition,
                            ],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should reject if not expected", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p1");
                        await moveEvent("p1", "splash");
                        await ph.handle({
                            args: [
                                "-activate",
                                "",
                                toEffectName("splash", "move"),
                            ],
                            kwArgs: {},
                        });
                        await ph.reject({
                            args: [
                                "-fieldstart",
                                "Trick Room" as FieldCondition,
                            ],
                            kwArgs: {},
                        });
                        await ph.return({});
                    });

                    it("Should toggle trickroom", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");
                        state.status.trickroom.start();

                        pctx = init("p1");
                        await moveEvent("p1", "trickroom");
                        await ph.handle({
                            args: ["-fieldend", "Trick Room" as FieldCondition],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    describe("weather", function () {
                        it("Should infer source via move and infer weather item if it goes too long", async function () {
                            sh.initActive("p1");
                            const {item} = sh.initActive("p2");

                            pctx = init("p2");
                            await moveEvent("p2", "raindance");
                            await ph.handle({
                                args: ["-weather", "RainDance" as Weather],
                                kwArgs: {},
                            });
                            await ph.halt();
                            await ph.return({});

                            const {weather} = state.status;
                            expect(weather.type).to.equal("RainDance");
                            expect(weather.duration).to.not.be.null;
                            expect(weather.source).to.equal(item);

                            // Tick 5 times to infer item.
                            for (let i = 0; i < 5; ++i) {
                                expect(item.definiteValue).to.be.null;
                                weather.tick();
                            }
                            expect(item.definiteValue).to.equal("damprock");
                        });

                        it("Should reject if mismatch", async function () {
                            sh.initActive("p1");
                            sh.initActive("p2");

                            pctx = init("p2");
                            await moveEvent("p2", "raindance");
                            await ph.rejectError(
                                {
                                    args: ["-weather", "Hail" as Weather],
                                    kwArgs: {},
                                },
                                Error,
                                "Expected effect that didn't happen: " +
                                    "p2 move field RainDance",
                            );
                        });

                        it("Should change Castform's forme", async function () {
                            sh.initActive("p1", castform);
                            sh.initActive("p2");

                            pctx = init("p2");
                            await moveEvent("p2", "hail");
                            await ph.handle({
                                args: ["-weather", "Hail" as Weather],
                                kwArgs: {},
                            });
                            await ph.handle({
                                args: [
                                    "-formechange",
                                    toIdent("p1", castform),
                                    toSpeciesName(castformsnowy.species),
                                ],
                                kwArgs: {
                                    msg: true,
                                    from: toEffectName("forecast", "ability"),
                                },
                            });
                            await ph.halt();
                            await ph.return({});
                        });

                        it("Should change Castform's forme again", async function () {
                            state.status.weather.start(
                                null /*source*/,
                                "RainDance",
                            );
                            sh.initActive("p1", castform).formChange(
                                castformrainy.species,
                                castformrainy.level,
                            );
                            sh.initActive("p2");

                            pctx = init("p2");
                            await moveEvent("p2", "sunnyday");
                            await ph.handle({
                                args: ["-weather", "SunnyDay" as Weather],
                                kwArgs: {},
                            });
                            await ph.handle({
                                args: [
                                    "-formechange",
                                    // Note: Base forme is always used for the
                                    // ident since it's the nickname.
                                    toIdent("p1", castform),
                                    toSpeciesName(castformsunny.species),
                                ],
                                kwArgs: {
                                    msg: true,
                                    from: toEffectName("forecast", "ability"),
                                },
                            });
                            await ph.halt();
                            await ph.return({});
                        });
                    });
                });

                describe("changeType", function () {
                    describe("conversion", function () {
                        it("Should infer move via type change", async function () {
                            sh.initActive("p1");
                            const mon = sh.initActive("p2");

                            pctx = init("p2");
                            await moveEvent("p2", "conversion");
                            // Changes into a water type, meaning the pokemon
                            // must have a water type move.
                            await ph.handle({
                                args: [
                                    "-start",
                                    toIdent("p2"),
                                    toEffectName("typechange"),
                                    toTypes("water"),
                                ],
                                kwArgs: {},
                            });

                            // One move slot left to infer after conversion.
                            mon.moveset.reveal("tackle");
                            mon.moveset.reveal("takedown");

                            // One of the moves can be either fire or water
                            // type.
                            expect(mon.moveset.get("ember")).to.be.null;
                            expect(mon.moveset.get("watergun")).to.be.null;

                            // Add another constraint to consume the conversion
                            // constraint.
                            mon.moveset.addMoveSlotConstraint([
                                "ember",
                                "watergun",
                            ]);
                            expect(mon.moveset.moveSlotConstraints).to.be.empty;
                            expect(mon.moveset.get("ember")).to.be.null;
                            expect(mon.moveset.get("watergun")).to.not.be.null;
                        });
                    });
                });

                describe("disableMove", function () {
                    it("Should pass if expected", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "disable");
                        await ph.handle({
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("disable", "move"),
                                toMoveName("splash"),
                            ],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should reject if not expected", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "tackle");
                        await ph.reject({
                            args: [
                                "-start",
                                toIdent("p1"),
                                toEffectName("disable", "move"),
                                toMoveName("splash"),
                            ],
                            kwArgs: {},
                        });
                        await ph.return({});
                    });
                });
            });

            describe("implicit effects", function () {
                // TODO: Track in dex.MoveData.
                describe("naturalgift move", function () {
                    it("Should infer berry if successful", async function () {
                        sh.initActive("p1"); // To appease pressure check.
                        const mon = sh.initActive("p2");
                        const {item} = mon;

                        pctx = init("p2");
                        await moveEvent("p2", "naturalgift");
                        await ph.halt();
                        await ph.return({});

                        expect(mon.lastItem).to.equal(
                            item,
                            "Item was not consumed",
                        );
                        expect(mon.lastItem.possibleValues).to.have.keys(
                            ...Object.keys(dex.berries),
                        );
                    });

                    it("Should infer no berry if failed", async function () {
                        sh.initActive("p1");
                        const mon = sh.initActive("p2");
                        const {item} = mon;

                        pctx = init("p2");
                        await moveEvent("p2", "naturalgift");
                        await ph.handle({
                            args: ["-fail", toIdent("p2")],
                            kwArgs: {},
                        });
                        await ph.return({});
                        expect(mon.item).to.equal(item, "Item was consumed");
                        expect(mon.item.possibleValues).to.not.have.any.keys(
                            ...Object.keys(dex.berries),
                        );
                    });
                });

                describe("status", function () {
                    function testImplicitStatusEffect(
                        name: string,
                        move: string,
                        event: Event,
                        getter: (mon: ReadonlyPokemon) => boolean,
                    ): void {
                        describe(name, function () {
                            it(`Should set if using ${move}`, async function () {
                                const mon = sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.handle(event);
                                await ph.halt();
                                await ph.return({});
                                expect(getter(mon)).to.be.true;
                            });

                            it(`Should not set if ${move} failed`, async function () {
                                const mon = sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p1");
                                await moveEvent("p1", move);
                                await ph.handle({
                                    args: ["-fail", toIdent("p1")],
                                    kwArgs: {},
                                });
                                await ph.halt();
                                await ph.return({});
                                expect(getter(mon)).to.be.false;
                            });
                        });
                    }
                    testImplicitStatusEffect(
                        "defensecurl",
                        "defensecurl",
                        {
                            args: ["-boost", toIdent("p1"), "def", toNum(1)],
                            kwArgs: {},
                        },
                        mon => mon.volatile.defensecurl,
                    );
                    testImplicitStatusEffect(
                        "minimize",
                        "minimize",
                        {
                            args: [
                                "-boost",
                                toIdent("p1"),
                                "evasion",
                                toNum(1),
                            ],
                            kwArgs: {},
                        },
                        mon => mon.volatile.minimize,
                    );
                    testImplicitStatusEffect(
                        "mustRecharge",
                        "hyperbeam",
                        {
                            args: ["-damage", toIdent("p2"), toHPStatus(1)],
                            kwArgs: {},
                        },
                        mon => mon.volatile.mustRecharge,
                    );

                    function testLockingMoves<T extends string>(
                        name: string,
                        keys: readonly T[],
                        getter: (
                            mon: ReadonlyPokemon,
                        ) => ReadonlyVariableTempStatus<T>,
                        resetOnMiss?: boolean,
                    ): void {
                        describe(name, function () {
                            keys.forEach(move =>
                                describe(move, function () {
                                    async function initLock(): Promise<
                                        ReadonlyVariableTempStatus<T>
                                    > {
                                        // Execute the move once to set
                                        // lockedmove status.
                                        sh.initActive("p1");
                                        const vts = getter(sh.initActive("p2"));
                                        expect(vts.isActive).to.be.false;

                                        pctx = init("p2");
                                        await moveEvent("p2", move);
                                        await ph.halt();
                                        await ph.return({});
                                        state.postTurn();
                                        expect(vts.isActive).to.be.true;
                                        expect(vts.type).to.equal(move);
                                        expect(vts.turns).to.equal(0);
                                        return vts;
                                    }

                                    it("Should set if successful", initLock);

                                    const resetOnMissWord = resetOnMiss
                                        ? ""
                                        : "not ";

                                    it(`Should ${resetOnMissWord}reset if missed`, async function () {
                                        const vts = await initLock();

                                        pctx = init("p2");
                                        await moveEvent("p2", move);
                                        await ph.handle({
                                            args: [
                                                "-miss",
                                                toIdent("p2"),
                                                toIdent("p1"),
                                            ],
                                            kwArgs: {},
                                        });
                                        await ph.return({});
                                        expect(
                                            vts.isActive,
                                        ).to.be[resetOnMiss ? "false" : "true"];
                                    });

                                    it(`Should ${resetOnMissWord}reset if opponent protected`, async function () {
                                        const vts = await initLock();

                                        pctx = init("p2");
                                        await moveEvent("p2", move);
                                        await ph.handle({
                                            args: [
                                                "-activate",
                                                toIdent("p1"),
                                                toEffectName("protect", "move"),
                                            ],
                                            kwArgs: {},
                                        });
                                        await ph.return({});
                                        expect(
                                            vts.isActive,
                                        ).to.be[resetOnMiss ? "false" : "true"];
                                    });

                                    it("Should not reset if opponent endured", async function () {
                                        const vts = await initLock();

                                        pctx = init("p2");
                                        await moveEvent("p2", move);
                                        await ph.handle({
                                            args: [
                                                "-activate",
                                                toIdent("p1"),
                                                toEffectName("endure", "move"),
                                            ],
                                            kwArgs: {},
                                        });
                                        await ph.halt();
                                        await ph.return({});
                                        expect(vts.isActive).to.be.true;
                                    });

                                    it("Should not consume pp if used consecutively", async function () {
                                        const vts = await initLock();

                                        pctx = init("p2");
                                        await moveEvent("p2", move);
                                        await ph.halt();
                                        await ph.return({});
                                        expect(vts.isActive).to.be.true;
                                        expect(vts.turns).to.equal(1);

                                        const m = state
                                            .getTeam("p2")
                                            .active.moveset.get(move)!;
                                        expect(m).to.not.be.null;
                                        expect(m.pp).to.equal(m.maxpp - 1);
                                    });
                                }),
                            );
                        });
                    }
                    testLockingMoves(
                        "rampage moves",
                        dex.lockedMoveKeys,
                        mon => mon.volatile.lockedMove,
                    );
                    testLockingMoves(
                        "momentum moves",
                        dex.rolloutKeys,
                        mon => mon.volatile.rollout,
                        true /*resetOnMiss*/,
                    );
                });

                describe("team", function () {
                    function testImplicitTeamEffect(
                        name: string,
                        move: string,
                        getter: (team: ReadonlyTeam) => boolean,
                    ): void {
                        describe(name, function () {
                            it(`Should set if using ${move}`, async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p2");
                                await moveEvent("p2", move);
                                await ph.halt();
                                await ph.return({});
                                expect(getter(state.getTeam("p2"))).to.be.true;
                            });

                            it(`Should not set if ${move} failed`, async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p2");
                                await moveEvent("p2", move);
                                await ph.handle({
                                    args: ["-fail", toIdent("p2")],
                                    kwArgs: {},
                                });
                                await ph.halt();
                                await ph.return({});
                                expect(getter(state.getTeam("p2"))).to.be.false;
                            });
                        });
                    }
                    testImplicitTeamEffect(
                        "wish",
                        "wish",
                        team => team.status.wish.isActive,
                    );

                    // Healingwish/lunardance.
                    const faintWishMoves = [
                        ["healingwish", "healingwish"],
                        ["lunardance", "lunardance"],
                    ] as const;
                    for (const [effect, move] of faintWishMoves) {
                        describe(effect, function () {
                            it("Should handle faint/selfSwitch effects", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2", undefined, 2 /*size*/);
                                const team = state.getTeam("p2");

                                // Use wishing move to faint user.
                                pctx = init("p2");
                                await moveEvent("p2", move);
                                await ph.handle({
                                    args: ["faint", toIdent("p2")],
                                    kwArgs: {},
                                });
                                // Wait for opponent to choose replacement.
                                // Note(gen4): Replacement is sent out
                                // immediately.
                                await ph.handle({
                                    args: [
                                        "request",
                                        toRequestJSON({
                                            requestType: "wait",
                                            rqid: 1,
                                            side: undefined,
                                        }),
                                    ],
                                    kwArgs: {},
                                });
                                expect(team.status[effect]).to.be.true;

                                // Replacement is sent.
                                await ph.handle({
                                    args: [
                                        "switch",
                                        toIdent("p2", ditto),
                                        toDetails(ditto),
                                        toHPStatus(100),
                                    ],
                                    kwArgs: {},
                                });
                                // Replacement is healed.
                                // Note (gen4): Healing effect happens even if
                                // the recipient has full hp.
                                await ph.handle({
                                    args: [
                                        "-heal",
                                        toIdent("p2", ditto),
                                        toHPStatus(100, 100),
                                    ],
                                    kwArgs: {
                                        from: toEffectName(effect, "move"),
                                    },
                                });
                                await ph.halt();
                                await ph.return({});
                            });

                            it("Should not set if failed", async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");
                                const team = state.getTeam("p2");

                                pctx = init("p2");
                                await moveEvent("p2", move);
                                await ph.handle({
                                    args: ["-fail", toIdent("p2")],
                                    kwArgs: {},
                                });
                                await ph.halt();
                                await ph.return({});
                                expect(team.status[effect]).to.be.false;
                            });
                        });
                    }
                });
            });

            describe("faint", function () {
                it("Should cancel hit move effects", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2");

                    // 100% unboost chance.
                    pctx = init("p2");
                    await moveEvent("p2", "rocktomb");
                    // Target fainted before we could apply the effect.
                    await ph.handle({
                        args: ["-damage", toIdent("p1"), toHPStatus("faint")],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["faint", toIdent("p1")],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return({});
                });

                it("Should cancel item update effects", async function () {
                    sh.initActive("p1");
                    sh.initActive("p2").item.narrow("sitrusberry");

                    pctx = init("p1");
                    await moveEvent("p1", "tackle");
                    await ph.handle({
                        args: ["-damage", toIdent("p2"), toHPStatus("faint")],
                        kwArgs: {},
                    });
                    await ph.handle({
                        args: ["faint", toIdent("p2")],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return({});
                });

                describe("self-faint effect", function () {
                    it("Should pass self-faint move", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "explosion");
                        await ph.handle({
                            args: [
                                "-damage",
                                toIdent("p1"),
                                toHPStatus("faint"),
                            ],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: ["faint", toIdent("p1")],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: ["faint", toIdent("p2")],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should throw if no self-faint", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "explosion");
                        await ph.handle({
                            args: [
                                "-damage",
                                toIdent("p1"),
                                toHPStatus("faint"),
                            ],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: ["faint", toIdent("p1")],
                            kwArgs: {},
                        });
                        await ph.haltError(
                            Error,
                            "Pokemon [p2] haven't fainted yet",
                        );
                    });

                    it("Should ignore item-movePostDamage", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2").setItem("lifeorb");

                        pctx = init("p2");
                        await moveEvent("p2", "explosion");
                        await ph.handle({
                            args: [
                                "-damage",
                                toIdent("p1"),
                                toHPStatus("faint"),
                            ],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: ["faint", toIdent("p1")],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: ["faint", toIdent("p2")],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });
                });
            });

            describe("final effects", function () {
                describe("recoil", function () {
                    // Can have swiftswim or rockhead.
                    const relicanth: SwitchOptions = {
                        species: "relicanth",
                        level: 83,
                        gender: "F",
                        hp: 302,
                        hpMax: 302,
                    };

                    it("Should pass if expected", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "bravebird");
                        await moveDamage("p1", 1);
                        await moveDamage("p2", 99, 100, {
                            from: toEffectName("recoil"),
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should still pass if hp diff is 0", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "bravebird");
                        await moveDamage("p1", 1);
                        // Corner case for certain recoil damage calcs.
                        await moveDamage("p2", 100, 100, {
                            from: toEffectName("recoil"),
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should reject if not expected", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "gust");
                        await ph.reject({
                            args: [
                                "-damage",
                                toIdent("p2"),
                                toHPStatus("faint"),
                            ],
                            kwArgs: {from: toEffectName("recoil")},
                        });
                        await ph.return({});
                    });

                    function testRecoil(
                        name: string,
                        pre: (mon: Pokemon) => void,
                        recoilEvent: boolean,
                        infer?: boolean | "throw",
                    ): void {
                        it(name, async function () {
                            sh.initActive("p2");
                            const mon = sh.initActive("p1", relicanth);
                            expect(
                                mon.traits.ability.possibleValues,
                            ).to.have.all.keys(["swiftswim", "rockhead"]);
                            pre?.(mon);

                            pctx = init("p1");
                            await moveEvent("p1", "doubleedge");
                            if (recoilEvent) {
                                await moveDamage("p1", 1, undefined, {
                                    from: toEffectName("recoil"),
                                });
                                await ph.halt();
                                await ph.return({});
                            }
                            if (infer === "throw") {
                                await ph.haltError(
                                    Error,
                                    "Move doubleedge user 'p1' suppressed " +
                                        "recoil through an ability but " +
                                        "ability is suppressed",
                                );
                                return;
                            }
                            if (!recoilEvent) {
                                await ph.halt();
                                await ph.return({});
                            }

                            if (infer === true) {
                                expect(
                                    mon.traits.ability.possibleValues,
                                ).to.have.all.keys(["rockhead"]);
                                expect(mon.ability).to.equal("rockhead");
                            } else if (infer === false) {
                                expect(
                                    mon.traits.ability.possibleValues,
                                ).to.have.all.keys(["swiftswim"]);
                                expect(mon.ability).to.equal("swiftswim");
                            } else {
                                expect(
                                    mon.traits.ability.possibleValues,
                                ).to.have.all.keys(["swiftswim", "rockhead"]);
                                expect(mon.ability).to.be.empty;
                            }
                        });
                    }
                    testRecoil(
                        "Should infer no recoil-canceling ability if recoil " +
                            "event",
                        () => {},
                        true,
                        false,
                    );
                    testRecoil(
                        "Should not infer ability if suppressed and recoil " +
                            "event",
                        mon => (mon.volatile.suppressAbility = true),
                        true,
                    );
                    testRecoil(
                        "Should infer recoil-canceling ability if no recoil " +
                            "event",
                        () => {},
                        false,
                        true,
                    );
                    testRecoil(
                        "Should throw if ability suppressed and no recoil " +
                            "event",
                        mon => (mon.volatile.suppressAbility = true),
                        false,
                        "throw",
                    );

                    it("Should handle Struggle move recoil ignoring recoil-blocking abilities", async function () {
                        sh.initActive("p1").setAbility("rockhead");
                        sh.initActive("p2");

                        pctx = init("p1");
                        await moveEvent("p1", "struggle");
                        await moveDamage("p2", 50);
                        // Recoil-blocking abilities don't work with struggle.
                        await moveDamage("p1", 50, undefined, {
                            from: toEffectName("recoil"),
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should faint user after target", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "doubleedge");
                        await ph.handle({
                            args: [
                                "-damage",
                                toIdent("p1"),
                                toHPStatus("faint"),
                            ],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: ["faint", toIdent("p1")],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: [
                                "-damage",
                                toIdent("p2"),
                                toHPStatus("faint"),
                            ],
                            kwArgs: {from: toEffectName("recoil")},
                        });
                        await ph.handle({
                            args: ["faint", toIdent("p2")],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });
                });

                describe("on-movePostDamage items (lifeorb)", function () {
                    it("Should handle", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p1");
                        await moveEvent("p1", "swift");
                        await moveDamage("p2", 50);
                        await moveDamage("p1", 90, undefined, {
                            from: toEffectName("lifeorb", "item"),
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should reject if inappropriate move", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        // Fixed-damage moves don't activate lifeorb.
                        pctx = init("p1");
                        await moveEvent("p1", "seismictoss");
                        await moveDamage("p2", 50);
                        await ph.reject({
                            args: ["-damage", toIdent("p1"), toHPStatus(90)],
                            kwArgs: {from: toEffectName("lifeorb", "item")},
                        });
                        await ph.return({});
                    });

                    it("Should faint user after target", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "ember");
                        await ph.handle({
                            args: [
                                "-damage",
                                toIdent("p1"),
                                toHPStatus("faint"),
                            ],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: ["faint", toIdent("p1")],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: [
                                "-damage",
                                toIdent("p2"),
                                toHPStatus("faint"),
                            ],
                            kwArgs: {from: toEffectName("lifeorb", "item")},
                        });
                        await ph.handle({
                            args: ["faint", toIdent("p2")],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });
                });

                describe("transform", function () {
                    it("Should handle", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "transform");
                        await ph.handle({
                            args: ["-transform", toIdent("p2"), toIdent("p1")],
                            kwArgs: {},
                        });
                        await ph.return({});
                    });

                    it("Should reject if user/source mismatch", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "transform");
                        await ph.rejectError(
                            {
                                args: [
                                    "-transform",
                                    toIdent("p1"),
                                    toIdent("p2"),
                                ],
                                kwArgs: {},
                            },
                            Error,
                            "Transform effect failed: " +
                                "Expected source 'p2' but got 'p1'",
                        );
                    });
                });

                describe("self-switch", function () {
                    // TODO: Track phazing moves.
                    // TODO: Handle all throw cases.
                    it("Should accept if self-switch expected", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2", undefined, 2 /*size*/);

                        pctx = init("p2");
                        await moveEvent("p2", "batonpass");
                        await ph.handle({
                            args: [
                                "request",
                                toRequestJSON({
                                    requestType: "wait",
                                    rqid: 0,
                                    side: undefined,
                                }),
                            ],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: [
                                "switch",
                                toIdent("p2", ditto),
                                toDetails(ditto),
                                toHPStatus(100),
                            ],
                            kwArgs: {},
                        });
                        await ph.halt();
                        await ph.return({});
                    });

                    it("Should cancel effect if game-over", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p1");
                        await moveEvent("p1", "uturn");
                        await ph.handle({
                            args: [
                                "-damage",
                                toIdent("p2"),
                                toHPStatus("faint"),
                            ],
                            kwArgs: {},
                        });
                        await ph.handle({
                            args: ["faint", toIdent("p2")],
                            kwArgs: {},
                        });
                        await ph.reject({
                            args: ["win", toUsername(state.username)],
                            kwArgs: {},
                        });
                        await ph.return({});
                    });

                    it("Should reject if no self-switch expected", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "splash");
                        await ph.handle({
                            args: [
                                "-activate",
                                "",
                                toEffectName("splash", "move"),
                            ],
                            kwArgs: {},
                        });
                        await ph.reject({
                            args: [
                                "request",
                                toRequestJSON({
                                    requestType: "wait",
                                    rqid: 0,
                                    side: undefined,
                                }),
                            ],
                            kwArgs: {},
                        });
                        await ph.return({});
                    });

                    it("Should throw if self-switch expected but opponent switched", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "uturn");
                        await ph.handle({
                            args: [
                                "request",
                                toRequestJSON({
                                    requestType: "wait",
                                    rqid: 0,
                                    side: undefined,
                                }),
                            ],
                            kwArgs: {},
                        });
                        await ph.rejectError(
                            {
                                args: [
                                    "switch",
                                    toIdent("p1", ditto),
                                    toDetails(ditto),
                                    toHPStatus(100),
                                ],
                                kwArgs: {},
                            },
                            Error,
                            "Expected switch-in for 'p2' but got 'p1'",
                        );
                    });

                    // Note: other effects (e.g. naturalcure) including this one
                    // should already be covered by switch tests.
                    // This is just an example of how one of these cases could
                    // be composed.
                    it("Should handle switch intercept (pursuit)", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2", undefined, 2 /*size*/);

                        pctx = init("p2");
                        await moveEvent("p2", "uturn");
                        // Wait for opponent to choose switch-in.
                        await ph.handle({
                            args: [
                                "request",
                                toRequestJSON({
                                    requestType: "wait",
                                    rqid: 0,
                                    side: undefined,
                                }),
                            ],
                            kwArgs: {},
                        });
                        // Pursuit activates before switching.
                        await ph.handle({
                            args: [
                                "-activate",
                                toIdent("p2"),
                                toEffectName("pursuit", "move"),
                            ],
                            kwArgs: {},
                        });
                        await moveEvent("p1", "pursuit", {
                            from: toMoveName("pursuit"),
                        });
                        await moveDamage("p2", 60);
                        // Actual switch happens afterwards.
                        await ph.handle({
                            args: [
                                "switch",
                                toIdent("p2", ditto),
                                toDetails(ditto),
                                toHPStatus(100),
                            ],
                            kwArgs: {},
                        });
                        await ph.halt();
                        // Should indicate that p1 spent its action interrupting
                        // the self-switch.
                        await ph.return({actioned: {p1: true}});
                    });
                });

                describe("call", function () {
                    /** Tackle event from `p2` side. */
                    const tackle: Event<"|move|"> = {
                        args: ["move", toIdent("p2"), toMoveName("tackle")],
                        kwArgs: {},
                    };

                    it("Should reject if no call effect expected", async function () {
                        sh.initActive("p1");
                        sh.initActive("p2");

                        pctx = init("p2");
                        await moveEvent("p2", "tackle");
                        await ph.reject(tackle);
                        await ph.return({});
                    });

                    // Extract self+target move-callers.
                    const copycatCallers: string[] = [];
                    const mirrorCallers: string[] = [];
                    const selfMoveCallers: string[] = [];
                    const targetMoveCallers: string[] = [];
                    const otherCallers: string[] = [];
                    for (const move of Object.keys(dex.moveCallers)) {
                        const effect = dex.moveCallers[move];
                        if (effect === "copycat") copycatCallers.push(move);
                        else if (effect === "mirror") mirrorCallers.push(move);
                        else if (effect === "self") selfMoveCallers.push(move);
                        else if (effect === "target")
                            targetMoveCallers.push(move);
                        else otherCallers.push(move);
                    }

                    describe("other move-callers", function () {
                        for (const caller of otherCallers) {
                            it(`Should handle ${caller}`, async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");

                                pctx = init("p2");
                                await moveEvent("p2", caller);
                                await ph.handle({
                                    ...tackle,
                                    kwArgs: {from: toMoveName(caller)},
                                });
                                await ph.halt();
                                await ph.return({});
                            });
                        }
                    });

                    describe("copycat effect", function () {
                        it("Should track last used move", async function () {
                            sh.initActive("p1");
                            sh.initActive("p2");
                            expect(state.status.lastMove).to.not.be.ok;

                            await moveSplash("p2");
                            expect(state.status.lastMove).to.equal("splash");
                        });

                        for (const caller of copycatCallers) {
                            it(`Should pass if using ${caller} and move matches`, async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");
                                state.status.lastMove = "tackle";

                                pctx = init("p2");
                                await moveEvent("p2", caller);
                                await ph.handle({
                                    ...tackle,
                                    kwArgs: {from: toMoveName(caller)},
                                });
                                await ph.halt();
                                await ph.return({});
                            });

                            it(`Should throw if using ${caller} and mismatched move`, async function () {
                                sh.initActive("p1");
                                sh.initActive("p2");
                                state.status.lastMove = "watergun";

                                pctx = init("p2");
                                await moveEvent("p2", caller);
                                await ph.rejectError(
                                    {
                                        ...tackle,
                                        kwArgs: {from: toMoveName(caller)},
                                    },
                                    Error,
                                    "Call effect 'copycat' failed: " +
                                        "Should've called 'watergun' but got " +
                                        "'tackle'",
                                );
                            });
                        }
                    });

                    describe("mirrormove effect", function () {
                        it("Should track if targeted", async function () {
                            const us = sh.initActive("p1");
                            sh.initActive("p2");
                            expect(us.volatile.mirrormove).to.be.null;

                            pctx = init("p2");
                            await moveEvent("p2", "tackle");
                            await ph.halt();
                            await ph.return({});
                            expect(us.volatile.mirrormove).to.equal("tackle");
                        });

                        it("Should track on continued rampage", async function () {
                            const us = sh.initActive("p1");
                            const them = sh.initActive("p2");
                            them.volatile.lockedMove.start("petaldance");
                            them.volatile.lockedMove.tick();
                            expect(us.volatile.mirrormove).to.be.null;

                            pctx = init("p2");
                            await moveEvent("p2", "petaldance");
                            await ph.halt();
                            await ph.return({});
                            expect(us.volatile.mirrormove).to.equal(
                                "petaldance",
                            );
                        });

                        it("Should track only on two-turn release turn", async function () {
                            const us = sh.initActive("p1");
                            sh.initActive("p2");
                            us.volatile.mirrormove = "previous"; // Test value.

                            // Start a two-turn move.
                            pctx = init("p2");
                            await moveEvent("p2", "fly", {still: true});
                            await prepareEvent("p2", "fly");
                            await ph.halt();
                            await ph.return({});
                            // Shouldn't count the charging turn.
                            expect(us.volatile.mirrormove).to.equal("previous");

                            state.postTurn();
                            state.preTurn();

                            // Release the two-turn move.
                            expect(us.volatile.mirrormove).to.equal("previous");
                            pctx = init("p2");
                            await moveEvent("p2", "fly", {
                                from: toEffectName("lockedmove"),
                            });
                            await ph.halt();
                            await ph.return({});
                            // Shouldn't count on the release turn.
                            expect(us.volatile.mirrormove).to.equal("fly");
                        });

                        it("Should still track on called two-turn release turn", async function () {
                            const us = sh.initActive("p1");
                            sh.initActive("p2");
                            us.volatile.mirrormove = "previous"; // Test value.

                            // Call a two-turn move to prepare it.
                            pctx = init("p2");
                            await moveEvent("p2", otherCallers[0]);
                            await moveEvent("p2", "fly", {
                                from: toMoveName(otherCallers[0]),
                                still: true,
                            });
                            await prepareEvent("p2", "fly");
                            await ph.halt();
                            await ph.return({});
                            expect(us.volatile.mirrormove).to.equal("previous");

                            // Release the called two-turn move.
                            pctx = init("p2");
                            await moveEvent("p2", "fly", {
                                from: toEffectName("lockedmove"),
                            });
                            await ph.halt();
                            await ph.return({});
                            expect(us.volatile.mirrormove).to.equal("fly");
                        });

                        it("Should not track if not targeted", async function () {
                            const us = sh.initActive("p1");
                            sh.initActive("p2");
                            us.volatile.mirrormove = "previous"; // Test value.

                            // Move that can't target opponent.
                            await moveSplash("p2");
                            expect(us.volatile.mirrormove).to.equal("previous");
                        });

                        it("Should not track if move can't be mirrored", async function () {
                            const us = sh.initActive("p1");
                            sh.initActive("p2");
                            us.volatile.mirrormove = "previous"; // Test value.

                            // Move that can't be mirrored but targets opponent.
                            pctx = init("p2");
                            await moveEvent("p2", "feint");
                            await ph.halt();
                            await ph.return({});
                            expect(us.volatile.mirrormove).to.equal("previous");
                        });

                        it("Should not track if targeted by a called move", async function () {
                            const us = sh.initActive("p1");
                            sh.initActive("p2");
                            us.volatile.mirrormove = "previous"; // Test value.

                            // Call a move.
                            pctx = init("p2");
                            await moveEvent("p2", otherCallers[0]);
                            await ph.handle({
                                ...tackle,
                                kwArgs: {from: toMoveName(otherCallers[0])},
                            });
                            await ph.halt();
                            await ph.return({});
                            expect(us.volatile.mirrormove).to.equal("previous");
                        });

                        for (const [name, moveId] of [
                            ["lockedMove", "thrash"],
                            ["rollout", "rollout"],
                        ] as const) {
                            it(`Should not track on called ${name} move`, async function () {
                                const us = sh.initActive("p1");
                                const them = sh.initActive("p2");
                                // Test value.
                                us.volatile.mirrormove = "previous";

                                // Call a move.
                                pctx = init("p2");
                                await moveEvent("p2", otherCallers[0]);
                                await moveEvent("p2", moveId, {
                                    from: toMoveName(otherCallers[0]),
                                });
                                await ph.halt();
                                await ph.return({});
                                expect(them.volatile[name].isActive).to.be.true;
                                expect(them.volatile[name].type).to.equal(
                                    moveId,
                                );
                                expect(them.volatile[name].called).to.be.true;
                                // Shouldn't update.
                                expect(us.volatile.mirrormove).to.equal(
                                    "previous",
                                );

                                state.postTurn();
                                state.preTurn();

                                // Continue the rampage/momentum on the next
                                // turn.
                                pctx = init("p2");
                                await moveEvent("p2", moveId, {
                                    from: toEffectName("lockedmove"),
                                });
                                await ph.halt();
                                await ph.return({});
                                expect(them.volatile[name].isActive).to.be.true;
                                expect(them.volatile[name].type).to.equal(
                                    moveId,
                                );
                                expect(them.volatile[name].called).to.be.true;
                                // Still shouldn't update.
                                expect(us.volatile.mirrormove).to.equal(
                                    "previous",
                                );
                            });
                        }

                        for (const caller of mirrorCallers) {
                            it(`Should pass if using ${caller} and move matches`, async function () {
                                sh.initActive("p1");
                                const them = sh.initActive("p2");
                                them.volatile.mirrormove = "tackle";

                                pctx = init("p2");
                                await moveEvent("p2", caller);
                                await ph.handle({
                                    ...tackle,
                                    kwArgs: {from: toMoveName(caller)},
                                });
                                await ph.halt();
                                await ph.return({});
                            });

                            it(`Should throw if using ${caller} and mismatched move`, async function () {
                                sh.initActive("p1");
                                const them = sh.initActive("p2");
                                them.volatile.mirrormove = "watergun";

                                pctx = init("p2");
                                await moveEvent("p2", caller);
                                await ph.rejectError(
                                    tackle,
                                    Error,
                                    "Call effect 'mirror' failed: " +
                                        "Should've called 'watergun' but got " +
                                        "'tackle'",
                                );
                            });
                        }
                    });

                    describe("self move-callers (sleeptalk)", function () {
                        for (const caller of selfMoveCallers) {
                            it(`Should infer user's move when using ${caller}`, async function () {
                                sh.initActive("p1");
                                const them = sh.initActive("p2");

                                // Use the move-caller.
                                pctx = init("p2");
                                await moveEvent("p2", caller);
                                // Call the move.
                                await ph.handle({
                                    ...tackle,
                                    kwArgs: {from: toMoveName(caller)},
                                });
                                await ph.halt();
                                await ph.return({});
                                // Shouldn't consume pp for the called move.
                                expect(them.moveset.get("tackle")).to.not.be
                                    .null;
                                expect(them.moveset.get("tackle")!.pp).to.equal(
                                    56,
                                );
                            });
                        }

                        it("Should reject if the call effect was ignored", async function () {
                            sh.initActive("p1");
                            const them = sh.initActive("p2");

                            pctx = init("p2");
                            await moveEvent("p2", selfMoveCallers[0]);
                            await ph.rejectError(
                                {
                                    args: [
                                        "move",
                                        toIdent("p1"),
                                        toMoveName("tackle"),
                                    ],
                                    kwArgs: {
                                        from: toMoveName(selfMoveCallers[0]),
                                    },
                                },
                                Error,
                                "Call effect 'self' failed: Expected 'p2' " +
                                    "but got 'p1'",
                            );
                            expect(them.moveset.get("tackle")).to.be.null;
                        });
                    });

                    describe("target move-callers (mefirst)", function () {
                        for (const caller of targetMoveCallers) {
                            it(`Should infer target's move when using ${caller}`, async function () {
                                // Switch in a pokemon that has the move-caller.
                                const us = sh.initActive("p1");
                                const them = sh.initActive("p2");

                                // Use the move-caller.
                                pctx = init("p1");
                                await moveEvent("p1", caller);
                                await ph.handle({
                                    args: [
                                        "move",
                                        toIdent("p1"),
                                        toMoveName("tackle"),
                                    ],
                                    kwArgs: {from: toMoveName(caller)},
                                });
                                await ph.halt();
                                await ph.return({});
                                expect(us.moveset.get("tackle")).to.be.null;
                                expect(them.moveset.get("tackle")).to.not.be
                                    .null;
                                // Shouldn't consume pp for the called move.
                                expect(them.moveset.get("tackle")!.pp).to.equal(
                                    56,
                                );
                            });
                        }

                        it("Should throw if the call effect was ignored", async function () {
                            sh.initActive("p1");
                            const them = sh.initActive("p2");

                            pctx = init("p2");
                            await moveEvent("p2", targetMoveCallers[0]);
                            await ph.rejectError(
                                {
                                    args: [
                                        "move",
                                        toIdent("p1"),
                                        toMoveName("tackle"),
                                    ],
                                    kwArgs: {
                                        from: toMoveName(targetMoveCallers[0]),
                                    },
                                },
                                Error,
                                "Call effect 'target' failed: " +
                                    "Expected 'p2' but got 'p1'",
                            );
                            expect(them.moveset.get("tackle")).to.be.null;
                        });
                    });
                });
            });

            // TODO: Track ally move effects in dex.MoveData.
            describe("ally moves", function () {
                it("Should fail", async function () {
                    sh.initActive("p1");

                    pctx = init("p1");
                    await moveEvent("p1", "helpinghand");
                    await ph.handle({
                        args: ["-fail", toIdent("p1")],
                        kwArgs: {},
                    });
                    await ph.halt();
                    await ph.return({});
                });
            });

            describe("pressure ability handling", function () {
                let us: Pokemon;

                beforeEach("Setup pressure mon", function () {
                    us = sh.initActive("p1");
                    us.setAbility("pressure");
                });

                it("Should use extra pp if targeted", async function () {
                    const {moveset} = sh.initActive("p2");

                    // Since "p1" wasn't mentioned, it will be inferred due to
                    // the targeting behavior of the move being used.
                    pctx = init("p2");
                    await moveEvent("p2", "tackle");
                    await ph.halt();
                    await ph.return({});
                    expect(moveset.get("tackle")!.pp).to.equal(54);
                });

                it("Should not use extra pp if not targeted", async function () {
                    const {moveset} = sh.initActive("p2");

                    await moveSplash("p2");
                    expect(moveset.get("splash")!.pp).to.equal(63);
                });

                it("Should not use extra pp if self target", async function () {
                    const mon = sh.initActive("p2");
                    mon.setAbility("pressure");

                    await moveSplash("p2");
                    expect(mon.moveset.get("splash")!.pp).to.equal(63);
                });

                it("Should not use extra pp if mold breaker", async function () {
                    const mon = sh.initActive("p2");
                    mon.setAbility("moldbreaker");

                    pctx = init("p2");
                    await moveEvent("p2", "tackle");
                    await ph.halt();
                    await ph.return({});
                    expect(mon.moveset.get("tackle")!.pp).to.equal(55);
                });
            });

            describe("target-damaged flag", function () {
                it("Should set damaged flag for target once hit", async function () {
                    const mon = sh.initActive("p1");
                    expect(mon.volatile.damaged).to.be.false;
                    sh.initActive("p2");

                    pctx = init("p2");
                    await moveEvent("p2", "tackle");
                    await moveDamage("p1", 50);
                    await ph.halt();
                    await ph.return({});
                    expect(mon.volatile.damaged).to.be.true;
                });
            });
        });
    });
