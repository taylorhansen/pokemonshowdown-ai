import * as events from "../../parser/BattleEvent";
import { ParserState, SubParser } from "../../parser/BattleParser";
import { AbilityResult } from "../../parser/gen4/activateAbility";
import { dispatch, handlers as base } from "../../parser/gen4/base";
import { SubReason } from "../../parser/gen4/EventInference";
import { chanceReason, diffMoveType, moveIsType, opponentHasItem } from
    "../../parser/gen4/helpers";
import * as parsers from "../../parser/gen4/parsers";
import { hasStatus } from "../../parser/helpers";
import { Pokemon, ReadonlyPokemon } from "../../state/Pokemon";
import { otherSide, Side } from "../../state/Side";
import * as dex from "../dex";
import * as dexutil from "../dex-util";

/** Encapsulates ability properties. */
export class Ability
{
    // TODO: eventually make #data inaccessible apart from internal dex
    /**
     * Creates an Ability data wrapper.
     * @param data Ability data from dex.
     */
    constructor(public readonly data: dexutil.AbilityData) {}

    //#region onX() effect parsers for main activateAbility parser

    //#region on-switchOut parser

    /**
     * Activates an ability on-`switchOut`.
     * @param holderRef Ability holder reference.
     */
    public async* onSwitchOut(pstate: ParserState, holderRef: Side):
        SubParser<AbilityResult>
    {
        if (this.data.on?.switchOut)
        {
            // cure major status
            if (this.data.on.switchOut.cure)
            {
                const next = yield;
                if (next.type !== "activateStatusEffect" || next.start ||
                    next.monRef !== holderRef ||
                    !dexutil.isMajorStatus(next.effect))
                {
                    // TODO: better error messages
                    throw new Error("On-switchOut cure effect failed");
                }
                return yield* base.activateStatusEffect(pstate, next);
            }
        }
        throw new Error("On-switchOut effect shouldn't activate for ability " +
            `'${this.data.name}'`);
    }

    //#endregion

    //#region on-start parser

    /**
     * Activates an ability on-`start`.
     * @param holderRef Ability holder reference.
     */
    public async* onStart(pstate: ParserState, holderRef: Side):
        SubParser<AbilityResult>
    {
        if (this.data.on?.start)
        {
            // cure status immunity
            if (this.data.on.start.cure)
            {
                return yield* this.cure(pstate, "start", holderRef);
            }
            // trace
            if (this.data.on.start.copyFoeAbility)
            {
                return yield* this.copyFoeAbility(pstate, holderRef);
            }
            // frisk
            if (this.data.on.start.revealItem)
            {
                return yield* this.revealItem(pstate, holderRef);
            }
            // forewarn
            if (this.data.on.start.warnStrongestMove)
            {
                return yield* this.warnStrongestMove(pstate, holderRef);
            }
            // if nothing is set, then the ability just reveals itself
            // TODO: pressure/moldbreaker
            return {};
        }
        throw new Error("On-start effect shouldn't activate for ability " +
            `'${this.data.name}'`);
    }

    // onStart() helpers

    /**
     * Handles events due to a statusImmunity ability curing a status (e.g.
     * Insomnia).
     * @param on Circumstance under which the ability is activating.
     * @param holderRef Ability holder reference.
     */
    private async* cure(pstate: ParserState, on: dexutil.AbilityOn,
        holderRef: Side): SubParser<AbilityResult>
    {
        const next = yield;
        if (next.type !== "activateStatusEffect" || next.start ||
            next.monRef !== holderRef ||
            !this.data.statusImmunity?.[next.effect])
        {
            // TODO: better error messages
            throw new Error(`On-${on} cure effect failed`);
        }
        return yield* base.activateStatusEffect(pstate, next);
    }

