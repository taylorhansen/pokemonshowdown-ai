import * as dex from "../dex/dex";
import { boostKeys, HPType, hpTypes, ItemData, Type } from "../dex/dex-util";
import { SelfSwitchType } from "../dex/effects";
import { HP, ReadonlyHP } from "./HP";
import { MajorStatusCounter, ReadonlyMajorStatusCounter } from
    "./MajorStatusCounter";
import { Move } from "./Move";
import { Moveset, ReadonlyMoveset } from "./Moveset";
import { PokemonTraits, ReadonlyPokemonTraits } from "./PokemonTraits";
import { PossibilityClass, ReadonlyPossibilityClass } from "./PossibilityClass";
import { Team } from "./Team";
import { ReadonlyVolatileStatus, VolatileStatus } from "./VolatileStatus";

/** Options for `Pokemon#transformPost()`. */
export interface MoveData
{
    /** Move ID. */
    id: string;
    /** PP value. */
    pp?: number;
    /** Max PP value. */
    maxpp?: number;
}

/** Readonly Pokemon representation. */
export interface ReadonlyPokemon
{
    /** Whether this is the current active pokemon. */
    readonly active: boolean;

    /** Current pokemon traits. May be overridden by VolatileStatus. */
    readonly traits: ReadonlyPokemonTraits;
    /** Base pokemon traits. */
    readonly baseTraits: ReadonlyPokemonTraits;

    /** Current ability for this Pokemon, or the empty string if unknown. */
    readonly ability: string;

    /** Current species for this Pokemon. or the empty string if unknown. */
    readonly species: string;

    /** Current types for this Pokemon. */
    readonly types: readonly Type[];

    /** Current reference to held item possibilities. */
    readonly item: ReadonlyPossibilityClass<ItemData>;
    /** Current reference to last consumed item possibilities. */
    readonly lastItem: ReadonlyPossibilityClass<ItemData>;

    /** Pokemon's current moveset. */
    readonly moveset: ReadonlyMoveset;
    /** Pokemon's base moveset. */
    readonly baseMoveset: ReadonlyMoveset;

    /** Pokemon's gender. M=male, F=female, null=genderless. */
    readonly gender?: string | null;

    /** Current Hidden Power type possibility. */
    readonly hpType: PossibilityClass<typeof hpTypes[HPType]>;

    /** Happiness value between 0 and 255, or null if unknown. */
    readonly happiness: number | null;

    /** Info about the pokemon's hit points. */
    readonly hp: ReadonlyHP;
    /** Whether this pokemon is fainted. */
    readonly fainted: boolean;

    /** Major status turn counter manager. */
    readonly majorStatus: ReadonlyMajorStatusCounter;

    /**
     * Checks if the pokemon is definitely grounded, ignoring incomplete
     * information.
     */
    readonly isGrounded: boolean;
    /**
     * Checks if the pokemon may be grounded, based on incomplete information.
     * Unnarrowed ability and item classes are included here.
     */
    readonly maybeGrounded: boolean;

    /** Minor status conditions. Cleared on switch. */
    readonly volatile: ReadonlyVolatileStatus;
}

/** Holds all the possibly incomplete info about a pokemon. */
export class Pokemon implements ReadonlyPokemon
{
    /** @override */
    public get active(): boolean { return !!this._volatile; }

    /** @override */
    public get traits(): PokemonTraits
    {
        if (this._volatile) return this._volatile.overrideTraits;
        return this.baseTraits;
    }
    /** @override */
    public readonly baseTraits = new PokemonTraits();

    /** @override */
    public get ability(): string
    {
        if (!this.traits.hasAbility) return "";

        const ability = this.traits.ability;
        return ability.definiteValue || "";
    }
    /** Checks whether the Pokemon can currently have the given ability. */
    public canHaveAbility(ability: string): boolean
    {
        if (!this.traits.hasAbility) return false;
        return this.traits.ability.isSet(ability);
    }

