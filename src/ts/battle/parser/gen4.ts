import {Event} from "../../protocol/Event";
import {BattleParserContext} from "./BattleParser";
import {handlers} from "./events";
import {createDispatcher} from "./utils";

/** BattleParser for Gen 4 battles. */
export async function gen4Parser(
    ctx: BattleParserContext,
    event: Event,
): Promise<void> {
    await dispatcher(ctx, event);
}

const dispatcher = createDispatcher(handlers);
