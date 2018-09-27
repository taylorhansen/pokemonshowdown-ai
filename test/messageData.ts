import { expect } from "chai";
import "mocha";
import { otherId, stringifyDetails, stringifyID, stringifyRequest,
    stringifyStatus } from "../src/messageData";

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
        {desc: "Should retunr p2 if given p1", expected: "p2", args: ["p1"]}
    ]);

    testFunc("stringifyID", stringifyID,
    [
        {
            desc: "Should stringify a PokemonID", expected: "p1a: mon",
            args: [{owner: "p1", position: "a", nickname: "mon"}]
        }
    ]);

    testFunc("stringifyDetails", stringifyDetails,
    [
        {
            desc: "Should stringify a PokemonDetails",
            expected: "Magikarp, shiny, F, L50",
            args: [{species: "Magikarp", shiny: true, gender: "F", level: 50}]
        },
        {
            desc: "Should return only species", expected: "Porygon",
            args: [{species: "Porygon", shiny: false, gender: null, level: 100}]
        }
    ]);

    testFunc("stringifyStatus", stringifyStatus,
    [
        {
            desc: "Should stringify a PokemonStatus", expected: "10/10 psn",
            args: [{hp: 10, hpMax: 10, condition: "psn"}]
        },
        {
            desc: "Should return 0 fnt", expected: "0 fnt",
            args: [{hp: 0, hpMax: 0, condition: ""}]
        }
    ]);

    testFunc("stringifyRequest", stringifyRequest,
    [
        {
            desc: "Should stringify a RequestData",
            expected: "{\"side\":" +
                    "{\"name\":\"username\",\"id\":\"p1\",\"pokemon\":[]}," +
                "\"rqid\":10}",
            args:
            [
                {
                    side:
                    {
                        name: "username", id: "p1",
                        pokemon: []
                    },
                    rqid: 10
                }
            ]
        }
    ]);
});