    /**
     * Handles events due to a copeFoeAbility ability (e.g. Trace).
     * @param holderRef Ability holder reference.
     */
    private async* copyFoeAbility(pstate: ParserState, holderRef: Side):
        SubParser<AbilityResult>
    {
        // handle trace events
        // activateAbility holder <ability> (copied ability)
        const next = yield;
        if (next.type !== "activateAbility" || next.monRef !== holderRef)
        {
            throw new Error("On-start copyFoeAbility effect failed");
        }
        const holder = pstate.state.teams[holderRef].active;
        holder.volatile.overrideTraits =
            holder.baseTraits.divergeAbility(next.ability);

        // TODO: these should be revealAbility events and delegated to base
        // activateAbility target <ability> (describe trace target)
        const next2 = yield;
        if (next2.type !== "activateAbility" || next2.monRef === holderRef ||
            next2.ability !== next.ability)
        {
            throw new Error("On-start copyFoeAbility effect failed");
        }
        const targetRef = next2.monRef;
        const target = pstate.state.teams[targetRef].active;
        target.setAbility(next2.ability);

        // possible on-start activation for holder's new ability
        // if no activation, don't need to consume anymore events
        // TODO: call onStart?
        const next3 = yield;
        if (next3.type !== "activateAbility") return {event: next3};
        if (next3.monRef !== holderRef) return {event: next3};
        if (next3.ability !== next.ability) return {event: next3};
        const traced = dex.getAbility(next3.ability);
        if (!traced?.data.on?.start) return {event: next3};
        return yield* base.activateAbility(pstate, next3, "start");
    }

    /**
     * Handles events due to a revealItem ability (e.g. Frisk).
     * @param holderRef Ability holder reference.
     */
    private async* revealItem(pstate: ParserState, holderRef: Side):
        SubParser<AbilityResult>
    {
        // handle frisk events
        // revealItem target <item>
        const next = yield;
        if (next.type !== "revealItem" || next.monRef === holderRef ||
            next.gained)
        {
            throw new Error("On-start revealItem effect failed");
        }
        return yield* base.revealItem(pstate, next);
    }

    /**
     * Handles events due to a warnStrongestMove ability (e.g. Forewarn).
     * @param holderRef Ability holder reference.
     */
    private async* warnStrongestMove(pstate: ParserState, holderRef: Side):
        SubParser<AbilityResult>
    {
        // handle forewarn events
        // revealMove target <move>
        const next = yield;
        if (next.type !== "revealMove" || next.monRef === holderRef)
        {
            throw new Error("On-start warnStrongestMove effect failed");
        }
        const subResult = yield* base.revealMove(pstate, next);

        // rule out moves stronger than this one
        const {moveset} = pstate.state.teams[next.monRef].active;
        const bp = Ability.getForewarnPower(next.move);
        const strongerMoves = [...moveset.constraint]
            .filter(m => Ability.getForewarnPower(m) > bp);
        moveset.inferDoesntHave(strongerMoves);

        return subResult;
    }

    /**
     * Looks up the base power of a move based on how the Forewarn ability
     * evaluates it.
     */
    private static getForewarnPower(move: string): number
    {
        const data = dex.getMove(move)?.data;
        if (!data) return 0;
        // ohko moves
        if (data.damage === "ohko") return 160;
        // counter moves
        if (data.damage === "counter" || data.damage === "metalburst")
        {
            return 120;
        }
        // fixed damage/variable power moves (hiddenpower, lowkick, etc)
        if (!data.basePower && data.category !== "status") return 80;
        // regular base power, eruption/waterspout and status moves
        return data.basePower;
    }

    //#endregion

    //#region on-block parser

    /**
     * Activates an ability on-`block`.
     * @param holderRef Ability holder reference.
     * @param hitBy Move+user that the holder was hit by, if applicable.
     */
    public onBlock(pstate: ParserState, holderRef: Side,
        hitBy?: dexutil.MoveAndUserRef): SubParser<AbilityResult>
    {
        // TODO: assert non-ignoreTargetAbility (moldbreaker) after handling
        if (this.data.on?.block)
        {
            // block status
            if (this.data.on.block.status)
            {
                return this.blockStatus(pstate, holderRef);
            }
            // block move type
            if (this.data.on.block.move)
            {
                if (!hitBy)
                {
                    throw new Error("On-block move effect failed: " +
                        "Attacking move not specified.");
                }
                const hitByUser = pstate.state.teams[hitBy.userRef].active;
                return this.blockMove(pstate, holderRef, hitBy.move, hitByUser);
            }
            // block effect
            if (this.data.on.block.effect) return this.blockEffect(pstate);
        }
        throw new Error("On-block effect shouldn't activate for ability " +
            `'${this.data.name}'`);
    }

