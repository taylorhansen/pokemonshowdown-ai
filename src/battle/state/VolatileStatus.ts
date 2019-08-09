import { dex, lockedMoves, twoTurnMoves } from "../dex/dex";
import { BoostName, Type } from "../dex/dex-util";
import { Moveset } from "./Moveset";
import { TempStatus } from "./TempStatus";
import { pluralTurns, plus } from "./utility";
import { VariableTempStatus } from "./VariableTempStatus";

/**
 * Contains the minor or temporary status conditions of a pokemon that are
 * removed upon switch.
 */
export class VolatileStatus
{
    // all fields are initialized on #clear() which is called in the constructor

    // passed when copying

    /* Aqua Ring move status. */
    public aquaRing!: boolean;

    /** Stat boost stages. */
    public get boosts(): {[N in BoostName]: number}
    {
        return this._boosts;
    }
    private _boosts!: {[N in BoostName]: number};

    public readonly confusion = new TempStatus("confused", 3);
    public readonly embargo = new TempStatus("embargo", 3);

    /** Ingrain move status. */
    public ingrain!: boolean;

    public readonly magnetRise = new TempStatus("magnet rise", 3);

    /** Substitute move status. */
    public substitute!: boolean;

    // should only pass #isAbilitySuppressed()
    /** Whether the current ability is being suppressed. */
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

    // not passed when copying

    /** Override ability while active. */
    public get overrideAbility(): string { return this.overrideAbilityName; }
    public set overrideAbility(ability: string)
    {
        // reset truant if it no longer applies
        if (ability !== "truant") this._willTruant = false;

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
    /** ID number of ability. */
    private _overrideAbility!: number | null;
    /** Name of override ability. */
    private overrideAbilityName!: string;

    /** Bide move status. */
    public readonly bide = new TempStatus("bide", 1);

    /** Charge move status. */
    public readonly charge = new TempStatus("charging", 2, /*silent*/true);

    /** List of disabled move statuses. */
    public readonly disabledMoves: readonly TempStatus[] =
        Array.from({length: Moveset.maxSize},
            (_, i) => new TempStatus(`disabled move ${i + 1}`, 7));
    /** Removes disable status. */
    public enableMoves(): void
    {
        for (const disabled of this.disabledMoves) disabled.end();
    }

    /** Index of the last used move, or -1 if none yet. */
    public lastUsed!: number;

    /** Tracks locked moves, e.g. petaldance variants. */
    public readonly lockedMove = new VariableTempStatus(lockedMoves, 2);

    /** Whether this pokemon must recharge on the next turn. */
    public mustRecharge!: boolean;

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
     * Temporarily overridden types. This should not be included in toString()
     * since the parent Pokemon object should handle that. Should not be
     * accessed other than by the parent Pokemon object.
     */
    public overrideTypes!: readonly [Type, Type];
    /** Temporary third type. */
    public addedType!: Type;

    /** Roost move effect (single turn). */
    public roost!: boolean;

    public readonly slowStart = new TempStatus("slow start", 5);

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

    /** Taunt move status. */
    public readonly taunt = new TempStatus("taunt", 5);

    /** Torment move status. */
    public torment!: boolean;

    /** Two-turn move currently being prepared. */
    public readonly twoTurn = new VariableTempStatus(twoTurnMoves, 1,
            /*silent*/true);

    /** Whether the Unburden ability would be active here. */
    public unburden!: boolean;

    /** Uproar move status. */
    public readonly uproar = new TempStatus("uproar", 5);

    /** Whether the Truant ability will activate next turn. */
    public get willTruant(): boolean { return this._willTruant; }
    /** Indicates that the Truant ability has activated. */
    public activateTruant(): void
    {
        if (this.overrideAbilityName !== "truant")
        {
            throw new Error("Expected ability to equal truant but found " +
                (this.overrideAbilityName ?
                    this.overrideAbilityName : "no ability"));
        }

        // will invert to false on postTurn() so it's properly synced
        this._willTruant = true;
    }
    private _willTruant!: boolean;

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
        this.aquaRing = false;
        this._boosts =
        {
            atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0
        };
        this.confusion.end();
        this.embargo.end();
        this.ingrain = false;
        this.magnetRise.end();
        this.substitute = false;

        this.bide.end();
        this.charge.end();
        this.enableMoves();
        this.lastUsed = -1;
        this.lockedMove.reset();
        this.mustRecharge = false;
        this._overrideAbility = null;
        this.overrideAbilityName = "";
        this._overrideSpecies = null;
        this.overrideSpeciesName = "";
        this.overrideTypes = ["???", "???"];
        this.addedType = "???";
        this.roost = false;
        this.slowStart.end();
        this._stallTurns = 0;
        this.stalled = false;
        this.taunt.end();
        this.torment = false;
        this.twoTurn.reset();
        this.unburden = false;
        this.uproar.end();
        this._willTruant = false;
    }

