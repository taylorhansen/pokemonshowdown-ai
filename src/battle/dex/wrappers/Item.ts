import * as events from "../../parser/BattleEvent";
import { ParserState, SubParser } from "../../parser/BattleParser";
import { ItemResult } from "../../parser/gen4/activateItem";
import { handlers as base } from "../../parser/gen4/base";
import { SubReason } from "../../parser/gen4/EventInference";
import { cantHaveKlutz, checkKlutz, hasAbility, moveIsType } from
    "../../parser/gen4/helpers";
import * as parsers from "../../parser/gen4/parsers";
import { ItemConsumeResult } from "../../parser/gen4/removeItem";
import { hasStatus, matchPercentDamage } from "../../parser/helpers";
import { Pokemon } from "../../state/Pokemon";
import { Side } from "../../state/Side";
import * as dexutil from "../dex-util";
import { getAttackerTypes, getTypeEffectiveness } from "../typechart";

/** Encapsulates item properties. */
export class Item
{
    // TODO: eventually make #data inaccessible apart from internal dex
    /**
     * Creates an Item data wrapper.
     * @param data Item data from dex.
     */
    constructor(public readonly data: dexutil.ItemData) {}

    //#region onX() effect parsers for main activateItem parser

    //#region on-movePostDamage parser

    /**
     * Activates an item on-`movePostDamage` (e.g. lifeorb).
     * @param holderRef Item holder reference.
     */
    public async* onMovePostDamage(pstate: ParserState, holderRef: Side):
        SubParser<ItemResult>
    {
        if (this.data.on?.movePostDamage)
        {
            // self-damage
            if (this.data.on.movePostDamage.percentDamage)
            {
                const damageResult = yield* parsers.percentDamage(pstate,
                    holderRef, this.data.on.movePostDamage.percentDamage);
                // TODO: permHalt check?
                let lastEvent = damageResult.event;
                if (damageResult.success === true)
                {
                    this.indirectDamage(pstate, holderRef);
                    lastEvent = (yield* parsers.update(pstate, lastEvent))
                        .event;
                    return {...lastEvent && {event: lastEvent}};
                }
                throw new Error("On-movePostDamage percentDamage effect " +
                    "failed");
            }
        }
        throw new Error("On-movePostDamage effect shouldn't activate for " +
            `item '${this.data.name}'`);
    }

    //#endregion

    //#region on-turn parser

    /**
     * Handles events due to a turn item (e.g. leftovers).
     * @param holderRef Item holder reference.
     */
    public async* onTurn(pstate: ParserState, holderRef: Side):
        SubParser<ItemResult>
    {
        const holder = pstate.state.teams[holderRef].active;
        if (this.data.on?.turn)
        {
            let lastEvent: events.Any | undefined;
            let allSilent = true;

            // leftovers, blacksludge, etc
            const isPoison = holder.types.includes("poison");
            const percentDamage =
                this.data.on.turn[isPoison ? "poisonDamage" : "noPoisonDamage"];
            if (percentDamage)
            {
                const damageResult = yield* parsers.percentDamage(pstate,
                    holderRef, percentDamage, lastEvent);
                // TODO: permHalt check?
                lastEvent = damageResult.event;
                if (damageResult.success === true)
                {
                    this.indirectDamage(pstate, holderRef);
                    lastEvent = (yield* parsers.update(pstate, lastEvent))
                        .event;
                    allSilent = false;
                }
            }

            // toxicorb, etc
            if (this.data.on.turn.status)
            {
                const statusResult = yield* parsers.status(pstate,
                    holderRef, [this.data.on.turn.status], lastEvent);
                lastEvent = statusResult.event;
                if (statusResult.success === this.data.on.turn.status)
                {
                    lastEvent = (yield* parsers.update(pstate, lastEvent))
                        .event;
                    allSilent = false;
                }
            }

            if (!allSilent) return {...lastEvent && {event: lastEvent}};
        }
        throw new Error("On-turn effect shouldn't activate for item " +
            `'${this.data.name}'`);
    }

    //#endregion

    //#region onX() method helpers

    /**
     * Indicates that the item holder received indirect damage from the item, in
     * order to make ability inferences.
     */
    private indirectDamage(pstate: ParserState, holderRef: Side): void
    {
        const holder = pstate.state.teams[holderRef].active;
        if (holder.volatile.suppressAbility) return;

        // can't have an ability that blocks indirect damage
        const ability = holder.traits.ability;
        const filteredAbilities =
            [...ability.possibleValues]
                .filter(n => ability.map[n].flags?.noIndirectDamage === true);
        if (filteredAbilities.length >= ability.size)
        {
            throw new Error(`Pokemon '${holderRef}' received indirect damage ` +
                `from item '${this.data.name}' even though its ability ` +
                `[${[...ability.possibleValues].join(", ")}] suppresses that ` +
                "damage");
        }
        ability.remove(filteredAbilities);
    }

