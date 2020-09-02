import * as dex from "../dex/dex";
import * as dexutil from "../dex/dex-util";
import { MoveData } from "../state/Pokemon";
import { Side } from "../state/Side";

/**
 * Defines the type maps for each Event. Key must match the Event's `#type`
 * field.
 */
interface EventMap
{
    activateAbility: ActivateAbility;
    activateFieldEffect: ActivateFieldEffect;
    activateStatusEffect: ActivateStatusEffect;
    activateTeamEffect: ActivateTeamEffect;
    boost: Boost;
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
    futureMove: FutureMove;
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
    noTarget: NoTarget;
    postTurn: PostTurn;
    prepareMove: PrepareMove;
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

/** The types of Events that can exist. */
export type Type = keyof EventMap;

/** Maps Type to an Event interface type. */
export type Event<T extends Type> = EventMap[T];

/** Stands for any type of Event. */
export type Any = Event<Type>;

/** Base class for all Events. */
interface EventBase<T extends Type>
{
    /** The type of Event this is. */
    readonly type: T;
}

/** Reveals, changes, and/or activates a pokemon's ability. */
export interface ActivateAbility extends EventBase<"activateAbility">
{
    /** Pokemon being associated with an ability. */
    readonly monRef: Side;
    /** Ability being activated or revealed. */
    readonly ability: string;
}

/** Activates a field-wide effect. */
export interface ActivateFieldEffect extends EventBase<"activateFieldEffect">
{
    /** Name of the effect. */
    readonly effect: dexutil.FieldEffect;
    /** Whether to start (`true`) or end (`false`) the effect. */
    readonly start: boolean;
}

/** Starts, sets, or ends a trivial status effect. */
export interface ActivateStatusEffect extends EventBase<"activateStatusEffect">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Name of the effect. */
    readonly effect: dexutil.StatusEffect;
    /**
     * Whether to start (`true`) or end (`false`) the status.
     *
     * If `#status` is a future move, then `#monRef` refers to the user if
     * `#start=true` as the move is being prepared, otherwise it refers to the
     * target as the move is being released.
     */
    readonly start: boolean;
}

/** Activates a team-wide effect. */
export interface ActivateTeamEffect extends EventBase<"activateTeamEffect">
{
    /** Team reference. */
    readonly teamRef: Side;
    /** Name of the status. */
    readonly effect: dexutil.TeamEffect;
    /** Whether to start (`true`) or end (`false`) the effect. */
    readonly start: boolean;
}

/** Updates a stat boost. */
export interface Boost extends EventBase<"boost">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Stat to boost. */
    readonly stat: dexutil.BoostName;
    /** Number to add to the stat boost counter. */
    readonly amount: number;
    /**
     * Whether to set the stat boost counter rather than add to it. Default
     * false.
     */
    readonly set?: true;
}

/** Temporarily changes the pokemon's types. Also resets third type. */
export interface ChangeType extends EventBase<"changeType">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Types to set. */
    readonly newTypes: readonly [dexutil.Type, dexutil.Type];
}

/** Clears all temporary stat boosts from the field. */
export interface ClearAllBoosts extends EventBase<"clearAllBoosts"> {}

/** Clears temporary negative stat boosts from the pokemon. */
export interface ClearNegativeBoosts extends EventBase<"clearNegativeBoosts">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Clears temporary positive stat boosts from the pokemon. */
export interface ClearPositiveBoosts extends EventBase<"clearPositiveBoosts">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Clears self-switch flags for both teams. */
export interface ClearSelfSwitch extends EventBase<"clearSelfSwitch"> {}

/** Copies temporary stat boosts from one pokemon to the other. */
export interface CopyBoosts extends EventBase<"copyBoosts">
{
    /** Pokemon to get the boosts from. */
    readonly from: Side;
    /** Pokemon to copy the boosts to. */
    readonly to: Side;
}

/** Explicitly updates effect counters. */
export interface CountStatusEffect extends EventBase<"countStatusEffect">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Type of effect. */
    readonly effect: dexutil.CountableStatusEffect;
    /** Number to set the effect counter to. */
    readonly amount: number;
}

/** Indicates a critical hit of a move on the pokemon. */
export interface Crit extends EventBase<"crit">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Cures all pokemon of a team of any major status conditions. */
export interface CureTeam extends EventBase<"cureTeam">
{
    /** Team reference. */
    readonly teamRef: Side;
}

/** Temporarily disables the pokemon's move. */
export interface DisableMove extends EventBase<"disableMove">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move being disabled. */
    readonly move: string;
}

/** Indicates that the pokemon failed at doing something. */
export interface Fail extends EventBase<"fail">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon fainted. */
export interface Faint extends EventBase<"faint">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon's locked move ended due to fatigue. */
export interface Fatigue extends EventBase<"fatigue">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon's stalling move was broken by Feint. */
export interface Feint extends EventBase<"feint">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon changed its form. */
export interface FormChange extends EventBase<"formChange">, DriverSwitchOptions
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Whether this form change is permanent. */
    readonly perm: boolean;
}

/** Prepares or releases a future move. */
export interface FutureMove extends EventBase<"futureMove">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move being prepared. */
    readonly move: dex.FutureMove;
    /** Whether the move is being prepared (true) or released (false). */
    readonly start: boolean;
}

/** Indicates that the game has ended. */
export interface GameOver extends EventBase<"gameOver">
{
    /** The side that won. Leave blank if tie. */
    readonly winner?: Side;
}

/** Indicates that the pokemon was hit by a move multiple times. */
export interface HitCount extends EventBase<"hitCount">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Number of hits. */
    readonly count: number;
}

