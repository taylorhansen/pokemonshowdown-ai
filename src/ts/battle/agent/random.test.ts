import "mocha";
import {expect} from "chai";
import {rng} from "../../utils/random";
import {ReadonlyBattleState} from "../state";
import {Action, actions} from "./Action";
import {gatherMoves, randomAgent} from "./random";

export const test = () =>
    describe("random", function () {
        describe("randomAgent()", function () {
            it("Should shuffle choices", async function () {
                const random = rng("abc");
                const arr = [...actions];
                for (let i = 0; i < 100; ++i) {
                    await randomAgent(
                        null as unknown as ReadonlyBattleState,
                        arr,
                        undefined /*logger*/,
                        false /*moveOnly*/,
                        random,
                    );
                    expect(arr).to.have.members(actions);
                }
            });

            describe("moveOnly = true", function () {
                it("Should shuffle choices while keeping moves in front", async function () {
                    const random = rng("abc");
                    const arr = [...actions];
                    for (let i = 0; i < 100; ++i) {
                        await randomAgent(
                            null as unknown as ReadonlyBattleState,
                            arr,
                            undefined /*logger*/,
                            true /*moveOnly*/,
                            random,
                        );
                        expect(arr).to.have.members(actions);
                        expect(
                            arr.findIndex(c => c.startsWith("move")),
                        ).to.be.lessThan(4);
                    }
                });
            });
        });

        describe("gatherMoves()", function () {
            it("Should ignore switch", function () {
                const arr: Action[] = ["switch 2", "switch 3"];
                gatherMoves(arr);
                expect(arr).to.have.ordered.members(["switch 2", "switch 3"]);
            });

            it("Should ignore moves already in place", function () {
                const arr: Action[] = ["move 1", "switch 2"];
                gatherMoves(arr);
                expect(arr).to.have.ordered.members(["move 1", "switch 2"]);
            });

            it("Should rearrange moves not in place", function () {
                const arr: Action[] = ["move 1", "switch 2", "move 2"];
                gatherMoves(arr);
                expect(arr).to.have.ordered.members([
                    "move 1",
                    "move 2",
                    "switch 2",
                ]);
            });

            it("Should work with multiple choices", function () {
                const arr: Action[] = [
                    "switch 3",
                    "switch 2",
                    "move 2",
                    "move 1",
                    "switch 4",
                    "move 4",
                ];
                gatherMoves(arr);
                expect(arr).to.have.ordered.members([
                    "move 2",
                    "move 1",
                    "move 4",
                    "switch 3",
                    "switch 2",
                    "switch 4",
                ]);
            });
        });
    });
