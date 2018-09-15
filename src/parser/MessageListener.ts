import { MajorStatusName } from "../bot/battle/state/Pokemon";
import { ChallengesFrom, PlayerID, PokemonDetails, PokemonID, PokemonStatus,
    RequestData, RoomType} from "./MessageData";

/** Prefix for a message that tells of the message's type. */
export type Prefix = "-curestatus" | "-cureteam" | "-damage" | "-heal" |
    "-status" | "challstr" | "error" | "faint" | "init" | "player" | "request" |
    "switch" | "teamsize" | "turn" | "updatechallenges" | "updateuser" |
    "upkeep";

/**
 * Listens for any type of message and delegates it to one of its specific
 * listeners.
 */
export class AnyMessageListener
{
    /** Registered message listeners for each type of Prefix. */
    private readonly listeners: {readonly [P in Prefix]: MessageListener<P>} =
    {
        "-curestatus": new MessageListener<"-curestatus">(),
        "-cureteam": new MessageListener<"-cureteam">(),
        "-damage": new MessageListener<"-damage">(),
        "-heal": new MessageListener<"-heal">(),
        "-status": new MessageListener<"-status">(),
        challstr: new MessageListener<"challstr">(),
        error: new MessageListener<"error">(),
        faint: new MessageListener<"faint">(),
        init: new MessageListener<"init">(),
        player: new MessageListener<"player">(),
        request: new MessageListener<"request">(),
        switch: new MessageListener<"switch">(),
        teamsize: new MessageListener<"teamsize">(),
        turn: new MessageListener<"turn">(),
        updatechallenges: new MessageListener<"updatechallenges">(),
        updateuser: new MessageListener<"updateuser">(),
        upkeep: new MessageListener<"upkeep">()
    };

    /**
     * Adds a MessageHandler for a certain message Prefix.
     * @template P Prefix type.
     * @param prefix Message prefix indicating its type.
     * @param handler Function to be called using data from the message.
     * @returns `this` to allow chaining.
     */
    public on<P extends Prefix>(prefix: P, handler: MessageHandler<P>): this
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
    P extends "-curestatus" ? CureStatusHandler
    : P extends "-cureteam" ? CureTeamHandler
    : P extends "-damage" ? DamageHandler
    : P extends "-heal" ? HealHandler
    : P extends "-status" ? StatusHandler
    : P extends "challstr" ? ChallStrHandler
    : P extends "error" ? ErrorHandler
    : P extends "faint" ? FaintHandler
    : P extends "init" ? InitHandler
    : P extends "player" ? PlayerHandler
    : P extends "request" ? RequestHandler
    : P extends "switch" ? SwitchHandler
    : P extends "teamsize" ? TeamSizeHandler
    : P extends "turn" ? TurnHandler
    : P extends "updatechallenges" ? UpdateChallengesHandler
    : P extends "updateuser" ? UpdateUserHandler
    : P extends "upkeep" ? UpkeepHandler
    : () => void;

/**
 * Handles a `-curestatus` message.
 * @param id ID of the pokemon being cured.
 * @param condition Status condition the pokemon is being cured of.
 */
export type CureStatusHandler = (id: PokemonID, condition: MajorStatusName) =>
    void;

/**
 * Handles a `-cureteam` message.
 * @param id ID of the pokemon of which its team is being cured of status
 * conditions.
 */
export type CureTeamHandler = (id: PokemonID) => void;

/**
 * Handles a `-damage` message.
 * @param id ID of the pokemon being damaged.
 * @param status HP and any status conditions.
 */
export type DamageHandler = (id: PokemonID, status: PokemonStatus) => void;

/**
 * Handles a `-heal` message.
 * @param id ID of the pokemon being healed.
 * @param status HP and any status conditions.
 */
export type HealHandler = (id: PokemonID, status: PokemonStatus) => void;

/**
 * Handles a `-status` message.
 * @param id ID of the pokemon being afflicted with a status condition.
 * @param condition Status condition being afflicted.
 */
export type StatusHandler = (id: PokemonID, condition: MajorStatusName) => void;

/**
 * Handles a `challstr` message.
 * @param challstr String used to verify account login.
 */
export type ChallStrHandler = (challstr: string) => void;

/**
 * Handles an `error` message.
 * @param reason Why the requested action failed.
 */
export type ErrorHandler = (reason: string) => void;

/**
 * Handles a `faint` message.
 * @param id ID of the pokemon that has fainted.
 */
export type FaintHandler = (id: PokemonID) => void;

/**
 * Handles an `init` message.
 * @param type Type of room we're joining.
 */
export type InitHandler = (type: RoomType) => void;

/**
 * Handles a `player` message.
 * @param id Player id used in identifying pokemon owner.
 * @param username Username of that player.
 * @param avatarId Avatar id.
 */
export type PlayerHandler = (id: PlayerID, username: string, avatarId: number)
    => void;

/**
 * Handles a `request` message.
 * @param team Some of the client's team info.
 */
export type RequestHandler = (data: RequestData) => void;

/**
 * Handles a `switch` message.
 * @param id ID of the pokemon being switched in.
 * @param details Some details on species, level, etc.
 * @param status HP and any status conditions.
 */
export type SwitchHandler = (id: PokemonID, details: PokemonDetails,
    status: PokemonStatus) => void;

/**
 * Handles a `teamsize` message.
 * @param id Player ID.
 * @param size Size of that player's team.
 */
export type TeamSizeHandler = (id: PlayerID, size: number) => void;

/**
 * Handles a `turn` message.
 * @param turn Current turn number.
 */
export type TurnHandler = (turn: number) => void;

/**
 * Handles an `updatechallenges` message.
 * @param challengesFrom Challenges from others to the client.
 */
export type UpdateChallengesHandler = (challengesFrom: ChallengesFrom) => void;

/**
 * Handles an `updateuser` message.
 * @param username New username.
 * @param isGuest Whether this is a guest account.
 */
export type UpdateUserHandler = (username: string, isGuest: boolean) => void;

/** Handles an `upkeep` message. */
export type UpkeepHandler = () => void;
