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
        it("Should parse two ints", function()
        {
            const parser = sequence(integer, integer);
            const r = parser(iter(["2", "1"]), info);
            expect(r.result).to.have.members([2, 1]);
            expect(r.remaining.get()).to.be.undefined;
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
        const parser = maybe(word("x"));

        it("Should parse nothing if failed", function()
        {
            const input = iter(["y"]);
            const r = parser(input, info);
            expect(r.result).to.be.undefined;
            expect(r.remaining.get()).to.equal("y");
        });

        it("Should parse if valid", function()
        {
            const input = iter(["x"]);
            const r = parser(input, info);
            expect(r.result).to.equal("x");
            expect(r.remaining.get()).to.be.undefined;
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
