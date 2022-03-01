/** @file Base game event handler implementations. */
import {Protocol} from "@pkmn/protocol";
import {BoostID, SideID, StatID} from "@pkmn/types";
import {Event} from "../../../parser";
import {BattleAgent, Choice} from "../agent";
import * as dex from "../dex";
import {toIdName} from "../helpers";
import {Move} from "../state/Move";
import {Pokemon, ReadonlyPokemon} from "../state/Pokemon";
import {SwitchOptions, TeamRevealOptions} from "../state/Team";
import {BattleParserContext, SenderResult} from "./BattleParser";
import {consume, dispatcher, EventHandlerMap, verify} from "./parsing";

/** Private mapped type for {@link handlersImpl}. */
type HandlersImpl<T> = {
    -readonly [U in keyof T]: T[U] | "default" | "unsupported";
};

/** Private mapped type for {@link handlersImpl} and {@link handlers}. */
type HandlerMap = EventHandlerMap<BattleAgent, [], void>;

/**
 * BattleParser handlers for each event type. Larger handler functions or
 * parsers that take additional args are moved to a separate file.
 *
 * If an entry is specified but set to `"default"`, a default handler will be
 * assigned to it, making it an event that shouldn't be ignored but has no
 * special behavior implemented by its handler. Alternatively, setting it to
 * `"unsupported"` will be replaced by a parser that always throws.
 */
const handlersImpl: HandlersImpl<HandlerMap> = {};
handlersImpl["|init|"] = async function (ctx) {
    const event = await verify(ctx, "|init|");
    // istanbul ignore if: Should never happen.
    if (event.args[1] !== "battle") {
        ctx.logger.error(
            `Expected |init|battle but got |init|${event.args[1]}`,
        );
    }
    await consume(ctx);
};
handlersImpl["|player|"] = async function (ctx) {
    const event = await verify(ctx, "|player|");
    const [, side, username] = event.args;
    if (ctx.state.username === username) {
        ctx.state.ourSide = side;
    }
    await consume(ctx);
};
handlersImpl["|teamsize|"] = async function (ctx) {
    const event = await verify(ctx, "|teamsize|");
    const [, side, sizeStr] = event.args;
    if (!ctx.state.ourSide) {
        throw new Error(
            "Expected |player| event for client before |teamsize| event",
        );
    }
    // Note: Client's side should be initialized by the first |request| event,
    // so we only need to parse the opponent's team size.
    if (ctx.state.ourSide !== side) {
        ctx.state.getTeam(side).size = Number(sizeStr);
    }
    await consume(ctx);
};
handlersImpl["|gametype|"] = async function (ctx) {
    const event = await verify(ctx, "|gametype|");
    // istanbul ignore if: Should never happen.
    if (event.args[1] !== "singles") {
        ctx.logger.error(
            "Expected |gametype|singles but got " +
                `|gametype|${event.args[1]}`,
        );
    }
    await consume(ctx);
};
handlersImpl["|gen|"] = async function (ctx) {
    const event = await verify(ctx, "|gen|");
    // istanbul ignore if: Should never happen.
    if (event.args[1] !== 4) {
        ctx.logger.error(`Expected |gen|4 but got |gen|${event.args[1]}`);
    }
    await consume(ctx);
};
handlersImpl["|tier|"] = "default";
handlersImpl["|rated|"] = "default";
handlersImpl["|seed|"] = "default";
handlersImpl["|rule|"] = "default";
// TODO: Support team preview.
handlersImpl["|clearpoke|"] = "unsupported";
handlersImpl["|poke|"] = "unsupported";
handlersImpl["|teampreview|"] = "unsupported";
handlersImpl["|updatepoke|"] = "unsupported";
handlersImpl["|start|"] = async function (ctx) {
    await verify(ctx, "|start|");
    if (!ctx.state.ourSide) {
        throw new Error(
            "Expected |player| event for client before |start event",
        );
    }
    ctx.state.started = true;
    await consume(ctx);
};
handlersImpl["|request|"] = async function (ctx) {
    // Note: Usually the |request| event is displayed before the game events
    // that lead up to the state described by the |request| JSON object, but
    // some logic in the parent BattleHandler reverses that so that the
    // |request| happens after all the game events.
    // This allows us to treat |request| as an actual request for a decision
    // after having parsed all the relevant game events.
    const event = await verify(ctx, "|request|");
    const [, json] = event.args;
    const req = Protocol.parseRequest(json);
    ctx.logger.debug(
        `Request ${req.requestType}${ctx.state.started ? "" : " (init)"}: ` +
            JSON.stringify(req),
    );

    switch (req.requestType) {
        case "team":
            // TODO
            ctx.logger.error("Team preview not supported");
            break;
        case "move": {
            if (!ctx.state.started) {
                initRequest(ctx, req);
            }
            // Making a normal move/switch decision between turns.
            // First verify active move slots.
            const mon = ctx.state.getTeam(req.side.id).active;
            for (const moveData of req.active[0]?.moves ?? []) {
                // Sanitize variable-type moves.
                let {id}: {id: string} = moveData;
                ({id} = sanitizeMoveId(id));
                if (id === "struggle") {
                    continue;
                }
                // Note: Can have missing pp/maxpp values, e.g. due to a rampage
                // move.
                let move: Move;
                if (!Object.hasOwnProperty.call(moveData, "maxpp")) {
                    move = mon.moveset.reveal(id);
                } else {
                    move = mon.moveset.reveal(id, moveData.maxpp);
                }
                if (Object.hasOwnProperty.call(moveData, "pp")) {
                    move.pp = moveData.pp;
                }
            }
            if (ctx.state.started) {
                await decide(ctx, req);
            }
            break;
        }
        case "switch":
            // Forced to make a switch decision during the current turn.
            if (!ctx.state.started) {
                ctx.logger.error(
                    "Expected |start| event before |request| with switch type",
                );
            }
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
            ctx.logger.error(
                "Unknown |request| type " +
                    `'${(unsupported as {requestType: string}).requestType}'`,
            );
        }
    }

    await consume(ctx);
};
function initRequest(ctx: BattleParserContext, req: Protocol.Request) {
    // istanbul ignore if: Should never happen.
    if (!req.side) {
        ctx.logger.error("Request with no side");
        return;
    }

    if (ctx.state.ourSide) {
        // istanbul ignore if: Should never happen.
        if (req.side.id !== ctx.state.ourSide) {
            ctx.logger.error(
                `Expected |request| with side.id = '${ctx.state.ourSide}' ` +
                    `but got '${req.side.id}'`,
            );
        }
    }
    ctx.state.ourSide = req.side.id;

    // istanbul ignore if: Should never happen.
    if (req.side.name !== ctx.state.username) {
        ctx.logger.error(
            `Expected |request| with side.name = '${ctx.state.username}' but ` +
                `got '${req.side.name}'`,
        );
    }

    const team = ctx.state.getTeam(ctx.state.ourSide);
    team.size = req.side.pokemon.length;
    for (const reqMon of req.side.pokemon) {
        // Preprocess moves to possibly extract hiddenpower type and happiness.
        const moves: string[] = [];
        let happiness: number | undefined;
        let hpType: dex.HpType | undefined;
        for (const moveId of reqMon.moves) {
            let id: string = moveId;
            ({id, happiness, hpType} = sanitizeMoveId(id));
            moves.push(id);
        }

        const revealOpts: TeamRevealOptions = {
            species: toIdName(reqMon.speciesForme),
            level: reqMon.level,
            gender: reqMon.gender ?? "N",
            hp: reqMon.hp,
            hpMax: reqMon.maxhp,
            moves,
        };
        const mon = team.reveal(revealOpts)!;

        mon.happiness = happiness ?? null;
        if (hpType) {
            mon.stats.hpType = hpType;
        }

        mon.baseStats.hp.set(reqMon.maxhp);
        for (const stat in reqMon.stats) {
            // istanbul ignore if
            if (!Object.hasOwnProperty.call(reqMon.stats, stat)) {
                continue;
            }
            const id = stat as Exclude<StatID, "hp">;
            mon.baseStats[id].set(reqMon.stats[id]);
        }

        mon.revealAbility(reqMon.baseAbility);
        mon.setItem(reqMon.item);
    }
}
/**
 * Parses a move id from a |request| JSON to extract the base name from the
 * additional features.
 */
