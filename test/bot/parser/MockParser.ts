import { Message, MessageType } from "../../../src/bot/dispatcher/Message";
import { Parser } from "../../../src/bot/parser/Parser";

/** Mocks the Parser class. */
export class MockParser extends Parser
{
    /** @override */
    public room = "";

    /** @override */
    public async parse(message: string): Promise<void>
    {
        throw new Error("MockParser.parse is not implemented");
    }

    /** @override */
    public dispatch<T extends MessageType>(type: T, message: Message<T>):
        Promise<void>
    {
        return super.dispatch(type, message);
    }
}
