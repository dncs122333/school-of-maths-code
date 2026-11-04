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


def _weak_quadratics_count(db):
    teacher = login(roster.TEACHER["email"], roster.DEMO_PASSWORD)
    n = 0
    for s in roster.hero_batch_students():
        sid = db.users.find_one({"email": s["email"]})["_id"]
        r = requests.get(f"{API}/mastery/teacher/student/{sid}", headers=teacher, timeout=60)
        rows = [x for x in find_rows(r.json()) if "band" in x]
        n += bool(rows) and rows[0]["band"] == "weak"
    return n


def test_stage_2_hero_developing_with_rising_practice():
    import seed_demo
    seed_demo.main(2)
    db = demo_db()
    band, score = hero_band(db)
    assert band == "developing", score
    hero = db.users.find_one({"email": roster.HERO_EMAIL})
    dpps = list(db.submissions.find({"student_id": str(hero["_id"]), "kind": "dpp"}).sort("created_at", 1))
    assert len(dpps) >= 3
    scores = [d["score"] for d in dpps]
    assert scores == sorted(scores) and scores[0] < scores[-1]


def test_stage_3_hero_strong_and_fewer_weak_students():
    import seed_demo
    seed_demo.main(1)
    weak_before = _weak_quadratics_count(demo_db())
    seed_demo.main(3)
    db = demo_db()
    band, score = hero_band(db)
    assert band == "strong", score
    assert _weak_quadratics_count(db) < weak_before


def test_verify_stage_matches_seeded_stage():
    import seed_demo
    import verify_stage
    seed_demo.main(3)
    assert verify_stage.check(3) == []
    assert verify_stage.check(1) != []
