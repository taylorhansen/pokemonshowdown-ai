/** @file Lists all the supported formats. */
import {BattleAgent} from "../agent";
import {Encoder} from "../ai/encoder/Encoder";
import {BattleParser} from "../parser";
// TODO: Lazy load formats?
import * as gen4 from "./gen4";
import * as gen8 from "./gen8";

/** Names of all the supported formats. */
export type FormatType = "gen4" | "gen8";

/** Maps format name to main BattleParser function. */
export const parser: {
    readonly [T in FormatType]: BattleParser<T, BattleAgent<T>, [], void>;
} = {gen4: gen4.parser, gen8: gen8.parser};

/** Maps format name to battle state constructor. */
export const state: {readonly [T in FormatType]: StateConstructor<T>} = {
    gen4: gen4.state.BattleState,
    gen8: gen8.state.BattleState,
};

/** Maps format name to state encoder. */
export const encoder: {readonly [T in FormatType]: Encoder<ReadonlyState<T>>} =
    {gen4: gen4.encoder, gen8: gen8.encoder};

/** Battle state type maps. */
interface StateMap {
    gen4: {
        stateCtor: typeof gen4.state.BattleState;
        state: gen4.state.BattleState;
        rstate: gen4.state.ReadonlyBattleState;
    };
    gen8: {
        stateCtor: typeof gen8.state.BattleState;
        state: gen8.state.BattleState;
        rstate: gen8.state.ReadonlyBattleState;
    };
}

/**
 * Maps format name to battle state ctor type.
 *
 * @template T Format type.
 */
export type StateConstructor<T extends FormatType> = StateMap[T]["stateCtor"];

/**
 * Maps format name to battle state type.
 *
 * @template T Format type.
 */
export type State<T extends FormatType> = StateMap[T]["state"];

/**
 * Maps format name to readonly battle state type.
 *
 * @template T Format type.
 */
export type ReadonlyState<T extends FormatType> = StateMap[T]["rstate"];