    //#endregion

    //#endregion

    //#region consumeOnX() effect parsers for main removeItem parser

    //#region consumeOn-preMove parser

    /**
     * Activates an item on-`preMove` (e.g. custapberry).
     * @param holderRef Item holder reference.
     */
    public async* consumeOnPreMove(pstate: ParserState, holderRef: Side):
        SubParser<ItemConsumeResult>
    {
        if (this.data.consumeOn?.preMove)
        {
            if (this.data.consumeOn.preMove.moveFirst &&
                this.data.consumeOn.preMove.threshold)
            {
                const holder = pstate.state.teams[holderRef].active;
                Item.assertHPThreshold(holder,
                    this.data.consumeOn.preMove.threshold);
                return {moveFirst: true};
            }
        }
        throw new Error(`ConsumeOn-preMove effect shouldn't activate for ` +
            `item '${this.data.name}'`);
    }

    //#endregion

    //#region consumeOn-moveCharge parser

    /**
     * Activates an item on-`moveCharge` (e.g. powerherb).
     */
    public async* consumeOnMoveCharge(): SubParser<ItemConsumeResult>
    {
        if (this.data.consumeOn?.moveCharge)
        {
            if (this.data.consumeOn.moveCharge === "shorten")
            {
                return {shorten: true};
            }
        }
        throw new Error(`ConsumeOn-moveCharge effect shouldn't activate for ` +
            `item '${this.data.name}'`);
    }

    //#endregion

    //#region consumeOn-preHit parser

    /**
     * Activates an item on-`preHit` (e.g. resist berries).
     * @param holderRef Item holder reference.
     * @param hitBy Move+user the holder is being hit by.
     */
    public async* consumeOnPreHit(pstate: ParserState, holderRef: Side,
        hitBy: dexutil.MoveAndUser): SubParser<ItemConsumeResult>
    {
        const holder = pstate.state.teams[holderRef].active;
        if (this.data.consumeOn?.preHit)
        {
            const {resistSuper} = this.data.consumeOn.preHit;
            if (resistSuper)
            {
                // assert that the holder is weak to this type
                const {types} = holder;
                const eff = getTypeEffectiveness(types, resistSuper);
                if (eff !== "super")
                {
                    // TODO: log error instead of throwing?
                    throw new Error("Expected type effectiveness to be " +
                        `'super' but got '${eff}' for '${resistSuper}' vs ` +
                        `[${types.join(", ")}]`);
                }

                // infer move type based on resist berry type
                hitBy.move.assertType(resistSuper, hitBy.user);
                return {resistSuper};
            }
        }
        throw new Error(`ConsumeOn-preHit effect shouldn't activate for ` +
            `item '${this.data.name}'`);
    }

    //#endregion

    //#region consumeOn-super parser

    /**
     * Activates an item on-`super` (e.g. enigmaberry).
     * @param holderRef Item holder reference.
     */
    public async* consumeOnSuper(pstate: ParserState, holderRef: Side):
        SubParser<ItemConsumeResult>
    {
        if (this.data.consumeOn?.super)
        {
            const {heal} = this.data.consumeOn.super;
            // TODO: assert type effectiveness from hitby-move?
            if (heal) return yield* Item.heal(pstate, "super", holderRef, heal);
        }
        throw new Error(`ConsumeOn-super effect shouldn't activate for ` +
            `item '${this.data.name}'`);
    }

    //#endregion

    //#region consumeOn-postHit parser

    /**
     * Activates an item on-`postHit` (e.g. jabocaberry/rowapberry).
     * @param holderRef Item holder reference.
     * @param hitBy Move+user the holder is being hit by.
     */
    public async* consumeOnPostHit(pstate: ParserState, holderRef: Side,
        hitBy: dexutil.MoveAndUserRef): SubParser<ItemConsumeResult>
    {
        if (this.data.consumeOn?.postHit)
        {
            const {condition, damage} = this.data.consumeOn.postHit;
            if (hitBy.move.data.category !== condition)
            {
                throw new Error("Mismatched move category: expected " +
                    `'${condition}' but got '${hitBy.move.data.category}'`);
            }
            if (damage)
            {
                const damageResult = yield* parsers.percentDamage(pstate,
                    hitBy.userRef, -damage);
                let lastEvent = damageResult.event;
                if (!damageResult.success)
                {
                    throw new Error("ConsumeOn-postHit damage effect failed");
                }
                if (damageResult.success === true)
                {
                    // after taking damage, check if any other items need to
                    //  activate
                    lastEvent = (yield* parsers.update(pstate, lastEvent))
                        .event;
                }
                return {...lastEvent && {event: lastEvent}};
            }
        }
        throw new Error(`ConsumeOn-postHit effect shouldn't activate for ` +
            `item '${this.data.name}'`);
    }

