import {BattleAgent} from "../../agent";
import {FormatType} from "../../formats";
import {BattleParser} from "../BattleParser";

/**
 * Creates an unordered Parser.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TResult Parser's result type.
 * @param name Name for logging/debugging.
 * @param innerParser Parser function to wrap.
 * @param reject Callback if the parser never accepts an event.
 * @see {@link Parser}
 */
export function parser<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TResult = unknown,
>(
    name: string | (() => string),
    innerParser: InnerParser<T, TAgent, [], TResult>,
    reject?: RejectCallback,
): Parser<T, TAgent, TResult> {
    return new Parser(name, innerParser, reject);
}

/**
 * Function type for tentatively parsing battle events.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TArgs Additional parameter types.
 * @template TResult Result type.
 * @param ctx General args.
 * @param accept Callback for when the parser commits to parsing, just before
 * consuming the first event since calling the parser. If it isn't called when
 * consuming events, it can be used to erase/glob events that should be ignored.
 * @param args Additional args.
 * @returns A custom result value to be handled by the caller.
 */
export type InnerParser<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
> = BattleParser<T, TAgent, [accept: AcceptCallback, ...args: TArgs], TResult>;

/** Callback to accept an {@link InnerParser} pathway. */
export type AcceptCallback = () => void;

/**
 * Callback to reject a {@link Parser} pathway.
 *
 * @param name Parser's name for logging/debugging.
 */
export type RejectCallback = (name: string) => void;

/**
 * BattleParser wrapper that can be parsed in any order along with other
 * Parsers.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TResult Result type.
 */
export class Parser<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TResult = unknown,
> {
    /** Name for logging/debugging. */
    public get name(): string {
        return typeof this._name === "string" ? this._name : this._name();
    }

    /**
     * Creates an unordered Parser.
     *
     * @param name Name for logging/debugging.
     * @param parser Parser function to wrap.
     * @param _reject Callback if the parser never accepts an event.
     */
    public constructor(
        private readonly _name: string | (() => string),
        public readonly parse: InnerParser<T, TAgent, [], TResult>,
        private readonly _reject?: RejectCallback,
    ) {}

    /**
     * Method to call when the parser never accepts an event by some deadline.
     */
    public reject(): void {
        this._reject?.(this.name);
    }

    /**
     * Wraps this Parser to transform its parser result.
     *
     * @template TResult2 Transformed result type.
     * @param name Name of the transform operation for logging/debugging.
     * @param f Result transform function.
     * @param reject Callback if the parser never accepts an event.
     * @returns A Parser that applies `f` to `this` parser's result.
     */
    public transform<TResult2 = unknown>(
        name: string | (() => string),
        f: (result: TResult) => TResult2,
        reject?: RejectCallback,
    ): Parser<T, TAgent, TResult2> {
        return new Parser(
            () =>
                `transform(${typeof name === "string" ? name : name()}),\n` +
                this.toString(1, 0),
            async (ctx, accept) => f(await this.parse(ctx, accept)),
            reject ?? (() => this.reject()),
        );
    }

    /**
     * Stringifier with indent options.
     *
     * @param indentInner Number of additional indents beyond the current line.
     * @param indentOuter Number of indents for the current line.
     * @override
     */
    public toString(indentInner = 1, indentOuter = 0): string {
        const inner = " ".repeat(indentInner * 4);
        const outer = " ".repeat(indentOuter * 4);
        return `\
${outer}UnorderedDeadline(
${outer}${inner}${this.name.replace("\n", `\n${outer}${inner}`)},
${outer})`;
    }
}
