"""Comprehensive tests verifying the 4 fixes:
1. Missing ownership checks (GET /mastery/teacher, GET /batches/{id}/topper 403 & 404)
2. Fee endpoint validates student ObjectId and batch enrollment
3. Payments idempotency, amount validation, and unique index on batch_fees
4. Unique batch code index and join_batch rate limiting
"""
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
        "email": email,
        "headers": {"Authorization": f"Bearer {data['token']}"},
    }


def _login_admin():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@vidya.com", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestFixesOneByOne:
    @classmethod
    def setup_class(cls):
        cls.teacher_a = _register("teacher", "Teacher A")
        cls.teacher_b = _register("teacher", "Teacher B")
        cls.admin_headers = _login_admin()
        cls.student_in_a = _register("student", "Student In A")
        cls.student_outsider = _register("student", "Student Outsider")

        # Teacher A creates Batch A
        r = requests.post(
            f"{API}/batches",
            json={"name": "Batch A", "class_level": "10", "fee_amount": 12000, "monthly_fee": 1000},
            headers=cls.teacher_a["headers"],
            timeout=15
        )
        assert r.status_code == 200, r.text
        cls.batch_a = r.json()

        # Student In A joins Batch A
        r_join = requests.post(
            f"{API}/batches/join",
            json={"code": cls.batch_a["code"]},
            headers=cls.student_in_a["headers"],
            timeout=15
        )
        assert r_join.status_code == 200, r_join.text

    # ------------------ 1. Ownership & Nonexistent Checks ------------------
    def test_01_mastery_teacher_outsider_teacher_forbidden(self):
        """Teacher B cannot view mastery for Batch A owned by Teacher A."""
        r = requests.get(
            f"{API}/mastery/teacher",
            params={"batch_id": self.batch_a["id"]},
            headers=self.teacher_b["headers"],
            timeout=15
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
        assert "own this batch" in r.text

    def test_02_mastery_teacher_owner_allowed(self):
        """Teacher A (owner) can view mastery for Batch A."""
        r = requests.get(
            f"{API}/mastery/teacher",
            params={"batch_id": self.batch_a["id"]},
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        assert "students" in r.json()

    def test_03_mastery_teacher_nonexistent_batch_returns_404(self):
        """GET /mastery/teacher?batch_id=nonexistent returns 404."""
        r = requests.get(
            f"{API}/mastery/teacher",
            params={"batch_id": "nonexistent-batch-id-123"},
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"

    def test_04_topper_outsider_teacher_forbidden(self):
        """Teacher B cannot view topper for Batch A owned by Teacher A."""
        r = requests.get(
            f"{API}/batches/{self.batch_a['id']}/topper",
            headers=self.teacher_b["headers"],
            timeout=15
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
        assert "own this batch" in r.text

    def test_05_topper_nonexistent_batch_returns_404(self):
        """GET /batches/{id}/topper returns 404 for nonexistent batch for all roles."""
        # Teacher
        r1 = requests.get(f"{API}/batches/nonexistent-batch-id-999/topper", headers=self.teacher_a["headers"], timeout=15)
        assert r1.status_code == 404, f"Expected 404 for teacher, got {r1.status_code}: {r1.text}"

        # Admin
        r2 = requests.get(f"{API}/batches/nonexistent-batch-id-999/topper", headers=self.admin_headers, timeout=15)
        assert r2.status_code == 404, f"Expected 404 for admin, got {r2.status_code}: {r2.text}"

        # Student
        r3 = requests.get(f"{API}/batches/nonexistent-batch-id-999/topper", headers=self.student_in_a["headers"], timeout=15)
        assert r3.status_code == 404, f"Expected 404 for student, got {r3.status_code}: {r3.text}"

    # ------------------ 2. Fee Endpoint Student Validation ------------------
    def test_06_record_fee_invalid_student_id_returns_400(self):
        """Invalid ObjectId string returns 400 Bad Request, not 500."""
        r = requests.post(
            f"{API}/batches/{self.batch_a['id']}/students/not-a-valid-oid/fee",
            json={"amount": 1000},
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        assert "Invalid student id" in r.text

    def test_07_record_fee_not_enrolled_student_returns_400(self):
        """Student not enrolled in batch_id returns 400 Bad Request."""
        r = requests.post(
            f"{API}/batches/{self.batch_a['id']}/students/{self.student_outsider['id']}/fee",
            json={"amount": 1000},
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        assert "not enrolled in this batch" in r.text

    # ------------------ 3. Payment Validation & Idempotency ------------------
    def test_08_partial_payment_zero_or_negative_rejected(self):
        """is_partial with zero or negative amount returns 400."""
        r = requests.post(
            f"{API}/batches/{self.batch_a['id']}/students/{self.student_in_a['id']}/fee",
            json={"is_partial": True, "partial_amount": 0, "month": "April"},
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        assert "must be greater than zero" in r.text

        r_neg = requests.post(
            f"{API}/batches/{self.batch_a['id']}/students/{self.student_in_a['id']}/fee",
            json={"is_partial": True, "partial_amount": -500, "month": "April"},
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r_neg.status_code == 400, f"Expected 400, got {r_neg.status_code}: {r_neg.text}"

    def test_09_plain_amount_zero_or_negative_rejected(self):
        """Plain amount <= 0 returns 400."""
        r = requests.post(
            f"{API}/batches/{self.batch_a['id']}/students/{self.student_in_a['id']}/fee",
            json={"amount": 0},
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

        r_neg = requests.post(
            f"{API}/batches/{self.batch_a['id']}/students/{self.student_in_a['id']}/fee",
            json={"amount": -100},
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r_neg.status_code == 400, f"Expected 400, got {r_neg.status_code}: {r_neg.text}"

    def test_10_payment_idempotency_key_prevents_duplicate(self):
        """Sending the same idempotency key twice does not duplicate payment or charges."""
        idem_key = f"idem-{uuid.uuid4().hex}"
        payload = {"amount": 500, "month": "April", "idempotency_key": idem_key}

        # First request
        r1 = requests.post(
            f"{API}/batches/{self.batch_a['id']}/students/{self.student_in_a['id']}/fee",
            json=payload,
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        paid1 = d1["paid_fee"]
        payments_count1 = len(d1["payments"])

        # Second duplicate request (e.g. double click)
        r2 = requests.post(
            f"{API}/batches/{self.batch_a['id']}/students/{self.student_in_a['id']}/fee",
            json=payload,
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r2.status_code == 200, r2.text
        d2 = r2.json()

        assert d2["paid_fee"] == paid1, f"Expected paid_fee {paid1}, got {d2['paid_fee']}"
        assert len(d2["payments"]) == payments_count1, f"Payment was duplicated! Count went from {payments_count1} to {len(d2['payments'])}"

    # ------------------ 4. Batch Codes Uniqueness & Join Rate Limit ------------------
    def test_11_batch_code_is_unique(self):
        """Multiple batches created each have distinct unique codes."""
        codes = set()
        for i in range(5):
            r = requests.post(
                f"{API}/batches",
                json={"name": f"Unique Test Batch {i}", "class_level": "9"},
                headers=self.teacher_a["headers"],
                timeout=15
            )
            assert r.status_code == 200, r.text
            code = r.json()["code"]
            assert code not in codes, f"Duplicate code generated: {code}"
            codes.add(code)

    def test_12_join_batch_rate_limit(self):
        """Excessive join attempts within 60s trigger 429 Too Many Requests."""
        test_student = _register("student", "Rate Limit Student")
        # Send 10 attempts
        for _ in range(10):
            requests.post(
                f"{API}/batches/join",
                json={"code": "BADCOD"},
                headers=test_student["headers"],
                timeout=15
            )
        # 11th attempt must be rate limited with 429
        r = requests.post(
            f"{API}/batches/join",
            json={"code": "BADCOD"},
            headers=test_student["headers"],
            timeout=15
        )
        assert r.status_code == 429, f"Expected 429, got {r.status_code}: {r.text}"
        assert "Too many join attempts" in r.text
