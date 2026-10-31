"""Tests for topic key normalization and diagnostic results subject inheritance."""
import io
import os
import uuid
import pytest
import requests
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestTopicNormalization:
    state = {}

    @classmethod
    def setup_class(cls):
        cls.state["th"] = _login("teacher@vidya.com", "teacher123")
        cls.state["sh"] = _login("student@vidya.com", "student123")
        cls.state["tag"] = uuid.uuid4().hex[:8]
        cls.state["created_qids"] = []

    @classmethod
    def teardown_class(cls):
        th = cls.state.get("th")
        for qid in cls.state.get("created_qids", []):
            try:
                requests.delete(f"{API}/questions/{qid}", headers=th, timeout=10)
            except Exception:
                pass

    def test_01_ingestion_normalizes_casing_and_whitespace(self):
        """'Linear Equations' vs 'Linear equations' vs '  linear equations  ' normalize identically."""
        tag = self.state["tag"]
        payload = {
            "class_level": "9",
            "subject": "Maths",
            "chapter": f"Algebra_{tag}",
            "questions": [
                {
                    "question": f"Question 1 on linear equations ({tag})?",
                    "options": ["1", "2", "3", "4"],
                    "correct_answer": "1",
                    "topic": "Linear Equations",
                    "difficulty": "easy"
                },
                {
                    "question": f"Question 2 on linear equations ({tag})?",
                    "options": ["A", "B", "C", "D"],
                    "correct_answer": "A",
                    "topic": "Linear equations",
                    "difficulty": "medium"
                },
                {
                    "question": f"Question 3 on linear equations ({tag})?",
                    "options": ["W", "X", "Y", "Z"],
                    "correct_answer": "W",
                    "topic": "  linear  equations  ",
                    "difficulty": "hard"
                }
            ]
        }
        r = requests.post(f"{API}/questions/import-json", headers=self.state["th"], json=payload, timeout=20)
        assert r.status_code == 200, r.text
        res = r.json()
        assert res["imported"] == 3

        # Verify all 3 questions saved with identical normalized topic
        fetch_r = requests.get(f"{API}/questions?chapter=Algebra_{tag}", headers=self.state["th"], timeout=15)
        assert fetch_r.status_code == 200
        items = fetch_r.json()
        assert len(items) == 3
        for item in items:
            self.state["created_qids"].append(item["id"])
            assert item["topic"] == "Linear Equations"

    def test_02_mastery_does_not_fork_cased_topics(self):
        """Attempts with different topic casing aggregate into a single topic rather than forking."""
        from lib.mastery import compute_topic_mastery

        tag = self.state["tag"]
        attempts = [
            {"subject": "Maths", "chapter": f"TestChapter_{tag}", "topic": "Linear Equations", "is_correct": True, "difficulty": "medium", "time_s": 20},
            {"subject": "Maths", "chapter": f"TestChapter_{tag}", "topic": "Linear equations", "is_correct": True, "difficulty": "medium", "time_s": 25},
            {"subject": "Maths", "chapter": f"TestChapter_{tag}", "topic": "  linear  equations  ", "is_correct": False, "difficulty": "medium", "time_s": 30},
        ]
        mastery = compute_topic_mastery(attempts, class_level="9")
        matched = [m for m in mastery if f"TestChapter_{tag}".lower() in m["chapter"].lower()]
        assert len(matched) == 1, f"Expected 1 merged topic, got {len(matched)}"
        item = matched[0]
        assert item["topic"] == "Linear Equations"
        assert item["attempts"] == 3
        assert item["score"] == 67

    def test_03_diagnostic_results_inherit_subject_and_chapter(self):
        """Diagnostic tests without explicit subject parameter produce results that inherit non-empty subject tags."""
        # 1. Create a diagnostic test
        diag_r = requests.post(f"{API}/tests/diagnostic", headers=self.state["sh"],
                               json={"class_level": "9"}, timeout=30)
        assert diag_r.status_code == 200, diag_r.text
        diag = diag_r.json()
        assert diag["status"] == "ready"
        diag_id = diag["id"]

        # 2. Fetch test questions as student
        test_view = requests.get(f"{API}/tests/{diag_id}", headers=self.state["sh"], timeout=15).json()
        questions = test_view.get("questions") or []
        assert len(questions) >= 1

        # 3. Submit the test
        answers = [0] * len(questions)
        times = [10.0] * len(questions)
        sub_r = requests.post(f"{API}/tests/{diag_id}/submit", headers=self.state["sh"],
                              json={"answers": answers, "times": times}, timeout=30)
        assert sub_r.status_code == 200, sub_r.text
        sub_data = sub_r.json()
        assert "score" in sub_data

        # 4. Fetch mastery and verify NO ("", "", topic) groups exist
        mastery_r = requests.get(f"{API}/mastery/me", headers=self.state["sh"], timeout=15)
        assert mastery_r.status_code == 200
        mastery = mastery_r.json()
        topics = mastery["topics"] if isinstance(mastery, dict) else mastery
        assert len(topics) > 0
        for entry in topics:
            # Subject and chapter must not be blank strings
            assert entry["subject"].strip() != "", f"Found blank subject in mastery entry: {entry}"
            assert entry["chapter"].strip() != "", f"Found blank chapter in mastery entry: {entry}"
            assert entry["topic"].strip() != "", f"Found blank topic in mastery entry: {entry}"

    def test_04_round_half_up_and_band_boundaries(self):
        """Boundary scores do not flip inconsistently via banker's rounding."""
        from lib.mastery import round_half_up, band

        # Built-in Python round(54.5) -> 54 (banker's rounding)
        # round_half_up(54.5) -> 55
        assert round(54.5) == 54  # Demonstrates Python banker's rounding
        assert round_half_up(54.5) == 55
        assert round_half_up(54.4) == 54
        assert round_half_up(55.5) == 56
        assert round_half_up(74.5) == 75
        assert round_half_up(75.5) == 76

        # Bands: < 55 weak · 55-75 developing · > 75 strong
        # With round_half_up: 54.5 consistently enters 'developing', not 'weak'
        assert band(54.4, attempts=1) == "weak"
        assert band(54.5, attempts=1) == "developing"
        assert band(55.0, attempts=1) == "developing"
        assert band(55.5, attempts=1) == "developing"
        assert band(74.5, attempts=1) == "developing"
        assert band(75.0, attempts=1) == "developing"
        assert band(75.5, attempts=1) == "strong"
        assert band(76.0, attempts=1) == "strong"

        # 0 attempts always 'not_attempted'
        assert band(54.5, attempts=0) == "not_attempted"

    def test_05_mastery_boundary_scores_consistency(self):
        """In compute_topic_mastery, score and band are completely consistent without banker's drift."""
        from lib.mastery import compute_topic_mastery

        tag = self.state["tag"]
        # Create attempts that yield exactly 54.5%:
        # 109 correct out of 200 attempts at weight 1.0 = 54.5%
        # Or with small number: 109/200 = 0.545 -> 54.5%
        attempts_54_5 = [
            {"subject": "Maths", "chapter": f"Boundary_{tag}", "topic": "BoundaryTopicA", "is_correct": True, "difficulty": "easy", "time_s": 10}
            for _ in range(109)
        ] + [
            {"subject": "Maths", "chapter": f"Boundary_{tag}", "topic": "BoundaryTopicA", "is_correct": False, "difficulty": "easy", "time_s": 10}
            for _ in range(91)
        ]
        mastery = compute_topic_mastery(attempts_54_5, class_level="9")
        entry = next(m for m in mastery if m["topic"] == "BoundaryTopicA")
        assert entry["score"] == 55, f"Expected 55, got {entry['score']}"
        assert entry["band"] == "developing", f"Expected developing, got {entry['band']}"

    def test_06_unclassified_subject_does_not_pollute_maths(self):
        """A question failing curriculum inference leaves subject empty, fails silent ingestion,
        and does NOT pollute Maths mastery map."""
        from curriculum import normalize_taxonomy
        from lib.mastery import compute_topic_mastery

        # 1. normalize_taxonomy does not silently inject 'Maths'
        cl, subj, chap, top, _ = normalize_taxonomy("9", "", "Custom Quantum Optics", "Photonic Entanglement", [])
        assert subj == "", f"Expected empty subject for un-inferred topic, got '{subj}'"
        assert chap == "Custom Quantum Optics"
        assert top == "Photonic Entanglement"

        # 2. Ingestion exposes error instead of silently filing under Maths
        tag = uuid.uuid4().hex[:6]
        payload = {
            "class_level": "9",
            # subject omitted
            "chapter": f"CustomScience_{tag}",
            "questions": [
                {
                    "question": f"What is Planck constant in quantum optics ({tag})?",
                    "options": ["6.626e-34", "3.00e8", "1.60e-19", "9.81"],
                    "correct_answer": "6.626e-34",
                    "topic": "Quantum Constants",
                    "difficulty": "medium"
                }
            ]
        }
        r = requests.post(f"{API}/questions/import-json", headers=self.state["th"], json=payload, timeout=20)
        assert r.status_code == 200, r.text
        res = r.json()
        assert res["imported"] == 0, "Question with missing subject should not be imported silently"
        assert len(res["errors"]) > 0
        assert any("missing subject" in err.get("problems", []) for err in res["errors"])

        # Verify it was NOT filed under Maths in question bank
        q_check = requests.get(f"{API}/questions?subject=Maths&chapter=CustomScience_{tag}",
                               headers=self.state["th"], timeout=15).json()
        assert len(q_check) == 0, "Corrupted question was found under Maths!"

        # 3. compute_topic_mastery: unclassified attempt is tagged 'Unknown' and does not pollute Maths
        attempts = [
            # One valid Maths attempt
            {"subject": "Maths", "chapter": "Real Numbers", "topic": "Euclid Division Lemma",
             "is_correct": True, "difficulty": "easy", "time_s": 15},
            # One unclassified attempt with no subject tag and custom non-curriculum topic
            {"subject": "", "chapter": f"CustomScience_{tag}", "topic": "Quantum Constants",
             "is_correct": False, "difficulty": "hard", "time_s": 45}
        ]

        # When filtered specifically for 'Maths':
        maths_mastery = compute_topic_mastery(attempts, class_level="9", subject="Maths")
        maths_topics = [m["topic"] for m in maths_mastery]
        assert "Quantum Constants" not in maths_topics, "Unclassified question polluted Maths mastery map!"

        # When unfiltered:
        all_mastery = compute_topic_mastery(attempts, class_level="9")
        unknown_entry = next((m for m in all_mastery if m["topic"] == "Quantum Constants"), None)
        assert unknown_entry is not None, "Unknown topic should be exposed in general mastery list"
        assert unknown_entry["subject"] == "Unknown", f"Expected subject 'Unknown', got '{unknown_entry['subject']}'"
        assert unknown_entry["is_unclassified"] is True

        # 4. Ingestion quality signal surfaced to teachers
        from lib.mastery import get_ingestion_quality_summary
        quality = get_ingestion_quality_summary(all_mastery)
        assert quality["has_unknown"] is True
        assert quality["unknown_topics_count"] >= 1
        assert quality["status"] == "warning"
        assert "unclassified topic" in quality["signal"]

    def test_07_no_class_detected_skips_syllabus_union(self):
        """When no class level is detected (class_level=None or empty), skip syllabus union
        rather than guessing and dumping phantom Class-10 not_attempted rows."""
        from lib.mastery import compute_topic_mastery, _extract_syllabus_topics

        # 1. _extract_syllabus_topics returns empty list when no class detected
        assert _extract_syllabus_topics(class_level=None) == []
        assert _extract_syllabus_topics(class_level="") == []
        assert _extract_syllabus_topics(class_level=[]) == []

        # 2. A batch-less student with 0 attempts gets empty mastery, NOT hundreds of Class-10 rows
        empty_mastery = compute_topic_mastery([], class_level=None)
        assert len(empty_mastery) == 0, f"Expected 0 rows for empty attempts with no class, got {len(empty_mastery)}"

        # 3. A batch-less Class-9 student with 1 attempt gets ONLY that 1 attempt,
        # with NO phantom not_attempted Class-10 rows unioned into their profile
        tag = uuid.uuid4().hex[:6]
        c9_attempts = [
            {"subject": "Maths", "chapter": "Number Systems", "topic": f"Irrational Numbers {tag}",
             "is_correct": True, "difficulty": "easy", "time_s": 15}
        ]
        res = compute_topic_mastery(c9_attempts, class_level=None)
        assert len(res) == 1, f"Expected exactly 1 attempted topic row, got {len(res)} (phantom rows leaked!)"
        assert res[0]["topic"] == f"Irrational Numbers {tag}"
        assert res[0]["band"] == "developing" or res[0]["band"] == "strong"
        assert all(r["band"] != "not_attempted" for r in res)

        # 4. When class_level IS provided (e.g. "10"), official syllabus is properly unioned
        c10_mastery = compute_topic_mastery([], class_level="10")
        assert len(c10_mastery) > 0
        assert all(r["band"] == "not_attempted" for r in c10_mastery)

    def test_08_teacher_mastery_payload_does_not_explode_with_unattempted_rows(self):
        """teacher_mastery computes syllabus union once at batch level and drops not_attempted
        rows from per-student topic lists to avoid 16k empty cell payload explosions."""
        batches = requests.get(f"{API}/batches", headers=self.state["th"], timeout=15).json()
        assert len(batches) > 0, "No batches found for teacher"
        batch_id = batches[0]["id"]

        res = requests.get(f"{API}/mastery/teacher", params={"batch_id": batch_id},
                           headers=self.state["th"], timeout=15)
        assert res.status_code == 200, res.text
        data = res.json()

        # Each student's topic array must NOT contain not_attempted rows
        for s in data.get("students", []):
            for t in s.get("topics", []):
                assert t.get("attempts", 0) > 0, f"Found unattempted topic row in student {s['name']}: {t}"
                assert t.get("band") != "not_attempted", f"Found not_attempted band in student {s['name']}: {t}"

        # Batch-level weak_topics contains only attempted topics (no unattempted bloat)
        assert "weak_topics" in data
        assert isinstance(data["weak_topics"], list)
        for w in data["weak_topics"]:
            assert w.get("attempts", 0) > 0, f"Found unattempted topic in weak_topics: {w}"
            assert w.get("band") != "not_attempted"

        # Separate not_attempted_topics list for untested syllabus coverage
        assert "not_attempted_topics" in data
        assert isinstance(data["not_attempted_topics"], list)
        for nt in data["not_attempted_topics"]:
            assert nt.get("attempts") == 0
            assert nt.get("band") == "not_attempted"

        # needs_attention combines weak and untested with explicit reason tag
        assert "needs_attention" in data
        assert isinstance(data["needs_attention"], list)
        for na in data["needs_attention"]:
            assert na["reason"] in ("weak", "untested")

    def test_09_student_mastery_me_payload_bloat_prevention(self):
        """GET /mastery/me returns only attempted topics + summary counts by default,
        and lazy-loads the full syllabus radar when full=true."""
        from lib.mastery import compute_topic_mastery, compute_unattempted_summary

        attempts = [
            {"subject": "Maths", "chapter": "Real Numbers", "topic": "Fundamental Theorem of Arithmetic",
             "difficulty": "medium", "is_correct": True, "time_s": 45, "created_at": "2026-10-31T10:00:00Z"},
        ]
        # Unit test compute_topic_mastery with include_unattempted=False
        attempted_only = compute_topic_mastery(attempts, class_level="10", include_unattempted=False)
        assert len(attempted_only) == 1
        assert attempted_only[0]["topic"] == "Fundamental Theorem of Arithmetic"

        summary = compute_unattempted_summary(attempted_only, class_level="10")
        assert summary["summary"]["attempted_count"] == 1
        assert summary["summary"]["not_attempted_count"] > 100
        assert "Real Numbers" in summary["not_attempted_by_chapter"]

        # API integration test
        res_default = requests.get(f"{API}/mastery/me", headers=self.state["sh"], timeout=15)
        assert res_default.status_code == 200
        data_default = res_default.json()
        assert data_default["is_full"] is False
        assert "not_attempted_by_chapter" in data_default
        assert "summary" in data_default
        for t in data_default["topics"]:
            assert t["attempts"] > 0
            assert t["band"] != "not_attempted"

        # Lazy-loaded full radar
        res_full = requests.get(f"{API}/mastery/me?full=true", headers=self.state["sh"], timeout=15)
        assert res_full.status_code == 200
        data_full = res_full.json()
        assert data_full["is_full"] is True

        assert len(data_full["topics"]) > len(data_default["topics"])

    def test_10_subject_filter_shared_matching_semantics(self):
        """_extract_syllabus_topics and compute_topic_mastery share the same matching semantics,
        preventing attempt drops when batch subject is 'Mathematics' and attempt is 'Maths' (or vice-versa)."""
        from curriculum import subjects_match, normalize_subject
        from lib.mastery import _extract_syllabus_topics, compute_topic_mastery
        from reports.aggregations import compute_term_report

        # 1. Test shared subjects_match helper
        assert subjects_match("Mathematics", "Maths") is True
        assert subjects_match("Maths", "Mathematics") is True
        assert subjects_match("math", "Maths") is True
        assert subjects_match("Science", "Sci") is True
        assert subjects_match("Science", "Maths") is False
        assert normalize_subject("mathematics") == "Maths"
        assert normalize_subject("sci") == "Science"

        # 2. _extract_syllabus_topics matches both 'Mathematics' and 'Maths'
        maths_topics = _extract_syllabus_topics(class_level="10", subject="Maths")
        mathematics_topics = _extract_syllabus_topics(class_level="10", subject="Mathematics")
        assert len(maths_topics) > 0
        assert len(maths_topics) == len(mathematics_topics)

        # 3. compute_topic_mastery does NOT drop attempts when attempt is 'Maths' and requested subject is 'Mathematics'
        attempts = [
            {"subject": "Maths", "chapter": "Real Numbers", "topic": "Fundamental Theorem of Arithmetic",
             "difficulty": "medium", "is_correct": False, "time_s": 45, "created_at": "2026-10-31T10:00:00Z"},
            {"subject": "Maths", "chapter": "Real Numbers", "topic": "Fundamental Theorem of Arithmetic",
             "difficulty": "medium", "is_correct": False, "time_s": 40, "created_at": "2026-10-31T11:00:00Z"}
        ]
        mastery_with_mathematics = compute_topic_mastery(
            attempts, class_level="10", subject="Mathematics", include_unattempted=False
        )
        assert len(mastery_with_mathematics) == 1
        assert mastery_with_mathematics[0]["attempts"] == 2
        assert mastery_with_mathematics[0]["band"] == "weak"

        # 4. Term report with batch subject="Mathematics" and attempts with "Maths"
        batch = {"id": "b_math", "class_level": "10", "subject": "Mathematics", "student_ids": ["s1"]}
        subs = [{
            "student_id": "s1",
            "results": [
                {"subject": "Maths", "topic": "Fundamental Theorem of Arithmetic", "is_correct": False},
                {"subject": "Maths", "topic": "Fundamental Theorem of Arithmetic", "is_correct": False}
            ]
        }]
        rep = compute_term_report("b_math", batch, subs, {"s1": "Aarav"}, subject="Mathematics")
        st_rep = rep["student_summaries"][0]
        assert st_rep["weak_topics_count"] == 1
        assert rep["covered_topics_count"] > 0

    def test_11_centralized_confirmed_weak_predicate(self):
        """Validates that is_confirmed_weak(t) requires band == 'weak' AND attempts >= 2,
        ensuring compute_term_report, teacher_mastery, and compute_unattempted_summary
        yield identical numbers for students with 1-attempt vs >=2-attempt topics."""
        from lib.mastery import is_confirmed_weak, is_confirmed_strong, compute_topic_mastery, compute_unattempted_summary
        from reports.aggregations import compute_term_report

        # 1. Pure predicate unit assertions
        assert is_confirmed_weak({"band": "weak", "attempts": 1}) is False
        assert is_confirmed_weak({"band": "weak", "attempts": 2}) is True
        assert is_confirmed_weak({"band": "weak", "attempts": 5}) is True
        assert is_confirmed_weak({"band": "developing", "attempts": 4}) is False
        assert is_confirmed_weak({"band": "strong", "attempts": 3}) is False
        assert is_confirmed_weak("weak", attempts=1) is False
        assert is_confirmed_weak("weak", attempts=2) is True
        assert is_confirmed_weak("weak", attempts=0) is False
        assert is_confirmed_strong({"band": "strong", "attempts": 1}) is False
        assert is_confirmed_strong({"band": "strong", "attempts": 2}) is True

        # 2. compute_topic_mastery marks is_confirmed_weak appropriately
        single_attempt = [
            {"subject": "Maths", "chapter": "Real Numbers", "topic": "Fundamental Theorem of Arithmetic",
             "difficulty": "medium", "is_correct": False, "time_s": 30, "created_at": "2026-10-31T10:00:00Z"}
        ]
        mastery_single = compute_topic_mastery(single_attempt, class_level="10", include_unattempted=False)
        assert len(mastery_single) == 1
        assert mastery_single[0]["band"] == "weak"
        assert mastery_single[0]["attempts"] == 1
        assert mastery_single[0]["is_confirmed_weak"] is False

        two_attempts = [
            {"subject": "Maths", "chapter": "Real Numbers", "topic": "Fundamental Theorem of Arithmetic",
             "difficulty": "medium", "is_correct": False, "time_s": 30, "created_at": "2026-10-31T10:00:00Z"},
            {"subject": "Maths", "chapter": "Real Numbers", "topic": "Fundamental Theorem of Arithmetic",
             "difficulty": "medium", "is_correct": False, "time_s": 35, "created_at": "2026-10-31T10:05:00Z"}
        ]
        mastery_two = compute_topic_mastery(two_attempts, class_level="10", include_unattempted=False)
        assert len(mastery_two) == 1
        assert mastery_two[0]["band"] == "weak"
        assert mastery_two[0]["attempts"] == 2
        assert mastery_two[0]["is_confirmed_weak"] is True

        # 3. compute_unattempted_summary uses is_confirmed_weak
        summary_single = compute_unattempted_summary(mastery_single, class_level="10")
        assert summary_single["summary"]["weak_count"] == 0
        assert summary_single["summary"]["developing_count"] == 1

        summary_two = compute_unattempted_summary(mastery_two, class_level="10")
        assert summary_two["summary"]["weak_count"] == 1
        assert summary_two["summary"]["developing_count"] == 0

        # 4. compute_term_report matches compute_unattempted_summary
        batch = {"id": "b_confirm", "class_level": "10", "subject": "Maths", "student_ids": ["s_single", "s_two"]}
        subs = [
            {
                "student_id": "s_single",
                "results": [{"subject": "Maths", "topic": "Fundamental Theorem of Arithmetic", "is_correct": False}]
            },
            {
                "student_id": "s_two",
                "results": [
                    {"subject": "Maths", "topic": "Fundamental Theorem of Arithmetic", "is_correct": False},
                    {"subject": "Maths", "topic": "Fundamental Theorem of Arithmetic", "is_correct": False}
                ]
            }
        ]
        rep = compute_term_report("b_confirm", batch, subs, {"s_single": "Single", "s_two": "Two"}, subject="Maths")
        st_map = {s["student_id"]: s for s in rep["student_summaries"]}
        assert st_map["s_single"]["weak_topics_count"] == 0
        assert st_map["s_two"]["weak_topics_count"] == 1

    def test_12_batch_weak_topic_class_avg_weighted_by_raw_attempts(self):
        """Validates that pooling raw attempts across students and running compute_topic_mastery
        prevents a student with 1 attempt from distorting a student with 30 attempts."""
        from lib.mastery import compute_topic_mastery

        # Student A: 1 attempt, incorrect (score = 0)
        s_a_attempts = [
            {"subject": "Maths", "chapter": "Real Numbers", "topic": "Fundamental Theorem of Arithmetic",
             "difficulty": "medium", "is_correct": False, "time_s": 25, "created_at": "2026-10-31T10:00:00Z"}
        ]
        # Student B: 30 attempts, 29 correct (score ~97%)
        s_b_attempts = [
            {"subject": "Maths", "chapter": "Real Numbers", "topic": "Fundamental Theorem of Arithmetic",
             "difficulty": "medium", "is_correct": (i < 29), "time_s": 20, "created_at": "2026-10-31T10:05:00Z"}
            for i in range(30)
        ]

        # Prior unweighted average of rounded student scores gave: (0 + 97) / 2 = 48% (weak band)
        # Pooled batch mastery:
        pooled = s_a_attempts + s_b_attempts
        batch_mastery = compute_topic_mastery(pooled, class_level=None, subject="Maths", include_unattempted=False)
        assert len(batch_mastery) == 1
        bm = batch_mastery[0]

        # 29 correct out of 31 total attempts = 93.5% -> rounds to 94%
        assert bm["attempts"] == 31
        assert bm["score"] >= 90
        assert bm["band"] == "strong"
        assert bm["is_confirmed_weak"] is False

    def test_13_ingestion_quality_surfaces_strong_and_developing_unclassified_topics(self):
        """Validates that ingestion-quality scanning checks the full topic set across all batch attempts
        so that unclassified topics that are strong (>=75%) or developing (55-75%) reliably surface."""
        from lib.mastery import compute_topic_mastery, get_ingestion_quality_summary

        # Unclassified topic with strong performance (100% accuracy)
        attempts_strong = [
            {"subject": "Unknown", "topic": "NonStandard Topic Alpha", "is_correct": True, "attempts": 1},
            {"subject": "Unknown", "topic": "NonStandard Topic Alpha", "is_correct": True, "attempts": 1}
        ]
        # Unclassified topic with developing performance (60% accuracy)
        attempts_developing = [
            {"subject": "Unknown", "topic": "NonStandard Topic Beta", "is_correct": True, "attempts": 1},
            {"subject": "Unknown", "topic": "NonStandard Topic Beta", "is_correct": False, "attempts": 1}
        ]
        # Standard maths topic
        attempts_maths = [
            {"subject": "Maths", "chapter": "Real Numbers", "topic": "Fundamental Theorem of Arithmetic", "is_correct": True}
        ]

        # 1. Prior behavior: passing weak_topics filtered by subject='Maths' dropped all Unknown topics
        old_weak_topics = compute_topic_mastery(attempts_strong + attempts_developing + attempts_maths,
                                                class_level=None, subject="Maths", include_unattempted=False)
        old_iq = get_ingestion_quality_summary(old_weak_topics)
        assert old_iq["has_unknown"] is False
        assert old_iq["unknown_topics_count"] == 0

        # 2. Fixed behavior: passing full_topics (unfiltered batch mastery) captures strong & developing unclassified topics
        full_topics = compute_topic_mastery(attempts_strong + attempts_developing + attempts_maths,
                                            class_level=None, include_unattempted=False)
        iq = get_ingestion_quality_summary(full_topics)
        assert iq["has_unknown"] is True
        assert iq["unknown_topics_count"] == 2
        assert iq["unknown_attempts_count"] == 4
        assert iq["status"] == "warning"
        topic_names = {t["topic"] for t in iq["topics"]}
        assert "NonStandard Topic Alpha" in topic_names
        assert "NonStandard Topic Beta" in topic_names








