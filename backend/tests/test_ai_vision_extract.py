"""Tests for AI Vision Question Extraction (PDF & Image via Gemini Flash).

Covers:
1. Direct extraction logic with model fallbacks (gemini-2.5-flash, gemini-2.0-flash, gemini-1.5-flash).
2. Strict topic enforcement: ensures every extracted question's topic strictly belongs to
   the predefined CURRICULUM topics for the chosen class, subject, and chapter.
3. API endpoint POST /api/questions/ai-extract:
   - Role-based authorization (teachers/admins only, rejects students with 403).
   - Validation for allowed file extensions (.pdf, .png, .jpg, .jpeg, .webp).
   - Validation for required Gemini API key.
   - Validation of curriculum class/subject/chapter existence.
   - Extraction execution with mock.
4. Option A review and save workflow: saving reviewed questions via POST /api/questions/import-json
   and asserting they are in the bank under the strictly validated topic.
"""
import io
import json
import os
import sys
import uuid
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import requests
from dotenv import dotenv_values
from fastapi import UploadFile

from ai import extract_questions_from_media
from curriculum import CURRICULUM
from server import extract_questions_endpoint

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


class TestAIExtractionUnit:
    """Unit tests for extract_questions_from_media in ai.py."""

    @pytest.mark.anyio
    async def test_strict_topic_enforcement_and_fuzzy_mapping(self):
        allowed = ["Real Numbers and Their Decimals", "Fundamental Theorem of Arithmetic"]

        gemini_raw_json = json.dumps({
            "questions": [
                {
                    "question": "What is the HCF of 24 and 36?",
                    "options": ["6", "12", "18", "24"],
                    "correct_index": 1,
                    "explanation": "Factors of 24 and 36 give HCF 12",
                    "topic": "Fundamental Theorem",  # Close match, should be mapped
                    "difficulty": "easy",
                    "marks": 1
                },
                {
                    "question": "Which of the following is irrational?",
                    "options": ["sqrt(2)", "4", "0.25", "9/3"],
                    "correct_index": 0,
                    "explanation": "sqrt(2) cannot be written as p/q",
                    "topic": "Arbitrary Invented Topic",  # Non-matching, should fallback to allowed[0]
                    "difficulty": "medium",
                    "marks": 2
                }
            ]
        })

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": f"```json\n{gemini_raw_json}\n```"}
                        ]
                    }
                }
            ]
        }

        with patch("requests.post", return_value=mock_resp):
            questions = await extract_questions_from_media(
                file_bytes=b"fake-pdf-content",
                mime_type="application/pdf",
                api_key="fake-key",
                class_level="10",
                subject="Maths",
                chapter="Real Numbers",
                allowed_topics=allowed,
            )

        assert len(questions) == 2
        # First question topic matched via difflib
        assert questions[0]["topic"] == "Fundamental Theorem of Arithmetic"
        assert questions[0]["correct_index"] == 1
        assert questions[0]["options"] == ["6", "12", "18", "24"]

        # Second question topic coerced to allowed[0]
        assert questions[1]["topic"] == "Real Numbers and Their Decimals"
        assert questions[1]["correct_index"] == 0

    @pytest.mark.anyio
    async def test_model_fallback_on_404_or_error(self):
        allowed = ["Introduction to Trigonometry"]

        # First call fails (e.g. 404 for model name), second succeeds with gemini-2.0-flash
        fail_resp = MagicMock()
        fail_resp.status_code = 404
        fail_resp.text = "Model not found"

        success_resp = MagicMock()
        success_resp.status_code = 200
        success_resp.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": json.dumps({
                                    "questions": [
                                        {
                                            "question": "What is sin(90)?",
                                            "options": ["0", "1", "1/2", "undefined"],
                                            "correct_index": 1,
                                            "explanation": "sin(90) = 1",
                                            "topic": "Introduction to Trigonometry",
                                            "difficulty": "easy",
                                            "marks": 1
                                        }
                                    ]
                                })
                            }
                        ]
                    }
                }
            ]
        }

        with patch("requests.post", side_effect=[fail_resp, success_resp]) as mock_post:
            questions = await extract_questions_from_media(
                file_bytes=b"fake-img-content",
                mime_type="image/png",
                api_key="test-api-key",
                class_level="10",
                subject="Maths",
                chapter="Trigonometry",
                allowed_topics=allowed,
            )

        assert mock_post.call_count == 2
        assert len(questions) == 1
        assert questions[0]["topic"] == "Introduction to Trigonometry"
        assert questions[0]["correct_index"] == 1

    @pytest.mark.anyio
    async def test_empty_api_key_raises_error(self):
        with pytest.raises(ValueError, match="Gemini API key is required"):
            await extract_questions_from_media(
                file_bytes=b"fake",
                mime_type="image/png",
                api_key="   ",
                class_level="10",
                subject="Maths",
                chapter="Real Numbers",
                allowed_topics=["Real Numbers"],
            )


