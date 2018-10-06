import { expect } from "chai";
import "mocha";
import { MockParser } from "./MockParser";

describe("Parser", function()
{
    let parser: MockParser;

    beforeEach("Initialize MockParser", function()
    {
        parser = new MockParser();
    });

    describe("removeListener", function()
    {
        it("Should remove listener", function()
        {
            let handled = false;

            const room = "room";
            parser.room = room;

            // register a message listener for this room
            parser.getListener(room);

            // make sure the listener works
            parser.on(room, "deinit", () => handled = true);
            parser.handle("deinit", {});
            expect(handled).to.equal(true);

            // see if removing the listener no longer sets handled
            handled = false;
            parser.removeListener(room);
            parser.handle("deinit", {});
            expect(handled).to.equal(false);
        });
    });
});
