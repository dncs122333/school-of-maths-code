"""Sign-up contact details, the parent's agreement, the waiting state, and the permanent consent record."""
import asyncio
import hashlib
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import certifi
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

frontend_env = dotenv_values("frontend/.env") if os.path.exists("frontend/.env") else {}
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/") or "http://localhost:8001"
API = f"{BASE_URL}/api"
KEEP_WAITING = {"X-Test-Keep-Consent-Pending": "1"}
db = MongoClient(os.environ["MONGO_URL"], tlsCAFile=certifi.where())[os.environ["DB_NAME"]]


def _sign_up_body(**extra):
    tag = uuid.uuid4().hex[:8]
    return {"name": "Aarav Test", "email": f"test_student_{tag}@example.com", "password": "password123", "consent": True,
            "phone": "9812345678", "parent_name": "Sunita Test", "parent_phone": "9812300000",
            "parent_email": f"parent_{tag}@example.com", **extra}


def _waiting_student(**extra):
    body = _sign_up_body(**extra)
    r = requests.post(f"{API}/auth/register", json=body, headers=KEEP_WAITING, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    return SimpleNamespace(id=data["user"]["id"], email=body["email"], parent_email=body["parent_email"], user=data["user"],
                           headers={"Authorization": f"Bearer {data['token']}"})


def _teacher():
    r = requests.post(f"{API}/auth/register", json={"name": "T", "email": f"test_teacher_{uuid.uuid4().hex[:8]}@example.com",
                                                    "password": "password123", "role": "teacher"}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _admin():
    r = requests.post(f"{API}/auth/login", json={"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]}, timeout=20)
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _batch(teacher, **extra):
    r = requests.post(f"{API}/batches", json={"name": f"Consent {uuid.uuid4().hex[:6]}", "class_level": "10", **extra}, headers=teacher, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def _link_for(student_id, minutes=60):
    """Replace the emailed link with one whose value the test knows."""
    token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    db.parent_consent_tokens.delete_many({"student_id": student_id})
    db.parent_consent_tokens.insert_one({"token_hash": hashlib.sha256(token.encode()).hexdigest(), "student_id": student_id,
                                         "created_at": now, "expire_at": now + timedelta(minutes=minutes)})
    return token


def _records(student_id):
    return list(db.consent_records.find({"student_ref": student_id}).sort("at", 1))


def test_sign_up_checks_the_contact_details():
    for change, message in [({"phone": "12345"}, "mobile number"), ({"parent_phone": ""}, "mobile number"), ({"parent_name": " "}, "parent's name"),
                            ({"parent_email": None}, "parent's email")]:
        r = requests.post(f"{API}/auth/register", json=_sign_up_body(**change), headers=KEEP_WAITING, timeout=20)
        assert r.status_code == 400 and message in r.json()["detail"], r.text
    body = _sign_up_body()
    body["parent_email"] = body["email"].upper()
    assert requests.post(f"{API}/auth/register", json=body, headers=KEEP_WAITING, timeout=20).status_code == 400


def test_phone_is_stored_as_ten_digits_however_it_was_typed_and_can_match_the_parents():
    s = _waiting_student(phone="+91 98123-00000", parent_phone="098123 00000")
    doc = db.users.find_one({"_id": ObjectId(s.id)})
    assert doc["phone"] == "9812300000" and doc["parent"]["phone"] == "9812300000"
    assert doc["parent_consent_status"] == "pending"


def test_teacher_sign_up_needs_only_their_own_phone():
    body = {"name": "T", "email": f"test_teacher_{uuid.uuid4().hex[:8]}@example.com", "password": "password123", "role": "teacher", "consent": True}
    assert requests.post(f"{API}/auth/register", json={**body, "phone": "1"}, timeout=20).status_code == 400
    assert requests.post(f"{API}/auth/register", json={**body, "phone": "9812345678"}, timeout=20).status_code == 200
    doc = db.users.find_one({"email": body["email"]})
    assert doc["phone"] == "9812345678" and "parent" not in doc and "parent_consent_status" not in doc


def test_waiting_student_can_only_reach_their_account_and_joining():
    s = _waiting_student()
    me = requests.get(f"{API}/auth/me", headers=s.headers, timeout=20)
    assert me.status_code == 200 and me.json()["parent_consent_status"] == "pending"
    for path in ("tests?kind=test", "resources", "mastery/me", "batches"):
        r = requests.get(f"{API}/{path}", headers=s.headers, timeout=20)
        assert r.status_code == 403 and "parent" in r.json()["detail"], (path, r.status_code)
    login = requests.post(f"{API}/auth/login", json={"email": s.email, "password": "password123"}, timeout=20).json()
    assert login["user"]["parent_consent_status"] == "pending"
    event = _records(s.id)[0]
    assert event["event"] == "requested" and event["parent_email"] == s.parent_email


def test_parent_link_shows_details_without_agreeing_then_opens_access_once():
    s = _waiting_student()
    token = _link_for(s.id)
    details = requests.post(f"{API}/consent/details", json={"token": token}, timeout=20)
    assert details.status_code == 200 and details.json()["student_name"] == "Aarav Test"
    assert "Aarav Test" in details.json()["wording"]
    assert requests.get(f"{API}/tests?kind=test", headers=s.headers, timeout=20).status_code == 403  # viewing isn't agreeing

    ok = requests.post(f"{API}/consent/confirm", json={"token": token}, headers={"User-Agent": "ParentPhone/1.0"}, timeout=20)
    assert ok.status_code == 200, ok.text
    assert requests.get(f"{API}/tests?kind=test", headers=s.headers, timeout=20).status_code == 200
    assert requests.post(f"{API}/consent/confirm", json={"token": token}, timeout=20).status_code == 400

    record = _records(s.id)[-1]
    assert record["event"] == "confirmed" and record["method"] == "email_link"
    assert record["parent_email"] == s.parent_email and record["parent_name"] == "Sunita Test"
    assert "Aarav Test" in record["wording"] and record["wording_version"] and record["at"]
    assert record["user_agent"] == "ParentPhone/1.0" and record["ip"]


def test_expired_or_made_up_link_is_refused():
    s = _waiting_student()
    expired = _link_for(s.id, minutes=-1)
    for token in (expired, "made-up"):
        assert requests.post(f"{API}/consent/confirm", json={"token": token}, timeout=20).status_code == 400
    assert db.users.find_one({"_id": ObjectId(s.id)})["parent_consent_status"] == "pending"


def test_waiting_student_can_resend_or_correct_the_email_and_old_links_stop_working():
    s = _waiting_student()
    old = _link_for(s.id)
    r = requests.put(f"{API}/consent/parent-email", json={"parent_email": "Right.Parent@example.com"}, headers=s.headers, timeout=20)
    assert r.status_code == 200 and r.json()["sent_to"] == "right.parent@example.com"
    assert requests.post(f"{API}/consent/details", json={"token": old}, timeout=20).status_code == 400
    assert db.parent_consent_tokens.count_documents({"student_id": s.id}) == 1
    assert _records(s.id)[-1]["parent_email"] == "right.parent@example.com"
    assert requests.put(f"{API}/consent/parent-email", json={"parent_email": s.email}, headers=s.headers, timeout=20).status_code == 400
    assert requests.post(f"{API}/consent/resend", headers=s.headers, timeout=20).status_code == 200
    # Signing up and the two sends above used 3 of the 5 allowed per hour
    assert requests.post(f"{API}/consent/resend", headers=s.headers, timeout=20).status_code == 200
    assert requests.post(f"{API}/consent/resend", headers=s.headers, timeout=20).status_code == 200
    assert requests.post(f"{API}/consent/resend", headers=s.headers, timeout=20).status_code == 429


def test_confirmed_student_has_nothing_to_resend():
    s = _waiting_student()
    requests.post(f"{API}/consent/confirm", json={"token": _link_for(s.id)}, timeout=20)
    assert requests.post(f"{API}/consent/resend", headers=s.headers, timeout=20).status_code == 400


def test_teacher_sees_a_waiting_student_and_can_record_a_signed_form():
    teacher, other = _teacher(), _teacher()
    batch = _batch(teacher, join_requires_approval=True)
    s = _waiting_student()
    joined = requests.post(f"{API}/batches/join", json={"code": batch["code"]}, headers=s.headers, timeout=20)
    assert joined.status_code == 200 and joined.json()["join_status"] == "pending"

    waiting = requests.get(f"{API}/batches/{batch['id']}/join-requests", headers=teacher, timeout=20).json()
    assert waiting[0]["parent_consent_status"] == "pending" and waiting[0]["parent"]["phone"] == "9812300000"

    url = f"{API}/batches/{batch['id']}/students/{s.id}/consent"
    assert requests.post(f"{url}/signed-form", headers=other, timeout=20).status_code == 403
    assert requests.post(f"{url}/resend", headers=other, timeout=20).status_code == 403
    assert requests.post(f"{url}/resend", headers=teacher, timeout=20).status_code == 200
    assert requests.post(f"{url}/signed-form", headers=teacher, timeout=20).status_code == 200
    assert requests.get(f"{API}/tests?kind=test", headers=s.headers, timeout=20).status_code == 200
    record = _records(s.id)[-1]
    assert record["method"] == "signed_form" and record["actor_name"] == "T" and record["actor_id"]
    assert requests.post(f"{url}/signed-form", headers=teacher, timeout=20).status_code == 400


def test_teacher_cannot_touch_a_student_outside_their_batch():
    teacher = _teacher()
    batch = _batch(teacher)
    s = _waiting_student()
    assert requests.post(f"{API}/batches/{batch['id']}/students/{s.id}/consent/signed-form", headers=teacher, timeout=20).status_code == 404
    assert requests.put(f"{API}/batches/{batch['id']}/students/{s.id}/contact", json={"phone": "9812345670"}, headers=teacher, timeout=20).status_code == 404


def test_roster_shows_contact_details_and_teacher_can_correct_numbers():
    teacher = _teacher()
    batch = _batch(teacher)
    s = _waiting_student()
    requests.post(f"{API}/batches/join", json={"code": batch["code"]}, headers=s.headers, timeout=20)
    roster = requests.get(f"{API}/batches/{batch['id']}/students", headers=teacher, timeout=20).json()
    rows = roster["students"] if isinstance(roster, dict) else roster
    row = next(x for x in rows if x["id"] == s.id)
    assert row["phone"] == "9812345678" and row["parent"]["email"] == s.parent_email and row["parent_consent_status"] == "pending"

    url = f"{API}/batches/{batch['id']}/students/{s.id}/contact"
    assert requests.put(url, json={"phone": "bad"}, headers=teacher, timeout=20).status_code == 400
    assert requests.put(url, json={"phone": "9812345670", "parent_phone": "9812345671"}, headers=teacher, timeout=20).status_code == 200
    doc = db.users.find_one({"_id": ObjectId(s.id)})
    assert doc["phone"] == "9812345670" and doc["parent"]["phone"] == "9812345671"

    # A corrected email gets a new link; once a parent has agreed, the agreed email can't be swapped
    assert requests.put(url, json={"parent_email": "new.parent@example.com"}, headers=teacher, timeout=20).status_code == 200
    assert _records(s.id)[-1]["parent_email"] == "new.parent@example.com"
    requests.post(f"{API}/batches/{batch['id']}/students/{s.id}/consent/signed-form", headers=teacher, timeout=20)
    assert requests.put(url, json={"parent_email": "other@example.com"}, headers=teacher, timeout=20).status_code == 400
    assert requests.put(url, json={"parent_phone": "9812345672"}, headers=teacher, timeout=20).status_code == 200


def test_only_admin_can_read_records_and_withdrawal_closes_access_until_a_parent_agrees_again():
    s = _waiting_student()
    token = _link_for(s.id)
    requests.post(f"{API}/consent/confirm", json={"token": token}, timeout=20)
    admin, teacher = _admin(), _teacher()
    url = f"{API}/admin/students/{s.id}"
    assert requests.get(f"{url}/consent-records", headers=teacher, timeout=20).status_code == 403
    assert requests.post(f"{url}/consent/withdraw", headers=teacher, timeout=20).status_code == 403
    assert requests.post(f"{url}/consent/withdraw", headers=admin, timeout=20).status_code == 200
    assert requests.get(f"{API}/tests?kind=test", headers=s.headers, timeout=20).status_code == 403

    events = [r["event"] for r in requests.get(f"{url}/consent-records", headers=admin, timeout=20).json()]
    assert events == ["requested", "confirmed", "withdrawn"]  # the original stays beside the withdrawal

    assert requests.post(f"{API}/consent/resend", headers=s.headers, timeout=20).status_code == 200
    token = _link_for(s.id)
    assert requests.post(f"{API}/consent/confirm", json={"token": token}, timeout=20).status_code == 200
    assert requests.get(f"{API}/tests?kind=test", headers=s.headers, timeout=20).status_code == 200


def test_erasing_a_student_keeps_only_anonymous_proof_of_consent():
    s = _waiting_student()
    requests.post(f"{API}/consent/confirm", json={"token": _link_for(s.id)}, timeout=20)
    assert requests.delete(f"{API}/admin/students/{s.id}", headers=_admin(), timeout=30).status_code == 200
    assert db.users.find_one({"_id": ObjectId(s.id)}) is None
    assert not _records(s.id) and not db.parent_consent_tokens.find_one({"student_id": s.id})
    kept = list(db.consent_records.find({"anonymised": True, "at": {"$gte": (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()}}).sort("at", -1).limit(2))
    assert {r["event"] for r in kept} == {"requested", "confirmed"}
    for r in kept:
        assert not {"student_name", "student_email", "parent_name", "parent_email", "parent_phone", "ip", "user_agent"} & set(r)
        assert r["wording_version"] and r["at"] and s.id not in r["student_ref"]


def test_parent_email_goes_through_brevo_with_the_link_and_hides_failures(monkeypatch, caplog):
    import mailer
    sent = {}

    def fake_post(url, headers, json, timeout):
        sent.update(json=json)
        return SimpleNamespace(raise_for_status=lambda: None)

    monkeypatch.setattr(mailer, "BREVO_API_KEY", "key")
    monkeypatch.setattr(mailer, "EMAIL_FROM", "noreply@example.com")
    monkeypatch.setattr(mailer, "APP_URL", "https://app.example.com")
    monkeypatch.setattr(mailer.requests, "post", fake_post)
    asyncio.run(mailer.send_parent_consent("p@mail.test", "<Sunita>", "Aarav", "tok123"))
    assert sent["json"]["to"][0]["email"] == "p@mail.test"
    assert "https://app.example.com/parent-consent?token=tok123" in sent["json"]["textContent"]
    assert "&lt;Sunita&gt;" in sent["json"]["htmlContent"] and "Aarav" in sent["json"]["subject"]

    def failing_post(*a, **k):
        raise RuntimeError("secret detail")

    monkeypatch.setattr(mailer.requests, "post", failing_post)
    asyncio.run(mailer.send_parent_consent("p@mail.test", "S", "A", "tok123"))
    assert "secret detail" not in caplog.text and "RuntimeError" in caplog.text
    caplog.clear()
    asyncio.run(mailer.send_parent_consent("p@sub.example.com", "S", "A", "tok123"))  # fake addresses are never tried
    assert "RuntimeError" not in caplog.text
