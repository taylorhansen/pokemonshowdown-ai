import { Logger } from "../../../Logger";
import { BattleState } from "../../state/BattleState";
import * as events from "../BattleEvent";

// tslint:disable: no-trailing-whitespace (force newlines in doc)
/**
 * Specifies what to do after the current DriverContext handles an event.  
 * `true` - Current DriverContext will proceed to the next event.  
 * `<falsy>` - Expire the current DriverContext and let the next topmost
 * context handle the same event.  
 * `DriverContext` - Push a new context onto the stack, which will handle the
 * next event.
 */
// tslint:enable: no-trailing-whitespace
export type ContextResult = void | undefined | null | boolean | DriverContext;

/**
 * Ensures that the DriverContext implements handlers for each type of
 * BattleEvent.
 */
type BattleEventHandler =
    {[T in events.Type]: (event: events.Event<T>) => ContextResult};

/**
 * Base class for sub-Driver contexts for parsing multiple BattleEvents
 * together.
 */
export abstract class DriverContext implements BattleEventHandler
{
    /**
     * Base DriverContext constructor.
     * @param state State object to mutate while handling BattleEvents.
     * @param logger Logger object.
     * @param accept Whether to accept (true) or reject (false) all events by
     * default. Default false.
     */
    constructor(protected readonly state: BattleState,
        protected readonly logger: Logger, private readonly accept = false) {}

    /**
     * Handles a BattleEvent.
     * @returns A ContextResult string specifying what to do after handling the
     * event, or a new DriverContext object if it should be added to the
     * DriverContext chain (also works like `"stop"`).
     * @see ContextResult
     */
    public handle(event: events.Any): ContextResult
    {
        return (this[event.type] as (event: events.Any) => ContextResult)(
            event);
    }

    /**
     * Indicates that the current stream of BattleEvents has halted, awaiting a
     * decision from a user (i.e., whenever `BattleDriver#halt()` is called).
     * @virtual
     */
    public halt(): void {}

    /**
     * Cleanup actions before expiring this context.
     * @virtual
     */
    public expire(): void {}

    /**
     * Reveals, changes, and/or activates a pokemon's ability.
     * @virtual
     */
    public activateAbility(event: events.ActivateAbility): ContextResult
    { return this.accept; }

    /**
     * Activates a field-wide effect.
     * @virtual
     */
    public activateFieldEffect(event: events.ActivateFieldEffect): ContextResult
    { return this.accept; }

    /**
     * Reveals and activates a pokemon's held item.
     * @virtual
     */
    public activateItem(event: events.ActivateItem): ContextResult
    { return this.accept; }

    /**
     * Starts, sets, or ends a trivial status effect.
     * @virtual
     */
    public activateStatusEffect(event: events.ActivateStatusEffect):
        ContextResult { return this.accept; }

    /**
     * Activates a team-wide effect.
     * @virtual
     */
    public activateTeamEffect(event: events.ActivateTeamEffect): ContextResult
    { return this.accept; }

    /**
     * Indicates that an effect has been blocked by a status.
     * @virtual
     */
    public block(event: events.Block): ContextResult { return this.accept; }

    /**
     * Updates a stat boost.
     * @virtual
     */
    public boost(event: events.Boost): ContextResult { return this.accept; }

    /**
     * Temporarily changes the pokemon's types. Also resets third type.
     * @virtual
     */
    public changeType(event: events.ChangeType): ContextResult
    { return this.accept; }

    /**
     * Mentions a PS-specific clause mod taking effect.
     * @virtual
     */
    public clause(event: events.Clause): ContextResult
    { return this.accept; }

    /**
     * Clears all temporary stat boosts from the field.
     * @virtual
     */
    public clearAllBoosts(event: events.ClearAllBoosts): ContextResult
    { return this.accept; }

    /**
     * Clears temporary negative stat boosts from the pokemon.
     * @virtual
     */
    public clearNegativeBoosts(event: events.ClearNegativeBoosts): ContextResult
    { return this.accept; }

    /**
     * Clears temporary positive stat boosts from the pokemon.
     * @virtual
     */
    public clearPositiveBoosts(event: events.ClearPositiveBoosts): ContextResult
    { return this.accept; }

