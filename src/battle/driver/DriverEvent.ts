import { FutureMove, TwoTurnMove } from "../dex/dex";
import { BoostName, MajorStatus, StatExceptHP, Type, WeatherType } from
    "../dex/dex-util";
import { MoveData } from "../state/Pokemon";
import { Side } from "../state/Side";

/**
 * Defines the type maps for each DriverEvent. Key must match the DriverEvent's
 * `#type` field.
 */
interface DriverEventMap
{
    activateAbility: ActivateAbility;
    activateFieldEffect: ActivateFieldEffect;
    activateStatusEffect: ActivateStatusEffect;
    activateTeamEffect: ActivateTeamEffect;
    changeType: ChangeType;
    clearAllBoosts: ClearAllBoosts;
    clearNegativeBoosts: ClearNegativeBoosts;
    clearPositiveBoosts: ClearPositiveBoosts;
    clearSelfSwitch: ClearSelfSwitch;
    copyBoosts: CopyBoosts;
    countStatusEffect: CountStatusEffect;
    crit: Crit;
    cureTeam: CureTeam;
    disableMove: DisableMove;
    fail: Fail;
    faint: Faint;
    fatigue: Fatigue;
    feint: Feint;
    formChange: FormChange;
    gameOver: GameOver;
    hitCount: HitCount;
    immune: Immune;
    inactive: Inactive;
    initOtherTeamSize: InitOtherTeamSize;
    initTeam: InitTeam;
    invertBoosts: InvertBoosts;
    lockOn: LockOn;
    mimic: Mimic;
    miss: Miss;
    modifyPP: ModifyPP;
    mustRecharge: MustRecharge;
    postTurn: PostTurn;
    preTurn: PreTurn;
    reenableMoves: ReenableMoves;
    rejectSwitchTrapped: RejectSwitchTrapped;
    removeItem: RemoveItem;
    resetWeather: ResetWeather;
    resisted: Resisted;
    restoreMoves: RestoreMoves;
    revealItem: RevealItem;
    revealMove: RevealMove;
    setThirdType: SetThirdType;
    sketch: Sketch;
    stall: Stall;
    superEffective: SuperEffective;
    swapBoosts: SwapBoosts;
    switchIn: SwitchIn;
    takeDamage: TakeDamage;
    transform: Transform;
    transformPost: TransformPost;
    trap: Trap;
    updateFieldEffect: UpdateFieldEffect;
    updateStatusEffect: UpdateStatusEffect;
    useMove: UseMove;
}

/** The types of DriverEvents that can exist. */
export type DriverEventType = keyof DriverEventMap;

/** Maps DriverEventType to a DriverEvent interface type. */
export type DriverEvent<T extends DriverEventType> = DriverEventMap[T];

/** Stands for any type of DriverEvent. */
export type AnyDriverEvent = DriverEvent<DriverEventType>;

/** Base class for all DriverEvents. */
interface DriverEventBase<T extends DriverEventType>
{
    /** The type of DriverEvent this is. */
    readonly type: T;
}

/** Reveals, changes, and/or activates a pokemon's ability. */
export interface ActivateAbility extends DriverEventBase<"activateAbility">
{
    /** Pokemon being associated with an ability. */
    readonly monRef: Side;
    /** Ability being activated or revealed. */
    readonly ability: string;
}

/** Activates a field-wide effect. */
export interface ActivateFieldEffect extends
    DriverEventBase<"activateFieldEffect">
{
    /** Name of the effect. */
    readonly effect: FieldEffectType;
    /** Whether to start (`true`) or end (`false`) the effect. */
    readonly start: boolean;
}

/** Typing for `ActivateFieldEffect#effect`. */
export type FieldEffectType = WeatherType | "gravity" | "trickRoom";

/** Starts, sets, or ends a trivial status effect. */
export interface ActivateStatusEffect extends
    DriverEventBase<"activateStatusEffect">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Name of the effect. */
    readonly effect: StatusEffectType;
    /**
     * Whether to start (`true`) or end (`false`) the status.
     *
     * If `#status` is a future move, then `#monRef` refers to the user if
     * `#start=true` as the move is being prepared, otherwise it refers to the
     * target as the move is being released.
     */
    readonly start: boolean;
}

