/** @file Parsers and helper functions related to stat boost events. */
import {Protocol} from "@pkmn/protocol";
import {BoostID, SideID} from "@pkmn/types";
import {Event} from "../../../../../../parser";
import {BattleParserContext, eventLoop, tryVerify} from "../../../../parser";
import * as unordered from "../../../../parser/unordered";
import * as dex from "../../dex";
import {dispatch, handlers as base} from "../base";
import * as effectAbility from "./ability";

/** Args for {@link boost}. */
export interface BoostArgs {
    /** Pokemon reference receiving the boosts. */
    readonly side: SideID;
    /** Boosts to apply. This is the same object that gets returned. */
    readonly table: Map<BoostID, number>;
    /** Whether to ignore boosts that can't be applied. Default `false`.  */
    readonly silent?: boolean;
    /**
     * Optional additional custom check on the event before it can be parsed.
     *
     * @returns `false` if the event shouldn't be parsed, `true` otherwise.
     */
    readonly pred?: (
        event: Event<"|-boost|" | "|-unboost|" | "|-setboost|">,
    ) => boolean;
}

/**
 * Parses a boost/unboost effect.
 *
 * @param args Information about the boosts to apply.
 * @returns The boosts that weren't parsed.
 */
export async function boost(
    ctx: BattleParserContext<"gen4">,
    args: BoostArgs,
): Promise<Map<BoostID, number>> {
    const mon = ctx.state.getTeam(args.side).active;

    await eventLoop(ctx, async function boostLoop(_ctx) {
        const event = await tryVerify(_ctx, "|-boost|", "|-unboost|");
        if (!event) return;
        const [, identStr, boostId, boostAmountStr] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== args.side) return;
        if (!args.table.has(boostId)) return;
        let boostAmount = Number(boostAmountStr);
        if (event.args[0] === "-unboost") boostAmount = -boostAmount;
        if (
            !matchBoost(
                args.table.get(boostId)!,
                boostAmount,
                mon.volatile.boosts[boostId],
            )
        ) {
            return;
        }
        if (args.pred && !args.pred(event)) return;
        args.table.delete(boostId);
        await dispatch(ctx);
    });

    if (args.silent) {
        // Remove boosts that were already at their limit.
        consumeBoosts(args.table, boostId =>
            matchBoost(
                args.table.get(boostId)!,
                0,
                mon.volatile.boosts[boostId],
            ),
        );
    }

    return args.table;
}

/**
 * Checks if the boost amounts are suitable.
 *
 * @param pending Pending boost amount.
 * @param given Given boost amount from a `|-boost|`/`|-unboost|` event.
 * @param current Pokemon's current boost amount.
 */
export function matchBoost(
    pending: number,
    given: number,
    current: number,
): boolean {
    // Boost amount that will be set.
    const next = Math.max(-6, Math.min(current + given, 6));
    // Boost amount that we expected.
    const expected = Math.max(-6, Math.min(current + pending, 6));
    return next === expected;
}

/**
 * Parses a set-boost effect.
 *
 * @param args Information about the boosts to apply.
 * @returns The boosts that weren't parsed.
 */
export async function setBoost(
    ctx: BattleParserContext<"gen4">,
    args: BoostArgs,
): Promise<Map<BoostID, number>> {
    const mon = ctx.state.getTeam(args.side).active;

    await eventLoop(ctx, async function setBoostLoop(_ctx) {
        const event = await tryVerify(_ctx, "|-setboost|");
        if (!event) return;
        const [, identStr, boostId, boostAmountStr] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== args.side) return;
        if (!args.table.has(boostId)) return;
        const boostAmount = Number(boostAmountStr);
        if (args.table.get(boostId)! !== boostAmount) return;
        if (args.pred && !args.pred(event)) return;
        args.table.delete(boostId);
        await base["|-setboost|"](_ctx);
    });

    if (args.silent) {
        // Remove boosts that were already set to the expected amount.
        consumeBoosts(
            args.table,
            boostId => args.table.get(boostId) === mon.volatile.boosts[boostId],
        );
    }

    return args.table;
}

/** Removes keys that satisfy the predicate. */
function consumeBoosts(
    table: Map<BoostID, number>,
    pred: (boostId: BoostID) => boolean,
): void {
    for (const boostId of table.keys()) {
        if (!pred(boostId)) continue;
        table.delete(boostId);
    }
}

