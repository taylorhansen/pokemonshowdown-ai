import { BoostableStatName, boostableStatNames, toIdName } from "../../helpers";
import { dex, numTwoTurnMoves, twoTurnMoves } from "../dex/dex";
import { Type, types } from "../dex/dex-types";
import { oneHot, tempStatusTurns } from "./utility";

/**
 * Contains the minor or temporary status conditions of a pokemon that are
 * removed upon switch.
 */
export class VolatileStatus
{
    // passed when copying

    /** Stat boost stages. */
    public get boosts(): {readonly [N in BoostableStatName]: number}
    {
        return this._boosts;
    }
    /**
     * Boosts a stat.
     * @param stat Stat to be boosted.
     * @param amount Whole number of stages to boost the stat by.
     */
    public boost(stat: BoostableStatName, amount: number): void
    {
        this._boosts[stat] += amount;
    }
    private _boosts: {[N in BoostableStatName]: number};

    /** Whether the pokemon is confused. */
    public get isConfused(): boolean
    {
        return this.confuseTurns !== 0;
    }
    /**
     * Number of turns this pokemon has been confused, including the turn it
     * started.
     */
    public get confuseTurns(): number
    {
        return this._confuseTurns;
    }
    /**
     * Sets the confusion flag. Should be called once per turn if it's on.
     * @param flag Value of the flag.
     */
    public confuse(flag: boolean): void
    {
        this._confuseTurns = flag ? this._confuseTurns + 1 : 0;
    }
    private _confuseTurns: number;

    /** Ingrain move status. */
    public ingrain: boolean;

    /** Magnet Rise move status (temporary). */
    public get magnetRise(): boolean
    {
        return this.magnetRiseTurns > 0;
    }
    public set magnetRise(flag: boolean)
    {
        this.magnetRiseTurns = flag ? 1 : 0;
    }
    private magnetRiseTurns: number;

    /** Embargo move status (temporary). */
    public get embargo(): boolean
    {
        return this.embargoTurns > 0;
    }
    public set embargo(flag: boolean)
    {
        this.embargoTurns = flag ? 1 : 0;
    }
    private embargoTurns: number;

    // not passed when copying

    /**
     * Checks whether a move is disabled.
     * @param move Index of the move.
     * @returns Whether the move is disabled.
     */
    public isDisabled(move: number): boolean
    {
        return !!this.disableTurns[move];
    }
    /**
     * Disables a certain move. If the move slot's index is not known, use the
     * Pokemon class' interface.
     * @param index Index of the move.
     */
    public disableMove(move: number): void
    {
        this.disableTurns[move] = 1;
    }
    /** Clears the disabled status. */
    public enableMoves(): void
    {
        this.disableTurns = [0, 0, 0, 0];
    }
    /** Turns for the disable status on each move. */
    private disableTurns: number[];

    /** Whether the pokemon is locked into a move and is unable to switch. */
    public get lockedMove(): boolean
    {
        return this.lockedMoveTurns !== 0;
    }
    public set lockedMove(value: boolean)
    {
        // reset lockedmove
        if (!value) this.lockedMoveTurns = 0;
        // start/continue counter
        else ++this.lockedMoveTurns;
    }
    private lockedMoveTurns = 0;

    /** Two-turn move currently being prepared. */
    public twoTurn: keyof typeof twoTurnMoves | "";

    /** Whether this pokemon must recharge on the next turn. */
    public mustRecharge: boolean;

    /** Number of turns this pokemon has used a stalling move, e.g. Protect. */
    public get stallTurns(): number
    {
        return this._stallTurns;
    }
    /**
     * Sets the stall flag. Should be called once per turn if it's on.
     * @param flag Value of the flag.
     */
    public stall(flag: boolean): void
    {
        this._stallTurns = flag ? this._stallTurns + 1 : 0;
        this.stalled = flag;
    }
    private _stallTurns: number;
    /** Whether we have successfully stalled this turn. */
    private stalled = false;

    /** Override ability while active. */
    public get overrideAbility(): string
    {
        return this.overrideAbilityName;
    }
    /** Set to the empty string to suppress base ability. */
    public set overrideAbility(ability: string)
    {
        const name = toIdName(ability);

        if (name)
        {
            if (!dex.abilities.hasOwnProperty(name))
            {
                throw new Error(`Unknown ability "${ability}"`);
            }
            this._overrideAbility = dex.abilities[name];
        }
        else this._overrideAbility = null;

        this.overrideAbilityName = name;
    }
    /** ID number of ability. */
    private _overrideAbility: number | null;
    /** Name of override ability. */
    private overrideAbilityName: string;

    /**
     * Temporarily overridden types. This should not be included in toString()
     * since the parent Pokemon object should handle that. Should not be
     * accessed other than by the parent Pokemon object.
     */
    public overrideTypes: Readonly<[Type, Type]>;
    /** Temporary third type. */
    public addedType: Type;

    /** Whether the Truant ability will activate next turn. */
    public get truant(): boolean
    {
        return this._truant;
    }
    private _truant: boolean;

    /** Smack Down move effect. */
    public smackDown: boolean;

    /** Roost move effect (single turn). */
    public roost: boolean;

    /** Creates a VolatileStatus object. */
    constructor()
    {
        this.clear();
    }

    /**
     * Clears all volatile status conditions. This does not affect shallow
     * clones.
     */
    public clear(): void
    {
        this._boosts =
        {
            atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0
        };
        this._confuseTurns = 0;
        this.ingrain = false;
        this.magnetRiseTurns = 0;
        this.embargoTurns = 0;
        this.disableTurns = [0, 0, 0, 0];
        this.lockedMoveTurns = 0;
        this.twoTurn = "";
        this.mustRecharge = false;
        this._stallTurns = 0;
        this._overrideAbility = null;
        this.overrideAbilityName = "";
        this.overrideTypes = ["???", "???"];
        this.addedType = "???";
        this._truant = false;
        this.smackDown = false;
        this.roost = false;
    }