/** Typing for `ActivateStatusEffect#status`. */
export type StatusEffectType = UpdatableStatusEffectType | MajorStatus |
    FutureMove | TwoTurnMove | SingleMoveEffect | SingleTurnEffect |
    "aquaRing" | "attract" | "charge" | "curse" | "embargo" | "encore" |
    "focusEnergy" | "foresight" | "healBlock" | "imprison" | "ingrain" |
    "leechSeed" | "magnetRise" | "miracleEye" | "mudSport" | "nightmare" |
    "powerTrick" | "slowStart" | "substitute" | "suppressAbility" | "taunt" |
    "torment" | "waterSport" | "yawn";

/** Types of sinlge-move effects. */
export type SingleMoveEffect = "destinyBond" | "grudge" | "rage";

/** Types of sinlge-turn effects. */
export type SingleTurnEffect = "endure" | "magicCoat" | "protect" | "roost" |
    "snatch";

/** Activates a team-wide effect. */
export interface ActivateTeamEffect extends
    DriverEventBase<"activateTeamEffect">
{
    /** Team reference. */
    readonly teamRef: Side;
    /** Name of the status. */
    readonly effect: TeamEffectType;
    /** Whether to start (`true`) or end (`false`) the effect. */
    readonly start: boolean;
}

/** Typing for `ActivateTeamEffect#effect. */
export type TeamEffectType = "healingWish" | "lightScreen" | "luckyChant" |
    "lunarDance" | "mist" | "reflect" | "safeguard" | "spikes" | "stealthRock" |
    "tailwind" | "toxicSpikes";

/** Temporarily changes the pokemon's types. Also resets third type. */
export interface ChangeType extends DriverEventBase<"changeType">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Types to set. */
    readonly newTypes: readonly [Type, Type];
}

/** Clears all temporary stat boosts from the field. */
export interface ClearAllBoosts extends DriverEventBase<"clearAllBoosts"> {}

/** Clears temporary negative stat boosts from the pokemon. */
export interface ClearNegativeBoosts extends
    DriverEventBase<"clearNegativeBoosts">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Clears temporary positive stat boosts from the pokemon. */
export interface ClearPositiveBoosts extends
    DriverEventBase<"clearPositiveBoosts">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Clears self-switch flags for both teams. */
export interface ClearSelfSwitch extends DriverEventBase<"clearSelfSwitch"> {}

/** Copies temporary stat boosts from one pokemon to the other. */
export interface CopyBoosts extends DriverEventBase<"copyBoosts">
{
    /** Pokemon to get the boosts from. */
    readonly from: Side;
    /** Pokemon to copy the boosts to. */
    readonly to: Side;
}

/** Explicitly updates effect counters. */
export interface CountStatusEffect extends DriverEventBase<"countStatusEffect">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Type of effect. */
    readonly effect: CountableStatusEffectType;
    /** Number to set the effect counter to. */
    readonly amount: number;
    /**
     * Whether to add `#amount` onto the effect counter rather than overwrite
     * it. Default false.
     */
    readonly add?: boolean;
}

/** Typing for `CountStatusEffect#effect`. */
export type CountableStatusEffectType = BoostName | "perish" | "stockpile";

/** Indicates a critical hit of a move on the pokemon. */
export interface Crit extends DriverEventBase<"crit">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Cures all pokemon of a team of any major status conditions. */
export interface CureTeam extends DriverEventBase<"cureTeam">
{
    /** Team reference. */
    readonly teamRef: Side;
}

/** Temporarily disables the pokemon's move. */
export interface DisableMove extends DriverEventBase<"disableMove">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move being disabled. */
    readonly move: string;
}

/** Indicates that the pokemon failed at doing something. */
export interface Fail extends DriverEventBase<"fail">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon fainted. */
export interface Faint extends DriverEventBase<"faint">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon's locked move ended due to fatigue. */
export interface Fatigue extends DriverEventBase<"fatigue">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon's stalling move was broken by Feint. */
export interface Feint extends DriverEventBase<"feint">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon changed its form. */
export interface FormChange extends DriverEventBase<"formChange">,
    DriverSwitchOptions
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Whether this form change is permanent. */
    readonly perm: boolean;
}