    //#endregion

    //#region consumeOn-update parser

    /**
     * Activates an item on-`update` (e.g. sitrusberry).
     * @param holderRef Item holder reference.
     */
    public async* consumeOnUpdate(pstate: ParserState, holderRef: Side):
        SubParser<ItemConsumeResult>
    {
        const holder = pstate.state.teams[holderRef].active;
        const data = this.data.consumeOn?.update;
        switch (data?.condition)
        {
            case "hp":
                Item.assertHPThreshold(holder, data.threshold);
                switch (data.effect.type)
                {
                    case "healPercent": case "healFixed":
                    {
                        const healResult = yield* Item.heal(pstate, "update",
                            holderRef, data.effect.heal);
                        let lastEvent = healResult.event;
                        if (data.effect.dislike)
                        {
                            // TODO: assert nature
                            const statusResult = yield* parsers.status(pstate,
                                holderRef, ["confusion"], lastEvent);
                            lastEvent = statusResult.event;
                        }
                        return {...lastEvent && {event: lastEvent}};
                    }
                    case "boost":
                    {
                        const boostResult = yield* parsers.boostOne(pstate,
                            holderRef, data.effect.boostOne);
                        if (!boostResult.success)
                        {
                            throw new Error("ConsumeOn-update boost effect " +
                                "failed");
                        }
                        return {
                            ...boostResult.event && {event: boostResult.event}
                        };
                    }
                    case "focusEnergy":
                    {
                        const statusResult = yield* parsers.status(pstate,
                            holderRef, ["focusEnergy"]);
                        if (!statusResult.success)
                        {
                            throw new Error("ConsumeOn-update focusEnergy " +
                                "effect failed");
                        }
                        return {
                            ...statusResult.event && {event: statusResult.event}
                        };
                    }
                    default:
                        // istanbul ignore next: should never happen
                        throw new Error("ConsumeOn-update effect failed: " +
                            `Unknown effect type '${data.effect!.type}'`);
                }
            case "status":
            {
                // cure all the relevant statuses
                const statusResult = yield* parsers.cure(pstate, holderRef,
                    Object.keys(data.cure) as dexutil.StatusType[]);
                if (statusResult.ret !== true && statusResult.ret !== "silent")
                {
                    throw new Error("ConsumeOn-update cure effect failed");
                }
                return {...statusResult.event && {event: statusResult.event}};
            }
            case "depleted":
            {
                // restore pp
                const event = yield;
                if (event.type !== "modifyPP" || event.monRef !== holderRef ||
                    event.amount !== data.restore)
                {
                    throw new Error("ConsumeOn-update restore effect failed");
                }
                const result = yield* base.modifyPP(pstate, event);
                return {...result.event && {event: result.event}};
            }
        }
        // istanbul ignore next: should never happen
        throw new Error(`ConsumeOn-update effect shouldn't activate for ` +
            `item '${this.data.name}'`);
    }

    //#endregion

    //#region consumeOn-residual parser

    /**
     * Activates an item on-`residual` (e.g. micleberry).
     * @param holderRef Item holder reference.
     */
    public async* consumeOnResidual(pstate: ParserState, holderRef: Side):
        SubParser<ItemConsumeResult>
    {
        if (this.data.consumeOn?.residual)
        {
            const holder = pstate.state.teams[holderRef].active;
            Item.assertHPThreshold(holder,
                this.data.consumeOn.residual.threshold);
            if (this.data.consumeOn.residual.status === "micleberry")
            {
                holder.volatile.micleberry = true;
                return {};
            }
        }
        throw new Error(`ConsumeOn-residual effect shouldn't activate for ` +
            `item '${this.data.name}'`);
    }

    //#endregion

    //#region consumeOnX() method helpers

