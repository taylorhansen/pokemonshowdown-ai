import { dex, twoTurnMoves } from "../dex/dex";
import { PokemonData, Type, types } from "../dex/dex-types";
import { HP } from "./HP";
import { Moveset } from "./Moveset";
import { PossibilityClass } from "./PossibilityClass";
import { Team } from "./Team";
import { MajorStatus, majorStatuses } from "./utility";
import { VolatileStatus } from "./VolatileStatus";

/** Holds all the possibly incomplete info about a pokemon. */
export class Pokemon
{
    /** Reference to the parent Team. */
    public readonly team?: Team;

    /** Whether this is the current active pokemon. */
    public get active(): boolean
    {
        return this._active;
    }
    private _active: boolean = false;

    /** Species/form display name. */
    public get species(): string
    {
        return this.speciesName;
    }
    public set species(species: string)
    {
        // set will throw if species doesn't exist so check for that first
        this._species.set(species);
        this.speciesName = species;
        this.data = dex.pokemon[species];
        this._baseAbility.set(this.data.abilities);
    }
    /** ID name of the species. */
    private speciesName = "";
    /** Pokemon species/form unique identifier. */
    private _species = new PossibilityClass<PokemonData>(dex.pokemon,
            x => x.uid);

    /** Current ability id name. Can temporarily change while active. */
    public get ability(): string
    {
        // ability has been overridden
        if (this.volatile.overrideAbility)
        {
            return this.volatile.overrideAbility;
        }
        // not overridden/initialized
        return this.baseAbility;
    }
    public set ability(ability: string)
    {
        if (!dex.abilities.hasOwnProperty(ability))
        {
            throw new Error(`Unknown ability "${ability}"`);
        }

        // narrow down baseAbility
        if (!this._baseAbility.definiteValue)
        {
            if (!this.canHaveAbility(ability))
            {
                throw new Error(`Pokemon ${this.species} can't have base \
ability ${ability}`);
            }

            this._baseAbility.set(ability);
        }

        // override current ability
        this.volatile.overrideAbility = ability;
    }
    /** Base ability id name. May be empty if not yet narrowed. */
    public get baseAbility(): string
    {
        if (!this._baseAbility.definiteValue) return "";
        return this._baseAbility.definiteValue.name;
    }
    /** Checks if this pokemon can have the given ability. */
    public canHaveAbility(ability: string): boolean
    {
        if (!this.data)
        {
            throw new Error("Base ability queried before species data");
        }
        return this.data.abilities.includes(ability) &&
            this._baseAbility.isSet(ability);
    }
    /**
     * Sets each provided ability as a possibility if it's possible to have it.
     * @returns True if the abilities were narrowed.
     */
    public narrowAbilities(abilities: string[]): boolean
    {
        return this._baseAbility.narrow(abilities);
    }
    /** Base ability possibility tracker. */
    private _baseAbility = new PossibilityClass(dex.abilities);

    /** The types of this pokemon. */
    public get types(): ReadonlyArray<Type>
    {
        // uninitialized Pokemon objs should silently fail so toArray() doesn't
        //  throw
        if (!this.data) return [];

        let result: ReadonlyArray<Type>;
        if (this._active)
        {
            result = this.volatile.overrideTypes
                .concat(this.volatile.addedType);
        }
        else result = this.data.types;

        return result.filter(type => type !== "???");
    }
    /** Temporarily changes primary and secondary types and resets third. */
    public changeType(newTypes: [Type, Type]): void
    {
        this.volatile.overrideTypes = newTypes;
        // reset added type
        this.addType("???");
    }
    /** Changes temporary tertiary type. */
    public addType(newType: Type): void
    {
        this.volatile.addedType = newType;
    }

    /** Item id name. Setter allows either id name or display name. */
    public get item(): string
    {
        return this.itemName;
    }
    public set item(item: string)
    {
        // make sure item name is converted to an id name
        const name = item.toLowerCase().replace(/[ -]+/g, "");

        // can throw if invalid name
        try { this._item.set(name); }
        catch (e) { throw new Error(`Invalid item name ${name}`); }

        this.itemName = name;
    }
    /** ID name of the held item. */
    private itemName = "";
    /** Item the pokemon is holding. */
    private _item = new PossibilityClass(dex.items);

