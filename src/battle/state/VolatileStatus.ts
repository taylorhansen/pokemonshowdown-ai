import { dex, TwoTurnMove } from "../dex/dex";
import { BoostName, Type } from "../dex/dex-util";
import { Moveset } from "./Moveset";
import { pluralTurns, plus } from "./utility";

/**
 * Contains the minor or temporary status conditions of a pokemon that are
 * removed upon switch.
 */
export class VolatileStatus
{
    // all fields are initialized on #clear() which is called in the constructor

    // passed when copying

    /** Stat boost stages. */
    public get boosts(): {[N in BoostName]: number}
    {
        return this._boosts;
    }
    private _boosts!: {[N in BoostName]: number};

    /** Whether the pokemon is confused. */
    public get isConfused(): boolean
    {
        return this.confuseTurns !== 0;
    }
    /**
     * Number of turns this pokemon has been confused, including the turn it
     * started.
     */
    public get confuseTurns(): number { return this._confuseTurns; }
    /**
     * Sets the confusion flag. Should be called once per turn if it's on.
     * @param flag Value of the flag.
     */
    public confuse(flag: boolean): void
    {
        this._confuseTurns = flag ? this._confuseTurns + 1 : 0;
    }
    private _confuseTurns!: number;

    /** Ingrain move status. */
    public ingrain!: boolean;

    /** Magnet Rise move status (temporary). */
    public get magnetRise(): boolean { return this._magnetRiseTurns > 0; }
    public set magnetRise(flag: boolean)
    {
        this._magnetRiseTurns = flag ? 1 : 0;
    }
    /** Amount of turns that Magnet Rise has been in effect. */
    public get magnetRiseTurns(): number { return this._magnetRiseTurns; }
    private _magnetRiseTurns!: number;

    /** Embargo move status (temporary). */
    public get embargo(): boolean { return this._embargoTurns > 0; }
    public set embargo(flag: boolean) { this._embargoTurns = flag ? 1 : 0; }
    /** Amount of turns the pokemon has been embargoed. */
    public get embargoTurns(): number { return this._embargoTurns; }
    private _embargoTurns!: number;

    /** Taunt move status (temporary). */
    public get taunt(): boolean { return this._tauntTurns > 0; }
    public set taunt(flag: boolean) { this._tauntTurns = flag ? 1 : 0; }
    /** Amount of turns the pokemon has been taunted. */
    public get tauntTurns(): number { return this._tauntTurns; }
    private _tauntTurns!: number;

    /** Substitute move status. */
    public substitute!: boolean;

    // situational

    // override ability (only #isAbilitySuppressed() is passed)
    /** Override ability while active. */
    public get overrideAbility(): string { return this.overrideAbilityName; }
    public set overrideAbility(ability: string)
    {
        if (!ability)
        {
            this._overrideAbility = null;
            this.overrideAbilityName = "";
            return;
        }

        if (!dex.abilities.hasOwnProperty(ability))
        {
            throw new Error(`Unknown ability "${ability}"`);
        }
        this._overrideAbility = dex.abilities[ability];
        this.overrideAbilityName = ability;
    }
    /**
     * Override ability id number. Defaults to null if `overrideAbility` is not
     * initialized.
     */
    public get overrideAbilityId(): number | null
    {
        return this._overrideAbility;
    }
    /** Whether the ability is being suppressed. */
    public isAbilitySuppressed(): boolean
    {
        return this.overrideAbilityName === "<suppressed>";
    }
    /** Suppresses override ability. */
    public suppressAbility(): void
    {
        this._overrideAbility = null;
        this.overrideAbilityName = "<suppressed>";
    }
    /** ID number of ability. */
    private _overrideAbility!: number | null;
    /** Name of override ability. */
    private overrideAbilityName!: string;

    // not passed when copying

    /** Temporary form change. */
    public get overrideSpecies(): string { return this.overrideSpeciesName; }
    public set overrideSpecies(species: string)
    {
        if (!species)
        {
            this._overrideSpecies = null;
            this.overrideSpeciesName = "";
            return;
        }

        if (!dex.pokemon.hasOwnProperty(species))
        {
            throw new Error(`Unknown species "${species}"`);
        }
        this._overrideSpecies = dex.pokemon[species].uid;
        this.overrideSpeciesName = species;
    }
    /**
     * Override species id number. Defaults to null if `overrideSpecies` is not
     * initialized.
     */
    public get overrideSpeciesId(): number | null
    {
        return this._overrideSpecies;
    }
    /** ID number of species. */
    private _overrideSpecies!: number | null;
    /** Name of override species. */
    private overrideSpeciesName!: string;

    /**
     * Checks whether a move is disabled.
     * @param move Index of the move.
     * @returns Whether the move is disabled.
     */
    public isDisabled(move: number): boolean
    {
        return !!this._disableTurns[move];
    }
    /**
     * Disables a certain move. If the move slot's index is not known, use the
     * Pokemon class' interface.
     * @param index Index of the move.
     */
    public disableMove(move: number): void { this._disableTurns[move] = 1; }
    /** Clears the disabled status. */
    public enableMoves(): void { this._disableTurns.fill(0); }
    /** Turns for the disable status on each move. */
    public get disableTurns(): readonly number[] { return this._disableTurns; }
    // ctor will initialize values
    private readonly _disableTurns = new Array<number>(Moveset.maxSize);

