import { expect } from "chai";
import "mocha";
import { AnyMessageListener, MessageArgs } from
    "../../src/bot/AnyMessageListener";
import { MessageType } from "../../src/bot/messageData";

describe("AnyMessageListener", function()
{
    let listener: AnyMessageListener;

    beforeEach("Initialize AnyMessageListener", function()
    {
        listener = new AnyMessageListener();
    });

    /**
     * Creates a message listener test.
     * @param type Message type to test.
     * @param givenArgs Arguments to the message handler.
     */
    function shouldHandle<T extends MessageType>(type: T): void
    {
        it(`Should handle a normal ${type} message`, function(done)
        {
            // args aren't actually valid, but are assumed to be validated by
            //  the parser
            const givenArgs = {} as MessageArgs<T>;
            listener
            .on(type, args =>
            {
                expect(args).to.equal(givenArgs);
                done();
            })
            .getHandler(type)(givenArgs);
        });
    }

    shouldHandle("battleinit");
    shouldHandle("battleprogress");
    shouldHandle("challstr");
    shouldHandle("deinit");
    shouldHandle("error");
    shouldHandle("init");
    shouldHandle("request");
    shouldHandle("updatechallenges");
    shouldHandle("updateuser");
});
