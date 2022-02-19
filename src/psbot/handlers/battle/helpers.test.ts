import {expect} from "chai";
import "mocha";
import {toIdName} from "./helpers";

/**
 * Describes a test case given to a function.
 *
 * @template T Function's return type.
 * @template Args Argument types of the function.
 */
interface TestCase<T, TArgs extends unknown[]> {
    /** Description of the test case. */
    desc: string;
    /** Expected return value. */
    expected: T;
    /** Arguments to be given to the function. */
    args: TArgs;
}

/**
 * Defines a test suite for a function.
 *
 * @param name Name of the function being tested.
 * @param func The function being tested.
 * @param testCases List of test cases to be given to the function.
 */
function testFunc<T, TArgs extends unknown[]>(
    name: string,
    func: (...args: TArgs) => T,
    testCases: TestCase<T, TArgs>[],
): void {
    describe(name, function () {
        for (const testCase of testCases) {
            it(testCase.desc, function () {
                expect(func(...testCase.args)).to.deep.equal(testCase.expected);
            });
        }
    });
}

export const test = () =>
    describe("helpers", function () {
        testFunc("toIdName()", toIdName, [
            {
                desc: "Should lowercase and remove spaces",
                expected: "lifeorb",
                args: ["Life Orb"],
            },
            {
                desc: "Should resolve 'Farfetch’d' apostrophe",
                expected: "farfetchd",
                args: ["farfetch’d"],
            },
            {
                desc: "Should filter multiple punctuation marks",
                expected: "willowisp",
                args: ["Will-O-Wisp"],
            },
        ]);
    });
