import {expect} from "chai";
import "mocha";
import {MultiTempStatus} from "./MultiTempStatus";

export const test = () =>
    describe("MultiTempStatus", function () {
        const map = {a: true, b: true} as const;
        let mts: MultiTempStatus<keyof typeof map>;

        /** Checks MultiTempStatus properties. */
        function check(
            type: keyof typeof map | "none",
            active: boolean,
            turns: number,
        ): void {
            expect(mts.type).to.equal(type);
            expect(mts.isActive).to.be[active ? "true" : "false"];
            expect(mts.turns).to.equal(turns);
        }

        it("Should be reset initially", function () {
            mts = new MultiTempStatus(map, 4);
            check("none", false, 0);
        });

        function setupImpl(silent = false) {
            mts = new MultiTempStatus(map, 4, silent);
        }

        function setupmts(silent = false) {
            beforeEach(
                `Initialize MultiTempStatus with silent=${silent}`,
                setupImpl.bind(undefined, silent),
            );
        }

        describe("#reset()", function () {
            setupmts();

            it("Should reset status", function () {
                mts.start("b");
                mts.tick();
                mts.reset();
                check("none", false, 0);
            });
        });

        describe("#start()", function () {
            setupmts();

            it("Should start a status", function () {
                mts.start("a");
                check("a", true, 0);
            });
        });

        describe("#tick()", function () {
            it("Should not tick if not active", function () {
                setupImpl();
                mts.tick();
                check("none", false, 0);
            });

            function shouldIncTurns() {
                it("Should increment turns", function () {
                    mts.start("b");
                    mts.tick();
                    check("b", true, 1);
                });
            }

            /** Ticks one less than the required duration. */
            function tickToDuration() {
                for (let i = mts.turns + 1; i < mts.duration; ++i) {
                    mts.tick();
                    check(mts.type, true, i);
                }
            }

            describe("#silent = false", function () {
                setupmts();
                shouldIncTurns();

                it("Should throw once over duration", function () {
                    mts.start("a");
                    tickToDuration();
                    check("a", true, mts.duration - 1);
                    expect(() => mts.tick()).to.throw(
                        Error,
                        "Status 'a' went longer than expected " +
                            `(duration=${mts.duration}, turns=${mts.duration})`,
                    );
                });
            });

            describe("#silent = true", function () {
                setupmts(true /*silent*/);
                shouldIncTurns();

                it("Should reset when at duration limit", function () {
                    mts.start("a");
                    tickToDuration();
                    check("a", true, mts.duration - 1);
                    mts.tick();
                    check("none", false, 0);
                });
            });
        });
    });
