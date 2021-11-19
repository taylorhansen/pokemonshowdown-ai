import {Protocol} from "@pkmn/protocol";
import {BoostID, SideID} from "@pkmn/types";
import {BoostName} from "..";
import {toIdName} from "../../../../../../helpers";
import {Event} from "../../../../../../parser";
import {
    BattleParserContext,
    consume,
    inference,
    tryVerify,
    unordered,
} from "../../../../parser";
import {dispatch, handlers as base} from "../../parser/base";
import {boost, boostBlockable, boostOne} from "../../parser/effect/boost";
import {percentDamage} from "../../parser/effect/damage";
import {
    cantStatus,
    cure,
    hasStatus,
    status,
    StatusEventType,
} from "../../parser/effect/status";
import {weather} from "../../parser/effect/weather";
import * as reason from "../../parser/reason";
import {Pokemon, ReadonlyPokemon} from "../../state/Pokemon";
import {getMove} from "../dex";
import {
    Type,
    WeatherType,
    AbilityData,
    AbilityOn,
    BoostTable,
    StatusType,
} from "../dex-util";
import {MoveAndUser, MoveAndUserRef} from "./Move";

/** Result from {@link Ability.onBlock}. */
export interface AbilityBlockResult {
    /** Statuses to block. */
    blockStatus?: {[T in StatusType]?: true};
    /**
     * Whether the ability activated to grant an immunity to the move being used
     * against the holder.
     */
    immune?: true;
    /** Whether the ability caused the move to fail completely. */
    failed?: true;
}

// TODO: Dex data wrappers may need SRP refactoring and/or complete removal.
/** Encapsulates ability properties. */
export class Ability {
    // TODO: Eventually make #data inaccessible apart from internal dex.
    /**
     * Creates an Ability data wrapper.
     *
     * @param data Ability data from dex.
     */
    public constructor(public readonly data: AbilityData) {}

    //#region On-switchOut.

    /**
     * Checks whether the ability can activate on-`switchOut`.
     *
     * @param mon Potential ability holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or `null` if it cannot
     * activate.
     */
    public canSwitchOut(mon: ReadonlyPokemon): Set<inference.SubReason> | null {
        return mon.majorStatus.current && this.data.on?.switchOut?.cure
            ? new Set()
            : null;
    }

    /**
     * Activates an ability on-`switchOut`.
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     */
    public async onSwitchOut(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        if (!this.data.on?.switchOut) return;
        // Cure major status.
        if (this.data.on.switchOut.cure) {
            return await this.cureMajorStatus(ctx, accept, side);
        }
    }

    private async cureMajorStatus(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        const event = await tryVerify(ctx, "|-curestatus|");
        if (!event) return;
        const [, identStr] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        // TODO: Provide reasons for failure to parse.
        if (ident.player !== side) return;
        const from = Protocol.parseEffect(event.kwArgs.from, toIdName);
        if (from.type && from.type !== "ability") return;
        if (from.name !== this.data.name) return;
        if (!this.isEventFromAbility(event)) return;
        accept();
        await base["|-curestatus|"](ctx);
    }

    //#endregion

    //#region On-start.

    /**
     * Checks whether the ability can activate on-`start`.
     *
     * @param mon Potential ability holder.
     * @param opp Opponent.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or `null` if it cannot
     * activate.
     */
    public canStart(
        mon: Pokemon,
        opp: Pokemon,
    ): Set<inference.SubReason> | null {
        if (!this.data.on?.start) return null;
        // Anticipation.
        if (this.data.on.start.anticipate) {
            if (opp.fainted) return null;
            // TODO: Support move-type-changing abilities in order to be able to
            // make assertions about move types (e.g. normalize).
            return new Set([reason.chance.create()]);
        }
        if (this.data.on.start.boost) {
            // Download.
            if (this.data.on.start.boost.self) {
                if (this.data.on.start.boost.self === "download") {
                    // Requires an opponent to make the stat inferences.
                    if (opp.fainted) return null;
                }
                return new Set();
            }
            // Intimidate.
            if (this.data.on.start.boost.foes) {
                if (opp.fainted) return null;
                if (opp.volatile.substitute) return null;
                // Note(gen4): Doesn't activate if substitute was broken by
                // uturn this turn and the holder is just now being switched in.
                if (opp.volatile.substituteBroken) {
                    const move = getMove(opp.volatile.substituteBroken);
                    if (move?.data.effects?.selfSwitch) return null;
                }
                return new Set();
            }
        }
        // Frisk.
        if (this.data.on.start.revealItem) {
            if (opp.fainted) return null;
            return new Set([reason.item.hasUnknown(opp)]);
        }
        // Slow Start.
        if (this.data.on.start.status?.self) {
            if (this.data.on.start.status.self.every(s => cantStatus(mon, s))) {
                return null;
            }
            return new Set();
        }
        // Pressure/Mold Breaker.
        if (
            this.data.on.start.extraPpUsage ||
            this.data.on.start.ignoreTargetAbility
        ) {
            return new Set();
        }
        // Forewarn.
        if (this.data.on.start.warnStrongestMove) {
            if (opp.fainted) return null;
            // TODO: Other restrictions?
            return new Set();
        }
        // Drizzle/Drought/Sand Stream/Snow Warning.
        if (this.data.on.start.weather) {
            if (
                mon.team?.state &&
                mon.team.state.status.weather.type ===
                    this.data.on.start.weather
            ) {
                return null;
            }
            return new Set();
        }
        return null;
    }

