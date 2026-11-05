"""Login limits, password reset, sign-up consent, health check and student data deletion."""
import hashlib
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import certifi
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("frontend/.env") if os.path.exists("frontend/.env") else {}
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/") or "http://localhost:8001"
API = f"{BASE_URL}/api"


def _db():
    return MongoClient(os.environ["MONGO_URL"], tlsCAFile=certifi.where())[os.environ["DB_NAME"]]


def _register(role="student"):
    email = f"test_{role}_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name": "Hardening", "email": email, "password": "password123", "role": role}, timeout=15)
    assert r.status_code == 200, r.text
    return email, r.json()


def _fake_ip():
    # uvicorn trusts X-Forwarded-For from localhost, exactly as it trusts the proxy in production
    n = uuid.uuid4().int
    return f"198.51.{n % 256}.{(n >> 8) % 256}"


def _login(email, password, ip=None):
    headers = {"X-Forwarded-For": ip} if ip else {}
    return requests.post(f"{API}/auth/login", json={"email": email, "password": password}, headers=headers, timeout=15)


def test_health_needs_no_login_and_says_only_up_or_down():
    r = requests.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "up"}


def test_too_many_wrong_passwords_locks_the_account_not_the_network():
    email, _ = _register()
    for _ in range(10):
        assert _login(email, "wrong-password", _fake_ip()).status_code == 401
    locked = _login(email, "password123", _fake_ip())
    assert locked.status_code == 429 and locked.headers["Retry-After"] == "900"
    # Another student on the same network is unaffected
    other, _ = _register()
    assert _login(other, "password123").status_code == 200


def test_correct_password_clears_the_wrong_password_count():
    email, _ = _register()
    for _ in range(9):
        assert _login(email, "wrong-password").status_code == 401
    assert _login(email, "password123").status_code == 200
    for _ in range(9):
        assert _login(email, "wrong-password").status_code == 401
    assert _login(email, "password123").status_code == 200


def test_limit_per_address_uses_the_forwarded_client_address():
    db = _db()
    ip = _fake_ip()
    now = datetime.now(timezone.utc)
    db.auth_limits.insert_many([{"key": f"login:ip:{ip}", "at": now, "expire_at": now + timedelta(minutes=15)} for _ in range(100)])
    email, _ = _register()
    assert _login(email, "password123", ip).status_code == 429
    assert _login(email, "password123", _fake_ip()).status_code == 200


def test_sign_up_requires_consent_and_records_it():
    body = {"name": "No consent", "email": f"test_{uuid.uuid4().hex[:8]}@example.com", "password": "password123", "consent": False}
    assert requests.post(f"{API}/auth/register", json=body, timeout=15).status_code == 400
    email, _ = _register()
    assert _db().users.find_one({"email": email})["consent_at"]


def test_sign_up_rejects_a_short_password():
    body = {"name": "Short", "email": f"test_{uuid.uuid4().hex[:8]}@example.com", "password": "12345", "consent": True}
    assert requests.post(f"{API}/auth/register", json=body, timeout=15).status_code == 422


def test_forgot_password_replies_the_same_for_known_and_unknown_emails():
    email, _ = _register()
    known = requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
    unknown = requests.post(f"{API}/auth/forgot-password", json={"email": f"nobody_{uuid.uuid4().hex[:8]}@example.com"}, timeout=15)
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


def test_reset_token_is_stored_hashed_and_replaces_older_ones():
    email, data = _register()
    db = _db()
    for _ in range(2):
        assert requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15).status_code == 200
    resets = list(db.password_resets.find({"user_id": data["user"]["id"]}))
    assert len(resets) == 1 and len(resets[0]["token_hash"]) == 64


def _seed_reset(user_id, token, minutes=30):
    now = datetime.now(timezone.utc)
    _db().password_resets.insert_one({"token_hash": hashlib.sha256(token.encode()).hexdigest(), "user_id": user_id,
                                      "created_at": now, "expire_at": now + timedelta(minutes=minutes)})