    // onBlock() helpers

    /**
     * Handles events due to a status-blocking ability (e.g. Immunity).
     * @param holderRef Ability holder reference.
     */
    private async* blockStatus(pstate: ParserState, holderRef: Side):
        SubParser<AbilityResult>
    {
        const statuses = this.data.statusImmunity;
        if (statuses)
        {
            // should have a fail or immune event
            const next = yield;
            if (next.type === "fail" ||
                (next.type === "immune" && next.monRef === holderRef))
            {
                return {
                    ...yield* dispatch(pstate, next),
                    // silent blocked statuses are handled by a different parser
                    blockStatus: Object.fromEntries(Object.entries(statuses)
                            .filter(([, v]) => v === true))
                };
            }
        }
        throw new Error("On-block status effect failed");
    }

    /**
     * Handles events due to an ability immunity to a move (e.g. Water Absorb).
     * @param holderRef Ability holder reference.
     * @param hitByMove Move the holder will be hit by.
     * @param hitByUser User of the `hitByMove`.
     */
    private async* blockMove(pstate: ParserState, holderRef: Side,
        hitByMove: dex.Move, hitByUser: Pokemon): SubParser<AbilityResult>
    {
        const blockData = this.data.on?.block?.move;
        // istanbul ignore next: should never happen
        if (!blockData) throw new Error("On-block move effect failed");

        // TODO: type effectiveness assertion
        if (blockData.type !== "nonSuper")
        {
            hitByMove.assertType(blockData.type, hitByUser);
        }

        let silent = true;
        let lastEvent: events.Any | undefined;
        // self-boost effect
        if (blockData.boost)
        {
            const boostResult = yield* parsers.boost(pstate, holderRef,
                blockData.boost, /*set*/ false, /*silent*/ true, lastEvent);
            if (Object.keys(boostResult.remaining).length > 0)
            {
                // TODO: specify errors
                throw new Error("On-block move boost effect failed");
            }
            // TODO: permHalt check?
            lastEvent = boostResult.event;
            silent &&= !!boostResult.allSilent;
        }
        // self-damage/heal effect
        if (blockData.percentDamage)
        {
            const damageResult = yield* parsers.percentDamage(pstate, holderRef,
                blockData.percentDamage, lastEvent);
            if (!damageResult.success)
            {
                throw new Error("On-block move percentDamage effect failed");
            }
            lastEvent = damageResult.event;
            silent &&= damageResult.success === "silent";
        }
        // self-status effect
        if (blockData.status)
        {
            const statusResult = yield* parsers.status(pstate, holderRef,
                [blockData.status], lastEvent);
            if (!statusResult.success)
            {
                throw new Error("On-block move status effect failed");
            }
            lastEvent = statusResult.event;
            silent &&= statusResult.success === true;
        }

        // if the ability effects can't cause an explicit game event, then the
        //  least it can do is give an immune event
        if (silent)
        {
            lastEvent ??= yield;
            if (lastEvent.type !== "immune" || lastEvent.monRef !== holderRef)
            {
                throw new Error("On-block move effect failed");
            }
            return {...yield* base.immune(pstate, lastEvent), immune: true};
        }

        return {...lastEvent && {event: lastEvent}, immune: true};
    }

    /**
     * Handles events due to a certain effect type being blocked (e.g. Damp vs
     * Explosion)
     */
    private async* blockEffect(pstate: ParserState):
        SubParser<AbilityResult>
    {
        const explosive = this.data.on?.block?.effect?.explosive;

        // should see a fail event
        const next = yield;
        if (next.type !== "fail")
        {
            throw new Error(`On-block effect${explosive ? " explosive" : ""} ` +
                "failed");
        }

        return {...yield* base.fail(pstate, next), failed: true};
    }

    //#endregion

    //#region on-tryUnboost parser