/** Indicates that the pokemon was immune to an effect. */
export interface Immune extends EventBase<"immune">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon spent its turn being inactive. */
export interface Inactive extends EventBase<"inactive">
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
export interface InitOtherTeamSize extends EventBase<"initOtherTeamSize">
{
    /** Size to set the opponent's team to. */
    readonly size: number;
}

/** Initializes the client's team. */
export interface InitTeam extends EventBase<"initTeam">
{
    readonly team: readonly DriverInitPokemon[];
}

/** Data for initializing a pokemon. */
export interface DriverInitPokemon extends DriverSwitchOptions
{
    /** Pokemon's stats. HP is provided in a separate field. */
    readonly stats: Readonly<Record<dexutil.StatExceptHP, number>>;
    /** List of move id names. */
    readonly moves: readonly string[];
    /** Base ability id name. */
    readonly baseAbility: string;
    /** Item id name. */
    readonly item: string;
    /** Hidden Power type if applicable. */
    readonly hpType?: dexutil.Type;
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
export interface InvertBoosts extends EventBase<"invertBoosts">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon is taking aim due to Lock-On. */
export interface LockOn extends EventBase<"lockOn">
{
    /** User of Lock-On. */
    readonly monRef: Side;
    /** Target of the Lock-On move. */
    readonly target: Side;
}

/** Indicates that the pokemon is Mimicking a move. */
export interface Mimic extends EventBase<"mimic">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move being Mimicked. */
    readonly move: string;
}

/** Indicates that the pokemon avoided a move. */
export interface Miss extends EventBase<"miss">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Reveals a move and modifies its PP value. */
export interface ModifyPP extends EventBase<"modifyPP">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move name. */
    readonly move: string;
    /** Amount of PP to add, or `deplete` to fully deplete the move. */
    readonly amount: number | "deplete";
}

/** Indicates that the pokemon must recharge from the previous action. */
export interface MustRecharge extends EventBase<"mustRecharge">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon's move couldn't target anything. */
export interface NoTarget extends EventBase<"noTarget">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the turn is about to end. */
export interface PostTurn extends EventBase<"postTurn"> {}

/** Prepares a two-turn move. */
export interface PrepareMove extends EventBase<"prepareMove">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move being prepared. */
    readonly move: dex.TwoTurnMove;
}

/** Indicates that the turn is about to begin. */
export interface PreTurn extends EventBase<"preTurn"> {}

/** Re-enables the pokemon's disabled moves. */
export interface ReenableMoves extends EventBase<"reenableMoves">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that the pokemon is being trapped by an unknown ability. */
export interface RejectSwitchTrapped extends
    EventBase<"rejectSwitchTrapped">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Reference to the pokemon with the trapping ability. */
    readonly by: Side;
}

/** Indicates that an item was just removed from the pokemon. */
export interface RemoveItem extends EventBase<"removeItem">
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
export interface ResetWeather extends EventBase<"resetWeather"> {}

/** Indicates that the pokemon was hit by a move it resists. */
export interface Resisted extends EventBase<"resisted">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Restores the PP of each of the pokemon's moves. */
export interface RestoreMoves extends EventBase<"restoreMoves">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Reveals that the pokemon is now holding an item. */
export interface RevealItem extends EventBase<"revealItem">
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
export interface RevealMove extends EventBase<"revealMove">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move name. */
    readonly move: string;
}

/** Sets the pokemon's temporary third type. */
export interface SetThirdType extends EventBase<"setThirdType">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Type to set. */
    readonly thirdType: dexutil.Type;
}

/** Indicates that the pokemon is Sketching a move. */
export interface Sketch extends EventBase<"sketch">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Move being Sketched. */
    readonly move: string;
}

/** Indicates that the pokemon successfully stalled an attack. */
export interface Stall extends EventBase<"stall">
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
export interface SuperEffective extends EventBase<"superEffective">
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Swaps the given temporary stat boosts of two pokemon. */
export interface SwapBoosts extends EventBase<"swapBoosts">
{
    /** First pokemon reference. */
    readonly monRef1: Side;
    /** Second pokemon reference. */
    readonly monRef2: Side;
    /** Stats to swap. */
    readonly stats: readonly dexutil.BoostName[];
}

/** Indicates that a pokemon has switched in. */
export interface SwitchIn extends EventBase<"switchIn">,
    DriverSwitchOptions
{
    /** Pokemon reference. */
    readonly monRef: Side;
}

/** Indicates that a pokemon took damage (or was healed) and its HP changed. */
export interface TakeDamage extends EventBase<"takeDamage">
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
export interface Transform extends EventBase<"transform">
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
export interface TransformPost extends EventBase<"transformPost">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Transformed pokemon's moves with pp values. */
    readonly moves: readonly MoveData[];
}

/** Indicates that the pokemon is being trapped by another. */
export interface Trap extends EventBase<"trap">
{
    /** Pokemon being trapped. */
    readonly target: Side;
    /** Pokemon that is trapping. */
    readonly by: Side;
}

/** Explicitly indicates that a field effect is still going. */
export interface UpdateFieldEffect extends EventBase<"updateFieldEffect">
{
    /** Type of effect to update. */
    readonly effect: dexutil.UpdatableFieldEffect;
}

/**
 * Indicates that a status effect is still going. Usually this is implied at the
 * end of the turn unless the game usually sends an explicit message, which this
 * Event covers.
 */
export interface UpdateStatusEffect extends
    EventBase<"updateStatusEffect">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Type of effect to update. */
    readonly effect: dexutil.UpdatableStatusEffect;
}

/** Indicates that the pokemon is attempting to use a move. */
export interface UseMove extends EventBase<"useMove">
{
    /** Pokemon reference. */
    readonly monRef: Side;
    /** Name of the move. */
    readonly move: string;
}