    /**
     * Called at the end of the turn, after a Choice has been sent to the
     * server.
     */
    public postTurn(): void
    {
        // confusion counter handled by in-game events
        this.embargo.tick();
        this.magnetRise.tick();
        this.taunt.tick();
        // toxic counter handled by in-game events
        this.slowStart.tick();
        this.charge.tick();
        for (const disabled of this.disabledMoves) disabled.tick();
        this.lockedMove.tick();

        // after roost is used, the user is no longer grounded at the end of
        //  the turn
        this.roost = false;

        // stalling moves must be used successfully every turn or the turn
        //  counter will reset
        if (!this.stalled) this._stallTurns = 0;
        this.stalled = false;

        this.twoTurn.tick();

        if (this.overrideAbilityName === "truant")
        {
            this._willTruant = !this._willTruant;
        }
        else this._willTruant = false;
    }

    /**
     * Creates a shallow clone of this VolatileStatus.
     * @returns A shallow clone of this object.
     */
    public shallowClone(): VolatileStatus
    {
        const v = new VolatileStatus();
        v.aquaRing = this.aquaRing;
        v._boosts = this._boosts;
        this.confusion.copyTo(v.confusion);
        this.embargo.copyTo(v.embargo);
        v.ingrain = this.ingrain;
        this.magnetRise.copyTo(v.magnetRise);
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
        return `[${([] as string[]).concat(
            this.aquaRing ? ["aqua ring"] : [],
            (Object.keys(this._boosts) as BoostName[])
                .filter(key => this._boosts[key] !== 0)
                .map(key => `${key}: ${plus(this._boosts[key])}`),
            this.confusion.isActive ? [this.confusion.toString()] : [],
            this.embargo.isActive ? [this.embargo.toString()] : [],
            this.ingrain ? ["ingrain"] : [],
            this.magnetRise.isActive ? [this.magnetRise.toString()] : [],
            this.substitute ? ["has substitute"] : [],
            // override ability/species/etc are handled by Pokemon#toString()
            this.bide.isActive ? [this.bide.toString()] : [],
            this.charge.isActive ? [this.charge.toString()] : [],
            this.disabledMoves.filter(d => !d.isActive).map(d => d.toString()),
            this.lastUsed >= 0 ? [`last used move ${this.lastUsed + 1}`] : [],
            this.lockedMove.isActive ? [this.lockedMove.toString()] : [],
            this.mustRecharge ? ["must recharge"] : [],
            this.roost ? ["roosting"] : [],
            this.slowStart.isActive ? [this.slowStart.toString()] : [],
            this._stallTurns ?
                [pluralTurns("stalled", this._stallTurns - 1)] : [],
            this.taunt.isActive ? [this.taunt.toString()] : [],
            this.torment ? ["torment"] : [],
            // toxic turns handled by Pokemon#toString()
            this.twoTurn.isActive ?
                [`preparing ${this.twoTurn.toString()}`] : [],
            this.uproar.isActive ? [this.uproar.toString()] : [],
            this._willTruant ? ["truant next turn"] : [])
        .join(", ")}]`;
    }
}
