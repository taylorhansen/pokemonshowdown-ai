"""Python unit test runner."""
import os
import unittest
from pathlib import Path

if __name__ == "__main__":
    loader = unittest.TestLoader()
    test_suite = loader.discover(
        start_dir=os.fspath(Path(__file__, "..", "..", "src", "py")),
        pattern="*_test.py",
        top_level_dir=os.fspath(Path(__file__, "..", "..")),
    )
    runner = unittest.TextTestRunner()
    runner.run(test_suite)
