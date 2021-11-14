import {Protocol} from "@pkmn/protocol";
import {SideID} from "@pkmn/types";
import {BoostName, Type} from "..";
import {toIdName} from "../../../../../../helpers";
import {Event} from "../../../../../../parser";
import {
    BattleParserContext,
    consume,
    inference,
    tryVerify,
    unordered,
} from "../../../../parser";
import {handlers as base} from "../../parser/base";
import {boostOne} from "../../parser/effect/boost";
import {isPercentDamageSilent, percentDamage} from "../../parser/effect/damage";
import {updateItems} from "../../parser/effect/item";
import {
    cure,
    hasStatus,
    status,
    StatusEventType,
} from "../../parser/effect/status";
import * as reason from "../../parser/reason";
import {Pokemon} from "../../state/Pokemon";
import {PreTurnSnapshotPokemon} from "../../state/Team";
import {ItemData, ItemOn, StatusType} from "../dex-util";
import {getTypeEffectiveness} from "../typechart";
import {MoveAndUser, MoveAndUserRef} from "./Move";

/** Result of {@link Item.onPreHit}. */
export interface ItemPreHitResult {
    /** Resist berry type if applicable. */
    resistSuper?: Type;
}

/** Encapsulates item properties. */
export class Item {
    // TODO: Eventually make #data inaccessible apart from internal dex?
    /**
     * Creates an Item data wrapper.
     *
     * @param data Item data from dex.
     */
    public constructor(public readonly data: ItemData) {}

    //#region On-preMove.

    /**
     * Checks whether the item can activate on-`preMove`.
     *
     * @param mon Potential item holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or `null` if it cannot
     * activate.
     */
    public canPreMove(mon: Pokemon): Set<inference.SubReason> | null {
        if (!this.data.on?.preMove) return null;
        // Note(gen4): Custapberry check happens on pre-turn but is only ever
        // shown/acknowledged on pre-move.
        return this.checkHpThreshold(
            mon.team?.preTurnSnapshotPokemon ?? mon,
            this.data.on.preMove.threshold,
        );
    }

    /** Custapberry message. */
    private static readonly custapMessage = "Custap Berry activated.";

