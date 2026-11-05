"""Shared test setup.

Teacher sign-ups need admin approval, so a teacher registered through the API gets no token. The integration
tests create throwaway teachers that must work straight away: after such a sign-up this approves the account
in the database and returns a login response, so `r.json()["token"]` keeps working. Tests that check the
approval flow itself pass the header `X-Test-Keep-Pending: 1`.
"""
import os
import uuid
from pathlib import Path

import certifi
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
_original_request = requests.Session.request
_db = None


def _users():
    global _db
    if _db is None:
        _db = MongoClient(os.environ["MONGO_URL"], tlsCAFile=certifi.where())[os.environ["DB_NAME"]]
    return _db.users


def _approving_request(self, method, url, *args, **kwargs):
    headers = kwargs.get("headers") or {}
    body = kwargs.get("json") or {}
    is_sign_up = method.upper() == "POST" and str(url).endswith("/auth/register")
    if is_sign_up:
        # Sign-up fields tests aren't about, so each test needn't supply them
        defaults = {"consent": True, "phone": "9876543210"}
        if body.get("role", "student") == "student":
            defaults.update(parent_name="Test Parent", parent_phone="9876501234",
                            parent_email=f"parent_{uuid.uuid4().hex[:10]}@example.com")
        body = kwargs["json"] = {**defaults, **body}
    res = _original_request(self, method, url, *args, **kwargs)
    # Throwaway students need to work straight away; tests of consent itself keep them waiting with this header
    if (is_sign_up and body.get("role", "student") == "student" and res.status_code == 200
            and headers.get("X-Test-Keep-Consent-Pending") != "1"):
        _users().update_one({"email": body["email"].lower()}, {"$set": {"parent_consent_status": "confirmed"}})
    if (method.upper() == "POST" and str(url).endswith("/auth/register") and body.get("role") == "teacher"
            and res.status_code == 200 and res.json().get("pending_approval")
            and headers.get("X-Test-Keep-Pending") != "1"):
        _users().update_one({"email": body["email"].lower(), "role": "teacher"},
                            {"$set": {"teacher_status": "approved"}})
        login_url = str(url)[: -len("/auth/register")] + "/auth/login"
        res = _original_request(self, "POST", login_url,
                                json={"email": body["email"], "password": body["password"]}, timeout=30)
    return res


# Patched at import (before test modules load), since some tests register users at class setup
requests.Session.request = _approving_request
