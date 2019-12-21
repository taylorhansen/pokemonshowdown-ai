import { LockedMove, lockedMoves, TwoTurnMove, twoTurnMoves } from "../dex/dex";
import { BoostName, rolloutMoves, Type } from "../dex/dex-util";
import { Moveset, ReadonlyMoveset } from "./Moveset";
import { PokemonTraits, ReadonlyPokemonTraits } from "./PokemonTraits";
import { ReadonlyTempStatus, TempStatus } from "./TempStatus";
import { pluralTurns, plus } from "./utility";
import { ReadonlyVariableTempStatus, VariableTempStatus  } from
    "./VariableTempStatus";

/** Readonly VolatileStatus representation. */
export interface ReadonlyVolatileStatus
{
    // passed when copying

    /* Aqua Ring move status. */
    readonly aquaRing: boolean;
    /** Stat boost stages. */
    readonly boosts: {readonly [N in BoostName]: number};
    /** Confusion status. */
    readonly confusion: ReadonlyTempStatus;
    /** Curse status. */
    readonly curse: boolean;
    /** Embargo move status. */
    readonly embargo: ReadonlyTempStatus;
    /** Focus Energy move status. */
    readonly focusEnergy: boolean;
    /** Gasto Acid move status (suppresses current ability). */
    readonly gastroAcid: boolean;
    /** Ingrain move status. */
    readonly ingrain: boolean;
    /** Leech Seed move status. */
    readonly leechSeed: boolean;
    /** Magnet Rise move status. */
    readonly magnetRise: ReadonlyTempStatus;
    /** Nightmare move status. */
    readonly nightmare: boolean;
    /**
     * Number of turns left until Perish Song activates (max 3), or 0 if
     * inactive.
     */
    readonly perish: number;
    /** Power Trick move status. */
    readonly powerTrick: boolean;
    /** Substitute move status. */
    readonly substitute: boolean;
    /** Who is trapping us. */
    readonly trapped: ReadonlyVolatileStatus | null;
    /** Who we're trapping. */
    readonly trapping: ReadonlyVolatileStatus | null;

    // not passed when copying

    /** Attract move status. */
    readonly attract: boolean;
    /** Bide move status. */
    readonly bide: ReadonlyTempStatus;
    /** Charge move status. */
    readonly charge: ReadonlyTempStatus;
    /** Defense curl move status. */
    readonly defenseCurl: boolean;
    /** Destiny Bond move status. */
    readonly destinyBond: boolean;
    /** List of disabled move statuses. */
    readonly disabledMoves: readonly ReadonlyTempStatus[];
    /** Encore move status. Encored move corresponds to `#lastUsed`. */
    readonly encore: ReadonlyTempStatus;
    /** Grudge move status. */
    readonly grudge: boolean;
    /** Heal Block move status. */
    readonly healBlock: ReadonlyTempStatus;
    /** Foresight/Miracle Eye move status. */
    readonly identified: "foresight" | "miracleEye" | null;
    /**
     * Tracks locked moves, e.g. petaldance variants. Should be ticked after
     * every successful move attempt.
     *
     * After the 2nd or 3rd move, the user will become confused, explicitly
     * ending the status. However, if the user was already confused, the status
     * can be implicitly ended, so this VariableTempStatus field is
     * silent-endable.
     */
    readonly lockedMove: ReadonlyVariableTempStatus<LockedMove>;
    /** Whether the pokemon has used Magic Coat during this turn. */
    readonly magicCoat: boolean;
    /** Whether the pokemon has used Minimize while out. */
    readonly minimize: boolean;
    /** Mud Sport move status. */
    readonly mudSport: boolean;
    /** Whether this pokemon must recharge on the next turn. */
    readonly mustRecharge: boolean;
    /**
     * Override moveset, typically linked to the parent Pokemon's
     * `#baseMoveset`. Applies until switched out.
     */
    readonly overrideMoveset: ReadonlyMoveset;
    /** Override pokemon traits. Applies until switched out. */
    readonly overrideTraits: ReadonlyPokemonTraits;
    /** Temporary third type. */
    readonly addedType: Type;
    /** Rage move status. */
    readonly rage: boolean;
    /** Rollout-like move status. */
    readonly rollout: ReadonlyVariableTempStatus<keyof typeof rolloutMoves>;
    /** Roost move effect (single turn). */
    readonly roost: boolean;
    /** First 5 turns of Slow Start ability. */
    readonly slowStart: ReadonlyTempStatus;
    /** Snatch move status. */
    readonly snatch: boolean;
    /** Whether we have successfully stalled this turn and the effect is up. */
    readonly stalling: boolean;
    /** Number of turns this pokemon has used a stalling move, e.g. Protect. */
    readonly stallTurns: number;
    /** Number of Stockpile uses. */
    readonly stockpile: number;
    /** Taunt move status. */
    readonly taunt: ReadonlyTempStatus;
    /** Torment move status. */
    readonly torment: boolean;
    /** Transform move status. */
    readonly transformed: boolean;
    /** Two-turn move currently being prepared. */
    readonly twoTurn: ReadonlyVariableTempStatus<TwoTurnMove>;
    /** Whether the Unburden ability would be active here. */
    readonly unburden: boolean;
    /** Uproar move status. */
    readonly uproar: ReadonlyTempStatus;
    /** Whether the Truant ability will activate next turn. */
    readonly willTruant: boolean;
}

