"""The demo backend must keep DB_NAME=som_demo even though backend/config.py reloads .env with override=True."""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PY = ROOT / "backend" / ".venv" / "bin" / "python"


def test_backend_config_keeps_som_demo():
    env = {**os.environ, "DB_NAME": "som_demo"}
    out = subprocess.run([str(PY), str(ROOT / "pitch-video" / "demo_server.py"), "--print-db"],
                         cwd=ROOT / "backend", env=env, capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip().splitlines()[-1] == "som_demo"


def test_demo_server_refuses_without_som_demo():
    env = {k: v for k, v in os.environ.items() if k != "DB_NAME"}
    out = subprocess.run([str(PY), str(ROOT / "pitch-video" / "demo_server.py"), "--print-db"],
                         cwd=ROOT / "backend", env=env, capture_output=True, text=True, timeout=60)
    assert out.returncode == 2


def test_demo_backend_never_sends_real_email():
    """Sign-ups email parents through Brevo; the demo signs up made-up students, so its mail must stay off."""
    env = {**os.environ, "DB_NAME": "som_demo", "BREVO_API_KEY": "real-looking-key", "EMAIL_FROM": "real@example.com"}
    out = subprocess.run([str(PY), str(ROOT / "pitch-video" / "demo_server.py"), "--print-mail"],
                         cwd=ROOT / "backend", env=env, capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip().splitlines()[-1] == "mail off"
