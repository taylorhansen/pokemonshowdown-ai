"""Python unit test runner."""
import os
import unittest
from pathlib import Path

if __name__ == "__main__":
    if os.environ.get("TF_CPP_MIN_LOG_LEVEL", None) is None:
        # Prevent log spam when importing TF.
        os.environ["TF_CPP_MIN_LOG_LEVEL"] = "1"
    loader = unittest.TestLoader()
    test_suite = loader.discover(
        start_dir=os.fspath(Path(__file__, "..", "..", "src", "py")),
        pattern="*_test.py",
        top_level_dir=os.fspath(Path(__file__, "..", "..")),
    )
    runner = unittest.TextTestRunner()
    runner.run(test_suite)
