import { berries, dex, twoTurnMoves } from "../dex/dex";
import { hpTypes, PokemonData, Type } from "../dex/dex-util";
import { HP } from "./HP";
import { MajorStatusCounter } from "./MajorStatusCounter";
import { Move } from "./Move";
import { Moveset } from "./Moveset";
import { PossibilityClass } from "./PossibilityClass";
import { StatTable } from "./StatTable";
import { Team } from "./Team";
import { VolatileStatus } from "./VolatileStatus";

/** Options for `Pokemon#useMove()`. */
export interface MoveOptions
{
    /** ID name of the move. */
    moveId: string;
    /** Targets of the move. */
    targets: readonly Pokemon[];
    /**
     * Optional. Indicates that the move was unsuccessful due to the move
     * failing on its own (`"failed"`), or that the opponent evaded it due to
     * an immunity, protect, miss, etc. (`"evaded"`).
     */
    unsuccessful?: "failed" | "evaded";
    /** Whether to not consume pp for this move. Default false. */
    nopp?: boolean;
}

/** Holds all the possibly incomplete info about a pokemon. */
export class Pokemon
{
    /** Reference to the parent Team. */
    public readonly team?: Team;

    /** Whether this is the current active pokemon. */
    public get active(): boolean { return this._active; }
    private _active: boolean = false;

    /** Species/form dex data. */
    public get species(): PokemonData
    {
        if (!this._species) throw new Error("Species not initialized");
        return this._species;
    }
    /** Whether `#species` is initialized. */
    public get hasSpecies(): boolean { return !!this._species; }
    /** Sets species data. */
    public setSpecies(species: string): void
    {
        if (!dex.pokemon.hasOwnProperty(species))
        {
            throw new Error(`Unknown species '${species}'`);
        }

        this._species = dex.pokemon[species];
        if (this._active) this._volatile.setOverrideSpecies(this._species);
        this.initBaseAbility();
        // no need to re-link Pokemon reference the StatTable since ctor
        //  already did that, only need to reset dex object
        this.stats.data = this.species;
    }
    private _species: PokemonData | null = null;

    /** Stat table possibilities. */
    public readonly stats = new StatTable();

    /** Current ability id name. Can temporarily change while active. */
    public get ability(): string
    {
        // ability has been overridden
        if (this._volatile.overrideAbility.definiteValue)
        {
            return this._volatile.overrideAbility.definiteValue.name;
        }
        // not overridden/initialized
        if (!this._baseAbility.definiteValue) return "";
        return this._baseAbility.definiteValue.name;
    }
    public set ability(ability: string)
    {
        if (!dex.abilities.hasOwnProperty(ability))
        {
            throw new Error(`Unknown ability '${ability}'`);
        }

        // reveal baseAbility
        if (!this._baseAbility.definiteValue)
        {
            if (!this.canHaveAbility(ability))
            {
                throw new Error(`Pokemon ${this.species.name} can't have base \
ability ${ability}`);
            }

            this._baseAbility.narrow(ability);
        }
        else
        {
            // override current ability
            this._volatile.resetOverrideAbility();
            this._volatile.overrideAbility.narrow(ability);
        }
    }
    /** Checks if this pokemon can have the given ability. */
    public canHaveAbility(ability: string): boolean
    {
        return this.species.abilities.includes(ability) &&
            this._baseAbility.isSet(ability);
    }
    /** Base ability possibility tracker. */
    public get baseAbility(): PossibilityClass<typeof dex.abilities[string]>
    {
        return this._baseAbility;
    }
    /** Sets base ability according to current pokemon data. */
    private initBaseAbility(): void
    {
        this._baseAbility = new PossibilityClass(dex.abilities);
        this._baseAbility.narrow(...this.species.abilities);
        if (this._active) this._volatile.linkOverrideAbility(this._baseAbility);
    }
    private _baseAbility!: PossibilityClass<typeof dex.abilities[string]>;

    /** The types of this pokemon. */
    public get types(): readonly Type[]
    {
        let result: readonly Type[];
        if (this._active)
        {
            result = this._volatile.overrideTypes
                .concat(this._volatile.addedType);
        }
        else result = this.species.types;

        return result.filter(type => type !== "???");
    }
    /** Temporarily changes primary and secondary types and resets third. */
    public changeType(newTypes: readonly [Type, Type]): void
    {
        this._volatile.overrideTypes = newTypes;
        // reset added type
        this.addType("???");
    }
    /** Changes temporary tertiary type. */
    public addType(newType: Type): void
    {
        this._volatile.addedType = newType;
    }