    /**
     * Called at the end of the turn, after a Choice has been sent to the
     * server.
     */
    public postTurn(): void
    {
        // confusion is handled separately since it depends on a message
        if (this.magnetRise) ++this.magnetRiseTurns;
        if (this.embargo) ++this.embargoTurns;

        // update disabled move turns
        for (let i = 0; i < this.disableTurns.length; ++i)
        {
            if (this.disableTurns[i]) ++this.disableTurns[i];
        }

        // if twoTurn was set this turn, the two-turn move must be completed or
        //  interrupted on the next turn
        this.twoTurn = "";

        // stalling moves must be used successfully every turn or the turn
        //  counter will reset
        if (!this.stalled) this._stallTurns = 0;
        this.stalled = false;

        if (this.overrideAbilityName === "truant")
        {
            this._truant = !this._truant;
        }
        else this._truant = false;

        this.roost = false;
    }

    /**
     * Creates a shallow clone of this VolatileStatus.
     * @returns A shallow clone of this object.
     */
    public shallowClone(): VolatileStatus
    {
        const v = new VolatileStatus();
        v._boosts = this._boosts;
        v._confuseTurns = this._confuseTurns;
        v.ingrain = this.ingrain;
        v.magnetRiseTurns = this.magnetRiseTurns;
        v.embargoTurns = this.embargoTurns;
        return v;
    }

    /**
     * Gets the size of the return value of `toArray()`.
     * status.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        return /*boostable stats*/Object.keys(boostableStatNames).length +
            /*confuse*/1 + /*ingrain*/1 + /*magnet rise*/1 + /*embargo*/1 +
            /*disable*/4 + /*locked move*/1 +
            /*two-turn status*/numTwoTurnMoves + /*must recharge*/1 +
            /*stall fail rate*/1 + /*override ability*/dex.numAbilities +
            /*override types*/Object.keys(types).length + /*truant*/1 +
            /*smack down*/1 + /*roost*/1;
    }

    // istanbul ignore next: unstable, hard to test
    /**
     * Formats volatile status info into an array of numbers.
     * @returns All volatile status data in array form.
     */
    public toArray(): number[]
    {
        // one-hot encode categorical data
        const twoTurn = oneHot(this.twoTurn ? twoTurnMoves[this.twoTurn] : null,
                numTwoTurnMoves);
        const overrideAbility = oneHot(this._overrideAbility, dex.numAbilities);

        // multi-hot encode type data
        const overrideTypes = this.overrideTypes.concat(this.addedType);
        const typeData = (Object.keys(types) as Type[])
            .map(typeName => overrideTypes.includes(typeName) ? 1 : 0);

        // encode temporary status turns
        const confused = tempStatusTurns(this._confuseTurns);
        const magnetRise = tempStatusTurns(this.magnetRiseTurns);
        const embargo = tempStatusTurns(this.embargoTurns);
        const disabled = this.disableTurns.map(tempStatusTurns);
        const lockedMove = tempStatusTurns(this.lockedMoveTurns);
        const stallFailRate = tempStatusTurns(this._stallTurns);

        const a =
        [
            ...Object.keys(this._boosts).map(
                (key: BoostableStatName) => this._boosts[key]),
            confused, this.ingrain ? 1 : 0, magnetRise, embargo, ...disabled,
            lockedMove, ...twoTurn, this.mustRecharge ? 1 : 0, stallFailRate,
            ...overrideAbility, ...typeData, this._truant ? 1 : 0,
            this.smackDown ? 1 : 0, this.roost ? 1 : 0
        ];
        return a;
    }

    // istanbul ignore next: only used in logging
    /**
     * Encodes all volatile status data into a string.
     * @returns The VolatileStatus in string form.
     */
    public toString(): string
    {
        return `[${
            Object.keys(this._boosts)
            .filter((key: BoostableStatName) => this._boosts[key] !== 0)
            .map((key: BoostableStatName) =>
                `${key}: ${VolatileStatus.plus(this._boosts[key])}`)
            .concat(
                this._confuseTurns ?
                    [this.pluralTurns("confused", this._confuseTurns - 1)] : [],
                this.ingrain ? ["ingrain"] : [],
                this.magnetRiseTurns ?
                    [this.pluralTurns("magnet rise", this.magnetRiseTurns - 1)]
                    : [],
                this.embargoTurns ?
                    [this.pluralTurns("embargo", this.embargoTurns - 1)] : [],
                this.disableTurns
                    .filter(d => d !== 0)
                    .map((d, i) =>
                        this.pluralTurns(`disabled move ${i + 1}`, d)),
                this.lockedMove ? ["lockedmove"] : [],
                this.twoTurn ? [`preparing ${this.twoTurn}`] : [],
                this.mustRecharge ? ["must recharge"] : [],
                this._stallTurns ?
                    [this.pluralTurns("stalling", this._stallTurns - 1)] : [],
                this._truant ? ["truant next turn"] : [],
                this.smackDown ? ["smacked down"] : [],
                this.roost ? ["roosting"] : [])
            .join(", ")}]`;
    }

    // istanbul ignore next: only used in logging
    /**
     * Converts a number to a string where positive numbers are preceded by a
     * `+` symbol.
     */
    private static plus(n: number): string
    {
        return (n > 0 ? "+" : "") + n;
    }

    // istanbul ignore next: only used in logging
    /** Pluralizes the word "turns". */
    private pluralTurns(name: string, turns: number): string
    {
        return `${name} for turn${turns !== 1 ? "s" : ""}`;
    }
}
