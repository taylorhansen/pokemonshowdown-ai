"""Common config typings for agents."""
from dataclasses import dataclass
from typing import Optional

from .utils.replay_buffer import PriorityConfig


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

    priority: Optional[PriorityConfig] = None
    """Config for priority replay."""

    @classmethod
    def from_dict(cls, config: dict):
        """Creates an ExperienceConfig from a JSON dictionary."""
        if config.get("priority", None) is not None:
            config["priority"] = PriorityConfig.from_dict(config["priority"])
        return cls(**config)