    /**
     * Indicates that an item has been revealed or gained.
     * @param item Item id name.
     * @param gained Whether the item was just gained. If false or omitted, then
     * it's just now being revealed.
     */
    public setItem(item: string, gained = false): void
    {
        // override any possibilities of other items
        if (gained) this._item = new PossibilityClass(dex.items, item);
        else this._item.narrow(item);

        // (de)activate unburden ability if the pokemon has it
        this._volatile.unburden = item === "none" && gained;
    }
    /**
     * Indicates that an item was just removed from this Pokemon.
     * @param consumed If the item was consumed (can be brought back using
     * Recycle), set this to the item's name, or true if the item's name is
     * unknown.
     */
    public removeItem(consumed?: string | true): void
    {
        if (consumed)
        {
            // move current item possibility object to the lastItem slot
            this._lastItem = this._item;
            if (typeof consumed === "string") this._lastItem.narrow(consumed);
        }

        // this should reset the _item reference so there aren't any duplicates
        this.setItem("none", /*gained*/true);
    }
    /** Current reference to held item possibilities. */
    public get item(): PossibilityClass<number> { return this._item; }
    private _item = new PossibilityClass(dex.items);
    /** Current reference to last consumed item possibilities. */
    public get lastItem(): PossibilityClass<number> { return this._lastItem; }
    private _lastItem = new PossibilityClass(dex.items);

    /** Indicates that a move has been used. */
    public useMove(options: Readonly<MoveOptions>): void
    {
        // struggle doesn't occupy a moveslot
        if (options.moveId === "struggle") return;

        this.moveset.getOrReveal(options.moveId).pp -=
            options.nopp ? 0
            // mold breaker cancels pressure
            : this.ability === "moldbreaker" ? 1
            // consume 1 pp + 1 more for each target with pressure ability
            // TODO: in gen>=5, don't count allies
            : options.targets.filter(
                m => m !== this && m.ability === "pressure").length + 1;

        this._volatile.lastUsed = this.moveset.getOrRevealIndex(options.moveId);

        // release two-turn move
        // while this could be the event that prepares the move, a separate
        //  event is responsible for distinguishing that
        if (twoTurnMoves.hasOwnProperty(options.moveId))
        {
            this._volatile.twoTurn.reset();
        }

        // handle natural gift move
        if (options.moveId === "naturalgift")
        {
            if (options.unsuccessful !== "failed")
            {
                // move succeeds if the user has a berry
                // TODO: narrow further based on power/type?
                this._item.narrow(...Object.keys(berries));
                this.removeItem(/*consumed*/true);
            }
            // move fails if the user doesn't have a berry
            else this._item.remove(...Object.keys(berries));
        }

        if (options.unsuccessful)
        {
            this._volatile.lockedMove.reset();
            return;
        }

        // apply implicit effects

        const move = dex.moves[options.moveId];
        if (move.selfVolatileEffect === "lockedmove")
        {
            if (this._volatile.lockedMove.isActive &&
                options.moveId === this._volatile.lockedMove.type)
            {
                // if we're already in a locked move, no need to restart it
                this._volatile.lockedMove.tick();
            }
            else this._volatile.lockedMove.start(options.moveId as any);
        }
        else this._volatile.lockedMove.reset();

        if (move.volatileEffect === "minimize") this._volatile.minimize = true;

        // apply implicit team effects

        if (this.team)
        {
            // wish can be used consecutively, but only the first time will
            //  count
            if (options.moveId === "wish")
            {
                this.team.status.wish.start(/*restart*/false);
            }

            this.team.status.selfSwitch = move.selfSwitch || false;
        }
    }
    /**
     * Applies the disabled volatile status to a move.
     * @param id ID name of the move.
     */
    public disableMove(id: string): void
    {
        this._volatile.disabledMoves[this.moveset.getOrRevealIndex(id)].start();
    }
    /** Overrides a move slot via Mimic until switched out. */
    public overrideMove(id: string, newId: string): void
    {
        // mimicked moves have 5 pp and maxed maxpp
        this.moveset.override(id, new Move(newId, "max", 5));
    }
    /** Permanently replaces a move slot via Sketch. */
    public replaceMove(id: string, newId: string): void
    {
        // sketched moves have no pp ups applied
        this.moveset.replace(id, new Move(newId, "min"));
    }
    /** Pokemon's moveset. */
    public readonly moveset = new Moveset();

