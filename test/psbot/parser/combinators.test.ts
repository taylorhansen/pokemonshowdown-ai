import { expect } from "chai";
import "mocha";
import { Logger } from "../../../src/Logger";
import { maybe, sequence, transform } from
    "../../../src/psbot/parser/combinators";
import { anyWord, integer, word } from "../../../src/psbot/parser/helpers";
import { iter } from "../../../src/psbot/parser/Iter";
import { Info } from "../../../src/psbot/parser/types";

describe("combinators", function()
{
    const info: Info = {room: "", logger: Logger.null};

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
});
