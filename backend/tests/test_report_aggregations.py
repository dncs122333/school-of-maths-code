"""Tests for the reporting engine: per-test analytics, item discrimination, weekly digest, and PDF export."""
import os
import uuid
import pytest
import requests
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import dotenv_values
from reports.aggregations import compute_test_analytics, compute_weekly_digest, compute_term_report
from reports.pdf import render_test_report_pdf

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_01_compute_test_analytics_metrics():
    test_doc = {
        "id": "test_1",
        "title": "Polynomials Mastery Test",
        "class_level": "9",
        "subject": "Maths",
        "chapter": "Polynomials",
        "duration_minutes": 15,
        "questions": [
            {"question": "Q1", "topic": "Linear Equations", "difficulty": "easy"},
            {"question": "Q2", "topic": "Quadratic Polynomials", "difficulty": "medium"}
        ]
    }
    subs = [
        {"student_id": "s1", "student_name": "Aarav", "score": 100, "times": [30, 45], "tab_switches": 0,
         "results": [{"is_correct": True, "topic": "Linear Equations"}, {"is_correct": True, "topic": "Quadratic Polynomials"}]},
        {"student_id": "s2", "student_name": "Bhavya", "score": 50, "times": [25, 60], "tab_switches": 0,
         "results": [{"is_correct": True, "topic": "Linear Equations"}, {"is_correct": False, "topic": "Quadratic Polynomials"}]},
        {"student_id": "s3", "student_name": "Chetan", "score": 0, "times": [15, 20], "tab_switches": 4,
         "results": [{"is_correct": False, "topic": "Linear Equations"}, {"is_correct": False, "topic": "Quadratic Polynomials"}]}
    ]

    res = compute_test_analytics(test_doc, subs, enrolled_count=4)
    assert res["enrolled_count"] == 4
    assert res["submitted_count"] == 3
    assert res["completion_rate"] == 75.0
    assert res["summary"]["avg_score"] == 50.0
    assert res["summary"]["median_score"] == 50.0
    assert res["summary"]["topper_score"] == 100
    assert res["summary"]["lowest_score"] == 0

    dist = res["score_distribution"]
    assert dist["0-39"] == 1
    assert dist["40-54"] == 1
    assert dist["55-74"] == 0
    assert dist["75-89"] == 0
    assert dist["90-100"] == 1


def test_02_item_discrimination_and_pace_outliers():
    # 6 students -> top 2 students vs bottom 2 students
    test_doc = {
        "id": "test_disc",
        "duration_minutes": 10,
        "questions": [
            {"question": "Discriminates Well", "topic": "Topic A"},
            {"question": "Everyone Misses", "topic": "Topic B"},
            {"question": "Slow Outlier Question", "topic": "Topic C"}
        ]
    }
    subs = [
        {"score": 100, "times": [10, 10, 200], "results": [{"is_correct": True}, {"is_correct": False}, {"is_correct": True}]},
        {"score": 90, "times": [12, 8, 190], "results": [{"is_correct": True}, {"is_correct": False}, {"is_correct": True}]},
        {"score": 60, "times": [15, 12, 180], "results": [{"is_correct": True}, {"is_correct": False}, {"is_correct": False}]},
        {"score": 50, "times": [14, 11, 210], "results": [{"is_correct": False}, {"is_correct": False}, {"is_correct": False}]},
        {"score": 20, "times": [10, 9, 175], "results": [{"is_correct": False}, {"is_correct": False}, {"is_correct": False}]},
        {"score": 10, "times": [8, 12, 185], "results": [{"is_correct": False}, {"is_correct": False}, {"is_correct": False}]}
    ]
    res = compute_test_analytics(test_doc, subs, enrolled_count=6)
    q1 = res["question_analysis"][0]
    # In Q1, top 2 are both correct (100%), bottom 2 are both wrong (0%) -> D = 1.0 (Excellent)
    assert q1["discrimination_index"] == 1.0
    assert q1["discrimination_rating"] == "Excellent"

    # Q3 has avg time ~190s which is an outlier relative to 10s benchmark
    q3 = res["question_analysis"][2]
    assert q3["is_pace_outlier"] is True


