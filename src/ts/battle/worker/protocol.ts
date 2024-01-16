/**
 * @file Describes the JSON protocol for the BattleWorker.
 *
 * MUST keep this in sync with src/py/environments/utils/protocol.py.
 */
import {PRNGSeed} from "@pkmn/sim";
import {Action} from "../agent";
import {PlayerSide} from "./battle";

/** Indicates the worker is ready to receive {@link BattleRequest}s. */
export interface WorkerReady {
    type: "ready";
}

/** Acknowledgement of {@link WorkerReady} message. */
export interface WorkerAck {
    type: "ack";
}

/** Requests a battle to be started on this thread. */
export interface BattleRequest {
    type: "battle";
    /** Battle identifier. */
    id: string;
    /** Agents to use in the battle. */
    agents: {[P in PlayerSide]: BattleAgentOptions};
    /** Optional max turn limit before truncation. */
    maxTurns?: number;
    /** Path to the file in which to store battle logs. */
    logPath?: string;
    /**
     * If {@link logPath} is provided, whether to only store logs if the battle
     * encounters an error. If not provided, this is always true and a temp file
     * will be used.
     */
    onlyLogOnError?: boolean;
    /** Seed for battle engine. */
    seed?: PRNGSeed;
    /**
     * Timeout in milliseconds for processing battle-related actions and events.
     * Used for catching rare async bugs.
     */
    timeoutMs?: number;
}

/** Options for configuring an agent to use in battle */
export interface BattleAgentOptions {
    /** Name of agent. */
    name: string;
    /** Type of agent. */
    type: "model" | "random" | "random_move" | "max_damage";
    /** If `type="model"`, name of the model to request predictions for. */
    model?: string;
    /**
     * If `type="model"`, whether to include experience data in
     * {@link AgentRequest agent requests}.
     */
    experience?: boolean;
    /** Seed for random team init. */
    teamSeed?: PRNGSeed;
    /** Seed for random agent. */
    randSeed?: string;
}

/** Result of finished battle. */
export interface BattleReply {
    type: "battle";
    /** Battle identifier. */
    id: string;
    /** Names of the agents from the original request. */
    agents: {[P in PlayerSide]: string};
    /** Side of the battle that won. */
    winner?: PlayerSide;
    /** Whether the battle was truncated due to max turn limit or error. */
    truncated?: boolean;
    /** Resolved path to the log file. */
    logPath?: string;
    /** Captured exception with stack trace if it was thrown during the game. */
    err?: string;
}

interface AgentProtocolBase<T extends string = string> {
    type: T;
    /** Battle identifier. */
    battle: string;
    /** Name of agent model. */
    name: string;
}

/**
 * Requests a prediction from the agent server. Sent as a multipart message with
 * the first part being this JSON and the second part being a buffer containing
 * the encoded state data.
 */
export interface AgentRequest extends AgentProtocolBase<"agent"> {
    /** Available choices. */
    choices: Action[];
    /** Last taken action. For experience generation. */
    lastAction?: Action;
    /** Reward from taken action. For experience generation. */
    reward?: number;
}

/** Result from prediction. */
export interface AgentReply extends AgentProtocolBase<"agent"> {
    /** Sorted choices according to agent-evaluated selection priority. */
    rankedActions: Action[];
}

/**
 * Indicates that the agent has finished battling. Includes extra info for
 * experience generation if the agent was
 * {@link BattleAgentOptions.experience configured} for it and the battle
 * completed fully without being truncated due to max turn limit or error.
 */
export interface AgentFinalRequest extends AgentProtocolBase<"agent_final"> {
    /** Final action. */
    action?: Action;
    /** Final reward. */
    reward?: number;
    /** Whether the battle properly ended in a win, loss, or tie. */
    terminated?: boolean;
}
