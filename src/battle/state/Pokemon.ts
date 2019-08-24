import { berries, dex, twoTurnMoves } from "../dex/dex";
import { hpTypes, Type } from "../dex/dex-util";
import { HP } from "./HP";
import { MajorStatusCounter } from "./MajorStatusCounter";
import { Move } from "./Move";
import { Moveset } from "./Moveset";
import { PokemonTraits } from "./PokemonTraits";
import { PossibilityClass } from "./PossibilityClass";
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

    /** Current pokemon traits. May be overridden by VolatileStatus. */
    public get traits(): PokemonTraits
    {
        if (this._active) return this._volatile.overrideTraits;
        return this.baseTraits;
    }
    /** Base pokemon traits. */
    public readonly baseTraits = new PokemonTraits();

    /** Current ability for this Pokemon, or the empty string if unknown. */
    public get ability(): string
    {
        // not initialized
        if (!this.traits.hasAbility) return "";

        const ability = this.traits.ability;
        // not fully narrowed
        if (!ability.definiteValue) return "";

        return ability.definiteValue.name;
    }
    /** Checks whether the Pokemon can currently have the given ability. */
    public canHaveAbility(ability: string): boolean
    {
        // not initialized
        if (!this.traits.hasAbility) return false;
        return this.traits.ability.isSet(ability);
    }

    /** Current species for this Pokemon. or the empty string if unknown. */
    public get species(): string
    {
        const traits = this.traits;
        // not initialized
        if (!traits.hasSpecies) return "";

        const species = traits.species;
        // not fully narrowed
        if (!species.definiteValue) return "";
        return species.definiteValue.name;
    }

    /** Current types for this Pokemon. */
    public get types(): readonly Type[]
    {
        const result = [...this.traits.types];
        if (this._active) result.push(this._volatile.addedType);
        return result.filter(type => type !== "???");
    }

    /** Current reference to held item possibilities. */
    public get item(): PossibilityClass<number> { return this._item; }
    /** Current reference to last consumed item possibilities. */
    public get lastItem(): PossibilityClass<number> { return this._lastItem; }
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
    private _item = new PossibilityClass(dex.items);
    private _lastItem = new PossibilityClass(dex.items);

    /** Pokemon's moveset. */
    public readonly moveset = new Moveset();
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

    /** Info about the pokemon's hit points. */
    public readonly hp: HP;
    /** Whether this pokemon is fainted. */
    public get fainted(): boolean { return this.hp.current === 0; }

    /** Major status turn counter manager. */
    public readonly majorStatus = new MajorStatusCounter();

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
            (!ignoringAbility && this.canHaveAbility("klutz"));

        // iron ball causes grounding
        if (this._item.isSet("ironball") && !ignoringItem) return true;

        // magnet rise lifts
        return !v.magnetRise.isActive &&
            // levitate lifts
            (ignoringAbility || !this.canHaveAbility("levitate")) &&
            // flying type lifts
            !this.types.includes("flying");
    }

    /** Minor status conditions. Cleared on switch. */
    public get volatile(): VolatileStatus { return this._volatile; }
    /** Minor status conditions. Cleared on switch. */
    private _volatile = new VolatileStatus();

    /**
     * Creates a Pokemon.
     * @param hpPercent Whether to report HP as a percentage.
     * @param team Reference to the parent Team.
     */
    constructor(species: string, hpPercent: boolean, team?: Team)
    {
        this.baseTraits.init();
        this.baseTraits.species.narrow(species);
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
        this._active = true;
        this._volatile.overrideTraits.copy(this.baseTraits);
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

        // infer possible trapping abilities
        if (abilities.length > 0) by.traits.ability.narrow(...abilities);
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
        // should never happen but just in case
        const base = this.baseTraits.species;
        if (!base.definiteValue) return "<unrevealed>";

        const over = this._active ?
            this._volatile.overrideTraits.species : null;

        if (!over || !over.definiteValue || over === base)
        {
            return base.definiteValue.name;
        }
        return `${over.definiteValue.name} (base: ${base.definiteValue.name})`;
    }

    // istanbul ignore next: only used for logging
    /** Displays stat data as well as whether it's overridden. */
    private stringifyStats(): string
    {
        const base = this.baseTraits.stats;

        if (!this._active || base === this._volatile.overrideTraits.stats)
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
        if (!this._active || base === this._volatile.overrideTraits.types)
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

        if (!this._active ||
            base === this._volatile.overrideTraits.ability)
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
        const base = baseVal ? baseVal.name : "<unrevealed>";

        const lastVal = this._lastItem.definiteValue;
        const last = lastVal ? lastVal.name : "<unknown>";

        if (last === "none") return base;
        return `${base} (consumed: ${last})`;
    }
}
