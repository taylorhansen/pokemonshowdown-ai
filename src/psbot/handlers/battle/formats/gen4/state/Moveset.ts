import * as dex from "../dex";
import { Move, ReadonlyMove } from "./Move";

/** Readonly {@link Moveset} representation. */
export interface ReadonlyMoveset
{
    /** Contained moves, indexed by name. */
    readonly moves: ReadonlyMap<string, ReadonlyMove>;

    /** Constraint for inferring the remaining Moves. */
    readonly constraint: ReadonlySet<string>;

    /** Constraints for inferring a single Move slot. */
    readonly moveSlotConstraints: readonly ReadonlySet<string>[];

    /** Max amount of Move slots. */
    readonly size: number;

    /**
     * Gets Move by name.
     *
     * @param name Name of the move.
     * @returns The Move that matches the given name, or null if not found.
     */
    readonly get: (name: string) => ReadonlyMove | null;
}

/**
 * Tracks the moves of a {@link Pokemon}, with mechanisms to infer revealing
 * {@link Move}s of linked Movesets.
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

    // TODO: Bind with size/constraint into one object?
    /** @override */
    public get moveSlotConstraints(): readonly ReadonlySet<string>[]
    {
        return this._moveSlotConstraints;
    }
    private _moveSlotConstraints: ReadonlySet<string>[] = [];

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
        this.checkConstraints();
    }
    private _size: number;

    /**
     * Shared set of Movesets for propagating `#reveal()` calls due to Transform
     * inferences. Includes a boolean value to indicate whether the Moveset is a
     * Transform user (true) or target (false).
     */
    private linked: Map<Moveset, boolean> = new Map([[this, false]]);

    /** Parent Moveset. If not null, `#reveal()` will copy Move refs. */
    private base: Moveset | null = null;

    /** Creates a Moveset of specified size. */
    public constructor(size?: number);
    /** Creates a Moveset of specified movepool and size. */
    public constructor(movepool: readonly string[], size?: number);
    public constructor(movepool?: readonly string[] | number, size?: number)
    {
        if (typeof movepool === "number") size = movepool;
        // Fill in default size.
        size = size ?? Moveset.maxSize;

        this._size = Math.max(1, Math.min(size, Moveset.maxSize));

        // Fill in default movepool.
        if (typeof movepool === "number" || !movepool || movepool.length < 1)
        {
            movepool = dex.moveKeys;
        }

        // Movepool constructor.
        // Edge case: Infer movesets with very small movepools.
        if (movepool.length <= this._size)
        {
            this._moves =
                new Map(movepool.map(name => [name, new Move(name)]));
            this._constraint = new Set();
            this._size = this._moves.size;
        }
        else
        {
            // Initialize movepool constraint.
            this._moves = new Map();
            this._constraint = new Set(movepool);
        }
    }

    /**
     * Copies a Moveset and starts its shared link.
     *
     * @param moveset Moveset to copy from.
     * @param info If `"base"`, the provided moveset is its base parent. Parent
     * Movesets shouldn't be directly changed unless this Moveset `#link()`s to
     * a different Moveset, since its moves are copied by reference. If
     * `"transform"`, moves are deep copied and set to 5 pp as if the moves
     * were gained via the Transform move.
     */
    public link(moveset: Moveset, info: "base" | "transform"): void
    {
        // Clear previous subscriptions if any.
        this.isolate();

        // Calls to reveal() are propagated differently for base than others.
        if (info === "base")
        {
            if (moveset.base)
            {
                throw new Error("Base Moveset can't also have a base Moveset");
            }

            const linkData = moveset.linked.get(moveset);
            if (linkData === true)
            {
                throw new Error("Transform user can't be a base Moveset");
            }
            // istanbul ignore if: Should never happen, can't reproduce.
            if (linkData === undefined)
            {
                throw new Error("Base Moveset not linked to itself");
            }

            // Copy moves by reference.
            // Can't copy map reference since the two can diverge.
            // Changes to Moves are automatically propagated to base set.
            this._moves = new Map(moveset._moves);

            // Reclaim linked map from base moveset.
            this.linked = moveset.linked;
            moveset.isolate();
            this.linked.set(this, false);

            this.base = moveset;
        }
        else
        {
            // Future inferences have to be manually propagated to all other
            // linked Movesets since pp values are different.
            // Add to target Moveset's shared linked map.
            this.linked = moveset.linked;
            this.linked.set(this, true);

            // Deep copy known moves due to transform (pp=5).
            this._moves = new Map(
                [...moveset._moves]
                    .map(([name, m]) => [name, new Move(m.name, m.maxpp, 5)]));
        }

        // Copy unknown moves.
        this._constraint = moveset._constraint;
        this._moveSlotConstraints = moveset._moveSlotConstraints;
        this._size = moveset.size;
    }

    /** Isolates this Moveset and removes its shared link to other Movesets. */
    public isolate(): void
    {
        // Preserve Move inference for other linked Movesets.
        if (this.base)
        {
            this.linked.set(this.base, false);
            this.base = null;
        }

        // Copy constraint so it's not linked anymore.
        this._constraint = new Set(this._constraint);
        this._moveSlotConstraints = [...this._moveSlotConstraints];

        // Remove this moveset from the linked map.
        this.linked.delete(this);
        this.linked = new Map([[this, false]]);
    }

    /** @override */
    public get(name: string): Move | null
    {
        return this._moves.get(name) ?? null;
    }

    /**
     * Reveals a move if not already known.
     *
     * This call is propagated to all linked Movesets.
     *
     * @param name Name of the move.
     * @param maxpp Max PP value of the move. Default maxed.
     * @throws Error if already full.
     */
    public reveal(name: string, maxpp?: "min" | "max" | number): Move
    {
        // Already have the move.
        const m = this.get(name);
        if (m) return m;

        if (this._moves.size >= this._size)
        {
            throw new Error(`Rejected reveal() with name=${name} and ` +
                `maxpp=${maxpp}: Moveset is already full ` +
                `(moves: ${[...this._moves.keys()].join(", ")})`);
        }

        let result: Move | undefined;
        this.propagateReveal(name, maxpp, (moveset, move) =>
        {
            if (moveset === this) result = move;
        });

        // istanbul ignore next: can't reproduce
        if (!result) throw new Error("Moveset not linked to itself");

        this.satisfyMoveSlotConstraint(name);
        this.addConstraint(name);
        return result;
    }

    /** Factored-out code of {@link reveal} with a custom callback param. */
    private propagateReveal(name: string, maxpp?: "min" | "max" | number,
        callback: (moveset: Moveset, move: Move) => void = () => {}): void
    {
        for (const [moveset, transformed] of this.linked)
        {
            // istanbul ignore next: Can't reproduce.
            if (this._constraint !== moveset._constraint)
            {
                throw new Error(
                    "Linked moveset does not have the same " +
                    "constraints");
            }
            callback(moveset, moveset.revealImpl(name, maxpp, transformed));
        }
    }

    /** Factored-out code of {@link reveal}. */
    private revealImpl(name: string, maxpp?: "min" | "max" | number,
        transformed?: boolean): Move
    {
        // Transform users have pp (Note(gen>=5): And maxpp) set to 5.
        const pp = transformed ? 5 : undefined;
        const move = new Move(name, maxpp, pp);

        // Propagate to base moveset first.
        if (this.base)
        {
            if (this._moves.size !== this.base._moves.size)
            {
                throw new Error("Base Moveset expected to not change");
            }
            this.base._moves.set(name, move);
        }
        this._moves.set(name, move);

        return move;
    }

    /**
     * Permanently replaces a move slot with another move.
     *
     * @param name Name of the move to replace.
     * @param move New replacement Move.
     * @param base Whether to propagate this call to the base Moveset.
     */
    public replace(name: string, move: Move, base?: boolean): void
    {
        this.replaceImpl(name, move, base);
        // Since the replace call succeeded, this must mean that this Moveset
        // does not have the move that is replacing the old one.
        // TODO: Is only addConstraint() needed here? Removing move slot
        // constraints could discard useful information.
        this.satisfyMoveSlotConstraint(move.name);
        this.addConstraint(move.name);
    }

    /** Factored-out code for {@link replace}. */
    private replaceImpl(name: string, move: Move, base?: boolean): void
    {
        if (!this._moves.has(name))
        {
            throw new Error(`Moveset does not contain '${name}'`);
        }
        if (this._moves.has(move.name))
        {
            throw new Error(`Moveset cannot contain two '${move.name}' moves`);
        }

        if (base) this.base?.replaceImpl(name, move, true);

        this._moves.delete(name);
        this._moves.set(move.name, move);
    }

    /** Adds a constraint for a single move slot. */
    public addMoveSlotConstraint(moves: readonly string[]): void
    {
        // Already satisfied by a known move.
        if (moves.some(move => this._moves.has(move))) return;

        // Intersect with movepool constraint.
        const arr = moves.filter(move => this._constraint.has(move));

        // Over-constrained.
        if (arr.length === 0)
        {
            throw new Error(`Move slot constraint [${moves.join(", ")}] ` +
                "cannot exist for this Moveset");
        }
        // Constrained enough to instead reveal a move.
        if (arr.length === 1) this.reveal(arr[0]);
        // Add to shared move slot constraints list.
        else
        {
            this._moveSlotConstraints.push(new Set(arr));
            this.checkConstraints();
        }
    }

    /**
     * Removes move slot constraints that would be satisfied by the given move.
     */
    private satisfyMoveSlotConstraint(name: string): void
    {
        for (let i = 0; i < this._moveSlotConstraints.length; ++i)
        {
            if (this._moveSlotConstraints[i].has(name))
            {
                this._moveSlotConstraints.splice(i--, 1);
            }
        }
    }

    /**
     * Infers that the Moveset does not contain any of the given moves.
     *
     * If the movepool gets constrained enough due to this call, the remaining
     * moves will be inferred. Propagates to base and linked Movesets.
     */
    public inferDoesntHave(moves: readonly string[]): void
    {
        for (const move of moves) this._constraint.delete(move);

        // Update move constraints.
        const moveSet = new Set(moves);
        const toReveal: string[] = [];
        for (let i = 0; i < this._moveSlotConstraints.length; ++i)
        {
            const constraint = this._moveSlotConstraints[i];
            const newConstraintArr = [...constraint]
                .filter(move => !moveSet.has(move));
            if (newConstraintArr.length <= 0)
            {
                throw new Error("Rejected Moveset#inferDoesntHave() with " +
                    `moves=[${moves.join(", ")}] since the Moveset's slot ` +
                    `constraint [${[...constraint].join(", ")}] would be ` +
                    "invalidated");
            }
            // Can infer a move now.
            if (newConstraintArr.length === 1)
            {
                toReveal.push(newConstraintArr[0]);
            }
            else this._moveSlotConstraints[i] = new Set(newConstraintArr);
        }

        if (toReveal.length > 0) for (const name of toReveal) this.reveal(name);
        else this.checkConstraints();
    }

    /**
     * Adds a constraint to this Moveset that the remaining moves do not match
     * the given move name.
     *
     * Propagates to base and linked Movesets.
     */
    private addConstraint(name: string): void
    {
        this._constraint.delete(name);
        this.checkConstraints();
    }

    /**
     * Checks if the shared {@link constraint} set can be consumed, and does so
     * if it can.
     *
     * Propagates to base and linked Movesets.
     */
    private checkConstraints(): void
    {
        // See how many move slots are left to fill.
        const numUnknown = this._size - this._moves.size;

        // No more moves can be inferred so clear all constraints.
        if (numUnknown <= 0)
        {
            this._moveSlotConstraints.length = 0;
            this._constraint.clear();
            return;
        }

        // One move left, intersect all constraints.
        if (numUnknown === 1 && this._moveSlotConstraints.length > 0)
        {
            const [first] = this._moveSlotConstraints;
            const rest = this._moveSlotConstraints.slice(1);
            const result = [...first].filter(n => rest.every(s => s.has(n)));

            if (result.length <= 0)
            {
                throw new Error("Move slot constraints can't intersect");
            }

            // Assumed that slot constraints are already intersected with main
            // movepool constraint.
            this._constraint.clear();
            for (const move of result) this._constraint.add(move);
        }

        if (this._constraint.size > numUnknown) return;

        // Constraints narrowed enough to infer the rest of the moveset.
        const constraintsArr = [...this._constraint];
        for (let i = 0; i < constraintsArr.length; ++i)
        {
            const move = constraintsArr[i];
            this.propagateReveal(move, "max", moveset =>
            {
                // Update size for itself and base on the last iteration.
                if (i + 1 < constraintsArr.length) return;
                moveset._size = moveset._moves.size;
                if (moveset.base) moveset.base._size = moveset.base._moves.size;
            });
        }
        this._constraint.clear();
    }

    // istanbul ignore next: Only used for logging.
    /**
     * Encodes all moveset data into a string.
     *
     * @param indent Indentation level to use.
     * @param happiness Optional happiness value for calculating
     * Return/Frustration power.
     * @param hpType Optional Hidden Power type.
     */
    public toString(indent = 0, happiness?: number | null,
        hpType?: string): string
    {
        // Stringify move slots.
        const moves: string[] = [];
        // Known moves.
        for (const move of this._moves.values())
        {
            moves.push(this.stringifyMove(move, happiness, hpType));
        }
        // Unknown moves.
        for (let i = this._moves.size; i < this._size; ++i)
        {
            moves.push("<unrevealed>");
        }

        const s = " ".repeat(indent);
        let result = `${s}moves: ${moves.join(", ")}`;
        if (this._moveSlotConstraints.length > 0)
        {
            // Stringify move slot constraints.
            const ss = " ".repeat(indent + 4);
            const slotConstraints = this._moveSlotConstraints.map(msc =>
                    `${ss}[${[...msc].join(", ")}]`)
                .join("\n");
            result += `\n${s}slot constraints:\n${slotConstraints}`;
        }
        if (this._constraint.size > 0)
        {
            // Stringify movepool constraint.
            result += `\n${s}remaining movepool: ` +
                `[${[...this._constraint].join(", ")}]`;
        }

        return result;
    }

    // istanbul ignore next: Only used for logging.
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
            // Calculate power from happiness value.
            info = happiness !== null ?
                Math.max(1, happiness / 2.5).toString() : "1-102";
        }
        else if (move.name === "frustration")
        {
            // Calculate power from happiness value.
            info = happiness !== null ?
                Math.max(1, (255 - happiness) / 2.5).toString() : "1-102";
        }

        return move.toString(info);
    }
}