    /** Pokemon's gender. M=male, F=female, null=genderless. */
    public gender?: string | null;

    /** Hidden power type possibility tracker. */
    public readonly hpType = new PossibilityClass(hpTypes);

    /** Happiness value between 0 and 255, or null if unknown. */
    public get happiness(): number | null { return this._happiness; }
    public set happiness(value: number | null)
    {
        if (value === null) this._happiness = null;
        else this._happiness = Math.max(0, Math.min(value, 255));
    }
    private _happiness: number | null = null;

    /** Whether this pokemon is fainted. */
    public get fainted(): boolean { return this.hp.current === 0; }
    /** Info about the pokemon's hit points. */
    public readonly hp: HP;

    /** Major status turn counter manager. */
    public readonly majorStatus = new MajorStatusCounter();

    /** Minor status conditions. Cleared on switch. */
    public get volatile(): VolatileStatus { return this._volatile; }
    /** Minor status conditions. Cleared on switch. */
    private _volatile = new VolatileStatus();

    /**
     * Checks if the pokemon is definitely grounded, ignoring incomplete
     * information.
     */
    public get isGrounded(): boolean
    {
        if (this.team && this.team.state &&
            this.team.state.status.gravity.isActive)
        {
            return true;
        }

        const v = this._volatile;
        if (v.ingrain) return true;

        // gastro acid status suppresses most abilities
        const ignoringAbility = this._active && this._volatile.gastroAcid;
        const ability = ignoringAbility ? "" : this.ability;

        // klutz ability suppresses most items
        const ignoringItem = v.embargo.isActive || ability === "klutz";
        const item = ignoringItem || !this._item.definiteValue ?
            "" : this._item.definiteValue.name;

        // iron ball causes grounding
        if (item === "ironball") return true;

        // magnet rise and levitate lift
        return !v.magnetRise.isActive && ability !== "levitate" &&
            // flying type lifts
            !this.types.includes("flying");
    }
    /**
     * Checks if the pokemon may be grounded, based on incomplete information.
     * Unnarrowed ability and item classes are included here.
     */
    public get maybeGrounded(): boolean
    {
        if (this.team && this.team.state &&
            this.team.state.status.gravity.isActive)
        {
            return true;
        }

        const v = this._volatile;
        if (v.ingrain) return true;

        // gastro acid status suppresses most abilities
        const ignoringAbility = this._active && this._volatile.gastroAcid;

        // klutz ability suppresses most items
        const ignoringItem = v.embargo.isActive ||
            (!ignoringAbility &&
                ((this._active && v.overrideAbility.isSet("klutz")) ||
                (!this._active && this._baseAbility.isSet("klutz"))));

        // iron ball causes grounding
        if (this._item.isSet("ironball") && !ignoringItem) return true;

        // magnet rise lifts
        return !v.magnetRise.isActive &&
            // levitate lifts
            (ignoringAbility ||
                (!(this._active && v.overrideAbility.isSet("levitate")) &&
                !(!this._active && this._baseAbility.isSet("levitate")))) &&
            // flying type lifts
            !this.types.includes("flying");
    }

    /**
     * Creates a Pokemon.
     * @param hpPercent Whether to report HP as a percentage.
     * @param team Reference to the parent Team.
     */
    constructor(species: string, hpPercent: boolean, team?: Team)
    {
        this.setSpecies(species);
        this.stats.linked = this;
        this.hp = new HP(hpPercent);
        this.team = team;
        this._active = false;
        this._lastItem.narrow("none");
    }

    /** Called at the beginning of every turn to update temp statuses. */
    public preTurn(): void
    {
        if (this._active) this._volatile.preTurn();
    }

    /** Called at the end of every turn to update temp statuses. */
    public postTurn(): void
    {
        // sleep counter handled by in-game events
        if (this._active) this._volatile.postTurn();
    }

