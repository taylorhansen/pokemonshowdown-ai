import * as dex from "../dex/dex";
import { PokemonData, Type } from "../dex/dex-util";
import { PossibilityClass, ReadonlyPossibilityClass } from "./PossibilityClass";
import { ReadonlyStatTable, StatTable } from "./StatTable";

export interface ReadonlyPokemonTraits
{
    /** Current ability possibility. */
    readonly ability: ReadonlyPossibilityClass<typeof dex.abilities[string]>;
    /** Current species data. */
    readonly data: PokemonData;
    /** Current species possibility. */
    readonly species: PossibilityClass<typeof dex.pokemon[string]>;
    /** Current stat range possibilities. */
    readonly stats: ReadonlyStatTable;
    /** Current primary and secondary types. */
    readonly types: readonly [Type, Type];
}

/**
 * Tracks the overridable traits of a Pokemon. Typically contains fields that
 * would warrant having two nearly identical fields on Pokemon and
 * VolatileStatus.
 */
export class PokemonTraits implements ReadonlyPokemonTraits
{
    /** @override */
    public get ability(): PossibilityClass<typeof dex.abilities[string]>
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
    private _ability!: PossibilityClass<typeof dex.abilities[string]> | null;

    /** @override */
    public get data(): PokemonData
    {
        if (!this._data) throw new Error("Species not initialized or narrowed");
        return this._data;
    }
    private _data!: PokemonData | null;

    /** @override */
    public get species(): PossibilityClass<typeof dex.pokemon[string]>
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
    public setSpecies(species: string): void
    {
        // narrow if exist and can be set
        if (this._species && this._species.isSet(species) &&
            !this._species.definiteValue)
        {
            this._species.narrow(species);
        }
        // reset if not exist or definite value isnt whats provided
        else if (!this._species || !this._species.isSet(species))
        {
            this._species = new PossibilityClass(dex.pokemon, species);
            // immediately call narrow handler
            this.onSpeciesNarrowed(this._species);
        }
    }
    private _species!: PossibilityClass<typeof dex.pokemon[string]> | null;

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

    /** Callback for when the `#species` possibility is narrowed. */
    private readonly onSpeciesNarrowed =
        (pc: PossibilityClass<typeof dex.pokemon[string]>) =>
    {
        // once species is known, everything else can be fully initialized
        // first must make sure we didn't reassign the species reference, else
        //  this would be invalid
        if (pc !== this._species) return;

        const data = pc.map[pc.definiteValue!];
        this._data = data;

        // narrow ability possibilities if not already set to something else
        this.setAbility(...data.abilities);

        // copy type data
        // no need to guard from type changes since form changes can override
        this._types = data.types;

        // initialize stat ranges
        if (this._stats) this._stats.data = data;
    }

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

        if (this._species && !this._species.definiteValue)
        {
            // the other's onNarrow handler will reset some properties, so best
            //  to reassign them once that happens
            this._species.onNarrow(() => this.copy(other));
        }
    }

    /** Initializes default settings. */
    public init(): void
    {
        this._ability = new PossibilityClass(dex.abilities);
        this._species = new PossibilityClass(dex.pokemon);
        this._stats = new StatTable();
        this._types = ["???", "???"];

        this._species.onNarrow(this.onSpeciesNarrowed);
    }
}
