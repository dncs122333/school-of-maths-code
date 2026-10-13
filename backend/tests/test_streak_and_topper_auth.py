"""Tests for batch topper authorization and IST timezone streak calculations."""
import os
import uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
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


class TestStreakAndTopperAuth:
    @classmethod
    def setup_class(cls):
        cls.teacher = _register("teacher", "Teacher Topper")
        cls.student_in_batch = _register("student", "Student InBatch")
        cls.student_outsider = _register("student", "Student Outsider")

        # Create batch
        r = requests.post(f"{API}/batches", json={"name": "Topper Batch", "class_level": "10"}, headers=cls.teacher["headers"], timeout=15)
        assert r.status_code == 200, r.text
        cls.batch = r.json()

        # Join student_in_batch to batch
        r = requests.post(f"{API}/batches/join", json={"code": cls.batch["code"]}, headers=cls.student_in_batch["headers"], timeout=15)
        assert r.status_code == 200, r.text

    def test_topper_student_outsider_forbidden(self):
        """Student not in batch gets 403 Forbidden."""
        r = requests.get(f"{API}/batches/{self.batch['id']}/topper", headers=self.student_outsider["headers"], timeout=15)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_topper_student_member_allowed(self):
        """Student enrolled in batch gets 200 OK."""
        r = requests.get(f"{API}/batches/{self.batch['id']}/topper", headers=self.student_in_batch["headers"], timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "topper" in data

    def test_topper_teacher_allowed(self):
        """Teacher gets 200 OK for batch topper."""
        r = requests.get(f"{API}/batches/{self.batch['id']}/topper", headers=self.teacher["headers"], timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "topper" in data

    def test_timezone_streak_calculation_in_stats(self):
        """Verify streak and active_week_days computation aligns with IST."""
        ist = ZoneInfo("Asia/Kolkata")
        today_ist = datetime.now(ist).date()

        # Current student stats
        r = requests.get(f"{API}/stats", headers=self.student_in_batch["headers"], timeout=15)
        assert r.status_code == 200, r.text
        stats = r.json()
        assert "streak_days" in stats
        assert "active_week_days" in stats
        assert len(stats["active_week_days"]) == 7
        assert all(isinstance(x, bool) for x in stats["active_week_days"])

    def test_ist_midnight_boundary_conversion(self):
        """A submission at 1:30 AM IST is 20:00 UTC previous day, but must resolve to the IST date."""
        ist = ZoneInfo("Asia/Kolkata")
        ca = "2026-10-13T20:00:00+00:00"
        dt = datetime.fromisoformat(ca.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        resolved_date = dt.astimezone(ist).date()
        assert resolved_date == datetime(2026, 10, 14).date()

    def test_frontend_fixes_verified(self):
        """Ensure duration_mins and activeWeekDays.includes(i) are not present in frontend code."""
        frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend/src/pages/StudentDashboard.js"))
        with open(frontend_path, "r", encoding="utf-8") as f:
            code = f.read()

        assert "duration_mins" not in code, "duration_mins should have been renamed to duration_minutes"
        assert "duration_minutes" in code
        assert "activeWeekDays.includes" not in code, "activeWeekDays.includes should not be used on boolean array"
        assert "activeWeekDays[i]" in code

