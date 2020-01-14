import * as dex from "../dex/dex";
import { Move, ReadonlyMove } from "./Move";

export interface ReadonlyMoveset
{
    /** Contained moves, indexed by name. */
    readonly moves: ReadonlyMap<string, ReadonlyMove>;
    /** Constraint for inferring the remaining Moves. */
    readonly constraint: ReadonlySet<string>;
    /** Max amount of Move slots. */
    readonly size: number;
    /**
     * Gets Move by name.
     * @param name Name of the move.
     * @returns The Move that matches the given name, or null if not found.
     */
    get(name: string): ReadonlyMove | null;
}

/**
 * Tracks the moves of a Pokemon, using a variation of pub/sub to infer
 * revealing Moves of linked Movesets.
 */
export class Moveset implements ReadonlyMoveset
{
    /** Maximum moveset size. */
    public static readonly maxSize = 4;

    /** @override */
    public get moves(): ReadonlyMap<string, Move> { return this._moves; }
    private _moves: Map<string, Move>;

    /** @override */
    public get constraint(): ReadonlySet<string> { return this._constraint; }
    private _constraint: Set<string>;

    /** @override */
    public get size(): number { return this._size; }
    public set size(value: number)
    {
        if (value < this._moves.size)
        {
            throw new Error(`Requested Moveset size ${value} is smaller than ` +
                `current size ${this._moves.size}`);
        }
        if (value > Moveset.maxSize)
        {
            throw new Error(`Requested Moveset size ${value} is bigger than ` +
                `maximum size ${Moveset.maxSize}`);
        }
        this._size = value;
        this.checkConstraint();
    }
    private _size: number;

    /**
     * Shared array of linked Movesets to propagate `#reveal()` calls. Can be
     * thought of as the message broker in a pub/sub pattern. Index 0 refers to
     * the base of the link (aka target of Transform).
     */
    private linked: Moveset[] | null = null;

    /** Parent Moveset. If not null, `#reveal()` will copy Move refs. */
    private base: Moveset | null = null;

