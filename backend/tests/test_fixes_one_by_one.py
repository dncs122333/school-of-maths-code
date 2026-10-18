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

    # ------------------ 5. Fee Amounts Consistency ------------------
    def test_13_batch_yearly_fee_only_computes_monthly_fee(self):
        """Batch created with only fee_amount automatically calculates monthly_fee."""
        r = requests.post(
            f"{API}/batches",
            json={"name": "Yearly Only Batch", "class_level": "11", "fee_amount": 24000},
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["fee_amount"] == 24000
        assert data["monthly_fee"] == 2000.0

    def test_14_batch_monthly_fee_only_computes_fee_amount(self):
        """Batch created with only monthly_fee automatically calculates fee_amount."""
        r = requests.post(
            f"{API}/batches",
            json={"name": "Monthly Only Batch", "class_level": "11", "monthly_fee": 1500},
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["monthly_fee"] == 1500
        assert data["fee_amount"] == 18000.0

    def test_15_batch_custom_fee_schedule_updates_total_fee(self):
        """Custom fee schedule stores total_fee matching the schedule sum."""
        custom_sched = [
            {"month": "April", "amount": 3000},
            {"month": "May", "amount": 2000},
            {"month": "June", "amount": 2500}
        ]
        r = requests.post(
            f"{API}/batches",
            json={"name": "Custom Sched Batch", "class_level": "12", "fee_schedule": custom_sched},
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["fee_amount"] == 7500.0

    def test_16_batch_fee_update_syncs_student_total_fee(self):
        """Updating batch fee updates enrolled students without custom overrides."""
        teacher = _register("teacher", "Fee Sync Teacher")
        r_b = requests.post(
            f"{API}/batches",
            json={"name": "Sync Batch", "class_level": "10", "fee_amount": 12000, "monthly_fee": 1000},
            headers=teacher["headers"],
            timeout=15
        )
        batch = r_b.json()
        bid = batch["id"]

        s1 = _register("student", "Sync S1")
        requests.post(f"{API}/batches/join", json={"code": batch["code"]}, headers=s1["headers"], timeout=15)

        # Make a standard payment of 1000
        r_pay = requests.post(
            f"{API}/batches/{bid}/students/{s1['id']}/fee",
            json={"amount": 1000, "month": "April"},
            headers=teacher["headers"],
            timeout=15
        )
        assert r_pay.status_code == 200
        assert r_pay.json()["total_fee"] == 12000.0

        # Teacher updates batch fee from 12000 to 18000
        r_up = requests.put(
            f"{API}/batches/{bid}",
            json={"fee_amount": 18000},
            headers=teacher["headers"],
            timeout=15
        )
        assert r_up.status_code == 200

        # Enrolled student s1 should now have total_fee = 18000 in list_batch_students
        r_list = requests.get(f"{API}/batches/{bid}/students", headers=teacher["headers"], timeout=15)
        assert r_list.status_code == 200
        st_data = next(s for s in r_list.json()["students"] if s["id"] == s1["id"])
        assert st_data["total_fee"] == 18000.0
        assert st_data["paid_fee"] == 1000.0
        assert st_data["due_fee"] == 17000.0

    # ------------------ 6. Scoped Blocking ------------------
    def test_17_unknown_action_returns_400(self):
        """Passing an unknown action like 'foo' returns 400 Bad Request."""
        r = requests.post(
            f"{API}/batches/{self.batch_a['id']}/students/{self.student_in_a['id']}/status",
            json={"action": "foo"},
            headers=self.teacher_a["headers"],
            timeout=15
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        assert "Invalid action" in r.text

    def test_18_reblocking_already_blocked_student_does_not_regenerate_code(self):
        """Calling block on an already-blocked student does not regenerate batch code again."""
        teacher = _register("teacher", "Block Repeat Teacher")
        r_b = requests.post(f"{API}/batches", json={"name": "Block Batch", "class_level": "9"}, headers=teacher["headers"], timeout=15)
        batch = r_b.json()
        bid = batch["id"]
        initial_code = batch["code"]

        s = _register("student", "Block Student")
        requests.post(f"{API}/batches/join", json={"code": initial_code}, headers=s["headers"], timeout=15)

        # First block
        r_block1 = requests.post(f"{API}/batches/{bid}/students/{s['id']}/status", json={"action": "block"}, headers=teacher["headers"], timeout=15)
        assert r_block1.status_code == 200
        first_new_code = r_block1.json()["new_batch_code"]
        assert first_new_code != initial_code

        # Second block on already-blocked student
        r_block2 = requests.post(f"{API}/batches/{bid}/students/{s['id']}/status", json={"action": "block"}, headers=teacher["headers"], timeout=15)
        assert r_block2.status_code == 200
        second_code = r_block2.json()["new_batch_code"]
        assert second_code is None or second_code == first_new_code

    def test_19_blocking_scoped_to_teacher_batches(self):
        """Teacher A blocking a student enrolled in Teacher A's and Teacher B's batches does NOT block them from Teacher B."""
        t_a = _register("teacher", "Teacher Scope A")
        t_b = _register("teacher", "Teacher Scope B")

        # Teacher A batch
        r_ba = requests.post(f"{API}/batches", json={"name": "Batch A-Scope", "class_level": "10"}, headers=t_a["headers"], timeout=15)
        batch_a = r_ba.json()
        # Teacher B batch
        r_bb = requests.post(f"{API}/batches", json={"name": "Batch B-Scope", "class_level": "10"}, headers=t_b["headers"], timeout=15)
        batch_b = r_bb.json()
        t_b_code_before = batch_b["code"]

        # Student in both batches
        student = _register("student", "Multi Batch Student")
        requests.post(f"{API}/batches/join", json={"code": batch_a["code"]}, headers=student["headers"], timeout=15)
        requests.post(f"{API}/batches/join", json={"code": batch_b["code"]}, headers=student["headers"], timeout=15)

        # Teacher A blocks student from Batch A
        r_block = requests.post(f"{API}/batches/{batch_a['id']}/students/{student['id']}/status", json={"action": "block"}, headers=t_a["headers"], timeout=15)
        assert r_block.status_code == 200

        # Teacher B's batch code must NOT be changed
        r_check_b = requests.get(f"{API}/batches", headers=t_b["headers"], timeout=15)
        found_b = next(b for b in r_check_b.json() if b["id"] == batch_b["id"])
        assert found_b["code"] == t_b_code_before

        # Student should NOT be locked out of the platform globally (can still log in and view Batch B)
        r_login = requests.post(f"{API}/auth/login", json={"email": student["email"], "password": "password123"}, timeout=15)
        assert r_login.status_code == 200, f"Student was globally locked out: {r_login.text}"

        r_my_batches = requests.get(f"{API}/batches", headers={"Authorization": f"Bearer {r_login.json()['token']}"}, timeout=15)
        assert r_my_batches.status_code == 200
        my_bids = [b["id"] for b in r_my_batches.json()]
        assert batch_b["id"] in my_bids
        assert batch_a["id"] not in my_bids

    # ------------------ 7. Topper Ranking & Submissions Scoping ------------------
    def test_20_topper_ranks_volume_and_accuracy_above_single_test(self):
        """A student with multiple tests averaging 95% beats a student with only 1 test at 100%."""
        teacher = _register("teacher", "Topper Ranking Teacher")
        r_b = requests.post(f"{API}/batches", json={"name": "Topper Rank Batch", "class_level": "10"}, headers=teacher["headers"], timeout=15)
        batch = r_b.json()
        bid = batch["id"]

        s_high_vol = _register("student", "High Volume Student")
        s_one_hit = _register("student", "One Hit Student")
        requests.post(f"{API}/batches/join", json={"code": batch["code"]}, headers=s_high_vol["headers"], timeout=15)
        requests.post(f"{API}/batches/join", json={"code": batch["code"]}, headers=s_one_hit["headers"], timeout=15)

        # Create 5 tests in this batch
        test_ids = []
        for i in range(5):
            r_t = requests.post(f"{API}/tests", json={
                "title": f"Batch Test {i}",
                "class_level": "10",
                "kind": "test",
                "batch_id": bid,
                "subject": "Maths",
                "chapter": "Arithmetic",
                "questions": [
                    {"question": "2+2?", "options": ["4", "3", "2", "1"], "correct_index": 0},
                    {"question": "3+3?", "options": ["6", "5", "4", "3"], "correct_index": 0}
                ]
            }, headers=teacher["headers"], timeout=15)
            assert r_t.status_code == 200, r_t.text
            test_ids.append(r_t.json()["id"])

        # High volume student submits all 5 tests: 100% on 4 tests, 50% on 1 test (avg 90%, total 450)
        for i, tid in enumerate(test_ids):
            answers = [0, 0] if i < 4 else [0, 1]
            requests.post(f"{API}/tests/{tid}/submit", json={"answers": answers}, headers=s_high_vol["headers"], timeout=15)

        # One hit student submits only 1 test: 100% (avg 100%, total 100)
        requests.post(f"{API}/tests/{test_ids[0]}/submit", json={"answers": [0, 0]}, headers=s_one_hit["headers"], timeout=15)

        # Check topper
        r_top = requests.get(f"{API}/batches/{bid}/topper", headers=teacher["headers"], timeout=15)
        assert r_top.status_code == 200, r_top.text
        topper = r_top.json()["topper"]
        assert topper is not None
        assert topper["student_id"] == s_high_vol["id"], f"Expected high volume student to be topper, got: {topper}"

    # ------------------ 8. Student Sensitive Data Hidden ------------------
    def test_21_student_cannot_see_sensitive_batch_data(self):
        """GET /batches and POST /batches/join do not leak code, teacher_id, fee_amount, monthly_fee, fee_schedule."""
        teacher = _register("teacher", "Privacy Teacher")
        r_b = requests.post(f"{API}/batches", json={
            "name": "Secret Batch",
            "class_level": "10",
            "fee_amount": 50000,
            "monthly_fee": 4166.67
        }, headers=teacher["headers"], timeout=15)
        batch = r_b.json()

        student = _register("student", "Privacy Student")

        # POST /batches/join
        r_join = requests.post(f"{API}/batches/join", json={"code": batch["code"]}, headers=student["headers"], timeout=15)
        assert r_join.status_code == 200
        join_data = r_join.json()

        for forbidden in ["code", "teacher_id", "fee_amount", "monthly_fee", "fee_schedule"]:
            assert forbidden not in join_data, f"Leaked '{forbidden}' in POST /batches/join response"

        # GET /batches
        r_get = requests.get(f"{API}/batches", headers=student["headers"], timeout=15)
        assert r_get.status_code == 200
        batches_list = r_get.json()
        assert len(batches_list) > 0
        b_data = next(b for b in batches_list if b["id"] == batch["id"])

        for forbidden in ["code", "teacher_id", "fee_amount", "monthly_fee", "fee_schedule"]:
            assert forbidden not in b_data, f"Leaked '{forbidden}' in GET /batches response"

