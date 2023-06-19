"""Progbar utilities."""
import contextlib
import sys

from tqdm.contrib import DummyTqdmFile


@contextlib.contextmanager
def std_out_err_redirect_tqdm():
    """
    Context that redirects global stdout/stderr streams to `tqdm.write()` so
    that `print()` statements and logs from other libraries don't interfere with
    progress bars.

    Yields the original stdout stream which must be used as the `file` argument
    for `tqdm` instances used within this context.
    """
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    try:
        sys.stdout = DummyTqdmFile(original_stdout)
        sys.stderr = DummyTqdmFile(original_stderr)
        yield original_stdout
    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr
