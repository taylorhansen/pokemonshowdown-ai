import { expect } from "chai";
import "mocha";
import { PossibilityClass } from
    "../../../../src/bot/battle/state/PossibilityClass";

describe("PossibilityClass", function()
{
    describe("T = number", function()
    {
        const map = {a: 0, b: 1};
        let possibility: PossibilityClass;

        beforeEach("Initialize PossibilityClass", function()
        {
            possibility = new PossibilityClass(map);
        });

        it("Should initially include all keys", function()
        {
            expect(possibility.possibleValues).to.have.deep.members(
                [{name: "a", id: 0}, {name: "b", id: 1}]);
        });

        it("Should rule out all types if one is set", function()
        {
            possibility.set("a");
            // tslint:disable-next-line:no-unused-expression
            expect(possibility.isSet("a")).to.be.true;
            // tslint:disable-next-line:no-unused-expression
            expect(possibility.definiteValue).to.not.be.null;
            expect(possibility.definiteValue!.name).to.equal("a");
        });

        it("Should rule out every type if given empty array", function()
        {
            possibility.set([]);
            // tslint:disable-next-line:no-unused-expression
            expect(possibility.definiteValue).to.be.null;
            // tslint:disable-next-line:no-unused-expression
            expect(possibility.possibleValues).to.be.empty;
        });

        it("Should rule out one type if removed", function()
        {
            possibility.remove("a");
            // tslint:disable-next-line:no-unused-expression
            expect(possibility.isSet("a")).to.be.false;
            expect(possibility.possibleValues).to.have.deep.members(
                [{name: "b", id: 1}]);
        });

        it("Should throw if unknown type is given", function()
        {
            expect(() => possibility.remove("c")).to.throw();
        });

        describe("toArray", function()
        {
            it("Should have values of 1/size if no keys are removed",
            function()
            {
                expect(possibility.toArray()).to.have.members([0.5, 0.5]);
            });

            it("Should have a 1 if all other keys are removed", function()
            {
                possibility.remove("b");
                expect(possibility.toArray()).to.have.members([1, 0]);
            });

            it("Should not divide by zero if all elements are removed",
            function()
            {
                possibility.remove("a");
                possibility.remove("b");
                expect(possibility.toArray()).to.have.members([0, 0]);
            });
        });
    });

    describe("T = {x: number}", function()
    {
        const map = {a: {x: 0}, b: {x: 1}};
        let possibility: PossibilityClass<{x: number}>;

        beforeEach("Initialize PossibilityClass", function()
        {
            possibility = new PossibilityClass<{x: number}>(map, x => x.x);
        });

        it("Should set definite value", function()
        {
            possibility.set("b");
            expect(possibility.definiteValue).to.deep.equal({id: 1, name: "b"});
        });
    });
});
