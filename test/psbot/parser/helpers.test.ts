import { expect } from "chai";
import "mocha";
import { Logger } from "../../../src/Logger";
import { MessageListener } from "../../../src/psbot/dispatcher/MessageListener";
import { anyWord, boostName, dispatch, integer, majorStatus, parseFromSuffix,
    playerId, playerIdWithName, pokemonDetails, pokemonId, pokemonStatus,
    restOfLine, skipLine, weatherType, word } from
    "../../../src/psbot/parser/helpers";
import { iter } from "../../../src/psbot/parser/Iter";
import { Info, Parser } from "../../../src/psbot/parser/types";

describe("Parser Helpers", function()
{
    let info: Info;

    beforeEach("Initialize Info", function()
    {
        info = {room: "", listener: new MessageListener(), logger: Logger.null};
    });

    describe("dispatch()", function()
    {
        it("Should consume nothing and dispatch listener", async function()
        {
            const parser = dispatch("deinit", {});
            let x = false;
            info.listener.on("deinit", () => { x = true; });
            const r = parser(iter([]), info);
            expect(r.remaining.done).to.be.true;
            await r.result;
            expect(x).to.be.true;
        });
    });

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

    function testSuccess<T>(name: string, parser: Parser<T>, input: string[],
        value: T, remaining?: string): Mocha.Test
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

    function testFailure<T>(name: string, parser: Parser<T>, input: string[]):
        Mocha.Test
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

    describe("weatherType", function()
    {
        testSuccess("Should parse WeatherType", weatherType, ["RainDance"],
            "RainDance");
        testFailure("Should throw if invalid WeatherType", weatherType, ["sn"]);
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

    describe("parseFromSuffix()", function()
    {
        it("Should return null if invalid", function()
        {
            expect(parseFromSuffix("not_a valid-suffix")).to.be.null;
        });

        describe("ability", function()
        {
            it("Should parse ability", function()
            {
                expect(parseFromSuffix("ability: Wonder Guard"))
                    .to.deep.equal({type: "ability", ability: "Wonder Guard"});
            });
        });

        describe("item", function()
        {
            it("Should parse item", function()
            {
                expect(parseFromSuffix("item: Leftovers"))
                    .to.deep.equal({type: "item", item: "Leftovers"});
            });
        });

        describe("lockedmove", function()
        {
            it("Should parse lockedmove", function()
            {
                expect(parseFromSuffix("lockedmove"))
                    .to.deep.equal({type: "lockedmove"});
            });
        });

        describe("psn", function()
        {
            it("Should parse psn", function()
            {
                expect(parseFromSuffix("psn"))
                    .to.deep.equal({type: "psn"});
            });
        });
    });
});
