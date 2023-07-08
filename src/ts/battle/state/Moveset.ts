import * as dex from "../dex";
import {Move, ReadonlyMove} from "./Move";

/** Readonly {@link Moveset} representation. */
export interface ReadonlyMoveset {
    /** Contained moves, indexed by name. */
    readonly moves: ReadonlyMap<string, ReadonlyMove>;

    /**
     * Constraint for inferring the remaining Moves. Contains moves that haven't
     * been completely ruled out yet.
     */
    readonly constraint: ReadonlySet<string>;

    /** Max amount of Move slots. */
    readonly size: number;

    /**
     * Gets Move by name.
     *
     * @param name Name of the move.
     * @returns The Move that matches the given name, or `null` if not found.
     */
    readonly get: (name: string) => ReadonlyMove | null;

    /**
     * Checks if this Moveset is {@link Moveset.isolate isolated}, i.e. it has
     * no links to other Movesets.
     */
    readonly isIsolated: () => boolean;

    /**
     * Encodes all moveset data into a string.
     *
     * @param indent Indentation level to use.
     * @param happiness Optional happiness value for calculating
     * Return/Frustration power.
     * @param hpType Optional Hidden Power type.
     */
    readonly toString: (
        indent?: number,
        happiness?: number | null,
        hpType?: string,
    ) => string;
}

/** Transform move source or target indicator type. */
type TransformType = "transformSource" | "transformTarget";

/**
 * Tracks the moves of a {@link Pokemon}, with mechanisms to infer revealing
 * {@link Move}s of linked Movesets.
 */
export class Moveset implements ReadonlyMoveset {
    /** Maximum moveset size. */
    public static readonly maxSize = 4;

    /** @override */
    public get moves(): ReadonlyMap<string, Move> {
        return this._moves;
    }
    private _moves: Map<string, Move>;

    /** @override */
    public get constraint(): ReadonlySet<string> {
        return this._constraint;
    }
    private _constraint: Set<string>;

    /** @override */
    public get size(): number {
        return this._size;
    }
    public set size(value: number) {
        if (value < this._moves.size) {
            throw new Error(
                `Requested Moveset size ${value} is smaller than current ` +
                    `size ${this._moves.size}`,
            );
        }
        if (value > Moveset.maxSize) {
            throw new Error(
                `Requested Moveset size ${value} is bigger than maximum size ` +
                    `${Moveset.maxSize}`,
            );
        }
        this._size = value;
        this.checkConstraints();
    }
    private _size: number;

    /**
     * Shared set of Movesets for propagating `#reveal()` calls due to Transform
     * inferences. Includes an indicator to separate source and target.
     */
    private linked: Map<Moveset, TransformType> = new Map([
        [this, "transformTarget"],
    ]);

    /** Parent Moveset. If not null, `#reveal()` will copy Move refs. */
    private base: Moveset | null = null;

    /** Creates a Moveset of specified size. */
    public constructor(size?: number);
    /** Creates a Moveset of specified movepool and size. */
    public constructor(movepool: readonly string[], size?: number);
    public constructor(movepool?: readonly string[] | number, size?: number) {
        if (typeof movepool === "number") {
            size = movepool;
        }
        // Fill in default size.
        size = size ?? Moveset.maxSize;

        this._size = Math.max(1, Math.min(size, Moveset.maxSize));

        // Fill in default movepool.
        if (typeof movepool === "number" || !movepool || movepool.length < 1) {
            movepool = dex.moveKeys;
        }

        // Movepool constructor.
        // Edge case: Infer movesets with very small movepools.
        if (movepool.length <= this._size) {
            this._moves = new Map(movepool.map(name => [name, new Move(name)]));
            this._constraint = new Set();
            this._size = this._moves.size;
        } else {
            // Initialize movepool constraint.
            this._moves = new Map();
            this._constraint = new Set(movepool);
        }
    }

    /** @override */
    public isIsolated(): boolean {
        return this.base === null && this.linked.size === 1;
    }

