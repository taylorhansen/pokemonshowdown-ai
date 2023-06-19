"""N-step returns for advantage estimation."""
from collections import deque

from ...utils.typing import Experience


class NStepReturns:
    """Tracks n-step returns and experience generation for one RL agent."""

    def __init__(self, steps=1, discount_factor=0.99):
        """
        Creates a NStepReturns.

        :param steps: Number of lookahead steps for n-step returns.
        :param discount_factor: Discount factor for future rewards.
        """
        self.steps = steps
        self.discount_factor = discount_factor
        self.trajectory = deque[Experience]()

    def add_experience(self, exp: Experience) -> list[Experience]:
        """Processes experience info and emits experiences if available."""
        self.trajectory.append(exp)

        exps: list[Experience] = []
        if len(self.trajectory) >= self.steps:
            exps.append(self._consume_experience())
            self.trajectory.popleft()

        if exp.done:
            # Flush incomplete exps from end of trajectory.
            while len(self.trajectory) > 0:
                exps.append(self._consume_experience())
                self.trajectory.popleft()

        return exps

    def _consume_experience(self) -> Experience:
        state, action, _, _, _, _ = self.trajectory[0]
        _, _, _, next_state, choices, done = self.trajectory[-1]
        returns = 0
        for i, (_, _, reward, _, _, _) in enumerate(self.trajectory):
            returns += (self.discount_factor**i) * reward
        return Experience(state, action, returns, next_state, choices, done)