def test_reset_changes_password_works_once_and_ends_old_sessions():
    email, data = _register()
    old_headers = {"Authorization": f"Bearer {data['token']}"}
    assert requests.get(f"{API}/auth/me", headers=old_headers, timeout=15).status_code == 200
    token = uuid.uuid4().hex
    _seed_reset(data["user"]["id"], token)
    time.sleep(1.1)  # tokens carry whole seconds: make sure the reset lands after the login above
    r = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": "new-password-1"}, timeout=15)
    assert r.status_code == 200, r.text
    assert requests.get(f"{API}/auth/me", headers=old_headers, timeout=15).status_code == 401
    assert _login(email, "password123").status_code == 401
    fresh = _login(email, "new-password-1")
    assert fresh.status_code == 200
    assert requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {fresh.json()['token']}"}, timeout=15).status_code == 200
    # Used link
    assert requests.post(f"{API}/auth/reset-password", json={"token": token, "password": "another-pass"}, timeout=15).status_code == 400


def test_expired_or_made_up_reset_link_is_refused():
    email, data = _register()
    token = uuid.uuid4().hex
    _seed_reset(data["user"]["id"], token, minutes=-1)
    for t in (token, "made-up"):
        assert requests.post(f"{API}/auth/reset-password", json={"token": t, "password": "new-password-1"}, timeout=15).status_code == 400
    assert _login(email, "password123").status_code == 200


def test_only_admin_can_delete_a_student_and_everything_about_them_goes():
    db = _db()
    email, data = _register()
    sid = data["user"]["id"]
    tag = uuid.uuid4().hex
    db.submissions.insert_one({"id": tag, "student_id": sid, "test_id": tag, "kind": "dpp"})
    db.batch_fees.insert_one({"batch_id": tag, "student_id": sid})
    db.test_starts.insert_one({"test_id": tag, "student_id": sid})
    db.tests.insert_one({"id": tag, "kind": "test", "excused_student_ids": [sid, "other"], "makeups": [{"student_id": sid}]})
    other_teacher = {"Authorization": f"Bearer {_register('teacher')[1]['token']}"}
    assert requests.delete(f"{API}/admin/students/{sid}", headers=other_teacher, timeout=15).status_code == 403

    admin = requests.post(f"{API}/auth/login", json={"email": os.environ.get("ADMIN_EMAIL", "admin@somacademy.example.com"),
                                                      "password": os.environ["ADMIN_PASSWORD"]}, timeout=15).json()["token"]
    headers = {"Authorization": f"Bearer {admin}"}
    r = requests.delete(f"{API}/admin/students/{sid}", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    assert db.users.find_one({"_id": ObjectId(sid)}) is None
    for coll in ("submissions", "batch_fees", "test_starts"):
        assert db[coll].count_documents({"student_id": sid}) == 0
    t = db.tests.find_one({"id": tag})
    assert t["excused_student_ids"] == ["other"] and t["makeups"] == []
    db.tests.delete_one({"id": tag})
    # Their old login stops working, and admin accounts can't be removed this way
    assert requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {data['token']}"}, timeout=15).status_code == 401
    me = requests.get(f"{API}/auth/me", headers=headers, timeout=15).json()
    assert requests.delete(f"{API}/admin/students/{me['id']}", headers=headers, timeout=15).status_code == 404


def test_a_note_whose_file_is_missing_gets_a_clear_404_not_a_server_error():
    db = _db()
    email, data = _register("teacher")
    headers = {"Authorization": f"Bearer {data['token']}"}
    res_id = uuid.uuid4().hex
    db.resources.insert_one({"id": res_id, "teacher_id": data["user"]["id"], "batch_id": "x", "filename": "gone.pdf", "is_deleted": False,
                             "storage_path": f"som/resources/missing/{res_id}.pdf", "content_type": "application/pdf"})
    try:
        r = requests.get(f"{API}/resources/{res_id}/file", headers=headers, timeout=15)
        assert r.status_code == 404 and "no longer available" in r.json()["detail"]
    finally:
        db.resources.delete_one({"id": res_id})
