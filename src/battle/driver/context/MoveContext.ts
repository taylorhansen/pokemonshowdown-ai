import { Logger } from "../../../Logger";
import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import { BattleState } from "../../state/BattleState";
import { Move } from "../../state/Move";
import { Pokemon } from "../../state/Pokemon";
import { otherSide, Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { AbilityContext } from "./AbilityContext";
import { ContextResult, DriverContext } from "./DriverContext";
import { deepClone, DeepNullable, DeepWritable } from "./helpers";
import { SwitchContext } from "./SwitchContext";

/** Handles events related to a move. */
export class MoveContext extends DriverContext
{
    // event data
    /** User of the move. */
    private readonly user: Pokemon;
    /** Reference to find the user within the BattleState. */
    private readonly userRef: Side;
    /** Name of the move. */
    private readonly moveName: string;
    /** Dex data for the move. */
    private readonly moveData: dexutil.MoveData;
    /** Move object if this event is supposed to consume pp. */
    private readonly move?: Move;
    // TODO: expand for doubles/triples
    /** Maps mon-ref to whether the move may hit them. */
    private readonly pendingTargets: {readonly [TMonRef in Side]: boolean};
    /**
     * Total number of expected targets. If `#pendingTargets` allows for more
     * than this number, only the first `totalTargets` mentioned targets will be
     * counted.
     */
    private readonly totalTargets: number;

    // move expectations (reset once handled)
    /** Whether all implicit effects have been handled. */
    private handled = false;
    /** Pending primary move effects. */
    private primary: DeepNullable<DeepWritable<dexutil.PrimaryEffect>>;
    /** Pending move effects for user. */
    private self: DeepNullable<DeepWritable<dexutil.MoveEffect>>;
    /** Pending move effects for target. */
    private hit: DeepNullable<DeepWritable<dexutil.MoveEffect>>;

    // in-progress move result flags
    /**
     * Target-refs currently mentioned by listening to events. Lays groundwork
     * for future double/triple battle support.
     */
    private readonly mentionedTargets = new Set<Side>();

    /**
     * Constructs a MoveContext.
     * @param state State object to mutate while handling events.
     * @param event Event that started this context.
     * @param logger Logger object.
     * @param called Whether this move was called by another move. Default
     * false.
     */
    constructor(state: BattleState, event: events.UseMove, logger: Logger,
        private readonly called = false)
    {
        super(state, logger);

        if (!dex.moves.hasOwnProperty(event.move))
        {
            throw new Error(`Unsupported move '${event.move}'`);
        }

        // event data
        this.user = this.state.teams[event.monRef].active;
        this.userRef = event.monRef;
        this.moveName = event.move;
        this.moveData = dex.moves[event.move];
        switch (this.moveData.target)
        {
            // TODO: support non-single battles
            case "adjacentAlly":
                // these moves should always fail in singles
                this.pendingTargets = {us: false, them: false};
                this.totalTargets = 0;
                break;
            case "adjacentAllyOrSelf": case "allies": case "allySide":
            case "allyTeam": case "self":
                this.pendingTargets =
                    this.framePendingTargets({us: true, them: false});
                this.totalTargets = 1;
                break;
            case "all":
                this.pendingTargets =
                    this.framePendingTargets({us: true, them: true});
                this.totalTargets = 2;
                break;
            case "adjacentFoe": case "allAdjacent": case "allAdjacentFoes":
            case "any": case "foeSide": case "normal": case "randomNormal":
            case "scripted":
                this.pendingTargets =
                    this.framePendingTargets({us: false, them: true});
                this.totalTargets = 1;
                break;
        }

        // deep clone move expectation flags
        this.primary = deepClone(this.moveData.primary) ?? null;
        this.self = deepClone(this.moveData.self) ?? null;
        this.hit = deepClone(this.moveData.hit) ?? null;

        // override for non-ghost type curse effect
        // TODO(gen6): handle interactions with protean
        if (this.hit?.status === "curse" &&
            !this.user.types.includes("ghost"))
        {
            this.pendingTargets = this.framePendingTargets(
                {us: true, them: false});
            this.totalTargets = 1;
            this.hit.status = null;
        }

        // release two-turn move
        let releasedTwoTurn = false;
        if (this.user.volatile.twoTurn.type === this.moveName)
        {
            this.user.volatile.twoTurn.reset();
            this.consumeEffect(this.primary, "delay", "twoTurn");
            releasedTwoTurn = true;
        }

        // if this isn't a called move, then the user must have this move in its
        //  moveset (i.e. it is an actual move decision)
        if (called) return;

        // every move decision resets any single-move statuses
        this.user.volatile.resetSingleMove();

        // only struggle can be selected without being a part of the moveset
        if (this.moveName === "struggle") return;

        const revealedMove = this.user.moveset.reveal(this.moveName);

        // only deduct pp if this event isn't continuing a multi-turn
        //  move
        if (releasedTwoTurn ||
            this.user.volatile.lockedMove.type === this.moveName ||
            this.user.volatile.rollout.type === this.moveName)
        {
            return;
        }

        // record the move object in case further deductions need to be made
        this.move = revealedMove;
        --this.move.pp;
    }

    /** Used when initializing `#pendingTargets`. */
    private framePendingTargets(
        obj: {readonly [TRelMonRef in Side]: boolean}):
        {readonly [TMonRef in Side]: boolean}
    {
        if (this.userRef === "us") return obj;
        return {them: obj.us, us: obj.them};
    }

    /** @override */
    public handle(event: events.Any): ContextResult | DriverContext
    {
        switch (event.type)
        {
            // handle move results/interruptions
            case "fail": case "noTarget":
                if (this.userRef !== event.monRef) return "expire";
                this.handleImplicitEffects(/*failed*/true);
                return "base";
            case "stall":
                if (event.endure) return "base";
                // fallthrough
            case "immune": case "miss":
                // generally a complete miss fails the move
                // TODO: partial misses (requires doubles support)
                this.handleImplicitEffects(/*failed*/true);
                return this.addTarget(event.monRef);
            // handle move expectations/flags
            case "activateAbility":
                return new AbilityContext(this.state, event,
                    this.logger.addPrefix(`Ability(${event.monRef}, ` +
                        `${event.ability}): `));
            case "activateFieldEffect": return this.activateFieldEffect(event);
            case "activateStatusEffect":
                return this.activateStatusEffect(event);
            case "activateTeamEffect": return this.activateTeamEffect(event);
            case "boost": return this.boost(event);
            case "changeType": return this.changeType(event);
            case "clearSelfSwitch": case "gameOver": case "inactive":
            case "preTurn": case "postTurn": case "updateFieldEffect":
                // TODO: other unrelated events?
                return "expire";
            case "countStatusEffect": return this.countStatusEffect(event);
            case "crit": case "resisted": case "superEffective":
            case "takeDamage":
                // TODO: other target-mentioning events?
                return this.addTarget(event.monRef);
            case "faint": return this.faint(event);
            case "futureMove": return this.futureMove(event);
            case "prepareMove": return this.prepareMove(event);
            case "swapBoosts": return this.swapBoosts(event);
            case "switchIn": return this.switchIn(event);
            case "transform":
                if (this.userRef !== event.source) return "expire";
                return this.addTarget(event.target);
            case "useMove": return this.useMove(event);
            // let the default context handle the event
            // TODO: should erroneous events cause a throw or expire?
            default: return "base";
        }
    }

    /**
     * Attempts to consume a pending effect.
     * @param effects Effect container.
     * @param effectType Category of effect.
     * @param effect Type of effect to consume.
     * @returns True if the effect is now consumed, false otherwise.
     */
    private consumeEffect<TEffectType extends string, TEffect extends any>(
        effects: DeepNullable<{[T in TEffectType]?: TEffect}>,
        effectType: TEffectType, effect: TEffect): boolean
    {
        if (effects?.[effectType] === effect)
        {
            effects[effectType] = null as any;
            return true;
        }
        return false;
    }

    /**
     * Attempts to consume a pending secondary effect.
     * @param secondary Secondary effect container.
     * @param effectType Category of effect.
     * @param effect Type of effect to consume.
     * @returns True if the effect is now consumed, false otherwise.
     */
    private consumeSecondary(
        secondary:
            DeepNullable<readonly DeepWritable<dexutil.SecondaryEffect>[]>,
        effectType: "status", effect: dexutil.StatusEffect): boolean;
    /**
     * Attempts to consume a pending secondary effect.
     * @param secondary Secondary effect container.
     * @param effectType Category of effect.
     * @param effect Type of effect to consume.
     * @param boost Expected boost amount.
     * @returns True if the effect is now consumed, false otherwise.
     */
    private consumeSecondary(
        secondary:
            DeepNullable<readonly DeepWritable<dexutil.SecondaryEffect>[]>,
        effectType: "boosts", effect: dexutil.BoostName, boost: number):
        boolean;
    private consumeSecondary(
        secondary:
            DeepNullable<readonly DeepWritable<dexutil.SecondaryEffect>[]>,
        effectType: "status" | "boosts",
        effect: dexutil.StatusEffect | dexutil.BoostName, boost?: number):
        boolean
    {
        for (const s of secondary ?? [])
        {
            if (!s) continue;
            switch (effectType)
            {
                case "status":
                    if (s.status !== effect) break;
                    s.status = null;
                    return true;
                case "boosts":
                    if (!dexutil.isBoostName(effect)) return false;
                    if (boost === undefined) return false;
                    if (s.boosts?.[effect] !== boost) break;
                    s.boosts[effect] = null;
                    return true;
                default: return false;
            }
        }
        return false;
    }

    /** @override */
    public halt(): void
    {
        // if a fail event hasn't been encountered yet, then it likely never
        //  will happen
        this.handleImplicitEffects(/*failed*/false);
    }

    /** @override */
    public expire(): void
    {
        // clean up flags
        this.handleImplicitEffects(/*failed*/false);

        // all other pending flags must be accounted for

        // if we had a self-switch flag, the game must've ignored it
        if (this.primary) this.primary.selfSwitch = null;
        this.state.teams[this.userRef].status.selfSwitch = null;

        // TODO: find cases where we shouldn't throw
        // walk pending effect objs for sanity checks
        if (this.primary)
        {
            for (const [value, name] of
            [
                [this.primary.delay, "delay"],
                [this.primary.call, "CallEffect"],
                // walk swapBoost dict
                ...(this.primary.swapBoost ?
                    (Object.keys(this.primary.swapBoost) as dexutil.BoostName[])
                        .map(b =>
                            [this.primary!.swapBoost![b], `swapBoost ${b}`] as
                                const)
                    : []),
                [this.primary.countableStatus, "CountableStatusEffect"],
                [this.primary.field, "FieldEffect"]
            ] as const)
            {
                if (!value) continue;
                throw new Error(`Expected primary ${name} '${value}' but it ` +
                    `didn't happen`);
            }
        }
        for (const [effect, title] of
            [[this.self, "self"], [this.hit, "hit"]] as const)
        {
            if (!effect) continue;
            for (const [value, name] of
            [
                [effect.unique, "UniqueEffect"],
                [effect.implicitStatus, "ImplicitStatusEffect"],
                // walk BoostEffect obj
                ...(effect.boost ?
                    (Object.keys(effect.boost) as (keyof dexutil.BoostEffect)[])
                        .map(k =>
                            (Object.keys(effect.boost![k]!) as
                                    dexutil.BoostName[])
                                .map(b =>
                                [
                                    effect.boost![k]![b],
                                    `BoostEffect ${k} ${b}`
                                ] as const))
                        .reduce((a, b) => a.concat(b), [])
                    : []),
                [effect.team, "TeamEffect"],
                [effect.implicitTeam, "ImplicitTeamEffect"],
                // walk SecondaryEffect objs but only the guaranteed ones
                ...(effect.secondary?.filter(s => s?.chance === 100)
                    .map(s =>
                    [
                        [s?.status, "SecondaryEffect StatusEffect"] as const,
                        // can't track flinch since its effect is applied once
                        //  the target attempts to move (TODO)
                        // [s?.flinch, "SecondaryEffect flinch"],
                        ...(s?.boosts ?
                            (Object.keys(s.boosts) as dexutil.BoostName[])
                                .map(k =>
                                [
                                    s?.boosts?.[k], `SecondaryEffect boost ${k}`
                                ] as const)
                            : [])
                    ])
                    .reduce((a, b) => a.concat(b), []) ?? [])
            ] as const)
            {
                if (value === null || value === undefined) continue;
                throw new Error(`Expected ${title} ${name} '${value}' but it ` +
                    `didn't happen`);
            }
        }
    }

    /**
     * Indicates that the BattleEvents mentioned a target for the current move.
     * @returns `expire` on error, `base` otherwise.
     */
    private addTarget(targetRef: Side): ContextResult
    {
        if (this.mentionedTargets.has(targetRef)) return "base";

        // assertions about the move target
        // generally this happens when the move has been fully handled but the
        //  context hasn't yet realized it and expired (TODO)
        if (!this.pendingTargets[targetRef])
        {
            this.logger.error(`Mentioned target '${targetRef}' but the ` +
                `current move '${this.moveName}' can't target it`);
            return "expire";
        }
        if (this.mentionedTargets.size >= this.totalTargets)
        {
            this.logger.error("Can't add more targets. Already have " +
                `${this.mentionedTargets.size} ` +
                (this.mentionedTargets.size > 0 ?
                    `('${[...this.mentionedTargets].join("', '")}') `
                    : "") +
                `but trying to add '${targetRef}'.`);
            return "expire";
        }

        this.mentionedTargets.add(targetRef);

        // deduct an extra pp if the target has pressure
        // TODO: gen>=5: don't count allies
        const target = this.state.teams[targetRef].active;
        if (this.move && this.user !== target &&
            target.ability === "pressure" &&
            // only ability that can cancel it
            this.user.ability !== "moldbreaker")
        {
            this.move.pp -= 1;
        }

        return "base";
    }

    /**
     * Handles implicit move effects, consuming most remaining flags. This
     * should be called once it is confirmed whether the move failed.
     * @param failed Whether this is being called in the context of a move
     * failure.
     */
    private handleImplicitEffects(failed: boolean): void
    {
        if (this.handled) return;
        this.handled = true;

        // singles: try to infer targets
        // TODO: in doubles, this may be more complicated or just ignored
        const opponent = otherSide(this.userRef);
        if (this.pendingTargets[opponent]) this.addTarget(opponent);
        if (this.pendingTargets[this.userRef]) this.addTarget(this.userRef);

        if (this.moveName === "naturalgift") this.naturalGift(failed);

        // reset stall counter if it wasn't updated this turn
        if (!this.called && !this.user.volatile.stalling)
        {
            this.user.volatile.stall(false);
        }

        if (failed)
        {
            // handle fail inferences
            // the failed=false side of this is handled by a separate event
            if (this.self?.status === "imprison") this.imprison(/*failed*/true);

            // clear pending flags
            this.primary = null;
            this.self = null;
            this.hit = null;

            // clear continuous moves
            // TODO: can a called move lock the user?
            if (!this.called)
            {
                this.user.volatile.lockedMove.reset();
                this.user.volatile.rollout.reset();
            }

            // TODO: other implications of a move failing
            return;
        }

        // user effects

        if (this.self?.boost?.add)
        {
            for (const stat of Object.keys(this.self.boost.add) as
                dexutil.BoostName[])
            {
                const amount = this.self.boost.add[stat];
                if (!amount) continue;
                const cur = this.user.volatile.boosts[stat];
                const newBoost = cur + amount;
                // consume silent boosts that were already maxed out
                if ((cur <= -6 && newBoost <= -6) ||
                    (cur >= 6 && newBoost >= 6))
                {
                    this.self.boost.add[stat] = null;
                }
            }
        }

        let lockedMove = false;
        switch (this.self?.implicitStatus)
        {
            case "defenseCurl":
                this.user.volatile.defenseCurl = true;
                this.self.implicitStatus = null;
                break;
            case "lockedMove":
                this.self.implicitStatus = null;
                if (!dex.isLockedMove(this.moveName))
                {
                    throw new Error(`Invalid locked move ${this.moveName}`);
                }
                // can't lock if called by another move (TODO: verify)
                if (this.called) break;
                if (this.user.volatile.lockedMove.type === this.moveName)
                {
                    // continue locked status
                    // already prevented from consuming pp in constructor
                    this.user.volatile.lockedMove.tick();
                }
                // start locked status
                else this.user.volatile.lockedMove.start(this.moveName);
                lockedMove = true;
                break;
            case "minimize":
                this.user.volatile.minimize = true;
                this.self.implicitStatus = null;
                break;
            // TODO: mustRecharge
        }
        if (!lockedMove) this.user.volatile.lockedMove.reset();

        // can't lock if called by another move (TODO: verify)
        if (!this.called && dexutil.isRolloutMove(this.moveName))
        {
            // TODO: add rollout moves to ImplicitStatusEffect
            // start/continue rollout status
            if (this.user.volatile.rollout.type === this.moveName)
            {
                // continue rollout status
                // already prevented from consuming pp in constructor
                this.user.volatile.rollout.tick();
            }
            else this.user.volatile.rollout.start(this.moveName);
        }
        // must've missed the status ending
        else this.user.volatile.rollout.reset();

        // team effects

        const team = this.state.teams[this.userRef];
        switch (this.self?.implicitTeam)
        {
            // wish can be used consecutively, but only the first use counts
            case "wish":
                team.status.wish.start(/*restart*/false);
                this.self.implicitTeam = null;
                break;
        }
        team.status.selfSwitch = this.primary?.selfSwitch ?? null;
    }

    /**
     * Handles the implications of Imprison succeeding or failing.
     * @param failed Whether the move failed.
     */
    private imprison(failed: boolean): void
    {
        // assume us is fully known, while them is unknown
        // TODO: what if both are unknown?
        const us = this.state.teams.us.active.moveset;
        const usMoves = [...us.moves.keys()];
        const them = this.state.teams.them.active.moveset;

        if (failed)
        {
            // imprison failed, which means both active pokemon don't have each
            //  other's moves
            // infer that the opponent doesn't have any of our moves

            // sanity check: opponent should not already have one of our moves
            const commonMoves = usMoves.filter(
                name => them.moves.has(name));
            if (commonMoves.length > 0)
            {
                throw new Error("Imprison failed but both Pokemon have " +
                    `common moves: ${commonMoves.join(", ")}`);
            }

            // remove our moves from their move possibilities
            them.inferDoesntHave(usMoves);
        }
        else
        {
            // imprison succeeded, which means both active pokemon have at least
            //  one common move
            // infer that one of our moves has to be contained by the opponent's
            //  moveset

            // sanity check: opponent should have or be able to have at least
            //  one of our moves
            if (usMoves.every(name =>
                !them.moves.has(name) && !them.constraint.has(name)))
            {
                throw new Error("Imprison succeeded but both Pokemon " +
                    "cannot share any moves");
            }

            them.addMoveSlotConstraint(usMoves);
        }
    }

    /**
     * Handles the implications of Natural Gift succeeding or failing.
     * @param failed Whether the move failed.
     */
    private naturalGift(failed: boolean): void
    {
        // naturalgift only succeeds if the user has a berry, and implicitly
        //  consumes it
        if (!failed)
        {
            // TODO: narrow further based on perceived power and type
            this.user.item.narrow(...Object.keys(dex.berries));
            this.user.removeItem(/*consumed*/true);
        }
        // fails if the user doesn't have a berry
        else this.user.item.remove(...Object.keys(dex.berries));
    }

    /**
     * Activates a field-wide effect.
     * @returns Whether the parent DriverContexts should also handle this event.
     */
    private activateFieldEffect(event: events.ActivateFieldEffect):
        ContextResult
    {
        // is this event possible within the context of this move?
        if (!this.consumeEffect(this.primary, "field", event.effect))
        {
            return "expire";
        }

        if (event.start && dexutil.isWeatherType(event.effect))
        {
            // fill in the user of the weather move (BaseContext just puts null)
            this.state.status.weather.start(this.user, event.effect);
            return "stop";
        }
        return "base";
    }

    /**
     * Activates a volatile status condition.
     * @returns Whether the parent DriverContexts should also handle this event.
     */
    private activateStatusEffect(event: events.ActivateStatusEffect):
        ContextResult
    {
        const effect = event.monRef === this.userRef ? this.self : this.hit;
        switch (event.effect)
        {
            case "aquaRing": case "attract": case "bide": case "charge":
            case "curse": case "embargo": case "encore": case "focusEnergy":
            case "foresight": case "healBlock": case "ingrain":
            case "magnetRise": case "miracleEye": case "mudSport":
            case "nightmare": case "powerTrick": case "suppressAbility":
            case "taunt": case "torment": case "waterSport": case "yawn":
            // singlemove
            case "destinyBond": case "grudge":
            // singleturn
            case "endure": case "magicCoat": case "protect": case "snatch":
                if (!event.start) return "expire";
                if (!this.consumeEffect(effect, "status", event.effect) &&
                    !this.consumeSecondary(effect?.secondary, "status",
                        event.effect))
                {
                    return "expire";
                }
                return this.addTarget(event.monRef);
            case "confusion": case "leechSeed": case "substitute":
                // can be removed by a different move, but currently not tracked
                //  yet (TODO)
                if (!event.start) return "base";
                if (!this.consumeEffect(effect, "status", event.effect) &&
                    !this.consumeSecondary(effect?.secondary, "status",
                        event.effect))
                {
                    return "expire";
                }
                return this.addTarget(event.monRef);
            case "imprison":
            {
                if (!event.start) return "expire";
                if (this.userRef !== event.monRef) return "expire";
                if (!this.consumeEffect(effect, "status", event.effect) &&
                    !this.consumeSecondary(effect?.secondary, "status",
                        event.effect))
                {
                    return "expire";
                }
                // verified that imprison was successful
                const result = this.addTarget(this.userRef);
                this.imprison(/*failed*/false);
                return result;
            }
            case "rage": case "roost": case "uproar":
                if (!event.start) return "expire";
                if (!this.consumeEffect(effect, "status", event.effect) &&
                    !this.consumeSecondary(effect?.secondary, "status",
                        event.effect))
                {
                    return "expire";
                }
                return "base";
            case "slowStart":
                return "expire";
            default:
                // TODO: also track curing moves
                // for now, curing moves are ignored
                if (dexutil.isMajorStatus(event.effect) && event.start &&
                    !this.consumeEffect(effect, "status", event.effect) &&
                    !this.consumeSecondary(effect?.secondary, "status",
                        event.effect))
                {
                    return "expire";
                }
                return "base";
        }
    }

    /**
     * Activates a team-wide effect.
     * @returns Whether the parent DriverContexts should also handle this event.
     */
    private activateTeamEffect(event: events.ActivateTeamEffect): ContextResult
    {
        switch (event.effect)
        {
            case "healingWish": case "lunarDance":
                // no known move can explicitly start this effect, only when the
                //  user faints and a replacement is sent
                // TODO(gen>4): replacement is not sent out immediately
                if (event.start) return "expire";
                if (!this.consumeEffect(this.self, "team", event.effect))
                {
                    return "expire";
                }
                return "base";
            case "luckyChant": case "mist": case "safeguard": case "tailwind":
                // no known move can explicitly end these effects, only when
                //  we're at the end of their durations
                if (!event.start) return "expire";
                if (!this.consumeEffect(this.self, "team", event.effect))
                {
                    return "expire";
                }
                return "base";
            case "spikes": case "stealthRock": case "toxicSpikes":
                // can be cleared by a move, but aren't covered by a flag yet
                //  (TODO)
                if (!event.start) return "base";
                if (!this.consumeEffect(this.hit, "team", event.effect))
                {
                    return "expire";
                }
                return "base";
            case "lightScreen": case "reflect":
                // can be cleared by a move, but aren't covered by a flag yet
                //  (TODO)
                if (!event.start) return "base";
                if (!this.consumeEffect(this.self, "team", event.effect))
                {
                    return "expire";
                }
                // fill in the user of the move (BaseContext just puts null)
                this.state.teams[event.teamRef].status[event.effect]
                    .start(this.user);
                return "stop";
        }
    }

    /**
     * Updates a stat boost.
     * @returns Whether the parent DriverContexts should also handle this event.
     */
    private boost(event: events.Boost): ContextResult
    {
        const effect = event.monRef === this.userRef ?
            this.self?.boost : this.hit?.boost;
        const dict = effect?.[event.set ? "set" : "add"];
        if (!dict?.hasOwnProperty(event.stat)) return "expire";

        let valid = false;
        if (!event.set)
        {
            // if it were to go over the 6 boost limit, it should still match
            //  the boost with the move data
            const cur = this.user.volatile.boosts[event.stat];
            const next = cur + event.amount;
            const expected = cur + dict[event.stat]!;
            if ((next >= 6 && expected >= 6) || (next <= -6 && expected <= -6))
            {
                valid = true;
            }
        }
        if (dict[event.stat] === event.amount) valid = true;
        if (valid)
        {
            let result: ContextResult;
            if (event.monRef !== this.userRef)
            {
                result = this.addTarget(event.monRef);
            }
            else result = "base";
            dict[event.stat] = null;
            return result;
        }
        // TODO: complete full tracking, then allow expire
        // return "expire";
        return "base";
    }

    /** Temporarily changes the pokemon's type. */
    private changeType(event: events.ChangeType): ContextResult
    {
        if (this.consumeEffect(this.self, "unique", "conversion"))
        {
            // changes the user's type into that of a known move
            this.user.moveset.addMoveSlotConstraint(
                dex.typeToMoves[event.newTypes[0]]);
        }
        // TODO: track type change effects: camouflage, conversion2, colorchange
        return "base";
    }

    private countStatusEffect(event: events.CountStatusEffect): ContextResult
    {
        switch (event.effect)
        {
            case "perish":
                // event is sent for each pokemon targeted by the perish
                //  song move, so it's difficult to pinpoint who exactly
                //  it will hit for now
                // TODO: a better solution would be to use the
                //  `|-fieldactivate|` event (#138) to consume the
                //  status (still letting BaseContext set the counters via this
                //  event), then rely on end-of-turn events for updating the
                //  counters
                // TODO: infer soundproof if the counter doesn't take place at
                //  the end of the turn
                this.consumeEffect(this.primary, "countableStatus",
                    "perish");
                return "base";
            case "stockpile":
                if (!this.consumeEffect(this.primary, "countableStatus",
                    "stockpile"))
                {
                    return "expire";
                }
                return "base";
            default: return "expire";
        }
    }

    /** Indicates that the pokemon fainted. */
    private faint(event: events.Faint): ContextResult
    {
        // handle self-faint effects from healingWish/lunarDance
        // TODO(gen>4): consume healingWish/lunarDance since replacement is no
        //  longer sent out immediately
        let wishing = false;
        if (this.self?.team === "healingWish")
        {
            this.state.teams[this.userRef].status.healingWish = true;
            wishing = true;
        }
        else if (this.self?.team === "lunarDance")
        {
            this.state.teams[this.userRef].status.lunarDance = true;
            wishing = true;
        }
        // gen4: replacement is sent out immediately, so communicate that by
        //  setting self-switch
        if (wishing)
        {
            if (!this.primary) this.primary = {selfSwitch: true};
            else this.primary.selfSwitch = true;
        }

        // if the target fainted, some effects have to be canceled
        const effect = event.monRef === this.userRef ?
            this.self : this.hit;
        if (effect)
        {
            // exclude team effects
            effect.status = null;
            effect.unique = null;
            effect.implicitStatus = null;
            effect.boost = null;
            effect.secondary = null;
        }
        // TODO: handle self-destruct moves
        return this.addTarget(event.monRef);
    }

    private futureMove(event: events.FutureMove): ContextResult
    {
        if (!event.start) return "expire";
        if (!dex.isFutureMove(this.moveName))
        {
            throw new Error(`Invalid future move ${this.moveName}`);
        }
        if (!this.consumeEffect(this.primary, "delay", "future"))
        {
            return "expire";
        }
        return "base";
    }

    private prepareMove(event: events.PrepareMove): ContextResult
    {
        if (!dex.isTwoTurnMove(this.moveName))
        {
            throw new Error(`Invalid future move ${this.moveName}`);
        }
        if (!this.consumeEffect(this.primary, "delay", "twoTurn"))
        {
            return "expire";
        }
        return "base";
    }

    /** Swaps temporary stat boosts between pokemon. */
    private swapBoosts(event: events.SwapBoosts): ContextResult
    {
        // should be swapping with the user and a target
        if (![event.monRef1, event.monRef2].includes(this.userRef))
        {
            return "expire";
        }
        // didn't expect event
        if (!this.primary?.swapBoost) return "expire";
        // didn't expect wrong stats
        if (event.stats.some(stat => !this.primary!.swapBoost![stat]))
        {
            return "expire";
        }
        // consume matching flags
        for (const stat of event.stats) this.primary.swapBoost[stat] = null;
        return this.addTarget(event.monRef1 === this.userRef ?
            event.monRef2 : event.monRef1);
    }

    /** Indicates that a pokemon has switched in. */
    private switchIn(event: events.SwitchIn): ContextResult | DriverContext
    {
        // consume self-switch flag
        if (this.userRef !== event.monRef ||
            !this.primary?.selfSwitch)
        {
            return "expire";
        }
        const selfSwitch = this.primary.selfSwitch;
        this.primary.selfSwitch = null;

        // handle the switch in the context of this move
        return new SwitchContext(this.state, event,
            this.logger.addPrefix(`Switch(${event.monRef}, ${event.species}, ` +
                `self${selfSwitch === "copyvolatile" ? ", copy" : ""}): `));
    }

    /** Indicates that the pokemon is attempting to use a move. */
    private useMove(event: events.UseMove): ContextResult | DriverContext
    {
        // if we're not expecting a move to be called, treat this as a
        //  normal move event
        if (!this.primary?.call) return "expire";

        switch (this.primary?.call)
        {
            case "self":
                // calling a move that is part of the user's moveset
                if (this.userRef !== event.monRef ||
                    this.addTarget(this.userRef) === "expire")
                {
                    return "expire";
                }
                this.user.moveset.reveal(event.move);
                break;
            case "target":
            {
                const targetRef = otherSide(this.userRef);
                if (this.userRef !== event.monRef ||
                    this.addTarget(targetRef) === "expire")
                {
                    return "expire";
                }
                this.state.teams[targetRef].active.moveset
                    .reveal(event.move);
                break;
            }
        }

        this.primary.call = null;

        // make sure this is handled like a called move
        return new MoveContext(this.state, event,
            this.logger.addPrefix(`Move(${event.monRef}, ` +
                `${event.move}, called): `),
            /*called*/true);
    }
}
