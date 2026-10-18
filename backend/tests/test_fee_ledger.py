"""Regression tests for fee ledger single source of truth and bug fixes (F1, F2, F3, F4)."""
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


class TestFeeLedger:
    teacher = None
    batch = None

    @classmethod
    def setup_class(cls):
        cls.teacher = _register_user("Ledger Teacher", "teacher")
        # Create a batch with 60,000 annual fee, 5,000 monthly fee
        r = requests.post(
            f"{API}/batches",
            json={
                "name": "Fee Ledger Test Batch",
                "class_level": "10",
                "fee_amount": 60000,
                "monthly_fee": 5000
            },
            headers=cls.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200, r.text
        cls.batch = r.json()

    def _create_student_in_batch(self, name: str):
        student = _register_user(name, "student")
        r_join = requests.post(
            f"{API}/batches/join",
            json={"code": self.batch["code"]},
            headers=student["headers"],
            timeout=15
        )
        assert r_join.status_code == 200, r_join.text
        return student

    def test_f3_unmarking_one_month_of_multimonth_payment(self):
        """Bug 1 (F3): Record amount=10000, month='April, May'.
        Unmarking 'April' must deduct only April's scheduled amount (5000),
        rewrite payment to 'May' with amount=5000, keep paid_fee == sum(payments) == 5000,
        with May paid and April due.
        """
        student = self._create_student_in_batch("F3 Student")
        batch_id = self.batch["id"]
        sid = student["id"]

        # 1. Record payment of 10000 for April and May
        r1 = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"amount": 10000, "month": "April, May"},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["paid_fee"] == 10000
        assert sum(p["amount"] for p in d1["payments"]) == 10000
        assert "April" in d1["paid_months"]
        assert "May" in d1["paid_months"]

        # 2. Unmark April
        r2 = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"unmark_month": "April"},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r2.status_code == 200, r2.text
        d2 = r2.json()

        # Invariant: paid_fee == sum(payments)
        assert d2["paid_fee"] == 5000
        assert sum(p["amount"] for p in d2["payments"]) == 5000
        assert d2["paid_fee"] == sum(p["amount"] for p in d2["payments"])

        # Check status & derived months
        assert "May" in d2["paid_months"]
        assert "April" not in d2["paid_months"]
        assert len(d2["payments"]) == 1
        assert d2["payments"][0]["month"] == "May"
        assert d2["payments"][0]["amount"] == 5000

        # Read path check via list_batch_students
        r_list = requests.get(
            f"{API}/batches/{batch_id}/students",
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r_list.status_code == 200
        s_data = next(s for s in r_list.json()["students"] if s["id"] == sid)
        assert s_data["paid_fee"] == 5000
        assert s_data["due_fee"] == 55000
        assert "May" in s_data["paid_months"]
        assert "April" not in s_data["paid_months"]

        april_status = next(m for m in s_data["monthly_status"] if m["month"] == "April")
        may_status = next(m for m in s_data["monthly_status"] if m["month"] == "May")
        assert april_status["is_paid"] is False
        assert april_status["paid_amount"] == 0.0
        assert april_status["due_amount"] == 5000.0
        assert may_status["is_paid"] is True
        assert may_status["paid_amount"] == 5000.0
        assert may_status["due_amount"] == 0.0

    def test_f1_partial_payment_multimonth_sequential_allocation(self):
        """Bug 2 (F1): Partial payment across multiple months (6,000 across April, May)
        must allocate sequentially (5,000 to April -> paid; 1,000 to May -> partial 1,000/4,000).
        Must not double-credit May as paid.
        """
        student = self._create_student_in_batch("F1 Student")
        batch_id = self.batch["id"]
        sid = student["id"]

        r = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={
                "is_partial": True,
                "months_paid": ["April", "May"],
                "partial_amount": 6000
            },
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200, r.text
        d = r.json()

        # Invariant
        assert d["paid_fee"] == 6000
        assert sum(p["amount"] for p in d["payments"]) == 6000
        assert d["paid_fee"] == sum(p["amount"] for p in d["payments"])

        # April should be paid, May should NOT be marked full paid
        assert "April" in d["paid_months"]
        assert "May" not in d["paid_months"]
        assert d["paid_months"] == ["April"]

        # Read path verification
        r_list = requests.get(
            f"{API}/batches/{batch_id}/students",
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r_list.status_code == 200
        s_data = next(s for s in r_list.json()["students"] if s["id"] == sid)
        assert s_data["paid_fee"] == 6000
        assert s_data["due_fee"] == 54000
        assert s_data["status"] == "partial"

        april_m = next(m for m in s_data["monthly_status"] if m["month"] == "April")
        may_m = next(m for m in s_data["monthly_status"] if m["month"] == "May")
        assert april_m["is_paid"] is True
        assert april_m["paid_amount"] == 5000.0
        assert april_m["due_amount"] == 0.0

        assert may_m["is_paid"] is False
        assert may_m["is_partial"] is True
        assert may_m["paid_amount"] == 1000.0
        assert may_m["due_amount"] == 4000.0

    def test_f4_unmark_after_mark_all_paid(self):
        """Bug 3 (F4): mark_as_paid=True stores one payment with month='All Months'.
        Unmarking 'October' must rewrite that payment to remaining months with amount=55000,
        ensuring paid_fee == sum(payments) == 55000, October due, and 11 months paid.
        """
        student = self._create_student_in_batch("F4 Student")
        batch_id = self.batch["id"]
        sid = student["id"]

        # 1. Mark as paid
        r1 = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"mark_as_paid": True},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["paid_fee"] == 60000
        assert d1["due_fee"] == 0
        assert d1["status"] == "paid"
        assert len(d1["paid_months"]) == 12

        # 2. Unmark October
        r2 = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"unmark_month": "October"},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r2.status_code == 200, r2.text
        d2 = r2.json()

        # Invariant: paid_fee == sum(payments)
        assert d2["paid_fee"] == 55000
        assert d2["due_fee"] == 5000
        assert sum(p["amount"] for p in d2["payments"]) == 55000
        assert d2["paid_fee"] == sum(p["amount"] for p in d2["payments"])

        # Derived months
        assert "October" not in d2["paid_months"]
        assert len(d2["paid_months"]) == 11

        # Read path check
        r_list = requests.get(
            f"{API}/batches/{batch_id}/students",
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r_list.status_code == 200
        s_data = next(s for s in r_list.json()["students"] if s["id"] == sid)
        assert s_data["paid_fee"] == 55000
        assert s_data["due_fee"] == 5000
        assert s_data["status"] == "partial"
        assert "October" not in s_data["paid_months"]

        oct_status = next(m for m in s_data["monthly_status"] if m["month"] == "October")
        assert oct_status["is_paid"] is False
        assert oct_status["due_amount"] == 5000.0

        # 3. Second unmark: unmark November
        r3 = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"unmark_month": "November"},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r3.status_code == 200, r3.text
        d3 = r3.json()
        assert d3["paid_fee"] == 50000
        assert d3["due_fee"] == 10000
        assert sum(p["amount"] for p in d3["payments"]) == 50000
        assert d3["paid_fee"] == sum(p["amount"] for p in d3["payments"])
        assert "November" not in d3["paid_months"]
        assert "October" not in d3["paid_months"]
        assert len(d3["paid_months"]) == 10

    def test_f2_direct_paid_fee_and_due_fee_edits(self):
        """Bug 4 (F2): Pay April 5000, then POST paid_fee=0 (or due_fee=60000).
        Must reconcile: status='due', paid_fee=0, payments=[], paid_months=[], no month green.
        """
        student = self._create_student_in_batch("F2 Student")
        batch_id = self.batch["id"]
        sid = student["id"]

        # Pay April 5000
        r1 = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"month": "April", "amount": 5000},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["paid_fee"] == 5000
        assert "April" in d1["paid_months"]

        # POST paid_fee=0
        r2 = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"paid_fee": 0},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r2.status_code == 200, r2.text
        d2 = r2.json()

        assert d2["paid_fee"] == 0
        assert d2["due_fee"] == 60000
        assert d2["status"] == "due"
        assert d2["paid_months"] == []
        assert sum(p["amount"] for p in d2["payments"]) == 0
        assert d2["paid_fee"] == sum(p["amount"] for p in d2["payments"])

        # Read path check via list_batch_students
        r_list = requests.get(
            f"{API}/batches/{batch_id}/students",
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r_list.status_code == 200
        s_data = next(s for s in r_list.json()["students"] if s["id"] == sid)
        assert s_data["paid_fee"] == 0
        assert s_data["due_fee"] == 60000
        assert s_data["status"] == "due"
        assert s_data["paid_months"] == []
        assert len(s_data["collected_months"]) == 0
        # No month is green
        for m in s_data["monthly_status"]:
            assert m["is_paid"] is False
            assert m["paid_amount"] == 0.0
            assert m["due_amount"] == 5000.0

        # Now test direct due_fee reset: Pay 5000, then set due_fee=60000
        requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"month": "April", "amount": 5000},
            headers=self.teacher["headers"],
            timeout=15
        )
        r3 = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"due_fee": 60000},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r3.status_code == 200, r3.text
        d3 = r3.json()
        assert d3["paid_fee"] == 0
        assert d3["due_fee"] == 60000
        assert d3["status"] == "due"
        assert d3["paid_months"] == []
        assert sum(p["amount"] for p in d3["payments"]) == 0

    def test_mixed_sequence_consistency(self):
        """Mixed sequence: partial -> full -> unmark -> mark-all-paid -> unmark two months.
        Every write and read must preserve paid_fee == sum(payments).
        """
        student = self._create_student_in_batch("Mixed Student")
        batch_id = self.batch["id"]
        sid = student["id"]

        # Step 1: Partial payment of 3000 to April
        r = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"is_partial": True, "month": "April", "partial_amount": 3000},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200
        d = r.json()
        assert d["paid_fee"] == 3000
        assert sum(p["amount"] for p in d["payments"]) == 3000
        assert d["paid_months"] == []

        # Step 2: Full payment for May (5000)
        r = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"month": "May", "amount": 5000},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200
        d = r.json()
        assert d["paid_fee"] == 8000
        assert sum(p["amount"] for p in d["payments"]) == 8000
        assert "May" in d["paid_months"]
        assert "April" not in d["paid_months"]

        # Step 3: Unmark May
        r = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"unmark_month": "May"},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200
        d = r.json()
        assert d["paid_fee"] == 3000
        assert sum(p["amount"] for p in d["payments"]) == 3000
        assert "May" not in d["paid_months"]

        # Step 4: Mark all paid
        r = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"mark_as_paid": True},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200
        d = r.json()
        assert d["paid_fee"] == 60000
        assert sum(p["amount"] for p in d["payments"]) == 60000
        assert len(d["paid_months"]) == 12

        # Step 5: Unmark October
        r = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"unmark_month": "October"},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200
        d = r.json()
        assert d["paid_fee"] == 55000
        assert sum(p["amount"] for p in d["payments"]) == 55000
        assert "October" not in d["paid_months"]
        assert len(d["paid_months"]) == 11

        # Step 6: Unmark November
        r = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"unmark_month": "November"},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200
        d = r.json()
        assert d["paid_fee"] == 50000
        assert sum(p["amount"] for p in d["payments"]) == 50000
        assert "October" not in d["paid_months"]
        assert "November" not in d["paid_months"]
        assert len(d["paid_months"]) == 10

        # Verify read path matches
        r_list = requests.get(
            f"{API}/batches/{batch_id}/students",
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r_list.status_code == 200
        s_data = next(s for s in r_list.json()["students"] if s["id"] == sid)
        assert s_data["paid_fee"] == 50000
        assert s_data["due_fee"] == 10000
        assert len(s_data["paid_months"]) == 10
        assert "October" not in s_data["paid_months"]
        assert "November" not in s_data["paid_months"]

    def test_derive_paid_months_helper_unit_tests(self):
        """Direct unit testing of _derive_fee_allocation and _derive_paid_months."""
        import sys
        sys.path.insert(0, os.path.abspath("backend"))
        from server import _derive_fee_allocation, _derive_paid_months

        schedule = [
            {"month": "April", "amount": 5000},
            {"month": "May", "amount": 5000},
            {"month": "June", "amount": 5000},
        ]

        # Empty payments
        res_empty = _derive_fee_allocation([], schedule)
        assert res_empty["paid_months"] == []
        assert len(res_empty["due_months"]) == 3

        # Exact payment for April
        res1 = _derive_fee_allocation([{"amount": 5000, "month": "April"}], schedule)
        assert res1["paid_months"] == ["April"]
        assert _derive_paid_months([{"amount": 5000, "month": "April"}], schedule) == ["April"]

        # Partial payment for April
        res_part = _derive_fee_allocation([{"amount": 3000, "month": "April"}], schedule)
        assert res_part["paid_months"] == []
        assert res_part["monthly_status"][0]["is_partial"] is True
        assert res_part["monthly_status"][0]["paid_amount"] == 3000
        assert res_part["monthly_status"][0]["due_amount"] == 2000

        # Partial payment with rollover (6000 across April, May)
        res_roll = _derive_fee_allocation([{"amount": 6000, "month": "April, May"}], schedule)
        assert res_roll["paid_months"] == ["April"]
        assert res_roll["monthly_status"][0]["is_paid"] is True
        assert res_roll["monthly_status"][1]["is_partial"] is True
        assert res_roll["monthly_status"][1]["paid_amount"] == 1000
        assert res_roll["monthly_status"][1]["due_amount"] == 4000

        # Overpayment beyond schedule
        res_over = _derive_fee_allocation([{"amount": 20000, "month": "All Months"}], schedule)
        assert res_over["paid_months"] == ["April", "May", "June"]

    @pytest.mark.anyio
    async def test_read_path_self_heals_stale_paid_months_in_db(self):
        """Verify list_batch_students ignores stale paid_months key in MongoDB and re-derives from payments."""
        import sys
        sys.path.insert(0, os.path.abspath("backend"))
        from server import db

        student = self._create_student_in_batch("Stale Doc Student")
        batch_id = self.batch["id"]
        sid = student["id"]

        # Directly store a document with stale paid_months ["December", "January"]
        # but payments only has 5000 for April
        await db.batch_fees.update_one(
            {"batch_id": batch_id, "student_id": sid},
            {"$set": {
                "batch_id": batch_id,
                "student_id": sid,
                "total_fee": 60000,
                "paid_fee": 5000,
                "due_fee": 55000,
                "status": "partial",
                "payments": [{"id": "p1", "amount": 5000, "month": "April", "date": "2026-04-01"}],
                "paid_months": ["December", "January"],  # Stale denormalized cache!
            }},
            upsert=True
        )

        r = requests.get(
            f"{API}/batches/{batch_id}/students",
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200
        s_data = next(s for s in r.json()["students"] if s["id"] == sid)

        # list_batch_students should ignore the stale cache and derive paid_months from payments
        assert s_data["paid_months"] == ["April"]
        dec_status = next(m for m in s_data["monthly_status"] if m["month"] == "December")
        assert dec_status["is_paid"] is False
        assert dec_status["due_amount"] == 5000.0

    def test_unmark_january_when_paid_till_march_keeps_march_paid(self):
        """When a student has paid till March (full year), and teacher unmarks January,
        January must become due, while March (and other paid months) must remain paid.
        """
        student = self._create_student_in_batch("Jan March Student")
        batch_id = self.batch["id"]
        sid = student["id"]

        # Step 1: Student is marked as paid in full (paid till March)
        r = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"mark_as_paid": True},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["paid_fee"] == 60000.0
        assert "January" in d["paid_months"]
        assert "March" in d["paid_months"]
        assert len(d["paid_months"]) == 12

        # Step 2: Teacher unmarks January
        r_unmark = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"unmark_month": "January"},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r_unmark.status_code == 200, r_unmark.text
        d_unmark = r_unmark.json()

        # Invariant checks
        assert d_unmark["paid_fee"] == 55000.0
        assert d_unmark["due_fee"] == 5000.0
        assert sum(p["amount"] for p in d_unmark["payments"]) == 55000.0

        # Crucial bugfix check: January is UNMARKED (due), March REMAINS PAID!
        assert "January" not in d_unmark["paid_months"], "January should be unmarked!"
        assert "March" in d_unmark["paid_months"], "March must remain paid!"
        assert "February" in d_unmark["paid_months"], "February must remain paid!"
        assert "December" in d_unmark["paid_months"], "December must remain paid!"
        assert len(d_unmark["paid_months"]) == 11

        # Step 3: Verify read path (GET /batches/{id}/students) reflects the same
        r_list = requests.get(
            f"{API}/batches/{batch_id}/students",
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r_list.status_code == 200
        s_data = next(s for s in r_list.json()["students"] if s["id"] == sid)

        assert "January" not in s_data["paid_months"]
        assert "March" in s_data["paid_months"]
        assert "February" in s_data["paid_months"]

        jan_status = next(m for m in s_data["monthly_status"] if m["month"] == "January")
        mar_status = next(m for m in s_data["monthly_status"] if m["month"] == "March")

        assert jan_status["is_paid"] is False
        assert jan_status["due_amount"] == 5000.0
        assert mar_status["is_paid"] is True
        assert mar_status["due_amount"] == 0.0

        # Step 4: Pay January again -> January becomes paid again, March remains paid
        r_repay = requests.post(
            f"{API}/batches/{batch_id}/students/{sid}/fee",
            json={"month": "January", "amount": 5000},
            headers=self.teacher["headers"],
            timeout=15
        )
        assert r_repay.status_code == 200
        d_repay = r_repay.json()
        assert d_repay["paid_fee"] == 60000.0
        assert "January" in d_repay["paid_months"]
        assert "March" in d_repay["paid_months"]
        assert len(d_repay["paid_months"]) == 12



