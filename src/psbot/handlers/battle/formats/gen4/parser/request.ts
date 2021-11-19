/** @file Specifies how to handle `|request|` events to call the BattleAgent. */
import {Protocol} from "@pkmn/protocol";
import {SideID} from "@pkmn/types";
import {Choice} from "../../../agent";
import {
    BattleParserContext,
    consume,
    SenderResult,
    verify,
} from "../../../parser";
import {Move} from "../state/Move";
import {sanitizeMoveId} from "./init";

// Note: usually the |request| event is displayed before the game events that
// lead up to the state described by the |request| JSON object, but some logic
// in the parent BattleHandler reverses that so that the |request| happens
// after all the game events.
// This allows us to treat |request| as an actual request for a decision after
// having parsed all the relevant game events.

/**
 * Parses a `|request|` event to update the state and call the BattleAgent.
 *
 * @param type Optional expected request type.
 */
export async function request(
    ctx: BattleParserContext<"gen4">,
    type?: Protocol.Request["requestType"],
): Promise<void> {
    const event = await verify(ctx, "|request|");
    const [, json] = event.args;
    const req = Protocol.parseRequest(json);

    if (type && req.requestType !== type) {
        throw new Error(
            `Expected |request| type '${type}' but got '${req.requestType}'`,
        );
    }

    switch (req.requestType) {
        case "team":
            // TODO
            throw new Error("Team preview not supported");
        case "move": {
            // Making a normal move/switch decision between turns.
            // First verify move slots.
            const mon = ctx.state.getTeam(req.side.id).active;
            for (const moveData of req.active[0]!.moves) {
                // Sanitize variable-type moves.
                let {id}: {id: string} = moveData;
                ({id} = sanitizeMoveId(id));
                // Note: Can have missing pp/maxpp values, e.g. due to a locked
                // move.
                let move: Move;
                if (!Object.hasOwnProperty.call(moveData, "maxpp")) {
                    move = mon.moveset.reveal(id);
                } else move = mon.moveset.reveal(id, moveData.maxpp);
                if (Object.hasOwnProperty.call(moveData, "pp")) {
                    move.pp = moveData.pp;
                }
            }
            // Fallthrough.
        }
        case "switch":
            // Forced to make a switch decision during the current turn.
            await decide(ctx, req);
            break;
        case "wait":
            // Waiting for opponent to make a decision; no further action
            // needed.
            break;
        // istanbul ignore next: Should never happen.
        default: {
            // Force compile error if not all cases were covered.
            const unsupported: never = req;
            throw new Error(
                "Unknown |request| type " +
                    `'${(unsupported as {requestType: string}).requestType}'`,
            );
        }
    }

    await consume(ctx);
}

/**
 * Calls the BattleAgent to make a decision during the battle.
 *
 * @param choices Currently available choices. Can be narrowed down by this
 * function if some turn out to be invalid.
 */
async function decide(
    ctx: BattleParserContext<"gen4">,
    req: Protocol.MoveRequest | Protocol.SwitchRequest,
): Promise<void> {
    ctx = {
        ...ctx,
        logger: ctx.logger.addPrefix(`Decide(${req.requestType}): `),
    };

    const choices = getChoices(req);
    ctx.logger.debug(`Choices: [${choices.join(", ")}]`);

    // istanbul ignore if: Should never happen.
    if (choices.length <= 0) throw new Error("No choices to send");
    // Note: if we only have one choice then the BattleAgent will have basically
    // experienced a "time skip" between turns since its choices wouldn't have
    // mattered.
    // In case the BattleAgent does any logging, this makes it so that it only
    // does so when its choices matter, which could help for things like
    // reinforcement learning applications.
    if (choices.length === 1) await sendLastchoice(ctx, choices[0]);
    else await evaluateChoices(ctx, req.side.id, choices);

    ctx.logger.debug(`Choice '${choices[0]}' was accepted`);
}

/**
 * Calls the BattleAgent to evaluate the available choices and decide what to
 * do.
 *
 * Handles rejections from the server as well as state updates and choice
 * re-evaluations due to those updates. Leaves its `choices` parameter with item
 * `0` containing the choice that was accepted.
 *
 * @param side Pokemon reference that will perform the action when chosen.
 * @param choices Currently available choices. Can be narrowed down by this
 * function if some turn out to be invalid.
 */
