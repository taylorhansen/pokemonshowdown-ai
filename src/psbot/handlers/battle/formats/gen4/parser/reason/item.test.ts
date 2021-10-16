import { expect } from "chai";
import "mocha";
import { BattleState } from "../../state";
import { StateHelpers } from "../helpers.test";
import * as reasonItem from "./item";

export const test = () => describe("item", function()
{
    let state: BattleState;
    const sh = new StateHelpers(() => state);

    beforeEach("Initialize BattleState", function()
    {
        state = new BattleState("player1");
        state.ourSide = "p1";
    });

    for (const [name, has] of [["has", true], ["doesntHave", false]] as const)
    {
        describe(`${name}()`, function()
        {
            describe("#canHold()", function()
            {
                it(`Should return ${has} if having the item is the only ` +
                    "possibility", function()
                {
                    const mon = sh.initActive("p1");
                    mon.item.narrow("pokeball");

                    const reason = reasonItem[name](mon, new Set(["pokeball"]));
                    expect(reason.canHold()).to.be[has ? "true" : "false"];
                });

                it("Should return null if possible to have or not have the " +
                    "item", function()
                {
                    const mon = sh.initActive("p1");
                    mon.item.narrow("pokeball", "mail");

                    const reason = reasonItem[name](mon,
                        new Set(["pokeball"]));
                    expect(reason.canHold()).to.be.null;
                });

                it(`Should return ${!has} if not possible to have the item`,
                function()
                {
                    const mon = sh.initActive("p1");
                    mon.item.narrow("mail");

                    const reason = reasonItem[name](mon,
                        new Set(["pokeball"]));
                    expect(reason.canHold()).to.be[has ? "false" : "true"];
                });
            });

            describe("#assert()", function()
            {
                it(`Should narrow item and set #canHold()=true`, function()
                {
                    const mon = sh.initActive("p1");
                    mon.item.narrow("pokeball", "mail");
                    expect(mon.item.possibleValues)
                        .to.have.keys("pokeball", "mail");

                    const reason = reasonItem[name](mon,
                        new Set(["pokeball"]));
                    reason.assert();
                    expect(mon.item.possibleValues)
                        .to.have.keys(has ? "pokeball" : "mail");
                    expect(reason.canHold()).to.be.true;
                });

                it("Should throw if overnarrowing", function()
                {
                    const mon = sh.initActive("p1");
                    mon.item.narrow("mail");

                    const reason = reasonItem[name](mon,
                        new Set([has ? "pokeball" : "mail"]));
                    expect(() => reason.assert()).to.throw(Error,
                        // TODO: more descriptive error message?
                        "All possibilities have been ruled out " +
                            "(should never happen)");
                });
            });

            describe("#reject()", function()
            {
                it(`Should narrow item and set #canHold()=false`,
                function()
                {
                    const mon = sh.initActive("p1");
                    mon.item.narrow("pokeball", "mail");
                    expect(mon.item.possibleValues)
                        .to.have.keys("pokeball", "mail");

                    const reason = reasonItem[name](mon,
                        new Set(["pokeball"]));
                    reason.reject();
                    expect(mon.item.possibleValues)
                        .to.have.keys(has ? "mail" : "pokeball");
                    expect(reason.canHold()).to.be.false;
                });

                it("Should throw if overnarrowing", function()
                {
                    const mon = sh.initActive("p1");
                    mon.item.narrow("pokeball");

                    const reason = reasonItem[name](mon,
                        new Set([has ? "pokeball" : "mail"]));
                    expect(() => reason.reject()).to.throw(Error,
                        // TODO: more descriptive error message?
                        "All possibilities have been ruled out " +
                            "(should never happen)");
                });
            });

            describe("#delay()", function()
            {
                it("Should call callback immediately if already holds",
                function()
                {
                    const mon = sh.initActive("p1");
                    mon.item.narrow("pokeball");

                    const reason = reasonItem[name](mon,
                        new Set([has ? "pokeball" : "mail"]));
                    let held: boolean | undefined;
                    reason.delay(h => held = h);
                    expect(held).to.be.true;
                });

                it("Should call callback immediately if already doesn't hold",
                function()
                {
                    const mon = sh.initActive("p1");
                    mon.item.narrow("mail");

                    const reason = reasonItem[name](mon,
                        new Set([has ? "pokeball" : "mail"]));
                    let held: boolean | undefined;
                    reason.delay(h => held = h);
                    expect(held).to.be.false;
                });

                it("Should call callback once reason holds", function()
                {
                    const mon = sh.initActive("p1");
                    mon.item.narrow("pokeball", "mail");

                    const reason = reasonItem[name](mon,
                        new Set([has ? "pokeball" : "mail"]));
                    let held: boolean | undefined;
                    reason.delay(h => held = h);
                    expect(held).to.be.undefined;
                    mon.item.narrow("pokeball");
                    expect(held).to.be.true;
                });

                it("Should call callback once reason doesn't hold", function()
                {
                    const mon = sh.initActive("p1");
                    mon.item.narrow("pokeball", "mail");

                    const reason = reasonItem[name](mon,
                        new Set([has ? "pokeball" : "mail"]));
                    let held: boolean | undefined;
                    reason.delay(h => held = h);
                    expect(held).to.be.undefined;
                    mon.item.narrow("mail");
                    expect(held).to.be.false;
                });

                it("Should cancel callback from return value", function()
                {
                    const mon = sh.initActive("p1");
                    mon.item.narrow("pokeball", "mail");

                    const reason = reasonItem[name](mon,
                        new Set(["pokeball"]));
                    let held: boolean | undefined;
                    const cancel = reason.delay(h => held = h);
                    expect(held).to.be.undefined;
                    cancel();
                    mon.item.narrow("pokeball");
                    expect(held).to.be.undefined;
                });
            });
        });
    }

    describe("hasUnknown()", function()
    {
        describe("#canHold()", function()
        {
            it("Should return true if definitely has an item", function()
            {
                const mon = sh.initActive("p1");
                mon.item.remove("none");

                const reason = reasonItem.hasUnknown(mon);
                expect(reason.canHold()).to.be.true;
            });

            it("Should return null if possible to have or not have an item ",
            function()
            {
                const mon = sh.initActive("p1");

                const reason = reasonItem.hasUnknown(mon);
                expect(reason.canHold()).to.be.null;
            });

            it("Should return false if definitely doesn't have an item",
            function()
            {
                const mon = sh.initActive("p1");
                mon.item.narrow("none");

                const reason = reasonItem.hasUnknown(mon);
                expect(reason.canHold()).to.be.false;
            });
        });

        describe("#assert()", function()
        {
            it("Should narrow item and set #canHold()=true", function()
            {
                const mon = sh.initActive("p1");
                expect(mon.item.possibleValues).to.include.keys("none", "mail");

                const reason = reasonItem.hasUnknown(mon);
                reason.assert();
                expect(mon.item.possibleValues).to.not.have.keys("none");
                expect(mon.item.possibleValues).to.include.keys("mail");
                expect(reason.canHold()).to.be.true;
            });

            it("Should throw if overnarrowing", function()
            {
                const mon = sh.initActive("p1");
                mon.item.narrow("none");

                const reason = reasonItem.hasUnknown(mon);
                expect(() => reason.assert()).to.throw(Error,
                    // TODO: more descriptive error message?
                    "All possibilities have been ruled out " +
                        "(should never happen)");
            });
        });

        describe("#reject()", function()
        {
            it("Should narrow item and set #canHold()=false",
            function()
            {
                const mon = sh.initActive("p1");
                expect(mon.item.possibleValues).to.include.keys("none", "mail");

                const reason = reasonItem.hasUnknown(mon);
                reason.reject();
                expect(mon.item.possibleValues).to.have.keys("none");
                expect(reason.canHold()).to.be.false;
            });

            it("Should throw if overnarrowing", function()
            {
                const mon = sh.initActive("p1");
                mon.item.narrow("mail");

                const reason = reasonItem.hasUnknown(mon);
                expect(() => reason.reject()).to.throw(Error,
                    // TODO: more descriptive error message?
                    "All possibilities have been ruled out " +
                        "(should never happen)");
            });
        });

        describe("#delay()", function()
        {
            it("Should call callback immediately if already holds",
            function()
            {
                const mon = sh.initActive("p1");
                mon.item.narrow("mail");

                const reason = reasonItem.hasUnknown(mon);
                let held: boolean | undefined;
                reason.delay(h => held = h);
                expect(held).to.be.true;
            });

            it("Should call callback immediately if already doesn't hold",
            function()
            {
                const mon = sh.initActive("p1");
                mon.item.narrow("none");

                const reason = reasonItem.hasUnknown(mon);
                let held: boolean | undefined;
                reason.delay(h => held = h);
                expect(held).to.be.false;
            });

            it("Should call callback once reason holds", function()
            {
                const mon = sh.initActive("p1");

                const reason = reasonItem.hasUnknown(mon);
                let held: boolean | undefined;
                reason.delay(h => held = h);
                expect(held).to.be.undefined;
                mon.item.narrow("mail");
                expect(held).to.be.true;
            });

            it("Should call callback once reason doesn't hold", function()
            {
                const mon = sh.initActive("p1");

                const reason = reasonItem.hasUnknown(mon);
                let held: boolean | undefined;
                reason.delay(h => held = h);
                expect(held).to.be.undefined;
                mon.item.narrow("none");
                expect(held).to.be.false;
            });

            it("Should cancel callback from return value", function()
            {
                const mon = sh.initActive("p1");

                const reason = reasonItem.hasUnknown(mon);
                let held: boolean | undefined;
                const cancel = reason.delay(h => held = h);
                expect(held).to.be.undefined;
                cancel();
                mon.item.narrow("mail");
                expect(held).to.be.undefined;
            });
        });
    });
});