    /** @override */
    public get species(): string
    {
        const traits = this.traits;
        if (!traits.hasSpecies) return "";

        const species = traits.species;
        return species.definiteValue || "";
    }
    /**
     * Does a form change for this Pokemon.
     * @param species The species to change into.
     * @param perm Whether this is permanent. Default false. Can be overridden
     * to false by `VolatileStatus#transformed`.
     */
    public formChange(species: string, perm = false): void
    {
        if (perm && !this.volatile.transformed)
        {
            this.baseTraits.setSpecies(species);
            this.volatile.overrideTraits.copy(this.baseTraits);
        }
        else this.volatile.overrideTraits.setSpecies(species);
    }

    /** @override */
    public get types(): readonly Type[]
    {
        let result = [...this.traits.types];
        if (this._volatile) result.push(this._volatile.addedType);
        result = result.filter(type => type !== "???");
        if (result.length <= 0) return ["???"];
        return result;
    }

    /** @override */
    public get item(): PossibilityClass<ItemData> { return this._item; }
    /** @override */
    public get lastItem(): PossibilityClass<ItemData> { return this._lastItem; }
    /**
     * Indicates that an item has been revealed or gained.
     * @param item Item id name.
     * @param gained Whether the item was gained just now or being revealed. If
     * `"recycle"`, the item was recovered via the Recycle move. Default false.
     */
    public setItem(item: string, gained: boolean | "recycle" = false): void
    {
        // override any possibilities of other items
        if (gained)
        {
            // item was gained via the recycle move
            if (gained === "recycle")
            {
                // recycled item must match tracked lastItem
                if (!this._lastItem.isSet(item))
                {
                    throw new Error(`Pokemon gained '${item}' via Recycle ` +
                        "but last item was '" +
                        (this._lastItem.definiteValue || "<unknown>") + "'");
                }
                this._item = this._lastItem;
                this._item.narrow(item);
                // recycle also resets lastItem
                this._lastItem = new PossibilityClass(dex.items, "none");
            }
            // if it was just gained through normal needs we don't need to do
            //  anything else
            else this._item = new PossibilityClass(dex.items, item);
        }
        // item is not gained but is just now being revealed
        else this._item.narrow(item);

        if (this._volatile)
        {
            // (de)activate unburden ability if the pokemon has it
            this._volatile.unburden = item === "none" && !!gained;
            // remove choice lock if we didn't gain a choice item
            if (!dex.items[item].isChoice) this._volatile.choiceLock = null;
        }
    }
    /**
     * Indicates that an item was just removed from this Pokemon.
     * @param consumed False if the item was removed or transferred. If the item
     * was consumed (i.e., it can be brought back using the Recycle move), this
     * is set to the item's name, or just true if the item's name is unknown.
     */
    public removeItem(consumed: string | boolean): void
    {
        if (consumed)
        {
            // move current item possibility object to the lastItem slot
            this._lastItem = this._item;
            // if the current item didn't match the consumed param, this should
            //  throw an overnarrowing error
            // TODO: guard this or replace the overnarrowing exception message
            //  in a parameter to be more useful
            if (typeof consumed === "string") this._lastItem.narrow(consumed);
        }

        // this should reset the _item reference so there aren't any duplicates
        this.setItem("none", /*gained*/true);
    }
    private _item = new PossibilityClass(dex.items);
    private _lastItem = new PossibilityClass(dex.items, "none");

    /** @override */
    public get moveset(): Moveset
    {
        if (this._volatile) return this._volatile.overrideMoveset;
        return this.baseMoveset;
    }
    /** Overrides a move slot via Mimic until switched out. */
    public mimic(name: string): void
    {
        // mimicked moves have 5 pp and maxed maxpp
        this.moveset.replace("mimic", new Move(name, "max", 5));
        // can't be choice locked if the move we're locked into is replaced
        if (this._volatile) this._volatile.choiceLock = null;
    }
    /** Permanently replaces a move slot via Sketch. */
    public sketch(name: string): void
    {
        // sketched moves have no pp ups applied
        this.moveset.replace("sketch", new Move(name, "min"), /*base*/true);
        // can't be choice locked if the move we're locked into is replaced
        if (this._volatile) this._volatile.choiceLock = null;
    }
    /** @override */
    public readonly baseMoveset: Moveset;

