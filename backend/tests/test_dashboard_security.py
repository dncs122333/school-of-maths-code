"""Dashboard data access: teachers see only their own tests' submissions; no generic file route."""
import os
import uuid
from datetime import datetime, timezone
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


def _register(role, name):
    r = requests.post(f"{API}/auth/register", json={"name": name, "email": f"test_{role}_{uuid.uuid4().hex[:8]}@example.com",
                                                   "password": "password123", "role": role}, timeout=15)
    assert r.status_code == 200, r.text
    return {"id": r.json()["user"]["id"], "headers": {"Authorization": f"Bearer {r.json()['token']}"}}


def _test_with_submission(teacher_id, student_id, title, batch_id=None):
    """Minimal test + submission records (no question bank / AI needed)."""
    now = datetime.now(timezone.utc).isoformat()
    tid = str(uuid.uuid4())
    _db.tests.insert_one({"id": tid, "title": title, "kind": "test", "teacher_id": teacher_id, "batch_id": batch_id,
                          "student_id": None if teacher_id else student_id, "status": "ready", "questions": [],
                          "class_level": "10", "created_at": now})
    _db.submissions.insert_one({"id": str(uuid.uuid4()), "test_id": tid, "student_id": student_id, "title": title,
                                "kind": "test", "score": 80, "correct": 4, "total": 5, "answers": [1, 0, 2, 3, 1],
                                "questions": [], "created_at": now})
    return tid


class TestDashboardSecurity:
    @classmethod
    def setup_class(cls):
        cls.teacher_a = _register("teacher", "Sec Teacher A")
        cls.teacher_b = _register("teacher", "Sec Teacher B")
        cls.student = _register("student", "Sec Student")
        for t in (cls.teacher_a, cls.teacher_b):
            b = requests.post(f"{API}/batches", json={"name": "Sec Batch", "class_level": "10"}, headers=t["headers"], timeout=15).json()
            t["batch"] = b
            requests.post(f"{API}/batches/join", json={"code": b["code"]}, headers=cls.student["headers"], timeout=15)
        cls.test_a = _test_with_submission(cls.teacher_a["id"], cls.student["id"], "Teacher A test", cls.teacher_a["batch"]["id"])
        cls.test_b = _test_with_submission(cls.teacher_b["id"], cls.student["id"], "Teacher B test", cls.teacher_b["batch"]["id"])
        cls.diag = _test_with_submission(None, cls.student["id"], "Self diagnostic")

    def test_teacher_cannot_list_another_teachers_submissions(self):
        assert requests.get(f"{API}/tests/{self.test_b}/submissions", headers=self.teacher_a["headers"], timeout=15).status_code == 403
        own = requests.get(f"{API}/tests/{self.test_a}/submissions", headers=self.teacher_a["headers"], timeout=15)
        assert own.status_code == 200 and len(own.json()) == 1
        mine = requests.get(f"{API}/tests/{self.test_b}/submissions", headers=self.student["headers"], timeout=15)
        assert mine.status_code == 200 and len(mine.json()) == 1

    def test_student_analysis_hides_other_teachers_results(self):
        r = requests.get(f"{API}/mastery/teacher/student/{self.student['id']}", headers=self.teacher_a["headers"], timeout=15)
        assert r.status_code == 200, r.text
        titles = {t["title"] for t in r.json()["trend"]}
        assert titles == {"Teacher A test", "Self diagnostic"}

    def test_media_route_is_gone(self):
        r = requests.get(f"{API}/media/..%2Fserver.py", headers=self.student["headers"], timeout=15)
        assert r.status_code == 404


class TestDashboardData:
    @classmethod
    def setup_class(cls):
        cls.teacher = _register("teacher", "Dash Teacher")
        cls.student = _register("student", "Dash Student")
        cls.batch = requests.post(f"{API}/batches", json={"name": "Dash Batch", "class_level": "9"},
                                  headers=cls.teacher["headers"], timeout=15).json()
        requests.post(f"{API}/batches/join", json={"code": cls.batch["code"]}, headers=cls.student["headers"], timeout=15)

    def test_class_average_is_null_without_data_then_real(self):
        r = requests.get(f"{API}/mastery/teacher", params={"batch_id": self.batch["id"]}, headers=self.teacher["headers"], timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["class_avg_score"] is None  # no made-up placeholder

        _test_with_submission(self.teacher["id"], self.student["id"], "Dash test", self.batch["id"])
        _test_with_submission(None, self.student["id"], "Own diagnostic")  # self-started; not part of class average
        r = requests.get(f"{API}/mastery/teacher", params={"batch_id": self.batch["id"]}, headers=self.teacher["headers"], timeout=15)
        assert r.json()["class_avg_score"] == 80
        assert r.json()["class_avg_submissions"] == 1

    def test_recent_submissions_endpoint_and_stats(self):
        r = requests.get(f"{API}/submissions/me", params={"limit": 1}, headers=self.student["headers"], timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["items"]) == 1 and body["total"] >= 2
        assert requests.get(f"{API}/submissions/me", headers=self.teacher["headers"], timeout=15).status_code == 403

        stats = requests.get(f"{API}/stats", headers=self.student["headers"], timeout=15).json()
        assert stats["class_levels"] == ["9"]
        assert stats["active_batch_ids"] == [self.batch["id"]]
