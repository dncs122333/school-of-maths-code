"""Seed the School of Maths demo database (som_demo) up to a story stage.

    source ../demo_env.sh && ../../backend/.venv/bin/python seed_demo.py --stage 1

Every run wipes som_demo (keeping the admin account and indexes) and rebuilds stages 1..N through the real
API, so grading and mastery are the app's own. Timestamps are then moved into the past so the story has a
history: class tests weeks ago, practice in between, the retest two days ago.
"""
import argparse
import csv
import io
import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from backend_env import load_backend  # noqa: E402

os.environ.setdefault("DB_NAME", "som_demo")
load_backend()

import certifi  # noqa: E402
import requests  # noqa: E402
from pymongo import MongoClient  # noqa: E402

import hero  # noqa: E402
import roster  # noqa: E402
from guard import DEMO_DB, require_demo_db  # noqa: E402
from server import _option_seed, _question_order, _shuffled_order  # noqa: E402

API = os.environ.get("DEMO_API", "http://localhost:8011/api")
ADMIN = ("admin@somacademy.example.com", "admin123")  # seeded by the backend on startup (AGENTS.md)
PENDING_TEACHER = {"name": "Rahul Verma", "email": f"rahul.verma@{roster.DOMAIN}"}
CSV_PATH = HERE / "demo_questions.csv"
ENROLLED = datetime(2026, 4, 6, 10, 0, tzinfo=timezone.utc)
PAID_MONTHS = ["April", "May", "June", "July", "August", "September", "October", "November"]


def _db():
    require_demo_db()
    return MongoClient(os.environ["MONGO_URL"], tlsCAFile=certifi.where())[DEMO_DB]


class Api:
    def __init__(self, token=None):
        self.h = {"Authorization": f"Bearer {token}"} if token else {}

    def call(self, method, path, ok=(200,), **kw):
        for attempt in range(5):
            r = requests.request(method, f"{API}{path}", headers=self.h, timeout=60, **kw)
            if r.status_code == 429:  # join/login rate limits: wait out the window
                time.sleep(15)
                continue
            if r.status_code not in ok:
                raise RuntimeError(f"{method} {path} -> {r.status_code}: {r.text[:300]}")
            return r.json() if r.content else None
        raise RuntimeError(f"{method} {path} kept hitting rate limits")


def login(email, password):
    return Api(Api().call("POST", "/auth/login", json={"email": email, "password": password})["token"])


def reset(db):
    """Empty every collection (indexes stay), keeping only the startup-seeded admin."""
    for name in db.list_collection_names():
        if name == "users":
            db.users.delete_many({"role": {"$ne": "admin"}})
        elif not name.startswith("system."):
            db[name].delete_many({})


def _pdf(title, lines):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(60, 780, title)
    c.setFont("Helvetica", 12)
    y = 740
    for ln in lines:
        c.drawString(60, y, ln)
        y -= 22
    c.drawString(60, 60, "School of Maths · CBSE Class 10")
    c.save()
    return buf.getvalue()


MATERIALS = [
    ("Quadratic Equations – Complete Notes", "Quadratic Equations",
     ["Standard form: ax^2 + bx + c = 0, a != 0", "Method 1: Factorisation (split the middle term)",
      "Method 2: Quadratic formula x = (-b ± sqrt(b^2 - 4ac)) / 2a", "Discriminant D = b^2 - 4ac decides the nature of roots",
      "Worked examples: x^2 - 5x + 6 = 0 gives x = 2, 3"]),
    ("Real Numbers – HCF & LCM Shortcuts", "Real Numbers",
     ["Prime factorise both numbers", "HCF: lowest powers of common primes", "LCM: highest powers of all primes",
      "HCF x LCM = product of the two numbers"]),
    ("Trigonometry – Standard Values Table", "Introduction to Trigonometry",
     ["sin 30 = 1/2, sin 45 = 1/sqrt2, sin 60 = sqrt3/2", "cos is sin read backwards", "tan = sin / cos",
      "Identity: sin^2 A + cos^2 A = 1"]),
]


