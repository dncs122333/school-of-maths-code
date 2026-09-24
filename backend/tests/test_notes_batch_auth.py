"""Tests for batch-level authorization in Notes feature."""
import os
import uuid
import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("frontend/.env") if os.path.exists("frontend/.env") else {}
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/") or "http://localhost:8001"
API = f"{BASE_URL}/api"


def _register_user(name: str, role: str):
    email = f"test_{role}_{uuid.uuid4().hex[:8]}@vidya.com"
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
        "name": name,
        "headers": {"Authorization": f"Bearer {token}"},
    }


class TestNotesBatchAuthorization:
    teacher = None
    student_a = None
    student_b = None
    student_outsider = None
    batch_a = None
    batch_b = None
    note_a_id = None
    note_b_id = None
    note_general_id = None

    @classmethod
    def setup_class(cls):
        # 1. Create a teacher and students
        cls.teacher = _register_user("Prof. Test", "teacher")
        cls.student_a = _register_user("Student Alpha", "student")
        cls.student_b = _register_user("Student Beta", "student")
        cls.student_outsider = _register_user("Student Outsider", "student")

        # 2. Teacher creates Batch A and Batch B
        r_ba = requests.post(f"{API}/batches", json={"name": "Batch Alpha", "class_level": "9"}, headers=cls.teacher["headers"], timeout=15)
        assert r_ba.status_code == 200, r_ba.text
        cls.batch_a = r_ba.json()

        r_bb = requests.post(f"{API}/batches", json={"name": "Batch Beta", "class_level": "9"}, headers=cls.teacher["headers"], timeout=15)
        assert r_bb.status_code == 200, r_bb.text
        cls.batch_b = r_bb.json()

        # 3. Student A joins Batch A only
        r_ja = requests.post(f"{API}/batches/join", json={"code": cls.batch_a["code"]}, headers=cls.student_a["headers"], timeout=15)
        assert r_ja.status_code == 200, r_ja.text

        # 4. Student B joins Batch B only
        r_jb = requests.post(f"{API}/batches/join", json={"code": cls.batch_b["code"]}, headers=cls.student_b["headers"], timeout=15)
        assert r_jb.status_code == 200, r_jb.text

        # 5. Teacher creates Note A (Batch A), Note B (Batch B), and Note General (All batches)
        tag = uuid.uuid4().hex[:6]
        r_na = requests.post(f"{API}/notes", json={
            "title": f"Note Alpha {tag}",
            "class_level": "9",
            "subject": "Maths",
            "chapter": "Number Systems",
            "topic": "Irrational Numbers",
            "batch_id": cls.batch_a["id"],
            "raw_text": "Sample raw notes text for Batch Alpha students only.",
        }, headers=cls.teacher["headers"], timeout=15)
        assert r_na.status_code == 200, r_na.text
        cls.note_a_id = r_na.json()["id"]

        r_nb = requests.post(f"{API}/notes", json={
            "title": f"Note Beta {tag}",
            "class_level": "9",
            "subject": "Science",
            "chapter": "Matter in Our Surroundings",
            "topic": "Evaporation",
            "batch_id": cls.batch_b["id"],
            "raw_text": "Sample raw notes text for Batch Beta students only.",
        }, headers=cls.teacher["headers"], timeout=15)
        assert r_nb.status_code == 200, r_nb.text
        cls.note_b_id = r_nb.json()["id"]

        r_ng = requests.post(f"{API}/notes", json={
            "title": f"Note General {tag}",
            "class_level": "9",
            "subject": "Maths",
            "chapter": "Number Systems",
            "topic": "Real Numbers",
            "batch_id": "all",
            "raw_text": "Sample general notes accessible to all enrolled students.",
        }, headers=cls.teacher["headers"], timeout=15)
        assert r_ng.status_code == 200, r_ng.text
        cls.note_general_id = r_ng.json()["id"]

    def test_student_a_note_list_authorization(self):
        """Student A should only see Note A and Note General; Note B must be excluded."""
        r = requests.get(f"{API}/notes", headers=self.student_a["headers"], timeout=15)
        assert r.status_code == 200
        notes = r.json()
        note_ids = [n["id"] for n in notes]

        assert self.note_a_id in note_ids, "Student A must see Note A (scoped to Batch A)"
        assert self.note_general_id in note_ids, "Student A must see Note General (general batch)"
        assert self.note_b_id not in note_ids, "Student A must NOT see Note B (scoped to Batch B)"

    def test_student_b_note_list_authorization(self):
        """Student B should only see Note B and Note General; Note A must be excluded."""
        r = requests.get(f"{API}/notes", headers=self.student_b["headers"], timeout=15)
        assert r.status_code == 200
        notes = r.json()
        note_ids = [n["id"] for n in notes]

        assert self.note_b_id in note_ids, "Student B must see Note B (scoped to Batch B)"
        assert self.note_general_id in note_ids, "Student B must see Note General (general batch)"
        assert self.note_a_id not in note_ids, "Student B must NOT see Note A (scoped to Batch A)"

    def test_outsider_student_note_list_authorization(self):
        """Student without any batch enrollment should only see Note General."""
        r = requests.get(f"{API}/notes", headers=self.student_outsider["headers"], timeout=15)
        assert r.status_code == 200
        notes = r.json()
        note_ids = [n["id"] for n in notes]

        assert self.note_a_id not in note_ids, "Outsider must NOT see Note A"
        assert self.note_b_id not in note_ids, "Outsider must NOT see Note B"
        assert self.note_general_id in note_ids, "Outsider can see general notes"

    def test_student_a_forbidden_from_note_b_direct_read(self):
        """Student A directly accessing Note B by ID must receive 403 Forbidden."""
        r = requests.get(f"{API}/notes/{self.note_b_id}", headers=self.student_a["headers"], timeout=15)
        assert r.status_code == 403, f"Expected 403 for unauthorized batch note access, got {r.status_code}: {r.text}"
        assert "restricted to another batch" in r.text.lower() or "access denied" in r.text.lower()

    def test_student_b_forbidden_from_note_a_direct_read(self):
        """Student B directly accessing Note A by ID must receive 403 Forbidden."""
        r = requests.get(f"{API}/notes/{self.note_a_id}", headers=self.student_b["headers"], timeout=15)
        assert r.status_code == 403, f"Expected 403 for unauthorized batch note access, got {r.status_code}: {r.text}"
        assert "restricted to another batch" in r.text.lower() or "access denied" in r.text.lower()

    def test_authorized_direct_note_access(self):
        """Students can access notes belonging to their batch or general notes."""
        r_a = requests.get(f"{API}/notes/{self.note_a_id}", headers=self.student_a["headers"], timeout=15)
        assert r_a.status_code == 200
        assert r_a.json()["id"] == self.note_a_id
        assert r_a.json()["batch_id"] == self.batch_a["id"]

        r_b = requests.get(f"{API}/notes/{self.note_b_id}", headers=self.student_b["headers"], timeout=15)
        assert r_b.status_code == 200
        assert r_b.json()["id"] == self.note_b_id
        assert r_b.json()["batch_id"] == self.batch_b["id"]

        # Both can access general note
        r_ga = requests.get(f"{API}/notes/{self.note_general_id}", headers=self.student_a["headers"], timeout=15)
        assert r_ga.status_code == 200
        r_gb = requests.get(f"{API}/notes/{self.note_general_id}", headers=self.student_b["headers"], timeout=15)
        assert r_gb.status_code == 200

    def test_student_batch_id_filter_security(self):
        """Student requesting notes for a batch they are NOT enrolled in gets 403."""
        r = requests.get(f"{API}/notes?batch_id={self.batch_b['id']}", headers=self.student_a["headers"], timeout=15)
        assert r.status_code == 403, "Student A querying Batch B directly must be rejected with 403"

    def test_teacher_can_view_all_their_notes_and_delete(self):
        """Teacher can access their notes across batches and delete them."""
        r_a = requests.get(f"{API}/notes/{self.note_a_id}", headers=self.teacher["headers"], timeout=15)
        assert r_a.status_code == 200

        r_del = requests.delete(f"{API}/notes/{self.note_a_id}", headers=self.teacher["headers"], timeout=15)
        assert r_del.status_code == 200

        # Note should now be 404
        r_check = requests.get(f"{API}/notes/{self.note_a_id}", headers=self.teacher["headers"], timeout=15)
        assert r_check.status_code == 404

    def test_student_stats_batch_aware(self):
        """Student stats reflects only notes matching their enrolled batch(es) and general notes."""
        r = requests.get(f"{API}/stats", headers=self.student_b["headers"], timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["batches"] == 1
        assert "notes" in data
        assert data["notes"] >= 2  # Note Beta + Note General