    /** @override */
    public gender?: string | null;

    /** @override */
    public get hpType(): PossibilityClass<typeof hpTypes[HPType]>
    {
        // TODO: gen>=5: always use baseTraits
        return this.traits.stats.hpType;
    }

    /** @override */
    public get happiness(): number | null { return this._happiness; }
    public set happiness(value: number | null)
    {
        if (value === null) this._happiness = null;
        else this._happiness = Math.max(0, Math.min(value, 255));
    }
    private _happiness: number | null = null;

    /** @override */
    public readonly hp: HP;
    /** @override */
    public get fainted(): boolean { return this.hp.current === 0; }

    /** @override */
    public readonly majorStatus = new MajorStatusCounter().onCure(() =>
    {
        // TODO: don't confuse this with other methods of curing slp in 1 turn
        /*
        if (this.majorStatus.current === "slp" && this.majorStatus.turns === 1)
        {
            // cured in 0 turns, must have early bird ability
            this.traits.setAbility("earlybird");
        }
        */
        // if the pokemon was asleep before, nightmare should be cured now
        if (this._volatile) this._volatile.nightmare = false;
    });

    /** @override */
    public get isGrounded(): boolean
    {
        if (this.team && this.team.state &&
            this.team.state.status.gravity.isActive)
        {
            return true;
        }

        const v = this._volatile;
        if (v?.ingrain) return true;

        // look for an ability-suppressing effect
        const ignoringAbility = v?.suppressAbility;
        const ability = ignoringAbility ? undefined : this.traits.ability;

        // look for an item-suppressing ability/effect
        const ignoringItem = v?.embargo.isActive ||
            (ability &&
                [...ability.possibleValues].every(
                    n => ability.map[n].flags?.ignoreItem));
        const item = (ignoringItem || !this._item.definiteValue) ?
            "" : this._item.definiteValue;

        // iron ball causes grounding
        if (item === "ironball") return true;

        // magnet rise and levitate lift
        return !v?.magnetRise.isActive &&
            // levitate ability
            // TODO: when to account for moldbreaker?
            (!ability ||
                ![...ability.possibleValues].every(
                    n => ability.map[n].on?.block?.move?.type === "ground")) &&
            // flying type lifts
            !this.types.includes("flying");
    }
    /** @override */
    public get maybeGrounded(): boolean
    {
        if (this.team && this.team.state &&
            this.team.state.status.gravity.isActive)
        {
            return true;
        }

        const v = this._volatile;
        if (v?.ingrain) return true;

        // look for an ability-suppressing effect
        const ignoringAbility = v?.suppressAbility;

        // look for possible item-suppressing effects
        const ability = this.traits.ability;
        const ignoringItem = v?.embargo.isActive ||
            (!ignoringAbility &&
                // TODO: ignoringItem=maybe if this is the case
                [...ability.possibleValues]
                    .some(n => ability.map[n].flags?.ignoreItem));

        // iron ball causes grounding
        if (this._item.isSet("ironball") && !ignoringItem) return true;

        // magnet rise lifts
        return !v?.magnetRise.isActive &&
            // levitate ability
            // TODO: when to account for moldbreaker?
            (ignoringAbility ||
                ![...ability.possibleValues].some(
                    n => ability.map[n].on?.block?.move?.type === "ground")) &&
            // flying type lifts
            !this.types.includes("flying");
    }

    /** @override */
    public get volatile(): VolatileStatus
    {
        if (this._volatile) return this._volatile;
        throw new Error("This Pokemon is currently inactive.");
    }
    /** Minor status conditions. Cleared on switch. */
    private _volatile: VolatileStatus | null = null;

    /**
     * Creates a Pokemon.
     * @param species Species name.
     * @param hpPercent Whether to report HP as a percentage.
     * @param moves Optional moveset to fill in.
     * @param team Optional reference to the parent Team.
     */
    constructor(species: string, hpPercent: boolean, moves?: readonly string[],
        public readonly team?: Team)
    {
        this.baseTraits.init();
        this.baseTraits.species.narrow(species);
        if (moves) this.baseMoveset = new Moveset(moves, moves.length);
        else this.baseMoveset = new Moveset(this.baseTraits.data.movepool);
        this.hp = new HP(hpPercent);
    }