    /**
     * Copies volatile status state to another pokemon.
     * @param mon Pokemon that will receive the volatile status.
     */
    public copyVolatile(mon: Pokemon): void
    {
        mon._volatile = this._volatile.shallowClone();
    }

    /** Tells the pokemon that it is currently being switched in. */
    public switchIn(): void
    {
        this._volatile.linkOverrideAbility(this._baseAbility);
        this._volatile.setOverrideSpecies(this.species, /*setAbility*/false);
        this._volatile.overrideStats.linked = this;
        this._volatile.overrideTypes = this.species.types;
        this._active = true;
    }

    /**
     * Tells the pokemon that it is currently being switched out. Clears
     * volatile status.
     */
    public switchOut(): void
    {
        this._active = false;
        // reset effects like mimic/transform
        this.moveset.clearOverrides();
        // toxic counter resets on switch
        if (this.majorStatus.current === "tox") this.majorStatus.resetCounter();
        this._volatile.clear();
    }

    /** Tells the pokemon that it has fainted. */
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

        // since override ability is always known, and this method assumes that
        //  the ability is unknown, the base ability must be the culprit
        if (abilities.length > 0) by.baseAbility.narrow(...abilities);
        else throw new Error("Can't figure out why we're trapped");
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
${s}${this.stringifySpecies()}${this.gender ? ` ${this.gender}` : ""}
${s}stats: ${this.stringifyStats()}
${s}status: ${this.majorStatus.toString()}
${s}active: ${this.active}\
${this.active ? `\n${s}volatile: ${this._volatile.toString()}` : ""}
${s}grounded: \
${this.isGrounded ? "true" : this.maybeGrounded ? "maybe" : "false"}
${s}types: ${this.stringifyTypes()}
${s}ability: ${this.stringifyAbility()}
${s}item: ${this.stringifyItem()}
${s}moveset: [${this.moveset.toString(this._happiness,
    this.hpType.definiteValue ?
        this.hpType.definiteValue.name : `possibly ${this.hpType}`)}]`;
    }

    // istanbul ignore next: only used for logging
    /** Displays the species as well as whether it's overridden. */
    private stringifySpecies(): string
    {
        const base = this.species;
        const over = this._active ? this._volatile.overrideSpecies : null;

        if (!over || over === base) return base.name;
        else return `${over.name} (base: ${base.name})`;
    }

    // istanbul ignore next: only used for logging
    /** Displays stat data as well as whether it's overridden. */
    private stringifyStats(): string
    {
        if (!this._active ||
            (this.stats.linked === this && this.stats.data === this._species))
        {
            return this.stats.toString();
        }
        return `${this._volatile.overrideStats} (base: ${this.stats})`;
    }

    // istanbul ignore next: only used for logging
    /** Displays type values. */
    private stringifyTypes(): string
    {
        const result: string[] = [];

        for (let i = 0; i < this.species.types.length; ++i)
        {
            let type: string = this.species.types[i];

            // show overridden types in parentheses
            const override = this._volatile.overrideTypes[i];
            if (override !== "???" && override !== type)
            {
                if (type === "???") type = `(${override})`;
                else type += ` (${override})`;
            }

            // skip completely blank types
            if (type !== "???") result.push(type);
        }

        // include third type in parentheses
        if (this._volatile.addedType !== "???")
        {
            result.push(`(${this._volatile.addedType})`);
        }

        return `[${result.join(", ")}]`;
    }

    // istanbul ignore next: only used for logging
    /** Displays the possible/overridden/suppressed values of the ability. */
    private stringifyAbility(): string
    {
        const base = (this._baseAbility.definiteValue ? "" : "possibly ") +
            this._baseAbility.toString();

        if (this._baseAbility === this._volatile.overrideAbility) return base;

        const over = (this._volatile.overrideAbility.definiteValue ?
                "" : "possibly ") +
            this._volatile.overrideAbility.toString();

        return `${over} (base: ${base})`;
    }

    // istanbul ignore next: only used for logging
    /** Displays the last and current values of the held item field. */
    private stringifyItem(): string
    {
        const baseVal = this._item.definiteValue;
        const base = baseVal ? baseVal.name : "<unrevealed>";

        const lastVal = this._lastItem.definiteValue;
        const last = lastVal ? lastVal.name : "<unknown>";

        if (last === "none") return base;
        return `${base} (consumed: ${last})`;
    }
}
