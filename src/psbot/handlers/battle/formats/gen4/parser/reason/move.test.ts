import {expect} from "chai";
import "mocha";
import * as dex from "../../dex";
import {BattleState} from "../../state";
import {Pokemon} from "../../state/Pokemon";
import {smeargle} from "../../state/switchOptions.test";
import {StateHelpers} from "../StateHelpers.test";
import * as reasonMove from "./move";

export const test = () =>
    describe("move", function () {
        let state: BattleState;
        const sh = new StateHelpers(() => state);

        beforeEach("Initialize BattleState", function () {
            state = new BattleState("player1");
            state.ourSide = "p1";
        });

        describe("diffType()", function () {
            let mon: Pokemon;
            let user: Pokemon;
            beforeEach("Initialize pokemon", function () {
                mon = sh.initActive("p1", smeargle); // Normal type.
                user = sh.initActive("p2", smeargle);
            });

            const reveal = (name: string) =>
                dex.getMove(user.moveset.reveal(name).data);
            const init = (move: dex.Move) =>
                reasonMove.diffType(mon, {move, user});

            describe("#canHold()", function () {
                it("Should return true if definitely not same type as the move", function () {
                    const move = reveal("ember");

                    expect(init(move).canHold()).to.be.true;
                });

                it("Should return null if move could be same type as the target", function () {
                    mon.volatile.changeTypes(["fire", "dragon"]);
                    const move = reveal("hiddenpower");

                    expect(init(move).canHold()).to.be.null;
                });

                it("Should return false if move is the same type as the target", function () {
                    const move = reveal("tackle");

                    expect(init(move).canHold()).to.be.false;
                });
            });

            describe("#assert()", function () {
                it("Should narrow hiddenpower and set #canHold()=true", function () {
                    mon.volatile.changeTypes(["ice", "???"]);
                    expect(
                        user.traits.stats.hpType.possibleValues,
                    ).to.include.keys("ice", "water");
                    const move = reveal("hiddenpower");

                    const reason = init(move);
                    reason.assert();
                    expect(
                        mon.traits.stats.hpType.possibleValues,
                    ).to.not.have.keys("ice");
                    expect(reason.canHold()).to.be.true;
                });

                it("Should narrow plate type and set #canHold()=true", function () {
                    mon.volatile.changeTypes(["ice", "???"]);
                    expect(user.item.possibleValues).to.include.keys(
                        "icicleplate",
                        "splashplate",
                    );
                    const move = reveal("judgment");

                    const reason = init(move);
                    reason.assert();
                    expect(user.item.possibleValues).to.not.have.keys(
                        "icicleplate",
                    );
                    expect(reason.canHold()).to.be.true;
                });

                it("Should throw if overnarrowing", function () {
                    mon.volatile.changeTypes(["ice", "???"]);
                    user.item.narrow("icicleplate");
                    const move = reveal("judgment");

                    const reason = init(move);
                    expect(() => reason.assert()).to.throw(
                        Error,
                        // TODO: More descriptive error message?
                        "All possibilities have been ruled out " +
                            "(should never happen)",
                    );
                });

                it("Should throw if can't be narrowed", function () {
                    const move = reveal("tackle");

                    const reason = init(move);
                    expect(() => reason.assert()).to.throw(
                        Error,
                        "Move of type 'normal' cannot be asserted to not be " +
                            "of type [normal]",
                    );
                });
            });

            describe("#reject()", function () {
                it("Should narrow hiddenpower and set #canHold()=false", function () {
                    mon.volatile.changeTypes(["ice", "???"]);
                    expect(
                        user.traits.stats.hpType.possibleValues,
                    ).to.include.keys("ice", "water");
                    const move = reveal("hiddenpower");

                    const reason = init(move);
                    reason.reject();
                    expect(
                        user.traits.stats.hpType.possibleValues,
                    ).to.have.keys("ice");
                    expect(reason.canHold()).to.be.false;
                });

                it("Should narrow plate type and set #canHold()=false", function () {
                    mon.volatile.changeTypes(["ice", "???"]);
                    expect(user.item.possibleValues).to.include.keys(
                        "icicleplate",
                        "splashplate",
                    );
                    const move = reveal("judgment");

                    const reason = init(move);
                    reason.reject();
                    expect(user.item.possibleValues).to.have.keys(
                        "icicleplate",
                    );
                    expect(reason.canHold()).to.be.false;
                });

                it("Should throw if overnarrowing", function () {
                    mon.volatile.changeTypes(["bug", "???"]);
                    user.item.narrow("icicleplate");
                    const move = reveal("judgment");

                    const reason = init(move);
                    expect(() => reason.reject()).to.throw(
                        Error,
                        // TODO: More descriptive error message?
                        "All possibilities have been ruled out " +
                            "(should never happen)",
                    );
                });

                it("Should throw if can't be narrowed", function () {
                    const move = reveal("ember");

                    const reason = init(move);
                    expect(() => reason.reject()).to.throw(
                        Error,
                        "Move of type 'fire' cannot be asserted to be of " +
                            "type [normal]",
                    );
                });
            });

            describe("#delay()", function () {
                it("Should call callback immediately if already holds", function () {
                    const move = reveal("ember");

                    const reason = init(move);
                    let held: boolean | undefined;
                    reason.delay(h => (held = h));
                    expect(held).to.be.true;
                });

                it("Should call callback immediately if already doesn't hold", function () {
                    const move = reveal("slash");

                    const reason = init(move);
                    let held: boolean | undefined;
                    reason.delay(h => (held = h));
                    expect(held).to.be.false;
                });

                it("Should call callback once reason holds", function () {
                    mon.volatile.changeTypes(["bug", "rock"]);
                    const move = reveal("hiddenpower");

                    const reason = init(move);
                    let held: boolean | undefined;
                    reason.delay(h => (held = h));
                    expect(held).to.be.undefined;
                    user.traits.stats.hpType.remove("rock");
                    expect(held).to.be.undefined;
                    user.traits.stats.hpType.remove("bug");
                    expect(held).to.be.true;
                });

                it("Should call callback once reason doesn't hold", function () {
                    mon.volatile.changeTypes(["bug", "rock"]);
                    const move = reveal("hiddenpower");

                    const reason = init(move);
                    let held: boolean | undefined;
                    reason.delay(h => (held = h));
                    expect(held).to.be.undefined;
                    user.traits.stats.hpType.narrow("rock");
                    expect(held).to.be.false;
                });

                it("Should cancel callback from return value", function () {
                    mon.volatile.changeTypes(["bug", "rock"]);
                    const move = reveal("hiddenpower");

                    const reason = init(move);
                    let held: boolean | undefined;
                    const cancel = reason.delay(h => (held = h));
                    expect(held).to.be.undefined;
                    cancel();
                    user.traits.stats.hpType.narrow("rock");
                    expect(held).to.be.undefined;
                });
            });
        });
    });
