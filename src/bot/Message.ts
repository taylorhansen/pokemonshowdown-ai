import { PokemonID, PokemonDetails, PokemonStatus } from "./Pokemon";

/** Prefix for a message that tells of the message's type. */
export type Prefix = "init" | "updateuser" | "challstr" | "updatechallenges" |
    "request" | "turn" | "switch";

/** Base class for all Messages. */
export interface MessageBase
{
    /** Prefix telling which type of Message this is. */
    prefix: Prefix
}

/** First message sent when a room is joined. */
export interface InitMessage extends MessageBase
{
    prefix: "init";
    /** Type of room we're joining. Should be either `chat` or `battle`. */
    type: "chat" | "battle";
}

/** Message to update user information. */
export interface UpdateUserMessage extends MessageBase
{
    prefix: "updateuser";
    /** Username from login. */
    username: string;
    /** Whether this is a server-given guest account. */
    isGuest: boolean;
}

/** Gives a `challstr` which is used to login. */
export interface ChallstrMessage extends MessageBase
{
    prefix: "challstr";
    /** Used to login. */
    challstr: string;
}

/** Message to update incoming challenges. */
export interface UpdateChallengesMessage extends MessageBase
{
    prefix: "updatechallenges";
    /**
     * Challenges addressed to the client, indexed by the user and mapped to the
     * battle format.
     */
    challengesFrom: {[user: string]: string};
}

/** Requests an action from the client, giving info about the client's team. */
export interface RequestMessage extends MessageBase
{
    prefix: "request";
    /** Team info. */
    team: object;
}

/** Updates the turn counter. */
export interface TurnMessage extends MessageBase
{
    prefix: "turn",
    /** The new current turn. */
    turn: number
}

/** Indicates that a pokemon was switched. */
export interface SwitchMessage extends MessageBase
{
    prefix: "switch";
    id: PokemonID;
    /** Some more details. Contains species, gender, etc. */
    details: PokemonDetails;
    /** HP and status conditions. */
    status: PokemonStatus;
}

/** Message sent to the client from the server. */
export type Message = InitMessage | UpdateUserMessage | ChallstrMessage |
    UpdateChallengesMessage | RequestMessage | TurnMessage | SwitchMessage;

/** Contains all the Messages sent from the server from a particular room. */
export interface Packet
{
    /**
     * The room that these messages relate to. Can be null if global or lobby.
     */
    room: string | null;
    /** The messages that were sent. */
    messages: Message[];
}
