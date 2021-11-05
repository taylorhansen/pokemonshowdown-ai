import {BattleAgent} from "../../agent";
import {FormatType} from "../../formats";
import {BattleParser, BattleParserContext} from "../BattleParser";
import * as unordered from "../unordered";
import {SubInference} from "./SubInference";

/**
 * {@link BattleParser} type that {@link EventInference}s can wrap.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TArgs BattleParser's additional parameter types.
 * @template TResult BattleParser's result type.
 * @param accept Callback to state that a particular SubInference as the sole
 * reason for being able to parse an event. Must be called after verifying the
 * first event but before consuming it.
 */
export type InferenceParser<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
> = BattleParser<T, TAgent, [accept: AcceptCallback, ...args: TArgs], TResult>;

/**
 * Callback type for {@link BattleParser}s provided to the
 * {@link EventInference} constructor.
 *
 * @param inf The SubInference that ended up being chosen out of the ones given
 * when the EventInference was initially constructed.
 */
export type AcceptCallback = (inf: SubInference) => void;

/**
 * Describes the different but related cases in which a single group of events
 * can be parsed.
 *
 * This is an extended version of UnorderedDeadline in order to handle cases
 * where an event can cause one of several different but related inferences.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TArgs BattleParser's additional parameter types.
 * @template TResult BattleParser's result type.
 */
export class EventInference<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
> extends unordered.UnorderedDeadline<T, TAgent, TResult> {
    /** Args to supply to the wrapped parser. */
    private readonly innerParserArgs: TArgs;

    /**
     * Creates an EventInference.
     *
     * @param name Name for logging/debugging.
     * @param cases All the possible cases in which this inference could accept
     * an event.
     * @param innerParser Parser function that selects from the given cases. If
     * it accepts the current event, it should call the provided `accept`
     * callback before parsing to indicate which SubInference was chosen.
     * @param innerParserArgs Additional parser arguments.
     */
    public constructor(
        name: string,
        private readonly cases: ReadonlySet<SubInference>,
        private readonly innerParser: InferenceParser<
            T,
            TAgent,
            TArgs,
            TResult
        >,
        ...innerParserArgs: TArgs
    ) {
        super(
            name,
            async (ctx, accept) => await this.parseImpl(ctx, accept),
            () => this.rejectImpl(),
        );

        this.innerParserArgs = innerParserArgs;
    }

    /** Parser implementation. */
    private async parseImpl(
        ctx: BattleParserContext<T, TAgent>,
        accept: unordered.AcceptCallback,
    ): Promise<TResult> {
        const result = await this.innerParser(
            ctx,
            inf => {
                this.accept(inf);
                accept();
            },
            ...this.innerParserArgs,
        );
        return result;
    }

    /** Reject implementation. */
    private rejectImpl(): void {
        for (const subInf of this.cases) subInf.resolve(false /*held*/);
    }

    /**
     * Indicates that this EventInference is about to parse an event, and that
     * the SubInference provided is accepted as the sole reason for that.
     */
    private accept(inf: SubInference): void {
        if (!this.cases.has(inf)) {
            throw new Error(
                "BattleParser didn't provide accept callback with a valid " +
                    "SubInference",
            );
        }
        // Assert the case that was accepted, and reject all the other cases
        // that weren't.
        for (const c of this.cases) c.resolve(c === inf /*held*/);
    }

    public override toString(indentInner = 1, indentOuter = 0): string {
        const inner = " ".repeat(indentInner * 4);
        const outer = " ".repeat(indentOuter * 4);
        const indentInferenceOuter = indentOuter + 2 * indentInner;
        return `\
${outer}EventInference(
${outer}${inner}${this.name},
${outer}${inner}cases = [${
            [...this.cases]
                .map(
                    inf =>
                        "\n" + inf.toString(indentInner, indentInferenceOuter),
                )
                .join(",") + (this.cases.size > 0 ? "\n" + outer + inner : "")
        }]
${outer})`;
    }
}