async function evaluateChoices(
    ctx: BattleParserContext<"gen4">,
    side: SideID,
    choices: Choice[],
): Promise<void> {
    const agentLogger = ctx.logger.addPrefix("BattleAgent: ");
    await ctx.agent(ctx.state, choices, agentLogger);
    ctx.logger.debug(`Sorted choices: [${choices.join(", ")}]`);

    let result: SenderResult;
    // Send the highest-priority (0-index) choice.
    // Most of the rest of the logic here handles corner cases where a choice is
    // invalid, usually due to unknown information where the state has to be
    // updated and the choices re-evaluated.
    while ((result = await ctx.sender(choices[0]))) {
        // A truthy result here means that the choice was rejected.
        // Handle the returned information and re-evaluate.

        // Remove invalid choice.
        const lastChoice = choices.shift()!;
        ctx.logger.debug(`Choice '${lastChoice}' was rejected as '${result}'`);

        // Interpret the rejection reason to possibly update the battle state.
        /**
         * Whether the state has been updated and we need to re-evaluate the
         * remaining choices.
         */
        let newInfo = false;
        if (result === "disabled") {
            // Move is disabled by a previously-unknown effect.
            // TODO: Imprison check.
        } else if (result === "trapped") {
            // Pokemon is trapped by a previously-unknown effect.
            // Now known to be trapped by the opponent, all other switch choices
            // are therefore invalid.
            for (let i = 0; i < choices.length; ++i) {
                if (choices[i].startsWith("switch")) choices.splice(i--, 1);
            }
            // Try to infer a trapping ability.
            const mon = ctx.state.getTeam(side).active;
            const opp = ctx.state.getTeam(side === "p1" ? "p2" : "p1").active;
            mon.trapped(opp);
            newInfo = true;
        }

        // Before possibly querying the BattleAgent/loop again, make sure we
        // haven't fallen back to the base case in decide().
        // istanbul ignore if: Should never happen.
        if (choices.length <= 0) {
            throw new Error(
                `Last choice '${lastChoice}' rejected as '${result}'`,
            );
        }
        if (choices.length === 1) {
            await sendLastchoice(ctx, choices[0]);
            break;
        }

        // If the state was updated then we should re-evaluate our remaining
        // choices.
        // Otherwise we can just send the next-best choice.
        if (!newInfo) continue;
        await ctx.agent(ctx.state, choices, agentLogger);
        ctx.logger.debug(`Sorted choices: [${choices.join(", ")}]`);
    }
}

async function sendLastchoice(
    ctx: BattleParserContext<"gen4">,
    choice: Choice,
): Promise<void> {
    const res = await ctx.sender(choice);
    if (!res) return;
    ctx.logger.error(`Choice '${choice}' was rejected as '${res}'`);
    throw new Error(`Last choice '${choice}' was rejected as '${res}'`);
}

/** Gets the available choices for this decision request. */
function getChoices(req: Protocol.Request): Choice[] {
    const result: Choice[] = [];
    let trapped: boolean | undefined;
    if (req.requestType === "move") {
        result.push(...getMoveChoices(req));
        trapped = req.active[0]?.trapped;
    }
    if (!trapped) result.push(...getSwitchChoices(req));
    return result;
}

/** Gets the available move choices. */
function getMoveChoices(req: Protocol.MoveRequest): Choice[] {
    const result: Choice[] = [];

    const moves = req.active[0]?.moves;
    if (!moves) return result;
    for (let i = 0; i < moves.length; ++i) {
        const move = moves[i];
        // Struggle can always be selected.
        if (move.id !== "struggle") {
            // Depleted moves can no longer be selected.
            if (move.pp <= 0) continue;
            // Disabled by a known effect.
            if (move.disabled) continue;
        }

        result.push(`move ${i + 1}` as Choice);
    }

    return result;
}

/** Gets the available switch choices. */
function getSwitchChoices(req: Protocol.Request): Choice[] {
    const result: Choice[] = [];

    const pokemon = req.side?.pokemon;
    if (!pokemon) return result;
    for (let i = 0; i < pokemon.length; ++i) {
        const data = pokemon[i];
        // Can't select other active pokemon.
        if (data.active) continue;
        // Can't select fainted pokemon.
        if (data.fainted) continue;

        result.push(`switch ${i + 1}` as Choice);
    }

    return result;
}