/** Indicates that the game has ended. */
export interface GameOver extends DriverEventBase<"gameOver">
{
    /** The side that won. Leave blank if tie. */
    readonly winner?: Side;
}

/** Indicates that the pokemon was hit by a move multiple times. */
export interface HitCount extends DriverEventBase<"hitCount">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Number of hits. */
    readonly count: number;
}

/** Indicates that the pokemon was immune to an effect. */
export interface Immune extends DriverEventBase<"immune">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon spent its turn being inactive. */
export interface Inactive extends DriverEventBase<"inactive">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Reason that the pokemon was inactive. */
    readonly reason?: InactiveReason;
    /** The move that the pokemon was prevented from using. */
    readonly move?: string;
}

/** Typing for `Inactive#reason`. */
export type InactiveReason = "imprison" | "recharge" | "slp" | "truant";

/** Initializes the opponent's team size. */
export interface InitOtherTeamSize extends DriverEventBase<"initOtherTeamSize">
{
    /** Size to set the opponent's team to. */
    readonly size: number;
}

/** Initializes the client's team. */
export interface InitTeam extends DriverEventBase<"initTeam">
{
    readonly team: readonly DriverInitPokemon[];
}

/** Data for initializing a pokemon. */
export interface DriverInitPokemon extends DriverSwitchOptions
{
    /** Pokemon's stats. HP is provided in a separate field. */
    readonly stats: Readonly<Record<StatExceptHP, number>>;
    /** List of move id names. */
    readonly moves: readonly string[];
    /** Base ability id name. */
    readonly baseAbility: string;
    /** Item id name. */
    readonly item: string;

    /** Hidden Power type if applicable. */
    readonly hpType?: Type;
    /** Happiness value if applicable. */
    readonly happiness?: number;
}

/** Data for handling a switch-in. */
export interface DriverSwitchOptions
{
    /** Species id name. */
    readonly species: string;
    /** Level between 1 and 100. */
    readonly level: number;
    /** Pokemon's gender. Can be M, F, or null. */
    readonly gender: string | null;
    /** Pokemon's current HP. */
    readonly hp: number;
    /** Pokemon's max HP. */
    readonly hpMax: number;
}

/** Inverts all of the pokemon's temporary stat boosts. */
export interface InvertBoosts extends DriverEventBase<"invertBoosts">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon is taking aim due to Lock-On. */
export interface LockOn extends DriverEventBase<"lockOn">
{
    /** User of Lock-On. */
    readonly monRef: Side;
    /** Target of the Lock-On move. */
    readonly target: Side;
}

/** Indicates that the pokemon is Mimicking a move. */
export interface Mimic extends DriverEventBase<"mimic">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move being Mimicked. */
    readonly move: string;
}

/** Indicates that the pokemon avoided a move. */
export interface Miss extends DriverEventBase<"miss">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Reveals a move and modifies its PP value. */
export interface ModifyPP extends DriverEventBase<"modifyPP">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move name. */
    readonly move: string;
    /** Amount of PP to add, or `deplete` to fully deplete the move. */
    readonly amount: number | "deplete";
}

/** Indicates that the pokemon must recharge from the previous action. */
export interface MustRecharge extends DriverEventBase<"mustRecharge">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the turn is about to end. */
export interface PostTurn extends DriverEventBase<"postTurn"> {}

/** Indicates that the turn is about to begin. */
export interface PreTurn extends DriverEventBase<"preTurn"> {}

/** Re-enables the pokemon's disabled moves. */
export interface ReenableMoves extends DriverEventBase<"reenableMoves">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon is being trapped by an unknown ability. */
export interface RejectSwitchTrapped extends
    DriverEventBase<"rejectSwitchTrapped">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Reference to the pokemon with the trapping ability. */
    readonly by: Side;
}

/** Indicates that an item was just removed from the pokemon. */
export interface RemoveItem extends DriverEventBase<"removeItem">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /**
     * False if the item was removed or transferred. If the item was consumed
     * (i.e., it can be brought back using the Recycle move), this is set to
     * the item's name, or just true if the item's name is unknown.
     */
    readonly consumed: string | boolean;
}

