import {BattleAgent} from "../../agent";
import {FormatType} from "../../formats";
import {BattleParserContext} from "../BattleParser";
import {tryPeek} from "../helpers";
import {Parser, AcceptCallback, InnerParser} from "./Parser";

/**
 * Invokes a group of unordered {@link Parser}s in any order.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TResult BattleParser's result type.
 * @param ctx Parser context.
 * @param parsers BattleParsers to consider, wrapped to include a deadline
 * callback, in order of descending priority.
 * @param filter Optional parser that runs before each expected parser, usually
 * to consume events that should be ignored. If it calls its
 * {@link AcceptCallback `accept()`} callback, then all of the pending parsers
 * are immediately rejected and this function returns.
 * @param accept Optional accept callback that gets called when the first parser
 * accepts.
 * @returns An array containing the results of the Parsers that were able to
 * successfully parse, in the order that they were parsed.
 */
export async function all<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TResult = unknown,
>(
    ctx: BattleParserContext<T, TAgent>,
    parsers: Parser<T, TAgent, TResult>[],
    filter?: InnerParser<T, TAgent, []>,
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
 * Expects one of the unordered {@link Parser}s to parse, rejecting all the
 * others that didn't parse.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TResult BattleParser's result type.
 * @param ctx Parser context.
 * @param parsers Parsers to consider, in order of descending priority.
 * @returns An array containing the result of the parser that accepted an event,
 * otherwise an empty array if they all failed to parse.
 */
export async function oneOf<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TResult = unknown,
>(
    ctx: BattleParserContext<T, TAgent>,
    parsers: Parser<T, TAgent, TResult>[],
): Promise<[] | [TResult]> {
    let result: [] | [TResult] = [];
    let done: Parser<T, TAgent, TResult> | undefined;
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
 * Expects an unordered {@link Parser} to parse, or rejects it if it couldn't.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TResult BattleParser's result type.
 * @param ctx Parser context.
 * @param parser Parser to consider.
 * @param accept Optional callback to accept this pathway.
 * @returns An array containing the result of the parser if it accepted an
 * event, or an empty array if it failed to parse.
 */
export async function parse<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TResult = unknown,
>(
    ctx: BattleParserContext<T, TAgent>,
    parser: Parser<T, TAgent, TResult>,
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
