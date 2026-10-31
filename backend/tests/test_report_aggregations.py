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
    # Benchmark median pacing is ~10s.
    test_doc = {
        "id": "test_disc",
        "duration_minutes": 10,
        "questions": [
            {"question": "Discriminates Well", "topic": "Topic A"},
            {"question": "Everyone Misses", "topic": "Topic B"},
            {"question": "Slow Question", "topic": "Topic C"}
        ]
    }

    # Case 1: Slow question has LOW discrimination (D = 0.0) -> True pacing outlier
    subs_low_disc = [
        {"score": 100, "times": [10, 10, 200], "results": [{"is_correct": True}, {"is_correct": False}, {"is_correct": False}]},
        {"score": 90, "times": [12, 8, 190], "results": [{"is_correct": True}, {"is_correct": False}, {"is_correct": False}]},
        {"score": 60, "times": [15, 12, 180], "results": [{"is_correct": True}, {"is_correct": False}, {"is_correct": False}]},
        {"score": 50, "times": [14, 11, 210], "results": [{"is_correct": False}, {"is_correct": False}, {"is_correct": False}]},
        {"score": 20, "times": [10, 9, 175], "results": [{"is_correct": False}, {"is_correct": False}, {"is_correct": False}]},
        {"score": 10, "times": [8, 12, 185], "results": [{"is_correct": False}, {"is_correct": False}, {"is_correct": False}]}
    ]
    res1 = compute_test_analytics(test_doc, subs_low_disc, enrolled_count=6)
    q1 = res1["question_analysis"][0]
    assert q1["discrimination_index"] == 1.0
    assert q1["discrimination_rating"] == "Excellent"

    q3_low = res1["question_analysis"][2]
    assert q3_low["discrimination_index"] == 0.0
    # Slow (~190s) AND low discrimination (< 0.20) -> flagged as pace outlier
    assert q3_low["is_pace_outlier"] is True

    # Case 2: Slow question has HIGH discrimination (D = 1.0) -> Rigorous hard question, NOT an outlier
    subs_high_disc = [
        {"score": 100, "times": [10, 10, 200], "results": [{"is_correct": True}, {"is_correct": False}, {"is_correct": True}]},
        {"score": 90, "times": [12, 8, 190], "results": [{"is_correct": True}, {"is_correct": False}, {"is_correct": True}]},
        {"score": 60, "times": [15, 12, 180], "results": [{"is_correct": True}, {"is_correct": False}, {"is_correct": False}]},
        {"score": 50, "times": [14, 11, 210], "results": [{"is_correct": False}, {"is_correct": False}, {"is_correct": False}]},
        {"score": 20, "times": [10, 9, 175], "results": [{"is_correct": False}, {"is_correct": False}, {"is_correct": False}]},
        {"score": 10, "times": [8, 12, 185], "results": [{"is_correct": False}, {"is_correct": False}, {"is_correct": False}]}
    ]
    res2 = compute_test_analytics(test_doc, subs_high_disc, enrolled_count=6)
    q3_high = res2["question_analysis"][2]
    assert q3_high["discrimination_index"] == 1.0
    # Slow (~190s) BUT high discrimination (>= 0.20) -> valid hard question, NOT an outlier
    assert q3_high["is_pace_outlier"] is False



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
         "results": [{"is_correct": True, "topic": "Linear equations"}, {"is_correct": False, "topic": "Linear Equations"}]},
        {"student_id": "s3", "student_name": "Fast Strong Student", "score": 100, "times": [4, 4], "tab_switches": 0,
         "results": [{"is_correct": True, "topic": "Linear equations"}, {"is_correct": True, "topic": "Linear Equations"}]}
    ]
    res = compute_test_analytics(test_doc, subs, enrolled_count=3)
    # Topics should merge into 1 topic "Linear Equations"
    assert len(res["topic_breakdown"]) == 1
    assert res["topic_breakdown"][0]["topic"] == "Linear Equations"

    # Check anomalies:
    # - "Switch Student" flagged for 5 tab switches
    # - "Rapid Student" flagged for taking < 6.0s (5s total for 2 questions)
    # - "Fast Strong Student" (8s total for 2 questions, 100% score) is NOT flagged as rushing
    anomalies = res["anomalies"]
    names = [a["student_name"] for a in anomalies]
    assert "Switch Student" in names
    assert "Rapid Student" in names
    assert "Fast Strong Student" not in names



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

    def test_09_diagnostic_and_targeted_attempts_included_in_reports(self):
        """Weekly and term reports do not drop diagnostic / targeted-sprint attempts (batch_id: None),
        and completion rate uses true batch enrollment rather than falling back to 100%."""
        bid = self.state["batch_id"]

        # 1. Student creates a diagnostic test (batch_id: None)
        diag_res = requests.post(f"{API}/tests/diagnostic", headers=self.state["sh"], json={
            "class_level": "9", "subject": "Maths", "chapter": "Real Numbers", "topic": "Euclid Division"
        }, timeout=30)
        assert diag_res.status_code == 200, diag_res.text
        diag_id = diag_res.json()["id"]

        # 2. Student submits diagnostic
        diag_details = requests.get(f"{API}/tests/{diag_id}", headers=self.state["sh"], timeout=15).json()
        answers = [0] * len(diag_details.get("questions", []))
        times = [10] * len(answers)
        sub_res = requests.post(f"{API}/tests/{diag_id}/submit", headers=self.state["sh"], json={
            "answers": answers, "times": times
        }, timeout=30)
        assert sub_res.status_code == 200, sub_res.text

        # 3. Weekly digest must reflect the diagnostic submission
        w_res = requests.get(f"{API}/reports/batch/{bid}/weekly", headers=self.state["th"], timeout=15)
        assert w_res.status_code == 200
        w_data = w_res.json()
        assert w_data["submissions_count"] >= 1
        assert w_data["active_students"] >= 1
        assert w_data["enrolled_count"] >= 1

        # 4. Term report must count student in student_summaries
        t_res = requests.get(f"{API}/reports/batch/{bid}/term", headers=self.state["th"], timeout=15)
        assert t_res.status_code == 200
        t_data = t_res.json()
        assert t_data["total_submissions"] >= 1
        assert len(t_data["student_summaries"]) >= 1

        # 5. Targeted test completion rate does not blindly fall back to 100%
        # The test report for the diagnostic resolves the student's batch and uses true enrolled_count
        rep_res = requests.get(f"{API}/reports/test/{diag_id}", headers=self.state["th"], timeout=15)
        assert rep_res.status_code == 200
        rep_data = rep_res.json()
        assert rep_data["submitted_count"] == 1
        # If enrolled in a batch with multiple students, completion_rate < 100%
        assert rep_data["enrolled_count"] >= 1

    def test_10_term_coverage_subjects_union_and_filtering(self):
        """Term coverage unions all subjects in CURRICULUM[cl] by default,
        and accurately scopes to Science or Maths when subject is specified."""
        from reports.aggregations import compute_term_report
        from curriculum import CURRICULUM

        cl = "9"
        maths_topics_count = sum(len(topics) for topics in CURRICULUM[cl]["Maths"].values())
        science_topics_count = sum(len(topics) for topics in CURRICULUM[cl]["Science"].values())
        total_union_count = maths_topics_count + science_topics_count

        batch_base = {"id": "b1", "class_level": cl, "student_ids": ["s1"]}
        subs = [
            {"student_id": "s1", "results": [
                {"subject": "Science", "topic": "Matter in Our Surroundings", "is_correct": True},
                {"subject": "Maths", "topic": "Number Systems", "is_correct": True}
            ]}
        ]
        student_map = {"s1": "Aarav"}

        # 1. Default (no subject specified) -> denominator unions both Maths & Science
        rep_all = compute_term_report("b1", batch_base, subs, student_map)
        assert rep_all["total_curriculum_topics"] == total_union_count
        assert rep_all["subject"] == "All"

        # 2. Science batch / subject param -> denominator is Science only
        rep_sci = compute_term_report("b1", {**batch_base, "subject": "Science"}, subs, student_map)
        assert rep_sci["total_curriculum_topics"] == science_topics_count
        assert rep_sci["subject"] == "Science"

        # 3. Explicit subject query parameter overrides batch
        rep_math = compute_term_report("b1", {**batch_base, "subject": "Science"}, subs, student_map, subject="Maths")
        assert rep_math["total_curriculum_topics"] == maths_topics_count
        assert rep_math["subject"] == "Maths"

        # 4. API endpoint accepts subject param
        bid = self.state["batch_id"]
        api_sci = requests.get(f"{API}/reports/batch/{bid}/term", params={"subject": "Science"},
                               headers=self.state["th"], timeout=15)
        assert api_sci.status_code == 200
        assert api_sci.json()["subject"] == "Science"
        batch_cl = str(self.state["batch"].get("class_level") or "10")
        expected_batch_sci_count = sum(len(topics) for topics in CURRICULUM.get(batch_cl, {}).get("Science", {}).values())
        assert api_sci.json()["total_curriculum_topics"] == expected_batch_sci_count

    def test_11_term_student_summary_weighting_and_weak_topics(self):
        """Term student summary weights average score by question count (rather than plain avg of test scores),
        and feeds attempts through compute_topic_mastery without counting a 1-question topic as confirmed weak."""
        from reports.aggregations import compute_term_report

        batch_base = {"id": "b1", "class_level": "9", "student_ids": ["s1"]}
        student_map = {"s1": "Aarav"}

        # Sub 1: 50 questions, all correct (100%)
        sub_50_q = {
            "student_id": "s1",
            "score": 100,
            "results": [{"subject": "Maths", "topic": "Number Systems", "is_correct": True} for _ in range(50)]
        }
        # Sub 2: 2 questions DPP, 1 correct, 1 wrong (50%)
        # Topic 'Polynomials' has only 1 attempt here (wrong)
        sub_2_q = {
            "student_id": "s1",
            "score": 50,
            "results": [
                {"subject": "Maths", "topic": "Number Systems", "is_correct": True},
                {"subject": "Maths", "topic": "Polynomials", "is_correct": False}
            ]
        }

        # 1. Total questions = 52, total correct = 51. Weighted avg = 51/52 * 100 = 98.1% (not (100+50)/2 = 75.0%)
        rep = compute_term_report("b1", batch_base, [sub_50_q, sub_2_q], student_map, subject="Maths")
        st_summary = rep["student_summaries"][0]
        assert st_summary["avg_score"] == 98.1
        assert st_summary["tests_taken"] == 2
        # 'Polynomials' has only 1 attempt -> not counted as confirmed weak topic
        assert st_summary["weak_topics_count"] == 0

        # 2. A single test sitting with 2 questions on 'Polynomials' (both wrong) has sessions == 1,
        # so it does NOT mark it confirmed weak (false positive prevented)
        sub_single_sitting_two_poly = {
            "id": "sub_multi_q",
            "student_id": "s1",
            "score": 0,
            "results": [
                {"subject": "Maths", "topic": "Polynomials", "is_correct": False},
                {"subject": "Maths", "topic": "Polynomials", "is_correct": False}
            ]
        }
        rep_single_sitting = compute_term_report("b1", batch_base, [sub_single_sitting_two_poly], student_map, subject="Maths")
        assert rep_single_sitting["student_summaries"][0]["weak_topics_count"] == 0

        # 3. When student attempts 'Polynomials' in two separate test sittings and fails, it becomes confirmed weak (sessions >= 2)
        sub_poly_2 = {
            "id": "sub_poly_separate_sitting",
            "student_id": "s1",
            "score": 0,
            "results": [
                {"subject": "Maths", "topic": "Polynomials", "is_correct": False}
            ]
        }
        rep2 = compute_term_report("b1", batch_base, [sub_50_q, sub_2_q, sub_poly_2], student_map, subject="Maths")
        st_summary2 = rep2["student_summaries"][0]
        # Total questions = 53, correct = 51 -> 51/53 * 100 = 96.2%
        assert st_summary2["avg_score"] == 96.2
        assert st_summary2["weak_topics_count"] == 1

    def test_12_completion_rate_none_when_no_roster_and_paging_caps(self):
        """When no roster exists (batch is None/empty), completion_rate is None (N/A)
        instead of defaulting to a fake 100%. Paging cap hits return warning."""
        from reports.aggregations import compute_test_analytics
        import asyncio

        test_doc = {"id": "t_unassigned", "title": "Diagnostic Test", "questions": [{"question": "Q1"}]}
        subs = [{"student_id": "s1", "score": 80, "results": [{"is_correct": True}]}]

        # 1. No batch and no enrolled_count -> completion_rate is None
        res_no_roster = compute_test_analytics(test_doc, subs, batch=None, enrolled_count=None)
        assert res_no_roster["enrolled_count"] is None
        assert res_no_roster["completion_rate"] is None

        # 2. Batch with empty student_ids -> completion_rate is None
        res_empty_batch = compute_test_analytics(test_doc, subs, batch={"student_ids": []}, enrolled_count=None)
        assert res_empty_batch["enrolled_count"] is None
        assert res_empty_batch["completion_rate"] is None

        # 3. Known roster with 2 students -> completion_rate is 50.0%
        res_known_roster = compute_test_analytics(test_doc, subs, batch={"student_ids": ["s1", "s2"]}, enrolled_count=2)
        assert res_known_roster["enrolled_count"] == 2
        assert res_known_roster["completion_rate"] == 50.0

        # 4. Test fetch_cursor_paged paging and cap warning
        from reports.router import fetch_cursor_paged

        class MockCursor:
            def __init__(self, count):
                self.count = count
            def __aiter__(self):
                self.i = 0
                return self
            async def __anext__(self):
                if self.i < self.count:
                    self.i += 1
                    return {"id": self.i}
                raise StopAsyncIteration

        loop = asyncio.get_event_loop()
        # Cap not reached
        items, warn = loop.run_until_complete(fetch_cursor_paged(MockCursor(5), limit=10, context="subs"))
        assert len(items) == 5
        assert warn is None

        # Cap reached -> returns warning
        items_capped, warn_capped = loop.run_until_complete(fetch_cursor_paged(MockCursor(15), limit=10, context="subs"))
        assert len(items_capped) == 10
        assert warn_capped is not None
        assert "10" in warn_capped

    def test_13_pdf_generation_escapes_xml_special_characters(self):
        """ReportLab Paragraph parses XML markup; unescaped &, <, > in test titles or topic names
        would crash with XMLSyntaxError or corrupt the PDF. Validates that _escape properly handles them."""
        from reports.pdf import render_test_report_pdf

        malicious_report = {
            "title": "Maths & Science: Class 10 <Term 1> Test \"Trigonometry & More\"",
            "class_level": "10",
            "subject": "Maths & Science",
            "chapter": "Chapter 1: Real Numbers <Advanced>",
            "duration_minutes": 45,
            "completion_rate": 85.5,
            "submitted_count": 18,
            "enrolled_count": 21,
            "summary": {
                "avg_score": 72.4,
                "score_band": "developing",
                "median_score": 75.0,
                "topper_score": 100,
                "lowest_score": 30
            },
            "score_distribution": {"0-39": 2, "40-54": 3, "55-74": 5, "75-89": 5, "90-100": 3},
            "question_analysis": [
                {
                    "index": 1,
                    "topic": "Sets & Relations <Subset>",
                    "difficulty": "medium & hard",
                    "accuracy": 65.0,
                    "discrimination_index": 0.45,
                    "discrimination_rating": "Good (D >= 0.3)",
                    "avg_time_s": 42.1
                }
            ]
        }

        pdf_bytes = render_test_report_pdf(malicious_report)
        assert isinstance(pdf_bytes, bytes)
        assert len(pdf_bytes) > 1000
        assert pdf_bytes.startswith(b"%PDF-")

    def test_14_syllabus_coverage_keyed_by_subject_chapter_topic(self, monkeypatch):
        """Identical topic names across different chapters/subjects do not collide in all_curriculum_topics,
        and testing one chapter's topic does not falsely mark another chapter's identically named topic as covered."""
        import reports.aggregations
        import curriculum

        mock_curriculum = {
            "mock_cl": {
                "Maths": {
                    "Real Numbers": ["Introduction", "Euclidean Algorithm"],
                    "Polynomials": ["Introduction", "Zeroes of Polynomials"]
                },
                "Science": {
                    "Chemical Reactions": ["Introduction", "Balancing Equations"]
                }
            }
        }
        monkeypatch.setattr(reports.aggregations, "CURRICULUM", mock_curriculum)
        monkeypatch.setattr(curriculum, "CURRICULUM", mock_curriculum)
        compute_term_report = reports.aggregations.compute_term_report

        batch_maths = {"id": "b_mock", "class_level": "mock_cl", "subject": "Maths", "student_ids": ["s1"]}
        student_map = {"s1": "Aarav"}

        # 1. Total curriculum topics for Maths must be 4 (not 3 due to 'Introduction' collision)
        rep_init = compute_term_report("b_mock", batch_maths, [], student_map, subject="Maths")
        assert rep_init["total_curriculum_topics"] == 4
        assert rep_init["covered_topics_count"] == 0
        assert rep_init["syllabus_coverage_pct"] == 0.0

        # 2. Student tests 'Introduction' in 'Real Numbers'
        sub_real_num = {
            "student_id": "s1",
            "results": [
                {"subject": "Maths", "chapter": "Real Numbers", "topic": "Introduction", "is_correct": True}
            ]
        }
        rep_step1 = compute_term_report("b_mock", batch_maths, [sub_real_num], student_map, subject="Maths")
        # Exactly 1 of 4 topics is covered (25.0%), NOT 1 of 3 (33.3%) and NOT both Introductions
        assert rep_step1["total_curriculum_topics"] == 4
        assert rep_step1["covered_topics_count"] == 1
        assert rep_step1["syllabus_coverage_pct"] == 25.0

        # 3. Student tests 'Introduction' in 'Polynomials' as well
        sub_poly = {
            "student_id": "s1",
            "results": [
                {"subject": "Maths", "chapter": "Polynomials", "topic": "Introduction", "is_correct": True}
            ]
        }
        rep_step2 = compute_term_report("b_mock", batch_maths, [sub_real_num, sub_poly], student_map, subject="Maths")
        # Exactly 2 of 4 topics covered (50.0%)
        assert rep_step2["total_curriculum_topics"] == 4
        assert rep_step2["covered_topics_count"] == 2
        assert rep_step2["syllabus_coverage_pct"] == 50.0

        # 4. Under union of all subjects, Science also has an 'Introduction' (total 6 topics across 3 chapters)
        rep_all = compute_term_report("b_mock", {"id": "b_mock", "class_level": "mock_cl", "student_ids": ["s1"]},
                                      [sub_real_num, sub_poly], student_map)
        assert rep_all["total_curriculum_topics"] == 6
        assert rep_all["covered_topics_count"] == 2
        assert rep_all["syllabus_coverage_pct"] == 33.3  # 2/6 * 100 = 33.333%

    def test_15_removed_students_dropped_from_term_rank_matrix(self):
        """Students removed from the batch (or non-enrolled sids) with historical submissions
        must be dropped from per_student_subs and not appear in student_summaries (term rank matrix)."""
        from reports.aggregations import compute_term_report

        # Batch currently only has 's_active'; 's_removed' was previously enrolled and has submissions
        batch = {
            "id": "b_active_only",
            "class_level": "9",
            "subject": "Maths",
            "student_ids": ["s_active"]
        }
        submissions = [
            {
                "student_id": "s_active",
                "score": 90,
                "results": [{"subject": "Maths", "topic": "Number Systems", "is_correct": True}]
            },
            {
                "student_id": "s_removed",
                "score": 50,
                "results": [{"subject": "Maths", "topic": "Number Systems", "is_correct": False}]
            },
            {
                "student_id": "s_other_batch",
                "score": 70,
                "results": [{"subject": "Maths", "topic": "Number Systems", "is_correct": True}]
            }
        ]
        student_map = {
            "s_active": "Enrolled Student",
            "s_removed": "Removed Student",
            "s_other_batch": "Other Student"
        }

        rep = compute_term_report("b_active_only", batch, submissions, student_map, subject="Maths")
        summaries = rep["student_summaries"]

        # Only the currently enrolled student is present
        assert len(summaries) == 1
        assert summaries[0]["student_id"] == "s_active"
        assert summaries[0]["name"] == "Enrolled Student"
        assert summaries[0]["rank"] == 1
        # Neither removed nor foreign students appear in the rank matrix
        summary_sids = {s["student_id"] for s in summaries}
        assert "s_removed" not in summary_sids
        assert "s_other_batch" not in summary_sids

    def test_16_weekly_digest_edge_cases_empty_prior_not_practised_topics_and_utc_dates(self):
        """Validates:
        1. When prior window is empty, delta_avg is None (not a phantom +avg improvement) and prior_avg is None.
        2. Topics attempted only in prior window appear with trajectory 'not_practised' (not vanished).
        3. Mixed ISO offsets (Z vs +05:30) are compared in true UTC to prevent misbucketing.
        """
        from reports.aggregations import compute_weekly_digest
        from datetime import datetime, timezone

        batch = {"id": "b_weekly", "name": "Class 9 Weekly", "class_level": "9", "student_ids": ["s1", "s2"]}
        fixed_now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)
        # 7 days ago: 2026-10-24 12:00:00 UTC
        # 14 days ago: 2026-10-17 12:00:00 UTC

        # 1. Empty prior window: delta_avg must be None, prior_avg must be None
        recent_only_subs = [
            {"student_id": "s1", "score": 85, "results": [{"topic": "Polynomials", "is_correct": True}]}
        ]
        digest_no_prior = compute_weekly_digest("b_weekly", batch, recent_only_subs, [], now=fixed_now)
        assert digest_no_prior["recent_avg"] == 85.0
        assert digest_no_prior["prior_avg"] is None
        assert digest_no_prior["delta_avg"] is None  # NOT 85.0 (which was the phantom improvement bug)

        # 2. Prior-only topics unioned with trajectory 'not_practised'
        prior_subs = [
            {
                "student_id": "s1",
                "score": 70,
                "results": [
                    {"topic": "Real Numbers", "is_correct": True},
                    {"topic": "Triangles", "is_correct": True}
                ]
            }
        ]
        recent_subs = [
            {
                "student_id": "s1",
                "score": 90,
                "results": [
                    {"topic": "Real Numbers", "is_correct": True},
                    {"topic": "Coordinate Geometry", "is_correct": True}
                ]
            }
        ]
        # 'Triangles' was only in prior; 'Real Numbers' in both; 'Coordinate Geometry' only in recent
        digest_movement = compute_weekly_digest("b_weekly", batch, recent_subs, prior_subs, now=fixed_now)
        assert digest_movement["delta_avg"] == 20.0  # 90.0 - 70.0
        m_map = {t["topic"]: t for t in digest_movement["topic_movement"]}

        # 'Triangles' must not vanish; it must be 'not_practised'
        assert "Triangles" in m_map
        triangles = m_map["Triangles"]
        assert triangles["trajectory"] == "not_practised"
        assert triangles["current_accuracy"] is None
        assert triangles["prior_accuracy"] == 100.0
        assert triangles["delta"] is None
        assert triangles["band"] == "not_attempted"

        # 'Real Numbers' was in both (improving from 100 to 100 -> steady)
        assert "Real Numbers" in m_map
        assert m_map["Real Numbers"]["trajectory"] == "steady"

        # 'Coordinate Geometry' was new in recent
        assert "Coordinate Geometry" in m_map
        assert m_map["Coordinate Geometry"]["trajectory"] == "new"

        # 3. Mixed ISO offsets bucketing in UTC
        # Cutoff is 2026-10-24 12:00:00 UTC
        # Sub A: 2026-10-24T16:00:00+05:30 -> 10:30 UTC (PRIOR window!)
        # Sub B: 2026-10-24T18:00:00+05:30 -> 12:30 UTC (RECENT window!)
        # With raw string comparison, "16:00:00+05:30" >= "12:00:00+00:00" would falsely put Sub A in recent
        sub_prior_ist = {
            "student_id": "s1", "score": 60,
            "created_at": "2026-10-24T16:00:00+05:30",
            "results": [{"topic": "Number Systems", "is_correct": True}]
        }
        sub_recent_ist = {
            "student_id": "s1", "score": 80,
            "created_at": "2026-10-24T18:00:00+05:30",
            "results": [{"topic": "Number Systems", "is_correct": True}]
        }
        # Pass both in recent list to test UTC re-bucketing
        digest_utc = compute_weekly_digest("b_weekly", batch, [sub_prior_ist, sub_recent_ist], [], now=fixed_now)
        assert digest_utc["recent_avg"] == 80.0
        assert digest_utc["prior_avg"] == 60.0
        assert digest_utc["delta_avg"] == 20.0
        assert digest_utc["submissions_count"] == 1  # exactly 1 in recent window

        # 4. Duplicate/identical submission dicts with unparseable created_at
        # With list membership scan (s in recent_submissions), identical prior sub would falsely match recent!
        identical_recent = {
            "student_id": "s1", "score": 75,
            "created_at": "unparseable_iso",
            "results": [{"topic": "Number Systems", "is_correct": True}]
        }
        identical_prior = {
            "student_id": "s1", "score": 75,
            "created_at": "unparseable_iso",
            "results": [{"topic": "Number Systems", "is_correct": True}]
        }
        digest_identical = compute_weekly_digest(
            "b_weekly", batch, [identical_recent], [identical_prior], now=fixed_now
        )
        assert digest_identical["submissions_count"] == 1
        assert digest_identical["recent_avg"] == 75.0
        assert digest_identical["prior_avg"] == 75.0
        assert digest_identical["delta_avg"] == 0.0

    def test_17_normalize_class_level_and_curriculum_validation(self):
        """Tests that normalize_class_level extracts digits for 'Class 9', 9 (int), 'Class 10', 10 (int),
        allowing compute_term_report to look up curriculum correctly and failing loudly for invalid classes."""
        import pytest
        from curriculum import normalize_class_level, CURRICULUM
        from reports.aggregations import compute_term_report

        # 1. normalize_class_level unit assertions
        assert normalize_class_level("Class 9") == "9"
        assert normalize_class_level(9) == "9"
        assert normalize_class_level("Class 10") == "10"
        assert normalize_class_level(10) == "10"
        assert normalize_class_level("10th") == "10"
        assert normalize_class_level("Grade 9") == "9"
        assert normalize_class_level("mock_cl") == "mock_cl"

        student_map = {"s1": "Aarav"}
        submissions = []

        # 2. Batch with 'Class 9' (string with text) computes correct curriculum topics (> 0)
        batch_str = {"id": "b_c9", "class_level": "Class 9", "subject": "Maths", "student_ids": ["s1"]}
        rep_str = compute_term_report("b_c9", batch_str, submissions, student_map, subject="Maths")
        assert rep_str["total_curriculum_topics"] > 0
        expected_c9_topics = sum(len(topics) for topics in CURRICULUM["9"]["Maths"].values())
        assert rep_str["total_curriculum_topics"] == expected_c9_topics

        # 3. Batch with integer 9 computes identical curriculum topics
        batch_int = {"id": "b_c9_int", "class_level": 9, "subject": "Maths", "student_ids": ["s1"]}
        rep_int = compute_term_report("b_c9_int", batch_int, submissions, student_map, subject="Maths")
        assert rep_int["total_curriculum_topics"] == expected_c9_topics

        # 4. Batch with invalid class level fails loudly with ValueError
        batch_invalid = {"id": "b_inv", "class_level": "Class 12", "subject": "Maths", "student_ids": ["s1"]}
        with pytest.raises(ValueError) as excinfo:
            compute_term_report("b_inv", batch_invalid, submissions, student_map, subject="Maths")
        assert "not found in CURRICULUM" in str(excinfo.value)

    def test_18_question_accuracy_uses_answered_count_not_submitted_count(self):
        """
        Verify that accuracy does not penalize questions near the end of a test
        that some students did not reach.
        If 4 students submitted, but 2 students only answered Q1 & Q2 (did not reach Q3),
        and both students who reached Q3 answered correctly:
        - Q3 accuracy must be 100.0% (2 / 2 answered), NOT 50.0% (2 / 4 submitted).
        - Q3 answered_count must be 2.
        - Questions not reached by any students should have accuracy 0.0 and answered_count 0.
        """
        test_doc = {
            "id": "test_unreached",
            "title": "Speed Test",
            "duration_minutes": 10,
            "questions": [
                {"question": "Q1", "topic": "Algebra"},
                {"question": "Q2", "topic": "Geometry"},
                {"question": "Q3", "topic": "Trigonometry"},
                {"question": "Q4", "topic": "Calculus"}
            ]
        }
        subs = [
            {"student_id": "s1", "score": 100, "results": [{"is_correct": True}, {"is_correct": True}, {"is_correct": True}]},
            {"student_id": "s2", "score": 100, "results": [{"is_correct": True}, {"is_correct": True}, {"is_correct": True}]},
            {"student_id": "s3", "score": 50, "results": [{"is_correct": True}, {"is_correct": False}]},
            {"student_id": "s4", "score": 50, "results": [{"is_correct": True}, {"is_correct": False}]}
        ]
        res = compute_test_analytics(test_doc, subs, enrolled_count=4)
        assert res["submitted_count"] == 4

        q_analysis = res["question_analysis"]
        assert len(q_analysis) == 4

        # Q1: all 4 answered, all 4 correct
        assert q_analysis[0]["answered_count"] == 4
        assert q_analysis[0]["correct_count"] == 4
        assert q_analysis[0]["accuracy"] == 100.0

        # Q2: all 4 answered, 2 correct
        assert q_analysis[1]["answered_count"] == 4
        assert q_analysis[1]["correct_count"] == 2
        assert q_analysis[1]["accuracy"] == 50.0

        # Q3: only 2 students reached, both got it right
        assert q_analysis[2]["answered_count"] == 2
        assert q_analysis[2]["correct_count"] == 2
        assert q_analysis[2]["accuracy"] == 100.0  # NOT 50.0% !

        # Q4: 0 students reached
        assert q_analysis[3]["answered_count"] == 0
        assert q_analysis[3]["correct_count"] == 0
        assert q_analysis[3]["accuracy"] == 0.0









