import {expect} from "chai";
import "mocha";
import {pluralTurns, plus} from "./utility";

export const test = () =>
    describe("utility helpers", function () {
        describe("pluralTurns()", function () {
            it("Should use singular", function () {
                expect(pluralTurns(1)).to.equal("1 turn");
            });

            it("Should use singular denom", function () {
                expect(pluralTurns(2, 1)).to.equal("2/1 turn");
            });

            it("Should use plural", function () {
                expect(pluralTurns(5)).to.equal("5 turns");
            });

            it("Should use plural denom", function () {
                expect(pluralTurns(1, 5)).to.equal("1/5 turns");
            });

            it("Should use status prefix", function () {
                expect(pluralTurns("tox", 1)).to.equal("tox for 1 turn");
            });

            it("Should use status prefix with denom", function () {
                expect(pluralTurns("slp", 3, 4)).to.equal("slp for 3/4 turns");
            });
        });

        describe("plus()", function () {
            it("Should display sign if positive", function () {
                expect(plus(1)).to.equal("+1");
            });

            it("Should display sign if negative", function () {
                expect(plus(-1)).to.equal("-1");
            });

            it("Should not display sign if zero", function () {
                expect(plus(0)).to.equal("0");
            });
        });
    });
