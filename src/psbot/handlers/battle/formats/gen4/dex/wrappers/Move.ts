import { SideID } from "@pkmn/types";
import { Pokemon, ReadonlyPokemon } from "../../state/Pokemon";
import { ReadonlyPossibilityClass } from "../../state/PossibilityClass";
import * as dexutil from "../dex-util";

/** Limited form of the {@link ReadonlyPokemon} interface. */
export type ReadonlyMoveUserSnapshot = Pick<ReadonlyPokemon, "hpType" | "item">;

/** Limited form of the {@link Pokemon} interface. */
export type MoveUserSnapshot = Readonly<Pick<Pokemon, "hpType" | "item">>;

/** Pairs a {@link Move} with its {@link SideID user-ref}. */
export interface MoveAndUserRef
{
    /** Move object. */
    readonly move: Move;
    /** Pokemon reference to the move's user. */
    readonly userRef: SideID;
}

/** Readonly form of {@link MoveAndUser}. */
export interface ReadonlyMoveAndUser
{
    /** Move object. */
    readonly move: Move;
    /** Move user. */
    readonly user: ReadonlyPokemon;
}

/** Pairs a {@link Move} with its {@link Pokemon user}. */
export interface MoveAndUser extends ReadonlyMoveAndUser
{
    /** @override */
    readonly user: Pokemon;
}

/** Encapsulates move properties. */
export class Move
{
    //#region Properties interpreted from MoveData.

    /** Whether this move is affected by type effectiveness multipliers. */
    public get canBeEffective(): boolean
    {
        return this.data.category !== "status" && !this.data.damage;
    }

    /** Whether this move deals damage based on base power. */
    public get dealsBpDamage(): boolean
    {
        return this.data.category !== "status" && !this.data.damage;
    }

    //#endregion

    // TODO: Eventually make #data inaccessible apart from internal dex.
    /**
     * Creates a Move data wrapper.
     *
     * @param data Move data from dex.
     */
    public constructor(public readonly data: dexutil.MoveData) {}

    //#region Interpreted properties that need extra info.

    /**
     * Gets the effective target of the move.
     *
     * @param user User of the move (To handle ghost-type Curse).
     */
    public getTarget(user: ReadonlyPokemon): dexutil.MoveTarget
    {
        // TODO(gen6): nonGhostTarget interactions with protean ability.
        return this.data.nonGhostTarget && !user.types.includes("ghost") ?
            this.data.nonGhostTarget : this.data.target;
    }

    // TODO: Encapsulate type-related methods into a PossibilityClass-like api.
    /** Gets all the possible effective types of a move based on its user. */
    public getPossibleTypes(user: ReadonlyMoveUserSnapshot): Set<dexutil.Type>
    {
        // TODO: Also include naturalgift and others.
        switch (this.data.modifyType)
        {
            case "hpType": return new Set(user.hpType.possibleValues);
            case "plateType":
            {
                // TODO: Embargo negates plate.
                const result = new Set<dexutil.Type>();
                for (const n of user.item.possibleValues)
                {
                    result.add(user.item.map[n].plateType ?? this.data.type);
                }
                return result;
            }
            case "???": return new Set(["???"]);
            default: return new Set([this.data.type]);
        }
    }

    /**
     * Gets the move's effective type based on its user if the user's currently
     * revealed traits guarantee it, or `null` if not enough information has
     * been revealed.
     */
    public getDefiniteType(user: ReadonlyMoveUserSnapshot): dexutil.Type | null;
    /**
     * Gets the move's effective type based on its user if the user's currently
     * revealed traits guarantee it, or `null` if not enough information has
     * been revealed.
     *
     * @param hpType HpType of the user.
     * @param item User's item.
     */
    public getDefiniteType(hpType: ReadonlyPossibilityClass<dexutil.HpType>,
        item: ReadonlyPossibilityClass<string, dexutil.ItemData>):
        dexutil.Type | null;
    public getDefiniteType(
        userOrHpType:
            ReadonlyMoveUserSnapshot | ReadonlyPossibilityClass<dexutil.HpType>,
        item?: ReadonlyPossibilityClass<string, dexutil.ItemData>):
        dexutil.Type | null
    {
        let hpType: ReadonlyPossibilityClass<dexutil.HpType>;
        if (item)
        {
            hpType = userOrHpType as ReadonlyPossibilityClass<dexutil.HpType>;
        }
        else ({hpType, item} = userOrHpType as ReadonlyPokemon);

        switch (this.data.modifyType)
        {
            // TODO: Also include naturalgift and others.
            case "hpType": return hpType.definiteValue;
            case "plateType":
                // TODO: Include item-blocking effects.
                if (!item.definiteValue) return null;
                return item.map[item.definiteValue].plateType ?? this.data.type;
            case "???": return "???";
            default: return this.data.type;
        }
    }

    /**
     * Gets the main (guaranteed) boost effects of this move.
     *
     * @param tgt Target of the boost effect.
     * @param userTypes User's types, in order to handle Curse effect.
     * @returns A table of boost values which are guaranteed to apply to the
     * `tgt` when the move is used.
     */
    public getBoostEffects(tgt: dexutil.MoveEffectTarget,
        userTypes: readonly dexutil.Type[]):
        {boosts: Partial<dexutil.BoostTable>, set?: true}
    {
        if (!this.data.effects?.boost) return {boosts: {}};
        if (this.data.effects.boost.chance) return {boosts: {}};
        if (this.data.effects.boost.noGhost && userTypes.includes("ghost"))
        {
            return {boosts: {}};
        }
        return {
            boosts: this.data.effects.boost[tgt] ?? {},
            ...this.data.effects.boost.set && {set: true}
        };
    }