    /** Activates an ability on-`tryUnboost`. */
    public onTryUnboost(pstate: ParserState): SubParser<AbilityResult>
    {
        // TODO: assert non-ignoreTargetAbility (moldbreaker) after handling if
        //  this is due to a move effect
        if (this.data.on?.tryUnboost)
        {
            if (this.data.on.tryUnboost.block) return this.blockUnboost(pstate);
        }
        throw new Error("On-tryUnboost effect shouldn't activate for ability " +
            `'${this.data.name}'`);
    }

    /** Handles events due to an unboost-blocking ability (e.g. Clear Body). */
    private async* blockUnboost(pstate: ParserState): SubParser<AbilityResult>
    {
        const boosts = this.data.on?.tryUnboost?.block;
        // istanbul ignore next: should never happen
        if (!boosts) throw new Error("On-tryUnboost block effect failed");

        // should get a fail event
        const next = yield;
        if (next.type !== "fail")
        {
            throw new Error("On-tryUnboost block effect failed");
        }
        return {...yield* base.fail(pstate, next), blockUnboost: boosts};
    }

    //#endregion

    //#region on-status parser

    /**
     * Activates an ability on-`status`.
     * @param holderRef Ability holder reference.
     */
    public onStatus(pstate: ParserState, holderRef: Side):
        SubParser<AbilityResult>
    {
        if (this.data.on?.status)
        {
            // cure status immunity
            if (this.data.on.status.cure)
            {
                return this.cure(pstate, "status", holderRef);
            }
        }
        throw new Error("On-status effect shouldn't activate for ability " +
            `'${this.data.name}'`);
    }

    //#endregion

    //#region on-moveContactKO/moveContact/moveDamage parsers

    /**
     * Activates an ability on-`moveContactKO`/`moveContact`/`moveDamage`.
     * @param on Which on-`X` we're talking about.
     * @param holderRef Ability holder reference.
     * @param hitBy Move+user that the holder was hit by, if applicable.
     */
    public onMoveDamage(pstate: ParserState, on: dexutil.AbilityOn,
        holderRef: Side, hitBy?: dexutil.MoveAndUserRef):
        SubParser<AbilityResult>
    {
        if (!hitBy)
        {
            throw new Error(`On-${on} effect failed: ` +
                "Attacking move/user not specified.");
        }
        switch (on)
        {
            case "moveContactKO":
                if (this.data.on?.moveContactKO)
                {
                    return this.moveContactKO(pstate, hitBy.userRef);
                }
                // fallthrough: `on` may be overqualified
            case "moveContact":
                if (this.data.on?.moveContact)
                {
                    return this.moveContact(pstate, hitBy.userRef);
                }
                // fallthrough: `on` may be overqualified
            case "moveDamage":
                if (this.data.on?.moveDamage)
                {
                    // colorchange
                    if (this.data.on.moveDamage.changeToMoveType &&
                        // this effect target's holder so can't activate if ko'd
                        on !== "moveContactKO")
                    {
                        return this.changeToMoveType(pstate, holderRef, hitBy);
                    }
                }
                // fallthrough: no viable activation effects
            default:
                throw new Error(`On-${on} effect shouldn't activate for ` +
                    `ability '${this.data.name}'`);
        }
    }

    /**
     * Handles events due to a moveContactKO ability (e.g. Aftermath).
     * @param hitByUserRef Pokemon reference to the user of the move by which
     * the ability holder was hit.
     */
    private async* moveContactKO(pstate: ParserState, hitByUserRef: Side):
        SubParser<AbilityResult>
    {
        const effectData = this.data.on?.moveContactKO;
        // istanbul ignore next: should never happen
        if (!effectData) throw new Error("On-moveContactKO effect failed");

        let silent = true;
        let lastEvent: events.Any | undefined;
        if (effectData.percentDamage)
        {
            const damageResult = yield* parsers.percentDamage(pstate,
                hitByUserRef, effectData.percentDamage, lastEvent);
            if (!damageResult.success)
            {
                throw new Error("On-moveContactKO " +
                    (effectData.explosive ? "explosive " : "") +
                    "percentDamage effect failed");
            }
            // TODO: permHalt check?
            lastEvent = damageResult.event;
            silent &&= damageResult.success === "silent";
            // update items
            lastEvent = (yield* parsers.update(pstate, lastEvent)).event;
        }

        // if the ability effects can't cause an explicit game event, then it
        //  shouldn't have activated in the first place
        if (silent) throw new Error("On-moveContactKO effect failed");

        if (effectData.explosive)
        {
            // assert non-explosive-blocking ability (damp)
            const hitByUser = pstate.state.teams[hitByUserRef].active;
            if (!hitByUser.volatile.suppressAbility)
            {
                hitByUser.traits.ability.remove(
                    (_, a) => !!a.on?.block?.effect?.explosive);
            }
        }

        return {...lastEvent && {event: lastEvent}};
    }