export function sanitizeMoveId(id: string): {
    id: string;
    happiness?: number;
    hpType?: dex.HpType;
    hpPower?: number;
} {
    id = toIdName(id);
    let happiness: number | undefined;
    let hpType: dex.HpType | undefined;
    let hpPower: number | undefined;
    if (id.startsWith("hiddenpower") && id.length > "hiddenpower".length) {
        // Format: hiddenpower<type><base power if gen2-5>
        hpType = id
            .substring("hiddenpower".length)
            .replace(/\d+/, "") as dex.HpType;
        const hpPowerStr = id.match(/\d+/)?.[0];
        if (hpPowerStr) {
            hpPower = Number(hpPowerStr);
        }
        id = "hiddenpower";
    } else if (id.startsWith("return") && id.length > "return".length) {
        // Format: return<base power>
        // Equation: base power = happiness / 2.5
        happiness = 2.5 * parseInt(id.substring("return".length), 10);
        id = "return";
    } else if (
        id.startsWith("frustration") &&
        id.length > "frustration".length
    ) {
        // Format: frustration<base power>
        // Equation: base power = (255-happiness) / 2.5
        const scaled = 2.5 * parseInt(id.substring("frustration".length), 10);
        happiness = 255 - scaled;
        id = "frustration";
    }
    return {id, happiness, hpType, hpPower};
}
async function decide(
    ctx: BattleParserContext,
    req: Protocol.MoveRequest | Protocol.SwitchRequest,
): Promise<void> {
    ctx = {
        ...ctx,
        logger: ctx.logger.addPrefix(`Request(${req.requestType}): `),
    };

    const choices = getChoices(req);
    ctx.logger.debug(`Choices: [${choices.join(", ")}]`);

    // istanbul ignore if: Should never happen.
    if (choices.length <= 0) {
        throw new Error("No choices to send");
    }
    // Note: If we only have one choice then the BattleAgent will have basically
    // experienced a "time skip" between turns since its choices wouldn't have
    // mattered.
    // In case the BattleAgent does any logging, this makes it so that it only
    // does so when its choices matter, which could help for things like
    // reinforcement learning applications.
    if (choices.length === 1) {
        await sendFinalchoice(ctx, choices[0]);
    } else {
        await evaluateChoices(ctx, choices);
    }

    ctx.logger.debug(`Choice '${choices[0]}' was accepted`);
}
function getChoices(req: Protocol.Request): Choice[] {
    const result: Choice[] = [];
    let trapped: boolean | undefined;
    if (req.requestType === "move") {
        const moves = req.active[0]?.moves;
        // istanbul ignore if: Can't reproduce.
        if (!moves) {
            return result;
        }
        for (let i = 0; i < moves.length; ++i) {
            const move = moves[i];
            // Struggle can always be selected.
            if (move.id !== "struggle") {
                // Depleted moves can no longer be selected.
                if (move.pp <= 0) {
                    continue;
                }
                // Disabled by a known effect.
                if (move.disabled) {
                    continue;
                }
            }

            result.push(`move ${i + 1}` as Choice);
        }
        trapped = req.active[0]?.trapped;
    }
    if (!trapped) {
        const pokemon = req.side?.pokemon;
        // istanbul ignore if: Can't reproduce.
        if (!pokemon) {
            return result;
        }
        for (let i = 0; i < pokemon.length; ++i) {
            const data = pokemon[i];
            // Can't select other active pokemon.
            if (data.active) {
                continue;
            }
            // Can't select fainted pokemon.
            if (data.fainted) {
                continue;
            }
            result.push(`switch ${i + 1}` as Choice);
        }
    }
    return result;
}
async function sendFinalchoice(
    ctx: BattleParserContext,
    choice: Choice,
): Promise<void> {
    const res = await ctx.sender(choice);
    if (!res) {
        return;
    }
    ctx.logger.debug(`Choice '${choice}' was rejected as '${res}'`);
    throw new Error(`Final choice '${choice}' was rejected as '${res}'`);
}
/**
 * Calls the BattleAgent to evaluate the available choices and decide what to
 * do.
 *
 * Handles rejections from the server as well as state updates and choice
 * re-evaluations due to those updates. Leaves its `choices` parameter with item
 * `0` containing the choice that was accepted.
 *
 * @param choices Currently available choices. Can be narrowed down by this
 * function if some turn out to be invalid.
 */
