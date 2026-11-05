"""Auth: password hashing, JWT, current-user resolution."""
import asyncio
import os
import time
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException, Depends
from bson import ObjectId
from db import db
from config import JWT_SECRET, JWT_ALGORITHM

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# bcrypt takes about 0.2 s of CPU by design. Request handlers use these so that a burst of logins
# at the start of a class test doesn't stall every other request.
async def hash_password_async(password: str) -> str:
    return await asyncio.to_thread(hash_password, password)


async def verify_password_async(plain: str, hashed: str) -> bool:
    return await asyncio.to_thread(verify_password, plain, hashed)


TEACHER_PENDING_MESSAGE = "Your teacher account is waiting for admin approval. You can log in once it's approved."
TEACHER_REJECTED_MESSAGE = "Your teacher account request was not approved. Contact the admin."


def check_account_access(user: dict) -> None:
    """Shared login/token gate: blocked or disabled accounts, and teachers not yet approved by an admin
    (accounts from before approval existed have no teacher_status and count as approved)."""
    if user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Your account has been blocked. Please contact your teacher.")
    if user.get("is_disabled"):
        raise HTTPException(status_code=403, detail="Your account has been disabled. Please contact your teacher.")
    if user.get("role") == "teacher":
        if user.get("teacher_status") == "pending":
            raise HTTPException(status_code=403, detail=TEACHER_PENDING_MESSAGE)
        if user.get("teacher_status") == "rejected":
            raise HTTPException(status_code=403, detail=TEACHER_REJECTED_MESSAGE)


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {"sub": user_id, "email": email, "role": role, "iat": int(time.time()),
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _check_session_current(user: dict, payload: dict) -> None:
    """A password reset ends every session started before it."""
    changed_at = user.get("password_changed_at")
    if changed_at and payload.get("iat", 0) < changed_at:
        raise HTTPException(status_code=401, detail="Token expired")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        check_account_access(user)
        _check_session_current(user, payload)
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_claims(request: Request) -> dict:
    """Read signed identity claims without a database lookup for outage diagnostics."""
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {"id": payload["sub"], "email": payload["email"], "role": payload["role"]}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except (jwt.InvalidTokenError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token")


def require_role(*roles):
    async def checker(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Not allowed for your role")
        return user
    return checker


def require_claim_role(*roles):
    async def checker(user: dict = Depends(get_current_claims)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Not allowed for your role")
        return user
    return checker


async def user_from_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        check_account_access(user)
        _check_session_current(user, payload)
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

