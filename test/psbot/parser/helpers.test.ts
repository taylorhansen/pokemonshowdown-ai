import { expect } from "chai";
import "mocha";
import { Logger } from "../../../src/Logger";
import { anyWord, boostName, integer, majorStatus, playerId, playerIdWithName,
    pokemonDetails, pokemonId, pokemonStatus, restOfLine, skipLine,
    weatherTypeOrNone, word } from "../../../src/psbot/parser/helpers";
import { iter } from "../../../src/psbot/parser/Iter";
import { Info, Parser } from "../../../src/psbot/parser/types";

describe("Parser Helpers", function()
{
    const info: Info = {room: "", logger: Logger.null};

    describe("anyWord", function()
    {
        it("Should parse any word", function()
        {
            const r = anyWord(iter(["x", "y"]), info);
            expect(r.result).to.equal("x");
            expect(r.remaining.get()).to.equal("y");
            expect(r.remaining.done).to.be.false;
        });

        it("Should throw if newline", function()
        {
            const input = iter(["\n"]);
            expect(() => anyWord(input, info)).to.throw();
        });

        it("Should throw if given empty iterator", function()
        {
            const input = iter([]);
            expect(() => anyWord(input, info)).to.throw();
        });
    });

    /**
     * Tests a Parser success.
     * @param name Name of the test.
     * @param parser Parser to test.
     * @param input Input for the Parser.
     * @param value What the Parser should output.
     * @param remaining Expected value for the next input word after parsing.
     */
    function testSuccess<TResult, TInput>(name: string,
        parser: Parser<TResult, TInput>, input: TInput[], value: TResult,
        remaining?: TInput): Mocha.Test
    {
        return it(name, function()
        {
            const r = parser(iter(input), info);
            expect(r.result).to.deep.equal(value);
            if (remaining)
            {
                expect(r.remaining.done).to.be.false;
                expect(r.remaining.get()).to.equal(remaining);
            }
            else expect(r.remaining.done).to.be.true;
        });
    }

    /**
     * Tests a Parser failure.
     * @param name Name of the test.
     * @param parser Parser to test.
     * @param input Input that should make the parser throw an error.
     */
    function testFailure<TResult, TInput>(name: string,
        parser: Parser<TResult, TInput>, input: TInput[]): Mocha.Test
    {
        return it(name, function()
        {
            expect(() => parser(iter(input), info)).to.throw();
        });
    }

    describe("integer", function()
    {
        testSuccess("Should parse integer", integer, ["10"], 10);
        testFailure("Should throw if invalid integer", integer, ["x"]);
    });

    describe("playerId", function()
    {
        testSuccess("Should parse PlayerID", playerId, ["p1"], "p1");
        testFailure("Should throw if invalid PlayerID", playerId, ["1p"]);
    });

    describe("playerIdWithName", function()
    {
        testSuccess("Should parse PlayerID with name", playerIdWithName,
            ["p2: user"], {id: "p2", username: "user"});
        testFailure("Should throw if invalid PlayerID", playerIdWithName,
            ["2p"]);
        testFailure("Should throw if no username", playerIdWithName, ["p1"]);
    });

    describe("pokemonId", function()
    {
        testSuccess("Should parse PokemonID", pokemonId, ["p2a: nick"],
            {owner: "p2", position: "a", nickname: "nick"});
        testFailure("Should throw if invalid PlayerID", pokemonId,
            ["2p: nick"]);
        testFailure("Should throw if invalid PokemonID", pokemonId,
            ["p1a nick"]);
    });

    describe("pokemonDetails", function()
    {
        testSuccess("Should parse PokemonDetails with only species",
            pokemonDetails, ["Magikarp"],
            {species: "Magikarp", shiny: false, gender: null, level: 100});
        testSuccess("Should parse PokemonDetails with everything included",
            pokemonDetails, ["Seaking, shiny, F, L40"],
            {species: "Seaking", shiny: true, gender: "F", level: 40});
        testSuccess("Should parse PokemonDetails with nonshiny",
            pokemonDetails, ["Gyarados, M, L90"],
            {species: "Gyarados", shiny: false, gender: "M", level: 90});
        testSuccess("Should ignore unsupported details", pokemonDetails,
            ["Magikarp, x"],
            {species: "Magikarp", shiny: false, gender: null, level: 100});
        testFailure("Should throw if empty", pokemonDetails, [""]);
    });

    describe("pokemonStatus", function()
    {
        testSuccess("Should parse fainted", pokemonStatus, ["0 fnt"],
            {hp: 0, hpMax: 0, condition: null});
        testSuccess("Should parse hp fraction", pokemonStatus, ["10/100"],
            {hp: 10, hpMax: 100, condition: null});
        testSuccess("Should parse PokemonStatus with major status",
            pokemonStatus, ["46/90 psn"],
            {hp: 46, hpMax: 90, condition: "psn"});
        testFailure("Should throw if no /", pokemonStatus, ["10 100"]);
        testFailure("Should throw if invalid major status", pokemonStatus,
            ["20/40 d"]);
    });

    describe("majorStatus", function()
    {
        testSuccess("Should parse MajorStatus", majorStatus, ["frz"], "frz");
        testFailure("Should throw if invalid MajorStatus", majorStatus, ["x"]);
    });

    describe("boostName", function()
    {
        testSuccess("Should parse BoostName", boostName, ["atk"], "atk");
        testFailure("Should throw if invalid BoostName", boostName, ["hp"]);
    });

    describe("weatherTypeOrNone", function()
    {
        testSuccess("Should parse WeatherType", weatherTypeOrNone,
            ["RainDance"], "RainDance");
        testSuccess("Should parse \"none\"", weatherTypeOrNone,
            ["none"], "none");
        testFailure("Should throw if invalid WeatherType", weatherTypeOrNone,
            ["sn"]);
    });

    describe("skipLine", function()
    {
        testSuccess("Should skip to next newline", skipLine,
            ["x", "y", "\n", "z"], undefined, "\n");
        testSuccess("Should skip to end of input", skipLine, ["x", "y", "z"],
            undefined);
        testSuccess("Should skip nothing if at newline", skipLine, ["\n", "y"],
            undefined, "\n");
    });

    describe("restOfLine", function()
    {
        testSuccess("Should get input up to newline", restOfLine,
            ["x", "y", "\n", "z"], "x|y", "\n");
        testSuccess("Should consume nothing if at newline", restOfLine,
            ["\n", "x"], "", "\n");
        testSuccess("Should get single word without pipe character", restOfLine,
            ["x", "\n", "y"], "x", "\n");
    });

    describe("word()", function()
    {
        testSuccess("Should parse word", word("x"), ["x", "y"], "x", "y");
        testSuccess("Should parse word union", word("x", "y"), ["y", "x"], "y",
            "x");
        testFailure("Should throw if invalid word", word("x", "y"), ["z"]);
    });
});
