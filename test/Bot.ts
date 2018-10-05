import { expect } from "chai";
import "mocha";
import { Bot } from "../src/bot/Bot";
import { MockParser } from "./parser/MockParser";

describe("Bot", function()
{
    const username = "someuser";
    let mockParser: MockParser;
    let bot: Bot;
    let responses: string[];

    /**
     * Adds responses to a local array.
     * @param response Response to add.
     */
    function mockSend(response: string): void
    {
        responses.push(response);
    }

    beforeEach("Initialize Bot", function()
    {
        mockParser = new MockParser();
        bot = new Bot(mockParser, mockSend);
        responses = [];
    });

    it(`Should accept ${Bot.format} challenges`, function()
    {
        mockParser.handle("updatechallenges",
           {challengesFrom: {[username]: Bot.format}, challengeTo: {}});
        expect(responses).to.deep.equal([`|/accept ${username}`]);
    });

    it(`Should not accept unsupported challenges`, function()
    {
        mockParser.handle("updatechallenges",
           {challengesFrom: {[username]: Bot.format + "1"}, challengeTo: {}});
        expect(responses).to.deep.equal([`|/reject ${username}`]);
    });
});
