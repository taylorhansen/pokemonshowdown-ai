import {expect} from "chai";
import "mocha";
import {MajorStatusCounter} from "./MajorStatusCounter";

export const test = () =>
    describe("MajorStatusCounter", function () {
        let ms: MajorStatusCounter;

        beforeEach("Initialize MajorStatusCounter", function () {
            ms = new MajorStatusCounter();
        });

        describe("#current", function () {
            it("Should be null initially", function () {
                expect(ms.current).to.be.null;
            });
        });

        describe("#turns", function () {
            it("Should be 0 initially", function () {
                expect(ms.turns).to.equal(0);
            });
        });

        describe("#duration", function () {
            it("Should be null initially", function () {
                expect(ms.duration).to.be.null;
            });
        });

        describe("#afflict()", function () {
            it("Should afflict status with null duration", function () {
                ms.afflict("brn");
                expect(ms.current).to.equal("brn");
                expect(ms.turns).to.equal(1);
                expect(ms.duration).to.be.null;
            });

            it("Should afflict sleep with finite duration", function () {
                ms.afflict("slp");
                expect(ms.current).to.equal("slp");
                expect(ms.turns).to.equal(1);
                expect(ms.duration).to.equal(4);
            });
        });

        describe("#tick()", function () {
            it("Should increment turns", function () {
                ms.afflict("tox");
                ms.tick();
                expect(ms.turns).to.equal(2);
            });

            it("Should not increment turns if not statused", function () {
                ms.tick();
                expect(ms.current).to.be.null;
                expect(ms.turns).to.equal(0);
                expect(ms.duration).to.be.null;
            });

            it("Should fail if exceeded duration", function () {
                ms.afflict("slp");
                expect(ms.duration).to.not.be.null;
                for (let i = 0; i < ms.duration!; ++i) {
                    ms.tick();
                }
                expect(() => ms.tick()).to.throw(
                    Error,
                    "MajorStatus 'slp' lasted longer than expected (4/4 turns)",
                );
            });
        });

        describe("#postTurn()", function () {
            it("Should update tox turns", function () {
                ms.afflict("tox");
                expect(ms.turns).to.equal(1);
                ms.postTurn();
                expect(ms.turns).to.equal(2);
            });

            it("Should not update other status turns", function () {
                // Should be updated explicitly by inactive events.
                ms.afflict("slp");
                expect(ms.turns).to.equal(1);
                ms.postTurn();
                expect(ms.turns).to.equal(1);
            });
        });

        describe("#resetCounter()", function () {
            it("Should reset turn counter", function () {
                ms.afflict("tox");
                ms.tick();
                ms.resetCounter();
                expect(ms.turns).to.equal(1);
            });

            it("Should do nothing if not statused", function () {
                ms.resetCounter();
                expect(ms.turns).to.equal(0);
            });
        });

        describe("#cure()", function () {
            it("Should cure status", function () {
                ms.afflict("slp");
                ms.cure();
                expect(ms.current).to.be.null;
                expect(ms.turns).to.equal(0);
                expect(ms.duration).to.be.null;
            });
        });

        describe("#toString()", function () {
            it("Should be 'none' if no status", function () {
                expect(ms.toString()).to.equal("none");
            });

            it("Should display status", function () {
                ms.afflict("frz");
                expect(ms.toString()).to.equal("frz");
            });

            it("Should display status with turn count if tox", function () {
                ms.afflict("tox");
                expect(ms.toString()).to.equal("tox (0 turns)");
            });

            it("Should display status with turns and duration if slp", function () {
                ms.afflict("slp");
                expect(ms.toString()).to.equal("slp (0/4 turns)");
            });
        });
    });
