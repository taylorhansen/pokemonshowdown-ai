import {expect} from "chai";
import "mocha";
import {BattleState} from "../../state";
import {SwitchOptions} from "../../state/Team";
import {smeargle} from "../../state/switchOptions.test";
import {StateHelpers} from "../StateHelpers.test";
import * as reasonHp from "./hp";

export const test = () =>
    describe("hp", function () {
        let state: BattleState;
        const sh = new StateHelpers(() => state);

        beforeEach("Initialize BattleState", function () {
            state = new BattleState("player1");
            state.ourSide = "p1";
        });

        describe("isAt1()", function () {
            it("Should return null if 0 hp", function () {
                const mon = sh.initActive("p2");
                mon.hp.set(0);

                expect(reasonHp.isAt1(mon)).to.be.null;
            });

            it("Should return null if known to be above 1 hp", function () {
                const mon = sh.initActive("p1");
                mon.hp.set(2);

                expect(reasonHp.isAt1(mon)).to.be.null;
            });

            describe("below 100 max hp (41-55)", function () {
                const lowMaxHp: SwitchOptions = {...smeargle, level: 15};

                it("Should return null if definitely not at 1hp based on percentage being 4%", function () {
                    const mon = sh.initActive("p2", lowMaxHp);
                    mon.hp.set(4);

                    expect(reasonHp.isAt1(mon)).to.be.null;
                });

                it("Should return chance reason if could be at 1hp based on percentage being 3%", function () {
                    const mon = sh.initActive("p2", lowMaxHp);
                    mon.hp.set(3);

                    const reasons = reasonHp.isAt1(mon);
                    expect(reasons).to.not.be.null;
                    expect(reasons).to.not.be.empty;
                    expect(
                        [...reasons!].map(r => r.toString()),
                    ).to.have.members(["ChanceReason()"]);
                });

                it("Should return empty set if definitely at 1hp based on percentage being 2%", function () {
                    const mon = sh.initActive("p2", lowMaxHp);
                    mon.hp.set(2);

                    expect(reasonHp.isAt1(mon)).to.be.empty;
                });
            });

            describe("around 100 max hp (94-131)", function () {
                const midMaxHp: SwitchOptions = {...smeargle, level: 40};

                it("Should return null if definitely not at 1hp based on percentage being 3%", function () {
                    const mon = sh.initActive("p2", midMaxHp);
                    mon.hp.set(3);

                    expect(reasonHp.isAt1(mon)).to.be.null;
                });

                it("Should return chance reason if could be at 1hp based on percentage being 2%", function () {
                    const mon = sh.initActive("p2", midMaxHp);
                    mon.hp.set(2);

                    const reasons = reasonHp.isAt1(mon);
                    expect(reasons).to.not.be.null;
                    expect(reasons).to.not.be.empty;
                    expect(
                        [...reasons!].map(r => r.toString()),
                    ).to.have.members(["ChanceReason()"]);
                });

                it("Should return empty set if definitely at 1hp based on percentage being 1%", function () {
                    const mon = sh.initActive("p2", midMaxHp);
                    mon.hp.set(1);

                    expect(reasonHp.isAt1(mon)).to.be.empty;
                });
            });

            describe("above 100 max hp (115-162)", function () {
                const hiMaxHp: SwitchOptions = {...smeargle, level: 50};

                it("Should return null if definitely not at 1hp based on percentage being 2%", function () {
                    const mon = sh.initActive("p2", hiMaxHp);
                    mon.hp.set(2);

                    expect(reasonHp.isAt1(mon)).to.be.null;
                });

                it("Should return empty set if definitely at 1hp based on percentage being 1%", function () {
                    const mon = sh.initActive("p2", hiMaxHp);
                    mon.hp.set(1);

                    expect(reasonHp.isAt1(mon)).to.be.empty;
                });
            });

            describe("around 200 max hp (157-222)", function () {
                const hi2MaxHp: SwitchOptions = {...smeargle, level: 70};

                it("Should return null if definitely not at 1hp based on percentage being 2%", function () {
                    const mon = sh.initActive("p2", hi2MaxHp);
                    mon.hp.set(2);

                    expect(reasonHp.isAt1(mon)).to.be.null;
                });

                it("Should return chance reason if could be at 1hp based on percentage being 1%", function () {
                    const mon = sh.initActive("p2", hi2MaxHp);
                    mon.hp.set(1);

                    const reasons = reasonHp.isAt1(mon);
                    expect(reasons).to.not.be.null;
                    expect(reasons).to.not.be.empty;
                    expect(
                        [...reasons!].map(r => r.toString()),
                    ).to.have.members(["ChanceReason()"]);
                });
            });
        });
    });
