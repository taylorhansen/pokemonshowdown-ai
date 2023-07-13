"""Config typings."""
from dataclasses import dataclass
from typing import Optional, Union


@dataclass
class DQNModelConfig:
    """Config for the DQN model."""

    dueling: bool = False
    """Whether to use dueling DQN architecture."""

    dist: Optional[int] = None
    """Number of atoms for Q-value distribution. Omit to disable."""

    use_layer_norm: bool = False
    """Whether to use layer normaliation."""

    attention: bool = True
    """
    Whether to use attention layers to encode move and pokemon information.
    """

    pooling: str = "attention"
    """
    Pooling method to use for movesets and teams. Supported options are
    `attention`, `mean`, and `max`.
    """


@dataclass
class DRQNModelConfig(DQNModelConfig):
    """Config for the DRQN model."""


@dataclass
class ExplorationConfig:
    """Defines schedule for decayed epsilon-greedy."""

    decay_type: str
    """Algorithm for decay schedule. Can be `"linear"` or `"exponential"`."""

    start: float
    """Beginning exploration rate."""

    end: float
    """End exploration rate."""

    episodes: int
    """
    Number of episodes it should take to decay the exploration rate from `start`
    to `end`.
    """


@dataclass
class ExperienceConfig:
    """Config for experience collection."""

    n_steps: int
    """
    Number of lookahead steps for n-step returns, or zero to lookahead to the
    end of the episode (i.e. Monte Carlo returns).
    """

    discount_factor: float
    """Discount factor for future rewards."""

    buffer_size: int
    """Size of the replay buffer for storing experience."""


@dataclass
class DQNLearnConfig:
    """Config for DQN learning algorithm."""

    buffer_prefill: int
    """
    Fill replay buffer with some experience before starting training. Must be
    larger than `batch_size`.
    """

    learning_rate: float
    """Learning rate for gradient descent."""

    batch_size: int
    """
    Batch size for gradient descent. Must be smaller than `buffer_prefill`.
    """

    steps_per_update: int
    """Step interval for computing model updates."""

    steps_per_target_update: int
    """Step interval for updating the target network."""

    steps_per_histogram: Optional[int] = None
    """
    Step interval for storing histograms of model weights, gradients, etc. Set
    to None to disable.
    """


@dataclass
class DRQNLearnConfig(DQNLearnConfig):
    """Config for DRQN learning algorithm."""


@dataclass
class DQNConfig:
    """Config for DQN algorithm."""

    model: DQNModelConfig
    """Config for the model."""

    exploration: Union[float, ExplorationConfig]
    """
    Exploration rate for epsilon-greedy. Either a constant or a decay schedule.
    """

    experience: ExperienceConfig
    """Config for experience collection."""

    learn: DQNLearnConfig
    """Config for learning."""

    @classmethod
    def from_dict(cls, config: dict):
        """Creates a DQNConfig from a JSON dictionary."""
        config["model"] = DQNModelConfig(**config["model"])
        if not isinstance(config["exploration"], float):
            config["exploration"] = ExplorationConfig(**config["exploration"])
        config["experience"] = ExperienceConfig(**config["experience"])
        config["learn"] = DQNLearnConfig(**config["learn"])
        return cls(**config)


@dataclass
class DRQNConfig:
    """
    Config for DRQN algorithm.

    This is the recurrent version of DQN, where recurrent hidden states are
    tracked and the replay buffer stores entire episodes from one perspective of
    the battle. As such, learning steps are not counted by individual
    environment steps (i.e. experiences or state transitions) but instead by
    collected trajectories.
    """

    model: DRQNModelConfig
    """Config for the model."""

    exploration: Union[float, ExplorationConfig]
    """
    Exploration rate for epsilon-greedy. Either a constant or a decay schedule.
    """

    experience: ExperienceConfig
    """Config for experience collection."""

    learn: DRQNLearnConfig
    """Config for learning."""

    unroll_length: int
    """
    Number of agent steps to unroll at once when storing trajectories in the
    replay buffer and later learning from them.
    """

    burn_in: int = 0
    """
    Number of agent steps to include before the main unroll that gets skipped
    during learning, used only for deriving a useful hidden state before
    learning on the main `unroll_length`.

    Used in the R2D2 paper to counteract staleness in the hidden states that get
    stored in the replay buffer.
    https://openreview.net/pdf?id=r1lyTjAqYX
    """

    @classmethod
    def from_dict(cls, config: dict):
        """Creates a DRQNConfig from a JSON dictionary."""
        config["model"] = DRQNModelConfig(**config["model"])
        if not isinstance(config["exploration"], float):
            config["exploration"] = ExplorationConfig(**config["exploration"])
        config["experience"] = ExperienceConfig(**config["experience"])
        config["learn"] = DRQNLearnConfig(**config["learn"])
        return cls(**config)


@dataclass
class AgentConfig:
    """Config for agent algorithm."""

    type: str
    """
    Type of agent algorithm to use. Supported values are `"dqn"` and `"drqn"`.
    """

    config: Union[DQNConfig, DRQNConfig]
    """Config for chosen agent algorithim."""

    @classmethod
    def from_dict(cls, config: dict):
        """Creates an AgentConfig from a JSON dictionary."""
        if config["type"] == "dqn":
            config["config"] = DQNConfig.from_dict(config["config"])
        elif config["type"] == "drqn":
            config["config"] = DRQNConfig.from_dict(config["config"])
        else:
            raise ValueError(f"Unknown agent type '{config['type']}'")
        return cls(**config)


@dataclass
class BattlePoolConfig:
    """Config for setting up simulator workers."""

    workers: int
    """Number of parallel workers to create."""

    per_worker: int
    """
    Number of async-parallel battles per worker. Useful for increasing
    throughput.
    """

    battles_per_log: Optional[int] = None
    """
    Store battle logs every `battles_per_log` battles. Always stored on error
    regardless of this value. Omit to not store logs except on error.
    """


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
