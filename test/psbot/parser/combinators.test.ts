import { expect } from "chai";
import "mocha";
import { Logger } from "../../../src/Logger";
import { MessageListener } from "../../../src/psbot/dispatcher/MessageListener";
import { chain, many, maybe, sequence, some, transform } from
    "../../../src/psbot/parser/combinators";
import { anyWord, integer, word } from "../../../src/psbot/parser/helpers";
import { iter } from "../../../src/psbot/parser/Iter";
import { Info } from "../../../src/psbot/parser/types";

describe("combinators", function()
{
    const info: Info =
    {
        room: "", listener: new MessageListener(), logger: Logger.null
    };

    describe("transform()", function()
    {
        it("Should further parse word", function()
        {
            const parser = transform(anyWord, w => `'${w}'`);
            const r = parser(iter(["z"]), info);
            expect(r.result).to.equal("'z'");
            expect(r.remaining.get()).to.be.undefined;
        });
    });

    describe("sequence()", function()
    {
        it("Should parse nothing", function()
        {
            const parser = sequence();
            const r = parser(iter(["x"]), info);
            expect(r.result).to.be.an("Array").and.be.empty;
            expect(r.remaining.get()).to.equal("x");
        });

        it("Should array-ify single argument", function()
        {
            const parser = sequence(anyWord);
            const r = parser(iter(["x"]), info);
            expect(r.result).to.have.members(["x"]);
            expect(r.remaining.get()).to.be.undefined;
        });

        it("Should parse two ints", function()
        {
            const parser = sequence(integer, integer);
            const r = parser(iter(["2", "1"]), info);
            expect(r.result).to.have.members([2, 1]);
            expect(r.remaining.get()).to.be.undefined;
        });

        it("Should parse four ints", function()
        {
            const parser = sequence(integer, integer, integer, integer);
            const r = parser(iter(["2", "1", "5", "100"]), info);
            expect(r.result).to.have.members([2, 1, 5, 100]);
            expect(r.remaining.get()).to.be.undefined;
        });

        it("Should fail if a sub-parser fails", function()
        {
            const parser = sequence(integer, integer, integer, integer);
            expect(() => parser(iter(["2", "1", "5", "x"]), info)).to.throw();
        });
    });

    describe("chain()", function()
    {
        it("Should parse two identical words", function()
        {
            const parser = chain(anyWord, w => word(w));
            const r = parser(iter(["x", "x"]), info);
            expect(r.result).to.equal("x");
            expect(r.remaining.get()).to.be.undefined;

            expect(() => parser(iter(["x", "y"]), info)).to.throw();
        });
    });

    describe("maybe()", function()
    {
        it("Should parse nothing if failed", function()
        {
            const parser = maybe(word("x"));
            const r = parser(iter(["y"]), info);
            expect(r.result).to.be.undefined;
            expect(r.remaining.get()).to.equal("y");
        });

        it("Should parse if valid", function()
        {
            const parser = maybe(word("x"));
            const r = parser(iter(["x"]), info);
            expect(r.result).to.equal("x");
            expect(r.remaining.get()).to.be.undefined;
        });

        it("Should fill in alternate value", function()
        {
            const parser = maybe(word("x"), "z");
            const r = parser(iter(["y"]), info);
            expect(r.result).to.equal("z");
            expect(r.remaining.get()).to.equal("y");
        });
    });

    describe("some()", function()
    {
        const parser = some(word("x"));

        it("Should parse nothing if failed", function()
        {
            const input = iter([]);
            const r = parser(input, info);
            expect(r).to.deep.equal({result: [], remaining: input});
        });

        it("Should parse if valid", function()
        {
            const input = iter(["x"]);
            const r = parser(input, info);
            expect(r.result).to.have.members(["x"]);
            expect(r.remaining.get()).to.be.undefined;
        });

        it("Should parse more than once if valid", function()
        {
            const input = iter(["x", "x"]);
            const r = parser(input, info);
            expect(r.result).to.have.members(["x", "x"]);
            expect(r.remaining.get()).to.be.undefined;
        });

        it("Should parse until invalid", function()
        {
            const input = iter(["x", "x", "y"]);
            const r = parser(input, info);
            expect(r.result).to.have.members(["x", "x"]);
            expect(r.remaining.get()).to.equal("y");
        });
    });

    describe("many()", function()
    {
        const parser = many(word("x"));

        it("Should not parse nothing if failed", function()
        {
            const input = iter([]);
            expect(() => parser(input, info)).to.throw();
        });

        it("Should parse if valid", function()
        {
            const input = iter(["x"]);
            const r = parser(input, info);
            expect(r.result).to.have.members(["x"]);
            expect(r.remaining.get()).to.be.undefined;
        });

        it("Should parse more than once if valid", function()
        {
            const input = iter(["x", "x"]);
            const r = parser(input, info);
            expect(r.result).to.have.members(["x", "x"]);
            expect(r.remaining.get()).to.be.undefined;
        });

        it("Should parse until invalid", function()
        {
            const input = iter(["x", "x", "y"]);
            const r = parser(input, info);
            expect(r.result).to.have.members(["x", "x"]);
            expect(r.remaining.get()).to.equal("y");
        });
    });
});