def build_base(db):
    admin = login(*ADMIN)
    # Teachers: one approved (runs the centre), one left pending for the approval shot
    for t in (roster.TEACHER, PENDING_TEACHER):
        Api().call("POST", "/auth/register", json={**t, "password": roster.DEMO_PASSWORD, "role": "teacher"})
    tid = str(db.users.find_one({"email": roster.TEACHER["email"]})["_id"])
    admin.call("POST", f"/admin/teachers/{tid}/approve")
    teacher = login(roster.TEACHER["email"], roster.DEMO_PASSWORD)

    batches = {}
    for b in roster.BATCHES:
        batches[b["name"]] = teacher.call("POST", "/batches", json={**b, "join_requires_approval": True})

    teacher.call("POST", "/questions/import-csv",
                 files={"file": ("school_of_maths_class10.csv", CSV_PATH.read_bytes(), "text/csv")})

    students = {}
    for s in roster.STUDENTS:
        tok = Api().call("POST", "/auth/register",
                         json={"name": s["name"], "email": s["email"], "password": roster.DEMO_PASSWORD})["token"]
        api = Api(tok)
        api.call("POST", "/batches/join", json={"code": batches[s["batch"]]["code"]})
        students[s["email"]] = {"api": api, "id": str(db.users.find_one({"email": s["email"]})["_id"]), **s}

    for name, b in batches.items():
        for req in teacher.call("GET", f"/batches/{b['id']}/join-requests"):
            sid = req.get("student_id")
            email = next((e for e, s in students.items() if s["id"] == sid), None)
            if email and email not in roster.PENDING_JOIN:
                teacher.call("POST", f"/batches/{b['id']}/join-requests/{req['id']}/approve")

    # Everyone enrolled at the start of the academic year, so fees run April onwards
    for s in students.values():
        bid = batches[s["batch"]]["id"]
        db.users.update_one({"email": s["email"], f"batch_enrolled_at.{bid}": {"$exists": True}},
                            {"$set": {f"batch_enrolled_at.{bid}": ENROLLED.isoformat()}})

    for email, s in students.items():
        if email in roster.PENDING_JOIN:
            continue
        b = batches[s["batch"]]
        fee = next(x for x in roster.BATCHES if x["name"] == s["batch"])["monthly_fee"]
        path = f"/batches/{b['id']}/students/{s['id']}/fee"
        if email in roster.FEE_PENDING:
            months = PAID_MONTHS[:6]
            teacher.call("POST", path, json={"amount": fee * len(months), "month": ", ".join(months)})
        elif email in roster.FEE_PARTIAL:
            months = PAID_MONTHS[:7]
            teacher.call("POST", path, json={"amount": fee * len(months), "month": ", ".join(months)})
            teacher.call("POST", path, json={"is_partial": True, "months_paid": ["November"],
                                             "partial_amount": round(fee * 0.5)})
        else:
            teacher.call("POST", path, json={"amount": fee * len(PAID_MONTHS), "month": ", ".join(PAID_MONTHS)})

    hb = batches[roster.HERO_BATCH]
    for title, chapter, lines in MATERIALS:
        teacher.call("POST", "/resources",
                     files={"file": (f"{title.replace(chr(8211), '-')}.pdf", _pdf(title, lines), "application/pdf")},
                     data={"title": title, "batch_id": hb["id"], "class_level": "Class 10",
                           "subject": "Maths", "chapter": chapter})
    return teacher, batches, students


def _bank_ids(db):
    """CSV ID -> question_bank id, matched on question text."""
    rows = {r["Question"]: r["ID"] for r in csv.DictReader(open(CSV_PATH))}
    out = {}
    for q in db.question_bank.find({}, {"_id": 0, "id": 1, "question": 1}):
        if q["question"] in rows:
            out[rows[q["question"]]] = q["id"]
    missing = set(rows.values()) - set(out)
    if missing:
        raise RuntimeError(f"Questions missing from the bank after import: {sorted(missing)[:5]}")
    return out


def _wait_ready(teacher, test_id):
    for _ in range(60):
        t = teacher.call("GET", f"/tests/{test_id}")
        if t.get("status") == "ready":
            return
        if t.get("status") == "failed":
            raise RuntimeError(f"Test {test_id} failed to build")
        time.sleep(1)
    raise RuntimeError(f"Test {test_id} never became ready")


def _display_answers(test, student_id, correct_qids, csv_by_bank):
    """Answers in the student's display order: the right option for questions in correct_qids, else a wrong one."""
    answers = []
    for i in _question_order(test, student_id):
        q = test["questions"][i]
        order = _shuffled_order(_option_seed(test["id"], student_id, i), len(q["options"]))
        right = order.index(q["correct_index"])
        if csv_by_bank.get(q.get("id")) in correct_qids:
            answers.append(right)
        else:
            answers.append(random.Random(f"{student_id}{i}").choice([k for k in range(len(order)) if k != right]))
    return answers


