import { dex } from "../dex/dex";
import { oneHot } from "./utility";

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
    private _id: number | null = null;
    /** Move id name. */
    private idName: string = "";

    /** Amount of power points left on this move. */
    public get pp(): number
    {
        return this._pp;
    }
    public set pp(pp: number)
    {
        this._pp = Math.max(0, Math.min(pp, this.ppMax));
    }
    /** Current power points. */
    private _pp = 0;
    /** Maximum amount of power points. */
    private ppMax = 0;

    /** Gets the size of the return value of `toArray()`. */
    public static getArraySize(): number
    {
        return /*move id*/dex.numMoves + /*pp*/1;
    }

    // istanbul ignore next: unstable, hard to test
    /** Formats move info into an array of numbers. */
    public toArray(): number[]
    {
        return [...oneHot(this._id, dex.numMoves), this._pp];
    }

    // istanbul ignore next: only used for logging
    /**
     * Encodes all move data into a string.
     * @param type Extra info about this move that should be recorded.
     */
    public toString(type?: string): string
    {
        return `${this.id}${type ? ` <${type}>` : ""} \
(${this.pp}/${this.ppMax})`;
    }
}