    /** Whether the pokemon is locked into a move and is unable to switch. */
    public get lockedMove(): boolean { return this._lockedMoveTurns !== 0; }
    public set lockedMove(value: boolean)
    {
        // reset lockedmove
        if (!value) this._lockedMoveTurns = 0;
        // start/continue counter
        else ++this._lockedMoveTurns;
    }
    /** Amount of turns the pokemon was locked into a move. */
    public get lockedMoveTurns(): number { return this._lockedMoveTurns; }
    private _lockedMoveTurns!: number;

    /** Two-turn move currently being prepared. */
    public get twoTurn(): TwoTurnMove | ""
    {
        return this._twoTurn;
    }
    public set twoTurn(twoTurn: TwoTurnMove | "")
    {
        this._twoTurn = twoTurn;
        // after this turn this will be 1
        this.twoTurnCounter = twoTurn ? 2 : 0;
    }
    private _twoTurn!: TwoTurnMove | "";
    private twoTurnCounter!: number;

    /** Whether this pokemon must recharge on the next turn. */
    public mustRecharge!: boolean;

    /** Number of turns this pokemon has used a stalling move, e.g. Protect. */
    public get stallTurns(): number { return this._stallTurns; }
    /**
     * Sets the stall flag. Should be called once per turn if it's on.
     * @param flag Value of the flag.
     */
    public stall(flag: boolean): void
    {
        this._stallTurns = flag ? this._stallTurns + 1 : 0;
        this.stalled = flag;
    }
    private _stallTurns!: number;
    /** Whether we have successfully stalled this turn. */
    private stalled!: boolean;

    /**
     * Temporarily overridden types. This should not be included in toString()
     * since the parent Pokemon object should handle that. Should not be
     * accessed other than by the parent Pokemon object.
     */
    public overrideTypes!: readonly [Type, Type];
    /** Temporary third type. */
    public addedType!: Type;

    /** Whether the Truant ability will activate next turn. */
    public get willTruant(): boolean { return this._willTruant; }
    /** Indicates that the Truant ability has activated. */
    public activateTruant(): void { this._willTruant = true; }
    // note: above will invert to false on postTurn() so it's properly synced
    private _willTruant!: boolean;

    /** Roost move effect (single turn). */
    public roost!: boolean;

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
        this._magnetRiseTurns = 0;
        this._embargoTurns = 0;
        this._tauntTurns = 0;
        this.substitute = false;
        this._overrideAbility = null;
        this.overrideAbilityName = "";
        this._overrideSpecies = null;
        this.overrideSpeciesName = "";
        this.enableMoves();
        this._lockedMoveTurns = 0;
        this._twoTurn = "";
        this.twoTurnCounter = 0;
        this.mustRecharge = false;
        this._stallTurns = 0;
        this.stalled = false;
        this.overrideTypes = ["???", "???"];
        this.addedType = "???";
        this._willTruant = false;
        this.roost = false;
    }

    /**
     * Called at the end of the turn, after a Choice has been sent to the
     * server.
     */
    public postTurn(): void
    {
        // confusion is handled separately since it depends on an event
        // other statuses like these are silent
        if (this.magnetRise) ++this._magnetRiseTurns;
        if (this.embargo) ++this._embargoTurns;
        if (this.taunt) ++this._tauntTurns;

        // update disabled move turns
        for (let i = 0; i < this._disableTurns.length; ++i)
        {
            if (this._disableTurns[i]) ++this._disableTurns[i];
        }

        // if twoTurn was set this turn, the two-turn move must be completed or
        //  interrupted on the next turn
        // if the move is never used, this code will clean it up
        if (this.twoTurnCounter)
        {
            --this.twoTurnCounter;
            if (this.twoTurnCounter <= 0) this.twoTurn = "";
        }

        // stalling moves must be used successfully every turn or the turn
        //  counter will reset
        if (!this.stalled) this._stallTurns = 0;
        this.stalled = false;

        if (this.overrideAbilityName === "truant")
        {
            this._willTruant = !this._willTruant;
        }
        else this._willTruant = false;

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
        v._magnetRiseTurns = this._magnetRiseTurns;
        v._embargoTurns = this._embargoTurns;
        v.substitute = this.substitute;
        if (this.isAbilitySuppressed()) v.suppressAbility();
        return v;
    }

    // istanbul ignore next: only used in logging
    /**
     * Encodes all volatile status data into a string.
     * @returns The VolatileStatus in string form.
     */
    public toString(): string
    {
        return `[${(Object.keys(this._boosts) as BoostName[])
            .filter(key => this._boosts[key] !== 0)
            .map(key => `${key}: ${plus(this._boosts[key])}`)
            .concat(
                this._confuseTurns ?
                    [pluralTurns("confused", this._confuseTurns - 1)] : [],
                this.ingrain ? ["ingrain"] : [],
                this._magnetRiseTurns ?
                    [pluralTurns("magnet rise", this._magnetRiseTurns - 1)]
                    : [],
                this._embargoTurns ?
                    [pluralTurns("embargo", this._embargoTurns - 1)] : [],
                this._tauntTurns ?
                    [pluralTurns("taunt", this._tauntTurns - 1)] : [],
                this.substitute ? ["substitute"] : [],
                this._disableTurns
                    .filter(d => d !== 0)
                    .map((d, i) => pluralTurns(`disabled move ${i + 1}`, d)),
                this.lockedMove ? ["lockedmove"] : [],
                this.twoTurn ? [`preparing ${this.twoTurn}`] : [],
                this.mustRecharge ? ["must recharge"] : [],
                this._stallTurns ?
                    [pluralTurns("stalling", this._stallTurns - 1)] : [],
                this._willTruant ? ["truant next turn"] : [],
                this.roost ? ["roosting"] : [])
            .join(", ")}]`;
    }
}
