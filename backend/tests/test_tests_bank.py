"""Tests for Step 3 — bank-driven async test creation + per-student option shuffle."""
import io
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


CSV_HEADER = ("ID,Class,Subject,Chapter,Topic,Question,Option A,Option B,Option C,Option D,"
              "Correct Option,Explanation,Difficulty")


class TestBankDrivenTests:
    state = {}

    @pytest.fixture(scope="class", autouse=True)
    def setup(self):
        self.state["th"] = _login("teacher@vidya.com", "teacher123")
        self.state["sh"] = _login("student@vidya.com", "student123")
        tag = uuid.uuid4().hex[:10]
        self.state["tag"] = tag
        rows = [f'{i},Class 9,Maths,"Chapter {tag}","Topic {tag}","Q{i} {tag}?","A","B","C","D",Option B,"expl","medium"'
                for i in range(6)]
        csv_text = CSV_HEADER + "\n" + "\n".join(rows) + "\n"
        files = {"file": ("q.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
        r = requests.post(f"{API}/questions/import", headers=self.state["th"],
                          files=files, data={"status": "active"}, timeout=30)
        assert r.status_code == 200 and r.json()["imported"] == 6, r.text
        yield
        # cleanup seeded questions
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
                raise AssertionError(f"test build failed: {t.get('error')}")
            time.sleep(0.25)
        raise AssertionError("test never became ready")

    def test_01_async_creation_returns_processing_then_ready(self):
        tag = self.state["tag"]
        r = requests.post(f"{API}/tests", headers=self.state["th"], json={
            "title": f"Bank test {tag}", "kind": "dpp", "class_level": "9",
            "subject": "Maths", "chapter": f"Chapter {tag}", "topic": "",
            "question_count": 5, "duration_minutes": 5, "valid_hours": 24}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "processing"
        t = self._wait_ready(r.json()["id"])
        assert t["question_count"] == 5
        assert t["questions"] and "correct_index" in t["questions"][0]
        self.state["dpp_id"] = r.json()["id"]

    def test_02_student_options_shuffled_stable_no_leak(self):
        sid = self.state["dpp_id"]
        a = requests.get(f"{API}/tests/{sid}", headers=self.state["sh"], timeout=15).json()
        b = requests.get(f"{API}/tests/{sid}", headers=self.state["sh"], timeout=15).json()
        assert "correct_index" not in a["questions"][0]
        assert "explanation" not in a["questions"][0]
        # deterministic: same student sees the same order across GETs
        assert a["questions"][0]["options"] == b["questions"][0]["options"]

    def test_03_grading_roundtrip_through_shuffle(self):
        sid = self.state["dpp_id"]
        canon = requests.get(f"{API}/tests/{sid}", headers=self.state["th"], timeout=15).json()
        view = requests.get(f"{API}/tests/{sid}", headers=self.state["sh"], timeout=15).json()
        # map each canonical correct answer text back to its displayed index, then submit
        answers = [view["questions"][i]["options"].index(q["options"][q["correct_index"]])
                   for i, q in enumerate(canon["questions"])]
        r = requests.post(f"{API}/tests/{sid}/submit", headers=self.state["sh"],
                          json={"answers": answers}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["score"] == 100
        # review exposes the same shuffled order + displayed correct index
        for i, item in enumerate(r.json()["review"]):
            assert item["options"] == view["questions"][i]["options"]
            assert item["correct_index"] == view["questions"][i]["options"].index(
                canon["questions"][i]["options"][canon["questions"][i]["correct_index"]])

    def test_04_toggle_active_blocks_student(self):
        sid = self.state["dpp_id"]
        # Teacher deactivates
        r = requests.patch(f"{API}/tests/{sid}", headers=self.state["th"], json={"is_active": False}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("is_active") is False

        # Student GET blocked
        r_get = requests.get(f"{API}/tests/{sid}", headers=self.state["sh"], timeout=15)
        assert r_get.status_code == 403

        # Student Submit blocked
        r_sub = requests.post(f"{API}/tests/{sid}/submit", headers=self.state["sh"], json={"answers": [0] * 5}, timeout=15)
        assert r_sub.status_code == 403

        # Teacher reactivates
        r = requests.patch(f"{API}/tests/{sid}", headers=self.state["th"], json={"is_active": True}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("is_active") is True

        # Student GET succeeds
        r_get = requests.get(f"{API}/tests/{sid}", headers=self.state["sh"], timeout=15)
        assert r_get.status_code == 200

    def test_05_duplicate_test(self):
        sid = self.state["dpp_id"]
        orig = requests.get(f"{API}/tests/{sid}", headers=self.state["th"], timeout=15).json()

        # Duplicate
        dup_title = f"Duplicated {self.state['tag']}"
        r = requests.post(f"{API}/tests/{sid}/duplicate", headers=self.state["th"],
                          json={"title": dup_title, "valid_hours": 48}, timeout=15)
        assert r.status_code == 200, r.text
        dup_data = r.json()
        assert dup_data["status"] == "ready"
        assert dup_data["title"] == dup_title
        new_id = dup_data["id"]

        # Verify duplicated test
        new_test = requests.get(f"{API}/tests/{new_id}", headers=self.state["th"], timeout=15).json()
        assert new_test["question_count"] == orig["question_count"]
        assert len(new_test["questions"]) == len(orig["questions"])
        assert new_test["is_active"] is True

        # Cleanup duplicated test
        requests.delete(f"{API}/tests/{new_id}", headers=self.state["th"], timeout=15)

    def test_06_master_template_creation_and_batch_assignment(self):
        tag = self.state["tag"]
        # 1. Create a Master Template using batch_id: "template"
        r = requests.post(f"{API}/tests", headers=self.state["th"], json={
            "title": f"Master Template {tag}", "kind": "test", "class_level": "9",
            "subject": "Maths", "chapter": f"Chapter {tag}", "topic": "",
            "batch_id": "template",
            "question_count": 3, "duration_minutes": 15, "valid_hours": 24}, timeout=30)
        assert r.status_code == 200, r.text
        template_id = r.json()["id"]

        tpl = self._wait_ready(template_id)
        assert tpl["is_draft"] is True
        assert tpl["is_active"] is False
        assert tpl["valid_until"] is None
        assert tpl["valid_from"] is None

        # 2. Assign to batch creates live copy
        dup_r = requests.post(f"{API}/tests/{template_id}/duplicate", headers=self.state["th"], json={
            "title": f"Live Batch Test {tag}",
            "batch_id": "all",
            "duration_minutes": 15,
            "valid_hours": 24
        }, timeout=15)
        assert dup_r.status_code == 200, dup_r.text
        live_data = dup_r.json()
        assert live_data["is_draft"] is False
        assert live_data["is_active"] is True
        assert live_data["valid_until"] is not None
        assert live_data["batch_name"] == "All Students"
        live_id = live_data["id"]

        # 3. Master template remains untouched as a template in library
        tpl_after = requests.get(f"{API}/tests/{template_id}", headers=self.state["th"], timeout=15).json()
        assert tpl_after["is_draft"] is True
        assert tpl_after["is_active"] is False
        assert tpl_after["valid_until"] is None

        # Cleanup
        requests.delete(f"{API}/tests/{template_id}", headers=self.state["th"], timeout=15)
        requests.delete(f"{API}/tests/{live_id}", headers=self.state["th"], timeout=15)

