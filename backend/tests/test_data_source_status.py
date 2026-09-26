"""Atlas source-of-truth status endpoint tests."""
import os

import requests
from dotenv import dotenv_values


frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email: str, password: str) -> str:
    response = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert response.status_code == 200, response.text
    return response.json()["token"]


def test_admin_can_inspect_atlas_status_and_learning_queue():
    token = _login("admin@vidya.com", "admin123")
    response = requests.get(
        f"{API}/admin/data-source-status",
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["source"] == "MongoDB Atlas"
    assert payload["available"] is True
    assert "Atlas connected" in payload["message"]
    assert isinstance(payload["learning_queue"], list)
    assert "mongo_url" not in payload and "connection_string" not in payload
    for note in payload["learning_queue"]:
        assert {"id", "title", "owner_name", "created_at"}.issubset(note)


def test_teacher_cannot_access_data_source_diagnostics():
    token = _login("teacher@vidya.com", "teacher123")
    response = requests.get(
        f"{API}/admin/data-source-status",
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    assert response.status_code == 403