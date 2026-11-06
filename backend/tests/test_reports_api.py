"""Reports API: "All Students" class tests in the term report, practice retakes in completion,
disabled students in the roster, and the term report period filter."""
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import certifi
import requests
from bson import ObjectId
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


QUESTIONS = [{"id": f"q{i}", "question": f"Q{i}", "options": ["A", "B", "C", "D"], "correct_index": 0, "subject": "Maths",
              "chapter": "Polynomials", "topic": "Zeroes of a Polynomial"} for i in range(4)]


class TestReportsAPI:
    @classmethod
    def setup_class(cls):
        cls.teacher = _reg("teacher", "Rep Teacher")
        cls.students = [_reg("student", f"Rep Student {i}") for i in range(2)]
        cls.batch = requests.post(f"{API}/batches", json={"name": "Rep Batch", "class_level": "9"},
                                  headers=cls.teacher["h"], timeout=15).json()
        joined = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        for s in cls.students:
            requests.post(f"{API}/batches/join", json={"code": cls.batch["code"]}, headers=s["h"], timeout=15)
            _db.users.update_one({"_id": ObjectId(s["id"])}, {"$set": {f"batch_enrolled_at.{cls.batch['id']}": joined}})

    def _test(self, kind, batch_id, opens):
        tid = str(uuid.uuid4())
        _db.tests.insert_one({"id": tid, "title": f"{kind} report", "kind": kind, "class_level": "9", "subject": "Maths",
                              "chapter": "Polynomials", "topic": "", "batch_id": batch_id, "status": "ready", "is_active": True,
                              "duration_minutes": 20, "teacher_id": self.teacher["id"], "questions": QUESTIONS,
                              "makeups": [], "excused_student_ids": [], "valid_from": opens.isoformat(),
                              "valid_until": (opens + timedelta(minutes=50)).isoformat(), "created_at": opens.isoformat()})
        return tid

    def _submit(self, tid, kind, student, score, at):
        _db.submissions.insert_one({"id": str(uuid.uuid4()), "test_id": tid, "kind": kind, "student_id": student["id"],
                                    "student_name": "S", "answers": [0] * 4, "times": [5] * 4,
                                    "results": [{"subject": "Maths", "chapter": "Polynomials", "topic": "Zeroes of a Polynomial",
                                                 "is_correct": i < score // 25, "kind": kind} for i in range(4)],
                                    "score": score, "correct": score // 25, "total": 4, "status": "submitted",
                                    "created_at": at.isoformat()})

    def test_all_students_class_test_counts_in_term_report_and_period_filter(self):
        old = datetime.now(timezone.utc) - timedelta(days=40)
        recent = datetime.now(timezone.utc) - timedelta(hours=3)
        a, b = self.students
        t_old = self._test("test", self.batch["id"], old)
        self._submit(t_old, "test", a, 50, old + timedelta(minutes=10))
        t_all = self._test("test", "all", recent)
        self._submit(t_all, "test", a, 100, recent + timedelta(minutes=10))

        rep = requests.get(f"{API}/reports/batch/{self.batch['id']}/term", headers=self.teacher["h"], timeout=30).json()
        rows = {r["student_id"]: r for r in rep["student_summaries"]}
        assert rows[a["id"]]["tests_taken"] == 2 and rows[a["id"]]["tests_attended"] == 2
        assert rows[a["id"]]["avg_score"] == 75.0 and rows[a["id"]]["rank"] == 1
        # Missed class tests count as 0 for rank, though there's no average of tests actually taken
        assert rows[b["id"]]["avg_score"] is None and rows[b["id"]]["rank_score"] == 0 and rows[b["id"]]["rank"] == 2

        since = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
        rep = requests.get(f"{API}/reports/batch/{self.batch['id']}/term", params={"start": since},
                           headers=self.teacher["h"], timeout=30).json()
        row = next(r for r in rep["student_summaries"] if r["student_id"] == a["id"])
        assert row["tests_taken"] == 1 and row["tests_assigned"] == 1 and row["avg_score"] == 100.0
        assert rep["period_start"] == since

        bad = requests.get(f"{API}/reports/batch/{self.batch['id']}/term", params={"start": "April"},
                           headers=self.teacher["h"], timeout=30)
        assert bad.status_code == 400

    def test_practice_retakes_and_disabled_students_in_completion(self):
        a, b = self.students
        now = datetime.now(timezone.utc)
        dpp = self._test("dpp", self.batch["id"], now)
        for i, sc in enumerate((25, 50, 100)):
            self._submit(dpp, "dpp", a, sc, now + timedelta(minutes=i))
        rep = requests.get(f"{API}/reports/test/{dpp}", headers=self.teacher["h"], timeout=15).json()
        assert rep["submitted_count"] == 1 and rep["attempts_count"] == 3
        assert rep["completion_rate"] == 50.0
        assert rep["summary"]["avg_score"] == 25  # first attempt

        # A disabled student can't take tests, so they leave the denominator
        _db.users.update_one({"_id": ObjectId(b["id"])}, {"$set": {"disabled_batch_ids": [self.batch["id"]]}})
        try:
            rep = requests.get(f"{API}/reports/test/{dpp}", headers=self.teacher["h"], timeout=15).json()
            assert rep["enrolled_count"] == 1 and rep["completion_rate"] == 100.0
        finally:
            _db.users.update_one({"_id": ObjectId(b["id"])}, {"$set": {"disabled_batch_ids": []}})
