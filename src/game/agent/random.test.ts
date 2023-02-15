import "mocha";
import {expect} from "chai";
import {Choice} from "../../psbot/handlers/battle/agent";
import {gatherMoves} from "./random";

export const test = () =>
    describe("random", function () {
        describe("gatherMoves()", function () {
            it("Should ignore switch", function () {
                const arr: Choice[] = ["switch 2", "switch 3"];
                gatherMoves(arr);
                expect(arr).to.have.ordered.members(["switch 2", "switch 3"]);
            });

            it("Should ignore moves already in place", function () {
                const arr: Choice[] = ["move 1", "switch 2"];
                gatherMoves(arr);
                expect(arr).to.have.ordered.members(["move 1", "switch 2"]);
            });

            it("Should rearrange moves not in place", function () {
                const arr: Choice[] = ["move 1", "switch 2", "move 2"];
                gatherMoves(arr);
                expect(arr).to.have.ordered.members([
                    "move 1",
                    "move 2",
                    "switch 2",
                ]);
            });
        });
    });
