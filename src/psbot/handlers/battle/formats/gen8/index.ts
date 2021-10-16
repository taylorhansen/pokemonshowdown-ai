/** @file TODO. Stub. Currently only supporting gen4 for now. */
import { Encoder } from "../../ai/encoder/Encoder";
import { BattleParserContext } from "../../parser";

export const encoder: Encoder<state.ReadonlyBattleState> =
{
    encode()
    {
        throw new Error("gen8 encoder not implemented");
    },
    size: 0
};

export async function parser(ctx: BattleParserContext<"gen8">): Promise<void>
{
    throw new Error("gen8 parser not implemented");
}

// tslint:disable-next-line: no-namespace
export namespace state
{
    export interface ReadonlyBattleState {}
    export class BattleState implements ReadonlyBattleState {}
}
