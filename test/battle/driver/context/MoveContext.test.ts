import { expect } from "chai";
import "mocha";
import * as dex from "../../../../src/battle/dex/dex";
import * as dexutil from "../../../../src/battle/dex/dex-util";
import * as effects from "../../../../src/battle/dex/effects";
import * as events from "../../../../src/battle/driver/BattleEvent";
import { AbilityContext } from
    "../../../../src/battle/driver/context/AbilityContext";
import { MoveContext } from "../../../../src/battle/driver/context/context";
import { ItemContext } from "../../../../src/battle/driver/context/ItemContext";
import { SwitchContext } from
    "../../../../src/battle/driver/context/SwitchContext";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon, ReadonlyPokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { ReadonlyTeam } from "../../../../src/battle/state/Team";
import { ReadonlyVariableTempStatus } from
    "../../../../src/battle/state/VariableTempStatus";
import { Logger } from "../../../../src/Logger";
import { ditto, smeargle } from "../helpers";

describe("MoveContext", function()
{
    let state: BattleState;

    beforeEach("Initialize BattleState", function()
    {
        state = new BattleState();
    });

    function initActive(monRef: Side, options = smeargle, teamSize = 1): Pokemon
    {
        state.teams[monRef].size = teamSize;
        return state.teams[monRef].switchIn(options)!;
    }

    function initCtx(event: events.UseMove, called?: boolean): MoveContext
    {
        return new MoveContext(state, event, Logger.null, called);
    }

    describe("constructor", function()
    {
        it("Should throw if unsupported move", function()
        {
            expect(() => initCtx({type: "useMove", monRef: "us", move: "_no_"}))
                .to.throw(Error, "Unsupported move '_no_'");
        });

        describe("called = false", function()
        {
            it("Should reset single-move statuses", function()
            {
                const {volatile: v} = initActive("us");
                v.destinyBond = true;
                initCtx({type: "useMove", monRef: "us", move: "tackle"});
                expect(v.destinyBond).to.be.false;
            });

            it("Should reveal move and deduct pp", function()
            {
                const {moveset, volatile} = initActive("us");
                expect(moveset.get("tackle")).to.be.null;
                expect(volatile.lastMove).to.be.null;
                initCtx({type: "useMove", monRef: "us", move: "tackle"});

                expect(moveset.get("tackle")).to.not.be.null;
                expect(moveset.get("tackle")).to.have.property("pp", 55);
                expect(volatile.lastMove).to.equal("tackle");
            });

            it("Should not deduct pp if releasing two-turn move", function()
            {
                const {moveset, volatile} = initActive("us");
                // assume pp was already deducted by preparing the move
                volatile.twoTurn.start("fly");

                // start a new turn
                state.postTurn();
                state.preTurn();

                // indicate that the two-turn move is being released
                initCtx({type: "useMove", monRef: "us", move: "fly"});
                expect(volatile.twoTurn.isActive).to.be.false;
                // should not deduct pp or even reveal the move, assuming the
                //  the start turn was called by an effect in this case
                expect(moveset.get("fly")).to.be.null;
                // shouldn't set when releasing two-turn move
                expect(volatile.lastMove).to.be.null;
            });

            it("Should deduct pp if starting a different two-turn move",
            function()
            {
                const {moveset, volatile} = initActive("us");
                // in the middle of preparing a two-turn move
                volatile.twoTurn.start("dig");

                // start a new turn
                state.postTurn();
                state.preTurn();

                // indicate that a different two-turn move is being started
                initCtx({type: "useMove", monRef: "us", move: "razorwind"});
                expect(volatile.twoTurn.isActive).to.be.true;
                // should deduct pp
                expect(moveset.get("razorwind")).to.not.be.null;
                expect(moveset.get("razorwind")).to.have.property("pp", 15);
                expect(volatile.lastMove).to.equal("razorwind");
            });

            it("Should not deduct pp if continuing locked move", function()
            {
                const {moveset, volatile} = initActive("us");
                // assume pp was already deducted by starting the move
                volatile.lockedMove.start("thrash");
                // indicate that the locked move is continuing
                initCtx({type: "useMove", monRef: "us", move: "thrash"});
                expect(volatile.lockedMove.isActive).to.be.true;
                // should not deduct pp or even reveal
                expect(moveset.get("thrash")).to.be.null;
                // shouldn't set when continuing
                expect(volatile.lastMove).to.be.null;
            });

            it("Should deduct pp if starting a different locked move",
            function()
            {
                const {moveset, volatile} = initActive("us");
                // in the middle of a locked move
                volatile.lockedMove.start("petaldance");
                // indicate that a different locked move is being used
                initCtx({type: "useMove", monRef: "us", move: "outrage"});
                expect(volatile.lockedMove.isActive).to.be.true;
                // should deduct pp
                expect(moveset.get("outrage")).to.not.be.null;
                expect(moveset.get("outrage")).to.have.property("pp", 23);
                expect(volatile.lastMove).to.equal("outrage");
            });

            it("Should not deduct pp if continuing rollout move", function()
            {
                const {moveset, volatile} = initActive("us");
                // assume pp was already deducted by starting the move
                volatile.rollout.start("iceball");
                // indicate that the rollout move is continuing
                initCtx({type: "useMove", monRef: "us", move: "iceball"});
                expect(volatile.rollout.isActive).to.be.true;
                // should not deduct pp or even reveal
                expect(moveset.get("iceball")).to.be.null;
                // shouldn't set when continuing
                expect(volatile.lastMove).to.be.null;
            });

            it("Should deduct pp if starting a different rollout move",
            function()
            {
                const {moveset, volatile} = initActive("us");
                // in the middle of a locked move
                volatile.rollout.start("iceball");
                // indicate that a different locked move is being used
                initCtx({type: "useMove", monRef: "us", move: "rollout"});
                expect(volatile.rollout.isActive).to.be.true;
                // should deduct pp
                expect(moveset.get("rollout")).to.not.be.null;
                expect(moveset.get("rollout")).to.have.property("pp", 31);
                expect(volatile.lastMove).to.equal("rollout");
            });

            it("Should not reveal move if struggle", function()
            {
                const {moveset, volatile} = initActive("us");
                initCtx({type: "useMove", monRef: "us", move: "struggle"});
                expect(moveset.get("struggle")).to.be.null;
                // should still set last move
                expect(volatile.lastMove).to.equal("struggle");
            });

            it("Should set choice item lock", function()
            {
                const mon = initActive("us");
                mon.item.narrow("choicescarf");
                expect(mon.volatile.choiceLock).to.be.null;
                initCtx({type: "useMove", monRef: "us", move: "pound"});
                expect(mon.volatile.choiceLock).to.equal("pound");
            });

            it("Should throw if using status move while Taunted", function()
            {
                const mon = initActive("us");
                mon.volatile.taunt.start();
                expect(() => initCtx(
                        {type: "useMove", monRef: "us", move: "protect"}))
                    .to.throw(Error, "Using status move 'protect' but " +
                        "should've been Taunted");
            });
        });

        describe("called = true", function()
        {
            it("Should not reset single-move statuses", function()
            {
                const {volatile} = initActive("us");
                volatile.destinyBond = true;
                initCtx({type: "useMove", monRef: "us", move: "tackle"},
                    /*called*/true);
                expect(volatile.destinyBond).to.be.true;
            });

            it("Shoud not reveal move", function()
            {
                const {moveset, volatile} = initActive("us");
                initCtx({type: "useMove", monRef: "us", move: "tackle"},
                    /*called*/true);
                expect(moveset.get("tackle")).to.be.null;
                expect(volatile.lastMove).to.be.null;
            });

            it("Should indicate called locked move", function()
            {
                const {volatile} = initActive("us");
                initActive("them");
                initCtx({type: "useMove", monRef: "us", move: "thrash"},
                        /*called*/true)
                    .expire();
                expect(volatile.lockedMove.isActive).to.be.true;
                expect(volatile.lockedMove.type).to.equal("thrash");
                expect(volatile.lockedMove.called).to.be.true;
                expect(volatile.lastMove).to.be.null;
            });

            it("Should indicate called rollout move", function()
            {
                const {volatile} = initActive("us");
                initActive("them");
                initCtx({type: "useMove", monRef: "us", move: "iceball"},
                        /*called*/true)
                    .expire();
                expect(volatile.rollout.isActive).to.be.true;
                expect(volatile.rollout.type).to.equal("iceball");
                expect(volatile.rollout.called).to.be.true;
                expect(volatile.lastMove).to.be.null;
            });
        });
    });

    describe("#handle()", function()
    {
        it("Should expire if no handler", function()
        {
            initActive("us");
            const ctx = initCtx(
                {type: "useMove", monRef: "us", move: "tackle"});
            expect(ctx.handle({type: "initOtherTeamSize", size: 1}))
                .to.not.be.ok;
        });

        describe("activateAbility", function()
        {
            it("Should return AbilityContext", function()
            {
                initActive("us");
                initActive("them");
                const ctx = initCtx(
                    {type: "useMove", monRef: "us", move: "watergun"});
                expect(ctx.handle(
                    {
                        type: "activateAbility", monRef: "them",
                        ability: "waterabsorb"
                    }))
                    .to.be.an.instanceOf(AbilityContext);
            });
        });

        describe("activateItem", function()
        {
            it("Should return ItemContext if appropriate", function()
            {
                initActive("us");
                const ctx = initCtx(
                    {type: "useMove", monRef: "us", move: "swift"});
                expect(ctx.handle(
                        {type: "activateItem", monRef: "us", item: "lifeorb"}))
                    .to.be.an.instanceOf(ItemContext);
            });

            it("Should expire if not appropriate", function()
            {
                initActive("us");
                const ctx = initCtx(
                    {type: "useMove", monRef: "us", move: "swift"});
                expect(ctx.handle(
                    {
                        type: "activateItem", monRef: "us", item: "leftovers"
                    }))
                    .to.not.be.ok;
            });
        });

        describe("block", function()
        {
            it("Should cancel move effects", function()
            {
                initActive("us");
                initActive("them").team!.status.safeguard.start();
                const ctx = initCtx(
                    {type: "useMove", monRef: "us", move: "thunderwave"});

                expect(ctx.handle(
                        {type: "block", monRef: "them", effect: "safeguard"}))
                    .to.be.true;
                ctx.expire(); // shouldn't throw
            });
        });

        describe("faint", function()
        {
            it("Should cancel effects of target", function()
            {
                initActive("us");
                initActive("them");
                // 100% confuse rate
                const ctx = initCtx(
                    {type: "useMove", monRef: "them", move: "dynamicpunch"});

                expect(ctx.handle({type: "faint", monRef: "us"}))
                    .to.be.true;
                ctx.expire(); // shouldn't throw
            });
        });

        // TODO: add to MoveData#self.unique
        describe("transform", function()
        {
            it("Should pass if user and source match", function()
            {
                initActive("us");
                initActive("them");
                const ctx = initCtx(
                    {type: "useMove", monRef: "them", move: "transform"});
                expect(ctx.handle(
                        {type: "transform", source: "them", target: "us"}))
                    .to.be.true;
            });

            it("Should expire if user/source mismatch", function()
            {
                initActive("them");
                const ctx = initCtx(
                    {type: "useMove", monRef: "them", move: "transform"});
                expect(ctx.handle(
                        {type: "transform", source: "us", target: "them"}))
                    .to.not.be.ok;
            });
        });
    });

    describe("Move effects", function()
    {
        describe("Primary", function()
        {
            describe("SelfSwitch", function()
            {
                // TODO: track phazing moves (will require selfSwitch effect to
                //  be moved to MoveEffect)
                it("Should return SwitchContext if self-switch expected",
                function()
                {
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "batonpass"});
                    expect(ctx.handle(
                            {type: "switchIn", monRef: "them", ...ditto}))
                        .to.be.an.instanceOf(SwitchContext);
                });

                it("Should expire if no self-switch expected", function()
                {
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "tackle"});
                    expect(ctx.handle(
                            {type: "switchIn", monRef: "them", ...ditto}))
                        .to.not.be.ok;
                });

                it("Should expire if self-switch expected but opponent " +
                    "switched",
                function()
                {
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "uturn"});
                    expect(ctx.handle(
                            {type: "switchIn", monRef: "us", ...ditto}))
                        .to.not.be.ok;
                });
            });

            describe("Delay", function()
            {
                describe("Future", function()
                {
                    it("Should handle future move", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                        {
                            type: "useMove", monRef: "them", move: "futuresight"
                        });
                        // shouldn't handle other cases
                        expect(ctx.handle(
                            {
                                type: "futureMove", monRef: "them",
                                move: "doomdesire", start: true
                            }))
                            .to.not.be.ok;
                        expect(ctx.handle(
                            {
                                type: "futureMove", monRef: "us",
                                move: "futuresight", start: false
                            }))
                            .to.not.be.ok;
                        // should handle this case
                        expect(ctx.handle(
                            {
                                type: "futureMove", monRef: "them",
                                move: "futuresight", start: true
                            }))
                            .to.be.true;
                    });
                });

                describe("Two-turn", function()
                {
                    it("Should handle two-turn move", function()
                    {
                        // prepare
                        const mon = initActive("them");
                        initActive("us");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "fly"});

                        expect(ctx.handle(
                            {
                                type: "prepareMove", monRef: "us", move: "fly"
                            }))
                            .to.not.be.ok;
                        expect(ctx.handle(
                            {
                                type: "prepareMove", monRef: "them", move: "fly"
                            }))
                            .to.be.true;
                        expect(() => ctx.handle(
                            {
                                type: "prepareMove", monRef: "them",
                                move: "bounce"
                            }))
                            .to.throw(Error, "Mismatched prepareMove: Using " +
                                "'fly' but got 'bounce'");
                        ctx.expire();

                        // release
                        mon.volatile.twoTurn.start("fly");
                        initCtx({type: "useMove", monRef: "them", move: "fly"})
                            .expire();
                        expect(mon.volatile.twoTurn.isActive).to.be.false;
                    });
                });
            });

            describe("CallEffect", function()
            {
                it("Should expire if no call effect expected", function()
                {
                    initActive("them");
                    const ctx = initCtx(
                    {
                        type: "useMove", monRef: "them",
                        move: "tackle"
                    });

                    expect(ctx.handle(
                            {type: "useMove", monRef: "them", move: "tackle"}))
                        .to.not.be.ok;
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
                        it(`Should pass if using ${caller}`, function()
                        {
                            initActive("them");
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "them", move: caller
                            });
                            expect(ctx.handle(
                                {
                                    type: "useMove", monRef: "them",
                                    move: "tackle"
                                }))
                                .to.be.an.instanceOf(MoveContext);
                            ctx.expire();
                        });
                    }
                });

                describe("Copycat callers", function()
                {
                    it("Should track last used move", function()
                    {
                        initActive("them");
                        expect(state.status.lastMove).to.not.be.ok;
                        initCtx(
                            {type: "useMove", monRef: "them", move: "tackle"});
                        expect(state.status.lastMove).to.equal("tackle");
                    });

                    for (const caller of copycatCallers)
                    {
                        it(`Should pass if using ${caller} and move matches`,
                        function()
                        {
                            initActive("them");
                            state.status.lastMove = "tackle";
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "them", move: caller
                            });
                            expect(ctx.handle(
                                {
                                    type: "useMove", monRef: "them",
                                    move: "tackle"
                                }))
                                .to.be.an.instanceOf(MoveContext);
                            ctx.expire();
                        });

                        it(`Should throw if using ${caller} and mismatched ` +
                            "move",
                        function()
                        {
                            initActive("them");
                            state.status.lastMove = "watergun";
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "them", move: caller
                            });
                            expect(ctx.handle(
                                {
                                    type: "useMove", monRef: "them",
                                    move: "tackle"
                                }))
                                .to.not.be.ok;
                            expect(() => ctx.expire())
                                .to.throw(Error, "Expected effects that " +
                                    "didn't happen: primary call ['copycat']");
                        });

                        it(`Should throw if ${caller} failed but should've ` +
                            "called",
                        function()
                        {
                            initActive("them");
                            state.status.lastMove = "tackle";
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "them", move: caller
                            });
                            expect(() => ctx.handle({type: "fail"}))
                                .to.throw(Error, "Copycat effect failed but " +
                                    "should've called 'tackle'");
                        });
                    }
                });

                describe("Mirror move-callers", function()
                {
                    it("Should track if targeted", function()
                    {
                        const us = initActive("us");
                        initActive("them");

                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "tackle"});
                        expect(us.volatile.mirrorMove).to.be.null;
                        ctx.expire();
                        expect(us.volatile.mirrorMove).to.equal("tackle");
                    });

                    it("Should track on continued rampage", function()
                    {
                        const us = initActive("us");
                        const them = initActive("them");
                        them.volatile.lockedMove.start("petaldance");
                        them.volatile.lockedMove.tick();

                        const ctx = initCtx(
                        {
                            type: "useMove", monRef: "them", move: "petaldance"
                        });
                        expect(us.volatile.mirrorMove).to.be.null;
                        ctx.expire();
                        expect(us.volatile.mirrorMove).to.equal("petaldance");
                    });

                    it("Should track on two-turn release turn", function()
                    {
                        const us = initActive("us");
                        const them = initActive("them");
                        us.volatile.mirrorMove = "previous"; // test value

                        // start a two-turn move
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "fly"});
                        expect(ctx.handle(
                            {
                                type: "prepareMove", monRef: "them", move: "fly"
                            }))
                            .to.be.true;
                        them.volatile.twoTurn.start("fly"); // base
                        ctx.expire();
                        // shouldn't count the charging turn
                        expect(us.volatile.mirrorMove).to.equal("previous");

                        // release the two-turn move
                        const ctx2 = initCtx(
                            {type: "useMove", monRef: "them", move: "fly"});
                        expect(us.volatile.mirrorMove).to.equal("previous");
                        ctx2.expire();
                        expect(us.volatile.mirrorMove).to.equal("fly");
                    });

                    it("Should track on called two-turn release turn",
                    function()
                    {
                        const us = initActive("us");
                        const them = initActive("them");
                        us.volatile.mirrorMove = "previous"; // test value

                        // call a two-turn move
                        const ctx = initCtx(
                        {
                            type: "useMove", monRef: "them",
                            move: otherCallers[0]
                        });
                        const ctx2 = ctx.handle(
                            {type: "useMove", monRef: "them", move: "fly"});
                        expect(ctx2).to.be.an.instanceOf(MoveContext);
                        expect((ctx2 as MoveContext).handle(
                            {
                                type: "prepareMove", monRef: "them", move: "fly"
                            }))
                            .to.be.true;
                        them.volatile.twoTurn.start("fly"); // base
                        (ctx2 as MoveContext).expire();
                        ctx.expire();

                        expect(us.volatile.mirrorMove).to.equal("previous");

                        // release the two-turn move
                        const ctx3 = initCtx(
                            {type: "useMove", monRef: "them", move: "fly"});
                        ctx3.expire();

                        expect(us.volatile.mirrorMove).to.equal("fly");
                    });

                    it("Should not track if not targeted", function()
                    {
                        const us = initActive("us");
                        initActive("them");
                        us.volatile.mirrorMove = "previous"; // test value
                        // move that can't target opponent
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "splash"});
                        ctx.expire();
                        expect(us.volatile.mirrorMove).to.equal("previous");
                    });

                    it("Should not track if non-mirror-able move", function()
                    {
                        const us = initActive("us");
                        initActive("them");
                        us.volatile.mirrorMove = "previous"; // test value
                        // move that can't be mirrored but targets opponent
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "feint"});
                        ctx.expire();
                        expect(us.volatile.mirrorMove).to.equal("previous");
                    });

                    it("Should not track if targeted by a called move",
                    function()
                    {
                        const us = initActive("us");
                        initActive("them");
                        us.volatile.mirrorMove = "previous"; // test value

                        // call a move
                        const ctx = initCtx(
                        {
                            type: "useMove", monRef: "them",
                            move: otherCallers[0]
                        });
                        const ctx2 = ctx.handle(
                            {
                                type: "useMove", monRef: "them", move: "tackle"
                            });
                        expect(ctx2).to.be.an.instanceOf(MoveContext);
                        (ctx2 as MoveContext).expire();
                        ctx.expire();

                        // shouldnt update
                        expect(us.volatile.mirrorMove).to.equal("previous");
                    });

                    for (const [name, move] of
                        [["lockedMove", "thrash"], ["rollout", "rollout"]] as
                            const)
                    {
                        it(`Should not track on called ${name} move`, function()
                        {
                            const us = initActive("us");
                            const them = initActive("them");
                            us.volatile.mirrorMove = "previous"; // test value

                            // call a move
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "them",
                                move: otherCallers[0]
                            });
                            const ctx2 = ctx.handle(
                                {type: "useMove", monRef: "them", move});
                            expect(ctx2).to.be.an.instanceOf(MoveContext);
                            (ctx2 as MoveContext).expire();
                            ctx.expire();

                            expect(them.volatile[name].isActive).to.be.true;
                            expect(them.volatile[name].type).to.equal(move);
                            expect(them.volatile[name].called).to.be.true;
                            // shouldn't update
                            expect(us.volatile.mirrorMove).to.equal("previous");

                            // continue the rampage on the next turn
                            const ctx3 = initCtx(
                                {type: "useMove", monRef: "them", move});
                            ctx3.expire();

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
                        function()
                        {
                            const them = initActive("them");
                            them.volatile.mirrorMove = "tackle";
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "them", move: caller
                            });
                            expect(ctx.handle(
                                {
                                    type: "useMove", monRef: "them",
                                    move: "tackle"
                                }))
                                .to.be.an.instanceOf(MoveContext);
                            ctx.expire();
                        });

                        it(`Should throw if using ${caller} and mismatched ` +
                            "move",
                        function()
                        {
                            const them = initActive("them");
                            them.volatile.mirrorMove = "watergun";
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "them", move: caller
                            });
                            expect(ctx.handle(
                                {
                                    type: "useMove", monRef: "them",
                                    move: "tackle"
                                }))
                                .to.not.be.ok;
                            expect(() => ctx.expire())
                                .to.throw(Error, "Expected effects that " +
                                    "didn't happen: primary call ['mirror']");
                        });

                        it(`Should throw if ${caller} failed but should've ` +
                            "called",
                        function()
                        {
                            const them = initActive("them");
                            them.volatile.mirrorMove = "watergun";
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "them", move: caller
                            });
                            expect(() => ctx.handle({type: "fail"}))
                                .to.throw(Error, "Mirror Move effect failed " +
                                    "but should've called 'watergun'");
                        });
                    }
                });

                describe("Self move-callers", function()
                {
                    for (const caller of selfMoveCallers)
                    {
                        it(`Should infer user's move when using ${caller}`,
                        function()
                        {
                            const them = initActive("them");

                            // use the move-caller
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "them", move: caller
                            });

                            // call the move
                            expect(ctx.handle(
                                {
                                    type: "useMove", monRef: "them",
                                    move: "tackle"
                                }))
                                .to.be.an.instanceOf(MoveContext);
                            expect(them.moveset.get("tackle")).to.not.be.null;
                            // shouldn't consume pp for the called move
                            expect(them.moveset.get("tackle")!.pp).to.equal(56);
                        });
                    }

                    it("Should expire if the call effect was ignored",
                    function()
                    {
                        const them = initActive("them");

                        const ctx = initCtx(
                        {
                            type: "useMove", monRef: "them",
                            move: selfMoveCallers[0]
                        });

                        expect(ctx.handle(
                            {
                                type: "useMove", monRef: "us", move: "tackle"
                            }))
                            .to.not.be.ok;
                        expect(them.moveset.get("tackle")).to.be.null;
                    });
                });

                describe("Target move-callers", function()
                {
                    for (const caller of targetMoveCallers)
                    {
                        it(`Should infer target's move when using ${caller}`,
                        function()
                        {
                            // switch in a pokemon that has the move-caller
                            const us = initActive("us");
                            const them = initActive("them");

                            // use the move-caller
                            const ctx = initCtx(
                                {type: "useMove", monRef: "us", move: caller});

                            // call the move
                            expect(ctx.handle(
                                {
                                    type: "useMove", monRef: "us",
                                    move: "tackle"
                                }))
                                .to.be.an.instanceOf(MoveContext);
                            expect(us.moveset.get("tackle")).to.be.null;
                            expect(them.moveset.get("tackle")).to.not.be.null;
                            // shouldn't consume pp for the called move
                            expect(them.moveset.get("tackle")!.pp).to.equal(56);
                        });
                    }

                    it("Should expire if the call effect was ignored",
                    function()
                    {
                        initActive("us");
                        const them = initActive("them");

                        const ctx = initCtx(
                        {
                            type: "useMove", monRef: "them",
                            move: targetMoveCallers[0]
                        });

                        expect(ctx.handle(
                            {
                                type: "useMove", monRef: "us", move: "tackle"
                            }))
                            .to.not.be.ok;
                        expect(them.moveset.get("tackle")).to.be.null;
                    });
                });

                describe("Reflected moves", function()
                {
                    it("Should pass reflected move", function()
                    {
                        initActive("us").volatile.magicCoat = true;
                        initActive("them");
                        // use reflectable move
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "yawn"});
                        // block and reflect the move
                        expect(ctx.handle(
                            {
                                type: "block", monRef: "us", effect: "magicCoat"
                            }))
                            .to.be.true;
                        expect(ctx.handle(
                                {type: "useMove", monRef: "us", move: "yawn"}))
                            .to.be.an.instanceOf(MoveContext);
                        ctx.expire();
                    });

                    it("Should not pass reflected move if no magicCoat status",
                    function()
                    {
                        initActive("us");
                        initActive("them");
                        // use reflectable move
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "yawn"});
                        // block and reflect the move
                        expect(ctx.handle(
                            {
                                type: "block", monRef: "us", effect: "magicCoat"
                            }))
                            .to.not.be.ok;
                    });

                    it("Should not pass reflected move if already reflected",
                    function()
                    {
                        initActive("us").volatile.magicCoat = true;
                        initActive("them").volatile.magicCoat = true;
                        // use reflectable move
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "yawn"});
                        // block and reflect the move
                        expect(ctx.handle(
                            {
                                type: "block", monRef: "us", effect: "magicCoat"
                            }))
                            .to.be.true;
                        const ctx2 = ctx.handle(
                            {type: "useMove", monRef: "us", move: "yawn"}) as
                            MoveContext;
                        expect(ctx2).to.be.an.instanceOf(MoveContext);
                        // block and reflect the move again
                        expect(ctx2.handle(
                            {
                                type: "block", monRef: "them",
                                effect: "magicCoat"
                            }))
                            .to.not.be.ok;
                    });

                    it("Should not pass reflected move if not reflectable",
                    function()
                    {
                        initActive("us").volatile.magicCoat = true;
                        initActive("them");
                        // use reflectable move
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "taunt"});
                        // block and reflect the move
                        expect(ctx.handle(
                            {
                                type: "block", monRef: "us", effect: "magicCoat"
                            }))
                            .to.not.be.ok;
                    });
                });
            });

            describe("SwapBoosts", function()
            {
                it("Should handle swap boost move", function()
                {
                    initActive("us");
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "guardswap"});

                    // shouldn't handle
                    expect(ctx.handle(
                        {
                            type: "swapBoosts", monRef1: "us", monRef2: "them",
                            stats: ["def", "spd", "spe"]
                        }))
                        .to.not.be.ok;
                    // should handle
                    expect(ctx.handle(
                        {
                            type: "swapBoosts", monRef1: "us", monRef2: "them",
                            stats: ["def", "spd"]
                        }))
                        .to.be.true;
                    // effect should be consumed after accepting the previous
                    //  swapBoosts event
                    expect(ctx.handle(
                        {
                            type: "swapBoosts", monRef1: "us", monRef2: "them",
                            stats: ["def", "spd"]
                        }))
                        .to.not.be.ok;
                    ctx.expire();
                });

                it("Should throw if expire before effect", function()
                {
                    initActive("us");
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "guardswap"});
                    expect(() => ctx.expire()).to.throw(Error,
                        "Expected effects that didn't happen: primary " +
                        "swapBoost ['def,spd']");
                });
            });

            describe("CountableStatusEffect", function()
            {
                it("TODO");
            });

            describe("FieldEffect", function()
            {
                it("Should pass if expected", function()
                {
                    initActive("us");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "us", move: "trickroom"});
                    expect(ctx.handle(
                        {
                            type: "activateFieldEffect", effect: "trickRoom",
                            start: true
                        }))
                        .to.be.true;
                });

                it("Should expire if not expected", function()
                {
                    initActive("us");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "us", move: "tackle"});
                    expect(ctx.handle(
                        {
                            type: "activateFieldEffect", effect: "gravity",
                            start: true
                        }))
                        .to.not.be.ok;
                });

                describe("weather", function()
                {
                    it("Should infer source via move", function()
                    {
                        const {item} = initActive("them");
                        const ctx = initCtx(
                        {
                            type: "useMove", monRef: "them", move: "raindance"
                        });
                        expect(ctx.handle(
                            {
                                type: "activateFieldEffect",
                                effect: "RainDance", start: true
                            }))
                            .to.be.true;

                        const weather = state.status.weather;
                        expect(weather.type).to.equal("RainDance");
                        expect(weather.duration).to.not.be.null;
                        expect(weather.source).to.equal(item);

                        // tick 5 times to infer item
                        expect(item.definiteValue).to.be.null;
                        for (let i = 0; i < 5; ++i) weather.tick();
                        expect(item.definiteValue).to.equal("damprock");
                    });

                    it("Should expire if mismatch", function()
                    {
                        initActive("us");
                        initActive("them");
                        const ctx = initCtx(
                        {
                            type: "useMove", monRef: "them", move: "raindance"
                        });
                        expect(ctx.handle(
                            {
                                type: "activateFieldEffect", effect: "Hail",
                                start: true
                            }))
                            .to.not.be.ok;
                        expect(() => ctx.expire()).to.throw(Error,
                            "Expected effects that didn't happen: primary " +
                            "field ['RainDance']");
                    });
                });
            });

            describe("Drain", function()
            {
                // can have clearbody or liquidooze
                const tentacruel: events.DriverSwitchOptions =
                {
                    species: "tentacruel", level: 100, gender: "M", hp: 364,
                    hpMax: 364
                };

                it("Should pass if expected", function()
                {
                    initActive("us");
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "absorb"});
                    // handle move damage
                    expect(ctx.handle(
                            {type: "takeDamage", monRef: "us", hp: 50}))
                        .to.be.true;
                    // handle drain effect
                    expect(ctx.handle(
                        {
                            type: "takeDamage", monRef: "them", hp: 100,
                            from: "drain"
                        }))
                        .to.be.true;
                    ctx.expire();
                });

                it("Should infer no liquidooze if normal", function()
                {
                    const mon = initActive("us", tentacruel);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("clearbody", "liquidooze");
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "drainpunch"});
                    // handle move damage
                    expect(ctx.handle(
                            {type: "takeDamage", monRef: "us", hp: 50}))
                        .to.be.true;
                    // handle drain effect
                    expect(ctx.handle(
                        {
                            type: "takeDamage", monRef: "them", hp: 100,
                            from: "drain"
                        }))
                        .to.be.true;
                    ctx.expire();
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("clearbody");
                    expect(mon.ability).to.equal("clearbody");
                });

                it("Should pass if liquidooze activates", function()
                {
                    initActive("us", tentacruel);
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "absorb"});
                    // handle move damage
                    expect(ctx.handle(
                            {type: "takeDamage", monRef: "us", hp: 50}))
                        .to.be.true;
                    // liquidooze ability activates to replace drain effect
                    const ctx2 = ctx.handle(
                    {
                        type: "activateAbility", monRef: "us",
                        ability: "liquidooze"
                    }) as AbilityContext;
                    expect(ctx2).to.be.an.instanceOf(AbilityContext);
                    // drain damage inverted due to liquidooze ability
                    expect(ctx2.handle(
                            {type: "takeDamage", monRef: "them", hp: 50}))
                        .to.be.true;
                    ctx2.expire();
                    ctx.expire();
                });
            });

            describe("Recoil", function()
            {
                // can have swiftswim or rockhead
                const relicanth: events.DriverSwitchOptions =
                {
                    species: "relicanth", level: 83, gender: "F", hp: 302,
                    hpMax: 302
                };

                it("Should pass if expected", function()
                {
                    initActive("us");
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "bravebird"});
                    expect(ctx.handle(
                        {
                            type: "takeDamage", monRef: "them", hp: 0,
                            from: "recoil"
                        }))
                        .to.be.true;
                    ctx.expire();
                });

                it("Should expire if not expected", function()
                {
                    initActive("us");
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "gust"});
                    expect(ctx.handle(
                        {
                            type: "takeDamage", monRef: "them", hp: 0,
                            from: "recoil"
                        }))
                        .to.not.be.ok;
                    ctx.expire();
                });

                function testRecoil(name: string, pre: (mon: Pokemon) => void,
                    recoilEvent: boolean, infer?: boolean | "throw"): void
                {
                    it(name, function()
                    {
                        initActive("them");
                        const mon = initActive("us", relicanth);
                        expect(mon.traits.ability.possibleValues)
                            .to.have.all.keys(["swiftswim", "rockhead"]);
                        pre?.(mon);

                        const ctx = initCtx(
                        {
                            type: "useMove", monRef: "us", move: "doubleedge"
                        });
                        if (recoilEvent)
                        {
                            expect(ctx.handle(
                                {
                                    type: "takeDamage", monRef: "us", hp: 0,
                                    from: "recoil"
                                }))
                                .to.be.true;
                            ctx.expire();
                        }
                        if (infer === "throw")
                        {
                            expect(() => ctx.expire()).to.throw(Error,
                                "Ability suppressed but still suppressed " +
                                "recoil");
                            return;
                        }
                        ctx.expire();
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
                implicitTeam: []
            },
            hit:
            {
                status: [], unique: [], implicitStatus: [], boost: [], team: [],
                implicitTeam: []
            }
        };

        //#region status effect

        function testNonRemovable(ctg: "self" | "hit", name: string,
            effect: effects.StatusType, move: string): void
        {
            // adjust perspective
            const target = ctg === "self" ? "them" : "us";

            moveEffectTests[ctg].status.push(function()
            {
                describe(name, function()
                {
                    beforeEach("Initialize active", function()
                    {
                        initActive("them");
                        initActive("us");
                    });

                    it("Should pass if expected", function()
                    {
                        // set last move in case of encore
                        initCtx({type: "useMove", monRef: "us", move: "splash"})
                            .expire();

                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateStatusEffect", monRef: target,
                                effect, start: true
                            }))
                            .to.be.true;
                    });

                    it("Should expire if start=false", function()
                    {
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateStatusEffect", monRef: target,
                                effect, start: false
                            }))
                            .to.not.be.ok;
                    });

                    it("Should expire if mismatched flags", function()
                    {
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "tackle"});
                        expect(ctx.handle(
                            {
                                type: "activateStatusEffect", monRef: target,
                                effect, start: true
                            }))
                            .to.not.be.ok;
                    });
                });
            });
        }

        function testRemovable(ctg: "self" | "hit", name: string,
            effect: effects.StatusType, move: string | undefined,
            secondaryMove?: string, secondaryMove100?: string,
            abilityImmunity?: string): void
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
                        it("Should pass if expected", function()
                        {
                            const ctx = initCtx(
                                {type: "useMove", monRef: "them", move});
                            expect(ctx.handle(
                                {
                                    type: "activateStatusEffect",
                                    monRef: target, effect, start: true
                                }))
                                .to.be.true;
                            ctx.expire();
                        });
                    }

                    it("Should still pass if start=false on an unrelated move",
                    function()
                    {
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "tackle"});
                        if (dexutil.isMajorStatus(effect))
                        {
                            // make sure majorstatus assertion passes
                            state.teams[target].active.majorStatus
                                .afflict(effect);
                        }
                        // TODO: track moves that can do this
                        expect(ctx.handle(
                            {
                                type: "activateStatusEffect", monRef: target,
                                effect, start: false
                            }))
                            .to.be.true;
                        ctx.expire();
                    });

                    if (secondaryMove)
                    {
                        it("Should pass if expected via secondary effect",
                        function()
                        {
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "them", move:
                                secondaryMove
                            });
                            expect(ctx.handle(
                                {
                                    type: "activateStatusEffect",
                                    monRef: target, effect, start: true
                                }))
                                .to.be.true;
                            ctx.expire();
                        });
                    }

                    if (move)
                    {

                        it("Should expire if mismatched flags", function()
                        {
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "them", move: "tackle"
                            });
                            expect(ctx.handle(
                                {
                                    type: "activateStatusEffect",
                                    monRef: target, effect, start: true
                                }))
                                .to.not.be.ok;
                            ctx.expire();
                        });
                    }

                    if (secondaryMove100)
                    {
                        it("Should pass if expire before 100% secondary " +
                            "effect if the target is already afflicted",
                        function()
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
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "them",
                                move: secondaryMove100
                            });
                            ctx.expire();
                        });

                        it("Should throw if expire before 100% secondary " +
                            "effect",
                        function()
                        {
                            // remove owntempo possibility from smeargle
                            state.teams.us.active.traits
                                .setAbility("technician");
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "them", move:
                                secondaryMove100
                            });
                            expect(() => ctx.expire()).to.throw(Error,
                                "Expected effects that didn't happen: hit " +
                                `secondary status ['${effect}']`);
                        });
                    }

                    if (secondaryMove100 && abilityImmunity)
                    {
                        // TODO: generalize for other abilities
                        it("Should narrow ability if passed",
                        function()
                        {
                            const them = state.teams.them.active;
                            expect(them.traits.ability.possibleValues)
                                // smeargle abilities
                                .to.have.all.keys(["owntempo", "technician"]);
                            expect(them.ability).to.be.empty;
                            const ctx = initCtx(
                            {
                                type: "useMove", monRef: "us", move:
                                secondaryMove100
                            });
                            ctx.expire();
                            expect(them.ability).to.equal("owntempo");
                        });
                    }
                });
            });
        }

        testNonRemovable("self", "Aqua Ring", "aquaRing", "aquaring");
        testNonRemovable("hit", "Attract", "attract", "attract");
        testNonRemovable("self", "Charge", "charge", "charge");
        // curse
        moveEffectTests.hit.status.push(function()
        {
            describe("Curse", function()
            {
                it("Should pass if ghost type", function()
                {
                    initActive("us");
                    initActive("them", smeargle).volatile.addedType = "ghost";
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "curse"});
                    expect(ctx.handle(
                        {
                            type: "activateStatusEffect", monRef: "us",
                            effect: "curse", start: true
                        }))
                        .to.be.true;
                    ctx.expire();
                });

                it("Should expire if not ghost type", function()
                {
                    initActive("them", smeargle);
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "curse"});
                    expect(ctx.handle(
                        {
                            type: "activateStatusEffect", monRef: "us",
                            effect: "curse", start: true
                        }))
                        .to.not.be.ok;
                    // TODO: expect boosts
                    ctx.expire();
                });

                it("Should expire if start=false", function()
                {
                    initActive("them").volatile.addedType = "ghost";
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "curse"});
                    expect(ctx.handle(
                        {
                            type: "activateStatusEffect", monRef: "us",
                            effect: "curse", start: false
                        }))
                        .to.not.be.ok;
                });

                it("Should expire if mismatched flags", function()
                {
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "tackle"});
                    expect(ctx.handle(
                        {
                            type: "activateStatusEffect", monRef: "us",
                            effect: "curse", start: true
                        }))
                        .to.not.be.ok;
                });
            });
        });
        testNonRemovable("hit", "Embargo", "embargo", "embargo");
        testNonRemovable("hit", "Encore", "encore", "encore");
        // flashfire (TODO)
        moveEffectTests.hit.status.push(function()
        {
            describe("Flash Fire", function()
            {
                it("TODO");
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
                    function()
                    {
                        setup(id);

                        // if imprison fails, then the opponent shouldn't be
                        //  able to have any of our moves
                        const ctx = initCtx(
                            {type: "useMove", monRef: id, move: "imprison"});
                        expect(ctx.handle({type: "fail"})).to.be.true;
                        expect(them.moveset.constraint).to.not.include.any.keys(
                            [...us.moveset.moves.keys()]);
                    });
                }

                it("Should throw if shared moves", function()
                {
                    setup("us");

                    const ctx = initCtx(
                    {
                        type: "useMove", monRef: "them", move: "imprison"
                    });

                    expect(() => ctx.handle({type: "fail"}))
                        .to.throw(Error, "Imprison failed but both Pokemon " +
                            "have common moves: imprison");
                });
            });

            describe("Succeeded", function()
            {
                for (const id of ["us", "them"] as const)
                {
                    it(`Should infer a common move if ${id} succeeded`,
                    function()
                    {
                        setup(id);

                        // if imprison succeeds, then the opponent
                        //  should be able to have one of our moves
                        const ctx = initCtx(
                            {type: "useMove", monRef: id, move: "imprison"});
                        expect(ctx.handle(
                            {
                                type: "activateStatusEffect", monRef: id,
                                effect: "imprison", start: true
                            }))
                            .to.be.true;
                        expect(them.moveset.moveSlotConstraints)
                            .to.have.lengthOf(1);
                        expect(them.moveset.moveSlotConstraints[0])
                            .to.have.keys([...us.moveset.moves.keys()]);
                    });
                }

                it("Should throw if no shared moves", function()
                {
                    setup("us", /*sameOpponent*/false);
                    const ctx = initCtx(
                    {
                        type: "useMove", monRef: "us", move: "imprison"
                    });

                    // if imprison succeeds, then the opponent
                    //  should be able to have one of our moves
                    expect(() =>
                        ctx.handle(
                        {
                            type: "activateStatusEffect", monRef: "us",
                            effect: "imprison", start: true
                        }))
                        .to.throw(Error, "Imprison succeeded but both " +
                            "Pokemon cannot share any moves");
                });
            });
        });
        testNonRemovable("self", "Ingrain", "ingrain", "ingrain");
        testRemovable("hit", "Leech Seed", "leechSeed", "leechseed");
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
                    it("Should expire", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "tackle"});
                        expect(ctx.handle(
                            {
                                type: "activateStatusEffect", monRef: target,
                                effect: "slowStart", start: true
                            }))
                            .to.not.be.ok;
                    });
                });
            });
        }
        testRemovable("self", "Substitute", "substitute", "substitute");
        testNonRemovable("hit", "Suppress ability", "suppressAbility",
            "gastroacid");
        testNonRemovable("hit", "Taunt", "taunt", "taunt");
        testNonRemovable("hit", "Torment", "torment", "torment");
        testNonRemovable("self", "Water Sport", "waterSport", "watersport");
        testNonRemovable("hit", "Yawn", "yawn", "yawn");

        // updatable
        testRemovable("hit", "Confusion", "confusion", "confuseray",
            "psybeam", "dynamicpunch", "owntempo");
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
        testNonRemovable("self", "Roost", "roost", "roost");
        testNonRemovable("self", "Snatch", "snatch", "snatch");
        // stall
        moveEffectTests.self.status.push(function()
        {
            describe("Stall effect", function()
            {
                it("Should count stall turns then reset if failed", function()
                {
                    const v = initActive("them").volatile;
                    expect(v.stalling).to.be.false;
                    for (let i = 1; i <= 2; ++i)
                    {
                        state.preTurn();
                        const innerCtx = initCtx(
                            {type: "useMove", monRef: "them", move: "protect"});

                        expect(innerCtx.handle(
                            {
                                type: "activateStatusEffect", monRef: "them",
                                effect: "protect", start: true
                            }))
                            .to.be.true;
                        expect(v.stalling).to.be.true;
                        expect(v.stallTurns).to.equal(i);

                        state.postTurn();
                        expect(v.stalling).to.be.false;
                        expect(v.stallTurns).to.equal(i);
                    }

                    state.preTurn();
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "protect"});
                    expect(ctx.handle({type: "fail"})).to.be.true;
                    expect(v.stalling).to.be.false;
                    expect(v.stallTurns).to.equal(0);
                });

                it("Should reset stall count if using another move", function()
                {
                    const mon = initActive("them");
                    let ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "protect"});

                    // stall effect is put in place
                    expect(ctx.handle(
                        {
                            type: "activateStatusEffect", monRef: "them",
                            effect: "protect", start: true
                        }))
                        .to.be.true;
                    expect(mon.volatile.stalling).to.be.true;
                    expect(mon.volatile.stallTurns).to.equal(1);
                    ctx.expire();
                    state.postTurn();
                    expect(mon.volatile.stalling).to.be.false;
                    expect(mon.volatile.stallTurns).to.equal(1);

                    // some other move is used
                    state.preTurn();
                    ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "splash"});
                    ctx.halt();
                    expect(mon.volatile.stalling).to.be.false;
                    expect(mon.volatile.stallTurns).to.equal(0);
                });

                it("Should not reset counter if called", function()
                {
                    const mon = initActive("them");
                    let ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "endure"});

                    // stall effect is put in place
                    expect(ctx.handle(
                        {
                            type: "activateStatusEffect", monRef: "them",
                            effect: "endure", start: true
                        }))
                        .to.be.true;
                    ctx.expire();

                    // somehow the pokemon moves again in the same turn via call
                    //  effect
                    ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "metronome"});
                    const innerCtx = ctx.handle(
                        {type: "useMove", monRef: "them", move: "endure"});
                    expect(innerCtx).to.be.an.instanceOf(MoveContext)
                    expect((innerCtx as MoveContext).handle({type: "fail"}))
                        .to.be.true;
                    (innerCtx as MoveContext).expire();
                    ctx.expire();
                    expect(mon.volatile.stalling).to.be.true;
                    expect(mon.volatile.stallTurns).to.equal(1);
                });
            });
        });

        // major status
        testRemovable("hit", "Burn", "brn", "willowisp", "flamethrower");
        testRemovable("hit", "Freeze", "frz", undefined, "icebeam");
        testRemovable("hit", "Paralyze", "par", "stunspore", "thunderbolt",
            "zapcannon");
        testRemovable("hit", "Poison", "psn", "poisonpowder", "gunkshot");
        testRemovable("hit", "Sleep", "slp", "spore");
        testRemovable("hit", "Toxic", "tox", "toxic", "poisonfang");

        //#endregion

        //#region unique effect
        moveEffectTests.self.unique.push(function()
        {
            describe("Conversion", function()
            {
                it("Should infer move via type change", function()
                {
                    const mon = initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "them", move: "conversion"});

                    // changes into a water type, meaning the pokemon must
                    //  have a water type move
                    expect(ctx.handle(
                        {
                            type: "changeType", monRef: "them",
                            newTypes: ["water", "???"]
                        }))
                        .to.be.true;

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
                it("TODO");
            });
        });
        //#endregion

        //#region implicit status effect

        function testImplicitStatusEffect(ctg: "self" | "hit", name: string,
            move: string, event: events.Any,
            getter: (mon: ReadonlyPokemon) => boolean): void
        {
            const target = ctg === "self" ? "us" : "them";
            moveEffectTests[ctg].implicitStatus.push(function()
            {
                describe(name, function()
                {
                    it(`Should set if using ${move}`, function()
                    {
                        let mon = initActive("us");
                        if (target === "them") mon = initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "us", move});
                        ctx.handle(event);
                        ctx.expire();
                        expect(getter(mon)).to.be.true;
                    });

                    it(`Should not set if ${move} failed`, function()
                    {
                        let mon = initActive("us");
                        if (target === "them") mon = initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "us", move});
                        expect(ctx.handle({type: "fail"})).to.be.true;
                        ctx.expire();
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
                        function init(): ReadonlyVariableTempStatus<T>
                        {
                            initActive("us");
                            const vts = getter(initActive("them"));
                            expect(vts.isActive).to.be.false;
                            const ctx = initCtx(
                                {type: "useMove", monRef: "them", move});
                            ctx.expire();
                            state.postTurn();
                            expect(vts.isActive).to.be.true;
                            expect(vts.type).to.equal(move);
                            return vts;
                        }

                        it("Should set if successful", init);

                        it("Should reset if missed", function()
                        {
                            const vts = init();
                            const ctx = initCtx(
                                {type: "useMove", monRef: "them", move});
                            expect(vts.isActive).to.be.true;

                            expect(ctx.handle({type: "miss", monRef: "us"}))
                                .to.be.true;
                            expect(vts.isActive).to.be.false;
                        });

                        it("Should reset if opponent protected", function()
                        {
                            const vts = init();
                            const ctx = initCtx(
                                {type: "useMove", monRef: "them", move});
                            expect(vts.isActive).to.be.true;

                            expect(ctx.handle(
                                {
                                    type: "block", monRef: "us",
                                    effect: "protect"
                                }))
                                .to.be.true;
                            expect(vts.isActive).to.be.false;
                        });

                        it("Should not reset if opponent endured",
                        function()
                        {
                            const vts = init();
                            const ctx = initCtx(
                                {type: "useMove", monRef: "them", move});
                            expect(vts.isActive).to.be.true;

                            expect(ctx.handle(
                                {
                                    type: "block", monRef: "us",
                                    effect: "endure"
                                }))
                                .to.be.true;
                            expect(vts.isActive).to.be.true;
                        });

                        it("Should not consume pp if used consecutively",
                        function()
                        {
                            const vts = init();
                            expect(vts.isActive).to.be.true;
                            expect(vts.turns).to.equal(0);

                            const ctx = initCtx(
                                {type: "useMove", monRef: "them", move});
                            expect(vts.isActive).to.be.true;
                            expect(vts.turns).to.equal(0);

                            ctx.halt();
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
            stat: dexutil.BoostName, amount: number): void
        {
            const target = ctg === "self" ? "us" : "them";
            moveEffectTests[ctg].boost.push(function()
            {
                it("Should handle boost", function()
                {
                    initActive("us");
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "us", move});

                    expect(ctx.handle(
                            {type: "boost", monRef: target, stat, amount}))
                        .to.be.true;
                    ctx.expire(); // shouldn't throw
                });

                it("Should throw if expire before effect", function()
                {
                    initActive("us");
                    initActive("them");
                    const ctx = initCtx({type: "useMove", monRef: "us", move});

                    expect(() => ctx.expire()).to.throw(Error,
                        `Expected effects that didn't happen: ${ctg} boost ` +
                        `add ${stat} ['${amount}']`);
                });
            });
        }
        shouldHandleBoost("self", "leafstorm", "spa", -2);
        shouldHandleBoost("hit", "charm", "atk", -2);

        // set boost
        moveEffectTests.self.boost.push(function()
        {
            it("Should handle set boost", function()
            {
                initActive("us");
                const ctx = initCtx(
                    {type: "useMove", monRef: "us", move: "bellydrum"});

                expect(ctx.handle(
                    {
                        type: "boost", monRef: "us", stat: "atk", amount: 6,
                        set: true
                    }))
                    .to.be.true;
                ctx.expire(); // shouldn't throw
            });
        });

        function shouldHandlePartialBoost(ctg: "self" | "hit", move: string,
            stat: dexutil.BoostName, amount: 2 | -2): void
        {
            const sign = Math.sign(amount);
            const target = ctg === "self" ? "us" : "them"
            moveEffectTests[ctg].boost.push(function()
            {
                it("Should allow partial boost if maxing out", function()
                {
                    let mon = initActive("us");
                    if (target === "them") mon = initActive("them");
                    mon.volatile.boosts[stat] = sign * 5;
                    const ctx = initCtx({type: "useMove", monRef: "us", move});

                    expect(ctx.handle(
                        {
                            type: "boost", monRef: target, stat, amount: sign
                        }))
                        .to.be.true;
                    ctx.expire(); // shouldn't throw
                });

                it("Should allow 0 boost if maxed out", function()
                {
                    let mon = initActive("us");
                    if (target === "them") mon = initActive("them");
                    mon.volatile.boosts[stat] = sign * 6;
                    const ctx = initCtx({type: "useMove", monRef: "us", move});

                    expect(ctx.handle(
                            {type: "boost", monRef: target, stat, amount: 0}))
                        .to.be.true;
                    ctx.expire(); // shouldn't throw
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
                function()
                {
                    const target = ctg === "self" ? "us" : "them";
                    initActive("us");
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "us", move});
                    expect(ctx.handle(
                            {type: "boost", monRef: target, stat, amount}))
                        .to.be.true;
                    ctx.expire(); // shouldn't throw
                });

                it("Shouldn't throw if no boost event using " + move,
                function()
                {
                    initActive("us");
                    initActive("them");
                    const ctx = initCtx(
                        {type: "useMove", monRef: "us", move});
                    ctx.expire(); // shouldn't throw
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
                it("Should throw if expire before 100% secondary effect",
                function()
                {
                    initActive("us");
                    initActive("them");
                    const ctx = initCtx({type: "useMove", monRef: "us", move});
                    expect(() => ctx.expire()).to.throw(Error,
                        "Expected effects that didn't happen: hit secondary " +
                        `boost add ${stat} ['${amount}']`);
                });

                it("Should allow no boost event for 100% secondary " +
                    "effect if maxed out",
                function()
                {
                    let mon = initActive("us");
                    if (target === "them") mon = initActive("them");
                    mon.volatile.boosts[stat] = sign * 6;
                    const ctx = initCtx({type: "useMove", monRef: "us", move});
                    ctx.expire(); // shouldn't throw
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
                ["Lunar Dnace", "lunarDance", "lunardance"]
            ] as const;
            for (const [name, effect, move] of faintMoves)
            {
                describe(name, function()
                {
                    it("Should set if successful faint", function()
                    {
                        initActive("us");
                        initActive("them");
                        const team = state.teams.them;

                        // use wishing move to faint user
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle({type: "faint", monRef: "them"}))
                            .to.be.true;
                        ctx.halt();
                        expect(team.status[effect]).to.be.true;

                        // replacement is sent
                        expect(ctx.handle(
                                {type: "switchIn", monRef: "them", ...ditto}))
                            .to.be.an.instanceOf(SwitchContext);
                        // implicit: handle switch events, then expire at the
                        //  healingwish event allowing the MoveContext to handle
                        //  it
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: false
                            }))
                            .to.be.true;
                        ctx.expire();
                    });

                    it("Should not set if failed", function()
                    {
                        initActive("us");
                        initActive("them");
                        const team = state.teams.them;
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle({type: "fail"})).to.be.true;
                        expect(team.status[effect]).to.be.false;
                    });

                    it("Should expire if effect not expected", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: true
                            }))
                            .to.not.be.ok;
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
                    it("Should pass if expected", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: true
                            }))
                            .to.be.true;
                    });

                    it("Should expire if start=false", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: false
                            }))
                            .to.not.be.ok;
                    });

                    it("Should expire if mismatched flags", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "tackle"});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: true
                            }))
                            .to.not.be.ok;
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
                    it("Should infer source via move", function()
                    {
                        const team = state.teams.them;
                        const {item} = initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: true
                            }))
                            .to.be.true;
                        expect(team.status[effect].isActive).to.be.true;
                        expect(team.status[effect].source).to.equal(item);
                    });

                    it("Should expire if mismatch", function()
                    {
                        const {status: ts} = state.teams.them;
                        initActive("them");
                        const ctx = initCtx(
                        {
                            type: "useMove", monRef: "them",
                            move: effect.toLowerCase()
                        });
                        const otherEffect = effect === "reflect" ?
                            "lightScreen" : "reflect";
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect: otherEffect, start: true
                            }))
                            .to.not.be.ok;
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
                    it("Should pass if expected", function()
                    {
                        initActive("us");
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "us",
                                effect, start: true
                            }))
                            .to.be.true;
                    });

                    it("Should still pass if start=false", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        // TODO: track moves that can do this
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "them",
                                effect, start: false
                            }))
                            .to.be.true;
                    });

                    it("Should expire if mismatched flags", function()
                    {
                        initActive("them");
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move: "tackle"});
                        expect(ctx.handle(
                            {
                                type: "activateTeamEffect", teamRef: "us",
                                effect, start: true
                            }))
                            .to.not.be.ok;
                    });
                });
            }

        });

        //#endregion

        //#region implicit team effect

        function testImplicitTeamEffect(ctg: "self" | "hit", name: string,
            move: string, getter: (team: ReadonlyTeam) => boolean): void
        {
            const teamRef = ctg === "self" ? "them" : "us";
            moveEffectTests[ctg].implicitTeam.push(function()
            {
                describe(name, function()
                {
                    it(`Should set if using ${move}`, function()
                    {
                        initActive("us");
                        initActive("them");
                        const team = state.teams[teamRef];
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        ctx.halt(); // expire would've consumed self-switch
                        expect(getter(team)).to.be.true;
                    });

                    it(`Should not set if ${move} failed`, function()
                    {
                        initActive("us");
                        initActive("them");
                        const team = state.teams[teamRef];
                        const ctx = initCtx(
                            {type: "useMove", monRef: "them", move});
                        expect(ctx.handle({type: "fail"})).to.be.true;
                        expect(getter(team)).to.be.false;
                        ctx.expire();
                    });
                });
            });
        }

        testImplicitTeamEffect("self", "Wish", "wish",
            team => team.status.wish.isActive)

        // TODO: move to primary self-switch test?
        // or move primary self-switch to self/hit MoveEffect to support phazing
        testImplicitTeamEffect("self", "Self-switch", "uturn",
            team => team.status.selfSwitch === true);
        testImplicitTeamEffect("self", "Baton Pass", "batonpass",
            team => team.status.selfSwitch === "copyvolatile");

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
                    ["ImplicitTeamEffect", "implicitTeam"]
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
    describe("Natural Gift move", function()
    {
        it("Should infer berry if successful", function()
        {
            initActive("us"); // to appease pressure check
            const mon = initActive("them");
            const item = mon.item;
            const ctx = initCtx(
                {type: "useMove", monRef: "them", move: "naturalgift"});
            ctx.halt();

            expect(mon.lastItem).to.equal(item,
                "Item was not consumed");
            expect(mon.lastItem.possibleValues)
                .to.have.keys(...Object.keys(dex.berries));
        });

        it("Should infer no berry if failed", function()
        {
            initActive("us"); // to appease pressure check
            const mon = initActive("them");
            const item = mon.item;
            const ctx = initCtx(
                {type: "useMove", monRef: "them", move: "naturalgift"});
            expect(ctx.handle({type: "fail"})).to.be.true;

            expect(mon.item).to.equal(item, "Item was consumed");
            expect(mon.item.possibleValues)
                .to.not.have.any.keys(...Object.keys(dex.berries));
        });
    });

    // TODO: track ally move effects in MoveData
    describe("Ally moves", function()
    {
        it("Should throw if not failed in a single battle");
    });

    describe("Pressure ability handling", function()
    {
        let us: Pokemon;

        beforeEach("Setup pressure mon", function()
        {
            us = initActive("us");
            us.traits.setAbility("pressure");
        });

        it("Should use extra pp if targeted", function()
        {
            const {moveset} = initActive("them");
            // since "us" wasn't mentioned, it will be inferred due to the
            //  targeting behavior of the move being used
            initCtx({type: "useMove", monRef: "them", move: "tackle"}).expire();
            expect(moveset.get("tackle")!.pp).to.equal(54);
        });

        it("Should not use extra pp if not targeted", function()
        {
            const {moveset} = initActive("them");
            initCtx({type: "useMove", monRef: "them", move: "splash"}).expire();
            expect(moveset.get("splash")!.pp).to.equal(63);
        });

        it("Should not use double pp if self target", function()
        {
            const mon = initActive("them");
            mon.traits.setAbility("pressure");
            initCtx({type: "useMove", monRef: "them", move: "splash"}).expire();
            expect(mon.moveset.get("splash")!.pp).to.equal(63);
        });

        it("Should not use double pp if mold breaker", function()
        {
            const mon = initActive("them");
            mon.traits.setAbility("moldbreaker");
            initCtx({type: "useMove", monRef: "them", move: "tackle"}).expire();
            expect(mon.moveset.get("tackle")!.pp).to.equal(55);
        });
    });
});
