"""Check the live demo matches a story stage before filming it. Prints Aarav's Quadratics score as JSON.

    source ../demo_env.sh && ../../backend/.venv/bin/python verify_stage.py --stage 2
Exit 0 when the band matches the stage, 1 otherwise.
"""
import argparse
import json
import os
import sys
from pathlib import Path

import certifi
import requests
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parent))
import roster  # noqa: E402
from guard import DEMO_DB, require_demo_db  # noqa: E402

API = os.environ.get("DEMO_API", "http://localhost:8011/api")
QUAD = "solutions of quadratic equations by factorization and by quadratic formula"
EXPECTED_BAND = {1: "weak", 2: "developing", 3: "strong"}


def compare(stage, band, score):
    want = EXPECTED_BAND[stage]
    if band == want:
        return []
    return [f"Stage {stage}: Aarav's Quadratics band is '{band}' ({score}%), expected '{want}'"]


def _rows(obj):
    if isinstance(obj, dict):
        if str(obj.get("topic", "")).casefold() == QUAD and "band" in obj:
            yield obj
        for v in obj.values():
            yield from _rows(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _rows(v)


def hero_quadratics():
    """(band, score) of the hero's Quadratics topic, from the running app."""
    from backend_env import load_backend
    load_backend()
    require_demo_db()
    db = MongoClient(os.environ["MONGO_URL"], tlsCAFile=certifi.where())[DEMO_DB]
    tok = requests.post(f"{API}/auth/login", json={"email": roster.TEACHER["email"], "password": roster.DEMO_PASSWORD},
                        timeout=30).json()["token"]
    hero = db.users.find_one({"email": roster.HERO_EMAIL})
    r = requests.get(f"{API}/mastery/teacher/student/{hero['_id']}", headers={"Authorization": f"Bearer {tok}"}, timeout=60)
    r.raise_for_status()
    row = next(_rows(r.json()), None)
    return (row["band"], row["score"]) if row else (None, None)


def check(stage):
    band, score = hero_quadratics()
    return compare(stage, band, score)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", type=int, required=True)
    st = ap.parse_args().stage
    band, score = hero_quadratics()
    problems = compare(st, band, score)
    print(json.dumps({"stage": st, "band": band, "score": score, "ok": not problems, "problems": problems}))
    raise SystemExit(1 if problems else 0)
