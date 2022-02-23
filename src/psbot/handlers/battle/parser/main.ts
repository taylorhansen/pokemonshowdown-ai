import {BattleParserContext} from "./BattleParser";
import {dispatch} from "./events";
import {consume, eventLoop, tryVerify} from "./parsing";

/** Main entry point for the gen4 parser. */
export async function main(ctx: BattleParserContext): Promise<void> {
    await eventLoop(ctx, dispatch);

    if (await tryVerify(ctx, "|win|", "|tie|")) {
        await consume(ctx);
    }
}
