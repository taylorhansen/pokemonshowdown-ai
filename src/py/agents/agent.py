"""Base RL agent."""


class Agent:
    """Base class for multi-agent RL."""

    def __init__(self):
        pass

    def select_action(self, state, info):
        """Selects an action in the environment from current state."""
        raise NotImplementedError

    def update_model(
        self, state, reward, next_state, terminated, truncated, info
    ):
        """Updates the model using environment step feedback."""
        raise NotImplementedError
