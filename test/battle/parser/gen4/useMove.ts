import { expect } from "chai";
import "mocha";
import * as dex from "../../../../src/battle/dex/dex";
import * as dexutil from "../../../../src/battle/dex/dex-util";
import * as effects from "../../../../src/battle/dex/effects";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { ParserState, SubParser } from
    "../../../../src/battle/parser/BattleParser";
import { useMove } from "../../../../src/battle/parser/gen4/useMove";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon, ReadonlyPokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { ReadonlyTeam } from "../../../../src/battle/state/Team";
import { ReadonlyVariableTempStatus } from
    "../../../../src/battle/state/VariableTempStatus";
import { ditto, smeargle } from "../../../helpers/switchOptions";
import { Context } from "./Context";
import { createParserHelpers } from "./helpers";

export function testUseMove(f: () => Context,
    initActive: (monRef: Side, options?: events.SwitchOptions) => Pokemon)
{
    let state: BattleState;
    let pstate: ParserState;
    let parser: SubParser;

    beforeEach("Extract Context", function()
    {
        ({state, pstate, parser} = f());
    });

    async function initParser(monRef: Side, move: string,
        called: boolean | "bounced" = false): Promise<SubParser>
    {
        parser = useMove(pstate, {type: "useMove", monRef, move}, called);
        // first yield doesn't return anything
        await expect(parser.next())
            .to.eventually.become({value: undefined, done: false});
        return parser;
    }

    const {handle, handleEnd, reject, exitParser} =
        createParserHelpers(() => parser);

    it("Should throw if unsupported move", async function()
    {
        await expect(initParser("us", "invalid"))
            .to.eventually.be.rejectedWith(Error, "Unsupported move 'invalid'");
    });

    describe("called = false", function()
    {
        it("Should reset single-move statuses", async function()
        {
            const {volatile: v} = initActive("us");
            v.destinyBond = true;
            await initParser("us", "tackle");
            expect(v.destinyBond).to.be.false;
        });

        it("Should reveal move and deduct pp", async function()
        {
            const {moveset, volatile} = initActive("us");
            expect(moveset.get("tackle")).to.be.null;
            expect(volatile.lastMove).to.be.null;
            await initParser("us", "tackle");

            expect(moveset.get("tackle")).to.not.be.null;
            expect(moveset.get("tackle")).to.have.property("pp", 55);
            expect(volatile.lastMove).to.equal("tackle");
        });

        it("Should not deduct pp if releasing two-turn move", async function()
        {
            const {moveset, volatile} = initActive("us");
            // assume pp was already deducted by preparing the move
            volatile.twoTurn.start("fly");

            // start a new turn
            state.postTurn();
            state.preTurn();

            // indicate that the two-turn move is being released
            await initParser("us", "fly");
            expect(volatile.twoTurn.isActive).to.be.false;
            // should not deduct pp or even reveal the move, assuming the
            //  the start turn was called by an effect in this case
            expect(moveset.get("fly")).to.be.null;
            // shouldn't set when releasing two-turn move
            expect(volatile.lastMove).to.be.null;
        });

        it("Should deduct pp if starting a different two-turn move",
        async function()
        {
            const {moveset, volatile} = initActive("us");
            // in the middle of preparing a two-turn move
            volatile.twoTurn.start("dig");

            // start a new turn
            state.postTurn();
            state.preTurn();

            // indicate that a different two-turn move is being started
            await initParser("us", "razorwind");
            expect(volatile.twoTurn.isActive).to.be.true;
            // should deduct pp
            expect(moveset.get("razorwind")).to.not.be.null;
            expect(moveset.get("razorwind")).to.have.property("pp", 15);
            expect(volatile.lastMove).to.equal("razorwind");
        });

        it("Should not deduct pp if continuing locked move", async function()
        {
            const {moveset, volatile} = initActive("us");
            // assume pp was already deducted by starting the move
            volatile.lockedMove.start("thrash");
            // indicate that the locked move is continuing
            await initParser("us", "thrash");
            expect(volatile.lockedMove.isActive).to.be.true;
            // should not deduct pp or even reveal
            expect(moveset.get("thrash")).to.be.null;
            // shouldn't set when continuing
            expect(volatile.lastMove).to.be.null;
        });

        it("Should deduct pp if starting a different locked move",
        async function()
        {
            const {moveset, volatile} = initActive("us");
            // in the middle of a locked move
            volatile.lockedMove.start("petaldance");
            // indicate that a different locked move is being used
            await initParser("us", "outrage");
            expect(volatile.lockedMove.isActive).to.be.true;
            // should deduct pp
            expect(moveset.get("outrage")).to.not.be.null;
            expect(moveset.get("outrage")).to.have.property("pp", 23);
            expect(volatile.lastMove).to.equal("outrage");
        });

        it("Should not deduct pp if continuing rollout move", async function()
        {
            const {moveset, volatile} = initActive("us");
            // assume pp was already deducted by starting the move
            volatile.rollout.start("iceball");
            // indicate that the rollout move is continuing
            await initParser("us", "iceball");
            expect(volatile.rollout.isActive).to.be.true;
            // should not deduct pp or even reveal
            expect(moveset.get("iceball")).to.be.null;
            // shouldn't set when continuing
            expect(volatile.lastMove).to.be.null;
        });

        it("Should deduct pp if starting a different rollout move",
        async function()
        {
            const {moveset, volatile} = initActive("us");
            // in the middle of a locked move
            volatile.rollout.start("iceball");
            // indicate that a different locked move is being used
            await initParser("us", "rollout");
            expect(volatile.rollout.isActive).to.be.true;
            // should deduct pp
            expect(moveset.get("rollout")).to.not.be.null;
            expect(moveset.get("rollout")).to.have.property("pp", 31);
            expect(volatile.lastMove).to.equal("rollout");
        });

        it("Should not reveal move if struggle", async function()
        {
            const {moveset, volatile} = initActive("us");
            await initParser("us", "struggle");
            expect(moveset.get("struggle")).to.be.null;
            // should still set last move
            expect(volatile.lastMove).to.equal("struggle");
        });

        it("Should set choice item lock", async function()
        {
            const mon = initActive("us");
            mon.item.narrow("choicescarf");
            expect(mon.volatile.choiceLock).to.be.null;
            await initParser("us", "pound");
            expect(mon.volatile.choiceLock).to.equal("pound");
        });

        it("Should throw if using status move while Taunted", async function()
        {
            const mon = initActive("us");
            mon.volatile.taunt.start();
            await expect(initParser("us", "protect"))
                .to.eventually.be.rejectedWith(Error,
                    "Using status move 'protect' but should've been Taunted");
        });
    });

    describe("called = true", function()
    {
        it("Should not reset single-move statuses", async function()
        {
            const {volatile} = initActive("us");
            volatile.destinyBond = true;
            await initParser("us", "tackle", /*called*/true);
            expect(volatile.destinyBond).to.be.true;
        });

        it("Shoud not reveal move", async function()
        {
            const {moveset, volatile} = initActive("us");
            await initParser("us", "tackle", /*called*/true);
            expect(moveset.get("tackle")).to.be.null;
            expect(volatile.lastMove).to.be.null;
        });

        it("Should indicate called locked move", async function()
        {
            const {volatile} = initActive("us");
            initActive("them");
            await initParser("us", "thrash", /*called*/true);
            await exitParser();
            expect(volatile.lockedMove.isActive).to.be.true;
            expect(volatile.lockedMove.type).to.equal("thrash");
            expect(volatile.lockedMove.called).to.be.true;
            expect(volatile.lastMove).to.be.null;
        });

        it("Should indicate called rollout move", async function()
        {
            const {volatile} = initActive("us");
            initActive("them");
            await initParser("us", "iceball", /*called*/true);
            await exitParser();
            expect(volatile.rollout.isActive).to.be.true;
            expect(volatile.rollout.type).to.equal("iceball");
            expect(volatile.rollout.called).to.be.true;
            expect(volatile.lastMove).to.be.null;
        });
    });

    describe("activateItem", function()
    {
        it("Should accept if appropriate", async function()
        {
            initActive("us");
            initActive("them");
            await initParser("us", "swift");
            await handle({type: "takeDamage", monRef: "them", hp: 50});
            await handle({type: "activateItem", monRef: "us", item: "lifeorb"});
        });

        it("Should reject if inappropriate item", async function()
        {
            initActive("us");
            initActive("them");
            await initParser("us", "swift");
            await reject(
                {type: "activateItem", monRef: "us", item: "leftovers"});
        });

        it("Should reject if inappropriate move", async function()
        {
            initActive("us");
            await initParser("us", "splash");
            await reject({type: "activateItem", monRef: "us", item: "lifeorb"});
        });
    });

    describe("block", function()
    {
        it("Should cancel move effects", async function()
        {
            initActive("us");
            initActive("them").team!.status.safeguard.start();
            await initParser("us", "thunderwave");
            await handle({type: "block", monRef: "them", effect: "safeguard"});
            await exitParser();
        });

        describe("Substitute", function()
        {
            beforeEach("Initialize active and substitute", function()
            {
                initActive("us");
                initActive("them").volatile.substitute = true;
            });

            it("Should not throw if sub-ignoring move", async function()
            {
                await initParser("us", "torment");
                await handle(
                {
                    type: "activateStatusEffect", monRef: "them",
                    effect: "torment", start: true
                });
                await exitParser();
            });

            it("Should block hit status effects", async function()
            {
                await initParser("us", "zapcannon"); // hit status par
                await handle(
                    {type: "block", monRef: "them", effect: "substitute"});
                await exitParser();
            });

            it("Should block hit boost effects", async function()
            {
                await initParser("us", "rocktomb"); // hit boost spe -1
                await handle(
                    {type: "block", monRef: "them", effect: "substitute"});
                await exitParser();
            });

            it("Should not block self effects", async function()
            {
                await initParser("us", "leafstorm");
                await handle(
                    {type: "block", monRef: "them", effect: "substitute"});
                await handle(
                    {type: "boost", monRef: "us", stat: "spa", amount: -2});
                await exitParser();
            });

            it("Should not block self effects as Substitute ends",
            async function()
            {
                await initParser("us", "leafstorm");
                await handle(
                    {type: "block", monRef: "them", effect: "substitute"});
                await handle(
                {
                    type: "activateStatusEffect", monRef: "them",
                    effect: "substitute", start: false
                });
                await handle(
                    {type: "boost", monRef: "us", stat: "spa", amount: -2});
                await exitParser();
            });

            it("Should throw if non-sub-ignoring move ignores sub",
            async function()
            {
                await initParser("us", "tackle");
                await expect(handle(
                        {type: "takeDamage", monRef: "them", hp: 1}))
                    .to.eventually.be.rejectedWith(Error,
                        "Move should've been blocked by target's Substitute");
            });
        });
    });

    describe("fail", function()
    {
        it("Should cancel move effects", async function()
        {
            initActive("us");
            initActive("them");
            await initParser("us", "thunderwave");
            await handle({type: "fail"});
            await exitParser();
        });
    });

    describe("faint", function()
    {
        it("Should cancel hit move effects", async function()
        {
            initActive("us");
            initActive("them");
            // 100% unboost chance
            await initParser("them", "rocktomb");
            // target fainted before we could apply the effect
            await handle({type: "takeDamage", monRef: "us", hp: 0});
            await handle({type: "faint", monRef: "us"});
            await exitParser();
        });

        describe("selfFaint", function()
        {
            it("Should pass self-faint move", async function()
            {
                initActive("us");
                initActive("them");
                await initParser("them", "explosion");
                await handle({type: "takeDamage", monRef: "us", hp: 0});
                await handle({type: "faint", monRef: "us"});
                await handle({type: "faint", monRef: "them"});
                await exitParser();
            });

            it("Should throw if no self-faint", async function()
            {
                initActive("us");
                initActive("them");
                await initParser("them", "explosion");
                await handle({type: "takeDamage", monRef: "us", hp: 0});
                await handle({type: "faint", monRef: "us"});
                await expect(exitParser()).to.eventually.be.rejectedWith(Error,
                    "Pokemon [them] haven't fainted yet");
            });

            it("Should ignore item-postMoveDamage", async function()
            {
                initActive("us");
                initActive("them").setItem("lifeorb");
                await initParser("them", "explosion");
                await handle({type: "takeDamage", monRef: "us", hp: 0});
                await handle({type: "faint", monRef: "us"});
                await handle({type: "faint", monRef: "them"});
                await exitParser();
            });
        });
    });

    describe("immune", function()
    {
        it("Should cancel move effects", async function()
        {
            initActive("us");
            initActive("them");
            await initParser("us", "thunderwave");
            await handle({type: "immune", monRef: "them"});
            await exitParser();
        });
    });

    describe("halt", function()
    {
        it("Should reject if decide", async function()
        {
            initActive("us");
            await initParser("us", "splash");
            await reject({type: "halt", reason: "decide"});
        });

        it("Should reject if gameOver", async function()
        {
            initActive("us");
            await initParser("us", "splash");
            await reject({type: "halt", reason: "gameOver"});
        });
    });

    describe("noTarget", function()
    {
        it("Should cancel move effects", async function()
        {
            initActive("us");
            // this event can happen if the opponent fainted before we use a
            //  move against it
            initActive("them").faint();
            await initParser("us", "toxic");
            await handle({type: "noTarget", monRef: "us"});
            await exitParser();
        });
    });

    // TODO: add transform effect to Move effects
    describe("transform", function()
    {
        it("Should pass if user and source match", async function()
        {
            initActive("us");
            initActive("them");
            await initParser("them", "transform");
            await handle({type: "transform", source: "them", target: "us"});
            await exitParser();
        });

        it("Should reject if user/source mismatch", async function()
        {
            initActive("us");
            initActive("them");
            await initParser("them", "transform");
            await expect(handle(
                    {type: "transform", source: "us", target: "them"}))
                .to.eventually.be.rejectedWith(Error,
                    "Transform effect failed: " +
                    "Expected source 'them' but got 'us'");
        });
    });

    describe("Move effects", function()
    {
        describe("Primary", function()
        {
            describe("SelfSwitch", function()
            {
                // TODO: track phazing moves
                // TODO: handle all throw cases
                it("Should accept if self-switch expected", async function()
                {
                    initActive("them");
                    await initParser("them", "batonpass");
                    await handle({type: "halt", reason: "wait"});
                    await handleEnd(
                        {type: "switchIn", monRef: "them", ...ditto});
                });

                it("Should throw if no self-switch expected", async function()
                {
                    initActive("them");
                    await initParser("them", "splash");
                    await reject({type: "halt", reason: "wait"});
                });

                it("Should throw if self-switch expected but opponent " +
                    "switched",
                async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("them", "uturn");
                    await handle({type: "halt", reason: "wait"});
                    await expect(handle(
                            {type: "switchIn", monRef: "us", ...ditto}))
                        .to.eventually.be.rejectedWith(Error,
                            "SelfSwitch effect 'true' failed");
                });

                it("Should handle Pursuit", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("them", "uturn");
                    await handle({type: "halt", reason: "wait"});
                    await handle(
                        {type: "useMove", monRef: "us", move: "pursuit"});
                    await handleEnd(
                        {type: "switchIn", monRef: "them", ...ditto});
                });
            });

            describe("Delay", function()
            {
                describe("Future", function()
                {
                    it("Should handle future move", async function()
                    {
                        initActive("us");
                        initActive("them");
                        await initParser("them", "futuresight");
                        await handle(
                        {
                            type: "futureMove", monRef: "them",
                            move: "futuresight", start: true
                        });
                        await exitParser();
                    });

                    it("Should throw if mismatched move", async function()
                    {
                        initActive("us");
                        initActive("them");
                        await initParser("them", "futuresight");
                        await expect(handle(
                            {
                                type: "futureMove", monRef: "them",
                                move: "doomdesire", start: true
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "Future effect 'futuresight' failed: " +
                                "Expected 'futuresight' but got 'doomdesire'");
                    });

                    it("Should throw if start=false", async function()
                    {
                        initActive("us");
                        initActive("them");
                        await initParser("them", "futuresight");
                        await expect(handle(
                            {
                                type: "futureMove", monRef: "us",
                                move: "futuresight", start: false
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "Future effect 'futuresight' failed");
                    });
                });

                describe("Two-turn", function()
                {
                    it("Should handle two-turn move", async function()
                    {
                        // prepare
                        const mon = initActive("them");
                        const move = mon.moveset.reveal("fly");
                        expect(move.pp).to.equal(move.maxpp);
                        initActive("us");
                        await initParser("them", "fly");
                        await handle(
                        {
                            type: "prepareMove", monRef: "them", move: "fly"
                        });
                        await exitParser();
                        expect(move.pp).to.equal(move.maxpp - 1);

                        // release
                        mon.volatile.twoTurn.start("fly");
                        await initParser("them", "fly");
                        await exitParser();
                        expect(mon.volatile.twoTurn.isActive).to.be.false;
                        expect(move.pp).to.equal(move.maxpp - 1);
                    });

                    it("Should handle shortened two-turn move via sun",
                    async function()
                    {
                        const mon = initActive("them");
                        const move = mon.moveset.reveal("solarbeam");
                        expect(move.pp).to.equal(move.maxpp);
                        initActive("us");
                        state.status.weather.start(/*source*/ null, "SunnyDay");

                        // prepare
                        await initParser("them", "solarbeam");
                        await handle(
                        {
                            type: "prepareMove", monRef: "them",
                            move: "solarbeam"
                        });
                        expect(mon.volatile.twoTurn.isActive).to.be.true;

                        // release
                        await handle(
                            {type: "takeDamage", monRef: "us", hp: 10});
                        await exitParser();
                        expect(mon.volatile.twoTurn.isActive).to.be.false;
                        expect(move.pp).to.equal(move.maxpp - 1);
                    });

                    it("Should handle shortened two-turn move via powerherb",
                    async function()
                    {
                        const mon = initActive("them");
                        const move = mon.moveset.reveal("fly");
                        expect(move.pp).to.equal(move.maxpp);
                        mon.setItem("powerherb");
                        initActive("us");

                        // prepare
                        await initParser("them", "fly");
                        await handle(
                        {
                            type: "prepareMove", monRef: "them",
                            move: "fly"
                        });
                        expect(mon.volatile.twoTurn.isActive).to.be.true;

                        // consume item
                        await handle(
                        {
                            type: "removeItem", monRef: "them",
                            consumed: "powerherb"
                        });

                        // release
                        await handle(
                            {type: "takeDamage", monRef: "us", hp: 10});
                        await exitParser();
                        expect(mon.volatile.twoTurn.isActive).to.be.false;
                        expect(move.pp).to.equal(move.maxpp - 1);
                    });

                    it("Should throw if monRef mismatch", async function()
                    {
                        initActive("them");
                        initActive("us");
                        await initParser("them", "fly");
                        await expect(handle(
                            {
                                type: "prepareMove", monRef: "us", move: "fly"
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "TwoTurn effect 'fly' failed");
                    });

                    it("Should throw if mismatched prepareMove event",
                    async function()
                    {
                        initActive("them");
                        initActive("us");
                        await initParser("them", "fly");
                        await expect(handle(
                            {
                                type: "prepareMove", monRef: "them",
                                move: "bounce"
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "TwoTurn effect 'fly' failed: " +
                                "Expected 'fly' but got 'bounce'");
                    });
                });
            });

            describe("CallEffect", function()
            {
                /** Tackle from `them` side. */
                const tackle: events.UseMove =
                    {type: "useMove", monRef: "them", move: "tackle"};

                it("Should reject if no call effect expected", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("them", "tackle");
                    await reject(tackle);
                });

                // extract self+target move-callers
                const copycatCallers: string[] = [];
                const mirrorCallers: string[] = [];
                const selfMoveCallers: string[] = [];
                const targetMoveCallers: string[] = [];
                const otherCallers: string[] = [];
                for (const move of Object.keys(dex.moveCallers))
                {
                    const effect = dex.moveCallers[move];
                    if (effect === "copycat") copycatCallers.push(move);
                    else if (effect === "mirror") mirrorCallers.push(move);
                    else if (effect === "self") selfMoveCallers.push(move);
                    else if (effect === "target") targetMoveCallers.push(move);
                    else otherCallers.push(move);
                }

                describe("Move-callers", function()
                {
                    for (const caller of otherCallers)
                    {
                        it(`Should pass if using ${caller}`, async function()
                        {
                            initActive("us");
                            initActive("them");
                            await initParser("them", caller);
                            await handle(tackle);
                            await exitParser();
                        });
                    }
                });

                describe("Copycat callers", function()
                {
                    it("Should track last used move", async function()
                    {
                        initActive("them");
                        expect(state.status.lastMove).to.not.be.ok;
                        await initParser("them", "tackle");
                        expect(state.status.lastMove).to.equal("tackle");
                    });

                    for (const caller of copycatCallers)
                    {
                        it(`Should pass if using ${caller} and move matches`,
                        async function()
                        {
                            initActive("us");
                            initActive("them");
                            state.status.lastMove = "tackle";
                            await initParser("them", caller);
                            await handle(tackle);
                            await exitParser();
                        });

                        it(`Should throw if using ${caller} and mismatched ` +
                            "move",
                        async function()
                        {
                            initActive("them");
                            state.status.lastMove = "watergun";
                            await initParser("them", caller);
                            await expect(handle(tackle))
                                .to.eventually.be.rejectedWith(Error,
                                    "Call effect 'copycat' failed: " +
                                    "Should've called 'watergun' but got " +
                                    `'${tackle.move}'`);
                        });
                    }
                });

                describe("Mirror move-callers", function()
                {
                    it("Should track if targeted", async function()
                    {
                        const us = initActive("us");
                        initActive("them");

                        await initParser("them", "tackle");
                        expect(us.volatile.mirrorMove).to.be.null;
                        await exitParser();
                        expect(us.volatile.mirrorMove).to.equal("tackle");
                    });

                    it("Should track on continued rampage", async function()
                    {
                        const us = initActive("us");
                        const them = initActive("them");
                        them.volatile.lockedMove.start("petaldance");
                        them.volatile.lockedMove.tick();

                        await initParser("them", "petaldance");
                        expect(us.volatile.mirrorMove).to.be.null;
                        await exitParser();
                        expect(us.volatile.mirrorMove).to.equal("petaldance");
                    });

                    it("Should track on two-turn release turn", async function()
                    {
                        const us = initActive("us");
                        initActive("them");
                        us.volatile.mirrorMove = "previous"; // test value

                        // start a two-turn move
                        await initParser("them", "fly");
                        await handle(
                            {type: "prepareMove", monRef: "them", move: "fly"});
                        await exitParser();
                        // shouldn't count the charging turn
                        expect(us.volatile.mirrorMove).to.equal("previous");

                        // release the two-turn move
                        await initParser("them", "fly");
                        expect(us.volatile.mirrorMove).to.equal("previous");
                        await exitParser();
                        expect(us.volatile.mirrorMove).to.equal("fly");
                    });

                    it("Should track on called two-turn release turn",
                    async function()
                    {
                        const us = initActive("us");
                        initActive("them");
                        us.volatile.mirrorMove = "previous"; // test value

                        // call a two-turn move
                        await initParser("them", otherCallers[0]);
                        await handle(
                            {type: "useMove", monRef: "them", move: "fly"});
                        await handle(
                            {type: "prepareMove", monRef: "them", move: "fly"});
                        await exitParser();
                        expect(us.volatile.mirrorMove).to.equal("previous");

                        // release the two-turn move
                        await initParser("them", "fly");
                        await exitParser();
                        expect(us.volatile.mirrorMove).to.equal("fly");
                    });

                    it("Should not track if not targeted", async function()
                    {
                        const us = initActive("us");
                        initActive("them");
                        us.volatile.mirrorMove = "previous"; // test value
                        // move that can't target opponent
                        await initParser("them", "splash");
                        await exitParser();
                        expect(us.volatile.mirrorMove).to.equal("previous");
                    });

                    it("Should not track if non-mirror-able move",
                    async function()
                    {
                        const us = initActive("us");
                        initActive("them");
                        us.volatile.mirrorMove = "previous"; // test value
                        // move that can't be mirrored but targets opponent
                        await initParser("them", "feint");
                        await exitParser();
                        expect(us.volatile.mirrorMove).to.equal("previous");
                    });

                    it("Should not track if targeted by a called move",
                    async function()
                    {
                        const us = initActive("us");
                        initActive("them");
                        us.volatile.mirrorMove = "previous"; // test value

                        // call a move
                        await initParser("them", otherCallers[0]);
                        await handle(tackle);
                        await exitParser();

                        expect(us.volatile.mirrorMove).to.equal("previous");
                    });

                    for (const [name, move] of
                        [["lockedMove", "thrash"], ["rollout", "rollout"]] as
                            const)
                    {
                        it(`Should not track on called ${name} move`,
                        async function()
                        {
                            const us = initActive("us");
                            const them = initActive("them");
                            us.volatile.mirrorMove = "previous"; // test value

                            // call a move
                            await initParser("them", otherCallers[0]);
                            await handle(
                                {type: "useMove", monRef: "them", move});
                            await exitParser();

                            expect(them.volatile[name].isActive).to.be.true;
                            expect(them.volatile[name].type).to.equal(move);
                            expect(them.volatile[name].called).to.be.true;
                            // shouldn't update
                            expect(us.volatile.mirrorMove).to.equal("previous");

                            // continue the rampage on the next turn
                            await initParser("them", move);
                            await exitParser();

                            expect(them.volatile[name].isActive).to.be.true;
                            expect(them.volatile[name].type).to.equal(move);
                            expect(them.volatile[name].called).to.be.true;
                            // shouldn't update
                            expect(us.volatile.mirrorMove).to.equal("previous");
                        });
                    }

                    for (const caller of mirrorCallers)
                    {
                        it(`Should pass if using ${caller} and move matches`,
                        async function()
                        {
                            initActive("us");
                            const them = initActive("them");
                            them.volatile.mirrorMove = "tackle";
                            await initParser("them", caller);
                            await handle(tackle);
                            await exitParser();
                        });

                        it(`Should throw if using ${caller} and mismatched ` +
                            "move",
                        async function()
                        {
                            const them = initActive("them");
                            them.volatile.mirrorMove = "watergun";
                            await initParser("them", caller);
                            await expect(handle(tackle))
                                .to.eventually.be.rejectedWith(Error,
                                    "Call effect 'mirror' failed: " +
                                    "Should've called 'watergun' but got " +
                                    `'${tackle.move}'`);
                        });
                    }
                });

                describe("Self move-callers", function()
                {
                    for (const caller of selfMoveCallers)
                    {
                        it(`Should infer user's move when using ${caller}`,
                        async function()
                        {
                            initActive("us");
                            const them = initActive("them");
                            // use the move-caller
                            await initParser("them", caller);
                            // call the move
                            await handle(tackle);
                            // shouldn't consume pp for the called move
                            expect(them.moveset.get("tackle")).to.not.be.null;
                            expect(them.moveset.get("tackle")!.pp).to.equal(56);
                        });
                    }

                    it("Should reject if the call effect was ignored",
                    async function()
                    {
                        const them = initActive("them");
                        await initParser("them", selfMoveCallers[0]);
                        await expect(handle(
                            {
                                type: "useMove", monRef: "us", move: "tackle"
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "Call effect 'self' failed: " +
                                "Expected 'them' but got 'us'");
                        expect(them.moveset.get("tackle")).to.be.null;
                    });
                });

                describe("Target move-callers", function()
                {
                    for (const caller of targetMoveCallers)
                    {
                        it(`Should infer target's move when using ${caller}`,
                        async function()
                        {
                            // switch in a pokemon that has the move-caller
                            const us = initActive("us");
                            const them = initActive("them");

                            // use the move-caller
                            await initParser("us", caller);
                            await handle(
                            {
                                type: "useMove", monRef: "us", move: "tackle"
                            });
                            expect(us.moveset.get("tackle")).to.be.null;
                            expect(them.moveset.get("tackle")).to.not.be.null;
                            // shouldn't consume pp for the called move
                            expect(them.moveset.get("tackle")!.pp).to.equal(56);
                        });
                    }

                    it("Should throw if the call effect was ignored",
                    async function()
                    {
                        initActive("us");
                        const them = initActive("them");
                        await initParser("them", targetMoveCallers[0]);
                        await expect(handle(
                            {
                                type: "useMove", monRef: "us", move: "tackle"
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "Call effect 'target' failed: " +
                                "Expected 'them' but got 'us'");
                        expect(them.moveset.get("tackle")).to.be.null;
                    });
                });

                describe("Reflected moves", function()
                {
                    it("Should pass reflected move", async function()
                    {
                        initActive("us").volatile.magicCoat = true;
                        initActive("them");
                        // use reflectable move
                        await initParser("them", "yawn");
                        // block and reflect the move
                        await handle(
                        {
                            type: "block", monRef: "us", effect: "magicCoat"
                        });
                        await handle(
                            {type: "useMove", monRef: "us", move: "yawn"});
                        await handle({type: "fail"}); // yawn effects
                        await exitParser();
                    });

                    it("Should throw if reflecting move without an active " +
                        "magicCoat status",
                    async function()
                    {
                        initActive("us");
                        initActive("them");
                        // use reflectable move
                        await initParser("them", "yawn");
                        // try to block and reflect the move
                        await expect(reject(
                            {
                                type: "block", monRef: "us", effect: "magicCoat"
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "Expected effect that didn't happen: " +
                                "hit status [yawn]");
                    });

                    it("Should throw if reflecting an already reflected move",
                    async function()
                    {
                        initActive("us").volatile.magicCoat = true;
                        initActive("them").volatile.magicCoat = true;
                        // use reflectable move
                        await initParser("them", "yawn");
                        // block and reflect the move
                        await handle(
                            {type: "block", monRef: "us", effect: "magicCoat"});
                        await handle(
                            {type: "useMove", monRef: "us", move: "yawn"});
                        // try to block and reflect the move again
                        await expect(handle(
                            {
                                type: "block", monRef: "them",
                                effect: "magicCoat"
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "Expected effect that didn't happen: " +
                                "hit status [yawn]");
                    });

                    it("Should throw if reflecting unreflectable move",
                    async function()
                    {
                        initActive("us").volatile.magicCoat = true;
                        initActive("them");
                        // use reflectable move
                        await initParser("them", "taunt");
                        // block and reflect the move
                        await expect(handle(
                            {
                                type: "block", monRef: "us", effect: "magicCoat"
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "Expected effect that didn't happen: " +
                                "hit status [taunt]");
                    });
                });
            });

            describe("SwapBoosts", function()
            {
                beforeEach("Initialize us/them", function()
                {
                    initActive("us");
                    initActive("them");
                });

                it("Should handle swap boost move", async function()
                {
                    await initParser("them", "guardswap");
                    await handle(
                    {
                        type: "swapBoosts", monRef1: "us", monRef2: "them",
                        stats: ["def", "spd"]
                    });
                    // effect should be consumed after accepting the previous
                    //  swapBoosts event
                    await reject(
                    {
                        type: "swapBoosts", monRef1: "us", monRef2: "them",
                        stats: ["def", "spd"]
                    });
                });

                it("Should reject if event doesn't include user",
                async function()
                {
                    await initParser("them", "tackle");
                    await reject(
                    {
                        type: "swapBoosts", monRef1: "us", monRef2: "us",
                        stats: ["def", "spd"]
                    });
                });

                it("Should throw if too many stats", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("them", "guardswap");

                    // shouldn't handle
                    await expect(handle(
                        {
                            type: "swapBoosts", monRef1: "us", monRef2: "them",
                            stats: ["def", "spd", "spe"]
                        }))
                        .to.eventually.be.rejectedWith(Error,
                            "Expected effect that didn't happen: " +
                            "swapBoosts [def, spd]")
                });

                it("Should throw if reject before effect", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("them", "guardswap");
                    await expect(exitParser())
                        .to.eventually.be.rejectedWith(Error,
                            "Expected effect that didn't happen: " +
                            "swapBoosts [def, spd]");
                });
            });

            describe("CountableStatusEffect", function()
            {
                // TODO: better handling for perishsong events
                it("Should pass if expected using perishsong", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("us", "perishsong");
                    await handle(
                    {
                        type: "countStatusEffect", monRef: "us",
                        effect: "perish", amount: 3
                    });
                    await handle(
                    {
                        type: "countStatusEffect", monRef: "them",
                        effect: "perish", amount: 3
                    });
                    await exitParser();
                });

                it("Should pass if expected using stockpile", async function()
                {
                    initActive("us");
                    await initParser("us", "stockpile");
                    await handle(
                    {
                        type: "countStatusEffect", monRef: "us",
                        effect: "stockpile", amount: 1
                    });
                    await exitParser();
                });
            });

            describe("FieldEffect", function()
            {
                it("Should pass if expected", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("us", "trickroom");
                    await handle(
                    {
                        type: "activateFieldEffect", effect: "trickRoom",
                        start: true
                    });
                    await exitParser();
                });

                it("Should reject if not expected", async function()
                {
                    initActive("us");
                    await initParser("us", "splash");
                    await reject(
                    {
                        type: "activateFieldEffect", effect: "gravity",
                        start: true
                    });
                });

                describe("weather", function()
                {
                    it("Should infer source via move", async function()
                    {
                        initActive("us")
                        const {item} = initActive("them");
                        await initParser("them", "raindance");
                        await handle(
                        {
                            type: "activateFieldEffect",
                            effect: "RainDance", start: true
                        });

                        const weather = state.status.weather;
                        expect(weather.type).to.equal("RainDance");
                        expect(weather.duration).to.not.be.null;
                        expect(weather.source).to.equal(item);

                        // tick 5 times to infer item
                        expect(item.definiteValue).to.be.null;
                        for (let i = 0; i < 5; ++i) weather.tick();
                        expect(item.definiteValue).to.equal("damprock");
                    });

                    it("Should reject if mismatch", async function()
                    {
                        initActive("us");
                        initActive("them");
                        await initParser("them", "raindance");
                        await expect(handle(
                            {
                                type: "activateFieldEffect", effect: "Hail",
                                start: true
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "Expected effect that didn't happen: " +
                                "field RainDance");
                    });
                });
            });

            describe("Drain", function()
            {
                // can have clearbody or liquidooze
                const tentacruel: events.SwitchOptions =
                {
                    species: "tentacruel", level: 100, gender: "M", hp: 364,
                    hpMax: 364
                };

                it("Should pass if expected", async function()
                {
                    initActive("us");
                    initActive("them").hp.set(1);
                    await initParser("them", "absorb");
                    await handle({type: "takeDamage", monRef: "us", hp: 50});
                    await handle(
                    {
                        type: "takeDamage", monRef: "them", hp: 100,
                        from: "drain"
                    });
                    await exitParser();
                });

                it("Should pass without event if full hp", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("them", "absorb");
                    await handle({type: "takeDamage", monRef: "us", hp: 50});
                    await exitParser();
                });

                it("Should infer no liquidooze if normal", async function()
                {
                    const mon = initActive("us", tentacruel);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("clearbody", "liquidooze");
                    initActive("them").hp.set(1);
                    await initParser("them", "drainpunch");
                    // handle move damage
                    await handle(
                        {type: "takeDamage", monRef: "us", hp: 50});
                    // handle drain effect
                    await handle(
                    {
                        type: "takeDamage", monRef: "them", hp: 100,
                        from: "drain"
                    });
                    await exitParser();
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("clearbody");
                    expect(mon.ability).to.equal("clearbody");
                });

                it("Should pass if liquidooze activates", async function()
                {
                    initActive("us", tentacruel);
                    initActive("them");
                    await initParser("them", "absorb");
                    // handle move damage
                    await handle({type: "takeDamage", monRef: "us", hp: 50});
                    // liquidooze ability activates to replace drain effect
                    await handle(
                    {
                        type: "activateAbility", monRef: "us",
                        ability: "liquidooze"
                    });
                    // drain damage inverted due to liquidooze ability
                    await handle({type: "takeDamage", monRef: "them", hp: 50});
                    await exitParser();
                });
            });

            describe("Recoil", function()
            {
                // can have swiftswim or rockhead
                const relicanth: events.SwitchOptions =
                {
                    species: "relicanth", level: 83, gender: "F", hp: 302,
                    hpMax: 302
                };

                it("Should pass if expected", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("them", "bravebird");
                    await handle(
                    {
                        type: "takeDamage", monRef: "them", hp: 1,
                        from: "recoil"
                    });
                    await exitParser();
                });

                it("Should reject if not expected", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("them", "gust");
                    await reject(
                    {
                        type: "takeDamage", monRef: "them", hp: 0,
                        from: "recoil"
                    });
                });

                function testRecoil(name: string, pre: (mon: Pokemon) => void,
                    recoilEvent: boolean, infer?: boolean | "throw"): void
                {
                    it(name, async function()
                    {
                        initActive("them");
                        const mon = initActive("us", relicanth);
                        expect(mon.traits.ability.possibleValues)
                            .to.have.all.keys(["swiftswim", "rockhead"]);
                        pre?.(mon);

                        await initParser("us", "doubleedge");
                        if (recoilEvent)
                        {
                            await handle(
                            {
                                type: "takeDamage", monRef: "us", hp: 1,
                                from: "recoil"
                            });
                            await exitParser();
                        }
                        if (infer === "throw")
                        {
                            await expect(exitParser())
                                .to.eventually.be.rejectedWith(Error,
                                    "Move doubleedge user 'us' suppressed " +
                                    "recoil through an ability but ability " +
                                    "is suppressed");
                            return;
                        }
                        if (!recoilEvent) await exitParser();
                        if (infer === true)
                        {
                            expect(mon.traits.ability.possibleValues)
                                .to.have.all.keys(["rockhead"]);
                            expect(mon.ability).to.equal("rockhead");
                        }
                        else if (infer === false)
                        {
                            expect(mon.traits.ability.possibleValues)
                                .to.have.all.keys(["swiftswim"]);
                            expect(mon.ability).to.equal("swiftswim");
                        }
                        else
                        {
                            expect(mon.traits.ability.possibleValues)
                                .to.have.all.keys(["swiftswim", "rockhead"]);
                            expect(mon.ability).to.be.empty;
                        }
                    });
                }

                testRecoil(
                    "Should infer no recoil-canceling ability if recoil event",
                    () => {}, true, false);

                testRecoil(
                    "Should not infer ability if suppressed and recoil event",
                    mon => mon.volatile.suppressAbility = true, true);

                testRecoil(
                    "Should infer recoil-canceling ability if no recoil event",
                    () => {}, false, true);

                testRecoil(
                    "Should throw if ability suppressed and no recoil event",
                    mon => mon.volatile.suppressAbility = true, false, "throw");
            });
        });

        const moveEffectTests:
        {
            readonly [T in effects.move.Category]:
                {readonly [U in effects.move.OtherType]: (() =>  void)[]}
        } =
        {
            self:
            {
                status: [], unique: [], implicitStatus: [], boost: [], team: [],
                implicitTeam: [], percentDamage: []
            },
            hit:
            {
                status: [], unique: [], implicitStatus: [], boost: [], team: [],
                implicitTeam: [], percentDamage: []
            }
        };

        //#region status effect

        function testNonRemovable(ctg: "self" | "hit", name: string,
            effect: effects.StatusType, move: string,
            preEvents?: readonly events.Any[]): void
        {
            // adjust perspective
            const target = ctg === "self" ? "them" : "us";

            moveEffectTests[ctg].status.push(function()
            {
                describe(name, function()
                {
                    beforeEach("Initialize active", async function()
                    {
                        initActive("them").hp.set(50); // for roost
                        initActive("us");
                    });

                    it("Should pass if expected", async function()
                    {
                        // set last move in case of encore
                        state.teams.us.active.volatile.lastMove = "splash";

                        await initParser("them", move);
                        for (const event of preEvents ?? [])
                        {
                            await handle(event);
                        }
                        await handle(
                        {
                            type: "activateStatusEffect", monRef: target,
                            effect, start: true
                        });
                        await exitParser();
                    });

                    it("Should reject if start=false", async function()
                    {
                        await initParser("them", move);
                        for (const event of preEvents ?? [])
                        {
                            await handle(event);
                        }
                        const statusEvent: events.ActivateStatusEffect =
                        {
                            type: "activateStatusEffect", monRef: target,
                            effect, start: false
                        };
                        // same condition in useMove for throwing this exception
                        const data = dex.moves[move];
                        if (!data.effects?.status?.chance &&
                            data.category === "status")
                        {
                            await expect(handle(statusEvent))
                                .to.eventually.be.rejectedWith(Error,
                                    "Expected effect that didn't happen: " +
                                    `${ctg} status [${effect}]`);
                        }
                        else await reject(statusEvent);
                    });

                    it("Should reject if mismatched flags", async function()
                    {
                        await initParser("them", "tackle");
                        await reject(
                        {
                            type: "activateStatusEffect", monRef: target,
                            effect, start: true
                        });
                    });

                    // TODO: factor out into parameters
                    if (effect === "attract")
                    {
                        it("Should cancel status move effects if ability " +
                            "immunity", async function()
                        {
                            // setup ability so it can activate
                            const us = state.teams.us.active;
                            us.traits.setAbility("oblivious");

                            await initParser("them", "attract");
                            await handle(
                            {
                                type: "activateAbility", monRef: "us",
                                ability: "oblivious"
                            });
                            await handle({type: "immune", monRef: "us"});
                            await exitParser();
                        });
                    }
                });
            });
        }

        interface TestRemovableArgs
        {
            readonly ctg: effects.move.Category;
            readonly name: string;
            readonly effect: effects.StatusType;
            readonly move?: string;
            readonly preMoveEvents?: readonly events.Any[];
            readonly secondaryMove?: string;
            readonly secondaryMove100?: string;
            readonly abilityImmunity?: string;
            readonly clause?: "slp";
        }

        function testRemovable(
            {
                ctg, name, effect, move, preMoveEvents, secondaryMove,
                secondaryMove100, abilityImmunity, clause
            }: TestRemovableArgs): void
        {
            // adjust perspective
            const target = ctg === "self" ? "them" : "us";

            moveEffectTests[ctg].status.push(function()
            {
                describe(name, function()
                {
                    beforeEach("Initialize active", function()
                    {
                        initActive("us");
                        initActive("them");
                    });

                    if (move)
                    {
                        it("Should pass if expected", async function()
                        {
                            await initParser("them", move);
                            for (const event of preMoveEvents ?? [])
                            {
                                await handle(event);
                            }
                            await handle(
                            {
                                type: "activateStatusEffect", monRef: target,
                                effect, start: true
                            });
                            await exitParser();
                        });
                    }

                    if (move && abilityImmunity)
                    {
                        it("Should cancel status move effects if ability " +
                            "immunity", async function()
                        {
                            // setup ability so it can activate
                            const us = state.teams.us.active;
                            us.traits.setAbility(abilityImmunity);

                            await initParser("them", move);
                            await handle(
                            {
                                type: "activateAbility", monRef: "us",
                                ability: abilityImmunity
                            });
                            await handle({type: "immune", monRef: "us"});
                            await exitParser();
                        });
                    }

                    it("Should still pass if start=false on an unrelated move",
                    async function()
                    {
                        await initParser("them", "tackle");
                        if (dexutil.isMajorStatus(effect))
                        {
                            // make sure majorstatus assertion passes
                            state.teams[target].active.majorStatus
                                .afflict(effect);
                        }
                        // TODO: track moves that can do this
                        await handle(
                        {
                            type: "activateStatusEffect", monRef: target,
                            effect, start: false
                        });
                        await exitParser();
                    });

                    if (secondaryMove)
                    {
                        it("Should pass if expected via secondary effect",
                        async function()
                        {
                            await initParser("them", secondaryMove);
                            await handle(
                            {
                                type: "activateStatusEffect", monRef: target,
                                effect, start: true
                            });
                            await exitParser();
                        });
                    }

                    it("Should reject if mismatched flags", async function()
                    {
                        await initParser("them", "tackle");
                        await reject(
                        {
                            type: "activateStatusEffect", monRef: target,
                            effect, start: true
                        });
                    });

                    if (secondaryMove100)
                    {
                        it("Should pass if exit before 100% secondary " +
                            "effect if the target is already afflicted",
                        async function()
                        {
                            const mon = state.teams[target].active;
                            if (dexutil.isMajorStatus(effect))
                            {
                                mon.majorStatus.afflict(effect);
                            }
                            else if (effect === "confusion")
                            {
                                mon.volatile[effect].start();
                            }
                            await initParser("them", secondaryMove100);
                            await exitParser();
                        });

                        it("Should throw if reject before 100% secondary " +
                            "effect",
                        async function()
                        {
                            // remove owntempo possibility from smeargle
                            state.teams.us.active.traits
                                .setAbility("technician");
                            await initParser("them", secondaryMove100);
                            await expect(exitParser())
                                .to.eventually.be.rejectedWith(Error,
                                    `Move '${secondaryMove100}' status ` +
                                    `[${effect}] was blocked by target ` +
                                    `'${target}' but target's ability ` +
                                    "[technician] can't block it");
                        });

                        it("Should pass without 100% secondary effect if " +
                            "target fainted",
                        async function()
                        {
                            await initParser("them", secondaryMove100);
                            await handle(
                                {type: "takeDamage", monRef: "us", hp: 0});
                            await handle({type: "faint", monRef: "us"});
                            await exitParser();
                        });
                    }

                    if (secondaryMove100 && abilityImmunity)
                    {
                        // TODO: generalize for other abilities
                        it("Should narrow ability if no status event",
                        async function()
                        {
                            const them = state.teams.them.active;
                            them.traits.setAbility(abilityImmunity,
                                "illuminate");
                            expect(them.ability).to.be.empty;
                            await initParser("us", secondaryMove100);
                            await exitParser();
                            expect(them.ability).to.equal(abilityImmunity);
                        });
                    }

                    if (move && clause)
                    {
                        it(`Should be blocked by clause '${clause}'`,
                        async function()
                        {
                            await initParser("us", move);
                            await handle({type: "clause", clause});
                            await exitParser();
                        });
                    }
                });
            });
        }

        testNonRemovable("self", "Aqua Ring", "aquaRing", "aquaring");
        testNonRemovable("hit", "Attract", "attract", "attract");
        testNonRemovable("self", "Charge", "charge", "charge",
            [{type: "boost", monRef: "them", stat: "spd", amount: 1}]);
        // curse
        moveEffectTests.hit.status.push(function()
        {
            describe("Curse", function()
            {
                describe("Ghost-type", function()
                {
                    it("Should expect curse status", async function()
                    {
                        initActive("us");
                        initActive("them", smeargle).volatile.addedType =
                            "ghost";
                        await initParser("them", "curse");
                        await handle(
                            {type: "takeDamage", monRef: "them", hp: 50});
                        await handle(
                        {
                            type: "activateStatusEffect", monRef: "us",
                            effect: "curse", start: true
                        });
                        await exitParser();
                    });

                    it("Should reject if mismatched flags", async function()
                    {
                        initActive("us");
                        initActive("them");
                        await initParser("them", "tackle");
                        await reject(
                        {
                            type: "activateStatusEffect", monRef: "us",
                            effect: "curse", start: true
                        });
                    });
                });

                describe("Non-ghost-type", function()
                {
                    it("Should expect boosts", async function()
                    {
                        initActive("them");
                        await initParser("them", "curse");
                        await handle(
                        {
                            type: "boost", monRef: "them", stat: "spe",
                            amount: -1
                        });
                        await handle(
                        {
                            type: "boost", monRef: "them", stat: "atk",
                            amount: 1
                        });
                        await handle(
                        {
                            type: "boost", monRef: "them", stat: "def",
                            amount: 1
                        });
                        await exitParser();
                    });
                });
            });
        });
        testNonRemovable("hit", "Embargo", "embargo", "embargo");
        testNonRemovable("hit", "Encore", "encore", "encore");
        moveEffectTests.hit.status.push(function()
        {
            describe("Flash Fire", function()
            {
                // can have flashfire
                const arcanine: events.SwitchOptions =
                {
                    species: "arcanine", gender: "F", level: 100, hp: 100,
                    hpMax: 100
                };

                it("Should block move effects", async function()
                {
                    initActive("us");
                    initActive("them", arcanine);
                    // fire-type move with guaranteed brn effect
                    await initParser("us", "willowisp");
                    // activate absorbing ability
                    await handle(
                    {
                        type: "activateAbility", monRef: "them",
                        ability: "flashfire"
                    });
                    await handle(
                    {
                        type: "activateStatusEffect", monRef: "them",
                        effect: "flashFire", start: true
                    });
                    // effect should be blocked
                    await exitParser(); // shouldn't throw
                });
            });
        })
        testNonRemovable("self", "Focus Energy", "focusEnergy", "focusenergy");
        testNonRemovable("hit", "Foresight", "foresight", "foresight");
        testNonRemovable("hit", "Heal Block", "healBlock", "healblock");
        // imprison
        moveEffectTests.self.status.push(function()
        {
            let us: Pokemon;
            let them: Pokemon;

            function setup(imprisonUser: Side, sameOpponent = true): void
            {
                us = initActive("us",
                {
                    species: "vulpix", level: 5, gender: "F", hp: 20, hpMax: 20
                });
                us.moveset.reveal(
                    imprisonUser === "us" ? "imprison" : "protect");
                us.moveset.reveal("ember");
                us.moveset.reveal("tailwhip");
                us.moveset.reveal("disable");

                // switch in a similar pokemon
                them = initActive("them",
                {
                    species: sameOpponent ? "vulpix" : "bulbasaur", level: 10,
                    gender: "M", hp: 100, hpMax: 100
                });

                if (sameOpponent)
                {
                    // opponent should be able to have our moveset
                    expect(them.moveset.constraint)
                        .to.include.all.keys([...us.moveset.moves.keys()]);
                }
                else
                {
                    // opponent should not be able to have our moveset
                    expect(them.moveset.constraint)
                        .to.not.include.any.keys([...us.moveset.moves.keys()]);
                }
            }

            describe("Failed", function()
            {
                for (const id of ["us", "them"] as const)
                {
                    it(`Should infer no common moves if ${id} failed`,
                    async function()
                    {
                        setup(id);

                        // if imprison fails, then the opponent shouldn't be
                        //  able to have any of our moves
                        await initParser(id, "imprison");
                        await handle({type: "fail"});
                        expect(them.moveset.constraint).to.not.include.any.keys(
                            [...us.moveset.moves.keys()]);
                        await exitParser();
                    });
                }

                it("Should throw if shared moves", async function()
                {
                    setup("us");
                    await initParser("them", "imprison");
                    await expect(handle({type: "fail"}))
                        .to.eventually.be.rejectedWith(Error,
                            "Imprison failed but both Pokemon have common " +
                            "moves: imprison");
                });
            });

            describe("Succeeded", function()
            {
                for (const id of ["us", "them"] as const)
                {
                    it(`Should infer a common move if ${id} succeeded`,
                    async function()
                    {
                        setup(id);

                        // if imprison succeeds, then the opponent
                        //  should be able to have one of our moves
                        await initParser(id, "imprison");
                        await handle(
                        {
                            type: "activateStatusEffect", monRef: id,
                            effect: "imprison", start: true
                        });
                        expect(them.moveset.moveSlotConstraints)
                            .to.have.lengthOf(1);
                        expect(them.moveset.moveSlotConstraints[0])
                            .to.have.keys([...us.moveset.moves.keys()]);
                    });
                }

                it("Should throw if no shared moves", async function()
                {
                    setup("us", /*sameOpponent*/false);
                    await initParser("us", "imprison");

                    // if imprison succeeds, then the opponent
                    //  should be able to have one of our moves
                    await expect(handle(
                        {
                            type: "activateStatusEffect", monRef: "us",
                            effect: "imprison", start: true
                        }))
                        .to.eventually.be.rejectedWith(Error,
                            "Imprison succeeded but both Pokemon cannot " +
                            "share any moves");
                });
            });
        });
        testNonRemovable("self", "Ingrain", "ingrain", "ingrain");
        testRemovable(
        {
            ctg: "hit", name: "Leech Seed", effect: "leechSeed",
            move: "leechseed"
        });
        testNonRemovable("self", "Magnet Rise", "magnetRise", "magnetrise");
        testNonRemovable("hit", "Miracle Eye", "miracleEye", "miracleeye");
        testNonRemovable("self", "Mud Sport", "mudSport", "mudsport");
        testNonRemovable("hit", "Nightmare", "nightmare", "nightmare");
        testNonRemovable("self", "Power Trick", "powerTrick", "powertrick");
        // slowstart
        for (const ctg of ["self", "hit"] as const)
        {
            moveEffectTests[ctg].status.push(function()
            {
                const target = ctg === "self" ? "them" : "us";
                describe("Slow Start", function()
                {
                    it("Should reject", async function()
                    {
                        initActive("us");
                        initActive("them");
                        await initParser("them", "tackle");
                        await reject(
                        {
                            type: "activateStatusEffect", monRef: target,
                            effect: "slowStart", start: true
                        });
                    });
                });
            });
        }
        testRemovable(
        {
            ctg: "self", name: "Substitute", effect: "substitute",
            move: "substitute",
            preMoveEvents: [{type: "takeDamage", monRef: "them", hp: 50}]
        });
        testNonRemovable("hit", "Suppress ability", "suppressAbility",
            "gastroacid");
        testNonRemovable("hit", "Taunt", "taunt", "taunt");
        testNonRemovable("hit", "Torment", "torment", "torment");
        testNonRemovable("self", "Water Sport", "waterSport", "watersport");
        testNonRemovable("hit", "Yawn", "yawn", "yawn");

        // updatable
        testRemovable(
        {
            ctg: "hit", name: "Confusion", effect: "confusion",
            move: "confuseray", secondaryMove: "psybeam",
            secondaryMove100: "dynamicpunch", abilityImmunity: "owntempo"
        });
        testNonRemovable("self", "Bide", "bide", "bide");
        testNonRemovable("self", "Uproar", "uproar", "uproar");

        // singlemove
        testNonRemovable("self", "Destiny Bond", "destinyBond", "destinybond");
        testNonRemovable("self", "Grudge", "grudge", "grudge");
        testNonRemovable("self", "Rage", "rage", "rage");

        // singleturn
        testNonRemovable("self", "Endure", "endure", "endure");
        testNonRemovable("self", "Magic Coat", "magicCoat", "magiccoat");
        testNonRemovable("self", "Protect", "protect", "protect");
        testNonRemovable("self", "Roost", "roost", "roost",
            [{type: "takeDamage", monRef: "them", hp: 100}]);
        testNonRemovable("self", "Snatch", "snatch", "snatch");
        // stall
        moveEffectTests.self.status.push(function()
        {
            describe("Stall effect", function()
            {
                it("Should count stall turns then reset if failed",
                async function()
                {
                    const v = initActive("them").volatile;
                    expect(v.stalling).to.be.false;
                    expect(v.stallTurns).to.equal(0);
                    for (let i = 1; i <= 2; ++i)
                    {
                        state.preTurn();
                        await initParser("them", "protect");
                        await handle(
                        {
                            type: "activateStatusEffect", monRef: "them",
                            effect: "protect", start: true
                        });
                        await exitParser();
                        expect(v.stalling).to.be.true;
                        expect(v.stallTurns).to.equal(i);

                        state.postTurn();
                        expect(v.stalling).to.be.false;
                        expect(v.stallTurns).to.equal(i);
                    }

                    state.preTurn();
                    await initParser("them", "protect");
                    await handle({type: "fail"});
                    expect(v.stalling).to.be.false;
                    expect(v.stallTurns).to.equal(0);
                    await exitParser();
                });

                it("Should reset stall count if using another move",
                async function()
                {
                    const mon = initActive("them");

                    // stall effect is put in place
                    state.preTurn();
                    mon.volatile.stall(true);
                    state.postTurn();
                    expect(mon.volatile.stalling).to.be.false;
                    expect(mon.volatile.stallTurns).to.equal(1);

                    // some other move is used next turn
                    state.preTurn();
                    await initParser("them", "splash");
                    await exitParser();
                    expect(mon.volatile.stalling).to.be.false;
                    expect(mon.volatile.stallTurns).to.equal(0);
                });

                it("Should not reset counter if called", async function()
                {
                    const mon = initActive("them");
                    await initParser("them", "endure");

                    // stall effect is put in place
                    await handle(
                    {
                        type: "activateStatusEffect", monRef: "them",
                        effect: "endure", start: true
                    });
                    await exitParser();

                    // somehow the pokemon moves again in the same turn via call
                    //  effect
                    await initParser("them", "metronome");
                    await handle(
                        {type: "useMove", monRef: "them", move: "endure"});
                    await handle({type: "fail"});
                    await exitParser();
                    expect(mon.volatile.stalling).to.be.true;
                    expect(mon.volatile.stallTurns).to.equal(1);
                });
            });
        });

        // major status
        // TODO: search for these moves automatically in dex

        testRemovable(
        {
            ctg: "hit", name: "Burn", effect: "brn", move: "willowisp",
            secondaryMove: "flamethrower", abilityImmunity: "waterveil"
        });
        testRemovable(
        {
            ctg: "hit", name: "Freeze", effect: "frz", secondaryMove: "icebeam",
            abilityImmunity: "magmaarmor"
        });
        testRemovable(
        {
            ctg: "hit", name: "Paralyze", effect: "par", move: "stunspore",
            secondaryMove: "thunderbolt", secondaryMove100: "zapcannon",
            abilityImmunity: "limber"
        });
        testRemovable(
        {
            ctg: "hit", name: "Poison", effect: "psn", move: "poisonpowder",
            secondaryMove: "gunkshot", abilityImmunity: "immunity"
        });
        testRemovable(
        {
            ctg: "hit", name: "Sleep", effect: "slp", move: "spore",
            clause: "slp", abilityImmunity: "insomnia"
        });
        testRemovable(
        {
            ctg: "hit", name: "Toxic", effect: "tox", move: "toxic",
            secondaryMove: "poisonfang", abilityImmunity: "immunity"
        });

        //#endregion

        //#region unique effect
        moveEffectTests.self.unique.push(function()
        {
            describe("Conversion", function()
            {
                it("Should infer move via type change", async function()
                {
                    const mon = initActive("them");
                    await initParser("them", "conversion");

                    // changes into a water type, meaning the pokemon must
                    //  have a water type move
                    await handle(
                    {
                        type: "changeType", monRef: "them",
                        newTypes: ["water", "???"]
                    });

                    // one move slot left to infer after conversion
                    mon.moveset.reveal("tackle");
                    mon.moveset.reveal("takedown");

                    // one of the moves can be either fire or water type
                    expect(mon.moveset.get("ember")).to.be.null;
                    expect(mon.moveset.get("watergun")).to.be.null;
                    mon.moveset.addMoveSlotConstraint(["ember", "watergun"]);
                    // should have now consumed the move slot constraint
                    expect(mon.moveset.moveSlotConstraints).to.be.empty;
                    expect(mon.moveset.get("ember")).to.be.null;
                    expect(mon.moveset.get("watergun")).to.not.be.null;
                });
            });
        });
        moveEffectTests.hit.unique.push(function()
        {
            describe("Disable", function()
            {
                it("Should pass if expected", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("them", "disable");
                    await handle(
                        {type: "disableMove", monRef: "us", move: "splash"});
                    await exitParser();
                });

                it("Should reject if not expected", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("them", "tackle");
                    await reject(
                        {type: "disableMove", monRef: "us", move: "splash"});
                });
            });
        });
        //#endregion

        //#region implicit status effect

        function testImplicitStatusEffect(ctg: "self" | "hit", name: string,
            move: string, event: events.Any,
            getter: (mon: ReadonlyPokemon) => boolean): void
        {
            const target = ctg === "self" ? "us" : "them";
            moveEffectTests[ctg].implicitStatus.push(async function()
            {
                describe(name, async function()
                {
                    it(`Should set if using ${move}`, async function()
                    {
                        let mon = initActive("us");
                        if (target === "them") mon = initActive("them");
                        await initParser("us", move);
                        await handle(event);
                        await exitParser();
                        expect(getter(mon)).to.be.true;
                    });

                    it(`Should not set if ${move} failed`, async function()
                    {
                        let mon = initActive("us");
                        if (target === "them") mon = initActive("them");
                        await initParser("us", move);
                        await handle({type: "fail"});
                        await exitParser();
                        expect(getter(mon)).to.be.false;
                    });
                });
            });
        }

        function testLockingMoves<T extends string>(name: string,
            keys: readonly T[],
            getter: (mon: ReadonlyPokemon) => ReadonlyVariableTempStatus<T>):
            void
        {
            moveEffectTests.self.implicitStatus.push(function()
            {
                describe(name, () => keys.forEach(move =>
                    describe(move, function()
                    {
                        async function init():
                            Promise<ReadonlyVariableTempStatus<T>>
                        {
                            // execute the move once to set lockedmove status
                            initActive("us");
                            const vts = getter(initActive("them"));
                            expect(vts.isActive).to.be.false;
                            await initParser("them", move);
                            await exitParser();
                            state.postTurn();
                            expect(vts.isActive).to.be.true;
                            expect(vts.type).to.equal(move);
                            return vts;
                        }

                        it("Should set if successful", init);

                        it("Should reset if missed", async function()
                        {
                            const vts = await init();
                            await initParser("them", move);
                            expect(vts.isActive).to.be.true;
                            await handle({type: "miss", monRef: "us"});
                            expect(vts.isActive).to.be.false;
                        });

                        it("Should reset if opponent protected",
                        async function()
                        {
                            const vts = await init();
                            await initParser("them", move);
                            expect(vts.isActive).to.be.true;

                            await handle(
                            {
                                type: "block", monRef: "us", effect: "protect"
                            });
                            expect(vts.isActive).to.be.false;
                        });

                        it("Should not reset if opponent endured",
                        async function()
                        {
                            const vts = await init();
                            await initParser("them", move);
                            expect(vts.isActive).to.be.true;

                            await handle(
                            {
                                type: "block", monRef: "us", effect: "endure"
                            });
                            expect(vts.isActive).to.be.true;
                        });

                        it("Should not consume pp if used consecutively",
                        async function()
                        {
                            const vts = await init();
                            expect(vts.isActive).to.be.true;
                            expect(vts.turns).to.equal(0);

                            await initParser("them", move);
                            expect(vts.isActive).to.be.true;
                            expect(vts.turns).to.equal(0);

                            await exitParser();
                            expect(vts.isActive).to.be.true;
                            expect(vts.turns).to.equal(1);

                            const m = state.teams.them.active.moveset
                                .get(move)!;
                            expect(m).to.not.be.null;
                            expect(m.pp).to.equal(m.maxpp - 1);
                        });
                    })));
            });
        }

        testImplicitStatusEffect("self", "Defense Curl", "defensecurl",
            {type: "boost", monRef: "us", stat: "def", amount: 1},
            mon => mon.volatile.defenseCurl);
        // TODO: rename to rampage move
        testLockingMoves("Locked moves", dex.lockedMoveKeys,
            mon => mon.volatile.lockedMove);
        testImplicitStatusEffect("self", "Minimize", "minimize",
            {type: "boost", monRef: "us", stat: "evasion", amount: 1},
            mon => mon.volatile.minimize);
        // TODO: mustRecharge
        // TODO: move rollout moves to dex and MoveData
        // TODO: rename to momentum move
        testLockingMoves("Rollout moves", dexutil.rolloutKeys,
            mon => mon.volatile.rollout);

        //#endregion

        //#region boost effect

        function shouldHandleBoost(ctg: "self" | "hit", move: string,
            stat: dexutil.BoostName, amount: number, abilityImmunity?: string,
            immunityHolder?: events.SwitchOptions): void
        {
            const target = ctg === "self" ? "us" : "them";
            moveEffectTests[ctg].boost.push(function()
            {
                it("Should handle boost", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("us", move);
                    await handle({type: "boost", monRef: target, stat, amount});
                    await exitParser(); // shouldn't throw
                });

                it("Should throw if reject before effect", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("us", move);
                    await expect(exitParser())
                        .to.eventually.be.rejectedWith(Error,
                            "Expected effect that didn't happen: " +
                            `${ctg} boost add {"${stat}":${amount}}`);
                });

                it("Should allow no boost message if maxed out",
                async function()
                {
                    initActive("us");
                    initActive("them");
                    pstate.state.teams[target].active.volatile.boosts[stat] =
                        6 * Math.sign(amount);
                    await initParser("us", move);
                    await exitParser();
                });

                it("Should allow boost message with amount=0 if maxed out",
                async function()
                {
                    initActive("us");
                    initActive("them");
                    pstate.state.teams[target].active.volatile.boosts[stat] =
                        6 * Math.sign(amount);
                    await initParser("us", move);
                    await handle(
                        {type: "boost", monRef: target, stat, amount: 0});
                    await exitParser();
                });

                if (ctg === "hit" && abilityImmunity)
                {
                    it(`Should fail unboost effect if ${abilityImmunity} ` +
                        "activates",
                    async function()
                    {
                        initActive("us");
                        initActive("them", immunityHolder);
                        await initParser("us", move);
                        await handle(
                        {
                            type: "activateAbility", monRef: target,
                            ability: abilityImmunity
                        });
                        await handle({type: "fail"});
                        await exitParser();
                    });

                    it("Should pass if moldbreaker broke through " +
                        abilityImmunity,
                    async function()
                    {
                        initActive("us").traits.setAbility("moldbreaker");
                        initActive("them").traits.setAbility(abilityImmunity);

                        await initParser("us", move);
                        await handle(
                            {type: "boost", monRef: target, stat, amount});
                        await exitParser();
                    });

                    it("Should throw if moldbreaker should've broken " +
                        `through ${abilityImmunity}` ,
                    async function()
                    {
                        initActive("us").traits.setAbility("moldbreaker");
                        initActive("them");

                        await initParser("us", move);
                        // move parser context should reject this event and
                        //  attempt to exit
                        await expect(handle(
                            {
                                type: "activateAbility", monRef: target,
                                ability: abilityImmunity
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "Expected effect that didn't happen: " +
                                `hit boost add {"${stat}":${amount}}`);
                    });

                    it(`Should rule out ${abilityImmunity} if it didn't ` +
                        "activate",
                    async function()
                    {
                        initActive("us");
                        // blocking ability or useless ability (illuminate)
                        const mon = initActive("them");
                        mon.traits.setAbility(abilityImmunity, "illuminate");
                        expect(mon.traits.ability.possibleValues)
                            .to.have.keys(abilityImmunity, "illuminate");

                        await initParser("us", move);
                        await handle(
                            {type: "boost", monRef: target, stat, amount});
                        expect(mon.traits.ability.possibleValues)
                            .to.have.keys("illuminate");
                        await exitParser();
                    });

                    it(`Should throw if ${abilityImmunity} didn't activate ` +
                        "when it's known",
                    async function()
                    {
                        initActive("us");
                        initActive("them").traits.setAbility(abilityImmunity);

                        await initParser("us", move);
                        await expect(handle(
                                {type: "boost", monRef: target, stat, amount}))
                            .to.eventually.be.rejectedWith(Error,
                                `Pokemon '${target}' should've activated ` +
                                `ability [${abilityImmunity}] but it wasn't ` +
                                "activated on-tryUnboost");
                    });
                }
            });
        }
        shouldHandleBoost("self", "leafstorm", "spa", -2);
        // can have hypercutter
        const pinsir: events.SwitchOptions =
        {
            species: "pinsir", gender: "M", level: 100, hp: 100,
            hpMax: 100
        };
        shouldHandleBoost("hit", "charm", "atk", -2, "hypercutter", pinsir);

        // set boost
        moveEffectTests.self.boost.push(function()
        {
            it("Should handle set boost", async function()
            {
                initActive("us");
                await initParser("us", "bellydrum");
                await handle({type: "takeDamage", monRef: "us", hp: 50});
                await handle(
                {
                    type: "boost", monRef: "us", stat: "atk", amount: 6,
                    set: true
                });
                await exitParser(); // shouldn't throw
            });
        });

        function shouldHandlePartialBoost(ctg: "self" | "hit", move: string,
            stat: dexutil.BoostName, amount: 2 | -2): void
        {
            const sign = Math.sign(amount);
            const target = ctg === "self" ? "us" : "them"
            moveEffectTests[ctg].boost.push(function()
            {
                it("Should allow partial boost if maxing out", async function()
                {
                    let mon = initActive("us");
                    if (target === "them") mon = initActive("them");
                    mon.volatile.boosts[stat] = sign * 5;
                    await initParser("us", move);
                    await handle(
                        {type: "boost", monRef: target, stat, amount: sign});
                    await exitParser(); // shouldn't throw
                });

                it("Should allow 0 boost if maxed out", async function()
                {
                    let mon = initActive("us");
                    if (target === "them") mon = initActive("them");
                    mon.volatile.boosts[stat] = sign * 6;
                    await initParser("us", move);
                    await handle(
                        {type: "boost", monRef: target, stat, amount: 0});
                    await exitParser(); // shouldn't throw
                });
            });
        }
        shouldHandlePartialBoost("self", "swordsdance", "atk", 2);
        shouldHandlePartialBoost("hit", "captivate", "spa", -2);

        function shouldHandleSecondaryBoost(ctg: "self" | "hit", move: string,
            stat: dexutil.BoostName, amount: number): void
        {
            moveEffectTests[ctg].boost.push(function()
            {
                it("Should handle boost via secondary effect using " + move,
                async function()
                {
                    const target = ctg === "self" ? "us" : "them";
                    initActive("us");
                    initActive("them");
                    await initParser("us", move);
                    await handle({type: "boost", monRef: target, stat, amount});
                    await exitParser(); // shouldn't throw
                });

                it("Shouldn't throw if no secondary boost using " + move,
                async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("us", move);
                    await exitParser(); // shouldn't throw
                });
            });
        }
        shouldHandleSecondaryBoost("self", "chargebeam", "spa", 1);
        shouldHandleSecondaryBoost("hit", "rocksmash", "def", -1);

        function shouldHandle100SecondaryBoost(ctg: "self" | "hit",
            move: string, stat: dexutil.BoostName, amount: number): void
        {
            const sign = Math.sign(amount);
            const target = ctg === "self" ? "us" : "them"
            moveEffectTests[ctg].boost.push(function()
            {
                it("Should throw if reject before 100% secondary effect",
                async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("us", move);
                    await expect(exitParser())
                        .to.eventually.be.rejectedWith(Error,
                            "Expected effect that didn't happen: " +
                            `hit boost add {"${stat}":${amount}}`);
                });

                it("Should allow no boost event for 100% secondary effect if " +
                    "maxed out",
                async function()
                {
                    let mon = initActive("us");
                    if (target === "them") mon = initActive("them");
                    mon.volatile.boosts[stat] = sign * 6;
                    await initParser("us", move);
                    await exitParser(); // shouldn't throw
                });
            });
        }
        shouldHandle100SecondaryBoost("hit", "rocktomb", "spe", -1);

        //#endregion

        //#region team effect

        // healingWish/lunarDance
        moveEffectTests.self.team.push(function()
        {
            // can only be explicitly ended by a separate event, not a move
            const faintMoves =
            [
                ["Healing Wish", "healingWish", "healingwish"],
                ["Lunar Dance", "lunarDance", "lunardance"]
            ] as const;
            for (const [name, effect, move] of faintMoves)
            {
                describe(name, function()
                {
                    it("Should handle faint/selfSwitch effects",
                    async function()
                    {
                        initActive("us");
                        initActive("them");
                        const team = state.teams.them;

                        // use wishing move to faint user
                        await initParser("them", move);
                        await handle({type: "faint", monRef: "them"});
                        expect(team.status[effect]).to.be.true;
                        // wait for opponent to choose replacement
                        // gen4: replacement is sent out immediately
                        await handle({type: "halt", reason: "wait"});

                        // replacement is sent
                        await handleEnd(
                            {type: "switchIn", monRef: "them", ...ditto});
                        // replacement is healed
                        // TODO: handle effect in switch context
                        /*await handle(
                        {
                            type: "activateTeamEffect", teamRef: "them",
                            effect, start: false
                        });
                        await exitParser();*/
                    });

                    it("Should not set if failed", async function()
                    {
                        initActive("us");
                        initActive("them");
                        const team = state.teams.them;
                        await initParser("them", move);
                        await handle({type: "fail"});
                        expect(team.status[effect]).to.be.false;
                    });

                    it("Should throw if no faint", async function()
                    {
                        initActive("them");
                        await initParser("them", move);
                        await expect(handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: false
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "Pokemon [them] haven't fainted yet");
                    });
                });
            }
        });

        // other non-screen self team effects
        moveEffectTests.self.team.push(function()
        {
            const otherMoves =
            [
                ["Lucky Chant", "luckyChant", "luckychant"],
                ["Mist", "mist", "mist"],
                ["Safeguard", "safeguard", "safeguard"],
                ["Tailwind", "tailwind", "tailwind"]
            ] as const;
            for (const [name, effect, move] of otherMoves)
            {
                describe(name, function()
                {
                    it("Should pass if expected", async function()
                    {
                        initActive("them");
                        await initParser("them", move);
                        await handle(
                        {
                            type: "activateTeamEffect", teamRef: "them",
                            effect, start: true
                        });
                    });

                    it("Should reject if start=false", async function()
                    {
                        initActive("them");
                        await initParser("them", move);
                        await expect(handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: false
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "Expected effect that didn't happen: " +
                                `self team ${effect}`)
                    });

                    it("Should reject if mismatched flags", async function()
                    {
                        initActive("them");
                        await initParser("them", "splash");
                        await reject(
                        {
                            type: "activateTeamEffect", teamRef: "them",
                            effect, start: true
                        });
                    });
                });
            }
        });

        // screen move self team effects
        moveEffectTests.self.team.push(function()
        {
            const screenMoves =
            [
                ["Light Screen", "lightScreen", "lightscreen"],
                ["Reflect", "reflect", "reflect"]
            ] as const;
            for (const [name, effect, move] of screenMoves)
            {
                describe(name, function()
                {
                    it("Should infer source via move", async function()
                    {
                        const team = state.teams.them;
                        const {item} = initActive("them");
                        await initParser("them", move);
                        await handle(
                        {
                            type: "activateTeamEffect", teamRef: "them",
                            effect, start: true
                        });
                        expect(team.status[effect].isActive).to.be.true;
                        expect(team.status[effect].source).to.equal(item);
                    });

                    it("Should still pass if start=false", async function()
                    {
                        initActive("us");
                        initActive("them");
                        await initParser("them", "tackle");
                        // TODO: track moves that can do this
                        await handle(
                        {
                            type: "activateTeamEffect", teamRef: "us",
                            effect, start: false
                        });
                    });

                    it("Should reject if mismatch", async function()
                    {
                        const {status: ts} = state.teams.them;
                        initActive("them");
                        await initParser("them", effect.toLowerCase());
                        const otherEffect = effect === "reflect" ?
                            "lightScreen" : "reflect";
                        await expect(handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect: otherEffect, start: true
                            }))
                            .to.eventually.be.rejectedWith(Error,
                                "Expected effect that didn't happen: " +
                                `self team ${effect}`);
                        expect(ts.reflect.isActive).to.be.false;
                        expect(ts.reflect.source).to.be.null;
                        // BaseContext should handle this
                        expect(ts.lightScreen.isActive).to.be.false;
                        expect(ts.lightScreen.source).to.be.null;
                    });
                });
            }
        });

        // hazard move hit team effects
        moveEffectTests.hit.team.push(function()
        {
            const hazardMoves =
            [
                ["Spikes", "spikes", "spikes"],
                ["Stealth Rock", "stealthRock", "stealthrock"],
                ["Toxic Spikes", "toxicSpikes", "toxicspikes"]
            ] as const;
            for (const [name, effect, move] of hazardMoves)
            {
                describe(name, function()
                {
                    it("Should pass if expected", async function()
                    {
                        initActive("us");
                        initActive("them");
                        await initParser("them", move);
                        await handle(
                        {
                            type: "activateTeamEffect", teamRef: "us",
                            effect, start: true
                        });
                    });

                    it("Should still pass if start=false", async function()
                    {
                        initActive("us");
                        initActive("them");
                        await initParser("them", "splash");
                        // TODO: track moves that can do this
                        await handle(
                        {
                            type: "activateTeamEffect", teamRef: "them",
                            effect, start: false
                        });
                    });

                    it("Should reject if mismatched flags", async function()
                    {
                        initActive("us");
                        initActive("them");
                        await initParser("them", "splash");
                        await reject(
                        {
                            type: "activateTeamEffect", teamRef: "us",
                            effect, start: true
                        });
                    });
                });
            }

        });

        //#endregion

        //#region implicit team effect

        function testImplicitTeamEffect(ctg: "self" | "hit", name: string,
            move: string, getter: (team: ReadonlyTeam) => boolean,
            exit?: boolean): void
        {
            const teamRef = ctg === "self" ? "them" : "us";
            moveEffectTests[ctg].implicitTeam.push(function()
            {
                describe(name, function()
                {
                    it(`Should set if using ${move}`, async function()
                    {
                        initActive("us");
                        initActive("them");
                        const team = state.teams[teamRef];
                        await initParser("them", move);
                        if (exit) await exitParser();
                        else await handle({type: "halt", reason: "wait"});
                        expect(getter(team)).to.be.true;
                    });

                    it(`Should not set if ${move} failed`, async function()
                    {
                        initActive("us");
                        initActive("them");
                        const team = state.teams[teamRef];
                        await initParser("them", move);
                        await handle({type: "fail"});
                        expect(getter(team)).to.be.false;
                        await exitParser();
                    });
                });
            });
        }

        testImplicitTeamEffect("self", "Wish", "wish",
            team => team.status.wish.isActive, /*exit*/ true)

        // TODO: move to primary self-switch test?
        // or move primary self-switch to self/hit MoveEffect to support phazing
        testImplicitTeamEffect("self", "Self-switch", "uturn",
            team => team.status.selfSwitch === true);
        testImplicitTeamEffect("self", "Baton Pass", "batonpass",
            team => team.status.selfSwitch === "copyvolatile");

        //#endregion

        //#region percent damage

        moveEffectTests.self.percentDamage.push(function()
        {
            describe("Healing moves", function()
            {
                it("Should handle recover hp", async function()
                {
                    initActive("them").hp.set(50);
                    await initParser("them", "recover");
                    await handle({type: "takeDamage", monRef: "them", hp: 100});
                    await exitParser();
                });

                it("Should handle weather-based recovery"); // TODO
            });
        });

        //#endregion

        for (const [ctgName, ctg] of
            [["Self", "self"], ["Hit", "hit"]] as const)
        {
            const testDict = moveEffectTests[ctg];
            describe(`${ctgName} MoveEffect`, function()
            {
                for (const [name, key] of
                [
                    ["StatusEffect", "status"],
                    ["UniqueEffect", "unique"],
                    ["ImplicitStatusEffect", "implicitStatus"],
                    ["BoostEffect", "boost"],
                    ["TeamEffect", "team"],
                    ["ImplicitTeamEffect", "implicitTeam"],
                    ["PercentDamage", "percentDamage"]
                ] as const)
                {
                    const testArr = testDict[key];
                    describe(name, function()
                    {
                        if (testArr.length <= 0) it("TODO");
                        else for (const testFunc of testArr) testFunc();
                    });
                }
            });
        }
    });

    // TODO: track in MoveData
    describe("Natural Gift move", async function()
    {
        it("Should infer berry if successful", async function()
        {
            initActive("us"); // to appease pressure check
            const mon = initActive("them");
            const item = mon.item;
            await initParser("them", "naturalgift");
            await exitParser();

            expect(mon.lastItem).to.equal(item,
                "Item was not consumed");
            expect(mon.lastItem.possibleValues)
                .to.have.keys(...Object.keys(dex.berries));
        });

        it("Should infer no berry if failed", async function()
        {
            initActive("us"); // to appease pressure check
            const mon = initActive("them");
            const item = mon.item;
            await initParser("them", "naturalgift");
            await handle({type: "fail"});
            expect(mon.item).to.equal(item, "Item was consumed");
            expect(mon.item.possibleValues)
                .to.not.have.any.keys(...Object.keys(dex.berries));
        });
    });

    // TODO: track ally move effects in MoveData
    describe("Ally moves", async function()
    {
        it("Should throw if not failed in a single battle");

        it("Should fail", async function()
        {
            initActive("us");
            await initParser("us", "helpinghand");
            await handle({type: "fail"});
            await exitParser();
        });
    });

    describe("Pressure ability handling", async function()
    {
        let us: Pokemon;

        beforeEach("Setup pressure mon", async function()
        {
            us = initActive("us");
            us.traits.setAbility("pressure");
        });

        it("Should use extra pp if targeted", async function()
        {
            const {moveset} = initActive("them");
            // since "us" wasn't mentioned, it will be inferred due to the
            //  targeting behavior of the move being used
            await initParser("them", "tackle");
            await exitParser();
            expect(moveset.get("tackle")!.pp).to.equal(54);
        });

        it("Should not use extra pp if not targeted", async function()
        {
            const {moveset} = initActive("them");
            await initParser("them", "splash");
            await exitParser();
            expect(moveset.get("splash")!.pp).to.equal(63);
        });

        it("Should not use double pp if self target", async function()
        {
            const mon = initActive("them");
            mon.traits.setAbility("pressure");
            await initParser("them", "splash");
            await exitParser();
            expect(mon.moveset.get("splash")!.pp).to.equal(63);
        });

        it("Should not use double pp if mold breaker", async function()
        {
            const mon = initActive("them");
            mon.traits.setAbility("moldbreaker");
            await initParser("them", "tackle");
            await exitParser();
            expect(mon.moveset.get("tackle")!.pp).to.equal(55);
        });
    });
}
