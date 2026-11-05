"""Shared test setup.

Teacher sign-ups need admin approval, so a teacher registered through the API gets no token. The integration
tests create throwaway teachers that must work straight away: after such a sign-up this approves the account
in the database and returns a login response, so `r.json()["token"]` keeps working. Tests that check the
approval flow itself pass the header `X-Test-Keep-Pending: 1`.
"""
import os
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
    # Sign-ups need consent; tests that aren't about consent shouldn't each have to say so
    if method.upper() == "POST" and str(url).endswith("/auth/register") and "consent" not in body:
        body = kwargs["json"] = {**body, "consent": True}
    res = _original_request(self, method, url, *args, **kwargs)
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
