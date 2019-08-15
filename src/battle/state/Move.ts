import { dex } from "../dex/dex";

/** Information about a certain move. */
export class Move
{
    /** Move id name. */
    public get name(): string { return this._name; }
    private _name: string = "";

    /** Move id number. Defaults to null if `name` is not initialized. */
    public get id(): number | null { return this._id; }
    private _id: number | null = null;

    /** Amount of power points left on this move. */
    public get pp(): number { return this._pp; }
    public set pp(pp: number)
    {
        this._pp = Math.max(0, Math.min(pp, this._maxpp));
    }
    private _pp = 0;

    /** Max amount of power points this move can have. */
    public get maxpp(): number { return this._maxpp; }
    private _maxpp = 0;

    /**
     * Initializes Move id name and pp.
     * @param name Name of the move.
     * @param pp PP initializer. `"min"` for no pp ups, `"max"` for full pp ups,
     * or a number for a custom value. Default `"max"`.
     */
    public init(name: string, pp: "min" | "max" | number = "max"): void
    {
        if (!dex.moves.hasOwnProperty(name))
        {
            throw new Error(`Invalid move name '${name}'`);
        }

        this._name = name;
        const data = dex.moves[name];
        this._id = data.uid;

        if (pp === "min") pp = data.pp[0];
        else if (pp === "max") pp = data.pp[1];
        this._pp = pp;
        this._maxpp = pp;
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
