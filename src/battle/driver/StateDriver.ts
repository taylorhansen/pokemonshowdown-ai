import { Logger } from "../../Logger";
import { Choice } from "../agent/Choice";
import { BattleState, ReadonlyBattleState } from "../state/BattleState";
import { Any } from "./BattleEvent";
import { DriverContext, Gen4Context } from "./context/context";

/** Handles all state mutations and inferences. */
export class StateDriver
{
    /** Internal battle state. */
    public get state(): ReadonlyBattleState { return this._state; }
    protected readonly _state = new BattleState();

    // TODO: switch base ctx class based on format
    /** DriverContext stack for handling events. */
    private readonly contexts: DriverContext[] =
    [
        new Gen4Context(this._state, this.logger.addPrefix("Context(gen4): "))
    ];

    /**
     * Creates a StateDriver.
     * @param logger Logger object.
     */
    constructor(private readonly logger: Logger) {}

    /** Handles a batch of BattleEvents. */
    public handle(...events: Any[]): void
    {
        for (const event of events) this.handleImpl(event);
    }

    /**
     * Handles a BattleEvent, propagating down the DriverContext stack as
     * necessary.
     */
    private handleImpl(event: Any): void
    {
        for (let i = this.contexts.length - 1; i >= 0; --i)
        {
            const ctx = this.contexts[i];
            const result = ctx.handle(event);
            if (!result) // falsy, expire
            {
                // should never happen
                if (i === 0)
                {
                    throw new Error("Bottom context cannot expire");
                }
                if (i !== this.contexts.length - 1)
                {
                    throw new Error("Only top context can expire");
                }

                ctx.expire();
                this.contexts.pop();
                // let the next topmost context handle this event
                continue;
            }
            else if (result !== true) // DriverContext
            {
                // should never happen
                if (i !== this.contexts.length - 1)
                {
                    throw new Error("Only top context can add a new context");
                }

                this.contexts.push(result);
            }
            break; // true, accept
        }
    }

    /**
     * Indicates that the current stream of BattleEvents has halted, awaiting a
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
        this.logger.debug(`State:\n${this.state.toString()}`);
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
            const moves = [...mon.moveset.moves];
            for (let i = 0; i < moves.length; ++i)
            {
                const [moveName, move] = moves[i];

                // can't select without pp
                if (move.pp <= 0) continue;
                // can't select status moves if Taunted
                if (mon.volatile.taunt.isActive &&
                    move.data.category === "status")
                {
                    continue;
                }
                // can't select a Disabled move
                if (mon.volatile.disabled.ts.isActive &&
                    moveName === mon.volatile.disabled.move)
                {
                    continue;
                }
                // can't select if Imprisoned
                if (them.volatile.imprison && them.moveset.moves.has(moveName))
                {
                    continue;
                }
                // locked into one move if Encored
                if (mon.volatile.encore.ts.isActive &&
                    moveName !== mon.volatile.encore.move)
                {
                    continue;
                }
                const ability = mon.volatile.suppressAbility ? "" : mon.ability;
                const ignoringItem = ability === "klutz" ||
                    mon.volatile.embargo.isActive;
                // locked into one move if choice item lock
                if (!ignoringItem && mon.volatile.choiceLock &&
                    moveName !== mon.volatile.choiceLock)
                {
                    continue;
                }
                // TODO: torment, etc
                // TODO: is that all?
                // if not, should be able to recover from choice rejection

                result.push(`move ${i + 1}` as Choice);
            }

            // can always struggle if unable to use any move
            if (result.length <= 0) result.push("move 1");

            // see if we can switch out
            // can always switch if holding the shed shell item
            if (mon.item.definiteValue !== "shedshell")
            {
                // trapped by a trapping move
                if (mon.volatile.trapped) return result;
                // gen4: shadowtag cancels the other's trapping effect
                if (them.ability === "shadowtag" && mon.ability !== "shadowtag")
                {
                    return result;
                }
                // magnetpull traps steel types
                if (them.ability === "magnetpull" &&
                    mon.types.includes("steel"))
                {
                    return result;
                }
                // arenatrap traps grounded opponents
                if (them.ability === "arenatrap" && mon.isGrounded)
                {
                    return result;
                }
                // TODO: is this all?
                // if not, should be able to recover from choice rejection
            }
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
