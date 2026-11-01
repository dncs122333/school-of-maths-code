"""Practice tests (DPP) and class tests: access rules, option shuffling, server-side timing, deletes."""
import os
import time
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


def _reg(role, name):
    r = requests.post(f"{API}/auth/register", json={"name": name, "email": f"test_{role}_{uuid.uuid4().hex[:8]}@example.com",
                                                   "password": "password123", "role": role}, timeout=15)
    assert r.status_code == 200, r.text
    return {"id": r.json()["user"]["id"], "h": {"Authorization": f"Bearer {r.json()['token']}"}}


def _ready(tid, h):
    for _ in range(60):
        t = requests.get(f"{API}/tests/{tid}", headers=h, timeout=15).json()
        if t.get("status") in ("ready", "failed"):
            return t
        time.sleep(0.25)
    raise AssertionError("test never finished building")


class TestPracticeTests:
    @classmethod
    def setup_class(cls):
        cls.ta, cls.tb = _reg("teacher", "PT Teacher A"), _reg("teacher", "PT Teacher B")
        cls.stranger = _reg("student", "PT Stranger")      # enrolled nowhere
        cls.member = _reg("student", "PT Member")          # in teacher A's batch
        cls.batch_a = requests.post(f"{API}/batches", json={"name": "PT A", "class_level": "9"}, headers=cls.ta["h"], timeout=15).json()
        cls.batch_b = requests.post(f"{API}/batches", json={"name": "PT B", "class_level": "9"}, headers=cls.tb["h"], timeout=15).json()
        requests.post(f"{API}/batches/join", json={"code": cls.batch_a["code"]}, headers=cls.member["h"], timeout=15)
        cls.tag = uuid.uuid4().hex[:6]
        qs = [{"question": f"Q{i} {cls.tag}?", "options": ["A", "B", "C", "D"], "correct_index": 1} for i in range(6)]
        qs.append({"question": f"TF {cls.tag}?", "options": ["True", "False"], "correct_index": 0})
        r = requests.post(f"{API}/questions/import-json", json={"class_level": "9", "subject": "Maths", "chapter": f"Ch {cls.tag}",
                                                               "topic": f"T {cls.tag}", "questions": qs}, headers=cls.ta["h"], timeout=30)
        assert r.status_code == 200, r.text
        bank = requests.get(f"{API}/questions", params={"chapter": f"Ch {cls.tag}"}, headers=cls.ta["h"], timeout=15).json()
        cls.four = [q["id"] for q in bank if len(q["options"]) == 4]
        cls.tf = [q["id"] for q in bank if len(q["options"]) == 2]

    @classmethod
    def teardown_class(cls):
        for qid in cls.four + cls.tf:
            requests.delete(f"{API}/questions/{qid}", headers=cls.ta["h"], timeout=15)

    def _create(self, teacher, **body):
        payload = {"title": f"PT {uuid.uuid4().hex[:4]}", "kind": "dpp", "class_level": "9", "subject": "Maths",
                   "chapter": f"Ch {self.tag}", "valid_hours": 24, **body}
        return requests.post(f"{API}/tests", json=payload, headers=teacher["h"], timeout=15)

    def test_all_students_means_the_teachers_own_students(self):
        dpp = self._create(self.ta, batch_id="all", question_ids=self.four[:3]).json()
        _ready(dpp["id"], self.ta["h"])
        listed = lambda s: any(t["id"] == dpp["id"] for t in requests.get(f"{API}/tests", params={"kind": "dpp"}, headers=s["h"], timeout=15).json())
        assert not listed(self.stranger)
        assert requests.get(f"{API}/tests/{dpp['id']}", headers=self.stranger["h"], timeout=15).status_code == 403
        assert requests.post(f"{API}/tests/{dpp['id']}/submit", json={"answers": [0]}, headers=self.stranger["h"], timeout=15).status_code == 403
        assert listed(self.member)
        assert requests.get(f"{API}/tests/{dpp['id']}", headers=self.member["h"], timeout=15).status_code == 200

    def test_teacher_only_routes_are_owner_only(self):
        t = self._create(self.ta, kind="test", batch_id="all", question_ids=self.four[:3]).json()
        _ready(t["id"], self.ta["h"])
        assert requests.get(f"{API}/tests/{t['id']}/missed-students", headers=self.tb["h"], timeout=15).status_code == 403
        own = requests.get(f"{API}/tests/{t['id']}/missed-students", headers=self.ta["h"], timeout=15).json()
        assert own["total_enrolled"] == 1  # only teacher A's own student, not the whole platform
        assert requests.get(f"{API}/tests/{t['id']}", headers=self.tb["h"], timeout=15).status_code == 403  # answer key
        assert requests.get(f"{API}/tests/{t['id']}/leaderboard", headers=self.stranger["h"], timeout=15).status_code == 403
        assert requests.get(f"{API}/tests/{t['id']}/leaderboard", headers=self.member["h"], timeout=15).status_code == 200

    def test_cannot_target_another_teachers_batch(self):
        assert self._create(self.ta, batch_id=self.batch_b["id"], question_ids=self.four[:1]).status_code == 403

    def test_true_false_question_works_and_grades(self):
        t = self._create(self.ta, batch_id=self.batch_a["id"], question_ids=self.tf).json()
        _ready(t["id"], self.ta["h"])
        view = requests.get(f"{API}/tests/{t['id']}", headers=self.member["h"], timeout=15)
        assert view.status_code == 200, view.text
        assert sorted(view.json()["questions"][0]["options"]) == ["False", "True"]
        chosen = view.json()["questions"][0]["options"].index("True")
        r = requests.post(f"{API}/tests/{t['id']}/submit", json={"answers": [chosen]}, headers=self.member["h"], timeout=15)
        assert r.status_code == 200 and r.json()["correct"] == 1

    def test_timer_survives_refresh_and_late_submit_is_flagged(self):
        t = self._create(self.ta, kind="test", batch_id=self.batch_a["id"], question_ids=self.four[:2], duration_minutes=10).json()
        _ready(t["id"], self.ta["h"])
        first = requests.get(f"{API}/tests/{t['id']}", headers=self.member["h"], timeout=15).json()
        assert 0 < first["seconds_left"] <= 600
        again = requests.get(f"{API}/tests/{t['id']}", headers=self.member["h"], timeout=15).json()
        assert again["started_at"] == first["started_at"]  # refresh resumes the same attempt
        # Pretend the attempt started 20 minutes ago
        past = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
        _db.test_starts.update_one({"test_id": t["id"], "student_id": self.member["id"]}, {"$set": {"started_at": past}})
        r = requests.post(f"{API}/tests/{t['id']}/submit", json={"answers": [0, 0]}, headers=self.member["h"], timeout=15)
        assert r.status_code == 200 and r.json()["status"] == "late"

    def test_validation_soft_delete_and_review_latest(self):
        assert self._create(self.ta, title="  ", question_ids=self.four[:1]).status_code == 400
        assert self._create(self.ta, valid_hours=-5, question_ids=self.four[:1]).status_code == 400
        assert self._create(self.ta, class_level="abc", question_ids=self.four[:1]).status_code == 400

        t = self._create(self.ta, batch_id=self.batch_a["id"], question_ids=self.four[:1]).json()
        _ready(t["id"], self.ta["h"])
        for ans in ([0], [1]):  # two practice attempts: wrong, then right (correct_index 1 before shuffle)
            view = requests.get(f"{API}/tests/{t['id']}", headers=self.member["h"], timeout=15).json()
            pick = view["questions"][0]["options"].index("B") if ans == [1] else (view["questions"][0]["options"].index("A"))
            requests.post(f"{API}/tests/{t['id']}/submit", json={"answers": [pick]}, headers=self.member["h"], timeout=15)
        review = requests.get(f"{API}/tests/{t['id']}/submissions/{self.member['id']}", headers=self.ta["h"], timeout=15).json()
        assert review["summary"]["correct"] == 1  # latest attempt
        assert requests.get(f"{API}/tests/{t['id']}/submissions/{self.member['id']}", headers=self.tb["h"], timeout=15).status_code == 403

        assert requests.delete(f"{API}/tests/{t['id']}", headers=self.ta["h"], timeout=15).status_code == 200
        assert requests.get(f"{API}/tests/{t['id']}", headers=self.member["h"], timeout=15).status_code == 404
        assert _db.tests.find_one({"id": t["id"]})["is_deleted"] is True
