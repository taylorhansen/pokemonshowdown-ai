"""Main RL environment for training script."""
import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple, Optional, TypedDict, TypeVar, Union, cast

import numpy as np
import tensorflow as tf
import zmq

from ..gen.shapes import ACTION_IDS, ACTION_NAMES, STATE_SIZE
from .environment import Environment
from .utils.battle_pool import AgentKey, BattleKey, BattlePool, BattlePoolConfig
from .utils.protocol import AgentFinalRequest, AgentRequest, BattleReply


@dataclass
class BattleEnvConfig:
    """Config for the battle environment."""

    max_turns: int
    """Max amount of turns before game truncation."""

    batch_limit: int
    """
    Max number of parallel environment steps for batch inference, excluding
    terminal or truncation steps. Useful for increasing throughput.
    """

    pool: BattlePoolConfig
    """Config for the worker pool."""

    state_type: str = "numpy"
    """
    Array type used to store game state data. Either `"numpy"` for NumPy arrays,
    or `"tensor"` for TensorFlow tensors. Recommended to use tensor for
    evaluation and numpy for training, unless your GPU has enough VRAM to
    contain the entire replay buffer in which case tensor can be used on both.
    """

    @classmethod
    def from_dict(cls, config: dict):
        """Creates a BattleEnvConfig from a JSON dictionary."""
        config["pool"] = BattlePoolConfig(**config["pool"])
        return cls(**config)


@dataclass
class RolloutOpponentConfig:
    """Config for rollout opponents."""

    name: str
    """Display name of agent for logging."""

    prob: float
    """Fraction of rollout battles to run against this agent."""

    type: str
    """Agent type. Can be a builtin agent or `"model"` for a custom model."""

    model: Optional[str] = None
    """If `type="model"`, specifies the name of the model."""


@dataclass
class EvalOpponentConfig:
    """Config for model evaluation opponents."""

    name: str
    """Display name of agent for logging."""

    battles: int
    """Number of battles to run against this agent."""

    type: str
    """Agent type. Can be a builtin agent or `"model"` for a custom model."""

    model: Optional[str] = None
    """If `type="model"`, specifies the name of the model."""


T = TypeVar("T")
AgentDict = dict[AgentKey, T]
"""Maps AgentKey tuples to a value."""


class InfoDict(TypedDict, total=False):
    """Additional info for agents/battles in the BattleEnv."""

    choices: np.ndarray
    """Action legality mask for the agent."""

    action: int
    """
    The action, out of the agent's previously-sent ranked actions, that was
    executed in the battle.
    """

    battle_result: BattleReply
    """
    Stores the result of the battle. This is the only attribute of this dict
    when the outer AgentDict's mapped AgentKey is `(battle, player="__env__")`.
    """


