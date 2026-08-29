"""Tests for /api/questions — question bank CSV import pipeline.

Covers: normalization (Class -> class_level, Option X -> correct_index),
difficulty defaulting to medium, answer-key sanity flagging (Q9-style
explanation/key mismatch -> pending_review), dedupe on re-import, and
role-based access control.
"""
import io
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


CSV_HEADER = ("ID,Class,Subject,Chapter,Topic,Question,Option A,Option B,Option C,Option D,"
              "Correct Option,Explanation,Difficulty")


class TestQuestionBank:
    state = {}

    @pytest.fixture(scope="class", autouse=True)
    def setup(self):
        teacher = _login("teacher@vidya.com", "teacher123")
        student = _login("student@vidya.com", "student123")
        th = {"Authorization": f"Bearer {teacher['token']}"}
        sh = {"Authorization": f"Bearer {student['token']}"}
        TestQuestionBank.state = {"th": th, "sh": sh, "tag": uuid.uuid4().hex[:10], "created": []}
        yield
        for qid in TestQuestionBank.state["created"]:
            requests.delete(f"{API}/questions/{qid}", headers=th, timeout=15)

    def _csv(self, rows):
        return CSV_HEADER + "\n" + "\n".join(rows) + "\n"

    def _import(self, csv_text, status="active"):
        files = {"file": ("q.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
        r = requests.post(f"{API}/questions/import", headers=self.state["th"],
                          files=files, data={"status": status}, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()

    def _created(self):
        s = self.state
        r = requests.get(f"{API}/questions?topic=Topic {s['tag']}", headers=s["th"], timeout=15)
        assert r.status_code == 200
        return r.json()

    def test_01_import_normalizes_and_flags_mismatch(self):
        tag = self.state["tag"]
        clean = (f'1,Class 9,Maths,Circles,"Topic {tag}","Clean q {tag}?","A","B","C","D",'
                 f'Option A,"plain explanation",easy')
        mismatch = (f'2,Class 9,Maths,Circles,"Topic {tag}","Mismatch q {tag}?","Two","Four","Six","Eight",'
                    f'Option A,"Correct option is Option B.",medium')
        res = self._import(self._csv([clean, mismatch]))
        assert res["imported"] == 2
        assert res["duplicates"] == 0
        assert res["flagged"] == 1
        assert res["errors"] == []

        items = self._created()
        by_q = {x["question"]: x for x in items}
        assert by_q[f"Clean q {tag}?"]["class_level"] == "9"
        assert by_q[f"Clean q {tag}?"]["difficulty"] == "easy"
        assert by_q[f"Clean q {tag}?"]["status"] == "active"
        assert by_q[f"Clean q {tag}?"]["correct_index"] == 0
        flagged = by_q[f"Mismatch q {tag}?"]
        assert flagged["status"] == "pending_review"
        assert "explanation_option_mismatch" in flagged.get("flags", [])
        self.state["created"].extend(x["id"] for x in items)

    def test_02_blank_difficulty_defaults_medium(self):
        tag = self.state["tag"]
        row = (f'3,Class 10,Maths,Circles,"Topic {tag}","NoDiff q {tag}?","A","B","C","D",'
               f'Option B,"explanation",')
        res = self._import(self._csv([row]))
        assert res["imported"] == 1
        items = self._created()
        item = next(x for x in items if x["question"] == f"NoDiff q {tag}?")
        assert item["difficulty"] == "medium"
        assert item["class_level"] == "10"
        assert item["correct_index"] == 1
        self.state["created"].extend(x["id"] for x in items)

    def test_03_dedupe_on_reimport(self):
        tag = self.state["tag"]
        row = (f'4,Class 9,Maths,Circles,"Topic {tag}","Dup q {tag}?","A","B","C","D",'
               f'Option C,"explanation","hard"')
        first = self._import(self._csv([row]))
        assert first["imported"] == 1 and first["duplicates"] == 0
        second = self._import(self._csv([row]))
        assert second["imported"] == 0 and second["duplicates"] == 1
        items = self._created()
        dups = [x for x in items if x["question"] == f"Dup q {tag}?"]
        assert len(dups) == 1
        self.state["created"].extend(x["id"] for x in items)

    def test_04_student_cannot_access_bank(self):
        sh = self.state["sh"]
        assert requests.get(f"{API}/questions", headers=sh, timeout=15).status_code == 403
        files = {"file": ("q.csv", io.BytesIO(b"x"), "text/csv")}
        r = requests.post(f"{API}/questions/import", headers=sh, files=files,
                          data={"status": "active"}, timeout=15)
        assert r.status_code == 403

    def test_05_invalid_correct_option_is_reported(self):
        tag = self.state["tag"]
        bad = f'5,Class 9,Maths,Circles,"Topic {tag}","BadKey q {tag}?","A","B","C","D",Option Z,"explanation","easy"'
        res = self._import(self._csv([bad]))
        assert res["imported"] == 0
        assert len(res["errors"]) == 1
        assert "invalid 'Correct Option'" in res["errors"][0]["problems"]
