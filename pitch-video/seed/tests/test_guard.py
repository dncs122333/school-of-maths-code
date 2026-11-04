import sys
from pathlib import Path

import pytest
from dotenv import dotenv_values

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from guard import require_demo_db  # noqa: E402

REAL_DB = dotenv_values(Path(__file__).resolve().parents[3] / "backend" / ".env").get("DB_NAME")


def test_refuses_real_db(monkeypatch):
    monkeypatch.setenv("DB_NAME", REAL_DB or "school_of_maths")
    with pytest.raises(SystemExit) as e:
        require_demo_db()
    assert e.value.code == 2


def test_refuses_missing_db_name(monkeypatch):
    monkeypatch.delenv("DB_NAME", raising=False)
    with pytest.raises(SystemExit) as e:
        require_demo_db()
    assert e.value.code == 2


def test_allows_som_demo(monkeypatch):
    monkeypatch.setenv("DB_NAME", "som_demo")
    require_demo_db()
