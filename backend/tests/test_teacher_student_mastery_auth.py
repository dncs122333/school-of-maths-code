"""Tests for teacher student mastery drill-down authorization (privacy check)."""
import os
import uuid
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("frontend/.env") if os.path.exists("frontend/.env") else {}
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/") or "http://localhost:8001"
API = f"{BASE_URL}/api"


def _register(role: str, name: str = None):
    tag = uuid.uuid4().hex[:8]
    email = f"test_{role}_{tag}@vidya.com"
    r = requests.post(f"{API}/auth/register", json={
        "name": name or f"User {tag}",
        "email": email,
        "password": "password123",
        "role": role,
    }, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "id": data["user"]["id"],
        "name": name or f"User {tag}",
        "email": email,
        "role": role,
        "headers": {"Authorization": f"Bearer {data['token']}"},
    }


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "id": data["user"]["id"],
        "headers": {"Authorization": f"Bearer {data['token']}"},
    }


class TestTeacherStudentMasteryAuth:
    @classmethod
    def setup_class(cls):
        # Teacher 1 & Teacher 2
        cls.teacher_1 = _register("teacher", "Teacher Alpha")
        cls.teacher_2 = _register("teacher", "Teacher Beta")

        # Students
        cls.student_in_t1 = _register("student", "Student in T1 Batch")
        cls.student_in_t2 = _register("student", "Student in T2 Batch")
        cls.student_lonely = _register("student", "Student Without Batch")

        # Teacher 1 creates Batch 1
        r1 = requests.post(f"{API}/batches", json={"name": "T1 Batch", "class_level": "9"}, headers=cls.teacher_1["headers"], timeout=15)
        assert r1.status_code == 200, r1.text
        cls.batch_1 = r1.json()

        # Teacher 2 creates Batch 2
        r2 = requests.post(f"{API}/batches", json={"name": "T2 Batch", "class_level": "9"}, headers=cls.teacher_2["headers"], timeout=15)
        assert r2.status_code == 200, r2.text
        cls.batch_2 = r2.json()

        # Student 1 joins Batch 1 (Teacher 1's batch)
        r_j1 = requests.post(f"{API}/batches/join", json={"code": cls.batch_1["code"]}, headers=cls.student_in_t1["headers"], timeout=15)
        assert r_j1.status_code == 200, r_j1.text

        # Student 2 joins Batch 2 (Teacher 2's batch)
        r_j2 = requests.post(f"{API}/batches/join", json={"code": cls.batch_2["code"]}, headers=cls.student_in_t2["headers"], timeout=15)
        assert r_j2.status_code == 200, r_j2.text

    def test_teacher_can_view_own_student(self):
        """Teacher 1 can view mastery drill-down for student enrolled in their batch."""
        sid = self.student_in_t1["id"]
        res = requests.get(f"{API}/mastery/teacher/student/{sid}", headers=self.teacher_1["headers"], timeout=15)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["student"]["id"] == sid
        assert "topics" in data
        assert "trend" in data

    def test_other_teacher_cannot_view_unrelated_student(self):
        """Teacher 2 CANNOT view student who only belongs to Teacher 1's batch (403 Forbidden)."""
        sid = self.student_in_t1["id"]
        res = requests.get(f"{API}/mastery/teacher/student/{sid}", headers=self.teacher_2["headers"], timeout=15)
        assert res.status_code == 403, f"Expected 403 Forbidden, got {res.status_code}: {res.text}"
        assert "teach" in res.json().get("detail", "").lower()

    def test_teacher_cannot_view_unassigned_student(self):
        """Teacher 1 cannot view student who has not joined any of their batches (403 Forbidden)."""
        sid = self.student_lonely["id"]
        res = requests.get(f"{API}/mastery/teacher/student/{sid}", headers=self.teacher_1["headers"], timeout=15)
        assert res.status_code == 403, f"Expected 403 Forbidden, got {res.status_code}: {res.text}"

    def test_admin_can_view_any_student(self):
        """Admin role bypasses the batch check and can inspect any student's mastery."""
        admin = _login("admin@vidya.com", "admin123")
        sid = self.student_in_t1["id"]
        res = requests.get(f"{API}/mastery/teacher/student/{sid}", headers=admin["headers"], timeout=15)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        assert res.json()["student"]["id"] == sid

    def test_student_cannot_call_teacher_endpoint(self):
        """Students are rejected with 403 Forbidden by role check."""
        sid = self.student_in_t1["id"]
        res = requests.get(f"{API}/mastery/teacher/student/{sid}", headers=self.student_in_t1["headers"], timeout=15)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"

    def test_invalid_student_id_returns_404(self):
        """Non-existent or malformed student id returns 404 Not Found."""
        res = requests.get(f"{API}/mastery/teacher/student/invalid_id_123", headers=self.teacher_1["headers"], timeout=15)
        assert res.status_code == 404, f"Expected 404, got {res.status_code}: {res.text}"

    def test_leaderboard_and_submission_review(self):
        """Teacher 1 creates a test, student 1 submits, teacher views review with correct/incorrect answers."""
        # 1. Teacher 1 creates a DPP test for Batch 1
        r_create = requests.post(f"{API}/tests", json={
            "title": "Auth Review Test",
            "kind": "test",
            "class_level": "9",
            "subject": "Maths",
            "chapter": "Number Systems",
            "batch_id": self.batch_1["id"],
            "question_count": 2,
            "duration_minutes": 10,
            "valid_hours": 24,
            "activate_now": True
        }, headers=self.teacher_1["headers"], timeout=15)
        assert r_create.status_code == 200, r_create.text
        test_id = r_create.json()["id"]

        # Wait for ready if background worker is building
        import time
        for _ in range(20):
            t_data = requests.get(f"{API}/tests/{test_id}", headers=self.teacher_1["headers"], timeout=15).json()
            if t_data.get("status") == "ready":
                break
            time.sleep(0.2)

        # 2. Student 1 submits answers
        r_sub = requests.post(f"{API}/tests/{test_id}/submit", json={
            "answers": [0, 1],
            "times": [12.5, 15.0]
        }, headers=self.student_in_t1["headers"], timeout=15)
        assert r_sub.status_code == 200, r_sub.text

        # 3. Leaderboard check
        r_lead = requests.get(f"{API}/tests/{test_id}/leaderboard", headers=self.teacher_1["headers"], timeout=15)
        assert r_lead.status_code == 200, r_lead.text
        lead = r_lead.json()
        assert len(lead) >= 1
        match = next((x for x in lead if x.get("student_id") == self.student_in_t1["id"]), None)
        assert match is not None, "Leaderboard should include student_id"
        assert match["student_name"] == self.student_in_t1["name"]

        # 4. Teacher 1 retrieves review drilldown
        r_rev = requests.get(f"{API}/tests/{test_id}/submissions/{self.student_in_t1['id']}", headers=self.teacher_1["headers"], timeout=15)
        assert r_rev.status_code == 200, r_rev.text
        rev_data = r_rev.json()
        assert "questions" in rev_data
        assert len(rev_data["questions"]) >= 1
        q0 = rev_data["questions"][0]
        assert "chosen_index" in q0
        assert "correct_index" in q0
        assert "is_correct" in q0
        assert "explanation" in q0
        assert "topic_summary" in rev_data

        # 5. Teacher 2 (unrelated) gets 403 Forbidden
        r_forbid = requests.get(f"{API}/tests/{test_id}/submissions/{self.student_in_t1['id']}", headers=self.teacher_2["headers"], timeout=15)
        assert r_forbid.status_code == 403, f"Expected 403, got {r_forbid.status_code}"
