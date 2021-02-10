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
 */
export function moveIsType(move: dexutil.MoveData, user: Pokemon,
    types: ReadonlySet<dexutil.Type>): SubReason
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

            let cancel = false;
            switch (move.modifyType)
            {
                case "hpType":
                    // TODO: call then cb sooner on partial narrow
                    hpType.then(t =>
                    {
                        if (cancel) return;
                        cb(types.has(t));
                    });
                    // TODO: returned callback should actually de-register cb
                    return () => cancel = true;
                case "plateType":
                    item.then((_, i) =>
                    {
                        if (cancel) return;
                        cb(types.has(i.plateType ?? move.type));
                    });
                    return () => cancel = true;
                default:
                    // istanbul ignore next: should never happen
                    throw new Error(`Unsupported modifyType string ` +
                        `'${move.modifyType}'`);
            }
        }
    };
}
