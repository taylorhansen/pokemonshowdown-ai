import { expect } from "chai";
import "mocha";
import * as dex from "../../../../src/battle/dex/dex";
import * as dexutil from "../../../../src/battle/dex/dex-util";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { SubParserResult } from "../../../../src/battle/parser/BattleParser";
import { useMove } from "../../../../src/battle/parser/gen4/useMove";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon, ReadonlyPokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { ReadonlyTeam } from "../../../../src/battle/state/Team";
import { ReadonlyVariableTempStatus } from
    "../../../../src/battle/state/VariableTempStatus";
import { ditto, smeargle } from "../../../helpers/switchOptions";
import { InitialContext, ParserContext } from "./Context";
import { ParserHelpers, setupSubParserPartial, StateHelpers } from "./helpers";

export function testUseMove(ictx: InitialContext, getState: () => BattleState,
    sh: StateHelpers)
{
    /** Initializes the useMove parser. */
    const init = setupSubParserPartial(ictx.startArgs, getState, useMove);

    let pctx: ParserContext<SubParserResult>;
    const ph = new ParserHelpers(() => pctx, getState);

    afterEach("Close ParserContext", async function()
    {
        await ph.close();
    });

    let state: BattleState;

    beforeEach("Extract BattleState", function()
    {
        state = getState();
    });

    /** Initializes the useMove parser with the initial event. */
    async function initWithEvent(monRef: Side, move: string,
        called?: boolean | "bounced"): Promise<void>
    {
        pctx = init(called);
        await ph.handle({type: "useMove", monRef, move});
    }

    /**
     * Initializes the useMove parser with the initial event and expects it to
     * throw immediately after.
     */
    async function initReject(errorCtor: ErrorConstructor, message: string,
        monRef: Side, move: string, called?: boolean | "bounced"): Promise<void>
    {
        pctx = init(called);
        await ph.rejectError({type: "useMove", monRef, move}, errorCtor,
            message);
    }

    it("Should throw if unknown move", async function()
    {
        await initReject(Error, "Unknown move 'invalid'", "us", "invalid");
    });

    describe("called = false", function()
    {
        it("Should reset single-move statuses", async function()
        {
            sh.initActive("them");
            const {volatile: v} = sh.initActive("us");
            v.destinyBond = true;
            await initWithEvent("us", "splash");
            expect(v.destinyBond).to.be.false;
        });

        it("Should reveal move and deduct pp", async function()
        {
            sh.initActive("them");
            const {moveset, volatile} = sh.initActive("us");
            expect(moveset.get("splash")).to.be.null;
            expect(volatile.lastMove).to.be.null;
            await initWithEvent("us", "splash");

            expect(moveset.get("splash")).to.not.be.null;
            expect(moveset.get("splash")).to.have.property("pp", 63);
            expect(volatile.lastMove).to.equal("splash");
        });

        it("Should not deduct pp if releasing two-turn move", async function()
        {
            sh.initActive("them");
            const {moveset, volatile} = sh.initActive("us");
            // assume pp was already deducted by preparing the move
            volatile.twoTurn.start("fly");

            // start a new turn
            state.postTurn();
            state.preTurn();

            // indicate that the two-turn move is being released
            await initWithEvent("us", "fly");
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
            sh.initActive("them");
            const {moveset, volatile} = sh.initActive("us");
            // in the middle of preparing a two-turn move
            volatile.twoTurn.start("dig");

            // start a new turn
            state.postTurn();
            state.preTurn();

            // indicate that a different two-turn move is being started
            await initWithEvent("us", "razorwind");
            expect(volatile.twoTurn.isActive).to.be.true;
            // should deduct pp
            expect(moveset.get("razorwind")).to.not.be.null;
            expect(moveset.get("razorwind")).to.have.property("pp", 15);
            expect(volatile.lastMove).to.equal("razorwind");

            // for completeness so the BattleParser doesn't throw
            await ph.handle(
                {type: "prepareMove", monRef: "us", move: "razorwind"});
        });

        it("Should not deduct pp if continuing locked move", async function()
        {
            sh.initActive("them");
            const {moveset, volatile} = sh.initActive("us");
            // assume pp was already deducted by starting the move
            volatile.lockedMove.start("thrash");
            // indicate that the locked move is continuing
            await initWithEvent("us", "thrash");
            expect(volatile.lockedMove.isActive).to.be.true;
            // should not deduct pp or even reveal
            expect(moveset.get("thrash")).to.be.null;
            // shouldn't set when continuing
            expect(volatile.lastMove).to.be.null;
        });

        it("Should deduct pp if starting a different locked move",
        async function()
        {
            sh.initActive("them");
            const {moveset, volatile} = sh.initActive("us");
            // in the middle of a locked move
            volatile.lockedMove.start("petaldance");
            // indicate that a different locked move is being used
            await initWithEvent("us", "outrage");
            expect(volatile.lockedMove.isActive).to.be.true;
            // should deduct pp
            expect(moveset.get("outrage")).to.not.be.null;
            expect(moveset.get("outrage")).to.have.property("pp", 23);
            expect(volatile.lastMove).to.equal("outrage");
        });

        it("Should not deduct pp if continuing rollout move", async function()
        {
            sh.initActive("them");
            const {moveset, volatile} = sh.initActive("us");
            // assume pp was already deducted by starting the move
            volatile.rollout.start("iceball");
            // indicate that the rollout move is continuing
            await initWithEvent("us", "iceball");
            expect(volatile.rollout.isActive).to.be.true;
            // should not deduct pp or even reveal
            expect(moveset.get("iceball")).to.be.null;
            // shouldn't set when continuing
            expect(volatile.lastMove).to.be.null;
        });

        it("Should deduct pp if starting a different rollout move",
        async function()
        {
            sh.initActive("them");
            const {moveset, volatile} = sh.initActive("us");
            // in the middle of a locked move
            volatile.rollout.start("iceball");
            // indicate that a different locked move is being used
            await initWithEvent("us", "rollout");
            expect(volatile.rollout.isActive).to.be.true;
            // should deduct pp
            expect(moveset.get("rollout")).to.not.be.null;
            expect(moveset.get("rollout")).to.have.property("pp", 31);
            expect(volatile.lastMove).to.equal("rollout");
        });

        it("Should not reveal move if struggle", async function()
        {
            sh.initActive("them");
            const {moveset, volatile} = sh.initActive("us");
            await initWithEvent("us", "struggle");
            expect(moveset.get("struggle")).to.be.null;
            // should still set last move
            expect(volatile.lastMove).to.equal("struggle");
        });

        it("Should set choice item lock", async function()
        {
            sh.initActive("them");
            const mon = sh.initActive("us");
            mon.item.narrow("choicescarf");
            expect(mon.volatile.choiceLock).to.be.null;
            await initWithEvent("us", "splash");
            expect(mon.volatile.choiceLock).to.equal("splash");
        });

        it("Should throw if using status move while Taunted", async function()
        {
            const mon = sh.initActive("us");
            mon.volatile.taunt.start();
            await initReject(Error,
                "Using status move 'protect' but should've been Taunted",
                "us", "protect");
        });
    });

    describe("called = true", function()
    {
        it("Should not reset single-move statuses", async function()
        {
            sh.initActive("them");
            const {volatile} = sh.initActive("us");
            volatile.destinyBond = true;
            await initWithEvent("us", "splash", /*called*/true);
            expect(volatile.destinyBond).to.be.true;
        });

        it("Shoud not reveal move", async function()
        {
            sh.initActive("them");
            const {moveset, volatile} = sh.initActive("us");
            await initWithEvent("us", "splash", /*called*/true);
            expect(moveset.get("splash")).to.be.null;
            expect(volatile.lastMove).to.be.null;
        });

        it("Should indicate called locked move", async function()
        {
            sh.initActive("them");
            const {volatile} = sh.initActive("us");
            await initWithEvent("us", "thrash", /*called*/true);
            await ph.halt({});
            expect(volatile.lockedMove.isActive).to.be.true;
            expect(volatile.lockedMove.type).to.equal("thrash");
            expect(volatile.lockedMove.called).to.be.true;
            expect(volatile.lastMove).to.be.null;
        });

        it("Should indicate called rollout move", async function()
        {
            sh.initActive("them");
            const {volatile} = sh.initActive("us");
            await initWithEvent("us", "iceball", /*called*/true);
            await ph.halt({});
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
            sh.initActive("us");
            sh.initActive("them");
            await initWithEvent("us", "swift");
            await ph.handle({type: "takeDamage", monRef: "them", hp: 50});
            await ph.handle(
                {type: "activateItem", monRef: "us", item: "lifeorb"});
            await ph.handle({type: "takeDamage", monRef: "us", hp: 90});
        });

        it("Should reject if inappropriate item", async function()
        {
            sh.initActive("us");
            sh.initActive("them");
            await initWithEvent("us", "swift");
            await ph.reject(
                {type: "activateItem", monRef: "us", item: "leftovers"});
        });

        it("Should reject if inappropriate move", async function()
        {
            sh.initActive("us");
            sh.initActive("them");
            await initWithEvent("us", "seismictoss");
            await ph.handle({type: "takeDamage", monRef: "them", hp: 50});
            await ph.reject(
                {type: "activateItem", monRef: "us", item: "lifeorb"});
        });
    });

    describe("block", function()
    {
        it("Should cancel move effects", async function()
        {
            sh.initActive("us");
            sh.initActive("them").team!.status.safeguard.start();
            await initWithEvent("us", "thunderwave");
            await ph.handleEnd(
                {type: "block", monRef: "them", effect: "safeguard"});
        });

        describe("Substitute", function()
        {
            beforeEach("Initialize active and substitute", function()
            {
                sh.initActive("us");
                sh.initActive("them").volatile.substitute = true;
            });

            it("Should not throw if sub-ignoring move", async function()
            {
                await initWithEvent("us", "torment");
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "them",
                    effect: "torment", start: true
                });
                await ph.halt({});
            });

            it("Should block hit status effects", async function()
            {
                await initWithEvent("us", "zapcannon"); // hit status par
                await ph.handle(
                    {type: "block", monRef: "them", effect: "substitute"});
                await ph.halt({});
            });

            it("Should block hit boost effects", async function()
            {
                await initWithEvent("us", "rocktomb"); // hit boost spe -1
                await ph.handle(
                    {type: "block", monRef: "them", effect: "substitute"});
                await ph.halt({});
            });

            it("Should not block self effects", async function()
            {
                await initWithEvent("us", "leafstorm");
                await ph.handle(
                    {type: "block", monRef: "them", effect: "substitute"});
                await ph.handle(
                    {type: "boost", monRef: "us", stat: "spa", amount: -2});
                await ph.halt({});
            });

            it("Should not block self effects as Substitute ends",
            async function()
            {
                await initWithEvent("us", "leafstorm");
                await ph.handle(
                    {type: "block", monRef: "them", effect: "substitute"});
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "them",
                    effect: "substitute", start: false
                });
                await ph.handle(
                    {type: "boost", monRef: "us", stat: "spa", amount: -2});
                await ph.halt({});
            });

            it("Should throw if non-sub-ignoring move ignores sub",
            async function()
            {
                await initWithEvent("us", "tackle");
                await ph.rejectError(
                    {type: "takeDamage", monRef: "them", hp: 1}, Error,
                    "Move should've been blocked by target's Substitute");
            });
        });
    });

    describe("fail", function()
    {
        it("Should cancel move effects", async function()
        {
            sh.initActive("us");
            sh.initActive("them");
            await initWithEvent("us", "thunderwave");
            await ph.handle({type: "fail"});
            await ph.halt({});
        });

        it("Should end micleberry status", async function()
        {
            const mon = sh.initActive("us");
            sh.initActive("them");
            mon.volatile.micleberry = true;
            await initWithEvent("us", "thunderwave");
            await ph.handle({type: "fail"});
            await ph.halt({});
            expect(mon.volatile.micleberry).to.be.false;
        });
    });

    describe("faint", function()
    {
        it("Should cancel hit move effects", async function()
        {
            sh.initActive("us");
            sh.initActive("them");
            // 100% unboost chance
            await initWithEvent("them", "rocktomb");
            // target fainted before we could apply the effect
            await ph.handle({type: "takeDamage", monRef: "us", hp: 0});
            await ph.handle({type: "faint", monRef: "us"});
            await ph.halt({});
        });

        it("Should cancel item update effects", async function()
        {
            sh.initActive("us");
            sh.initActive("them").item.narrow("sitrusberry");
            await initWithEvent("us", "tackle");
            await ph.handle({type: "takeDamage", monRef: "them", hp: 0});
            await ph.handle({type: "faint", monRef: "them"});
            await ph.halt({});
        });

        describe("selfFaint", function()
        {
            it("Should pass self-faint move", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "explosion");
                await ph.handle({type: "takeDamage", monRef: "us", hp: 0});
                await ph.handle({type: "faint", monRef: "us"});
                await ph.handle({type: "faint", monRef: "them"});
                await ph.halt({});
            });

            it("Should throw if no self-faint", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "explosion");
                await ph.handle({type: "takeDamage", monRef: "us", hp: 0});
                await ph.handle({type: "faint", monRef: "us"});
                await ph.haltError(Error, "Pokemon [them] haven't fainted yet");
            });

            it("Should ignore item-postMoveDamage", async function()
            {
                sh.initActive("us");
                sh.initActive("them").setItem("lifeorb");
                await initWithEvent("them", "explosion");
                await ph.handle({type: "takeDamage", monRef: "us", hp: 0});
                await ph.handle({type: "faint", monRef: "us"});
                await ph.handle({type: "faint", monRef: "them"});
                await ph.halt({});
            });
        });
    });

    describe("halt", function()
    {
        it("Should reject if decide", async function()
        {
            sh.initActive("us");
            sh.initActive("them");
            await initWithEvent("us", "splash");
            await ph.reject({type: "halt", reason: "decide"});
        });

        it("Should reject if gameOver", async function()
        {
            sh.initActive("us");
            sh.initActive("them");
            await initWithEvent("us", "splash");
            await ph.reject({type: "halt", reason: "gameOver"});
        });
    });

    describe("noTarget", function()
    {
        it("Should cancel move effects", async function()
        {
            sh.initActive("us");
            // this event can happen if the opponent fainted before we use a
            //  move against it
            sh.initActive("them").faint();
            await initWithEvent("us", "toxic");
            await ph.handle({type: "noTarget", monRef: "us"});
            await ph.halt({});
        });

        it("Should not end micleberry status", async function()
        {
            const mon = sh.initActive("us");
            sh.initActive("them").faint();
            mon.volatile.micleberry = true;
            await initWithEvent("us", "thunderwave");
            await ph.handle({type: "noTarget", monRef: "us"});
            await ph.halt({});
            expect(mon.volatile.micleberry).to.be.true;
        });
    });

    describe("Micle Berry", function()
    {
        it("Should end micleberry status after block", async function()
        {
            sh.initActive("us").volatile.stall(true);
            const mon = sh.initActive("them");
            mon.volatile.micleberry = true;
            await initWithEvent("them", "tackle");
            await ph.handleEnd(
                {type: "block", monRef: "us", effect: "protect"});
            expect(mon.volatile.micleberry).to.be.false;
        });

        it("Should end micleberry status after two-turn hit", async function()
        {
            sh.initActive("us").volatile.stall(true);
            const mon = sh.initActive("them");
            mon.volatile.micleberry = true;
            await initWithEvent("them", "fly");
            await ph.handle({type: "prepareMove", monRef: "them", move: "fly"});
            await ph.halt({});
            // should only reset once the move hits
            expect(mon.volatile.micleberry).to.be.true;
            await initWithEvent("them", "fly");
            await ph.halt({});
            expect(mon.volatile.micleberry).to.be.false;
        });
    });

    describe("ConsumeOn-preHit items (resist berries)", function()
    {
        it("Should handle resist berry", async function()
        {
            sh.initActive("us").volatile.addedType = "water";
            sh.initActive("them");
            await initWithEvent("them", "thunder");
            await ph.handle(
                {type: "removeItem", monRef: "us", consumed: "wacanberry"});
            await ph.handle({type: "superEffective", monRef: "us"});
            await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
            await ph.halt({});
        });

        // TODO: implement type effectiveness assertions then test this further
    });

    describe("ConsumeOn-tryOHKO items (focussash)", function()
    {
        it("Should handle ohko-blocking item", async function()
        {
            sh.initActive("us");
            sh.initActive("them");
            await initWithEvent("them", "brickbreak");
            await ph.handle({type: "superEffective", monRef: "us"});
            await ph.handle({type: "takeDamage", monRef: "us", hp: 1});
            await ph.handle(
                {type: "removeItem", monRef: "us", consumed: "focussash"});
            await ph.halt({});
        });

        it("Should reject if not an ohko (not at full hp initially)",
        async function()
        {
            sh.initActive("us");
            sh.initActive("them").hp.set(99);
            await initWithEvent("us", "brickbreak");
            await ph.handle({type: "superEffective", monRef: "them"});
            await ph.handle({type: "takeDamage", monRef: "them", hp: 1});
            await ph.reject(
                {type: "removeItem", monRef: "them", consumed: "focussash"},
                {});
        });

        it("Should reject if not an ohko (not at 1hp)", async function()
        {
            sh.initActive("us");
            sh.initActive("them");
            await initWithEvent("us", "brickbreak");
            await ph.handle({type: "superEffective", monRef: "them"});
            await ph.handle({type: "takeDamage", monRef: "them", hp: 3});
            await ph.reject(
                {type: "removeItem", monRef: "them", consumed: "focussash"},
                {});
        });
    });

    describe("ConsumeOn-super items (enigmaberry)", function()
    {
        it("Should handle enigmaberry", async function()
        {
            sh.initActive("us").volatile.addedType = "water";
            sh.initActive("them").hp.set(50);
            await initWithEvent("them", "absorb");
            await ph.handle({type: "superEffective", monRef: "us"});
            await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
            await ph.handle(
                {type: "takeDamage", monRef: "them", hp: 100, from: "drain"});
            // item activates after drain effect
            await ph.handle(
                {type: "removeItem", monRef: "us", consumed: "enigmaberry"});
            await ph.handle({type: "takeDamage", monRef: "us", hp: 100});
            await ph.halt({});
        });

        it("Shouldn't activate enigmaberry if fainted", async function()
        {
            const mon = sh.initActive("us");
            mon.volatile.addedType = "water";
            mon.setItem("enigmaberry"); // will be expecteed to activate if hp>0
            sh.initActive("them");
            await initWithEvent("them", "thunder");
            await ph.handle({type: "superEffective", monRef: "us"});
            await ph.handle({type: "takeDamage", monRef: "us", hp: 0});
            // berry doesn't activate because hp=0
            await ph.handle({type: "faint", monRef: "us"});
            await ph.halt({});
        });
    });

    describe("ConsumeOn-postHit items (jabocaberry/rowapberry)", function()
    {
        it("Should handle jabocaberry (physical)", async function()
        {
            sh.initActive("us");
            sh.initActive("them");
            await initWithEvent("them", "tackle");
            await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
            await ph.handle(
                {type: "removeItem", monRef: "us", consumed: "jabocaberry"});
            await ph.handle({type: "takeDamage", monRef: "them", hp: 50});
            await ph.halt({});
        });

        it("Should handle rowapberry (special)", async function()
        {
            sh.initActive("us");
            sh.initActive("them");
            await initWithEvent("them", "ember");
            await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
            await ph.handle(
                {type: "removeItem", monRef: "us", consumed: "rowapberry"});
            await ph.handle({type: "takeDamage", monRef: "them", hp: 50});
            await ph.halt({});
        });
    });

    describe("Multi-hit", function()
    {
        it("Should handle multi-hit move", async function()
        {
            sh.initActive("us");
            sh.initActive("them");
            await initWithEvent("us", "doublekick");
            await ph.handle({type: "superEffective", monRef: "them"});
            await ph.handle({type: "takeDamage", monRef: "them", hp: 50});
            await ph.handle({type: "superEffective", monRef: "them"});
            await ph.handle({type: "takeDamage", monRef: "them", hp: 25});
            await ph.handle({type: "hitCount", monRef: "them", count: 2});
            await ph.halt({});
        });

        it("Should throw if invalid hitCount event", async function()
        {
            sh.initActive("us");
            sh.initActive("them");
            await initWithEvent("them", "triplekick");
            await ph.handle({type: "superEffective", monRef: "us"});
            await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
            await ph.rejectError({type: "hitCount", monRef: "them", count: 2},
                Error,
                "Invalid HitCount event: expected non-'them' 1 but got " +
                    "'them' 2");
        });

        it("Should throw if no hitCount event", async function()
        {
            sh.initActive("us");
            sh.initActive("them");
            await initWithEvent("us", "doublekick");
            await ph.handle({type: "superEffective", monRef: "them"});
            await ph.handle({type: "takeDamage", monRef: "them", hp: 50});
            await ph.handle({type: "superEffective", monRef: "them"});
            await ph.handle({type: "takeDamage", monRef: "them", hp: 50});
            await ph.haltError(Error,
                "Expected HitCount event to terminate multi-hit move");
        });
    });

    // TODO: handle
    describe.skip("Type effectiveness", function()
    {
        it("Should infer hiddenpower type from immune", async function()
        {
            sh.initActive("us");
            const {hpType} = sh.initActive("them");
            expect(hpType.definiteValue).to.be.null;

            await initWithEvent("them", "hiddenpower");
            await ph.handleEnd({type: "immune", monRef: "us"});
            expect(hpType.definiteValue).to.equal("ghost");
        });

        it("Should infer hiddenpower type from different opponent",
        async function()
        {
            const us = sh.initActive("us");
            us.volatile.addedType = "fire";
            const {hpType} = sh.initActive("them");
            expect(hpType.definiteValue).to.be.null;

            await initWithEvent("them", "hiddenpower");
            await ph.handle({type: "takeDamage", monRef: "us", hp: 1});
            await ph.halt({});
            expect(hpType.possibleValues).to.have.keys(
                "dark", "psychic", "dragon", "electric", "flying", "poison");
        });

        it("Should infer judgment plate type", async function()
        {
            sh.initActive("us");
            const {item} = sh.initActive("them");
            expect(item.definiteValue).to.be.null;

            await initWithEvent("them", "judgment");
            await ph.handleEnd({type: "immune", monRef: "us"});
            expect(item.definiteValue).to.equal("spookyplate"); // ghost
        });

        it("Should handle roost", async function()
        {
            const mon = sh.initActive("us");
            mon.volatile.addedType = "flying";
            mon.volatile.roost = true;
            sh.initActive("them");
            await initWithEvent("them", "earthquake");
            await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
            await ph.halt({});
        });

        it("Should allow fixed-damage move without type effectiveness event",
        async function()
        {
            sh.initActive("us").volatile.addedType = "steel";
            sh.initActive("them");
            await initWithEvent("them", "superfang");
            await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
            await ph.halt({});
        });

        it("Should treat Struggle as a typeless move", async function()
        {
            sh.initActive("us").volatile.addedType = "steel";
            sh.initActive("them");
            await initWithEvent("them", "struggle");
            await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
            await ph.handle(
                {type: "takeDamage", monRef: "them", hp: 50, from: "recoil"});
            await ph.halt({});
        });

        describe("immune", function()
        {
            it("Should handle type immunity and cancel move effects",
            async function()
            {
                sh.initActive("us").volatile.addedType = "ground";
                sh.initActive("them");
                await initWithEvent("them", "thunderwave");
                await ph.handleEnd({type: "immune", monRef: "us"});
            });

            it("Should handle status immunity", async function()
            {
                sh.initActive("us").volatile.addedType = "grass";
                sh.initActive("them");
                await initWithEvent("them", "leechseed");
                await ph.handleEnd({type: "immune", monRef: "us"});
            });

            it("Should handle major status immunity", async function()
            {
                sh.initActive("us").volatile.addedType = "poison";
                sh.initActive("them");
                await initWithEvent("them", "toxic");
                await ph.handleEnd({type: "immune", monRef: "us"});
            });

            it("Should reject if mismatched immunity", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "thunderwave");
                await ph.rejectError({type: "immune", monRef: "us"}, Error,
                    "Move effectiveness expected to be 'regular' but got " +
                        "'immune'");
            });
        });

        describe("resisted", function()
        {
            it("Should handle type effectiveness", async function()
            {
                sh.initActive("us").volatile.addedType = "ice";
                sh.initActive("them");
                await initWithEvent("them", "icebeam");
                await ph.handle({type: "resisted", monRef: "us"});
                await ph.halt({});
            });
        });

        describe("superEffective", function()
        {
            it("Should handle type effectiveness", async function()
            {
                sh.initActive("us").volatile.addedType = "ice";
                sh.initActive("them");
                await initWithEvent("them", "rockslide");
                await ph.handle({type: "superEffective", monRef: "us"});
                await ph.halt({});
            });
        });
    });

    describe("Move effects", function()
    {
        const moveEffectTests:
        {
            readonly [T in keyof NonNullable<dexutil.MoveData["effects"]>]-?:
                (() =>  void)[]
        } =
        {
            call: [], transform: [], delay: [], damage: [], count: [],
            boost: [], swapBoosts: [], status: [], team: [], field: [],
            changeType: [], disableMove: [], drain: [], recoil: [],
            selfFaint: [], selfSwitch: []
        };

        //#region call

        /** Tackle from `them` side. */
        const tackle: events.UseMove =
            {type: "useMove", monRef: "them", move: "tackle"};

        moveEffectTests.call.push(function()
        {
            it("Should reject if no call effect expected", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "tackle");
                await ph.reject(tackle);
            });
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

        moveEffectTests.call.push(() => describe("Move-callers", function()
        {
            for (const caller of otherCallers)
            {
                it(`Should handle ${caller}`, async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("them", caller);
                    await ph.handle(tackle);
                    await ph.halt({});
                });
            }
        }));

        moveEffectTests.call.push(() => describe("Copycat", function()
        {
            it("Should track last used move", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                expect(state.status.lastMove).to.not.be.ok;
                await initWithEvent("them", "splash");
                expect(state.status.lastMove).to.equal("splash");
            });

            for (const caller of copycatCallers)
            {
                it(`Should pass if using ${caller} and move matches`,
                async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    state.status.lastMove = "tackle";
                    await initWithEvent("them", caller);
                    await ph.handle(tackle);
                    await ph.halt({});
                });

                it(`Should throw if using ${caller} and mismatched ` +
                    "move",
                async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    state.status.lastMove = "watergun";
                    await initWithEvent("them", caller);
                    await ph.rejectError(tackle, Error,
                        "Call effect 'copycat' failed: " +
                            "Should've called 'watergun' but got " +
                            `'${tackle.move}'`);
                });
            }
        }));

        moveEffectTests.call.push(() => describe("Mirror Move", function()
        {
            it("Should track if targeted", async function()
            {
                const us = sh.initActive("us");
                sh.initActive("them");

                expect(us.volatile.mirrorMove).to.be.null;
                await initWithEvent("them", "tackle");
                expect(us.volatile.mirrorMove).to.equal("tackle");
                await ph.halt({});
            });

            it("Should track on continued rampage", async function()
            {
                const us = sh.initActive("us");
                const them = sh.initActive("them");
                them.volatile.lockedMove.start("petaldance");
                them.volatile.lockedMove.tick();

                expect(us.volatile.mirrorMove).to.be.null;
                await initWithEvent("them", "petaldance");
                expect(us.volatile.mirrorMove).to.equal("petaldance");
                await ph.halt({});
            });

            it("Should track only on two-turn release turn", async function()
            {
                const us = sh.initActive("us");
                sh.initActive("them");
                us.volatile.mirrorMove = "previous"; // test value

                // start a two-turn move
                await initWithEvent("them", "fly");
                await ph.handle(
                    {type: "prepareMove", monRef: "them", move: "fly"});
                await ph.halt({});
                // shouldn't count the charging turn
                expect(us.volatile.mirrorMove).to.equal("previous");

                // release the two-turn move
                expect(us.volatile.mirrorMove).to.equal("previous");
                await initWithEvent("them", "fly");
                expect(us.volatile.mirrorMove).to.equal("fly");
                await ph.halt({});
            });

            it("Should track on called two-turn release turn",
            async function()
            {
                const us = sh.initActive("us");
                sh.initActive("them");
                us.volatile.mirrorMove = "previous"; // test value

                // call a two-turn move
                await initWithEvent("them", otherCallers[0]);
                await ph.handle({type: "useMove", monRef: "them", move: "fly"});
                await ph.handle(
                    {type: "prepareMove", monRef: "them", move: "fly"});
                await ph.halt({});
                expect(us.volatile.mirrorMove).to.equal("previous");

                // release the two-turn move
                await initWithEvent("them", "fly");
                expect(us.volatile.mirrorMove).to.equal("fly");
                await ph.halt({});
            });

            it("Should not track if not targeted", async function()
            {
                const us = sh.initActive("us");
                sh.initActive("them");
                us.volatile.mirrorMove = "previous"; // test value
                // move that can't target opponent
                await initWithEvent("them", "splash");
                await ph.halt({});
                expect(us.volatile.mirrorMove).to.equal("previous");
            });

            it("Should not track if non-mirror-able move",
            async function()
            {
                const us = sh.initActive("us");
                sh.initActive("them");
                us.volatile.mirrorMove = "previous"; // test value
                // move that can't be mirrored but targets opponent
                await initWithEvent("them", "feint");
                await ph.halt({});
                expect(us.volatile.mirrorMove).to.equal("previous");
            });

            it("Should not track if targeted by a called move",
            async function()
            {
                const us = sh.initActive("us");
                sh.initActive("them");
                us.volatile.mirrorMove = "previous"; // test value

                // call a move
                await initWithEvent("them", otherCallers[0]);
                await ph.handle(tackle);
                await ph.halt({});

                expect(us.volatile.mirrorMove).to.equal("previous");
            });

            for (const [name, move] of
                [["lockedMove", "thrash"], ["rollout", "rollout"]] as const)
            {
                it(`Should not track on called ${name} move`,
                async function()
                {
                    const us = sh.initActive("us");
                    const them = sh.initActive("them");
                    us.volatile.mirrorMove = "previous"; // test value

                    // call a move
                    await initWithEvent("them", otherCallers[0]);
                    await ph.handle({type: "useMove", monRef: "them", move});
                    await ph.halt({});

                    expect(them.volatile[name].isActive).to.be.true;
                    expect(them.volatile[name].type).to.equal(move);
                    expect(them.volatile[name].called).to.be.true;
                    // shouldn't update
                    expect(us.volatile.mirrorMove).to.equal("previous");

                    // continue the rampage on the next turn
                    await initWithEvent("them", move);
                    await ph.halt({});

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
                    sh.initActive("us");
                    const them = sh.initActive("them");
                    them.volatile.mirrorMove = "tackle";
                    await initWithEvent("them", caller);
                    await ph.handle(tackle);
                    await ph.halt({});
                });

                it(`Should throw if using ${caller} and mismatched move`,
                async function()
                {
                    sh.initActive("us");
                    const them = sh.initActive("them");
                    them.volatile.mirrorMove = "watergun";
                    await initWithEvent("them", caller);
                    await ph.rejectError(tackle, Error,
                        "Call effect 'mirror' failed: " +
                            "Should've called 'watergun' but got " +
                            `'${tackle.move}'`);
                });
            }
        }));

        moveEffectTests.call.push(() => describe("Self move-callers", function()
        {
            for (const caller of selfMoveCallers)
            {
                it(`Should infer user's move when using ${caller}`,
                async function()
                {
                    sh.initActive("us");
                    const them = sh.initActive("them");
                    // use the move-caller
                    await initWithEvent("them", caller);
                    // call the move
                    await ph.handle(tackle);
                    // shouldn't consume pp for the called move
                    expect(them.moveset.get("tackle")).to.not.be.null;
                    expect(them.moveset.get("tackle")!.pp).to.equal(56);
                });
            }

            it("Should reject if the call effect was ignored",
            async function()
            {
                sh.initActive("us");
                const them = sh.initActive("them");
                await initWithEvent("them", selfMoveCallers[0]);
                await ph.rejectError(
                    {type: "useMove", monRef: "us", move: "tackle"}, Error,
                    "Call effect 'self' failed: Expected 'them' but got 'us'");
                expect(them.moveset.get("tackle")).to.be.null;
            });
        }));

        moveEffectTests.call.push(() => describe("Target move-callers",
        function()
        {
            for (const caller of targetMoveCallers)
            {
                it(`Should infer target's move when using ${caller}`,
                async function()
                {
                    // switch in a pokemon that has the move-caller
                    const us = sh.initActive("us");
                    const them = sh.initActive("them");

                    // use the move-caller
                    await initWithEvent("us", caller);
                    await ph.handle(
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
                sh.initActive("us");
                const them = sh.initActive("them");
                await initWithEvent("them", targetMoveCallers[0]);
                await ph.rejectError(
                    {type: "useMove", monRef: "us", move: "tackle"}, Error,
                    "Call effect 'target' failed: " +
                        "Expected 'them' but got 'us'");
                expect(them.moveset.get("tackle")).to.be.null;
            });
        }));

        moveEffectTests.call.push(() => describe("Reflected moves", function()
        {
            it("Should pass reflected move", async function()
            {
                sh.initActive("us").volatile.magicCoat = true;
                sh.initActive("them");
                // use reflectable move
                await initWithEvent("them", "yawn");
                // block and reflect the move
                await ph.handle(
                    {type: "block", monRef: "us", effect: "magicCoat"});
                await ph.handle({type: "useMove", monRef: "us", move: "yawn"});
                await ph.handle({type: "fail"}); // yawn effects
                await ph.halt({});
            });

            it("Should throw if reflecting move without an active " +
                "magicCoat status",
            async function()
            {
                sh.initActive("us").setAbility("illuminate"); // no immunity
                sh.initActive("them");
                // use reflectable move
                await initWithEvent("them", "yawn");
                // try to block and reflect the move
                await ph.rejectError(
                    {type: "block", monRef: "us", effect: "magicCoat"}, Error,
                    "Move 'yawn' status [yawn] was blocked by target 'us' " +
                        "but target's ability [illuminate] can't block it");
            });

            it("Should throw if reflecting an already reflected move",
            async function()
            {
                sh.initActive("us").volatile.magicCoat = true;
                const mon = sh.initActive("them");
                mon.volatile.magicCoat = true;
                mon.setAbility("illuminate"); // no immunity
                // use reflectable move
                await initWithEvent("them", "yawn");
                // block and reflect the move
                await ph.handle(
                    {type: "block", monRef: "us", effect: "magicCoat"});
                await ph.handle({type: "useMove", monRef: "us", move: "yawn"});
                // try to block and reflect the move again
                await ph.rejectError(
                    {type: "block", monRef: "them", effect: "magicCoat"}, Error,
                    "Move 'yawn' status [yawn] was blocked by target 'them' " +
                        "but target's ability [illuminate] can't block it");
            });

            it("Should throw if reflecting unreflectable move",
            async function()
            {
                const mon = sh.initActive("us");
                mon.volatile.magicCoat = true;
                mon.setAbility("illuminate"); // no immunity
                sh.initActive("them");
                // use reflectable move
                await initWithEvent("them", "taunt");
                // block and reflect the move
                await ph.rejectError(
                    {type: "block", monRef: "us", effect: "magicCoat"}, Error,
                    "Move 'taunt' status [taunt] was blocked by target 'us' " +
                        "but target's ability [illuminate] can't block it");
            });
        }));

        //#endregion

        //#region transform

        moveEffectTests.transform.push(function()
        {
            it("Should pass if user and source match", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "transform");
                await ph.handleEnd(
                    {type: "transform", source: "them", target: "us"});
            });

            it("Should reject if user/source mismatch", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "transform");
                await ph.rejectError(
                    {type: "transform", source: "us", target: "them"}, Error,
                    "Transform effect failed: " +
                        "Expected source 'them' but got 'us'");
            });
        });

        //#endregion

        //#region delay

        moveEffectTests.delay.push(() => describe("Future", function()
        {
            it("Should handle future move", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "futuresight");
                await ph.handleEnd(
                {
                    type: "futureMove", monRef: "them", move: "futuresight",
                    start: true
                });
            });

            it("Should throw if mismatched move", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "futuresight");
                await ph.rejectError(
                    {
                        type: "futureMove", monRef: "them", move: "doomdesire",
                        start: true
                    },
                    Error,
                    "Future effect 'futuresight' failed: " +
                        "Expected 'futuresight' but got 'doomdesire'");
            });

            it("Should throw if start=false", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "futuresight");
                await ph.rejectError(
                    {
                        type: "futureMove", monRef: "us", move: "futuresight",
                        start: false
                    },
                    Error, "Future effect 'futuresight' failed");
            });
        }));

        moveEffectTests.delay.push(() => describe("Two-turn", function()
        {
            it("Should handle two-turn move", async function()
            {
                // prepare
                const mon = sh.initActive("them");
                const move = mon.moveset.reveal("fly");
                expect(move.pp).to.equal(move.maxpp);
                sh.initActive("us");
                await initWithEvent("them", "fly");
                await ph.handle(
                    {type: "prepareMove", monRef: "them", move: "fly"});
                await ph.halt({});
                expect(move.pp).to.equal(move.maxpp - 1);

                // release
                mon.volatile.twoTurn.start("fly");
                await initWithEvent("them", "fly");
                expect(mon.volatile.twoTurn.isActive).to.be.false;
                expect(move.pp).to.equal(move.maxpp - 1);
                await ph.halt({});
            });

            it("Should handle shortened two-turn move via sun",
            async function()
            {
                const mon = sh.initActive("them");
                const move = mon.moveset.reveal("solarbeam");
                expect(move.pp).to.equal(move.maxpp);
                sh.initActive("us");
                state.status.weather.start(/*source*/ null, "SunnyDay");

                // prepare
                await initWithEvent("them", "solarbeam");
                await ph.handle(
                    {type: "prepareMove", monRef: "them", move: "solarbeam"});
                // after handling this event the SubParser will move straight to
                //  its useMove tail call to release the move, so the twoTurn
                //  status can't be checked before this happens
                // expect(mon.volatile.twoTurn.isActive).to.be.true;

                // release
                await ph.handle({type: "takeDamage", monRef: "us", hp: 10});
                await ph.halt({});
                expect(mon.volatile.twoTurn.isActive).to.be.false;
                expect(move.pp).to.equal(move.maxpp - 1);
            });

            it("Should handle shortened two-turn move via powerherb",
            async function()
            {
                const mon = sh.initActive("them");
                const move = mon.moveset.reveal("fly");
                expect(move.pp).to.equal(move.maxpp);
                mon.setItem("powerherb");
                sh.initActive("us");

                // prepare
                await initWithEvent("them", "fly");
                await ph.handle(
                    {type: "prepareMove", monRef: "them", move: "fly"});
                expect(mon.volatile.twoTurn.isActive).to.be.true;

                // consume item
                await ph.handle(
                {
                    type: "removeItem", monRef: "them", consumed: "powerherb"
                });

                // release
                await ph.handle({type: "takeDamage", monRef: "us", hp: 10});
                await ph.halt({});
                expect(mon.volatile.twoTurn.isActive).to.be.false;
                expect(move.pp).to.equal(move.maxpp - 1);
            });

            it("Should throw if monRef mismatch", async function()
            {
                sh.initActive("them");
                sh.initActive("us");
                await initWithEvent("them", "fly");
                await ph.rejectError(
                    {type: "prepareMove", monRef: "us", move: "fly"}, Error,
                    "TwoTurn effect 'fly' failed");
            });

            it("Should throw if mismatched prepareMove event",
            async function()
            {
                sh.initActive("them");
                sh.initActive("us");
                await initWithEvent("them", "fly");
                await ph.rejectError(
                    {type: "prepareMove", monRef: "them", move: "bounce"},
                    Error,
                    "TwoTurn effect 'fly' failed: " +
                        "Expected 'fly' but got 'bounce'");
            });
        }));

        //#endregion

        //#region damage

        // TODO(gen5): self/hit distinction
        moveEffectTests.damage.push(() => describe("Healing moves", function()
        {
            it("Should handle recover hp", async function()
            {
                sh.initActive("us");
                sh.initActive("them").hp.set(50);
                await initWithEvent("them", "recover");
                await ph.handle({type: "takeDamage", monRef: "them", hp: 100});
                await ph.halt({});
            });
        }));

        moveEffectTests.damage.push(() => describe("Split (painsplit)",
        function()
        {
            it("Should handle damage", async function()
            {
                sh.initActive("us");
                sh.initActive("them").hp.set(50);
                await initWithEvent("them", "painsplit")
                await ph.handle({type: "takeDamage", monRef: "them", hp: 75});
                await ph.handle({type: "takeDamage", monRef: "us", hp: 75});
                await ph.halt({});
            });
        }));

        //#endregion

        //#region count

        moveEffectTests.count.push(function()
        {
            // TODO: better handling for perishsong events
            it("Should pass if expected using perishsong", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("us", "perishsong");
                await ph.handle(
                {
                    type: "countStatusEffect", monRef: "us", effect: "perish",
                    amount: 3
                });
                await ph.handle(
                {
                    type: "countStatusEffect", monRef: "them", effect: "perish",
                    amount: 3
                });
                await ph.halt({});
            });

            it("Should pass if expected using stockpile", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("us", "stockpile");
                await ph.handle(
                {
                    type: "countStatusEffect", monRef: "us",
                    effect: "stockpile", amount: 1
                });
                await ph.halt({});
            });
        });

        //#endregion

        //#region boost

        const boostTests: {[T in dexutil.MoveEffectTarget]: (() =>  void)[]} =
            {self: [], hit: []};
        for (const [name, key] of
            [["Self", "self"], ["Hit", "hit"]] as const)
        {
            moveEffectTests.boost.push(() => describe(name, function()
            {
                for (const f of boostTests[key]) f();
            }));
        }

        function shouldHandleBoost(ctg: "self" | "hit", move: string,
            stat: dexutil.BoostName, amount: number, abilityImmunity?: string,
            immunityHolder?: events.SwitchOptions): void
        {
            const target = ctg === "self" ? "us" : "them";
            boostTests[ctg].push(function()
            {
                it("Should handle boost", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("us", move);
                    await ph.handle(
                        {type: "boost", monRef: target, stat, amount});
                    await ph.halt({}); // shouldn't throw
                });

                it("Should throw if reject before effect", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("us", move);
                    await ph.haltError(Error,
                        "Expected effect that didn't happen: " +
                            `${ctg} boost add {"${stat}":${amount}}`);
                });

                it("Should allow no boost message if maxed out",
                async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    state.teams[target].active.volatile.boosts[stat] =
                        6 * Math.sign(amount);
                    await initWithEvent("us", move);
                    await ph.halt({});
                });

                it("Should allow boost message with amount=0 if maxed out",
                async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    state.teams[target].active.volatile.boosts[stat] =
                        6 * Math.sign(amount);
                    await initWithEvent("us", move);
                    await ph.handle(
                        {type: "boost", monRef: target, stat, amount: 0});
                    await ph.halt({});
                });

                if (ctg === "hit" && abilityImmunity)
                {
                    it(`Should fail unboost effect if ${abilityImmunity} ` +
                        "activates",
                    async function()
                    {
                        sh.initActive("us");
                        sh.initActive("them", immunityHolder);
                        await initWithEvent("us", move);
                        await ph.handle(
                        {
                            type: "activateAbility", monRef: target,
                            ability: abilityImmunity
                        });
                        await ph.handle({type: "fail"});
                        await ph.halt({});
                    });

                    it("Should pass if moldbreaker broke through " +
                        abilityImmunity,
                    async function()
                    {
                        sh.initActive("us").setAbility("moldbreaker");
                        sh.initActive("them").setAbility(abilityImmunity);

                        await initWithEvent("us", move);
                        await ph.handle(
                            {type: "boost", monRef: target, stat, amount});
                        await ph.halt({});
                    });

                    it("Should throw if moldbreaker should've broken " +
                        `through ${abilityImmunity}` ,
                    async function()
                    {
                        sh.initActive("us").setAbility("moldbreaker");
                        sh.initActive("them");

                        await initWithEvent("us", move);
                        // move parser context should reject this event and
                        //  attempt to exit
                        await ph.rejectError(
                            {
                                type: "activateAbility", monRef: target,
                                ability: abilityImmunity
                            },
                            Error,
                            "Expected effect that didn't happen: " +
                                `hit boost add {"${stat}":${amount}}`);
                    });

                    it(`Should rule out ${abilityImmunity} if it didn't ` +
                        "activate",
                    async function()
                    {
                        sh.initActive("us");
                        // blocking ability or useless ability (illuminate)
                        const mon = sh.initActive("them");
                        mon.setAbility(abilityImmunity, "illuminate");
                        expect(mon.traits.ability.possibleValues)
                            .to.have.keys(abilityImmunity, "illuminate");

                        await initWithEvent("us", move);
                        await ph.handle(
                            {type: "boost", monRef: target, stat, amount});
                        expect(mon.traits.ability.possibleValues)
                            .to.have.keys("illuminate");
                        await ph.halt({});
                    });

                    it(`Should throw if ${abilityImmunity} didn't activate ` +
                        "when it's known",
                    async function()
                    {
                        sh.initActive("us");
                        sh.initActive("them").setAbility(abilityImmunity);

                        await initWithEvent("us", move);
                        await ph.rejectError(
                            {type: "boost", monRef: target, stat, amount},
                            Error,
                            "All possibilities have been ruled out " +
                                "(should never happen)");
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
        boostTests.self.push(function()
        {
            it("Should handle set boost", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("us", "bellydrum");
                await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
                await ph.handle(
                {
                    type: "boost", monRef: "us", stat: "atk", amount: 6,
                    set: true
                });
                await ph.halt({}); // shouldn't throw
            });

            it("Should activate berry from bellydrum", async function()
            {
                const mon = sh.initActive("us");
                mon.item.narrow("sitrusberry");
                sh.initActive("them");
                await initWithEvent("us", "bellydrum");
                await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
                await ph.handle(
                {
                    type: "boost", monRef: "us", stat: "atk", amount: 6,
                    set: true
                });
                await ph.handle(
                {
                    type: "removeItem", monRef: "us", consumed: "sitrusberry"
                });
                await ph.handle({type: "takeDamage", monRef: "us", hp: 75});
                await ph.halt({}); // shouldn't throw
            });
        });

        function shouldHandlePartialBoost(ctg: "self" | "hit", move: string,
            stat: dexutil.BoostName, amount: 2 | -2): void
        {
            const sign = Math.sign(amount);
            const target = ctg === "self" ? "us" : "them"
            boostTests[ctg].push(function()
            {
                it("Should allow partial boost if maxing out", async function()
                {
                    let mon = sh.initActive("us");
                    if (target === "them") mon = sh.initActive("them");
                    else sh.initActive("them");
                    mon.volatile.boosts[stat] = sign * 5;
                    await initWithEvent("us", move);
                    await ph.handle(
                        {type: "boost", monRef: target, stat, amount: sign});
                    await ph.halt({}); // shouldn't throw
                });

                it("Should allow 0 boost if maxed out", async function()
                {
                    let mon = sh.initActive("us");
                    if (target === "them") mon = sh.initActive("them");
                    else sh.initActive("them");
                    mon.volatile.boosts[stat] = sign * 6;
                    await initWithEvent("us", move);
                    await ph.handle(
                        {type: "boost", monRef: target, stat, amount: 0});
                    await ph.halt({}); // shouldn't throw
                });
            });
        }
        shouldHandlePartialBoost("self", "swordsdance", "atk", 2);
        shouldHandlePartialBoost("hit", "captivate", "spa", -2);

        function shouldHandleSecondaryBoost(ctg: "self" | "hit", move: string,
            stat: dexutil.BoostName, amount: number): void
        {
            boostTests[ctg].push(function()
            {
                it("Should handle boost via secondary effect using " + move,
                async function()
                {
                    const target = ctg === "self" ? "us" : "them";
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("us", move);
                    await ph.handle(
                        {type: "boost", monRef: target, stat, amount});
                    await ph.halt({}); // shouldn't throw
                });

                it("Shouldn't throw if no secondary boost using " + move,
                async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("us", move);
                    await ph.halt({}); // shouldn't throw
                });
            });
        }
        shouldHandleSecondaryBoost("self", "chargebeam", "spa", 1);
        shouldHandleSecondaryBoost("hit", "psychic", "spd", -1);

        function shouldHandle100SecondaryBoost(ctg: "self" | "hit",
            move: string, stat: dexutil.BoostName, amount: number): void
        {
            const sign = Math.sign(amount);
            const target = ctg === "self" ? "us" : "them"
            boostTests[ctg].push(function()
            {
                it("Should throw if reject before 100% secondary effect",
                async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("us", move);
                    await ph.haltError(Error,
                        "Expected effect that didn't happen: " +
                            `hit boost add {"${stat}":${amount}}`);
                });

                it("Should allow no boost event for 100% secondary effect if " +
                    "maxed out",
                async function()
                {
                    let mon = sh.initActive("us");
                    if (target === "them") mon = sh.initActive("them");
                    mon.volatile.boosts[stat] = sign * 6;
                    await initWithEvent("us", move);
                    await ph.halt({}); // shouldn't throw
                });
            });
        }
        shouldHandle100SecondaryBoost("hit", "rocktomb", "spe", -1);

        boostTests.self.push(() => describe("Curse (non-ghost)", function()
        {
            it("Should expect boosts", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "curse");
                await ph.handle(
                {
                    type: "boost", monRef: "them", stat: "spe",
                    amount: -1
                });
                await ph.handle(
                {
                    type: "boost", monRef: "them", stat: "atk",
                    amount: 1
                });
                await ph.handle(
                {
                    type: "boost", monRef: "them", stat: "def",
                    amount: 1
                });
                await ph.halt({});
            });
        }));

        //#endregion

        //#region swapBoosts

        moveEffectTests.swapBoosts.push(function()
        {
            beforeEach("Initialize us/them", function()
            {
                sh.initActive("us");
                sh.initActive("them");
            });

            it("Should handle swap boost move", async function()
            {
                await initWithEvent("them", "guardswap");
                await ph.handle(
                {
                    type: "swapBoosts", monRef1: "us", monRef2: "them",
                    stats: ["def", "spd"]
                });
                // effect should be consumed after accepting the previous
                //  swapBoosts event
                await ph.reject(
                {
                    type: "swapBoosts", monRef1: "us", monRef2: "them",
                    stats: ["def", "spd"]
                });
            });

            it("Should reject if event doesn't include user",
            async function()
            {
                await initWithEvent("them", "tackle");
                await ph.reject(
                {
                    type: "swapBoosts", monRef1: "us", monRef2: "us",
                    stats: ["def", "spd"]
                });
            });

            it("Should throw if too many stats", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "guardswap");

                // shouldn't handle
                await ph.rejectError(
                    {
                        type: "swapBoosts", monRef1: "us", monRef2: "them",
                        stats: ["def", "spd", "spe"]
                    },
                    Error,
                    "Expected effect that didn't happen: swapBoosts " +
                        "[def, spd]");
            });

            it("Should throw if reject before effect", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "guardswap");
                await ph.haltError(Error,
                    "Expected effect that didn't happen: " +
                        "swapBoosts [def, spd]");
            });
        });

        //#endregion

        //#region status

        const statusTests: {[T in dexutil.MoveEffectTarget]: (() =>  void)[]} =
            {self: [], hit: []};
        for (const [name, key] of
            [["Self", "self"], ["Hit", "hit"]] as const)
        {
            moveEffectTests.status.push(() => describe(name, function()
            {
                for (const f of statusTests[key]) f();
            }));
        }

        interface TestNonRemovableArgs
        {
            readonly ctg: dexutil.MoveEffectTarget;
            readonly name: string;
            readonly effect: dexutil.StatusType;
            readonly move: string;
            readonly preEvents?: readonly events.Any[];
            readonly postEvents?: readonly events.Any[];
            readonly abilityImmunity?: string;
            readonly abilityCondition?: dexutil.WeatherType;
        }

        function testNonRemovable(
            {
                ctg, name, effect, move, preEvents, postEvents, abilityImmunity,
                abilityCondition
            }: TestNonRemovableArgs): void
        {
            // adjust perspective
            const targetRef = ctg === "self" ? "them" : "us";

            statusTests[ctg].push(() => describe(name, function()
            {
                let user: Pokemon;
                let opp: Pokemon;
                beforeEach("Initialize active", async function()
                {
                    user = sh.initActive("them");
                    user.hp.set(50); // for roost

                    opp = sh.initActive("us");
                    // bypassing type effectiveness assertions
                    opp.volatile.changeTypes(["???", "???"]);
                });

                it("Should pass if expected", async function()
                {
                    // set last move in case of encore
                    state.teams.us.active.volatile.lastMove = "splash";

                    await initWithEvent("them", move);
                    for (const event of preEvents ?? []) await ph.handle(event);
                    await ph.handle(
                    {
                        type: "activateStatusEffect", monRef: targetRef, effect,
                        start: true
                    });
                    for (const event of postEvents ?? [])
                    {
                        await ph.handle(event);
                    }
                    await ph.halt({});
                });

                it("Should reject if start=false", async function()
                {
                    await initWithEvent("them", move);
                    for (const event of preEvents ?? []) await ph.handle(event);
                    const statusEvent: events.ActivateStatusEffect =
                    {
                        type: "activateStatusEffect", monRef: targetRef, effect,
                        start: false
                    };
                    const statuses = dex.getMove(move)
                        ?.getGuaranteedStatusEffects(ctg, user.types) ?? [];
                    // throw from attempt to infer ability immunity
                    if (statuses.length > 0)
                    {
                        const targetAbilities = state.teams[targetRef].active
                            .traits.ability.possibleValues;
                        const errorMsg =
                            `Move '${move}' status [${statuses.join(", ")}] ` +
                            `was blocked by target '${targetRef}' but ` +
                            "target's ability " +
                            `[${[...targetAbilities].join(", ")}] can't ` +
                            "block it";
                        await ph.rejectError(statusEvent, Error, errorMsg);
                    }
                    else if ((postEvents?.length ?? 0) > 0)
                    {
                        // throw from post event
                        // TODO: specify postEvent error msg in args
                        await ph.rejectError(statusEvent, Error)
                    }
                    // just reject the event and terminate the parser
                    else await ph.reject(statusEvent);
                });

                it("Should reject if mismatched flags", async function()
                {
                    await initWithEvent("them", "tackle");
                    await ph.reject(
                    {
                        type: "activateStatusEffect", monRef: targetRef, effect,
                        start: true
                    });
                });

                if (abilityImmunity)
                {
                    it("Should cancel status move effects if ability immunity",
                    async function()
                    {
                        // setup ability so it can activate
                        const us = state.teams.us.active;
                        us.setAbility(abilityImmunity);
                        if (abilityCondition)
                        {
                            state.status.weather.start(/*source*/ null,
                                abilityCondition);
                        }

                        await initWithEvent("them", move);
                        for (const event of preEvents ?? [])
                        {
                            await ph.handle(event);
                        }
                        await ph.handle(
                        {
                            type: "activateAbility", monRef: "us",
                            ability: abilityImmunity
                        });
                        await ph.handle({type: "immune", monRef: "us"});
                        for (const event of postEvents ?? [])
                        {
                            await ph.handle(event);
                        }
                        await ph.halt({});
                    });
                }
            }));
        }

        interface TestRemovableArgs
        {
            readonly ctg: dexutil.MoveEffectTarget;
            readonly name: string;
            readonly effect: dexutil.StatusType;
            readonly move?: string;
            readonly secondaryMove?: string;
            readonly secondaryMove100?: string;
            readonly abilityImmunity?: string;
            readonly clause?: "slp";
        }

        function testRemovable(
            {
                ctg, name, effect, move, secondaryMove, secondaryMove100,
                abilityImmunity, clause
            }: TestRemovableArgs): void
        {
            // adjust perspective
            const target = ctg === "self" ? "them" : "us";

            statusTests[ctg].push(() => describe(name, function()
            {
                beforeEach("Initialize active", function()
                {
                    // bypassing type effectiveness assertions
                    sh.initActive("us").volatile.changeTypes(["???", "???"]);
                    sh.initActive("them");
                });

                if (move)
                {
                    it("Should pass if expected", async function()
                    {
                        await initWithEvent("them", move);
                        await ph.handle(
                        {
                            type: "activateStatusEffect", monRef: target,
                            effect, start: true
                        });
                        await ph.halt({});
                    });
                }

                if (move && abilityImmunity)
                {
                    it("Should cancel status move effects if ability immunity",
                    async function()
                    {
                        // setup ability so it can activate
                        const us = state.teams.us.active;
                        us.setAbility(abilityImmunity);

                        await initWithEvent("them", move);
                        await ph.handle(
                        {
                            type: "activateAbility", monRef: "us",
                            ability: abilityImmunity
                        });
                        await ph.handle({type: "immune", monRef: "us"});
                        await ph.halt({});
                    });
                }

                it("Should still pass if start=false on an unrelated move",
                async function()
                {
                    await initWithEvent("them", "tackle");
                    if (dexutil.isMajorStatus(effect))
                    {
                        // make sure majorstatus assertion passes
                        state.teams[target].active.majorStatus.afflict(effect);
                    }
                    // TODO: track moves that can do this
                    await ph.handle(
                    {
                        type: "activateStatusEffect", monRef: target, effect,
                        start: false
                    });
                    await ph.halt({});
                });

                if (secondaryMove)
                {
                    it("Should pass if expected via secondary effect",
                    async function()
                    {
                        await initWithEvent("them", secondaryMove);
                        await ph.handle(
                        {
                            type: "activateStatusEffect", monRef: target,
                            effect, start: true
                        });
                        await ph.halt({});
                    });
                }

                it("Should reject if mismatched flags", async function()
                {
                    await initWithEvent("them", "tackle");
                    await ph.reject(
                    {
                        type: "activateStatusEffect", monRef: target, effect,
                        start: true
                    });
                });

                if (secondaryMove100)
                {
                    it("Should pass if exit before 100% secondary effect if " +
                        "the target is already afflicted",
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
                        await initWithEvent("them", secondaryMove100);
                        await ph.halt({});
                    });

                    it("Should throw if reject before 100% secondary effect",
                    async function()
                    {
                        // remove owntempo possibility from smeargle
                        state.teams.us.active.setAbility("technician");
                        await initWithEvent("them", secondaryMove100);
                        await ph.haltError(Error,
                            `Move '${secondaryMove100}' status [${effect}] ` +
                                `was blocked by target '${target}' but ` +
                                `target's ability [technician] can't block it`);
                    });

                    it("Should pass without 100% secondary effect if target " +
                        "fainted",
                    async function()
                    {
                        await initWithEvent("them", secondaryMove100);
                        await ph.handle(
                            {type: "takeDamage", monRef: "us", hp: 0});
                        await ph.handle({type: "faint", monRef: "us"});
                        await ph.halt({});
                    });
                }

                if (secondaryMove100 && abilityImmunity)
                {
                    it("Should narrow ability if no status event",
                    async function()
                    {
                        const mon = state.teams.us.active;
                        mon.setAbility(abilityImmunity, "illuminate");
                        await initWithEvent("them", secondaryMove100);
                        await ph.halt({});
                        expect(mon.traits.ability.possibleValues)
                            .to.have.keys(abilityImmunity);
                    });
                }

                if (move && clause)
                {
                    it(`Should be blocked by clause '${clause}'`,
                    async function()
                    {
                        await initWithEvent("us", move);
                        await ph.handle({type: "clause", clause});
                        await ph.halt({});
                    });
                }
            }));
        }

        testNonRemovable(
        {
            ctg: "self", name: "Aqua Ring", effect: "aquaRing", move: "aquaring"
        });
        testNonRemovable(
        {
            ctg: "hit", name: "Attract", effect: "attract", move: "attract",
            abilityImmunity: "oblivious"
        });
        testNonRemovable(
        {
            ctg: "self", name: "Charge", effect: "charge", move: "charge",
            preEvents: [{type: "boost", monRef: "them", stat: "spd", amount: 1}]
        });
        statusTests.hit.push(() => describe("Curse (ghost)", function()
        {
            it("Should expect curse status", async function()
            {
                sh.initActive("us");
                sh.initActive("them", smeargle).volatile.addedType =
                    "ghost";
                await initWithEvent("them", "curse");
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "curse", start: true
                });
                await ph.handle(
                    {type: "takeDamage", monRef: "them", hp: 50});
                await ph.halt({});
            });

            it("Should reject if mismatched flags", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "tackle");
                await ph.reject(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "curse", start: true
                });
            });
        }));
        testNonRemovable(
            {ctg: "hit", name: "Embargo", effect: "embargo", move: "embargo"});
        testNonRemovable(
            {ctg: "hit", name: "Encore", effect: "encore", move: "encore"});
        statusTests.hit.push(() => describe("Flash Fire", function()
        {
            // can have flashfire
            const arcanine: events.SwitchOptions =
            {
                species: "arcanine", gender: "F", level: 100, hp: 100,
                hpMax: 100
            };

            it("Should block move effects", async function()
            {
                sh.initActive("us");
                sh.initActive("them", arcanine);
                // fire-type move with guaranteed brn effect
                await initWithEvent("us", "willowisp");
                // activate absorbing ability
                await ph.handle(
                {
                    type: "activateAbility", monRef: "them",
                    ability: "flashfire"
                });
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "them",
                    effect: "flashFire", start: true
                });
                // effect should be blocked
                await ph.halt({}); // shouldn't throw
            });
        }));
        testNonRemovable(
        {
            ctg: "self", name: "Focus Energy", effect: "focusEnergy",
            move: "focusenergy"
        });
        testNonRemovable(
        {
            ctg: "hit", name: "Foresight", effect: "foresight",
            move: "foresight"
        });
        testNonRemovable(
        {
            ctg: "hit", name: "Heal Block", effect: "healBlock",
            move: "healblock"
        });
        // imprison
        statusTests.self.push(() => describe("Imprison", function()
        {
            let us: Pokemon;
            let them: Pokemon;

            function setup(imprisonUser: Side, sameOpponent = true): void
            {
                us = sh.initActive("us",
                {
                    species: "vulpix", level: 5, gender: "F", hp: 20, hpMax: 20
                });
                us.moveset.reveal(
                    imprisonUser === "us" ? "imprison" : "protect");
                us.moveset.reveal("ember");
                us.moveset.reveal("tailwhip");
                us.moveset.reveal("disable");

                // switch in a similar pokemon
                them = sh.initActive("them",
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
                        await initWithEvent(id, "imprison");
                        await ph.handle({type: "fail"});
                        expect(them.moveset.constraint).to.not.include.any.keys(
                            [...us.moveset.moves.keys()]);
                        await ph.halt({});
                    });
                }

                it("Should throw if shared moves", async function()
                {
                    setup("us");
                    await initWithEvent("them", "imprison");
                    await ph.rejectError({type: "fail"}, Error,
                        "Imprison failed but both Pokemon have common moves: " +
                            "imprison");
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
                        await initWithEvent(id, "imprison");
                        await ph.handle(
                        {
                            type: "activateStatusEffect", monRef: id,
                            effect: "imprison", start: true
                        });
                        await ph.halt({});
                        expect(them.moveset.moveSlotConstraints)
                            .to.have.lengthOf(1);
                        expect(them.moveset.moveSlotConstraints[0])
                            .to.have.keys([...us.moveset.moves.keys()]);
                    });
                }

                it("Should throw if no shared moves", async function()
                {
                    setup("us", /*sameOpponent*/false);
                    await initWithEvent("us", "imprison");

                    // if imprison succeeds, then the opponent
                    //  should be able to have one of our moves
                    await ph.rejectError(
                        {
                            type: "activateStatusEffect", monRef: "us",
                            effect: "imprison", start: true
                        },
                        Error,
                        "Imprison succeeded but both Pokemon cannot share " +
                            "any moves");
                });
            });
        }));
        testNonRemovable(
            {ctg: "self", name: "Ingrain", effect: "ingrain", move: "ingrain"});
        testRemovable(
        {
            ctg: "hit", name: "Leech Seed", effect: "leechSeed",
            move: "leechseed"
        });
        testNonRemovable(
        {
            ctg: "self", name: "Magnet Rise", effect: "magnetRise",
            move: "magnetrise"
        });
        testNonRemovable(
        {
            ctg: "hit", name: "Miracle Eye", effect: "miracleEye",
            move: "miracleeye"
        });
        testNonRemovable(
        {
            ctg: "self", name: "Mud Sport", effect: "mudSport", move: "mudsport"
        });
        testNonRemovable(
        {
            ctg: "hit", name: "Nightmare", effect: "nightmare",
            move: "nightmare"
        });
        testNonRemovable(
        {
            ctg: "self", name: "Power Trick", effect: "powerTrick",
            move: "powertrick"
        });
        // slowstart
        for (const ctg of ["self", "hit"] as const)
        {
            const target = ctg === "self" ? "them" : "us";
            statusTests[ctg].push(() => describe("Slow Start", function()
            {
                it("Should reject", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("them", "tackle");
                    await ph.reject(
                    {
                        type: "activateStatusEffect", monRef: target,
                        effect: "slowStart", start: true
                    });
                });
            }));
        }
        testNonRemovable(
        {
            ctg: "self", name: "Substitute", effect: "substitute",
            move: "substitute",
            postEvents: [{type: "takeDamage", monRef: "them", hp: 50}]
        });
        testNonRemovable(
        {
            ctg: "hit", name: "Suppress ability", effect: "suppressAbility",
            move: "gastroacid"
        });
        testNonRemovable(
            {ctg: "hit", name: "Taunt", effect: "taunt", move: "taunt"});
        testNonRemovable(
            {ctg: "hit", name: "Torment", effect: "torment", move: "torment"});
        testNonRemovable(
        {
            ctg: "self", name: "Water Sport", effect: "waterSport",
            move: "watersport"
        });
        // TODO: more dynamic way of adding tests
        testNonRemovable(
        {
            ctg: "hit", name: "Yawn", effect: "yawn", move: "yawn",
            abilityImmunity: "leafguard", abilityCondition: "SunnyDay"
        });

        // updatable
        testRemovable(
        {
            ctg: "hit", name: "Confusion", effect: "confusion",
            move: "confuseray", secondaryMove: "psybeam",
            secondaryMove100: "dynamicpunch", abilityImmunity: "owntempo"
        });
        testNonRemovable(
            {ctg: "self", name: "Bide", effect: "bide", move: "bide"});
        testNonRemovable(
            {ctg: "self", name: "Uproar", effect: "uproar", move: "uproar"});

        // singlemove
        testNonRemovable(
        {
            ctg: "self", name: "Destiny Bond", effect: "destinyBond",
            move: "destinybond"
        });
        testNonRemovable(
            {ctg: "self", name: "Grudge", effect: "grudge", move: "grudge"});
        testNonRemovable(
            {ctg: "self", name: "Rage", effect: "rage", move: "rage"});

        // singleturn
        testNonRemovable(
            {ctg: "self", name: "Endure", effect: "endure", move: "endure"});
        testNonRemovable(
        {
            ctg: "self", name: "Magic Coat", effect: "magicCoat",
            move: "magiccoat"
        });
        testNonRemovable(
            {ctg: "self", name: "Protect", effect: "protect", move: "protect"});
        testNonRemovable(
        {
            ctg: "self", name: "Roost", effect: "roost", move: "roost",
            preEvents: [{type: "takeDamage", monRef: "them", hp: 100}]
        });
        testNonRemovable(
            {ctg: "self", name: "Snatch", effect: "snatch", move: "snatch"});
        // stall
        statusTests.self.push(() => describe("Stall effect", function()
        {
            it("Should count stall turns then reset if failed",
            async function()
            {
                sh.initActive("us");
                const v = sh.initActive("them").volatile;
                expect(v.stalling).to.be.false;
                expect(v.stallTurns).to.equal(0);
                for (let i = 1; i <= 2; ++i)
                {
                    state.preTurn();
                    await initWithEvent("them", "protect");
                    await ph.handle(
                    {
                        type: "activateStatusEffect", monRef: "them",
                        effect: "protect", start: true
                    });
                    await ph.halt({});
                    expect(v.stalling).to.be.true;
                    expect(v.stallTurns).to.equal(i);

                    state.postTurn();
                    expect(v.stalling).to.be.false;
                    expect(v.stallTurns).to.equal(i);
                    await ph.close();
                }

                state.preTurn();
                await initWithEvent("them", "protect");
                await ph.handle({type: "fail"});
                expect(v.stalling).to.be.false;
                expect(v.stallTurns).to.equal(0);
                await ph.halt({});
            });

            it("Should reset stall count if using another move",
            async function()
            {
                sh.initActive("us");
                const mon = sh.initActive("them");

                // stall effect is put in place
                state.preTurn();
                mon.volatile.stall(true);
                state.postTurn();
                expect(mon.volatile.stalling).to.be.false;
                expect(mon.volatile.stallTurns).to.equal(1);

                // some other move is used next turn
                state.preTurn();
                await initWithEvent("them", "splash");
                await ph.halt({});
                expect(mon.volatile.stalling).to.be.false;
                expect(mon.volatile.stallTurns).to.equal(0);
            });

            it("Should not reset counter if called", async function()
            {
                sh.initActive("us");
                const mon = sh.initActive("them");
                await initWithEvent("them", "endure");

                // stall effect is put in place
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "them",
                    effect: "endure", start: true
                });
                await ph.halt({});

                // somehow the pokemon moves again in the same turn via call
                //  effect
                await initWithEvent("them", "metronome");
                await ph.handle(
                    {type: "useMove", monRef: "them", move: "endure"});
                await ph.handle({type: "fail"});
                await ph.halt({});
                expect(mon.volatile.stalling).to.be.true;
                expect(mon.volatile.stallTurns).to.equal(1);
            });
        }));

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

        //#region team

        const teamTests: {[T in dexutil.MoveEffectTarget]: (() =>  void)[]} =
            {self: [], hit: []};
        for (const [name, key] of
            [["Self", "self"], ["Hit", "hit"]] as const)
        {
            moveEffectTests.team.push(() => describe(name, function()
            {
                for (const f of teamTests[key]) f();
            }));
        }

        // screen move self team effects
        const screenMoves =
        [
            ["Light Screen", "lightScreen", "lightscreen"],
            ["Reflect", "reflect", "reflect"]
        ] as const;
        for (const [name, effect, move] of screenMoves)
        {
            teamTests.self.push(() => describe(name, function()
            {
                it("Should infer source via move", async function()
                {
                    const team = state.teams.them;
                    sh.initActive("us");
                    const {item} = sh.initActive("them");
                    await initWithEvent("them", move);
                    await ph.handle(
                    {
                        type: "activateTeamEffect", teamRef: "them", effect,
                        start: true
                    });
                    expect(team.status[effect].isActive).to.be.true;
                    expect(team.status[effect].source).to.equal(item);
                });

                it("Should still pass if start=false", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("them", "tackle");
                    // TODO: track moves that can do this
                    await ph.handle(
                    {
                        type: "activateTeamEffect", teamRef: "us", effect,
                        start: false
                    });
                });

                it("Should reject if mismatch", async function()
                {
                    const {status: ts} = state.teams.them;
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("them", effect.toLowerCase());
                    const otherEffect = effect === "reflect" ?
                        "lightScreen" : "reflect";
                    await ph.rejectError(
                        {
                            type: "activateTeamEffect", teamRef: "them",
                            effect: otherEffect, start: true
                        },
                        Error,
                        "Expected effect that didn't happen: self team " +
                            effect);
                    expect(ts.reflect.isActive).to.be.false;
                    expect(ts.reflect.source).to.be.null;
                    // BaseContext should handle this
                    expect(ts.lightScreen.isActive).to.be.false;
                    expect(ts.lightScreen.source).to.be.null;
                });
            }));
        }

        // other non-screen self team effects
        const otherMoves =
        [
            ["Lucky Chant", "luckyChant", "luckychant"],
            ["Mist", "mist", "mist"],
            ["Safeguard", "safeguard", "safeguard"],
            ["Tailwind", "tailwind", "tailwind"]
        ] as const;
        for (const [name, effect, move] of otherMoves)
        {
            teamTests.self.push(() => describe(name, function()
            {
                it("Should pass if expected", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("them", move);
                    await ph.handle(
                    {
                        type: "activateTeamEffect", teamRef: "them", effect,
                        start: true
                    });
                });

                it("Should reject if start=false", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("them", move);
                    await ph.rejectError(
                        {
                            type: "activateTeamEffect", teamRef: "them", effect,
                            start: false
                        },
                        Error,
                        "Expected effect that didn't happen: self team " +
                            effect);
                });

                it("Should reject if mismatched flags", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("them", "splash");
                    await ph.reject(
                    {
                        type: "activateTeamEffect", teamRef: "them", effect,
                        start: true
                    });
                });
            }));
        }

        // hazard move hit team effects
        const hazardMoves =
        [
            ["Spikes", "spikes", "spikes"],
            ["Stealth Rock", "stealthRock", "stealthrock"],
            ["Toxic Spikes", "toxicSpikes", "toxicspikes"]
        ] as const;
        for (const [name, effect, move] of hazardMoves)
        {
            teamTests.hit.push(() => describe(name, function()
            {
                it("Should pass if expected", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("them", move);
                    await ph.handle(
                    {
                        type: "activateTeamEffect", teamRef: "us", effect,
                        start: true
                    });
                    await ph.halt({});
                });

                // TODO: track moves that can do this
                it("Should pass unrelated move if start=false", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("them", "splash");
                    await ph.handle(
                    {
                        type: "activateTeamEffect", teamRef: "them", effect,
                        start: false
                    });
                    await ph.halt({});
                });

                it("Should reject if mismatched flags", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("them", "splash");
                    await ph.reject(
                    {
                        type: "activateTeamEffect", teamRef: "us", effect,
                        start: true
                    });
                });

                if (name === "Spikes") // ground move
                {
                    it("Should ignore ability type immunity", async function()
                    {
                        sh.initActive("us").setAbility("levitate"); // ground
                        sh.initActive("them");
                        await initWithEvent("them", move);
                        await ph.handle(
                        {
                            type: "activateTeamEffect", teamRef: "us", effect,
                            start: true
                        });
                        await ph.halt({});
                    });
                }
            }));
        }

        //#endregion

        //#region field

        moveEffectTests.field.push(function()
        {
            it("Should pass if expected", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("us", "trickroom");
                await ph.handle(
                {
                    type: "activateFieldEffect", effect: "trickRoom",
                    start: true
                });
                await ph.halt({});
            });

            it("Should reject if not expected", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("us", "splash");
                await ph.reject(
                {
                    type: "activateFieldEffect", effect: "gravity",
                    start: true
                });
            });

            it("Should toggle trickRoom", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                state.status.trickRoom.start();
                await initWithEvent("us", "trickroom");
                await ph.handle(
                {
                    type: "activateFieldEffect", effect: "trickRoom",
                    start: false
                });
                await ph.halt({});
            });
        });

        moveEffectTests.field.push(() => describe("Weather", function()
        {
            it("Should infer source via move", async function()
            {
                sh.initActive("us")
                const {item} = sh.initActive("them");
                await initWithEvent("them", "raindance");
                await ph.handle(
                {
                    type: "activateFieldEffect", effect: "RainDance",
                    start: true
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
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "raindance");
                await ph.rejectError(
                    {
                        type: "activateFieldEffect", effect: "Hail", start: true
                    },
                    Error,
                    "Expected effect that didn't happen: field RainDance");
            });
        }));

        //#endregion

        //#region changeType

        moveEffectTests.changeType.push(() => describe("Conversion", function()
        {
            it("Should infer move via type change", async function()
            {
                sh.initActive("us");
                const mon = sh.initActive("them");
                await initWithEvent("them", "conversion");

                // changes into a water type, meaning the pokemon must
                //  have a water type move
                await ph.handle(
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
        }));

        //#endregion

        //#region disableMove

        moveEffectTests.disableMove.push(function()
        {
            it("Should pass if expected", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "disable");
                await ph.handle(
                    {type: "disableMove", monRef: "us", move: "splash"});
                await ph.halt({});
            });

            it("Should reject if not expected", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "tackle");
                await ph.reject(
                    {type: "disableMove", monRef: "us", move: "splash"});
            });
        });

        //#endregion

        //#region drain

        moveEffectTests.drain.push(function()
        {
            // can have clearbody or liquidooze
            const tentacruel: events.SwitchOptions =
            {
                species: "tentacruel", level: 100, gender: "M", hp: 364,
                hpMax: 364
            };

            it("Should pass if expected", async function()
            {
                sh.initActive("us");
                sh.initActive("them").hp.set(1);
                await initWithEvent("them", "absorb");
                await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
                await ph.handle(
                {
                    type: "takeDamage", monRef: "them", hp: 100, from: "drain"
                });
                await ph.halt({});
            });

            it("Should pass without event if full hp", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "absorb");
                await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
                await ph.halt({});
            });

            it("Should infer no liquidooze if normal", async function()
            {
                const mon = sh.initActive("us", tentacruel);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("clearbody", "liquidooze");
                sh.initActive("them").hp.set(1);
                await initWithEvent("them", "gigadrain");
                // handle move damage
                await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
                // handle drain effect
                await ph.handle(
                {
                    type: "takeDamage", monRef: "them", hp: 100, from: "drain"
                });
                await ph.halt({});
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("clearbody");
                expect(mon.ability).to.equal("clearbody");
            });

            it("Should pass if liquidooze activates", async function()
            {
                sh.initActive("us", tentacruel);
                sh.initActive("them");
                await initWithEvent("them", "absorb");
                // handle move damage
                await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
                // liquidooze ability activates to replace drain effect
                await ph.handle(
                {
                    type: "activateAbility", monRef: "us", ability: "liquidooze"
                });
                // drain damage inverted due to liquidooze ability
                await ph.handle({type: "takeDamage", monRef: "them", hp: 50});
                await ph.halt({});
            });
        });

        //#endregion

        //#region recoil

        moveEffectTests.recoil.push(function()
        {
            // can have swiftswim or rockhead
            const relicanth: events.SwitchOptions =
            {
                species: "relicanth", level: 83, gender: "F", hp: 302,
                hpMax: 302
            };

            it("Should pass if expected", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "bravebird");
                await ph.handle({type: "takeDamage", monRef: "us", hp: 1});
                await ph.handle(
                {
                    type: "takeDamage", monRef: "them", hp: 99, from: "recoil"
                });
                await ph.halt({});
            });

            it("Should pass if hp diff is 0", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "bravebird");
                await ph.handle({type: "takeDamage", monRef: "us", hp: 1});
                await ph.handle(
                {
                    type: "takeDamage", monRef: "them", hp: 100, from: "recoil"
                });
                await ph.halt({});
            });

            it("Should reject if not expected", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "gust");
                await ph.reject(
                {
                    type: "takeDamage", monRef: "them", hp: 0, from: "recoil"
                });
            });

            function testRecoil(name: string, pre: (mon: Pokemon) => void,
                recoilEvent: boolean, infer?: boolean | "throw"): void
            {
                it(name, async function()
                {
                    sh.initActive("them");
                    const mon = sh.initActive("us", relicanth);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.all.keys(["swiftswim", "rockhead"]);
                    pre?.(mon);

                    await initWithEvent("us", "doubleedge");
                    if (recoilEvent)
                    {
                        await ph.handle(
                        {
                            type: "takeDamage", monRef: "us", hp: 1,
                            from: "recoil"
                        });
                        await ph.halt({});
                    }
                    if (infer === "throw")
                    {
                        await ph.haltError(Error,
                            "Move doubleedge user 'us' suppressed recoil " +
                                "through an ability but ability is suppressed");
                        return;
                    }
                    if (!recoilEvent) await ph.halt({});
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

            it("Should handle Struggle recoil", async function()
            {
                sh.initActive("us").setAbility("rockhead");
                sh.initActive("them");
                await initWithEvent("us", "struggle");
                await ph.handle({type: "takeDamage", monRef: "them", hp: 50});
                // recoil-blocking abilities don't work with struggle
                await ph.handle(
                    {type: "takeDamage", monRef: "us", hp: 50, from: "recoil"});
                await ph.halt({});
            });
        });

        //#endregion

        //#region selfFaint

        // TODO

        //#endregion

        //#region selfSwitch

        moveEffectTests.selfSwitch.push(function()
        {
            // TODO: track phazing moves
            // TODO: handle all throw cases
            it("Should accept if self-switch expected", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "batonpass");
                await ph.handle({type: "halt", reason: "wait"});
                await ph.handleEnd({type: "switchIn", monRef: "them", ...ditto},
                    {});
            });

            it("Should cancel effect if game-over", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "uturn");
                await ph.handle({type: "takeDamage", monRef: "us", hp: 0});
                await ph.handle({type: "faint", monRef: "us"});
                await ph.reject(
                    {type: "halt", reason: "gameOver", winner: "them"}, {});
            });

            it("Should reject if no self-switch expected", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "splash");
                await ph.reject({type: "halt", reason: "wait"});
            });

            it("Should throw if self-switch expected but opponent " +
                "switched",
            async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "uturn");
                await ph.handle({type: "halt", reason: "wait"});
                await ph.rejectError({type: "switchIn", monRef: "us", ...ditto},
                    Error, "SelfSwitch effect 'true' failed");
            });

            it("Should handle Pursuit", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("them", "uturn");
                await ph.handle({type: "halt", reason: "wait"});
                await ph.handle(
                    {type: "useMove", monRef: "us", move: "pursuit"});
                await ph.handleEnd(
                    {type: "switchIn", monRef: "them", ...ditto});
            });

            it("Should handle Natural Cure", async function()
            {
                sh.initActive("us");
                const mon = sh.initActive("them");
                mon.majorStatus.afflict("slp");
                // could have naturalcure
                mon.setAbility("naturalcure", "illuminate");
                await initWithEvent("them", "batonpass");
                await ph.handle({type: "halt", reason: "wait"});
                await ph.handle(
                {
                    type: "activateAbility", monRef: "them",
                    ability: "naturalcure"
                });
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "them", effect: "slp",
                    start: false
                });
                await ph.handleEnd(
                    {type: "switchIn", monRef: "them", ...ditto});
            });
        });

        //#endregion

        for (const [name, key] of
        [
            ["Call", "call"], ["Transform", "transform"], ["Delay", "delay"],
            ["Self-damage", "damage"], ["Count", "count"], ["Boost", "boost"],
            ["Swap-boosts", "swapBoosts"], ["Status", "status"],
            ["Team", "team"], ["Field", "field"], ["Change-type", "changeType"],
            ["Disable-move (disable)", "disableMove"], ["Drain", "drain"],
            ["Recoil", "recoil"], ["Self-faint", "selfFaint"],
            ["Self-switch", "selfSwitch"]
        ] as const)
        {
            const tests = moveEffectTests[key];
            describe(name, function()
            {
                if (tests.length <= 0) it("TODO");
                for (const f of tests) f();
            });
        }
    });

    describe("Implicit effects", function()
    {
        const implicitEffectTests:
        {
            readonly [T in keyof NonNullable<dexutil.MoveData["implicit"]>]-?:
                (() =>  void)[]
        } =
            {status: [], team: []};

        //#region status

        function testImplicitStatusEffect(name: string, move: string,
            event: events.Any, getter: (mon: ReadonlyPokemon) => boolean): void
        {
            implicitEffectTests.status.push(() => describe(name, function()
            {
                it(`Should set if using ${move}`, async function()
                {
                    const mon = sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("us", move);
                    await ph.handle(event);
                    await ph.halt({});
                    expect(getter(mon)).to.be.true;
                });

                it(`Should not set if ${move} failed`, async function()
                {
                    const mon = sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("us", move);
                    await ph.handle({type: "fail"});
                    await ph.halt({});
                    expect(getter(mon)).to.be.false;
                });
            }));
        }

        testImplicitStatusEffect("Defense Curl", "defensecurl",
            {type: "boost", monRef: "us", stat: "def", amount: 1},
            mon => mon.volatile.defenseCurl);
        testImplicitStatusEffect("Minimize", "minimize",
            {type: "boost", monRef: "us", stat: "evasion", amount: 1},
            mon => mon.volatile.minimize);
        testImplicitStatusEffect("Must recharge", "hyperbeam",
            {type: "takeDamage", monRef: "them", hp: 1},
            mon => mon.volatile.mustRecharge);

        function testLockingMoves<T extends string>(name: string,
            keys: readonly T[],
            getter: (mon: ReadonlyPokemon) => ReadonlyVariableTempStatus<T>,
            resetOnMiss?: boolean): void
        {
            implicitEffectTests.status.push(() => describe(name,
                () => keys.forEach(move => describe(move, function()
                {
                    async function initLock():
                        Promise<ReadonlyVariableTempStatus<T>>
                    {
                        // execute the move once to set lockedmove status
                        sh.initActive("us");
                        const vts = getter(sh.initActive("them"));
                        expect(vts.isActive).to.be.false;
                        await initWithEvent("them", move);
                        await ph.halt({});
                        state.postTurn();
                        expect(vts.isActive).to.be.true;
                        expect(vts.type).to.equal(move);
                        expect(vts.turns).to.equal(0);
                        return vts;
                    }

                    it("Should set if successful", initLock);

                    it(`Should ${resetOnMiss ? "" : "not "}reset if missed`,
                    async function()
                    {
                        const vts = await initLock();
                        await initWithEvent("them", move);
                        await ph.handleEnd({type: "miss", monRef: "us"});
                        expect(vts.isActive)
                            .to.be[resetOnMiss ? "false" : "true"];
                    });

                    it(`Should ${resetOnMiss ? "" : "not "}reset if opponent ` +
                        "protected",
                    async function()
                    {
                        const vts = await initLock();
                        await initWithEvent("them", move);
                        await ph.handleEnd(
                            {type: "block", monRef: "us", effect: "protect"});
                        expect(vts.isActive)
                            .to.be[resetOnMiss ? "false" : "true"];
                    });

                    it("Should not reset if opponent endured",
                    async function()
                    {
                        const vts = await initLock();
                        await initWithEvent("them", move);
                        await ph.handle(
                            {type: "block", monRef: "us", effect: "endure"});
                        await ph.halt({});
                        expect(vts.isActive).to.be.true;
                    });

                    it("Should not consume pp if used consecutively",
                    async function()
                    {
                        const vts = await initLock();
                        await initWithEvent("them", move);
                        expect(vts.isActive).to.be.true;
                        expect(vts.turns).to.equal(0);

                        await ph.halt({});
                        expect(vts.isActive).to.be.true;
                        expect(vts.turns).to.equal(1);

                        const m = state.teams.them.active.moveset.get(move)!;
                        expect(m).to.not.be.null;
                        expect(m.pp).to.equal(m.maxpp - 1);
                    });
                }))));
        }

        // TODO: rename to rampage move
        testLockingMoves("Locked moves", dex.lockedMoveKeys,
            mon => mon.volatile.lockedMove);
        // TODO: add rollout moves to dex and MoveData
        // TODO: rename to momentum move
        testLockingMoves("Rollout moves", dexutil.rolloutKeys,
            mon => mon.volatile.rollout, /*resetOnMiss*/ true);

        //#endregion

        //#region team

        function testImplicitTeamEffect(name: string, move: string,
            getter: (team: ReadonlyTeam) => boolean, exit?: boolean): void
        {
           implicitEffectTests.team.push(() => describe(name, function()
            {
                it(`Should set if using ${move}`, async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("them", move);
                    if (exit) await ph.halt({});
                    else await ph.handle({type: "halt", reason: "wait"});
                    expect(getter(state.teams.them)).to.be.true;
                });

                it(`Should not set if ${move} failed`, async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("them", move);
                    await ph.handle({type: "fail"});
                    await ph.halt({});
                    expect(getter(state.teams.them)).to.be.false;
                });
            }));
        }

        testImplicitTeamEffect("Wish", "wish",
            team => team.status.wish.isActive, /*exit*/ true)

        // healingWish/lunarDance
        const faintWishMoves =
        [
            ["Healing Wish", "healingWish", "healingwish"],
            ["Lunar Dance", "lunarDance", "lunardance"]
        ] as const;
        for (const [name, effect, move] of faintWishMoves)
        {
            implicitEffectTests.team.push(() => describe(name, function()
            {
                it("Should handle faint/selfSwitch effects", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    const team = state.teams.them;

                    // use wishing move to faint user
                    await initWithEvent("them", move);
                    await ph.handle({type: "faint", monRef: "them"});
                    expect(team.status[effect]).to.be.true;
                    // wait for opponent to choose replacement
                    // gen4: replacement is sent out immediately
                    await ph.handle({type: "halt", reason: "wait"});

                    // replacement is sent
                    await ph.handleEnd(
                        {type: "switchIn", monRef: "them", ...ditto});
                    // replacement is healed
                    // TODO: handle effect in switch context
                    /*await ph.handle(
                    {
                        type: "activateTeamEffect", teamRef: "them",
                        effect, start: false
                    });
                    await ph.halt({});*/
                });

                it("Should not set if failed", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    const team = state.teams.them;
                    await initWithEvent("them", move);
                    await ph.handle({type: "fail"});
                    await ph.halt({});
                    expect(team.status[effect]).to.be.false;
                });

                it("Should throw if no faint", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("them", move);
                    await ph.rejectError(
                        {
                            type: "activateTeamEffect", teamRef: "them", effect,
                            start: false
                        },
                        Error, "Pokemon [them] haven't fainted yet");
                });
            }));
        }

        //#endregion

        describe("Status", () => implicitEffectTests.status.forEach(f => f()));
        describe("Team", () => implicitEffectTests.team.forEach(f => f()));
    });

    // TODO: track in MoveData
    describe("Natural Gift move", async function()
    {
        it("Should infer berry if successful", async function()
        {
            sh.initActive("us"); // to appease pressure check
            const mon = sh.initActive("them");
            const item = mon.item;
            await initWithEvent("them", "naturalgift");
            await ph.halt({});

            expect(mon.lastItem).to.equal(item,
                "Item was not consumed");
            expect(mon.lastItem.possibleValues)
                .to.have.keys(...Object.keys(dex.berries));
        });

        it("Should infer no berry if failed", async function()
        {
            sh.initActive("us");
            const mon = sh.initActive("them");
            const item = mon.item;
            await initWithEvent("them", "naturalgift");
            await ph.handle({type: "fail"});
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
            sh.initActive("us");
            await initWithEvent("us", "helpinghand");
            await ph.handle({type: "fail"});
            await ph.halt({});
        });
    });

    describe("Pressure ability handling", async function()
    {
        let us: Pokemon;

        beforeEach("Setup pressure mon", async function()
        {
            us = sh.initActive("us");
            us.setAbility("pressure");
        });

        it("Should use extra pp if targeted", async function()
        {
            const {moveset} = sh.initActive("them");
            // since "us" wasn't mentioned, it will be inferred due to the
            //  targeting behavior of the move being used
            await initWithEvent("them", "tackle");
            await ph.halt({});
            expect(moveset.get("tackle")!.pp).to.equal(54);
        });

        it("Should not use extra pp if not targeted", async function()
        {
            const {moveset} = sh.initActive("them");
            await initWithEvent("them", "splash");
            await ph.halt({});
            expect(moveset.get("splash")!.pp).to.equal(63);
        });

        it("Should not use double pp if self target", async function()
        {
            const mon = sh.initActive("them");
            mon.setAbility("pressure");
            await initWithEvent("them", "splash");
            await ph.halt({});
            expect(mon.moveset.get("splash")!.pp).to.equal(63);
        });

        it("Should not use double pp if mold breaker", async function()
        {
            const mon = sh.initActive("them");
            mon.setAbility("moldbreaker");
            await initWithEvent("them", "tackle");
            await ph.halt({});
            expect(mon.moveset.get("tackle")!.pp).to.equal(55);
        });
    });

    describe("Target damaged flag", function()
    {
        it("Should set damaged flag for target once hit", async function()
        {
            const mon = sh.initActive("us");
            expect(mon.volatile.damaged).to.be.false;
            sh.initActive("them");
            await initWithEvent("them", "tackle");
            expect(mon.volatile.damaged).to.be.false;
            await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
            expect(mon.volatile.damaged).to.be.true;
            await ph.halt({});
        });
    });
}
