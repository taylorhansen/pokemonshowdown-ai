import "mocha";
import {expect} from "chai";
import {constraintWithUsage, rebalanceDist} from "./helpers";

export const test = () =>
    describe("helpers", function () {
        describe("constraintWithUsage()", function () {
            it("Should throw on empty constraint", function () {
                expect(() =>
                    constraintWithUsage(new Set(), new Map([["a", 1]])),
                ).to.throw(Error, "Empty constraint");
            });

            it("Should output zero if empty usage", function () {
                expect([
                    ...constraintWithUsage(
                        new Set(["a", "b", "c"]),
                        new Map(),
                    ).entries(),
                ]).to.have.deep.members([
                    ["a", 0],
                    ["b", 0],
                    ["c", 0],
                ]);
            });

            it("Should add usage probabilities", function () {
                expect([
                    ...constraintWithUsage(
                        new Set(["a", "b", "c"]),
                        new Map([
                            ["a", 0.5],
                            ["c", 0.5],
                        ]),
                    ).entries(),
                ]).to.have.deep.members([
                    ["a", 0.5],
                    ["b", 0],
                    ["c", 0.5],
                ]);
            });

            it("Should add usage probabilities with smoothing", function () {
                expect([
                    ...constraintWithUsage(
                        new Set(["a", "b", "c"]),
                        new Map([
                            ["a", 0.5],
                            ["c", 0.5],
                        ]),
                        0.1,
                    ).entries(),
                ]).to.have.deep.members([
                    ["a", 0.9 * 0.5 + 0.1 / 3],
                    ["b", 0.1 / 3],
                    ["c", 0.9 * 0.5 + 0.1 / 3],
                ]);
            });
        });

        describe("rebalanceDist()", function () {
            it("Should rebalance distribution", function () {
                expect(rebalanceDist([0.6, 0.2, 0.2])).to.have.members([
                    0.3, 0.35, 0.35,
                ]);
            });

            it("Should tend toward uniform distribution", function () {
                let arr = [0.6, 0.2, 0.2];
                for (let i = 0; i < 10; ++i) {
                    arr = rebalanceDist(arr);
                }
                expect(arr).to.have.lengthOf(3);
                expect(arr[0]).to.be.closeTo(1 / 3, 0.0001);
                expect(arr[1]).to.be.closeTo(1 / 3, 0.0001);
                expect(arr[2]).to.be.closeTo(1 / 3, 0.0001);
            });

            it("Should not change uniform distribution", function () {
                expect(rebalanceDist([0.5, 0.5])).to.have.members([0.5, 0.5]);
            });
        });
    });
