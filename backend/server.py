"""VidyaLab API entrypoint (FastAPI). Routes + startup; core logic lives in modules."""
import os
import uuid
import json
import io
import secrets
import asyncio
import csv
import hashlib
import random
import re
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any, Union
from decimal import Decimal, ROUND_HALF_UP

from bson import ObjectId
from pymongo.errors import DuplicateKeyError, PyMongoError
from pydantic import BaseModel

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, Query, Header, Request
from fastapi.responses import Response, JSONResponse
from urllib.parse import quote
from starlette.middleware.cors import CORSMiddleware

from config import logger, EMERGENT_KEY, DIFFICULTIES, _VALID_STATUSES, ROOT_DIR, APP_NAME, ENABLE_WATERMARKING, APP_TIMEZONE
from db import (db, client, api_router, ATLAS_UNAVAILABLE_MESSAGE, atlas_connection_status,
                mark_atlas_unavailable)
from models import (RegisterInput, LoginInput, BatchInput, BatchUpdateInput, JoinInput, StudentStatusInput, CreateNoteInput, GenerateTestInput,
                    SubmitInput, DataSourceStatusResponse, QuestionInput, QuestionBatchImportInput)
from auth import (hash_password, verify_password, create_access_token, get_current_user, require_role,
                  require_claim_role, user_from_token)
from ai import init_storage, put_object, get_object, delete_object, gen_concept_image, extract_text_from_file, llm_generate_notes
from lib.mastery import compute_topic_mastery
from watermark import apply_watermark, watermarked_media_type, WATERMARKABLE_EXTS
from curriculum import CURRICULUM, get_canonical_topics, generate_gemini_prompt

app = FastAPI()

_DATA_SOURCE_STATUS_PATH = "/api/admin/data-source-status"


@app.middleware("http")
async def atlas_only_guard(request: Request, call_next):
    """Stop all database-backed API flows when Atlas cannot be reached."""
    if request.url.path.startswith("/api") and request.url.path != _DATA_SOURCE_STATUS_PATH:
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

# ------------------------- Auth routes -------------------------
@api_router.post("/auth/register")
async def register(body: RegisterInput):
    email = body.email.lower()
    if body.role not in ("student", "teacher"):
        raise HTTPException(status_code=400, detail="Invalid role")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {"name": body.name, "email": email, "password_hash": hash_password(body.password),
           "role": body.role, "batch_ids": [], "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    token = create_access_token(uid, email, body.role)
    return {"token": token, "user": {"id": uid, "name": body.name, "email": email, "role": body.role, "batch_ids": []}}


@api_router.post("/auth/login")
async def login(body: LoginInput):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Your account has been blocked. Please contact your teacher.")
    if user.get("is_disabled"):
        raise HTTPException(status_code=403, detail="Your account has been disabled. Please contact your teacher.")
    uid = str(user["_id"])
    token = create_access_token(uid, email, user["role"])
    return {"token": token, "user": {"id": uid, "name": user["name"], "email": email,
                                     "role": user["role"], "batch_ids": user.get("batch_ids", []),
                                     "is_disabled": bool(user.get("is_disabled", False)),
                                     "is_blocked": bool(user.get("is_blocked", False))}}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ------------------------- Catalog -------------------------
@api_router.get("/catalog")
async def catalog():
    return CATALOG


# ------------------------- Batches -------------------------
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
    for idx, item in enumerate(schedule):
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail=f"fee_schedule item {idx} must be an object")
        month = item.get("month")
        if not month or not isinstance(month, str) or not month.strip():
            raise HTTPException(status_code=400, detail=f"fee_schedule item {idx} is missing a valid 'month' key")
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


async def _check_join_rate_limit(user_id: str, client_ip: str, max_attempts: int = 10, window_seconds: int = 60) -> bool:
    now = time.time()
    cutoff = now - window_seconds
    async with _join_rate_limit_lock:
        keys = [f"user:{user_id}"]
        if client_ip and client_ip not in ("unknown", "", "127.0.0.1", "localhost"):
            keys.append(f"ip:{client_ip}")
        for k in keys:
            _join_attempts[k] = [t for t in _join_attempts[k] if t > cutoff]
            if len(_join_attempts[k]) >= max_attempts:
                return False
        for k in keys:
            _join_attempts[k].append(now)
        return True


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

    academic_year = body.academic_year or get_current_academic_year()

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
            "class_level": body.class_level,
            "fee_amount": fee_amount,
            "monthly_fee": monthly_fee,
            "fee_schedule": fee_schedule,
            "academic_year": academic_year,
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
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
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
        update_fields["class_level"] = body.class_level

    if body.fee_amount is not None and float(body.fee_amount) < 0:
        raise HTTPException(status_code=400, detail="Fee amount cannot be negative")
    if body.monthly_fee is not None and float(body.monthly_fee) < 0:
        raise HTTPException(status_code=400, detail="Monthly fee cannot be negative")

    academic_year = body.academic_year or batch.get("academic_year") or get_current_academic_year()
    if body.academic_year:
        update_fields["academic_year"] = body.academic_year

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

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.batches.update_one({"id": batch_id}, {"$set": update_fields})

    # When batch fees change, update all batch_fees records that don't have a custom override
    if fee_changed:
        new_fee_amount = update_fields["fee_amount"]
        new_schedule = update_fields["fee_schedule"]
        cursor = db.batch_fees.find({"batch_id": batch_id, "is_custom_fee": {"$ne": True}})
        async for r in cursor:
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
                }}
            )

    updated = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    return updated


