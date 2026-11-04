"""Import the backend safely against the demo DB.

backend/config.py calls load_dotenv(..., override=True), which would replace DB_NAME=som_demo with the real
database name. load_backend() makes every load_dotenv keep variables already set, imports config, and
re-checks the guard before anything can connect.
"""
import sys
from pathlib import Path

from guard import require_demo_db

BACKEND = Path(__file__).resolve().parents[2] / "backend"


def load_backend():
    require_demo_db()
    import dotenv
    if not getattr(dotenv.load_dotenv, "_keeps_existing", False):
        real = dotenv.load_dotenv

        def keep_existing(*args, **kwargs):
            kwargs["override"] = False
            return real(*args, **kwargs)

        keep_existing._keeps_existing = True
        dotenv.load_dotenv = keep_existing
    if str(BACKEND) not in sys.path:
        sys.path.insert(0, str(BACKEND))
    import config  # noqa: F401
    require_demo_db()