    /** Makes HP/ability assertions based on item activation HP threshold. */
    private static assertHPThreshold(holder: Pokemon, threshold: number): void
    {
        const percentHP = 100 * holder.hp.current / holder.hp.max;
        if (threshold === 25 && percentHP > 25 && percentHP <= 50)
        {
            if (holder.volatile.suppressAbility)
            {
                throw new Error("Holder must have early-berry (gluttony) " +
                    "ability but ability is suppressed");
            }
            holder.traits.ability.narrow((_, a) => !!a.flags?.earlyBerry);
        }
        else if (percentHP > threshold)
        {
            throw new Error(`Holder expected to have HP (${percentHP}%) to ` +
                `be below the item's activation threshold of ${threshold}%`);
        }
    }

    /** Handles heal effect from items. */
    private static async* heal(pstate: ParserState, on: dexutil.ItemConsumeOn,
        holderRef: Side, percent: number): SubParser<ItemConsumeResult>
    {
        const healResult = yield* parsers.percentDamage(pstate, holderRef,
            percent);
        if (!healResult.success)
        {
            throw new Error(`ConsumeOn-${on} heal effect failed`);
        }
        return {...healResult.event && {event: healResult.event}};
    }

    //#endregion

    //#endregion

    //#region canX() SubReason builders for onX() activateItem parsers

    //#region on-movePostDamage reason

