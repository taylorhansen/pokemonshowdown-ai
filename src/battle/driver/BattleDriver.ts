import { Logger } from "../../Logger";
import { BattleAgent } from "../agent/BattleAgent";
import { Choice } from "../agent/Choice";
import { ReadonlyBattleState } from "../state/BattleState";
import { Any } from "./BattleEvent";
import { StateDriver } from "./StateDriver";

/** Function type for sending a Choice to the game. */
export type ChoiceSender = (choice: Choice) => void;

/** Main entry point for tracking a battle. */
export class BattleDriver
{
    /** Internal battle state. */
    public get state(): ReadonlyBattleState { return this.stateDriver.state; }

    /** Manages BattleState inferences. */
    protected readonly stateDriver =
        new StateDriver(this.logger.addPrefix("StateDriver: "));

    /** Whether the BattleDriver is halted and can't accept DriverEvents. */
    private halted = false;
    /** Current iteration of the available choices while halted. */
    protected get choices(): readonly Choice[] { return this._choices; }
    private _choices: Choice[] = [];

    /** Logger passed to the BattleAgent. */
    private readonly agentLogger = this.logger.addPrefix("BattleAgent: ");

    /**
     * Creates a BattleDriver.
     * @param agent Function that makes the decisions for this battle.
     * @param sender Function for sending the agent's Choice to the game.
     * @param logger Logger object.
     */
    constructor(private readonly agent: BattleAgent,
        private readonly sender: ChoiceSender,
        protected readonly logger: Logger)
    {
    }

    /** Handles a batch of DriverEvents. */
    public handle(...events: Any[]): void
    {
        this.stateDriver.handle(...events);
    }

    /**
     * Terminates a stream of DriverEvents, optionally asking the BattleAgent
     * for a decision. Until `#accept()` is called, no DriverEvents can be
     * handled.
     * @virtual
     */
    public async halt(command: "wait" | "switch" | "decide"): Promise<void>
    {
        this.halted = true;
        this.stateDriver.halt();

        // nothing to do
        if (command === "wait") return;

        // go over what we can and can't do
        this._choices = this.stateDriver.getChoices(
            /*switchOnly*/command === "switch");

        this.logger.debug(`Choices: [${this._choices.join(", ")}]`);
        if (this._choices.length <= 0)
        {
            throw new Error("Empty choices array on halt");
        }

        // make initial decision
        await this.agent(this.stateDriver.state, this._choices,
            this.agentLogger);
        this.logger.debug(`Sorted choices: [${this._choices.join(", ")}]`);

        this.sender(this._choices[0]);
    }

    /**
     * Indicates that the last choice to be sent (or inaction) was accepted by
     * the game, and that this BattleDriver is about to receive more
     * DriverEvents.
     * @virtual
     */
    public accept(): void
    {
        this.halted = false;
    }

    /**
     * Tries to recover from a rejected choice. Cannot be called unless either
     * `#halt()` or `#reject()` were called since the last `#accept()`.
     * @param reason Reason why the choice was rejected in order to infer new
     * information. `"disabled"` and `"trapped"` refer to a rejected move or
     * switch (respectively) based on previously unknown information.
     */
    public async reject(reason?: "disabled" | "trapped"): Promise<void>
    {
        if (!this.halted) throw new Error("Can't reject if not halted");

        // remove invalid choice
        const lastChoice = this._choices.shift()!;

        let newInfo = false;
        if (reason === "disabled")
        {
            // move is now known to be disabled by an unknown effect
            if (!lastChoice.startsWith("move"))
            {
                throw new Error(`Non-move Choice ${lastChoice} rejected ` +
                    "as 'disabled'");
            }

            // TODO: handle all other move restrictions before testing for
            //  imprison

            /*// parse move slot that was invoked
            // TODO: guarantee that this is the same move
            const i = parseInt(lastChoice.substr("move ".length), 10) - 1;
            const moveName =
            [
                ...this.stateDriver.state.teams.us.active.moveset.moves
            ][i][0];

            // TODO: confirm that imprison is the only reasonable effect
            //  that can happen here
            const them = this.stateDriver.state.teams.them.active;
            if (them.volatile.imprison &&
                them.moveset.constraint.has(moveName))
            {
                // must be disabled due to opponent's imprison effect
                this.stateDriver.handle(
                    {type: "revealMove", monRef: "them", move: moveName});
                newInfo = true;
            }
            else
            {
                throw new Error(`Can't figure out why move ${i + 1} ` +
                    `(${moveName}) was disabled`);
            }*/
        }
        else if (reason === "trapped")
        {
            if (!lastChoice.startsWith("switch"))
            {
                throw new Error(`Non-switch Choice ${lastChoice} ` +
                    "rejected as 'trapped'");
            }

            // now known to be trapped by the opponent
            // all other switch choices are therefore invalid
            this._choices = this._choices.filter(c => !c.startsWith("switch"));

            // try to infer a trapping ability
            this.stateDriver.handle(
                {type: "rejectSwitchTrapped", monRef: "us", by: "them"});
            newInfo = true;
        }
        else
        {
            this.logger.error(`Choice ${lastChoice} rejected without a ` +
                "reason, driver may be incomplete");
        }

        this.logger.debug(`Revised choices: [${this._choices.join(", ")}]`);
        if (this._choices.length <= 0)
        {
            throw new Error("Empty choices array on reject");
        }

        if (newInfo)
        {
            // re-sort choices based on new info
            await this.agent(this.stateDriver.state, this._choices,
                this.agentLogger);
            this.logger.debug(`Sorted choices: [${this._choices.join(", ")}]`);
        }

        this.sender(this._choices[0]);
    }
}
