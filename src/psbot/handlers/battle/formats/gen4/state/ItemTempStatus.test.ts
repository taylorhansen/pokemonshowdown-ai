import {expect} from "chai";
import "mocha";
import {ItemTempStatus} from "./ItemTempStatus";
import {Pokemon} from "./Pokemon";

export const test = () =>
    describe("ItemTempStatus", function () {
        type StatusType = "a" | "b";
        let its: ItemTempStatus<StatusType>;
        let source: Pokemon;

        beforeEach("Initialize ItemTempStatus", function () {
            const durations = [3, 6] as const;
            const items = {a: "heatrock", b: "smoothrock"} as const;
            its = new ItemTempStatus(durations, items);
            expect(its.durations).to.equal(durations);
            expect(its.items).to.equal(items);

            source = new Pokemon("magikarp");
        });

        it("Should initially be reset", function () {
            expect(its.type).to.equal("none");
            expect(its.source).to.be.null;
            expect(its.duration).to.be.null;
            expect(its.turns).to.equal(0);
        });

        describe("#reset()", function () {
            it("Should reset status", function () {
                its.start(source, "a");
                its.reset();
                expect(its.type).to.equal("none");
                expect(its.source).to.be.null;
                expect(its.duration).to.be.null;
                expect(its.turns).to.equal(0);
            });
        });

        describe("#start()", function () {
            it("Should reset if set to none", function () {
                its.start(source, "a");
                its.start(source);
                expect(its.type).to.equal("none");
                expect(its.source).to.be.null;
                expect(its.duration).to.be.null;
                expect(its.turns).to.equal(0);
            });

            it("Should set short duration", function () {
                its.start(source, "b");
                expect(its.type).to.equal("b");
                expect(its.source).to.equal(source.item);
                expect(its.duration).to.equal(its.durations[0]);
                expect(its.turns).to.equal(0);
            });

            it("Should set long duration if extension item", function () {
                source.item.narrow(its.items.a);
                its.start(source, "a");
                expect(its.type).to.equal("a");
                expect(its.source).to.equal(source.item);
                expect(its.duration).to.equal(its.durations[1]);
                expect(its.turns).to.equal(0);
            });

            it("Should set duration to null if infinite", function () {
                its.start(source, "a", true /*infinite*/);
                expect(its.type).to.equal("a");
                // Don't track item since infinite duration overrides it.
                expect(its.source).to.be.null;
                expect(its.duration).to.be.null;
                expect(its.turns).to.equal(0);
            });

            it("Should update duration if item was narrowed to extension item", function () {
                its.start(source, "b");
                expect(its.duration).to.equal(its.durations[0]);
                source.item.narrow(its.items.b);
                expect(its.duration).to.equal(its.durations[1]);
            });

            it("Should not update duration if item was narrowed differently", function () {
                its.start(source, "b");
                expect(its.duration).to.equal(its.durations[0]);
                source.item.narrow(its.items.a);
                expect(its.duration).to.equal(its.durations[0]);
            });

            describe("overriding status", function () {
                it("Should handle status being overridden by itself", function () {
                    its.start(source, "a");
                    its.tick();
                    its.start(source, "b");
                    source.item.narrow(its.items.a);

                    expect(its.type).to.equal("b");
                    expect(its.source).to.equal(source.item);
                    expect(its.duration).to.equal(its.durations[0]);
                    expect(its.turns).to.equal(0);
                });

                it("Should handle status being overridden by another Pokemon", function () {
                    const source2 = new Pokemon("goldeen");
                    its.start(source, "a");
                    its.tick();
                    its.start(source2, "b");
                    source.item.narrow(its.items.b);

                    expect(its.type).to.equal("b");
                    expect(its.source).to.equal(source2.item);
                    expect(its.duration).to.equal(its.durations[0]);
                    expect(its.turns).to.equal(0);
                });

                it("Should handle status being overridden by reset", function () {
                    its.start(source, "a");
                    its.tick();
                    its.reset();
                    source.item.narrow(its.items.a);

                    expect(its.type).to.equal("none");
                    expect(its.source).to.be.null;
                    expect(its.duration).to.be.null;
                    expect(its.turns).to.equal(0);
                });
            });
        });

        describe("#tick()", function () {
            it("Should do nothing if no status", function () {
                its.tick();
                expect(its.type).to.equal("none");
                expect(its.source).to.be.null;
                expect(its.duration).to.be.null;
                expect(its.turns).to.equal(0);
            });

            it("Should increment turns", function () {
                its.start(source, "a");
                its.tick();
                expect(its.type).to.equal("a");
                expect(its.source).to.equal(source.item);
                expect(its.duration).to.equal(its.durations[0]);
                expect(its.turns).to.equal(1);
            });

            it("Should still increment turns if infinite", function () {
                its.start(source, "b", true /*infinite*/);
                // Can count tick()s forever.
                for (let i = 1; i < 100; ++i) {
                    its.tick();
                    expect(its.type).to.equal("b");
                    expect(its.source).to.be.null;
                    expect(its.duration).to.be.null;
                    expect(its.turns).to.equal(i);
                }
            });

            it("Should infer extension item if kept past short duration", function () {
                its.start(source, "b");
                let i = 0;
                do {
                    expect(its.type).to.equal("b");
                    expect(its.source).to.equal(source.item);
                    expect(its.duration).to.equal(its.durations[0]);
                    expect(its.turns).to.equal(i);
                    its.tick();
                } while (++i < its.durations[0]);

                // At this point, the status has been kept past its normal
                // duration.
                expect(source.item.definiteValue).to.equal(its.items.b);
                expect(its.type).to.equal("b");
                expect(its.source).to.equal(source.item);
                expect(its.duration).to.equal(its.durations[1]);
                expect(its.turns).to.equal(its.durations[0]);
            });

            it("Should throw if kept past short duration and can't have extensionitem", function () {
                its.start(source, "a");
                source.item.remove(its.items.a);
                for (let i = 0; i < its.durations[0] - 1; ++i) its.tick();

                expect(() => its.tick()).to.throw(
                    Error,
                    "Status 'a' went longer than expected " +
                        `(duration=${its.durations[0]}, ` +
                        `turns=${its.durations[0]})`,
                );
            });

            it("Should always throw if kept past long duration", function () {
                source.item.narrow(its.items.b);
                its.start(source, "b");
                for (let i = 0; i < its.durations[1] - 1; ++i) its.tick();

                expect(() => its.tick()).to.throw(
                    Error,
                    "Status 'b' went longer than expected " +
                        `(duration=${its.durations[1]}, ` +
                        `turns=${its.durations[1]})`,
                );
            });
        });
    });