    /** Indicates that the pokemon spent its turn being inactive. */
    public inactive(): void
    {
        this.volatile.inactive();
    }

    /** Called at the beginning of every turn to update temp statuses. */
    public preTurn(): void
    {
        if (this.active) this.volatile.preTurn();
    }

    /** Called at the end of every turn to update temp statuses. */
    public postTurn(): void
    {
        this.majorStatus.postTurn();
        if (this.active) this.volatile.postTurn();
    }

    /**
     * Switches this Pokemon in as if it replaces the given Pokemon.
     * @param mon Pokemon to replace with. If falsy, the Pokemon is switching
     * into an empty slot.
     * @param selfSwitch Self-switch status if any.
     */
    public switchInto(mon?: Pokemon | null,
        selfSwitch?: SelfSwitchType | null): void
    {
        // create our own volatile status object
        if (!mon?._volatile) this._volatile = new VolatileStatus();
        else
        {
            // transfer volatile status object
            this._volatile = mon._volatile;
            mon._volatile = null;
        }

        // switch out provided mon

        // toxic counter resets on switch
        if (mon?.majorStatus.current === "tox") mon.majorStatus.resetCounter();

        // clear mirrorMove
        const state = mon?.team?.state;
        if (state)
        {
            if (state.teams.us.active?.active)
            {
                state.teams.us.active.volatile.mirrorMove = null;
            }
            if (state.teams.them.active?.active)
            {
                state.teams.them.active.volatile.mirrorMove = null;
            }
        }

        // switch in new mon

        // handle baton pass
        if (selfSwitch === "copyvolatile")
        {
            // leave self-switch passable
            this._volatile.clearUnpassable();
            this._volatile.batonPass(this.majorStatus.current ?? undefined);
        }
        else if (selfSwitch)
        {
            this._volatile.clearPassable();
            // leave self-switch passable statuses
            this._volatile.clearUnpassable();
        }
        else this._volatile.clear();

        // make sure volatile has updated info about this pokemon
        this._volatile.overrideMoveset.link(this.baseMoveset, "base");
        this._volatile.overrideTraits.copy(this.baseTraits);
        if (selfSwitch) this._volatile.selfSwitch();
    }

    /** Indicates that the pokemon has fainted. */
    public faint(): void
    {
        this.hp.set(0, 0);
    }

    /**
     * Called when this pokemon is being trapped by an unknown ability.
     * @param by Opponent pokemon with the trapping ability.
     */
    public trapped(by: Pokemon): void
    {
        // opposing pokemon can have only one of these abilities here
        const abilities: string[] = [];

        // arena trap traps grounded pokemon
        if (this.isGrounded) abilities.push("arenatrap");

        // magnet pull traps steel types
        if (this.types.includes("steel")) abilities.push("magnetpull");

        // shadow tag traps all pokemon who don't have it
        if (this.ability !== "shadowtag") abilities.push("shadowtag");

        // infer possible trapping abilities
        if (abilities.length > 0) by.traits.ability.narrow(...abilities);
        else throw new Error("Can't figure out why we're trapped");
    }

    /** Indicates that the pokemon has transformed into its target. */
    public transform(target: Pokemon): void
    {
        this.volatile.transformed = true;
        // choice lock resets on transform
        this.volatile.choiceLock = null;

        // copy boosts
        for (const stat of boostKeys)
        {
            this.volatile.boosts[stat] = target.volatile.boosts[stat];
        }

        // link moveset inference
        this.volatile.overrideMoveset.link(target.moveset, "transform");

        // copy/link current form, ability, types, stats, etc
        this.volatile.overrideTraits.copy(target.traits);
        this.volatile.addedType = target.volatile.addedType;
    }

