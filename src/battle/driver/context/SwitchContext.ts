import { Logger } from "../../../Logger";
import { BattleState } from "../../state/BattleState";
import * as events from "../BattleEvent";
import { ContextResult, DriverContext } from "./DriverContext";

/** Handles events related to a switch-in. */
export class SwitchContext extends DriverContext
{
    /**
     * Constructs a context for handling switch-in effects.
     * @param state State object to mutate while handling events.
     * @param event Event that started this context.
     * @param logger Logger object.
     */
    constructor(state: BattleState, event: events.SwitchIn, logger: Logger)
    {
        super(state, logger);
        this.state.teams[event.monRef].switchIn(event);
    }

    /** @override */
    public handle(event: events.Any): ContextResult | DriverContext
    {
        // TODO
        return "expire";
    }
}
