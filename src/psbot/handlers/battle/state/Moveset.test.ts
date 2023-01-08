import {expect} from "chai";
import "mocha";
import * as dex from "../dex";
import {Move} from "./Move";
import {Moveset} from "./Moveset";

export const test = () =>
    describe("Moveset", function () {
        const twoMoves = ["splash", "tackle"] as const;
        const fourMoves = [...twoMoves, "hyperbeam", "gigaimpact"] as const;
        const fiveMoves = [...fourMoves, "metronome"] as const;

        describe("constructor", function () {
            describe("no-args", function () {
                it("Should initialize default constraint and size", function () {
                    const moveset = new Moveset();
                    expect(moveset.moves).to.be.empty;
                    expect(moveset.constraint).to.have.all.keys(
                        Object.keys(dex.moves),
                    );
                    expect(moveset.size).to.equal(Moveset.maxSize);
                });
            });

            describe("movepool", function () {
                it("Should initialize constraint", function () {
                    const moveset = new Moveset(fiveMoves);
                    expect(moveset.moves).to.be.empty;
                    expect(moveset.constraint).to.have.all.keys(fiveMoves);
                    expect(moveset.size).to.equal(Moveset.maxSize);
                });
            });

            describe("size", function () {
                it("Should initialize constraint and size", function () {
                    const moveset = new Moveset(3);
                    expect(moveset.moves).to.be.empty;
                    expect(moveset.constraint).to.have.all.keys(
                        Object.keys(dex.moves),
                    );
                    expect(moveset.size).to.equal(3);
                });
            });

            describe("movepool+size", function () {
                it("Should initialize constraint and size", function () {
                    const moveset = new Moveset(fourMoves, 3);
                    expect(moveset.moves).to.be.empty;
                    expect(moveset.constraint).to.have.all.keys(fourMoves);
                    expect(moveset.size).to.equal(3);
                });

                it("Should initialize moves if movepool is smaller than max size", function () {
                    const moveset = new Moveset(twoMoves);
                    expect(moveset.moves).to.have.all.keys(twoMoves);
                    expect(moveset.constraint).to.be.empty;
                    expect(moveset.size).to.equal(twoMoves.length);
                });
            });
        });

        describe("#size", function () {
            it("Should set size", function () {
                const moveset = new Moveset(3);
                expect(moveset.size).to.equal(3);

                moveset.size = 2;
                expect(moveset.size).to.equal(2);
            });

            it("Should throw if smaller than inferred moves", function () {
                const moveset = new Moveset(["splash", "tackle"]);
                expect(() => (moveset.size = 1)).to.throw(
                    Error,
                    "Requested Moveset size 1 is smaller than current size 2",
                );
            });

            it("Should throw if larger than max size", function () {
                const moveset = new Moveset();
                expect(() => (moveset.size = Moveset.maxSize + 1)).to.throw(
                    Error,
                    `Requested Moveset size ${Moveset.maxSize + 1} is bigger ` +
                        `than maximum size ${Moveset.maxSize}`,
                );
            });

            it("Should consume constraint if sufficiently narrowed", function () {
                const moveset = new Moveset(twoMoves, 1);
                expect(moveset.moves).to.be.empty;
                expect(moveset.constraint).to.have.all.keys(twoMoves);

                // Expand moveset enough to fit the movepool.
                moveset.size = 2;
                expect(moveset.moves).to.have.all.keys(twoMoves);
                expect(moveset.constraint).to.be.empty;
            });

            it("Should propagate size-based inference to link/base", function () {
                const moveset = new Moveset();
                const base = new Moveset(twoMoves, 1);
                moveset.setBase(base);

                const transform = new Moveset();
                transform.setTransformTarget(moveset);

                // Expand moveset enough to fit the movepool.
                transform.size = 2;
                expect(moveset.moves).to.have.all.keys(twoMoves);
                expect(moveset.constraint).to.be.empty;
                expect(base.moves).to.have.all.keys(twoMoves);
                expect(base.constraint).to.be.empty;
                expect(transform.moves).to.have.all.keys(twoMoves);
                expect(transform.constraint).to.be.empty;
            });
        });

        describe("#setBase()", function () {
            it("Should copy moves", function () {
                const moveset = new Moveset();
                const base = new Moveset();
                base.reveal("splash");
                moveset.setBase(base);
                expect(moveset.get("splash")).to.equal(base.get("splash")).and
                    .to.not.be.null;
                // Not by-ref array copy.
                expect(moveset.moves).to.not.equal(base.moves);
            });

            it("Should propagate #reveal() calls from child to parent", function () {
                const moveset = new Moveset();
                const base = new Moveset();
                moveset.setBase(base);
                moveset.reveal("splash");
                expect(moveset.get("splash")).to.equal(base.get("splash")).and
                    .to.not.be.null;
                // Not by-ref array copy.
                expect(moveset.moves).to.not.equal(base.moves);
            });

            it("Should not notice base changes", function () {
                const moveset = new Moveset();
                const base = new Moveset();
                moveset.setBase(base);
                base.reveal("splash");
                expect(moveset.get("splash")).to.be.null;
            });

            it("Should reclaim link if linked again after isolate", function () {
                const moveset = new Moveset();
                const base = new Moveset();
                const transform = new Moveset();
                moveset.setBase(base);
                transform.setTransformTarget(moveset);

                moveset.isolate();
                moveset.setBase(base);
                // To test this, see if changing the base moveset causes a
                // change in the transform user.
                // If the moveset didn't reclaim its link, the move would be
                // propagated normally.
                // Technically modifying the base moveset is an error, but
                // for now it isn't being caught.
                base.reveal("tackle");
                expect(moveset.get("tackle")).to.be.null;
                expect(transform.get("tackle")).to.be.null;
            });

            it("Should throw if base changed after reveal", function () {
                const moveset = new Moveset();
                const base = new Moveset();
                moveset.setBase(base);
                base.reveal("splash");
                expect(() => moveset.reveal("tackle")).to.throw(
                    Error,
                    "Base Moveset expected to not change",
                );
            });

            it("Should throw if base Moveset already has a base", function () {
                const moveset = new Moveset();
                const base1 = new Moveset();
                const base2 = new Moveset();
                base1.setBase(base2);

                expect(() => moveset.setBase(base1)).to.throw(
                    Error,
                    "Base Moveset can't also have a base Moveset",
                );
            });

            it("Should throw if base Moveset is a Transform user", function () {
                const moveset = new Moveset();
                const base = new Moveset();
                const transform = new Moveset();
                base.setTransformTarget(transform);

                expect(() => moveset.setBase(base)).to.throw(
                    Error,
                    "Transform source can't be a base Moveset",
                );
            });
        });

        describe("#setTransformTarget()", function () {
            it("Should deep copy moves", function () {
                const moveset = new Moveset();
                const transform = new Moveset();
                transform.reveal("splash");
                moveset.setTransformTarget(transform);

                // Target moveset should have full pp.
                expect(moveset.get("splash")).to.have.property("pp", 5);
                expect(transform.get("splash")).to.have.property("pp", 64);
            });

            it("Should propagate #reveal() calls from target", function () {
                const moveset = new Moveset();
                const transform = new Moveset();
                moveset.setTransformTarget(transform);
                transform.reveal("splash");

                // Target moveset should have full pp.
                expect(moveset.get("splash")).to.have.property("pp", 5);
                expect(transform.get("splash")).to.have.property("pp", 64);
            });

            it("Should propagate #reveal() calls from user", function () {
                const moveset = new Moveset();
                const transform = new Moveset();
                moveset.setTransformTarget(transform);
                moveset.reveal("splash");

                // Target moveset should have full pp.
                expect(moveset.get("splash")).to.have.property("pp", 5);
                expect(transform.get("splash")).to.have.property("pp", 64);
            });

            it("Should propagate #reveal() calls for multiple Movesets", function () {
                const moveset = new Moveset();
                const transform1 = new Moveset();
                const transform2 = new Moveset();
                transform1.setTransformTarget(moveset);
                transform2.setTransformTarget(moveset);
                transform2.reveal("splash");

                // Target moveset should have full pp.
                expect(moveset.get("splash")).to.have.property("pp", 64);
                expect(transform1.get("splash")).to.have.property("pp", 5);
                expect(transform2.get("splash")).to.have.property("pp", 5);
            });

            it("Should propagate to target's base Moveset from a linked Moveset", function () {
                const moveset = new Moveset();
                const base = new Moveset();
                const transform = new Moveset();
                moveset.setBase(base);
                transform.setTransformTarget(moveset);
                transform.reveal("splash");

                expect(moveset.get("splash"))
                    .to.equal(base.get("splash"))
                    .and.to.have.property("pp", 64);
                expect(transform.get("splash")).to.have.property("pp", 5);
            });
        });

        describe("#isolate()", function () {
            it("Should unlink from other Movesets", function () {
                const moveset = new Moveset();
                const transform1 = new Moveset();
                const transform2 = new Moveset();
                transform1.setTransformTarget(moveset);
                transform2.setTransformTarget(moveset);

                moveset.isolate();
                transform2.reveal("splash");
                expect(moveset.get("splash")).to.be.null;
                expect(transform1.get("splash")).to.not.be.null;
                expect(transform1.get("splash")!.pp).to.equal(5);
                expect(transform2.get("splash")).to.not.be.null;
                expect(transform2.get("splash")!.pp).to.equal(5);
            });

            it("Should link base", function () {
                const moveset = new Moveset();
                const base = new Moveset();
                const transform1 = new Moveset();
                const transform2 = new Moveset();
                moveset.setBase(base);
                transform1.setTransformTarget(moveset);
                transform2.setTransformTarget(moveset);

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

        describe("#get()/#reveal()", function () {
            it("Should be null if not revealed", function () {
                const moveset = new Moveset();
                expect(moveset.get("splash")).to.be.null;
            });

            it("Should not be null if revealed", function () {
                const moveset = new Moveset();
                moveset.reveal("splash");
                expect(moveset.get("splash")).to.not.be.null;
            });
        });

        describe("#reveal()", function () {
            it("Should throw if moveset is full", function () {
                const moveset = new Moveset();
                moveset.reveal("splash");
                moveset.reveal("tackle");
                moveset.reveal("wish");
                moveset.reveal("metronome");
                expect(() => moveset.reveal("return")).to.throw(
                    Error,
                    "Rejected reveal() with name=return and maxpp=undefined: " +
                        "Moveset is already full " +
                        "(moves: splash, tackle, wish, metronome)",
                );
            });

            it("Should not add duplicates", function () {
                const moveset = new Moveset();
                const move = moveset.reveal("splash");
                expect(moveset.reveal("splash")).to.equal(move);
            });

            it("Should clear constraint if full", function () {
                const moveset = new Moveset(["tackle", "splash"], 1);
                expect(moveset.constraint).to.have.keys("tackle", "splash");
                moveset.reveal("tackle");
                expect(moveset.constraint).to.be.empty;
            });
        });

        describe("#replace()", function () {
            it("Should replace move", function () {
                const moveset = new Moveset();
                moveset.reveal("splash");
                const move = new Move("tackle");
                moveset.replace("splash", move);
                expect(moveset.get("splash")).to.be.null;
                expect(moveset.get("tackle")).to.not.be.null;
            });

            it("Should infer no move equal to the replacing mvoe", function () {
                const moveset = new Moveset();
                expect(moveset.constraint).to.have.any.keys("tackle");

                moveset.reveal("splash");
                const move = new Move("tackle");
                moveset.replace("splash", move);

                expect(moveset.constraint).to.not.have.any.keys("tackle");
                expect(moveset.get("splash")).to.be.null;
                expect(moveset.get("tackle")).to.not.be.null;
            });

            it("Should throw if replacing unrevealed move", function () {
                const moveset = new Moveset();
                const move = new Move("tackle");
                expect(() => moveset.replace("splash", move)).to.throw(
                    Error,
                    "Moveset does not contain 'splash'",
                );
                expect(moveset.get("splash")).to.be.null;
                expect(moveset.get("tackle")).to.be.null;
            });

            it("Should throw if already know replacing move", function () {
                const moveset = new Moveset();
                moveset.reveal("splash");
                moveset.reveal("tackle");
                const move = new Move("tackle");
                expect(() => moveset.replace("splash", move)).to.throw(
                    Error,
                    "Moveset cannot contain two 'tackle' moves",
                );
                expect(moveset.get("splash")).to.not.be.null;
                expect(moveset.get("tackle")).to.not.be.null;
            });

            it("Should not propagate to base", function () {
                const moveset = new Moveset();
                const base = new Moveset();
                moveset.setBase(base);

                moveset.reveal("tackle");
                moveset.replace("tackle", new Move("splash"));
                expect(moveset.get("splash")).to.not.be.null;
                expect(base.get("splash")).to.be.null;
            });

            it("Should propagate to base if specified", function () {
                const moveset = new Moveset();
                const base = new Moveset();
                moveset.setBase(base);

                moveset.reveal("tackle");
                moveset.replace("tackle", new Move("splash"), true /*base*/);
                // Copied by-ref.
                expect(moveset.get("splash")).to.equal(base.get("splash")).and
                    .to.not.be.null;
            });
        });

        describe("#inferDoesntHave()", function () {
            it("Should not add constraints one at a time", function () {
                const moveset = new Moveset(fiveMoves);

                // Two moves being removed from 5-move movepool.
                moveset.inferDoesntHave(twoMoves);
                expect(moveset.size).to.equal(3);

                const remaining = fiveMoves.filter(
                    n => !twoMoves.includes(n as (typeof twoMoves)[number]),
                );
                expect(moveset.moves).to.have.all.keys(remaining);
            });

            it("Should further constrain moves", function () {
                const moveset = new Moveset(
                    [
                        "splash",
                        "tackle",
                        "gigaimpact",
                        "hyperbeam",
                        "metronome",
                    ],
                    2,
                );

                moveset.inferDoesntHave(["gigaimpact", "hyperbeam"]);
                expect(moveset.constraint).to.have.keys(
                    "splash",
                    "tackle",
                    "metronome",
                );
            });
        });
    });
