"""The question bank is shared: only the teacher who added a question (or admin) can change or delete it."""
import io
import os
import uuid

import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("frontend/.env") if os.path.exists("frontend/.env") else {}
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/") or "http://localhost:8001"
API = f"{BASE_URL}/api"

CSV_HEADER = ("ID,Class,Subject,Chapter,Topic,Question,Option A,Option B,Option C,Option D,"
              "Correct Option,Explanation,Difficulty")


def _teacher(name):
    r = requests.post(f"{API}/auth/register", json={"name": name, "email": f"test_teacher_{uuid.uuid4().hex[:8]}@example.com",
                                                   "password": "password123", "role": "teacher"}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_only_owner_can_change_or_delete_a_bank_question():
    owner, other = _teacher("Owner"), _teacher("Other")
    tag = uuid.uuid4().hex[:10]
    csv_text = CSV_HEADER + f'\n1,Class 9,Maths,"Chapter {tag}","Topic {tag}","Q {tag}?","A","B","C","D",Option B,"e","medium"\n'
    r = requests.post(f"{API}/questions/import", headers=owner, timeout=30, data={"status": "pending_review"},
                      files={"file": ("q.csv", io.BytesIO(csv_text.encode()), "text/csv")})
    assert r.status_code == 200 and r.json()["imported"] == 1, r.text
    qid = requests.get(f"{API}/questions", params={"chapter": f"Chapter {tag}"}, headers=owner, timeout=15).json()[0]["id"]

    # Another teacher can't see it in their review queue, approve it, change its answer or delete it
    assert all(q["id"] != qid for q in requests.get(f"{API}/questions", params={"status": "pending_review"},
                                                     headers=other, timeout=15).json())
    assert requests.put(f"{API}/questions/{qid}/review", json={"status": "active", "correct_index": 0},
                        headers=other, timeout=15).status_code == 403
    assert requests.delete(f"{API}/questions/{qid}", headers=other, timeout=15).status_code == 403

    # The owner can
    assert requests.put(f"{API}/questions/{qid}/review", json={"status": "active"}, headers=owner, timeout=15).status_code == 200
    assert requests.delete(f"{API}/questions/{qid}", headers=owner, timeout=15).status_code == 200