    /**
     * Handles events due to a moveContact ability (e.g. Rough Skin).
     * @param hitByUserRef Pokemon reference to the user of the move by which
     * the ability holder was hit.
     */
    private async* moveContact(pstate: ParserState, hitByUserRef: Side):
        SubParser<AbilityResult>
    {
        const effectData = this.data.on?.moveContact;
        // istanbul ignore next: should never happen
        if (!effectData) throw new Error("On-moveContact effect failed");

        let silent = true;
        let lastEvent: events.Any | undefined;
        if (effectData.percentDamage)
        {
            const damageResult = yield* parsers.percentDamage(pstate,
                hitByUserRef, effectData.percentDamage, lastEvent);
            if (!damageResult.success)
            {
                throw new Error("On-moveContact percentDamage effect " +
                    "failed");
            }
            lastEvent = damageResult.event;
            silent &&= damageResult.success === "silent";
        }
        if (effectData.status)
        {
            const statusResult = yield* parsers.status(pstate, hitByUserRef,
                effectData.status, lastEvent);
            if (!statusResult.success)
            {
                throw new Error("On-moveContact status effect failed");
            }
            lastEvent = statusResult.event;
            silent &&= statusResult.success === true;
        }

        // if the ability effects can't cause an explicit game event, then it
        //  shouldn't have activated in the first place
        if (silent) throw new Error("On-moveContact effect failed");

        return yield* parsers.update(pstate, lastEvent);
    }

    /**
     * Handles events due to a changeMoveType ability (e.g. Color Change).
     * Always targets ability holder.
     */
    private async* changeToMoveType(pstate: ParserState, holderRef: Side,
        hitBy: dexutil.MoveAndUserRef): SubParser<AbilityResult>
    {
        const next = yield;
        if (next.type !== "changeType" || next.monRef !== holderRef)
        {
            throw new Error("On-moveDamage changeToMoveType effect failed");
        }
        if (next.newTypes[1] !== "???")
        {
            throw new Error("On-moveDamage changeToMoveType effect failed: " +
                "Expected one type but got multiple " +
                `(${next.newTypes.join(", ")})`);
        }

        const user = pstate.state.teams[hitBy.userRef].active;
        hitBy.move.assertType(next.newTypes[0], user);

        return yield* base.changeType(pstate, next);
    }

    //#endregion

    //#region on-moveDrain parser

    /**
     * Activates an ability on-`moveDrain`.
     * @param hitByUserRef Pokemon reference to the user of the draining move.
     * Throws an error if not specified
     */
    public onMoveDrain(pstate: ParserState, hitByUserRef?: Side):
        SubParser<AbilityResult>
    {
        if (this.data.on?.moveDrain)
        {
            // invert drain effect to damage instead of heal
            if (this.data.on.moveDrain.invert)
            {
                if (!hitByUserRef)
                {
                    throw new Error("On-moveDrain invert effect failed: " +
                        "Attacking move user not specified.");
                }
                return this.invertDrain(pstate, hitByUserRef);
            }
        }
        throw new Error("On-moveDrain effect shouldn't activate for ability " +
            `'${this.data.name}'`);
    }