def test_19_skipped_questions_excluded_from_answered_count_and_mastery():
    """Skips are stored as full results (answers == -1, is_correct False). They must not count as
    answered in question accuracy, and must not drag topic mastery down as if answered wrong."""
    from lib.mastery import compute_topic_mastery

    test_doc = {
        "id": "test_skips",
        "title": "Skip Test",
        "duration_minutes": 10,
        "questions": [{"question": "Q1", "topic": "Algebra"}, {"question": "Q2", "topic": "Geometry"}],
    }
    subs = [
        # New-style results carry an explicit `answered` flag
        {"id": "sub_1", "student_id": "s1", "score": 50, "answers": [1, -1], "results": [
            {"q": 0, "topic": "Algebra", "is_correct": True, "answered": True},
            {"q": 1, "topic": "Geometry", "is_correct": False, "answered": False},
        ]},
        # Legacy results without the flag fall back to the submission's answers list
        {"id": "sub_2", "student_id": "s2", "score": 50, "answers": [0, 2], "results": [
            {"q": 0, "topic": "Algebra", "is_correct": False},
            {"q": 1, "topic": "Geometry", "is_correct": True},
        ]},
        {"id": "sub_3", "student_id": "s3", "score": 0, "answers": [-1, -1], "results": [
            {"q": 0, "topic": "Algebra", "is_correct": False},
            {"q": 1, "topic": "Geometry", "is_correct": False},
        ]},
    ]
    res = compute_test_analytics(test_doc, subs, enrolled_count=3)
    q = res["question_analysis"]
    assert q[0]["answered_count"] == 2 and q[0]["accuracy"] == 50.0
    assert q[1]["answered_count"] == 1 and q[1]["accuracy"] == 100.0

    breakdown = {t["topic"]: t for t in res["topic_breakdown"]}
    assert breakdown["Geometry"]["total_attempts"] == 1
    assert breakdown["Geometry"]["accuracy"] == 100

    # A topic the student only ever skipped has no attempts, so it cannot be flagged weak
    mastery = compute_topic_mastery([
        {"subject": "Maths", "chapter": "Lines", "topic": "Geometry", "is_correct": False,
         "answered": False, "submission_id": f"sub_{i}"}
        for i in range(3)
    ], include_unattempted=False)
    assert mastery == []


