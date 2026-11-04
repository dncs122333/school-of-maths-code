"""Needs the demo backend on :8011 (start_demo_backend.sh). Run: pytest -m live"""
import pytest
import requests

import roster
from live_helpers import API, demo_db, find_rows, login

pytestmark = pytest.mark.live


def hero_band(stage_db):
    teacher = login(roster.TEACHER["email"], roster.DEMO_PASSWORD)
    hero = stage_db.users.find_one({"email": roster.HERO_EMAIL})
    r = requests.get(f"{API}/mastery/teacher/student/{hero['_id']}", headers=teacher, timeout=60)
    r.raise_for_status()
    rows = [x for x in find_rows(r.json()) if "band" in x]
    assert rows, "hero has no Quadratics mastery row"
    return rows[0]["band"], rows[0]["score"]


def test_stage_1_twice_is_idempotent():
    import seed_demo
    seed_demo.main(1)
    seed_demo.main(1)
    db = demo_db()
    assert db.users.count_documents({"role": "student"}) == 37
    for t in db.tests.find({"kind": "test", "valid_from": {"$exists": True}}, {"id": 1, "title": 1}):
        subs = db.submissions.count_documents({"test_id": t["id"]})
        studs = len(db.submissions.distinct("student_id", {"test_id": t["id"]}))
        assert subs == studs, t["title"]
    assert db.submissions.count_documents({}) > 0


def test_stage_1_hero_quadratics_is_weak():
    import seed_demo
    seed_demo.main(1)
    band, score = hero_band(demo_db())
    assert band == "weak", score
