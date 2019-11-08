/** @file Basic hand-rolled type-safe parser combinator library. */
import { Parser } from "./types";

/**
 * Creates a Parser that will backtrack and return `undefined` if the given
 * parser throws.
 */
export function maybe<T>(p: Parser<T>): Parser<T | undefined>;
/**
 * Creates a Parser that will backtrack and return an alternate value if the
 * given parser throws.
 * @param alt Alternate value for when the parser fails.
 */
export function maybe<T, U>(p: Parser<T>, alt: U): Parser<T | U>;
export function maybe(p: Parser<any>, alt?: any): Parser<any>
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
export function sequence(): Parser<[]>;
export function sequence<T>(p1: Parser<T>): Parser<[T]>;
export function sequence<T, U>(p1: Parser<T>, p2: Parser<U>): Parser<[T, U]>;
export function sequence<T, U, V>(p1: Parser<T>, p2: Parser<U>, p3: Parser<V>):
    Parser<[T, U, V]>;
export function sequence<T, U, V, W>(p1: Parser<T>, p2: Parser<U>,
    p3: Parser<V>, p4: Parser<W>): Parser<[T, U, V, W]>;
export function sequence(...parsers: Parser<any>[]): Parser<any[]>
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
export function transform<T, U>(p: Parser<T>, f: (t: T) => U): Parser<U>
{
    return function(input, info)
    {
        const r = p(input, info);
        return {result: f(r.result), remaining: r.remaining};
    };
}
