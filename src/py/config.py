"""Config typings for the training script."""
from dataclasses import dataclass
from typing import Optional, Union

from .agents.dqn_agent import DQNAgentConfig
from .agents.drqn_agent import DRQNAgentConfig
from .environments.battle_env import (
    BattleEnvConfig,
    EvalOpponentConfig,
    RolloutOpponentConfig,
)


@dataclass
class AgentConfig:
    """Config for agent algorithm."""

    type: str
    """
    Type of agent algorithm to use. Supported values are `"dqn"` and `"drqn"`.
    """

    config: Union[DQNAgentConfig, DRQNAgentConfig]
    """Config for chosen agent algorithim."""

    @classmethod
    def from_dict(cls, config: dict):
        """Creates an AgentConfig from a JSON dictionary."""
        if config["type"] == "dqn":
            config["config"] = DQNAgentConfig.from_dict(config["config"])
        elif config["type"] == "drqn":
            config["config"] = DRQNAgentConfig.from_dict(config["config"])
        else:
            raise ValueError(f"Unknown agent type '{config['type']}'")
        return cls(**config)


@dataclass
class RolloutConfig:
    """Config for rollout."""

    num_episodes: int
    """Number of self-play battles to run."""

    eps_per_eval: int
    """Episode interval for running evaluation battles."""

    eps_per_ckpt: Optional[int]
    """Episode interval for storing checkpoints. Set to None to disable."""

    eps_per_prev_update: Optional[int]
    """
    Episode interval for updating the previous network. Set to None to disable.
    """

    env: BattleEnvConfig
    """Config for setting up rollout environment."""

    opponents: tuple[RolloutOpponentConfig, ...] = ()
    """
    Additional opponents to train against outside of self-play. Experience is
    not collected from these agents but will still be collected from the main
    agent.
    """

    @classmethod
    def from_dict(cls, config: dict):
        """Creates a RolloutConfig from a JSON dictionary."""
        config["env"] = BattleEnvConfig.from_dict(config["env"])
        config["opponents"] = tuple(
            RolloutOpponentConfig(**cfg) for cfg in config["opponents"]
        )
        return cls(**config)


@dataclass
class EvalConfig:
    """Config for model evaluation."""

    env: BattleEnvConfig
    """Config for setting up evaluation environment."""

    opponents: tuple[EvalOpponentConfig, ...]
    """Baseline agents for evaluation against the trained model."""

    @classmethod
    def from_dict(cls, config: dict):
        """Creates an EvalConfig from a JSON dictionary."""
        config["env"] = BattleEnvConfig.from_dict(config["env"])
        config["opponents"] = tuple(
            EvalOpponentConfig(**cfg) for cfg in config["opponents"]
        )
        return cls(**config)


@dataclass
class TrainConfig:
    """Typings for the training config file."""

    name: str
    """Name of the training run under which to store logs."""

    seed: Optional[int]
    """Random seed for reproducibility. If None, a random seed is used."""

    save_path: Optional[str]
    """
    Path to the folder in which store battle logs, training metrics, etc. under
    the prefix specified by `name`.
    """

    agent: AgentConfig
    """Config for agent algorithm."""

    rollout: RolloutConfig
    """Config for rollout."""

    eval: EvalConfig
    """Config for evaluation."""

    @classmethod
    def from_dict(cls, config: dict):
        """Creates a TrainConfig from a JSON dictionary."""
        config["agent"] = AgentConfig.from_dict(config["agent"])
        config["rollout"] = RolloutConfig.from_dict(config["rollout"])
        config["eval"] = EvalConfig.from_dict(config["eval"])
        return cls(**config)
