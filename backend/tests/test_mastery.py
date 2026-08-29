"""Tests for Step 4 — mastery engine + diagnostic test."""
import io
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


CSV_HEADER = ("ID,Class,Subject,Chapter,Topic,Question,Option A,Option B,Option C,Option D,"
              "Correct Option,Explanation,Difficulty")


class TestMastery:
    state = {}

    @pytest.fixture(scope="class", autouse=True)
    def setup(self):
        self.state["th"] = _login("teacher@vidya.com", "teacher123")
        self.state["sh"] = _login("student@vidya.com", "student123")
        tag = uuid.uuid4().hex[:10]
        self.state["tag"] = tag
        diffs = ["easy", "medium", "medium", "hard"]
        rows = [f'{i},Class 9,Maths,"Chapter {tag}","Topic {tag}","Q{i} {tag}?","A","B","C","D",Option B,"expl","{diffs[i]}"'
                for i in range(4)]
        csv_text = CSV_HEADER + "\n" + "\n".join(rows) + "\n"
        r = requests.post(f"{API}/questions/import", headers=self.state["th"],
                          files={"file": ("q.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")},
                          data={"status": "active"}, timeout=30)
        assert r.status_code == 200 and r.json()["imported"] == 4, r.text
        yield
        r = requests.get(f"{API}/questions?chapter=Chapter {tag}", headers=self.state["th"], timeout=15)
        for q in r.json():
            requests.delete(f"{API}/questions/{q['id']}", headers=self.state["th"], timeout=15)

    def _wait_ready(self, tid, timeout=15):
        deadline = time.time() + timeout
        while time.time() < deadline:
            t = requests.get(f"{API}/tests/{tid}", headers=self.state["th"], timeout=15).json()
            if t.get("status") == "ready":
                return t
            if t.get("status") == "failed":
                raise AssertionError(f"build failed: {t.get('error')}")
            time.sleep(0.25)
        raise AssertionError("never ready")

    def test_01_diagnostic_is_created(self):
        r = requests.post(f"{API}/tests/diagnostic", headers=self.state["sh"],
                          json={"class_level": "9"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "ready" and d["question_count"] >= 1 and "id" in d
        self.state["diag_id"] = d["id"]

    def test_02_dpp_feeds_mastery(self):
        tag = self.state["tag"]
        r = requests.post(f"{API}/tests", headers=self.state["th"], json={
            "title": f"Mastery DPP {tag}", "kind": "dpp", "class_level": "9",
            "subject": "Maths", "chapter": f"Chapter {tag}", "topic": "",
            "question_count": 4, "duration_minutes": 5, "valid_hours": 24}, timeout=30)
        assert r.status_code == 200, r.text
        t = self._wait_ready(r.json()["id"])
        assert t["question_count"] == 4
        self.state["dpp_id"] = r.json()["id"]

    def test_03_mastery_scores_and_bands(self):
        tag = self.state["tag"]
        canon = requests.get(f"{API}/tests/{self.state['dpp_id']}", headers=self.state["th"], timeout=15).json()
        view = requests.get(f"{API}/tests/{self.state['dpp_id']}", headers=self.state["sh"], timeout=15).json()
        answers = [view["questions"][i]["options"].index(q["options"][q["correct_index"]])
                   for i, q in enumerate(canon["questions"])]
        r = requests.post(f"{API}/tests/{self.state['dpp_id']}/submit", headers=self.state["sh"],
                          json={"answers": answers}, timeout=30)
        assert r.status_code == 200 and r.json()["score"] == 100, r.text

        m = requests.get(f"{API}/mastery/me", headers=self.state["sh"], timeout=15).json()
        topic = next((x for x in m if x["topic"] == f"Topic {tag}"), None)
        assert topic is not None, m
        assert topic["score"] == 100 and topic["band"] == "strong" and topic["attempts"] == 4

    def test_04_rbac_student_cannot_see_teacher_report(self):
        assert requests.get(f"{API}/mastery/teacher", headers=self.state["sh"],
                            params={"batch_id": "x"}, timeout=15).status_code == 403
