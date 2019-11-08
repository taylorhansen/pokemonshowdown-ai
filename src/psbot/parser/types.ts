/** @file Provides type definitions for the parser. */
import { Logger } from "../../Logger";
import { Iter } from "./Iter";

/**
 * Parser type. Parsers are functions that take in an Input iterator and some
 * immutable state and return a Result object, which contains the parsed input
 * and an Input iterator to the next unit of input to be consumed by the next
 * Parser.
 *
 * For example, a `Parser<number>` takes in an `Input` iterator and returns a
 * `Result<number>`.
 *
 * @param input Parser input.
 * @param info Info for dispatching listeners.
 * @returns A Promise that resolves to a Result.
 */
export type Parser<T> = (input: Input, info: Info) => Result<T>;

/** Info object passed to all Parsers. */
export interface Info
{
    /** The room that the message came from. */
    readonly room: string;
    /** Logs messages to the user. */
    readonly logger: Logger;
}

/**
 * Parser result.
 *
 * For example, a `Result<number>` has a number `result` field and an `Input`
 * iterator of what's left.
 */
export interface Result<T>
{
    /** Section of input that was consumed and transformed. */
    result: T;
    /** Section of input that's remaining. */
    remaining: Input;
}

/** Main parser input type. */
export type Input = Iter<string>;
