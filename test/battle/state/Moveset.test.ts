import { expect } from "chai";
import "mocha";
import * as dex from "../../../src/battle/dex/dex";
import { Move } from "../../../src/battle/state/Move";
import { Moveset } from "../../../src/battle/state/Moveset";

describe("Moveset", function()
{
    const twoMoves = ["splash", "tackle"] as const;
    const fourMoves = [...twoMoves, "hyperbeam", "gigaimpact"] as const;
    const fiveMoves = [...fourMoves, "metronome"] as const;

    describe("constructor", function()
    {
        describe("no-args", function()
        {
            it("Should initialize default constraint and size", function()
            {
                const moveset = new Moveset();
                expect(moveset.moves).to.be.empty;
                expect(moveset.constraint)
                    .to.have.all.keys(Object.keys(dex.moves));
                expect(moveset.size).to.equal(Moveset.maxSize);
            });
        });

        describe("movepool", function()
        {
            it("Should initialize constraint", function()
            {
                const moveset = new Moveset(fiveMoves);
                expect(moveset.moves).to.be.empty;
                expect(moveset.constraint).to.have.all.keys(fiveMoves);
                expect(moveset.size).to.equal(Moveset.maxSize);
            });
        });

        describe("size", function()
        {
            it("Should initialize constraint and size", function()
            {
                const moveset = new Moveset(3);
                expect(moveset.moves).to.be.empty;
                expect(moveset.constraint)
                    .to.have.all.keys(Object.keys(dex.moves));
                expect(moveset.size).to.equal(3);
            });
        });

        describe("movepool+size", function()
        {
            it("Should initialize constraint and size", function()
            {
                const moveset = new Moveset(fourMoves, 3);
                expect(moveset.moves).to.be.empty;
                expect(moveset.constraint).to.have.all.keys(fourMoves);
                expect(moveset.size).to.equal(3);
            });

            it("Should initialize moves if movepool is smaller than max size",
            function()
            {
                const moveset = new Moveset(twoMoves);
                expect(moveset.moves).to.have.all.keys(twoMoves);
                expect(moveset.constraint).to.be.empty;
                expect(moveset.size).to.equal(twoMoves.length);
            });
        });
    });

    describe("#size", function()
    {
        it("Should set size", function()
        {
            const moveset = new Moveset(3);
            expect(moveset.size).to.equal(3);

            moveset.size = 2;
            expect(moveset.size).to.equal(2);
        });

        it("Should throw if smaller than inferred moves", function()
        {
            const moveset = new Moveset(["splash", "tackle"]);
            expect(() => moveset.size = 1).to.throw(Error,
                "Requested Moveset size 1 is smaller than current size 2");
        });

        it("Should throw if larger than max size", function()
        {
            const moveset = new Moveset();
            expect(() => moveset.size = Moveset.maxSize + 1).to.throw(Error,
                `Requested Moveset size ${Moveset.maxSize + 1} is bigger ` +
                `than maximum size ${Moveset.maxSize}`);
        });

        it("Should consume constraint if sufficiently narrowed", function()
        {
            const moveset = new Moveset(twoMoves, 1);
            expect(moveset.moves).to.be.empty;
            expect(moveset.constraint).to.have.all.keys(twoMoves);

            // expand moveset enough to fit the movepool
            moveset.size = 2;
            expect(moveset.moves).to.have.all.keys(twoMoves);
            expect(moveset.constraint).to.be.empty;
        });

        it("Should propagate size-based inference to link/base", function()
        {
            const moveset = new Moveset();
            const base = new Moveset(twoMoves, 1);
            moveset.link(base, "base");

            const transform = new Moveset();
            transform.link(moveset, "transform");

            // expand moveset enough to fit the movepool
            transform.size = 2;
            expect(moveset.moves).to.have.all.keys(twoMoves);
            expect(moveset.constraint).to.be.empty;
            expect(base.moves).to.have.all.keys(twoMoves);
            expect(base.constraint).to.be.empty;
            expect(transform.moves).to.have.all.keys(twoMoves);
            expect(transform.constraint).to.be.empty;
        });
    });

    describe("#link()", function()
    {
        describe("info = base", function()
        {
            it("Should copy moves", function()
            {
                const moveset = new Moveset();
                const base = new Moveset();
                base.reveal("splash");
                moveset.link(base, "base");
                expect(moveset.get("splash")).to.equal(base.get("splash"))
                    .and.to.not.be.null;
                // not by-ref array copy
                expect(moveset.moves).to.not.equal(base.moves);
            });

            it("Should propagate #reveal() calls from child to parent",
            function()
            {
                const moveset = new Moveset();
                const base = new Moveset();
                moveset.link(base, "base");
                moveset.reveal("splash");
                expect(moveset.get("splash")).to.equal(base.get("splash"))
                    .and.to.not.be.null;
                // not by-ref array copy
                expect(moveset.moves).to.not.equal(base.moves);
            });

            it("Should not notice base changes", function()
            {
                const moveset = new Moveset();
                const base = new Moveset();
                moveset.link(base, "base");
                base.reveal("splash");
                expect(moveset.get("splash")).to.be.null;
            });

            it("Should reclaim link if linked again after isolate", function()
            {
                const moveset = new Moveset();
                const base = new Moveset();
                const transform = new Moveset();
                moveset.link(base, "base");
                transform.link(moveset, "transform");

                moveset.isolate();
                moveset.link(base, "base");
                // to test this, see if changing the base moveset causes a
                //  change in the transform user
                // if the moveset didn't reclaim its link, the move would be
                //  propagated normally
                // technically modifying the base moveset is an error, but for
                //  now it isn't being caught
                base.reveal("tackle");
                expect(moveset.get("tackle")).to.be.null;
                expect(transform.get("tackle")).to.be.null;
            });

            it("Should throw if base changed after reveal", function()
            {
                const moveset = new Moveset();
                const base = new Moveset();
                moveset.link(base, "base");
                base.reveal("splash");
                expect(() => moveset.reveal("tackle")).to.throw(Error,
                    "Base Moveset expected to not change");
            });

            it("Should throw if base Moveset already has a base", function()
            {
                const moveset = new Moveset();
                const base1 = new Moveset();
                const base2 = new Moveset();
                base1.link(base2, "base");

                expect(() => moveset.link(base1, "base")).to.throw(Error,
                    "Base Moveset can't also have a base Moveset");
            });

            it("Should throw if base Moveset is a Transform user", function()
            {
                const moveset = new Moveset();
                const base = new Moveset();
                const transform = new Moveset();
                base.link(transform, "transform");

                expect(() => moveset.link(base, "base")).to.throw(Error,
                    "Transform user can't be a base Moveset");
            });
        });

        describe("info = transform", function()
        {
            it("Should deep copy moves", function()
            {
                const moveset = new Moveset();
                const transform = new Moveset();
                transform.reveal("splash");
                moveset.link(transform, "transform");

                // target moveset should have full pp
                expect(moveset.get("splash")).to.have.property("pp", 5);
                expect(transform.get("splash")).to.have.property("pp", 64);
            });

            it("Should propagate #reveal() calls from target", function()
            {
                const moveset = new Moveset();
                const transform = new Moveset();
                moveset.link(transform, "transform");
                transform.reveal("splash");

                // target moveset should have full pp
                expect(moveset.get("splash")).to.have.property("pp", 5);
                expect(transform.get("splash")).to.have.property("pp", 64);
            });

            it("Should propagate #reveal() calls from user", function()
            {
                const moveset = new Moveset();
                const transform = new Moveset();
                moveset.link(transform, "transform");
                moveset.reveal("splash");

                // target moveset should have full pp
                expect(moveset.get("splash")).to.have.property("pp", 5);
                expect(transform.get("splash")).to.have.property("pp", 64);
            });

            it("Should propagate #reveal() calls for multiple Movesets",
            function()
            {
                const moveset = new Moveset();
                const transform1 = new Moveset();
                const transform2 = new Moveset();
                transform1.link(moveset, "transform");
                transform2.link(moveset, "transform");
                transform2.reveal("splash");

                // target moveset should have full pp
                expect(moveset.get("splash")).to.have.property("pp", 64);
                expect(transform1.get("splash")).to.have.property("pp", 5);
                expect(transform2.get("splash")).to.have.property("pp", 5);
            });

            it("Should propagate to target's base Moveset from a linked " +
                "Moveset", function()
            {
                const moveset = new Moveset();
                const base = new Moveset();
                const transform = new Moveset();
                moveset.link(base, "base");
                transform.link(moveset, "transform");
                transform.reveal("splash");

                expect(moveset.get("splash")).to.equal(base.get("splash"))
                    .and.to.have.property("pp", 64);
                expect(transform.get("splash")).to.have.property("pp", 5);
            });
        });
    });

    describe("#isolate()", function()
    {
        it("Should unlink from other Movesets", function()
        {
            const moveset = new Moveset();
            const transform1 = new Moveset();
            const transform2 = new Moveset();
            transform1.link(moveset, "transform");
            transform2.link(moveset, "transform");

            moveset.isolate();
            transform2.reveal("splash");
            expect(moveset.get("splash")).to.be.null;
            expect(transform1.get("splash")).to.not.be.null;
            expect(transform1.get("splash")!.pp).to.equal(5);
            expect(transform2.get("splash")).to.not.be.null;
            expect(transform2.get("splash")!.pp).to.equal(5);
        });

        it("Should link base", function()
        {
            const moveset = new Moveset();
            const base = new Moveset();
            const transform1 = new Moveset();
            const transform2 = new Moveset();
            moveset.link(base, "base");
            transform1.link(moveset, "transform");
            transform2.link(moveset, "transform");

            moveset.isolate();
            transform2.reveal("splash");
            expect(moveset.get("splash")).to.be.null;
            expect(base.get("splash")).to.not.be.null;
            expect(base.get("splash")!.pp).to.equal(64);
            expect(transform1.get("splash")).to.not.be.null;
            expect(transform1.get("splash")!.pp).to.equal(5);
            expect(transform2.get("splash")).to.not.be.null;
            expect(transform2.get("splash")!.pp).to.equal(5);
        });
    });

    describe("#get()/#reveal()", function()
    {
        it("Should be null if not revealed", function()
        {
            const moveset = new Moveset();
            expect(moveset.get("splash")).to.be.null;
        });

        it("Should not be null if revealed", function()
        {
            const moveset = new Moveset();
            moveset.reveal("splash");
            expect(moveset.get("splash")).to.not.be.null;
        });
    });

    describe("#reveal()", function()
    {
        it("Should throw if moveset is full", function()
        {
            const moveset = new Moveset();
            moveset.reveal("splash");
            moveset.reveal("tackle");
            moveset.reveal("wish");
            moveset.reveal("metronome");
            expect(() => moveset.reveal("return")).to.throw(Error,
                "Rejected reveal() with name=return and maxpp=undefined: " +
                "Moveset is already full " +
                "(moves: splash, tackle, wish, metronome)");
        });

        it("Should not add duplicates", function()
        {
            const moveset = new Moveset();
            const move = moveset.reveal("splash");
            expect(moveset.reveal("splash")).to.equal(move);
        });

        it("Should clear constraint if full", function()
        {
            const moveset = new Moveset(["tackle", "splash"], 1);
            expect(moveset.constraint).to.have.keys("tackle", "splash");
            moveset.reveal("tackle");
            expect(moveset.constraint).to.be.empty;
        });
    });

    describe("#replace()", function()
    {
        it("Should replace move", function()
        {
            const moveset = new Moveset();
            moveset.reveal("splash");
            const move = new Move("tackle");
            moveset.replace("splash", move);
            expect(moveset.get("splash")).to.be.null;
            expect(moveset.get("tackle")).to.not.be.null;
        });

        it("Should infer no move equal to the replacing mvoe", function()
        {
            const moveset = new Moveset();
            expect(moveset.constraint).to.have.any.keys("tackle");

            moveset.reveal("splash");
            const move = new Move("tackle");
            moveset.replace("splash", move);

            expect(moveset.constraint).to.not.have.any.keys("tackle");
            expect(moveset.get("splash")).to.be.null;
            expect(moveset.get("tackle")).to.not.be.null;
        });

        it("Should throw if replacing unrevealed move", function()
        {
            const moveset = new Moveset();
            const move = new Move("tackle");
            expect(() => moveset.replace("splash", move)).to.throw(Error,
                "Moveset does not contain 'splash'");
            expect(moveset.get("splash")).to.be.null;
            expect(moveset.get("tackle")).to.be.null;
        });

        it("Should throw if already know replacing move", function()
        {
            const moveset = new Moveset();
            moveset.reveal("splash");
            moveset.reveal("tackle");
            const move = new Move("tackle");
            expect(() => moveset.replace("splash", move)).to.throw(Error,
                "Moveset cannot contain two 'tackle' moves");
            expect(moveset.get("splash")).to.not.be.null;
            expect(moveset.get("tackle")).to.not.be.null;
        });

        it("Should not propagate to base", function()
        {
            const moveset = new Moveset();
            const base = new Moveset();
            moveset.link(base, "base");

            moveset.reveal("tackle");
            moveset.replace("tackle", new Move("splash"));
            expect(moveset.get("splash")).to.not.be.null;
            expect(base.get("splash")).to.be.null;
        });

        it("Should propagate to base if specified", function()
        {
            const moveset = new Moveset();
            const base = new Moveset();
            moveset.link(base, "base");

            moveset.reveal("tackle");
            moveset.replace("tackle", new Move("splash"), /*base*/true);
            // copied by-ref
            expect(moveset.get("splash")).to.equal(base.get("splash"))
                .and.to.not.be.null;
        });
    });

    describe("#inferDoesntHave()", function()
    {
        it("Should not add constraints one at a time", function()
        {
            const moveset = new Moveset(fiveMoves);

            // two moves being removed from 5-move movepool
            moveset.inferDoesntHave(twoMoves);
            expect(moveset.size).to.equal(3);

            const remaining = fiveMoves.filter(
                n => !twoMoves.includes(n as any));
            expect(moveset.moves).to.have.all.keys(remaining);
        });

        it("Should further constrain moves", function()
        {
            const moveset = new Moveset(
                ["splash", "tackle", "gigaimpact", "hyperbeam", "metronome"],
                2);

            moveset.inferDoesntHave(["gigaimpact", "hyperbeam"]);
            expect(moveset.constraint)
                .to.have.keys("splash", "tackle", "metronome");
        });

        it("Should narrow move slot constraints", function()
        {
            const moveset = new Moveset(
                ["splash", "tackle", "gigaimpact", "hyperbeam", "metronome"],
                2);
            moveset.addMoveSlotConstraint(["splash", "tackle", "gigaimpact"]);

            moveset.inferDoesntHave(["splash", "hyperbeam"]);
            expect(moveset.constraint)
                .to.have.keys("tackle", "metronome", "gigaimpact");
            expect(moveset.moveSlotConstraints).to.have.lengthOf(1);
            expect(moveset.moveSlotConstraints[0])
                .to.have.keys("tackle", "gigaimpact");
        });

        it("Should reveal if move slot constraints narrowed enough", function()
        {
            const moveset = new Moveset(
                ["splash", "tackle", "gigaimpact", "hyperbeam", "metronome"],
                2);
            moveset.addMoveSlotConstraint(["splash", "tackle"]);

            moveset.inferDoesntHave(["splash", "hyperbeam"]);
            expect(moveset.get("tackle")).to.not.be.null;
            expect(moveset.moveSlotConstraints).to.be.empty;
            expect(moveset.constraint)
                .to.have.keys("gigaimpact", "metronome");
        });

        it("Should throw if the call would over-narrow move slot constraint",
        function()
        {
            const moveset = new Moveset(
                ["splash", "tackle", "gigaimpact", "hyperbeam", "metronome"],
                2);
            moveset.addMoveSlotConstraint(["splash", "tackle"]);

            expect(() => moveset.inferDoesntHave(["splash", "tackle"]))
                .to.throw(Error, "Rejected Moveset#inferDoesntHave() with " +
                "moves=[splash, tackle] since the Moveset's slot constraint " +
                "[splash, tackle] would be invalidated");
        });
    });

    describe("#addMoveSlotConstraint()", function()
    {
        it("Should add move slot constraint", function()
        {
            const moveset = new Moveset();
            moveset.addMoveSlotConstraint(fourMoves);
            expect(moveset.moveSlotConstraints).to.have.lengthOf(1);
            expect(moveset.moveSlotConstraints[0]).to.have.all.keys(fourMoves);
        });

        it("Should intersect with movepool constraint", function()
        {
            const moveset = new Moveset(fourMoves, 2);
            moveset.addMoveSlotConstraint(fiveMoves);
            expect(moveset.moveSlotConstraints).to.have.lengthOf(1);
            expect(moveset.moveSlotConstraints[0]).to.have.all.keys(fourMoves);
        });

        it("Should reveal if intersection with movepool yields one move",
        function()
        {
            const moveset = new Moveset(twoMoves, 1);
            expect(moveset.get("tackle")).to.be.null;
            moveset.addMoveSlotConstraint(["tackle", "takedown"]);
            expect(moveset.get("tackle")).to.not.be.null;
        });

        it("Should throw if intersection with movepool is empty", function()
        {
            const moveset = new Moveset(twoMoves, 1);
            expect(() => moveset.addMoveSlotConstraint(["takedown"]))
                .to.throw(Error, "Move slot constraint [takedown] cannot " +
                    "exist for this Moveset");
        });

        it("Should intersect all move slot constraints if one move left",
        function()
        {
            const moveset = new Moveset(fourMoves, 2);
            moveset.addMoveSlotConstraint(["tackle", "splash"]);
            moveset.addMoveSlotConstraint(["tackle", "hyperbeam"]);

            moveset.reveal("gigaimpact");
            expect(moveset.get("gigaimpact")).to.not.be.null;
            expect(moveset.get("tackle")).to.not.be.null;
        });

        it("Should throw if one move left and move slot constraints can't " +
            "intersect", function()
        {
            const moveset = new Moveset(2);
            moveset.addMoveSlotConstraint(["tackle", "splash"]);
            moveset.addMoveSlotConstraint(["hyperbeam", "gigaimpact"]);

            expect(() => moveset.reveal("takedown")).to.throw(Error,
                "Move slot constraints can't intersect");
        });

        it("Should be removed if satisfied by #reveal()", function()
        {
            const moveset = new Moveset();
            moveset.addMoveSlotConstraint(["tackle", "splash"]);
            expect(moveset.moveSlotConstraints).to.have.lengthOf(1);
            moveset.reveal("tackle");
            expect(moveset.moveSlotConstraints).to.be.empty;
        });

        it("Should be removed if satisfied by #replace()", function()
        {
            const moveset = new Moveset();
            moveset.reveal("takedown");
            moveset.addMoveSlotConstraint(["tackle", "splash"]);
            expect(moveset.moveSlotConstraints).to.have.lengthOf(1);
            moveset.replace("takedown", new Move("splash"));
            expect(moveset.moveSlotConstraints).to.be.empty;
        });

        it("Should not throw if already satisfied and Moveset is full",
        function()
        {
            const moveset = new Moveset(fourMoves);
            expect(() => moveset.addMoveSlotConstraint(["splash", "tackle"]))
                .to.not.throw();
        });

        it("Should throw if not already satisfied and Moveset is full",
        function()
        {
            const moveset = new Moveset(fourMoves);
            expect(() => moveset.addMoveSlotConstraint(["metronome", "flash"]))
                .to.throw(Error, "Move slot constraint [metronome, flash] " +
                    "cannot exist for this Moveset");
        });
    });
});
