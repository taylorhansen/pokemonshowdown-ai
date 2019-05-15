/** @file Basic hand-rolled parser combinator library. Not feature-complete. */
import { Parser, Result } from "./types";

/**
 * Connects one parser to the next by leftover input.
 *
 * @example
 * // parses a word then an integer, giving a result of [string, number]
 * sequence(anyWord, integer);
 */
export function sequence<T, U>(p1: Parser<T>, p2: Parser<U>): Parser<[T, U]>
{
    return function(input, info)
    {
        const r1 = p1(input, info);
        const r2 = p2(r1.remaining, info);
        return {result: [r1.result, r2.result], remaining: r2.remaining};
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

/** Creates a Parser that will backtrack if the given parser throws. */
export function maybe<T>(p: Parser<T>): Parser<T | undefined>
{
    return function(input, info): Result<T | undefined>
    {
        try { return p(input, info); }
        catch (e) { return {result: undefined, remaining: input}; }
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
