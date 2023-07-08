import {GenderName} from "@pkmn/types";
import * as dex from "../dex";
import {Hp, ReadonlyHp} from "./Hp";
import {
    MajorStatusCounter,
    ReadonlyMajorStatusCounter,
} from "./MajorStatusCounter";
import {Move} from "./Move";
import {Moveset, ReadonlyMoveset} from "./Moveset";
import {ReadonlyStatTable, StatTable} from "./StatTable";
import {ReadonlyTeam, Team} from "./Team";
import {ReadonlyVolatileStatus, VolatileStatus} from "./VolatileStatus";

/** Readonly {@link Pokemon} representation. */
export interface ReadonlyPokemon {
    /** Reference to the parent Team. */
    readonly team?: ReadonlyTeam;
    /** Whether this is the current active pokemon. */
    readonly active: boolean;

    /**
     * Current species.
     *
     * May be overridden by {@link volatile}.
     */
    readonly species: string;
    /** Current base species. */
    readonly baseSpecies: string;

    /**
     * Current types.
     *
     * May be overridden by {@link volatile}.
     */
    readonly types: readonly [dex.Type, dex.Type];
    /** Current base types. */
    readonly baseTypes: readonly [dex.Type, dex.Type];

    /**
     * Current stats.
     *
     * May be overridden by {@link volatile}.
     */
    readonly stats: ReadonlyStatTable;
    /** Current base stats. */
    readonly baseStats: ReadonlyStatTable;

    /**
     * Current ability, or the empty string if unknown.
     *
     * May be overridden by {@link volatile}.
     */
    readonly ability: string;
    /** Current base ability, or the empty string if unknown. */
    readonly baseAbility: string;

    /**
     * Current held item (including `"none"`), or the empty string if unknown.
     */
    readonly item: string;
    /**
     * Last consumed item (including `"none"`), or the empty string if unknown.
     */
    readonly lastItem: string;

    /**
     * Current moveset.
     *
     * May be overridden by {@link volatile}.
     */
    readonly moveset: ReadonlyMoveset;
    /** Current base moveset. */
    readonly baseMoveset: ReadonlyMoveset;

    /** Pokemon's gender. */
    readonly gender: GenderName;

    /** Current Hidden Power type, or `null` if unknown. */
    readonly hpType: dex.HpType | null;

    /** Happiness value between 0 and 255, or `null` if unknown. */
    readonly happiness: number | null;

    /** Info about the pokemon's hit points. */
    readonly hp: ReadonlyHp;

    /** Major status turn counter manager. */
    readonly majorStatus: ReadonlyMajorStatusCounter;

    /** Minor status conditions. Cleared on switch. */
    readonly volatile: ReadonlyVolatileStatus;

    /**
     * Encodes all pokemon data into a string.
     *
     * @param indent Indentation level to use.
     * @param hpPercent Whether to report HP as a percentage.
     */
    readonly toString: (indent?: number, hpPercent?: boolean) => string;
}

/** Holds all the possibly incomplete info about a pokemon. */
export class Pokemon implements ReadonlyPokemon {
    /** @override */
    public readonly team?: Team;
    /** @override */
    public get active(): boolean {
        return !!this._volatile;
    }

    /** @override */
    public get species(): string {
        return this._volatile?.species ?? this.baseSpecies;
    }
    /** @override */
    public get baseSpecies(): string {
        return this._baseSpecies;
    }
    private _baseSpecies: string;

    /** @override */
    public get stats(): StatTable {
        return this._volatile?.stats ?? this.baseStats;
    }
    /** @override */
    public get baseStats(): StatTable {
        return this._baseStats;
    }
    private _baseStats: StatTable;

    /** @override */
    public get types(): readonly [dex.Type, dex.Type] {
        let result = this._volatile?.types ?? this.baseTypes;
        // Roost move status removes flying type.
        if (this._volatile?.roost) {
            result = result.map(t => (t === "flying" ? "???" : t)) as [
                dex.Type,
                dex.Type,
            ];
        }
        return result;
    }
    /** @override */
    public get baseTypes(): readonly [dex.Type, dex.Type] {
        return this._baseTypes;
    }
    private _baseTypes: readonly [dex.Type, dex.Type];

