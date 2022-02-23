import {expect} from "chai";
import "mocha";
import {Move} from "./Move";

export const test = () =>
    describe("Move", function () {
        describe("ctor", function () {
            it("Should initialize name and pp", function () {
                const move = new Move("splash");
                expect(move.name).to.equal("splash");
                expect(move.pp).to.equal(64);
                expect(move.maxpp).to.equal(64); // Default max value.
            });

            it("Should throw if invalid move name", function () {
                expect(() => new Move("something invalid")).to.throw(
                    Error,
                    "Invalid move name 'something invalid'",
                );
            });

            describe("maxpp parameter", function () {
                it('Should add no pp ups if "min"', function () {
                    const move = new Move("splash", "min");
                    expect(move.pp).to.equal(40);
                    expect(move.maxpp).to.equal(40);
                });

                it('Should add pp ups if "max"', function () {
                    const move = new Move("splash", "max");
                    expect(move.pp).to.equal(64);
                    expect(move.maxpp).to.equal(64);
                });

                it("Should handle custom maxpp value", function () {
                    const move = new Move("splash", 5);
                    expect(move.pp).to.equal(5);
                    expect(move.maxpp).to.equal(5);
                });

                it("Should cap custom maxpp value", function () {
                    const move = new Move("splash", 100);
                    expect(move.pp).to.equal(64);
                    expect(move.maxpp).to.equal(64);
                });

                it("Should set negative maxpp to 1", function () {
                    const move = new Move("splash", -20);
                    expect(move.pp).to.equal(1);
                    expect(move.maxpp).to.equal(1);
                });
            });

            describe("pp parameter", function () {
                it("Should set pp normally", function () {
                    const move = new Move("splash", "max", 5);
                    expect(move.pp).to.equal(5);
                    expect(move.maxpp).to.equal(64);
                });

                it("Should cap custom pp value", function () {
                    const move = new Move("splash", "max", 100);
                    expect(move.pp).to.equal(64);
                    expect(move.maxpp).to.equal(64);
                });
            });
        });

        describe("#pp", function () {
            it("Should set to 0 if negative", function () {
                const move = new Move("splash");
                move.pp = -1;
                expect(move.pp).to.equal(0);
            });

            it("Should set to max if over", function () {
                const move = new Move("splash");
                move.pp = 100;
                expect(move.pp).to.equal(move.maxpp);
            });
        });
    });