class TestAIExtractionAPI:
    """API endpoint tests for POST /api/questions/ai-extract."""

    state = {}

    @classmethod
    def setup_class(cls):
        teacher = _login("teacher@vidya.com", "teacher123")
        student = _login("student@vidya.com", "student123")
        cls.state = {
            "th": {"Authorization": f"Bearer {teacher['token']}"},
            "sh": {"Authorization": f"Bearer {student['token']}"},
            "teacher_user": teacher.get("user", {"id": "teacher-id", "role": "teacher"}),
            "created_ids": [],
            "tag": uuid.uuid4().hex[:8],
        }

    @classmethod
    def teardown_class(cls):
        th = cls.state.get("th")
        for qid in cls.state.get("created_ids", []):
            try:
                requests.delete(f"{API}/questions/{qid}", headers=th, timeout=10)
            except Exception:
                pass

    def test_01_requires_authentication_and_teacher_role(self):
        # No auth
        r = requests.post(f"{API}/questions/ai-extract", data={"api_key": "abc"})
        assert r.status_code in (401, 403)

        # Student auth
        r = requests.post(f"{API}/questions/ai-extract", headers=self.state["sh"], data={"api_key": "abc"})
        assert r.status_code == 403

    def test_02_validates_missing_api_key(self):
        files = {"file": ("paper.pdf", io.BytesIO(b"%PDF-1.4 test header content " * 10), "application/pdf")}
        r = requests.post(
            f"{API}/questions/ai-extract",
            headers=self.state["th"],
            files=files,
            data={"api_key": "", "class_level": "10", "subject": "Maths", "chapter": "Real Numbers"},
        )
        assert r.status_code == 400
        assert "Gemini API key is required" in r.text

    def test_03_validates_invalid_file_extension(self):
        files = {"file": ("test.exe", io.BytesIO(b"MZ executable fake content " * 10), "application/octet-stream")}
        r = requests.post(
            f"{API}/questions/ai-extract",
            headers=self.state["th"],
            files=files,
            data={"api_key": "test-key", "class_level": "10", "subject": "Maths", "chapter": "Real Numbers"},
        )
        assert r.status_code == 400
        assert "Supported file formats" in r.text

    def test_04_validates_curriculum_chapter_exists(self):
        files = {"file": ("paper.png", io.BytesIO(b"\x89PNG\r\n\x1a\nfake-image-content-longer-bytes" * 5), "image/png")}
        r = requests.post(
            f"{API}/questions/ai-extract",
            headers=self.state["th"],
            files=files,
            data={"api_key": "test-key", "class_level": "10", "subject": "Maths", "chapter": "Nonexistent Quantum Physics"},
        )
        assert r.status_code == 400
        assert "not found in curriculum" in r.text

    @pytest.mark.anyio
    async def test_05_mocked_end_to_end_extraction_and_import(self):
        """Simulate extracting questions from a question paper and saving via Option A."""
        tag = self.state["tag"]
        allowed = CURRICULUM["10"]["Maths"]["Real Numbers"]
        canonical_topic = allowed[0]

        mock_extracted = [
            {
                "question": f"Which of the following numbers is prime? ({tag})",
                "options": ["4", "6", "7", "9"],
                "correct_index": 2,
                "explanation": "7 has only two factors: 1 and 7.",
                "topic": canonical_topic,
                "topics": [canonical_topic],
                "class_level": "10",
                "subject": "Maths",
                "chapter": "Real Numbers",
                "difficulty": "easy",
                "marks": 1.0,
                "question_type": "single_choice"
            }
        ]

        dummy_pdf = io.BytesIO(b"%PDF-1.4 mock content for testing extraction pipeline " * 10)
        upload_file = UploadFile(filename="exam.pdf", file=dummy_pdf)

        with patch("server.extract_questions_from_media", return_value=mock_extracted):
            endpoint_res = await extract_questions_endpoint(
                file=upload_file,
                api_key="AIzaSyFakeKeyForTesting",
                gemini_api_key=None,
                class_level="10",
                subject="Maths",
                chapter="Real Numbers",
                model="gemini-2.5-flash",
                user=self.state["teacher_user"],
            )

            assert endpoint_res["count"] == 1
            assert endpoint_res["class_level"] == "10"
            assert endpoint_res["subject"] == "Maths"
            assert endpoint_res["chapter"] == "Real Numbers"
            assert endpoint_res["allowed_topics"] == allowed
            assert endpoint_res["questions"][0]["topic"] == canonical_topic

        # Option A: Now teacher reviews and saves the questions into the bank via POST /api/questions/import-json
        import_payload = {
            "class_level": "10",
            "subject": "Maths",
            "chapter": "Real Numbers",
            "topics": allowed,
            "questions": endpoint_res["questions"]
        }
        imp_res = requests.post(
            f"{API}/questions/import-json",
            headers=self.state["th"],
            json=import_payload
        )
        assert imp_res.status_code == 200, imp_res.text
        data = imp_res.json()
        assert data["imported"] == 1

        # Check question exists in bank with topic strictly from allowed list
        q_res = requests.get(
            f"{API}/questions",
            headers=self.state["th"],
            params={"class_level": "10", "subject": "Maths", "chapter": "Real Numbers", "topic": canonical_topic}
        )
        assert q_res.status_code == 200
        bank_questions = q_res.json()
        matching = [q for q in bank_questions if tag in q.get("question", "")]
        assert len(matching) == 1
        assert matching[0]["topic"] == canonical_topic
        self.state["created_ids"].append(matching[0]["id"])
