/**
 * Contains the minor or temporary status conditions of a pokemon that are
 * removed upon switch.
 */
export class VolatileStatus
{
    // passed when copying

    /** Stat boost stages. */
    public get boosts(): {readonly [N in BoostableStatName]: number}
    {
        return this._boosts;
    }
    private _boosts: {[N in BoostableStatName]: number};

    /** Whether the corresponding move in the pokemon's moveset is disabled. */
    private disabledMoves: boolean[];

    // not passed when copying

    /** Whether the pokemon is locked into a move and is unable to switch. */
    public lockedMove: boolean;

    /** Whether the pokemon is confused. */
    public get isConfused(): boolean
    {
        return this.confuseTurns !== 0;
    }
    /**
     * Number of turns this pokemon has been confused, including the turn it
     * started.
     */
    public get confuseTurns(): number
    {
        return this._confuseTurns;
    }
    private _confuseTurns: number;

    /** Creates a VolatileStatus object. */
    constructor()
    {
        this.clear();
    }

    /**
     * Creates a shallow clone of this VolatileStatus.
     * @returns A shallow clone of this object.
     */
    public shallowClone(): VolatileStatus
    {
        const v = new VolatileStatus();
        v._boosts = this._boosts;
        v.disabledMoves = this.disabledMoves;
        // not this.lockedmove, currently not reproducible ingame
        // not this._confuseTurns, always reset when switching
        return v;
    }

    /**
     * Clears all volatile status conditions. This does not affect shallow
     * clones.
     */
    public clear(): void
    {
        this._boosts =
        {
            atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0
        };
        this.disabledMoves = [false, false, false, false];
        this.lockedMove = false;
        this._confuseTurns = 0;
    }

    /**
     * Boosts a stat.
     * @param stat Stat to be boosted.
     * @param amount Whole number of stages to boost the stat by.
     */
    public boost(stat: BoostableStatName, amount: number): void
    {
        this._boosts[stat] += amount;
    }

    /**
     * Checks whether a move is disabled.
     * @param move Index of the move.
     * @returns Whether the move is disabled.
     */
    public isDisabled(move: number): boolean
    {
        return this.disabledMoves[move];
    }

    /**
     * Disables a certain move.
     * @param index Index of the move.
     * @param disabled Disabled status. Omit to assume true.
     */
    public disableMove(move: number, disabled: boolean): void
    {
        this.disabledMoves[move] = disabled;
    }

    /**
     * Sets the confusion flag. Should be called once per turn if it's on.
     * @param flag Value of the flag.
     */
    public confuse(flag: boolean): void
    {
        this._confuseTurns = flag ? this._confuseTurns + 1 : 0;
    }

    /**
     * Gets the size of the return value of `toArray()`.
     * status.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        // boostable stats
        return /*boostable stats*/Object.keys(boostableStatNames).length +
            /*disabled moves*/4 + /*locked move*/1 + /*confuse turns*/1;
    }

    /**
     * Formats volatile status info into an array of numbers.
     * @returns All volatile status data in array form.
     */
    public toArray(): number[]
    {
        const a =
        [
            ...Object.keys(this._boosts).map(
                (key: BoostableStatName) => this._boosts[key]),
            ...this.disabledMoves.map(b => b ? 1 : 0),
            this.lockedMove ? 1 : 0,
            this._confuseTurns
        ];
        return a;
    }

    // istanbul ignore next: only used in logging
    /**
     * Encodes all volatile status data into a string.
     * @returns The VolatileStatus in string form.
     */
    public toString(): string
    {
        return `[${
            Object.keys(this._boosts)
            .filter((key: BoostableStatName) => this._boosts[key] !== 0)
            .map((key: BoostableStatName) =>
                `${key}: ${VolatileStatus.plus(this._boosts[key])}`)
            .concat(this.disabledMoves
                .filter(disabled => disabled)
                .map((disabled, i) => `disabled move ${i + 1}`))
            .concat(this.lockedMove ? ["lockedmove"] : [])
            .concat(this._confuseTurns ?
                    [`confused for ${this._confuseTurns - 1} turns`] : [])
            .join(", ")}]`;
    }

    // istanbul ignore next: only used in logging
    /**
     * Converts a number to a string where positive numbers are preceded by a
     * `+` symbol.
     * @param n Number to convert.
     * @returns The number in string form with explicit sign.
     */
    private static plus(n: number): string
    {
        return (n > 0 ? "+" : "") + n;
    }
}

/** Holds the set of all boostable stat names. */
export const boostableStatNames =
{
    atk: true, def: true, spa: true, spd: true, spe: true, accuracy: true,
    evasion: true
};
/** Names of pokemon stats that can be boosted. */
export type BoostableStatName = keyof typeof boostableStatNames;
