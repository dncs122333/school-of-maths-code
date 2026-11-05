"""VidyaLab API entrypoint (FastAPI). Routes + startup; core logic lives in modules."""
import os
import uuid
import json
import io
import mimetypes
import secrets
import asyncio
import csv
import hashlib
import random
import re
import time
import copy
import math
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any, Union
from decimal import Decimal, ROUND_HALF_UP

from bson import ObjectId
from pymongo.errors import DuplicateKeyError, PyMongoError
from pydantic import BaseModel

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, Query, Request
from fastapi.responses import Response, JSONResponse
from urllib.parse import quote
from starlette.middleware.cors import CORSMiddleware

from config import (logger, DIFFICULTIES, _VALID_STATUSES, ROOT_DIR, APP_NAME, ENABLE_WATERMARKING, APP_TIMEZONE,
                    IS_PRODUCTION, SENTRY_DSN)
from db import (db, client, api_router, ATLAS_UNAVAILABLE_MESSAGE, atlas_connection_status,
                mark_atlas_unavailable)
from models import (RegisterInput, LoginInput, ForgotPasswordInput, ResetPasswordInput, BatchInput, BatchUpdateInput,
                    JoinInput, StudentStatusInput, GenerateTestInput,
                    SubmitInput, DataSourceStatusResponse, QuestionInput, QuestionBatchImportInput)
from auth import (hash_password, verify_password, hash_password_async, verify_password_async, create_access_token,
                  get_current_user, require_role, require_claim_role, check_account_access, TEACHER_PENDING_MESSAGE)
from mailer import send_password_reset, RESET_LINK_MINUTES
import rate_limit
from ai import extract_questions_from_media
from storage import init_storage, put_object, get_object
from lib.mastery import (compute_topic_mastery, round_half_up, band, is_confirmed_weak,
                         is_confirmed_strong, get_ingestion_quality_summary, _extract_syllabus_topics,
                         compute_unattempted_summary, is_answered, apply_batch_confirmation,
                         summarize_submission_topics, source_weight, PRACTICE_SOURCE_WEIGHTS)
from watermark import apply_watermark, watermarked_media_type, WATERMARKABLE_EXTS
from curriculum import (CURRICULUM, get_canonical_topics, generate_gemini_prompt,
                        normalize_taxonomy, normalize_key, canonicalize_topic_title, infer_subject_and_chapter,
                        normalize_class_level)
from reports.router import router as reports_router

if SENTRY_DSN:
    import sentry_sdk
    # No request bodies or personal data: this app holds passwords and details of minors
    sentry_sdk.init(dsn=SENTRY_DSN, environment="production" if IS_PRODUCTION else "development",
                    send_default_pii=False, max_request_body_size="never", traces_sample_rate=0)

# The interactive API docs list every route, so they stay off in production
app = FastAPI(docs_url=None if IS_PRODUCTION else "/docs", redoc_url=None if IS_PRODUCTION else "/redoc",
              openapi_url=None if IS_PRODUCTION else "/openapi.json")
api_router.include_router(reports_router)

_DATA_SOURCE_STATUS_PATH = "/api/admin/data-source-status"
_HEALTH_PATH = "/api/health"


@app.middleware("http")
async def atlas_only_guard(request: Request, call_next):
    """Stop all database-backed API flows when Atlas cannot be reached."""
    if request.url.path.startswith("/api") and request.url.path not in (_DATA_SOURCE_STATUS_PATH, _HEALTH_PATH):
        status = await atlas_connection_status()
        if not status["available"]:
            return JSONResponse(
                status_code=503,
                content={"detail": ATLAS_UNAVAILABLE_MESSAGE},
                headers={"Retry-After": "5"},
            )
    return await call_next(request)


@app.exception_handler(PyMongoError)
async def atlas_database_exception_handler(_: Request, __: PyMongoError):
    mark_atlas_unavailable()
    return JSONResponse(
        status_code=503,
        content={"detail": ATLAS_UNAVAILABLE_MESSAGE},
        headers={"Retry-After": "5"},
    )


@api_router.get("/health")
async def health():
    """For uptime monitors and deploy checks. Needs no login and reveals nothing but up or down."""
    status = await atlas_connection_status()
    return JSONResponse(status_code=200 if status["available"] else 503,
                        content={"status": "ok" if status["available"] else "degraded",
                                 "database": "up" if status["available"] else "down"})


# ------------------------- Auth routes -------------------------
@api_router.post("/auth/register")
async def register(body: RegisterInput, request: Request):
    email = body.email.lower()
    ip = rate_limit.client_ip(request)
    await rate_limit.enforce(rate_limit.REGISTER_IP, ip, "Too many sign-ups from this network. Please try again in an hour.")
    if body.role not in ("student", "teacher"):
        raise HTTPException(status_code=400, detail="Invalid role")
    if not body.consent:
        raise HTTPException(status_code=400, detail="Please agree to the Terms and Privacy Policy to create an account.")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    await rate_limit.record(rate_limit.REGISTER_IP, ip)
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {"name": body.name, "email": email, "password_hash": await hash_password_async(body.password),
           "role": body.role, "batch_ids": [], "created_at": now_iso, "consent_at": now_iso}
    if body.role == "teacher":
        # Teacher accounts get the question bank and student data: an admin approves them first
        doc["teacher_status"] = "pending"
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    if body.role == "teacher":
        return {"pending_approval": True, "message": TEACHER_PENDING_MESSAGE}
    token = create_access_token(uid, email, body.role)
    return {"token": token, "user": {"id": uid, "name": body.name, "email": email, "role": body.role, "batch_ids": []}}


@api_router.post("/auth/login")
async def login(body: LoginInput, request: Request):
    email = body.email.lower()
    ip = rate_limit.client_ip(request)
    await rate_limit.enforce(rate_limit.LOGIN_EMAIL, email, "Too many wrong passwords. Please wait 15 minutes, or reset your password.")
    await rate_limit.enforce(rate_limit.LOGIN_IP, ip)
    user = await db.users.find_one({"email": email})
    if not user or not await verify_password_async(body.password, user["password_hash"]):
        await rate_limit.record(rate_limit.LOGIN_EMAIL, email)
        await rate_limit.record(rate_limit.LOGIN_IP, ip)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await rate_limit.clear(rate_limit.LOGIN_EMAIL, email)
    check_account_access(user)
    uid = str(user["_id"])
    token = create_access_token(uid, email, user["role"])
    return {"token": token, "user": {"id": uid, "name": user["name"], "email": email,
                                     "role": user["role"], "batch_ids": user.get("batch_ids", []),
                                     "is_disabled": bool(user.get("is_disabled", False)),
                                     "is_blocked": bool(user.get("is_blocked", False))}}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


_background_emails = set()  # asyncio keeps only weak references to tasks


def _reset_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@api_router.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordInput, request: Request):
    """Same reply whether or not the account exists, and the email goes out after the reply,
    so this can't be used to find out who has an account."""
    email = body.email.lower()
    ip = rate_limit.client_ip(request)
    await rate_limit.enforce(rate_limit.FORGOT_IP, ip)
    await rate_limit.record(rate_limit.FORGOT_IP, ip)
    user = await db.users.find_one({"email": email}, {"name": 1})
    if user and not await rate_limit.is_over_limit(rate_limit.FORGOT_EMAIL, email):
        await rate_limit.record(rate_limit.FORGOT_EMAIL, email)
        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        # Only the hash is stored: a leaked database or backup can't be used to take over accounts
        await db.password_resets.delete_many({"user_id": str(user["_id"])})
        await db.password_resets.insert_one({"token_hash": _reset_token_hash(token), "user_id": str(user["_id"]),
                                             "created_at": now, "expire_at": now + timedelta(minutes=RESET_LINK_MINUTES)})
        task = asyncio.create_task(send_password_reset(email, user.get("name"), token))
        _background_emails.add(task)
        task.add_done_callback(_background_emails.discard)
    return {"message": "If that email has an account, we've sent a link to reset the password. Check your spam folder too."}


@api_router.post("/auth/reset-password")
async def reset_password(body: ResetPasswordInput, request: Request):
    ip = rate_limit.client_ip(request)
    await rate_limit.enforce(rate_limit.RESET_IP, ip)
    # Deleted as it's read, so a link works once even if opened twice at the same moment
    reset = await db.password_resets.find_one_and_delete({"token_hash": _reset_token_hash(body.token),
                                                          "expire_at": {"$gt": datetime.now(timezone.utc)}})
    if not reset or not ObjectId.is_valid(reset["user_id"]):
        await rate_limit.record(rate_limit.RESET_IP, ip)
        raise HTTPException(status_code=400, detail="This reset link has expired or was already used. Please ask for a new one.")
    new_hash = await hash_password_async(body.password)
    # password_changed_at ends every session started before now, including an intruder's
    res = await db.users.find_one_and_update(
        {"_id": ObjectId(reset["user_id"])},
        {"$set": {"password_hash": new_hash, "password_changed_at": int(time.time())}}, {"email": 1})
    if not res:
        raise HTTPException(status_code=400, detail="This reset link has expired or was already used. Please ask for a new one.")
    await rate_limit.clear(rate_limit.LOGIN_EMAIL, res["email"])
    return {"message": "Password changed. You can log in now."}


# ------------------------- Catalog -------------------------
@api_router.get("/catalog")
async def catalog():
    return CATALOG


# ------------------------- Batches -------------------------
# Deleted batches and removed students' fee records are archived (archived_at set), never hard-deleted
NOT_ARCHIVED = {"archived_at": {"$exists": False}}

DEFAULT_ACADEMIC_MONTHS = [
    "April", "May", "June", "July", "August", "September",
    "October", "November", "December", "January", "February", "March"
]


def to_paise(amount) -> int:
    """Converts a rupee amount (float, int, str, Decimal) to integer paise, avoiding rounding drift."""
    if amount is None:
        return 0
    try:
        d = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return int(d * 100)
    except Exception:
        return 0


def from_paise(paise: int) -> float:
    """Converts integer paise back to float rupees with 2 decimal places."""
    return float(Decimal(paise) / Decimal(100))


def get_current_academic_year(dt: datetime = None) -> str:
    """Computes Indian academic year (April-March). E.g. in 2026, returns '2026-2027'."""
    if dt is None:
        dt = datetime.now(timezone.utc)
    if dt.month >= 4:
        return f"{dt.year}-{dt.year + 1}"
    else:
        return f"{dt.year - 1}-{dt.year}"


def validate_class_level(class_level: Any) -> str:
    """Accepts '10', 10, 'Class 10' or '10th' and stores '10'; batches are school classes 1-12."""
    normalized = normalize_class_level(class_level)
    if not normalized.isdigit() or not 1 <= int(normalized) <= 12:
        raise HTTPException(status_code=400, detail=f"Invalid class level '{class_level}'. Use a class from 1 to 12.")
    return normalized


def validate_max_students(max_students: Optional[int]) -> Optional[int]:
    """None/0 = no limit."""
    if not max_students:
        return None
    if max_students < 0 or max_students > 10000:
        raise HTTPException(status_code=400, detail="Max students must be between 1 and 10000, or 0 for no limit.")
    return int(max_students)


def validate_academic_year(academic_year: str) -> str:
    """Schedules derive month years from the first year, so a malformed value silently shifted every due date."""
    m = re.fullmatch(r"\s*(\d{4})\s*-\s*(\d{4})\s*", academic_year or "")
    if not m or int(m.group(2)) != int(m.group(1)) + 1 or not 2000 <= int(m.group(1)) <= 2100:
        raise HTTPException(status_code=400, detail=f"Invalid academic year '{academic_year}'. Use the form 2026-2027.")
    return f"{m.group(1)}-{m.group(2)}"


def get_batch_default_schedule(fee_amount: float = 0.0, monthly_fee: float = 0.0, academic_year: str = None):
    ay = academic_year or get_current_academic_year()
    try:
        start_year = int(ay.split("-")[0])
    except Exception:
        start_year = datetime.now(timezone.utc).year

    total_fee_paise = to_paise(fee_amount) if (fee_amount and fee_amount > 0) else 0

    if total_fee_paise > 0:
        base_monthly = total_fee_paise // 12
        rem = total_fee_paise % 12
        schedule = []
        for i, m in enumerate(DEFAULT_ACADEMIC_MONTHS):
            m_paise = (base_monthly + rem) if i == 11 else base_monthly
            year = (start_year + 1) if m in ("January", "February", "March") else start_year
            schedule.append({
                "month": m,
                "year": year,
                "academic_year": ay,
                "amount": from_paise(m_paise)
            })
        return schedule
    else:
        amt_paise = to_paise(monthly_fee) if (monthly_fee and monthly_fee > 0) else 0
        amt = from_paise(amt_paise)
        schedule = []
        for m in DEFAULT_ACADEMIC_MONTHS:
            year = (start_year + 1) if m in ("January", "February", "March") else start_year
            schedule.append({
                "month": m,
                "year": year,
                "academic_year": ay,
                "amount": amt
            })
        return schedule


def validate_fee_schedule(schedule: list, academic_year: str = None) -> list:
    """Validates schedule shape and amounts, preventing missing keys and negative fees."""
    if not isinstance(schedule, list):
        raise HTTPException(status_code=400, detail="fee_schedule must be a list")
    ay = academic_year or get_current_academic_year()
    try:
        start_year = int(ay.split("-")[0])
    except Exception:
        start_year = datetime.now(timezone.utc).year

    validated = []
    seen_months = set()
    for idx, item in enumerate(schedule):
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail=f"fee_schedule item {idx} must be an object")
        month = item.get("month")
        if not month or not isinstance(month, str) or not month.strip():
            raise HTTPException(status_code=400, detail=f"fee_schedule item {idx} is missing a valid 'month' key")
        # Allocation is keyed by month name, so unknown or repeated months would silently mis-allocate payments
        if month.strip() not in DEFAULT_ACADEMIC_MONTHS:
            raise HTTPException(status_code=400, detail=f"fee_schedule item {idx} has unknown month '{month}'")
        if month.strip() in seen_months:
            raise HTTPException(status_code=400, detail=f"fee_schedule has duplicate month '{month.strip()}'")
        seen_months.add(month.strip())
        amt = item.get("amount")
        try:
            amt_val = float(amt) if amt is not None else 0.0
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"fee_schedule item {idx} has invalid 'amount'")
        if amt_val < 0:
            raise HTTPException(status_code=400, detail=f"fee_schedule item {idx} cannot have negative amount")

        m_str = month.strip()
        item_year = item.get("year")
        if not item_year:
            item_year = (start_year + 1) if m_str in ("January", "February", "March") else start_year
        validated.append({
            "month": m_str,
            "year": item_year,
            "academic_year": item.get("academic_year") or ay,
            "amount": from_paise(to_paise(amt_val))
        })
    return validated


def get_proportional_schedule(base_schedule, target_total_fee: float):
    target_paise = to_paise(target_total_fee or 0.0)
    if not base_schedule or len(base_schedule) == 0:
        base_schedule = get_batch_default_schedule(0, 0)

    base_sum_paise = sum(to_paise(item.get("amount", 0.0)) for item in base_schedule)
    n = len(base_schedule)
    if n == 0:
        return []

    new_schedule = []
    if base_sum_paise > 0:
        allocated_paise = 0
        for i, item in enumerate(base_schedule):
            if i == n - 1:
                amt_paise = max(0, target_paise - allocated_paise)
            else:
                amt_paise = int(round((to_paise(item.get("amount", 0.0)) * target_paise) / base_sum_paise))
                allocated_paise += amt_paise
            item_copy = dict(item)
            item_copy["amount"] = from_paise(amt_paise)
            new_schedule.append(item_copy)
    else:
        even_paise = int(round(target_paise / float(n)))
        allocated_paise = 0
        for i, item in enumerate(base_schedule):
            if i == n - 1:
                amt_paise = max(0, target_paise - allocated_paise)
            else:
                amt_paise = even_paise
                allocated_paise += amt_paise
            item_copy = dict(item)
            item_copy["amount"] = from_paise(amt_paise)
            new_schedule.append(item_copy)
    return new_schedule


def _derive_fee_allocation(payments: list, schedule: list, unmarked_months: list = None) -> dict:
    """
    Allocates payment amounts sequentially against the fee schedule (waterfall).
    Payments list is the single source of truth. All math is performed in integer paise.
    Does NOT pile overpayment onto the last month.
    Respects explicitly unmarked months so that unmarking an earlier month (e.g. January)
    leaves that specific month due and does not rob later paid months (e.g. March).
    """
    if not schedule:
        return {
            "paid_months": [],
            "monthly_status": [],
            "collected_months": [],
            "partial_months": [],
            "due_months": []
        }

    schedule_months = [item["month"] for item in schedule]
    schedule_map_paise = {item["month"]: to_paise(item.get("amount", 0.0)) for item in schedule}
    allocations_paise = {m: 0 for m in schedule_months}
    collection_dates = {m: None for m in schedule_months}
    month_notes = {m: "" for m in schedule_months}
    unmarked_set = set(unmarked_months or [])

    for p in (payments or []):
        amt_paise = to_paise(p.get("amount", 0.0))
        if amt_paise <= 0:
            continue
        p_month = (p.get("month") or "").strip()
        p_date = p.get("date")
        p_note = p.get("notes") or ""

        if p_month and p_month != "All Months":
            raw_targets = [m.strip() for m in p_month.split(",") if m.strip()]
            targets = [m for m in schedule_months if m in raw_targets]
            remaining = [m for m in schedule_months if m not in raw_targets and m not in unmarked_set]
            unmarked_tail = [m for m in schedule_months if m in unmarked_set and m not in targets]
            month_order = targets + remaining + unmarked_tail
        else:
            normal = [m for m in schedule_months if m not in unmarked_set]
            unmarked_tail = [m for m in schedule_months if m in unmarked_set]
            month_order = normal + unmarked_tail

        rem_paise = amt_paise
        for m in month_order:
            m_req_paise = schedule_map_paise.get(m, 0)
            already_paise = allocations_paise[m]
            needed_paise = max(0, m_req_paise - already_paise)
            if needed_paise > 0:
                alloc_paise = min(rem_paise, needed_paise)
                allocations_paise[m] += alloc_paise
                rem_paise -= alloc_paise
                if p_date:
                    collection_dates[m] = p_date
                if p_note:
                    month_notes[m] = p_note
                if rem_paise <= 0:
                    break

        # Overflow note: Any remaining overpayment beyond schedule is NOT piled onto the last month.

    monthly_status = []
    collected_months = []
    partial_months = []
    due_months = []
    paid_months = []

    for item in schedule:
        m_name = item["month"]
        m_amt_paise = schedule_map_paise.get(m_name, 0)
        alloc_paise = allocations_paise.get(m_name, 0)

        is_paid = (alloc_paise >= m_amt_paise and m_amt_paise > 0)
        is_partial = (alloc_paise > 0 and not is_paid)
        paid_amt_paise = m_amt_paise if is_paid else alloc_paise
        due_amt_paise = 0 if is_paid else max(0, m_amt_paise - alloc_paise)

        m_info = {
            "month": m_name,
            "year": item.get("year"),
            "academic_year": item.get("academic_year"),
            "amount": from_paise(m_amt_paise),
            "paid_amount": from_paise(paid_amt_paise),
            "due_amount": from_paise(due_amt_paise),
            "is_paid": is_paid,
            "is_partial": is_partial,
            "collection_date": collection_dates.get(m_name),
            "notes": month_notes.get(m_name, "")
        }
        monthly_status.append(m_info)
        if is_paid:
            paid_months.append(m_name)
            collected_months.append(m_info)
        elif is_partial:
            partial_months.append(m_info)
            due_months.append(m_info)
        else:
            due_months.append(m_info)

    return {
        "paid_months": paid_months,
        "monthly_status": monthly_status,
        "collected_months": collected_months,
        "partial_months": partial_months,
        "due_months": due_months
    }


def _fee_ledger_entries(old_payments: list, new_payments: list, old_total: float, new_total: float,
                        actor: dict, action: str, reason: str = "") -> list:
    """Diffs the payment list before/after a write into append-only audit entries. `payments` stays the
    current net view used for allocation; `ledger` is never rewritten, so every reversal keeps who/when/why.
    Signed amounts: sum(ledger payment/reversal/adjustment amounts) == current paid_fee."""
    at = datetime.now(timezone.utc).isoformat()
    base = {"at": at, "by_id": actor.get("id"), "by_name": actor.get("name"), "action": action, "reason": reason or ""}
    entries = []
    if to_paise(old_total) != to_paise(new_total):
        entries.append({**base, "type": "fee_change", "old_total": float(old_total or 0), "new_total": float(new_total or 0)})

    old_by_id = {p.get("id"): p for p in old_payments}
    new_ids = set()
    for p in new_payments:
        pid = p.get("id")
        new_ids.add(pid)
        old = old_by_id.get(pid)
        if old is None:
            entries.append({**base, "type": "payment", "payment_id": pid, "amount": from_paise(to_paise(p.get("amount"))),
                            "month": p.get("month", ""), "date": p.get("date"), "notes": p.get("notes", "")})
            continue
        delta = to_paise(p.get("amount")) - to_paise(old.get("amount"))
        if delta != 0 or (old.get("month") or "") != (p.get("month") or ""):
            entries.append({**base, "type": "reversal" if delta < 0 else "adjustment", "payment_id": pid,
                            "amount": from_paise(delta), "month_before": old.get("month", ""), "month_after": p.get("month", "")})
    for pid, old in old_by_id.items():
        if pid not in new_ids:
            entries.append({**base, "type": "reversal", "payment_id": pid, "amount": from_paise(-to_paise(old.get("amount"))),
                            "month_before": old.get("month", ""), "month_after": None})
    return entries


def _latest_payment_date(payments: list) -> Optional[str]:
    """Most recent date among the payments still on record (a reversal can remove the latest one)."""
    best, best_dt = None, None
    for p in payments or []:
        d = p.get("date")
        if not d:
            continue
        try:
            dt = datetime.fromisoformat(str(d).replace("Z", "+00:00"))
            dt = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if best_dt is None or dt > best_dt:
            best, best_dt = d, dt
    return best


def _derive_paid_months(payments: list, schedule: list, unmarked_months: list = None) -> list:
    return _derive_fee_allocation(payments, schedule, unmarked_months=unmarked_months)["paid_months"]


async def generate_unique_batch_code() -> str:
    for _ in range(20):
        code = secrets.token_hex(3).upper()
        existing = await db.batches.find_one({"code": code})
        if not existing:
            return code
    for _ in range(20):
        code = secrets.token_hex(4).upper()
        existing = await db.batches.find_one({"code": code})
        if not existing:
            return code
    return secrets.token_hex(5).upper()


_join_rate_limit_lock = asyncio.Lock()
_join_attempts: Dict[str, List[float]] = defaultdict(list)


JOIN_USER_MAX_ATTEMPTS = 10       # any attempt, per student account
JOIN_IP_MAX_FAILURES = 30         # invalid codes only, per client IP
JOIN_WINDOW_SECONDS = 60


def _countable_ip(client_ip: str) -> bool:
    return bool(client_ip) and client_ip not in ("unknown", "127.0.0.1", "localhost")


async def _check_join_rate_limit(user_id: str, client_ip: str) -> bool:
    """A whole class joining from one school network shares an IP, so successful joins never count against
    the IP; only invalid-code guesses do (see _record_failed_join). Behind a proxy, client_ip is the real
    client only when uvicorn trusts it (FORWARDED_ALLOW_IPS)."""
    now = time.time()
    cutoff = now - JOIN_WINDOW_SECONDS
    async with _join_rate_limit_lock:
        user_key = f"user:{user_id}"
        _join_attempts[user_key] = [t for t in _join_attempts[user_key] if t > cutoff]
        if len(_join_attempts[user_key]) >= JOIN_USER_MAX_ATTEMPTS:
            return False
        if _countable_ip(client_ip):
            ip_key = f"ipfail:{client_ip}"
            _join_attempts[ip_key] = [t for t in _join_attempts[ip_key] if t > cutoff]
            if len(_join_attempts[ip_key]) >= JOIN_IP_MAX_FAILURES:
                return False
        _join_attempts[user_key].append(now)
        return True


async def _record_failed_join(client_ip: str) -> None:
    if not _countable_ip(client_ip):
        return
    async with _join_rate_limit_lock:
        _join_attempts[f"ipfail:{client_ip}"].append(time.time())


def active_batch_ids(user: dict) -> list:
    """Batches a student may access content from: enrolled minus those they are disabled or blocked in."""
    inactive = set(user.get("disabled_batch_ids") or []) | set(user.get("blocked_batch_ids") or [])
    return [bid for bid in (user.get("batch_ids") or []) if bid not in inactive]