    /** @override */
    public get ability(): string {
        return this._volatile?.ability ?? this.baseAbility;
    }
    /** @override */
    public get baseAbility(): string {
        return this._baseAbility;
    }
    /**
     * Sets the {@link VolatileStatus.ability override} ability if active,
     * otherwise the {@link baseAbility base} ability.
     */
    public setAbility(ability: string, skillswap?: boolean): void {
        if (this._volatile) {
            if (skillswap) {
                if (this.skillswap) {
                    this.skillswap = null;
                } else {
                    // Defer override ability until next revealAbility() with
                    // skillswap=true in order to complete the inference.
                    this.skillswap = ability;
                    return;
                }
            }
            this._volatile.ability = ability;
        } else {
            this._baseAbility = ability;
        }
    }
    /**
     * Indicates that the pokemon's ability has been revealed or activated.
     *
     * Sets the {@link VolatileStatus.ability override} ability, along with
     * {@link baseAbility base} if the pokemon's ability wasn't already
     * overridden.
     */
    public revealAbility(ability: string, skillswap?: boolean): void {
        if (this._volatile) {
            const oldOverrideAbility = this._volatile.ability;
            if (skillswap) {
                if (this.skillswap) {
                    this._volatile.ability = this.skillswap;
                    this.skillswap = null;
                } else {
                    // Defer override ability until next setAbility() with
                    // skillswap=true in order to complete the inference.
                    this.skillswap = ability;
                }
            } else {
                this._volatile.ability = ability;
            }
            // If the current ability was already overridden by some effect
            // (transform, form change, worryseed, etc), then we shouldn't set
            // the base ability since it's really the override ability that's
            // being activated/revealed.
            if (
                this._volatile.transformed ||
                this._volatile.species !== this.baseSpecies ||
                oldOverrideAbility !== this._baseAbility
            ) {
                return;
            }
        }
        this._baseAbility = ability;
    }
    /** Intermediate value for tracking Skill Swap move effect. */
    private skillswap: string | null = null;
    private _baseAbility: string;

    /**
     * Does a form change for this Pokemon.
     *
     * @param species The species to change into.
     * @param level New form's level for stat calcs.
     * @param perm Whether this is a permanent form change. Default false. Can
     * also be overridden to false if {@link VolatileStatus.transformed} is
     * true.
     */
    public formChange(species: string, level: number, perm = false): void {
        if (!Object.hasOwnProperty.call(dex.pokemon, species)) {
            throw new Error(`Unknown species ${species}`);
        }
        const data = dex.pokemon[species];

        // Completely diverge from current override traits.
        this.volatile.species = data.name;
        this.volatile.types = data.types;
        // Note: HP stat can't change during battle.
        // TODO: Preserve evs/ivs/nature.
        this.volatile.stats = StatTable.base(data, level, this.stats.hp);
        this.volatile.ability =
            data.abilities.length === 1 ? data.abilities[0] : "";

        if (perm && !this.volatile.transformed) {
            // Also completely diverge from original base traits.
            this._baseSpecies = this.volatile.species;
            this._baseTypes = this.volatile.types;
            this._baseStats = this.volatile.stats;
            this._baseAbility = this.volatile.ability;
        }
    }

    /** @override */
    public get item(): string {
        return this._item;
    }
    /** @override */
    public get lastItem(): string {
        return this._lastItem;
    }
    /** Sets the current item. */
    public setItem(item: string): void {
        this._item = item;
    }
    /**
     * Indicates that an item was just removed from this Pokemon.
     *
     * @param consumed False if the item was removed or transferred. If the item
     * was consumed (i.e., it can be brought back using the Recycle move), this
     * is set either to the item's name or just true if the item is unknown.
     */
    public removeItem(consumed?: string | boolean): void {
        if (consumed === true) {
            this._lastItem = this._item;
        } else if (consumed) {
            // TODO: Emit a log if mismatch with this._item.
            this._lastItem = consumed;
        }
        this._item = "none";
    }
    /** Indicates that the item was recovered via the Recycle move. */
    public recycle(item: string): void {
        if (this._lastItem !== item) {
            // TODO: This shouldn't be an error, just log the inconsistency
            // (including if lastItem was unknown).
            throw new Error(
                `Pokemon gained '${item}' via Recycle but last consumed item ` +
                    `was '${this._lastItem}'`,
            );
        }
        this._lastItem = "none";
        this._item = item;
    }
    /**
     * Swaps items with another Pokemon.
     *
     * @param target The Pokemon to swap items with.
     */
    public swapItems(target: Pokemon): void {
        [this._item, target._item] = [target._item, this._item];
    }
    private _item = "";
    private _lastItem = "none";

