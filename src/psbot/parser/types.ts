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
export type Parser<TResult, TInput> = (input: Iter<TInput>, info: Info) =>
    Result<TResult, TInput>;

/** Info object passed to all Parsers. */
export interface Info
{
    /** The room that the message came from. */
    readonly room: string;
    /** Logs messages to the user. */
    readonly logger: Logger;
}

/** Parser result. */
export interface Result<TResult, TInput>
{
    /** Section of input that was consumed and transformed. */
    result: TResult;
    /** Section of input that's remaining. */
    remaining: Iter<TInput>;
}

/** Main parser input type. */
export type Input = Iter<string>;
