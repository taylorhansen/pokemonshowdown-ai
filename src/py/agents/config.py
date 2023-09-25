"""Common config typings for agents."""
from dataclasses import dataclass
from typing import Any, Optional

import tensorflow as tf

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


# Note: Use dataclass rather than TypedDict to enforce serialization format.
@dataclass
class KerasObjectConfig:
    """Config for a serialized Keras object."""

    class_name: str
    """Name of the object's class, e.g. `Adam`."""

    config: dict[str, Any]
    """Constructor args for the class, e.g. `learning_rate`."""

    module: str
    """Module where the class is found in, e.g. `keras.optimizers`."""

    registered_name: Optional[str] = None
    """Name under which the class was registered as a Keras serializable."""

    def deserialize(self):
        """Gets the Keras object described by this config."""
        return tf.keras.saving.deserialize_keras_object(self.__dict__)
