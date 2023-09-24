import * as dex from "../dex";

/** Readonly {@link Move} representation. */
export interface ReadonlyMove {
    /** Move name. */
    readonly name: string;
    /** Move data. */
    readonly data: dex.MoveData;
    /** Amount of power points left on this move. */
    readonly pp: number;
    /** Max amount of power points this move can have. */
    readonly maxpp: number;

    /**
     * Encodes all move data into a string.
     *
     * @param info Optional. Extra info about this move that should be
     * displayed.
     */
    readonly toString: (info?: string) => string;
}

/** Information about a certain move. */
export class Move implements ReadonlyMove {
    /** @override */
    public readonly name: string;
    /** @override */
    public readonly data: dex.MoveData;

    /** @override */
    public get pp(): number {
        return this._pp;
    }
    public set pp(pp: number) {
        this._pp = Math.max(0, Math.min(pp, this.maxpp));
    }
    private _pp = 0;

    /** @override */
    public readonly maxpp: number;

    /**
     * Creates a Move object.
     *
     * @param name Name of the move.
     * @param maxpp Max PP initializer. `"min"` for no pp ups, `"max"` for full
     * pp ups, or a number for a custom value between 1 and `"max"`. Default
     * `"max"`.
     * @param pp Initial PP value. Set to maxpp by default.
     */
    public constructor(
        name: string,
        maxpp: "min" | "max" | number = "max",
        pp?: number,
    ) {
        if (!Object.hasOwnProperty.call(dex.moves, name)) {
            throw new Error(`Invalid move name '${name}'`);
        }

        this.name = name;
        this.data = dex.moves[name];

        if (maxpp === "min") {
            [maxpp] = this.data.pp;
        } else if (maxpp === "max") {
            [, maxpp] = this.data.pp;
        } else {
            maxpp = Math.max(1, Math.min(maxpp, this.data.pp[1]));
        }
        this.maxpp = maxpp;
        this.pp = pp ?? maxpp;
    }

    // istanbul ignore next: Only used for logging.
    /** @override */
    public toString(info?: string): string {
        return (
            `${this.name}${info ? ` <${info}>` : ""} ` +
            `(${this._pp}/${this.maxpp})`
        );
    }
}
