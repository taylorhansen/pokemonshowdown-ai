import { Logger } from "../../../Logger";
import { BattleState } from "../../state/BattleState";
import { AnyDriverEvent } from "../DriverEvent";

// tslint:disable: no-trailing-whitespace (force newlines in doc)
/**
 * Specifies what to do after the current DriverContext handles an event.  
 * `"base"` - Let the default context handle the event.  
 * `"stop"` - No further action.  
 * `"expire"` - Expire the current DriverContext and let the next topmost
 * context handle the event.
 */
// tslint:enable: no-trailing-whitespace
export type ContextResult = "base" | "stop" | "expire";

/**
 * Base class for sub-Driver contexts for parsing multiple DriverEvents
 * together.
 */
export abstract class DriverContext
{
    /**
     * Base DriverContext constructor.
     * @param state State object to mutate while handling DriverEvents.
     * @param logger Logger object.
     */
    constructor(protected readonly state: BattleState,
        protected readonly logger: Logger) {}

    /**
     * Handles a DriverEvent.
     * @returns A ContextResult string specifying what to do after handling the
     * event, or a new DriverContext object if it should be added to the
     * DriverContext chain (also works like `"stop"`).
     * @see ContextResult
     */
    public abstract handle(event: AnyDriverEvent):
        ContextResult | DriverContext;

    /**
     * Indicates that the current stream of DriverEvents has halted, awaiting a
     * decision from a user (i.e., whenever `BattleDriver#halt()` is called).
     * @virtual
     */
    public halt(): void {}

    /**
     * Cleanup actions before expiring this context.
     * @virtual
     */
    public expire(): void {}
}
