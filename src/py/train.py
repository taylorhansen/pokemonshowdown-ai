"""Main training script."""
import argparse
import asyncio
import math
import os
from collections import defaultdict
from contextlib import closing
from dataclasses import dataclass
from functools import reduce
from itertools import chain
from pathlib import Path
from typing import Optional, TextIO, Union

if (
    __name__ == "__main__"
    and os.environ.get("TF_CPP_MIN_LOG_LEVEL", None) is None
):
    # Prevent log spam when compiling graphs.
    os.environ["TF_CPP_MIN_LOG_LEVEL"] = "1"

# pylint: disable=wrong-import-position
import tensorflow as tf
import yaml
from tqdm import tqdm

from .agents.dqn_agent import DQNAgent, DQNAgentConfig
from .agents.drqn_agent import DRQNAgent, DRQNAgentConfig
from .config import TrainConfig
from .environments.battle_env import BattleEnv, EvalOpponentConfig
from .utils.paths import DEFAULT_CONFIG_PATH, PROJECT_DIR
from .utils.random import randstr
from .utils.tqdm_redirect import std_out_err_redirect_tqdm


@dataclass
class Wlt:
    """Win-loss-tie container for evaluation step."""

    wins: int = 0
    losses: int = 0
    ties: int = 0
    total: int = 0

    @property
    def win_rate(self):
        """Ratio of wins to total battles."""
        return float(self.wins) / self.total

    @property
    def loss_rate(self):
        """Ratio of losses to total battles."""
        return float(self.losses) / self.total

    @property
    def tie_rate(self):
        """Ratio of ties to total battles."""
        return float(self.ties) / self.total

    def win(self):
        """Add win."""
        self.wins += 1
        self.total += 1

    def lose(self):
        """Add loss."""
        self.losses += 1
        self.total += 1

    def tie(self):
        """Add tie."""
        self.ties += 1
        self.total += 1

    def __repr__(self):
        return f"{self.wins}-{self.losses}-{self.ties}"


async def run_eval(
    prefix: str,
    episode: tf.Variable,
    agent: Union[DQNAgent, DRQNAgent],
    env: BattleEnv,
    opponents: tuple[EvalOpponentConfig, ...],
    progbar_file: TextIO,
    writer: Optional[tf.summary.SummaryWriter] = None,
):
    """Runs evaluation games for the current model against baseline agents."""
    wlts = defaultdict[str, Wlt](Wlt)
    max_battles = dict((opp.name, opp.battles) for opp in opponents)
    with tqdm(
        desc=f"{prefix}: Eval",
        total=reduce(lambda a, x: a + x, max_battles.values()),
        leave=True,
        file=progbar_file,
        unit="battles",
        unit_scale=True,
        dynamic_ncols=True,
        position=1,
    ) as pbar:
        state, info = env.reset(eval_opponents=opponents)
        done = False
        while not done:
            action = agent.select_action(
                state, info, episode=episode, can_explore=False
            )
            state, _, terminated, truncated, info, done = await env.step(action)
            for key, ended in chain(terminated.items(), truncated.items()):
                if ended:
                    state.pop(key)
                    info.pop(key)
                    if isinstance(agent, DRQNAgent):
                        # Note: This is usually handled by update_model() but we
                        # have to do this manually during evaluation to prevent
                        # memory leaks.
                        agent.reset(key)
            for key, env_info in info.items():
                if key.player != "__env__":
                    continue
                battle_result = env_info.get("battle_result", None)
                if battle_result is None:
                    continue
                # Finished an evaluation battle.
                opp_name = battle_result["agents"]["p2"]
                wlt = wlts[opp_name]
                winner = battle_result.get("winner", None)
                if winner is None:
                    wlt.tie()
                elif winner == "p1":
                    wlt.win()
                else:
                    wlt.lose()
                if wlt.total >= max_battles[opp_name]:
                    # Finished all evaluation battles against an opponent.
                    tqdm.write(f"{prefix}: Eval vs {opp_name}: {wlt!r}")
                    if writer is not None:
                        with writer.as_default(step=episode):
                            tf.summary.scalar(
                                f"eval/{opp_name}/win_rate", wlt.win_rate
                            )
                            tf.summary.scalar(
                                f"eval/{opp_name}/loss_rate", wlt.loss_rate
                            )
                            tf.summary.scalar(
                                f"eval/{opp_name}/tie_rate", wlt.tie_rate
                            )

                pbar.update()