def test_20_term_coverage_partial_matches_only_when_unambiguous(monkeypatch):
    """A short partial tag ('Area') that fits several curriculum topics must not claim any of them
    (previously the winner depended on set iteration order, which changes with the hash seed).
    A partial tag that fits exactly one topic still counts."""
    import reports.aggregations
    import curriculum

    mock_curriculum = {
        "mock_cl": {
            "Maths": {
                "Areas": ["Area of Triangles", "Area of Parallelograms"],
                "Surface Areas": ["Surface Area of Cubes"],
                "Real Numbers": ["Euclidean Algorithm"],
            }
        }
    }
    monkeypatch.setattr(reports.aggregations, "CURRICULUM", mock_curriculum)
    monkeypatch.setattr(curriculum, "CURRICULUM", mock_curriculum)
    batch = {"id": "b", "class_level": "mock_cl", "subject": "Maths", "student_ids": ["s1"]}

    ambiguous = [{"student_id": "s1", "results": [{"subject": "Maths", "topic": "Area", "is_correct": True}]}]
    rep = reports.aggregations.compute_term_report("b", batch, ambiguous, {"s1": "A"}, subject="Maths")
    assert rep["covered_topics_count"] == 0

    unique = [{"student_id": "s1", "results": [{"subject": "Maths", "topic": "Euclidean", "is_correct": True}]}]
    rep = reports.aggregations.compute_term_report("b", batch, unique, {"s1": "A"}, subject="Maths")
    assert rep["covered_topics_count"] == 1