async function evaluateChoices(
    ctx: BattleParserContext,
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
        if (result === "trapped") {
            // Pokemon is trapped by a previously-unknown effect.
            // Now known to be trapped by the opponent, all other switch choices
            // are therefore invalid.
            for (let i = 0; i < choices.length; ++i) {
                if (choices[i].startsWith("switch")) {
                    choices.splice(i--, 1);
                }
            }
        }

        // Make sure we haven't fallen back to the base case in decide().
        // istanbul ignore if: Should never happen.
        if (choices.length <= 0) {
            throw new Error(
                `Final choice '${lastChoice}' rejected as '${result}'`,
            );
        }
        if (choices.length === 1) {
            await sendFinalchoice(ctx, choices[0]);
            break;
        }
    }
}
handlersImpl["|upkeep|"] = async function (ctx) {
    await verify(ctx, "|upkeep|");
    ctx.state.postTurn();
    await consume(ctx);
};
handlersImpl["|turn|"] = async function (ctx) {
    const event = await verify(ctx, "|turn|");
    ctx.logger.debug(`Turn ${event.args[1]}`);
    await consume(ctx);
};
// Note: Win/tie are handled by the top-level main.ts parser to end the game.
handlersImpl["|win|"] = async () => await Promise.resolve();
handlersImpl["|tie|"] = async () => await Promise.resolve();
handlersImpl["|move|"] = async function (ctx) {
    const event = await verify(ctx, "|move|");
    const [, identStr, moveStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const moveId = toIdName(moveStr);
    const team = ctx.state.getTeam(ident.player);
    const mon = team.active;

    // Consume micleberry status if applicable.
    mon.volatile.micleberry = false;

    // Start, continue, or end rampage/momentum move.
    if (!dex.isRampageMove(moveId)) {
        // Unrelated move breaks the sequence.
        mon.volatile.rampage.reset();
    } else if (mon.volatile.rampage.type !== moveId) {
        // Different move restarts the sequence.
        mon.volatile.rampage.start(moveId);
    } else {
        // Same move continues the sequence.
        mon.volatile.rampage.tick();
    }
    if (!dex.isMomentumMove(moveId)) {
        mon.volatile.momentum.reset();
    } else if (mon.volatile.momentum.type !== moveId) {
        mon.volatile.momentum.start(moveId);
    } else {
        mon.volatile.momentum.tick();
    }
    // Failed move clears continuous moves.
    if (event.kwArgs.notarget) {
        mon.volatile.rampage.reset();
        mon.volatile.momentum.reset();
    }
    // Note(gen4): Rampage move doesn't reset on miss.
    if (event.kwArgs.miss) {
        mon.volatile.momentum.reset();
    }

    // Release two-turn move.
    if (mon.volatile.twoTurn.type === moveId) {
        mon.volatile.twoTurn.reset();
    }

    // Handle implicit effects for these special status moves.
    // Note: In this context the [still] suffix can only mean move failure
    // (TODO: verify).
    if (!event.kwArgs.still) {
        switch (moveId) {
            case "defensecurl":
            case "minimize":
                mon.volatile[moveId] = true;
                break;
            case "healingwish":
            case "lunardance":
                team.status[moveId] = true;
                break;
            case "wish":
                // Note: Wish can be used consecutively, but only the first use
                // counts.
                team.status.wish.start(true /*noRestart*/);
                break;
        }
    }
    // Self-switch effect.
    if (!event.kwArgs.still && !event.kwArgs.notarget && !event.kwArgs.miss) {
        team.status.selfSwitch = dex.moves[moveId].selfSwitch ?? null;
    }

    const from =
        event.kwArgs.from && Protocol.parseEffect(event.kwArgs.from, toIdName);

    if (!from || from.name === "lockedmove") {
        mon.volatile.resetSingleMove();
        // Consume focuspunch status if applicable.
        mon.volatile.focus = false;
        // Set last move (encore).
        mon.volatile.lastMove = moveId;
        // Allow stall counter to continue if applicable.
        if (
            !["detect", "endure", "protect"].includes(moveId) ||
            // Note: Suffix [still] can only mean failure in this context.
            event.kwArgs.still
        ) {
            mon.volatile.stall(false);
        }

        if (!event.kwArgs.from) {
            // Choice was made manually from the user's moveset, so reveal the
            // move and deduct pp for it.
            if (moveId !== "struggle") {
                const move = mon.moveset.reveal(moveId);
                --move.pp;

                // Extra pp deduction due to target's pressure ability.
                // TODO(doubles): Track actual targets.
                if (
                    moveTargetsOpponent(move.data, mon) &&
                    ctx.state.getTeam(ident.player === "p1" ? "p2" : "p1")
                        .active.ability === "pressure"
                ) {
                    --move.pp;
                }
            }
        }
    } else if (from.type === "move") {
        // Called move.
        switch (from.name) {
            case "sleeptalk":
                // Calling move from user's moveset.
                mon.moveset.reveal(moveId);
                break;
            case "mefirst":
                // Calling move from target's moveset.
                // TODO(doubles): Track actual target.
                ctx.state
                    .getTeam(ident.player === "p1" ? "p2" : "p1")
                    .active.moveset.reveal(moveId);
                break;
        }
    }

    await consume(ctx);
};
function moveTargetsOpponent(
    move: dex.MoveData,
    user: ReadonlyPokemon,
): boolean {
    const moveTarget = user.types.includes("ghost")
        ? move.target
        : move.nonGhostTarget ?? move.target;
    switch (moveTarget) {
        case "adjacentAlly":
        case "adjacentAllyOrSelf":
        case "allies":
        case "allySide":
        case "allyTeam":
        case "self":
            return false;
        case "all":
        case "adjacentFoe":
        case "allAdjacent":
        case "allAdjacentFoes":
        case "any":
        case "foeSide":
        case "normal":
        case "randomNormal":
        case "scripted":
            // Note: Scripted target (e.g. counter) is still affected by
            // pressure even if it fails.
            return true;
        // istanbul ignore next: Should never happen.
        default: {
            const unsupportedTarget: never = moveTarget;
            throw new Error(`Unsupported move target '${unsupportedTarget}'`);
        }
    }
}
handlersImpl["|switch|"] = async function (ctx) {
    await switchEvent(ctx);
};
handlersImpl["|drag|"] = async function (ctx) {
    await switchEvent(ctx);
};
async function switchEvent(ctx: BattleParserContext): Promise<void> {
    const event = await verify(ctx, "|switch|", "|drag|");
    const [, identStr, detailsStr, healthStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const data = Protocol.parseDetails(ident.name, identStr, detailsStr);
    const health = Protocol.parseHealth(healthStr);

    const options: SwitchOptions = {
        species: toIdName(data.speciesForme),
        level: data.level,
        gender: data.gender ?? "N",
        hp: health?.hp ?? 0,
        hpMax: health?.maxhp ?? 0,
    };
    const team = ctx.state.getTeam(ident.player);
    const mon = team.switchIn(options);
    // istanbul ignore if: Should never happen.
    if (!mon) {
        ctx.logger.error(
            `Could not switch in new pokemon '${identStr}': ` +
                `Team '${ident.player}' is full (size=${team.size})`,
        );
    }

    await consume(ctx);
}
handlersImpl["|detailschange|"] = async function (ctx) {
    const event = await verify(ctx, "|detailschange|");
    const [, identStr, detailsStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const details = Protocol.parseDetails(ident.name, identStr, detailsStr);

    const formeId = toIdName(details.speciesForme);
    const mon = ctx.state.getTeam(ident.player).active;
    mon.formChange(formeId, details.level, true /*perm*/);
    mon.gender = details.gender ?? "N";

    await consume(ctx);
};
handlersImpl["|cant|"] = async function (ctx) {
    const event = await verify(ctx, "|cant|");
    const [, identStr, reasonStr, moveStr] = event.args;

    const reason = Protocol.parseEffect(reasonStr, toIdName);

    const ident = Protocol.parsePokemonIdent(identStr);
    const moveName = moveStr && Protocol.parseEffect(moveStr, toIdName).name;
    const mon = ctx.state.getTeam(ident.player).active;

    let canRevealMove = true;

    // Ability effect prevents the move from being used.
    if (
        (reason.type === "ability" || reason.name === "damp") &&
        event.kwArgs.of
    ) {
        const identOf = Protocol.parsePokemonIdent(event.kwArgs.of);
        const ofMon = ctx.state.getTeam(identOf.player).active;
        ofMon.revealAbility(reason.name);
    } else {
        switch (reason.name) {
            case "focuspunch":
                mon.volatile.focus = false;
                break;
            case "imprison":
                // Opponent's imprison caused the pokemon to be prevented from
                // moving, so the revealed move can be revealed for both sides.
                // istanbul ignore if: Should never happen but ok if it does.
                if (!moveName) {
                    break;
                }
                ctx.state
                    .getTeam(ident.player === "p1" ? "p2" : "p1")
                    .active.moveset.reveal(moveName);
                break;
            case "nopp":
                // Corner case when Baton Pass is an encored move, the
                // recipient's volatile.lastMove is set to "batonpass" even if
                // the recipient doesn't know that move, which can then cause
                // this event to happen due to some weird gen4 interactions with
                // encore effects.
                canRevealMove = false;
                break;
            case "truant":
                // Note: Truant/recharge turns overlap but only truant event is
                // displayed.
                mon.volatile.activateTruant();
            // Fallthrough.
            case "recharge":
                mon.volatile.mustRecharge = false;
                break;
            case "slp":
                // istanbul ignore if: Should never happen but ok if it does.
                if (mon.majorStatus.current !== "slp") {
                    ctx.logger.error("Pokemon is not asleep");
                    mon.majorStatus.afflict("slp");
                }
                mon.majorStatus.tick();
                break;
            default:
                ctx.logger.debug(`Ignoring |cant| reason '${reasonStr}'`);
        }
    }

    if (moveName && canRevealMove) {
        mon.moveset.reveal(moveName);
    }
    mon.inactive();
    await consume(ctx);
};
handlersImpl["|faint|"] = async function (ctx) {
    const event = await verify(ctx, "|faint|");
    const [, identStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    ctx.state.getTeam(ident.player).active.hp.set(0);
    await consume(ctx);
};
handlersImpl["|-formechange|"] = async function (ctx) {
    const event = await verify(ctx, "|-formechange|");
    const [, identStr, speciesForme] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const formeId = toIdName(speciesForme);
    const mon = ctx.state.getTeam(ident.player).active;

    if (event.kwArgs.from) {
        const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
        // Ability effect caused form change (e.g. forecast).
        if (from.type === "ability") {
            mon.revealAbility(from.name);
        }
    }

    mon.formChange(formeId, mon.stats.level);
    await consume(ctx);
};
handlersImpl["|-fail|"] = async function (ctx) {
    const event = await verify(ctx, "|-fail|");
    if (event.kwArgs.from) {
        const [, identStr] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
        // Ability effect prevents the move from being used.
        // Usually the [of] suffix specifies the ability holder, so fall back to
        // the original ident if it's not specified.
        const side = event.kwArgs.of
            ? Protocol.parsePokemonIdent(event.kwArgs.of).player
            : ident.player === "p1"
            ? "p2"
            : "p1";
        const mon = ctx.state.getTeam(side).active;
        if (from.type === "ability") {
            mon.revealAbility(from.name);
        }
    }
    await consume(ctx);
};
handlersImpl["|-block|"] = "unsupported";
handlersImpl["|-notarget|"] = "default";
handlersImpl["|-miss|"] = "default";
handlersImpl["|-damage|"] = async function (ctx) {
    await handleDamage(ctx);
};
handlersImpl["|-heal|"] = async function (ctx) {
    await handleDamage(ctx, true /*heal*/);
};
async function handleDamage(ctx: BattleParserContext, heal?: boolean) {
    const event = await verify(ctx, heal ? "|-heal|" : "|-damage|");
    const [, identStr, healthStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const health = Protocol.parseHealth(healthStr);
    const team = ctx.state.getTeam(ident.player);
    const mon = team.active;

    const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
    // Ability/item effect causes damage/healing.
    if (from.type === "ability" || from.type === "item") {
        let ofMon: Pokemon | undefined;
        if (!heal && event.kwArgs.of) {
            const identOf = Protocol.parsePokemonIdent(event.kwArgs.of);
            ofMon = ctx.state.getTeam(identOf.player).active;
        }
        // Note: Usually healing effects use the [of] suffix to specify the
        // source that caused the effect with the target being the ability/item
        // holder (e.g. waterabsorb/leftovers), and damaging effects use it to
        // specify the ability/item holder acting on the target (e.g. roughskin
        // or liquidooze), or it's self-inflicted if there isn't one (e.g.
        // solarpower/lifeorb).
        (heal ? mon : ofMon ?? mon)[
            from.type === "ability" ? "revealAbility" : "setItem"
        ](from.name);
    } else {
        switch (from.name) {
            case "lunardance":
                for (const move of mon.moveset.moves.values()) {
                    move.pp = move.maxpp;
                }
            // Fallthrough.
            case "healingwish":
                mon.majorStatus.cure();
                team.status[from.name] = false;
                break;
            case "wish":
                team.status[from.name].end();
                break;
        }
    }

    mon.hp.set(health?.hp ?? 0, health?.maxhp ?? 0);
    await consume(ctx);
}
handlersImpl["|-sethp|"] = async function (ctx) {
    const event = await verify(ctx, "|-sethp|");
    const [, identStr1, healthStr1, identStr2, healthNumStr2] = event.args;

    const ident1 = Protocol.parsePokemonIdent(identStr1);
    const mon1 = ctx.state.getTeam(ident1.player).active;

    if (!identStr2 || !healthNumStr2) {
        // Only one hp to set, so healthStr1 is just a normal PokemonHPStatus
        // string.
        const health1 = Protocol.parseHealth(
            healthStr1 as Protocol.PokemonHPStatus,
        );
        mon1.hp.set(health1?.hp ?? 0, health1?.maxhp ?? 0);
    } else {
        // Two hp numbers to set.
        const healthNum1 = Number(healthStr1);
        if (isNaN(healthNum1)) {
            throw new Error(`Invalid health number '${healthStr1}'`);
        }
        mon1.hp.set(healthNum1);

        const ident2 = Protocol.parsePokemonIdent(identStr2);
        const mon2 = ctx.state.getTeam(ident2.player).active;
        const healthNum2 = Number(healthNumStr2);
        if (isNaN(healthNum2)) {
            throw new Error(`Invalid health number '${healthNumStr2}'`);
        }
        mon2.hp.set(healthNum2);
    }

    await consume(ctx);
};
handlersImpl["|-status|"] = async function (ctx) {
    const event = await verify(ctx, "|-status|");
    const [, identStr, statusName] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const mon = ctx.state.getTeam(ident.player).active;
    if (event.kwArgs.from) {
        const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
        // Ability effect causes the status to be inflicted on the target.
        if (from.type === "ability") {
            // Here the [of] suffix refers to ability holder in all cases (e.g.
            // effectspore or static).
            if (event.kwArgs.of) {
                const identOf = Protocol.parsePokemonIdent(event.kwArgs.of);
                ctx.state
                    .getTeam(identOf.player)
                    .active.revealAbility(from.name);
            } else {
                // Self-inflicted ability.
                mon.revealAbility(from.name);
            }
        } else if (from.type === "item") {
            // Item effect causes self-inflicted status (e.g. flameorb).
            mon.setItem(from.name);
        }
    }
    mon.majorStatus.afflict(statusName);
    await consume(ctx);
};
handlersImpl["|-curestatus|"] = async function (ctx) {
    const event = await verify(ctx, "|-curestatus|");
    const [, identStr, statusName] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (!ident.position) {
        ctx.logger.debug("Ignoring bench cure");
        await consume(ctx);
        return;
    }
    const mon = ctx.state.getTeam(ident.player).active;
    if (event.kwArgs.from) {
        const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
        // Self-cure from ability effect.
        if (from.type === "ability") {
            mon.revealAbility(from.name);
        }
    }
    // istanbul ignore if: Should never happen but ok if it does.
    if (mon.majorStatus.current !== statusName) {
        ctx.logger.error(
            "Mismatched major status: " +
                `Expected ${mon.majorStatus.current} but got ${statusName}`,
        );
    }
    mon.majorStatus.cure();
    await consume(ctx);
};
handlersImpl["|-cureteam|"] = async function (ctx) {
    const event = await verify(ctx, "|-cureteam|");
    const [, identStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    ctx.state.getTeam(ident.player).cure();
    await consume(ctx);
};
handlersImpl["|-boost|"] = async function (ctx) {
    await handleBoost(ctx);
};
handlersImpl["|-unboost|"] = async function (ctx) {
    await handleBoost(ctx, true /*flip*/);
};
async function handleBoost(ctx: BattleParserContext, flip?: boolean) {
    const event = await verify(ctx, flip ? "|-unboost|" : "|-boost|");
    const [, identStr, stat, numStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const num = Number(numStr);
    if (isNaN(num)) {
        throw new Error(`Invalid ${flip ? "un" : ""}boost num '${numStr}'`);
    }
    const mon = ctx.state.getTeam(ident.player).active;
    const oldBoost = mon.volatile.boosts[stat];
    const newBoost = oldBoost + (flip ? -num : num);
    // Boost is capped at 6.
    mon.volatile.boosts[stat] = Math.max(-6, Math.min(newBoost, 6));
    await consume(ctx);
}
handlersImpl["|-setboost|"] = async function (ctx) {
    const event = await verify(ctx, "|-setboost|");
    const [, identStr, stat, numStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const num = Number(numStr);
    if (isNaN(num)) {
        throw new Error(`Invalid setboost num '${numStr}'`);
    }
    ctx.state.getTeam(ident.player).active.volatile.boosts[stat] = num;
    await consume(ctx);
};
handlersImpl["|-swapboost|"] = async function (ctx) {
    const event = await verify(ctx, "|-swapboost|");
    const [, identStr1, identStr2, statsStr] = event.args;
    const ident1 = Protocol.parsePokemonIdent(identStr1);
    const ident2 = Protocol.parsePokemonIdent(identStr2);
    const stats = (statsStr?.split(", ") ?? dex.boostKeys) as BoostID[];

    const boosts1 = ctx.state.getTeam(ident1.player).active.volatile.boosts;
    const boosts2 = ctx.state.getTeam(ident2.player).active.volatile.boosts;

    for (const stat of stats) {
        [boosts1[stat], boosts2[stat]] = [boosts2[stat], boosts1[stat]];
    }

    await consume(ctx);
};
handlersImpl["|-invertboost|"] = async function (ctx) {
    const event = await verify(ctx, "|-invertboost|");
    const [, identStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);

    const {boosts} = ctx.state.getTeam(ident.player).active.volatile;
    for (const stat of dex.boostKeys) {
        boosts[stat] = -boosts[stat];
    }

    await consume(ctx);
};
handlersImpl["|-clearboost|"] = async function (ctx) {
    const event = await verify(ctx, "|-clearboost|");
    const [, identStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);

    const {boosts} = ctx.state.getTeam(ident.player).active.volatile;
    for (const stat of dex.boostKeys) {
        boosts[stat] = 0;
    }

    await consume(ctx);
};
handlersImpl["|-clearallboost|"] = async function (ctx) {
    await verify(ctx, "|-clearallboost|");

    for (const sideId in ctx.state.teams) {
        // istanbul ignore if
        if (!Object.hasOwnProperty.call(ctx.state.teams, sideId)) {
            continue;
        }
        const team = ctx.state.tryGetTeam(sideId as SideID);
        // istanbul ignore if: Can't reproduce.
        if (!team) {
            continue;
        }
        const {boosts} = team.active.volatile;
        for (const stat of dex.boostKeys) {
            boosts[stat] = 0;
        }
    }

    await consume(ctx);
};
handlersImpl["|-clearpositiveboost|"] = async function (ctx) {
    const event = await verify(ctx, "|-clearpositiveboost|");
    const [, identStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);

    const {boosts} = ctx.state.getTeam(ident.player).active.volatile;
    for (const stat of dex.boostKeys) {
        if (boosts[stat] > 0) {
            boosts[stat] = 0;
        }
    }

    await consume(ctx);
};
handlersImpl["|-clearnegativeboost|"] = async function (ctx) {
    const event = await verify(ctx, "|-clearnegativeboost|");
    const [, identStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);

    const {boosts} = ctx.state.getTeam(ident.player).active.volatile;
    for (const stat of dex.boostKeys) {
        if (boosts[stat] < 0) {
            boosts[stat] = 0;
        }
    }

    await consume(ctx);
};
handlersImpl["|-copyboost|"] = async function (ctx) {
    const event = await verify(ctx, "|-copyboost|");
    const [, identStr1, identStr2, statsStr] = event.args;
    const ident1 = Protocol.parsePokemonIdent(identStr1);
    const ident2 = Protocol.parsePokemonIdent(identStr2);
    const stats = (statsStr?.split(", ") ?? dex.boostKeys) as BoostID[];

    const boosts1 = ctx.state.getTeam(ident1.player).active.volatile.boosts;
    const boosts2 = ctx.state.getTeam(ident2.player).active.volatile.boosts;
    for (const stat of stats) {
        boosts2[stat] = boosts1[stat];
    }

    await consume(ctx);
};
handlersImpl["|-weather|"] = async function (ctx) {
    const event = await verify(ctx, "|-weather|");
    const [, weatherStr] = event.args;
    if (event.kwArgs.upkeep) {
        // istanbul ignore if: Should never happen.
        if (ctx.state.status.weather.type !== weatherStr) {
            ctx.logger.error(
                "Weather is " +
                    `'${ctx.state.status.weather.type}' but ticked weather ` +
                    `is '${weatherStr}', ignoring`,
            );
        }
        ctx.state.status.weather.tick();
    } else if (weatherStr === "none") {
        ctx.state.status.weather.reset();
    } else {
        // Note(gen4): Ability-caused weather has infinite duration.
        let infinite: boolean | undefined;
        const effect = Protocol.parseEffect(event.kwArgs.from, toIdName);
        if (effect.type === "ability") {
            // Infer ability.
            if (event.kwArgs.of) {
                const of = Protocol.parsePokemonIdent(event.kwArgs.of);
                ctx.state.getTeam(of.player).active.revealAbility(effect.name);
            }
            infinite = true;
        }
        ctx.state.status.weather.start(weatherStr as dex.WeatherType, infinite);
    }
    await consume(ctx);
};
handlersImpl["|-fieldstart|"] = async function (ctx) {
    await updateFieldEffect(ctx, true /*start*/);
};
handlersImpl["|-fieldend|"] = async function (ctx) {
    await updateFieldEffect(ctx, false /*start*/);
};
async function updateFieldEffect(ctx: BattleParserContext, start: boolean) {
    const event = await verify(ctx, start ? "|-fieldstart|" : "|-fieldend|");
    const [, effectStr] = event.args;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    switch (effect.name) {
        case "gravity":
            ctx.state.status.gravity[start ? "start" : "end"]();
            break;
        case "trickroom":
            ctx.state.status.trickroom[start ? "start" : "end"]();
            break;
    }
    await consume(ctx);
}
handlersImpl["|-sidestart|"] = async function (ctx) {
    await handleSideCondition(ctx, true /*start*/);
};
handlersImpl["|-sideend|"] = async function (ctx) {
    await handleSideCondition(ctx, false /*start*/);
};
async function handleSideCondition(ctx: BattleParserContext, start: boolean) {
    const event = await verify(ctx, start ? "|-sidestart|" : "|-sideend|");
    const [, sideStr, effectStr] = event.args;
    // Note: parsePokemonIdent() supports side identifiers.
    const side = Protocol.parsePokemonIdent(
        sideStr as unknown as Protocol.PokemonIdent,
    ).player;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    const ts = ctx.state.getTeam(side).status;
    switch (effect.name) {
        case "lightscreen":
        case "luckychant":
        case "mist":
        case "reflect":
        case "safeguard":
        case "tailwind":
            ts[effect.name][start ? "start" : "end"]();
            break;
        case "spikes":
            if (start) {
                ++ts.spikes;
            } else {
                ts.spikes = 0;
            }
            break;
        case "stealthrock":
            if (start) {
                ++ts.stealthrock;
            } else {
                ts.stealthrock = 0;
            }
            break;
        case "toxicspikes":
            if (start) {
                ++ts.toxicspikes;
            } else {
                ts.toxicspikes = 0;
            }
            break;
    }
    await consume(ctx);
}
handlersImpl["|-swapsideconditions|"] = "unsupported";
handlersImpl["|-start|"] = async function (ctx) {
    const event = await verify(ctx, "|-start|");
    const [, identStr, effectStr, other] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const effect = Protocol.parseEffect(effectStr, toIdName);
    const mon = ctx.state.getTeam(ident.player).active;

    if (event.kwArgs.from) {
        const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
        if (from.type === "ability") {
            // Here the [of] suffix refers to ability holder in all cases (e.g.
            // cutecharm).
            if (event.kwArgs.of) {
                const identOf = Protocol.parsePokemonIdent(event.kwArgs.of);
                ctx.state
                    .getTeam(identOf.player)
                    .active.revealAbility(from.name);
            } else {
                // Otherwise it's a self-inflicted status (e.g. colorchange).
                mon.revealAbility(from.name);
            }
        }
    }
    switch (effect.name) {
        case "flashfire":
            mon.volatile.flashfire = true;
            // Self-inflicted status via ability.
            mon.revealAbility("flashfire");
            break;
        case "typechange":
            // Set types.
            // Format: |-start|<ident>|typechange|Type1/Type2
            if (other) {
                const types = other.split("/").map(toIdName) as dex.Type[];
                if (types.length > 2) {
                    ctx.logger.error(`Too many types given: '${other}'`);
                    types.splice(2);
                } else if (types.length === 1) {
                    types.push("???");
                }
                mon.volatile.types = types as [dex.Type, dex.Type];
            } else {
                mon.volatile.types = ["???", "???"];
            }
            break;
        default:
            if (effect.name.startsWith("perish")) {
                mon.volatile.perish = parseInt(
                    effect.name.substring("perish".length),
                    10,
                );
            } else if (effect.name.startsWith("stockpile")) {
                mon.volatile.stockpile = parseInt(
                    effect.name.substring("stockpile".length),
                    10,
                );
            } else {
                handleStartEndTrivial(
                    ctx,
                    event,
                    ident.player,
                    effect.name,
                    other,
                );
            }
    }
    await consume(ctx);
};
handlersImpl["|-end|"] = async function (ctx) {
    const event = await verify(ctx, "|-end|");
    const [, identStr, effectStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const effect = Protocol.parseEffect(effectStr, toIdName);
    const v = ctx.state.getTeam(ident.player).active.volatile;
    switch (effect.name) {
        case "stockpile":
            v.stockpile = 0;
            break;
        default:
            handleStartEndTrivial(ctx, event, ident.player, effect.name);
    }
    await consume(ctx);
};
function handleStartEndTrivial(
    ctx: BattleParserContext,
    event: Event<"|-start|" | "|-end|">,
    side: SideID,
    effectId: string,
    other?: string,
) {
    const team = ctx.state.getTeam(side);
    const mon = team.active;
    const v = mon.volatile;
    const start = event.args[0] === "-start";
    switch (effectId) {
        case "aquaring":
        case "attract":
        case "curse":
        case "focusenergy":
        case "imprison":
        case "ingrain":
        case "leechseed":
        case "mudsport":
        case "nightmare":
        case "powertrick":
        case "substitute":
        case "torment":
        case "watersport":
            v[effectId] = start;
            break;
        case "bide":
        case "confusion":
        case "embargo":
        case "healblock":
        case "magnetrise":
        case "slowstart":
        case "taunt":
        case "uproar":
        case "yawn":
            if (start) {
                if (effectId === "confusion") {
                    if ((event as Event<"|-start|">).kwArgs.fatigue) {
                        v.rampage.reset();
                    }
                } else if (effectId === "slowstart") {
                    mon.revealAbility("slowstart");
                } else if (effectId === "uproar") {
                    if ((event as Event<"|-start|">).kwArgs.upkeep) {
                        v.uproar.tick();
                        break;
                    }
                }
            }
            v[effectId][start ? "start" : "end"]();
            break;
        case "disable":
            if (start) {
                // istanbul ignore if: Should never happen.
                if (!other) {
                    ctx.logger.error("Disable without move");
                    break;
                }
                v.disableMove(toIdName(other));
            } else {
                v.enableMoves();
            }
            break;
        case "encore":
            if (start) {
                // istanbul ignore if: Should never happen.
                if (!v.lastMove) {
                    ctx.logger.error("Encore with no lastMove for context");
                    break;
                }
                v.encoreMove(v.lastMove);
            } else {
                v.removeEncore();
            }
            break;
        case "foresight":
        case "miracleeye":
            v.identified = start ? effectId : null;
            break;
        default:
            if (dex.isFutureMove(effectId)) {
                if (start) {
                    team.status.futureMoves[effectId].start(true /*noRestart*/);
                } else {
                    // Target is mentioned on -end.
                    const sourceTeam = ctx.state.getTeam(
                        side === "p1" ? "p2" : "p1",
                    );
                    sourceTeam.status.futureMoves[effectId].end();
                }
            } else {
                ctx.logger.debug(
                    `Ignoring ${start ? "start" : "end"} '${effectId}'`,
                );
            }
    }
}
handlersImpl["|-crit|"] = "default";
handlersImpl["|-supereffective|"] = "default";
handlersImpl["|-resisted|"] = "default";
handlersImpl["|-immune|"] = async function (ctx) {
    const event = await verify(ctx, "|-immune|");
    if (event.kwArgs.from) {
        const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
        if (from.type === "ability") {
            const [, identStr] = event.args;
            const ident = Protocol.parsePokemonIdent(identStr);
            const mon = ctx.state.getTeam(ident.player).active;
            mon.revealAbility(from.name);
        }
    }
    await consume(ctx);
};
handlersImpl["|-item|"] = async function (ctx) {
    const event = await verify(ctx, "|-item|");
    const [, identStr, itemName] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const itemId = toIdName(itemName);

    const mon = ctx.state.getTeam(ident.player).active;
    if (event.kwArgs.from) {
        const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
        if (from.name === "recycle") {
            mon.recycle(itemId);
        } else if (from.name === "frisk") {
            mon.setItem(itemId);
            // istanbul ignore if: Should never happen.
            if (!event.kwArgs.of) {
                ctx.logger.error("Frisk with no holder");
            } else {
                const holderIdent = Protocol.parsePokemonIdent(event.kwArgs.of);
                ctx.state
                    .getTeam(holderIdent.player)
                    .active.revealAbility("frisk");
            }
        } else {
            // TODO: Other effects?
            mon.setItem(itemId);
        }
    } else {
        // Most other unsupported effects are handled as if the item was gained.
        mon.setItem(itemId);
    }
    await consume(ctx);
};
handlersImpl["|-enditem|"] = async function (ctx) {
    const event = await verify(ctx, "|-enditem|");

    // Resist berry effect should already be handled by previous
    // |-enditem|...|[eat] event.
    if (event.kwArgs.weaken) {
        await consume(ctx);
        return;
    }

    const [, identStr, itemName] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const itemId = toIdName(itemName);
    const mon = ctx.state.getTeam(ident.player).active;

    // Item-removal and steal-eat moves effectively delete the item.
    let consumed: boolean | string;
    if (event.kwArgs.from || event.kwArgs.move || event.kwArgs.of) {
        consumed = false;
    } else if (event.kwArgs.eat) {
        // Eating a berry item.
        consumed = itemId;
    } else {
        // In most other cases (TODO?) the item can be restored via Recycle.
        consumed = itemId;
    }

    // Must be consuming the status, not the actual berry.
    if (itemId === "micleberry" && !event.kwArgs.eat && consumed) {
        mon.volatile.micleberry = false;
        await consume(ctx);
        return;
    }

    mon.removeItem(consumed);
    await consume(ctx);
};
handlersImpl["|-ability|"] = async function (ctx) {
    const event = await verify(ctx, "|-ability|");
    const [, identStr, abilityStr] = event.args;
    const abilityId = toIdName(abilityStr);
    const ident = Protocol.parsePokemonIdent(identStr);
    const holder = ctx.state.getTeam(ident.player).active;

    if (event.kwArgs.from) {
        const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
        // Ability was copied via trace.
        // Here, abilityId refers to the copied ability and event.kwArgs.of
        // refers to the target whose ability was copied.
        if (from.name === "trace") {
            // istanbul ignore if: Should never happen.
            if (!event.kwArgs.of) {
                ctx.logger.error("Trace ability mentioned but no target");
            } else {
                // Reveal target's ability that was copied.
                const identOf = Protocol.parsePokemonIdent(event.kwArgs.of);
                const target = ctx.state.getTeam(identOf.player).active;
                target.revealAbility(abilityId);
            }
            // Reveal actual activated ability, then set temporary override
            // ability.
            // Note that in gen4 the copied ability may have activated before
            // this event so here we can correct that.
            holder.revealAbility("trace");
        }
        // Other ability-overriding effects (e.g. worryseed) also display a
        // related [from] suffix.
        holder.setAbility(abilityId);
    } else {
        // Assume ability activation without context.
        holder.revealAbility(abilityId);
    }

    await consume(ctx);
};
handlersImpl["|-endability|"] = async function (ctx) {
    const event = await verify(ctx, "|-endability|");
    const [, identStr, abilityName] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const mon = ctx.state.getTeam(ident.player).active;
    // Reveal ability if specified.
    if (abilityName && abilityName !== "none") {
        const abilityId = toIdName(abilityName);
        if (event.kwArgs.from) {
            const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
            // Swap abilities with opponent (temporary override effect).
            // TODO(doubles): Track actual skillswap source/target.
            if (from.name === "skillswap") {
                // Note: Uses some internal fields to track the swapped
                // abilities.
                mon.revealAbility(abilityId, true /*skillswap*/);
                const opp = ctx.state.getTeam(
                    ident.player === "p1" ? "p2" : "p1",
                ).active;
                opp.setAbility(abilityId, true /*skillswap*/);
            } else {
                mon.revealAbility(abilityId);
            }
            // Other effects which cause this event usually override the ability
            // with a separate event right after this.
            await consume(ctx);
            return;
        }
        mon.revealAbility(abilityId);
    }
    // Assume gastroacid move effect without context.
    mon.volatile.suppressAbility = true;
    await consume(ctx);
};
handlersImpl["|-transform|"] = async function (ctx) {
    const event = await verify(ctx, "|-transform|");
    const [, identSourceStr, identTargetStr] = event.args;
    const identSource = Protocol.parsePokemonIdent(identSourceStr);
    const identTarget = Protocol.parsePokemonIdent(identTargetStr);
    ctx.state
        .getTeam(identSource.player)
        .active.transform(ctx.state.getTeam(identTarget.player).active);
    await consume(ctx);
};
handlersImpl["|-mega|"] = "unsupported";
handlersImpl["|-primal|"] = "unsupported";
handlersImpl["|-burst|"] = "unsupported";
handlersImpl["|-zpower|"] = "unsupported";
handlersImpl["|-zbroken|"] = "unsupported";
handlersImpl["|-activate|"] = async function (ctx) {
    const event = await verify(ctx, "|-activate|");
    const [, identStr, effectStr, other1, other2] = event.args;
    if (!identStr) {
        await consume(ctx);
        return;
    }
    const ident = Protocol.parsePokemonIdent(identStr);
    const team = ctx.state.getTeam(ident.player);
    const mon = team.active;
    const effect = Protocol.parseEffect(effectStr, toIdName);
    // Ability activation.
    if (effect.type === "ability") {
        mon.revealAbility(effect.name);
    }
    const v = mon.volatile;
    switch (effect.name) {
        case "bide":
        case "confusion":
            v[effect.name].tick();
            break;
        case "charge":
            v.charge.start();
            break;
        case "detect":
        case "protect":
            // Protect resets rampage counter for the move user.
            ctx.state
                .getTeam(ident.player === "p1" ? "p2" : "p1")
                .active.volatile.rampage.reset();
            break;
        // Effect was used to block another effect, no further action needed.
        case "endure":
        case "mist":
        case "safeguard":
        case "substitute":
            // istanbul ignore if: Should never happen.
            if (effect.name === "substitute" && !v.substitute) {
                ctx.logger.error(
                    "Substitute blocked an effect but no Substitute exists",
                );
            }
            break;
        case "feint":
            v.feint();
            break;
        case "forewarn": {
            // Reveal opponent's strongest move.
            mon.revealAbility("forewarn");
            // istanbul ignore if: Should never happen.
            if (!other1) {
                ctx.logger.error("Forewarn without move");
                break;
            }
            // Reveal move for opponent.
            const warnMoveId = toIdName(other1);
            const targetSide = event.kwArgs.of
                ? Protocol.parsePokemonIdent(event.kwArgs.of).player
                : ident.player === "p1"
                ? "p2"
                : "p1";
            const opp = ctx.state.getTeam(targetSide).active;
            opp.moveset.reveal(warnMoveId);

            // Rule out moves stronger than the revealed one.
            const bp = getForewarnPower(warnMoveId);
            const strongerMoves = [...opp.moveset.constraint].filter(
                m => getForewarnPower(m) > bp,
            );
            opp.moveset.inferDoesntHave(strongerMoves);
            break;
        }
        case "grudge":
            // istanbul ignore if: Should never happen.
            if (!other1) {
                ctx.logger.error("Grudge without move");
                break;
            }
            mon.moveset.reveal(toIdName(other1)).pp = 0;
            break;
        case "healbell":
            team.cure();
            break;
        case "leppaberry":
            // istanbul ignore if: Should never happen.
            if (!other1) {
                ctx.logger.error("Leppaberry without move");
                break;
            }
            mon.moveset.reveal(toIdName(other1)).pp += 10;
            break;
        case "lockon":
        case "mindreader": {
            // Activate effect from other side or specified target.
            const targetSide = event.kwArgs.of
                ? Protocol.parsePokemonIdent(event.kwArgs.of).player
                : ident.player === "p1"
                ? "p2"
                : "p1";
            v.lockOn(ctx.state.getTeam(targetSide).active.volatile);
            break;
        }
        case "mimic": {
            // istanbul ignore if: Should never happen.
            if (!other1) {
                ctx.logger.error("Mimic without move");
                break;
            }
            // Note(gen4): Sketch/mimic events are identical on PS, have to look
            // at the previous |move| event (or just lastMove as a heuristic) to
            // determine the move.
            // istanbul ignore if: Should never happen.
            if (!v.lastMove) {
                ctx.logger.error(
                    "Don't know how Sketch/Mimic effect was caused",
                );
                break;
            }
            if (v.lastMove === "mimic") {
                mon.mimic(toIdName(other1));
            } else if (v.lastMove === "sketch") {
                mon.sketch(toIdName(other1));
            } else {
                // istanbul ignore next: Should never happen.
                ctx.logger.error(`Unknown Mimic-like move '${v.lastMove}'`);
            }
            break;
        }
        case "pursuit":
            // Switch is being interrupted by Pursuit, reveal move for the user
            // before the actual |move| event in case the move can't actually be
            // used.
            ctx.state
                .getTeam(ident.player === "p1" ? "p2" : "p1")
                .active.moveset.reveal("pursuit");
            break;
        case "snatch":
            // Consume Snatch move status.
            // Note: [of] suffix specifies target whose move effect was stolen.
            mon.volatile.snatch = false;
            break;
        case "spite": {
            // istanbul ignore if: Should never happen.
            if (!other1 || !other2) {
                ctx.logger.error("Spite without move/pp");
                break;
            }
            const amount = Number(other2);
            // istanbul ignore if: Should never happen.
            if (isNaN(amount) || !isFinite(amount)) {
                ctx.logger.error(`Spite with invalid amount '${other2}'`);
                break;
            }
            mon.moveset.reveal(toIdName(other1)).pp -= amount;
            break;
        }
        case "trapped":
            ctx.state
                .getTeam(ident.player === "p1" ? "p2" : "p1")
                .active.volatile.trap(v);
            break;
        default:
            ctx.logger.debug(`Ignoring activate '${effect.name}'`);
    }
    await consume(ctx);
};
function getForewarnPower(move: string): number {
    const data = dex.moves[move];
    // OHKO moves.
    if (data.ohko) {
        return 160;
    }
    // Counter moves.
    if (["counter", "mirrorcoat", "metalburst"].includes(data.name)) {
        return 120;
    }
    // Other fixed-damage/variable-power moves (hiddenpower, lowkick, etc).
    if (!data.basePower && data.category !== "status") {
        return 80;
    }
    // Regular base power, eruption/waterspout, and status moves.
    return data.basePower;
}
handlersImpl["|-fieldactivate|"] = "default";
handlersImpl["|-center|"] = "unsupported";
handlersImpl["|-combine|"] = "unsupported";
handlersImpl["|-waiting|"] = "unsupported";
handlersImpl["|-prepare|"] = async function (ctx) {
    const event = await verify(ctx, "|-prepare|");
    const [, identStr, moveName] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const moveId = toIdName(moveName);
    if (!dex.isTwoTurnMove(moveId)) {
        ctx.logger.error(`Move '${moveId}' is not a two-turn move`);
    } else {
        ctx.state.getTeam(ident.player).active.volatile.twoTurn.start(moveId);
    }
    await consume(ctx);
};
handlersImpl["|-mustrecharge|"] = async function (ctx) {
    const event = await verify(ctx, "|-mustrecharge|");
    const [, identStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    ctx.state.getTeam(ident.player).active.volatile.mustRecharge = true;
    await consume(ctx);
};
handlersImpl["|-hitcount|"] = "default";
handlersImpl["|-singlemove|"] = async function (ctx) {
    const event = await verify(ctx, "|-singlemove|");
    const [, identStr, moveName] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const v = ctx.state.getTeam(ident.player).active.volatile;
    switch (moveName) {
        case "Destiny Bond":
            v.destinybond = true;
            break;
        case "Grudge":
            v.grudge = true;
            break;
        case "Rage":
            v.rage = true;
            break;
    }
    await consume(ctx);
};
handlersImpl["|-singleturn|"] = async function (ctx) {
    const event = await verify(ctx, "|-singleturn|");
    const [, identStr, effectStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    const effect = Protocol.parseEffect(effectStr, toIdName);
    const v = ctx.state.getTeam(ident.player).active.volatile;
    switch (effect.name) {
        case "endure":
        case "protect":
            v.stall(true /*flag*/);
            break;
        case "focuspunch":
            v.focus = true;
            break;
        case "magiccoat":
            v.magiccoat = true;
            break;
        case "roost":
            v.roost = true;
            break;
        case "snatch":
            v.snatch = true;
            break;
    }
    await consume(ctx);
};
handlersImpl["|-candynamax|"] = "unsupported";
handlersImpl["|updatepoke|"] = "unsupported";

/** Handlers for all {@link Protocol.ArgName event types}. */
export const handlers =
    // This Object.assign expression is so that the function names appear as if
    // they were defined directly as properties of this object so that stack
    // traces make more sense.
    Object.assign(
        {},
        handlersImpl,
        // Fill in unimplemented handlers.
        ...(Object.keys(Protocol.ARGS) as Protocol.ArgName[]).map(key =>
            !Object.hasOwnProperty.call(handlersImpl, key) ||
            handlersImpl[key] === "default"
                ? {
                      // Default parser just consumes the event.
                      // Note: This is used even if the key was never mentioned
                      // in this file.
                      async [key](ctx: BattleParserContext) {
                          await defaultParser(ctx, key);
                      },
                  }
                : handlersImpl[key] === "unsupported"
                ? {
                      // Unsupported parser throws an error.
                      async [key](ctx: BattleParserContext) {
                          await unsupportedParser(ctx, key);
                      },
                  }
                : // Handler already implemented, don't override it.
                  undefined,
        ),
    ) as Required<HandlerMap>;

async function defaultParser(ctx: BattleParserContext, key: Protocol.ArgName) {
    await verify(ctx, key);
    await consume(ctx);
}

async function unsupportedParser(
    ctx: BattleParserContext,
    key: Protocol.ArgName,
) {
    await verify(ctx, key);
    ctx.logger.error(`Unsupported event type: ${key}`);
    await consume(ctx);
}

/** Dispatches base event handler. */
export const dispatch = dispatcher(handlers);
