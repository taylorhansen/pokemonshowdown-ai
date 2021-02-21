import * as dexutil from "../../dex/dex-util";
import { Pokemon } from "../../state/Pokemon";
import { SubReason } from "./EventInference";

/**
 * Compares the given move with its expected type, making inferences on the user
 * if the move type varies with the user's traits.
 * @param move Given move.
 * @param type Expected move type.
 * @param user User of the move.
 */
export function assertMoveType(move: dexutil.MoveData, type: dexutil.Type,
    user: Pokemon): void
{
    // assert move type if known
    const moveType = dexutil.getDefiniteMoveType(move, user);
    if (moveType)
    {
        if (type !== moveType)
        {
            throw new Error("Move type assertion failed: " +
                `Expected type-change to '${moveType}' but got '${type}'`);
        }
        return;
    }

    // if move type is unknown, reverse the assertion into an inference
    switch (move.modifyType)
    {
        // asserted type is the user's hiddenpower type
        case "hpType": user.hpType.narrow(type); break;
        // asserted type is the type of plate the user is holding
        case "plateType":
            user.item.narrow((_, i) => type === (i.plateType ?? move.type));
            break;
    }
}

// TODO: generalize for negative case
/**
 * Creates a SubReason that asserts that the move being used by the given
 * pokemon is of one of the specified type(s).
 * @param move Move to track.
 * @pram user Move user to track.
 * @param types Set of possible move types. Will be owned by this function.
 */
export function moveIsType(move: dexutil.MoveData, user: Pokemon,
    types: Set<dexutil.Type>): SubReason
{
    const moveType = dexutil.getDefiniteMoveType(move, user);
    const {hpType, item} = user; // snapshot in case user changes
    return {
        assert()
        {
            switch (move.modifyType)
            {
                case "hpType": hpType.narrow(types); break;
                case "plateType":
                    item.narrow((_, i) => types.has(i.plateType ?? move.type));
                    break;
                default:
                    if (!types.has(move.type))
                    {
                        throw new Error(`Move of type '${move.type}' cannot ` +
                            "be asserted to be of type " +
                            `[${[...types].join(", ")}]`);
                    }
            }
        },
        reject()
        {
            switch (move.modifyType)
            {
                case "hpType": hpType.remove(types); break;
                case "plateType":
                    item.remove((_, i) => types.has(i.plateType ?? move.type));
                    break;
                default:
                    if (types.has(move.type))
                    {
                        throw new Error(`Move of type '${move.type}' cannot ` +
                            "be asserted to not be of type " +
                            `[${[...types].join(", ")}]`);
                    }
            }
        },
        delay(cb)
        {
            // early return: move type already known
            if (moveType)
            {
                cb(/*held*/ types.has(moveType));
                return () => {};
            }

            switch (move.modifyType)
            {
                case "hpType":
                    // types must be shared by hpType
                    return hpType.onUpdate(types, cb);
                case "plateType":
                    // item must cause the move to become one of the types
                    // optimization: keep subsets small
                    if (types.has(move.type))
                    {
                        // kept=false only if the user has a plate item that
                        //  isn't of the possible types
                        // TODO: replace predicate with set of plate items
                        return item.onUpdate(
                            (_, i) => !!i.plateType && !types.has(i.plateType),
                            kept => cb(!kept));
                    }
                    // kept=true only if the user has a plate item that is of
                    //  the possible types
                    return item.onUpdate(
                        (_, i) => !!i.plateType && types.has(i.plateType),
                        cb);
                default:
                    // istanbul ignore next: should never happen
                    throw new Error(`Unsupported modifyType string ` +
                        `'${move.modifyType}'`);
            }
        }
    };
}
