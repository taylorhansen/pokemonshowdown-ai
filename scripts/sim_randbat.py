"""Simulates a random battle used for training."""

import asyncio
import os
import sys
from contextlib import closing
from itertools import chain
from typing import Optional, Union

import numpy as np
import tensorflow as tf

# So that we can `python -m scripts.sim_randbat` from project root.
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# pylint: disable=wrong-import-position, import-error
from src.py.agents.agent import Agent
from src.py.agents.utils.epsilon_greedy import EpsilonGreedy
from src.py.environments.battle_env import (
    AgentDict,
    BattleEnv,
    BattleEnvConfig,
    EvalOpponentConfig,
    InfoDict,
)
from src.py.environments.utils.battle_pool import BattlePoolConfig
from src.py.models.utils.greedy import decode_action_rankings


class RandomAgent(Agent):
    """Agent that acts randomly."""

    def __init__(self, rng: Optional[tf.random.Generator] = None):
        self._epsilon_greedy = EpsilonGreedy(exploration=1.0, rng=rng)

    def select_action(
        self,
        state: AgentDict[Union[np.ndarray, tf.Tensor]],
        info: AgentDict[InfoDict],
    ) -> AgentDict[list[str]]:
        """Selects a random action."""
        _ = info
        return dict(
            zip(
                state.keys(),
                decode_action_rankings(
                    self._epsilon_greedy.rand_actions(len(state))
                ),
            )
        )

    def update_model(
        self, state, reward, next_state, terminated, truncated, info
    ):
        """Not implemented."""
        raise NotImplementedError


async def sim_randbat():
    """Starts the simulator."""

    rng = tf.random.get_global_generator()

    agent = RandomAgent(rng)

    env = BattleEnv(
        config=BattleEnvConfig(
            max_turns=50,
            batch_limit=4,
            pool=BattlePoolConfig(
                workers=2,
                per_worker=1,
                battles_per_log=1,
                worker_timeout_ms=1000,  # 1s
                sim_timeout_ms=60_000,  # 1m
            ),
            state_type="tensor",
        ),
        rng=rng,
    )
    await env.ready()

    with closing(env):
        state, info = env.reset(
            rollout_battles=10,
            eval_opponents=(
                EvalOpponentConfig(
                    name="eval_self", battles=10, type="model", model="model/p2"
                ),
            ),
        )
        done = False
        while not done:
            action = agent.select_action(state, info)
            (next_state, _, terminated, truncated, info, done) = await env.step(
                action
            )
            state = next_state
            for key, ended in chain(terminated.items(), truncated.items()):
                if ended:
                    state.pop(key)
                    info.pop(key)
            for key, env_info in info.items():
                if key.player != "__env__":
                    continue
                battle_result = env_info.get("battle_result", None)
                if battle_result is None:
                    continue
                print(battle_result)


def main():
    """Main entry point."""
    asyncio.run(sim_randbat())


if __name__ == "__main__":
    main()
