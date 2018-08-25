import { expect } from "chai";
import "mocha";
import { MessageParser } from "../src/bot/MessageParser";

describe("MessageParser test", () =>
{
    const parser = new MessageParser();
    it("Should parse room name", () =>
    {
        const room = "myroomname"
        parser.parse(`>${room}`);
        expect(parser.room).to.equal(room);
    });
});
