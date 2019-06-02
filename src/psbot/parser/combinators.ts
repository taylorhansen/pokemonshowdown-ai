/** @file Basic hand-rolled type-safe parser combinator library. */
import { Parser, Result } from "./types";

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

/**
 * Works like `sequence()` but the result of the first parser is used to
 * generate the second one instead of being returned in the Result object.
 *
 * @example
 * // parses the same word twice
 * chain(anyWord, w => word(w));
 * // expects the word and int concatenated as the next word
 * chain(sequence(anyWord, integer), ([w, i]) => word(w + i));
 */
export function chain<T, U>(p1: Parser<T>, f: (consumed: T) => Parser<U>):
    Parser<U>
{
    return function(input, info): Result<U>
    {
        const r1 = p1(input, info);
        return f(r1.result)(r1.remaining, info);
    };
}

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

/** Parses zero or more of a certain parser. Stops if the parser throws. */
export function some<T>(p: Parser<T>): Parser<T[]>
{
    return function(input, info): Result<T[]>
    {
        const result: T[] = [];
        while (!input.done)
        {
            try
            {
                const r = p(input, info);
                result.push(r.result);
                input = r.remaining;
            }
            catch (e) { break; }
        }
        return {result, remaining: input};
    };
}

/** Parses one or more of a certain parser. Stops if the parser throws. */
export function many<T>(p: Parser<T>): Parser<T[]>
{
    return function(input, info): Result<T[]>
    {
        let r: Result<T> = p(input, info);
        const result: T[] = [r.result];
        input = r.remaining;

        while (!input.done)
        {
            try
            {
                r = p(input, info);
                result.push(r.result);
                input = r.remaining;
            }
            catch (e) { break; }
        }
        return {result, remaining: input};
    };
}
