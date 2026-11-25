"""Shared local and CI validation entry point."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

for command in [
    [sys.executable, "tools/check_repository.py"],
    [sys.executable, "-m", "unittest", "discover", "-s", "tests/repository", "-v"],
    [sys.executable, "-m", "unittest", "discover", "-s", "tests/installer", "-v"],
]:
    subprocess.run(command, cwd=ROOT, check=True)