    /**
     * Copies temporary stat boosts from one pokemon to the other.
     * @virtual
     */
    public copyBoosts(event: events.CopyBoosts): ContextResult
    { return this.accept; }

    /**
     * Explicitly updates status counters.
     * @virtual
     */
    public countStatusEffect(event: events.CountStatusEffect): ContextResult
    { return this.accept; }

    /**
     * Indicates a critical hit of a move on a pokemon.
     * @virtual
     */
    public crit(event: events.Crit): ContextResult { return this.accept; }

    /**
     * Cures all pokemon of a team of any major status conditions.
     * @virtual
     */
    public cureTeam(event: events.CureTeam): ContextResult
    { return this.accept; }

    /**
     * Temporarily disables the pokemon's move.
     * @virtual
     */
    public disableMove(event: events.DisableMove): ContextResult
    { return this.accept; }

    /**
     * Indicates that the pokemon failed at doing something.
     * @virtual
     */
    public fail(event: events.Fail): ContextResult { return this.accept; }

    /**
     * Indicates that the pokemon fainted.
     * @virtual
     */
    public faint(event: events.Faint): ContextResult { return this.accept; }

    /**
     * Indicates that the pokemon's locked move ended in fatigue.
     * @virtual
     */
    public fatigue(event: events.Fatigue): ContextResult { return this.accept; }

    /**
     * Indicates that the pokemon's stalling move was broken by Feint.
     * @virtual
     */
    public feint(event: events.Feint): ContextResult { return this.accept; }

    /**
     * Indicates that the pokemon changed its form.
     * @virtual
     */
    public formChange(event: events.FormChange): ContextResult
    { return this.accept; }

    /**
     * Prepares or releases a future move.
     * @virtual
     */
    public futureMove(event: events.FutureMove): ContextResult
    { return this.accept; }

    /**
     * Indicates that the game has ended.
     * @virtual
     */
    public gameOver(event: events.GameOver): ContextResult
    { return this.accept; }

    /**
     * Indicates that the pokemon was hit by a move multiple times.
     * @virtual
     */
    public hitCount(event: events.HitCount): ContextResult
    { return this.accept; }

    /**
     * Indicates that the pokemon was immune to an effect.
     * @virtual
     */
    public immune(event: events.Immune): ContextResult { return this.accept; }

    /**
     * Indicates that the pokemon spent its turn being inactive.
     * @virtual
     */
    public inactive(event: events.Inactive): ContextResult
    { return this.accept; }

    /**
     * Initializes the opponent's team size.
     * @virtual
     */
    public initOtherTeamSize(event: events.InitOtherTeamSize): ContextResult
    { return this.accept; }

    /**
     * Handles an InitTeam event.
     * @virtual
     */
    public initTeam(event: events.InitTeam): ContextResult
    { return this.accept; }

    /**
     * Inverts all of the pokemon's temporary stat boosts.
     * @virtual
     */
    public invertBoosts(event: events.InvertBoosts): ContextResult
    { return this.accept; }

    /**
     * Indicates that the pokemon is taking aim due to Lock-On.
     * @virtual
     */
    public lockOn(event: events.LockOn): ContextResult { return this.accept; }

    /**
     * Indicates that the pokemon is Mimicking a move.
     * @virtual
     */
    public mimic(event: events.Mimic): ContextResult { return this.accept; }

    /**
     * Indicates that the pokemon avoided a move.
     * @virtual
     */
    public miss(event: events.Miss): ContextResult { return this.accept; }

    /**
     * Reveals a move and modifies its PP value.
     * @virtual
     */
    public modifyPP(event: events.ModifyPP): ContextResult
    { return this.accept; }

    /**
     * Indicates that the pokemon must recharge from the previous action.
     * @virtual
     */
    public mustRecharge(event: events.MustRecharge): ContextResult
    { return this.accept; }

    /**
     * Indicates that the pokemon's move couldn't target anything.
     * @virtual
     */
    public noTarget(event: events.NoTarget): ContextResult
    { return this.accept; }

