"""Tests for /api/questions/import-json — JSON question bank import pipeline and hierarchy."""
import io
import os
import uuid
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


class TestQuestionJsonImport:
    state = {}

    @classmethod
    def setup_class(cls):
        teacher = _login("teacher@vidya.com", "teacher123")
        student = _login("student@vidya.com", "student123")
        cls.state = {
            "th": {"Authorization": f"Bearer {teacher['token']}"},
            "sh": {"Authorization": f"Bearer {student['token']}"},
            "tag": uuid.uuid4().hex[:8],
            "created_ids": []
        }

    @classmethod
    def teardown_class(cls):
        th = cls.state.get("th")
        for qid in cls.state.get("created_ids", []):
            try:
                requests.delete(f"{API}/questions/{qid}", headers=th, timeout=10)
            except Exception:
                pass

    def test_01_batch_json_import_with_metadata(self):
        tag = self.state["tag"]
        payload = {
            "class_level": "10",
            "subject": f"Maths_{tag}",
            "chapter": f"Quadratic_{tag}",
            "topics": ["Nature of Roots", "Discriminant"],
            "questions": [
                {
                    "question": f"What is the discriminant of 2x^2 - 4x + 3 = 0? ({tag})",
                    "options": ["-8", "8", "-4", "4"],
                    "correct_answer": "-8",
                    "explanation": "D = b^2 - 4ac = 16 - 24 = -8.",
                    "topics": ["Discriminant"],
                    "difficulty": "medium",
                    "marks": 4,
                    "negative_marks": 1,
                    "hint": "Use D = b^2 - 4ac",
                    "tags": ["NCERT", "CBSE"]
                },
                {
                    "question": f"If D > 0 and a perfect square, roots are? ({tag})",
                    "options": ["Real, unequal, rational", "Real and equal", "Imaginary", "Irrational"],
                    "correct_answer": "A",
                    "explanation": "Roots are rational when D is a perfect square.",
                    "topics": ["Nature of Roots"],
                    "difficulty": "easy",
                    "marks": 2,
                    "tags": ["Formula"]
                }
            ]
        }
        r = requests.post(f"{API}/questions/import-json", headers=self.state["th"], json=payload, timeout=20)
        assert r.status_code == 200, r.text
        res = r.json()
        assert res["imported"] == 2
        assert res["duplicates"] == 0
        assert res["errors"] == []

        # Verify items saved in DB with enriched metadata
        fetch_r = requests.get(f"{API}/questions?chapter=Quadratic_{tag}", headers=self.state["th"], timeout=15)
        assert fetch_r.status_code == 200
        items = fetch_r.json()
        assert len(items) == 2
        for it in items:
            self.state["created_ids"].append(it["id"])
            assert it["class_level"] == "10"
            assert it["subject"] == f"Maths_{tag}"
            assert it["chapter"] == f"Quadratic_{tag}"

        q1 = next(x for x in items if "discriminant" in x["question"].lower())
        assert q1["correct_index"] == 0
        assert q1["marks"] == 4.0
        assert q1["negative_marks"] == 1.0
        assert q1["hint"] == "Use D = b^2 - 4ac"
        assert "Discriminant" in q1["topics"]

        q2 = next(x for x in items if "perfect square" in x["question"].lower())
        assert q2["correct_index"] == 0
        assert q2["difficulty"] == "easy"
        assert "Nature of Roots" in q2["topics"]

    def test_02_json_file_upload(self):
        tag = self.state["tag"]
        json_content = f'''{{
            "class_level": "9",
            "subject": "Physics_{tag}",
            "chapter": "Motion_{tag}",
            "questions": [
                {{
                    "question": "What is the SI unit of acceleration? ({tag})",
                    "options": ["m/s", "m/s^2", "km/h", "m"],
                    "correct_answer": 1,
                    "explanation": "Acceleration is rate of change of velocity, unit is m/s^2.",
                    "topics": ["Acceleration", "Units"],
                    "difficulty": "easy"
                }}
            ]
        }}'''
        files = {"file": ("questions.json", io.BytesIO(json_content.encode("utf-8")), "application/json")}
        r = requests.post(f"{API}/questions/import", headers=self.state["th"], files=files, timeout=20)
        assert r.status_code == 200, r.text
        res = r.json()
        assert res["imported"] == 1
        assert res["duplicates"] == 0

        # Query and track id for cleanup
        fetch_r = requests.get(f"{API}/questions?chapter=Motion_{tag}", headers=self.state["th"], timeout=15)
        assert fetch_r.status_code == 200
        items = fetch_r.json()
        assert len(items) == 1
        self.state["created_ids"].append(items[0]["id"])
        assert items[0]["correct_index"] == 1
        assert "Acceleration" in items[0]["topics"]

    def test_03_dedup_and_error_validation(self):
        tag = self.state["tag"]
        # Re-importing same question from test_02 should report duplicate
        payload = {
            "class_level": "9",
            "subject": f"Physics_{tag}",
            "chapter": f"Motion_{tag}",
            "questions": [
                {
                    "question": f"What is the SI unit of acceleration? ({tag})",
                    "options": ["m/s", "m/s^2", "km/h", "m"],
                    "correct_answer": "m/s^2"
                },
                {
                    "question": "", # Missing question
                    "options": ["A", "B"],
                    "correct_answer": 0
                },
                {
                    "question": f"Invalid options count ({tag})",
                    "options": ["Only One Option"],
                    "correct_answer": 0
                }
            ]
        }
        r = requests.post(f"{API}/questions/import-json", headers=self.state["th"], json=payload, timeout=20)
        assert r.status_code == 200, r.text
        res = r.json()
        assert res["duplicates"] == 1
        assert len(res["errors"]) == 2

    def test_04_questions_hierarchy_endpoint(self):
        tag = self.state["tag"]
        r = requests.get(f"{API}/questions/hierarchy", headers=self.state["th"], timeout=15)
        assert r.status_code == 200, r.text
        hierarchy = r.json()
        assert "10" in hierarchy
        assert f"Maths_{tag}" in hierarchy["10"]
        chap_info = next(c for c in hierarchy["10"][f"Maths_{tag}"] if c["chapter"] == f"Quadratic_{tag}")
        assert chap_info["count"] >= 2
        assert "Discriminant" in chap_info["topics"]

    def test_05_curriculum_taxonomy_endpoint(self):
        r = requests.get(f"{API}/curriculum", headers=self.state["th"], timeout=15)
        assert r.status_code == 200, r.text
        curriculum = r.json()
        assert "9" in curriculum and "10" in curriculum
        assert "Maths" in curriculum["9"] and "Science" in curriculum["9"]
        assert "Maths" in curriculum["10"] and "Science" in curriculum["10"]

        # Verify Class 9 Maths chapters & topics
        c9_maths = curriculum["9"]["Maths"]
        assert "Number Systems" in c9_maths
        assert "Polynomials" in c9_maths
        assert any("natural numbers" in t.lower() for t in c9_maths["Number Systems"])

        # Verify Class 10 Science chapters & topics
        c10_sci = curriculum["10"]["Science"]
        assert "Chemical Reactions and Equations" in c10_sci
        assert any("balancing chemical equations" in t.lower() for t in c10_sci["Chemical Reactions and Equations"])

    def test_06_curriculum_prompt_generator(self):
        params = {
            "class_level": "10",
            "subject": "Maths",
            "chapter": "Quadratic Equations"
        }
        r = requests.get(f"{API}/curriculum/prompt", headers=self.state["th"], params=params, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["class_level"] == "10"
        assert data["subject"] == "Maths"
        assert data["chapter"] == "Quadratic Equations"
        assert len(data["topics"]) > 0
        assert "Standard form of a quadratic equation" in data["prompt"]
        assert "APPROVED TOPICS FOR QUADRATIC EQUATIONS" in data["prompt"]

    def test_07_canonical_topic_normalization(self):
        tag = self.state["tag"]
        # Topic with lowercase casing should normalize to canonical NCERT title
        payload = {
            "class_level": "9",
            "subject": "Science",
            "chapter": "Matter in Our Surroundings",
            "questions": [
                {
                    "question": f"At 100 degrees Celsius, water boils. ({tag})",
                    "options": ["Solid", "Liquid", "Gas", "Plasma"],
                    "correct_answer": "Gas",
                    "explanation": "Boiling point of water is 100 C.",
                    "topics": ["states of matter: solid, liquid, gas (properties and differences)"],
                    "difficulty": "easy",
                    "hint": "Think of steam"
                }
            ]
        }
        r = requests.post(f"{API}/questions/import-json", headers=self.state["th"], json=payload, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["imported"] == 1

        fetch_r = requests.get(f"{API}/questions?chapter=Matter in Our Surroundings", headers=self.state["th"], timeout=15)
        assert fetch_r.status_code == 200
        items = fetch_r.json()
        q = next(x for x in items if tag in x["question"])
        self.state["created_ids"].append(q["id"])
        # Should be normalized to canonical string
        assert "States of matter: solid, liquid, gas (properties and differences)" in q["topics"]
        assert q["hint"] == "Think of steam"

    def test_08_chapterwise_test_with_topic_filtering_and_topic_summary(self):
        tag = self.state["tag"]
        # Create test with topic filter
        r = requests.post(f"{API}/tests", headers=self.state["th"], json={
            "title": f"Chapterwise Test {tag}",
            "kind": "dpp",
            "class_level": "10",
            "subject": f"Maths_{tag}",
            "chapter": f"Quadratic_{tag}",
            "topic": "Discriminant",
            "question_count": 1,
            "duration_minutes": 10,
            "valid_hours": 24
        }, timeout=25)
        assert r.status_code == 200, r.text
        test_id = r.json()["id"]

        # Wait until ready
        import time
        ready = False
        for _ in range(20):
            t_data = requests.get(f"{API}/tests/{test_id}", headers=self.state["th"], timeout=10).json()
            if t_data.get("status") == "ready":
                ready = True
                break
            time.sleep(0.3)
        assert ready, "Test failed to become ready"

        # Student takes test
        st_view = requests.get(f"{API}/tests/{test_id}", headers=self.state["sh"], timeout=10).json()
        assert len(st_view["questions"]) == 1
        q_view = st_view["questions"][0]
        assert "correct_index" not in q_view
        assert "explanation" not in q_view
        assert q_view.get("hint") == "Use D = b^2 - 4ac"

        # Submit answer (find index of "-8")
        chosen_idx = q_view["options"].index("-8")
        sub_r = requests.post(f"{API}/tests/{test_id}/submit", headers=self.state["sh"], json={
            "answers": [chosen_idx]
        }, timeout=15)
        assert sub_r.status_code == 200, sub_r.text
        sub_res = sub_r.json()
        assert sub_res["score"] == 100
        assert "topic_summary" in sub_res
        assert len(sub_res["topic_summary"]) > 0
        disc_summary = next(s for s in sub_res["topic_summary"] if s["topic"] == "Discriminant")
        assert disc_summary["correct"] == 1
        assert disc_summary["total"] == 1

    def test_09_manual_question_selection_and_timed_dpp(self):
        tag = self.state["tag"]
        # Use created_ids from test_01
        created_ids = self.state["created_ids"][:2]
        assert len(created_ids) >= 1

        # Teacher creates DPP by explicitly supplying question_ids and 15 mins duration
        r = requests.post(f"{API}/tests", headers=self.state["th"], json={
            "title": f"Manual DPP Test {tag}",
            "kind": "dpp",
            "class_level": "10",
            "subject": f"Maths_{tag}",
            "chapter": f"Quadratic_{tag}",
            "question_ids": created_ids,
            "duration_minutes": 15,
            "valid_hours": 48
        }, timeout=25)
        assert r.status_code == 200, r.text
        test_id = r.json()["id"]

        import time
        ready = False
        for _ in range(20):
            t_data = requests.get(f"{API}/tests/{test_id}", headers=self.state["th"], timeout=10).json()
            if t_data.get("status") == "ready":
                ready = True
                break
            time.sleep(0.3)
        assert ready, "Manual test failed to become ready"

        # Verify teacher view has exact questions snapshot
        t_view = requests.get(f"{API}/tests/{test_id}", headers=self.state["th"], timeout=10).json()
        assert t_view["question_count"] == len(created_ids)
        assert t_view["duration_minutes"] == 15
        assert len(t_view["questions"]) == len(created_ids)

        # Verify student view returns duration_minutes=15 so timer can run
        st_view = requests.get(f"{API}/tests/{test_id}", headers=self.state["sh"], timeout=10).json()
        assert st_view["duration_minutes"] == 15
        assert len(st_view["questions"]) == len(created_ids)

    def test_10_multi_chapter_test_creation(self):
        tag = self.state["tag"]
        # Seed two questions in two different chapters
        payload1 = {
            "class_level": "10",
            "subject": f"Science_{tag}",
            "chapter": f"ChapterA_{tag}",
            "questions": [{
                "question": f"Question from Chapter A ({tag})",
                "options": ["A1", "A2", "A3", "A4"],
                "correct_answer": 0,
                "difficulty": "easy"
            }]
        }
        payload2 = {
            "class_level": "10",
            "subject": f"Science_{tag}",
            "chapter": f"ChapterB_{tag}",
            "questions": [{
                "question": f"Question from Chapter B ({tag})",
                "options": ["B1", "B2", "B3", "B4"],
                "correct_answer": 1,
                "difficulty": "medium"
            }]
        }
        r1 = requests.post(f"{API}/questions/import-json", headers=self.state["th"], json=payload1, timeout=15)
        r2 = requests.post(f"{API}/questions/import-json", headers=self.state["th"], json=payload2, timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200

        # Create multi-chapter test covering both chapters
        test_r = requests.post(f"{API}/tests", headers=self.state["th"], json={
            "title": f"Combined Unit Test {tag}",
            "kind": "test",
            "class_level": "10",
            "subject": f"Science_{tag}",
            "chapters": [f"ChapterA_{tag}", f"ChapterB_{tag}"],
            "question_count": 2,
            "duration_minutes": 30,
            "valid_hours": 24,
            "batch_id": "all"
        }, timeout=20)
        assert test_r.status_code == 200, test_r.text
        test_id = test_r.json()["id"]

        import time
        ready = False
        for _ in range(20):
            t_data = requests.get(f"{API}/tests/{test_id}", headers=self.state["th"], timeout=10).json()
            if t_data.get("status") == "ready":
                ready = True
                break
            time.sleep(0.3)
        assert ready, "Multi-chapter test failed to become ready"

        t_view = requests.get(f"{API}/tests/{test_id}", headers=self.state["th"], timeout=10).json()
        assert t_view["question_count"] == 2
        assert len(t_view["chapters"]) == 2
        assert f"ChapterA_{tag}" in t_view["chapter"] and f"ChapterB_{tag}" in t_view["chapter"]
        # Both chapters represented in questions
        chap_names = {q["chapter"] for q in t_view["questions"]}
        assert f"ChapterA_{tag}" in chap_names
        assert f"ChapterB_{tag}" in chap_names



