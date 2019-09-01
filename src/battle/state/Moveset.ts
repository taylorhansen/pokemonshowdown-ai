import { Move } from "./Move";

/**
 * Tracks the moves of a Pokemon, using a variation of pub/sub to infer
 * revealing Moves of linked Movesets.
 */
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
    /** Index of the first unknown move. Previous indexes should be defined. */
    private unrevealed = 0;

    /**
     * Shared array of linked Movesets to propagate `#reveal()` calls. Can be
     * thought of as the message broker in a pub/sub pattern. Index 0 refers to
     * the base of the link (aka target of Transform).
     */
    private linked: Moveset[] | null = null;

    /** Parent Moveset. If not null, `#reveal()` will copy Move refs. */
    private base: Moveset | null = null;

    /** Creates a Moveset of specified size. */
    constructor(size = Moveset.maxSize)
    {
        // TODO: possible corner case: infer pokemon sets with less than 4 moves
        size = Math.max(1, Math.min(size, Moveset.maxSize));
        // the other values after size are padded with undefined/nonexistent
        this._moves.fill(null, 0, size);
    }

    /**
     * Copies a Moveset and starts its shared link, sort of like a subscriber in
     * a pub/sub pattern.
     * @param moveset Moveset to copy from.
     * @param info If `"base"`, the provided moveset is its base parent. Parent
     * Movesets shouldn't be directly changed unless this Moveset `#link()`s to
     * a different Moveset, since its moves are copied by reference. If
     * `"transform"`, moves are deep copied and set to 5 pp as if the moves
     * were gained via the Transform move.
     */
    public link(moveset: Moveset, info: "base" | "transform"): void
    {
        // clear previous subscriptions if any
        this.isolate();

        for (let i = 0; i < Moveset.maxSize; ++i)
        {
            const move = moveset._moves[i];
            if (info === "base" || !move) this._moves[i] = move;
            // transform: deep copy but set pp (gen>=5: and maxpp) to 5
            else this._moves[i] = new Move(move.name, move.maxpp, 5);
        }
        this.unrevealed = moveset.unrevealed;

        // reveal() calls are propagated specially for base, fine for others
        if (info === "base") this.base = moveset;
        else if (moveset.linked)
        {
            // add to target Moveset's linked array
            this.linked = moveset.linked;
            this.linked.push(this);
        }
        // initialize linked array
        else this.linked = moveset.linked = [moveset, this];
    }

    /** Isolates this Moveset and removes its shared link to other Movesets. */
    public isolate(): void
    {
        // preserve Move inference for other linked Movesets
        if (this.linked && this.base) this.linked.push(this.base);

        this.base = null;

        // istanbul ignore if: can't test for this
        if (!this.linked) return;
        const i = this.linked.findIndex(m => m === this);
        // istanbul ignore else: can't reproduce
        if (i >= 0) this.linked.splice(i, 1);
        this.linked = null;
    }

    /**
     * Gets the move by name.
     * @param id ID name of the move.
     * @returns The move that matches the ID name, or null if not found.
     */
    public get(id: string): Move | null
    {
        const index = this.getIndex(id);
        return index >= 0 ?
            this._moves[index] || /*istanbul ignore next: can't reproduce*/null
            : null;
    }

    /**
     * Reveals a move to the client if not already known. Throws if moveset is
     * already full. Propagates to linked Movesets, sort of like a publisher in
     * a pub/sub pattern.
     * @param id ID name of the move.
     * @param maxpp Max PP value of the move. Default maxed.
     */
    public reveal(id: string, maxpp?: "min" | "max" | number): Move
    {
        return this._moves[this.revealIndex(id, maxpp)]!;
    }

    /** Gets a move, calling `#reveal()` if not initially found. */
    public getOrReveal(id: string): Move
    {
        return this.get(id) || this.reveal(id);
    }

    /** Gets the index of a move, calling `#reveal()` if not initially found. */
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

    /**
     * Gets the index of a newly revealed move by name. Throws if full.
     * Propagates to linked Movesets, sort of like a publisher in a pub/sub
     * pattern.
     * @param id ID name of the move.
     * @param maxpp Max PP value of the move. Default maxed.
     */
    private revealIndex(id: string, maxpp?: "min" | "max" | number): number
    {
        // transform links: pp (gen>=5: and maxpp) set to 5
        // only for the transform target (index 0) will this not apply
        let pp: number | undefined;
        if (this.linked && this.linked[0] !== this) pp = 5;
        const i = this.revealIndexImpl(id, maxpp, pp);

        // propagate reveal call to other linked Movesets
        if (this.linked)
        {
            for (const moveset of this.linked)
            {
                if (moveset === this) continue;
                // transform links: pp (gen>=5: and maxpp) set to 5
                // only for the transform target (index 0) will this not apply
                pp = (this.linked && this.linked[0] !== moveset) ?
                    5 : undefined;
                moveset.revealIndexImpl(id, maxpp, pp);
            }
        }

        // propagate reveal call to parent Moveset
        if (this.base)
        {
            // only copy reference
            this.base._moves[this.base.unrevealed++] = this._moves[i];
        }

        return i;
    }

    /**
     * Factored out code of `#revealIndex()` so reveal propagation doesn't
     * repeat itself.
     */
    private revealIndexImpl(id: string, maxpp?: "min" | "max" | number,
        pp?: number): number
    {
        // early return: already revealed
        const index = this.getIndex(id);
        if (index >= 0) return index;

        if (this.unrevealed >= this._moves.length)
        {
            throw new Error("Moveset is already full");
        }

        const move = new Move(id, maxpp, pp);
        this._moves[this.unrevealed] = move;
        return this.unrevealed++;
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
    }

    // istanbul ignore next: only used for logging
    /**
     * Encodes all moveset data into a string.
     * @param base Base moveset to contrast Moves with.
     * @param happiness Optional happiness value for calculating
     * Return/Frustration power.
     * @param hpType Optional Hidden Power type.
     */
    public toString(base?: Moveset, happiness: number | null = null,
        hpType?: string): string
    {
        return this._moves
            .map((m, i) => this.stringifyMove(m, happiness, hpType) +
                // if overridden, include base move
                (base && base !== this && base._moves[i] !== m ?
                    ` (base: ${this.stringifyMove(base._moves[i], happiness,
                        hpType)})` : ""))
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
