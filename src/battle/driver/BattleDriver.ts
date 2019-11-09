import { FutureMove, TwoTurnMove } from "../dex/dex";
import { boostKeys, BoostName, MajorStatus, StatExceptHP, Type, WeatherType }
    from "../dex/dex-util";
import { BattleState, ReadonlyBattleState } from "../state/BattleState";
import { MoveData, MoveOptions, Pokemon } from "../state/Pokemon";
import { Side } from "../state/Side";
import { SwitchInOptions, Team } from "../state/Team";

export type StatusEffectType = "aquaRing" | "attract" | "bide" | "confusion" |
    "charge" | "encore" | "focusEnergy" | "foresight" | "ingrain" |
    "leechSeed" | "magnetRise" | "miracleEye" | "embargo" | "substitute" |
    "slowStart" | "taunt" | "torment" | "uproar";

export type UpdatableStatusEffectType = "confusion" | "bide" | "uproar";

export type SideConditionType = "lightScreen" | "reflect" | "spikes" |
    "stealthRock" | "tailwind" | "toxicSpikes";

export type FieldConditionType = "gravity" | "trickRoom";

export type SingleMoveStatus = "destinyBond" | "grudge";

export type SingleTurnStatus = "stall" | "roost" | "magicCoat";

/** Data for handling a switch-in. */
export interface DriverSwitchOptions
{
    /** Pokemon's species. */
    readonly species: string;
    /** Level between 1 and 100. */
    readonly level: number;
    /** Pokemon's gender. Can be M, F, or null. */
    readonly gender: string | null;
    /** Pokemon's current HP. */
    readonly hp: number;
    /** Pokemon's max HP. */
    readonly hpMax: number;
}

/** Data for initializing a pokemon. */
export interface DriverInitPokemon extends DriverSwitchOptions
{
    /** Pokemon's stats. */
    readonly stats: Readonly<Record<StatExceptHP, number>>;
    /** List of move id names. */
    readonly moves: readonly string[];
    /** Base ability id name. */
    readonly baseAbility: string;
    /** Item id name. */
    readonly item: string;
}

/**
 * Typing for `BattleDriver#useMove()`, changing the type of
 * `MoveOptions#targets` to an array of Pokemon references.
 */
export type DriverMoveOptions =
    Omit<MoveOptions, "targets"> & {targets: readonly Side[]};

/** Handles all frontend-interpreted state mutations and inferences. */
export class BattleDriver
{
    /** Internal battle state. */
    public get state(): ReadonlyBattleState { return this._state; }
    protected readonly _state = new BattleState();

    /**
     * Initializes our team state.
     * @param team Init data for the known pokemon on our side.
     * @param moveCb Optional callback that pre-processes a move name that has
     * certain properties encoded into it, e.g. Hidden Power type. Should return
     * the intended move name.
     */
    public init(initMons: readonly DriverInitPokemon[],
        moveCb?: (mon: Pokemon, moveId: string) => string): void
    {
        const team = this._state.teams.us;
        team.size = initMons.length;
        for (const data of initMons)
        {
            // initial revealed pokemon can't be null, since we already
            //  set the teamsize
            const mon = team.reveal(data.species, data.level,
                    data.gender, data.hp, data.hpMax)!;
            for (const stat in data.stats)
            {
                // istanbul ignore if
                if (!data.stats.hasOwnProperty(stat)) continue;
                mon.traits.stats[stat as StatExceptHP]
                    .set(data.stats[stat as StatExceptHP]);
            }
            mon.traits.stats.hp.set(data.hpMax);
            mon.setItem(data.item);
            mon.traits.setAbility(data.baseAbility);

            // initialize moveset
            for (let moveId of data.moves)
            {
                if (moveCb) moveId = moveCb(mon, moveId);
                mon.moveset.reveal(moveId);
            }
        }
    }

    /** Initializes the other team's size. */
    public initOtherTeamSize(size: number): void
    {
        this._state.teams.them.size = size;
    }

    /**
     * Should be called at the beginning of every turn to update temp statuses.
     */
    public preTurn(): void
    {
        this._state.preTurn();
    }

    /** Should be called at the end of every turn to update temp statuses. */
    public postTurn(): void
    {
        this._state.postTurn();
    }

