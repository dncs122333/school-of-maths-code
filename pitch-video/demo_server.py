"""Run the real backend against the demo database.

backend/config.py calls load_dotenv(..., override=True), which would replace DB_NAME=som_demo with the real
database name from backend/.env. This wrapper makes every load_dotenv call keep variables already set, then
checks DB_NAME is still som_demo before anything can connect. No app code is changed.
Run from backend/:  python ../pitch-video/demo_server.py [--print-db] [--port 8011]
"""
import argparse
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "seed"))
from guard import require_demo_db  # noqa: E402,F401

from backend_env import load_backend  # noqa: E402

load_backend()

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--print-db", action="store_true")
    ap.add_argument("--print-mail", action="store_true")
    ap.add_argument("--port", type=int, default=8011)
    a = ap.parse_args()
    if a.print_db:
        print(os.environ["DB_NAME"])
        raise SystemExit(0)
    if a.print_mail:
        import config
        print("mail on" if config.BREVO_API_KEY else "mail off")
        raise SystemExit(0)
    import uvicorn
    import server  # noqa: F401
    require_demo_db()
    uvicorn.run(server.app, host="127.0.0.1", port=a.port)
