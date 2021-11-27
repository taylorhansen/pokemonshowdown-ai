import {BattleAgent} from "../../agent";
import {FormatType} from "../../formats";
import {BattleParser, BattleParserContext} from "../BattleParser";
import * as unordered from "../unordered";
import {Reason} from "./Reason";

/**
 * Creates an inference Parser.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TResult Parser's result type.
 * @param name Name for logging/debugging.
 * @param cases All the possible cases in which this inference could accept an
 * event.
 * @param innerParser Parser function that selects from the given cases. If it
 * accepts the current event, it should call the provided `accept` callback
 * before parsing to indicate which SubInference was chosen.
 * @see {@link Parser}
 */
export function parser<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TResult = unknown,
>(
    name: string | (() => string),
    cases: ReadonlySet<Reason>,
    innerParser: InnerParser<T, TAgent, [], TResult>,
): Parser<T, TAgent, TResult> {
    return new Parser(name, cases, innerParser);
}

/**
 * {@link BattleParser} type that {@link Parser}s can wrap.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TArgs Additional parser arsg.
 * @template TResult BattleParser's result type.
 * @param accept Callback to state that a particular SubInference as the sole
 * reason for being able to parse an event. Must be called after verifying the
 * first event but before consuming it.
 */
export type InnerParser<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
> = BattleParser<T, TAgent, [accept: AcceptCallback, ...args: TArgs], TResult>;

/**
 * Callback type for {@link BattleParser}s provided to the {@link Parser}
 * constructor.
 *
 * @param reason The Reason that ended up being chosen out of the ones given
 * when the Parser was initially constructed.
 */
export type AcceptCallback = (reason: Reason) => void;

/**
 * Describes the different but related cases in which a single group of events
 * can be parsed.
 *
 * This is an extended version of {@link unordered.Parser} in order to handle
 * cases where an event is required to distinguish between one of several
 * different but related inferences.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TResult BattleParser's result type.
 */
export class Parser<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TResult = unknown,
> extends unordered.Parser<T, TAgent, TResult> {
    /**
     * Creates an inference Parser.
     *
     * @param name Name for logging/debugging.
     * @param cases All the possible cases in which this inference could accept
     * an event.
     * @param parser Parser function that selects from the given cases. If it
     * accepts the current event, it should call the provided `accept` callback
     * before parsing to indicate which SubInference was chosen.
     */
    public constructor(
        name: string | (() => string),
        private readonly cases: ReadonlySet<Reason>,
        private readonly innerParser: InnerParser<T, TAgent, [], TResult>,
    ) {
        super(
            name,
            async (ctx, accept) => await this.parseImpl(ctx, accept),
            () => this.rejectImpl(),
        );
    }

    /** Parser implementation. */
    private async parseImpl(
        ctx: BattleParserContext<T, TAgent>,
        accept: unordered.AcceptCallback,
    ): Promise<TResult> {
        return await this.innerParser(ctx, reason => {
            this.accept(reason);
            accept();
        });
    }

    /** Reject implementation. */
    private rejectImpl(): void {
        for (const reason of this.cases) reason.reject();
    }

    /**
     * Indicates that this Parser is about to parse an event, and that the
     * Reason provided is accepted as the sole reason for that.
     */
    private accept(reason: Reason): void {
        if (!this.cases.has(reason)) {
            throw new Error(
                "Inference inner parser didn't provide accept callback with " +
                    "a valid Reason",
            );
        }
        for (const r of this.cases) r[r === reason ? "assert" : "reject"]();
    }

    public override toString(indentInner = 1, indentOuter = 0): string {
        const inner = " ".repeat(indentInner * 4);
        const outer = " ".repeat(indentOuter * 4);
        const indentInferenceOuter = indentOuter + 2 * indentInner;
        return `\
${outer}InferenceParser(
${outer}${inner}${this.name.replace("\n", `\n${outer}${inner}`)},
${outer}${inner}cases = [${
            [...this.cases]
                .map(
                    inf =>
                        `\n${inf.toString(indentInner, indentInferenceOuter)},`,
                )
                .join("") + (this.cases.size > 0 ? "\n" + outer + inner : "")
        }],
${outer})`;
    }
}
