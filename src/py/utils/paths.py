"""Path constant utilities."""
from pathlib import Path
from typing import Final

PROJECT_DIR: Final = Path(__file__, "..", "..", "..", "..").resolve()
"""Absolute path to the project root directory."""

DEFAULT_CONFIG_PATH: Final = Path(PROJECT_DIR, "config", "train.yml").resolve()
"""Absolute path to the default `train.yml` config file."""