def run_test(db, teacher, key, bank, batch_id, students, questions_by_csv):
    t = hero.TESTS[key]
    body = {"title": t["title"], "kind": t["kind"], "class_level": "Class 10", "subject": "Maths",
            "batch_id": batch_id, "question_ids": [bank[q] for q in t["question_ids"]],
            "question_count": len(t["question_ids"]), "duration_minutes": 30, "valid_hours": 24}
    created = teacher.call("POST", "/tests", json=body)
    test_id = created["id"]
    _wait_ready(teacher, test_id)
    test = db.tests.find_one({"id": test_id}, {"_id": 0})
    csv_by_bank = {v: k for k, v in bank.items()}
    taken = []
    for email in [s["email"] for s in roster.hero_batch_students()]:
        if email in hero.absent(key):
            continue
        s = students[email]
        s["api"].call("GET", f"/tests/{test_id}")
        answers = _display_answers(test, s["id"], hero.correct_ids(email, key, questions_by_csv), csv_by_bank)
        times = [round(random.Random(f"{email}{key}{j}").uniform(25, 110), 1) for j in range(len(answers))]
        s["api"].call("POST", f"/tests/{test_id}/submit", json={"answers": answers, "times": times})
        taken.append(email)
    if t["kind"] == "test":
        if hero.absent(key):
            teacher.call("POST", f"/tests/{test_id}/makeup",
                         json={"student_ids": [students[e]["id"] for e in hero.absent(key)]})
        else:
            teacher.call("POST", f"/tests/{test_id}/release-results")
    _backdate(db, test_id, t["days_ago"], has_makeup=bool(hero.absent(key)))
    return test_id


def _backdate(db, test_id, days_ago, has_makeup=False):
    base = datetime.now(timezone.utc).replace(hour=11, minute=0, second=0, microsecond=0) - timedelta(days=days_ago)
    iso = lambda d: d.isoformat()  # noqa: E731
    sets = {"created_at": iso(base - timedelta(hours=2)), "valid_from": iso(base),
            "valid_until": iso(base + timedelta(minutes=60))}
    if not has_makeup:
        sets["results_released_at"] = iso(base + timedelta(minutes=70))
    db.tests.update_one({"id": test_id}, {"$set": sets})
    for k, sub in enumerate(db.submissions.find({"test_id": test_id}, {"_id": 1})):
        start = base + timedelta(minutes=random.Random(k).randint(0, 4))
        db.submissions.update_one({"_id": sub["_id"]}, {"$set": {
            "started_at": iso(start), "created_at": iso(start + timedelta(minutes=random.Random(k + 99).randint(14, 28)))}})


def _backdate_people(db):
    joined = ENROLLED
    db.users.update_many({"role": {"$in": ["student", "teacher"]}}, {"$set": {"created_at": joined.isoformat()}})
    db.batches.update_many({}, {"$set": {"created_at": (joined - timedelta(days=3)).isoformat()}})
    db.join_requests.update_many({"status": {"$ne": "pending"}}, {"$set": {"requested_at": joined.isoformat()}})
    db.resources.update_many({}, {"$set": {"created_at": (joined + timedelta(days=5)).isoformat()}})


def schedule_upcoming(teacher, bank, batch_id):
    u = hero.UPCOMING
    start = (datetime.now(timezone.utc) + timedelta(days=u["days_ahead"])).replace(hour=11, minute=0, second=0, microsecond=0)
    teacher.call("POST", "/tests", json={
        "title": u["title"], "kind": "test", "class_level": "Class 10", "subject": "Maths", "batch_id": batch_id,
        "question_ids": [bank[q] for q in u["question_ids"]], "question_count": len(u["question_ids"]),
        "duration_minutes": 30, "valid_hours": 24, "start_at": start.isoformat()})


def main(stage: int):
    if stage not in (1, 2, 3):
        raise SystemExit("stage must be 1, 2 or 3")
    db = _db()
    reset(db)
    teacher, batches, students = build_base(db)
    bank = _bank_ids(db)
    questions_by_csv = {r["ID"]: r for r in csv.DictReader(open(CSV_PATH))}
    batch_id = batches[roster.HERO_BATCH]["id"]
    for key, t in sorted(hero.TESTS.items(), key=lambda kv: -kv[1]["days_ago"]):
        if t["stage"] <= stage:
            run_test(db, teacher, key, bank, batch_id, students, questions_by_csv)
    schedule_upcoming(teacher, bank, batch_id)
    _backdate_people(db)
    print(f"som_demo seeded to stage {stage}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", type=int, required=True)
    main(ap.parse_args().stage)
