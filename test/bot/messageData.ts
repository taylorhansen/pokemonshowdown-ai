import { expect } from "chai";
import "mocha";
import { otherId } from "../../src/bot/helpers";

/**
 * Describes a test case given to a function.
 * @template T Function's return type.
 * @template Args Argument types of the function.
 */
interface TestCase<T, Args extends any[]>
{
    /** Description of the test case. */
    desc: string;
    /** Expected return value. */
    expected: T;
    /** Arguments to be given to the function. */
    args: Args;
}

/**
 * Defines a test suite for a function.
 * @param name Name of the function being tested.
 * @param func The function being tested.
 * @param testCases List of test cases to be given to the function.
 */
function testFunc<T, Args extends any[]>(name: string,
    func: (...args: Args) => T, testCases: TestCase<T, Args>[]): void
{
    describe(name, function()
    {
        for (const testCase of testCases)
        {
            it(testCase.desc, function()
            {
                expect(func(...testCase.args)).to.deep.equal(testCase.expected);
            });
        }
    });
}

describe("MessageData", function()
{
    testFunc("otherId", otherId,
    [
        {desc: "Should return p1 if given p2", expected: "p1", args: ["p2"]},
        {desc: "Should return p2 if given p1", expected: "p2", args: ["p1"]}
    ]);
});
