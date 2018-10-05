import { MessageArgs, Prefix } from "../../src/AnyMessageListener";
import { Parser } from "../../src/parser/Parser";

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
    public handle<P extends Prefix>(prefix: P,
        args: {[A in keyof MessageArgs<P>]: MessageArgs<P>[A] | null}): void
    {
        super.handle(prefix, args);
    }
}
