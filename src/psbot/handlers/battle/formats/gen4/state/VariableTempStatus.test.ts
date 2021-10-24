import {expect} from "chai";
import "mocha";
import {VariableTempStatus} from "./VariableTempStatus";

export const test = () =>
    describe("VariableTempStatus", function () {
        const map = {a: true, b: true} as const;
        let vts: VariableTempStatus<keyof typeof map>;

        /** Checks VariableTempStatus properties. */
        function check(
            type: keyof typeof map | "none",
            active: boolean,
            turns: number,
            called = false,
        ): void {
            expect(vts.type).to.equal(type);
            expect(vts.isActive).to.be[active ? "true" : "false"];
            expect(vts.turns).to.equal(turns);
            expect(vts.called).to.be[called ? "true" : "false"];
        }

        it("Should be reset initially", function () {
            vts = new VariableTempStatus(map, 4);
            check("none", false, 0);
        });

        function setupImpl(silent = false) {
            vts = new VariableTempStatus(map, 4, silent);
        }

        function setupVts(silent = false) {
            beforeEach(
                `Initialize VariableTempStatus with silent=${silent}`,
                setupImpl.bind(undefined, silent),
            );
        }

        describe("#reset()", function () {
            setupVts();

            it("Should reset status", function () {
                vts.start("b");
                vts.tick();
                vts.reset();
                check("none", false, 0);
            });
        });

        describe("#start()", function () {
            setupVts();

            it("Should start a status", function () {
                vts.start("a");
                check("a", true, 0);
            });

            it("Should start a called status", function () {
                vts.start("a", true /*called*/);
                check("a", true, 0, true /*called*/);
            });
        });

        describe("#tick()", function () {
            it("Should not tick if not active", function () {
                setupImpl();
                vts.tick();
                check("none", false, 0);
            });

            function shouldIncTurns() {
                it("Should increment turns", function () {
                    vts.start("b");
                    vts.tick();
                    check("b", true, 1);
                });
            }

            /** Ticks one less than the required duration. */
            function tickToDuration() {
                for (let i = vts.turns + 1; i < vts.duration; ++i) {
                    vts.tick();
                    check(vts.type, true, i);
                }
            }

            describe("silent = false", function () {
                setupVts();
                shouldIncTurns();

                it("Should throw once over duration", function () {
                    vts.start("a");
                    tickToDuration();
                    check("a", true, vts.duration - 1);
                    expect(() => vts.tick()).to.throw(
                        Error,
                        "Status 'a' went longer than expected " +
                            `(duration=${vts.duration}, turns=${vts.duration})`,
                    );
                });
            });

            describe("silent = true", function () {
                setupVts(true /*silent*/);
                shouldIncTurns();

                it("Should reset when at duration limit", function () {
                    vts.start("a");
                    tickToDuration();
                    check("a", true, vts.duration - 1);
                    vts.tick();
                    check("none", false, 0);
                });
            });
        });
    });