    /**
     * Gets the main guaranteed status effects of this move.
     *
     * @param tgt Target of the status effect
     * @param userTypes User's types, in order to handle Curse effect.
     * @returns An array of statuses, one of which will afflict the `tgt` when
     * the move is used.
     */
    public getMainStatusEffects(tgt: dexutil.MoveEffectTarget,
        userTypes: readonly dexutil.Type[]): readonly dexutil.StatusType[]
    {
        if (this.data.category !== "status") return [];
        if (!this.data.effects?.status) return [];
        if (this.data.effects.status.ghost && !userTypes.includes("ghost"))
        {
            return [];
        }
        if (this.data.effects.status.chance) return [];
        return this.data.effects.status?.[tgt] ?? [];
    }

    /**
     * Gets all guaranteed status effects of this move.
     *
     * @param tgt Target of the status effect
     * @param userTypes User's types, in order to handle Curse effect.
     * @returns An array of statuses, one of which will afflict the `tgt` when
     * the move is used.
     */
    public getGuaranteedStatusEffects(tgt: dexutil.MoveEffectTarget,
        userTypes: readonly dexutil.Type[]): readonly dexutil.StatusType[]
    {
        if (!this.data.effects?.status) return [];
        if (this.data.effects.status.ghost && !userTypes.includes("ghost"))
        {
            return [];
        }
        if ((this.data.effects.status.chance ?? 100) < 100) return [];
        return this.data.effects.status?.[tgt] ?? [];
    }

    //#endregion

    //#region Inference helper methods.

    /**
     * Makes inferences to support the assertion that, if this Move was used by
     * the given Pokemon, the Move would be of the given type.
     *
     * @param type Expected move type
     * @param user User of the move.
     */
    public assertType(type: dexutil.Type, user: MoveUserSnapshot): void
    {
        // Assert move type if known.
        const moveType = this.getDefiniteType(user);
        if (moveType)
        {
            if (type !== moveType)
            {
                throw new Error("Move type assertion failed: " +
                    `Expected type-change to '${moveType}' but got '${type}'`);
            }
            return;
        }

        // If move type is unknown, reverse the assertion into an inference.
        switch (this.data.modifyType)
        {
            // Asserted type is the user's hiddenpower type.
            case "hpType":
                user.hpType.narrow(type);
                break;
            // Asserted type is the type of plate the user is holding.
            case "plateType":
                // TODO: Embargo negates plate.
                user.item.narrow((_, i) =>
                        type === (i.plateType ?? this.data.type));
                break;
            default:
        }
    }

    // TODO: Separate method to replace negative param?
    /**
     * Makes inferences to support the assertion that, if this Move was used by
     * the given Pokemon, the Move would be of one of the given types, or the
     * opposite if `negative` is true.
     *
     * @param types Expected possible move types.
     * @param user Move user.
     * @param negative Whether to flip the assertion.
     */
    public assertTypes(types: ReadonlySet<dexutil.Type>, user: MoveUserSnapshot,
        negative?: boolean): void
    {
        const method = negative ? "remove" : "narrow";
        let defaultType = this.data.type;
        switch (this.data.modifyType)
        {
            case "hpType":
                user.hpType[method](types);
                break;
            case "plateType":
                user.item[method]((_, i) =>
                    types.has(i.plateType ?? this.data.type));
                break;
            case "???":
                defaultType = "???";
                // Fallthrough.
            default:
                if (!!negative === types.has(defaultType))
                {
                    throw new Error(`Move of type '${defaultType}' cannot be ` +
                        `asserted to${negative ? " not" : ""} be of type ` +
                        `[${[...types].join(", ")}]`);
                }
        }
    }

    /**
     * Adds a callback to wait until it can be confirmed whether, if this Move
     * was used by the given Pokemon, that it would be of one of the given
     * types.
     *
     * @param types Expected possible move types.
     * @param user Move user.
     * @param cb Callback to wait. Called with `held=true` if the assertion
     * holds, or `held=false` if it doesn't.
     * @returns A callback to deregister the given callback.
     */
    public onUpdateTypes(types: Set<dexutil.Type>, user: MoveUserSnapshot,
        cb: (held: boolean) => void): () => void
    {
        // Move type already known.
        const moveType = this.getDefiniteType(user);
        if (moveType)
        {
            cb(types.has(moveType) /*held*/);
            return () => {};
        }

        switch (this.data.modifyType)
        {
            case "hpType":
                // Types must be shared by hpType.
                return user.hpType.onUpdate(types, cb);
            case "plateType":
                // Item must cause the move to become one of the types.
                // Optimization: Keep subsets small since only a couple items
                // have a plateType.
                if (types.has(this.data.type))
                {
                    // Kept=false iff the user has a plate item that isn't of
                    // the possible types.
                    // TODO: Replace predicate with set of plate items.
                    return user.item.onUpdate(
                        (_, i) => !!i.plateType && !types.has(i.plateType),
                        kept => cb(!kept));
                }
                // Kept=true iff the user has a plate item that is of the
                // possible types (equivalent to above case).
                return user.item.onUpdate(
                    (_, i) => !!i.plateType && types.has(i.plateType),
                    cb);
            case "???":
                // Should've been handled by `#getDefiniteType()`.
                // Fallthrough.
            default:
                // istanbul ignore next: Should never happen.
                throw new Error(`Unsupported modifyType string ` +
                    `'${this.data.modifyType}'`);
        }
    }

    //#endregion
}