    /** Pokemon's level. Clamped between the closed interval `[1, 100]`. */
    public get level(): number
    {
        return this._level;
    }
    public set level(level: number)
    {
        this._level = Math.max(1, Math.min(level, 100));
    }
    /** Pokemon's level from 1 to 100. */
    private _level = 0;

    /**
     * Indicates that a move has been used.
     * @param id ID name of the move.
     * @param target Pokemon that was targeted by the move.
     * @param nopp Whether to not consume pp for this move.
     */
    public useMove(id: string, target: Pokemon, nopp?: boolean): void
    {
        // struggle doesn't occupy a moveslot
        if (id === "struggle") return;

        const pp =
            // locked moves don't consume pp
            nopp ? 0
            // pressure doubles pp usage if opponent is targeted
            : (target !== this && target.ability === "pressure") ? 2
            // otherwise only 1 is used
            : 1;
        this.moveset.getOrReveal(id).pp -= pp;

        // release two-turn move
        // while this could be the event that prepares the move, a separate
        //  event is responsible for distinguishing that
        if (twoTurnMoves.hasOwnProperty(id)) this.volatile.twoTurn = "";

        // apply move effects
        const move = dex.moves[id];
        if (move.volatileEffect === "lockedmove")
        {
            this.volatile.lockedMove = true;
        }
        if (this.team)
        {
            if (id === "wish") this.team.status.wish();
            this.team.status.selfSwitch = move.selfSwitch || false;
        }
    }
    /**
     * Applies the disabled volatile status to a move.
     * @param id ID name of the move.
     */
    public disableMove(id: string): void
    {
        this.volatile.disableMove(this.moveset.getOrRevealIndex(id));
    }
    public readonly moveset = new Moveset();

    /** Pokemon's gender. */
    public gender: string | null;

    /** Whether this pokemon is fainted. */
    public get fainted(): boolean
    {
        return this.hp.current === 0;
    }
    /** Info about the pokemon's hit points. */
    public readonly hp: HP;

    /** Cures this Pokemon from its major status condition. */
    public cure(): void
    {
        this.majorStatus = "";
    }
    /** Current major status condition. Not cleared on switch. */
    public majorStatus: MajorStatus = "";

    /** Minor status conditions. Cleared on switch. */
    public get volatile(): VolatileStatus
    {
        return this._volatile;
    }
    /** Minor status conditions. Cleared on switch. */
    private _volatile = new VolatileStatus();

    /** Checks if the pokemon is grounded, ignoring incomplete information. */
    public get isGrounded(): boolean
    {
        if (this.team && this.team.state && this.team.state.status.gravity)
        {
            return true;
        }

        const v = this._volatile;
        if (v.ingrain) return true;

        const ignoringItem = v.embargo || this.ability === "klutz";
        const item = ignoringItem ? "" : this.item;

        // iron ball causes grounding
        if (item === "ironball") return true;

        // magnet rise and levitate lift
        return !v.magnetRise && this.ability !== "levitate" &&
            // flying type lifts
            !this.types.includes("flying");
    }
    /**
     * Checks if the pokemon may be grounded, based on incomplete information.
     * Unnarrowed ability and item classes are included here.
     */
    public get maybeGrounded(): boolean
    {
        if (this.team && this.team.state && this.team.state.status.gravity)
        {
            return true;
        }

        const v = this._volatile;
        if (v.ingrain) return true;

        const ignoringItem = v.embargo || v.overrideAbility === "klutz" ||
            (!v.overrideAbility && this._baseAbility.isSet("klutz"));

        // iron ball causes grounding
        if (this._item.isSet("ironball") && !ignoringItem)
        {
            return true;
        }

        // magnet rise lifts
        return !v.magnetRise &&
            // levitate lifts
            ((v.overrideAbility && v.overrideAbility !== "levitate") ||
                (!v.overrideAbility &&
                    !this._baseAbility.isSet("levitate"))) &&
            // flying type lifts
            !this.types.includes("flying");
    }

    /** Dex data. */
    private data?: PokemonData;
    /** First index of the part of the moveset that is unknown. */
    private unrevealedMove = 0;

    /**
     * Creates a Pokemon.
     * @param hpPercent Whether to report HP as a percentage.
     * @param team Reference to the parent Team.
     */
    constructor(hpPercent: boolean, team?: Team)
    {
        this.team = team;
        this.hp = new HP(hpPercent);
        this._active = false;
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
        // copy overridable species data
        if (!this.data) throw new Error("Species data not set");

        if (this._baseAbility.definiteValue)
        {
            const ability = this._baseAbility.definiteValue.name;

            // if batonpassed the suppressed status, the ability can't be
            //  overridden unless it's multitype
            if (!this._volatile.isAbilitySuppressed() ||
                ability === "multitype")
            {
                this._volatile.overrideAbility = ability;
            }
        }
        this._volatile.overrideTypes = this.data.types;

        this._active = true;
    }