/**
 * Contains the minor or temporary status conditions of a pokemon that are
 * removed upon switch.
 */
export class VolatileStatus implements ReadonlyVolatileStatus
{
    // all fields are initialized on #clear() which is called in the constructor

    // passed when copying

    /** @override */
    public aquaRing!: boolean;

    /** @override */
    public get boosts(): {[N in BoostName]: number} { return this._boosts; }
    private _boosts!: {[N in BoostName]: number};

    /** @override */
    public readonly confusion = new TempStatus("confused", 3);

    /** @override */
    public curse!: boolean;

    /** @override */
    public readonly embargo = new TempStatus("embargo", 3);

    /** @override */
    public focusEnergy!: boolean;

    /** @override */
    public gastroAcid!: boolean;

    /** @override */
    public ingrain!: boolean;

    /** @override */
    public leechSeed!: boolean;

    /** @override */
    public readonly magnetRise = new TempStatus("magnet rise", 3);

    /** @override */
    public nightmare!: boolean;

    /** @override */
    public get perish(): number { return this._perish; }
    public set perish(turns: number)
    {
        this._perish = Math.max(0, Math.min(turns, 3));
    }
    private _perish!: number;

    /** @override */
    public powerTrick!: boolean;

    /** @override */
    public substitute!: boolean;

    /** @override */
    public get trapped(): VolatileStatus | null { return this._trapped; }
    private _trapped!: VolatileStatus | null;
    /** @override */
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

    /** @override */
    public attract!: boolean;

    /** @override */
    public readonly bide = new TempStatus("bide", 1);

    /** @override */
    public readonly charge = new TempStatus("charging", 2, /*silent*/true);

    /** @override */
    public defenseCurl!: boolean;

    /** @override */
    public destinyBond!: boolean;

    /** @override */
    public readonly disabledMoves: readonly TempStatus[] =
        Array.from({length: Moveset.maxSize},
            (_, i) => new TempStatus(`disabled move ${i + 1}`, 7));
    /** Removes disable status. */
    public enableMoves(): void
    {
        for (const disabled of this.disabledMoves) disabled.end();
    }

    /** @override */
    public readonly encore = new TempStatus("encore", 7);

    /** @override */
    public grudge!: boolean;

    /** @override */
    public healBlock = new TempStatus("heal block", 5);

    /** @override */
    public identified!: "foresight" | "miracleEye" | null;

    /** @override */
    public readonly lockedMove = new VariableTempStatus(lockedMoves, 2,
        /*silent*/true);

    /** @override */
    public magicCoat!: boolean;

    /** @override */
    public minimize!: boolean;

    /** @override */
    public mudSport!: boolean;

    /** @override */
    public mustRecharge!: boolean;

    /** @override */
    public readonly overrideMoveset = new Moveset();

    /** @override */
    public readonly overrideTraits = new PokemonTraits();

    /** @override */
    public addedType!: Type;

    /** @override */
    public rage!: boolean;

    /** @override */
    public readonly rollout = new VariableTempStatus(rolloutMoves, 4,
        /*silent*/true);

    /** @override */
    public roost!: boolean;

    /** @override */
    public readonly slowStart = new TempStatus("slow start", 5);

    /** @override */
    public snatch!: boolean;

    /** @override */
    public get stalling(): boolean { return this._stalling; }
    /** @override */
    public get stallTurns(): number { return this._stallTurns; }
    /**
     * Sets the stall flag. Should be called once per turn if it's on.
     * @param flag Value of the flag.
     */
    public stall(flag: boolean): void
    {
        this._stalling = flag;
        this._stallTurns = flag ? this._stallTurns + 1 : 0;
    }
    private _stalling!: boolean;
    private _stallTurns!: number;

    /** @override */
    public get stockpile(): number { return this._stockpile; }
    public set stockpile(uses: number)
    {
        this._stockpile = Math.max(0, Math.min(uses, 3));
    }
    private _stockpile!: number;

    /** @override */
    public readonly taunt = new TempStatus("taunt", 5);

    /** @override */
    public torment!: boolean;

    /** @override */
    public transformed!: boolean;

    /** @override */
    public readonly twoTurn = new VariableTempStatus(twoTurnMoves, 1,
            /*silent*/true);

    /** @override */
    public unburden!: boolean;

    /** @override */
    public readonly uproar = new TempStatus("uproar", 5);

    /** @override */
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
        this.curse = false;
        this.embargo.end();
        this.focusEnergy = false;
        this.gastroAcid = false;
        this.ingrain = false;
        this.leechSeed = false;
        this.magnetRise.end();
        this.nightmare = false;
        this._perish = 0;
        this.powerTrick = false;
        this.substitute = false;
        this._trapped = null;
        this._trapping = null;

