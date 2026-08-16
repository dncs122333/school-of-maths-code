"""VidyaLab backend integration tests.

Uses external REACT_APP_BACKEND_URL. All stateful flows are inside a single
class so pytest-xdist loadscope keeps them on one worker.
"""
import os
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
API = f"{BASE_URL}/api"


RAW_NOTES = (
    "Gravitation: every mass attracts every other mass. Newton's law: F = G m1 m2 / r^2. "
    "g on Earth ~ 9.8 m/s^2. Free fall. Weight = m*g. Mass constant, weight varies with g."
)
RAW_MCQ = (
    "1) g on Earth ~ 9.8 m/s^2. 2) Weight = m*g. 3) F = G m1 m2 / r^2. "
    "4) Mass is constant across universe. 5) Free fall acceleration is g."
)


def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} -> {r.status_code}: {r.text}"
    return r.json()


class TestAuthBasics:
    """Auth-only smoke tests (no shared state needed)."""

    def test_admin_login_me(self):
        s = requests.Session()
        d = _login(s, "admin@vidya.com", "admin123")
        h = {"Authorization": f"Bearer {d['token']}"}
        me = s.get(f"{API}/auth/me", headers=h, timeout=15)
        assert me.status_code == 200
        j = me.json()
        assert j["email"] == "admin@vidya.com" and j["role"] == "admin"
        assert "id" in j and "_id" not in j and "password_hash" not in j

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": "admin@vidya.com", "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_invalid_role_registration(self):
        r = requests.post(f"{API}/auth/register",
                          json={"name": "x", "email": f"TEST_bad_{uuid.uuid4().hex[:6]}@x.com",
                                "password": "abc123", "role": "admin"}, timeout=15)
        assert r.status_code == 400

    def test_duplicate_registration(self):
        s = requests.Session()
        email = f"TEST_dup_{uuid.uuid4().hex[:6]}@x.com"
        r1 = s.post(f"{API}/auth/register",
                    json={"name": "a", "email": email, "password": "abc123", "role": "student"}, timeout=15)
        assert r1.status_code == 200
        r2 = s.post(f"{API}/auth/register",
                    json={"name": "a", "email": email, "password": "abc123", "role": "student"}, timeout=15)
        assert r2.status_code == 400


