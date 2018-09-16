import { expect } from "chai";
import "mocha";
import { PokemonDetails, PokemonID, PokemonStatus, RequestData } from
    "../src/parser/MessageData";
import { AnyMessageListener, Prefix } from "../src/parser/MessageListener";

describe("AnyMessageListener", function()
{
    let listener: AnyMessageListener;

    beforeEach("Initialize AnyMessageListener", function()
    {
        listener = new AnyMessageListener();
    });

    /**
     * Creates a message listener test.
     * @param prefix Prefix of the message type to test.
     * @param givenArgs Arguments to the message handler.
     */
    function shouldHandle(prefix: Prefix, ...givenArgs: any[])
    {
        it(`Should handle a normal ${prefix} message`, function(done)
        {
            listener.on(prefix, (...args: any[]) =>
            {
                expect(args).to.deep.equal(givenArgs);
                done();
            })
            .getHandler(prefix).apply(this, givenArgs);
        });
    }

    // data isn't actually valid, and is assumed to be validated by the parser
    shouldHandle("-curestatus", {} as PokemonID, "psn");
    shouldHandle("-cureteam", {} as PokemonID);
    shouldHandle("-damage", {} as PokemonID, {} as PokemonStatus);
    shouldHandle("-heal", {} as PokemonID, {} as PokemonStatus);
    shouldHandle("-status", {} as PokemonID, "psn");
    shouldHandle("challstr", "some random challstr");
    shouldHandle("error", "some random reason");
    shouldHandle("faint", {owner: "p1", position: "a", nickname: "cat"});
    shouldHandle("init", "chat");
    shouldHandle("move", {} as PokemonID, "Some Move", /*effect*/ "",
        /*missed*/ false);
    shouldHandle("player", "p1", "some username", /*avatarId*/ 100);
    shouldHandle("request", {} as RequestData);
    shouldHandle("switch", {} as PokemonID, {} as PokemonDetails,
        {} as PokemonStatus);
    shouldHandle("teamsize", "p2", 21);
    shouldHandle("turn", 1);
    shouldHandle("updatechallenges", /*challengesFrom*/ {newuser: "gen4ou"});
    shouldHandle("updateuser", "newuser", /*isGuest*/ true);
    shouldHandle("upkeep");
});
