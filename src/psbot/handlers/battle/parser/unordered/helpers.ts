import {BattleAgent} from "../../agent";
import {FormatType} from "../../formats";
import {BattleParserContext} from "../BattleParser";
import {tryPeek} from "../helpers";
import {UnorderedDeadline} from "./UnorderedDeadline";
import {AcceptCallback, UnorderedParser} from "./UnorderedParser";

/**
 * Invokes a group of {@link UnorderedDeadline} parsers in any order.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TResult BattleParser's result type.
 * @param ctx Parser context.
 * @param parsers BattleParsers to consider, wrapped to include a deadline
 * callback, in order of descending priority.
 * @param filter Optional parser that runs before each expected parser, usually
 * to consume events that should be ignored. If it accepts, all of the pending
 * parsers are immediately rejected and this function returns.
 * @param accept Optional accept callback that gets called when the first parser
 * accepts.
 * @returns The results of the successful BattleParsers that were able to
 * consume an event, in the order that they were parsed.
 */
export async function all<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TResult = unknown,
>(
    ctx: BattleParserContext<T, TAgent>,
    parsers: UnorderedDeadline<T, TAgent, TResult>[],
    filter?: UnorderedParser<T, TAgent, []>,
    accept?: AcceptCallback,
): Promise<TResult[]> {
    const results: TResult[] = [];
    if (parsers.length <= 0) return results;

    // Keep looping as long as parsers are accepting and we still have events to
    // parse.
    let done = false;
    let consumed = true;
    // Note: Even if done=true (i.e., no parsers accepted), we should still
    // continue if one of the parsers (excluding the filter) consumed an event
    // in the last iteration, since that could've unblocked them.
    while (parsers.length > 0 && (!done || consumed)) {
        // Make sure we still have events to parse.
        if (!(await tryPeek(ctx))) break;

        done = true;
        consumed = false;
        let filterDone = false;
        for (let i = 0; i < parsers.length; ++i) {
            // We call the filter before testing each parser since the parser
            // could still consume events but not accept, leaving events that
            // might need to be filtered again before testing the next parser.
            if (filter) {
                await filter(ctx, () => (filterDone = true));
                // If the filter called its accept cb, break out of the loop and
                // immediately reject pending parsers.
                if (filterDone) break;
            }

            const preParse = await tryPeek(ctx);
            if (!preParse) break;

            const parser = parsers[i];
            let accepted = false;
            const result = await parser.parse(ctx, function allAccept() {
                accepted = true;
                if (accept) {
                    const a = accept;
                    accept = undefined;
                    a();
                }
            });

            // Consume parser that accepted.
            if (accepted) {
                // Reset done so that we can test the next pending parser.
                done = false;
                parsers.splice(i--, 1);
                results.push(result);
                break;
            }
            // At the end, make sure we actually parsed any events.
            // We only really need to check this if done=true since that would
            // cancel the outer while loop.
            if (done) {
                const postParse = await tryPeek(ctx);
                if (preParse !== postParse) consumed = true;
            }
        }

        if (filterDone) break;
    }

    // Reject parsers that never got to accept an event.
    for (let i = 0; i < parsers.length; ++i) {
        parsers[i].reject();
        parsers.splice(i--, 1);
    }

    return results;
}

/**
 * Expects one of the {@link UnorderedDeadline} parsers to parse, rejecting all
 * the others that didn't parse.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TResult BattleParser's result type.
 * @param ctx Parser context.
 * @param parsers BattleParsers to consider, wrapped to include a deadline
 * callback, in order of descending priority.
 * @returns The result of the parser that accepted an event, if any.
 */
export async function oneOf<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TResult = unknown,
>(
    ctx: BattleParserContext<T, TAgent>,
    parsers: UnorderedDeadline<T, TAgent, TResult>[],
): Promise<[] | [TResult]> {
    let result: [] | [TResult] = [];
    let done: UnorderedDeadline<T, TAgent, TResult> | undefined;
    while (!done) {
        // No events to parse.
        const preParse = await tryPeek(ctx);
        if (!preParse) break;

        for (const parser of parsers) {
            let accepted = false;
            const res = await parser.parse(ctx, () => (accepted = true));
            if (accepted) {
                result = [res];
                done = parser;
                break;
            }
        }
        if (done) break;

        // No events were parsed, guard against infinite loop.
        const postParse = await tryPeek(ctx);
        if (!postParse || preParse === postParse) break;
    }
    for (const parser of parsers) if (parser !== done) parser.reject();
    return result;
}

/**
 * Expects an {@link UnorderedDeadline} parser to parse, or rejects it if it
 * couldn't.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TResult BattleParser's result type.
 * @param ctx Parser context.
 * @param parser BattleParser to consider, wrapped to include a deadline
 * callback.
 * @param accept Optional callback to accept this pathway.
 * @returns The result of the parser if it accepted an event.
 */
export async function parse<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TResult = unknown,
>(
    ctx: BattleParserContext<T, TAgent>,
    parser: UnorderedDeadline<T, TAgent, TResult>,
    accept?: AcceptCallback,
): Promise<[] | [TResult]> {
    let accepted = false;
    const res = await parser.parse(ctx, () => {
        accepted = true;
        accept?.();
    });
    if (accepted) return [res];
    parser.reject();
    return [];
}
