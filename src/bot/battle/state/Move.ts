import { dex } from "../dex/dex";

/** Information about a certain move. */
export class Move
{
    /** Move id name. */
    public get id(): string
    {
        return this.idName;
    }
    public set id(name: string)
    {
        this.idName = name;
        const data = dex.moves[name];
        this._id = data.uid;
        this._pp = data.pp;
        this.ppMax = data.pp;
    }

    /** Amount of power points left on this move. */
    public get pp(): number
    {
        return this._pp;
    }

    /** Move id name. */
    private idName = "";
    /** Move id. */
    private _id = 0;
    /** Current power points. */
    private _pp = 0;
    /** Maximum amount of power points. */
    private ppMax = 0;

    /**
     * Indicates that the move has been used.
     * @param pp Amount of power points to consume, or 1 by default.
     */
    public use(pp = 1): void
    {
        this._pp = Math.max(0, Math.min(this._pp - pp, this.ppMax));
    }

    /**
     * Gets the size of the return value of `toArray()`.
     * status.
     * @returns The size of the return value of `toArray()`.
     */
    public static getArraySize(): number
    {
        // move id
        return dex.numMoves +
            // pp
            1;
    }

    /**
     * Formats move info into an array of numbers.
     * @returns All move data in array form.
     */
    public toArray(): number[]
    {
        // one-hot encode move id
        const id = Array.from({length: dex.numMoves},
            (v, i) => i === this._id ? 1 : 0);

        return [...id, this._pp];
    }

    /**
     * Encodes all move data into a string.
     * @param indent Indentation level to use.
     * @returns The Move in string form.
     */
    public toString(indent = 0): string
    {
        const s = " ".repeat(indent);
        return `\
${s}id: ${this.id}
${s}pp: ${this.pp}
${s}ppMax: ${this.ppMax}`;
    }
}
