/** @file Handles parsing a player's main action. */
import { SideID } from "@pkmn/types";
import { BattleParserContext, eventLoop, peek, unordered } from
    "../../../../parser";
import { ignoredEvents } from "../base";
import { moveAction, MoveActionResult } from "./move";
import { switchAction, SwitchActionResult } from "./switch";

/** Required base result type for action parsers. */
export interface ActionResult
{
    /** Specifies the pokemon that took an action this turn. */
    actioned?: PlayerActionsState;
}

/** Specifies the pokemon that took an action this turn. */
type PlayerActionsState = {[S in SideID]?: true};

/** Parses each player's main actions for this turn. */
export async function playerActions(ctx: BattleParserContext<"gen4">)
{
    // Shared state used to track whether each pokemon has spent their action
    // for this turn.
    const actioned: PlayerActionsState = {};

    const switchResults = await unordered.all(ctx,
        (Object.entries(ctx.state.teams) as [SideID, unknown][])
            .map(([side]) => playerSwitchAction(side, actioned)),
        filter);
    Object.assign(actioned, ...switchResults.map(res => res.actioned));

    const moveResults = await unordered.all(ctx,
        (Object.entries(ctx.state.teams) as [SideID, unknown][])
            .filter(([side]) => !actioned[side])
            .map(([side]) => playerMoveAction(side, actioned)),
        filter);
    Object.assign(actioned, ...moveResults.map(res => res.actioned));

    for (const side in actioned)
    {
        if (!Object.hasOwnProperty.call(actioned, side)) continue;
        // TODO: Throw/aggregate multiple errors?
        // TODO: Don't throw if game-over.
        if (!actioned[side as SideID])
        {
            throw new Error(`Expected ${side} player action`);
        }
    }
}

const playerSwitchAction = (side: SideID, actioned: PlayerActionsState) =>
    unordered.UnorderedDeadline.create(`${side} action switch`,
        playerSwitchActionImpl, undefined /*reject*/, side, actioned);

async function playerSwitchActionImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID,
    actioned: PlayerActionsState): Promise<SwitchActionResult>
{
    if (actioned[side])
    {
        accept();
        return {};
    }
    return await switchAction(ctx, side, accept);
}

const playerMoveAction = (side: SideID, actioned: PlayerActionsState) =>
    unordered.UnorderedDeadline.create(`${side} action move`,
        playerMoveActionImpl, undefined /*reject*/, side, actioned);

async function playerMoveActionImpl(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback, side: SideID,
    actioned: PlayerActionsState): Promise<MoveActionResult>
{
    if (actioned[side])
    {
        accept();
        return {};
    }
    return await moveAction(ctx, side, accept);
}

/** Consumes ignored events until the end of player actions. */
async function filter(ctx: BattleParserContext<"gen4">,
    accept: unordered.AcceptCallback)
{
    await eventLoop(ctx,
        async function filterLoop(_ctx)
        {
            const event = await peek(_ctx);
            switch (event.args[0])
            {
                // Terminating events.
                // TODO: Is this necessary?
                case "win": case "tie":
                    accept();
                    break;
                default:
                    await ignoredEvents(_ctx);
            }
        });
}