class TestFullFlow:
    """End-to-end stateful flow: teacher+student -> batch -> note -> test -> dpp -> stats."""

    # class-level shared state
    state = {}

    @pytest.fixture(scope="class", autouse=True)
    def setup_users(self, request):
        s = requests.Session()
        # Fresh teacher
        t_email = f"TEST_t_{uuid.uuid4().hex[:8]}@vidya.com"
        r = s.post(f"{API}/auth/register",
                   json={"name": "TEST Teacher", "email": t_email, "password": "pass1234", "role": "teacher"},
                   timeout=30)
        assert r.status_code == 200, r.text
        td = r.json()

        st_email = f"TEST_s_{uuid.uuid4().hex[:8]}@vidya.com"
        r = s.post(f"{API}/auth/register",
                   json={"name": "TEST Student", "email": st_email, "password": "pass1234", "role": "student"},
                   timeout=30)
        assert r.status_code == 200, r.text
        sd = r.json()

        TestFullFlow.state = {
            "s": s,
            "teacher": {"token": td["token"], "user": td["user"],
                        "h": {"Authorization": f"Bearer {td['token']}"}, "email": t_email},
            "student": {"token": sd["token"], "user": sd["user"],
                        "h": {"Authorization": f"Bearer {sd['token']}"}, "email": st_email},
        }
        yield

    # ----- auth me -----
    def test_01_teacher_me(self):
        st = self.state
        r = st["s"].get(f"{API}/auth/me", headers=st["teacher"]["h"], timeout=15)
        assert r.status_code == 200 and r.json()["role"] == "teacher"

    def test_02_student_me(self):
        st = self.state
        r = st["s"].get(f"{API}/auth/me", headers=st["student"]["h"], timeout=15)
        assert r.status_code == 200 and r.json()["role"] == "student"

    # ----- batches -----
    def test_10_teacher_creates_batch(self):
        st = self.state
        r = st["s"].post(f"{API}/batches", headers=st["teacher"]["h"],
                        json={"name": "TEST Batch A", "class_level": "10"}, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["name"] == "TEST Batch A" and b["class_level"] == "10"
        assert b.get("code") and len(b["code"]) >= 4
        assert b["teacher_id"] == st["teacher"]["user"]["id"]
        st["batch"] = b

    def test_11_list_teacher_batches(self):
        st = self.state
        r = st["s"].get(f"{API}/batches", headers=st["teacher"]["h"], timeout=15)
        assert r.status_code == 200
        batches = r.json()
        assert any(b["id"] == st["batch"]["id"] for b in batches)
        for b in batches:
            assert "student_count" in b

    def test_12_student_cannot_create_batch(self):
        st = self.state
        r = st["s"].post(f"{API}/batches", headers=st["student"]["h"],
                        json={"name": "x", "class_level": "10"}, timeout=15)
        assert r.status_code == 403

    def test_13_student_join_bad_code(self):
        st = self.state
        r = st["s"].post(f"{API}/batches/join", headers=st["student"]["h"],
                        json={"code": "BADXYZ"}, timeout=15)
        assert r.status_code == 404

    def test_14_student_joins_batch(self):
        st = self.state
        code = st["batch"]["code"]
        r = st["s"].post(f"{API}/batches/join", headers=st["student"]["h"],
                        json={"code": code}, timeout=15)
        assert r.status_code == 200
        me = st["s"].get(f"{API}/auth/me", headers=st["student"]["h"], timeout=15).json()
        assert st["batch"]["id"] in me.get("batch_ids", [])
        tb = st["s"].get(f"{API}/batches", headers=st["teacher"]["h"], timeout=15).json()
        for b in tb:
            if b["id"] == st["batch"]["id"]:
                assert b["student_count"] >= 1

    # ----- notes (AI) -----
    def test_20_teacher_creates_note(self):
        st = self.state
        payload = {"title": "TEST Gravitation", "class_level": "9", "subject": "Science",
                   "chapter": "Gravitation", "topic": "Basics", "raw_text": RAW_NOTES}
        r = st["s"].post(f"{API}/notes", headers=st["teacher"]["h"], json=payload, timeout=240)
        assert r.status_code == 200, r.text
        note = r.json()
        assert note["title"]
        assert isinstance(note.get("sections"), list) and len(note["sections"]) >= 3
        assert isinstance(note.get("mnemonics"), list)
        assert isinstance(note.get("quick_revision"), list)
        for sec in note["sections"]:
            # image_prompt must not leak to clients
            assert "image_prompt" not in sec
        st["note"] = note

    def test_21_list_and_get_note(self):
        st = self.state
        r = st["s"].get(f"{API}/notes", headers=st["teacher"]["h"], timeout=15)
        assert r.status_code == 200
        assert any(n["id"] == st["note"]["id"] for n in r.json())
        r = st["s"].get(f"{API}/notes/{st['note']['id']}", headers=st["teacher"]["h"], timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json()["sections"], list)

    def test_22_media_serves_image(self):
        st = self.state
        img_path = None
        for sec in st["note"].get("sections", []):
            if sec.get("image_path"):
                img_path = sec["image_path"]
                break
        if not img_path:
            pytest.skip("No image_path present (image gen failed or none generated)")
        r = st["s"].get(f"{API}/media/{img_path}", timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 100

    def test_23_student_can_view_note(self):
        st = self.state
        r = st["s"].get(f"{API}/notes/{st['note']['id']}", headers=st["student"]["h"], timeout=15)
        assert r.status_code == 200

    # ----- timed test -----
    def test_30_teacher_creates_timed_test(self):
        st = self.state
        payload = {"title": "TEST Gravitation MCQ", "kind": "test", "class_level": "9",
                   "subject": "Science", "chapter": "Gravitation", "topic": "",
                   "batch_id": st["batch"]["id"], "raw_text": RAW_MCQ,
                   "duration_minutes": 15, "valid_hours": 24, "activate_now": True}
        r = st["s"].post(f"{API}/tests", headers=st["teacher"]["h"], json=payload, timeout=180)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["question_count"] >= 5 and "id" in d
        st["test"] = d

    def test_31_student_sees_test_active(self):
        st = self.state
        r = st["s"].get(f"{API}/tests", headers=st["student"]["h"], timeout=15)
        assert r.status_code == 200
        m = [t for t in r.json() if t["id"] == st["test"]["id"]]
        assert m, "student cannot see teacher's test"
        t = m[0]
        assert t["is_active"] is True
        assert t["question_count"] == st["test"]["question_count"]
        assert t.get("submitted") is False

    def test_32_student_get_test_hides_answers(self):
        st = self.state
        r = st["s"].get(f"{API}/tests/{st['test']['id']}", headers=st["student"]["h"], timeout=15)
        assert r.status_code == 200
        t = r.json()
        assert t.get("questions")
        for q in t["questions"]:
            assert "correct_index" not in q, "correct_index leaked to student!"
            assert "explanation" not in q, "explanation leaked to student!"
            assert isinstance(q["options"], list) and len(q["options"]) == 4

    def test_33_teacher_preview_shows_answers(self):
        st = self.state
        r = st["s"].get(f"{API}/tests/{st['test']['id']}", headers=st["teacher"]["h"], timeout=15)
        assert r.status_code == 200
        t = r.json()
        assert t["questions"] and "correct_index" in t["questions"][0]

    def test_34_student_submits_and_gets_review(self):
        st = self.state
        tid = st["test"]["id"]
        t = st["s"].get(f"{API}/tests/{tid}", headers=st["student"]["h"], timeout=15).json()
        answers = [0] * len(t["questions"])
        r = st["s"].post(f"{API}/tests/{tid}/submit", headers=st["student"]["h"],
                        json={"answers": answers}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total"] == len(answers)
        assert isinstance(d["review"], list) and len(d["review"]) == d["total"]
        for item in d["review"]:
            for k in ("correct_index", "explanation", "is_correct", "chosen"):
                assert k in item

    def test_35_student_double_submit_blocked(self):
        st = self.state
        r = st["s"].post(f"{API}/tests/{st['test']['id']}/submit", headers=st["student"]["h"],
                        json={"answers": [0, 0, 0, 0, 0]}, timeout=15)
        assert r.status_code == 403

    def test_36_student_get_after_submit_forbidden(self):
        st = self.state
        r = st["s"].get(f"{API}/tests/{st['test']['id']}", headers=st["student"]["h"], timeout=15)
        assert r.status_code == 403

    # ----- DPP -----
    def test_40_teacher_creates_dpp(self):
        st = self.state
        payload = {"title": "TEST DPP", "kind": "dpp", "class_level": "9",
                   "subject": "Science", "chapter": "Gravitation", "topic": "",
                   "batch_id": None, "raw_text": RAW_MCQ,
                   "duration_minutes": 10, "valid_hours": 24}
        r = st["s"].post(f"{API}/tests", headers=st["teacher"]["h"], json=payload, timeout=180)
        assert r.status_code == 200, r.text
        st["dpp"] = r.json()

    def test_41_student_sees_dpp(self):
        st = self.state
        r = st["s"].get(f"{API}/tests?kind=dpp", headers=st["student"]["h"], timeout=15)
        assert r.status_code == 200
        assert st["dpp"]["id"] in [t["id"] for t in r.json()]

    def test_42_dpp_is_repeatable(self):
        st = self.state
        tid = st["dpp"]["id"]
        t = st["s"].get(f"{API}/tests/{tid}", headers=st["student"]["h"], timeout=15).json()
        answers = [0] * len(t["questions"])
        for _ in range(2):
            r = st["s"].post(f"{API}/tests/{tid}/submit", headers=st["student"]["h"],
                            json={"answers": answers}, timeout=30)
            assert r.status_code == 200, r.text

    # ----- Stats -----
    def test_50_stats_teacher(self):
        st = self.state
        r = st["s"].get(f"{API}/stats", headers=st["teacher"]["h"], timeout=15)
        assert r.status_code == 200
        for k in ("notes", "tests", "dpps", "batches"):
            assert k in r.json()

    def test_51_stats_student(self):
        st = self.state
        r = st["s"].get(f"{API}/stats", headers=st["student"]["h"], timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["tests_taken"] >= 1

    def test_52_stats_admin(self):
        s = requests.Session()
        tok = _login(s, "admin@vidya.com", "admin123")["token"]
        r = s.get(f"{API}/stats", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
