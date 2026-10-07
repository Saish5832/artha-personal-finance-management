"""Makes the analysis modules importable from tests (python-analysis/ is not a package)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
