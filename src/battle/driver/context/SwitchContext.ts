import { Logger } from "../../../Logger";
import { BattleState } from "../../state/BattleState";
import { AnyDriverEvent, SwitchIn } from "../DriverEvent";
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
    constructor(state: BattleState, event: SwitchIn, logger: Logger)
    {
        super(state, logger);
        this.state.teams[event.monRef].switchIn(event);
    }

    /** @override */
    public handle(event: AnyDriverEvent): ContextResult | DriverContext
    {
        // TODO
        return "expire";
    }
}
