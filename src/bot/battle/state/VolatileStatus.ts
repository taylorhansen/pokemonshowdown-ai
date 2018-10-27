/**
 * Contains the minor or temporary status conditions of a pokemon that are
 * removed upon switch.
 */
export class VolatileStatus
{
    /** Stat boost stages. */
    private statBoosts: {[N in BoostableStatName]: BoostStage};
    /** Whether the corresponding move in the pokemon's moveset is disabled. */
    private disabledMoves: boolean[];
    // TODO: everything else

    /** Creates a VolatileStatus object. */
    constructor()
    {
        this.clear();
    }

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

    /**
     * Gets the size of the return value of `toArray()`.
     * status.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        // boostable stats
        return Object.keys(boostableStatNames).length +
            // disabled moves
            4;
    }

    /**
     * Formats volatile status info into an array of numbers.
     * @returns All volatile status data in array form.
     */
    public toArray(): number[]
    {
        const a =
        [
            ...Object.keys(this.statBoosts).map(
                (key: BoostableStatName) => this.statBoosts[key]),
            ...this.disabledMoves.map(b => b ? 1 : 0)
        ];
        return a;
    }

    /**
     * Creates a shallow clone of this VolatileStatus.
     * @returns A shallow clone of this object.
     */
    public shallowClone(): VolatileStatus
    {
        const v = new VolatileStatus();
        v.statBoosts = this.statBoosts;
        v.disabledMoves = this.disabledMoves;
        return v;
    }

    /**
     * Clears all volatile status conditions. This does not affect shallow
     * clones.
     */
    public clear(): void
    {
        this.statBoosts =
        {
            atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0
        };
        this.disabledMoves = [false, false, false, false];
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
    public disableMove(move: number, disabled: boolean = true): void
    {
        this.disabledMoves[move] = disabled;
    }

    /**
     * Encodes all volatile status data into a string.
     * @returns The VolatileStatus in string form.
     */
    public toString(): string
    {
        return `[${
            Object.keys(this.statBoosts)
            .filter((key: BoostableStatName) => this.statBoosts[key] !== 0)
            .map((key: BoostableStatName) =>
                `${key}: ${VolatileStatus.plus(this.statBoosts[key])}`)
            .concat(this.disabledMoves
                .filter(disabled => disabled)
                .map((disabled, i) => `disabled move ${i + 1}`))
            .join(", ")}]`;
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

/** Maximum and minimum stat boost stages. */
export type BoostStage = -6 | -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 |
    6;