def test_21_multi_topic_question_counts_toward_each_topic():
    """A question tagged with several topics feeds mastery for every tag, with its weight split evenly."""
    from lib.mastery import compute_topic_mastery

    attempts = [
        {"subject": "Maths", "chapter": "Quadratic Equations", "topic": "Nature of Roots",
         "topics": ["Nature of Roots", "Discriminant"], "is_correct": True, "submission_id": "s1"},
        {"subject": "Maths", "chapter": "Quadratic Equations", "topic": "Discriminant",
         "topics": ["Discriminant"], "is_correct": False, "submission_id": "s2"},
    ]
    by_topic = {t["topic"]: t for t in compute_topic_mastery(attempts, include_unattempted=False)}
    assert by_topic["Nature of Roots"]["attempts"] == 1
    assert by_topic["Nature of Roots"]["score"] == 100
    assert by_topic["Discriminant"]["attempts"] == 2
    # Half-weight correct (0.5 * 1.0) vs full-weight wrong (1.0): 0.5 / 1.5 = 33%
    assert by_topic["Discriminant"]["score"] == 33


def test_22_weekly_digest_keys_by_chapter_and_needs_min_questions():
    """Same-named topics in different chapters stay separate in the weekly digest, and a topic
    with a single answered question is 'insufficient_data' rather than weak."""
    from datetime import datetime, timezone

    batch = {"id": "b", "name": "B", "class_level": "9", "student_ids": ["s1"]}
    now = datetime(2026, 10, 31, 12, 0, 0, tzinfo=timezone.utc)
    recent = [{"student_id": "s1", "score": 50, "created_at": "2026-10-30T10:00:00+00:00", "results": [
        {"subject": "Maths", "chapter": "Polynomials", "topic": "Introduction", "is_correct": False},
        {"subject": "Maths", "chapter": "Polynomials", "topic": "Introduction", "is_correct": False},
        {"subject": "Maths", "chapter": "Real Numbers", "topic": "Introduction", "is_correct": False},
    ]}]
    digest = compute_weekly_digest("b", batch, recent, [], now=now)
    by_chapter = {t["chapter"]: t for t in digest["topic_movement"]}
    assert set(by_chapter) == {"Polynomials", "Real Numbers"}
    assert by_chapter["Polynomials"]["band"] == "weak"
    assert by_chapter["Real Numbers"]["band"] == "insufficient_data"

    test_doc = {"id": "t", "title": "T", "duration_minutes": 10, "questions": [{"question": "Q1"}]}
    subs = [{"student_id": "s1", "score": 0, "results": [{"topic": "Triangles", "is_correct": False}]}]
    res = compute_test_analytics(test_doc, subs, enrolled_count=1)
    assert res["topic_breakdown"][0]["band"] == "insufficient_data"


