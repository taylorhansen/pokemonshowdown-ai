import { Move } from "./Move";

/** Tracks the moves and hidden power type of a Pokemon. */
export class Moveset
{
    /** Maximum moveset size. */
    public static readonly maxSize = 4;

    /** Contained moves. Null is unrevealed while undefined is nonexistent. */
    public get moves(): readonly (Move | null | undefined)[]
    {
        return this._moves;
    }
    private readonly _moves =
        new Array<Move | null | undefined>(Moveset.maxSize);
    private readonly baseMoves =
        new Array<Move | null | undefined>(Moveset.maxSize);
    /** Index of the first unknown move. Previous indexes should be defined. */
    private unrevealed = 0;

    /** Creates a Moveset of specified size. */
    constructor(size = Moveset.maxSize)
    {
        // TODO: possible corner case: infer pokemon sets with less than 4 moves
        size = Math.max(1, Math.min(size, Moveset.maxSize));
        this._moves.fill(null, 0, size);
        this.baseMoves.fill(null, 0, size);
    }

    /**
     * Gets the move by name.
     * @param id ID name of the move.
     * @returns The move that matches the ID name, or null if not found.
     */
    public get(id: string): Move | null
    {
        const index = this.getIndex(id);
        return index >= 0 ? this._moves[index] || null : null;
    }

    /**
     * Reveals a move to the client if not already known. Throws if moveset is
     * already full.
     * @param id ID name of the move.
     */
    public reveal(id: string): Move
    {
        return this._moves[this.revealIndex(id)]!;
    }

    /** Gets a move, calling `reveal()` if not initially found. */
    public getOrReveal(id: string): Move
    {
        return this.get(id) || this.reveal(id);
    }

    /** Gets the index of a move, calling `reveal()` if not initially found. */
    public getOrRevealIndex(id: string): number
    {
        let i = this.getIndex(id);
        if (i < 0) i = this.revealIndex(id);
        return i;
    }

    /** Gets the index of a move by name, or -1 if not found. */
    private getIndex(name: string): number
    {
        for (let i = 0; i < this.unrevealed; ++i)
        {
            const move = this._moves[i];
            if (move && move.name === name) return i;
        }
        return -1;
    }

    /** Gets the index of a newly revealed move by name. Throws if full. */
    private revealIndex(id: string): number
    {
        // early return: already revealed
        const index = this.getIndex(id);
        if (index >= 0) return index;

        if (this.unrevealed >= this._moves.length)
        {
            throw new Error("Moveset is already full");
        }

        const move = new Move();
        this._moves[this.unrevealed] = move;
        this.baseMoves[this.unrevealed] = move;
        move.init(id);
        return this.unrevealed++;
    }

    /**
     * Overrides a move slot with another Move. Resets on `#clearOverrides()`.
     * @param id Name of the move to override.
     * @param move New override Move.
     */
    public override(id: string, move: Move): void
    {
        const i = this.getIndex(id);
        if (i < 0) throw new Error(`Moveset does not contain '${id}'`);
        this._moves[i] = move;
    }

    /** Clears override moves added by `#override()`. */
    public clearOverrides(): void
    {
        for (let i = 0; i < this.baseMoves.length; ++i)
        {
            this._moves[i] = this.baseMoves[i];
        }
    }

    /**
     * Permanently replaces a move slot with another Move.
     * @param id Name of the move to replace.
     * @param move New replacement Move.
     */
    public replace(id: string, move: Move): void
    {
        const i = this.getIndex(id);
        if (i < 0) throw new Error(`Moveset does not contain '${id}'`);
        this._moves[i] = move;
        this.baseMoves[i] = move;
    }

    // istanbul ignore next: only used for logging
    /**
     * Encodes all moveset data into a string.
     * @param happiness Optional happiness value for calculating
     * Return/Frustration power.
     * @param hpType Optional Hidden Power type.
     */
    public toString(happiness: number | null = null, hpType?: string): string
    {
        return this._moves
            .map((m, i) => this.stringifyMove(m) +
                // if overridden, include base move
                (this.baseMoves[i] !== m ?
                    ` (base: ${this.stringifyMove(this.baseMoves[i],
                        happiness, hpType)})` : ""))
            .join(", ");
    }

    // istanbul ignore next: only used for logging
    /** Stringifies a Move, inserting additional info if needed. */
    private stringifyMove(move: Move | null | undefined,
        happiness: number | null = null, hpType?: string): string
    {
        if (move === null) return "<unrevealed>";
        if (!move) return "<empty>";

        let info: string | undefined;
        if (move.name === "hiddenpower") info = hpType;
        else if (move.name === "return")
        {
            // calculate power from happiness value
            info = happiness !== null ?
                Math.max(1, happiness / 2.5).toString() : "1-102";
        }
        else if (move.name === "frustration")
        {
            // calculate power from happiness value
            info = happiness !== null ?
                Math.max(1, (255 - happiness) / 2.5).toString() : "1-102";
        }

        return move.toString(info);
    }
}
