import { Logger } from "../../Logger";
import { Choice } from "../agent/Choice";
import { BattleState, ReadonlyBattleState } from "../state/BattleState";
import { BaseContext } from "./context/BaseContext";
import { DriverContext } from "./context/DriverContext";
import { AnyDriverEvent } from "./DriverEvent";

/** Handles all state mutations and inferences. */
export class StateDriver
{
    /** Internal battle state. */
    public get state(): ReadonlyBattleState { return this._state; }
    protected readonly _state = new BattleState();

    /** DriverContext stack for handling events. */
    private readonly contexts: DriverContext[] = [];
    // TODO: switch BaseContext subclasses based on format
    /** Default context for handling events. */
    private readonly baseContext =
        new BaseContext(this._state, this.logger.addPrefix("Context(gen4): "));

    /**
     * Creates a StateDriver.
     * @param logger Logger object.
     */
    constructor(private readonly logger: Logger) {}

    /** Handles a batch of DriverEvents. */
    public handle(...events: AnyDriverEvent[]): void
    {
        for (const event of events) this.handleImpl(event);
    }

    /**
     * Handles a DriverEvent, propagating down the DriverContext chain as
     * necessary.
     */
    private handleImpl(event: AnyDriverEvent): void
    {
        for (let i = this.contexts.length - 1; i >= 0; --i)
        {
            const ctx = this.contexts[i];
            const result = ctx.handle(event);
            if (result === "stop") return;
            if (result === "base") break;
            if (result === "expire")
            {
                // should never happen
                if (i !== this.contexts.length - 1)
                {
                    throw new Error("Only top context can expire");
                }

                ctx.expire();
                this.contexts.pop();
                // let the next topmost context handle this event
            }
            else
            {
                // should never happen
                if (i !== this.contexts.length - 1)
                {
                    throw new Error("Only top context can add a new context");
                }

                this.contexts.push(result);
                return; // works like "stop" result
            }
        }

        // let the default context handle the event if we haven't returned
        const baseResult = this.baseContext.handle(event);
        if (baseResult === "expire")
        {
            throw new Error("Base context can't expire");
        }
        else if (baseResult !== "base" && baseResult !== "stop")
        {
            if (this.contexts.length > 0)
            {
                throw new Error("Only top context can add a new context");
            }
            this.contexts.push(baseResult);
        }
    }

    /**
     * Indicates that the current stream of DriverEvents has halted, awaiting a
     * decision from a user (i.e., whenever `BattleDriver#halt()` is called).
     * @virtual
     */
    public halt(): void
    {
        // start from topmost context
        for (let i = this.contexts.length - 1; i >= 0; --i)
        {
            this.contexts[i].halt();
        }
        this.baseContext.halt();
    }

    /** Gets the available choices for the current decision. */
    public getChoices(switchOnly = false): Choice[]
    {
        const team = this.state.teams.us;
        const mon = team.active;

        const result: Choice[] = [];

        // add move choices
        const them = this.state.teams.them.active;
        if (!switchOnly)
        {
            if (mon.volatile.lockedMove.isActive ||
                mon.volatile.rollout.isActive)
            {
                return ["move 1"];
            }

            const moves = [...mon.moveset.moves];
            for (let i = 0; i < moves.length; ++i)
            {
                const [moveName, move] = moves[i];

                // can't select without pp
                if (move.pp <= 0) continue;
                // can't select a Disabled move
                if (moveName === mon.volatile.disabled?.name) continue;
                // can't select if imprisoned
                if (them.volatile.imprison && them.moveset.moves.has(moveName))
                {
                    continue;
                }
                // TODO: choice item lock, taunt, torment, etc
                // TODO: is that all?
                // if not, should be able to recover from choice rejection

                result.push(`move ${i + 1}` as Choice);
            }

            // can always struggle if unable to use any move
            if (result.length <= 0) result.push("move 1");
        }

        // see if we can switch out
        // can always switch if holding the shed shell item
        if (!switchOnly && mon.item.definiteValue !== "shedshell")
        {
            // trapped by a trapping move
            if (mon.volatile.trapped) return result;
            // gen4: shadowtag cancels the other's trapping effect
            if (them.ability === "shadowtag" && mon.ability !== "shadowtag")
            {
                return result;
            }
            // magnetpull traps steel types
            if (them.ability === "magnetpull" && mon.types.includes("steel"))
            {
                return result;
            }
            // arenatrap traps grounded opponents
            if (them.ability === "arenatrap" && mon.isGrounded) return result;
            // TODO: is this all?
            // if not, should be able to recover from choice rejection
        }

        // add switch choices
        const teamList = team.pokemon;
        for (let i = 0; i < teamList.length; ++i)
        {
            const slot = teamList[i];
            // can't select empty slot
            if (!slot) continue;
            // can't select self
            if (slot === team.active) continue;
            // can't select other active pokemon
            if (slot.active) continue;
            // can't select fainted pokemon
            if (slot.fainted) continue;
            // TODO: is this all?
            // if not, should be able to recover from choice rejection

            result.push(`switch ${i + 1}` as Choice);
        }

        return result;
    }

    // TODO: make this not the case
    // istanbul ignore next: unstable, hard to verify
    /** Stringifies the BattleState. */
    public getStateString(): string
    {
        return this._state.toString();
    }
}