    /**
     * Reveals, changes, and/or activates a pokemon's ability.
     * @param monRef The Pokemon being associated with this ability.
     * @param ability Ability that the Pokemon is revealed to have.
     * @param traced If the Pokemon is receiving the ability via Trace, this
     * should specify the Pokemon being Traced.
     */
    public activateAbility(monRef: Side, ability: string, traced?: Side): void
    {
        const mon = this.getMon(monRef);
        if (traced)
        {
            // infer trace user's base ability
            mon.traits.ability.narrow("trace");
            // infer opponent's ability due to trace effect
            this.getMon(traced).traits.ability.narrow(ability);
        }

        // override current ability with the new one
        mon.traits.setAbility(ability);
    }

    /**
     * Reveals and suppresses a pokemon's ability due to Gastro Acid.
     * @param monRef Pokemon reference.
     * @param ability Ability being suppressed.
     */
    public gastroAcid(monRef: Side, ability: string): void
    {
        const mon = this.getMon(monRef);

        mon.traits.setAbility(ability);
        mon.volatile.gastroAcid = true;
    }

    /**
     * Starts, sets, or ends a trivial status effect.
     * @param monRef Pokemon reference.
     * @param type Type of status in question.
     * @param start Whether to start (true) or end (false) the status.
     */
    public activateStatusEffect(monRef: Side, type: StatusEffectType,
        start: boolean): void
    {
        const mon = this.getMon(monRef);
        switch (type)
        {
            case "aquaRing":
                mon.volatile.aquaRing = start;
                break;
            case "attract":
                mon.volatile.attracted = start;
                break;
            case "bide":
                mon.volatile.bide[start ? "start" : "end"]();
                break;
            case "confusion":
                mon.volatile.confusion[start ? "start" : "end"]();
                break;
            case "charge":
                mon.volatile.charge[start ? "start" : "end"]();
                break;
            case "encore":
                mon.volatile.encore[start ? "start" : "end"]();
                break;
            case "focusEnergy":
                mon.volatile.focusEnergy = start;
                break;
            case "foresight":
                mon.volatile.identified = start ? "foresight" : null;
                break;
            case "ingrain":
                mon.volatile.ingrain = start;
                break;
            case "leechSeed":
                mon.volatile.leechSeed = start;
                break;
            case "magnetRise":
                mon.volatile.magnetRise[start ? "start" : "end"]();
                break;
            case "miracleEye":
                mon.volatile.identified = start ? "miracleeye" : null;
                break;
            case "embargo":
                mon.volatile.embargo[start ? "start" : "end"]();
                break;
            case "substitute":
                mon.volatile.substitute = start;
                break;
            case "slowStart":
                mon.volatile.slowStart[start ? "start" : "end"]();
                break;
            case "taunt":
                mon.volatile.taunt[start ? "start" : "end"]();
                break;
            case "torment":
                mon.volatile.torment = start;
                break;
            case "uproar":
                mon.volatile.uproar[start ? "start" : "end"]();
                break;
            default:
                // istanbul ignore else: not useful to test
                throw new Error(`Invalid status effect '${type}'`);
        }
    }

    /** Temporarily disables the pokemon's move. */
    public disableMove(monRef: Side, move: string): void
    {
        this.getMon(monRef).disableMove(move);
    }

    /** Re-enables the pokemon's disabled moves. */
    public enableMoves(monRef: Side): void
    {
        this.getMon(monRef).volatile.enableMoves();
    }

    /** Starts or ends a future move. */
    public activateFutureMove(monRef: Side, move: FutureMove, start: boolean):
        void
    {
        const futureMove = this.getMon(monRef).team!.status.futureMoves[move];
        if (start) futureMove.start(/*restart*/false);
        else futureMove.end();
    }

    /**
     * Indicates that a status effect is still going. Usually this is implied at
     * the end of the turn unless the game usually sends an explicit message.
     */
    public updateStatusEffect(monRef: Side, type: UpdatableStatusEffectType):
        void
    {
        const mon = this.getMon(monRef);
        switch (type)
        {
            case "bide":
                mon.volatile.bide.tick();
                break;
            case "confusion":
                mon.volatile.confusion.tick();
                break;
            case "uproar":
                mon.volatile.uproar.tick();
                break;
        }
    }

    /** Indicates that the pokemon's locked move ended in fatigue. */
    public fatigue(monRef: Side): void
    {
        this.getMon(monRef).volatile.lockedMove.reset();
    }

