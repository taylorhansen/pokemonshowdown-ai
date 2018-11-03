import { expect } from "chai";
import "mocha";
import { Bot } from "../../src/bot/Bot";
import { MockBattle } from "./battle/MockBattle";
import { MockParser } from "./parser/MockParser";

describe("Bot", function()
{
    const username = "someuser";
    const format = "gen4randombattle";
    let parser: MockParser;
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
        parser = new MockParser();
        bot = new Bot(parser, mockSend);
        bot.addFormat(format, MockBattle);
        responses = [];
    });

    it(`Should accept ${format} challenges`, function()
    {
        parser.handle("updatechallenges",
            {challengesFrom: {[username]: format}, challengeTo: {}});
        expect(responses).to.deep.equal([`|/accept ${username}`]);
    });

    it(`Should not accept unsupported challenges`, function()
    {
        parser.handle("updatechallenges",
           {challengesFrom: {[username]: format + "1"}, challengeTo: {}});
        expect(responses).to.deep.equal([`|/reject ${username}`]);
    });
});
