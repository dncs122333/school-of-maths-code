"""Class tests: one attempt, hidden answers until release, scheduling, autosave/auto-submit, make-ups,
excused attendance, per-student question order and report roster."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
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


def _reg(role, name):
    r = requests.post(f"{API}/auth/register", json={"name": name, "email": f"test_{role}_{uuid.uuid4().hex[:8]}@example.com",
                                                   "password": "password123", "role": role}, timeout=15)
    assert r.status_code == 200, r.text
    return {"id": r.json()["user"]["id"], "h": {"Authorization": f"Bearer {r.json()['token']}"}}


QUESTIONS = [{"id": f"q{i}", "question": f"Q{i}?", "options": ["A", "B", "C", "D"], "correct_index": 2, "explanation": "C"}
             for i in range(6)]


class TestClassTests:
    @classmethod
    def setup_class(cls):
        cls.teacher = _reg("teacher", "CT Teacher")
        cls.students = [_reg("student", f"CT Student {i}") for i in range(3)]
        cls.batch = requests.post(f"{API}/batches", json={"name": "CT Batch", "class_level": "9"},
                                  headers=cls.teacher["h"], timeout=15).json()
        for s in cls.students:
            requests.post(f"{API}/batches/join", json={"code": cls.batch["code"]}, headers=s["h"], timeout=15)

    def _make(self, opens_delta_min=0, window_min=50, duration=20, batch_id=None, per_student=True):
        now = datetime.now(timezone.utc)
        opens = now + timedelta(minutes=opens_delta_min)
        tid = str(uuid.uuid4())
        _db.tests.insert_one({"id": tid, "title": "CT", "kind": "test", "class_level": "9", "subject": "Maths",
                              "chapter": "x", "topic": "", "batch_id": batch_id or self.batch["id"], "status": "ready",
                              "is_active": True, "duration_minutes": duration, "teacher_id": self.teacher["id"],
                              "questions": QUESTIONS, "question_order": "per_student" if per_student else "fixed",
                              "makeups": [], "excused_student_ids": [], "results_released_at": None,
                              "valid_from": opens.isoformat(), "valid_until": (opens + timedelta(minutes=window_min)).isoformat(),
                              "created_at": now.isoformat()})
        return tid

    def _correct_answers(self, view):
        return [q["options"].index("C") for q in view["questions"]]

    def test_answers_hidden_until_release_and_single_attempt_enforced(self):
        tid = self._make()
        s = self.students[0]
        view = requests.get(f"{API}/tests/{tid}", headers=s["h"], timeout=15).json()
        with ThreadPoolExecutor(6) as ex:
            codes = list(ex.map(lambda _: requests.post(f"{API}/tests/{tid}/submit", json={"answers": self._correct_answers(view)},
                                                        headers=s["h"], timeout=15), range(6)))
        assert sorted(c.status_code for c in codes).count(200) == 1
        assert _db.submissions.count_documents({"test_id": tid, "student_id": s["id"]}) == 1
        ok = next(c for c in codes if c.status_code == 200).json()
        assert ok["score"] == 100 and ok["review"] is None and ok["review_available_at"]

    def test_per_student_order_still_grades_correctly(self):
        tid = self._make()
        a, b = self.students[1], self.students[2]
        va = requests.get(f"{API}/tests/{tid}", headers=a["h"], timeout=15).json()
        vb = requests.get(f"{API}/tests/{tid}", headers=b["h"], timeout=15).json()
        assert vb["questions"]  # both students get the full set, each in their own stable order
        assert sorted(q["question"] for q in va["questions"]) == sorted(q["question"] for q in QUESTIONS)
        r = requests.post(f"{API}/tests/{tid}/submit", json={"answers": self._correct_answers(va)}, headers=a["h"], timeout=15)
        assert r.status_code == 200 and r.json()["score"] == 100

    def test_scheduled_test_not_open_yet(self):
        tid = self._make(opens_delta_min=60)
        r = requests.get(f"{API}/tests/{tid}", headers=self.students[0]["h"], timeout=15)
        assert r.status_code == 403 and "opens" in r.text
        listed = next(t for t in requests.get(f"{API}/tests", params={"kind": "test"}, headers=self.students[0]["h"], timeout=15).json()
                      if t["id"] == tid)
        assert listed["opens_in_future"] is True and listed["is_active"] is False

    def test_class_tests_need_a_time_limit_and_default_window(self):
        body = {"title": "Untimed", "kind": "test", "class_level": "9", "subject": "Maths", "batch_id": self.batch["id"],
                "question_ids": ["nope"], "duration_minutes": 0}
        assert requests.post(f"{API}/tests", json=body, headers=self.teacher["h"], timeout=15).status_code == 400
        start = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        r = requests.post(f"{API}/tests", json={**body, "duration_minutes": 40, "start_at": start}, headers=self.teacher["h"], timeout=15)
        assert r.status_code == 200, r.text
        doc = _db.tests.find_one({"id": r.json()["id"]})
        opens = datetime.fromisoformat(doc["valid_from"])
        closes = datetime.fromisoformat(doc["valid_until"])
        assert abs((opens - datetime.fromisoformat(start)).total_seconds()) < 2
        assert closes - opens == timedelta(minutes=70)  # duration + 30 min

    def test_autosave_then_auto_submit_after_deadline(self):
        tid = self._make()
        s = self.students[1]
        view = requests.get(f"{API}/tests/{tid}", headers=s["h"], timeout=15).json()
        draft = self._correct_answers(view)[:3] + [-1] * 3
        assert requests.put(f"{API}/tests/{tid}/draft", json={"answers": draft}, headers=s["h"], timeout=15).status_code == 200
        # Tab closed and the time ran out
        past = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        _db.test_starts.update_one({"test_id": tid, "student_id": s["id"]}, {"$set": {"started_at": past}})
        requests.get(f"{API}/tests", params={"kind": "test"}, headers=s["h"], timeout=15)  # triggers finalize
        sub = _db.submissions.find_one({"test_id": tid, "student_id": s["id"]})
        assert sub and sub["status"] == "auto_submitted" and sub["correct"] == 3

    def test_makeup_excuse_release_hold_and_attendance(self):
        tid = self._make(opens_delta_min=-90, window_min=50)  # already closed
        taker, absent, excused = self.students
        # Taker submitted in time (inserted directly since the window has passed)
        _db.submissions.insert_one({"id": str(uuid.uuid4()), "test_id": tid, "kind": "test", "student_id": taker["id"],
                                    "student_name": "T", "answers": [2] * 6, "results": [], "score": 100, "correct": 6,
                                    "total": 6, "status": "submitted", "created_at": datetime.now(timezone.utc).isoformat()})
        assert requests.get(f"{API}/tests/{tid}/my-review", headers=taker["h"], timeout=15).json()["review"] is not None

        mk = requests.post(f"{API}/tests/{tid}/makeup", json={"student_ids": [absent["id"]]}, headers=self.teacher["h"], timeout=15)
        assert mk.status_code == 200, mk.text
        # Release is now held until the make-up closes
        assert requests.get(f"{API}/tests/{tid}/my-review", headers=taker["h"], timeout=15).json()["review"] is None
        view = requests.get(f"{API}/tests/{tid}", headers=absent["h"], timeout=15)
        assert view.status_code == 200, view.text
        r = requests.post(f"{API}/tests/{tid}/submit", json={"answers": self._correct_answers(view.json())}, headers=absent["h"], timeout=15)
        assert r.status_code == 200 and r.json()["status"] == "submitted"
        assert _db.submissions.find_one({"test_id": tid, "student_id": absent["id"]})["is_makeup"] is True

        assert requests.post(f"{API}/tests/{tid}/excuse", json={"student_ids": [excused["id"]]}, headers=self.teacher["h"], timeout=15).status_code == 200
        missed = requests.get(f"{API}/tests/{tid}/missed-students", headers=self.teacher["h"], timeout=15).json()
        assert [m["excused"] for m in missed["missed_students"]] == [True]

        assert requests.post(f"{API}/tests/{tid}/release-results", headers=self.teacher["h"], timeout=15).status_code == 200
        assert requests.get(f"{API}/tests/{tid}/my-review", headers=taker["h"], timeout=15).json()["review"] is not None

        # Attendance ignores tests given before a student joined, and this test is backdated: join earlier
        from bson import ObjectId
        joined = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
        for st in self.students:
            _db.users.update_one({"_id": ObjectId(st["id"])}, {"$set": {f"batch_enrolled_at.{self.batch['id']}": joined}})
        rep = requests.get(f"{API}/reports/batch/{self.batch['id']}/term", headers=self.teacher["h"], timeout=30).json()
        rows = {r["student_id"]: r for r in rep["student_summaries"]}
        assert rows[excused["id"]]["tests_excused"] >= 1
        assert rows[absent["id"]]["tests_attended"] >= 1  # the make-up counts as attended

    def test_all_students_report_has_roster(self):
        tid = self._make(batch_id="all")
        rep = requests.get(f"{API}/reports/test/{tid}", headers=self.teacher["h"], timeout=15).json()
        assert rep.get("enrolled_count") == 3
