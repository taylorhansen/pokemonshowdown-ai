import * as dex from "../../dex/dex";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ParserState, SubParser } from "../BattleParser";
import { SuccessResult } from "./parsers";
import { useMove } from "./useMove";

/** Expects a switch-in from a Pokemon slot while watching for Pursuit. */
export async function* expectSwitch(pstate: ParserState, monRef: Side,
    lastEvent?: events.Any): SubParser<SuccessResult>
{
    // possible pursuit
    lastEvent ??= (yield);
    if (lastEvent.type === "useMove")
    {
        // TODO: should these be error logs instead?
        if (lastEvent.monRef === monRef)
        {
            throw new Error(`Pokemon '${monRef}' was expected to switch out`);
        }
        if (!dex.moves[lastEvent.move]?.flags?.interceptSwitch)
        {
            throw new Error(`Move '${lastEvent.move}' cannot be used to ` +
                "intercept a switch-in");
        }
        const moveResult = yield* useMove(pstate, lastEvent);
        lastEvent = moveResult.event;
    }

    // switch-in
    lastEvent ??= (yield);
    if (lastEvent.type !== "switchIn") return {event: lastEvent};
    if (lastEvent.monRef !== monRef) return {event: lastEvent};
    return {...yield* switchIn(pstate, lastEvent), success: true};
}

/** Handles events within the context of a switch-in. */
export async function* switchIn(pstate: ParserState, event: events.SwitchIn):
    SubParser
{
    // TODO: switch ctx
    pstate.state.teams[event.monRef].switchIn(event);
    return {};
}
