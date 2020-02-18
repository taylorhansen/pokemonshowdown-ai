/** @file Basic hand-rolled type-safe parser combinator library. */
import { Parser } from "./types";

/**
 * Creates a Parser that will backtrack and return `undefined` if the given
 * parser throws.
 */
export function maybe<TResult, TInput>(p: Parser<TResult, TInput>):
    Parser<TResult | undefined, TInput>;
/**
 * Creates a Parser that will backtrack and return an alternate value if the
 * given parser throws.
 * @param alt Alternate value for when the parser fails.
 */
export function maybe<TResult, TAlt, TInput>(p: Parser<TResult, TInput>,
    alt: TAlt): Parser<TResult | TAlt, TInput>;
export function maybe(p: Parser<any, any>, alt?: any): Parser<any, any>
{
    return function(input, info)
    {
        try { return p(input, info); }
        catch (e) { return {result: alt, remaining: input}; }
    };
}

/**
 * Connects one parser to the next by leftover input.
 *
 * @example
 * // parses a word then an integer, giving a result of [string, number]
 * sequence(anyWord, integer);
 */
export function sequence<TInput>(): Parser<[], TInput>;
export function sequence<TResult, TInput>(p1: Parser<TResult, TInput>):
    Parser<[TResult], TInput>;
export function sequence<TResult1, TResult2, TInput>(
    p1: Parser<TResult1, TInput>, p2: Parser<TResult2, TInput>):
    Parser<[TResult1, TResult2], TInput>;
export function sequence<TResult1, TResult2, TResult3, TInput>(
    p1: Parser<TResult1, TInput>, p2: Parser<TResult2, TInput>,
    p3: Parser<TResult3, TInput>):
    Parser<[TResult1, TResult2, TResult3], TInput>;
export function sequence<TResult1, TResult2, TResult3, TResult4, TInput>(
    p1: Parser<TResult1, TInput>, p2: Parser<TResult2, TInput>,
    p3: Parser<TResult3, TInput>, p4: Parser<TResult4, TInput>):
    Parser<[TResult1, TResult2, TResult3, TResult4], TInput>;
export function sequence(...parsers: Parser<any, any>[]): Parser<any[], any>
{
    if (parsers.length <= 0) return input => ({result: [], remaining: input});

    return function(input, info)
    {
        const r1 = parsers[0](input, info);
        // convert to array for pushing other results
        r1.result = [r1.result];
        for (let i = 1; i < parsers.length; ++i)
        {
            const r2 = parsers[i](r1.remaining, info);
            r1.result.push(r2.result);
            r1.remaining = r2.remaining;
        }
        return r1;
    };
}

/**
 * Transforms the result of a Parser into a different type.
 *
 * @example
 * // parses a word but returns a SomeObject rather than the word itself
 * transform(anyWord, w => new SomeObject(w));
 */
export function transform<TResult1, TResult2, TInput>(
    p: Parser<TResult1, TInput>, f: (t: TResult1) => TResult2):
    Parser<TResult2, TInput>
{
    return function(input, info)
    {
        const r = p(input, info);
        return {result: f(r.result), remaining: r.remaining};
    };
}