    /**
     * Activates an item on-`preMove` (e.g. custapberry).
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     * @returns `"moveFirst"` if the holder is moving first in its priority
     * bracket due to the item. Otherwise `undefined`.
     */
    public async onPreMove(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<"moveFirst" | undefined> {
        if (!this.data.on?.preMove) return;
        if (this.data.on.preMove.moveFirst && this.data.on.preMove.threshold) {
            if (!(await this.onEat(ctx, accept, side))) return;

            const event = await tryVerify(ctx, "|-message|");
            if (!event) {
                throw new Error(
                    "On-preMove moveFirst effect failed: " +
                        "Missing custapberry message",
                );
            }
            if (event.args[1] !== Item.custapMessage) {
                throw new Error(
                    "On-preMove moveFirst effect failed: " +
                        "Expected custapberry message " +
                        `'${Item.custapMessage}' but got '${event.args[1]}'`,
                );
            }
            await base["|-message|"](ctx);

            return "moveFirst";
        }
    }

    //#endregion

    //#region On-moveCharge.

    /**
     * Checks whether the item can activate on-`moveCharge`.
     *
     * @param mon Potential item holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or `null` if it cannot
     * activate.
     */
    public canMoveCharge(mon: Pokemon): Set<inference.SubReason> | null {
        if (!this.data.on?.moveCharge) return null;
        if (this.data.on.moveCharge.shorten) {
            return new Set([reason.ability.cantIgnoreItem(mon)]);
        }
        // istanbul ignore next: Can't reproduce.
        return null;
    }

    /**
     * Activates an item on-`moveCharge` (e.g. powerherb).
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     * @returns `"shorten"` if the holder's two-turn move is being shortend to
     * one due to the item. Otherwise `undefined`.
     */
    public async onMoveCharge(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<"shorten" | undefined> {
        const data = this.data.on?.moveCharge;
        if (!data) return;
        if (data.shorten && data.consume) {
            if (!(await this.consumeItem(ctx, accept, side))) return;
            return "shorten";
        }
    }

    //#endregion

    //#region On-preHit.

    /**
     * Checks whether the item can activate on-`preHit`.
     *
     * @param mon Potential item holder.
     * @param hitBy Move+user the holder was hit by.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canPreHit(
        mon: Pokemon,
        hitBy: MoveAndUser,
    ): Set<inference.SubReason> | null {
        const data = this.data.on?.preHit;
        if (!data) return null;

        const result = new Set([reason.ability.cantIgnoreItem(mon)]);

        if (data.resistSuper) {
            // Can't activate if holder isn't weak to the type this item
            // protects against (unless normal).
            if (
                data.resistSuper !== "normal" &&
                getTypeEffectiveness(mon.types, data.resistSuper) !== "super"
            ) {
                return null;
            }
            // Can't activate for moves that can never be super-effective.
            if (!hitBy.move.canBeEffective) return null;
            // Will only work then if the move type is the protected type.
            // TODO: Don't add if already proven/disproven.
            result.add(
                reason.move.isType(
                    hitBy.move,
                    hitBy.user,
                    new Set([data.resistSuper]),
                ),
            );
        }
        return result;
    }

    /**
     * Activates an item on-`preHit` (e.g. resist berries).
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     * @param hitBy Move+user the holder is being hit by.
     * @returns Result of the item activation which can modify the current hit
     * in progress.
     */
    public async onPreHit(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        hitBy: MoveAndUser,
    ): Promise<ItemPreHitResult> {
        const data = this.data.on?.preHit;
        if (!data) return {};
        if (data.resistSuper) {
            return await this.resistSuper(
                ctx,
                accept,
                side,
                hitBy,
                data.resistSuper,
            );
        }
        // istanbul ignore next: Can't reproduce.
        return {};
    }

    /**
     * Activates a resist berry item.
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     * @param hitBy Move+user the holder is being hit by.
     * @param moveType Resist berry type, which must match the `hitBy.move`
     * type.
     * @returns Result of the item activation which can modify the current hit
     * in progress.
     */
    private async resistSuper(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        hitBy: MoveAndUser,
        moveType: Type,
    ): Promise<ItemPreHitResult> {
        if (!(await this.onEat(ctx, accept, side))) return {};

        // Item effect event is similar to the initial parsed onEat() event but
        // with a [weaken] suffix instead of [eat].
        const event = await tryVerify(ctx, "|-enditem|");
        if (!event) return {};
        const [, identStr, itemName] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== side) return {};
        const itemId = toIdName(itemName);
        if (itemId !== this.data.name) return {};
        if (!event.kwArgs.weaken) return {};
        accept();
        // Since this is sort of like a duplicate |-enditem| event we should
        // just consume it here rather than try to handle it a second time.
        await consume(ctx);

        // Assert that the move is super effective against the item holder.
        const holder = ctx.state.getTeam(side).active;
        const {types} = holder;
        const eff = getTypeEffectiveness(types, moveType);
        if (eff !== "super") {
            // TODO: Log error instead of throw?
            throw new Error(
                `Expected type effectiveness to be 'super' but got '${eff}' ` +
                    `for '${moveType}' vs [${types.join(", ")}]`,
            );
        }

        // Infer move type based on resist berry type.
        hitBy.move.assertType(moveType, hitBy.user);
        return {resistSuper: moveType};
    }

    //#endregion

    //#region On-tryOhko.

    /**
     * Checks whether the item can activate on-`tryOHKO`.
     *
     * @param mon Potential item holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canTryOhko(mon: Pokemon): Set<inference.SubReason> | null {
        const data = this.data.on?.tryOhko;
        if (!data) return null;
        if (data.block && data.consume) {
            const result = new Set([reason.ability.cantIgnoreItem(mon)]);

            const activate = reason.hp.isAt1(mon);
            if (!activate) return null;
            for (const subReason of activate) result.add(subReason);

            return result;
        }
        // istanbul ignore next: Can't reproduce.
        return null;
    }

    /**
     * Activates an item on-`tryOhko` (e.g. focussash).
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     * @returns Whether the item activated to prevent an OHKO.
     */
    public async onTryOhko(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<boolean | undefined> {
        const data = this.data.on?.tryOhko;
        if (!data) return;
        if (data.block && data.consume) {
            return await this.consumeItem(ctx, accept, side);
        }
    }

    //#endregion

    //#region On-super.

    /**
     * Checks whether the item can activate consumeOn-`super`.
     *
     * @param mon Potential item holder.
     * @param hitBy Move+user the holder was hit by.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canSuper(
        mon: Pokemon,
        hitBy: MoveAndUser,
    ): Set<inference.SubReason> | null {
        const data = this.data.on?.super;
        if (!data) return null;
        if (!hitBy.move.canBeEffective) return null;

        if (data.heal) {
            // Must be able to heal.
            if (mon.fainted) return null;
            if (isPercentDamageSilent(data.heal, mon.hp.current, mon.hp.max)) {
                return null;
            }

            return new Set([
                reason.ability.cantIgnoreItem(mon),
                reason.move.isEffective(hitBy.move, hitBy.user, mon, "super"),
            ]);
        }
        // istanbul ignore next: Can't reproduce.
        return null;
    }

    /**
     * Activates an item on-`super` (e.g. enigmaberry).
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     */
    public async onSuper(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        const data = this.data.on?.super;
        if (!data) return;
        if (data.heal) {
            if (!(await this.onEat(ctx, accept, side))) return;
            let accepted = false;
            const damageResult = await this.percentDamage(
                ctx,
                () => (accepted = true),
                side,
                data.heal,
            );
            if (damageResult !== true || !accepted) {
                throw new Error("On-super heal effect failed");
            }
        }
    }

    //#endregion

    //#region On-postHit.

    /**
     * Checks whether the item can activate consumeOn-`postHit`.
     *
     * @param mon Potential item holder.
     * @param hitBy Move+user the holder was hit by.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canPostHit(
        mon: Pokemon,
        hitBy: MoveAndUser,
    ): Set<inference.SubReason> | null {
        const data = this.data.on?.postHit;
        if (!data) return null;
        if (data.condition !== hitBy.move.data.category) {
            return null;
        }

        if (data.damage) {
            // Note: Even if effect is a no-op, this item still activates.
            return new Set([reason.ability.cantIgnoreItem(mon)]);
        }
        // istanbul ignore next: Can't reproduce.
        return null;
    }

    /**
     * Activates an item on-`postHit` (e.g. jabocaberry/rowapberry).
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     * @param hitBy Move+user ref the holder is being hit by.
     */
    public async onPostHit(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        hitBy: MoveAndUserRef,
    ): Promise<void> {
        const data = this.data.on?.postHit;
        if (!data) return;
        if (hitBy.move.data.category !== data.condition) return;
        if (data.damage) {
            if (!(await this.onEat(ctx, accept, side))) return;
            let accepted = false;
            // Note: Even if effect is a no-op, this item still activates.
            const damageResult = await this.percentDamage(
                ctx,
                () => (accepted = true),
                hitBy.userRef,
                -data.damage,
            );
            if (damageResult === true && accepted) {
                // After dealing damage, check if any other items need to
                // activate.
                await updateItems(ctx);
            }
        }
    }

    //#endregion

    //#region On-movePostDamage.

    /**
     * Checks whether the item can activate on-`movePostDamage`.
     *
     * @param mon Potential item holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canMovePostDamage(mon: Pokemon): Set<inference.SubReason> | null {
        if (!this.data.on?.movePostDamage) return null;

        // Check for abilities that would block the item.
        // Can't be blocked if ability is suppressed.
        if (mon.volatile.suppressAbility) return new Set();

        const abilities = new Set(mon.traits.ability.possibleValues);
        // Check if the item could actually activate.
        const percent = this.data.on.movePostDamage.percentDamage;
        if (
            percent &&
            !isPercentDamageSilent(percent, mon.hp.current, mon.hp.max)
        ) {
            // Filter ability possibilities that can block the remaining
            // effects.
            // If one effect can't be suppressed, then the item should activate.
            for (const abilityName of abilities) {
                const ability = mon.traits.ability.map[abilityName];
                if (ability.flags?.ignoreItem) continue;
                if (percent < 0 && ability.flags?.noIndirectDamage === true) {
                    continue;
                }
                abilities.delete(abilityName);
            }
        } else return null;
        // No abilities block this item.
        if (abilities.size <= 0) return new Set();
        // All possible abilities block this item.
        if (abilities.size >= mon.traits.ability.size) return null;
        return new Set([reason.ability.doesntHave(mon, abilities)]);
    }

    /**
     * Activates an item on-`movePostDamage` (e.g. lifeorb).
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     */
    public async onMovePostDamage(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        if (!this.data.on?.movePostDamage) return;
        // Self-damage.
        if (this.data.on.movePostDamage.percentDamage) {
            const damageResult = await this.percentDamage(
                ctx,
                accept,
                side,
                this.data.on.movePostDamage.percentDamage,
            );
            if (damageResult !== true) return;
            // This counts as indirect damage (blocked by magicguard).
            // TODO: Make this a SubReason in #canMovePostDamage().
            this.indirectDamage(ctx, side);
        }
    }

    //#endregion

    //#region On-update.

    /**
     * Checks whether the item can activate on-`update`.
     *
     * @param mon Potential item holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canUpdate(mon: Pokemon): Set<inference.SubReason> | null {
        if (mon.fainted) return null;
        const data = this.data.on?.update;
        if (!data) return null;
        switch (data.condition) {
            case "hp":
                return this.checkHpThreshold(mon, data.threshold);
            case "status": {
                let activate = false;
                for (const statusType in data.status) {
                    // istanbul ignore if: Can't reproduce.
                    if (!Object.hasOwnProperty.call(data.status, statusType)) {
                        continue;
                    }
                    if (
                        (activate ||= hasStatus(mon, statusType as StatusType))
                    ) {
                        break;
                    }
                }
                if (!activate) return null;
                return new Set([reason.ability.cantIgnoreItem(mon)]);
            }
            case "depleted":
                for (const move of mon.moveset.moves.values()) {
                    // TODO: Pp may be uncertain in certain corner cases
                    // (e.g. pressure), handle these then add a SubReason to
                    // support this later.
                    if (move.pp > 0) continue;
                    return new Set([reason.ability.cantIgnoreItem(mon)]);
                }
            // Fallthrough.
            default:
                return null;
        }
    }

    /**
     * Activates an item on-`update` (e.g. sitrusberry).
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     */
    public async onUpdate(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        const data = this.data.on?.update;
        switch (data?.condition) {
            case "hp":
                return await this.updateHp(ctx, accept, side);
            case "status":
                return await this.updateStatus(ctx, accept, side);
            case "depleted":
                return await this.updateDepleted(ctx, accept, side);
            default:
        }
    }

    /**
     * Activates an item on-`update` for condition=hp (e.g. sitrusberry).
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     */
    private async updateHp(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        const data = this.data.on?.update;
        if (data?.condition !== "hp") return;
        await this.onEat(ctx, accept, side);
    }

    /**
     * Activates an item on-`update` for condition=status (e.g. lumberry).
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     */
    private async updateStatus(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        const data = this.data.on?.update;
        if (data?.condition !== "status") return;
        // Mentalherb.
        if (data.cure && data.consume) {
            if (!(await this.consumeItem(ctx, accept, side))) return;
            const fail = (reasonStr?: string) =>
                Item.effectFailed("update", "status cure", reasonStr);
            // Cure all the relevant statuses.
            const cureResult = await cure(
                ctx,
                side,
                Object.keys(data.status) as StatusType[],
            );
            if (cureResult === "silent") return fail("Cure effect was a no-op");
            if (cureResult.size > 0) {
                return fail(
                    "Missing cure events: " + `[${[...cureResult].join(", ")}]`,
                );
            }
        }
        // Status berries.
        else await this.onEat(ctx, accept, side);
    }

    /**
     * Activates an item on-`update` for condition=depleted (e.g. leppaberry).
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     */
    private async updateDepleted(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        const data = this.data.on?.update;
        if (data?.condition !== "depleted") return;
        await this.onEat(ctx, accept, side);
    }

    //#endregion

    //#region On-residual.

    /**
     * Checks whether the item can activate on-`residual`.
     *
     * @param mon Potential item holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canResidual(mon: Pokemon): Set<inference.SubReason> | null {
        const data = this.data.on?.residual;
        if (!data) return null;

        // Micleberry.
        if (data.threshold) return this.checkHpThreshold(mon, data.threshold);

        // Check for abilities that would block the item.
        // Can't be blocked if ability is suppressed.
        if (mon.volatile.suppressAbility) return new Set();

        // Check for percent-damage effect.
        const isPoison = mon.types.includes("poison");
        let percent = data[isPoison ? "poisonDamage" : "noPoisonDamage"];
        if (
            percent &&
            isPercentDamageSilent(percent, mon.hp.current, mon.hp.max)
        ) {
            // Effect would be silent so don't mention it here.
            percent = undefined;
        }

        // No item effects to activate.
        if (!percent && !data.status) return null;

        // Get a list of all the possible abilities that could block the item
        // effects.
        // Start from the list of all possible abilities then prune the ones
        // that are irrelevant for this item.
        const abilities = new Set(mon.traits.ability.possibleValues);
        for (const abilityName of abilities) {
            const ability = mon.traits.ability.map[abilityName];
            // Ability can ignore item.
            if (ability.flags?.ignoreItem) continue;
            // Indirect damage doesn't apply when healing.
            if (
                percent &&
                percent < 0 &&
                ability.flags?.noIndirectDamage === true
            ) {
                continue;
            }
            // If there's a status immunity (even a silent one), then the item
            // can't activate.
            if (data.status && ability.statusImmunity?.[data.status]) {
                const blockCondition = ability.on?.block?.status;
                if (blockCondition === true) continue;
                if (
                    blockCondition &&
                    mon.team?.state?.status.weather.type === blockCondition
                ) {
                    continue;
                }
            }

            // Ability can't block the item.
            abilities.delete(abilityName);
        }

        // None of the possible abilities can block this item.
        if (abilities.size <= 0) return new Set();
        // All of the possible abilities can block this item.
        if (abilities.size >= mon.traits.ability.size) return null;
        // Some can block, so setup an inference that will make this decision
        // later.
        return new Set([reason.ability.doesntHave(mon, abilities)]);
    }

    /**
     * Activates an item on-`residual` (e.g. leftovers).
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     */
    public async onResidual(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<void> {
        const data = this.data.on?.residual;
        if (!data) return;

        // Micleberry.
        if (data.threshold) {
            if (await this.onEat(ctx, accept, side)) {
                ctx.state.getTeam(side).active.volatile.micleberry = true;
            }
            return;
        }

        // Self-damage from leftovers, blacksludge, etc.
        const holder = ctx.state.getTeam(side).active;
        const isPoison = holder.types.includes("poison");
        const percent = data[isPoison ? "poisonDamage" : "noPoisonDamage"];
        if (percent) {
            const damageResult = await this.percentDamage(
                ctx,
                accept,
                side,
                percent,
            );
            if (damageResult !== true) return;
            this.indirectDamage(ctx, side);
        }
        // Self-status from toxicorb, flameorb, etc.
        else if (data.status) {
            await this.status(ctx, accept, side, [data.status]);
        }
    }

    //#endregion

    //#region On-eat (private helper).

    /**
     * Expects an item to activate on-`eat`.
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     * @param stealeat If applicable, the user of a steal-eat type move that
     * will gain the item's effects.
     * @returns `true` if parsed, `undefined` otherwise.
     */
    private async onEat(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
        stealeat?: SideID,
    ): Promise<true | undefined> {
        if (!this.data.isBerry) return;

        // Recipient of the item effects.
        let recipient: SideID;

        // Verify initial eat event.
        const event = await tryVerify(ctx, "|-enditem|");
        if (!event) return;
        const [, identStr, itemName] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== side) return;
        const itemId = toIdName(itemName);
        if (itemId !== this.data.name) return;
        if (stealeat) {
            if (event.kwArgs.from !== "stealeat") return;
            if (!event.kwArgs.move) return;
            if (!event.kwArgs.of) return;
            const ofIdent = Protocol.parsePokemonIdent(event.kwArgs.of);
            if (ofIdent.player !== stealeat) return;
            recipient = stealeat;
        } else if (!event.kwArgs.eat) return;
        else recipient = side;
        accept();
        await base["|-enditem|"](ctx);

        await this.onEatImpl(ctx, recipient);
        return true;
    }

    /**
     * Handles on-`eat` effects.
     *
     * @param side Pokemon reference receiving the effects.
     */
    private async onEatImpl(
        ctx: BattleParserContext<"gen4">,
        side: SideID,
    ): Promise<void> {
        const data = this.data.on?.eat;
        if (!data) return;

        const mon = ctx.state.getTeam(side).active;
        const fail = (reasonStr?: string) =>
            Item.effectFailed("eat", data.type, reasonStr);
        switch (data.type) {
            case "healPercent":
            case "healFixed": {
                let accepted = true;
                const damageResult = await this.percentDamage(
                    ctx,
                    () => (accepted = true),
                    side,
                    data.heal,
                );
                if (damageResult !== true || !accepted) return fail();
                if (data.dislike) {
                    // TODO: Assert dislike nature.
                    // TODO: Handle status immunity/errors?
                    void (await status(ctx, side, ["confusion"]));
                }
                break;
            }
            case "boost": {
                // Note: for starfberry (boosts a random stat), if all boosts
                // are maxed out, no events are emitted.
                const boostResult = await boostOne(ctx, {
                    side,
                    table: new Map(
                        Object.entries(data.boostOne) as [BoostName, number][],
                    ),
                    silent: Object.keys(data.boostOne).length > 1,
                    pred: event => this.isEventFromItem(event),
                });
                if (!boostResult) return fail();
                break;
            }
            case "focusenergy": {
                // Note: Effect can be silent if already afflicted.
                const statusResult = await status(ctx, side, ["focusenergy"]);
                if (!statusResult) return fail();
                break;
            }
            case "cure": {
                // Cure all the relevant statuses.
                const cureResult = await cure(
                    ctx,
                    side,
                    Object.keys(data.cure) as StatusType[],
                );
                if (cureResult === "silent") {
                    return fail("Cure effect was a no-op");
                }
                if (cureResult.size > 0) {
                    return fail(
                        `Missing cure events: [${[...cureResult].join(", ")}]`,
                    );
                }
                break;
            }
            case "status":
                if (data.status !== "micleberry") break;
                mon.volatile.micleberry = true;
                break;
            case "restore": {
                const event = await tryVerify(ctx, "|-activate|");
                if (!event) return fail("Missing |-activate| event");
                const [, identStr, effectStr, moveName] = event.args;
                Item.requireIdent(identStr, side, fail);
                this.requireEffectFromItem(effectStr, fail);
                Item.requireString(moveName, "move", fail);
                const moveId = toIdName(moveName);
                if (!event.kwArgs.consumed) {
                    return fail("Missing [consumed] suffix");
                }

                const holder = ctx.state.getTeam(side).active;
                holder.moveset.reveal(moveId).pp += data.restore;
                await consume(ctx);
                break;
            }
            // istanbul ignore next: Should never happen.
            default: {
                const unhandled: never = data;
                return fail(
                    `Unknown effect type '${
                        (unhandled as unknown as {type: string}).type
                    }'`,
                );
            }
        }
    }

    //#endregion

    //#region On-x helpers.

    /**
     * Indicates that the item holder received indirect damage from the item, in
     * order to make ability inferences.
     */
    private indirectDamage(
        ctx: BattleParserContext<"gen4">,
        side: SideID,
    ): void {
        const holder = ctx.state.getTeam(side).active;
        if (holder.volatile.suppressAbility) return;

        // Can't have an ability that blocks indirect damage.
        const {ability} = holder.traits;
        const filteredAbilities = [...ability.possibleValues].filter(
            n => ability.map[n].flags?.noIndirectDamage === true,
        );
        if (filteredAbilities.length >= ability.size) {
            throw new Error(
                `Pokemon '${side}' received indirect damage ` +
                    `from item '${this.data.name}' even though its ability ` +
                    `[${[...ability.possibleValues].join(", ")}] suppresses ` +
                    "that damage",
            );
        }
        ability.remove(filteredAbilities);
    }

    // TODO: Replace fail cb pattern with aggregate errors?
    private static requireIdent(
        str?: string,
        side?: SideID,
        fail = (reasonStr: string) => {
            throw new Error(reasonStr);
        },
    ): ReturnType<typeof Protocol["parsePokemonIdent"]> {
        Item.requireString(str, "ident", fail);
        const ident = Protocol.parsePokemonIdent(str as Protocol.PokemonIdent);
        if (side && ident.player !== side) {
            return fail(`Expected ident '${side}' but got '${ident.player}'`);
        }
        return ident;
    }

    private requireEffectFromItem(
        str?: string,
        fail = (reasonStr: string) => {
            throw new Error(reasonStr);
        },
    ): ReturnType<typeof Protocol["parseEffect"]> {
        if (!str) return fail("Missing effect");
        const effect = Protocol.parseEffect(str, toIdName);
        if (!this.isEffectFromItem(effect)) {
            return fail(
                `Expected item '${this.data.name}' but got '${effect?.name}'`,
            );
        }
        return effect;
    }

    private static requireString(
        str?: string,
        name = "string",
        fail = (reasonStr: string) => {
            throw new Error(reasonStr);
        },
    ): asserts str is string {
        if (!str) return fail(`Missing ${name}`);
    }

    private static effectFailed(
        on: ItemOn,
        effectName?: string,
        reasonStr?: string,
    ): never {
        let s = `On-${on}`;
        if (effectName) s += ` ${effectName}`;
        s += " effect failed";
        if (reasonStr) s += `: ${reasonStr}`;
        throw new Error(s);
    }

    /**
     * Expects the initial `|-enditem|<holder>|<item>` event for consuming an
     * item.
     *
     * @param accept Callback to accept this pathway.
     * @param side Item holder reference.
     * @returns `true` if parsed, `undefined` otherwise.
     */
    private async consumeItem(
        ctx: BattleParserContext<"gen4">,
        accept: unordered.AcceptCallback,
        side: SideID,
    ): Promise<true | undefined> {
        const event = await tryVerify(ctx, "|-enditem|");
        if (!event) return;
        const [, identStr, itemName] = event.args;
        const ident = Protocol.parsePokemonIdent(identStr);
        if (ident.player !== side) return;
        const itemId = toIdName(itemName);
        if (itemId !== this.data.name) return;
        // Berries have to be explicitly eaten to gain their effect.
        if (this.data.isBerry && !event.kwArgs.eat) return;
        // This event is caused by resistSuper berries but only after the
        // current initial [eat] event that we're parsing.
        if (event.kwArgs.weaken) return;
        // Differentiate from item-removal/stealeat move effects.
        if (event.kwArgs.from || event.kwArgs.move || event.kwArgs.of) return;
        accept();
        await base["|-enditem|"](ctx);
        return true;
    }

    /**
     * Checks whether the described HP threshold item can activate for the
     * holder.
     *
     * @param mon Potential item holder.
     * @param threshold Item activation HP threshold.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    private checkHpThreshold(
        mon: Pokemon | PreTurnSnapshotPokemon,
        threshold: number,
    ): Set<inference.SubReason> | null {
        // TODO: Is percentHP reliable? how does PS/cart handle rounding?
        const percentHp = (100 * mon.hp.current) / mon.hp.max;

        // Can't infer abilities.
        if (mon.volatile.suppressAbility) {
            if (percentHp <= threshold) return new Set();
            return null;
        }

        const {ability} = mon.traits; // Shorthand.

        const blockingAbilities = reason.ability.itemIgnoring(mon);
        if (blockingAbilities.size >= ability.size) return null;

        // Check if gluttony may be relevant if it's possible to have it.
        const nonEarlyBerryAbilities = [...ability.possibleValues].filter(
            n => !ability.map[n].flags?.earlyBerry,
        );
        // If we're in range for gluttony but not for normal berry activation,
        // gluttony may be the deciding factor here.
        if (
            this.data.isBerry &&
            threshold === 25 &&
            percentHp > 25 &&
            percentHp <= 50 &&
            nonEarlyBerryAbilities.length < ability.size
        ) {
            // Abilities must have earlyBerry flag.
            for (const n of nonEarlyBerryAbilities) blockingAbilities.add(n);
        }
        // Gluttony isn't applicable, just do regular hp check.
        else if (percentHp > threshold) return null;

        if (blockingAbilities.size <= 0) return new Set();
        if (blockingAbilities.size >= ability.size) return null;
        return new Set([reason.ability.doesntHave(mon, blockingAbilities)]);
    }

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
            if (!this.isEventFromItem(event)) return false;
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
                if (!this.isEventFromItem(e)) return false;
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

    /** Verifies that the event's `[from]` effect suffix matches this Item. */
    private isEventFromItem(
        event: Event<Protocol.BattleArgsWithKWArgName>,
    ): boolean {
        const from = Protocol.parseEffect(
            (event.kwArgs as {from?: string}).from,
            toIdName,
        );
        return this.isEffectFromItem(from);
    }

    /** Verifies that a parsed effect string matches this Item. */
    private isEffectFromItem(
        effect: ReturnType<typeof Protocol["parseEffect"]>,
    ): boolean {
        return (
            (!effect.type || effect.type === "item") &&
            effect.name === this.data.name
        );
    }

    //#endregion
}
