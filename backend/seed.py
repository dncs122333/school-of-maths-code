"""Idempotent demo seed: teacher@vidya.com / student@vidya.com.

These accounts are required by backend/tests/test_resources.py, test_tests_bank.py,
test_questions.py and test_mastery.py (they log in as teacher/student) and give the
preview a ready demo login. Run: cd /app/backend && python seed.py
"""
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from db import db  # noqa: E402  (needs MONGO_URL/DB_NAME loaded first)
from auth import hash_password  # noqa: E402

USERS = [
    {"name": "Demo Teacher", "email": "teacher@vidya.com", "password": "teacher123", "role": "teacher"},
    {"name": "Demo Student", "email": "student@vidya.com", "password": "student123", "role": "student"},
]


async def main():
    for u in USERS:
        email = u["email"].lower()
        if await db.users.find_one({"email": email}):
            print(f"exists: {email}")
            continue
        await db.users.insert_one({
            "name": u["name"], "email": email,
            "password_hash": hash_password(u["password"]),
            "role": u["role"], "batch_ids": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        print(f"created: {email} ({u['role']})")


if __name__ == "__main__":
    asyncio.run(main())
