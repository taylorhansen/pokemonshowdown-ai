import { MessageArgs } from "../../src/bot/AnyMessageListener";
import { MessageType } from "../../src/bot/messageData";
import { Parser } from "../../src/bot/parser/Parser";

/** Mocks the Parser class. */
export class MockParser extends Parser
{
    /** @override */
    public room = "";

    /** @override */
    public parse(message: string): void
    {
        throw new Error("MockParser.parse is not implemented");
    }

    /** @override */
    public handle<T extends MessageType>(type: T,
        args: {[A in keyof MessageArgs<T>]: MessageArgs<T>[A] | null}): void
    {
        super.handle(type, args);
    }
}
