"""
Describes the JSON protocol for the BattlePool.

MUST keep this in sync with src/ts/battle/worker/protocol.ts.
"""
from typing import Optional, TypedDict


class WorkerReady(TypedDict):
    """Sent by the simulator workers after starting."""

    type: str
    """Must be `"ready"`."""


class WorkerAck(TypedDict):
    """Sent to the simulator workers to acknowledge WorkerReady."""

    type: str
    """Must be `"ack"`."""


PRNGSeed = list[int]
"""Seed type for the PS simulator's PRNG. Should be a list of 4 16-bit ints."""


class BattleAgentOptions(TypedDict):
    """Options for configuring an agent for use in a battle simulation."""

    name: str
    """Name of agent."""

    type: str
    """Type of agent."""

    model: Optional[str]
    """If `type="model"`, name of the model to request predictions for."""

    experience: Optional[bool]
    """
    If `type="model"`, whether to include experience data in agent requests.
    """
    teamSeed: Optional[PRNGSeed]
    """Seed for random team init."""

    randSeed: Optional[str]
    """Seed for random agent."""


class BattleRequest(TypedDict):
    """Sent to a simulator worker to start a battle simulation."""

    type: str
    """Must be `"battle"`."""

    id: str
    """Battle identifier."""

    agents: dict[str, BattleAgentOptions]
    """Agents to use in the battle. Must have `"p1"` and `"p2"` keys defined."""

    maxTurns: Optional[int]
    """Optional max turn limit before truncation."""

    logPath: Optional[str]
    """Path to the file in which to store battle logs."""

    onlyLogOnError: Optional[bool]
    """
     * If {@link logPath} is provided, whether to only store logs if the battle
     * encounters an error. If not provided, this is always true and a temp file
     * will be used.
    """

    seed: Optional[PRNGSeed]
    """Seed for battle engine."""

    timeoutMs: Optional[int]
    """
    Simulator timeout in milliseconds for processing battle-related actions and
    events. Used for catching rare async bugs.
    """


class BattleReply(TypedDict):
    """Result of finished battle."""

    type: str
    """Must be `"battle"`."""

    id: str
    """Battle identifier."""

    agents: dict[str, str]
    """Names of the agents from the original request."""

    winner: Optional[str]
    """Side of the battle that won."""

    truncated: Optional[bool]
    """Whether the battle was truncated due to max turn limit or error."""

    logPath: Optional[str]
    """Resolved path to the log file."""

    err: Optional[str]
    """Captured exception with stack trace if it was thrown during the game."""


class AgentRequest(TypedDict):
    """Sent by a simulator worker to request a model prediction."""

    type: str
    """Must be `"agent"`."""

    battle: str
    """Battle identifier."""

    name: str
    """Name of agent model."""

    choices: list[str]
    """Available choices."""

    lastAction: Optional[str]
    """Last taken action, for experience collection."""

    reward: Optional[float]
    """Reward from taken action, for experience collection."""


class AgentReply(TypedDict):
    """Result from model prediction, sent to the worker."""

    type: str
    """Must be `"agent"`."""

    battle: str
    """Battle identifier."""

    name: str
    """Name of agent model."""

    rankedActions: list[str]
    """Sorted choices according to the agent model."""


class AgentFinalRequest(TypedDict):
    """Indicates agent termination."""

    type: str
    """Must be `"agent_final"`."""

    battle: str
    """Battle identifier."""

    name: str
    """Name of agent model."""

    action: Optional[str]
    """Final action."""

    reward: Optional[float]
    """Final reward."""

    terminated: Optional[bool]
    """Whether the battle properly ended in a win, loss, or tie."""
