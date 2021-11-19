import {SideID} from "@pkmn/types";
import {BattleParserContext, consume, unordered, verify} from "../../../parser";
import {playerActions} from "./action/action";
import {multipleSwitchIns} from "./action/switch";
import {ignoredEvents} from "./base";
import * as effectItem from "./effect/item";
import * as faint from "./faint";
import {request} from "./request";

/** Parses each turn of the battle until game over.  */
export async function turnLoop(
    ctx: BattleParserContext<"gen4">,
): Promise<void> {
    // Initial switch-ins happen on turn 1.
    await turn1(ctx);

    // Actual turn loop.
    let num = 1;
    while (await turn(ctx, ++num));
}

/** Parses the first turn with its initial switch-ins. */
async function turn1(ctx: BattleParserContext<"gen4">): Promise<void> {
    await multipleSwitchIns(ctx);
    await ignoredEvents(ctx);
    await postTurn(ctx, 1);
}

/** Parses a full turn. Returns `true` on game over. */
async function turn(
    ctx: BattleParserContext<"gen4">,
    num: number,
): Promise<boolean> {
    await ignoredEvents(ctx);
    await preTurn(ctx);

    await ignoredEvents(ctx);
    await playerActions(ctx);

    await ignoredEvents(ctx);
    await residual(ctx);

    await ignoredEvents(ctx);
    await faint.replacements(ctx);

    return await postTurn(ctx, num);
}

/** Handles pre-turn effects before any actions are taken. */
async function preTurn(ctx: BattleParserContext<"gen4">): Promise<void> {
    ctx.state.preTurn();
    // TODO: quickclaw, custap, others?
    await Promise.resolve();
}

// TODO: Move to separate file?
/** Handles residual effects at the end of the turn. */
async function residual(ctx: BattleParserContext<"gen4">): Promise<void> {
    // TODO(#312): Other residual effects: statuses, weathers, wish, etc.
    await unordered.all(
        ctx,
        (["p1", "p2"] as SideID[])
            .filter(side => !ctx.state.getTeam(side).active.fainted)
            .map(side => effectItem.onResidual(ctx, side)),
    );
}

/**
 * Handles post-turn effects, as well as the `|turn|` event to end the current
 * turn or the `|win|` event to end the game.
 *
 * @param num Turn number to check.
 * @returns Whether to continue the game.
 */
async function postTurn(
    ctx: BattleParserContext<"gen4">,
    num: number,
): Promise<boolean> {
    const event = await verify(ctx, "|turn|", "|win|", "|tie|");
    if (event.args[0] === "win" || event.args[0] === "tie") {
        // Game over.
        await consume(ctx);
        return false;
    }
    if (Number(event.args[1]) !== num) {
        throw new Error(`Expected turn ${num} but got ${event.args[1]}`);
    }
    await consume(ctx);

    ctx.state.postTurn();
    await request(ctx, "move");
    return true;
}
