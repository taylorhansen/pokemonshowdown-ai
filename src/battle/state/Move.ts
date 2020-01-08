import * as dex from "../dex/dex";

/** Readonly Move representation. */
export interface ReadonlyMove
{
    /** Move id name. */
    readonly name: string;
    /** Move id number. Defaults to null if `name` is not initialized. */
    readonly id: number | null;
    /** Amount of power points left on this move. */
    readonly pp: number;
    /** Max amount of power points this move can have. */
    readonly maxpp: number;
}

/** Information about a certain move. */
export class Move implements ReadonlyMove
{
    /** @override */
    public get name(): string { return this._name; }
    private _name: string = "";

    /** @override */
    public get id(): number | null { return this._id; }
    private _id: number | null = null;

    /** @override */
    public get pp(): number { return this._pp; }
    public set pp(pp: number)
    {
        this._pp = Math.max(0, Math.min(pp, this._maxpp));
    }
    private _pp = 0;

    /** @override */
    public get maxpp(): number { return this._maxpp; }
    private _maxpp = 0;

    /**
     * Creates a Move object.
     * @param name Name of the move.
     * @param maxpp Max PP initializer. `"min"` for no pp ups, `"max"` for full
     * pp ups, or a number for a custom value. Default `"max"`.
     * @param pp Initial PP value. Set to maxpp by default.
     */
    constructor(name: string, maxpp: "min" | "max" | number = "max",
        pp?: number)
    {
        if (!dex.moves.hasOwnProperty(name))
        {
            throw new Error(`Invalid move name '${name}'`);
        }

        this._name = name;
        const data = dex.moves[name];
        this._id = data.uid;

        if (maxpp === "min") maxpp = data.pp[0];
        else if (maxpp === "max") maxpp = data.pp[1];
        else maxpp = Math.max(0, Math.min(maxpp, data.pp[1]));
        this._maxpp = maxpp;
        this.pp = pp === undefined ? maxpp : pp;
    }

    // istanbul ignore next: only used for logging
    /**
     * Encodes all move data into a string.
     * @param info Optional. Extra info about this move that should be
     * displayed.
     */
    public toString(info = ""): string
    {
        return `${this._name}${info ? ` <${info}>` : ""} \
(${this._pp}/${this._maxpp})`;
    }
}