    /**
     * Copies moves from the given Moveset as if it is its base parent, handling
     * Transform inferences appropriately.
     *
     * Parent Movesets shouldn't be directly changed unless this Moveset
     * calls {@link setTransformTarget} on a different Moveset, since this
     * method copies moves by reference.
     */
    public setBase(moveset: Moveset): void {
        this.isolate();

        if (moveset.base) {
            throw new Error("Base Moveset can't also have a base Moveset");
        }

        const linkType = moveset.linked.get(moveset);
        if (linkType === "transformSource") {
            throw new Error("Transform source can't be a base Moveset");
        }
        // istanbul ignore if: Should never happen, can't reproduce.
        if (linkType === undefined) {
            throw new Error("Base Moveset not linked to itself");
        }

        // Copy moves by reference.
        // Note: Can't copy map reference since the two can diverge, e.g. mimic.
        // Changes to Moves are automatically propagated to base set.
        this._moves = new Map(moveset._moves);

        // Reclaim linked map from base moveset.
        this.linked = moveset.linked;
        this.linked.set(this, "transformTarget");
        moveset.unlink();

        // Share information about unknown moves.
        this._constraint = moveset._constraint;
        this._size = moveset.size;

        this.base = moveset;
    }

    /**
     * Copies moves from the given Moveset as if the pokemon transformed into
     * it, handling Transform inferences appropriately.
     *
     * Moves will be deep copied and set to 5 pp.
     */
    public setTransformTarget(moveset: Moveset): void {
        this.isolate();

        // Future inferences have to be manually propagated to all other
        // linked Movesets since pp values are different.
        // Add to target Moveset's shared linked map.
        this.linked = moveset.linked;
        this.linked.set(this, "transformSource");

        // Deep copy known moves due to transform (pp=5).
        this._moves = new Map(
            [...moveset._moves].map(([name, m]) => [
                name,
                new Move(m.name, m.maxpp, 5),
            ]),
        );

        // Share information about unknown moves.
        this._constraint = moveset._constraint;
        this._size = moveset.size;
    }

    /** Isolates this Moveset and removes its shared link to other Movesets. */
    public isolate(): void {
        this.unlink();

        // Copy constraint so it's not shared anymore.
        this._constraint = new Set(this._constraint);
    }

    /** Removes the Moveset's shared link to other Movesets. */
    private unlink(): void {
        // Preserve Move inference for other linked Movesets by deferring to the
        // base Moveset.
        if (this.base) {
            this.linked.set(this.base, "transformTarget");
            this.base.linked = this.linked;
            this.base = null;
        }

        // Remove this moveset from the linked map.
        this.linked.delete(this);
        this.linked = new Map([[this, "transformTarget"]]);
    }

    /** @override */
    public get(name: string): Move | null {
        return this._moves.get(name) ?? null;
    }

    /**
     * Reveals a move if not already known.
     *
     * This call is propagated to all Movesets linked through Transform or the
     * parent base Moveset.
     *
     * @param name Name of the move.
     * @param maxpp Max PP value of the move. Default maxed.
     * @throws Error if already full.
     */
    public reveal(name: string, maxpp?: "min" | "max" | number): Move {
        // Already have the move.
        const m = this.get(name);
        if (m) {
            return m;
        }

        if (this._moves.size >= this._size) {
            throw new Error(
                `Rejected reveal() with name=${name} and maxpp=${maxpp}: ` +
                    "Moveset is already full " +
                    `(moves: ${[...this._moves.keys()].join(", ")})`,
            );
        }

        let result: Move | undefined;
        this.propagateReveal(name, maxpp, (moveset, move) => {
            if (moveset === this) {
                result = move;
            }
        });

        // istanbul ignore next: Can't reproduce.
        if (!result) {
            throw new Error("Moveset not linked to itself");
        }

        // Note: This means the rest of the moveset doesn't have the move that
        // we just revealed.
        this.inferDoesntHave(name);

        return result;
    }

    /**
     * Factored-out code of {@link reveal} with a custom callback param.
     *
     * For each {@link linked} Moveset, calls the callback with the Moveset and
     * the Move object that was added to it (while also propagating to its base
     * Moveset if it isn't a Transform source).
     */
    private propagateReveal(
        name: string,
        maxpp?: "min" | "max" | number,
        callback: (moveset: Moveset, move: Move) => void = () => {},
    ): void {
        for (const [moveset, transformType] of this.linked) {
            // istanbul ignore next: Should never happen.
            if (this._constraint !== moveset._constraint) {
                throw new Error(
                    "Linked moveset does not share the same constraint set",
                );
            }
            callback(
                moveset,
                moveset.revealImpl(
                    name,
                    maxpp,
                    transformType === "transformSource" /*transformed*/,
                ),
            );
        }
    }