@api_router.delete("/batches/{batch_id}")
async def delete_batch(batch_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await db.batches.find_one({"id": batch_id})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")

    # Delete batch document
    await db.batches.delete_one({"id": batch_id})

    # Remove batch_id from all enrolled students
    await db.users.update_many(
        {"batch_ids": batch_id},
        {"$pull": {
            "batch_ids": batch_id,
            "disabled_batch_ids": batch_id,
            "blocked_batch_ids": batch_id
        }}
    )

    # Delete fee records for this batch
    await db.batch_fees.delete_many({"batch_id": batch_id})

    return {"success": True, "id": batch_id, "message": f"Batch '{batch.get('name')}' deleted successfully."}


@api_router.get("/batches")
async def list_batches(user: dict = Depends(get_current_user)):
    if user["role"] in ("teacher", "admin"):
        q = {} if user["role"] == "admin" else {"teacher_id": user["id"]}
    else:
        blocked_batch_ids = set(user.get("blocked_batch_ids", []))
        student_bids = [bid for bid in user.get("batch_ids", []) if bid not in blocked_batch_ids]
        q = {"id": {"$in": student_bids}}
    batches = [b async for b in db.batches.find(q, {"_id": 0})]
    if not batches:
        return []
    batch_ids = [b["id"] for b in batches]
    counts = {}
    pipeline = [
        {"$match": {"batch_ids": {"$in": batch_ids}}},
        {"$unwind": "$batch_ids"},
        {"$match": {"batch_ids": {"$in": batch_ids}}},
        {"$group": {"_id": "$batch_ids", "count": {"$sum": 1}}},
    ]
    async for doc in db.users.aggregate(pipeline):
        counts[doc["_id"]] = doc["count"]
    for b in batches:
        b["student_count"] = counts.get(b["id"], 0)
    if user["role"] == "student":
        return [_sanitize_batch_for_student(b) for b in batches]
    return batches


@api_router.post("/batches/join")
async def join_batch(body: JoinInput, request: Request, user: dict = Depends(require_role("student"))):
    client_ip = request.client.host if request.client else "unknown"
    if not await _check_join_rate_limit(user["id"], client_ip, max_attempts=10, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many join attempts. Please try again later.")

    batch = await db.batches.find_one({"code": body.code.upper().strip()}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Invalid batch code")
    if batch["id"] in user.get("blocked_batch_ids", []):
        raise HTTPException(status_code=403, detail="You are blocked from joining this batch")
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$addToSet": {"batch_ids": batch["id"]}})
    return _sanitize_batch_for_student(batch)


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


@api_router.get("/batches/{batch_id}/students")
async def list_batch_students(batch_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
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

    for s in students:
        sid = str(s["_id"])
        fee = fee_records.get(sid)
        if fee:
            if fee.get("is_custom_fee"):
                t_fee = float(fee.get("total_fee", batch_default_fee))
                custom_student_schedule = fee.get("fee_schedule")
            else:
                t_fee = batch_default_fee
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
            last_date = payments[-1].get("date") if payments else fee.get("last_payment_date")
        else:
            t_fee = batch_default_fee
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

        # Resolve student-specific schedule proportionally or from custom schedule
        if custom_student_schedule and len(custom_student_schedule) > 0:
            student_schedule = custom_student_schedule
        elif abs(t_fee - batch_default_fee) > 0.01:
            student_schedule = get_proportional_schedule(schedule, t_fee)
        else:
            student_schedule = schedule

        # Recompute allocations, paid_months, monthly_status purely from payments + schedule
        unmarked_months = fee.get("unmarked_months", []) if fee else []
        derived = _derive_fee_allocation(payments, student_schedule, unmarked_months=unmarked_months)
        monthly_status = derived["monthly_status"]
        collected_months = derived["collected_months"]
        partial_months = derived["partial_months"]
        due_months = derived["due_months"]
        paid_months_list = derived["paid_months"]

        is_student_disabled = (batch_id in s.get("disabled_batch_ids", [])) or bool(s.get("is_disabled", False))
        is_student_blocked = (batch_id in s.get("blocked_batch_ids", [])) or bool(s.get("is_blocked", False))

        results.append({
            "id": sid,
            "name": s.get("name", "Unnamed Student"),
            "email": s.get("email", ""),
            "is_disabled": is_student_disabled,
            "is_blocked": is_student_blocked,
            "joined_at": s.get("created_at"),
            "total_fee": t_fee,
            "paid_fee": p_fee,
            "due_fee": d_fee,
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
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
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
            datetime.fromisoformat(cleaned_date)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid payment_date format. Expected ISO 8601 format.")

    # Validate fee_schedule if provided
    if body.fee_schedule is not None:
        validate_fee_schedule(body.fee_schedule, batch.get("academic_year"))

    idem_key = (
        body.idempotency_key
        or request.headers.get("x-idempotency-key")
        or request.headers.get("idempotency-key")
        or ""
    ).strip()

    lock = await _get_fee_lock(batch_id, student_id)
    async with lock:
        record = await db.batch_fees.find_one({"batch_id": batch_id, "student_id": student_id}, {"_id": 0})
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
        schedule = batch.get("fee_schedule") or get_batch_default_schedule(batch_default_fee, batch_monthly_fee_val, batch.get("academic_year"))

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
        if body.fee_schedule and len(body.fee_schedule) > 0:
            student_schedule = body.fee_schedule
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

        total_fee_paise = to_paise(total_fee)
        current_paid_paise = sum(to_paise(p.get("amount", 0.0)) for p in payments)
        remaining_due_paise = max(0, total_fee_paise - current_paid_paise)
        unmarked_months = list(record.get("unmarked_months", [])) if record else []

        if body.unmark_month:
            month_to_remove = body.unmark_month.strip()
            if month_to_remove not in unmarked_months:
                unmarked_months.append(month_to_remove)
            month_item = next((it for it in student_schedule if it["month"] == month_to_remove), None)
            sched_amt = float(month_item.get("amount", 0.0)) if month_item else round(total_fee / 12.0, 2)
            rem_deduct_paise = to_paise(sched_amt)
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

        await db.batch_fees.update_one(
            {"batch_id": batch_id, "student_id": student_id},
            {"$set": update_doc},
            upsert=True
        )

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


@api_router.post("/batches/{batch_id}/students/{student_id}/status")
@api_router.put("/batches/{batch_id}/students/{student_id}/status")
async def update_student_status(
    batch_id: str,
    student_id: str,
    body: StudentStatusInput,
    user: dict = Depends(require_role("teacher", "admin"))
):
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
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
    curr_disabled_in_batch = (batch_id in disabled_batch_ids) or bool(student.get("is_disabled", False))
    curr_blocked_in_batch = (batch_id in blocked_batch_ids) or bool(student.get("is_blocked", False))

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

    # Only regenerate code if student is transitioning to blocked and was NOT already blocked in this batch
    regenerate_batch_code = (new_blocked and not curr_blocked_in_batch)

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

    if regenerate_batch_code:
        new_batch_code = await generate_unique_batch_code()
        await db.batches.update_one(
            {"id": batch_id},
            {"$set": {"code": new_batch_code, "updated_at": now_iso}}
        )
        updated_batches.append({"batch_id": batch_id, "new_code": new_batch_code})

        # Also regenerate any other batches of THIS teacher that the student was enrolled in.
        # MUST filter by this teacher's teacher_id so other teachers' batch codes are never touched!
        teacher_id = batch.get("teacher_id")
        other_batches = await db.batches.find(
            {"id": {"$in": student_batch_ids, "$ne": batch_id}, "teacher_id": teacher_id},
            {"_id": 0}
        ).to_list(100)
        for ob in other_batches:
            ob_code = await generate_unique_batch_code()
            await db.batches.update_one(
                {"id": ob["id"]},
                {"$set": {"code": ob_code, "updated_at": now_iso}}
            )
            updated_batches.append({"batch_id": ob["id"], "new_code": ob_code})

    # Check whether the student is enrolled in batches belonging to OTHER teachers
    student_batches = await db.batches.find(
        {"id": {"$in": student_batch_ids}},
        {"_id": 0, "id": 1, "teacher_id": 1}
    ).to_list(100)
    has_other_teacher_batches = any(b.get("teacher_id") != batch.get("teacher_id") for b in student_batches)

    # Set user-level is_disabled / is_blocked ONLY if student has no other teachers' batches.
    # If student has other teachers, do not lock them out globally!
    user_updates = {
        "disabled_batch_ids": list(disabled_batch_ids),
        "blocked_batch_ids": list(blocked_batch_ids),
        "updated_at": now_iso
    }
    if not has_other_teacher_batches:
        user_updates["is_disabled"] = bool(disabled_batch_ids)
        user_updates["is_blocked"] = bool(blocked_batch_ids)
    else:
        user_updates["is_disabled"] = False
        user_updates["is_blocked"] = False

    await db.users.update_one({"_id": ObjectId(student_id)}, {"$set": user_updates})

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
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
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

    # Clean up fee records for this student and batch
    await db.batch_fees.delete_many({"batch_id": batch_id, "student_id": student_id})

    # Update user level is_disabled / is_blocked if no remaining disabled/blocked batches
    refreshed_student = await db.users.find_one({"_id": ObjectId(student_id)})
    if refreshed_student:
        rem_disabled = refreshed_student.get("disabled_batch_ids", [])
        rem_blocked = refreshed_student.get("blocked_batch_ids", [])
        await db.users.update_one(
            {"_id": ObjectId(student_id)},
            {
                "$set": {
                    "is_disabled": bool(rem_disabled),
                    "is_blocked": bool(rem_blocked)
                }
            }
        )

    return {
        "success": True,
        "message": f"Student {student.get('name', 'Student')} removed from batch successfully",
        "batch_id": batch_id,
        "student_id": student_id
    }


# ------------------------- Notes -------------------------
@api_router.post("/extract")
async def extract(file: UploadFile = File(...), user: dict = Depends(require_role("teacher", "admin"))):
    data = await file.read()
    text = extract_text_from_file(file.filename, data)
    return {"text": text, "filename": file.filename}


@api_router.post("/notes")
async def create_note(body: CreateNoteInput, user: dict = Depends(require_role("teacher", "admin"))):
    sections = [s.dict() for s in body.sections] if body.sections else []
    if not sections:
        if body.raw_text and body.raw_text.strip():
            sections = [{"heading": "Overview", "content": body.raw_text.strip()}]
        else:
            raise HTTPException(status_code=400, detail="At least one section or content is required")

    batch_id = body.batch_id if body.batch_id and body.batch_id != "all" else None
    batch_name = None
    if batch_id:
        batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
        if not batch:
            raise HTTPException(status_code=400, detail="Invalid batch selected")
        if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
            raise HTTPException(status_code=403, detail="You do not own this batch")
        batch_name = batch.get("name")

    note_id = str(uuid.uuid4())
    doc = {"id": note_id, "title": body.title or "Untitled",
           "class_level": body.class_level, "subject": body.subject, "chapter": body.chapter,
           "topic": body.topic or "", "batch_id": batch_id, "batch_name": batch_name,
           "intro": body.intro or "", "sections": sections,
           "quick_revision": body.quick_revision or [],
           "key_terms": body.key_terms or [],
           "status": "ready",
           "teacher_id": user["id"], "teacher_name": user["name"],
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.notes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/notes")
async def list_notes(class_level: Optional[str] = None, subject: Optional[str] = None,
                     chapter: Optional[str] = None, batch_id: Optional[str] = None,
                     user: dict = Depends(get_current_user)):
    q = {}
    if user["role"] == "teacher":
        q["teacher_id"] = user["id"]
        if batch_id:
            if batch_id == "general":
                q["$or"] = [{"batch_id": None}, {"batch_id": ""}, {"batch_id": {"$exists": False}}]
            else:
                q["batch_id"] = batch_id
    elif user["role"] == "student":
        student_batches = user.get("batch_ids", [])
        # Student can only access notes scoped to their enrolled batches OR general notes
        q["$or"] = [
            {"batch_id": {"$in": student_batches}},
            {"batch_id": None},
            {"batch_id": ""},
            {"batch_id": {"$exists": False}}
        ]
        if batch_id:
            if batch_id in student_batches:
                q["batch_id"] = batch_id
            else:
                raise HTTPException(status_code=403, detail="You are not enrolled in this batch")
    else:
        # admin
        if batch_id:
            q["batch_id"] = batch_id

    if class_level:
        q["class_level"] = class_level
    if subject:
        q["subject"] = subject
    if chapter:
        q["chapter"] = chapter
    notes = await db.notes.find(q, {"_id": 0, "sections": 0}).sort("created_at", -1).to_list(500)
    return notes


@api_router.get("/notes/{note_id}")
async def get_note(note_id: str, user: dict = Depends(get_current_user)):
    note = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if user["role"] == "student":
        note_batch = note.get("batch_id")
        if note_batch and note_batch not in user.get("batch_ids", []):
            raise HTTPException(
                status_code=403,
                detail="Access denied. This note is restricted to another batch."
            )
    elif user["role"] == "teacher":
        if user["role"] != "admin" and note.get("teacher_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Forbidden")

    return note


@api_router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    note = await db.notes.find_one({"id": note_id})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if user["role"] != "admin" and note.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.notes.delete_one({"id": note_id})
    return {"status": "deleted", "id": note_id}


class UpdateNoteInput(BaseModel):
    title: Optional[str] = None
    class_level: Optional[str] = None
    subject: Optional[str] = None
    chapter: Optional[str] = None
    topic: Optional[str] = None
    batch_id: Optional[str] = None


@api_router.patch("/notes/{note_id}")
async def update_note(note_id: str, body: UpdateNoteInput, user: dict = Depends(require_role("teacher", "admin"))):
    note = await db.notes.find_one({"id": note_id})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if user["role"] != "admin" and note.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    # Resolve batch_name when batch_id is being updated
    if "batch_id" in updates:
        if updates["batch_id"] in ("", "all", None):
            updates["batch_id"] = None
            updates["batch_name"] = None
        else:
            batch = await db.batches.find_one({"id": updates["batch_id"]}, {"_id": 0})
            if not batch:
                raise HTTPException(status_code=400, detail="Invalid batch")
            updates["batch_name"] = batch.get("name")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.notes.update_one({"id": note_id}, {"$set": updates})
    updated = await db.notes.find_one({"id": note_id}, {"_id": 0, "sections": 0})
    return updated


# ------------------------- Materials (direct uploads, no AI) -------------------------
_MIME = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
         "webp": "image/webp", "gif": "image/gif", "txt": "text/plain",
         "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}

# Extensions browsers render inline safely (PDF + raster images + plain text);
# everything else on the allowlist (docx/pptx) downloads as an attachment.
_PREVIEW_INLINE = {"pdf", "png", "jpg", "jpeg", "webp", "gif", "txt"}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


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
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
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
    ct = _MIME[ext]  # derived from the allowlisted extension; never trust the client's content_type
    path = f"{APP_NAME}/resources/{user['id']}/{uuid.uuid4()}.{ext}"
    put_object(path, data, ct)
    doc = {"id": str(uuid.uuid4()), "title": title, "batch_id": batch_id, "batch_name": batch["name"],
           "class_level": class_level, "subject": subject, "chapter": chapter, "topic": topic,
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
        q["batch_id"] = {"$in": user.get("batch_ids", [])}
    items = await db.resources.find(q, {"_id": 0, "storage_path": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.delete("/resources/{res_id}")
async def delete_resource(res_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    res = await db.resources.find_one({"id": res_id}, {"_id": 0})
    if not res:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and res["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your resource")
    await db.resources.update_one({"id": res_id}, {"$set": {"is_deleted": True}})
    try:
        delete_object(res["storage_path"])  # best-effort; soft-delete must not fail on storage errors
    except Exception as e:
        logger.warning(f"storage delete failed for {res_id}: {e}")
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
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if "batch_id" in updates:
        if updates["batch_id"] in ("", "all", None):
            updates["batch_id"] = None
            updates["batch_name"] = None
        else:
            batch = await db.batches.find_one({"id": updates["batch_id"]}, {"_id": 0})
            if not batch:
                raise HTTPException(status_code=400, detail="Invalid batch")
            if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
                raise HTTPException(status_code=403, detail="You do not own this batch")
            updates["batch_name"] = batch.get("name")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.resources.update_one({"id": res_id}, {"$set": updates})
    updated = await db.resources.find_one({"id": res_id}, {"_id": 0, "storage_path": 0})
    return updated


@api_router.get("/resources/{res_id}/file")
async def download_resource(res_id: str, authorization: str = Header(None), auth: Optional[str] = None):
    # Support both Bearer header and ?auth= query param (for direct links)
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await user_from_token(token)
    res = await db.resources.find_one({"id": res_id, "is_deleted": False}, {"_id": 0})
    if not res:
        raise HTTPException(status_code=404, detail="Not found")
    allowed = (user["role"] == "admin" or res["teacher_id"] == user["id"]
               or (user["role"] == "student" and res["batch_id"] in user.get("batch_ids", [])))
    if not allowed:
        raise HTTPException(status_code=403, detail="No access to this file")
    content, ct = get_object(res["storage_path"])
    filename = res.get("filename") or "download"
    ext = (filename.rsplit(".", 1)[-1].lower() if "." in filename else "")
    media_type = res.get("content_type", ct)

    if ENABLE_WATERMARKING and user["role"] == "student" and ext in WATERMARKABLE_EXTS:
        content = apply_watermark(content, ext, user.get("name"), user.get("email"))
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
                return {
                    "id": x.get("id"),
                    "question": x["question"],
                    "options": x["options"],
                    "correct_index": x["correct_index"],
                    "explanation": x.get("explanation", ""),
                    "subject": x.get("subject", ""),
                    "chapter": x.get("chapter", ""),
                    "topic": x.get("topic", ""),
                    "topics": topics_val,
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
            raise ValueError("No active questions available for this selection")
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
    if body.question_ids and len(body.question_ids) > 0:
        count = len(body.question_ids)
    else:
        if body.question_count < 1:
            raise HTTPException(status_code=400, detail="question_count must be at least 1")
        count = body.question_count
    now = datetime.now(timezone.utc)
    valid_from = now  # MVP: tests go live immediately (activate_now is a no-op)
    chap_name = body.chapter or ""
    active_chaps = body.chapters or ([chap_name] if chap_name else [])
    if active_chaps and not chap_name:
        chap_name = ", ".join(active_chaps)
    batch_val = body.batch_id
    is_draft = body.is_draft if body.is_draft is not None else (body.is_active is False or not body.activate_now)
    if batch_val in ("template", "none"):
        batch_val = None
        is_draft = True
    elif batch_val in ("all", ""):
        batch_val = None if (body.kind == "dpp" or is_draft) else "all"

    batch_name = None
    if batch_val and batch_val != "all":
        b_doc = await db.batches.find_one({"id": batch_val}, {"name": 1})
        if b_doc:
            batch_name = b_doc.get("name")
    elif batch_val == "all":
        batch_name = "All Students"
    elif not batch_val:
        batch_name = "Saved / Unassigned" if body.kind == "test" else None

    is_act = False if is_draft else (body.is_active if body.is_active is not None else body.activate_now)

    valid_from_val = None if is_draft else valid_from.isoformat()
    valid_until_val = None if is_draft else (valid_from + timedelta(hours=body.valid_hours)).isoformat()

    doc = {"id": str(uuid.uuid4()), "title": body.title, "kind": body.kind,
           "class_level": body.class_level, "subject": body.subject, "chapter": chap_name,
           "chapters": active_chaps,
           "topic": body.topic or "", "batch_id": batch_val, "batch_name": batch_name,
           "duration_minutes": body.duration_minutes, "valid_hours": body.valid_hours,
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
    grading can reconstruct the same mapping without extra storage."""
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
        return {
            "question": x["question"],
            "options": x["options"],
            "correct_index": x["correct_index"],
            "explanation": x.get("explanation", ""),
            "subject": x.get("subject", ""),
            "chapter": x.get("chapter", ""),
            "topic": x.get("topic", ""),
            "topics": topics_val,
            "difficulty": x.get("difficulty", "medium"),
            "question_type": x.get("question_type", "single_choice"),
            "marks": x.get("marks", 1.0),
            "negative_marks": x.get("negative_marks", 0.0),
            "hint": x.get("hint", ""),
            "tags": x.get("tags", [])
        }

    active_chapters = [c for c in (chapters or ([chapter] if chapter else [])) if c]

    if kind == "dpp":
        # Chapterwise test: return questions for the chapter, sorted topicwise
        q = {"class_level": class_level, "status": "active"}
        if subject:
            q["subject"] = subject
        if len(active_chapters) == 1:
            q["chapter"] = active_chapters[0]
        elif len(active_chapters) > 1:
            q["chapter"] = {"$in": active_chapters}
        if topic:
            q["$or"] = [{"topic": topic}, {"topics": topic}]
        chapter_questions = await db.question_bank.find(q, {"_id": 0}).sort([("topic", 1), ("created_at", 1)]).to_list(1000)
        if not chapter_questions and topic:
            q_no_topic = {"class_level": class_level, "status": "active"}
            if subject:
                q_no_topic["subject"] = subject
            if len(active_chapters) == 1:
                q_no_topic["chapter"] = active_chapters[0]
            elif len(active_chapters) > 1:
                q_no_topic["chapter"] = {"$in": active_chapters}
            chapter_questions = await db.question_bank.find(q_no_topic, {"_id": 0}).sort([("topic", 1), ("created_at", 1)]).to_list(1000)
        if chapter_questions:
            if count and count > 0 and len(chapter_questions) > count:
                chapter_questions = chapter_questions[:count]
            if len(active_chapters) > 1:
                random.shuffle(chapter_questions)
            return [_format_q(x) for x in chapter_questions]

    q = {"class_level": class_level, "status": "active"}
    if subject:
        q["subject"] = subject
    if len(active_chapters) == 1:
        q["chapter"] = active_chapters[0]
    elif len(active_chapters) > 1:
        q["chapter"] = {"$in": active_chapters}
    if topic:
        q["$or"] = [{"topic": topic}, {"topics": topic}]
    pool = await db.question_bank.find(q, {"_id": 0}).to_list(1000)
    if not pool and topic:
        q_no_topic = {"class_level": class_level, "status": "active"}
        if subject:
            q_no_topic["subject"] = subject
        if len(active_chapters) == 1:
            q_no_topic["chapter"] = active_chapters[0]
        elif len(active_chapters) > 1:
            q_no_topic["chapter"] = {"$in": active_chapters}
        pool = await db.question_bank.find(q_no_topic, {"_id": 0}).to_list(1000)
    if not pool and chapter:
        q_subject = {"class_level": class_level, "status": "active"}
        if subject:
            q_subject["subject"] = subject
        pool = await db.question_bank.find(q_subject, {"_id": 0}).to_list(1000)
    if not pool:
        pool = await db.question_bank.find({"class_level": class_level, "status": "active"}, {"_id": 0}).to_list(1000)
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


def _strip_answers(test: dict, student_id: str) -> dict:
    t = dict(test)
    questions = t.get("questions", [])
    t["question_count"] = len(questions)
    out = []
    is_dpp = t.get("kind") == "dpp"
    for i, q in enumerate(questions):
        order = _shuffled_order(_option_seed(t["id"], student_id, i))
        out.append({
            "question": q["question"],
            "options": [q["options"][j] for j in order],
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
    q = {}
    if kind:
        q["kind"] = kind
    if user["role"] == "teacher":
        q["teacher_id"] = user["id"]
        tests = await db.tests.find(q, {"_id": 0, "questions": 0}).sort("created_at", -1).to_list(500)
        for t in tests:
            t["is_active"] = t.get("is_active", True) is not False
            is_draft = bool(t.get("is_draft") or (t.get("is_active") is False and (not t.get("valid_until") or t.get("batch_name") == "Saved / Unassigned")))
            t["is_draft"] = is_draft
        return tests
    if user["role"] == "student":
        q["status"] = "ready"
        if kind == "diagnostic":
            q["student_id"] = user["id"]
        elif kind == "dpp":
            user_batches = user.get("batch_ids", [])
            q["$or"] = [
                {"batch_id": None},
                {"batch_id": ""},
                {"batch_id": "all"},
                {"batch_id": {"$in": user_batches}}
            ]
        else:
            q["batch_id"] = {"$in": user.get("batch_ids", [])}
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
        if is_draft:
            time_valid = False
        else:
            try:
                vu = datetime.fromisoformat(t["valid_until"])
                vf = datetime.fromisoformat(t["valid_from"]) if t.get("valid_from") else now - timedelta(days=1)
                time_valid = (vf <= now <= vu)
            except Exception:
                time_valid = True

        sub = subs_by_test.get(t["id"])
        is_ready = t.get("status") == "ready"
        manually_active = t.get("is_active", True) is not False
        q_count = t.get("question_count")
        if q_count is None:
            q_count = len(t.get("questions", []))
        out.append({"id": t["id"], "title": t["title"], "kind": t["kind"], "subject": t["subject"],
                    "chapter": t["chapter"], "topic": t["topic"], "class_level": t["class_level"],
                    "duration_minutes": t.get("duration_minutes", 0), "question_count": q_count,
                    "valid_from": t.get("valid_from"), "valid_until": t.get("valid_until"),
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
    q = {"is_active": {"$ne": False}, "status": "ready"}
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


@api_router.get("/tests/{test_id}")
async def get_test(test_id: str, user: dict = Depends(get_current_user)):
    test = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] == "student":
        if test.get("is_active", True) is False:
            raise HTTPException(status_code=403, detail="This test is currently inactive or closed by your teacher.")
        if test.get("status") != "ready":
            raise HTTPException(status_code=403, detail="This test is still building or has failed.")
        now = datetime.now(timezone.utc)
        if test.get("valid_from") and test.get("valid_until"):
            try:
                vf = datetime.fromisoformat(test["valid_from"])
                vu = datetime.fromisoformat(test["valid_until"])
                if not (vf <= now <= vu):
                    raise HTTPException(status_code=403, detail="This test is not active right now")
            except Exception:
                pass
        if test["kind"] == "test":
            if await db.submissions.find_one({"test_id": test_id, "student_id": user["id"]}):
                raise HTTPException(status_code=403, detail="Already submitted")
        if test["kind"] == "diagnostic" and test.get("student_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Not yours")
        return _strip_answers(test, user["id"])
    return test


@api_router.post("/tests/{test_id}/submit")
async def submit_test(test_id: str, body: SubmitInput, user: dict = Depends(require_role("student"))):
    test = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Not found")
    if test.get("is_active", True) is False:
        raise HTTPException(status_code=403, detail="This test is currently inactive or closed by your teacher.")
    if test["kind"] == "test" and await db.submissions.find_one({"test_id": test_id, "student_id": user["id"]}):
        raise HTTPException(status_code=403, detail="Already submitted")
    questions = test["questions"]
    total = len(questions)

    # Normalize answers to length == total (backward compatible with short/empty lists)
    answers = list(body.answers)
    answers = (answers + [-1] * total)[:total]

    # Normalize per-question times (seconds); default 0.0 for missing entries
    times = [round(float(t), 2) for t in (body.times or [])]
    times = (times + [0.0] * total)[:total]

    tab_switches = max(0, int(body.tab_switches or 0))

    correct = 0
    review = []
    results = []
    for i, q in enumerate(questions):
        # Reconstruct the same per-student option order the student saw.
        order = _shuffled_order(_option_seed(test_id, user["id"], i))
        shuffled_options = [q["options"][j] for j in order]
        chosen = answers[i]                                # index into shuffled options
        correct_display = order.index(q["correct_index"])  # index into shuffled options
        is_ok = chosen == correct_display
        if is_ok:
            correct += 1
        review.append({"question": q["question"], "options": shuffled_options, "chosen": chosen,
                       "correct_index": correct_display, "explanation": q.get("explanation", ""),
                       "is_correct": is_ok, "time_s": times[i],
                       "topic": q.get("topic", test.get("topic", "")),
                       "topics": q.get("topics", []),
                       "difficulty": q.get("difficulty", "medium"),
                       "marks": q.get("marks", 1.0),
                       "negative_marks": q.get("negative_marks", 0.0),
                       "hint": q.get("hint", "")})
        # Per-question result for the mastery engine.
        results.append({"q": i, "subject": q.get("subject", test.get("subject", "")),
                        "chapter": q.get("chapter", test.get("chapter", "")),
                        "topic": q.get("topic", test.get("topic", "")),
                        "topics": q.get("topics", []),
                        "difficulty": q.get("difficulty", "medium"),
                        "is_correct": is_ok, "time_s": times[i]})

    score = round(correct / total * 100) if total else 0
    status = "flagged" if tab_switches >= 3 else "submitted"

    # Compute chapter topic breakdown
    topic_summary_map = {}
    for r in results:
        t_name = r.get("topic") or "General"
        if t_name not in topic_summary_map:
            topic_summary_map[t_name] = {"topic": t_name, "total": 0, "correct": 0}
        topic_summary_map[t_name]["total"] += 1
        if r.get("is_correct"):
            topic_summary_map[t_name]["correct"] += 1
    for t_data in topic_summary_map.values():
        t_data["accuracy"] = round((t_data["correct"] / t_data["total"]) * 100) if t_data["total"] else 0
    topic_summary = list(topic_summary_map.values())

    sub = {"id": str(uuid.uuid4()), "test_id": test_id, "kind": test["kind"], "title": test["title"],
           "student_id": user["id"], "student_name": user["name"],
           "batch_id": test.get("batch_id"),
           "answers": answers, "times": times, "tab_switches": tab_switches,
           "results": results, "topic_summary": topic_summary,
           "score": score, "correct": correct, "total": total, "status": status,
           "created_at": datetime.now(timezone.utc).isoformat()}
    # Tests store a single attempt; DPPs store every attempt for repeat history.
    await db.submissions.insert_one(dict(sub))
    return {"score": score, "correct": correct, "total": total, "review": review,
            "status": status, "topic_summary": topic_summary}


@api_router.get("/tests/{test_id}/leaderboard")
async def leaderboard(test_id: str, user: dict = Depends(get_current_user)):
    subs = await db.submissions.find({"test_id": test_id}, {"_id": 0}).sort("score", -1).to_list(200)
    return [{"student_name": s["student_name"], "score": s["score"], "correct": s["correct"],
             "total": s["total"]} for s in subs]


@api_router.get("/tests/{test_id}/submissions")
async def get_submissions(test_id: str, user: dict = Depends(get_current_user)):
    q = {"test_id": test_id}
    if user["role"] == "student":
        q["student_id"] = user["id"]
    subs = await db.submissions.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return subs


class UpdateTestInput(BaseModel):
    title: Optional[str] = None
    valid_hours: Optional[int] = None  # extend / shrink window from now
    is_active: Optional[bool] = None   # manual toggle
    is_draft: Optional[bool] = None


@api_router.delete("/tests/{test_id}")
async def delete_test(test_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    test = await db.tests.find_one({"id": test_id})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    if user["role"] != "admin" and test.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.tests.delete_one({"id": test_id})
    return {"status": "deleted", "id": test_id}


@api_router.patch("/tests/{test_id}")
async def update_test(test_id: str, body: UpdateTestInput, user: dict = Depends(require_role("teacher", "admin"))):
    test = await db.tests.find_one({"id": test_id})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    if user["role"] != "admin" and test.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    updates = {}
    if body.title is not None:
        updates["title"] = body.title
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
                updates["valid_until"] = (now + timedelta(hours=vh)).isoformat()
                updates["valid_hours"] = vh
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
    orig = await db.tests.find_one({"id": test_id})
    if not orig:
        raise HTTPException(status_code=404, detail="Original test not found")
    if user["role"] != "admin" and orig.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    now = datetime.now(timezone.utc)
    batch_val = body.batch_id if body.batch_id is not None else orig.get("batch_id")
    if batch_val in ("all", ""):
        batch_val = None if orig.get("kind") == "dpp" else "all"

    batch_name = None
    if batch_val and batch_val != "all":
        b_doc = await db.batches.find_one({"id": batch_val}, {"name": 1})
        if b_doc:
            batch_name = b_doc.get("name")
    elif batch_val == "all":
        batch_name = "All Students"

    dur = body.duration_minutes if body.duration_minutes is not None else orig.get("duration_minutes", 0)
    v_hours = body.valid_hours if body.valid_hours is not None else orig.get("valid_hours", 24)
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
        "valid_until": (now + timedelta(hours=v_hours)).isoformat(),
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

        class_level = _normalize_class(raw.get("Class") or raw.get("class_level") or default_meta.get("class_level") or "")
        subject = (raw.get("Subject") or raw.get("subject") or default_meta.get("subject") or "").strip()
        chapter = (raw.get("Chapter") or raw.get("chapter") or default_meta.get("chapter") or "").strip()

        raw_topics = raw.get("topics") or default_meta.get("topics") or []
        if isinstance(raw_topics, str):
            raw_topics = [t.strip() for t in raw_topics.split(",") if t.strip()]
        topic = (raw.get("Topic") or raw.get("topic") or default_meta.get("topic") or "").strip()
        topics_list = [str(t).strip() for t in raw_topics if str(t).strip()]
        if topic and topic not in topics_list:
            topics_list.insert(0, topic)

        # Canonical topic alignment against NCERT syllabus
        canonical_pool = get_canonical_topics(class_level, subject, chapter)
        if canonical_pool:
            canonical_lookup = {c.lower().strip(): c for c in canonical_pool}
            aligned_topics = []
            for t in topics_list:
                cleaned = str(t).strip()
                if cleaned.lower() in canonical_lookup:
                    aligned_topics.append(canonical_lookup[cleaned.lower()])
                else:
                    matched = False
                    for c_low, c_orig in canonical_lookup.items():
                        if cleaned.lower() in c_low or c_low in cleaned.lower():
                            aligned_topics.append(c_orig)
                            matched = True
                            break
                    if not matched:
                        aligned_topics.append(cleaned)
            topics_list = aligned_topics

        if topic and canonical_pool:
            if topic.lower().strip() in canonical_lookup:
                topic = canonical_lookup[topic.lower().strip()]
            elif topics_list:
                topic = topics_list[0]
        elif not topic and topics_list:
            topic = topics_list[0]

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
        raw_tags = raw.get("tags") or []
        if isinstance(raw_tags, str):
            raw_tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
        tags = [str(t).strip() for t in raw_tags if str(t).strip()]

        status = raw.get("status") or default_meta.get("status") or "active"
        if status not in _VALID_STATUSES:
            status = "active"

        problems = []
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
               "hint": hint, "tags": tags,
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
        subj = doc["_id"].get("subject")
        chap = doc["_id"].get("chapter")
        if not cl or not subj or not chap:
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
        q["class_level"] = class_level
    if subject:
        q["subject"] = subject
    if chapters:
        chaps_list = [c.strip() for c in chapters.split(",") if c.strip()]
        if len(chaps_list) == 1:
            q["chapter"] = chaps_list[0]
        elif len(chaps_list) > 1:
            q["chapter"] = {"$in": chaps_list}
    elif chapter:
        q["chapter"] = chapter
    if topic:
        q["$or"] = [{"topic": topic}, {"topics": topic}]
    if difficulty:
        q["difficulty"] = difficulty
    if status:
        q["status"] = status
    items = await db.question_bank.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items



@api_router.delete("/questions/{question_id}")
async def delete_question(question_id: str, user: dict = Depends(require_role("teacher", "admin"))):
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


def _flatten_attempts(subs):
    attempts = []
    for s in subs:
        for r in (s.get("results") or []):
            attempts.append({**r, "created_at": s.get("created_at")})
    return attempts


@api_router.post("/tests/diagnostic")
async def create_diagnostic(body: DiagnosticInput, user: dict = Depends(require_role("student"))):
    class_level = (body.class_level or "").strip() or None
    if not class_level:
        batches = await db.batches.find({"id": {"$in": user.get("batch_ids", [])}}, {"_id": 0}).to_list(10)
        class_level = batches[0]["class_level"] if batches else "9"
    questions = await _sample_bank_questions(class_level, "", "", "", 10)
    if not questions:
        raise HTTPException(status_code=400, detail="No active questions available for a diagnostic")
    now = datetime.now(timezone.utc)
    doc = {"id": str(uuid.uuid4()), "title": f"Diagnostic — Class {class_level}", "kind": "diagnostic",
           "class_level": class_level, "subject": "", "chapter": "", "topic": "", "batch_id": None,
           "student_id": user["id"], "duration_minutes": 0, "valid_hours": 168,
           "valid_from": now.isoformat(), "valid_until": (now + timedelta(hours=168)).isoformat(),
           "questions": questions, "status": "ready", "question_count": len(questions),
           "teacher_id": None, "teacher_name": "Diagnostic", "created_at": now.isoformat()}
    await db.tests.insert_one(doc)
    return {"id": doc["id"], "status": "ready", "question_count": len(questions)}


@api_router.get("/mastery/me")
async def my_mastery(user: dict = Depends(require_role("student"))):
    subs = await db.submissions.find({"student_id": user["id"]}, {"_id": 0}).to_list(2000)
    return compute_topic_mastery(_flatten_attempts(subs))


@api_router.get("/mastery/teacher")
async def teacher_mastery(batch_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")

    students_raw = await db.users.find({"role": "student", "batch_ids": batch_id}).to_list(500)
    students = [{"id": str(s["_id"]), "name": s["name"],
                 "is_disabled": (batch_id in s.get("disabled_batch_ids", [])) or bool(s.get("is_disabled", False)),
                 "is_blocked": (batch_id in s.get("blocked_batch_ids", [])) or bool(s.get("is_blocked", False))} for s in students_raw]
    student_ids = [s["id"] for s in students]

    batch_test_ids = [t["id"] async for t in db.tests.find({"batch_id": batch_id}, {"id": 1})]
    sub_query = {"student_id": {"$in": student_ids}}
    if batch_test_ids:
        sub_query["$or"] = [{"batch_id": batch_id}, {"test_id": {"$in": batch_test_ids}}]
    else:
        sub_query["batch_id"] = batch_id

    per_student = {}
    if student_ids:
        cursor = db.submissions.find(sub_query, {"_id": 0}).sort("created_at", -1)
        async for s in cursor:
            per_student.setdefault(s["student_id"], []).extend(_flatten_attempts([s]))

    topic_scores = {}  # (subject, chapter, topic) -> [scores]
    student_topics = {}
    for sid in student_ids:
        mastery = compute_topic_mastery(per_student.get(sid, []))
        student_topics[sid] = {f"{m['subject']}|{m['chapter']}|{m['topic']}": m for m in mastery}
        for m in mastery:
            topic_scores.setdefault((m["subject"], m["chapter"], m["topic"]), []).append(m["score"])

    weak_topics = [{"subject": k[0], "chapter": k[1], "topic": k[2],
                    "class_avg": round(sum(v) / len(v))}
                   for k, v in topic_scores.items()]
    weak_topics.sort(key=lambda x: x["class_avg"])  # weakest first

    return {"students": [{"id": s["id"], "name": s["name"],
                          "is_disabled": s.get("is_disabled", False),
                          "is_blocked": s.get("is_blocked", False),
                          "topics": list(student_topics.get(s["id"], {}).values())}
                         for s in students],
            "weak_topics": weak_topics}


@api_router.get("/mastery/teacher/student/{student_id}")
async def teacher_student_mastery(student_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    student = await db.users.find_one({"_id": ObjectId(student_id), "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="Not found")
    subs = await db.submissions.find({"student_id": student_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    topics = compute_topic_mastery(_flatten_attempts(subs))
    trend = [{"test_id": s["test_id"], "title": s.get("title", ""), "kind": s.get("kind", ""),
              "score": s.get("score"), "correct": s.get("correct"), "total": s.get("total"),
              "tab_switches": s.get("tab_switches", 0), "created_at": s.get("created_at")}
             for s in subs[:50]]
    return {"student": {"id": str(student["_id"]), "name": student["name"]},
            "topics": topics, "trend": trend}


# ------------------------- Media -------------------------
@api_router.get("/media/{path:path}")
async def media(path: str, user: dict = Depends(get_current_user)):
    try:
        data, ct = get_object(path)
        return Response(content=data, media_type=ct)
    except Exception:
        raise HTTPException(status_code=404, detail="Image not found")


# ------------------------- Stats -------------------------
@api_router.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    if user["role"] == "student":
        subs = await db.submissions.find({"student_id": user["id"]}, {"_id": 0, "created_at": 1, "score": 1, "kind": 1}).to_list(1000)
        test_subs = [s for s in subs if s.get("kind") == "test"]
        avg = round(sum(s.get("score", 0) for s in test_subs) / len(test_subs), 1) if test_subs else 0
        batch_docs = await db.batches.find({"id": {"$in": user.get("batch_ids", [])}}, {"_id": 0, "class_level": 1}).to_list(20)
        class_levels = [b["class_level"] for b in batch_docs]
        student_batches = user.get("batch_ids", [])
        nq = {
            "$or": [
                {"batch_id": {"$in": student_batches}},
                {"batch_id": None},
                {"batch_id": ""},
                {"batch_id": {"$exists": False}}
            ]
        }
        if class_levels:
            nq["class_level"] = {"$in": class_levels}
        note_count = await db.notes.count_documents(nq) if class_levels else 0

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
        }
    q = {} if user["role"] == "admin" else {"teacher_id": user["id"]}
    return {"notes": await db.notes.count_documents(q),
            "tests": await db.tests.count_documents({**q, "kind": "test", "is_active": {"$ne": False}}),
            "dpps": await db.tests.count_documents({**q, "kind": "dpp", "is_active": {"$ne": False}}),
            "batches": await db.batches.count_documents(q if user["role"] == "admin" else {"teacher_id": user["id"]}),
            "students": await db.users.count_documents({"role": "student"})}


@api_router.get("/batches/{batch_id}/topper")
async def batch_topper(batch_id: str, user: dict = Depends(get_current_user)):
    user_role = user.get("role")
    if user_role not in ["student", "teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to access this batch")

    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if user_role == "student":
        if batch_id not in user.get("batch_ids", []):
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

    batch_test_ids = [t["id"] async for t in db.tests.find({"batch_id": batch_id}, {"id": 1})]
    sub_query = {"student_id": {"$in": list(student_map.keys())}}
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
            "avg_score": round(avg, 1),
            "accuracy": round(avg),
            "tests_taken": len(data["scores"]),
            "streak_days": streak,
        })

    if not toppers:
        return {"topper": None}

    toppers.sort(key=lambda t: (t["total_score"], t["avg_score"], t["tests_taken"], t["streak_days"]), reverse=True)
    return {"topper": toppers[0]}


@api_router.get("/admin/data-source-status", response_model=DataSourceStatusResponse)
async def data_source_status(_: dict = Depends(require_claim_role("admin"))):
    """Admin-only Atlas status and a read-only Learning Queue investigation view."""
    status = await atlas_connection_status(force=True)
    if not status["available"]:
        return DataSourceStatusResponse(
            available=False,
            message=ATLAS_UNAVAILABLE_MESSAGE,
            checked_at=status["checked_at"],
        )

    notes = await db.notes.find(
        {},
        {"_id": 0, "id": 1, "title": 1, "status": 1, "teacher_name": 1, "teacher_id": 1,
         "batch_name": 1, "batch_id": 1, "class_level": 1, "subject": 1, "chapter": 1,
         "created_at": 1, "updated_at": 1},
    ).sort("created_at", -1).to_list(500)
    queue = [
        {
            "id": note["id"],
            "title": note.get("title") or "Untitled",
            "status": note.get("status") or "ready",
            "owner_name": note.get("teacher_name") or "Unknown",
            "owner_id": note.get("teacher_id"),
            "batch_name": note.get("batch_name"),
            "batch_id": note.get("batch_id"),
            "class_level": note.get("class_level"),
            "subject": note.get("subject"),
            "chapter": note.get("chapter"),
            "created_at": note.get("created_at"),
            "updated_at": note.get("updated_at"),
        }
        for note in notes
    ]
    return DataSourceStatusResponse(
        available=True,
        message="Atlas connected. Learning Queue records below are read-only for investigation.",
        checked_at=status["checked_at"],
        learning_queue=queue,
    )


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
    status = await atlas_connection_status(force=True)
    if not status["available"]:
        logger.error("MongoDB Atlas unavailable at startup; database-backed routes are fail-closed")
        return
    try:
        await db.users.create_index("email", unique=True)
    except Exception as e:
        logger.error(f"index: {e}")
    try:
        await db.submissions.create_index([("test_id", 1), ("student_id", 1)])
    except Exception as e:
        logger.error(f"submissions index: {e}")
    try:
        await db.question_bank.create_index("dedup_key", unique=True)
    except Exception as e:
        logger.error(f"question_bank dedup index: {e}")
    try:
        await db.question_bank.create_index([("class_level", 1), ("subject", 1), ("chapter", 1)])
    except Exception as e:
        logger.error(f"question_bank filter index: {e}")
    try:
        await db.tests.create_index("id", unique=True)
    except Exception as e:
        logger.error(f"tests id index: {e}")
    try:
        await db.tests.create_index([("teacher_id", 1), ("kind", 1), ("created_at", -1)])
    except Exception as e:
        logger.error(f"tests teacher index: {e}")
    try:
        await db.tests.create_index([("kind", 1), ("status", 1), ("created_at", -1)])
    except Exception as e:
        logger.error(f"tests kind status index: {e}")
    try:
        await db.tests.create_index([("batch_id", 1), ("status", 1)])
    except Exception as e:
        logger.error(f"tests batch index: {e}")
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
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@vidya.com").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({"name": "Admin", "email": admin_email,
                                   "password_hash": hash_password(admin_pw), "role": "admin",
                                   "batch_ids": [], "created_at": datetime.now(timezone.utc).isoformat()})
    elif not verify_password(admin_pw, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pw)}})
    # Recover any notes left mid-generation if the worker restarted
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
        await db.notes.update_many({"status": "processing", "created_at": {"$lt": cutoff}},
                                   {"$set": {"status": "failed", "error": "generation interrupted"}})
    except Exception as e:
        logger.error(f"note sweep failed: {e}")
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
            correct_index = _normalize_correct_option(row.get("Correct Option") or "")
            class_level = _normalize_class(row.get("Class") or "")
            subject = (row.get("Subject") or "").strip()
            chapter = (row.get("Chapter") or "").strip()
            topic = (row.get("Topic") or "").strip()
            explanation = (row.get("Explanation") or "").strip()
            difficulty = _normalize_difficulty(row.get("Difficulty") or "")
            if not question or any(not o for o in options) or correct_index is None:
                continue
            doc = {"id": str(uuid.uuid4()), "class_level": class_level, "subject": subject,
                   "chapter": chapter, "topic": topic, "question": question, "options": options,
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
