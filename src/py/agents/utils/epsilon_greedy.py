"""Epsilon-greedy implementation."""
from dataclasses import dataclass
from typing import Optional, Union

import tensorflow as tf

from ...gen.shapes import ACTION_NAMES


@dataclass
class ExplorationConfig:
    """Defines the schedule for decayed epsilon-greedy."""

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


class EpsilonGreedy:
    """Epsilon-greedy implementation."""

    def __init__(
        self,
        exploration: Union[float, ExplorationConfig],
        rng: Optional[tf.random.Generator] = None,
    ):
        """
        Creates an EpsilonGreedy object.

        :param exploration: Fixed exploration rate or decay schedule.
        :param rng: Random number generator.
        """
        self.exploration = exploration
        if rng is None:
            rng = tf.random.get_global_generator()
        self.rng = rng

    @tf.function(
        input_signature=[
            tf.TensorSpec(shape=(), dtype=tf.int32, name="num"),
            tf.TensorSpec(shape=(), dtype=tf.int64, name="episode"),
        ]
    )
    def explore(self, num, episode):
        """
        Determines the exploration split when evaluating multiple parallel
        actions for a multi-agent environment.

        :param num: Scalar tensor indicating number of agents.
        :param episode: Current episode for decay schedule.
        :returns: A boolean tensor of shape `(num)` indicating which agents
        should explore.
        """
        return self.rng.uniform(shape=(num,)) < self.get_epsilon(episode)

    @tf.function(
        input_signature=[
            tf.TensorSpec(shape=(), dtype=tf.int64, name="episode"),
        ],
        jit_compile=True,
    )
    def get_epsilon(self, episode):
        """Gets the current exploration rate."""
        explore = self.exploration
        if isinstance(explore, float):
            return tf.constant(explore, tf.float32)
        if explore.decay_type == "linear":
            # Linearly interpolate through the points (0, start) and
            # (episodes, end) where x=episode and y=epsilon.
            # Equation: epsilon = start - (decay_rate * episode)
            # Solution: decay_rate = (start - end) / episodes
            epsilon = explore.start - (
                tf.cast(episode, dtype=tf.float32)
                * (explore.start - explore.end)
                / explore.episodes
            )
        elif explore.decay_type == "exponential":
            # Exponentially interpolate through the points (0, start) and
            # (episodes, end) where x=episode and y=epsilon.
            # Equation: epsilon = start * (decay_rate**episode)
            # Solution: decay_rate = (end/start) ** (1/episodes)
            # Using log transformation on epsilon for numerical stability.
            epsilon = explore.start * tf.math.exp(
                tf.cast(episode, tf.float32)
                / explore.episodes
                * tf.math.log(explore.end / explore.start)
            )
        else:
            # Thrown at trace time.
            raise RuntimeError(
                "Exploration config has unknown decay_type "
                f"'{explore.decay_type}'"
            )
        epsilon = tf.clip_by_value(
            epsilon, *sorted((explore.start, explore.end))
        )
        return epsilon

    @tf.function(
        input_signature=[tf.TensorSpec(shape=(), dtype=tf.int32, name="num")]
    )
    def rand_actions(self, num):
        """
        Computes random actions for exploration.

        :param num: Number of agents that are exploring.
        :returns: Tensor of shape `(num, num_actions)` containing randomized
        action rankings for each agent.
        """
        return tf.map_fn(
            lambda seed: tf.random.experimental.stateless_shuffle(
                tf.range(len(ACTION_NAMES)), seed=seed
            ),
            tf.transpose(self.rng.make_seeds(num)),
            fn_output_signature=tf.TensorSpec(
                shape=(len(ACTION_NAMES),), dtype=tf.int32
            ),
        )