    /**
     * Factored-out code of {@link reveal}. Adds a shared {@link Move} object to
     * {@link base `this.base`} and `this`.
     */
    private revealImpl(
        name: string,
        maxpp?: "min" | "max" | number,
        transformed?: boolean,
    ): Move {
        // Transform users have pp (Note(gen>=5): And maxpp) set to 5.
        const pp = transformed ? 5 : undefined;
        const move = new Move(name, maxpp, pp);

        // Propagate to base moveset first.
        if (this.base) {
            if (this._moves.size !== this.base._moves.size) {
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
    public replace(name: string, move: Move, base?: boolean): void {
        this.replaceImpl(name, move, base);
        // Since the replace call succeeded, this must mean that this Moveset
        // does not have the move that is replacing the old one.
        this.inferDoesntHave(move.name);
    }

    /** Factored-out code for {@link replace}. */
    private replaceImpl(name: string, move: Move, base?: boolean): void {
        if (!this._moves.has(name)) {
            throw new Error(`Moveset does not contain '${name}'`);
        }
        if (this._moves.has(move.name)) {
            throw new Error(`Moveset cannot contain two '${move.name}' moves`);
        }

        if (base) {
            this.base?.replaceImpl(name, move, true);
        }

        this._moves.delete(name);
        this._moves.set(move.name, move);
    }

    /**
     * Infers that the Moveset does not contain the given move.
     *
     * If the movepool gets constrained enough due to this call, the remaining
     * moves will be inferred. Propagates to base and linked Movesets.
     */
    public inferDoesntHave(move: string): void;
    /**
     * Infers that the Moveset does not contain any of the given moves.
     *
     * If the movepool gets constrained enough due to this call, the remaining
     * moves will be inferred. Propagates to base and linked Movesets.
     */
    public inferDoesntHave(moves: readonly string[]): void;
    public inferDoesntHave(moves: string | readonly string[]): void {
        if (typeof moves === "string") {
            moves = [moves];
        }
        for (const move of moves) {
            this._constraint.delete(move);
        }
        this.checkConstraints();
    }

    /**
     * Checks if the shared {@link constraint} set can be consumed, and does so
     * if it can.
     *
     * Propagates to base and linked Movesets.
     */
    private checkConstraints(): void {
        // See how many move slots are left to fill.
        const numUnknown = this._size - this._moves.size;

        // No more moves can be inferred so clear all constraints.
        if (numUnknown <= 0) {
            this._constraint.clear();
            return;
        }

        // Constraints narrow enough to infer the rest of the moveset.
        if (this._constraint.size > numUnknown) {
            return;
        }

        const constraintsArr = [...this._constraint];
        for (let i = 0; i < constraintsArr.length; ++i) {
            const move = constraintsArr[i];
            this.propagateReveal(move, "max", moveset => {
                // Update size for itself and base on the last iteration.
                if (i + 1 < constraintsArr.length) {
                    return;
                }
                moveset._size = moveset._moves.size;
                if (moveset.base) {
                    moveset.base._size = moveset.base._moves.size;
                }
            });
        }
        this._constraint.clear();
    }

    // istanbul ignore next: Only used for logging.
    /** @override */
    public toString(
        indent = 0,
        happiness?: number | null,
        hpType?: string,
    ): string {
        // Stringify move slots.
        const moves: string[] = [];
        // Known moves.
        for (const move of this._moves.values()) {
            moves.push(this.stringifyMove(move, happiness, hpType));
        }
        // Unknown moves.
        for (let i = this._moves.size; i < this._size; ++i) {
            moves.push("<unrevealed>");
        }

        const s = " ".repeat(indent);
        let result = `${s}moves: ${moves.join(", ")}`;
        if (this._constraint.size > 0) {
            // Stringify movepool constraint.
            result +=
                `\n${s}remaining movepool: ` +
                `[${[...this._constraint].join(", ")}]`;
        }

        return result;
    }

    // istanbul ignore next: Only used for logging.
    /** Stringifies a Move, inserting additional info if needed. */
    private stringifyMove(
        move: Move | null | undefined,
        happiness: number | null = null,
        hpType?: string,
    ): string {
        if (move === null) {
            return "<unrevealed>";
        }
        if (!move) {
            return "<empty>";
        }

        let info: string | undefined;
        if (move.name === "hiddenpower") {
            info = hpType;
        } else if (move.name === "return") {
            // Calculate power from happiness value.
            info =
                happiness !== null
                    ? Math.max(1, happiness / 2.5).toString()
                    : "1-102";
        } else if (move.name === "frustration") {
            // Calculate power from happiness value.
            info =
                happiness !== null
                    ? Math.max(1, (255 - happiness) / 2.5).toString()
                    : "1-102";
        }

        return move.toString(info);
    }
}