    /**
     * Tells the pokemon that it is currently being switched out. Clears
     * volatile status.
     */
    public switchOut(): void
    {
        this._active = false;
        this._volatile.clear();
    }

    /** Tells the pokemon that it has fainted. */
    public faint(): void
    {
        this.hp.set(0, 0);

        if (this.team && this.team.state && this.team.state.agent &&
            this.team.state.agent.onFaint)
        {
            this.team.state.agent.onFaint(this);
        }
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

        // istanbul ignore else: not useful to test for this
        if (abilities.length > 0) by.narrowAbilities(abilities);
        else throw new Error("Can't figure out why we're trapped");
    }

    /**
     * Gets the size of the return value of `toArray()`.
     * @param active Whether to include active pokemon data, e.g. volatile
     * status.
     */
    public static getArraySize(active: boolean): number
    {
        return /*gender*/2 + dex.numPokemon + dex.numItems + dex.numAbilities +
            /*level*/1 + /*moveset*/Moveset.getArraySize() + HP.getArraySize() +
            /*base type excluding ??? type*/Object.keys(types).length - 1 +
            /*majorStatus except empty*/Object.keys(majorStatuses).length - 1 +
            (active ? VolatileStatus.getArraySize() : 0) + /*grounded*/2;
    }

    // istanbul ignore next: unstable, hard to test
    /** Formats pokemon info into an array of numbers. */
    public toArray(): number[]
    {
        // multi-hot encode type data if possible
        let typeData: number[];
        // remove ??? type from base type data since it's impossible to have it
        const filteredTypes = Object.keys(types).filter(t => t !== "???") as
            Type[];
        if (!this.data) typeData = Array.from(filteredTypes, () => 0);
        else
        {
            typeData = filteredTypes
                .map(type => this.data!.types.includes(type) ? 1 : 0);
        }

        // one-hot encode categorical data
        const majorStatus = (Object.keys(majorStatuses) as MajorStatus[])
            // only include actual statuses, not the empty string
            .filter(status => status !== "")
            .map(status => this.majorStatus === status ? 1 : 0);

        const a =
        [
            this.gender === "M" ? 1 : 0, this.gender === "F" ? 1 : 0,
            ...this._species.toArray(), ...typeData, ...this._item.toArray(),
            ...this._baseAbility.toArray(), this._level,
            ...this.moveset.toArray(), ...this.hp.toArray(), ...majorStatus
        ];
        if (this._active) a.push(...this._volatile.toArray());
        a.push(this.isGrounded ? 1 : 0, this.maybeGrounded ? 1 : 0);
        return a;
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
${s}${this.speciesName}${this.gender ? ` ${this.gender}` : ""} lv${this.level} \
${this.hp.toString()}${this.majorStatus ? ` ${this.majorStatus}` : ""}
${s}active: ${this.active}\
${this.active ? `\n${s}volatile: ${this._volatile.toString()}` : ""}
${s}grounded: \
${this.isGrounded ? "true" : this.maybeGrounded ? "maybe" : "false"}
${s}types: [${this.stringifyTypes()}]
${s}ability: ${this.stringifyAbility()}
${s}item: ${this.itemName ? this.itemName : "<unrevealed>"}
${s}moveset: [${this.moveset.toString()}]`;
    }

    // istanbul ignore next: only used for logging
    /** Displays type values. */
    private stringifyTypes(): string
    {
        const result: string[] = [];

        for (let i = 0; i < this.data!.types.length; ++i)
        {
            let type: string = this.data!.types[i];

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

        return result.join(", ");
    }

    // istanbul ignore next: only used for logging
    /** Displays the possible/overridden/suppressed values of the ability. */
    private stringifyAbility(): string
    {
        const baseVal = this._baseAbility.definiteValue;
        const base = baseVal ?
            baseVal.name : `possibly ${this._baseAbility.toString()}`;
        const over = this._active ? this._volatile.overrideAbility : "";

        if (!over || over === base) return base;
        else return `${over} (base: ${base})`;
    }
}