    /** @override */
    public get moveset(): Moveset {
        return this._volatile?.moveset ?? this.baseMoveset;
    }
    /** @override */
    public readonly baseMoveset: Moveset;
    /** Overrides a move slot via Mimic until switched out. */
    public mimic(name: string): void {
        // Mimicked moves have 5 pp and maxed maxpp.
        this.moveset.replace("mimic", new Move(name, "max", 5));
    }
    /** Permanently replaces a move slot via Sketch. */
    public sketch(name: string): void {
        // Sketched moves have no pp ups applied.
        this.moveset.replace("sketch", new Move(name, "min"), true /*base*/);
    }

    /** @override */
    public gender: GenderName;

    /** @override */
    public get hpType(): dex.HpType | null {
        // Note(gen4): Uses current form's stat table even if transformed.
        return this.stats.hpType;
    }

    /** @override */
    public get happiness(): number | null {
        return this._happiness;
    }
    public set happiness(value: number | null) {
        if (value === null) {
            this._happiness = null;
        } else {
            this._happiness = Math.max(0, Math.min(value, 255));
        }
    }
    private _happiness: number | null = null;

    /** @override */
    public readonly hp = new Hp();

    /** @override */
    public readonly majorStatus = new MajorStatusCounter();

    /** @override */
    public get volatile(): VolatileStatus {
        if (!this._volatile) {
            throw new Error("Pokemon is currently inactive");
        }
        return this._volatile;
    }
    private _volatile: VolatileStatus | null = null;

    /**
     * Creates a Pokemon.
     *
     * @param species Species name.
     * @param level Level for stat calcs.
     * @param gender Pokemon's gender.
     * @param moves Optional moveset to fill in.
     * @param team Optional reference to the parent Team.
     */
    public constructor(
        species: string,
        level = 100,
        moves?: readonly string[],
        gender: GenderName = "N",
        team?: Team,
    ) {
        if (!Object.hasOwnProperty.call(dex.pokemon, species)) {
            throw new Error(`Unknown species ${species}`);
        }
        const data = dex.pokemon[species];

        this._baseSpecies = data.name;
        this._baseTypes = data.types;
        this._baseStats = StatTable.base(data, level);
        this._baseAbility =
            data.abilities.length === 1 ? data.abilities[0] : "";

        if (moves) {
            this.baseMoveset = new Moveset(moves, moves.length);
        } else {
            this.baseMoveset = new Moveset(data.movepool);
        }

        this.gender = gender;

        if (team) {
            this.team = team;
        }
    }

    /** Indicates that the pokemon spent its turn being inactive. */
    public inactive(): void {
        this.volatile.inactive();
    }

    /** Called at the beginning of every turn to update temp statuses. */
    public preTurn(): void {
        if (this.active) {
            this.volatile.preTurn();
        }
    }

    /** Called at the end of every turn to update temp statuses. */
    public postTurn(): void {
        this.skillswap = null;
        if (this.active) {
            this.majorStatus.postTurn();
            this.volatile.postTurn();
        }
    }

    /**
     * Switches this Pokemon in to replace the given Pokemon in its slot.
     *
     * @param mon Pokemon to replace with. If left unspecified, then the Pokemon
     * is switching into an empty slot.
     * @param selfSwitch Self-switch status if any.
     */
    public switchInto(
        mon?: Pokemon | null,
        selfSwitch?: dex.SelfSwitchType | null,
    ): void {
        // Create our own volatile status object.
        if (!mon?._volatile) {
            this._volatile = new VolatileStatus();
        } else {
            // Transfer volatile status object.
            this._volatile = mon._volatile;
            mon._volatile = null;
        }

        // Switch out provided mon.

        // Toxic counter resets on switch.
        if (mon?.majorStatus.current === "tox") {
            mon.majorStatus.resetCounter();
        }

        // Switch in new mon.

        // Handle batonpass.
        if (selfSwitch === "copyvolatile") {
            // Leave self-switch passable.
            this._volatile.clearUnpassable();
            this._volatile.batonPass(this.majorStatus.current ?? undefined);
        } else if (selfSwitch) {
            this._volatile.clearPassable();
            // Leave self-switch passable statuses.
            this._volatile.clearUnpassable();
        } else {
            this._volatile.clear();
        }

        // Make sure volatile has updated info about this pokemon.
        this._volatile.species = this._baseSpecies;
        this._volatile.types = this._baseTypes;
        this._volatile.stats = this._baseStats;
        this._volatile.ability = this._baseAbility;
        this._volatile.moveset.setBase(this.baseMoveset);
        if (selfSwitch) {
            this._volatile.selfSwitch();
        }
    }