    /**
     * Activates an ability on-`start`.
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     */
    public async onStart(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        if (!this.data.on?.start) return;
        // Anticipation.
        if (this.data.on.start.anticipate) {
            return await this.anticipate(ctx, accept, side);
        }
        if (this.data.on.start.boost) {
            // Download.
            if (this.data.on.start.boost.self) {
                if (this.data.on.start.boost.self === "download") {
                    // TODO(doubles): Track actual opponents.
                    const otherSide = side === "p1" ? "p2" : "p1";
                    return await this.download(ctx, accept, side, otherSide);
                }
                // TODO(gen>4): Other self-boosting abilties.
                return;
            }
            // Intimidate.
            if (this.data.on.start.boost.foes) {
                const otherSide = side === "p1" ? "p2" : "p1";
                return await this.boostFoe(
                    ctx,
                    accept,
                    side,
                    otherSide,
                    this.data.on.start.boost.foes,
                );
            }
        }
        // Frisk.
        if (this.data.on.start.revealItem) {
            return await this.revealItem(ctx, accept, side);
        }
        // Slow Start.
        if (this.data.on.start.status?.self) {
            await status(ctx, side, this.data.on.start.status.self, event => {
                if (event.args[0] !== "-message") {
                    const e = event as Event<
                        Exclude<StatusEventType, "|-message|">
                    >;
                    if (e.kwArgs.from || e.kwArgs.of) return false;
                }
                accept();
                return true;
            });
            return;
        }
        // Pressure/Mold Breaker.
        if (
            this.data.on.start.extraPpUsage ||
            this.data.on.start.ignoreTargetAbility
        ) {
            return await this.revealAbility(ctx, accept, side);
        }
        // Forewarn.
        if (this.data.on.start.warnStrongestMove) {
            return await this.warnStrongestMove(ctx, accept, side);
        }
        // Drizzle/Drought/Sand Stream/Snow Warning.
        if (this.data.on.start.weather) {
            await this.weather(ctx, accept, side, this.data.on.start.weather);
        }
    }

