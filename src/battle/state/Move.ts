import { dex } from "../dex/dex";

/** Information about a certain move. */
export class Move
{
    /** Move id name. */
    public get name(): string
    {
        return this._name;
    }
    public set name(id: string)
    {
        if (!dex.moves.hasOwnProperty(id))
        {
            throw new Error(`Invalid move name ${id}`);
        }

        this._name = id;
        const data = dex.moves[id];
        this._id = data.uid;
        this._pp = data.pp;
        this._maxpp = data.pp;
    }
    private _name: string = "";

    /** Move id number. Defaults to null if `name` is not initialized. */
    public get id(): number | null { return this._id; }
    private _id: number | null = null;

    /** Amount of power points left on this move. */
    public get pp(): number
    {
        return this._pp;
    }
    public set pp(pp: number)
    {
        this._pp = Math.max(0, Math.min(pp, this._maxpp));
    }
    private _pp = 0;

    /** Max amount of power points this move can have. */
    public get maxpp(): number { return this._maxpp; }
    private _maxpp = 0;

    // istanbul ignore next: only used for logging
    /**
     * Encodes all move data into a string.
     * @param type Extra info about this move that should be recorded.
     */
    public toString(type?: string): string
    {
        return `${this._name}${type ? ` <${type}>` : ""} \
(${this._pp}/${this._maxpp})`;
    }
}
