"""Refuse to touch any database except the demo one."""
import os
import sys

DEMO_DB = "som_demo"


def require_demo_db() -> None:
    name = os.environ.get("DB_NAME")
    if name != DEMO_DB:
        print(f"Refusing to run: DB_NAME is {name!r}, expected {DEMO_DB!r}. "
              "Source pitch-video/demo_env.sh first.", file=sys.stderr)
        raise SystemExit(2)