    /**
     * Indicates that the turn is about to end.
     * @virtual
     */
    public postTurn(event: events.PostTurn): ContextResult
    { return this.accept; }

    /**
     * Prepares a two-turn move.
     * @virtual
     */
    public prepareMove(event: events.PrepareMove): ContextResult
    { return this.accept; }

    /**
     * Indicates that the turn is about to begin.
     * @virtual
     */
    public preTurn(event: events.PreTurn): ContextResult { return this.accept; }

    /**
     * Re-enables the pokemon's disabled moves.
     * @virtual
     */
    public reenableMoves(event: events.ReenableMoves): ContextResult
    { return this.accept; }

    /**
     * Indicates that the pokemon is being trapped by an unknown ability and
     * tries to infer it.
     * @virtual
     */
    public rejectSwitchTrapped(event: events.RejectSwitchTrapped): ContextResult
    { return this.accept; }

    /**
     * Indicates that an item was just removed from the pokemon.
     * @virtual
     */
    public removeItem(event: events.RemoveItem): ContextResult
    { return this.accept; }

    /**
     * Resets the weather back to none.
     * @virtual
     */
    public resetWeather(event: events.ResetWeather): ContextResult
    { return this.accept; }

    /**
     * Indicates that the pokemon was hit by a move it resists.
     * @virtual
     */
    public resisted(event: events.Resisted): ContextResult
    { return this.accept; }

    /**
     * Restores the PP of each of the pokemon's moves.
     * @virtual
     */
    public restoreMoves(event: events.RestoreMoves): ContextResult
    { return this.accept; }

    /**
     * Reveals that the pokemon is now holding an item.
     * @virtual
     */
    public revealItem(event: events.RevealItem): ContextResult
    { return this.accept; }

    /**
     * Reveals that the pokemon knows a move.
     * @virtual
     */
    public revealMove(event: events.RevealMove): ContextResult
    { return this.accept; }

    /**
     * Sets the pokemon's temporary third type.
     * @virtual
     */
    public setThirdType(event: events.SetThirdType): ContextResult
    { return this.accept; }

    /**
     * Indicates that the pokemon is Sketching a move.
     * @virtual
     */
    public sketch(event: events.Sketch): ContextResult { return this.accept; }

    /**
     * Indicates that the pokemon was hit by a move it was weak to.
     * @virtual
     */
    public superEffective(event: events.SuperEffective): ContextResult
    { return this.accept; }

    /**
     * Swaps the given temporary stat boosts of two pokemon.
     * @virtual
     */
    public swapBoosts(event: events.SwapBoosts): ContextResult
    { return this.accept; }

    /**
     * Indicates that a pokemon has switched in.
     * @virtual
     */
    public switchIn(event: events.SwitchIn): ContextResult
    { return this.accept; }

    /**
     * Indicates that a pokemon took damage and its HP changed.
     * @virtual
     */
    public takeDamage(event: events.TakeDamage): ContextResult
    { return this.accept; }

    /**
     * Indicates that a pokemon has transformed into its target.
     * @virtual
     */
    public transform(event: events.Transform): ContextResult
    { return this.accept; }

    /**
     * Indicates that the pokemon is being trapped by another.
     * @virtual
     */
    public trap(event: events.Trap): ContextResult { return this.accept; }

    /**
     * Explicitly indicates that a field effect is still going.
     * @virtual
     */
    public updateFieldEffect(event: events.UpdateFieldEffect): ContextResult
    { return this.accept; }

    /**
     * Reveals moves and pp values.
     * @virtual
     */
    public updateMoves(event: events.UpdateMoves): ContextResult
    { return this.accept; }

    /**
     * Indicates that a status effect is still going. Usually this is implied at
     * the end of the turn unless the game usually sends an explicit message,
     * which this BattleEvent covers.
     * @virtual
     */
    public updateStatusEffect(event: events.UpdateStatusEffect): ContextResult
    { return this.accept; }

    /**
     * Indicates that the pokemon used a move.
     * @virtual
     */
    public useMove(event: events.UseMove): ContextResult { return this.accept; }
}
