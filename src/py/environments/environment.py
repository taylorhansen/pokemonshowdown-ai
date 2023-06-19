"""Base RL environment."""


class Environment:
    """Base RL environment."""

    def __init__(self):
        pass

    def reset(self):
        """Reset env."""
        raise NotImplementedError

    async def step(self, action):
        """Step env."""
        raise NotImplementedError
