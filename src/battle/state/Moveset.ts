import { Type, types } from "../dex/dex-types";
import { Move } from "./Move";
import { PossibilityClass } from "./PossibilityClass";

/** Hidden power types dictionary. */
const possibleHPTypes = Object.assign({}, types) as {[T in Type]: number};
delete possibleHPTypes["???"];
delete possibleHPTypes.normal;

/** Tracks the moves and hidden power type of a Pokemon. */
export class Moveset
{
    /** Maximum moveset size. */
    public static readonly maxSize = 4;

    /** Hidden power type possibility tracker. */
    public readonly hpType = new PossibilityClass(possibleHPTypes);

    /** Contained moves. */
    private readonly moves: ReadonlyArray<Move> =
        Array.from({length: Moveset.maxSize}, () => new Move());
    /** Index of the first unrevealed move. */
    private unrevealed = 0;

    /**
     * Gets the move by name.
     * @param id ID name of the move.
     * @returns The move that matches the ID name, or null if not found.
     */
    public get(id: string): Move | null
    {
        const index = this.getIndex(id);
        return index >= 0 ? this.moves[index] : null;
    }

    /**
     * Reveals a move to the client if not already known. Throws if moveset is
     * already full.
     * @param id ID name of the move.
     */
    public reveal(id: string): Move
    {
        return this.moves[this.revealIndex(id)];
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
    private getIndex(id: string): number
    {
        for (let i = 0; i < this.unrevealed; ++i)
        {
            if (this.moves[i].id === id) return i;
        }
        return -1;
    }

    /** Gets the index of a newly revealed move by name. Throws if full. */
    private revealIndex(id: string): number
    {
        // early return: already revealed
        const index = this.getIndex(id);
        if (index >= 0) return index;

        if (this.unrevealed >= this.moves.length)
        {
            throw new Error("Moveset is already full");
        }

        const move = this.moves[this.unrevealed];
        if (id.startsWith("hiddenpower") && id.length > "hiddenpower".length)
        {
            // set hidden power type
            // format: hiddenpower<type><base power if gen2-5>
            this.hpType.set(id.substr("hiddenpower".length).replace(/\d+/, ""));
            id = "hiddenpower";
        }
        move.id = id;
        return this.unrevealed++;
    }

    /** Gets the size of the return value of `toArray()`. */
    public static getArraySize(): number
    {
        return /*hpType*/Object.keys(possibleHPTypes).length +
            /*moves*/Move.getArraySize() * Moveset.maxSize;
    }

    // istanbul ignore next: unstable, hard to test
    /** Formats moveset info into an array of numbers. */
    public toArray(): number[]
    {
        const result =
        [
            ...this.hpType.toArray(),
            ...this.moves.map(m => m.toArray()).reduce((a, b) => a.concat(b))
        ];
        return result;
    }

    // istanbul ignore next: only used for logging
    /** Encodes all moveset data into a string. */
    public toString(): string
    {
        return this.moves
            .map((m, i) =>
                i < this.unrevealed ? this.stringifyMove(m) : "<unrevealed>")
            .join(", ");
    }

    // istanbul ignore next: only used for logging
    /** Stringifies a Move, inserting hidden power type if needed. */
    private stringifyMove(move: Move): string
    {
        if (move.id !== "hiddenpower") return move.toString();

        const hpStr = this.hpType.definiteValue ?
            this.hpType.definiteValue.name
            : `possibly ${this.hpType.toString()}`;
        return move.toString(hpStr);
    }
}
