import * as effects from "./effects";

/** Map type for all effect types. */
export interface BaseEffectMap
{
    boost: effects.Boost;
    call: effects.Call;
    chance: effects.Chance<any>;
    countableStatus: effects.CountableStatus;
    delay: effects.Delay;
    drain: effects.Drain;
    field: effects.Field;
    flinch: effects.Flinch;
    implicitStatus: effects.ImplicitStatus;
    implicitTeam: effects.ImplicitTeam;
    percentDamage: effects.PercentDamage;
    recoil: effects.Recoil;
    selfSwitch: effects.SelfSwitch;
    status: effects.Status;
    swapBoost: effects.SwapBoost;
    team: effects.Team;
    typeChange: effects.TypeChange;
    unique: effects.Unique;
}

/** Any type of effect. */
export type EffectType = keyof BaseEffectMap;

/** Template for creating constrained effect type maps. */
export type EffectMap<T extends EffectType> = {[U in T]: BaseEffectMap[U]}

/** Base interface for effects. */
export type Effect<TType extends EffectType, TValue = void> =
    TypeEffect<TType> & (TValue extends void ? {} : ValueEffect<TValue>);

/** Effect interface with just the type field. */
interface TypeEffect<TType extends EffectType>
{
    /** Type of effect. */
    readonly type: TType;
}

/** Effect interface with value field. */
interface ValueEffect<TValue>
{
    /** Main effect value. */
    readonly value: TValue;
}
