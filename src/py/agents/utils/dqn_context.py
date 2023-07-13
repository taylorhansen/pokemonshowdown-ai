"""Experience tracker for DQNAgent."""
from collections import deque
from typing import Union

import numpy as np
import tensorflow as tf

from ...utils.typing import Experience
from .n_step_returns import propagate_n_step_returns


class DQNContext:
    """Tracks n-step returns and experience generation for one RL agent."""

    def __init__(self, n_steps=1, discount_factor=0.99):
        """
        Creates a NStepReturns.

        :param n_steps: Number of lookahead steps for n-step returns.
        :param discount_factor: Discount factor for future rewards.
        """
        self.n_steps = n_steps
        self.discount_factor = discount_factor

        self._states = deque[Union[np.ndarray, tf.Tensor]]()
        self._choices = deque[np.ndarray]()
        self._actions = deque[int]()
        self._rewards = deque[float]()
        self._has_first_state = False

    def update(
        self,
        action: int,
        reward: float,
        next_state: Union[np.ndarray, tf.Tensor],
        choices: np.ndarray,
        terminated=False,
    ) -> list[Experience]:
        """
        Updates the trajectory and possibly emits experience tuples.

        :param action: Last action, or -1 on first call.
        :param reward: Last reward, or 0 on first call.
        :param next_state: Resultant state from state transition, or the first
        state on first call, or zeroed if `terminated`.
        :param choices: Choice legality mask for `next_state`, or zeroed if
        `terminated`.
        :param terminated: If true, dump the rest of the stored experience to
        end the trajectory.
        :returns: A list of ready experience tuples.
        """
        if not self._has_first_state:
            # First call stores initial state+choices.
            self._states.append(next_state)
            self._choices.append(choices)
            self._has_first_state = True
            assert not terminated
            return []
        self._states.append(next_state)
        self._choices.append(choices)
        self._actions.append(action)
        self._rewards.append(reward)

        propagate_n_step_returns(
            self._rewards,
            n_steps=self.n_steps,
            discount_factor=self.discount_factor,
        )

        if terminated:
            exps: list[Experience] = []
            while len(self._states) > 1:
                exps.append(self._emit_experience(done=True))
            return exps

        if len(self._states) > self.n_steps:
            return [self._emit_experience()]
        return []

    def _emit_experience(self, done=False) -> Experience:
        state = self._states.popleft()
        action = self._actions.popleft()
        reward = self._rewards.popleft()
        next_state = self._states[-1]
        choices = self._choices[-1]
        self._choices.popleft()
        return Experience(
            state=state,
            action=action,
            reward=reward,
            next_state=next_state,
            choices=choices,
            done=done,
        )
