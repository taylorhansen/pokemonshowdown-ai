/** @file SubReason helpers related to moves. */
import {inference} from "../../../../parser";
import * as dex from "../../dex";
import {Pokemon, ReadonlyPokemon} from "../../state/Pokemon";
import {subsetOrIndependent} from "./subsets";

// TODO: Account for other move-type-changing effects, e.g. normalize ability.
// TODO(gen6): Also account for typechart-modifying moves, e.g. freezedry.

/**
 * Creates a Reason that asserts that the pokemon isn't the same type as the
 * move being used against it. Inference applies to the move/user.
 *
 * @param mon Pokemon to track.
 * @param hitBy Move+user that the pokemon is being hit by.
 */
export function diffType(
    mon: ReadonlyPokemon,
    hitBy: dex.MoveAndUser,
): inference.logic.Reason {
    return isntType(hitBy.move, hitBy.user, new Set(mon.types));
}

/**
 * Creates a Reason that asserts that the move has a certain effectiveness.
 *
 * @param move Move to track.
 * @param user Move user to track.
 * @param target Target pokemon.
 * @param effectiveness Expected move effectiveness vs the target.
 */
export function isEffective(
    move: dex.Move,
    user: Pokemon,
    target: ReadonlyPokemon,
    effectiveness: dex.Effectiveness,
): inference.logic.Reason {
    return isType(
        move,
        user,
        dex.getAttackerTypes(target.types, effectiveness),
    );
}

/**
 * Creates a Reason that asserts that the move being used by the given pokemon
 * is of one of the specified type(s).
 *
 * @param move Move to track.
 * @param user Move user to track.
 * @param types Set of possible move types. Will be owned by the returned
 * Reason.
 */
export function isType(
    move: dex.Move,
    user: Pokemon,
    types: Set<dex.Type>,
): inference.logic.Reason {
    return new MoveIsType(move, user, types, false /*negative*/);
}

/**
 * Creates a Reason that asserts that the move being used by the given pokemon
 * is not of one of the specified type(s).
 *
 * @param move Move to track.
 * @param user Move user to track.
 * @param types Set of possible move types. Will be owned by the returned
 * Reason.
 */
export function isntType(
    move: dex.Move,
    user: Pokemon,
    types: Set<dex.Type>,
): inference.logic.Reason {
    return new MoveIsType(move, user, types, true /*negative*/);
}

class MoveIsType extends inference.logic.Reason {
    /**
     * Hidden Power type and item snapshots for making inferences in retrospect.
     */
    private readonly partialUser: dex.MoveUserSnapshot;

    public constructor(
        private readonly move: dex.Move,
        user: Pokemon,
        private readonly types: Set<dex.Type>,
        private readonly negative: boolean,
    ) {
        super();
        this.partialUser = {hpType: user.hpType, item: user.item};
    }

    public override canHold(): boolean | null {
        // If all of the move's possible types are contained by our given types,
        // then the assertion holds.
        return subsetOrIndependent(
            this.types,
            this.move.getPossibleTypes(this.partialUser),
            this.negative,
        );
    }

    public override assert(): void {
        this.move.assertTypes(this.types, this.partialUser, this.negative);
    }

    public override reject(): void {
        this.move.assertTypes(this.types, this.partialUser, !this.negative);
    }

    protected override delayImpl(
        cb: inference.logic.DelayCallback,
    ): inference.logic.CancelCallback {
        return this.move.onUpdateTypes(
            this.types,
            this.partialUser,
            this.negative ? held => cb(!held) : cb,
        );
    }

    public override toString(indentInner = 1, indentOuter = 0): string {
        const inner = " ".repeat(indentInner * 4);
        const outer = " ".repeat(indentOuter * 4);
        return `\
${outer}MoveIsType(
${outer}${inner}Move(${this.move.data.name}),
${outer}${inner}user = (
${outer}${inner}${inner}hpType = [${this.partialUser.hpType.toString()}],
${outer}${inner}${inner}item = [${this.partialUser.item.toString()}],
${outer}${inner}),
${outer}${inner}types = [${[...this.types].join(", ")}],
${outer}${inner}negative = ${this.negative},
${outer})`;
    }
}
