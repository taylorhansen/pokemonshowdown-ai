import { AnyBattleEvent, BattleEvent, BattleEventType } from "./BattleEvent";
import { CallbackDispatcher } from "./CallbackDispatcher";

/**
 * Maps BattleEvent type to callback args, which correspond to:
 * * The event object.
 * * The array of the BattleEvents currently being processed.
 * * The current event's position within that array.
 */
export type BattleEventDispatchArgs =
    {[T in BattleEventType]: [BattleEvent<T>, AnyBattleEvent[], number]};

/** Manages callbacks registered for specific BattleEvents. */
export class BattleEventListener extends
    CallbackDispatcher<BattleEventDispatchArgs> {}