    /** Indicates that the pokemon has transformed into its target. */
    public transform(target: Pokemon): void {
        const v = this.volatile;
        v.transformed = true;

        // Copy boosts.
        const tv = target.volatile;
        for (const stat of dex.boostKeys) {
            v.boosts[stat] = tv.boosts[stat];
        }

        // Copy traits but preserve some according to transform rules.
        v.species = target.species;
        v.types = target.types;
        // Note: Transform preserves source's hp stat.
        v.stats = target.stats.transform(this.stats.hp);
        v.ability = target.ability;

        // Link moveset inference.
        this.volatile.moveset.setTransformTarget(target.moveset);
    }

    // istanbul ignore next: Only used for logging.
    /** @override */
    public toString(indent = 0, hpPercent?: boolean): string {
        const s = " ".repeat(indent);
        return `\
${this.stringifySpecies()}${this.gender ? ` ${this.gender}` : ""} \
${this.hp.toString(hpPercent)}
${s}stats: ${this.stringifyStats()}
${s}status: ${this.majorStatus.toString()}
${s}active: ${this.active}\
${this.active ? `\n${s}volatile: ${this.volatile.toString()}` : ""}
${s}types: ${this.stringifyTypes()}
${s}ability: ${this.stringifyAbility()}
${s}item: ${this.stringifyItem()}
${this.stringifyMoveset(indent)}`;
    }

    // istanbul ignore next: Only used for logging.
    /** Displays the species as well as whether it's overridden. */
    private stringifySpecies(): string {
        const base = this.baseSpecies;
        const override = this._volatile?.species;

        if (!override || override === base) {
            return base;
        }
        return `${override} (base: ${base})`;
    }

    // istanbul ignore next: Only used for logging.
    /** Displays stat data as well as whether it's overridden. */
    private stringifyStats(): string {
        const base = this.baseStats;
        const override = this._volatile?.stats;

        if (!override || base === override) {
            return base.toString();
        }
        return `${override} (base: ${base})`;
    }

    // istanbul ignore next: Only used for logging.
    /** Displays type values. */
    private stringifyTypes(): string {
        const base = this.baseTypes;
        const override = this._volatile?.types;
        if (!override || base === override) {
            return `[${base.join(", ")}]`;
        }
        return `[${override.join(", ")}] (base: [${base.join(", ")}])`;
    }

    // istanbul ignore next: Only used for logging.
    /** Displays the possible/overridden/suppressed values of the ability. */
    private stringifyAbility(): string {
        const base = this.baseAbility;
        const baseStr = base
            ? base
            : `possibly [${dex.pokemon[this.baseSpecies].abilities.join(
                  ", ",
              )}]`;
        const override = this._volatile?.ability;

        if (!override || base === override) {
            return baseStr;
        }

        const overrideStr = override
            ? override
            : `possibly [${dex.pokemon[this.species].abilities.join(", ")}]`;
        return `${overrideStr} (base: ${baseStr})`;
    }

    // istanbul ignore next: Only used for logging.
    /** Displays the last and current values of the held item field. */
    private stringifyItem(): string {
        const base = this._item || "<unknown>";

        const last = this._lastItem || "<unknown>";

        if (last === "none") {
            return base;
        }
        return `${base} (consumed: ${last})`;
    }

    // istanbul ignore next: Only used for logging.
    /**
     * Displays moveset data with happiness and possibly-overridden Hidden Power
     * type data if applicable.
     */
    private stringifyMoveset(indent = 0): string {
        const s = " ".repeat(indent);

        // Stringify hp type.
        const hpTypeStr = this.stats.hpType ?? "unknown";

        // Stringify moveset.
        let result =
            `${s}moveset:\n` +
            this.moveset.toString(indent + 4, this._happiness, hpTypeStr);

        if (this._volatile) {
            // Moveset property was actually override moveset.
            // Need to also include base moveset.

            // Stringify base Hidden Power type.
            const baseHpTypeStr = this.baseStats.hpType ?? "unknown";

            // Stringify base moveset.
            result +=
                `\n${s}base moveset:\n` +
                this.baseMoveset.toString(
                    indent + 4,
                    this._happiness,
                    baseHpTypeStr,
                );
        }

        return result;
    }
}