    /** Sets the pokemon's temporary third type. */
    public setThirdType(monRef: Side, type: Type): void
    {
        this.getMon(monRef).volatile.addedType = type;
    }

    /** Temporarily changes the pokemon's types. Also resets third type. */
    public changeType(monRef: Side, types: readonly [Type, Type]): void
    {
        const mon = this.getMon(monRef);
        mon.volatile.overrideTraits.types = types;
        mon.volatile.addedType = "???";
    }

    /** Indicates that the pokemon is Mimicking a move. */
    public mimic(monRef: Side, move: string): void
    {
        this.getMon(monRef).mimic(move);
    }

    /** Indicates that the pokemon is Sketching a move. */
    public sketch(monRef: Side, move: string): void
    {
        this.getMon(monRef).sketch(move);
    }

    /** Indicates that the pokemon is being trapped by another. */
    public trap(monRef: Side, by: Side): void
    {
        this.getMon(by).volatile.trap(this.getMon(monRef).volatile);
    }

    /** Temporarily boosts one of the pokemon's stats by the given amount. */
    public boost(monRef: Side, stat: BoostName, amount: number): void
    {
        this.getMon(monRef).volatile.boosts[stat] += amount;
    }

    /** Temporarily unboosts one of the pokemon's stats by the given amount. */
    public unboost(monRef: Side, stat: BoostName, amount: number): void
    {
        this.getMon(monRef).volatile.boosts[stat] -= amount;
    }

    /** Clears all temporary stat boosts from the field. */
    public clearAllBoosts(): void
    {
        const mons = this.getAllActive();
        for (const mon of mons)
        {
            for (const stat of boostKeys)
            {
                mon.volatile.boosts[stat] = 0;
            }
        }
    }

    /** Clears temporary negative stat boosts from the given pokemon. */
    public clearNegativeBoosts(monRef: Side): void
    {
        const boosts = this.getMon(monRef).volatile.boosts;
        for (const stat of boostKeys)
        {
            if (boosts[stat] < 0) boosts[stat] = 0;
        }
    }

    /** Clears temporary positive stat boosts from the given pokemon. */
    public clearPositiveBoosts(monRef: Side): void
    {
        const boosts = this.getMon(monRef).volatile.boosts;
        for (const stat of boostKeys)
        {
            if (boosts[stat] > 0) boosts[stat] = 0;
        }
    }

    /** Copies temporary stat boosts from `from` to `to`. */
    public copyBoosts(from: Side, to: Side): void
    {
        const fromBoosts = this.getMon(from).volatile.boosts;
        const toBoosts = this.getMon(to).volatile.boosts;
        for (const stat of boostKeys) toBoosts[stat] = fromBoosts[stat];
    }

    /** Inverts the sign of the pokemon's temporary stat boosts. */
    public invertBoosts(monRef: Side): void
    {
        const boosts = this.getMon(monRef).volatile.boosts;
        for (const stat of boostKeys) boosts[stat] = -boosts[stat];
    }

    /** Sets the pokemon's temporary stat boost to the given amount */
    public setBoost(monRef: Side, stat: BoostName, amount: number): void
    {
        this.getMon(monRef).volatile.boosts[stat] = amount;
    }

    /** Swaps the given temporary stat boosts of two pokemon. */
    public swapBoosts(monRef1: Side, monRef2: Side,
        stats: readonly BoostName[]): void
    {
        const v1 = this.getMon(monRef1).volatile.boosts;
        const v2 = this.getMon(monRef2).volatile.boosts;
        for (const stat of stats)
        {
            [v1[stat], v2[stat]] = [v2[stat], v1[stat]];
        }
    }

    /** Indicates that the pokemon spent its turn being inactive. */
    public inactive(monRef: Side, reason: "recharge" | "slp" | "truant"): void
    {
        const mon = this.getMon(monRef);
        switch (reason)
        {
            case "truant":
                mon.volatile.activateTruant();
                // fallthrough: truant and recharge turns overlap
            case "recharge":
                mon.volatile.mustRecharge = false;
                break;
            case "slp":
                mon.majorStatus.assert("slp").tick(mon.ability);
                break;
        }
    }

    /** Indicates that the pokemon consumed an action this turn. */
    public consumeAction(monRef: Side): void
    {
        const mon = this.getMon(monRef);
        mon.volatile.resetSingleMove();
    }

