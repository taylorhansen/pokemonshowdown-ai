import { BattleAgent } from "../../agent";
import { FormatType } from "../../formats";
import { UnorderedParser } from "./UnorderedParser";

/**
 * Callback to reject an {@link UnorderedDeadline} pathway.
 * @param name UnorderedDeadline's name for logging/debugging.
 */
export type RejectCallback = (name: string) => void;

/**
 * BattleParser wrapper that can be put on an event-based deadline.
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TResult Result type.
 */
export class UnorderedDeadline
<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TResult = unknown
>
{
    /** Name for logging/debugging. */
    public get name(): string
    {
        return typeof this._name === "string" ? this._name : this._name();
    }

    /**
     * Creates an UnorderedDeadline.
     * @param name Name for logging/debugging.
     * @param parser Parser function to wrap.
     * @param _reject Callback if the parser never accepts an event.
     */
    protected constructor(
        private readonly _name: string | (() => string),
        public readonly parse: UnorderedParser<T, TAgent, [], TResult>,
        private readonly _reject?: RejectCallback)
    {}

    /**
     * Creates an UnorderedDeadline obj.
     * @template T Format type.
     * @template TAgent Battle agent type.
     * @template TArgs BattleParser's additional parameter types.
     * @template TResult BattleParser's result type.
     * @param name Name for logging/debugging.
     * @param parser Parser function to wrap.
     * @param reject Callback if the parser never accepts an event. The callback
     * will be supplied the `name` parameter that was given here.
     * @param args Additional arguments to supply to the parser. This parameter
     * is provided for convenience.
     */
    public static create
    <
        T extends FormatType = FormatType,
        TAgent extends BattleAgent<T> = BattleAgent<T>,
        TArgs extends unknown[] = unknown[],
        TResult = unknown
    >(
        name: string | (() => string),
        parser: UnorderedParser<T, TAgent, TArgs, TResult>,
        reject?: RejectCallback, ...args: TArgs):
        UnorderedDeadline<T, TAgent, TResult>
    {
        return new UnorderedDeadline(name,
            (ctx, accept) => parser(ctx, accept, ...args), reject);
    }

    /**
     * Method to call when the parser never accepts an event by some deadline.
     */
    public reject(): void
    {
        this._reject?.(this.name);
    }

    /**
     * Wraps this UnorderedDeadline to transform its parser result.
     * @template TResult2 Transformed result type.
     * @param f Result transform function.
     * @returns An UnorderedDeadline that applies `f` to `this` parser's result.
     */
    public transform<TResult2 = unknown>(f: (result: TResult) => TResult2):
        UnorderedDeadline<T, TAgent, TResult2>
    {
        return new UnorderedDeadline(
            typeof this._name === "string" ?
                `transform ${this._name}`
                : () => `transform ${(this._name as () => string)()}`,
            async (ctx, accept) => f(await this.parse(ctx, accept)),
            this._reject);
    }

    /** @override */
    public toString(indentInner = 4, indentOuter = 0): string
    {
        const inner = " ".repeat(indentInner);
        const outer = " ".repeat(indentOuter);
        return `\
${outer}UnorderedDeadline(
${outer}${inner}${this.name}
${outer})`;
    }
}