def test_23_batch_confirmation_needs_enough_students_and_questions():
    """Pooled batch mastery: two students answering one question each must not confirm a class-wide
    weakness. Confirmation needs >= 3 distinct students (or all active students in a smaller batch)
    and >= 5 answered questions."""
    from lib.mastery import compute_topic_mastery, apply_batch_confirmation

    def wrong(student, sub):
        return {"subject": "Maths", "chapter": "Polynomials", "topic": "Zeroes", "is_correct": False,
                "student_id": student, "submission_id": sub}

    thin = compute_topic_mastery([wrong("s1", "a"), wrong("s2", "b")], include_unattempted=False)
    assert thin[0]["is_confirmed_weak"] is True  # per-student rule alone would confirm it
    apply_batch_confirmation(thin, active_students=10)
    assert thin[0]["is_confirmed_weak"] is False
    assert thin[0]["students"] == 2

    solid = compute_topic_mastery(
        [wrong(s, f"{s}_{i}") for s in ("s1", "s2", "s3") for i in range(2)], include_unattempted=False
    )
    apply_batch_confirmation(solid, active_students=10)
    assert solid[0]["students"] == 3 and solid[0]["attempts"] == 6
    assert solid[0]["is_confirmed_weak"] is True

    # A two-student batch can still confirm, as long as both students and 5+ questions back it
    small = compute_topic_mastery(
        [wrong(s, f"{s}_{i}") for s in ("s1", "s2") for i in range(3)], include_unattempted=False
    )
    apply_batch_confirmation(small, active_students=2)
    assert small[0]["is_confirmed_weak"] is True


def test_24_student_mastery_infers_chapter_from_batch_class(monkeypatch):
    """With the batch class passed, an attempt missing subject/chapter is inferred against that class's
    syllabus. With class_level=None inference searches class 9 before 10, so a topic name shared by both
    classes lands in the class 9 chapter even for a class 10 batch."""
    import curriculum
    from lib.mastery import compute_topic_mastery

    mock_curriculum = {
        "9": {"Maths": {"Number Systems": ["Introduction"]}},
        "10": {"Maths": {"Real Numbers": ["Introduction"]}},
    }
    monkeypatch.setattr(curriculum, "CURRICULUM", mock_curriculum)

    attempt = [{"topic": "Introduction", "is_correct": True, "submission_id": "x"}]
    without_class = compute_topic_mastery(attempt, class_level=None, include_unattempted=False)
    with_class = compute_topic_mastery(attempt, class_level="10", include_unattempted=False)
    assert without_class[0]["chapter"] == "Number Systems"
    assert with_class[0]["chapter"] == "Real Numbers"
