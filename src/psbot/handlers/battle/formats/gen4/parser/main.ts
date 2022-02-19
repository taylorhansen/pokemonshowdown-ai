import {
    BattleParserContext,
    consume,
    eventLoop,
    tryVerify,
} from "../../../parser";
import {dispatch} from "./events";

/** Main entry point for the gen4 parser. */
export async function main(ctx: BattleParserContext<"gen4">): Promise<void> {
    await eventLoop(ctx, dispatch);

    if (await tryVerify(ctx, "|win|", "|tie|")) {
        await consume(ctx);
    }
}