    /**
     * Checks whether the item can activate on-`movePostDamage`.
     * @param mon Potential item holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canMovePostDamage(mon: Pokemon): Set<SubReason> | null
    {
        if (!this.data.on?.movePostDamage) return null;

        // check for abilities that would block the item
        // can't be blocked if ability is suppressed
        if (mon.volatile.suppressAbility) return new Set();

        const abilities = new Set(mon.traits.ability.possibleValues);
        // if the effect is silent or nonexistent, leave it
        const percent = this.data.on.movePostDamage.percentDamage;
        if (percent && !matchPercentDamage(percent, mon.hp.current, mon.hp.max))
        {
            // filter ability possibilities that can block the remaining effects
            // if one effect can't be suppressed, then the item should activate
            for (const abilityName of abilities)
            {
                const ability = mon.traits.ability.map[abilityName];
                if (ability.flags?.ignoreItem) continue;
                if (percent < 0 &&
                    ability.flags?.noIndirectDamage === true)
                {
                    continue;
                }
                abilities.delete(abilityName);
            }
        }
        else return null;
        if (abilities.size <= 0) return new Set();
        if (abilities.size >= mon.traits.ability.size) return null;
        return new Set([hasAbility(mon, abilities, /*negative*/ true)]);
    }

    //#endregion

    //#endregion

    //#region canConsumeX() SubReason builders for consumeOnX() removeItem
    //  parsers

    //#region consumeOn-preMove reason

    /**
     * Checks whether the item can activate consumeOn-`preMove`.
     * @param mon Potential item holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canConsumePreMove(mon: Pokemon): Set<SubReason> | null
    {
        if (!this.data.consumeOn?.preMove) return null;
        return this.checkHPThreshold(mon,
            this.data.consumeOn.preMove.threshold);
    }

    //#endregion

    //#region consumeOn-moveCharge reason

    /**
     * Checks whether the item can activate consumeOn-`moveCharge`.
     * @param mon Potential item holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canConsumeMoveCharge(mon: Pokemon): Set<SubReason> | null
    {
        if (!this.data.consumeOn?.moveCharge) return null;
        if (this.data.consumeOn.moveCharge === "shorten")
        {
            return cantHaveKlutz(mon);
        }
        return null;
    }

    //#endregion

    //#region consumeOn-preHit reason

    /**
     * Checks whether the item can activate consumeOn-`preHit`.
     * @param mon Potential item holder.
     * @param hitBy Move+user the holder was hit by.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canConsumePreHit(mon: Pokemon, hitBy: dexutil.MoveAndUser):
        Set<SubReason> | null
    {
        if (!this.data.consumeOn?.preHit) return null;

        const result = cantHaveKlutz(mon);
        if (!result) return null;

        const {resistSuper} = this.data.consumeOn.preHit;
        if (resistSuper)
        {
            // can't activate if holder isn't weak to the type this item
            //  protects against (unless normal)
            if (resistSuper !== "normal" &&
                getTypeEffectiveness(mon.types, resistSuper) !== "super")
            {
                return null;
            }
            // can't activate for status/fixed-damage moves
            if (!hitBy.move.canBeEffective) return null;
            // will only work then if the move type is the protected type
            // TODO: don't add if already proven/disproven
            result.add(moveIsType(hitBy.move, hitBy.user,
                new Set([resistSuper])));
        }
        return result;
    }

    //#endregion

    //#region consumeOn-super reason

    /**
     * Checks whether the item can activate consumeOn-`super`.
     * @param mon Potential item holder.
     * @param hitBy Move+user the holder was hit by.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canConsumeSuper(mon: Pokemon, hitBy: dexutil.MoveAndUser):
        Set<SubReason> | null
    {
        if (!this.data.consumeOn?.super) return null;

        const result = cantHaveKlutz(mon);
        if (!result || !hitBy.move.canBeEffective) return null;
        // move must be super-effective
        result.add(moveIsType(hitBy.move, hitBy.user,
                getAttackerTypes(mon.types, "super")))
        return result;
    }

    //#endregion

    //#region consumeOn-postHit reason

    /**
     * Checks whether the item can activate consumeOn-`postHit`.
     * @param mon Potential item holder.
     * @param hitBy Move+user the holder was hit by.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canConsumePostHit(mon: Pokemon, hitBy: dexutil.MoveAndUser):
        Set<SubReason> | null
    {
        if (!this.data.consumeOn?.postHit) return null;

        if (this.data.consumeOn.postHit.condition === hitBy.move.data.category)
        {
            // items with -damage will activate even if opponent's hp = 0
            // can likely assume the same for +damage items, but such a case
            //  would be harder to test
            return cantHaveKlutz(mon);
        }
        return null;
    }

    //#endregion

    //#region consumeOn-update reason

    /**
     * Checks whether the item can activate consumeOn-`update`.
     * @param mon Potential item holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canConsumeUpdate(mon: Pokemon): Set<SubReason> | null
    {
        switch (this.data.consumeOn?.update?.condition)
        {
            case "hp":
                return this.checkHPThreshold(mon,
                        this.data.consumeOn.update.threshold);
            case "status":
            {
                const {cure} = this.data.consumeOn.update;
                let canCure = false;
                for (const status in cure)
                {
                    if (!cure.hasOwnProperty(status)) continue;
                    if (canCure ||=
                        hasStatus(mon, status as dexutil.StatusType))
                    {
                        break;
                    }
                }
                if (!canCure) return null;
                return cantHaveKlutz(mon);
            }
            case "depleted":
                for (const move of mon.moveset.moves.values())
                {
                    // TODO: pp may be uncertain in corner cases, handle
                    //  these then add a SubReason to support this later
                    if (move.pp > 0) continue;
                    return cantHaveKlutz(mon);
                }
                // fallthrough
            default: return null;
        }
    }

    //#endregion

    //#region consumeOn-residual reason

    /**
     * Checks whether the item can activate consumeOn-`residual`.
     * @param mon Potential item holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canConsumeResidual(mon: Pokemon): Set<SubReason> | null
    {
        if (!this.data.consumeOn?.residual) return null;
        return this.checkHPThreshold(mon,
            this.data.consumeOn.residual.threshold);
    }

    //#endregion

    //#region canConsumeX() method helpers

    /**
     * Checks whether the described HP threshold item can activate for the
     * holder.
     * @param mon Potential item holder.
     * @param threshold Item activation HP threshold.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    private checkHPThreshold(mon: Pokemon, threshold: number):
        Set<SubReason> | null
    {
        // TODO: is percentHP reliable? how does PS/cart handle rounding?
        const percentHP = 100 * mon.hp.current / mon.hp.max;

        // can't infer abilities
        if (mon.volatile.suppressAbility)
        {
            if (percentHP <= threshold) return new Set();
            return null;
        }

        const {ability} = mon.traits; // shorthand

        const blockingAbilities = checkKlutz(mon);
        if (blockingAbilities.size >= ability.size) return null;

        // hp is between 25-50% so the 25% berry can't activate on it's own, but
        //  it can if the holder has gluttony ability
        if (this.data.isBerry && threshold === 25 && percentHP > 25 &&
            percentHP <= 50 &&
            [...ability.possibleValues].some(n =>
                ability.map[n].flags?.earlyBerry))
        {
            // TODO: PossibilityClass methods that abstract away #possibleValues
            //  set manipulations
            // all other non-gluttony abilities therefore block the activation
            //  of this item
            const abilities = [...ability.possibleValues].filter(
                n => !ability.map[n].flags?.earlyBerry);
            for (const n of abilities) blockingAbilities.add(n);
        }
        // gluttony isn't applicable, just do regular hp check
        else if (percentHP > threshold) return null;

        if (blockingAbilities.size <= 0) return new Set();
        if (blockingAbilities.size >= ability.size) return null;
        return new Set([hasAbility(mon, blockingAbilities, /*negative*/ true)]);
    }

    //#endregion

    //#endregion
}
