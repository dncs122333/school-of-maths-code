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

    def test_block_keeps_code_and_rotation_is_explicit(self):
        """Blocking no longer rotates the join code (the blocked student is refused at join anyway);
        the teacher rotates it on purpose when a code leaks."""
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
        assert data["new_batch_code"] is None

        listed = lambda: next(b for b in requests.get(f"{API}/batches", headers=self.teacher["headers"], timeout=15).json()
                              if b["id"] == batch_id)
        assert listed()["code"] == old_code

        r_rot = requests.post(f"{API}/batches/{batch_id}/rotate-code", headers=self.teacher["headers"], timeout=15)
        assert r_rot.status_code == 200, r_rot.text
        new_code = r_rot.json()["code"]
        assert new_code != old_code
        assert listed()["code"] == new_code
        assert requests.post(f"{API}/batches/{batch_id}/rotate-code", headers=self.teacher2["headers"], timeout=15).status_code == 403
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


class TestPerBatchAccessEnforcement:
    """A student enrolled with two teachers keeps login access when one teacher disables/blocks them,
    so the per-batch restriction must be enforced on that batch's content."""

    @classmethod
    def setup_class(cls):
        cls.teacher_a = _register_user("Teacher A", "teacher")
        cls.teacher_b = _register_user("Teacher B", "teacher")
        cls.student = _register_user("Two Teacher Student", "student")
        cls.batch_a = requests.post(f"{API}/batches", json={"name": "Batch A", "class_level": "10"},
                                    headers=cls.teacher_a["headers"], timeout=15).json()
        cls.batch_b = requests.post(f"{API}/batches", json={"name": "Batch B", "class_level": "10"},
                                    headers=cls.teacher_b["headers"], timeout=15).json()
        for b in (cls.batch_a, cls.batch_b):
            r = requests.post(f"{API}/batches/join", json={"code": b["code"]}, headers=cls.student["headers"], timeout=15)
            assert r.status_code == 200, r.text
        cls.note_a = requests.post(f"{API}/notes", json={
            "title": "A only", "class_level": "10", "subject": "Maths", "chapter": "Algebra",
            "batch_id": cls.batch_a["id"], "raw_text": "Batch A content",
        }, headers=cls.teacher_a["headers"], timeout=15).json()
        cls.note_b = requests.post(f"{API}/notes", json={
            "title": "B only", "class_level": "10", "subject": "Maths", "chapter": "Algebra",
            "batch_id": cls.batch_b["id"], "raw_text": "Batch B content",
        }, headers=cls.teacher_b["headers"], timeout=15).json()

    def test_disabled_in_one_batch_loses_that_batch_only(self):
        r = requests.post(f"{API}/batches/{self.batch_a['id']}/students/{self.student['id']}/status",
                          json={"action": "disable"}, headers=self.teacher_a["headers"], timeout=15)
        assert r.status_code == 200, r.text

        assert requests.get(f"{API}/notes/{self.note_a['id']}", headers=self.student["headers"], timeout=15).status_code == 403
        assert requests.get(f"{API}/notes/{self.note_b['id']}", headers=self.student["headers"], timeout=15).status_code == 200
        listed = {n["id"] for n in requests.get(f"{API}/notes", headers=self.student["headers"], timeout=15).json()}
        assert self.note_a["id"] not in listed
        assert self.note_b["id"] in listed

        requests.post(f"{API}/batches/{self.batch_a['id']}/students/{self.student['id']}/status",
                      json={"action": "enable"}, headers=self.teacher_a["headers"], timeout=15)
        assert requests.get(f"{API}/notes/{self.note_a['id']}", headers=self.student["headers"], timeout=15).status_code == 200

    def test_deleting_batch_lifts_account_lockout(self):
        teacher = _register_user("Solo Teacher", "teacher")
        student = _register_user("Solo Student", "student")
        batch = requests.post(f"{API}/batches", json={"name": "Solo", "class_level": "10"},
                              headers=teacher["headers"], timeout=15).json()
        requests.post(f"{API}/batches/join", json={"code": batch["code"]}, headers=student["headers"], timeout=15)
        requests.post(f"{API}/batches/{batch['id']}/students/{student['id']}/status",
                      json={"action": "block"}, headers=teacher["headers"], timeout=15)
        login = lambda: requests.post(f"{API}/auth/login", json={"email": student["email"], "password": student["password"]}, timeout=15)
        assert login().status_code == 403

        assert requests.delete(f"{API}/batches/{batch['id']}", headers=teacher["headers"], timeout=15).status_code == 200
        assert login().status_code == 200
