import { ChallengesFrom, RoomType, PokemonID, PokemonDetails, PokemonStatus }
    from "./MessageData";

/** Prefix for a message that tells of the message's type. */
export type Prefix = "init" | "updateuser" | "challstr" | "updatechallenges" |
    "request" | "turn" | "error" | "switch";

/**
 * Listens for any type of message and delegates it to one of its specific
 * listeners.
 */
export class AnyMessageListener
{
    /** Registered message listeners for each type of Prefix. */
    private readonly listeners: {readonly [P in Prefix]: MessageListener<P>} =
    {
        "init": new MessageListener<"init">(),
        "updateuser": new MessageListener<"updateuser">(),
        "challstr": new MessageListener<"challstr">(),
        "updatechallenges": new MessageListener<"updatechallenges">(),
        "request": new MessageListener<"request">(),
        "turn": new MessageListener<"turn">(),
        "error": new MessageListener<"error">(),
        "switch": new MessageListener<"switch">()
    };

    /**
     * Adds a MessageHandler for a certain message Prefix.
     * @template P Prefix type.
     * @param prefix Message prefix indicating its type.
     * @param handler Function to be called using data from the message.
     * @returns `this` to allow chaining.
     */
    public on<P extends Prefix>(prefix: P, handler: MessageHandler<P>):
        AnyMessageListener
    {
        // need to assert the function type since addHandler is displayed as a
        //  union of all possible MessageHandlers
        (this.listeners[prefix].addHandler as
            (handler: MessageHandler<P>) => void)(handler);
        return this;
    }

    /**
     * Gets the main handler for the given message type.
     * @template P Prefix type.
     * @param prefix Message prefix indicating its type.
     * @returns A function that calls all registered handlers for this message
     * type.
     */
    public getHandler<P extends Prefix>(prefix: P): MessageHandler<P>
    {
        return this.listeners[prefix].handle as MessageHandler<P>;
    }
}

/**
 * Listens for a certain type of message.
 * @template P Describes the message's type.
 */
class MessageListener<P extends Prefix>
{
    /**
     * Calls all registered handlers with the arguments for this type of
     * message.
     */
    public readonly handle = ((...args: any[]) =>
        // apply the arguments of this main handler to all the sub-handlers
        this.handlers.forEach(handler =>
            (handler as (...args: any[]) => void)(...args))
    ) as MessageHandler<P>;
    /** Array of registered message handlers. */
    private readonly handlers: MessageHandler<P>[] = [];

    /**
     * Adds another message handler.
     * @param handler Function to be called.
     */
    public addHandler(handler: MessageHandler<P>): void
    {
        this.handlers.push(handler);
    }
}

/**
 * Function type for handling certain message types.
 * @template P Describes the message's type.
 */
export type MessageHandler<P extends Prefix> =
    P extends "init" ? InitHandler
    : P extends "updateuser" ? UpdateUserHandler
    : P extends "challstr" ? ChallStrHandler
    : P extends "updatechallenges" ? UpdateChallengesHandler
    : P extends "request" ? RequestHandler
    : P extends "turn" ? TurnHandler
    : P extends "error" ? ErrorHandler
    : P extends "switch" ? SwitchHandler
    : () => void;

/**
 * Handles an `init` message.
 * @param type Type of room we're joining.
 */
export type InitHandler = (type: RoomType) => void;

/**
 * Handles an `updateuser` message.
 * @param username New username.
 * @param isGuest Whether this is a guest account.
 */
export type UpdateUserHandler = (username: string, isGuest: boolean) => void;

/**
 * Handles a `challstr` message.
 * @param challstr String used to verify account login.
 */
export type ChallStrHandler = (challstr: string) => void;

/**
 * Handles an `updatechallenges` message.
 * @param challengesFrom Challenges from others to the client.
 */
export type UpdateChallengesHandler = (challengesFrom: ChallengesFrom) => void;

/**
 * Handles a `request` message.
 * @param team Some of the client's team info.
 */
export type RequestHandler = (team: object) => void;

/**
 * Handles a `turn` message.
 * @param turn Current turn number.
 */
export type TurnHandler = (turn: number) => void;

/**
 * Handles an `error` message.
 * @param reason Why the requested action failed.
 */
export type ErrorHandler = (reason: string) => void;

/**
 * Handles a `switch` message.
 * @param id ID of the pokemon being switched in.
 * @param details Some details on species, level, etc.
 * @param status HP and any status conditions.
 */
export type SwitchHandler = (id: PokemonID, details: PokemonDetails,
    status: PokemonStatus) => void;