    /**
     * Handles events due to an invertDrain ability (e.g. Liquid Ooze). Always
     * targets the drain move's user.
     * @param holderRef Ability holder reference.
     * @param hitByUserRef Pokemon reference to the user of the draining move.
     */
    private async* invertDrain(pstate: ParserState, hitByUserRef: Side):
        SubParser<AbilityResult>
    {
        // expect the takeDamage event
        const damageResult = yield* parsers.damage(pstate, hitByUserRef,
            /*from*/ null, -1);
        if (!damageResult.success)
        {
            throw new Error("On-moveDrain invert effect failed");
        }
        let lastEvent = damageResult.event;
        lastEvent = (yield* parsers.update(pstate, lastEvent)).event;

        // TODO: include damage delta
        return {...lastEvent && {event: lastEvent}, invertDrain: true};
    }

    //#endregion

    //#endregion

    //#region canX() SubReason builders for onX() activateAbility parsers

    //#region on-switchOut reason

    /**
     * Checks whether the ability can activate on-`switchOut`.
     * @param mon Potential ability holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canSwitchOut(mon: ReadonlyPokemon): Set<SubReason> | null
    {
        return mon.majorStatus.current && this.data.on?.switchOut?.cure ?
            new Set() : null;
    }

    //#endregion

    //#region on-start reason

    /**
     * Checks whether the ability can activate on-`start`.
     * @param mon Potential ability holder.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canStart(mon: Pokemon): Set<SubReason> | null
    {
        if (!this.data.on?.start) return null;
        // activate on a certain status immunity to cure it
        const canCure = this.canCureImmunity("start", mon);
        if (canCure) return new Set();
        if (canCure === false) return null;
        // forewarn: reveal opponent's item
        if (this.data.on.start.revealItem)
        {
            // TODO(doubles): track actual opponents
            const team = mon.team;
            if (!team) return null;
            const state = team.state;
            if (!state) return null;
            const holderRef = team.side;
            const opp = state.teams[otherSide(holderRef)].active;
            // TODO: other restrictions?
            return new Set([opponentHasItem(opp)]);
        }
        // TODO: add trace/intimidate restrictions
        return new Set();
    }

    //#endregion

    //#region on-block reason

    /**
     * Checks whether the ability can activate on-`block` vs a status effect.
     * @param statuses Possible statuses to afflict.
     * @param weather Current weather.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canBlockStatusEffect(statuses: readonly dexutil.StatusType[],
        weather: dexutil.WeatherType | "none"):
        Set<SubReason> | null
    {
        return statuses.some(
                s => this.canBlockStatus(s, weather, /*allowSilent*/ false)) ?
            new Set() : null;
    }

    /**
     * Checks whether the ability can activate on-`block` vs a move's type.
     * @param types Possible move types.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canBlockMoveType(types: ReadonlySet<dexutil.Type>, move: dex.Move,
        user: Pokemon): Set<SubReason> | null
    {
        // TODO: type effectiveness assertions/subreasons
        if (this.data.on?.block?.move?.type === "nonSuper")
        {
            return new Set([chanceReason]);
        }
        // side/field status moves don't count
        // TODO: what about moves with additional effects that target the
        //  holder?
        if (move.data.category === "status" &&
            (move.data.effects?.team || move.data.effects?.field))
        {
            return null;
        }
        // can't activate unless the ability could block one of the move's
        //  possible types
        const typeImmunity = this.getTypeImmunity();
        if (!typeImmunity || !types.has(typeImmunity)) return null;
        return new Set([moveIsType(move, user, new Set([typeImmunity]))]);
    }

    /**
     * Checks whether the ability can activate on-`block` vs some effect.
     * @param explosive Explosive flag for damp check.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canBlockEffect(explosive?: boolean): Set<SubReason> | null
    {
        return explosive && this.data.on?.block?.effect?.explosive ?
            new Set() : null;
    }

    //#endregion

    //#region on-tryUnboost reason

    /**
     * Checks whether the ability can activate on-`tryUnboost` to block an
     * unboost effect.
     * @param boosts Boosts to block. Only one has to be blockable for this
     * method to not return null.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canBlockUnboost(boosts: Partial<dexutil.BoostTable>):
        Set<SubReason> | null
    {
        if (!this.data.on?.tryUnboost?.block) return null;
        const blockUnboost = this.data.on.tryUnboost.block;
        return (Object.keys(boosts) as dexutil.BoostName[]).some(
                b => boosts[b]! < 0 && blockUnboost[b]) ?
            new Set() : null;
    }

    //#endregion

    //#region on-status reason

    /**
     * Checks whether the ability can activate on-`status` to cure it.
     * @param mon Potential ability holder.
     * @param statusType Afflicted status.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canStatus(mon: ReadonlyPokemon, statusType: dexutil.StatusType):
        Set<SubReason> | null
    {
        return this.canCureImmunity("status", mon, [statusType]) ?
            new Set() : null;
    }

    //#endregion

    //#region on-moveContactKO/moveContact/moveDamage reasons

    /**
     * Checks whether the ability can activate
     * on-`moveDamage`/`moveContact`/`moveContactKO`.
     * @param mon Potential ability holder.
     * @param on Specific on-`X` condition.
     * @param hitByMove Move the holder was hit by.
     * @param hitByUser User of the `hitByMove`.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canMoveDamage(mon: Pokemon, on: dexutil.AbilityOn,
        hitBy: dexutil.MoveAndUser): Set<SubReason> | null
    {
        if (!this.data.on) return null;
        if (this.data.on.moveDamage &&
            // can't include moveContactKO since the only relevant effect
            //  affects the ability holder
            ["moveDamage", "moveContact"].includes(on))
        {
            if (this.data.on.moveDamage.changeToMoveType && !mon.fainted)
            {
                return new Set([diffMoveType(mon, hitBy)]);
            }
        }
        if (this.data.on.moveContact &&
            ["moveContact", "moveContactKO"].includes(on))
        {
            const chance = this.data.on.moveContact.chance ?? 100;
            return new Set(chance === 100 ? [] : [chanceReason]);
        }
        if (this.data.on.moveContactKO && on === "moveContactKO")
        {
            return new Set();
        }
        return null;
    }

    //#endregion

    //#region on-moveDrain reason

    /**
     * Checks whether the ability can activate on-`moveDrain`.
     * @returns A Set of SubReasons describing additional conditions of
     * activation, or the empty set if there are none, or null if it cannot
     * activate.
     */
    public canMoveDrain(): Set<SubReason> | null
    {
        return this.data.on?.moveDrain ? new Set() : null;
    }

    //#endregion

    //#region canX() method helpers

    /**
     * Checks if the ability can cure a status based on immunity.
     * @param on Circumstance in which the ability would activate.
     * @param mon Potential ability holder.
     * @param statusTypes Statuses to consider. Omit to assume all relevant
     * status immunities.
     * @returns True if the ability can activate under the given circumstances,
     * false if no immunities are violated, or null if the ability doesn't
     * apply here (i.e., it's not immune to any status under the given
     * circumstances).
     */
    private canCureImmunity(on: dexutil.AbilityOn, mon: ReadonlyPokemon,
        statusTypes?: readonly dexutil.StatusType[]): boolean | null
    {
        if (!this.data.statusImmunity) return null;
        switch (on)
        {
            case "start": case "status":
                if (!this.data.on?.[on]?.cure) return null;
                break;
            default:
                return null;
        }
        if (!statusTypes)
        {
            statusTypes = Object.keys(this.data.statusImmunity) as
                dexutil.StatusType[];
        }
        return statusTypes.some(s => this.data.statusImmunity![s] &&
            hasStatus(mon, s));
    }

    /**
     * Checks whether the ability can block the given status.
     * @param status Status to check.
     * @param weather Current weather if applicable.
     * @param allowSilent Whether to allow silent activation. Default true.
     */
    public canBlockStatus(status: dexutil.StatusType,
        weather: dexutil.WeatherType | "none", allowSilent = true): boolean
    {
        const condition = this.data.on?.block?.status;
        return (condition === true || condition === weather) &&
            !!this.data.statusImmunity &&
            (allowSilent ?
                !!this.data.statusImmunity[status]
                : this.data.statusImmunity[status] === true);
    }

    // TODO: generalize for multiple immunities, e.g. wonderguard
    /** Gets the ability's move type immunity, or null if none found. */
    public getTypeImmunity(): dexutil.Type | null
    {
        const type = this.data.on?.block?.move?.type;
        if (!type || type === "nonSuper") return null;
        return type;
    }

    //#endregion

    //#endregion
}