/** Resets the weather back to none. */
export interface ResetWeather extends DriverEventBase<"resetWeather"> {}

/** Indicates that the pokemon was hit by a move it resists. */
export interface Resisted extends DriverEventBase<"resisted">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Restores the PP of each of the pokemon's moves. */
export interface RestoreMoves extends DriverEventBase<"restoreMoves">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Reveals that the pokemon is now holding an item. */
export interface RevealItem extends DriverEventBase<"revealItem">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Item name. */
    readonly item: string;
    /**
     * Whether the item was gained just now or being revealed. If `"recycle"`,
     * the item was recovered via the Recycle move.
     */
    readonly gained: boolean | "recycle";
}

/** Reveals that the pokemon knows a move. */
export interface RevealMove extends DriverEventBase<"revealMove">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move name. */
    readonly move: string;
}

/** Sets the pokemon's temporary third type. */
export interface SetThirdType extends DriverEventBase<"setThirdType">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Type to set. */
    readonly thirdType: Type;
}

/** Indicates that the pokemon is Sketching a move. */
export interface Sketch extends DriverEventBase<"sketch">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move being Sketched. */
    readonly move: string;
}

/** Indicates that the pokemon successfully stalled an attack. */
export interface Stall extends DriverEventBase<"stall">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /**
     * Whether Endure was in effect, meaning the hit went through but the
     * pokemon endured it.
     */
    readonly endure?: boolean;
}

/** Indicates that the pokemon was hit by a move it is weak to. */
export interface SuperEffective extends DriverEventBase<"superEffective">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Swaps the given temporary stat boosts of two pokemon. */
export interface SwapBoosts extends DriverEventBase<"swapBoosts">
{
    /** First pokemon reference. */
    readonly monRef1: Side;
    /** Second pokemon reference. */
    readonly monRef2: Side;
    /** Stats to swap. */
    readonly stats: readonly BoostName[];
}

/** Indicates that a pokemon has switched in. */
export interface SwitchIn extends DriverEventBase<"switchIn">,
    DriverSwitchOptions
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that a pokemon took damage (or was healed) and its HP changed. */
export interface TakeDamage extends DriverEventBase<"takeDamage">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** HP/max pair. */
    readonly newHP: readonly [number, number];
    /**
     * Whether the damage was due to poison or toxic. This is so the toxic
     * counter can be updated properly.
     */
    readonly tox: boolean;
}

/** Indicates that a pokemon has transformed into its target. */
export interface Transform extends DriverEventBase<"transform">
{
    /** Pokemon that is transforming. */
    readonly source: Side;
    /** Pokemon to transform into. */
    readonly target: Side;
}

/**
 * Reveals and infers more details due to Transform. The referenced pokemon
 * should already have been referenced in a recent Transform event.
 */
export interface TransformPost extends DriverEventBase<"transformPost">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Transformed pokemon's moves with pp values. */
    readonly moves: readonly MoveData[];
}

/** Indicates that the pokemon is being trapped by another. */
export interface Trap extends DriverEventBase<"trap">
{
    /** Pokemon being trapped. */
    readonly target: Side;
    /** Pokemon that is trapping. */
    readonly by: Side;
}

/** Explicitly indicates that a field effect is still going. */
export interface UpdateFieldEffect extends DriverEventBase<"updateFieldEffect">
{
    /** Type of effect to update. */
    readonly effect: UpdatableFieldEffectType;
}

/** Typing for `UpdateFieldEffect#effect`. These are also FieldEffectTypes. */
export type UpdatableFieldEffectType = WeatherType;

/**
 * Indicates that a status effect is still going. Usually this is implied at the
 * end of the turn unless the game usually sends an explicit message, which this
 * DriverEvent covers.
 */
export interface UpdateStatusEffect extends
    DriverEventBase<"updateStatusEffect">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Type of effect to update. */
    readonly effect: UpdatableStatusEffectType;
}

/** Typing for `UpdateStatusEffect#effect`. These are also StatusEffectTypes. */
export type UpdatableStatusEffectType = "confusion" | "bide" | "uproar";

/** Indicates that the pokemon is attempting to use a move. */
export interface UseMove extends DriverEventBase<"useMove">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Name of the move. */
    readonly move: string;
}
