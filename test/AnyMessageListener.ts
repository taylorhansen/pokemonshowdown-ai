import { expect } from "chai";
import "mocha";
import { AnyMessageListener, MessageArgs, Prefix } from
    "../src/AnyMessageListener";

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
    function shouldHandle<P extends Prefix>(prefix: P): void
    {
        it(`Should handle a normal ${prefix} message`, function(done)
        {
            const givenArgs = {} as MessageArgs<P>;
            listener.on(prefix, args =>
            {
                expect(args).to.equal(givenArgs);
                done();
            })
            .getHandler(prefix)(givenArgs);
        });
    }

    // data isn't actually valid, and is assumed to be validated by the parser
    shouldHandle("-curestatus");
    shouldHandle("-cureteam");
    shouldHandle("-damage");
    shouldHandle("-heal");
    shouldHandle("-status");
    shouldHandle("challstr");
    shouldHandle("error");
    shouldHandle("faint");
    shouldHandle("init");
    shouldHandle("move");
    shouldHandle("player");
    shouldHandle("request");
    shouldHandle("switch");
    shouldHandle("teamsize");
    shouldHandle("turn");
    shouldHandle("updatechallenges");
    shouldHandle("updateuser");
    shouldHandle("upkeep");
});
