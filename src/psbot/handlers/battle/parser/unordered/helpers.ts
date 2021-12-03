import {BattleAgent} from "../../agent";
import {FormatType} from "../../formats";
import {BattleParserContext} from "../BattleParser";
import {tryPeek} from "../helpers";
import {Parser, AcceptCallback, InnerParser} from "./Parser";

// TODO: Move to separate files and test each.

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

/** Args for {@link staged}. */
export interface StageEntry<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
> {
    /** Parsers for this stage, or a function to generate them. */
    parsers: Parser<T, TAgent>[] | (() => Parser<T, TAgent>[]);
    /** Callback that returns whether to end the entire `staged()` call. */
    readonly after?: () => boolean;
}

/**
 * Parses multiple pathways sequentially in any order. Each pathway is a set of
 * {@link all `all()`} calls parsed in-order.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TKey Type used to differentiate between pathways.
 * @param ctx Parser context.
 * @param stages Sets of arguments to `all()` calls, separated by the pathway
 * they belong to. Entries are removed while progressing through each pathway,
 * and callbacks to generate stage parsers are resolved while progressing
 * through each stage.
 */
export async function staged<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TKey = unknown,
>(
    ctx: BattleParserContext<T, TAgent>,
    stages: readonly Map<TKey, StageEntry<T, TAgent>>[],
): Promise<void> {
    if (stages.length <= 0) return;
    const [firstStage] = stages;
    for (const [key, entry] of firstStage) {
        if (typeof entry.parsers === "function") {
            entry.parsers = entry.parsers();
        }
        // See if this key will be the one to parse an effect.
        let firstParser: Parser<T, TAgent> | undefined;
        for (const parser of entry.parsers) {
            await parser.parse(ctx, () => (firstParser = parser));
            if (firstParser) break;
        }
        if (firstParser) {
            // Pathway for this key has been locked in, so parse the rest of
            // this stage then the rest of the stages for this pathway for this
            // key only.
            // Afterwards we'll search for the next pathway.
            entry.parsers.splice(entry.parsers.indexOf(firstParser), 1);
            await all(ctx, entry.parsers);
            if (entry.after?.()) return;

            for (const stage of stages.slice(1)) {
                const entry2 = stage.get(key);
                if (!entry2) continue;
                if (typeof entry2.parsers === "function") {
                    entry2.parsers = entry2.parsers();
                }
                await all(ctx, entry2.parsers);
                stage.delete(key);
                if (entry2.after?.()) return;
            }
            return await staged(ctx, stages);
        }
    }
    // First stage couldn't parse in any of the pathways, so reject them all and
    // continue with the next stage.
    for (const entry of firstStage.values()) {
        if (typeof entry.parsers === "function") {
            entry.parsers = entry.parsers();
        }
        while (entry.parsers.length > 0) entry.parsers.shift()!.reject();
    }
    firstStage.clear();
    return await staged(ctx, stages.slice(1));
}