    // istanbul ignore next: only used for logging
    /**
     * Encodes all pokemon data into a string.
     * @param indent Indentation level to use.
     * @returns The Pokemon in string form.
     */
    public toString(indent = 0): string
    {
        const s = " ".repeat(indent);
        return `\
${s}${this.stringifySpecies()}${this.gender ? ` ${this.gender}` : ""} \
${this.hp.toString()}
${s}stats: ${this.stringifyStats()}
${s}status: ${this.majorStatus.toString()}
${s}active: ${this.active}\
${this.active ? `\n${s}volatile: ${this.volatile.toString()}` : ""}
${s}grounded: \
${this.isGrounded ? "true" : this.maybeGrounded ? "maybe" : "false"}
${s}types: ${this.stringifyTypes()}
${s}ability: ${this.stringifyAbility()}
${s}item: ${this.stringifyItem()}
${this.stringifyMoveset(indent)}`;
    }

    // istanbul ignore next: only used for logging
    /** Displays the species as well as whether it's overridden. */
    private stringifySpecies(): string
    {
        // should never happen but just in case
        const base = this.baseTraits.species;
        if (!base.definiteValue) return "<unrevealed>";

        const over = this._volatile ?
            this._volatile.overrideTraits.species : null;

        if (!over || !over.definiteValue || over === base)
        {
            return base.definiteValue;
        }
        return `${over.definiteValue} (base: ${base.definiteValue})`;
    }

    // istanbul ignore next: only used for logging
    /** Displays stat data as well as whether it's overridden. */
    private stringifyStats(): string
    {
        const base = this.baseTraits.stats;

        if (!this._volatile || base === this._volatile.overrideTraits.stats)
        {
            return base.toString();
        }
        return `${this._volatile.overrideTraits.stats} (base: ${base})`;
    }

    // istanbul ignore next: only used for logging
    /** Displays type values. */
    private stringifyTypes(): string
    {
        const base = this.baseTraits.types;
        if (!this._volatile || base === this._volatile.overrideTraits.types)
        {
            return `[${base.join(", ")}]`;
        }
        return `[${this._volatile.overrideTraits.types.join(", ")}] ` +
            `(base: [${base.join(", ")}])`;
    }

    // istanbul ignore next: only used for logging
    /** Displays the possible/overridden/suppressed values of the ability. */
    private stringifyAbility(): string
    {
        const base = this.baseTraits.ability;
        const baseStr = `${base.definiteValue ? "" : "possibly "}${base}`;

        if (!this._volatile || base === this._volatile.overrideTraits.ability)
        {
            return baseStr;
        }

        const over = this._volatile.overrideTraits.ability;
        const overStr = `${over.definiteValue ? "" : "possibly "}${over}`;
        return `${overStr} (base: ${baseStr})`;
    }

    // istanbul ignore next: only used for logging
    /** Displays the last and current values of the held item field. */
    private stringifyItem(): string
    {
        const baseVal = this._item.definiteValue;
        const base = baseVal ? baseVal : "<unrevealed>";

        const lastVal = this._lastItem.definiteValue;
        const last = lastVal ? lastVal : "<unknown>";

        if (last === "none") return base;
        return `${base} (consumed: ${last})`;
    }

    // istanbul ignore next: only used for logging
    /** Displays moveset data with happiness and possibly overridden HPType. */
    private stringifyMoveset(indent = 0): string
    {
        const s = " ".repeat(indent);

        // stringify hp type
        const hpType = this.baseTraits.stats.hpType;
        const hpTypeStr = (hpType.definiteValue ? "" : "possibly ") +
            hpType.toString();

        // stringify moveset
        let result = `${s}moveset:\n` +
            this.moveset.toString(indent + 4, this._happiness, hpTypeStr);

        if (this._volatile)
        {
            // moveset property was actually override moveset
            // need to also include base moveset

            // stringify base hp type
            const baseHPType = this.baseTraits.stats.hpType;
            const baseHPTypeStr =
                (baseHPType.definiteValue ? "" : "possibly ") +
                baseHPType.toString();

            // stringify base moveset
            result += `\n${s}base moveset:\n` +
                this.baseMoveset.toString(indent + 4, this._happiness,
                    baseHPTypeStr);
        }

        return result;
    }
}
