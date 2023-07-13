"""Hidden state and trajectory tracker for DRQNAgent."""
import itertools
from collections import deque
from typing import Union

import numpy as np
import tensorflow as tf

from ...utils.typing import Trajectory
from .n_step_returns import propagate_n_step_returns


class DRQNContext:
    """Context for one DRQN agent participating in a battle."""

    def __init__(
        self,
        hidden: list[tf.Tensor],
        unroll_length: int,
        burn_in: int,
        n_steps: int,
        discount_factor: float,
    ) -> None:
        """
        Creates a DRQNContext.

        :param hidden: Initial recurrent hidden state.
        :param unroll_length: Max length for unrolled trajectories.
        :param burn_in: Amount of overlap between consecutive unrolls in
        addition to the main `unroll_length`.
        :param n_steps: Number of lookahead steps for n-step returns.
        :param discount_factor: Discount factor for future rewards.
        """
        self.unroll_length = unroll_length
        self.burn_in = burn_in
        self.n_steps = n_steps
        self.discount_factor = discount_factor

        self.hidden = hidden
        """
        Latest hidden state from the battle for use in model calls. Should be
        reassigned on each call.
        """

        self._states = deque[Union[np.ndarray, tf.Tensor]]()
        self._choices = deque[np.ndarray]()
        self._actions = deque[int]()
        self._rewards = deque[float]()
        self._stored_hiddens = deque([self.hidden])
        self._has_first_state = False

    def update(
        self,
        action: int,
        reward: float,
        next_state: Union[np.ndarray, tf.Tensor],
        choices: np.ndarray,
        terminated=False,
    ) -> list[Trajectory]:
        """
        Updates the trajectory and possibly emits partial unrolled trajectories.

        :param action: Last action, or -1 on first call.
        :param reward: Last reward, or 0 on first call.
        :param next_state: Resultant state from state transition, or the first
        state on first call, or zeroed if `terminated`.
        :param choices: Choice legality mask for `next_state`, or zeroed if
        `terminated`.
        :param terminated: If true, dump the rest of the stored unrolls to end
        the trajectory.
        :returns: A list of unrolled trajectories.
        """
        if not self._has_first_state:
            # First call stores initial state+choices.
            self._states.append(next_state)
            self._choices.append(choices)
            self._has_first_state = True
            assert not terminated
            return []
        if not terminated:
            # Prepare for next call.
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
            return self._dump()

        if len(self._states) == self.unroll_length + 1:
            # Store hidden state used for next unroll.
            self._stored_hiddens.append(self.hidden)

        if (
            len(self._states)
            >= self.burn_in + self.unroll_length + self.n_steps
        ):
            # Partial unroll trajectory.
            # Note: Delayed by n-steps to ensure we have the correct reward
            # values before unrolling.
            return [self._unroll()]
        return []

    def truncate(self) -> list[Trajectory]:
        """Truncates and dumps the remaining trajectory for the battle."""
        # Indicate no more update() calls.
        self._states.pop()
        self._choices.pop()
        return self._dump()

    def _dump(self) -> list[Trajectory]:
        trajs: list[Trajectory] = []
        while len(self._states) > 0:
            if len(self._states) <= self.burn_in:
                # Can't emit trajectories containing only burn-in steps since
                # then there'd be nothing to learn from.
                # WARNING: If burn_in is too high, this can end up discarding
                # entire episodes.
                self._states.clear()
                self._choices.clear()
                self._actions.clear()
                self._rewards.clear()
                break
            trajs.append(self._unroll())
        return trajs

    def _unroll(self) -> Trajectory:
        hidden = self._stored_hiddens.popleft()

        length = len(self._states)

        states_list = [
            *self._unroll_helper(self._states),
            # Note: Also overlap by n-steps for learning.
            *self._unroll_n_steps(self._states),
        ]
        if tf.is_tensor(states_list[0]):
            states = tf.stack(states_list)
        else:
            states = np.stack(states_list)
        choices = tf.convert_to_tensor(
            np.stack(
                [
                    *self._unroll_helper(self._choices),
                    *self._unroll_n_steps(self._choices),
                ]
            ),
            dtype=tf.float32,
        )
        actions = tf.convert_to_tensor(
            list(self._unroll_helper(self._actions)), dtype=tf.int32
        )
        rewards = tf.convert_to_tensor(
            list(self._unroll_helper(self._rewards)), dtype=tf.float32
        )

        n_steps = max(self.n_steps, 0)
        if length >= self.burn_in + self.unroll_length + n_steps:
            # No masking/padding needed.
            mask = tf.ones(
                shape=(self.burn_in + self.unroll_length + n_steps,),
                dtype=tf.bool,
            )
        elif length >= self.burn_in + self.unroll_length:
            # Only need to mask+pad the states+choices.
            n_pad_len = self.burn_in + self.unroll_length + n_steps - length
            # pylint: disable=unexpected-keyword-arg, no-value-for-parameter
            mask = tf.concat(
                [
                    tf.ones((length,), dtype=tf.bool),
                    tf.zeros((n_pad_len,), dtype=tf.bool),
                ],
                axis=0,
            )
            if tf.is_tensor(states):
                states = tf.concat(
                    [
                        states,
                        tf.zeros(
                            (n_pad_len, states.shape[-1]), dtype=states.dtype
                        ),
                    ],
                    axis=0,
                )
            else:
                states = np.concatenate(
                    [
                        states,
                        np.zeros(
                            (n_pad_len, states.shape[-1]), dtype=states.dtype
                        ),
                    ],
                    axis=0,
                )
            choices = tf.concat(
                [
                    choices,
                    tf.zeros(
                        (n_pad_len, choices.shape[-1]), dtype=choices.dtype
                    ),
                ],
                axis=0,
            )
            # pylint: enable=unexpected-keyword-arg, no-value-for-parameter
        else:
            # Mask+pad all vectors.
            pad_len = self.burn_in + self.unroll_length - length
            n_pad_len = pad_len + n_steps
            # pylint: disable=unexpected-keyword-arg, no-value-for-parameter
            mask = tf.concat(
                [
                    tf.ones((length,), dtype=tf.bool),
                    tf.zeros((n_pad_len,), dtype=tf.bool),
                ],
                axis=0,
            )
            if tf.is_tensor(states):
                states = tf.concat(
                    [
                        states,
                        tf.zeros(
                            (n_pad_len, states.shape[-1]), dtype=states.dtype
                        ),
                    ],
                    axis=0,
                )
            else:
                states = np.concatenate(
                    [
                        states,
                        np.zeros(
                            (n_pad_len, states.shape[-1]), dtype=states.dtype
                        ),
                    ],
                    axis=0,
                )
            choices = tf.concat(
                [
                    choices,
                    tf.zeros(
                        (n_pad_len, choices.shape[-1]), dtype=choices.dtype
                    ),
                ],
                axis=0,
            )
            actions = tf.concat(
                [
                    actions,
                    tf.fill((pad_len,), tf.constant(-1, dtype=actions.dtype)),
                ],
                axis=0,
            )
            rewards = tf.concat(
                [rewards, tf.zeros((pad_len,), dtype=rewards.dtype)], axis=0
            )
            # pylint: enable=unexpected-keyword-arg, no-value-for-parameter

        return Trajectory(
            hidden=hidden,
            mask=mask,
            states=states,
            choices=choices,
            actions=actions,
            rewards=rewards,
        )

    def _unroll_helper(self, deq: deque):
        # Make sure consecutive unrolls overlap by burn_in steps.
        yield from (
            deq.popleft() for _ in range(min(self.unroll_length, len(deq)))
        )
        yield from itertools.islice(deq, min(self.burn_in, len(deq)))

    def _unroll_n_steps(self, deq: deque):
        if self.n_steps <= 0:
            return
        yield from itertools.islice(
            deq, self.burn_in, min(self.burn_in + self.n_steps, len(deq))
        )
