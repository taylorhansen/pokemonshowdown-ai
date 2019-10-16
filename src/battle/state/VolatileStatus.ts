import { lockedMoves, twoTurnMoves } from "../dex/dex";
import { BoostName, boostNames, rolloutMoves, Type } from "../dex/dex-util";
import { Moveset } from "./Moveset";
import { PokemonTraits } from "./PokemonTraits";
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
    /**
     * Copies stat boosts from one VolatileStatus to this one.
     * @param source Source status to get the boosts from.
     */
    public copyBoostsFrom(source: VolatileStatus): void
    {
        for (const boost in boostNames)
        {
            // istanbul ignore if
            if (!boostNames.hasOwnProperty(boost)) continue;
            this.boosts[boost as BoostName] = source.boosts[boost as BoostName];
        }
    }
    private _boosts!: {[N in BoostName]: number};

    /** Confusion status. */
    public readonly confusion = new TempStatus("confused", 3);

    /** Embargo move status. */
    public readonly embargo = new TempStatus("embargo", 3);

    /** Focus Energy move status. */
    public focusEnergy!: boolean;

    /** Gasto Acid move status (suppresses current ability). */
    public gastroAcid!: boolean;

    /** Ingrain move status. */
    public ingrain!: boolean;

    /** Leech Seed move status. */
    public leechSeed!: boolean;

    /** Magnet Rise move status. */
    public readonly magnetRise = new TempStatus("magnet rise", 3);

    /** Substitute move status. */
    public substitute!: boolean;

    /** Who is trapping us. */
    public get trapped(): VolatileStatus | null { return this._trapped; }
    private _trapped!: VolatileStatus | null;
    /** Who we're trapping. */
    public get trapping(): VolatileStatus | null { return this._trapping; }
    private _trapping!: VolatileStatus | null;
    /**
     * Indicates that the provided pokemon slot is being trapping by this one.
     */
    public trap(target: VolatileStatus): void
    {
        this._trapping = target;
        target._trapped = this;
    }

    // not passed when copying

    /** Attract move status. */
    public attracted!: boolean;

    /** Bide move status. */
    public readonly bide = new TempStatus("bide", 1);

    /** Charge move status. */
    public readonly charge = new TempStatus("charging", 2, /*silent*/true);

    /** Defense curl move status. */
    public defenseCurl!: boolean;

    /** Destiny Bond move status. */
    public destinyBond!: boolean;

    /** List of disabled move statuses. */
    public readonly disabledMoves: readonly TempStatus[] =
        Array.from({length: Moveset.maxSize},
            (_, i) => new TempStatus(`disabled move ${i + 1}`, 7));
    /** Removes disable status. */
    public enableMoves(): void
    {
        for (const disabled of this.disabledMoves) disabled.end();
    }

    /** Encore move status. Encored move corresponds to `#lastUsed`. */
    public readonly encore = new TempStatus("encore", 7);

    /** Grudge move status. */
    public grudge!: boolean;

    /** Foresight/Miracle Eye move status. */
    public identified!: "foresight" | "miracleeye" | null;

    /**
     * Index of the last used move, or -1 if none yet. Resets at the beginning
     * of each turn, so this field can be used to check if a pokemon has not
     * yet used a move.
     */
    public lastUsed!: number;

    /**
     * Tracks locked moves, e.g. petaldance variants. Should be ticked after
     * every successful move attempt.
     *
     * After the 2nd or 3rd move, the user will become confused, explicitly
     * ending the status. However, if the user was already confused, the status
     * can be implicitly ended, so this VariableTempStatus field is
     * silent-endable.
     */
    public readonly lockedMove = new VariableTempStatus(lockedMoves, 2,
        /*silent*/true);

    /** Whether the pokemon has used Magic Coat during this turn. */
    public magicCoat!: boolean;

    /** Whether the pokemon has used Minimize while out. */
    public minimize!: boolean;

    /** Whether this pokemon must recharge on the next turn. */
    public mustRecharge!: boolean;

    /**
     * Override moveset, typically linked to the parent Pokemon's
     * `#baseMoveset`. Applies until switched out.
     */
    public readonly overrideMoveset = new Moveset();

    /** Override pokemon traits. Applies until switched out. */
    public readonly overrideTraits = new PokemonTraits();

    /** Temporary third type. */
    public addedType!: Type;

    /** Rollout-like move status. */
    public readonly rollout = new VariableTempStatus(rolloutMoves, 4,
        /*silent*/true);

    /** Roost move effect (single turn). */
    public roost!: boolean;

    /** First 5 turns of Slow Start ability. */
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

    /** Transform move status. */
    public transformed!: boolean;

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
        if (!this.overrideTraits.hasAbility ||
            !this.overrideTraits.ability.definiteValue ||
            this.overrideTraits.ability.definiteValue.name !== "truant")
        {
            throw new Error("Expected ability to equal truant but found " +
                (this.overrideTraits.hasAbility &&
                    this.overrideTraits.ability.definiteValue ?
                        this.overrideTraits.ability.definiteValue.name
                        : "unknown ability"));
        }

        // will invert to false on postTurn() so it's properly synced
        this._willTruant = true;
    }
    private _willTruant!: boolean;

    /** Creates a VolatileStatus object. */
    constructor() { this.clear(); }

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
        this.focusEnergy = false;
        this.gastroAcid = false;
        this.ingrain = false;
        this.leechSeed = false;
        this.magnetRise.end();
        this.substitute = false;
        this._trapped = null;
        this._trapping = null;

        this.clearUnpassable();
    }

    /** Clears statuses that can't be Baton Passed. */
    public clearUnpassable(): void
    {
        this.attracted = false;
        this.bide.end();
        this.charge.end();
        this.defenseCurl = false;
        this.destinyBond = false;
        this.enableMoves();
        this.encore.end();
        this.grudge = false;
        this.identified = null;
        this.lastUsed = -1;
        this.lockedMove.reset();
        this.magicCoat = false;
        this.minimize = false;
        this.mustRecharge = false;
        this.overrideMoveset.isolate();
        this.overrideTraits.reset();
        this.addedType = "???";
        this.rollout.reset();
        this.roost = false;
        this.slowStart.end();
        this._stallTurns = 0;
        this.stalled = false;
        this.taunt.end();
        this.torment = false;
        this.transformed = false;
        this.twoTurn.reset();
        this.unburden = false;
        this.uproar.end();
        this._willTruant = false;
    }

    /** Resets single-move statuses like Destiny Bond. */
    public resetSingleMove()
    {
        this.destinyBond = false;
        this.grudge = false;
        // TODO: rage
    }

    /** Called at the beginning of every turn to update temp statuses. */
    public preTurn(): void
    {
        this.lastUsed = -1;
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

        // move was not used
        if (this.lastUsed < 0)
        {
            this.lockedMove.reset();
            this.twoTurn.reset();
        }

        // reset single-turn statuses
        this.magicCoat = false;

        // after roost is used, the user is no longer grounded at the end of
        //  the turn
        this.roost = false;

        // stalling moves must be used successfully every turn or the turn
        //  counter will reset
        if (!this.stalled) this._stallTurns = 0;
        this.stalled = false;

        // toggle truant activation
        if (this.overrideTraits.hasAbility &&
            this.overrideTraits.ability.definiteValue &&
            this.overrideTraits.ability.definiteValue.name === "truant")
        {
            this._willTruant = !this._willTruant;
        }
        else this._willTruant = false;
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
            this.focusEnergy ? ["focus energy"] : [],
            this.gastroAcid ? ["gastro acid"] : [],
            this.ingrain ? ["ingrain"] : [],
            this.leechSeed ? ["leech seed"] : [],
            this.magnetRise.isActive ? [this.magnetRise.toString()] : [],
            this.substitute ? ["has substitute"] : [],
            // TODO: be more specific with trapping info
            this._trapped ? ["trapped"] : [],
            this._trapping ? ["trapping"] : [],
            this.attracted ? ["attracted"] : [],
            this.bide.isActive ? [this.bide.toString()] : [],
            this.charge.isActive ? [this.charge.toString()] : [],
            this.defenseCurl ? ["defense curl"] : [],
            this.destinyBond ? ["destiny bond"] : [],
            this.disabledMoves.filter(d => d.isActive).map(d => d.toString()),
            this.encore.isActive ? [this.encore.toString()] : [],
            this.grudge ? ["grudge"] : [],
            this.identified ? [this.identified] : [],
            this.lastUsed >= 0 ? [`last used move ${this.lastUsed + 1}`] : [],
            this.lockedMove.isActive ? [this.lockedMove.toString()] : [],
            this.minimize ? ["magic coat"] : [],
            this.minimize ? ["minimize"] : [],
            this.mustRecharge ? ["must recharge"] : [],
            // override traits are handled by Pokemon#toString()
            this.rollout.isActive ? [this.rollout.toString()] : [],
            this.roost ? ["roosting"] : [],
            this.slowStart.isActive ? [this.slowStart.toString()] : [],
            this._stallTurns ?
                [pluralTurns("stalled", this._stallTurns - 1)] : [],
            this.taunt.isActive ? [this.taunt.toString()] : [],
            this.torment ? ["torment"] : [],
            this.transformed ? ["transformed"] : [],
            // toxic turns handled by Pokemon#toString()
            this.twoTurn.isActive ?
                [`preparing ${this.twoTurn.toString()}`] : [],
            this.uproar.isActive ? [this.uproar.toString()] : [],
            this._willTruant ? ["truant next turn"] : [])
        .join(", ")}]`;
    }
}