        this.clearUnpassable();
    }

    /** Clears statuses that can't be Baton Passed. */
    public clearUnpassable(): void
    {
        this.attract = false;
        this.bide.end();
        this.charge.end();
        this.defenseCurl = false;
        this.destinyBond = false;
        this.enableMoves();
        this.encore.end();
        this.grudge = false;
        this.healBlock.end();
        this.identified = null;
        this.lockedMove.reset();
        this.magicCoat = false;
        this.minimize = false;
        this.mudSport = false;
        this.mustRecharge = false;
        this.overrideMoveset.isolate();
        this.overrideTraits.reset();
        this.addedType = "???";
        this.rage = false;
        this.rollout.reset();
        this.roost = false;
        this.slowStart.end();
        this.snatch = false;
        this._stalling = false;
        this._stallTurns = 0;
        this._stockpile = 0;
        this.taunt.end();
        this.torment = false;
        this.transformed = false;
        this.twoTurn.reset();
        this.unburden = false;
        this.uproar.end();
        this._willTruant = false;
    }

    /** Indicates that the pokemon spent its turn being inactive. */
    public inactive(): void
    {
        this.resetSingleMove();

        // move-locking statuses cancel when the intended move was prevented
        //  from being attempted
        this.bide.end();
        this.lockedMove.reset();
        this.twoTurn.reset();
        // uproar doesn't end if prevented from using subsequent moves

        this._stalling = false;
        this._stallTurns = 0;
    }

    /** Resets single-move statuses like Destiny Bond. */
    public resetSingleMove(): void
    {
        this.destinyBond = false;
        this.grudge = false;
        this.rage = false;
    }

    /**
     * Breaks currently active stalling move effects mid-turn without updating
     * the fail rate for the next use.
     */
    public feint(): void
    {
        this._stalling = false;
    }

    /** Called at the beginning of every turn to update temp statuses. */
    public preTurn(): void
    {
        // TODO: what to do?
    }

    /** Called at the end of every turn to update temp statuses. */
    public postTurn(): void
    {
        // confusion counter handled by in-game events
        this.embargo.tick();
        this.magnetRise.tick();
        this.taunt.tick();
        this.slowStart.tick();
        this.charge.tick();
        for (const disabled of this.disabledMoves) disabled.tick();

        // reset single-turn statuses
        this.magicCoat = false;
        this.roost = false;
        this.snatch = false;
        this._stalling = false;

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
            this.curse ? ["cursed"] : [],
            this.embargo.isActive ? [this.embargo.toString()] : [],
            this.focusEnergy ? ["focus energy"] : [],
            this.gastroAcid ? ["gastro acid"] : [],
            this.ingrain ? ["ingrain"] : [],
            this.leechSeed ? ["leech seed"] : [],
            this.magnetRise.isActive ? [this.magnetRise.toString()] : [],
            this.nightmare ? ["nightmare"] : [],
            this._perish > 0 ? [`perish in ${pluralTurns(this._perish)}`] : [],
            this.powerTrick ? ["power trick"] : [],
            this.substitute ? ["has substitute"] : [],
            // TODO: be more specific with trapping info
            this._trapped ? ["trapped"] : [],
            this._trapping ? ["trapping"] : [],
            this.attract ? ["attracted"] : [],
            this.bide.isActive ? [this.bide.toString()] : [],
            this.charge.isActive ? [this.charge.toString()] : [],
            this.defenseCurl ? ["defense curl"] : [],
            this.destinyBond ? ["destiny bond"] : [],
            this.disabledMoves.filter(d => d.isActive).map(d => d.toString()),
            this.encore.isActive ? [this.encore.toString()] : [],
            this.grudge ? ["grudge"] : [],
            this.healBlock.isActive ? [this.healBlock.toString()] : [],
            this.identified ? [this.identified] : [],
            this.lockedMove.isActive ? [this.lockedMove.toString()] : [],
            this.minimize ? ["magic coat"] : [],
            this.minimize ? ["minimize"] : [],
            this.mudSport ? ["mud sport"] : [],
            this.mustRecharge ? ["must recharge"] : [],
            // override traits are handled by Pokemon#toString()
            this.rage ? ["rage"] : [],
            this.rollout.isActive ? [this.rollout.toString()] : [],
            this.roost ? ["roosting"] : [],
            this.slowStart.isActive ? [this.slowStart.toString()] : [],
            this.snatch ? ["snatching"] : [],
            this._stallTurns ?
                [pluralTurns("stalled", this._stallTurns - 1)] : [],
            this._stockpile > 0 ? [`stockpile ${this._stockpile}`] : [],
            this.taunt.isActive ? [this.taunt.toString()] : [],
            this.torment ? ["torment"] : [],
            this.transformed ? ["transformed"] : [],
            this.twoTurn.isActive ?
                [`preparing ${this.twoTurn.toString()}`] : [],
            this.uproar.isActive ? [this.uproar.toString()] : [],
            this._willTruant ? ["truant next turn"] : [])
        .join(", ")}]`;
    }
}
