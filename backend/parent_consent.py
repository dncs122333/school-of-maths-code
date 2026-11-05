"""Parent consent: phone checks, the email link, and the permanent record of every consent.

A student can't use the app until a parent agrees (see the gate in auth.py). `consent_records` only ever
gets new entries: a correction or withdrawal is a new entry, so the history can be produced as it happened.
"""
import asyncio
import hashlib
import hmac
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException, Request

from config import JWT_SECRET
from db import db
from mailer import send_parent_consent, CONSENT_LINK_DAYS
import rate_limit

CONSENT_VERSION = "2026-11-05"  # change this whenever the wording, Terms or Privacy Policy change
CONSENT_WORDING = ("I am the parent or guardian of {student}. I have read the Terms and Privacy Policy, and I agree "
                   "that School of Maths can use {student}'s details to run their classes, tests and progress reports.")

_background_emails = set()  # asyncio keeps only weak references to tasks


def clean_phone(value: Optional[str], label: str) -> str:
    """A 10-digit Indian mobile number, whichever way it was typed (+91, leading 0, spaces, dashes)."""
    digits = re.sub(r"[\s()-]", "", value or "")
    digits = re.sub(r"^(\+?91|0)(?=\d{10}$)", "", digits)
    if not re.fullmatch(r"[6-9]\d{9}", digits):
        raise HTTPException(status_code=400, detail=f"Enter a valid 10-digit mobile number for {label}.")
    return digits


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def wording_for(student_name: str) -> str:
    return CONSENT_WORDING.format(student=student_name)


async def add_record(student: dict, event: str, request: Optional[Request] = None, method: Optional[str] = None,
                     actor: Optional[dict] = None) -> None:
    parent = student.get("parent") or {}
    await db.consent_records.insert_one({
        "id": str(uuid.uuid4()), "student_ref": str(student["_id"]), "event": event, "method": method,
        "at": datetime.now(timezone.utc).isoformat(),
        "student_name": student.get("name"), "student_email": student.get("email"),
        "parent_name": parent.get("name"), "parent_phone": parent.get("phone"), "parent_email": parent.get("email"),
        "wording": wording_for(student.get("name") or "the student"), "wording_version": CONSENT_VERSION,
        "ip": rate_limit.client_ip(request) if request else None,
        "user_agent": request.headers.get("user-agent") if request else None,
        "actor_id": actor.get("id") if actor else None, "actor_name": actor.get("name") if actor else None,
    })


async def send_consent_request(student: dict, request: Optional[Request] = None, actor: Optional[dict] = None) -> None:
    """Send (or resend) the link. A new link replaces any earlier one, so only the latest address can confirm."""
    student_id = str(student["_id"])
    await rate_limit.enforce(rate_limit.CONSENT_SEND, student_id,
                             "Too many emails sent to this parent. Please try again in an hour.")
    await rate_limit.record(rate_limit.CONSENT_SEND, student_id)
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.parent_consent_tokens.delete_many({"student_id": student_id})
    await db.parent_consent_tokens.insert_one({"token_hash": _hash(token), "student_id": student_id, "created_at": now,
                                               "expire_at": now + timedelta(days=CONSENT_LINK_DAYS)})
    await add_record(student, "requested", request, method="email_link", actor=actor)
    parent = student.get("parent") or {}
    task = asyncio.create_task(send_parent_consent(parent.get("email"), parent.get("name"), student.get("name"), token))
    _background_emails.add(task)
    task.add_done_callback(_background_emails.discard)


async def student_for_token(token: str) -> dict:
    link = await db.parent_consent_tokens.find_one({"token_hash": _hash(token), "expire_at": {"$gt": datetime.now(timezone.utc)}})
    student = await db.users.find_one({"_id": ObjectId(link["student_id"]), "role": "student"}) if link else None
    if not student:
        raise HTTPException(status_code=400, detail="This link has expired or was already used. Please ask for a new one.")
    return student


async def confirm_with_token(token: str, request: Request) -> dict:
    student = await student_for_token(token)
    # Deleted as it's read, so opening the link twice at the same moment records one consent
    if not await db.parent_consent_tokens.find_one_and_delete({"token_hash": _hash(token)}):
        raise HTTPException(status_code=400, detail="This link has expired or was already used. Please ask for a new one.")
    await mark_confirmed(student, "email_link", request)
    return student


async def mark_confirmed(student: dict, method: str, request: Optional[Request] = None, actor: Optional[dict] = None) -> None:
    await add_record(student, "confirmed", request, method=method, actor=actor)
    await db.users.update_one({"_id": student["_id"]}, {"$set": {
        "parent_consent_status": "confirmed", "parent_consent_at": datetime.now(timezone.utc).isoformat(),
        "parent_consent_method": method}})
    await db.parent_consent_tokens.delete_many({"student_id": str(student["_id"])})


async def anonymise_records(student_id: str) -> None:
    """When a student's data is erased, keep only proof that consent existed: dates, the wording version and a
    scrambled ID that can't be turned back into the student. No name, contact details, or network address."""
    ref = hmac.new(JWT_SECRET.encode("utf-8"), student_id.encode("utf-8"), hashlib.sha256).hexdigest()
    kept = [{"id": str(uuid.uuid4()), "student_ref": ref, "event": r.get("event"), "method": r.get("method"),
             "at": r.get("at"), "wording_version": r.get("wording_version"), "anonymised": True}
            async for r in db.consent_records.find({"student_ref": student_id})]
    if kept:
        await db.consent_records.insert_many(kept)
    await db.consent_records.delete_many({"student_ref": student_id})
    await db.parent_consent_tokens.delete_many({"student_id": student_id})
