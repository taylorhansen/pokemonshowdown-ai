import * as dex from "../dex/dex";
import * as dexutil from "../dex/dex-util";
import { PokemonData, Type } from "../dex/dex-util";
import { PossibilityClass, ReadonlyPossibilityClass } from "./PossibilityClass";
import { ReadonlyStatTable, StatTable } from "./StatTable";

/** Readonly PokemonTraits representation. */
export interface ReadonlyPokemonTraits
{
    /** Current ability possibility. */
    readonly ability: ReadonlyPossibilityClass<string, dexutil.AbilityData>;
    /** Current species data. */
    readonly data: PokemonData;
    /** Current species possibility. */
    readonly species: ReadonlyPossibilityClass<string, dexutil.PokemonData>;
    /** Current stat range possibilities. */
    readonly stats: ReadonlyStatTable;
    /** Current primary and secondary types. */
    readonly types: readonly [Type, Type];
}

// TODO: cleanup/verify usage with regard to unknown traits and diverging
//  base/override traits
/**
 * Tracks the overridable traits of a Pokemon. Typically contains fields that
 * would warrant having two nearly identical fields on Pokemon and
 * VolatileStatus.
 */
export class PokemonTraits implements ReadonlyPokemonTraits
{
    /** @override */
    public get ability(): PossibilityClass<string, dexutil.AbilityData>
    {
        if (!this._ability) throw new Error("Ability not initialized");
        return this._ability;
    }
    /** Whether the ability possibility is initialized. */
    public get hasAbility(): boolean { return !!this._ability; }
    /**
     * Narrows ability possibility to the given ability names. Resets to a new
     * object if it can't be narrowed.
     */
    public setAbility(...abilities: string[]): void
    {
        // narrow if exist and can be set
        if (this._ability &&
            abilities.every(a => this._ability!.possibleValues.has(a)))
        {
            this._ability.narrow(...abilities);
        }
        // reset if not exist or cant be set
        else this._ability = new PossibilityClass(dex.abilities, ...abilities);
    }
    private _ability!: PossibilityClass<string, dexutil.AbilityData> | null;

    /** @override */
    public get data(): PokemonData
    {
        if (!this._data) throw new Error("Species not initialized or narrowed");
        return this._data;
    }
    private _data!: PokemonData | null;

    /** @override */
    public get species(): PossibilityClass<string, dexutil.PokemonData>
    {
        if (!this._species) throw new Error("Species not initialized");
        return this._species;
    }
    /** Whether the species possibility is initialized. */
    public get hasSpecies(): boolean { return !!this._species; }
    /**
     * Narrows species possibility to the given species name. Resets to a new
     * object if it can't be narrowed.
     */
    public setSpecies(name: string): void
    {
        // narrow if exist and can be set
        if (this._species && this._species.isSet(name) &&
            !this._species.definiteValue)
        {
            this._species.narrow(name);
        }
        // reset if no species or can't be the given value
        else if (!this._species || !this._species.isSet(name))
        {
            this.initSpecies(name);
        }
    }
    private _species!: PossibilityClass<string, dexutil.PokemonData> | null;

    /** @override */
    public get stats(): StatTable
    {
        if (!this._stats) throw new Error("Stat table not initialized");
        return this._stats;
    }
    private _stats!: StatTable | null;

    /** @override */
    public get types(): readonly [Type, Type]
    {
        if (!this._types) throw new Error("Types not initialized");
        return this._types;
    }
    public set types(types: readonly [Type, Type]) { this._types = types; }
    private _types!: readonly [Type, Type] | null;

    /** Creates a PokemonTraits object with default null values. */
    constructor() { this.reset(); }

    /** Resets all fields to null. */
    public reset(): void
    {
        this._ability = null;
        this._data = null;
        this._species = null;
        this._stats = null;
        this._types = null;
    }

    /** Copies data from another PokemonTraits object. */
    public copy(other: PokemonTraits): void
    {
        this._ability = other._ability;
        this._data = other._data;
        this._species = other._species;
        this._stats = other._stats;
        this._types = other._types;

        // TODO: is this necessary?
        if (this._species && !this._species.definiteValue)
        {
            // the other's then handler will reset some properties, so best
            //  to reassign them once that happens
            this._species.then(() => this.copy(other));
        }
    }

    /** Initializes default settings. */
    public init(): void
    {
        this._ability = new PossibilityClass(dex.abilities);
        this._stats = new StatTable();
        this._types = ["???", "???"];
        this.initSpecies();
    }

    private initSpecies(name?: string): void
    {
        const species = this._species = new PossibilityClass(dex.pokemon);
        species.then((_, data) =>
        {
            // reassigned species, no longer relevant
            if (this._species !== species) return;

            // narrow base traits
            this._data = data;
            this.setAbility(...data.abilities);
            this._types = data.types;
            this._stats!.data = data;
        });
        if (name) species.narrow(name);
    }
}
