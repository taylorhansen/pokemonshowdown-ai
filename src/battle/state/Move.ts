import { dex } from "../dex/dex";

/** Information about a certain move. */
export class Move
{
    /** Move id name. */
    public get id(): string
    {
        return this.idName;
    }
    public set id(id: string)
    {
        if (!dex.moves.hasOwnProperty(id))
        {
            throw new Error(`Invalid move name ${id}`);
        }

        this.idName = id;
        const data = dex.moves[id];
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

    // istanbul ignore next: only used for logging
    /** Encodes all move data into a string. */
    public toString(): string
    {
        return `${this.id} (${this.pp}/${this.ppMax})`;
    }
}
