"""Tests for teacher's ability to disable/enable and block/unblock a student in batch feature."""
import os
import uuid
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("frontend/.env") if os.path.exists("frontend/.env") else {}
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/") or "http://localhost:8001"
API = f"{BASE_URL}/api"


def _register_user(name: str, role: str):
    email = f"test_{role}_{uuid.uuid4().hex[:8]}@example.com"
    password = "password123"
    r = requests.post(f"{API}/auth/register", json={
        "name": name,
        "email": email,
        "password": password,
        "role": role,
    }, timeout=15)
    assert r.status_code == 200, f"Registration failed: {r.text}"
    token = r.json()["token"]
    return {
        "id": r.json()["user"]["id"],
        "email": email,
        "password": password,
        "name": name,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }


class TestStudentDisableBlock:
    teacher = None
    teacher2 = None
    student1 = None
    student2 = None
    batch = None

    @classmethod
    def setup_class(cls):
        cls.teacher = _register_user("Teacher Oak", "teacher")
        cls.teacher2 = _register_user("Teacher Elm", "teacher")
        cls.student1 = _register_user("Ash Ketchum", "student")
        cls.student2 = _register_user("Gary Oak", "student")

        # Teacher creates batch
        r = requests.post(
            f"{API}/batches",
            json={"name": "Pokemon Math Cohort", "class_level": "10", "fee_amount": 50000},
            headers=cls.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200, r.text
        cls.batch = r.json()

        # Student 1 joins the batch
        r_join = requests.post(
            f"{API}/batches/join",
            json={"code": cls.batch["code"]},
            headers=cls.student1["headers"],
            timeout=15
        )
        assert r_join.status_code == 200, r_join.text

    def test_student1_login_initially_succeeds(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": self.student1["email"],
            "password": self.student1["password"]
        }, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["is_disabled"] is False
        assert r.json()["user"]["is_blocked"] is False

    def test_teacher_can_disable_student(self):
        batch_id = self.batch["id"]
        student_id = self.student1["id"]

        r = requests.post(
            f"{API}/batches/{batch_id}/students/{student_id}/status",
            json={"action": "disable"},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_disabled"] is True
        assert data["is_blocked"] is False

        # Student list should reflect disabled status
        r_list = requests.get(
            f"{API}/batches/{batch_id}/students",
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r_list.status_code == 200
        students = r_list.json()["students"]
        s1 = next((s for s in students if s["id"] == student_id), None)
        assert s1 is not None
        assert s1["is_disabled"] is True
        assert s1["is_blocked"] is False

    def test_disabled_student_cannot_login(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": self.student1["email"],
            "password": self.student1["password"]
        }, timeout=15)
        assert r.status_code == 403
        assert "disabled" in r.json()["detail"].lower()

    def test_disabled_student_existing_token_rejected(self):
        # Trying to access protected route with previous token
        r = requests.get(
            f"{API}/auth/me",
            headers=self.student1["headers"],
            timeout=15
        )
        assert r.status_code == 403
        assert "disabled" in r.json()["detail"].lower()

    def test_teacher_can_enable_student(self):
        batch_id = self.batch["id"]
        student_id = self.student1["id"]

        r = requests.post(
            f"{API}/batches/{batch_id}/students/{student_id}/status",
            json={"action": "enable"},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200, r.text
        assert r.json()["is_disabled"] is False

        # Student can now login again
        r_login = requests.post(f"{API}/auth/login", json={
            "email": self.student1["email"],
            "password": self.student1["password"]
        }, timeout=15)
        assert r_login.status_code == 200
        # Refresh student1 token
        self.student1["token"] = r_login.json()["token"]
        self.student1["headers"] = {"Authorization": f"Bearer {self.student1['token']}"}

    def test_teacher_blocks_student_regenerates_batch_code(self):
        batch_id = self.batch["id"]
        student_id = self.student1["id"]
        old_code = self.batch["code"]

        r = requests.post(
            f"{API}/batches/{batch_id}/students/{student_id}/status",
            json={"action": "block"},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_blocked"] is True
        new_code = data["new_batch_code"]
        assert new_code is not None
        assert new_code != old_code

        # Verify batch code is updated in database
        r_batches = requests.get(f"{API}/batches", headers=self.teacher["headers"], timeout=15)
        assert r_batches.status_code == 200
        curr_batch = next((b for b in r_batches.json() if b["id"] == batch_id), None)
        assert curr_batch is not None
        assert curr_batch["code"] == new_code
        self.batch["code"] = new_code

    def test_blocked_student_cannot_login(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": self.student1["email"],
            "password": self.student1["password"]
        }, timeout=15)
        assert r.status_code == 403
        assert "blocked" in r.json()["detail"].lower()

    def test_old_batch_code_no_longer_works_for_joining(self):
        # Gary tries to join with old code
        r_fail = requests.post(
            f"{API}/batches/join",
            json={"code": "OLDCODE123"},
            headers=self.student2["headers"],
            timeout=15
        )
        assert r_fail.status_code == 404

    def test_new_regenerated_batch_code_works_for_joining(self):
        # Gary joins with the new regenerated code
        r_ok = requests.post(
            f"{API}/batches/join",
            json={"code": self.batch["code"]},
            headers=self.student2["headers"],
            timeout=15
        )
        assert r_ok.status_code == 200
        assert r_ok.json()["id"] == self.batch["id"]

    def test_teacher_can_unblock_student(self):
        batch_id = self.batch["id"]
        student_id = self.student1["id"]

        r = requests.post(
            f"{API}/batches/{batch_id}/students/{student_id}/status",
            json={"action": "unblock"},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200, r.text
        assert r.json()["is_blocked"] is False

        # Student 1 can log in again
        r_login = requests.post(f"{API}/auth/login", json={
            "email": self.student1["email"],
            "password": self.student1["password"]
        }, timeout=15)
        assert r_login.status_code == 200

    def test_unauthorized_user_cannot_update_status(self):
        batch_id = self.batch["id"]
        student_id = self.student1["id"]

        # Student cannot call status endpoint
        r_student = requests.post(
            f"{API}/batches/{batch_id}/students/{student_id}/status",
            json={"action": "disable"},
            headers=self.student2["headers"],
            timeout=15
        )
        assert r_student.status_code == 403

        # Non-owner teacher cannot call status endpoint
        r_other_teacher = requests.post(
            f"{API}/batches/{batch_id}/students/{student_id}/status",
            json={"action": "disable"},
            headers=self.teacher2["headers"],
            timeout=15
        )
        assert r_other_teacher.status_code == 403