    /** Afflicts the pokemon with the given major status condition. */
    public afflictStatus(monRef: Side, status: MajorStatus): void
    {
        this.getMon(monRef).majorStatus.afflict(status);
    }

    /** Cures the pokemon of the given major status. */
    public cureStatus(monRef: Side, status: MajorStatus): void
    {
        const mon = this.getMon(monRef);
        mon.majorStatus.assert(status);
        if (status === "slp" && mon.majorStatus.turns === 1)
        {
            // cured in 0 turns, must have early bird ability
            mon.traits.setAbility("earlybird");
        }
        mon.majorStatus.cure();
    }

    /** Cures all pokemon of the given team of any major status conditions. */
    public cureTeam(teamRef: Side): void
    {
        this.getTeam(teamRef).cure();
    }

    /** Indicates that the pokemon changed its form. */
    public formChange(monRef: Side, data: DriverSwitchOptions, perm: boolean):
        void
    {
        const mon = this.getMon(monRef);
        mon.formChange(data.species, perm);

        // set other details just in case
        mon.traits.stats.level = data.level;
        mon.traits.stats.hp.set(data.hpMax);
        // TODO: should gender also be in the traits object?
        mon.gender = data.gender;
        mon.hp.set(data.hp, data.hpMax);
    }

    /**
     * Indicates that a pokemon has transformed into its target.
     * @param sourceRef Pokemon that is transforming.
     * @param targetRef Pokemon to transform into.
     */
    public transform(sourceRef: Side, targetRef: Side): void
    {
        const source = this.getMon(sourceRef);
        const target = this.getMon(targetRef);
        source.transform(target);
    }

    /**
     * Reveals and infers more details due to Transform. The referenced pokemon
     * should already have `BattleDriver#transform()` called on it.
     */
    public transformPost(monRef: Side, moves: readonly MoveData[],
        stats: Readonly<Record<StatExceptHP, number>>): void
    {
        this.getMon(monRef).transformPost(moves, stats);
    }

    /** Indicates that the pokemon fainted. */
    public faint(monRef: Side): void
    {
        this.getMon(monRef).faint();
    }

    /**
     * Reveals that the pokemon is now holding an item.
     * @param monRef Pokemon reference.
     * @param item Item name.
     * @param gained Whether the item was gained just now or being revealed. If
     * `"recycle"`, the item was recovered via the Recycle move. Default false.
     */
    public revealItem(monRef: Side, item: string,
        gained: boolean | "recycle" = false): void
    {
        this.getMon(monRef).setItem(item, gained);
    }

    /**
     * Indicates that an item was just removed from the pokemon.
     * @param consumed If the item was consumed (i.e. it can be brought back
     * using the Recycle move), set this to the item's name, or just true if the
     * item's name is unknown, or false if the item wasn't consumed.
     */
    public removeItem(monRef: Side, consumed: string | boolean): void
    {
        this.getMon(monRef).removeItem(consumed);
    }

    /** Indicates that the pokemon used a move. */
    public useMove(monRef: Side, options: Readonly<DriverMoveOptions>): void
    {
        const moveOptions: MoveOptions =
        {
            ...options,
            targets: options.targets.map(targetRef => this.getMon(targetRef))
        };

        this.getMon(monRef).useMove(moveOptions);
    }

    /** Indicates that the pokemon is in the first turn of a two-turn move. */
    public prepareMove(monRef: Side, move: TwoTurnMove): void
    {
        this.getMon(monRef).volatile.twoTurn.start(move);
    }

    /** Reveals that the pokemon knows the given move. */
    public revealMove(monRef: Side, move: string): void
    {
        this.getMon(monRef).moveset.reveal(move);
    }

    /** Indicates that the pokemon must recharge from the previous action. */
    public mustRecharge(monRef: Side): void
    {
        // TODO: imply this in #useMove()
        this.getMon(monRef).volatile.mustRecharge = true;
    }

    /** Sets a single-move status for the pokemon. */
    public setSingleMoveStatus(monRef: Side, status: SingleMoveStatus): void
    {
        this.getMon(monRef).volatile[status] = true;
    }

    /** Sets a single-turn status for the pokemon. */
    public setSingleTurnStatus(monRef: Side, status: SingleTurnStatus): void
    {
        const v = this.getMon(monRef).volatile;
        if (status === "stall") v.stall(true);
        else v[status] = true;
    }

