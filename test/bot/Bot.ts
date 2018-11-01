import { expect } from "chai";
import "mocha";
import { Battle } from "../../src/bot/battle/Battle";
import { Bot } from "../../src/bot/Bot";
import { MockParser } from "../parser/MockParser";

describe("Bot", function()
{
    const username = "someuser";
    const format = "gen4randombattle";
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
        bot.addFormat(format, Battle);
        responses = [];
    });

    it(`Should accept ${format} challenges`, function()
    {
        mockParser.handle("updatechallenges",
           {challengesFrom: {[username]: format}, challengeTo: {}});
        expect(responses).to.deep.equal([`|/accept ${username}`]);
    });

    it(`Should not accept unsupported challenges`, function()
    {
        mockParser.handle("updatechallenges",
           {challengesFrom: {[username]: format + "1"}, challengeTo: {}});
        expect(responses).to.deep.equal([`|/reject ${username}`]);
    });
});