def test_03_topic_breakdown_and_anomalies():
    test_doc = {
        "id": "test_anom",
        "duration_minutes": 15,
        "questions": [{"question": "Q1", "topic": "Linear equations"}, {"question": "Q2", "topic": "Linear Equations"}]
    }
    subs = [
        {"student_id": "s1", "student_name": "Rapid Student", "score": 100, "times": [2, 3], "tab_switches": 0,
         "results": [{"is_correct": True, "topic": "Linear equations"}, {"is_correct": True, "topic": "Linear Equations"}]},
        {"student_id": "s2", "student_name": "Switch Student", "score": 50, "times": [40, 50], "tab_switches": 5,
         "results": [{"is_correct": True, "topic": "Linear equations"}, {"is_correct": False, "topic": "Linear Equations"}]}
    ]
    res = compute_test_analytics(test_doc, subs, enrolled_count=2)
    # Topics should merge into 1 topic "Linear Equations"
    assert len(res["topic_breakdown"]) == 1
    assert res["topic_breakdown"][0]["topic"] == "Linear Equations"
    assert res["topic_breakdown"][0]["total_attempts"] == 4
    assert res["topic_breakdown"][0]["accuracy"] == 75

    # Check anomalies
    anomalies = res["anomalies"]
    names = [a["student_name"] for a in anomalies]
    assert "Switch Student" in names
    assert "Rapid Student" in names


def test_04_pdf_generation_binary_header():
    test_doc = {
        "id": "pdf_test",
        "title": "Official Test",
        "class_level": "10",
        "subject": "Maths",
        "chapter": "Triangles",
        "duration_minutes": 20,
        "questions": [{"question": "Prove theorem", "topic": "BPT", "difficulty": "hard"}]
    }
    subs = [{"score": 80, "times": [120], "results": [{"is_correct": True, "topic": "BPT"}]}]
    analytics = compute_test_analytics(test_doc, subs, enrolled_count=1)
    pdf_bytes = render_test_report_pdf(analytics)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 500
    assert pdf_bytes.startswith(b"%PDF-")


class TestReportsAPI:
    state = {}

    @classmethod
    def setup_class(cls):
        cls.state["th"] = _login("teacher@vidya.com", "teacher123")
        cls.state["sh"] = _login("student@vidya.com", "student123")
        # Find an existing batch and test
        b_res = requests.get(f"{API}/batches", headers=cls.state["th"], timeout=15)
        assert b_res.status_code == 200
        batches = b_res.json()
        assert len(batches) > 0
        cls.state["batch"] = batches[0]
        cls.state["batch_id"] = batches[0]["id"]

        # Create a test assigned to this teacher's batch
        c_res = requests.post(f"{API}/tests", headers=cls.state["th"], json={
            "title": f"Reports Batch Test {uuid.uuid4().hex[:6]}", "kind": "test", "class_level": "9",
            "subject": "Maths", "chapter": "Real Numbers", "topic": "Euclid Division",
            "question_count": 2, "duration_minutes": 10, "valid_hours": 24, "batch_id": cls.state["batch_id"]
        }, timeout=30)
        assert c_res.status_code == 200, c_res.text
        cls.state["test_id"] = c_res.json()["id"]

    def test_05_get_test_report_api(self):
        tid = self.state["test_id"]
        r = requests.get(f"{API}/reports/test/{tid}", headers=self.state["th"], timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["test_id"] == tid
        assert "summary" in data
        assert "score_distribution" in data
        assert "question_analysis" in data
        assert "topic_breakdown" in data

    def test_06_download_test_report_pdf_api(self):
        tid = self.state["test_id"]
        r = requests.get(f"{API}/reports/test/{tid}/pdf", headers=self.state["th"], timeout=20)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type") == "application/pdf"
        assert r.content.startswith(b"%PDF-")

    def test_07_weekly_digest_and_term_report_api(self):
        bid = self.state["batch_id"]
        w_res = requests.get(f"{API}/reports/batch/{bid}/weekly", headers=self.state["th"], timeout=15)
        assert w_res.status_code == 200, w_res.text
        w_data = w_res.json()
        assert w_data["batch_id"] == bid
        assert "recent_avg" in w_data
        assert "topic_movement" in w_data

        t_res = requests.get(f"{API}/reports/batch/{bid}/term", headers=self.state["th"], timeout=15)
        assert t_res.status_code == 200, t_res.text
        t_data = t_res.json()
        assert t_data["batch_id"] == bid
        assert "syllabus_coverage_pct" in t_data
        assert "student_summaries" in t_data

    def test_08_rbac_student_forbidden(self):
        tid = self.state["test_id"]
        bid = self.state["batch_id"]
        assert requests.get(f"{API}/reports/test/{tid}", headers=self.state["sh"], timeout=15).status_code == 403
        assert requests.get(f"{API}/reports/test/{tid}/pdf", headers=self.state["sh"], timeout=15).status_code == 403
        assert requests.get(f"{API}/reports/batch/{bid}/weekly", headers=self.state["sh"], timeout=15).status_code == 403
        assert requests.get(f"{API}/reports/batch/{bid}/term", headers=self.state["sh"], timeout=15).status_code == 403
