"""Teacher sign-ups wait for admin approval; "All Students" practice tests reach students and drafts don't."""
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import certifi
import requests
from dotenv import dotenv_values, load_dotenv
from pymongo import MongoClient

frontend_env = dotenv_values("frontend/.env") if os.path.exists("frontend/.env") else {}
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/") or "http://localhost:8001"
API = f"{BASE_URL}/api"

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
_db = MongoClient(os.environ["MONGO_URL"], tlsCAFile=certifi.where())[os.environ["DB_NAME"]]
KEEP_PENDING = {"X-Test-Keep-Pending": "1"}


def _admin():
    r = requests.post(f"{API}/auth/login", json={"email": os.environ.get("ADMIN_EMAIL", "admin@somacademy.example.com"),
                                                 "password": os.environ["ADMIN_PASSWORD"]}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _reg(role, name, headers=None):
    email = f"test_{role}_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name": name, "email": email, "password": "password123", "role": role},
                      headers=headers or {}, timeout=15)
    assert r.status_code == 200, r.text
    return email, r.json()


def test_teacher_signup_waits_for_admin_approval():
    email, body = _reg("teacher", "Pending Teacher", KEEP_PENDING)
    assert body.get("pending_approval") is True and "token" not in body

    login = requests.post(f"{API}/auth/login", json={"email": email, "password": "password123"}, timeout=15)
    assert login.status_code == 403 and "approval" in login.json()["detail"]

    admin = _admin()
    pending = requests.get(f"{API}/admin/teachers", headers=admin, timeout=15).json()
    me = next(t for t in pending if t["email"] == email)
    assert requests.post(f"{API}/admin/teachers/{me['id']}/approve", headers=admin, timeout=15).status_code == 200
    login = requests.post(f"{API}/auth/login", json={"email": email, "password": "password123"}, timeout=15)
    assert login.status_code == 200 and login.json()["user"]["role"] == "teacher"

    # A student can't approve teachers
    _, student = _reg("student", "Nosy Student")
    sh = {"Authorization": f"Bearer {student['token']}"}
    assert requests.get(f"{API}/admin/teachers", headers=sh, timeout=15).status_code == 403


def test_all_students_practice_is_startable_and_drafts_stay_private():
    _, t = _reg("teacher", "Audience Teacher")
    th = {"Authorization": f"Bearer {t['token']}"}
    _, s = _reg("student", "Audience Student")
    sh = {"Authorization": f"Bearer {s['token']}"}
    batch = requests.post(f"{API}/batches", json={"name": "Aud Batch", "class_level": "9"}, headers=th, timeout=15).json()
    requests.post(f"{API}/batches/join", json={"code": batch["code"]}, headers=sh, timeout=15)

    now = datetime.now(timezone.utc)
    base = {"kind": "dpp", "class_level": "9", "subject": "Maths", "chapter": "x", "topic": "", "status": "ready",
            "teacher_id": t["user"]["id"], "duration_minutes": 0, "student_id": None, "created_at": now.isoformat(),
            "questions": [{"id": "q", "question": "Q?", "options": ["A", "B", "C", "D"], "correct_index": 0}]}
    legacy_open = str(uuid.uuid4())   # how "All Students" practice tests used to be stored
    draft = str(uuid.uuid4())
    _db.tests.insert_many([
        {**base, "id": legacy_open, "title": "Legacy open", "batch_id": None, "is_active": True, "is_draft": False,
         "valid_from": now.isoformat(), "valid_until": (now + timedelta(hours=24)).isoformat()},
        {**base, "id": draft, "title": "Secret draft", "batch_id": None, "is_active": False, "is_draft": True,
         "valid_from": None, "valid_until": None},
    ])
    # Startup migration equivalent
    _db.tests.update_one({"id": legacy_open}, {"$set": {"batch_id": "all", "batch_name": "All Students"}})

    listed = {x["id"]: x for x in requests.get(f"{API}/tests", params={"kind": "dpp"}, headers=sh, timeout=15).json()}
    assert legacy_open in listed and listed[legacy_open]["is_active"] is True
    assert draft not in listed
    assert requests.get(f"{API}/tests/{draft}", headers=sh, timeout=15).status_code == 403
    assert requests.get(f"{API}/tests/{legacy_open}", headers=sh, timeout=15).status_code == 200
