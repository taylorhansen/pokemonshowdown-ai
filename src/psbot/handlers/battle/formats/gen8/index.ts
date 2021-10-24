/** @file TODO. Stub. Currently only supporting gen4 for now. */
import { Encoder } from "../../ai/encoder/Encoder";
import { BattleParserContext } from "../../parser";
import { ReadonlyBattleState } from "./state";

export const encoder: Encoder<ReadonlyBattleState> =
{
    encode()
    {
        throw new Error("gen8 encoder not implemented");
    },
    size: 0
};

export async function parser(ctx: BattleParserContext<"gen8">): Promise<void>
{
    void ctx;
    return await Promise.reject(new Error("gen8 parser not implemented"));
}

export * as state from "./state";
