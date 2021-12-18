import {BattleAgent} from "../../agent";
import {FormatType} from "../../formats";
import {BattleParserContext} from "../BattleParser";
import {tryPeek} from "../helpers";
import {Parser, AcceptCallback, InnerParser} from "./Parser";

// TODO: Move to separate files and test each.

/**
 * Invokes a group of unordered {@link Parser}s in any order, then rejects the
 * ones that never parsed.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TResult BattleParser's result type.
 * @param ctx Parser context.
 * @param parsers Parsers to consider, wrapped to include a deadline callback,
 * in order of descending priority. Entries are removed from the list as they
 * get parsed or rejected, so this list will be empty after this function
 * returns.
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
    // Parse all in any order.
    const results = await some(ctx, parsers, filter, accept);

    // Reject parsers that never got to accept an event.
    while (parsers.length > 0) parsers.shift()!.reject();

    return results;
}

/**
 * Invokes a group of unordered {@link Parser}s in any order.
 *
 * @template T Format type.
 * @template TAgent Battle agent type.
 * @template TResult BattleParser's result type.
 * @param ctx Parser context.
 * @param parsers Parsers to consider, wrapped to include a deadline callback,
 * in order of descending priority. Entries are removed from the list as they
 * get parsed.
 * @param filter Optional parser that runs before each expected parser, usually
 * to consume events that should be ignored. If it calls its
 * {@link AcceptCallback `accept()`} callback, then all of the pending parsers
 * are immediately rejected and this function returns.
 * @param accept Optional accept callback that gets called when the first parser
 * accepts.
 * @returns An array containing the results of the Parsers that were able to
 * successfully parse, in the order that they were parsed.
 */
export async function some<
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

    /** Last generated {@link parsers}. For internal use only. */
    _lastParsers?: Parser<T, TAgent>[];
    /**
     * Initial {@link parsers} before parsing the next pathway. For internal use
     * only.
     */
    _initial?: Parser<T, TAgent>[];
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
 * @see {@link multiStaged}, a version that supports concurrrent pathways.
 */
export async function staged<
    T extends FormatType = FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>,
    TKey = unknown,
>(
    ctx: BattleParserContext<T, TAgent>,
    stages: Map<TKey, StageEntry<T, TAgent>>[],
): Promise<void> {
    // Generate initial parsers for rejecting later.
    for (const stage of stages) {
        for (const entry of stage.values()) {
            entry._initial =
                typeof entry.parsers === "function"
                    ? entry.parsers()
                    : entry.parsers;
        }
    }

    // Keep looping until no more pathways to parse.
    let alive: boolean;
    do {
        alive = false;
        // Try to identify the next pathway to parse within these stages.
        for (let i = 0; i < stages.length; ++i) {
            const stage = stages[i];
            let pathway: [TKey] | undefined;

            for (const [key, entry] of stage) {
                // Try to parse some effects from this stage.
                const parsers = (entry._lastParsers ??=
                    typeof entry.parsers === "function"
                        ? entry.parsers()
                        : entry.parsers);
                // Note: Using some() instead of all() so we don't reject the
                // parsers if they don't accept an event yet, since if this
                // pathway shouldn't be parsed yet then we want to be able to
                // check again later.
                await some(
                    ctx,
                    parsers,
                    undefined /*filter*/,
                    () => {
                        pathway = [key];
                        entry.parsers = parsers;
                    } /*accept*/,
                );
                if (pathway) break;
            }

            if (pathway) {
                // Pathway for this key has been locked in, so parse the rest of
                // this stage then the rest of the stages for this pathway for
                // this key only.
                // Afterwards we'll search for the next pathway.

                // Note that if we didn't start at the first stage then we have
                // to reject the parsers for the previous stage(s) in this
                // pathway since they failed to parse by the time we got to this
                // stage.
                for (let j = 0; j <= i; ++j) {
                    const stage2 = stages[j];

                    // Discard the _lastParsers entries from other pathways
                    // that failed to parse since a different pathway (i.e., the
                    // current one) had to parse first, meaning these were
                    // generated too early.
                    for (const [key, entry] of stage2) {
                        if (key === pathway[0]) continue;
                        entry._lastParsers = undefined;
                    }
                    // Note: Only go up to but not including i, since we're
                    // about to parse i which is the current stage.
                    // The '<=' in the loop condition was only so that we can
                    // fully clear the generated _lastParsers entries in the
                    // other pathways that failed to parse.
                    if (j >= i) break;

                    const entry = stage2.get(pathway[0]);
                    if (!entry) continue;
                    const parsers = (entry._lastParsers ??=
                        typeof entry.parsers === "function"
                            ? (entry.parsers = entry.parsers())
                            : entry.parsers);
                    while (parsers.length > 0) parsers.shift()!.reject();
                    entry._lastParsers = undefined;
                    stage2.delete(pathway[0]);
                }

                for (let j = i; j < stages.length; ++j) {
                    const stage2 = stages[j];
                    const entry = stage2.get(pathway[0]);
                    if (!entry) continue;
                    const parsers = (entry._lastParsers ??=
                        typeof entry.parsers === "function"
                            ? (entry.parsers = entry.parsers())
                            : entry.parsers);
                    await all(ctx, parsers);
                    stage2.delete(pathway[0]);
                    if (entry.after?.()) return;
                }
                // Go back to the outer loop to look for the next pathway.
                alive = true;
                break;
            }
        }
    } while (alive);

    // TODO: Support ambiguous cases where it's impossible to tell the order of
    // pathways that failed to parse.
    // For now we just assume that the failed pathways were first since it's the
    // more common case with switch/residual effects.
    for (const stage of stages) {
        for (const entry of stage.values()) {
            const parsers = entry._initial!;
            while (parsers.length > 0) parsers.shift()!.reject();
        }
    }
}
