"""Utilities for calculating n-step returns for DQN."""
from typing import MutableSequence


def propagate_n_step_returns(
    rewards: MutableSequence[float], n_steps: int, discount_factor: float
):
    """
    Propagates n-step returns across a trajectory of rewards. If called with the
    same arguments after each append of a reward `r_t` onto `rewards`, this
    calculates `R_t = r_t + gamma*r_{t+1} + ... + (gamma^(n-1))*r_{t+n-1}` for
    each element in the reward sequence, where `n=n_steps` and
    `gamma=discount_factor`, and `r_t` is the immediate reward from the action
    (`a_t`) taken at timestep `t`. Note the missing final `(gamma^n)*V(s_{t+n})`
    term which should be added separately during learning.

    :param rewards: Sequence of rewards. Final element contains the reward to
    propagate.
    :param n_steps: Number of lookahead steps for n-step returns. If negative,
    propagates the discounted future reward through the entire sequence (i.e.
    Monte-Carlo returns).
    :param discount_factor: Discount factor for future rewards.
    """
    reward = rewards[-1]
    for step, i in enumerate(
        range(
            len(rewards) - 2,
            max(-1, len(rewards) - n_steps - 1) if n_steps >= 0 else -1,
            -1,
        ),
        start=1,
    ):
        rewards[i] += (discount_factor**step) * reward
