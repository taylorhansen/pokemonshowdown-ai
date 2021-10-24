import {expect} from "chai";
import "mocha";
import * as reasonChance from "./chance";

export const test = () =>
    describe("chance", function () {
        describe("create()", function () {
            describe("#canHold()", function () {
                it("Should return null", function () {
                    const reason = reasonChance.create();
                    expect(reason.canHold()).to.be.null;
                });
            });

            describe("#assert()", function () {
                it("Should do nothing", function () {
                    const reason = reasonChance.create();
                    reason.assert();
                });
            });

            describe("#reject()", function () {
                it("Should do nothing", function () {
                    const reason = reasonChance.create();
                    reason.reject();
                });
            });

            describe("#delay()", function () {
                it("Should call callback immediately if asserted beforehand", function () {
                    const reason = reasonChance.create();
                    reason.assert();
                    let held: boolean | undefined;
                    reason.delay(h => (held = h));
                    expect(held).to.be.true;
                });

                it("Should call callback immediately if rejected beforehand", function () {
                    const reason = reasonChance.create();
                    reason.reject();
                    let held: boolean | undefined;
                    reason.delay(h => (held = h));
                    expect(held).to.be.false;
                });

                it("Should call callback if asserted", function () {
                    const reason = reasonChance.create();
                    let held: boolean | undefined;
                    reason.delay(h => (held = h));
                    reason.assert();
                    expect(held).to.be.true;
                });

                it("Should call callback if rejected", function () {
                    const reason = reasonChance.create();
                    let held: boolean | undefined;
                    reason.delay(h => (held = h));
                    reason.reject();
                    expect(held).to.be.false;
                });

                it("Should cancel callback from return value", function () {
                    const reason = reasonChance.create();
                    let held: boolean | undefined;
                    const cancel = reason.delay(h => (held = h));
                    cancel();
                    reason.assert();
                    expect(held).to.be.undefined;
                });
            });
        });
    });