# pylint: disable-next=too-many-branches
async def train(config: TrainConfig):
    """Main training script."""
    save_path: Optional[Path] = None
    writer: Optional[tf.summary.SummaryWriter] = None
    if config.save_path is not None:
        save_path = Path(PROJECT_DIR, config.save_path, config.name).resolve()
        print(f"Configured to write training logs to {save_path}")

        metrics_path = Path(save_path, "metrics").resolve()
        writer = tf.summary.create_file_writer(os.fspath(metrics_path))
        writer.init()
        writer.set_as_default()
        print(f"Configured to write TensorBoard metrics to {metrics_path}")

    if config.seed is not None:
        tf.keras.utils.set_random_seed(config.seed)

    rng = (
        tf.random.Generator.from_seed(
            tf.random.uniform(shape=(), maxval=tf.int64.max, dtype=tf.int64)
        )
        if config.seed is not None
        else tf.random.get_global_generator()
    )

    agent: Union[DQNAgent, DRQNAgent]
    if config.agent.type == "dqn":
        assert isinstance(config.agent.config, DQNAgentConfig)
        agent = DQNAgent(config=config.agent.config, rng=rng, writer=writer)
    elif config.agent.type == "drqn":
        assert isinstance(config.agent.config, DRQNAgentConfig)
        agent = DRQNAgent(config=config.agent.config, rng=rng, writer=writer)
    else:
        raise ValueError(f"Unknown agent type '{config.agent.type}'")

    env_id = randstr(rng, 6)
    env = BattleEnv(
        config=config.rollout.env,
        rng=rng,
        sock_id=env_id,
        log_path=Path(save_path, "battles", "rollout").resolve()
        if save_path is not None
        else None,
    )
    await env.ready()

    while (eval_id := randstr(rng, 6)) == env_id:
        pass
    eval_env = BattleEnv(
        config=config.eval.env,
        rng=rng,
        sock_id=eval_id,
        log_path=Path(save_path, "battles", "eval").resolve()
        if save_path is not None
        else None,
    )
    await eval_env.ready()

    # Current episode number.
    episode = tf.Variable(0, name="episode", dtype=tf.int64)
    num_ties = tf.Variable(0, name="num_ties", dtype=tf.int64)

    ckpt: Optional[tf.train.Checkpoint] = None
    ckpt_manager: Optional[tf.train.CheckpointManager] = None
    ckpt_options: Optional[tf.train.CheckpointOptions] = None
    restored = False
    if save_path is not None:
        ckpt_dir = Path(save_path, "checkpoints").resolve()
        ckpt = tf.train.Checkpoint(
            episode=episode,
            num_ties=num_ties,
            rng=rng,
            model=agent.model,
            previous=agent.previous,
            target=agent.target,
            optimizer=agent.optimizer,
            step=agent.step,
        )
        ckpt_manager = tf.train.CheckpointManager(ckpt, ckpt_dir, max_to_keep=5)
        print(f"Configured to write checkpoints to {ckpt_dir}")

        ckpt_options = tf.train.CheckpointOptions(enable_async=True)
        if (restore_path := ckpt_manager.restore_or_initialize()) is not None:
            print(f"Restored from {restore_path}")
            restored = True
            print(f"Last completed episode: {int(episode)}")
            episode.assign_add(1, read_value=False)

    eps_padding = 1 + math.floor(math.log10(config.rollout.num_episodes))
    eps_fmt = "{: >" + str(eps_padding) + "d}"
    with closing(env), closing(
        eval_env
    ), std_out_err_redirect_tqdm() as original_stdout, tqdm(
        desc="Episode",
        total=config.rollout.num_episodes,
        leave=True,
        file=original_stdout,
        unit="eps",
        unit_scale=True,
        dynamic_ncols=True,
        smoothing=0.1,
        initial=min(int(episode), config.rollout.num_episodes),
        position=0,
    ) as pbar:
        if config.rollout.eps_per_eval > 0 and not restored and episode == 0:
            # Pre-evaluation for comparison against the later trained model.
            await run_eval(
                prefix=eps_fmt.format(int(episode)),
                episode=episode,
                agent=agent,
                env=eval_env,
                opponents=config.eval.opponents,
                progbar_file=original_stdout,
                writer=writer,
            )

        rollout_battles = max(0, config.rollout.num_episodes - int(episode))
        state, info = env.reset(
            rollout_battles=rollout_battles,
            rollout_opponents=config.rollout.opponents,
        )
        done = False
        while not done:
            if rollout_battles <= 0:
                break
            action = agent.select_action(
                state, info, episode=episode, can_explore=True
            )
            (
                next_state,
                reward,
                terminated,
                truncated,
                info,
                done,
            ) = await env.step(action)
            agent.update_model(
                state,
                reward,
                next_state,
                terminated,
                truncated,
                info,
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

                # Finished a rollout episode.
                episode.assign_add(1, read_value=False)
                pbar.update()

                if battle_result.get("winner", None) is None:
                    num_ties.assign_add(1, read_value=False)
                if writer is not None:
                    with writer.as_default(step=episode):
                        tf.summary.scalar(
                            "rollout/tie_rate", num_ties / episode
                        )
                        tf.summary.scalar("rollout/num_ties", num_ties)
                        if config.agent.config.exploration is not None:
                            tf.summary.scalar(
                                "rollout/exploration",
                                agent.epsilon_greedy.get_epsilon(episode),
                            )
                if (
                    config.rollout.eps_per_eval > 0
                    and episode > 0
                    and episode % config.rollout.eps_per_eval == 0
                ):
                    await run_eval(
                        prefix=eps_fmt.format(int(episode)),
                        episode=episode,
                        agent=agent,
                        env=eval_env,
                        opponents=config.eval.opponents,
                        progbar_file=original_stdout,
                        writer=writer,
                    )
                if (
                    config.rollout.eps_per_prev_update is not None
                    and episode > 0
                    and episode % config.rollout.eps_per_prev_update == 0
                ):
                    agent.update_prev()
                if (
                    ckpt_manager is not None
                    and config.rollout.eps_per_ckpt is not None
                    and episode > 0
                    and episode % config.rollout.eps_per_ckpt == 0
                ):
                    ckpt_path = ckpt_manager.save(options=ckpt_options)
                    tqdm.write(
                        f"{eps_fmt.format(int(episode))}: "
                        f"Saved checkpoint: {ckpt_path}"
                    )

    if writer is not None:
        writer.flush()

    if save_path is not None:
        save_path = Path(save_path, "model").resolve()
        agent.model.save(save_path, save_traces=False)
        print(f"Saved model to {save_path}")


def main():
    """Main entry point for training script."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--config-file",
        default=DEFAULT_CONFIG_PATH,
        type=Path,
    )

    args = parser.parse_args()

    with args.config_file.open("r") as file:
        config = TrainConfig.from_dict(yaml.safe_load(file))

    asyncio.run(train(config=config))


if __name__ == "__main__":
    main()