    /** Creates a Moveset of specified size. */
    constructor(size?: number);
    /** Creates a Moveset of specified movepool and size. */
    // tslint:disable-next-line: unified-signatures
    constructor(movepool: readonly string[], size?: number);
    constructor(movepool?: readonly string[] | number, size?: number)
    {
        if (typeof movepool === "number") size = movepool;
        // fill in default size
        size = size ?? Moveset.maxSize;

        this._size = Math.max(1, Math.min(size, Moveset.maxSize));

        // fill in default movepool
        if (typeof movepool === "number" || !movepool || movepool.length < 1)
        {
            movepool = Object.keys(dex.moves);
        }

        // movepool constructor
        // edge case: infer movesets with very small movepools
        if (movepool.length <= this._size)
        {
            this._moves =
                new Map(movepool.map(name => [name, new Move(name)]));
            this._constraint = new Set();
        }
        else
        {
            // initialize movepool constraint
            this._moves = new Map();
            this._constraint = new Set(movepool);
        }
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

        // copy known moves
        this._moves.clear();
        for (const move of moveset._moves.values())
        {
            // base: copy moves by reference
            if (info === "base") this._moves.set(move.name, move);
            // transform: deep copy but set pp (gen>=5: and maxpp) to 5
            else this._moves.set(move.name, new Move(move.name, move.maxpp, 5));
        }

        // copy unknown moves
        this._constraint = moveset._constraint;
        this._size = moveset.size;

        // reveal() calls are propagated differently for base than others
        if (info === "base") this.base = moveset;
        else if (moveset.linked)
        {
            // add to target Moveset's linked array
            // TODO: what if base is left in after isolate?
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

    /** @override */
    public get(name: string): Move | null
    {
        return this._moves.get(name) || null;
    }

    /**
     * Reveals a move if not already known. Throws if moveset is already full.
     * Propagates to linked Movesets.
     * @param name Name of the move.
     * @param maxpp Max PP value of the move. Default maxed.
     */
    public reveal(name: string, maxpp?: "min" | "max" | number): Move
    {
        let result: Move | undefined;
        for (const moveset of this.linked || [this])
        {
            // TODO: do precondition checks at the beginning of the call
            if (moveset._moves.size >= moveset._size)
            {
                throw new Error("Moveset is already full");
            }

            let move = moveset._moves.get(name);
            // reveal the move
            if (!move)
            {
                // transform users: pp (gen>=5: and maxpp) set to 5
                // only for the transform target (index 0) will this not apply
                let pp: number | undefined;
                if (this.linked && this.linked[0] !== moveset) pp = 5;

                move = new Move(name, maxpp, pp);
                moveset.revealImpl(move);
            }

            // record the result of the entire method call
            if (moveset === this) result = move;
        }

        this.addConstraint(name);

        // istanbul ignore next: can't reproduce
        if (!result) throw new Error("Moveset not linked to itself");
        return result;
    }

    /** Factored-out code of `#reveal()`. */
    private revealImpl(move: Move): void
    {
        // propagate to base moveset first
        if (this.base)
        {
            if (this._moves.size !== this.base._moves.size)
            {
                throw new Error("Base Moveset expected to not change");
            }
            this.base.revealImpl(move);
        }

        this._moves.set(move.name, move);
    }

    /**
     * Permanently replaces a move slot with another Move.
     * @param name Name of the move to replace.
     * @param move New replacement Move.
     */
    public replace(name: string, move: Move): void
    {
        if (!this._moves.has(name))
        {
            throw new Error(`Moveset does not contain '${name}'`);
        }
        if (this._moves.has(move.name))
        {
            throw new Error(`Moveset cannot contain two '${move.name}' moves`);
        }

        this._moves.delete(name);
        this._moves.set(move.name, move);
        // since the replace call succeeded, this must mean that this Moveset
        //  does not have the move that is replacing the old one
        this.addConstraint(move.name);
    }

    /**
     * Adds a constraint to this Moveset that the remaining Moves do not match
     * the given move name. Automatically propagates to base and linked
     * Movesets.
     */
    private addConstraint(name: string): void
    {
        this._constraint.delete(name);
        this.checkConstraint();
    }

    /**
     * Checks if the shared `#constraint` set can be consumed, and does so if it
     * can. Automatically propagates to base and linked Movesets.
     */
    private checkConstraint(): void
    {
        // see how many move slots are left to fill
        const numUnknown = this._size - this._moves.size;

        // constraints narrowed enough to infer the rest of the moveset
        if (this._constraint.size <= numUnknown)
        {
            // consume each constraint
            // propagate this inference to links/bases
            for (const moveset of this.linked || [this])
            {
                // istanbul ignore next: can't reproduce
                if (this._constraint !== moveset._constraint)
                {
                    throw new Error(
                        "Linked moveset does not have the same constraints");
                }

                // transform users: pp (gen>=5: and maxpp) set to 5
                // only for the transform target (index 0) will this not apply
                let pp: number | undefined;
                if (this.linked && this.linked[0] !== moveset) pp = 5;

                for (const name of this._constraint)
                {
                    moveset.revealImpl(new Move(name, "max", pp));
                }

                moveset._size = moveset._moves.size;
                if (moveset.base) moveset.base._size = moveset.base._moves.size;
            }
            this._constraint.clear();
        }
    }

    // istanbul ignore next: only used for logging
    /**
     * Encodes all moveset data into a string.
     * @param happiness Optional happiness value for calculating
     * Return/Frustration power.
     * @param hpType Optional Hidden Power type.
     */
    public toString(happiness?: number | null, hpType?: string): string
    {
        const result: string[] = [];

        // fill in known moves
        for (const move of this._moves.values())
        {
            result.push(this.stringifyMove(move, happiness, hpType));
        }

        // fill in unknown moves
        for (let i = this._moves.size; i < this._size; ++i)
        {
            result.push("<unrevealed>");
        }

        return result.join(", ");
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