async def recompute_user_status_flags(student_id: str) -> None:
    """Account-level lockout applies only when every remaining batch belongs to teachers who disabled/blocked
    the student; a student still enrolled with another teacher keeps login access."""
    student = await db.users.find_one({"_id": ObjectId(student_id)})
    if not student:
        return
    batch_ids = student.get("batch_ids") or []
    disabled = set(student.get("disabled_batch_ids") or [])
    blocked = set(student.get("blocked_batch_ids") or [])
    teacher_ids = {b.get("teacher_id") async for b in db.batches.find({"id": {"$in": batch_ids}}, {"_id": 0, "teacher_id": 1})}
    has_multiple_teachers = len(teacher_ids) > 1
    await db.users.update_one(
        {"_id": ObjectId(student_id)},
        {"$set": {
            "is_disabled": bool(disabled) and not has_multiple_teachers,
            "is_blocked": bool(blocked) and not has_multiple_teachers,
        }}
    )


MONTH_NUMBERS = {m: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"], start=1)}


def _month_key(item: dict) -> tuple:
    try:
        return (int(item.get("year") or 0), MONTH_NUMBERS.get(item.get("month"), 0))
    except (TypeError, ValueError):
        return (0, 0)


def _enrolled_at(student: dict, batch_id: str) -> Optional[str]:
    """Join date per batch; students enrolled before this was recorded have none (= start of academic year)."""
    return (student.get("batch_enrolled_at") or {}).get(batch_id)


def _schedule_from_enrollment(schedule: list, enrolled_at: Optional[str]) -> list:
    """Drops schedule months before the month the student joined. Returns `schedule` itself (same object)
    when nothing is trimmed, so callers can tell the student is on the plain batch schedule."""
    if not enrolled_at or not schedule:
        return schedule
    try:
        dt = datetime.fromisoformat(enrolled_at.replace("Z", "+00:00"))
        dt = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        local = dt.astimezone(APP_TIMEZONE)
    except Exception:
        return schedule
    join_key = (local.year, local.month)
    kept = [it for it in schedule if _month_key(it) >= join_key]
    # Joined after the schedule ended (stale academic year) or before it began: bill the schedule as-is
    if not kept or len(kept) == len(schedule):
        return schedule
    return kept


def _split_due_by_today(monthly_status: list) -> tuple:
    """(overdue_paise, upcoming_paise): dues for months up to the current month vs later months."""
    now = datetime.now(APP_TIMEZONE)
    today_key = (now.year, now.month)
    overdue = upcoming = 0
    for m in monthly_status:
        due = to_paise(m.get("due_amount", 0.0))
        if _month_key(m) <= today_key:
            overdue += due
        else:
            upcoming += due
    return overdue, upcoming


def _sanitize_batch_for_student(b: dict) -> dict:
    return {
        "id": b.get("id"),
        "name": b.get("name"),
        "class_level": b.get("class_level"),
        "teacher_name": b.get("teacher_name"),
        "created_at": b.get("created_at"),
        "student_count": b.get("student_count", 0)
    }


@api_router.post("/batches")
async def create_batch(body: BatchInput, user: dict = Depends(require_role("teacher", "admin"))):
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="Batch name cannot be empty")
    name = body.name.strip()

    if body.fee_amount is not None and float(body.fee_amount) < 0:
        raise HTTPException(status_code=400, detail="Fee amount cannot be negative")
    if body.monthly_fee is not None and float(body.monthly_fee) < 0:
        raise HTTPException(status_code=400, detail="Monthly fee cannot be negative")

    academic_year = validate_academic_year(body.academic_year) if body.academic_year else get_current_academic_year()
    class_level = validate_class_level(body.class_level)

    if body.fee_schedule is not None and len(body.fee_schedule) > 0:
        fee_schedule = validate_fee_schedule(body.fee_schedule, academic_year)
        fee_amount = from_paise(sum(to_paise(it.get("amount", 0.0)) for it in fee_schedule))
        monthly_fee = from_paise(int(round(to_paise(fee_amount) / len(fee_schedule)))) if fee_schedule else 0.0
    else:
        f_amt = float(body.fee_amount) if body.fee_amount is not None else 0.0
        m_amt = float(body.monthly_fee) if body.monthly_fee is not None else 0.0
        if f_amt > 0 and m_amt <= 0:
            m_amt = from_paise(int(round(to_paise(f_amt) / 12.0)))
        elif m_amt > 0 and f_amt <= 0:
            f_amt = from_paise(to_paise(m_amt) * 12)
        fee_amount = f_amt
        monthly_fee = m_amt
        fee_schedule = get_batch_default_schedule(fee_amount, monthly_fee, academic_year)

    for _ in range(10):
        code = await generate_unique_batch_code()
        doc = {
            "id": str(uuid.uuid4()),
            "name": name,
            "class_level": class_level,
            "fee_amount": fee_amount,
            "monthly_fee": monthly_fee,
            "fee_schedule": fee_schedule,
            "academic_year": academic_year,
            "join_requires_approval": bool(body.join_requires_approval),
            "joining_closed": bool(body.joining_closed),
            "max_students": validate_max_students(body.max_students),
            "code": code,
            "teacher_id": user["id"],
            "teacher_name": user["name"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        try:
            await db.batches.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except DuplicateKeyError:
            continue
    raise HTTPException(status_code=500, detail="Failed to generate unique batch code")


@api_router.put("/batches/{batch_id}")
async def update_batch(batch_id: str, body: BatchUpdateInput, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await db.batches.find_one({"id": batch_id, **NOT_ARCHIVED}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")

    update_fields = {}
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Batch name cannot be empty")
        update_fields["name"] = body.name.strip()
    if body.class_level is not None:
        update_fields["class_level"] = validate_class_level(body.class_level)
    if body.join_requires_approval is not None:
        update_fields["join_requires_approval"] = body.join_requires_approval
    if body.joining_closed is not None:
        update_fields["joining_closed"] = body.joining_closed
    if body.max_students is not None:
        update_fields["max_students"] = validate_max_students(body.max_students)

    if body.fee_amount is not None and float(body.fee_amount) < 0:
        raise HTTPException(status_code=400, detail="Fee amount cannot be negative")
    if body.monthly_fee is not None and float(body.monthly_fee) < 0:
        raise HTTPException(status_code=400, detail="Monthly fee cannot be negative")

    if body.academic_year:
        update_fields["academic_year"] = validate_academic_year(body.academic_year)
    academic_year = update_fields.get("academic_year") or batch.get("academic_year") or get_current_academic_year()

    fee_changed = False
    if body.fee_schedule is not None and len(body.fee_schedule) > 0:
        fee_schedule = validate_fee_schedule(body.fee_schedule, academic_year)
        fee_amount = from_paise(sum(to_paise(it.get("amount", 0.0)) for it in fee_schedule))
        monthly_fee = from_paise(int(round(to_paise(fee_amount) / len(fee_schedule)))) if fee_schedule else 0.0
        update_fields["fee_schedule"] = fee_schedule
        update_fields["fee_amount"] = fee_amount
        update_fields["monthly_fee"] = monthly_fee
        fee_changed = True
    elif body.fee_amount is not None or body.monthly_fee is not None:
        curr_f = float(batch.get("fee_amount", 0.0) or 0.0)
        curr_m = float(batch.get("monthly_fee", 0.0) or 0.0)
        if body.fee_amount is not None and body.monthly_fee is None:
            f_amt = float(body.fee_amount)
            m_amt = from_paise(int(round(to_paise(f_amt) / 12.0))) if f_amt > 0 else 0.0
        elif body.monthly_fee is not None and body.fee_amount is None:
            m_amt = float(body.monthly_fee)
            f_amt = from_paise(to_paise(m_amt) * 12) if m_amt > 0 else 0.0
        else:
            f_amt = float(body.fee_amount) if body.fee_amount is not None else curr_f
            m_amt = float(body.monthly_fee) if body.monthly_fee is not None else curr_m
        update_fields["fee_amount"] = f_amt
        update_fields["monthly_fee"] = m_amt
        update_fields["fee_schedule"] = get_batch_default_schedule(f_amt, m_amt, academic_year)
        fee_changed = True

    # A year change alone must still move every month's year, or due dates stay on the old year
    if not fee_changed and update_fields.get("academic_year") and update_fields["academic_year"] != batch.get("academic_year"):
        old_schedule = batch.get("fee_schedule") or get_batch_default_schedule(
            float(batch.get("fee_amount", 0) or 0), float(batch.get("monthly_fee", 0) or 0), academic_year)
        update_fields["fee_schedule"] = validate_fee_schedule(
            [{"month": it["month"], "amount": it.get("amount", 0)} for it in old_schedule], academic_year)
        update_fields["fee_amount"] = float(batch.get("fee_amount", 0) or 0)
        update_fields["monthly_fee"] = float(batch.get("monthly_fee", 0) or 0)
        fee_changed = True

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.batches.update_one({"id": batch_id}, {"$set": update_fields})

    # When batch fees change, update all batch_fees records that don't have a custom override
    if fee_changed:
        batch_fee_amount = update_fields["fee_amount"]
        batch_schedule = update_fields["fee_schedule"]
        records = [r async for r in db.batch_fees.find({"batch_id": batch_id, "is_custom_fee": {"$ne": True}, **NOT_ARCHIVED})]
        record_sids = [ObjectId(r["student_id"]) for r in records if ObjectId.is_valid(r.get("student_id", ""))]
        enrolled_by_sid = {str(u["_id"]): _enrolled_at(u, batch_id)
                           async for u in db.users.find({"_id": {"$in": record_sids}}, {"batch_enrolled_at": 1})}
        for r in records:
            new_schedule = _schedule_from_enrollment(batch_schedule, enrolled_by_sid.get(r["student_id"]))
            new_fee_amount = batch_fee_amount if new_schedule is batch_schedule else from_paise(
                sum(to_paise(it.get("amount", 0.0)) for it in new_schedule))
            ledger_entries = _fee_ledger_entries([], [], r.get("total_fee", 0), new_fee_amount, user, "batch_fee_update")
            payments = r.get("payments", [])
            current_paid_paise = sum(to_paise(p.get("amount", 0.0)) for p in payments)
            new_fee_paise = to_paise(new_fee_amount)
            new_due_paise = max(0, new_fee_paise - current_paid_paise)
            current_paid = from_paise(current_paid_paise)
            new_due = from_paise(new_due_paise)
            new_status = "paid" if new_due == 0 and new_fee_amount > 0 else "partial" if current_paid > 0 else "due"
            if new_fee_amount == 0 and current_paid == 0:
                new_status = "paid"
            derived = _derive_fee_allocation(payments, new_schedule)
            await db.batch_fees.update_one(
                {"_id": r["_id"]},
                {"$set": {
                    "total_fee": new_fee_amount,
                    "fee_schedule": new_schedule,
                    "paid_fee": current_paid,
                    "due_fee": new_due,
                    "status": new_status,
                    "paid_months": derived["paid_months"],
                    "updated_at": update_fields["updated_at"]
                }, "$inc": {"version": 1},  # in-flight fee writes computed against the old fee now conflict
                **({"$push": {"ledger": {"$each": ledger_entries}}} if ledger_entries else {})}
            )

    updated = await db.batches.find_one({"id": batch_id, **NOT_ARCHIVED}, {"_id": 0})
    return updated


@api_router.delete("/batches/{batch_id}")
async def delete_batch(batch_id: str, force: bool = False, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await db.batches.find_one({"id": batch_id, **NOT_ARCHIVED})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")

    collected_paise = 0
    async for r in db.batch_fees.find({"batch_id": batch_id, **NOT_ARCHIVED}, {"payments": 1}):
        collected_paise += sum(to_paise(p.get("amount", 0.0)) for p in r.get("payments", []))
    if collected_paise > 0 and not force:
        raise HTTPException(
            status_code=409,
            detail=f"This batch has ₹{from_paise(collected_paise):,.2f} in recorded fee payments. "
                   f"Deleting archives the batch and its fee records; confirm to continue."
        )

    # Archive rather than delete so collected-fee history and enrollment survive; the batch disappears from
    # listings, joins and teacher actions via NOT_ARCHIVED
    now_iso = datetime.now(timezone.utc).isoformat()
    affected_ids = [str(u["_id"]) async for u in db.users.find({"batch_ids": batch_id}, {"_id": 1})]
    await db.batches.update_one(
        {"id": batch_id},
        {"$set": {"archived_at": now_iso, "archived_by": user["id"], "archived_student_ids": affected_ids}}
    )

    # Remove batch_id from all enrolled students, then re-derive their lockout flags
    await db.users.update_many(
        {"batch_ids": batch_id},
        {"$pull": {
            "batch_ids": batch_id,
            "disabled_batch_ids": batch_id,
            "blocked_batch_ids": batch_id
        }}
    )
    for sid in affected_ids:
        await recompute_user_status_flags(sid)

    await db.batch_fees.update_many(
        {"batch_id": batch_id, **NOT_ARCHIVED},
        {"$set": {"archived_at": now_iso, "archived_reason": "batch_deleted"}}
    )

    return {"success": True, "id": batch_id, "message": f"Batch '{batch.get('name')}' deleted successfully."}


@api_router.get("/batches")
async def list_batches(user: dict = Depends(get_current_user)):
    if user["role"] in ("teacher", "admin"):
        q = {} if user["role"] == "admin" else {"teacher_id": user["id"]}
    else:
        blocked_batch_ids = set(user.get("blocked_batch_ids", []))
        student_bids = [bid for bid in user.get("batch_ids", []) if bid not in blocked_batch_ids]
        q = {"id": {"$in": student_bids}}
    batches = [b async for b in db.batches.find({**q, **NOT_ARCHIVED}, {"_id": 0})]
    if not batches:
        return []
    batch_ids = [b["id"] for b in batches]
    counts, active_counts = {}, {}
    inactive_here = {"$or": [
        {"$in": ["$batch_ids", {"$ifNull": ["$disabled_batch_ids", []]}]},
        {"$in": ["$batch_ids", {"$ifNull": ["$blocked_batch_ids", []]}]},
    ]}
    pipeline = [
        {"$match": {"role": "student", "batch_ids": {"$in": batch_ids}}},
        {"$unwind": "$batch_ids"},
        {"$match": {"batch_ids": {"$in": batch_ids}}},
        {"$group": {"_id": "$batch_ids", "count": {"$sum": 1},
                    "active": {"$sum": {"$cond": [inactive_here, 0, 1]}}}},
    ]
    async for doc in db.users.aggregate(pipeline):
        counts[doc["_id"]] = doc["count"]
        active_counts[doc["_id"]] = doc["active"]
    for b in batches:
        b["student_count"] = counts.get(b["id"], 0)
        b["active_student_count"] = active_counts.get(b["id"], 0)
    if user["role"] == "student":
        return [_sanitize_batch_for_student(b) for b in batches]
    return batches


@api_router.post("/batches/join")
async def join_batch(body: JoinInput, request: Request, user: dict = Depends(require_role("student"))):
    client_ip = request.client.host if request.client else "unknown"
    if not await _check_join_rate_limit(user["id"], client_ip):
        raise HTTPException(status_code=429, detail="Too many join attempts. Please try again later.")

    batch = await db.batches.find_one({"code": body.code.upper().strip(), **NOT_ARCHIVED}, {"_id": 0})
    if not batch:
        await _record_failed_join(client_ip)
        raise HTTPException(status_code=404, detail="Invalid batch code")
    if batch["id"] in user.get("blocked_batch_ids", []):
        raise HTTPException(status_code=403, detail="You are blocked from joining this batch")
    if batch["id"] in (user.get("batch_ids") or []):
        return {**_sanitize_batch_for_student(batch), "join_status": "joined"}
    if batch.get("joining_closed"):
        raise HTTPException(status_code=403, detail="Joining is closed for this batch. Ask your teacher.")
    await _ensure_batch_has_seat(batch)

    if batch.get("join_requires_approval"):
        # A leaked code only lets someone ask to join; the teacher sees who they are and decides
        existing = await db.join_requests.find_one({"batch_id": batch["id"], "student_id": user["id"]}, {"_id": 0})
        if existing and existing.get("status") == "rejected":
            raise HTTPException(status_code=403, detail="Your request to join this batch was declined by the teacher.")
        if not existing or existing.get("status") != "pending":
            await db.join_requests.update_one(
                {"batch_id": batch["id"], "student_id": user["id"]},
                {"$set": {"status": "pending", "student_name": user.get("name"), "student_email": user.get("email"),
                          "requested_at": datetime.now(timezone.utc).isoformat()},
                 "$setOnInsert": {"id": str(uuid.uuid4())}},
                upsert=True
            )
        return {**_sanitize_batch_for_student(batch), "join_status": "pending"}

    await _enroll_student(user["id"], batch["id"])
    return {**_sanitize_batch_for_student(batch), "join_status": "joined"}


async def _ensure_batch_has_seat(batch: dict) -> None:
    max_students = batch.get("max_students")
    if max_students:
        enrolled = await db.users.count_documents({"role": "student", "batch_ids": batch["id"]})
        if enrolled >= int(max_students):
            raise HTTPException(status_code=403, detail="This batch is full.")


async def _enroll_student(student_id: str, batch_id: str) -> None:
    await db.users.update_one({"_id": ObjectId(student_id)}, {"$addToSet": {"batch_ids": batch_id}})
    # First join date only: a rejoin keeps the original so restored fee history lines up with the schedule
    enrolled_field = f"batch_enrolled_at.{batch_id}"
    await db.users.update_one(
        {"_id": ObjectId(student_id), enrolled_field: {"$exists": False}},
        {"$set": {enrolled_field: datetime.now(timezone.utc).isoformat()}}
    )
    # A returning student keeps the payments recorded before they were removed
    await db.batch_fees.update_one(
        {"batch_id": batch_id, "student_id": student_id, "archived_reason": "student_removed"},
        {"$unset": {"archived_at": "", "archived_reason": "", "archived_by": ""}}
    )


async def _owned_batch(batch_id: str, user: dict) -> dict:
    batch = await db.batches.find_one({"id": batch_id, **NOT_ARCHIVED}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")
    return batch


@api_router.get("/batches/join-requests/mine")
async def my_join_requests(user: dict = Depends(require_role("student"))):
    reqs = [r async for r in db.join_requests.find({"student_id": user["id"], "status": "pending"}, {"_id": 0})]
    names = {b["id"]: b.get("name") async for b in db.batches.find(
        {"id": {"$in": [r["batch_id"] for r in reqs]}, **NOT_ARCHIVED}, {"_id": 0, "id": 1, "name": 1})}
    return [{"batch_id": r["batch_id"], "batch_name": names[r["batch_id"]], "requested_at": r.get("requested_at")}
            for r in reqs if r["batch_id"] in names]


@api_router.get("/batches/{batch_id}/join-requests")
async def list_join_requests(batch_id: str, status: str = "pending", user: dict = Depends(require_role("teacher", "admin"))):
    await _owned_batch(batch_id, user)
    return [r async for r in db.join_requests.find({"batch_id": batch_id, "status": status}, {"_id": 0}).sort("requested_at", 1)]


async def _decide_join_request(batch: dict, req: dict, approve: bool, user: dict) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    if approve:
        await _ensure_batch_has_seat(batch)
        await _enroll_student(req["student_id"], batch["id"])
    await db.join_requests.update_one(
        {"batch_id": batch["id"], "student_id": req["student_id"]},
        {"$set": {"status": "approved" if approve else "rejected", "decided_at": now_iso, "decided_by": user["id"]}}
    )


@api_router.post("/batches/{batch_id}/join-requests/{request_id}/{decision}")
async def decide_join_request(batch_id: str, request_id: str, decision: str,
                              user: dict = Depends(require_role("teacher", "admin"))):
    if decision not in ("approve", "reject"):
        raise HTTPException(status_code=404, detail="Unknown action")
    batch = await _owned_batch(batch_id, user)
    req = await db.join_requests.find_one({"batch_id": batch_id, "id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Join request not found")
    if req.get("status") != "pending" and not (decision == "approve" and req.get("status") == "rejected"):
        raise HTTPException(status_code=400, detail=f"Request is already {req.get('status')}")
    await _decide_join_request(batch, req, decision == "approve", user)
    return {"success": True, "status": "approved" if decision == "approve" else "rejected"}


@api_router.post("/batches/{batch_id}/join-requests-approve-all")
async def approve_all_join_requests(batch_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await _owned_batch(batch_id, user)
    approved = 0
    async for req in db.join_requests.find({"batch_id": batch_id, "status": "pending"}, {"_id": 0}).sort("requested_at", 1):
        try:
            await _decide_join_request(batch, req, True, user)
            approved += 1
        except HTTPException:
            break  # batch is full; leave the rest pending
    remaining = await db.join_requests.count_documents({"batch_id": batch_id, "status": "pending"})
    return {"approved": approved, "remaining": remaining}


@api_router.post("/batches/{batch_id}/rotate-code")
async def rotate_batch_code(batch_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    await _owned_batch(batch_id, user)
    new_code = await generate_unique_batch_code()
    await db.batches.update_one({"id": batch_id}, {"$set": {"code": new_code, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"batch_id": batch_id, "code": new_code}


class RecordPaymentInput(BaseModel):
    amount: Optional[float] = None
    total_fee: Optional[float] = None
    paid_fee: Optional[float] = None
    due_fee: Optional[float] = None
    mark_as_paid: Optional[bool] = False
    notes: Optional[str] = ""
    month: Optional[str] = ""
    months_paid: Optional[List[str]] = None
    unmark_month: Optional[str] = None
    payment_date: Optional[str] = None
    fee_schedule: Optional[List[dict]] = None
    is_partial: Optional[bool] = False
    partial_amount: Optional[float] = None
    idempotency_key: Optional[str] = None
    reason: Optional[str] = None
    reset_to_batch_fee: Optional[bool] = False


@api_router.get("/batches/{batch_id}/students")
async def list_batch_students(batch_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await db.batches.find_one({"id": batch_id, **NOT_ARCHIVED}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")

    batch_default_fee = float(batch.get("fee_amount", 0) or 0)
    batch_monthly_fee = float(batch.get("monthly_fee", 0) or 0)
    schedule = batch.get("fee_schedule") or get_batch_default_schedule(batch_default_fee, batch_monthly_fee, batch.get("academic_year"))

    students = [s async for s in db.users.find({"role": "student", "batch_ids": batch_id}).sort("name", 1)]
    student_ids = [str(s["_id"]) for s in students]

    fee_records = {}
    if student_ids:
        records = [r async for r in db.batch_fees.find({"batch_id": batch_id, "student_id": {"$in": student_ids}}, {"_id": 0})]
        for r in records:
            fee_records[r["student_id"]] = r

    results = []
    total_collected_paise = 0
    total_dues_paise = 0
    total_overdue_paise = 0
    total_upcoming_paise = 0
    total_credit_paise = 0

    for s in students:
        sid = str(s["_id"])
        fee = fee_records.get(sid)
        # Mid-year joiners owe only from their join month; the trimmed schedule is their default fee
        own_schedule = _schedule_from_enrollment(schedule, _enrolled_at(s, batch_id))
        own_default_fee = batch_default_fee if own_schedule is schedule else from_paise(
            sum(to_paise(it.get("amount", 0.0)) for it in own_schedule))
        if fee:
            if fee.get("is_custom_fee"):
                t_fee = float(fee.get("total_fee", own_default_fee))
                custom_student_schedule = fee.get("fee_schedule")
            else:
                t_fee = own_default_fee
                custom_student_schedule = None
            payments = fee.get("payments", [])
            p_fee_paise = sum(to_paise(p.get("amount", 0.0)) for p in payments)
            if not payments and float(fee.get("paid_fee", 0.0)) > 0:
                legacy_paid = float(fee.get("paid_fee", 0.0))
                p_fee_paise = to_paise(legacy_paid)
                payments = [{
                    "id": "legacy",
                    "amount": legacy_paid,
                    "date": fee.get("last_payment_date"),
                    "month": "All Months" if legacy_paid >= t_fee else "",
                    "notes": "Imported payment"
                }]
            t_fee_paise = to_paise(t_fee)
            d_fee_paise = max(0, t_fee_paise - p_fee_paise)
            p_fee = from_paise(p_fee_paise)
            d_fee = from_paise(d_fee_paise)
            status = "paid" if d_fee_paise == 0 and t_fee_paise > 0 else "partial" if p_fee_paise > 0 else "due"
            if t_fee_paise == 0 and p_fee_paise == 0:
                status = "paid"
            last_date = _latest_payment_date(payments)
        else:
            t_fee = own_default_fee
            t_fee_paise = to_paise(t_fee)
            p_fee_paise = 0
            d_fee_paise = t_fee_paise
            p_fee = 0.0
            d_fee = t_fee
            status = "due"
            payments = []
            last_date = None
            custom_student_schedule = None

        total_collected_paise += p_fee_paise
        total_dues_paise += d_fee_paise
        # Paid more than the (lowered) fee: surface it as credit instead of silently showing ₹0 due
        credit_paise = max(0, p_fee_paise - t_fee_paise)
        total_credit_paise += credit_paise

        # Resolve student-specific schedule proportionally or from custom schedule
        if custom_student_schedule and len(custom_student_schedule) > 0:
            student_schedule = custom_student_schedule
        elif abs(t_fee - own_default_fee) > 0.01:
            student_schedule = get_proportional_schedule(own_schedule, t_fee)
        else:
            student_schedule = own_schedule

        # Recompute allocations, paid_months, monthly_status purely from payments + schedule
        unmarked_months = fee.get("unmarked_months", []) if fee else []
        derived = _derive_fee_allocation(payments, student_schedule, unmarked_months=unmarked_months)
        monthly_status = derived["monthly_status"]
        overdue_paise, upcoming_paise = _split_due_by_today(monthly_status)
        total_overdue_paise += overdue_paise
        total_upcoming_paise += upcoming_paise
        collected_months = derived["collected_months"]
        partial_months = derived["partial_months"]
        due_months = derived["due_months"]
        paid_months_list = derived["paid_months"]

        is_student_disabled = batch_id in s.get("disabled_batch_ids", [])
        is_student_blocked = batch_id in s.get("blocked_batch_ids", [])

        results.append({
            "id": sid,
            "name": s.get("name", "Unnamed Student"),
            "email": s.get("email", ""),
            "is_disabled": is_student_disabled,
            "is_blocked": is_student_blocked,
            "joined_at": _enrolled_at(s, batch_id),
            "total_fee": t_fee,
            "paid_fee": p_fee,
            "due_fee": d_fee,
            "overdue_fee": from_paise(overdue_paise),
            "credit_fee": from_paise(credit_paise),
            "is_custom_fee": bool(fee and fee.get("is_custom_fee")),
            "upcoming_fee": from_paise(upcoming_paise),
            "status": status,
            "fee_schedule": student_schedule,
            "payments": payments,
            "last_payment_date": last_date,
            "monthly_status": monthly_status,
            "collected_months": collected_months,
            "partial_months": partial_months,
            "due_months": due_months,
            "paid_months": paid_months_list,
            "unmarked_months": unmarked_months
        })

    return {
        "batch_id": batch_id,
        "batch_name": batch.get("name"),
        "class_level": batch.get("class_level"),
        "academic_year": batch.get("academic_year"),
        "fee_amount": batch_default_fee,
        "monthly_fee": batch_monthly_fee,
        "fee_schedule": schedule,
        "students": results,
        "summary": {
            "total_students": len(results),
            "total_collected": from_paise(total_collected_paise),
            "total_dues": from_paise(total_dues_paise),
            "total_overdue": from_paise(total_overdue_paise),
            "total_credit": from_paise(total_credit_paise),
            "total_upcoming": from_paise(total_upcoming_paise),
            "paid_count": sum(1 for r in results if r["status"] == "paid"),
            "partial_count": sum(1 for r in results if r["status"] == "partial"),
            "due_count": sum(1 for r in results if r["status"] == "due"),
            "disabled_count": sum(1 for r in results if r.get("is_disabled")),
            "blocked_count": sum(1 for r in results if r.get("is_blocked")),
        }
    }


_fee_locks: Dict[str, asyncio.Lock] = {}
_fee_locks_guard = asyncio.Lock()


async def _get_fee_lock(batch_id: str, student_id: str) -> asyncio.Lock:
    key = f"{batch_id}:{student_id}"
    async with _fee_locks_guard:
        if key not in _fee_locks:
            _fee_locks[key] = asyncio.Lock()
        return _fee_locks[key]


@api_router.post("/batches/{batch_id}/students/{student_id}/fee")
async def record_student_fee(
    batch_id: str,
    student_id: str,
    body: RecordPaymentInput,
    request: Request,
    user: dict = Depends(require_role("teacher", "admin"))
):
    batch = await db.batches.find_one({"id": batch_id, **NOT_ARCHIVED}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")

    if not ObjectId.is_valid(student_id):
        raise HTTPException(status_code=400, detail="Invalid student id")
    student = await db.users.find_one({"_id": ObjectId(student_id), "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    student_batch_ids = student.get("batch_ids", [])
    if batch_id not in student_batch_ids:
        raise HTTPException(status_code=400, detail="Student is not enrolled in this batch")

    # NaN/Infinity would otherwise become ₹0 inside to_paise and record a silent no-op payment
    for field in ("amount", "partial_amount", "total_fee", "paid_fee", "due_fee"):
        val = getattr(body, field)
        if val is not None and not math.isfinite(float(val)):
            raise HTTPException(status_code=400, detail=f"Invalid {field}")

    # Amount validation & negative fee checks
    if body.amount is not None and float(body.amount) < 0:
        raise HTTPException(status_code=400, detail="Payment amount cannot be negative")
    if body.partial_amount is not None and float(body.partial_amount) < 0:
        raise HTTPException(status_code=400, detail="Partial payment amount cannot be negative")
    if body.total_fee is not None and float(body.total_fee) < 0:
        raise HTTPException(status_code=400, detail="Total fee cannot be negative")
    if body.paid_fee is not None and float(body.paid_fee) < 0:
        raise HTTPException(status_code=400, detail="Paid fee cannot be negative")
    if body.due_fee is not None and float(body.due_fee) < 0:
        raise HTTPException(status_code=400, detail="Due fee cannot be negative")

    if body.is_partial:
        part_amt = float(body.partial_amount if body.partial_amount is not None else (body.amount or 0.0))
        part_amt = round(part_amt, 2)
        if part_amt <= 0:
            raise HTTPException(status_code=400, detail="Partial payment amount must be greater than zero")
        if not (body.month or (body.months_paid and len(body.months_paid) > 0)):
            raise HTTPException(status_code=400, detail="Partial payment requires month or months_paid")
    elif body.amount is not None and float(body.amount) <= 0 and not (
        body.unmark_month or body.mark_as_paid or body.paid_fee is not None or body.due_fee is not None
    ):
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")

    # Validate payment_date format if provided
    now_iso = datetime.now(timezone.utc).isoformat()
    payment_date = body.payment_date or now_iso
    if body.payment_date:
        try:
            cleaned_date = body.payment_date.replace("Z", "+00:00")
            parsed_date = datetime.fromisoformat(cleaned_date)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid payment_date format. Expected ISO 8601 format.")
        parsed_date = parsed_date if parsed_date.tzinfo else parsed_date.replace(tzinfo=APP_TIMEZONE)
        if parsed_date.astimezone(APP_TIMEZONE).date() > datetime.now(APP_TIMEZONE).date():
            raise HTTPException(status_code=400, detail="Payment date can't be in the future.")

    # Validate fee_schedule if provided; the normalized copy (rounded amounts, years filled in) is what gets stored
    validated_schedule = None
    if body.fee_schedule is not None:
        validated_schedule = validate_fee_schedule(body.fee_schedule, batch.get("academic_year"))

    named_months = [m.strip() for m in (body.month or "").split(",") if m.strip()]
    named_months += [m.strip() for m in (body.months_paid or []) if m and m.strip()]
    if body.unmark_month:
        named_months.append(body.unmark_month.strip())
    unknown_months = [m for m in named_months if m != "All Months" and m not in DEFAULT_ACADEMIC_MONTHS]
    if unknown_months:
        raise HTTPException(status_code=400, detail=f"Unknown month(s): {', '.join(unknown_months)}")

    idem_key = (
        body.idempotency_key
        or request.headers.get("x-idempotency-key")
        or request.headers.get("idempotency-key")
        or ""
    ).strip()

    lock = await _get_fee_lock(batch_id, student_id)
    async with lock:
        record = await db.batch_fees.find_one({"batch_id": batch_id, "student_id": student_id}, {"_id": 0})
        # The asyncio lock only serializes writes inside this process; the stored version guards across
        # workers/instances (compare-and-set on write below)
        record_existed = record is not None
        version_filter = ({"version": record["version"]} if record_existed and "version" in record
                          else {"version": {"$exists": False}})
        if record and idem_key:
            recorded_keys = set(record.get("idempotency_keys", []))
            for p in record.get("payments", []):
                if p.get("idempotency_key"):
                    recorded_keys.add(p["idempotency_key"])
            if idem_key in recorded_keys:
                return {
                    "id": student_id,
                    "name": student.get("name"),
                    "email": student.get("email"),
                    "total_fee": float(record.get("total_fee", 0.0)),
                    "fee_schedule": record.get("fee_schedule", []),
                    "paid_fee": float(record.get("paid_fee", 0.0)),
                    "due_fee": float(record.get("due_fee", 0.0)),
                    "status": record.get("status", "due"),
                    "payments": record.get("payments", []),
                    "paid_months": record.get("paid_months", []),
                    "unmarked_months": record.get("unmarked_months", []),
                    "last_payment_date": record.get("last_payment_date")
                }

        batch_default_fee = float(batch.get("fee_amount", 0) or 0)
        batch_monthly_fee_val = float(batch.get("monthly_fee", 0) or 0)
        batch_schedule = batch.get("fee_schedule") or get_batch_default_schedule(batch_default_fee, batch_monthly_fee_val, batch.get("academic_year"))
        # Same per-student default as the roster: mid-year joiners owe only from their join month
        schedule = _schedule_from_enrollment(batch_schedule, _enrolled_at(student, batch_id))
        if schedule is not batch_schedule:
            batch_default_fee = from_paise(sum(to_paise(it.get("amount", 0.0)) for it in schedule))

        if not record:
            record = {
                "batch_id": batch_id,
                "student_id": student_id,
                "total_fee": batch_default_fee,
                "paid_fee": 0.0,
                "due_fee": batch_default_fee,
                "status": "due",
                "payments": [],
                "paid_months": [],
                "version": 0,
                "idempotency_keys": [],
                "is_custom_fee": False
            }

        # Resolve student schedule (custom or batch default) and total_fee
        if body.reset_to_batch_fee:
            # Back onto batch pricing, so future batch fee edits apply to this student again
            total_fee = batch_default_fee
            student_schedule = schedule
            is_custom_fee = False
        elif validated_schedule:
            student_schedule = validated_schedule
            total_fee = float(body.total_fee) if body.total_fee is not None else from_paise(sum(to_paise(it.get("amount", 0.0) or 0.0) for it in student_schedule))
            is_custom_fee = True
        elif body.total_fee is not None:
            total_fee = float(body.total_fee)
            is_custom_fee = True
            if record.get("fee_schedule") and abs(to_paise(total_fee) - to_paise(record.get("total_fee", 0))) > 1:
                student_schedule = get_proportional_schedule(record.get("fee_schedule"), total_fee)
            else:
                student_schedule = record.get("fee_schedule") or get_proportional_schedule(schedule, total_fee)
        elif record.get("is_custom_fee"):
            total_fee = float(record.get("total_fee", batch_default_fee))
            student_schedule = record.get("fee_schedule") or get_proportional_schedule(schedule, total_fee)
            is_custom_fee = True
        else:
            total_fee = batch_default_fee
            student_schedule = schedule
            is_custom_fee = False

        if not body.unmark_month:
            schedule_months = {it.get("month") for it in student_schedule}
            off_schedule = [m for m in named_months if m != "All Months" and m not in schedule_months]
            if off_schedule:
                raise HTTPException(status_code=400, detail=f"Not in this student's fee schedule (joined later?): {', '.join(off_schedule)}")

        payments = list(record.get("payments", []))
        last_date = record.get("last_payment_date")
        version = int(record.get("version", 0))
        idempotency_keys = list(record.get("idempotency_keys", []))

        # If legacy fee record had paid_fee > 0 but payments was empty, initialize payment
        if not payments and float(record.get("paid_fee", 0.0)) > 0:
            legacy_paid = float(record.get("paid_fee", 0.0))
            payments = [{
                "id": "legacy",
                "amount": legacy_paid,
                "date": record.get("last_payment_date"),
                "month": "All Months" if legacy_paid >= total_fee else "",
                "notes": "Imported payment"
            }]
        # Snapshot before any branch mutates payment dicts in place, for the audit ledger diff
        payments_before = copy.deepcopy(payments)
        total_before = float(record.get("total_fee", batch_default_fee) or 0)

        total_fee_paise = to_paise(total_fee)
        current_paid_paise = sum(to_paise(p.get("amount", 0.0)) for p in payments)
        remaining_due_paise = max(0, total_fee_paise - current_paid_paise)
        unmarked_months = list(record.get("unmarked_months", [])) if record else []

        if body.unmark_month:
            month_to_remove = body.unmark_month.strip()
            # Only reverse what was actually allocated to this month; unmarking a due month must not remove money
            current_alloc = _derive_fee_allocation(payments, student_schedule, unmarked_months=unmarked_months)
            month_status = next((m for m in current_alloc["monthly_status"] if m["month"] == month_to_remove), None)
            if not month_status:
                raise HTTPException(status_code=400, detail=f"{month_to_remove} is not in this student's fee schedule")
            allocated_paise = to_paise(month_status["paid_amount"])
            if allocated_paise <= 0:
                raise HTTPException(status_code=400, detail=f"{month_to_remove} has no payment to unmark")
            if month_to_remove not in unmarked_months:
                unmarked_months.append(month_to_remove)
            rem_deduct_paise = allocated_paise
            new_payments = []

            has_covering_payment = any(
                (p.get("month") == "All Months" or month_to_remove in [m.strip() for m in (p.get("month") or "").split(",") if m.strip()])
                for p in payments
            )

            if has_covering_payment:
                for p in payments:
                    p_month = (p.get("month") or "").strip()
                    p_amt_paise = to_paise(p.get("amount", 0.0))
                    is_all = (p_month == "All Months")
                    p_months_list = [it["month"] for it in student_schedule] if is_all else [m.strip() for m in p_month.split(",") if m.strip()]

                    if month_to_remove in p_months_list and rem_deduct_paise > 0:
                        deduct_this_paise = min(rem_deduct_paise, p_amt_paise)
                        new_amt_paise = p_amt_paise - deduct_this_paise
                        rem_deduct_paise -= deduct_this_paise
                        remaining_months = [m for m in p_months_list if m != month_to_remove]
                        if new_amt_paise > 0 and remaining_months:
                            p["amount"] = from_paise(new_amt_paise)
                            p["month"] = ", ".join(remaining_months)
                            new_payments.append(p)
                        elif new_amt_paise > 0:
                            p["amount"] = from_paise(new_amt_paise)
                            p["month"] = ""
                            new_payments.append(p)
                    else:
                        new_payments.append(p)

                if rem_deduct_paise > 0:
                    temp_payments = []
                    for p in reversed(new_payments):
                        p_amt_paise = to_paise(p.get("amount", 0.0))
                        if rem_deduct_paise > 0:
                            deduct_this_paise = min(rem_deduct_paise, p_amt_paise)
                            new_amt_paise = p_amt_paise - deduct_this_paise
                            rem_deduct_paise -= deduct_this_paise
                            p["amount"] = from_paise(new_amt_paise)
                        if to_paise(p.get("amount", 0.0)) > 0:
                            temp_payments.append(p)
                    temp_payments.reverse()
                    new_payments = temp_payments
            else:
                for p in reversed(payments):
                    p_amt_paise = to_paise(p.get("amount", 0.0))
                    if rem_deduct_paise > 0:
                        deduct_this_paise = min(rem_deduct_paise, p_amt_paise)
                        new_amt_paise = p_amt_paise - deduct_this_paise
                        rem_deduct_paise -= deduct_this_paise
                        p["amount"] = from_paise(new_amt_paise)
                    if to_paise(p.get("amount", 0.0)) > 0:
                        new_payments.append(p)
                new_payments.reverse()

            payments = new_payments
        elif body.mark_as_paid:
            unmarked_months = []
            diff_paise = max(0, total_fee_paise - current_paid_paise)
            if diff_paise > 0 or not payments:
                new_p = {
                    "id": str(uuid.uuid4()),
                    "amount": from_paise(diff_paise if diff_paise > 0 else total_fee_paise),
                    "date": payment_date,
                    "month": "All Months",
                    "notes": body.notes.strip() if body.notes else "Marked as paid in full",
                    "recorded_by": user["name"]
                }
                if idem_key:
                    new_p["idempotency_key"] = idem_key
                payments.append(new_p)
                last_date = payment_date
        elif body.is_partial and (body.month or (body.months_paid and len(body.months_paid) > 0)):
            target_months = body.months_paid if (body.months_paid and len(body.months_paid) > 0) else [body.month]
            target_months = [m for m in target_months if m]
            unmarked_months = [m for m in unmarked_months if m not in target_months]
            part_amt = float(body.partial_amount if body.partial_amount is not None else (body.amount or 0.0))
            part_amt = round(part_amt, 2)
            part_amt_paise = to_paise(part_amt)
            if part_amt_paise > remaining_due_paise:
                raise HTTPException(status_code=400, detail=f"Payment amount ({part_amt}) exceeds remaining due fee ({from_paise(remaining_due_paise)})")

            new_p = {
                "id": str(uuid.uuid4()),
                "amount": part_amt,
                "date": payment_date,
                "month": ", ".join(target_months),
                "is_partial": True,
                "notes": body.notes.strip() if body.notes else f"Partial payment for {', '.join(target_months)}",
                "recorded_by": user["name"]
            }
            if idem_key:
                new_p["idempotency_key"] = idem_key
            payments.append(new_p)
            last_date = payment_date
        elif body.paid_fee is not None:
            target_paid_paise = to_paise(body.paid_fee)
            if target_paid_paise > total_fee_paise:
                raise HTTPException(status_code=400, detail=f"Paid fee ({body.paid_fee}) exceeds total fee ({total_fee})")
            if target_paid_paise >= total_fee_paise or target_paid_paise <= 0:
                unmarked_months = []
            if target_paid_paise <= 0:
                payments = []
            else:
                diff_paise = target_paid_paise - current_paid_paise
                if diff_paise > 0:
                    new_p = {
                        "id": str(uuid.uuid4()),
                        "amount": from_paise(diff_paise),
                        "date": payment_date,
                        "month": "All Months" if target_paid_paise >= total_fee_paise else "",
                        "notes": body.notes.strip() if body.notes else "Direct paid fee adjustment",
                        "recorded_by": user["name"]
                    }
                    if idem_key:
                        new_p["idempotency_key"] = idem_key
                    payments.append(new_p)
                    last_date = payment_date
                elif diff_paise < 0:
                    to_remove_paise = abs(diff_paise)
                    for p in reversed(payments):
                        p_amt_paise = to_paise(p.get("amount", 0.0))
                        if p_amt_paise <= to_remove_paise:
                            to_remove_paise -= p_amt_paise
                            p["amount"] = 0.0
                        else:
                            p["amount"] = from_paise(p_amt_paise - to_remove_paise)
                            to_remove_paise = 0
                            break
                    payments = [p for p in payments if to_paise(p.get("amount", 0.0)) > 0]
        elif body.due_fee is not None:
            target_due_paise = to_paise(body.due_fee)
            if target_due_paise > total_fee_paise:
                raise HTTPException(status_code=400, detail=f"Due fee ({body.due_fee}) exceeds total fee ({total_fee})")
            target_paid_paise = max(0, total_fee_paise - target_due_paise)
            if target_paid_paise <= 0 or target_paid_paise >= total_fee_paise:
                unmarked_months = []
            if target_paid_paise <= 0:
                payments = []
            else:
                diff_paise = target_paid_paise - current_paid_paise
                if diff_paise > 0:
                    new_p = {
                        "id": str(uuid.uuid4()),
                        "amount": from_paise(diff_paise),
                        "date": payment_date,
                        "month": "All Months" if target_paid_paise >= total_fee_paise else "",
                        "notes": body.notes.strip() if body.notes else "Direct due fee adjustment",
                        "recorded_by": user["name"]
                    }
                    if idem_key:
                        new_p["idempotency_key"] = idem_key
                    payments.append(new_p)
                    last_date = payment_date
                elif diff_paise < 0:
                    to_remove_paise = abs(diff_paise)
                    for p in reversed(payments):
                        p_amt_paise = to_paise(p.get("amount", 0.0))
                        if p_amt_paise <= to_remove_paise:
                            to_remove_paise -= p_amt_paise
                            p["amount"] = 0.0
                        else:
                            p["amount"] = from_paise(p_amt_paise - to_remove_paise)
                            to_remove_paise = 0
                            break
                    payments = [p for p in payments if to_paise(p.get("amount", 0.0)) > 0]
        elif body.month or (body.months_paid and len(body.months_paid) > 0):
            target_months = body.months_paid if (body.months_paid and len(body.months_paid) > 0) else [body.month]
            target_months = [m for m in target_months if m]
            unmarked_months = [m for m in unmarked_months if m not in target_months]
            if body.amount is not None and body.amount > 0:
                added_paise = to_paise(body.amount)
            else:
                added_paise = 0
                for tm in target_months:
                    sch_item = next((it for it in student_schedule if it["month"] == tm), None)
                    if sch_item:
                        added_paise += to_paise(sch_item.get("amount", 0.0))
                    else:
                        added_paise += to_paise(round(total_fee / 12.0, 2))
            
            if added_paise > remaining_due_paise:
                raise HTTPException(status_code=400, detail=f"Payment amount ({from_paise(added_paise)}) exceeds remaining due fee ({from_paise(remaining_due_paise)})")

            new_p = {
                "id": str(uuid.uuid4()),
                "amount": from_paise(added_paise),
                "date": payment_date,
                "month": ", ".join(target_months),
                "notes": body.notes.strip() if body.notes else f"Payment for {', '.join(target_months)}",
                "recorded_by": user["name"]
            }
            if idem_key:
                new_p["idempotency_key"] = idem_key
            payments.append(new_p)
            last_date = payment_date
        elif body.amount is not None and body.amount > 0:
            added_paise = to_paise(body.amount)
            if added_paise > remaining_due_paise:
                raise HTTPException(status_code=400, detail=f"Payment amount ({from_paise(added_paise)}) exceeds remaining due fee ({from_paise(remaining_due_paise)})")

            new_p = {
                "id": str(uuid.uuid4()),
                "amount": from_paise(added_paise),
                "date": payment_date,
                "month": body.month or "",
                "notes": body.notes.strip() if body.notes else "Payment received",
                "recorded_by": user["name"]
            }
            if idem_key:
                new_p["idempotency_key"] = idem_key
            payments.append(new_p)
            last_date = payment_date

        if idem_key and idem_key not in idempotency_keys:
            idempotency_keys.append(idem_key)
        # Payment rows carry their own key; this list only needs recent keys (retries arrive within seconds)
        idempotency_keys = idempotency_keys[-200:]

        last_date = _latest_payment_date(payments) or (last_date if payments else None)

        # Invariant: paid_fee == sum(p.amount for p in payments) using paise
        current_paid_paise = sum(to_paise(p.get("amount", 0.0)) for p in payments)
        current_paid = from_paise(current_paid_paise)
        new_due_paise = max(0, total_fee_paise - current_paid_paise)
        new_due = from_paise(new_due_paise)
        status = "paid" if new_due_paise == 0 and total_fee_paise > 0 else "partial" if current_paid_paise > 0 else "due"
        if total_fee_paise == 0 and current_paid_paise == 0:
            status = "paid"

        # Derive paid_months from payments list + schedule
        derived = _derive_fee_allocation(payments, student_schedule, unmarked_months=unmarked_months)
        paid_months = derived["paid_months"]
        unmarked_months = [m for m in unmarked_months if m not in paid_months]

        update_doc = {
            "batch_id": batch_id,
            "student_id": student_id,
            "total_fee": total_fee,
            "fee_schedule": student_schedule,
            "paid_fee": current_paid,
            "due_fee": new_due,
            "status": status,
            "payments": payments,
            "paid_months": paid_months,
            "unmarked_months": unmarked_months,
            "last_payment_date": last_date,
            "updated_at": now_iso,
            "version": version + 1,
            "idempotency_keys": idempotency_keys,
            "is_custom_fee": is_custom_fee
        }

        if body.reset_to_batch_fee:
            action = "reset_to_batch_fee"
        elif body.unmark_month:
            action = "unmark_month"
        elif body.mark_as_paid:
            action = "mark_as_paid"
        elif body.is_partial:
            action = "partial_payment"
        elif body.paid_fee is not None or body.due_fee is not None:
            action = "manual_adjustment"
        elif body.month or body.months_paid or body.amount:
            action = "payment"
        else:
            action = "fee_update"
        ledger_entries = _fee_ledger_entries(payments_before, payments, total_before, total_fee, user, action, body.reason)
        fee_update = {"$set": update_doc}
        if ledger_entries:
            fee_update["$push"] = {"ledger": {"$each": ledger_entries}}

        conflict = HTTPException(status_code=409, detail="This student's fee record was changed by someone else. Refresh and try again.")
        try:
            res = await db.batch_fees.update_one(
                {"batch_id": batch_id, "student_id": student_id, **version_filter},
                fee_update,
                # A new record is inserted only if none exists; a concurrent insert hits the unique index
                upsert=not record_existed
            )
        except DuplicateKeyError:
            raise conflict
        if record_existed and res.matched_count == 0:
            raise conflict

        return {
            "id": student_id,
            "name": student.get("name"),
            "email": student.get("email"),
            "total_fee": total_fee,
            "fee_schedule": student_schedule,
            "paid_fee": current_paid,
            "due_fee": new_due,
            "status": status,
            "payments": payments,
            "paid_months": paid_months,
            "unmarked_months": unmarked_months,
            "last_payment_date": last_date
        }


@api_router.get("/batches/{batch_id}/students/{student_id}/fee-history")
async def student_fee_history(batch_id: str, student_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await db.batches.find_one({"id": batch_id, **NOT_ARCHIVED}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")
    record = await db.batch_fees.find_one({"batch_id": batch_id, "student_id": student_id}, {"_id": 0, "ledger": 1})
    return {"batch_id": batch_id, "student_id": student_id, "ledger": (record or {}).get("ledger", [])}


@api_router.post("/batches/{batch_id}/students/{student_id}/status")
@api_router.put("/batches/{batch_id}/students/{student_id}/status")
async def update_student_status(
    batch_id: str,
    student_id: str,
    body: StudentStatusInput,
    user: dict = Depends(require_role("teacher", "admin"))
):
    batch = await db.batches.find_one({"id": batch_id, **NOT_ARCHIVED}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")

    if not ObjectId.is_valid(student_id):
        raise HTTPException(status_code=400, detail="Invalid student id")
    student = await db.users.find_one({"_id": ObjectId(student_id), "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    student_batch_ids = student.get("batch_ids", [])
    if batch_id not in student_batch_ids:
        raise HTTPException(status_code=400, detail="Student is not enrolled in this batch")

    disabled_batch_ids = set(student.get("disabled_batch_ids", []))
    blocked_batch_ids = set(student.get("blocked_batch_ids", []))
    # Per-batch lists are the source of truth; the account-level flags are derived from them
    curr_disabled_in_batch = batch_id in disabled_batch_ids
    curr_blocked_in_batch = batch_id in blocked_batch_ids

    action_raw = body.action
    action = (action_raw or "").lower().strip()
    valid_actions = {"disable", "enable", "block", "unblock"}

    if action_raw is not None and action_raw != "":
        if action not in valid_actions:
            raise HTTPException(status_code=400, detail=f"Invalid action: {action_raw}. Must be one of: disable, enable, block, unblock")
        if action == "disable":
            new_disabled = True
            new_blocked = curr_blocked_in_batch
        elif action == "enable":
            new_disabled = False
            new_blocked = curr_blocked_in_batch
        elif action == "block":
            new_blocked = True
            new_disabled = curr_disabled_in_batch
        elif action == "unblock":
            new_blocked = False
            new_disabled = curr_disabled_in_batch
    else:
        if body.is_disabled is None and body.is_blocked is None:
            raise HTTPException(status_code=400, detail="Either action, is_disabled, or is_blocked must be provided")
        new_disabled = bool(body.is_disabled) if body.is_disabled is not None else curr_disabled_in_batch
        new_blocked = bool(body.is_blocked) if body.is_blocked is not None else curr_blocked_in_batch

    if new_disabled:
        disabled_batch_ids.add(batch_id)
    else:
        disabled_batch_ids.discard(batch_id)

    if new_blocked:
        blocked_batch_ids.add(batch_id)
    else:
        blocked_batch_ids.discard(batch_id)

    now_iso = datetime.now(timezone.utc).isoformat()
    new_batch_code = None
    updated_batches = []

    # Blocking no longer rotates join codes: a blocked student is refused at join, and rotating broke the
    # code for everyone else. Teachers rotate explicitly via POST /batches/{id}/rotate-code.

    await db.users.update_one({"_id": ObjectId(student_id)}, {"$set": {
        "disabled_batch_ids": list(disabled_batch_ids),
        "blocked_batch_ids": list(blocked_batch_ids),
        "updated_at": now_iso
    }})
    await recompute_user_status_flags(student_id)

    return {
        "success": True,
        "student_id": student_id,
        "student_name": student.get("name"),
        "is_disabled": new_disabled,
        "is_blocked": new_blocked,
        "batch_id": batch_id,
        "new_batch_code": new_batch_code,
        "updated_batches": updated_batches,
        "message": f"Student {student.get('name')} status updated successfully."
    }


@api_router.delete("/batches/{batch_id}/students/{student_id}")
async def remove_student_from_batch(
    batch_id: str,
    student_id: str,
    user: dict = Depends(require_role("teacher", "admin"))
):
    batch = await db.batches.find_one({"id": batch_id, **NOT_ARCHIVED}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")

    if not ObjectId.is_valid(student_id):
        raise HTTPException(status_code=400, detail="Invalid student id")
    student = await db.users.find_one({"_id": ObjectId(student_id), "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    student_batch_ids = student.get("batch_ids", [])
    if batch_id not in student_batch_ids:
        raise HTTPException(status_code=400, detail="Student is not enrolled in this batch")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"_id": ObjectId(student_id)},
        {
            "$pull": {
                "batch_ids": batch_id,
                "disabled_batch_ids": batch_id,
                "blocked_batch_ids": batch_id
            },
            "$set": {"updated_at": now_iso}
        }
    )

    # Archive (not delete) the fee record; it is restored if the student rejoins
    await db.batch_fees.update_many(
        {"batch_id": batch_id, "student_id": student_id, **NOT_ARCHIVED},
        {"$set": {"archived_at": now_iso, "archived_reason": "student_removed", "archived_by": user["id"]}}
    )

    await recompute_user_status_flags(student_id)

    return {
        "success": True,
        "message": f"Student {student.get('name', 'Student')} removed from batch successfully",
        "batch_id": batch_id,
        "student_id": student_id
    }


# ------------------------- Notes -------------------------
# Structured notes (/notes) and their text-extraction helper (/extract) were removed: the app's
# "Class Notes" are uploaded materials (/resources), and /notes had no screen but was reachable.


# ------------------------- Materials (direct uploads, no AI) -------------------------
_MIME = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
         "webp": "image/webp", "gif": "image/gif", "txt": "text/plain",
         "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}

# Extensions browsers render inline safely (PDF + raster images + plain text);
# everything else on the allowlist (docx/pptx) downloads as an attachment.
_PREVIEW_INLINE = {"pdf", "png", "jpg", "jpeg", "webp", "gif", "txt"}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def _require_title(title: Optional[str]) -> str:
    cleaned = (title or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    return cleaned[:200]


async def _read_upload_capped(file: UploadFile) -> bytes:
    """Read an upload in 1 MB chunks, never buffering more than 25 MB in memory.

    Once over the cap the rest of the stream is drained (discarded, not stored)
    so the client receives a clean 413 instead of a reset socket."""
    chunks, total, drained = [], 0, 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total <= MAX_UPLOAD_BYTES:
            chunks.append(chunk)
        elif drained <= 256 * 1024 * 1024:
            drained += len(chunk)
    if total > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large — the upload limit is 25 MB")
    return b"".join(chunks)


@api_router.post("/resources")
async def create_resource(
    file: UploadFile = File(...),
    title: str = Form(...),
    batch_id: str = Form(...),
    class_level: str = Form(...),
    subject: str = Form(...),
    chapter: str = Form(""),
    topic: str = Form(""),
    user: dict = Depends(require_role("teacher", "admin")),
):
    batch = await db.batches.find_one({"id": batch_id, **NOT_ARCHIVED}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "").lower()
    if ext not in _MIME:
        raise HTTPException(status_code=400,
                            detail="File type not allowed — allowed: pdf, png, jpg, jpeg, webp, gif, txt, docx, pptx")
    data = await _read_upload_capped(file)
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    title = _require_title(title)
    class_level = validate_class_level(class_level)
    if not subject.strip():
        raise HTTPException(status_code=400, detail="Subject cannot be empty")
    ct = _MIME[ext]  # derived from the allowlisted extension; never trust the client's content_type
    path = f"{APP_NAME}/resources/{user['id']}/{uuid.uuid4()}.{ext}"
    await asyncio.to_thread(put_object, path, data, ct)
    doc = {"id": str(uuid.uuid4()), "title": title, "batch_id": batch_id, "batch_name": batch["name"],
           "class_level": class_level, "subject": subject.strip(), "chapter": chapter.strip(), "topic": topic.strip(),
           "storage_path": path, "filename": file.filename, "content_type": ct, "size": len(data),
           "teacher_id": user["id"], "teacher_name": user["name"], "is_deleted": False,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.resources.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/resources")
async def list_resources(user: dict = Depends(get_current_user)):
    q = {"is_deleted": False}
    if user["role"] == "teacher":
        q["teacher_id"] = user["id"]
    elif user["role"] == "student":
        q["batch_id"] = {"$in": active_batch_ids(user)}
    items = await db.resources.find(q, {"_id": 0, "storage_path": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.delete("/resources/{res_id}")
async def delete_resource(res_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    res = await db.resources.find_one({"id": res_id}, {"_id": 0})
    if not res:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and res["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your resource")
    # Soft delete keeps the stored file so a removal can be undone; it is hidden from every listing and download
    await db.resources.update_one({"id": res_id}, {"$set": {
        "is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": user["id"]}})
    return {"ok": True}


class UpdateResourceInput(BaseModel):
    title: Optional[str] = None
    class_level: Optional[str] = None
    subject: Optional[str] = None
    chapter: Optional[str] = None
    topic: Optional[str] = None
    batch_id: Optional[str] = None


@api_router.patch("/resources/{res_id}")
async def update_resource(res_id: str, body: UpdateResourceInput, user: dict = Depends(require_role("teacher", "admin"))):
    res = await db.resources.find_one({"id": res_id, "is_deleted": False}, {"_id": 0})
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")
    if user["role"] != "admin" and res.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your resource")
    # exclude_unset (not "drop None"): an explicit null batch must be rejected, not silently ignored
    updates = body.dict(exclude_unset=True)
    if "batch_id" in updates:
        # Materials always belong to a batch: students only ever see materials of their own batches
        if updates["batch_id"] in ("", "all", None):
            raise HTTPException(status_code=400, detail="Choose a batch for this material")
        batch = await db.batches.find_one({"id": updates["batch_id"], **NOT_ARCHIVED}, {"_id": 0})
        if not batch:
            raise HTTPException(status_code=400, detail="Invalid batch")
        if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
            raise HTTPException(status_code=403, detail="You do not own this batch")
        updates["batch_name"] = batch.get("name")
    if "title" in updates:
        updates["title"] = _require_title(updates["title"])
    if "class_level" in updates:
        updates["class_level"] = validate_class_level(updates["class_level"])
    for field in ("subject", "chapter", "topic"):
        if field in updates:
            updates[field] = (updates[field] or "").strip()
    if updates.get("subject") == "":
        raise HTTPException(status_code=400, detail="Subject cannot be empty")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.resources.update_one({"id": res_id}, {"$set": updates})
    updated = await db.resources.find_one({"id": res_id}, {"_id": 0, "storage_path": 0})
    return updated


@api_router.get("/resources/{res_id}/file")
async def download_resource(res_id: str, user: dict = Depends(get_current_user)):
    # Header/cookie auth only: a ?auth= token in the URL leaked into server logs, history and referrers
    res = await db.resources.find_one({"id": res_id, "is_deleted": False}, {"_id": 0})
    if not res:
        raise HTTPException(status_code=404, detail="Not found")
    allowed = (user["role"] == "admin" or res["teacher_id"] == user["id"]
               or (user["role"] == "student" and res["batch_id"] in active_batch_ids(user)))
    if not allowed:
        raise HTTPException(status_code=403, detail="No access to this file")
    # In a thread: fetching from R2 takes real time, and blocking here would freeze every other student's request
    try:
        content, ct = await asyncio.to_thread(get_object, res["storage_path"])
    except FileNotFoundError:
        logger.error(f"Resource {res_id}: file missing from storage: {res['storage_path']}")
        raise HTTPException(status_code=404, detail="This file is no longer available. Please ask your teacher to upload it again.")
    filename = res.get("filename") or "download"
    ext = (filename.rsplit(".", 1)[-1].lower() if "." in filename else "")
    media_type = res.get("content_type", ct)

    if ENABLE_WATERMARKING and user["role"] == "student" and ext in WATERMARKABLE_EXTS:
        content = await asyncio.to_thread(apply_watermark, content, ext, user.get("name"), user.get("email"))
        media_type = watermarked_media_type(ext, media_type)


    disposition = "inline" if ext in _PREVIEW_INLINE else "attachment"
    # Strip quotes/semicolons and CRLF so they cannot break out of the header;
    # RFC 5987 filename* carries the original name (unicode, quotes, spaces) safely.
    safe_name = re.sub(r'[\r\n";]+', "_", filename).strip() or "download"
    encoded = quote(filename, safe="")
    return Response(content=content, media_type=media_type,
                    headers={"Content-Disposition": f"{disposition}; filename=\"{safe_name}\"; filename*=UTF-8''{encoded}"})


# ------------------------- Tests / DPP -------------------------
async def _build_test(test_id: str, body: GenerateTestInput):
    """Background task: sample ACTIVE questions from the bank or snapshot selected IDs, mark ready."""
    try:
        if body.question_ids and len(body.question_ids) > 0:
            docs = await db.question_bank.find(
                {"id": {"$in": body.question_ids}, "status": "active"},
                {"_id": 0}
            ).to_list(1000)
            docs_by_id = {d["id"]: d for d in docs}
            ordered = [docs_by_id[qid] for qid in body.question_ids if qid in docs_by_id]
            if not ordered:
                raise ValueError("Selected questions are no longer available in the question bank")

            def _format_q(x):
                topics_val = x.get("topics")
                if not topics_val:
                    topics_val = [x.get("topic")] if x.get("topic") else []
                _, q_subj, q_chap, q_top, q_tops = normalize_taxonomy(
                    body.class_level,
                    x.get("subject") or body.subject or "",
                    x.get("chapter") or body.chapter or "",
                    x.get("topic") or body.topic or "",
                    topics_val
                )
                return {
                    "id": x.get("id"),
                    "question": x["question"],
                    "options": x["options"],
                    "correct_index": x["correct_index"],
                    "explanation": x.get("explanation", ""),
                    "image_url": x.get("image_url"),
                    "subject": q_subj,
                    "chapter": q_chap,
                    "topic": q_top,
                    "topics": q_tops,
                    "difficulty": x.get("difficulty", "medium"),
                    "question_type": x.get("question_type", "single_choice"),
                    "marks": x.get("marks", 1.0),
                    "negative_marks": x.get("negative_marks", 0.0),
                    "hint": x.get("hint", ""),
                    "tags": x.get("tags", [])
                }
            questions = [_format_q(x) for x in ordered]
            # Intermix questions across chapters for multi-chapter tests / class tests
            if (body.chapters and len(body.chapters) > 1) or (not body.kind or body.kind == "test"):
                random.shuffle(questions)
        else:
            questions = await _sample_bank_questions(body.class_level, body.subject, body.chapter or "",
                                                     body.topic or "", body.question_count, kind=body.kind,
                                                     chapters=body.chapters)
        if not questions:
            scope = ", ".join(body.chapters or []) or body.chapter or body.subject or f"Class {body.class_level}"
            raise ValueError(f"No active questions in the question bank for {scope}")
        # Ensure questions are shuffled across chapters
        if (body.chapters and len(body.chapters) > 1) or (not body.kind or body.kind == "test"):
            random.shuffle(questions)
        await db.tests.update_one({"id": test_id}, {"$set": {
            "questions": questions, "status": "ready", "question_count": len(questions)}})
    except Exception as e:
        logger.error(f"test build failed ({test_id}): {e}")
        await db.tests.update_one({"id": test_id}, {"$set": {
            "status": "failed", "error": str(e)[:200]}})


@api_router.post("/tests")
async def create_test(body: GenerateTestInput, user: dict = Depends(require_role("teacher", "admin"))):
    body.title = _require_title(body.title)
    body.class_level = validate_class_level(body.class_level)
    _validate_test_timing(body.valid_hours, body.duration_minutes)
    if body.kind not in ("test", "dpp"):
        raise HTTPException(status_code=400, detail="kind must be 'test' or 'dpp'")
    if body.question_ids and len(body.question_ids) > 0:
        if len(body.question_ids) > MAX_TEST_QUESTIONS:
            raise HTTPException(status_code=400, detail=f"A test can have at most {MAX_TEST_QUESTIONS} questions")
        count = len(body.question_ids)
    else:
        if not 1 <= body.question_count <= MAX_TEST_QUESTIONS:
            raise HTTPException(status_code=400, detail=f"question_count must be between 1 and {MAX_TEST_QUESTIONS}")
        count = body.question_count
    now = datetime.now(timezone.utc)
    valid_from = now
    window_minutes = None
    if body.kind == "test":
        # Class tests are always timed, start at a scheduled time (default now) and stay open only
        # duration + 30 min, so the class takes it together instead of across a 24-hour spread
        if int(body.duration_minutes or 0) < 1:
            raise HTTPException(status_code=400, detail="Class tests need a time limit")
        if body.start_at:
            start = _parse_utc(body.start_at)
            if not start:
                raise HTTPException(status_code=400, detail="Invalid start time")
            if start > now + timedelta(days=60):
                raise HTTPException(status_code=400, detail="Start time must be within 60 days")
            valid_from = max(start, now)
        window_minutes = int(body.window_minutes or (body.duration_minutes + CLASS_TEST_WINDOW_BUFFER_MIN))
        if not body.duration_minutes <= window_minutes <= 60 * 24 * 90:
            raise HTTPException(status_code=400, detail="The test window must be at least as long as the test")
    chap_name = body.chapter or ""
    active_chaps = body.chapters or ([chap_name] if chap_name else [])
    if active_chaps and not chap_name:
        chap_name = ", ".join(active_chaps)
    batch_val = body.batch_id
    is_draft = body.is_draft if body.is_draft is not None else (body.is_active is False or not body.activate_now)
    if batch_val in ("template", "none"):
        batch_val = None
        is_draft = True
    elif batch_val in ("all", "", None):
        # "all" is the only open audience; only drafts/templates have no batch and they never reach
        # students. A live test sent without a batch is for all of this teacher's students.
        batch_val = None if is_draft else "all"

    batch_name = None
    if batch_val and batch_val != "all":
        batch_name = await _resolve_test_batch(batch_val, user)
    elif batch_val == "all":
        batch_name = "All Students"
    elif not batch_val:
        batch_name = "Saved / Unassigned" if body.kind == "test" else None

    is_act = False if is_draft else (body.is_active if body.is_active is not None else body.activate_now)

    window = timedelta(minutes=window_minutes) if window_minutes else timedelta(hours=body.valid_hours)
    valid_from_val = None if is_draft else valid_from.isoformat()
    valid_until_val = None if is_draft else (valid_from + window).isoformat()

    doc = {"id": str(uuid.uuid4()), "title": body.title, "kind": body.kind,
           "class_level": body.class_level, "subject": body.subject, "chapter": chap_name,
           "chapters": active_chaps,
           "topic": body.topic or "", "batch_id": batch_val, "batch_name": batch_name,
           "duration_minutes": body.duration_minutes,
           "valid_hours": max(1, math.ceil(window_minutes / 60)) if window_minutes else body.valid_hours,
           "window_minutes": window_minutes,
           # New class tests show questions in a per-student order (answers are stored in canonical order)
           "question_order": "per_student" if body.kind == "test" else "fixed",
           "excused_student_ids": [], "makeups": [], "results_released_at": None,
           "valid_from": valid_from_val,
           "valid_until": valid_until_val,
           "questions": [], "status": "processing", "is_active": is_act, "is_draft": is_draft,
           "question_count": count,
           "teacher_id": user["id"], "teacher_name": user["name"],
           "created_at": now.isoformat()}
    await db.tests.insert_one(doc)
    asyncio.create_task(_build_test(doc["id"], body))
    return {"id": doc["id"], "status": "processing"}


def _shuffled_order(seed: int, n: int = 4) -> List[int]:
    """Deterministic per-(test, student, question) option permutation.

    Stateless by design: the same (test_id, student_id, question index) always
    yields the same order, so a student sees a stable layout across refreshes and
    grading can reconstruct the same mapping without extra storage. `n` is the question's real option
    count (True/False has 2); for 4-option questions the order is unchanged from before."""
    rng = random.Random(seed)
    order = list(range(n))
    rng.shuffle(order)
    return order


def _option_seed(test_id: str, student_id: str, q_index: int) -> int:
    raw = f"{test_id}:{student_id}:{q_index}".encode("utf-8")
    return int(hashlib.sha256(raw).hexdigest()[:8], 16)


async def _sample_bank_questions(class_level: str, subject: str, chapter: str,
                                 topic: str, count: int, kind: str = "test",
                                 chapters: Optional[List[str]] = None) -> list:
    def _format_q(x):
        topics_val = x.get("topics")
        if not topics_val:
            topics_val = [x.get("topic")] if x.get("topic") else []
        _, q_subj, q_chap, q_top, q_tops = normalize_taxonomy(
            class_level,
            x.get("subject") or subject or "",
            x.get("chapter") or chapter or "",
            x.get("topic") or topic or "",
            topics_val
        )
        return {
            "id": x.get("id"),
            "question": x["question"],
            "options": x["options"],
            "correct_index": x["correct_index"],
            "explanation": x.get("explanation", ""),
            "image_url": x.get("image_url"),
            "subject": q_subj,
            "chapter": q_chap,
            "topic": q_top,
            "topics": q_tops,
            "difficulty": x.get("difficulty", "medium"),
            "question_type": x.get("question_type", "single_choice"),
            "marks": x.get("marks", 1.0),
            "negative_marks": x.get("negative_marks", 0.0),
            "hint": x.get("hint", ""),
            "tags": x.get("tags", [])
        }

    active_chapters = [c for c in (chapters or ([chapter] if chapter else [])) if c]
    subj_filter = {"$regex": f"^{re.escape(subject.strip())}$", "$options": "i"} if subject else None
    top_filter = [{"topic": {"$regex": f"^{re.escape(topic.strip())}$", "$options": "i"}},
                  {"topics": {"$regex": f"^{re.escape(topic.strip())}$", "$options": "i"}}] if topic else None
    if len(active_chapters) == 1:
        chap_filter = {"$regex": f"^{re.escape(active_chapters[0].strip())}$", "$options": "i"}
    elif len(active_chapters) > 1:
        chap_filter = {"$in": [re.compile(f"^{re.escape(c.strip())}$", re.I) for c in active_chapters]}
    else:
        chap_filter = None

    if kind == "dpp":
        # Chapterwise test: return questions for the chapter, sorted topicwise
        q = {"class_level": class_level, "status": "active"}
        if subj_filter:
            q["subject"] = subj_filter
        if chap_filter:
            q["chapter"] = chap_filter
        if top_filter:
            q["$or"] = top_filter
        chapter_questions = await db.question_bank.find(q, {"_id": 0}).sort([("topic", 1), ("created_at", 1)]).to_list(1000)
        if not chapter_questions and topic:
            q_no_topic = {"class_level": class_level, "status": "active"}
            if subj_filter:
                q_no_topic["subject"] = subj_filter
            if chap_filter:
                q_no_topic["chapter"] = chap_filter
            chapter_questions = await db.question_bank.find(q_no_topic, {"_id": 0}).sort([("topic", 1), ("created_at", 1)]).to_list(1000)
        if chapter_questions:
            if count and count > 0 and len(chapter_questions) > count:
                # Random subset so repeated practice tests on a chapter differ (the first N sorted by topic
                # always gave the same questions, biased to alphabetically-early topics); keep topicwise order
                chapter_questions = random.sample(chapter_questions, count)
                chapter_questions.sort(key=lambda x: (x.get("topic") or "", x.get("created_at") or ""))
            if len(active_chapters) > 1:
                random.shuffle(chapter_questions)
            return [_format_q(x) for x in chapter_questions]

    q = {"class_level": class_level, "status": "active"}
    if subj_filter:
        q["subject"] = subj_filter
    if chap_filter:
        q["chapter"] = chap_filter
    if top_filter:
        q["$or"] = top_filter
    pool = await db.question_bank.find(q, {"_id": 0}).to_list(1000)
    if not pool and topic:
        # A missing topic may fall back to its chapter, but never beyond what the teacher chose: a "Chapter X"
        # test silently filled from other chapters (or the whole class) was mislabelled
        q_no_topic = {"class_level": class_level, "status": "active"}
        if subj_filter:
            q_no_topic["subject"] = subj_filter
        if chap_filter:
            q_no_topic["chapter"] = chap_filter
        pool = await db.question_bank.find(q_no_topic, {"_id": 0}).to_list(1000)
    if not pool:
        return []
    buckets = {"easy": [], "medium": [], "hard": []}
    for item in pool:
        buckets.setdefault(item.get("difficulty", "medium"), []).append(item)
    n = max(1, int(count))
    easy_n = round(n * 0.3)
    medium_n = round(n * 0.5)
    hard_n = n - easy_n - medium_n
    picked, picked_ids = [], set()
    for diff, k in (("easy", easy_n), ("medium", medium_n), ("hard", hard_n)):
        bucket = buckets.get(diff, [])
        for item in random.sample(bucket, min(k, len(bucket))):
            picked.append(item)
            picked_ids.add(item["id"])
    # Fill any shortfall (a difficulty bucket may be under-stocked) from the rest.
    if len(picked) < n:
        rest = [x for x in pool if x["id"] not in picked_ids]
        picked.extend(random.sample(rest, min(n - len(picked), len(rest))))
    random.shuffle(picked)
    return [_format_q(x) for x in picked]


def _question_order(test: dict, student_id: str) -> List[int]:
    """Display order of questions for this student, as canonical indices. Class tests created with
    question_order="per_student" get a stable per-student shuffle (harder to share "Q3 is B"); older tests
    keep one order for everyone so their stored answers still line up."""
    n = len(test.get("questions") or [])
    if test.get("question_order") != "per_student":
        return list(range(n))
    return _shuffled_order(_option_seed(test["id"], student_id, -1), n)


def _strip_answers(test: dict, student_id: str) -> dict:
    t = dict(test)
    questions = t.get("questions", [])
    t["question_count"] = len(questions)
    out = []
    is_dpp = t.get("kind") == "dpp"
    # Questions in the student's display order; option shuffle stays keyed by the canonical index i
    for i in _question_order(test, student_id):
        q = questions[i]
        order = _shuffled_order(_option_seed(t["id"], student_id, i), len(q["options"]))
        out.append({
            "question": q["question"],
            "options": [q["options"][j] for j in order],
            "image_url": q.get("image_url"),
            "subject": q.get("subject", ""),
            "chapter": q.get("chapter", ""),
            "topic": q.get("topic", ""),
            "topics": q.get("topics", []),
            "difficulty": q.get("difficulty", "medium"),
            "question_type": q.get("question_type", "single_choice"),
            "marks": q.get("marks", 1.0),
            "negative_marks": q.get("negative_marks", 0.0),
            "hint": q.get("hint", "") if is_dpp else "",
            "tags": q.get("tags", [])
        })
    t["questions"] = out
    return t



@api_router.get("/tests")
async def list_tests(kind: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = dict(TEST_NOT_DELETED)
    if kind:
        q["kind"] = kind
    if user["role"] == "teacher":
        q["teacher_id"] = user["id"]
        tests = await db.tests.find(q, {"_id": 0, "questions": 0}).sort("created_at", -1).to_list(500)
        missing_bids = {t["batch_id"] for t in tests if t.get("batch_id") and not t.get("batch_name") and t.get("batch_id") not in ("all", "")}
        if missing_bids:
            batch_docs = await db.batches.find({"id": {"$in": list(missing_bids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(missing_bids))
            b_map = {b["id"]: b.get("name") for b in batch_docs}
            for t in tests:
                if not t.get("batch_name") and t.get("batch_id") in b_map:
                    t["batch_name"] = b_map[t["batch_id"]]
        for t in tests:
            if not t.get("batch_name") and t.get("batch_id") == "all":
                t["batch_name"] = "All Students"
            t["is_active"] = t.get("is_active", True) is not False
            is_draft = bool(t.get("is_draft") or (t.get("is_active") is False and (not t.get("valid_until") or t.get("batch_name") in ("Saved / Unassigned", None, ""))))
            t["is_draft"] = is_draft
            t["results_released"] = _results_released(t)
            t["makeup_count"] = len(t.get("makeups") or [])
        return tests
    if user["role"] == "student":
        q["status"] = "ready"
        q["is_draft"] = {"$ne": True}
        if kind == "diagnostic":
            q["student_id"] = user["id"]
        else:
            # Own sprints, tests for my batches, and "All Students" tests from my own teachers only
            q["$or"] = [
                {"student_id": user["id"]},
                {"batch_id": {"$in": active_batch_ids(user)}},
                {"batch_id": {"$in": list(OPEN_AUDIENCE)}, "student_id": None,
                 "teacher_id": {"$in": await _student_teacher_ids(user)}},
            ]
        # Expired class-test attempts left open (tab closed) are auto-submitted before listing scores
        await _finalize_expired_attempts(student_id=user["id"])
    tests = await db.tests.find(q, {"_id": 0, "questions": 0}).sort("created_at", -1).to_list(500)
    now = datetime.now(timezone.utc)
    subs_by_test = {}
    if tests:
        test_ids = [t["id"] for t in tests]
        all_subs = await db.submissions.find(
            {"test_id": {"$in": test_ids}, "student_id": user["id"]},
            {"_id": 0, "test_id": 1, "score": 1, "created_at": 1}
        ).sort("created_at", -1).to_list(len(test_ids) * 10)
        for s in all_subs:
            tid = s.get("test_id")
            if tid and tid not in subs_by_test:
                subs_by_test[tid] = s  # Keep most recent submission
    out = []
    for t in tests:
        is_draft = bool(t.get("is_draft") or not t.get("valid_until"))
        # The student's own window: a make-up window if granted, else the test's
        vf, vu = _student_window(t, user["id"])
        time_valid = (not is_draft) and (vf is None or vf <= now) and (vu is None or now <= vu)

        sub = subs_by_test.get(t["id"])
        is_ready = t.get("status") == "ready"
        manually_active = t.get("is_active", True) is not False
        q_count = t.get("question_count")
        if q_count is None:
            q_count = len(t.get("questions", []))
        # .get(): one legacy/partial test document must not break the whole list
        out.append({"id": t["id"], "title": t.get("title", "Untitled"), "kind": t.get("kind", "test"),
                    "subject": t.get("subject", ""), "chapter": t.get("chapter", ""), "topic": t.get("topic", ""),
                    "class_level": t.get("class_level", ""),
                    "duration_minutes": t.get("duration_minutes", 0), "question_count": q_count,
                    # This student's window (make-up if granted) and whether answers are visible yet
                    "valid_from": vf.isoformat() if vf else t.get("valid_from"),
                    "valid_until": vu.isoformat() if vu else t.get("valid_until"),
                    "is_makeup": bool(_student_makeup(t, user["id"])),
                    "opens_in_future": bool(vf and now < vf and not is_draft),
                    "results_released": _results_released(t, now),
                    "is_active": is_ready and manually_active and time_valid,
                    "submitted": bool(sub), "score": sub.get("score") if sub else None,
                    "status": t.get("status"), "batch_id": t.get("batch_id"),
                    "batch_name": t.get("batch_name")})
    return out


@api_router.get("/tests/live")
async def list_live_tests(user: dict = Depends(get_current_user)):
    """Return all currently-active tests for the teacher (used by the Live Tests dashboard drawer)."""
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Teachers only")
    q = {"is_active": {"$ne": False}, "status": "ready", **TEST_NOT_DELETED}
    if user["role"] == "teacher":
        q["teacher_id"] = user["id"]
    tests = await db.tests.find(
        q,
        {"_id": 0, "id": 1, "title": 1, "kind": 1, "class_level": 1,
         "chapter": 1, "topic": 1, "subject": 1, "batch_id": 1, "batch_name": 1,
         "duration_minutes": 1, "question_count": 1, "valid_from": 1, "valid_until": 1,
         "is_active": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(200)
    now = datetime.now(timezone.utc)
    result = []
    for t in tests:
        if t.get("valid_from") and t.get("valid_until"):
            try:
                vf = datetime.fromisoformat(t["valid_from"])
                vu = datetime.fromisoformat(t["valid_until"])
                if not (vf <= now <= vu):
                    continue  # time-windowed: only include if window is open
            except Exception:
                pass
        t["is_active"] = t.get("is_active", True) is not False
        result.append(t)
    return result


MAX_TEST_QUESTIONS = 200
MAX_DAILY_SPRINTS = 100  # backstop on unfinished self-started sprints per student per day (same-target ones are resumed)


def _validate_test_timing(valid_hours: Optional[int], duration_minutes: Optional[int]) -> None:
    if valid_hours is not None and not 1 <= int(valid_hours) <= 24 * 90:
        raise HTTPException(status_code=400, detail="Availability must be between 1 hour and 90 days")
    if duration_minutes is not None and not 0 <= int(duration_minutes) <= 600:
        raise HTTPException(status_code=400, detail="Duration must be between 0 (untimed) and 600 minutes")


# "All Students": every student of the test's teacher. A test with no batch is a private template/draft
# and is never shown to students (legacy open practice tests are migrated to "all" at startup).
OPEN_AUDIENCE = ("all",)
TEST_NOT_DELETED = {"is_deleted": {"$ne": True}}  # deleted tests stay for submission history but are hidden


async def _student_teacher_ids(user: dict) -> list:
    """Teachers of the batches this student can currently access."""
    return [b["teacher_id"] async for b in db.batches.find(
        {"id": {"$in": active_batch_ids(user)}, **NOT_ARCHIVED}, {"_id": 0, "teacher_id": 1}) if b.get("teacher_id")]


async def _student_can_access_test(test: dict, user: dict) -> bool:
    if test.get("student_id"):
        return test["student_id"] == user["id"]
    bid = test.get("batch_id")
    if bid in OPEN_AUDIENCE:
        # "All Students" means all of *this teacher's* students, not every student on the platform
        return bool(test.get("teacher_id")) and test["teacher_id"] in await _student_teacher_ids(user)
    return bid in active_batch_ids(user)


async def _ensure_student_can_access_test(test: dict, user: dict) -> None:
    if not await _student_can_access_test(test, user):
        raise HTTPException(status_code=403, detail="You do not have access to this test")


def _ensure_teacher_owns_test(test: dict, user: dict) -> None:
    if user["role"] != "admin" and test.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this test")


async def _resolve_test_batch(batch_val, user: dict):
    """Validate a target batch for a teacher's test: must be the teacher's own, live batch. Returns its name."""
    batch = await db.batches.find_one({"id": batch_val, **NOT_ARCHIVED}, {"_id": 0, "name": 1, "teacher_id": 1})
    if not batch:
        raise HTTPException(status_code=400, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")
    return batch.get("name")


@api_router.get("/tests/{test_id}")
async def get_test(test_id: str, user: dict = Depends(get_current_user)):
    test = await db.tests.find_one({"id": test_id, **TEST_NOT_DELETED}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] == "student":
        if test.get("is_active", True) is False:
            raise HTTPException(status_code=403, detail="This test is currently inactive or closed by your teacher.")
        if test.get("status") != "ready":
            raise HTTPException(status_code=403, detail="This test is still building or has failed.")
        await _ensure_student_can_access_test(test, user)
        now = datetime.now(timezone.utc)
        opens, closes = _student_window(test, user["id"])
        if opens and now < opens:
            raise HTTPException(status_code=403, detail=f"This test opens at {opens.isoformat()}")
        if test["kind"] == "test":
            if await db.submissions.find_one({"test_id": test_id, "student_id": user["id"]}):
                raise HTTPException(status_code=403, detail="Already submitted")
        start = await db.test_starts.find_one({"test_id": test_id, "student_id": user["id"]}, {"_id": 0})
        if closes and now > closes and not start:
            raise HTTPException(status_code=403, detail="This test is not active right now")
        # The attempt clock lives on the server: a refresh resumes the same deadline instead of restarting it
        if not start:
            await db.test_starts.update_one(
                {"test_id": test_id, "student_id": user["id"]},
                {"$setOnInsert": {"started_at": now.isoformat()}}, upsert=True)
            start = await db.test_starts.find_one({"test_id": test_id, "student_id": user["id"]}, {"_id": 0})
        deadline = _attempt_deadline(test, start, user["id"])
        stripped = _strip_answers(test, user["id"])
        stripped.pop("makeups", None)
        stripped.pop("excused_student_ids", None)
        stripped["started_at"] = start.get("started_at")
        stripped["seconds_left"] = (max(0, int((deadline - now).total_seconds()))
                                    if deadline and int(test.get("duration_minutes") or 0) > 0 else None)
        # Autosaved answers (display order) so a lost tab doesn't lose work
        stripped["draft_answers"] = start.get("draft_answers")
        return stripped
    _ensure_teacher_owns_test(test, user)  # the full test includes the answer key
    return test


SUBMIT_GRACE_SECONDS = 120  # network lag on auto-submit at time-up
CLASS_TEST_WINDOW_BUFFER_MIN = 30  # class tests stay open for duration + this, from their start


def _class_test_window_minutes(test: dict) -> int:
    return int(test.get("window_minutes") or (int(test.get("duration_minutes") or 0) + CLASS_TEST_WINDOW_BUFFER_MIN))


def _parse_utc(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _student_makeup(test: dict, student_id: str) -> Optional[dict]:
    return next((m for m in (test.get("makeups") or []) if m.get("student_id") == student_id), None)


def _student_window(test: dict, student_id: str):
    """(opens, closes) for this student: their make-up window if the teacher granted one, else the test's."""
    makeup = _student_makeup(test, student_id)
    if makeup:
        return _parse_utc(makeup.get("opens_at")), _parse_utc(makeup.get("closes_at"))
    return _parse_utc(test.get("valid_from")), _parse_utc(test.get("valid_until"))


def _attempt_deadline(test: dict, start: Optional[dict], student_id: Optional[str] = None) -> Optional[datetime]:
    """Timed tests: start + duration, never past the student's window. Untimed: the window's end."""
    _, window_end = _student_window(test, student_id) if student_id else (None, _parse_utc(test.get("valid_until")))
    started = _parse_utc((start or {}).get("started_at"))
    duration = int(test.get("duration_minutes") or 0)
    if started and duration > 0:
        timed_end = started + timedelta(minutes=duration)
        return min(timed_end, window_end) if window_end else timed_end
    return window_end


def _results_release_at(test: dict) -> Optional[datetime]:
    """When class-test answers become visible: the teacher's manual release, else when the last window
    (including any make-up) closes, so a make-up student can't be handed the answers."""
    if test.get("kind") != "test":
        return None
    if test.get("results_released_at"):
        return _parse_utc(test["results_released_at"])
    ends = [_parse_utc(test.get("valid_until"))] + [_parse_utc(m.get("closes_at")) for m in (test.get("makeups") or [])]
    ends = [e for e in ends if e]
    return max(ends) if ends else None


def _results_released(test: dict, now: Optional[datetime] = None) -> bool:
    if test.get("kind") != "test":
        return True  # practice/diagnostic answers are part of learning
    release_at = _results_release_at(test)
    return bool(release_at) and (now or datetime.now(timezone.utc)) >= release_at


def _review_rows(test: dict, student_id: str, answers: list, times: list) -> list:
    """Per-question review in the student's display order. `answers`/`times` are stored in canonical order;
    each chosen index points into that student's shuffled options."""
    rows = []
    for i in _question_order(test, student_id):
        q = test["questions"][i]
        order = _shuffled_order(_option_seed(test["id"], student_id, i), len(q["options"]))
        chosen = answers[i] if i < len(answers) else -1
        correct_display = order.index(q["correct_index"])
        rows.append({"question": q["question"], "image_url": q.get("image_url"),
                     "options": [q["options"][j] for j in order], "chosen": chosen,
                     "correct_index": correct_display, "explanation": q.get("explanation", ""),
                     "is_correct": chosen == correct_display, "time_s": times[i] if i < len(times) else 0.0,
                     "subject": q.get("subject", ""), "chapter": q.get("chapter", ""), "topic": q.get("topic", ""),
                     "topics": q.get("topics", []), "difficulty": q.get("difficulty", "medium"),
                     "marks": q.get("marks", 1.0), "negative_marks": q.get("negative_marks", 0.0),
                     "hint": q.get("hint", "")})
    return rows


async def _grade_and_store(test: dict, student_id: str, student_name: str, display_answers: list,
                           display_times: list, tab_switches: int, start: Optional[dict], now: datetime,
                           status: str, late_by_s: int = 0) -> dict:
    """Grade an attempt given in display order, store it canonically, and return the submission doc.
    Raises 403 if a class test already has a submission from this student (unique index)."""
    questions = test["questions"]
    total = len(questions)
    display = _question_order(test, student_id)
    d_answers = (list(display_answers or []) + [-1] * total)[:total]
    d_times = ([round(float(t), 2) for t in (display_times or [])] + [0.0] * total)[:total]
    answers, times = [-1] * total, [0.0] * total
    for pos, i in enumerate(display):
        answers[i], times[i] = d_answers[pos], d_times[pos]

    correct, results = 0, []
    for i, q in enumerate(questions):
        order = _shuffled_order(_option_seed(test["id"], student_id, i), len(q["options"]))
        chosen = answers[i]
        is_ok = chosen == order.index(q["correct_index"])
        correct += 1 if is_ok else 0
        # Resolve and normalize taxonomy tags so results inherit subject/chapter reliably
        _, norm_subj, norm_chap, norm_top, norm_tops = normalize_taxonomy(
            q.get("class_level") or test.get("class_level") or "", q.get("subject") or test.get("subject") or "",
            q.get("chapter") or test.get("chapter") or "", q.get("topic") or test.get("topic") or "",
            q.get("topics") or ([q.get("topic") or test.get("topic")] if (q.get("topic") or test.get("topic")) else []))
        # question_id + kind on each result: lets a later "count a practice question only on its first attempt"
        # rule work without reprocessing old submissions
        results.append({"q": i, "question_id": q.get("id"), "kind": test["kind"], "subject": norm_subj,
                        "chapter": norm_chap, "topic": norm_top, "topics": norm_tops,
                        "difficulty": q.get("difficulty", "medium"),
                        "is_correct": is_ok, "answered": chosen >= 0, "time_s": times[i]})

    sub = {"id": str(uuid.uuid4()), "test_id": test["id"], "kind": test["kind"], "title": test["title"],
           "student_id": student_id, "student_name": student_name, "batch_id": test.get("batch_id"),
           "answers": answers, "times": times, "tab_switches": tab_switches,
           "results": results, "topic_summary": summarize_submission_topics(results),
           "score": round_half_up(correct / total * 100) if total else 0, "correct": correct, "total": total,
           "status": status, "is_makeup": bool(_student_makeup(test, student_id)),
           "started_at": (start or {}).get("started_at"), "late_by_seconds": late_by_s,
           "created_at": now.isoformat()}
    try:
        await db.submissions.insert_one(dict(sub))
    except DuplicateKeyError:
        raise HTTPException(status_code=403, detail="Already submitted")
    # Attempt is over; a practice test re-opened later starts a fresh clock
    await db.test_starts.delete_one({"test_id": test["id"], "student_id": student_id})
    return sub


async def _finalize_expired_attempts(test_ids: Optional[list] = None, student_id: Optional[str] = None) -> int:
    """Auto-submit class-test attempts whose deadline (+grace) has passed without a submission, using the
    student's autosaved answers. Without this, closing the tab lost the work and the student looked absent."""
    q = {}
    if test_ids is not None:
        q["test_id"] = {"$in": test_ids}
    if student_id:
        q["student_id"] = student_id
    now = datetime.now(timezone.utc)
    done = 0
    starts = await db.test_starts.find(q, {"_id": 0}).to_list(2000)
    tests = {t["id"]: t async for t in db.tests.find(
        {"id": {"$in": list({s["test_id"] for s in starts})}, "kind": "test"}, {"_id": 0})}
    for s in starts:
        test = tests.get(s["test_id"])
        if not test:
            continue
        deadline = _attempt_deadline(test, s, s["student_id"])
        if not deadline or now <= deadline + timedelta(seconds=SUBMIT_GRACE_SECONDS):
            continue
        student = await db.users.find_one({"_id": ObjectId(s["student_id"])}, {"name": 1}) if ObjectId.is_valid(s["student_id"]) else None
        try:
            await _grade_and_store(test, s["student_id"], (student or {}).get("name", "Student"),
                                   s.get("draft_answers") or [], s.get("draft_times") or [], 0, s, now, "auto_submitted")
            done += 1
        except HTTPException:
            await db.test_starts.delete_one({"test_id": s["test_id"], "student_id": s["student_id"]})
    return done


async def _claim_sweep(seconds: int = 110) -> bool:
    """Each uvicorn worker runs the sweep loop; the first to take this lock does the work for that round."""
    now = datetime.now(timezone.utc)
    try:
        await db.job_locks.update_one({"_id": "auto_submit", "until": {"$lte": now}},
                                      {"$set": {"until": now + timedelta(seconds=seconds)}}, upsert=True)
        return True
    except DuplicateKeyError:  # the lock exists and hasn't run out, so the upsert tried to insert a second one
        return False


async def _auto_submit_loop():
    while True:
        try:
            n = await _finalize_expired_attempts() if await _claim_sweep() else 0
            if n:
                logger.info(f"auto-submitted {n} expired class-test attempts")
        except Exception as e:
            logger.error(f"auto-submit sweep failed: {e}")
        await asyncio.sleep(120)


class DraftInput(BaseModel):
    answers: List[int]
    times: Optional[List[float]] = None


@api_router.put("/tests/{test_id}/draft")
async def save_draft(test_id: str, body: DraftInput, user: dict = Depends(require_role("student"))):
    """Autosave in-progress answers (display order) to the open attempt, so they survive a closed tab."""
    start = await db.test_starts.find_one({"test_id": test_id, "student_id": user["id"]}, {"_id": 0})
    if not start:
        raise HTTPException(status_code=404, detail="No attempt in progress")
    await db.test_starts.update_one({"test_id": test_id, "student_id": user["id"]}, {"$set": {
        "draft_answers": [int(a) for a in body.answers][:MAX_TEST_QUESTIONS],
        "draft_times": [round(float(t), 2) for t in (body.times or [])][:MAX_TEST_QUESTIONS],
        "draft_saved_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True}


@api_router.post("/tests/{test_id}/submit")
async def submit_test(test_id: str, body: SubmitInput, user: dict = Depends(require_role("student"))):
    test = await db.tests.find_one({"id": test_id, **TEST_NOT_DELETED}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Not found")
    if test.get("is_active", True) is False:
        raise HTTPException(status_code=403, detail="This test is currently inactive or closed by your teacher.")
    if test.get("status") != "ready":
        raise HTTPException(status_code=403, detail="This test is still building or has failed.")
    await _ensure_student_can_access_test(test, user)
    if test["kind"] == "test" and await db.submissions.find_one({"test_id": test_id, "student_id": user["id"]}):
        raise HTTPException(status_code=403, detail="Already submitted")

    now = datetime.now(timezone.utc)
    start = await db.test_starts.find_one({"test_id": test_id, "student_id": user["id"]}, {"_id": 0})
    deadline = _attempt_deadline(test, start, user["id"])
    late_by_s = 0
    if deadline and now > deadline + timedelta(seconds=SUBMIT_GRACE_SECONDS):
        if not start:
            raise HTTPException(status_code=403, detail="This test has closed.")
        # Opened in time but submitted after the deadline: keep the answers, but flag it for the teacher
        late_by_s = int((now - deadline).total_seconds())
    tab_switches = max(0, int(body.tab_switches or 0))
    status = "late" if late_by_s else ("flagged" if tab_switches >= 3 else "submitted")
    sub = await _grade_and_store(test, user["id"], user["name"], body.answers, body.times, tab_switches,
                                 start, now, status, late_by_s)

    out = {"score": sub["score"], "correct": sub["correct"], "total": sub["total"],
           "status": sub["status"], "topic_summary": sub["topic_summary"]}
    if _results_released(test, now):
        out["review"] = _review_rows(test, user["id"], sub["answers"], sub["times"])
    else:
        # Class test still open for classmates (or make-ups): answers would leak, so withhold them for now
        release_at = _results_release_at(test)
        out["review"] = None
        out["review_available_at"] = release_at.isoformat() if release_at else None
    return out


@api_router.get("/tests/{test_id}/my-review")
async def my_review(test_id: str, user: dict = Depends(require_role("student"))):
    """A student's own answers with the correct ones, once the class test's results are released."""
    test = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    await _finalize_expired_attempts([test_id], user["id"])
    sub = await db.submissions.find_one({"test_id": test_id, "student_id": user["id"]}, {"_id": 0},
                                        sort=[("created_at", -1)])
    if not sub:
        raise HTTPException(status_code=404, detail="You haven't taken this test")
    base = {"test_id": test_id, "title": test.get("title"), "score": sub["score"], "correct": sub["correct"],
            "total": sub["total"], "status": sub.get("status"), "topic_summary": sub.get("topic_summary") or []}
    if not _results_released(test):
        release_at = _results_release_at(test)
        return {**base, "review": None, "review_available_at": release_at.isoformat() if release_at else None}
    return {**base, "review": _review_rows(test, user["id"], sub.get("answers") or [], sub.get("times") or [])}


@api_router.get("/tests/{test_id}/leaderboard")
async def leaderboard(test_id: str, user: dict = Depends(get_current_user)):
    # Names and scores: only the test's teacher (or admin) and students who can take this test
    test = await db.tests.find_one({"id": test_id, **TEST_NOT_DELETED}, {"_id": 0, "questions": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    if user["role"] == "student":
        await _ensure_student_can_access_test(test, user)
    else:
        _ensure_teacher_owns_test(test, user)
    subs = await db.submissions.find({"test_id": test_id}, {"_id": 0}).sort("score", -1).to_list(200)
    return [{
        "student_id": s.get("student_id"),
        "submission_id": s.get("id"),
        "student_name": s["student_name"],
        "score": s["score"],
        "correct": s["correct"],
        "total": s["total"]
    } for s in subs]


@api_router.get("/tests/{test_id}/submissions/{student_id}")
async def get_student_submission_review(test_id: str, student_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    test = await db.tests.find_one({"id": test_id})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    # Authorization: the test's own teacher (or admin). The only exception is a student's self-started
    # diagnostic/sprint (no teacher), which their current teachers may review; another teacher's test is never visible.
    if user["role"] != "admin" and test.get("teacher_id") != user["id"]:
        is_self_sprint = not test.get("teacher_id") and test.get("student_id") == student_id
        student = await db.users.find_one({"_id": ObjectId(student_id)}) if ObjectId.is_valid(student_id) else None
        student_bids = (student or {}).get("batch_ids", [])
        shares = await db.batches.find_one(
            {"id": {"$in": student_bids}, "teacher_id": user["id"], **NOT_ARCHIVED}) if student_bids else None
        if not (is_self_sprint and shares):
            raise HTTPException(status_code=403, detail="You do not own this test")

    # Practice tests keep every attempt: review the most recent one
    sub = await db.submissions.find_one({"test_id": test_id, "student_id": student_id}, {"_id": 0},
                                        sort=[("created_at", -1)])
    if not sub:
        raise HTTPException(status_code=404, detail="No submission found for this student")

    questions = test.get("questions") or []
    answers = sub.get("answers") or []
    times = sub.get("times") or []

    review_questions = []
    for i, q in enumerate(questions):
        order = _shuffled_order(_option_seed(test_id, student_id, i), len(q["options"]))
        shuffled_options = [q["options"][j] for j in order]
        chosen = answers[i] if i < len(answers) else -1
        correct_display = order.index(q["correct_index"])
        is_ok = (chosen == correct_display)
        is_unattempted = (chosen == -1 or chosen is None)

        chosen_text = shuffled_options[chosen] if (0 <= chosen < len(shuffled_options)) else "Unattempted"
        correct_text = shuffled_options[correct_display] if (0 <= correct_display < len(shuffled_options)) else ""

        review_questions.append({
            "index": i + 1,
            "question": q["question"],
            "options": shuffled_options,
            "chosen_index": chosen,
            "chosen_text": chosen_text,
            "correct_index": correct_display,
            "correct_text": correct_text,
            "is_correct": is_ok,
            "is_unattempted": is_unattempted,
            "explanation": q.get("explanation", ""),
            "image_url": q.get("image_url"),
            "topic": q.get("topic", test.get("topic", "")),
            "chapter": q.get("chapter", test.get("chapter", "")),
            "subject": q.get("subject", test.get("subject", "")),
            "difficulty": q.get("difficulty", "medium"),
            "time_s": times[i] if i < len(times) else 0.0,
        })

    # Recomputed rather than read from the stored summary, which older submissions built with skips as wrong
    topic_summary = summarize_submission_topics([
        {"topic": rq.get("topic"), "chapter": rq.get("chapter"), "is_correct": rq.get("is_correct"),
         "answered": not rq.get("is_unattempted")}
        for rq in review_questions
    ])

    return {
        "student": {
            "id": student_id,
            "name": sub.get("student_name", "Student")
        },
        "test": {
            "id": test_id,
            "title": test.get("title", ""),
            "class_level": test.get("class_level"),
            "subject": test.get("subject"),
            "chapter": test.get("chapter")
        },
        "summary": {
            "score": sub.get("score", 0),
            "correct": sub.get("correct", 0),
            "incorrect": sub.get("total", 0) - sub.get("correct", 0),
            "total": sub.get("total", len(questions)),
            "tab_switches": sub.get("tab_switches", 0),
            "created_at": sub.get("created_at"),
            "status": sub.get("status"),
            "is_makeup": bool(sub.get("is_makeup")),
            "late_by_seconds": sub.get("late_by_seconds", 0),
        },
        "questions": review_questions,
        "topic_summary": topic_summary
    }


@api_router.get("/submissions/me")
async def my_recent_submissions(limit: int = 10, user: dict = Depends(require_role("student"))):
    """Recent attempts of every kind (tests, DPPs, diagnostics) in one query, for the activity timeline."""
    limit = max(1, min(limit, 50))
    fields = {"_id": 0, "id": 1, "test_id": 1, "title": 1, "kind": 1, "score": 1, "correct": 1, "total": 1, "created_at": 1}
    items = await db.submissions.find({"student_id": user["id"]}, fields).sort("created_at", -1).to_list(limit)
    total = await db.submissions.count_documents({"student_id": user["id"]})
    return {"items": items, "total": total}


@api_router.get("/tests/{test_id}/submissions")
async def get_submissions(test_id: str, user: dict = Depends(get_current_user)):
    q = {"test_id": test_id}
    if user["role"] == "student":
        q["student_id"] = user["id"]
    elif user["role"] == "teacher":
        # Submissions carry students' names, answers and scores: only the test's own teacher may list them
        test = await db.tests.find_one({"id": test_id}, {"_id": 0, "teacher_id": 1})
        if not test:
            raise HTTPException(status_code=404, detail="Test not found")
        if test.get("teacher_id") != user["id"]:
            raise HTTPException(status_code=403, detail="You do not own this test")
    subs = await db.submissions.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return subs


@api_router.get("/tests/{test_id}/missed-students")
async def get_test_missed_students(test_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    test = await db.tests.find_one({"id": test_id, **TEST_NOT_DELETED}, {"_id": 0, "questions": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    # Returns names, emails and phone numbers: only the test's own teacher (or admin)
    _ensure_teacher_owns_test(test, user)
    await _finalize_expired_attempts([test_id])  # closed tabs count as auto-submitted, not missed

    batch_id = test.get("batch_id")
    if not batch_id or batch_id in ("Saved / Unassigned", ""):
        return {
            "test_id": test_id,
            "has_batch": False,
            "batch_id": None,
            "batch_name": test.get("batch_name") or "Unassigned",
            "total_enrolled": 0,
            "submitted_count": 0,
            "missed_count": 0,
            "missed_students": [],
        }

    q = {"role": "student"}
    if batch_id != "all":
        q["batch_ids"] = batch_id
    else:
        # "All Students" = the test teacher's own students, never every student on the platform
        teacher_batches = [b["id"] async for b in db.batches.find(
            {"teacher_id": test.get("teacher_id"), **NOT_ARCHIVED}, {"_id": 0, "id": 1})]
        q["batch_ids"] = {"$in": teacher_batches}

    students = await db.users.find(q).sort("name", 1).to_list(1000)
    subs = await db.submissions.find({"test_id": test_id}, {"_id": 0, "student_id": 1, "student_name": 1}).to_list(1000)
    submitted_ids = {str(s.get("student_id")) for s in subs if s.get("student_id")}

    excused = set(test.get("excused_student_ids") or [])
    makeups = {m["student_id"]: m for m in (test.get("makeups") or [])}
    missed = []
    for st in students:
        sid = str(st.get("id") or st.get("_id"))
        if sid not in submitted_ids:
            mk = makeups.get(sid)
            missed.append({
                "id": sid,
                "name": st.get("name", "Student"),
                "email": st.get("email", ""),
                "phone": st.get("phone", ""),
                # Teacher actions per absentee: give a make-up window, or excuse from attendance
                "excused": sid in excused,
                "makeup": {"opens_at": mk["opens_at"], "closes_at": mk["closes_at"]} if mk else None,
            })

    window_end = _parse_utc(test.get("valid_until"))
    release_at = _results_release_at(test)
    return {
        "test_id": test_id,
        "has_batch": True,
        "batch_id": batch_id,
        "batch_name": test.get("batch_name") or ("All Students" if batch_id == "all" else "Assigned Batch"),
        "total_enrolled": len(students),
        "submitted_count": len(submitted_ids),
        "missed_count": len(missed),
        "missed_students": missed,
        "kind": test.get("kind"),
        "window_closed": bool(window_end and datetime.now(timezone.utc) > window_end),
        "results_released": _results_released(test),
        "results_release_at": release_at.isoformat() if release_at else None,
    }


class MakeupInput(BaseModel):
    student_ids: List[str]
    start_at: Optional[str] = None  # default: now


class ExcuseInput(BaseModel):
    student_ids: List[str]
    excused: bool = True


async def _owned_class_test(test_id: str, user: dict) -> dict:
    test = await db.tests.find_one({"id": test_id, **TEST_NOT_DELETED}, {"_id": 0, "questions": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    _ensure_teacher_owns_test(test, user)
    if test.get("kind") != "test":
        raise HTTPException(status_code=400, detail="Only class tests have make-ups, excuses and result release")
    return test


@api_router.post("/tests/{test_id}/makeup")
async def grant_makeup(test_id: str, body: MakeupInput, user: dict = Depends(require_role("teacher", "admin"))):
    """Give students with a genuine reason their own window for a test they missed. Same questions and
    duration; it counts like a normal attempt. Class-wide answer release waits until make-ups close."""
    test = await _owned_class_test(test_id, user)
    now = datetime.now(timezone.utc)
    opens = _parse_utc(body.start_at) if body.start_at else now
    if not opens:
        raise HTTPException(status_code=400, detail="Invalid start time")
    opens = max(opens, now)
    closes = opens + timedelta(minutes=int(test.get("duration_minutes") or 0) + CLASS_TEST_WINDOW_BUFFER_MIN)
    already = set(await db.submissions.distinct("student_id", {"test_id": test_id, "student_id": {"$in": body.student_ids}}))
    if already:
        raise HTTPException(status_code=400, detail="Some of these students have already taken the test")
    makeups = [m for m in (test.get("makeups") or []) if m.get("student_id") not in body.student_ids]
    makeups += [{"student_id": sid, "opens_at": opens.isoformat(), "closes_at": closes.isoformat(),
                 "granted_by": user["id"], "granted_at": now.isoformat()} for sid in body.student_ids]
    excused = [s for s in (test.get("excused_student_ids") or []) if s not in body.student_ids]
    await db.tests.update_one({"id": test_id}, {"$set": {"makeups": makeups, "excused_student_ids": excused}})
    # A stale clock from an earlier start must not cut the make-up short
    await db.test_starts.delete_many({"test_id": test_id, "student_id": {"$in": body.student_ids}})
    return {"opens_at": opens.isoformat(), "closes_at": closes.isoformat(), "count": len(body.student_ids)}


@api_router.post("/tests/{test_id}/excuse")
async def set_excused(test_id: str, body: ExcuseInput, user: dict = Depends(require_role("teacher", "admin"))):
    """Excused students are left out of this test's attendance count instead of showing as absent."""
    test = await _owned_class_test(test_id, user)
    current = set(test.get("excused_student_ids") or [])
    current = (current | set(body.student_ids)) if body.excused else (current - set(body.student_ids))
    update = {"excused_student_ids": sorted(current)}
    if body.excused:
        update["makeups"] = [m for m in (test.get("makeups") or []) if m.get("student_id") not in body.student_ids]
    await db.tests.update_one({"id": test_id}, {"$set": update})
    return {"excused_student_ids": update["excused_student_ids"]}


@api_router.post("/tests/{test_id}/release-results")
async def release_results(test_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    """Show students the correct answers now instead of waiting for the test (and make-ups) to close."""
    await _owned_class_test(test_id, user)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.tests.update_one({"id": test_id}, {"$set": {"results_released_at": now_iso}})
    return {"results_released_at": now_iso}


class UpdateTestInput(BaseModel):
    title: Optional[str] = None
    valid_hours: Optional[int] = None  # extend / shrink window from now
    is_active: Optional[bool] = None   # manual toggle
    is_draft: Optional[bool] = None


@api_router.delete("/tests/{test_id}")
async def delete_test(test_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    test = await db.tests.find_one({"id": test_id, **TEST_NOT_DELETED})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    if user["role"] != "admin" and test.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    # Soft delete: students' submissions still point at this test (reviews, mastery, history)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.tests.update_one({"id": test_id}, {"$set": {
        "is_deleted": True, "is_active": False, "deleted_at": now_iso, "deleted_by": user["id"]}})
    return {"status": "deleted", "id": test_id}


@api_router.patch("/tests/{test_id}")
async def update_test(test_id: str, body: UpdateTestInput, user: dict = Depends(require_role("teacher", "admin"))):
    test = await db.tests.find_one({"id": test_id, **TEST_NOT_DELETED})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    if user["role"] != "admin" and test.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    _validate_test_timing(body.valid_hours, None)
    updates = {}
    if body.title is not None:
        updates["title"] = _require_title(body.title)
    now = datetime.now(timezone.utc)
    if body.is_active is not None:
        updates["is_active"] = body.is_active
        # If activating a draft test or activating when window is expired or missing:
        is_test_draft = bool(
            test.get("is_draft")
            or not test.get("valid_until")
            or test.get("batch_name") == "Saved / Unassigned"
        )
        if body.is_active is True:
            needs_new_window = is_test_draft
            if not needs_new_window and test.get("valid_until"):
                try:
                    if datetime.fromisoformat(test["valid_until"]) <= now:
                        needs_new_window = True
                except Exception:
                    needs_new_window = True

            if needs_new_window:
                vh = body.valid_hours or test.get("valid_hours") or 24
                updates["is_draft"] = False
                updates["valid_from"] = now.isoformat()
                if test.get("kind") == "test" and not body.valid_hours:
                    # Class tests reopen for duration + 30 min, like a freshly scheduled one
                    updates["valid_until"] = (now + timedelta(minutes=_class_test_window_minutes(test))).isoformat()
                else:
                    updates["valid_until"] = (now + timedelta(hours=vh)).isoformat()
                updates["valid_hours"] = vh
            if not test.get("student_id") and test.get("batch_id") in (None, "", "Saved / Unassigned"):
                # A template going live with no batch is for all of this teacher's students
                updates["batch_id"] = "all"
                updates["batch_name"] = "All Students"
    if body.is_draft is not None:
        updates["is_draft"] = body.is_draft
        if body.is_draft is True:
            updates["is_active"] = False
            updates["valid_from"] = None
            updates["valid_until"] = None
    if body.valid_hours is not None:
        try:
            old_vu = datetime.fromisoformat(test.get("valid_until", test.get("valid_from", now.isoformat())))
            if old_vu <= now or test.get("is_draft") or not test.get("valid_until"):
                valid_from = now
                updates["valid_from"] = now.isoformat()
            else:
                valid_from = datetime.fromisoformat(test["valid_from"])
        except Exception:
            valid_from = now
            updates["valid_from"] = now.isoformat()
        updates["valid_until"] = (valid_from + timedelta(hours=body.valid_hours)).isoformat()
        updates["valid_hours"] = body.valid_hours
        updates["is_active"] = True  # Extending validity reactivates the test
        updates["is_draft"] = False
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tests.update_one({"id": test_id}, {"$set": updates})
    updated = await db.tests.find_one({"id": test_id}, {"_id": 0, "questions": 0})
    return updated


class DuplicateTestInput(BaseModel):
    title: Optional[str] = None
    batch_id: Optional[str] = None
    duration_minutes: Optional[int] = None
    valid_hours: Optional[int] = None


@api_router.post("/tests/{test_id}/duplicate")
async def duplicate_test(test_id: str, body: DuplicateTestInput, user: dict = Depends(require_role("teacher", "admin"))):
    orig = await db.tests.find_one({"id": test_id, **TEST_NOT_DELETED})
    if not orig:
        raise HTTPException(status_code=404, detail="Original test not found")
    if user["role"] != "admin" and orig.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    _validate_test_timing(body.valid_hours, body.duration_minutes)

    now = datetime.now(timezone.utc)
    batch_val = body.batch_id if body.batch_id is not None else orig.get("batch_id")
    if batch_val in ("all", ""):
        batch_val = "all"
    if not batch_val or batch_val in ("template", "none", "Saved / Unassigned"):
        # The copy goes live immediately; with no audience nobody could ever take it
        raise HTTPException(status_code=400, detail="Choose a batch or All Students for this test")

    batch_name = None
    if batch_val and batch_val != "all":
        batch_name = await _resolve_test_batch(batch_val, user)
    elif batch_val == "all":
        batch_name = "All Students"

    dur = body.duration_minutes if body.duration_minutes is not None else orig.get("duration_minutes", 0)
    v_hours = body.valid_hours if body.valid_hours is not None else orig.get("valid_hours", 24)
    if orig.get("kind") == "test" and int(dur or 0) < 1:
        raise HTTPException(status_code=400, detail="Class tests need a time limit")
    new_title = body.title.strip() if body.title and body.title.strip() else f"{orig['title']} ({batch_name or 'Copy'})"

    new_test_id = str(uuid.uuid4())
    doc = {
        "id": new_test_id,
        "title": new_title,
        "kind": orig.get("kind", "test"),
        "class_level": orig.get("class_level"),
        "subject": orig.get("subject"),
        "chapter": orig.get("chapter"),
        "chapters": orig.get("chapters", []),
        "topic": orig.get("topic", ""),
        "batch_id": batch_val,
        "batch_name": batch_name,
        "duration_minutes": dur,
        "valid_hours": v_hours,
        "valid_from": now.isoformat(),
        # Class-test copies open for duration + 30 min unless the teacher asked for a specific window
        "valid_until": (now + (timedelta(minutes=int(dur) + CLASS_TEST_WINDOW_BUFFER_MIN)
                               if orig.get("kind") == "test" and body.valid_hours is None
                               else timedelta(hours=v_hours))).isoformat(),
        "question_order": "per_student" if orig.get("kind") == "test" else "fixed",
        "excused_student_ids": [], "makeups": [], "results_released_at": None,
        "questions": orig.get("questions", []),
        "status": "ready",
        "is_active": True,
        "is_draft": False,
        "question_count": len(orig.get("questions", [])),
        "teacher_id": user["id"],
        "teacher_name": user["name"],
        "created_at": now.isoformat(),
        "duplicated_from": test_id
    }
    await db.tests.insert_one(doc)
    return {
        "id": new_test_id,
        "status": "ready",
        "title": new_title,
        "batch_name": batch_name,
        "is_active": True,
        "is_draft": False,
        "valid_until": doc["valid_until"],
    }


DIFFICULTIES = ("easy", "medium", "hard")
_VALID_STATUSES = ("active", "pending_review", "inactive")


def _normalize_class(value: str) -> str:
    """'Class 9' / 'Class 10' -> '9' / '10'. Falls back to any digits found."""
    v = (value or "").strip()
    m = re.search(r"(\d{1,2})", v)
    return m.group(1) if m else v


def _normalize_correct_answer(value: Any, options: Optional[List[str]] = None) -> Optional[int]:
    """Accepts:
    - int 0..len(options)-1 (or 1..len(options) if 1-based)
    - str letters 'A'..'D' or 'Option A'
    - numeric str '1'..'4'
    - exact option text match in options
    """
    if value is None:
        return None
    if isinstance(value, int) and not isinstance(value, bool):
        if options and 0 <= value < len(options):
            return value
        if not options and 0 <= value <= 10:
            return value
    v = str(value).strip()
    if not v:
        return None
    if options:
        for idx, opt in enumerate(options):
            if opt.strip().lower() == v.lower():
                return idx
    m = re.search(r"option\s*([a-d])", v, re.IGNORECASE)
    if m:
        return ord(m.group(1).upper()) - ord("A")
    if re.fullmatch(r"[A-Da-d]", v):
        return ord(v.upper()) - ord("A")
    if v.isdigit():
        num = int(v)
        if options:
            if num == 0:
                return 0
            if 1 <= num <= len(options):
                return num - 1
            if 0 <= num < len(options):
                return num
        else:
            return num
    return None


def _normalize_correct_option(value: str) -> Optional[int]:
    return _normalize_correct_answer(value)


def _normalize_difficulty(value: str) -> str:
    v = (value or "").strip().lower()
    return v if v in DIFFICULTIES else "medium"


def _dedup_key(question: str) -> str:
    return hashlib.sha256(question.strip().lower().encode("utf-8")).hexdigest()


def _flag_explanation_mismatch(explanation: str, correct_index: int) -> bool:
    """Heuristic sanity check: if the explanation mentions exactly one distinct
    'Option X' that differs from the answer key, flag the row for review.
    (Catches Q9-style 'key says A but text says B' inconsistencies.)"""
    if not explanation:
        return False
    letters = {m.group(1).upper() for m in re.finditer(r"option\s*([a-d])", explanation, re.IGNORECASE)}
    if len(letters) == 1:
        return (ord(next(iter(letters))) - ord("A")) != correct_index
    return False


async def _ingest_questions_list(
    raw_questions: List[dict],
    default_meta: dict,
    user_id: str,
    source: str = "json_import",
    is_csv: bool = False,
    row_offset: int = 1
) -> dict:
    imported = duplicates = flagged = 0
    errors = []
    now = datetime.now(timezone.utc).isoformat()

    for i, raw in enumerate(raw_questions):
        raw_id = raw.get("ID") or raw.get("id") or raw.get("source_id") or ""
        src_id = str(raw_id).strip() if raw_id else str(i + 1)
        question = (raw.get("Question") or raw.get("question") or "").strip()

        opts = raw.get("options")
        if isinstance(opts, list):
            options = [str(o).strip() for o in opts if str(o).strip()]
        else:
            options = [(raw.get("Option A") or raw.get("option_a") or "").strip(),
                       (raw.get("Option B") or raw.get("option_b") or "").strip(),
                       (raw.get("Option C") or raw.get("option_c") or "").strip(),
                       (raw.get("Option D") or raw.get("option_d") or "").strip()]

        raw_correct = (raw.get("Correct Option")
                       if raw.get("Correct Option") is not None
                       else (raw.get("correct_answer")
                             if raw.get("correct_answer") is not None
                             else raw.get("correct_index")))
        correct_index = _normalize_correct_answer(raw_correct, options)

        raw_class = raw.get("Class") or raw.get("class_level") or default_meta.get("class_level") or ""
        raw_subj = raw.get("Subject") or raw.get("subject") or default_meta.get("subject") or ""
        raw_chap = raw.get("Chapter") or raw.get("chapter") or default_meta.get("chapter") or ""
        raw_top = raw.get("Topic") or raw.get("topic") or default_meta.get("topic") or ""
        raw_topics = raw.get("topics") or default_meta.get("topics") or []
        if isinstance(raw_topics, str):
            raw_topics = [t.strip() for t in raw_topics.split(",") if t.strip()]

        class_level, subject, chapter, topic, topics_list = normalize_taxonomy(
            raw_class, raw_subj, raw_chap, raw_top, raw_topics
        )

        explanation = (raw.get("Explanation") or raw.get("explanation") or "").strip()
        difficulty = _normalize_difficulty(raw.get("Difficulty") or raw.get("difficulty") or "")
        question_type = (raw.get("question_type") or "single_choice").strip().lower()

        try:
            marks = float(raw.get("marks", 1.0) or 1.0)
        except Exception:
            marks = 1.0

        try:
            negative_marks = float(raw.get("negative_marks", 0.0) or 0.0)
        except Exception:
            negative_marks = 0.0

        hint = (raw.get("hint") or "").strip()
        image_url = (raw.get("image_url") or raw.get("Image URL") or raw.get("image") or "").strip()
        raw_tags = raw.get("tags") or []
        if isinstance(raw_tags, str):
            raw_tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
        tags = [str(t).strip() for t in raw_tags if str(t).strip()]

        status = raw.get("status") or default_meta.get("status") or "active"
        if status not in _VALID_STATUSES:
            status = "active"

        problems = []
        if image_url and not (image_url.startswith("https://") and len(image_url) <= 500):
            problems.append("image_url must be an https:// link")
        if not question:
            problems.append("empty question")
        if any(not o for o in options) or len(options) < 2:
            problems.append("missing option text")
        if correct_index is None:
            problems.append("invalid 'Correct Option'" if is_csv else "invalid correct answer")
        if not class_level:
            problems.append("missing class")
        if not subject:
            problems.append("missing subject")
        if not chapter:
            problems.append("missing chapter")

        if problems:
            errors.append({"row": i + row_offset, "source_id": src_id, "problems": problems})
            continue

        doc = {"id": str(uuid.uuid4()), "class_level": class_level, "subject": subject,
               "chapter": chapter, "topic": topic, "topics": topics_list,
               "question": question, "options": options,
               "correct_index": correct_index, "explanation": explanation, "difficulty": difficulty,
               "question_type": question_type, "marks": marks, "negative_marks": negative_marks,
               "hint": hint, "tags": tags, "image_url": image_url or None,
               "status": status, "source": source, "source_id": src_id,
               "dedup_key": _dedup_key(question), "created_by": user_id, "created_at": now}

        if _flag_explanation_mismatch(explanation, correct_index):
            doc["status"] = "pending_review"
            doc["flags"] = ["explanation_option_mismatch"]
            flagged += 1

        try:
            await db.question_bank.insert_one(doc)
            imported += 1
        except DuplicateKeyError:
            duplicates += 1

    return {"imported": imported, "duplicates": duplicates, "flagged": flagged,
            "errors": errors, "total_rows": len(raw_questions)}


@api_router.post("/questions/import")
@api_router.post("/questions/import-csv")
async def import_questions(
    file: UploadFile = File(...),
    status: str = Form("active"),
    user: dict = Depends(require_role("teacher", "admin")),
):
    if status not in _VALID_STATUSES:
        status = "active"
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not valid UTF-8 text")

    filename = (file.filename or "").lower()
    if filename.endswith(".json"):
        try:
            data = json.loads(text)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"JSON parse error: {e}")
        if isinstance(data, list):
            q_list = data
            meta = {"status": status}
        elif isinstance(data, dict):
            q_list = data.get("questions") or []
            meta = {
                "class_level": data.get("class_level"),
                "subject": data.get("subject"),
                "chapter": data.get("chapter"),
                "topics": data.get("topics") or ([data.get("topic")] if data.get("topic") else []),
                "status": data.get("status") or status
            }
        else:
            raise HTTPException(status_code=400, detail="JSON must be an array of questions or an object with 'questions'")
        if not q_list:
            raise HTTPException(status_code=400, detail="JSON contains no questions")
        return await _ingest_questions_list(q_list, meta, user["id"], source="json_import", is_csv=False, row_offset=1)

    try:
        rows = list(csv.DictReader(io.StringIO(text)))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV parse error: {e}")
    if not rows:
        raise HTTPException(status_code=400, detail="CSV contains no data rows")

    return await _ingest_questions_list(rows, {"status": status}, user["id"], source="import", is_csv=True, row_offset=2)


@api_router.post("/questions/import-json")
async def import_questions_json(
    body: Union[QuestionBatchImportInput, List[QuestionInput], dict],
    user: dict = Depends(require_role("teacher", "admin")),
):
    """Accepts JSON questions either as QuestionBatchImportInput object or list of questions."""
    if isinstance(body, QuestionBatchImportInput):
        q_list = [q.dict() for q in body.questions]
        meta = {
            "class_level": body.class_level,
            "subject": body.subject,
            "chapter": body.chapter,
            "topics": body.topics or ([body.topic] if body.topic else []),
            "status": body.status or "active"
        }
    elif isinstance(body, list):
        q_list = [q.dict() if hasattr(q, "dict") else q for q in body]
        meta = {"status": "active"}
    elif isinstance(body, dict):
        raw_list = body.get("questions") or []
        q_list = [q.dict() if hasattr(q, "dict") else q for q in raw_list]
        meta = {
            "class_level": body.get("class_level"),
            "subject": body.get("subject"),
            "chapter": body.get("chapter"),
            "topics": body.get("topics") or ([body.get("topic")] if body.get("topic") else []),
            "status": body.get("status") or "active"
        }
    else:
        raise HTTPException(status_code=400, detail="Invalid payload format")

    if not q_list:
        raise HTTPException(status_code=400, detail="No questions provided in payload")

    return await _ingest_questions_list(q_list, meta, user["id"], source="json_import", is_csv=False, row_offset=1)


@api_router.post("/questions/ai-extract")
async def extract_questions_endpoint(
    file: UploadFile = File(...),
    api_key: Optional[str] = Form(None),
    gemini_api_key: Optional[str] = Form(None),
    class_level: str = Form("10"),
    subject: str = Form("Maths"),
    chapter: str = Form(...),
    model: str = Form("gemini-3.8-flash"),
    user: dict = Depends(require_role("teacher", "admin"))
):
    """Teacher provides question paper image/pdf and their Gemini API key.
    Extracts MCQs with topic strictly selected from the chapter's official topics."""
    key = (api_key or gemini_api_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Gemini API key is required.")

    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    if filename.endswith(".pdf") or "pdf" in content_type:
        mime_type = "application/pdf"
    elif filename.endswith((".png", ".jpg", ".jpeg", ".webp")) or any(t in content_type for t in ("png", "jpeg", "jpg", "webp")):
        mime_type = content_type if "image/" in content_type else (mimetypes.guess_type(filename)[0] or "image/jpeg")
    else:
        raise HTTPException(status_code=400, detail="Supported file formats: PDF, PNG, JPG, JPEG, WEBP")

    raw_bytes = await _read_upload_capped(file)
    if not raw_bytes or len(raw_bytes) < 100:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Retrieve approved canonical topics strictly for this class, subject, and chapter
    allowed_topics = CURRICULUM.get(str(class_level), {}).get(subject, {}).get(chapter, [])
    if not allowed_topics:
        allowed_topics = get_canonical_topics(str(class_level), subject, chapter)
    if not allowed_topics:
        raise HTTPException(status_code=400, detail=f"Chapter '{chapter}' not found in curriculum for Class {class_level} {subject}.")

    try:
        questions = await extract_questions_from_media(
            file_bytes=raw_bytes,
            mime_type=mime_type,
            api_key=key,
            class_level=class_level,
            subject=subject,
            chapter=chapter,
            allowed_topics=allowed_topics,
            model=model.strip() or "gemini-3.8-flash"
        )
    except Exception as e:
        logger.error(f"AI question extraction error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    if not questions:
        raise HTTPException(status_code=400, detail="No multiple choice questions could be extracted from this document. Please check clarity.")

    return {
        "questions": questions,
        "count": len(questions),
        "class_level": str(class_level),
        "subject": str(subject),
        "chapter": str(chapter),
        "allowed_topics": allowed_topics
    }


@api_router.get("/questions/hierarchy")
async def get_questions_hierarchy(user: dict = Depends(get_current_user)):
    """Returns dynamic classes, subjects, chapters, and topics present in the active question bank."""
    pipeline = [
        {"$match": {"status": "active"}},
        {"$group": {
            "_id": {
                "class_level": "$class_level",
                "subject": "$subject",
                "chapter": "$chapter"
            },
            "topics": {"$addToSet": "$topic"},
            "topics_arr": {"$push": "$topics"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id.class_level": 1, "_id.subject": 1, "_id.chapter": 1}}
    ]
    cursor = db.question_bank.aggregate(pipeline)
    hierarchy = {}
    async for doc in cursor:
        cl = doc["_id"].get("class_level")
        subj = (doc["_id"].get("subject") or "").strip() or "Unknown"
        chap = (doc["_id"].get("chapter") or "").strip() or "General"
        if not cl:
            continue
        all_topics = set()
        for t in doc.get("topics", []):
            if t:
                all_topics.add(t)
        for t_list in doc.get("topics_arr", []):
            if isinstance(t_list, list):
                for t in t_list:
                    if t:
                        all_topics.add(t)
        if cl not in hierarchy:
            hierarchy[cl] = {}
        if subj not in hierarchy[cl]:
            hierarchy[cl][subj] = []
        hierarchy[cl][subj].append({
            "chapter": chap,
            "topics": sorted(list(all_topics)),
            "count": doc.get("count", 0)
        })
    return hierarchy


@api_router.get("/questions")
async def list_questions(class_level: Optional[str] = None, subject: Optional[str] = None,
                         chapter: Optional[str] = None, topic: Optional[str] = None,
                         chapters: Optional[str] = None,
                         difficulty: Optional[str] = None, status: Optional[str] = None,
                         user: dict = Depends(require_role("teacher", "admin"))):
    q = {}
    if class_level:
        q["class_level"] = _normalize_class(class_level)
    if subject:
        if subject.strip().lower() in ("unknown", ""):
            q["$or"] = [{"subject": ""}, {"subject": None}, {"subject": {"$regex": "^unknown$", "$options": "i"}}]
        else:
            q["subject"] = {"$regex": f"^{re.escape(subject.strip())}$", "$options": "i"}
    if chapters:
        chaps_list = [c.strip() for c in chapters.split(",") if c.strip()]
        if len(chaps_list) == 1:
            q["chapter"] = {"$regex": f"^{re.escape(chaps_list[0])}$", "$options": "i"}
        elif len(chaps_list) > 1:
            q["chapter"] = {"$in": [re.compile(f"^{re.escape(c)}$", re.I) for c in chaps_list]}
    elif chapter:
        q["chapter"] = {"$regex": f"^{re.escape(chapter.strip())}$", "$options": "i"}
    if topic:
        top_rx = {"$regex": f"^{re.escape(topic.strip())}$", "$options": "i"}
        topic_or = [{"topic": top_rx}, {"topics": top_rx}]
        # Combine with an "Unknown subject" $or instead of overwriting it
        if "$or" in q:
            q["$and"] = [{"$or": q.pop("$or")}, {"$or": topic_or}]
        else:
            q["$or"] = topic_or
    if difficulty:
        q["difficulty"] = difficulty
    if status:
        q["status"] = status
        if status == "pending_review" and user["role"] != "admin":
            # A teacher reviews only their own unreviewed imports (they can't approve anyone else's)
            q["created_by"] = user["id"]
    items = await db.question_bank.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items



async def _owned_question(question_id: str, user: dict) -> dict:
    """The bank is shared: a teacher may change or delete only the questions they added; admin any."""
    q = await db.question_bank.find_one({"id": question_id}, {"_id": 0, "id": 1, "created_by": 1})
    if not q:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and q.get("created_by") != user["id"]:
        raise HTTPException(status_code=403, detail="You can only change questions you added")
    return q


@api_router.delete("/questions/{question_id}")
async def delete_question(question_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    await _owned_question(question_id, user)
    res = await db.question_bank.delete_one({"id": question_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


class QuestionReviewInput(BaseModel):
    status: Optional[str] = "active"
    correct_index: Optional[int] = None
    explanation: Optional[str] = None


@api_router.put("/questions/{question_id}/review")
@api_router.patch("/questions/{question_id}")
async def review_question(question_id: str, body: QuestionReviewInput, user: dict = Depends(require_role("teacher", "admin"))):
    await _owned_question(question_id, user)
    update = {"status": body.status}
    if body.correct_index is not None:
        update["correct_index"] = body.correct_index
    if body.explanation is not None:
        update["explanation"] = body.explanation
    if body.status == "active":
        update["flags"] = []
    res = await db.question_bank.update_one({"id": question_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True, "id": question_id, "status": body.status}


# ------------------------- Mastery & diagnostic -------------------------
class DiagnosticInput(BaseModel):
    class_level: Optional[str] = None
    subject: Optional[str] = None
    chapter: Optional[str] = None
    topic: Optional[str] = None
    kind: Optional[str] = "diagnostic"


def _practice_topics(attempts, class_level) -> list:
    """Accuracy per topic from practice tests and diagnostics, shown apart from mastery. No band or
    confirmed flags, so it can't be read as mastery."""
    rows = compute_topic_mastery(attempts, class_level=class_level, include_unattempted=False,
                                 source_weights=PRACTICE_SOURCE_WEIGHTS)
    return [{"subject": t["subject"], "chapter": t["chapter"], "topic": t["topic"], "accuracy": t["score"],
             "attempts": t["attempts"], "last_attempt": t.get("last_attempt")}
            for t in rows if t.get("attempts", 0) > 0]


def _flatten_attempts(subs):
    attempts = []
    for idx, s in enumerate(subs):
        sess_id = s.get("id") or s.get("submission_id") or s.get("created_at") or f"sub_{idx}"
        stud_id = s.get("student_id")
        answers = s.get("answers")
        for i, r in enumerate(s.get("results") or []):
            # kind drives the mastery source weight (class tests count; practice/diagnostics are reported apart)
            attempts.append({**r, "submission_id": sess_id, "student_id": stud_id, "created_at": s.get("created_at"),
                             "answered": is_answered(r, answers, i), "kind": s.get("kind") or "test"})
    return attempts


@api_router.post("/tests/diagnostic")
async def create_diagnostic(body: DiagnosticInput, user: dict = Depends(require_role("student"))):
    class_level = (body.class_level or "").strip() or None
    if not class_level:
        batches = await db.batches.find({"id": {"$in": user.get("batch_ids", [])}}, {"_id": 0}).to_list(10)
        class_level = batches[0]["class_level"] if batches else "9"

    subj = (body.subject or "").strip()
    chap = (body.chapter or "").strip()
    top = (body.topic or "").strip()

    if top or chap or subj:
        class_level, subj, chap, top, _ = normalize_taxonomy(class_level, subj, chap, top, [])
    is_targeted = bool(top or chap)
    kind = "dpp" if is_targeted else (body.kind or "diagnostic")

    # Resume an unfinished sprint for the same target instead of creating another test document each click
    now = datetime.now(timezone.utc)
    async for t in db.tests.find({"student_id": user["id"], "kind": kind, "class_level": class_level, "subject": subj,
                                  "chapter": chap, "topic": top, "valid_until": {"$gt": now.isoformat()},
                                  **TEST_NOT_DELETED}, {"_id": 0, "id": 1, "title": 1, "question_count": 1}
                                 ).sort("created_at", -1).limit(1):
        if not await db.submissions.find_one({"test_id": t["id"], "student_id": user["id"]}, {"_id": 1}):
            return {"id": t["id"], "status": "ready", "question_count": t.get("question_count"),
                    "title": t["title"], "resumed": True}

    # Backstop against scripted flooding (each sprint is a stored test). Only *unfinished* sprints count, so a
    # student who keeps completing sprints is never blocked.
    day_start = datetime.now(APP_TIMEZONE).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    todays = [t["id"] async for t in db.tests.find(
        {"student_id": user["id"], "created_at": {"$gte": day_start.isoformat()}}, {"_id": 0, "id": 1})]
    if len(todays) >= MAX_DAILY_SPRINTS:
        finished = set(await db.submissions.distinct("test_id", {"student_id": user["id"], "test_id": {"$in": todays}}))
        if len(todays) - len(finished) >= MAX_DAILY_SPRINTS:
            raise HTTPException(status_code=429, detail="You have too many unfinished practice sprints today. Finish one first.")

    questions = None
    if top or chap or subj:
        if top:
            questions = await _sample_bank_questions(class_level, subj, chap, top, 10)
        if not questions and chap:
            questions = await _sample_bank_questions(class_level, subj, chap, "", 10)
        if not questions and subj:
            questions = await _sample_bank_questions(class_level, subj, "", "", 10)

    if not questions:
        questions = await _sample_bank_questions(class_level, "", "", "", 10)
    if not questions:
        raise HTTPException(status_code=400, detail="No active questions available for a practice sprint")

    title = f"Practice Sprint: {top or chap}" if is_targeted else f"Diagnostic — Class {class_level}"
    doc = {"id": str(uuid.uuid4()), "title": title, "kind": kind,
           "class_level": class_level, "subject": subj, "chapter": chap, "topic": top, "batch_id": None,
           "student_id": user["id"], "duration_minutes": 0, "valid_hours": 168,
           "valid_from": now.isoformat(), "valid_until": (now + timedelta(hours=168)).isoformat(),
           "questions": questions, "status": "ready", "question_count": len(questions),
           "teacher_id": None, "teacher_name": "Targeted Sprint" if is_targeted else "Diagnostic", "created_at": now.isoformat()}
    await db.tests.insert_one(doc)
    return {"id": doc["id"], "status": "ready", "question_count": len(questions), "title": title}


@api_router.get("/mastery/me")
async def my_mastery(full: bool = False, format: str = None, user: dict = Depends(require_role("student"))):
    # Newest first so the 2000 cap drops the oldest (least-weighted) attempts, not the most recent
    subs = await db.submissions.find({"student_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    class_levels = []
    if user.get("class_level"):
        class_levels.append(user["class_level"])
    if user.get("batch_ids"):
        async for b in db.batches.find({"id": {"$in": user["batch_ids"]}}, {"class_level": 1}):
            if b.get("class_level") and b["class_level"] not in class_levels:
                class_levels.append(b["class_level"])
    cl = class_levels if class_levels else None

    attempts = _flatten_attempts(subs)
    s_topics = _extract_syllabus_topics(class_level=cl)
    attempted_topics = compute_topic_mastery(attempts, class_level=cl, syllabus=s_topics, include_unattempted=False)
    summary_data = compute_unattempted_summary(attempted_topics, syllabus=s_topics)

    if full:
        topics = compute_topic_mastery(attempts, class_level=cl, syllabus=s_topics, include_unattempted=True)
    else:
        topics = attempted_topics

    if format == "flat":
        return topics

    return {
        "topics": topics,
        "not_attempted_by_chapter": summary_data["not_attempted_by_chapter"],
        "summary": summary_data["summary"],
        "is_full": full,
        "mastery_source": "class_tests",
        "practice_topics": _practice_topics(attempts, cl),
    }


@api_router.get("/mastery/teacher")
async def teacher_mastery(batch_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await db.batches.find_one({"id": batch_id, **NOT_ARCHIVED}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")

    students_raw = await db.users.find({"role": "student", "batch_ids": batch_id}).to_list(500)
    students = [{"id": str(s["_id"]), "name": s["name"],
                 "is_disabled": batch_id in s.get("disabled_batch_ids", []),
                 "is_blocked": batch_id in s.get("blocked_batch_ids", [])} for s in students_raw]
    student_ids = [s["id"] for s in students]

    test_q = {"$or": [{"batch_id": batch_id}, {"student_id": {"$in": student_ids}}]} if student_ids else {"batch_id": batch_id}
    batch_test_ids = [t["id"] async for t in db.tests.find(test_q, {"id": 1})]
    sub_query = {"student_id": {"$in": student_ids}}
    if batch_test_ids:
        sub_query["$or"] = [{"batch_id": batch_id}, {"test_id": {"$in": batch_test_ids}}]
    else:
        sub_query["batch_id"] = batch_id

    # Class average = mean score of submissions on this batch's own tests (not self-started diagnostics)
    own_test_ids = {t["id"] async for t in db.tests.find({"batch_id": batch_id}, {"_id": 0, "id": 1})}
    own_scores = []
    per_student = {}
    if student_ids:
        cursor = db.submissions.find(sub_query, {"_id": 0}).sort("created_at", -1)
        async for s in cursor:
            per_student.setdefault(s["student_id"], []).extend(_flatten_attempts([s]))
            # Class tests only (practice tests assigned to the batch don't move the class average)
            if (s.get("test_id") in own_test_ids and s.get("score") is not None
                    and source_weight(s.get("kind")) > 0):
                own_scores.append(float(s["score"]))
    class_avg_score = round_half_up(sum(own_scores) / len(own_scores)) if own_scores else None

    batch_class = batch.get("class_level")
    # Compute syllabus union ONCE at the batch level (avoiding O(students * topics) explosion)
    batch_syllabus = _extract_syllabus_topics(class_level=batch_class, subject=batch.get("subject"))

    student_topics = {}
    for sid in student_ids:
        # Pass the batch class so attempts missing subject/chapter are inferred against the right syllabus
        # (class_level=None falls back to searching class 9 before 10). Reuse batch_syllabus and skip the
        # unattempted union so this stays cheap per student.
        mastery = compute_topic_mastery(per_student.get(sid, []), class_level=batch_class,
                                        syllabus=batch_syllabus, include_unattempted=False)
        # Drop not_attempted rows: only retain topics the student actually attempted (attempts > 0)
        active_mastery = [m for m in mastery if m.get("attempts", 0) > 0]
        student_topics[sid] = active_mastery

    # Batch-level weak topics: pool all raw student attempts and run compute_topic_mastery on the batch aggregate
    all_batch_attempts = [a for atts in per_student.values() for a in atts]
    batch_mastery = compute_topic_mastery(
        all_batch_attempts,
        class_level=batch_class,
        syllabus=batch_syllabus,
        subject=batch.get("subject"),
        include_unattempted=False
    )
    # Pooled attempts need more evidence than one student's: require enough distinct students and questions
    active_student_count = sum(1 for sid in student_ids if per_student.get(sid))
    apply_batch_confirmation(batch_mastery, active_student_count)

    weak_topics = []
    for m in batch_mastery:
        if m.get("attempts", 0) > 0:
            weak_topics.append({
                "subject": m["subject"],
                "chapter": m["chapter"],
                "topic": m["topic"],
                "class_avg": m["score"],
                "band": m["band"],
                "is_confirmed_weak": m.get("is_confirmed_weak", False),
                "is_confirmed_strong": m.get("is_confirmed_strong", False),
                "attempts": m["attempts"],
                "sessions": m.get("sessions", m.get("attempts", 0)),
                "students": m.get("students", 0),
                "avg_time_s": m.get("avg_time_s", 0.0),
            })

    def _sort_key(item):
        # Use the batch-level flags directly; is_confirmed_weak(item) would re-derive them from sessions alone
        if item.get("is_confirmed_weak"):
            order_val = 0
        elif item.get("is_confirmed_strong"):
            order_val = 2
        else:
            order_val = 1
        return (order_val, item["class_avg"], item["subject"], item["chapter"], item["topic"])

    weak_topics.sort(key=_sort_key)

    # Separate unattempted syllabus topics into not_attempted_topics to avoid bloating weak_topics
    seen_batch_keys = {
        (normalize_key(w["subject"]), normalize_key(w["chapter"]), normalize_key(w["topic"]))
        for w in weak_topics
    }
    not_attempted_topics = []
    for st in batch_syllabus:
        s_key = (normalize_key(st["subject"]), normalize_key(st["chapter"]), normalize_key(st["topic"]))
        if s_key not in seen_batch_keys:
            seen_batch_keys.add(s_key)
            not_attempted_topics.append({
                "subject": st["subject"],
                "chapter": st["chapter"],
                "topic": st["topic"],
                "class_avg": 0,
                "band": "not_attempted",
                "is_confirmed_weak": False,
                "attempts": 0
            })

    # Combined needs_attention list with a clear reason field ("weak" | "untested")
    needs_attention = [
        {**w, "reason": "weak"}
        for w in weak_topics
        if w.get("is_confirmed_weak")
    ] + [
        {**nt, "reason": "untested"}
        for nt in not_attempted_topics
    ]

    # Ingestion quality signal: scan full topic set across all batch attempts (without subject filtering)
    # so unclassified topics that are strong/developing are reliably surfaced
    all_batch_topics = compute_topic_mastery(
        all_batch_attempts,
        class_level=batch_class,
        syllabus=batch_syllabus,
        include_unattempted=False
    )
    full_topics = all_batch_topics if all_batch_topics else [t for st in student_topics.values() for t in st]
    ingestion_quality = get_ingestion_quality_summary(full_topics)

    return {"students": [{"id": s["id"], "name": s["name"],
                          "is_disabled": s.get("is_disabled", False),
                          "is_blocked": s.get("is_blocked", False),
                          "topics": student_topics.get(s["id"], [])}
                         for s in students],
            "weak_topics": weak_topics,
            "not_attempted_topics": not_attempted_topics,
            "needs_attention": needs_attention,
            "ingestion_quality": ingestion_quality,
            "class_avg_score": class_avg_score,
            "class_avg_submissions": len(own_scores)}


@api_router.get("/mastery/teacher/student/{student_id}")
async def teacher_student_mastery(student_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    if not ObjectId.is_valid(student_id):
        raise HTTPException(status_code=404, detail="Student not found")
    student = await db.users.find_one({"_id": ObjectId(student_id), "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Privacy / Authorization check: requesting teacher must own at least one batch the student belongs to (or admin)
    if user["role"] != "admin":
        student_bids = student.get("batch_ids", [])
        if not student_bids:
            raise HTTPException(status_code=403, detail="You do not teach this student")
        shares_batch = await db.batches.find_one({
            "id": {"$in": student_bids},
            "teacher_id": user["id"],
            **NOT_ARCHIVED
        })
        if not shares_batch:
            raise HTTPException(status_code=403, detail="You do not teach this student")

    sub_q = {"student_id": student_id}
    if user["role"] != "admin":
        # Only this teacher's tests plus the student's own self-started diagnostics/sprints (no teacher);
        # a student's results in another teacher's batch are not this teacher's to see
        visible_test_ids = [t["id"] async for t in db.tests.find(
            {"$or": [{"teacher_id": user["id"]}, {"student_id": student_id, "teacher_id": None}]}, {"_id": 0, "id": 1})]
        sub_q["test_id"] = {"$in": visible_test_ids}
    subs = await db.submissions.find(sub_q, {"_id": 0}).sort("created_at", -1).to_list(500)
    class_levels = []
    if student.get("class_level"):
        class_levels.append(student["class_level"])
    if student.get("batch_ids"):
        async for b in db.batches.find({"id": {"$in": student.get("batch_ids")}}, {"class_level": 1}):
            if b.get("class_level") and b["class_level"] not in class_levels:
                class_levels.append(b["class_level"])
    cl = class_levels if class_levels else None
    attempts = _flatten_attempts(subs)
    topics = compute_topic_mastery(attempts, class_level=cl)
    practice_topics = _practice_topics(attempts, cl)
    ingestion_quality = get_ingestion_quality_summary(topics)
    trend = [{"test_id": s["test_id"], "title": s.get("title", ""), "kind": s.get("kind", ""),
              "score": s.get("score"), "correct": s.get("correct"), "total": s.get("total"),
              "tab_switches": s.get("tab_switches", 0), "created_at": s.get("created_at")}
             for s in subs[:50]]
    return {"student": {"id": str(student["_id"]), "name": student["name"]},
            "topics": topics, "trend": trend, "ingestion_quality": ingestion_quality,
            "mastery_source": "class_tests", "practice_topics": practice_topics}


# Stored files are served only through routes that check access (e.g. /resources/{id}/download). A generic
# /media/{path} route served any key to any user (and, on local storage, any file on disk); it was removed.


# ------------------------- Stats -------------------------
@api_router.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    if user["role"] == "student":
        subs = await db.submissions.find({"student_id": user["id"]}, {"_id": 0, "created_at": 1, "score": 1, "kind": 1}).to_list(1000)
        test_subs = [s for s in subs if s.get("kind") == "test"]
        avg = round(sum(s.get("score", 0) for s in test_subs) / len(test_subs), 1) if test_subs else 0
        # Only batches the student can actually open (not disabled/blocked there)
        student_batches = active_batch_ids(user)
        batch_docs = await db.batches.find({"id": {"$in": student_batches}, **NOT_ARCHIVED}, {"_id": 0, "class_level": 1}).to_list(20)
        class_levels = sorted({b["class_level"] for b in batch_docs if b.get("class_level")}, key=lambda c: (len(str(c)), str(c)))
        # "Class Notes" in the app are uploaded materials; count the ones this student can open
        note_count = await db.resources.count_documents({"is_deleted": False, "batch_id": {"$in": student_batches}})

        # Calculate real practice streak from submission created_at dates
        active_dates = set()
        for s in subs:
            ca = s.get("created_at")
            if ca:
                try:
                    dt = datetime.fromisoformat(ca.replace("Z", "+00:00"))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    active_dates.add(dt.astimezone(APP_TIMEZONE).date())
                except Exception:
                    pass

        today = datetime.now(APP_TIMEZONE).date()
        yesterday = today - timedelta(days=1)
        streak_days = 0
        if today in active_dates:
            chk = today
            while chk in active_dates:
                streak_days += 1
                chk -= timedelta(days=1)
        elif yesterday in active_dates:
            chk = yesterday
            while chk in active_dates:
                streak_days += 1
                chk -= timedelta(days=1)

        # Active status for current week (Monday through Sunday)
        week_start = today - timedelta(days=today.weekday())
        active_week_days = [
            ((week_start + timedelta(days=i)) in active_dates)
            for i in range(7)
        ]

        return {
            "tests_taken": len(test_subs),
            "avg_score": avg,
            "batches": len(batch_docs),
            "notes": note_count,
            "streak_days": streak_days,
            "active_week_days": active_week_days,
            "class_levels": class_levels,
            "active_batch_ids": student_batches,
        }
    q = {} if user["role"] == "admin" else {"teacher_id": user["id"]}
    if user["role"] == "admin":
        student_count = await db.users.count_documents({"role": "student"})
        enrollment_pipeline = [
            {"$match": {"role": "student", "batch_ids.0": {"$exists": True}}},
            {"$unwind": "$batch_ids"},
            {"$count": "total"}
        ]
        total_enrollments = 0
        async for doc in db.users.aggregate(enrollment_pipeline):
            total_enrollments = doc["total"]
    else:
        teacher_batches = [b["id"] async for b in db.batches.find({"teacher_id": user["id"], **NOT_ARCHIVED}, {"id": 1})]
        if teacher_batches:
            student_count = await db.users.count_documents({"role": "student", "batch_ids": {"$in": teacher_batches}})
            enrollment_pipeline = [
                {"$match": {"role": "student", "batch_ids": {"$in": teacher_batches}}},
                {"$unwind": "$batch_ids"},
                {"$match": {"batch_ids": {"$in": teacher_batches}}},
                {"$count": "total"}
            ]
            total_enrollments = 0
            async for doc in db.users.aggregate(enrollment_pipeline):
                total_enrollments = doc["total"]
        else:
            student_count = 0
            total_enrollments = 0

    return {"notes": await db.resources.count_documents({**q, "is_deleted": False}),
            "tests": await db.tests.count_documents({**q, "kind": "test", "is_active": {"$ne": False}, **TEST_NOT_DELETED}),
            "dpps": await db.tests.count_documents({**q, "kind": "dpp", "is_active": {"$ne": False}, **TEST_NOT_DELETED}),
            "batches": await db.batches.count_documents({**(q if user["role"] == "admin" else {"teacher_id": user["id"]}), **NOT_ARCHIVED}),
            "students": student_count,
            "enrollments": total_enrollments}


@api_router.get("/batches/{batch_id}/topper")
async def batch_topper(batch_id: str, user: dict = Depends(get_current_user)):
    user_role = user.get("role")
    if user_role not in ["student", "teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to access this batch")

    batch = await db.batches.find_one({"id": batch_id, **NOT_ARCHIVED}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if user_role == "student":
        if batch_id not in active_batch_ids(user):
            raise HTTPException(status_code=403, detail="Not authorized to access this batch")
    elif user_role == "teacher":
        if batch.get("teacher_id") != user["id"]:
            raise HTTPException(status_code=403, detail="You do not own this batch")

    students = await db.users.find({"role": "student", "batch_ids": batch_id}, {"_id": 1, "name": 1}).to_list(500)
    student_map = {str(s["_id"]): s.get("name", "Student") for s in students}
    for s in students:
        if "id" in s:
            student_map[str(s["id"])] = s.get("name", "Student")

    if not student_map:
        return {"topper": None}

    s_keys = list(student_map.keys())
    test_q = {"$or": [{"batch_id": batch_id}, {"student_id": {"$in": s_keys}}]} if s_keys else {"batch_id": batch_id}
    batch_test_ids = [t["id"] async for t in db.tests.find(test_q, {"id": 1})]
    sub_query = {"student_id": {"$in": s_keys}}
    if batch_test_ids:
        sub_query["$or"] = [{"batch_id": batch_id}, {"test_id": {"$in": batch_test_ids}}]
    else:
        sub_query["batch_id"] = batch_id

    cursor = db.submissions.find(
        sub_query,
        {"_id": 0, "student_id": 1, "student_name": 1, "score": 1, "created_at": 1}
    ).sort("created_at", -1)

    student_stats = {}
    async for sub in cursor:
        sid = sub.get("student_id")
        if not sid:
            continue
        if sid not in student_stats:
            sname = sub.get("student_name") or student_map.get(sid, "Student")
            student_stats[sid] = {"name": sname, "scores": [], "dates": set()}
        student_stats[sid]["scores"].append(sub.get("score", 0))
        ca = sub.get("created_at")
        if ca:
            try:
                dt = datetime.fromisoformat(ca.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                student_stats[sid]["dates"].add(dt.astimezone(APP_TIMEZONE).date())
            except Exception:
                pass

    if not student_stats:
        return {"topper": None}

    toppers = []
    today = datetime.now(APP_TIMEZONE).date()
    yesterday = today - timedelta(days=1)
    for sid, data in student_stats.items():
        if not data["scores"]:
            continue
        total_score = round(sum(data["scores"]), 1)
        avg = sum(data["scores"]) / len(data["scores"])
        streak = 0
        active_dates = data["dates"]
        if today in active_dates:
            chk = today
            while chk in active_dates:
                streak += 1
                chk -= timedelta(days=1)
        elif yesterday in active_dates:
            chk = yesterday
            while chk in active_dates:
                streak += 1
                chk -= timedelta(days=1)

        toppers.append({
            "student_id": sid,
            "name": data["name"],
            "batch_name": batch.get("name", "Batch"),
            "total_score": total_score,
            "avg_score": round_half_up(avg, 1),
            "accuracy": round_half_up(avg),
            "tests_taken": len(data["scores"]),
            "streak_days": streak,
        })

    for sid, name in student_map.items():
        if sid not in student_stats:
            toppers.append({
                "student_id": sid,
                "name": name,
                "batch_name": batch.get("name", "Batch"),
                "total_score": 0.0,
                "avg_score": 0.0,
                "accuracy": 0,
                "tests_taken": 0,
                "streak_days": 0,
            })

    if not toppers:
        return {"topper": None, "leaderboard": []}

    toppers.sort(key=lambda t: (t["total_score"], t["avg_score"], t["tests_taken"], t["streak_days"]), reverse=True)
    for idx, t in enumerate(toppers):
        t["rank"] = idx + 1
    top_student = toppers[0] if toppers and toppers[0]["tests_taken"] > 0 else None
    return {"topper": top_student, "leaderboard": toppers}


@api_router.get("/admin/teachers")
async def list_teacher_accounts(status: str = "pending", _: dict = Depends(require_role("admin"))):
    """Teacher sign-ups by approval status (pending / approved / rejected). Accounts from before approval
    existed have no teacher_status and are listed as approved."""
    if status not in ("pending", "approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be pending, approved or rejected")
    q = {"role": "teacher"}
    q["teacher_status"] = {"$in": ["approved", None]} if status == "approved" else status
    users = await db.users.find(q, {"name": 1, "email": 1, "created_at": 1, "teacher_status": 1,
                                    "teacher_decided_at": 1}).sort("created_at", -1).to_list(500)
    return [{"id": str(u["_id"]), "name": u.get("name"), "email": u.get("email"), "created_at": u.get("created_at"),
             "status": u.get("teacher_status") or "approved", "decided_at": u.get("teacher_decided_at")} for u in users]


@api_router.post("/admin/teachers/{user_id}/{decision}")
async def decide_teacher_account(user_id: str, decision: str, admin: dict = Depends(require_role("admin"))):
    if decision not in ("approve", "reject"):
        raise HTTPException(status_code=404, detail="Unknown action")
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user id")
    new_status = "approved" if decision == "approve" else "rejected"
    res = await db.users.update_one(
        {"_id": ObjectId(user_id), "role": "teacher"},
        {"$set": {"teacher_status": new_status, "teacher_decided_at": datetime.now(timezone.utc).isoformat(),
                  "teacher_decided_by": admin["id"]}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Teacher account not found")
    return {"id": user_id, "status": new_status}


@api_router.delete("/admin/students/{student_id}")
async def delete_student_data(student_id: str, _: dict = Depends(require_role("admin"))):
    """Permanently erase a student's account and everything recorded about them (a data deletion request).
    The account goes last, so a failure part-way can simply be retried."""
    if not ObjectId.is_valid(student_id):
        raise HTTPException(status_code=400, detail="Invalid student id")
    student = await db.users.find_one({"_id": ObjectId(student_id), "role": "student"}, {"email": 1})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    removed = {}
    for coll in ("submissions", "submissions_duplicates", "test_submissions", "topic_mastery", "test_starts",
                 "join_requests", "batch_fees", "tests"):  # in `tests`, only their own diagnostics have a student_id
        removed[coll] = (await db[coll].delete_many({"student_id": student_id})).deleted_count
    await db.tests.update_many({"$or": [{"makeups.student_id": student_id}, {"excused_student_ids": student_id}]},
                               {"$pull": {"makeups": {"student_id": student_id}, "excused_student_ids": student_id}})
    await db.batches.update_many({"$or": [{"student_ids": student_id}, {"archived_student_ids": student_id}]},
                                 {"$pull": {"student_ids": student_id, "archived_student_ids": student_id}})
    await db.password_resets.delete_many({"user_id": student_id})
    await db.auth_limits.delete_many({"key": {"$in": [f"login:email:{student['email']}", f"forgot:email:{student['email']}"]}})
    await db.users.delete_one({"_id": ObjectId(student_id)})
    logger.info(f"Deleted student {student_id}: {removed}")
    return {"success": True, "removed": removed}


@api_router.get("/admin/data-source-status", response_model=DataSourceStatusResponse)
async def data_source_status(_: dict = Depends(require_claim_role("admin"))):
    """Admin-only Atlas connection status."""
    status = await atlas_connection_status(force=True)
    if not status["available"]:
        return DataSourceStatusResponse(
            available=False,
            message=ATLAS_UNAVAILABLE_MESSAGE,
            checked_at=status["checked_at"],
        )
    return DataSourceStatusResponse(available=True, message="Atlas connected.", checked_at=status["checked_at"])


@api_router.get("/curriculum")
async def get_curriculum():
    """Returns the standardized CBSE NCERT curriculum taxonomy."""
    return CURRICULUM


@api_router.get("/curriculum/prompt")
async def get_curriculum_prompt(
    class_level: str = Query(...),
    subject: str = Query(...),
    chapter: str = Query(...)
):
    """Generates a prompt with approved topics to give to Gemini."""
    prompt = generate_gemini_prompt(class_level, subject, chapter)
    topics = get_canonical_topics(class_level, subject, chapter)
    return {
        "prompt": prompt,
        "topics": topics,
        "class_level": class_level,
        "subject": subject,
        "chapter": chapter
    }


app.include_router(api_router)
_cors_origins = (os.environ.get('CORS_ORIGINS') or "http://localhost:3000,http://127.0.0.1:3000").strip()
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=[o.strip() for o in _cors_origins.split(',') if o.strip()],
                   allow_methods=["*"], allow_headers=["*"])


CATALOG = {
    "9": {
        "Maths": list(CURRICULUM["9"]["Maths"].keys()),
        "Science": list(CURRICULUM["9"]["Science"].keys()),
        "Social Science": ["The French Revolution", "Physical Features of India", "Democracy in the Contemporary World"],
        "English": ["Prose - The Fun They Had", "Poetry - The Road Not Taken", "Grammar and Writing"],
        "Hindi": ["गद्य - दो बैलों की कथा", "पद्य - सूरदास के पद", "व्याकरण"]
    },
    "10": {
        "Maths": list(CURRICULUM["10"]["Maths"].keys()),
        "Science": list(CURRICULUM["10"]["Science"].keys()),
        "Social Science": ["The Rise of Nationalism in Europe", "Resources and Development", "Power Sharing"],
        "English": ["A Letter to God", "Nelson Mandela", "Reading Comprehension"],
        "Hindi": ["कबीर की साखियाँ", "पत्र लेखन", "व्याकरण"]
    },
}


@app.on_event("startup")
async def startup():
    # Auto-submit class-test attempts whose time ran out with the tab closed (autosaved answers are kept).
    # Started first: the loop survives a database outage, and tests must still close if Atlas was down at boot.
    asyncio.create_task(_auto_submit_loop())
    status = await atlas_connection_status(force=True)
    if not status["available"]:
        logger.error("MongoDB Atlas unavailable at startup; database-backed routes are fail-closed")
        return
    # (collection, keys, options). Lookups by `id` and roster queries on users.batch_ids run on almost
    # every request; without these indexes each one scanned the whole collection.
    indexes = [
        ("users", "email", {"unique": True}),
        ("users", "batch_ids", {}),
        ("batches", "id", {"unique": True}),
        ("batches", [("teacher_id", 1), ("created_at", -1)], {}),
        ("submissions", [("test_id", 1), ("student_id", 1)], {}),
        ("submissions", [("student_id", 1), ("created_at", -1)], {}),
        ("submissions", "id", {}),
        ("question_bank", "dedup_key", {"unique": True}),
        ("question_bank", "id", {"unique": True}),
        ("question_bank", [("class_level", 1), ("subject", 1), ("chapter", 1)], {}),
        ("question_bank", [("status", 1), ("created_at", -1)], {}),
        ("tests", "id", {"unique": True}),
        ("tests", [("teacher_id", 1), ("kind", 1), ("created_at", -1)], {}),
        ("tests", [("kind", 1), ("status", 1), ("created_at", -1)], {}),
        ("tests", [("batch_id", 1), ("status", 1)], {}),
        ("tests", "student_id", {"sparse": True}),
        ("resources", "id", {"unique": True}),
        ("auth_limits", [("key", 1), ("at", -1)], {}),
        ("auth_limits", "expire_at", {"expireAfterSeconds": 0}),
        ("password_resets", "token_hash", {"unique": True}),
        ("password_resets", "expire_at", {"expireAfterSeconds": 0}),
    ]
    for coll, keys, opts in indexes:
        try:
            await db[coll].create_index(keys, **opts)
        except Exception as e:
            logger.error(f"index {coll} {keys}: {e}")
    try:
        # Deduplicate any duplicate (batch_id, student_id) in batch_fees before unique index
        pipeline = [
            {"$group": {"_id": {"batch_id": "$batch_id", "student_id": "$student_id"}, "count": {"$sum": 1}, "docs": {"$push": "$_id"}}},
            {"$match": {"count": {"$gt": 1}}}
        ]
        async for dup in db.batch_fees.aggregate(pipeline):
            for doc_id in dup["docs"][1:]:
                await db.batch_fees.delete_one({"_id": doc_id})
        await db.batch_fees.create_index([("batch_id", 1), ("student_id", 1)], unique=True)
    except Exception as e:
        logger.error(f"batch_fees unique index: {e}")
    try:
        # Deduplicate any duplicate batch codes before unique index
        pipeline = [
            {"$group": {"_id": "$code", "count": {"$sum": 1}, "docs": {"$push": "$_id"}}},
            {"$match": {"count": {"$gt": 1}}}
        ]
        async for dup in db.batches.aggregate(pipeline):
            for doc_id in dup["docs"][1:]:
                new_c = secrets.token_hex(4).upper()
                while await db.batches.find_one({"code": new_c}):
                    new_c = secrets.token_hex(4).upper()
                await db.batches.update_one({"_id": doc_id}, {"$set": {"code": new_c}})
        await db.batches.create_index("code", unique=True)
    except Exception as e:
        logger.error(f"batches unique code index: {e}")
    try:
        # One submission per student per class test, enforced by the database (concurrent submits used to
        # store several). Existing duplicates are moved aside (keeping the earliest) so the index can build.
        async for dup in db.submissions.aggregate([
            {"$match": {"kind": "test"}},
            {"$sort": {"created_at": 1}},
            {"$group": {"_id": {"t": "$test_id", "s": "$student_id"}, "ids": {"$push": "$_id"}, "n": {"$sum": 1}}},
            {"$match": {"n": {"$gt": 1}}}]):
            extras = dup["ids"][1:]
            async for doc in db.submissions.find({"_id": {"$in": extras}}):
                await db.submissions_duplicates.insert_one(doc)
            await db.submissions.delete_many({"_id": {"$in": extras}})
            logger.warning(f"moved {len(extras)} duplicate class-test submissions to submissions_duplicates: {dup['_id']}")
        await db.submissions.create_index([("test_id", 1), ("student_id", 1)], unique=True,
                                          partialFilterExpression={"kind": "test"}, name="one_class_test_attempt")
    except Exception as e:
        logger.error(f"class-test unique submission index: {e}")
    try:
        await db.test_starts.create_index([("test_id", 1), ("student_id", 1)], unique=True)
    except Exception as e:
        logger.error(f"test_starts index: {e}")
    try:
        await db.join_requests.create_index([("batch_id", 1), ("student_id", 1)], unique=True)
        await db.join_requests.create_index([("student_id", 1), ("status", 1)])
    except Exception as e:
        logger.error(f"join_requests indexes: {e}")
    # Seed the admin once. No default password (a known default is a public admin login), and an existing
    # admin's password is never overwritten unless ADMIN_PASSWORD_RESET=1 is set for a one-off recovery.
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@vidya.com").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD")
    existing = await db.users.find_one({"email": admin_email})
    if not admin_pw:
        if existing is None:
            logger.error("ADMIN_PASSWORD is not set: no admin account was created")
    elif existing is None:
        try:
            await db.users.insert_one({"name": "Admin", "email": admin_email,
                                       "password_hash": hash_password(admin_pw), "role": "admin",
                                       "batch_ids": [], "created_at": datetime.now(timezone.utc).isoformat()})
        except DuplicateKeyError:
            pass  # another worker starting at the same moment got there first
    elif os.environ.get("ADMIN_PASSWORD_RESET") == "1" and not verify_password(admin_pw, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pw)}})
        logger.warning("Admin password reset from ADMIN_PASSWORD (ADMIN_PASSWORD_RESET=1); unset it now")
    # Open practice tests used to be stored with no batch; "all" is now the only open audience
    try:
        migrated = await db.tests.update_many(
            {"kind": "dpp", "batch_id": {"$in": [None, ""]}, "student_id": None, "is_draft": {"$ne": True},
             "valid_until": {"$ne": None}, "batch_name": {"$ne": "Saved / Unassigned"}},
            {"$set": {"batch_id": "all", "batch_name": "All Students"}})
        if migrated.modified_count:
            logger.info(f"Moved {migrated.modified_count} open tests to the 'all' audience")
    except Exception as e:
        logger.error(f"open-audience migration: {e}")
    # Recover any tests left mid-build if the worker restarted
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
        await db.tests.update_many({"status": "processing", "created_at": {"$lt": cutoff}},
                                   {"$set": {"status": "failed", "error": "build interrupted"}})
    except Exception as e:
        logger.error(f"test sweep failed: {e}")
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    # Auto-seed question bank if empty
    await seed_default_questions()
    # Normalize taxonomy on existing bank questions to prevent topic forks
    await normalize_existing_question_bank()


async def seed_default_questions():
    try:
        count = await db.question_bank.count_documents({})
        if count > 0:
            return
        seed_path = ROOT_DIR / "seed" / "sample_questions.csv"
        if not seed_path.exists():
            return
        with open(seed_path, "r", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        now = datetime.now(timezone.utc).isoformat()
        admin = await db.users.find_one({"role": "admin"})
        admin_id = str(admin["_id"]) if admin else "system"
        inserted = 0
        for i, row in enumerate(rows):
            src_id = (row.get("ID") or "").strip() or str(i + 1)
            question = (row.get("Question") or "").strip()
            options = [(row.get("Option A") or "").strip(),
                       (row.get("Option B") or "").strip(),
                       (row.get("Option C") or "").strip(),
                       (row.get("Option D") or "").strip()]
            class_level, subject, chapter, topic, topics_list = normalize_taxonomy(
                row.get("Class"), row.get("Subject"), row.get("Chapter"), row.get("Topic"), []
            )
            explanation = (row.get("Explanation") or "").strip()
            difficulty = _normalize_difficulty(row.get("Difficulty") or "")
            correct_index = _normalize_correct_option(row.get("Correct Option") or "")
            if not question or any(not o for o in options) or correct_index is None:
                continue
            doc = {"id": str(uuid.uuid4()), "class_level": class_level, "subject": subject,
                   "chapter": chapter, "topic": topic, "topics": topics_list,
                   "question": question, "options": options,
                   "correct_index": correct_index, "explanation": explanation, "difficulty": difficulty,
                   "status": "active", "source": "seed", "source_id": src_id,
                   "dedup_key": _dedup_key(question), "created_by": admin_id, "created_at": now}
            try:
                await db.question_bank.insert_one(doc)
                inserted += 1
            except Exception:
                pass
        logger.info(f"Seeded {inserted} sample questions into question_bank")
    except Exception as e:
        logger.error(f"Failed to seed sample questions: {e}")


async def normalize_existing_question_bank():
    """Ensure all existing questions in question_bank have normalized taxonomy and inherited subject tags."""
    try:
        cursor = db.question_bank.find({}, {"_id": 1, "class_level": 1, "subject": 1, "chapter": 1, "topic": 1, "topics": 1})
        async for doc in cursor:
            cl, s, c, t, ts = normalize_taxonomy(
                doc.get("class_level"), doc.get("subject"), doc.get("chapter"), doc.get("topic"), doc.get("topics")
            )
            update = {}
            if s and s != doc.get("subject"):
                update["subject"] = s
            if c and c != doc.get("chapter"):
                update["chapter"] = c
            if t and t != doc.get("topic"):
                update["topic"] = t
            if ts and ts != doc.get("topics"):
                update["topics"] = ts
            if update:
                await db.question_bank.update_one({"_id": doc["_id"]}, {"$set": update})
    except Exception as e:
        logger.error(f"Error normalizing existing question bank: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