/**
 * Parses a boost/unboost effect for one stat.
 *
 * @param args Information about the boosts to apply.
 * @returns The boost that was parsed, or `"silent"` if no boosts could be
 * applied and `args.silent=true`. Otherwise `undefined` if the next event is
 * invalid.
 */
export async function boostOne(
    ctx: BattleParserContext<"gen4">,
    args: BoostArgs,
): Promise<"silent" | BoostID | undefined> {
    const mon = ctx.state.getTeam(args.side).active;
    if (args.silent) {
        // Verify that all the possible boosts were already maxed out.
        let allMaxed = true;
        for (const possibleBoostId of args.table.keys()) {
            if (
                !matchBoost(
                    args.table.get(possibleBoostId)!,
                    0,
                    mon.volatile.boosts[possibleBoostId],
                )
            ) {
                allMaxed = false;
                break;
            }
        }
        if (allMaxed) return "silent";
        // Otherwise, try to match one of the remaining boosts below.
    }

    const event = await tryVerify(ctx, "|-boost|", "|-unboost|");
    if (!event) return;
    const [, identStr, boostId, boostAmountStr] = event.args;
    const ident = Protocol.parsePokemonIdent(identStr);
    if (ident.player !== args.side) return;
    if (!args.table.has(boostId)) return;
    let boostAmount = Number(boostAmountStr);
    if (event.args[0] === "-unboost") boostAmount = -boostAmount;
    if (
        !matchBoost(
            args.table.get(boostId)!,
            boostAmount,
            mon.volatile.boosts[boostId],
        )
    ) {
        return;
    }
    if (args.pred && !args.pred(event)) return;
    await dispatch(ctx);
    return boostId;
}

export interface BoostBlockableArgs extends BoostArgs {
    /** Pokemon reference that is the source of the boost effect. */
    readonly source: SideID;
}

/**
 * Parses a boost/unboost effect that can be blocked by an on-`tryUnboost`
 * ability (e.g. Clear Body).
 *
 * Should only be called with different {@link BoostArgs.side `args.side`} amd
 * {@link BoostBlockableArgs.source `args.source`} values.
 *
 * @param args Information about the boosts to apply.
 * @returns The boosts that weren't parsed.
 */
export async function boostBlockable(
    ctx: BattleParserContext<"gen4">,
    args: BoostBlockableArgs,
): Promise<Map<BoostID, number>> {
    const mon = ctx.state.getTeam(args.side).active;
    const source = ctx.state.getTeam(args.source).active;

    let blocked = false;
    await eventLoop(ctx, async function boostBlockableLoop(_ctx) {
        const event = await tryVerify(_ctx, "|-boost|", "|-unboost|");
        if (!event) {
            if (blocked) return;
            // If no boost event, maybe it was blocked.
            const blockRes = await unordered.parse(
                ctx,
                effectAbility.onTryUnboost(
                    ctx,
                    args.side,
                    source,
                    Object.fromEntries(args.table),
                ),
                () => (blocked = true),
            );
            if (blocked && blockRes[0]) {
                for (const b in blockRes[0]) {
                    if (!Object.hasOwnProperty.call(blockRes[0], b)) {
                        continue;
                    }
                    if (!args.table.has(b as dex.BoostName)) continue;
                    args.table.delete(b as dex.BoostName);
                }
            }
            return;
        }
        // Otherwise parse the boost events normally.
        const [, identStr, boostId, boostAmountStr] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== args.side) return;
        if (!args.table.has(boostId)) return;
        let boostAmount = Number(boostAmountStr);
        if (event.args[0] === "-unboost") boostAmount = -boostAmount;
        if (
            !matchBoost(
                args.table.get(boostId)!,
                boostAmount,
                mon.volatile.boosts[boostId],
            )
        ) {
            return;
        }
        if (args.pred && !args.pred(event)) return;
        args.table.delete(boostId);
        await dispatch(ctx);
    });

    if (args.silent) {
        // Remove boosts that were already at their limit.
        consumeBoosts(args.table, boostId =>
            matchBoost(
                args.table.get(boostId)!,
                0,
                mon.volatile.boosts[boostId],
            ),
        );
    }

    return args.table;
}