    /**
     * Handles events due to an anticipate ability (e.g. Anticipation).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     */
    private async anticipate(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        const event = await tryVerify(ctx, "|-ability|");
        if (!event) return;
        const [, identStr, abilityName] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== side) return;
        const ability = Protocol.parseEffect(abilityName, toIdName);
        if (ability.name !== this.data.name) return;
        accept();
        await consume(ctx);
    }

    /**
     * Handles events due to a boosting ability dependent on the opponent's
     * defensive stats (e.g. Download).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param target Target pokemon reference.
     */
    private async download(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        target: SideID,
    ): Promise<void> {
        // Parse initial indicator event.
        if (!(await this.abilityBoost(ctx, accept, side))) return;

        // TODO(#311): Setup stat-based inferences.
        void target;

        // Parse boosts for self.
        if (
            !(await boostOne(ctx, {
                side,
                table: new Map<BoostID, number>([
                    ["atk", 1],
                    ["spa", 1],
                ]),
                pred: e => !e.kwArgs.from && !e.kwArgs.of,
            }))
        ) {
            throw new Error(
                "On-start boost self download effect failed: Missing boost: " +
                    "[{atk: 1}, {spa: 1}]",
            );
        }
    }

    /**
     * Handles events due to a boosting ability (e.g. Intimidate).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param target Target pokemon reference.
     * @param boosts Boosts to apply.
     */
    private async boostFoe(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        target: SideID,
        boosts: Partial<BoostTable>,
    ): Promise<void> {
        // Parse initial indicator event.
        if (!(await this.abilityBoost(ctx, accept, side))) return;

        // Parse boosts for target.
        // TODO(doubles): Multiple targets and Substitute immunity.
        const table = await boostBlockable(ctx, {
            side: target,
            source: side,
            table: new Map<BoostID, number>(
                Object.entries(boosts) as [BoostID, number][],
            ),
            pred: e => !e.kwArgs.from && !e.kwArgs.of,
        });
        if (table.size > 0) {
            throw new Error(
                "On-start boost foes effect failed: Missing boosts: " +
                    `{${[...table].map(([b, v]) => `${b}: ${v}`).join(", ")}}`,
            );
        }
    }

    /**
     * Parses `|-ability|<ident>|<ability>|boost` event.
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @returns Whether the event was successfully parsed.
     */
    private async abilityBoost(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<boolean> {
        const event = await tryVerify(ctx, "|-ability|");
        if (!event) return false;
        const [, identStr, abilityName, effectStr] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== side) return false;
        const abilityId = toIdName(abilityName);
        if (abilityId !== this.data.name) return false;
        const effect = Protocol.parseEffect(effectStr, toIdName);
        if (effect.name !== "boost") return false;
        accept();
        await consume(ctx);
        return true;
    }

    /**
     * Handles events due to a revealItem ability (e.g. Frisk).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     */
    private async revealItem(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        // TODO(doubles): Same event format for each opponent.
        const event = await tryVerify(ctx, "|-item|");
        if (!event) return;
        const [, targetIdentStr, itemName] = event.args;
        const targetIdent = Protocol.parsePokemonIdent(targetIdentStr);
        const itemId = toIdName(itemName);
        if (!this.isEventFromAbility(event)) return;
        if (!event.kwArgs.of) return;
        const holderIdent = Protocol.parsePokemonIdent(event.kwArgs.of);
        if (holderIdent.player !== side) return;
        if (!event.kwArgs.identify) return;

        accept();
        ctx.state.getTeam(targetIdent.player).active.setItem(itemId);
        await consume(ctx);
    }

    /**
     * Handles events due to an ability that just announces itself (e.g.
     * Pressure).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     */
    private async revealAbility(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        // TODO(doubles): Same event format for each opponent.
        const event = await tryVerify(ctx, "|-ability|");
        if (!event) return;
        const [, identStr, abilityName] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== side) return;
        const abilityId = toIdName(abilityName);
        if (abilityId !== this.data.name) return;
        accept();
        await consume(ctx);
    }

    /**
     * Handles events due to a warnStrongestMove ability (e.g. Forewarn).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     */
    public async warnStrongestMove(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        const event = await tryVerify(ctx, "|-activate|");
        if (!event) return;
        const [, identStr, effectStr, warnMoveName] = event.args;
        if (!identStr) return;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== side) return;
        const effect = Protocol.parseEffect(effectStr, toIdName);
        if (effect.type !== "ability") return;
        if (effect.name !== this.data.name) return;
        if (!warnMoveName) return;
        const warnMoveId = toIdName(warnMoveName);
        accept();

        // Reveal move for opponent.
        const targetSide = event.kwArgs.of
            ? Protocol.parsePokemonIdent(event.kwArgs.of).player
            : side === "p1"
            ? "p2"
            : "p1";
        const opp = ctx.state.getTeam(targetSide).active;
        opp.moveset.reveal(warnMoveId);

        // Rule out moves stronger than the revealed one.
        const bp = Ability.getForewarnPower(warnMoveId);
        const strongerMoves = [...opp.moveset.constraint].filter(
            m => Ability.getForewarnPower(m) > bp,
        );
        opp.moveset.inferDoesntHave(strongerMoves);

        await consume(ctx);
    }

    /**
     * Looks up the base power of a move based on how the Forewarn ability
     * evaluates it.
     */
    private static getForewarnPower(move: string): number {
        const data = getMove(move)?.data;
        if (!data) return 0;
        // OHKO moves.
        if (data.damage === "ohko") return 160;
        // Counter moves.
        if (data.damage === "counter" || data.damage === "metalburst") {
            return 120;
        }
        // Fixed damage/variable power moves (hiddenpower, lowkick, etc).
        if (!data.basePower && data.category !== "status") return 80;
        // Regular base power, eruption/waterspout and status moves.
        return data.basePower;
    }

    /**
     * Handles events due to a weather ability (e.g. Drought).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @returns The result from calling the base {@link weather} parser.
     */
    private async weather(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        weatherType: WeatherType,
    ): Promise<true | "silent" | undefined> {
        const mon = ctx.state.getTeam(side).active;
        return await weather(ctx, mon, weatherType, event => {
            if (!this.isEventFromAbility(event)) return false;
            if (event.kwArgs.of) {
                const holderIdent = Protocol.parsePokemonIdent(event.kwArgs.of);
                if (holderIdent.player !== side) return false;
            }
            accept();
            // Note(gen4): Weathers caused by abilities have infinite duration.
            return "infinite";
        });
    }

    //#endregion

    //#region On-block.

    /**
     * Checks whether the ability can activate on-`block` to block some of a
     * move's effects
     *
     * @param weatherType Current weather.
     * @param hitBy Move+user that the holder is being hit by.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or `null` if it cannot
     * activate.
     */
    public canBlock(
        weatherType: WeatherType | "none",
        hitBy: MoveAndUser,
    ): Set<inference.SubReason> | null {
        let res: Set<inference.SubReason> | null = null;

        // Block status due to ability immunity.
        // Note: Only the main status effects can be visibly blocked.
        const statuses = hitBy.move.getMainStatusEffects(
            "hit",
            hitBy.user.types,
        );
        if (
            statuses.some(s =>
                this.canBlockStatus(s, weatherType, /*AllowSilent*/ false),
            )
        ) {
            res ??= new Set();
        }

        // Block move due to ability type immunity.
        if (this.data.on?.block?.move?.type === "nonSuper") {
            // TODO: Type effectiveness assertions/SubReasons.
            (res ??= new Set()).add(reason.chance.create());
        }
        // Side/field status moves don't count.
        // TODO: What about moves with additional effects that target the
        // holder?
        else if (
            hitBy.move.data.category !== "status" ||
            (!hitBy.move.data.effects?.team && !hitBy.move.data.effects?.field)
        ) {
            // Can't activate unless the ability could block one of the move's
            // possible types.
            const moveTypes = hitBy.move.getPossibleTypes(hitBy.user);
            const typeImmunity = this.getTypeImmunity();
            if (typeImmunity && moveTypes.has(typeImmunity)) {
                (res ??= new Set()).add(
                    reason.move.isType(
                        hitBy.move,
                        hitBy.user,
                        new Set([typeImmunity]),
                    ),
                );
            }
        }

        // Damp check.
        if (
            hitBy.move.data.flags?.explosive &&
            this.data.on?.block?.effect?.explosive
        ) {
            res ??= new Set();
        }

        // Moldbreaker check.
        res?.add(reason.ability.cantIgnoreTargetAbility(hitBy.user));
        return res;
    }

    /**
     * Checks whether the ability can block the given status.
     *
     * @param statusType Status to check.
     * @param weather Current weather.
     * @param allowSilent Whether to allow silent activation. Default `true`.
     */
    public canBlockStatus(
        statusType: StatusType,
        weatherType: WeatherType | "none",
        allowSilent = true,
    ): boolean {
        const condition = this.data.on?.block?.status;
        return (
            (condition === true || condition === weatherType) &&
            !!this.data.statusImmunity &&
            (allowSilent
                ? !!this.data.statusImmunity[statusType]
                : this.data.statusImmunity[statusType] === true)
        );
    }

    /**
     * Activates an ability on-`block`.
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param hitBy Move+user ref that the holder was hit by, if applicable.
     * @returns Results from blocking the move.
     */
    public async onBlock(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        hitBy?: MoveAndUserRef,
    ): Promise<AbilityBlockResult> {
        // TODO: Assert non-ignoreTargetAbility (moldbreaker) after handling.
        if (!this.data.on?.block) return {};
        // Block status.
        if (this.data.on.block.status) {
            return await this.blockStatus(ctx, accept, side);
        }
        // Block move type.
        if (this.data.on.block.move) {
            if (!hitBy) return {};
            return await this.blockMove(ctx, accept, side, hitBy);
        }
        // Block effect.
        if (this.data.on.block.effect) {
            if (!hitBy) return {};
            return await this.blockEffect(ctx, accept, side, hitBy);
        }
        // istanbul ignore next: Can't reproduce.
        return {};
    }

    /**
     * Handles events due to a status-blocking ability (e.g. Immunity).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @returns Results from blocking the status.
     */
    private async blockStatus(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<AbilityBlockResult> {
        const blockData = this.data.on?.block?.status;
        // istanbul ignore next: Should never happen.
        if (!blockData) return {};
        if (blockData !== true) {
            // Specify required weather in order to block (e.g. leafguard).
            if (ctx.state.status.weather.type !== blockData) return {};
        }

        const statuses = this.data.statusImmunity;
        if (!statuses) return {};

        const event = await tryVerify(ctx, "|-immune|");
        if (!event) return {};
        const [, identStr] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== side) return {};
        if (!this.isEventFromAbility(event)) return {};
        accept();
        await dispatch(ctx);
        // Silent blocked statuses are handled by a different parser.
        return {
            blockStatus: Object.fromEntries(
                Object.entries(statuses)
                    // Note: Ability parsers only care about events, so ignore
                    // silent blocked statuses since they're already implied.
                    .filter(([, v]) => v === true),
            ),
        };
    }

    /**
     * Handles events due to an ability immunity to a move (e.g. Water Absorb).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param hitBy Move+user ref that the holder was hit by.
     * @returns Results from blocking the move.
     */
    private async blockMove(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        hitBy: MoveAndUserRef,
    ): Promise<AbilityBlockResult> {
        const blockData = this.data.on?.block?.move;
        // istanbul ignore next: Should never happen.
        if (!blockData) return {};

        const a = accept;
        accept = function blockMoveAccept() {
            // TODO: Implement type effectiveness assertion for "nonSuper".
            if (blockData.type !== "nonSuper") {
                const hitByUser = ctx.state.getTeam(hitBy.userRef).active;
                hitBy.move.assertType(blockData.type, hitByUser);
            }
            a();
        };

        // If no effects are being applied by the ability, just an |-immune|
        // event will be shown.
        // TODO: Reasons/assertions for immune event rather than actual block
        // effect?
        const event = await tryVerify(ctx, "|-immune|");
        if (event) {
            const [, identStr] = event.args;
            const ident = Protocol.parsePokemonIdent(identStr);
            if (ident.player !== side) return {};
            if (!this.isEventFromAbility(event)) return {};
            accept();
            await base["|-immune|"](ctx);
            return {immune: true};
        }

        // Self-boost effect.
        if (blockData.boost) {
            return await this.blockMoveBoost(
                ctx,
                accept,
                side,
                blockData.boost,
            );
        }
        // Self-damage/heal effect.
        if (blockData.percentDamage) {
            return await this.blockMoveHeal(
                ctx,
                accept,
                side,
                blockData.percentDamage,
                hitBy.userRef,
            );
        }
        // Self-status effect.
        if (blockData.status) {
            return await this.blockMoveStatus(
                ctx,
                accept,
                side,
                blockData.status,
            );
        }
        // istanbul ignore next: Can't reproduce.
        return {};
    }

    /**
     * Handles events due to an ability immunity causing a stat boost effect
     * (e.g. Motor Drive).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param boosts Boosts to try to apply.
     * @returns Results from blocking the move.
     */
    private async blockMoveBoost(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        boosts: Partial<BoostTable>,
    ): Promise<AbilityBlockResult> {
        // Parse initial event indicating boost effect.
        const event = await tryVerify(ctx, "|-ability|");
        if (!event) return {};

        // Otherwise, parse this initial event and then the boost events.
        const [, identStr, abilityName, s] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== side) return {};
        const abilityId = toIdName(abilityName);
        if (this.data.name !== abilityId) return {};
        if (s !== "boost") return {};
        accept();
        await base["|-ability|"](ctx);

        // Parse boost events.
        const remaining = await boost(ctx, {
            side,
            table: new Map(Object.entries(boosts) as [BoostName, number][]),
            silent: true,
        });
        if (remaining.size > 0) {
            throw new Error(
                "On-block move boost effect failed: " +
                    "Failed to parse boosts " +
                    `[${[...remaining]
                        .map(([b, a]) => `${b}: ${a}`)
                        .join(", ")}]`,
            );
        }
        return {immune: true};
    }

    /**
     * Handles events due to an ability immunity causing a healing effect
     * (e.g. Water Absorb).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param percent Percent damage to apply.
     * @param hitByUserRef User ref of the move the holder is being hit by.
     * @returns Results from blocking the move.
     */
    private async blockMoveHeal(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        percent: number,
        hitByUserRef: SideID,
    ): Promise<AbilityBlockResult> {
        const damageRes = await this.percentDamage(
            ctx,
            accept,
            side,
            percent,
            hitByUserRef,
        );
        if (damageRes !== true) return {};
        return {immune: true};
    }

    /**
     * Handles events due to an ability immunity causing a self-status effect
     * (e.g. Flash Fire).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param statusType Status effect to apply.
     * @returns Results from blocking the move.
     */
    private async blockMoveStatus(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        statusType: StatusType,
    ): Promise<AbilityBlockResult> {
        const statusRes = await this.status(ctx, accept, side, [statusType]);
        // Note: true=silent, undefined=invalid.
        if (typeof statusRes !== "string") return {};
        return {immune: true};
    }

    /**
     * Handles events due to a certain effect type being blocked (e.g. Damp vs
     * Explosion)
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param hitBy Move+user ref that the holder was hit by.
     * @returns Results from blocking the effect.
     */
    private async blockEffect(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        hitBy: MoveAndUserRef,
    ): Promise<AbilityBlockResult> {
        // Verify explosive flag.
        const explosive = this.data.on?.block?.effect?.explosive;
        if (explosive && !hitBy.move.data.flags?.explosive) return {};

        // Note: |move| event was shown prior.

        const event = await tryVerify(ctx, "|cant|");
        if (!event) return {};
        const [, identStr, reasonStr, effectStr] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== hitBy.userRef) return {};
        const reasonObj = Protocol.parseEffect(reasonStr, toIdName);
        if (reasonObj.name !== this.data.name) return {};
        const effect = Protocol.parseEffect(effectStr, toIdName);
        if (effect.name !== hitBy.move.data.name) return {};
        if (!event.kwArgs.of) return {};
        const identOf = Protocol.parsePokemonIdent(event.kwArgs.of);
        if (identOf.player !== side) return {};
        accept();
        await base["|cant|"](ctx);
        return {failed: true};
    }

    //#endregion

    //#region On-tryUnboost.

    /**
     * Checks whether the ability can activate on-`tryUnboost` to block an
     * unboost effect.
     *
     * @param source Pokemon that is the source of the unboost.
     * @param boosts Boosts that will be applied.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or `null` if it cannot
     * activate.
     */
    public canBlockUnboost(
        source: Pokemon,
        boosts: Partial<BoostTable>,
    ): Set<inference.SubReason> | null {
        if (!this.data.on?.tryUnboost?.block) return null;
        const blockUnboost = this.data.on.tryUnboost.block;

        const res = (Object.keys(boosts) as BoostID[]).some(
            b => boosts[b]! < 0 && blockUnboost[b],
        )
            ? new Set<inference.SubReason>()
            : null;

        // Moldbreaker check.
        res?.add(reason.ability.cantIgnoreTargetAbility(source));
        return res;
    }

    /**
     * Activates an ability on-`tryUnboost`.
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @returns The boosts that were blocked.
     */
    public async onTryUnboost(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<Partial<BoostTable<true>>> {
        // TODO: Assert non-ignoreTargetAbility (moldbreaker) after handling if
        // this is due to a move effect.
        if (!this.data.on?.tryUnboost) return {};
        if (this.data.on.tryUnboost.block) {
            return await this.blockUnboost(ctx, accept, side);
        }
        // istanbul ignore next: Can't reproduce.
        return {};
    }

    /**
     * Handles events due to an unboost-blocking ability (e.g. Clear Body).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @returns The boosts that were blocked.
     */
    private async blockUnboost(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<Partial<BoostTable<true>>> {
        const boosts = this.data.on?.tryUnboost?.block;
        // istanbul ignore next: No-op, should never happen.
        if (!boosts) return {};

        // Can't unboost anyway if about to faint.
        const holder = ctx.state.getTeam(side).active;
        if (holder.fainted) return {};

        const event = await tryVerify(ctx, "|-fail|");
        if (!event) return {};
        const [, identStr, blocked] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== side) return {};
        if (blocked !== "unboost") return {};
        if (!this.isEventFromAbility(event)) return {};
        if (!event.kwArgs.of) return {};
        const identOf = Protocol.parsePokemonIdent(event.kwArgs.of);
        if (identOf.player !== side) return {};
        accept();
        await base["|-fail|"](ctx);
        return boosts;
    }

    //#endregion

    //#region On-moveContactKo/moveContact/moveDamage.

    /**
     * Checks whether the ability can activate
     * on-`moveDamage`/`moveContact`/`moveContactKo`.
     *
     * @param mon Potential ability holder.
     * @param on Specific on-`X` condition.
     * @param hitBy Move+user that the holder was hit by.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or `null` if it cannot
     * activate.
     */
    public canMoveDamage(
        mon: Pokemon,
        on: AbilityOn,
        hitBy: MoveAndUser,
    ): Set<inference.SubReason> | null {
        if (!this.data.on) return null;
        if (
            this.data.on.moveDamage &&
            // Can't include moveContactKo since the only relevant effect
            // affects the ability holder.
            ["moveDamage", "moveContact"].includes(on)
        ) {
            if (this.data.on.moveDamage.changeToMoveType && !mon.fainted) {
                return new Set([reason.move.diffType(mon, hitBy)]);
            }
        }
        if (
            this.data.on.moveContact &&
            ["moveContact", "moveContactKo"].includes(on)
        ) {
            // TODO: Silent status-immunity check?
            const chanceNum = this.data.on.moveContact.chance ?? 100;
            return new Set(chanceNum === 100 ? [] : [reason.chance.create()]);
        }
        if (this.data.on.moveContactKo && on === "moveContactKo") {
            // TODO: Silent damp check?
            return new Set();
        }
        return null;
    }

    /**
     * Activates an ability on-`moveContactKo`/`moveContact`/`moveDamage`.
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param on Which on-`X` we're talking about.
     * @param hitBy Move+user ref that the holder was hit by.
     */
    public async onMoveDamage(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        on: AbilityOn,
        hitBy: MoveAndUserRef,
    ): Promise<void> {
        if (!this.data.on) return;
        switch (on) {
            case "moveContactKo":
                if (this.data.on.moveContactKo) {
                    return await this.moveContactKo(
                        ctx,
                        accept,
                        side,
                        hitBy.userRef,
                    );
                }
            // Fallthrough: contactKo also applies to contact in general.
            case "moveContact":
                if (this.data.on.moveContact) {
                    return await this.moveContact(
                        ctx,
                        accept,
                        side,
                        hitBy.userRef,
                    );
                }
            // Fallthrough: contact also applies to damage in general.
            case "moveDamage":
                if (this.data.on.moveDamage) {
                    // Colorchange.
                    if (
                        this.data.on.moveDamage.changeToMoveType &&
                        // Affects holder so can't activate if KO'd.
                        on !== "moveContactKo"
                    ) {
                        return await this.changeToMoveType(
                            ctx,
                            accept,
                            side,
                            hitBy,
                        );
                    }
                }
                break;
            default:
                // istanbul ignore next: Should never happen.
                throw new Error(`Invalid on-moveDamage-like type '${on}'`);
        }
    }

    /**
     * Handles events due to a moveContactKo ability (e.g. Aftermath).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param hitByUserRef Pokemon reference to the user of the move by which
     * the ability holder was hit.
     */
    private async moveContactKo(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        hitByUserRef: SideID,
    ): Promise<void> {
        const effectData = this.data.on?.moveContactKo;
        // istanbul ignore next: Should never happen.
        if (!effectData) return;

        // Damage hit-by user.
        if (effectData.percentDamage) {
            const damageRes = await this.percentDamage(
                ctx,
                accept,
                hitByUserRef,
                effectData.percentDamage,
                side,
            );
            if (damageRes !== true) return;
        }

        if (effectData.explosive) {
            // Assert non-explosive-blocking ability (damp).
            // TODO(doubles): Assert for all active mons.
            const hitByUser = ctx.state.getTeam(hitByUserRef).active;
            if (!hitByUser.volatile.suppressAbility) {
                hitByUser.traits.ability.remove(
                    (_, a) => !!a.on?.block?.effect?.explosive,
                );
            }
        }
    }

    /**
     * Handles events due to a moveContact ability (e.g. Rough Skin).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param hitByUserRef Pokemon reference to the user of the move by which
     * the ability holder was hit.
     */
    private async moveContact(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        hitByUserRef: SideID,
    ): Promise<void> {
        const effectData = this.data.on?.moveContact;
        // istanbul ignore next: Should never happen.
        if (!effectData) return;

        if (effectData.percentDamage) {
            await this.percentDamage(
                ctx,
                accept,
                hitByUserRef,
                effectData.percentDamage,
                side,
            );
        } else if (effectData.status) {
            await this.status(
                ctx,
                accept,
                hitByUserRef,
                effectData.status,
                side,
            );
        }
    }

    /**
     * Handles events due to a changeMoveType ability (e.g. Color Change).
     * Always targets ability holder.
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param hitBy Move+user ref that the holder was hit by.
     */
    private async changeToMoveType(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        hitBy: MoveAndUserRef,
    ): Promise<void> {
        const event = await tryVerify(ctx, "|-start|");
        if (!event) return;
        if (!this.isEventFromAbility(event)) return;
        const [, identStr, effectStr, type] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== side) return;
        if (effectStr !== "typechange") return;
        if (!type) return;
        accept();
        const hitByUser = ctx.state.getTeam(hitBy.userRef).active;
        hitBy.move.assertType(toIdName(type) as Type, hitByUser);
        await base["|-start|"](ctx);
    }

    //#endregion

    //#region On-moveDrain.

    // TODO: Generalize to on-drain for leechseed status as well as moves.
    /**
     * Checks whether the ability can activate on-`moveDrain`.
     *
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or `null` if it cannot
     * activate.
     */
    public canMoveDrain(): Set<inference.SubReason> | null {
        return this.data.on?.moveDrain ? new Set() : null;
    }

    /**
     * Activates an ability on-`moveDrain`.
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param hitByUserRef Pokemon reference to the user of the draining move.
     * @returns `"invert"` if the drain effect was overridden to deduct HP
     * instead of heal, otherwise `undefined`.
     */
    public async onMoveDrain(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        hitByUserRef: SideID,
    ): Promise<"invert" | undefined> {
        if (!this.data.on?.moveDrain) return;
        // Invert drain effect to damage instead of heal.
        if (this.data.on.moveDrain.invert) {
            return await this.invertDrain(ctx, accept, side, hitByUserRef);
        }
    }

    /**
     * Handles events due to an invertDrain ability (e.g. Liquid Ooze). Targets
     * the drain move's user.
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @param hitByUserRef Pokemon reference to the user of the draining move.
     * @returns `"invert"` if the drain effect was overridden to deduct HP
     * instead of heal, otherwise `undefined`.
     */
    private async invertDrain(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        hitByUserRef: SideID,
    ): Promise<"invert" | undefined> {
        // TODO: Expect actual drain damage amount?
        const damageRes = await this.percentDamage(
            ctx,
            accept,
            hitByUserRef,
            -1 /*percent*/,
            side,
        );
        if (damageRes !== true) return;

        // TODO: Include damage delta?
        return "invert";
    }

    //#endregion

    //#region On-update.

    /**
     * Checks whether the ability can activate on-`update`.
     *
     * @param mon Potential ability holder.
     * @param opp Opponent.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or `null` if it cannot
     * activate.
     */
    public canUpdate(
        mon: Pokemon,
        opp: Pokemon,
    ): Set<inference.SubReason> | null {
        if (!this.data.on?.update) return null;
        // Trace.
        if (this.data.on.update.copyFoeAbility) {
            if (opp.fainted) return null;
            return new Set([reason.ability.isCopyable(opp)]);
        }
        // Cure immunities.
        if (this.data.on.update.cure && this.data.statusImmunity) {
            const statusTypes = Object.keys(
                this.data.statusImmunity,
            ) as StatusType[];
            return statusTypes.some(
                s => this.data.statusImmunity![s] && hasStatus(mon, s),
            )
                ? new Set()
                : null;
        }
        // istanbul ignore next: Can't reproduce.
        return null;
    }

    /**
     * Activates an ability on-`update`.
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     * @returns `"invert"` if the drain effect was overridden to deduct HP
     * instead of heal, otherwise `undefined`.
     */
    public async onUpdate(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        void ctx, accept, side;

        if (!this.data.on?.update) return;
        // Note(gen4): Trace is handled using other special logic found in
        // #copyFoeAbility() and gen4/parser/ability.ts' onStart() function
        // where this is called.
        if (this.data.on.update.copyFoeAbility) {
            return;
        }
        // Cure status immunity.
        if (this.data.on.update.cure) {
            return await this.cureImmunity(ctx, accept, side);
        }
    }

    /**
     * Parses indicator event due to a copeFoeAbility ability (e.g. Trace).
     *
     * @param side Ability holder reference.
     * @param accept Optional callback to accept this pathway.
     * @param copied Expected copied ability.
     * @param copiedTarget Expected copy target.
     * @returns The name of the traced ability and the trace target, or
     * `undefined` if not found.
     */
    public async copyFoeAbility(
        ctx: BattleParserContext<"gen4">,
        side: SideID,
        accept?: unordered.AcceptCallback,
        copied?: Ability,
        copiedTarget?: SideID,
    ): Promise<{ability: string; side: SideID} | undefined> {
        // Note(gen4): Traced ability activates before trace is acknowledged.
        // To handle possible ambiguity, we have some special logic in
        // gen4/parser/ability.ts#onUpdate() where this method is called.
        const event = await tryVerify(ctx, "|-ability|");
        if (!event) return;
        const [, identStr, abilityName] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        const abilityId = toIdName(abilityName);
        if (copied && copied.data.name !== abilityId) return;
        if (ident.player !== side) return;
        if (!this.isEventFromAbility(event)) return;
        if (!event.kwArgs.of) return;
        const identOf = Protocol.parsePokemonIdent(event.kwArgs.of);
        if (copiedTarget && identOf.player !== copiedTarget) return;
        accept?.();
        await consume(ctx);
        return {ability: abilityId, side: identOf.player};
    }

    /**
     * Handles events due to a statusImmunity ability curing a status (e.g.
     * Insomnia).
     *
     * @param accept Callback to accept this pathway.
     * @param side Ability holder reference.
     */
    private async cureImmunity(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        const immunities = this.data.statusImmunity;
        if (!immunities) return;

        // Verify initial event.
        const initial = await tryVerify(ctx, "|-activate|");
        if (!initial) return;
        const [, initialIdentStr, initialEffectStr] = initial.args;
        if (!initialIdentStr) return;
        const initialIdent = Protocol.parsePokemonIdent(initialIdentStr);
        if (initialIdent.player !== side) return;
        const initialEffect = Protocol.parseEffect(initialEffectStr, toIdName);
        if (initialEffect.type !== "ability") return;
        if (initialEffect.name !== this.data.name) return;
        accept();
        await consume(ctx);

        // Parse cure events.
        const cureResult = await cure(
            ctx,
            side,
            Object.keys(immunities) as StatusType[],
        );
        if (cureResult === "silent") {
            throw new Error(
                "On-status cure effect failed: Cure effect was a no-op",
            );
        }
        if (cureResult.size > 0) {
            throw new Error(
                "On-status cure effect failed: " +
                    `Missing cure events: [${[...cureResult].join(", ")}]`,
            );
        }
    }

    //#endregion

    //#region On-x helpers.

    /**
     * Expects an event for a percent-damage effect with the correct `[from]`
     * suffix.
     *
     * @param accept Callback to accept this pathway.
     * @param side Pokemon reference receiving the damage.
     * @param percent Percent damage to deal.
     * @param of Pokemon that should be referenced by the event's `[of]` suffix.
     * Optional.
     * @returns `true` if the effect was parsed, `"silent"` if the effect is a
     * no-op, or `undefined` if the effect wasn't parsed.
     * @see {@link percentDamage}
     */
    private async percentDamage(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        percent: number,
        of?: SideID,
    ): ReturnType<typeof percentDamage> {
        return await percentDamage(ctx, side, percent, event => {
            if (!this.isEventFromAbility(event)) return false;
            if (of) {
                if (!event.kwArgs.of) return false;
                const identOf = Protocol.parsePokemonIdent(event.kwArgs.of);
                if (identOf.player !== of) return false;
            }
            accept();
            return true;
        });
    }

    /**
     * Expects an event for a status effect with the correct `[from]` suffix.
     *
     * @param accept Callback to accept this pathway.
     * @param side Pokemon reference to which to afflict the status.
     * @param statusTypes Possible statuses to afflict.
     * @param of Pokemon that should be referenced by the event's `[of]` suffix.
     * Optional.
     * @returns The status type that was consumed, or `true` if the effect
     * couldn't be applied and was a no-op, or `undefined` if no valid event was
     * found.
     * @see {@link status}
     */
    private async status(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        statusTypes: readonly StatusType[],
        of?: SideID,
    ): ReturnType<typeof status> {
        return await status(ctx, side, statusTypes, event => {
            if (event.args[0] !== "-message") {
                const e = event as Event<
                    Exclude<StatusEventType, "|-message|">
                >;
                // Ability-based effects don't need from suffix.
                if (
                    e.args[0] !== "-start" ||
                    Protocol.parseEffect(e.args[2], toIdName).name !==
                        this.data.name
                ) {
                    if (!this.isEventFromAbility(e)) return false;
                }
                if (of) {
                    if (!e.kwArgs.of) return false;
                    const identOf = Protocol.parsePokemonIdent(e.kwArgs.of);
                    if (identOf.player !== of) return false;
                }
            }
            accept();
            return true;
        });
    }

    /**
     * Verifies that the event's `[from]` effect suffix matches this Ability.
     */
    private isEventFromAbility(
        event: Event<Protocol.BattleArgsWithKWArgName>,
    ): boolean {
        const from = Protocol.parseEffect(
            (event.kwArgs as {from?: string}).from,
            toIdName,
        );
        return this.isEffectFromAbility(from);
    }

    /** Verifies that a parsed effect string matches this Ability. */
    private isEffectFromAbility(
        effect: ReturnType<typeof Protocol["parseEffect"]>,
    ): boolean {
        return (
            (!effect.type || effect.type === "ability") &&
            effect.name === this.data.name
        );
    }

    /** Gets the ability's move type immunity, or null if none found. */
    public getTypeImmunity(): Type | null {
        const type = this.data.on?.block?.move?.type;
        // TODO: Generalize for multiple immunities, e.g. wonderguard.
        if (!type || type === "nonSuper") return null;
        return type;
    }

    //#endregion
}
