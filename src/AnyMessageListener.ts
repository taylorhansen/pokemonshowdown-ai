import { MajorStatusName } from "./bot/battle/state/Pokemon";
import { ChallengesFrom, PlayerID, PokemonDetails, PokemonID, PokemonStatus,
    RequestActive, RequestSide, RoomType } from "./messageData";

/** Prefix for a message that tells of the message's type. */
export type Prefix = "-curestatus" | "-cureteam" | "-damage" | "-heal" |
    "-status" | "challstr" | "error" | "faint" | "init" | "move" | "player" |
    "request" | "switch" | "teamsize" | "turn" | "updatechallenges" |
    "updateuser" | "upkeep";

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
        move: new MessageListener<"move">(),
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
        return (args: MessageArgs<P>) =>
            (this.listeners[prefix] as MessageListener<P>).handle(args);
    }
}

/**
 * Listens for a certain type of message.
 * @template P Describes the message's type.
 */
class MessageListener<P extends Prefix>
{
    /** Array of registered message handlers. */
    private readonly handlers: MessageHandler<P>[] = [];

    /**
     * Calls all registered handlers with the arguments for this type of
     * message.
     * @param args Message arguments.
     */
    public handle(args: MessageArgs<P>): void
    {
        this.handlers.forEach(handler => handler(args));
    }

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
export type MessageHandler<P extends Prefix> = (args: MessageArgs<P>) => void;

export type MessageArgs<P extends Prefix> =
    P extends "-curestatus" ? CureStatusArgs
    : P extends "-cureteam" ? CureTeamArgs
    : P extends "-damage" ? DamageArgs
    : P extends "-heal" ? HealArgs
    : P extends "-status" ? StatusArgs
    : P extends "challstr" ? ChallStrArgs
    : P extends "error" ? ErrorArgs
    : P extends "faint" ? FaintArgs
    : P extends "init" ? InitArgs
    : P extends "move" ? MoveArgs
    : P extends "player" ? PlayerArgs
    : P extends "request" ? RequestArgs
    : P extends "switch" ? SwitchArgs
    : P extends "teamsize" ? TeamSizeArgs
    : P extends "turn" ? TurnArgs
    : P extends "updatechallenges" ? UpdateChallengesArgs
    : P extends "updateuser" ? UpdateUserArgs
    : P extends "upkeep" ? UpkeepArgs
    : () => void;

/** Args for a `-curestatus` message. */
export interface CureStatusArgs
{
    /** ID of the pokemon being cured. */
    id: PokemonID;
    /** Status condition the pokemon is being cured of. */
    condition: MajorStatusName;
}

/** Args for a `-cureteam` message. */
export interface CureTeamArgs
{
    /**
     * ID of the pokemon of which its team is being cured of status conditions.
     */
    id: PokemonID;
}

/** Args for a `-damage` message. */
export interface DamageArgs
{
    /** ID of the pokemon being damaged. */
    id: PokemonID;
    /** HP and any status conditions. */
    status: PokemonStatus;
}

/** Args for a `-heal` message. */
export interface HealArgs
{
    /** ID of the pokemon being healed. */
    id: PokemonID;
    /** HP and any status conditions. */
    status: PokemonStatus;
}

/** Args for a `-status` message. */
export interface StatusArgs
{
    /** ID of the pokemon being afflicted with a status condition. */
    id: PokemonID;
    /** Status condition being afflicted. */
    condition: MajorStatusName;
}

/** Args for a `challstr` message. */
export interface ChallStrArgs
{
    /** String used to verify account login. */
    challstr: string;
}

/** Args for an `error` message. */
export interface ErrorArgs
{
    /** Why the requested action failed. */
    reason: string;
}

/** Args for a `faint` message. */
export interface FaintArgs
{
    /** ID of the pokemon that has fainted. */
    id: PokemonID;
}

/** Args for an `init` message. */
export interface InitArgs
{
    /** Type of room we're joining. */
    type: RoomType;
}

/** Args for a `move` message. */
export interface MoveArgs
{
    /** ID of the pokemon using a move. */
    id: PokemonID;
    /** Name of the move. Should be converted into an id name afterwards. */
    move: string;
    /** Target pokemon ID. */
    target: PokemonID;
    /**
     * ID name of an effect that caused the move to be used. Empty string means
     * no effect.
     */
    effect: string;
    /** Whether the move missed. */
    missed: boolean;
}

/** Args for a `player` message. */
export interface PlayerArgs
{
    /** Player id used in identifying pokemon owner. */
    id: PlayerID;
    /** Username of that player. */
    username: string;
    /** Avatar id. */
    avatarId: number;
}

/** Args for a `request` message. Types the JSON data in the message. */
export interface RequestArgs
{
    /** Corresponds to which active pokemon slots must be filled. */
    forceSwitch?: boolean[];
    /** Active pokemon info. */
    active?: RequestActive[];
    /** Basic info about the entire team. */
    side: RequestSide;
    /** Request id for verification. */
    rqid: number;
    /** Whether the given request cannot be canceled. */
    noCancel?: boolean;
}

/** Args for a `switch` message. */
export interface SwitchArgs
{
    /** ID of the pokemon being switched in. */
    id: PokemonID;
    /** Some details on species; level; etc. */
    details: PokemonDetails;
    /** HP and any status conditions. */
    status: PokemonStatus;
}

/** Args for a `teamsize` message. */
export interface TeamSizeArgs
{
    /** Player ID. */
    id: PlayerID;
    /** Size of that player's team. */
    size: number;
}

/** Args for a `turn` message. */
export interface TurnArgs
{
    /** Current turn number. */
    turn: number;
}

/**
 * Args for an `updatechallenges` message. Types the JSON data in the message.
 */
export interface UpdateChallengesArgs
{
    /** Challenges from others to the client. */
    challengesFrom: ChallengesFrom;
}

/** Args for an `updateuser` message. */
export interface UpdateUserArgs
{
    /** New username. */
    username: string;
    /** Whether this is a guest account. */
    isGuest: boolean;
}

/** Args for an `upkeep` message. */
export interface UpkeepArgs
{
}
