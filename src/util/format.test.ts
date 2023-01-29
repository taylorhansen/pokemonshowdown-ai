import "mocha";
import {expect} from "chai";
import {numDigits} from "./format";

export const test = () =>
    describe("format", function () {
        describe("numDigits()", function () {
            it("Should return 1 for 0-9", function () {
                for (let i = 0; i < 10; ++i) {
                    const digits = numDigits(i);
                    expect(digits).to.equal(
                        1,
                        `expected numDigits(${i}) to equal 1 but got ${digits}`,
                    );
                }
            });

            it("Should return 2 for 10-99", function () {
                for (let i = 10; i < 100; ++i) {
                    const digits = numDigits(i);
                    expect(digits).to.equal(
                        2,
                        `expected numDigits(${i}) to equal 2 but got ${digits}`,
                    );
                }
            });

            it("Should return 3 for 100-999", function () {
                for (let i = 100; i < 1000; ++i) {
                    const digits = numDigits(i);
                    expect(digits).to.equal(
                        3,
                        `expected numDigits(${i}) to equal 3 but got ${digits}`,
                    );
                }
            });
        });
    });