    /**
     * Indicates that a pokemon took damage and its HP changed.
     * @param monRef Pokemon reference.
     * @param newHP HP/max pair.
     * @param tox Whether the damage was due to poison or toxic. This is so the
     * toxic counter can be updated properly. Default false.
     */
    public takeDamage(monRef: Side, newHP: [number, number], tox = false): void
    {
        const mon = this.getMon(monRef);
        mon.hp.set(newHP[0], newHP[1]);
        // TODO: handle this in postTurn() because sometimes tox damage isn't
        //  taken but still builds up
        if (tox && mon.majorStatus.current === "tox") mon.majorStatus.tick();
    }

    /**
     * Activates a team status condition.
     * @param teamRef Team reference.
     * @param condition Name of the condition.
     * @param start Whether to start (`true`) or end (`false`) the condition.
     * @param monRef Optional pokemon reference to the one who caused the
     * condition to start/end.
     */
    public activateSideCondition(teamRef: Side, condition: SideConditionType,
        start: boolean, monRef?: Side): void
    {
        const ts = this.getTeam(teamRef).status;
        switch (condition)
        {
            case "lightScreen":
            case "reflect":
                if (start)
                {
                    ts[condition].start(monRef ? this.getMon(monRef) : null);
                }
                else ts[condition].reset();
                break;
            case "spikes":
            case "stealthRock":
            case "toxicSpikes":
                if (start) ++ts[condition];
                else ts[condition] = 0;
                break;
            case "tailwind":
                if (start) ts.tailwind.start();
                else ts.tailwind.end();
                break;
        }
    }

    /**
     * Activates a field status condition.
     * @param condition Name of the condition.
     * @param start Whether to start (`true`) or end (`false`) the condition.
     */
    public activateFieldCondition(condition: FieldConditionType,
        start: boolean): void
    {
        this._state.status[condition][start ? "start" : "end"]();
    }

    /**
     * Indicates that a pokemon has switched in.
     * @param monRef Pokemon slot reference.
     * @param data Data for the newly-revealed pokemon.
     */
    public switchIn(monRef: Side, data: DriverSwitchOptions): void
    {
        const team = this.getTeam(monRef);

        // consume pending self-switch/copyvolatile flags
        const options: SwitchInOptions =
            {copyVolatile: team.status.selfSwitch === "copyvolatile"};
        team.status.selfSwitch = false;

        team.switchIn(data.species, data.level, data.gender, data.hp,
            data.hpMax, options);
    }

    /**
     * Indicates that the pokemon is being trapped by an unknown ability.
     * @param monRef Pokemon reference.
     * @param by Reference to the pokemon with the trapping ability.
     */
    public rejectSwitchTrapped(monRef: Side, by: Side): void
    {
        this.getMon(monRef).trapped(this.getMon(by));
    }

    /** Clears self-switch flags for both teams. */
    public clearSelfSwitch(): void
    {
        this._state.teams.us.status.selfSwitch = false;
        this._state.teams.them.status.selfSwitch = false;
    }

    /** Resets the weather back to none. */
    public resetWeather(): void
    {
        this._state.status.weather.reset();
    }

    /**
     * Sets the current weather.
     * @param monRef Who caused the weather.
     * @param type Type of weather.
     * @param cause What action caused the weather.
     */
    public setWeather(monRef: Side, type: WeatherType,
        cause: "move" | "ability"): void
    {
        this._state.status.weather.start(this.getMon(monRef), type,
            // gen<=4: ability-caused weather is infinite
            /*infinite*/cause === "ability");
    }

    /** Indicates that the given weather condition is still going. */
    public tickWeather(type: WeatherType): void
    {
        const weather = this._state.status.weather;
        if (weather.type === type) weather.tick();
        else
        {
            throw new Error(`Weather is '${weather.type}' but upkept ` +
                `weather is '${type}'`);
        }
    }

    // istanbul ignore next: unstable, hard to verify
    /** Stringifies the BattleState. */
    public getStateString(): string
    {
        return this._state.toString();
    }

    /** Gets the Team from the given Side. */
    protected getTeam(side: Side): Team
    {
        return this._state.teams[side];
    }

    /** Gets the active Pokemon from the given Side. */
    protected getMon(side: Side): Pokemon
    {
        return this.getTeam(side).active;
    }

    /** Gets all active Pokemon on the field. */
    protected getAllActive(): Pokemon[]
    {
        return [this._state.teams.us.active, this._state.teams.them.active];
    }
}