class BattleEnv(Environment):
    """
    Multi-agent Pokemon battle environment supporting multiple parallel games.
    """

    def __init__(
        self,
        config: BattleEnvConfig,
        rng: Optional[tf.random.Generator] = None,
        sock_id: Optional[str] = None,
        log_path: Optional[Path] = None,
    ):
        """
        Creates a BattleEnv.

        :param config: Config for environment.
        :param rng: Optional random number generator.
        :param sock_id: String id for socket names.
        :param log_path: Path to store battle logs.
        """
        super().__init__()
        self.config = config

        self.battle_pool = BattlePool(
            config=config.pool,
            rng=rng,
            sock_id=sock_id,
            log_path=log_path,
        )
        self.queue_task: Optional[asyncio.Task[None]] = None
        self.active_battles: dict[BattleKey, ActiveBattle] = {}

        self._zero_state = (
            tf.zeros(shape=(STATE_SIZE,), dtype=tf.float32)
            if config.state_type == "tensor"
            else np.zeros(shape=(STATE_SIZE,), dtype=np.float32)
        )

    def __del__(self):
        self.close()

    def close(self):
        """Closes the env."""
        for battle in self.active_battles.values():
            battle.task.cancel("BattleEnv.close() was called")
        self.active_battles.clear()
        if self.queue_task is not None:
            self.queue_task.cancel("BattleEnv.close() was called")
            self.queue_task = None
        self.battle_pool.close()

    async def ready(self):
        """Initializes the simulator workers."""
        return await self.battle_pool.ready()

    def reset(
        self,
        rollout_battles=0,
        rollout_opponents: tuple[RolloutOpponentConfig, ...] = (),
        eval_opponents: tuple[EvalOpponentConfig, ...] = (),
    ) -> tuple[AgentDict[Union[np.ndarray, tf.Tensor]], AgentDict[InfoDict]]:
        """
        Resets the env.

        :param rollout_battles: Total number of battles to run against
        randomly-selected `rollout_opponents`.
        :param rollout_opponents: Config for queueing rollout battles. The agent
        will play against itself with probability equalling the complement of
        the summed opponent probabilities, and will otherwise play against one
        of those opponents with probabilities corresponding to the given config.
        :param eval_opponents: Config for queueing evaluation battles. Queues
        each opponent's total number of battles sequentially.
        :returns: Initial state/info dicts.
        """
        for battle in self.active_battles.values():
            battle.task.cancel("BattleEnv.close() was called")
        self.active_battles.clear()
        if self.queue_task is not None:
            self.queue_task.cancel("BattleEnv.close() was called")
            self.queue_task = None

        self.queue_task = asyncio.create_task(
            self._queue_battles(
                rollout_battles=rollout_battles,
                rollout_opponents=rollout_opponents,
                eval_opponents=eval_opponents,
            ),
            name="queue_battles",
        )
        return {}, {}

    async def _queue_battles(
        self,
        rollout_battles=0,
        rollout_opponents: tuple[RolloutOpponentConfig, ...] = (),
        eval_opponents: tuple[EvalOpponentConfig, ...] = (),
    ):
        async for key, active_agents in self._queue_battle_keys(
            rollout_battles=rollout_battles,
            rollout_opponents=rollout_opponents,
            eval_opponents=eval_opponents,
        ):
            assert (
                self.active_battles.get(key, None) is None
            ), f"Battle with key {key} is already active"
            self.active_battles[key] = ActiveBattle(
                task=asyncio.create_task(
                    self.battle_pool.await_battle(key),
                    name=f"await_{key.worker_id.decode()}_{key.battle_id}",
                ),
                active_agents=active_agents,
            )

    async def _queue_battle_keys(
        self,
        rollout_battles=0,
        rollout_opponents: tuple[RolloutOpponentConfig, ...] = (),
        eval_opponents: tuple[EvalOpponentConfig, ...] = (),
    ):
        agent1 = "model"
        agent1_model = "model/p1"
        if rollout_battles > 0:
            probs = np.fromiter(
                (opp.prob for opp in rollout_opponents),
                dtype=np.float32,
                count=len(rollout_opponents),
            )
            probs = np.append(probs, [1 - np.sum(probs)])

            rollout_np = np.array(
                [
                    *rollout_opponents,
                    RolloutOpponentConfig(
                        name="self",
                        prob=probs[-1],
                        type="model",
                        model="model/p2",
                    ),
                ],
                dtype=np.object_,
            )
            for _ in range(rollout_battles):
                rollout_opp: RolloutOpponentConfig = np.random.choice(
                    rollout_np, p=probs
                )
                active_agents = {agent1_model}
                agent2_training = False
                if rollout_opp.type == "model":
                    assert rollout_opp.model is not None
                    active_agents.add(rollout_opp.model)
                    if rollout_opp.model.startswith("model/"):
                        agent2_training = True
                yield await self.battle_pool.queue_battle(
                    max_turns=self.config.max_turns,
                    agent1=agent1,
                    agent1_model=agent1_model,
                    agent2=rollout_opp.name,
                    agent2_type=rollout_opp.type,
                    agent2_model=rollout_opp.model,
                    training=(True, agent2_training),
                    suffix=f"_{rollout_opp.name}",
                ), active_agents

        for eval_opp in eval_opponents:
            for _ in range(eval_opp.battles):
                active_agents = {agent1_model}
                if eval_opp.type == "model":
                    assert eval_opp.model is not None
                    active_agents.add(eval_opp.model)
                yield await self.battle_pool.queue_battle(
                    max_turns=self.config.max_turns,
                    agent1=agent1,
                    agent1_model=agent1_model,
                    agent2=eval_opp.name,
                    agent2_type=eval_opp.type,
                    agent2_model=eval_opp.model,
                    suffix=f"_{eval_opp.name}",
                ), active_agents

    async def step(
        self, action: AgentDict[list[str]]
    ) -> tuple[
        AgentDict[Union[np.ndarray, tf.Tensor]],
        AgentDict[float],
        AgentDict[bool],
        AgentDict[bool],
        AgentDict[InfoDict],
        bool,
    ]:
        """
        Steps the environment using agent actions that were previously requested
        by one of the battle envs.

        :param action: Dictionary of arrays containing the ids of actions
        sorted by agent-evaluated ranking. Should only be defined for the
        non-terminated/truncated agents returned by the previous `env.step()`
        call. Should be empty on the first call.
        :returns: A tuple containing:

        1. `state`: Dictionary of encoded battle states for each stepped agent.
        Entry is zeroed if the agent observes a terminal state or the game is
        truncated.
        2. `reward`: Dictionary of rewards for each stepped agent.
        3. `terminated`: Dictionary of bools for each stepped agent as to
        whether the battle has been completed from the agent's perspective.
        4. `truncated`: Dictionary of bools for each stepped agent as to whether
        the battle has been truncated from the agent's perspective. Any info
        stored in the other returned dicts for battle/agent combos with this
        flag set should be ignored.
        4. `info`: Dictionary of additional info dicts for each stepped agent
        (or `player="__env__"` for current battle) to an additional info
        dictionary containing:
              - `choices`: Available actions for the next state. If the battle
                ended, this will be empty.
              - `action`: Action id that was taken out of `actions`. If
                truncated, this will be -1.
              - `battle_result` If agent key is `__env__`, maps to a dictionary
                containing the battle results.
        5. `done`: Whether all of the battles have finished and this env should
        be `reset()`.
        """
        for key, ranked_actions in action.items():
            await self.battle_pool.agent_send(key, ranked_actions)

        states: AgentDict[Union[np.ndarray, tf.Tensor]] = {}
        rewards: AgentDict[float] = {}
        terminateds: AgentDict[bool] = {}
        truncateds: AgentDict[bool] = {}
        infos: AgentDict[InfoDict] = {}

        # Consume all currently-pending agent requests (up to batch_limit), or
        # wait for one.
        num_pending = 0
        all_reqs: AgentDict[Union[AgentRequest, AgentFinalRequest]] = {}
        while (
            (
                self.config.batch_limit <= 0
                or num_pending < self.config.batch_limit
            )
            and (
                len(self.active_battles) > 0
                or (self.queue_task is not None and not self.queue_task.done())
            )
            and await self.battle_pool.agent_poll(
                timeout=0
                if len(all_reqs) > 0
                else self.config.pool.worker_timeout_ms
            )
        ):
            key, req, state = await self.battle_pool.agent_recv(
                flags=zmq.DONTWAIT
            )
            assert all_reqs.get(key, None) is None, (
                f"Received too many agent requests for {key}: "
                f"{(req)}, previous {all_reqs[key]}"
            )
            all_reqs[key] = req
            if req["type"] == "agent":
                req = cast(AgentRequest, req)
                assert (
                    key.player in self.active_battles[key.battle].active_agents
                )
                assert state is not None
                if self.config.state_type == "tensor":
                    states[key] = tf.convert_to_tensor(state, dtype=tf.float32)
                elif self.config.state_type == "numpy":
                    states[key] = state
                else:
                    raise RuntimeError(
                        f"Unknown state_type '{self.config.state_type}'"
                    )
                rewards[key] = (
                    req["reward"]
                    if "reward" in req and req["reward"] is not None
                    else 0.0
                )
                terminateds[key] = False
                truncateds[key] = False
                infos[key] = {
                    "choices": BattleEnv._translate_choices(req["choices"]),
                    "action": ACTION_IDS[req["lastAction"]]
                    if "lastAction" in req and req["lastAction"] is not None
                    else -1,
                }
                num_pending += 1
            elif req["type"] == "agent_final":
                # Note: Don't count final transitions under the batch_limit.
                req = cast(AgentFinalRequest, req)
                assert state is None
                states[key] = self._zero_state
                rewards[key] = (
                    req["reward"]
                    if "reward" in req and req["reward"] is not None
                    else 0.0
                )
                terminateds[key] = "terminated" in req and bool(
                    req["terminated"]
                )
                truncateds[key] = not terminateds[key]
                infos[key] = {
                    "choices": BattleEnv._translate_choices([]),
                    "action": ACTION_IDS[req["action"]]
                    if "action" in req and req["action"] is not None
                    else -1,
                }
                battle = self.active_battles[key.battle]
                battle.active_agents.remove(key.player)
                if len(battle.active_agents) <= 0:
                    # Battle has finished for all agent perspectives.
                    self.active_battles.pop(key.battle)
                    agent_key = AgentKey(battle=key.battle, player="__env__")
                    battle_result = await asyncio.wait_for(
                        battle.task, timeout=10
                    )
                    infos[agent_key] = {"battle_result": battle_result}

        done = False
        if len(self.active_battles) <= 0 and (
            self.queue_task is None or self.queue_task.done()
        ):
            # All battles have finished.
            self.queue_task = None
            done = True

        return states, rewards, terminateds, truncateds, infos, done

    @staticmethod
    def _translate_choices(choices: list[str]) -> np.ndarray:
        """Converts JSON choice array to action mask array."""
        indices = np.fromiter(
            (ACTION_IDS[choice] for choice in choices),
            dtype=np.int32,
            count=len(choices),
        )
        mask = np.zeros(shape=(len(ACTION_NAMES),), dtype=np.float32)
        mask[indices] = 1
        return mask


class ActiveBattle(NamedTuple):
    """Used by BattleEnv to keep track of individual active battles."""

    task: asyncio.Task[BattleReply]
    """Task to await the battle's result."""

    active_agents: set[str]
    """Ids of the agents that are currently battling."""
