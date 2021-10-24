import {expect} from "chai";
import "mocha";
import {BattleState} from "../../state";
import {StateHelpers} from "../StateHelpers.test";
import * as reasonAbility from "./ability";

export const test = () =>
    describe("ability", function () {
        let state: BattleState;
        const sh = new StateHelpers(() => state);

        beforeEach("Initialize BattleState", function () {
            state = new BattleState("player1");
            state.ourSide = "p1";
        });

        for (const [name, has] of [
            ["has", true],
            ["doesntHave", false],
        ] as const) {
            describe(`${name}()`, function () {
                describe("#canHold()", function () {
                    it(`Should return ${has} if having the ability is the only possibility`, function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("illuminate");

                        const reason = reasonAbility[name](
                            mon,
                            new Set(["illuminate"]),
                        );
                        expect(reason.canHold()).to.be[has ? "true" : "false"];
                    });

                    it("Should return null if possible to have or not have the ability", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("illuminate", "owntempo");

                        const reason = reasonAbility[name](
                            mon,
                            new Set(["illuminate"]),
                        );
                        expect(reason.canHold()).to.be.null;
                    });

                    it(`Should return ${!has} if not possible to have the ability`, function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("owntempo");

                        const reason = reasonAbility[name](
                            mon,
                            new Set(["illuminate"]),
                        );
                        expect(reason.canHold()).to.be[has ? "false" : "true"];
                    });
                });

                describe("#assert()", function () {
                    it(`Should narrow ability and set #canHold()=true`, function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("illuminate", "owntempo");
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            "illuminate",
                            "owntempo",
                        );

                        const reason = reasonAbility[name](
                            mon,
                            new Set(["illuminate"]),
                        );
                        reason.assert();
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            has ? "illuminate" : "owntempo",
                        );
                        expect(reason.canHold()).to.be.true;
                    });

                    it("Should throw if overnarrowing", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("owntempo");

                        const reason = reasonAbility[name](
                            mon,
                            new Set([has ? "illuminate" : "owntempo"]),
                        );
                        expect(() => reason.assert()).to.throw(
                            Error,
                            // TODO: More descriptive error message?
                            "All possibilities have been ruled out " +
                                "(should never happen)",
                        );
                    });
                });

                describe("#reject()", function () {
                    it(`Should narrow ability and set #canHold()=false`, function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("illuminate", "owntempo");
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            "illuminate",
                            "owntempo",
                        );

                        const reason = reasonAbility[name](
                            mon,
                            new Set(["illuminate"]),
                        );
                        reason.reject();
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            has ? "owntempo" : "illuminate",
                        );
                        expect(reason.canHold()).to.be.false;
                    });

                    it("Should throw if overnarrowing", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("illuminate");

                        const reason = reasonAbility[name](
                            mon,
                            new Set([has ? "illuminate" : "owntempo"]),
                        );
                        expect(() => reason.reject()).to.throw(
                            Error,
                            // TODO: More descriptive error message?
                            "All possibilities have been ruled out " +
                                "(should never happen)",
                        );
                    });
                });

                describe("#delay()", function () {
                    it("Should call callback immediately if already holds", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("illuminate");

                        const reason = reasonAbility[name](
                            mon,
                            new Set([has ? "illuminate" : "owntempo"]),
                        );
                        let held: boolean | undefined;
                        reason.delay(h => (held = h));
                        expect(held).to.be.true;
                    });

                    it("Should call callback immediately if already doesn't hold", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("owntempo");

                        const reason = reasonAbility[name](
                            mon,
                            new Set([has ? "illuminate" : "owntempo"]),
                        );
                        let held: boolean | undefined;
                        reason.delay(h => (held = h));
                        expect(held).to.be.false;
                    });

                    it("Should call callback once reason holds", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("illuminate", "owntempo");

                        const reason = reasonAbility[name](
                            mon,
                            new Set([has ? "illuminate" : "owntempo"]),
                        );
                        let held: boolean | undefined;
                        reason.delay(h => (held = h));
                        expect(held).to.be.undefined;
                        mon.setAbility("illuminate");
                        expect(held).to.be.true;
                    });

                    it("Should call callback once reason doesn't hold", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("illuminate", "owntempo");

                        const reason = reasonAbility[name](
                            mon,
                            new Set([has ? "illuminate" : "owntempo"]),
                        );
                        let held: boolean | undefined;
                        reason.delay(h => (held = h));
                        expect(held).to.be.undefined;
                        mon.setAbility("owntempo");
                        expect(held).to.be.false;
                    });

                    it("Should cancel callback from return value", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("illuminate", "owntempo");

                        const reason = reasonAbility[name](
                            mon,
                            new Set(["illuminate"]),
                        );
                        let held: boolean | undefined;
                        const cancel = reason.delay(h => (held = h));
                        expect(held).to.be.undefined;
                        cancel();
                        mon.setAbility("illuminate");
                        expect(held).to.be.undefined;
                    });
                });
            });
        }

        for (const [name, can] of [
            ["canIgnoreItem", true],
            ["cantIgnoreItem", false],
        ] as const) {
            describe(`${name}()`, function () {
                describe("#canHold()", function () {
                    it(`Should return ${can} if having an item-ignoring ability is the only possibility`, function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("klutz");

                        const reason = reasonAbility[name](mon);
                        expect(reason.canHold()).to.be[can ? "true" : "false"];
                    });

                    it("Should return null if possible to have or not have an item-ignoring ability", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("klutz", "owntempo");

                        const reason = reasonAbility[name](mon);
                        expect(reason.canHold()).to.be.null;
                    });

                    it(`Should return ${!can} if not possible to have an item-ignoring ability`, function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("owntempo");

                        const reason = reasonAbility[name](mon);
                        expect(reason.canHold()).to.be[can ? "false" : "true"];
                    });
                });

                describe("#assert()", function () {
                    it(`Should narrow ability and set #canHold()=true`, function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("klutz", "owntempo");
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            "klutz",
                            "owntempo",
                        );

                        const reason = reasonAbility[name](mon);
                        reason.assert();
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            can ? "klutz" : "owntempo",
                        );
                        expect(reason.canHold()).to.be.true;
                    });

                    it("Should throw if overnarrowing", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility(can ? "owntempo" : "klutz");

                        const reason = reasonAbility[name](mon);
                        expect(() => reason.assert()).to.throw(
                            Error,
                            // TODO: More descriptive error message?
                            "All possibilities have been ruled out " +
                                "(should never happen)",
                        );
                    });
                });

                describe("#reject()", function () {
                    it(`Should narrow ability and set #canHold()=false`, function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("klutz", "owntempo");
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            "klutz",
                            "owntempo",
                        );

                        const reason = reasonAbility[name](mon);
                        reason.reject();
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            can ? "owntempo" : "klutz",
                        );
                        expect(reason.canHold()).to.be.false;
                    });

                    it("Should throw if overnarrowing", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility(can ? "klutz" : "owntempo");

                        const reason = reasonAbility[name](mon);
                        expect(() => reason.reject()).to.throw(
                            Error,
                            // TODO: More descriptive error message?
                            "All possibilities have been ruled out " +
                                "(should never happen)",
                        );
                    });
                });

                describe("#delay()", function () {
                    it("Should call callback immediately if already holds", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility(can ? "klutz" : "owntempo");

                        const reason = reasonAbility[name](mon);
                        let held: boolean | undefined;
                        reason.delay(h => (held = h));
                        expect(held).to.be.true;
                    });

                    it("Should call callback immediately if already doesn't hold", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility(can ? "owntempo" : "klutz");

                        const reason = reasonAbility[name](mon);
                        let held: boolean | undefined;
                        reason.delay(h => (held = h));
                        expect(held).to.be.false;
                    });

                    it("Should call callback once reason holds", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("klutz", "owntempo");

                        const reason = reasonAbility[name](mon);
                        let held: boolean | undefined;
                        reason.delay(h => (held = h));
                        expect(held).to.be.undefined;
                        mon.setAbility(can ? "klutz" : "owntempo");
                        expect(held).to.be.true;
                    });

                    it("Should call callback once reason doesn't hold", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("klutz", "owntempo");

                        const reason = reasonAbility[name](mon);
                        let held: boolean | undefined;
                        reason.delay(h => (held = h));
                        expect(held).to.be.undefined;
                        mon.setAbility(can ? "owntempo" : "klutz");
                        expect(held).to.be.false;
                    });

                    it("Should cancel callback from return value", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("klutz", "owntempo");

                        const reason = reasonAbility[name](mon);
                        let held: boolean | undefined;
                        const cancel = reason.delay(h => (held = h));
                        expect(held).to.be.undefined;
                        cancel();
                        mon.setAbility("klutz");
                        expect(held).to.be.undefined;
                    });
                });
            });
        }

        describe("itemIgnoring()", function () {
            it("Should get item-ignoring abilities", function () {
                const mon = sh.initActive("p1");
                mon.setAbility("klutz", "illuminate");

                expect(reasonAbility.itemIgnoring(mon)).to.have.keys("klutz");
            });

            it("Should return empty set if no item-ignoring abilities", function () {
                const mon = sh.initActive("p1");

                expect(reasonAbility.itemIgnoring(mon)).to.be.empty;
            });

            it("Should return empty set if ability is suppressed", function () {
                const mon = sh.initActive("p1");
                mon.setAbility("klutz", "illuminate");
                mon.volatile.suppressAbility = true;

                expect(reasonAbility.itemIgnoring(mon)).to.be.empty;
            });
        });

        // TODO: Entry for ["canIgnoreTargetAbility", true]?
        for (const [name, can] of [
            ["cantIgnoreTargetAbility", false],
        ] as const) {
            describe(`${name}()`, function () {
                describe("#canHold()", function () {
                    it(`Should return ${can} if having a target-ability-ignoring ability is the only possibility`, function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("moldbreaker");

                        const reason = reasonAbility[name](mon);
                        expect(reason.canHold()).to.be[can ? "true" : "false"];
                    });

                    it("Should return null if possible to have or not have a target-ability-ignoring ability", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("moldbreaker", "owntempo");

                        const reason = reasonAbility[name](mon);
                        expect(reason.canHold()).to.be.null;
                    });

                    it(`Should return ${!can} if not possible to have a target-ability-ignoring ability`, function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("owntempo");

                        const reason = reasonAbility[name](mon);
                        expect(reason.canHold()).to.be[can ? "false" : "true"];
                    });
                });

                describe("#assert()", function () {
                    it(`Should narrow ability and set #canHold()=true`, function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("moldbreaker", "owntempo");
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            "moldbreaker",
                            "owntempo",
                        );

                        const reason = reasonAbility[name](mon);
                        reason.assert();
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            can ? "moldbreaker" : "owntempo",
                        );
                        expect(reason.canHold()).to.be.true;
                    });

                    it("Should throw if overnarrowing", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility(can ? "owntempo" : "moldbreaker");

                        const reason = reasonAbility[name](mon);
                        expect(() => reason.assert()).to.throw(
                            Error,
                            // TODO: More descriptive error message?
                            "All possibilities have been ruled out " +
                                "(should never happen)",
                        );
                    });
                });

                describe("#reject()", function () {
                    it(`Should narrow ability and set #canHold()=false`, function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("moldbreaker", "owntempo");
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            "moldbreaker",
                            "owntempo",
                        );

                        const reason = reasonAbility[name](mon);
                        reason.reject();
                        expect(mon.traits.ability.possibleValues).to.have.keys(
                            can ? "owntempo" : "moldbreaker",
                        );
                        expect(reason.canHold()).to.be.false;
                    });

                    it("Should throw if overnarrowing", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility(can ? "moldbreaker" : "owntempo");

                        const reason = reasonAbility[name](mon);
                        expect(() => reason.reject()).to.throw(
                            Error,
                            // TODO: More descriptive error message?
                            "All possibilities have been ruled out " +
                                "(should never happen)",
                        );
                    });
                });

                describe("#delay()", function () {
                    it("Should call callback immediately if already holds", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility(can ? "moldbreaker" : "owntempo");

                        const reason = reasonAbility[name](mon);
                        let held: boolean | undefined;
                        reason.delay(h => (held = h));
                        expect(held).to.be.true;
                    });

                    it("Should call callback immediately if already doesn't hold", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility(can ? "owntempo" : "moldbreaker");

                        const reason = reasonAbility[name](mon);
                        let held: boolean | undefined;
                        reason.delay(h => (held = h));
                        expect(held).to.be.false;
                    });

                    it("Should call callback once reason holds", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("moldbreaker", "owntempo");

                        const reason = reasonAbility[name](mon);
                        let held: boolean | undefined;
                        reason.delay(h => (held = h));
                        expect(held).to.be.undefined;
                        mon.setAbility(can ? "moldbreaker" : "owntempo");
                        expect(held).to.be.true;
                    });

                    it("Should call callback once reason doesn't hold", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("moldbreaker", "owntempo");

                        const reason = reasonAbility[name](mon);
                        let held: boolean | undefined;
                        reason.delay(h => (held = h));
                        expect(held).to.be.undefined;
                        mon.setAbility(can ? "owntempo" : "moldbreaker");
                        expect(held).to.be.false;
                    });

                    it("Should cancel callback from return value", function () {
                        const mon = sh.initActive("p1");
                        mon.setAbility("moldbreaker", "owntempo");

                        const reason = reasonAbility[name](mon);
                        let held: boolean | undefined;
                        const cancel = reason.delay(h => (held = h));
                        expect(held).to.be.undefined;
                        cancel();
                        mon.setAbility("moldbreaker");
                        expect(held).to.be.undefined;
                    });
                });
            });
        }

        describe("targetIgnoring()", function () {
            it("Should get target-ignoring abilities", function () {
                const mon = sh.initActive("p1");
                mon.setAbility("moldbreaker", "moldbreaker");

                expect(reasonAbility.targetIgnoring(mon)).to.have.keys(
                    "moldbreaker",
                );
            });

            it("Should return empty set if no target-ignoring abilities", function () {
                const mon = sh.initActive("p1");

                expect(reasonAbility.targetIgnoring(mon)).to.be.empty;
            });

            it("Should return empty set if ability is suppressed", function () {
                const mon = sh.initActive("p1");
                mon.setAbility("moldbreaker", "moldbreaker");
                mon.volatile.suppressAbility = true;

                expect(reasonAbility.itemIgnoring(mon)).to.be.empty;
            });
        });
    });
