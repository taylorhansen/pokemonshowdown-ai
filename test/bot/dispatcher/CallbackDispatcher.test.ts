import { expect } from "chai";
import "mocha";
import { CallbackDispatcher } from
    "../../../src/bot/dispatcher/CallbackDispatcher";

describe("CallbackDispatcher", function()
{
    type DispatchType = "a" | "b";
    type Dispatch<T extends DispatchType> =
        T extends "a" ? [number]
        : T extends "b" ? [string, number]
        : never;
    class Dispatcher extends
        CallbackDispatcher<{[T in DispatchType]: Dispatch<T>}> {}
    let dispatcher: Dispatcher;

    beforeEach("Initialize CallbackDispatcher", function()
    {
        dispatcher = new Dispatcher();
    });

    /**
     * Creates a callback dispatcher test.
     * @param type Dispatch type to test.
     * @param givenArgs Arguments to the handler.
     */
    function shouldHandle<T extends DispatchType>(type: T,
            ...givenArgs: Dispatch<T>): void
    {
        it(`Should handle a normal message type ${type}`, function(done)
        {
            dispatcher
            .on(type, (...args) =>
            {
                expect(args).to.deep.equal(givenArgs);
                done();
            })
            .dispatch(type, ...givenArgs);
        });
    }

    shouldHandle("a", 1);
    shouldHandle("b", "hi", 2);
});
