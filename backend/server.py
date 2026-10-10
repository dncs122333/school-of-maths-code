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
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from bson import ObjectId
from pymongo.errors import DuplicateKeyError, PyMongoError
from pydantic import BaseModel

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, Query, Header, Request
from fastapi.responses import Response, JSONResponse
from urllib.parse import quote
from starlette.middleware.cors import CORSMiddleware

from config import logger, EMERGENT_KEY, DIFFICULTIES, _VALID_STATUSES, ROOT_DIR, APP_NAME, ENABLE_WATERMARKING
from db import (db, client, api_router, ATLAS_UNAVAILABLE_MESSAGE, atlas_connection_status,
                mark_atlas_unavailable)
from models import (RegisterInput, LoginInput, BatchInput, BatchUpdateInput, JoinInput, StudentStatusInput, CreateNoteInput, GenerateTestInput,
                    SubmitInput, DataSourceStatusResponse)
from auth import (hash_password, verify_password, create_access_token, get_current_user, require_role,
                  require_claim_role, user_from_token)
from ai import init_storage, put_object, get_object, delete_object, gen_concept_image, extract_text_from_file, llm_generate_notes
from lib.mastery import compute_topic_mastery
from watermark import apply_watermark, watermarked_media_type, WATERMARKABLE_EXTS

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


def get_batch_default_schedule(fee_amount: float = 0.0, monthly_fee: float = 0.0):
    amt = 0.0
    if monthly_fee and monthly_fee > 0:
        amt = float(monthly_fee)
    elif fee_amount and fee_amount > 0:
        amt = round(float(fee_amount) / 12.0, 2)
    return [{"month": m, "amount": amt} for m in DEFAULT_ACADEMIC_MONTHS]


def get_proportional_schedule(base_schedule, target_total_fee: float):
    target = round(float(target_total_fee or 0.0), 2)
    if not base_schedule or len(base_schedule) == 0:
        base_schedule = [{"month": m, "amount": 0.0} for m in DEFAULT_ACADEMIC_MONTHS]

    base_sum = sum(float(item.get("amount", 0.0) or 0.0) for item in base_schedule)
    n = len(base_schedule)
    if n == 0:
        return []

    new_schedule = []
    if base_sum > 0:
        allocated = 0.0
        for i, item in enumerate(base_schedule):
            if i == n - 1:
                amt = round(max(0.0, target - allocated), 2)
            else:
                ratio = float(item.get("amount", 0.0) or 0.0) / base_sum
                amt = round(target * ratio, 2)
                allocated += amt
            new_schedule.append({
                "month": item["month"],
                "amount": amt
            })
    else:
        even_amt = round(target / float(n), 2)
        allocated = 0.0
        for i, item in enumerate(base_schedule):
            if i == n - 1:
                amt = round(max(0.0, target - allocated), 2)
            else:
                amt = even_amt
                allocated += amt
            new_schedule.append({
                "month": item["month"],
                "amount": amt
            })
    return new_schedule


def _derive_fee_allocation(payments: list, schedule: list) -> dict:
    """
    Allocates payment amounts sequentially against the fee schedule (waterfall).
    Payments list is the single source of truth.
    Returns:
    {
        "paid_months": [list of fully paid month names],
        "monthly_status": [list of dicts per month],
        "collected_months": [list of fully paid month dicts],
        "partial_months": [list of partial month dicts],
        "due_months": [list of unpaid or partial month dicts]
    }
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
    schedule_map = {item["month"]: float(item.get("amount", 0.0) or 0.0) for item in schedule}
    allocations = {m: 0.0 for m in schedule_months}
    collection_dates = {m: None for m in schedule_months}
    month_notes = {m: "" for m in schedule_months}

    for p in (payments or []):
        amt = float(p.get("amount", 0.0) or 0.0)
        if amt <= 0.0001:
            continue
        p_month = (p.get("month") or "").strip()
        p_date = p.get("date")
        p_note = p.get("notes") or ""

        if p_month and p_month != "All Months":
            raw_targets = [m.strip() for m in p_month.split(",") if m.strip()]
            targets = [m for m in schedule_months if m in raw_targets]
            remaining = [m for m in schedule_months if m not in raw_targets]
            month_order = targets + remaining
        else:
            month_order = list(schedule_months)

        rem = amt
        for m in month_order:
            m_req = schedule_map.get(m, 0.0)
            already = allocations[m]
            needed = max(0.0, round(m_req - already, 2))
            if needed > 0:
                alloc = min(rem, needed)
                allocations[m] = round(allocations[m] + alloc, 2)
                rem = round(rem - alloc, 2)
                if p_date:
                    collection_dates[m] = p_date
                if p_note:
                    month_notes[m] = p_note
                if rem <= 0.001:
                    break

        if rem > 0.001 and month_order:
            last_m = targets[-1] if (p_month and p_month != "All Months" and targets) else schedule_months[-1]
            allocations[last_m] = round(allocations[last_m] + rem, 2)

    monthly_status = []
    collected_months = []
    partial_months = []
    due_months = []
    paid_months = []

    for item in schedule:
        m_name = item["month"]
        m_amt = float(item.get("amount", 0.0) or 0.0)
        alloc = allocations.get(m_name, 0.0)

        is_paid = (alloc >= m_amt - 0.01 and m_amt > 0)
        is_partial = (alloc > 0.009 and not is_paid)
        paid_amt = m_amt if is_paid else alloc
        due_amt = 0.0 if is_paid else max(0.0, round(m_amt - alloc, 2))

        m_info = {
            "month": m_name,
            "amount": m_amt,
            "paid_amount": round(paid_amt, 2),
            "due_amount": round(due_amt, 2),
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


def _derive_paid_months(payments: list, schedule: list) -> list:
    return _derive_fee_allocation(payments, schedule)["paid_months"]


@api_router.post("/batches")
async def create_batch(body: BatchInput, user: dict = Depends(require_role("teacher", "admin"))):
    code = secrets.token_hex(3).upper()
    fee_amount = float(body.fee_amount) if body.fee_amount is not None else 0.0
    monthly_fee = float(body.monthly_fee) if body.monthly_fee is not None else (round(fee_amount / 12.0, 2) if fee_amount > 0 else 0.0)
    fee_schedule = body.fee_schedule if (body.fee_schedule and len(body.fee_schedule) > 0) else get_batch_default_schedule(fee_amount, monthly_fee)

    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "class_level": body.class_level,
        "fee_amount": fee_amount,
        "monthly_fee": monthly_fee,
        "fee_schedule": fee_schedule,
        "code": code,
        "teacher_id": user["id"],
        "teacher_name": user["name"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.batches.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/batches/{batch_id}")
async def update_batch(batch_id: str, body: BatchUpdateInput, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")

    update_fields = {}
    if body.name is not None:
        update_fields["name"] = body.name.strip()
    if body.class_level is not None:
        update_fields["class_level"] = body.class_level
    if body.fee_amount is not None:
        update_fields["fee_amount"] = float(body.fee_amount)
    if body.monthly_fee is not None:
        update_fields["monthly_fee"] = float(body.monthly_fee)
    if body.fee_schedule is not None:
        update_fields["fee_schedule"] = body.fee_schedule
    elif (body.fee_amount is not None or body.monthly_fee is not None) and not batch.get("fee_schedule"):
        f_amt = update_fields.get("fee_amount", batch.get("fee_amount", 0.0))
        m_amt = update_fields.get("monthly_fee", batch.get("monthly_fee", 0.0))
        update_fields["fee_schedule"] = get_batch_default_schedule(f_amt, m_amt)

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.batches.update_one({"id": batch_id}, {"$set": update_fields})

    updated = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    return updated


@api_router.get("/batches")
async def list_batches(user: dict = Depends(get_current_user)):
    if user["role"] in ("teacher", "admin"):
        q = {} if user["role"] == "admin" else {"teacher_id": user["id"]}
    else:
        q = {"id": {"$in": user.get("batch_ids", [])}}
    batches = await db.batches.find(q, {"_id": 0}).to_list(500)
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
    return batches


@api_router.post("/batches/join")
async def join_batch(body: JoinInput, user: dict = Depends(require_role("student"))):
    batch = await db.batches.find_one({"code": body.code.upper().strip()}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Invalid batch code")
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$addToSet": {"batch_ids": batch["id"]}})
    return batch


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


@api_router.get("/batches/{batch_id}/students")
async def list_batch_students(batch_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")

    batch_default_fee = float(batch.get("fee_amount", 0) or 0)
    batch_monthly_fee = float(batch.get("monthly_fee", 0) or 0)
    stored_schedule = batch.get("fee_schedule")

    # Validate stored schedule: if it exists but all amounts match a stale default (5000)
    # while monthly_fee is set to something different, recompute it from monthly_fee
    if stored_schedule and batch_monthly_fee > 0:
        stored_amounts = set(float(it.get("amount", 0)) for it in stored_schedule if it.get("amount") is not None)
        # If all months have the same amount AND it doesn't match monthly_fee, recompute
        if len(stored_amounts) == 1:
            stored_single = next(iter(stored_amounts))
            if abs(stored_single - batch_monthly_fee) > 0.01:
                stored_schedule = get_batch_default_schedule(batch_default_fee, batch_monthly_fee)

    schedule = stored_schedule or get_batch_default_schedule(batch_default_fee, batch_monthly_fee)

    students = await db.users.find({"role": "student", "batch_ids": batch_id}).sort("name", 1).to_list(500)
    student_ids = [str(s["_id"]) for s in students]

    fee_records = {}
    if student_ids:
        records = await db.batch_fees.find({"batch_id": batch_id, "student_id": {"$in": student_ids}}, {"_id": 0}).to_list(1000)
        for r in records:
            fee_records[r["student_id"]] = r

    results = []
    total_collected = 0.0
    total_dues = 0.0

    for s in students:
        sid = str(s["_id"])
        fee = fee_records.get(sid)
        if fee:
            t_fee = float(fee.get("total_fee", batch_default_fee))
            payments = fee.get("payments", [])
            p_fee = round(sum(float(p.get("amount", 0.0)) for p in payments), 2)
            if not payments and float(fee.get("paid_fee", 0.0)) > 0:
                legacy_paid = float(fee.get("paid_fee", 0.0))
                p_fee = legacy_paid
                payments = [{
                    "id": "legacy",
                    "amount": legacy_paid,
                    "date": fee.get("last_payment_date"),
                    "month": "All Months" if legacy_paid >= t_fee else "",
                    "notes": "Imported payment"
                }]
            d_fee = max(0.0, round(t_fee - p_fee, 2))
            status = "paid" if d_fee == 0 and t_fee > 0 else "partial" if p_fee > 0 else "due"
            if t_fee == 0 and p_fee == 0:
                status = "paid"
            last_date = payments[-1].get("date") if payments else fee.get("last_payment_date")
            custom_student_schedule = fee.get("fee_schedule")
        else:
            t_fee = batch_default_fee
            p_fee = 0.0
            d_fee = batch_default_fee
            status = "due"
            payments = []
            last_date = None
            custom_student_schedule = None

        total_collected += p_fee
        total_dues += d_fee

        # Resolve student-specific schedule proportionally or from custom schedule
        if custom_student_schedule and len(custom_student_schedule) > 0:
            student_schedule = custom_student_schedule
        elif abs(t_fee - batch_default_fee) > 0.01:
            student_schedule = get_proportional_schedule(schedule, t_fee)
        else:
            student_schedule = schedule

        # Recompute allocations, paid_months, monthly_status purely from payments + schedule
        derived = _derive_fee_allocation(payments, student_schedule)
        monthly_status = derived["monthly_status"]
        collected_months = derived["collected_months"]
        partial_months = derived["partial_months"]
        due_months = derived["due_months"]
        paid_months_list = derived["paid_months"]

        results.append({
            "id": sid,
            "name": s.get("name", "Unnamed Student"),
            "email": s.get("email", ""),
            "is_disabled": bool(s.get("is_disabled", False)),
            "is_blocked": bool(s.get("is_blocked", False)),
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
            "paid_months": paid_months_list
        })

    return {
        "batch_id": batch_id,
        "batch_name": batch.get("name"),
        "class_level": batch.get("class_level"),
        "fee_amount": batch_default_fee,
        "monthly_fee": batch_monthly_fee,
        "fee_schedule": schedule,
        "students": results,
        "summary": {
            "total_students": len(results),
            "total_collected": total_collected,
            "total_dues": total_dues,
            "paid_count": sum(1 for r in results if r["status"] == "paid"),
            "partial_count": sum(1 for r in results if r["status"] == "partial"),
            "due_count": sum(1 for r in results if r["status"] == "due"),
            "disabled_count": sum(1 for r in results if r.get("is_disabled")),
            "blocked_count": sum(1 for r in results if r.get("is_blocked")),
        }
    }


@api_router.post("/batches/{batch_id}/students/{student_id}/fee")
async def record_student_fee(batch_id: str, student_id: str, body: RecordPaymentInput, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if user["role"] != "admin" and batch.get("teacher_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this batch")

    student = await db.users.find_one({"_id": ObjectId(student_id), "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    batch_default_fee = float(batch.get("fee_amount", 0) or 0)
    batch_monthly_fee_val = float(batch.get("monthly_fee", 0) or 0)
    stored_sched = batch.get("fee_schedule")
    if stored_sched and batch_monthly_fee_val > 0:
        stored_amts = set(float(it.get("amount", 0)) for it in stored_sched if it.get("amount") is not None)
        if len(stored_amts) == 1:
            stored_s = next(iter(stored_amts))
            if abs(stored_s - batch_monthly_fee_val) > 0.01:
                stored_sched = get_batch_default_schedule(batch_default_fee, batch_monthly_fee_val)
    schedule = stored_sched or get_batch_default_schedule(batch_default_fee, batch_monthly_fee_val)
    now_iso = datetime.now(timezone.utc).isoformat()
    payment_date = body.payment_date or now_iso

    record = await db.batch_fees.find_one({"batch_id": batch_id, "student_id": student_id}, {"_id": 0})
    if not record:
        record = {
            "batch_id": batch_id,
            "student_id": student_id,
            "total_fee": batch_default_fee,
            "paid_fee": 0.0,
            "due_fee": batch_default_fee,
            "status": "due",
            "payments": [],
            "paid_months": []
        }

    total_fee = float(body.total_fee) if body.total_fee is not None else float(record.get("total_fee", batch_default_fee))
    payments = list(record.get("payments", []))
    last_date = record.get("last_payment_date")

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

    # Resolve student schedule (custom or proportional)
    if body.fee_schedule and len(body.fee_schedule) > 0:
        student_schedule = body.fee_schedule
    elif record.get("fee_schedule"):
        if body.total_fee is not None and abs(total_fee - float(record.get("total_fee", 0))) > 0.01:
            student_schedule = get_proportional_schedule(record.get("fee_schedule"), total_fee)
        else:
            student_schedule = record.get("fee_schedule")
    elif abs(total_fee - batch_default_fee) > 0.01:
        student_schedule = get_proportional_schedule(schedule, total_fee)
    else:
        student_schedule = schedule

    if body.unmark_month:
        month_to_remove = body.unmark_month.strip()
        month_item = next((it for it in student_schedule if it["month"] == month_to_remove), None)
        sched_amt = float(month_item.get("amount", 0.0)) if month_item else round(total_fee / 12.0, 2)

        rem_deduct = sched_amt
        new_payments = []

        has_covering_payment = any(
            (p.get("month") == "All Months" or month_to_remove in [m.strip() for m in (p.get("month") or "").split(",") if m.strip()])
            for p in payments
        )

        if has_covering_payment:
            for p in payments:
                p_month = (p.get("month") or "").strip()
                p_amt = float(p.get("amount", 0.0))
                is_all = (p_month == "All Months")
                p_months_list = [it["month"] for it in student_schedule] if is_all else [m.strip() for m in p_month.split(",") if m.strip()]

                if month_to_remove in p_months_list and rem_deduct > 0.001:
                    deduct_this = min(rem_deduct, p_amt)
                    new_amt = round(p_amt - deduct_this, 2)
                    rem_deduct = round(rem_deduct - deduct_this, 2)
                    remaining_months = [m for m in p_months_list if m != month_to_remove]
                    if new_amt > 0.001 and remaining_months:
                        p["amount"] = new_amt
                        p["month"] = ", ".join(remaining_months)
                        new_payments.append(p)
                    elif new_amt > 0.001:
                        p["amount"] = new_amt
                        p["month"] = ""
                        new_payments.append(p)
                    # If new_amt <= 0.001, payment is dropped
                else:
                    new_payments.append(p)
        else:
            for p in reversed(payments):
                p_amt = float(p.get("amount", 0.0))
                if rem_deduct > 0.001:
                    deduct_this = min(rem_deduct, p_amt)
                    new_amt = round(p_amt - deduct_this, 2)
                    rem_deduct = round(rem_deduct - deduct_this, 2)
                    p["amount"] = new_amt
                if float(p.get("amount", 0.0)) > 0.001:
                    new_payments.append(p)
            new_payments.reverse()

        payments = new_payments
    elif body.mark_as_paid:
        current_sum = round(sum(float(p.get("amount", 0.0)) for p in payments), 2)
        diff = max(0.0, round(total_fee - current_sum, 2))
        if diff > 0 or not payments:
            payments.append({
                "id": str(uuid.uuid4()),
                "amount": diff if diff > 0 else total_fee,
                "date": payment_date,
                "month": "All Months",
                "notes": body.notes.strip() if body.notes else "Marked as paid in full",
                "recorded_by": user["name"]
            })
            last_date = payment_date
    elif body.is_partial and (body.month or (body.months_paid and len(body.months_paid) > 0)):
        target_months = body.months_paid if (body.months_paid and len(body.months_paid) > 0) else [body.month]
        target_months = [m for m in target_months if m]
        part_amt = float(body.partial_amount if body.partial_amount is not None else (body.amount or 0.0))
        part_amt = round(part_amt, 2)
        payments.append({
            "id": str(uuid.uuid4()),
            "amount": part_amt,
            "date": payment_date,
            "month": ", ".join(target_months),
            "is_partial": True,
            "notes": body.notes.strip() if body.notes else f"Partial payment for {', '.join(target_months)}",
            "recorded_by": user["name"]
        })
        last_date = payment_date
    elif body.paid_fee is not None:
        target_paid = max(0.0, round(float(body.paid_fee), 2))
        if target_paid <= 0.001:
            payments = []
        else:
            current_sum = round(sum(float(p.get("amount", 0.0)) for p in payments), 2)
            diff = round(target_paid - current_sum, 2)
            if diff > 0.001:
                payments.append({
                    "id": str(uuid.uuid4()),
                    "amount": diff,
                    "date": payment_date,
                    "month": "All Months" if target_paid >= total_fee else "",
                    "notes": body.notes.strip() if body.notes else "Direct paid fee adjustment",
                    "recorded_by": user["name"]
                })
                last_date = payment_date
            elif diff < -0.001:
                to_remove = abs(diff)
                for p in reversed(payments):
                    p_amt = float(p.get("amount", 0.0))
                    if p_amt <= to_remove:
                        to_remove = round(to_remove - p_amt, 2)
                        p["amount"] = 0.0
                    else:
                        p["amount"] = round(p_amt - to_remove, 2)
                        to_remove = 0.0
                        break
                payments = [p for p in payments if float(p.get("amount", 0.0)) > 0.001]
    elif body.due_fee is not None:
        target_due = max(0.0, round(float(body.due_fee), 2))
        target_paid = max(0.0, round(total_fee - target_due, 2))
        if target_paid <= 0.001:
            payments = []
        else:
            current_sum = round(sum(float(p.get("amount", 0.0)) for p in payments), 2)
            diff = round(target_paid - current_sum, 2)
            if diff > 0.001:
                payments.append({
                    "id": str(uuid.uuid4()),
                    "amount": diff,
                    "date": payment_date,
                    "month": "All Months" if target_paid >= total_fee else "",
                    "notes": body.notes.strip() if body.notes else "Direct due fee adjustment",
                    "recorded_by": user["name"]
                })
                last_date = payment_date
            elif diff < -0.001:
                to_remove = abs(diff)
                for p in reversed(payments):
                    p_amt = float(p.get("amount", 0.0))
                    if p_amt <= to_remove:
                        to_remove = round(to_remove - p_amt, 2)
                        p["amount"] = 0.0
                    else:
                        p["amount"] = round(p_amt - to_remove, 2)
                        to_remove = 0.0
                        break
                payments = [p for p in payments if float(p.get("amount", 0.0)) > 0.001]
    elif body.month or (body.months_paid and len(body.months_paid) > 0):
        target_months = body.months_paid if (body.months_paid and len(body.months_paid) > 0) else [body.month]
        target_months = [m for m in target_months if m]
        added = 0.0
        if body.amount is not None and body.amount > 0:
            added = float(body.amount)
        else:
            for tm in target_months:
                sch_item = next((it for it in student_schedule if it["month"] == tm), None)
                if sch_item:
                    added += float(sch_item.get("amount", 0.0))
                else:
                    added += round(total_fee / 12.0, 2)
        added = round(added, 2)
        payments.append({
            "id": str(uuid.uuid4()),
            "amount": added,
            "date": payment_date,
            "month": ", ".join(target_months),
            "notes": body.notes.strip() if body.notes else f"Payment for {', '.join(target_months)}",
            "recorded_by": user["name"]
        })
        last_date = payment_date
    elif body.amount is not None and body.amount > 0:
        added = round(float(body.amount), 2)
        payments.append({
            "id": str(uuid.uuid4()),
            "amount": added,
            "date": payment_date,
            "month": body.month or "",
            "notes": body.notes.strip() if body.notes else "Payment received",
            "recorded_by": user["name"]
        })
        last_date = payment_date

    # Invariant: paid_fee == sum(p.amount for p in payments)
    current_paid = round(sum(float(p.get("amount", 0.0)) for p in payments), 2)
    new_due = max(0.0, round(total_fee - current_paid, 2))
    status = "paid" if new_due == 0 and total_fee > 0 else "partial" if current_paid > 0 else "due"
    if total_fee == 0 and current_paid == 0:
        status = "paid"

    # Derive paid_months from payments list + schedule
    derived = _derive_fee_allocation(payments, student_schedule)
    paid_months = derived["paid_months"]

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
        "last_payment_date": last_date,
        "updated_at": now_iso
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

    curr_disabled = bool(student.get("is_disabled", False))
    curr_blocked = bool(student.get("is_blocked", False))

    new_disabled = curr_disabled
    new_blocked = curr_blocked
    regenerate_batch_code = False

    action = (body.action or "").lower().strip()
    if action == "disable":
        new_disabled = True
    elif action == "enable":
        new_disabled = False
    elif action == "block":
        new_blocked = True
        regenerate_batch_code = True
    elif action == "unblock":
        new_blocked = False
    else:
        if body.is_disabled is not None:
            new_disabled = bool(body.is_disabled)
        if body.is_blocked is not None:
            new_blocked = bool(body.is_blocked)
            if new_blocked and not curr_blocked:
                regenerate_batch_code = True

    now_iso = datetime.now(timezone.utc).isoformat()
    new_batch_code = None
    updated_batches = []

    # If blocking the account, regenerate the batch code in which that student was there
    if regenerate_batch_code or (action == "block"):
        new_batch_code = secrets.token_hex(3).upper()
        await db.batches.update_one(
            {"id": batch_id},
            {"$set": {"code": new_batch_code, "updated_at": now_iso}}
        )
        updated_batches.append({"batch_id": batch_id, "new_code": new_batch_code})

        # Also regenerate any other batches of this teacher that the student was enrolled in
        other_batch_query = {"id": {"$in": student_batch_ids, "$ne": batch_id}}
        if user["role"] != "admin":
            other_batch_query["teacher_id"] = user["id"]
        other_batches = await db.batches.find(other_batch_query, {"_id": 0}).to_list(100)
        for ob in other_batches:
            ob_code = secrets.token_hex(3).upper()
            await db.batches.update_one(
                {"id": ob["id"]},
                {"$set": {"code": ob_code, "updated_at": now_iso}}
            )
            updated_batches.append({"batch_id": ob["id"], "new_code": ob_code})

    await db.users.update_one(
        {"_id": ObjectId(student_id)},
        {"$set": {
            "is_disabled": new_disabled,
            "is_blocked": new_blocked,
            "updated_at": now_iso
        }}
    )

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
    """Background task: sample ACTIVE questions from the bank, snapshot them, mark ready."""
    try:
        questions = await _sample_bank_questions(body.class_level, body.subject, body.chapter,
                                                 body.topic or "", body.question_count, kind=body.kind)
        if not questions:
            raise ValueError("No active questions available for this selection")
        await db.tests.update_one({"id": test_id}, {"$set": {
            "questions": questions, "status": "ready", "question_count": len(questions)}})
    except Exception as e:
        logger.error(f"test build failed ({test_id}): {e}")
        await db.tests.update_one({"id": test_id}, {"$set": {
            "status": "failed", "error": str(e)[:200]}})


@api_router.post("/tests")
async def create_test(body: GenerateTestInput, user: dict = Depends(require_role("teacher", "admin"))):
    if body.question_count < 1:
        raise HTTPException(status_code=400, detail="question_count must be at least 1")
    now = datetime.now(timezone.utc)
    valid_from = now  # MVP: tests go live immediately (activate_now is a no-op)
    doc = {"id": str(uuid.uuid4()), "title": body.title, "kind": body.kind,
           "class_level": body.class_level, "subject": body.subject, "chapter": body.chapter,
           "topic": body.topic or "", "batch_id": body.batch_id,
           "duration_minutes": body.duration_minutes, "valid_hours": body.valid_hours,
           "valid_from": valid_from.isoformat(),
           "valid_until": (valid_from + timedelta(hours=body.valid_hours)).isoformat(),
           "questions": [], "status": "processing", "question_count": 0,
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
                                 topic: str, count: int, kind: str = "test") -> list:
    if kind == "dpp":
        # Chapterwise test: return all questions for the chapter, sorted topicwise
        q = {"class_level": class_level, "status": "active"}
        if subject:
            q["subject"] = subject
        if chapter:
            q["chapter"] = chapter
        if topic:
            q["topic"] = topic
        chapter_questions = await db.question_bank.find(q, {"_id": 0}).sort([("topic", 1), ("created_at", 1)]).to_list(1000)
        if not chapter_questions and topic:
            q_no_topic = {"class_level": class_level, "status": "active"}
            if subject:
                q_no_topic["subject"] = subject
            if chapter:
                q_no_topic["chapter"] = chapter
            chapter_questions = await db.question_bank.find(q_no_topic, {"_id": 0}).sort([("topic", 1), ("created_at", 1)]).to_list(1000)
        if chapter_questions:
            return [{"question": x["question"], "options": x["options"],
                     "correct_index": x["correct_index"], "explanation": x.get("explanation", ""),
                     "subject": x.get("subject", ""), "chapter": x.get("chapter", ""),
                     "topic": x.get("topic", ""), "difficulty": x.get("difficulty", "medium")}
                    for x in chapter_questions]

    q = {"class_level": class_level, "status": "active"}
    if subject:
        q["subject"] = subject
    if chapter:
        q["chapter"] = chapter
    if topic:
        q["topic"] = topic
    pool = await db.question_bank.find(q, {"_id": 0}).to_list(1000)
    if not pool and topic:
        q_no_topic = {"class_level": class_level, "status": "active"}
        if subject:
            q_no_topic["subject"] = subject
        if chapter:
            q_no_topic["chapter"] = chapter
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
    return [{"question": x["question"], "options": x["options"],
             "correct_index": x["correct_index"], "explanation": x.get("explanation", ""),
             "subject": x.get("subject", ""), "chapter": x.get("chapter", ""),
             "topic": x.get("topic", ""), "difficulty": x.get("difficulty", "medium")}
            for x in picked]


def _strip_answers(test: dict, student_id: str) -> dict:
    t = dict(test)
    questions = t.get("questions", [])
    t["question_count"] = len(questions)
    out = []
    for i, q in enumerate(questions):
        order = _shuffled_order(_option_seed(t["id"], student_id, i))
        out.append({"question": q["question"], "options": [q["options"][j] for j in order]})
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
        return tests
    if user["role"] == "student":
        q["status"] = "ready"
        if kind == "diagnostic":
            q["student_id"] = user["id"]
        elif kind != "dpp":
            q["batch_id"] = {"$in": user.get("batch_ids", [])}
    tests = await db.tests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
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
        vu = datetime.fromisoformat(t["valid_until"])
        vf = datetime.fromisoformat(t["valid_from"])
        sub = subs_by_test.get(t["id"])
        is_ready = t.get("status") == "ready"
        out.append({"id": t["id"], "title": t["title"], "kind": t["kind"], "subject": t["subject"],
                    "chapter": t["chapter"], "topic": t["topic"], "class_level": t["class_level"],
                    "duration_minutes": t["duration_minutes"], "question_count": len(t.get("questions", [])),
                    "valid_from": t["valid_from"], "valid_until": t["valid_until"],
                    "is_active": is_ready and ((t["kind"] == "dpp") or (vf <= now <= vu)),
                    "submitted": bool(sub), "score": sub.get("score") if sub else None,
                    "status": t.get("status")})
    return out


@api_router.get("/tests/{test_id}")
async def get_test(test_id: str, user: dict = Depends(get_current_user)):
    test = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] == "student":
        if test["kind"] == "test":
            if test.get("status") != "ready":
                raise HTTPException(status_code=403, detail="This test is still building or has failed.")
            now = datetime.now(timezone.utc)
            if not (datetime.fromisoformat(test["valid_from"]) <= now <= datetime.fromisoformat(test["valid_until"])):
                raise HTTPException(status_code=403, detail="This test is not active right now")
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
                       "is_correct": is_ok, "time_s": times[i]})
        # Per-question result for the mastery engine.
        results.append({"q": i, "subject": q.get("subject", test.get("subject", "")),
                        "chapter": q.get("chapter", test.get("chapter", "")),
                        "topic": q.get("topic", test.get("topic", "")),
                        "difficulty": q.get("difficulty", "medium"),
                        "is_correct": is_ok, "time_s": times[i]})

    score = round(correct / total * 100) if total else 0
    status = "flagged" if tab_switches >= 3 else "submitted"
    sub = {"id": str(uuid.uuid4()), "test_id": test_id, "kind": test["kind"], "title": test["title"],
           "student_id": user["id"], "student_name": user["name"],
           "answers": answers, "times": times, "tab_switches": tab_switches,
           "results": results,
           "score": score, "correct": correct, "total": total, "status": status,
           "created_at": datetime.now(timezone.utc).isoformat()}
    # Tests store a single attempt; DPPs store every attempt for repeat history.
    await db.submissions.insert_one(dict(sub))
    return {"score": score, "correct": correct, "total": total, "review": review, "status": status}


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
    if body.is_active is not None:
        updates["is_active"] = body.is_active
    if body.valid_hours is not None:
        valid_from = datetime.fromisoformat(test["valid_from"])
        updates["valid_until"] = (valid_from + timedelta(hours=body.valid_hours)).isoformat()
        updates["valid_hours"] = body.valid_hours
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tests.update_one({"id": test_id}, {"$set": updates})
    updated = await db.tests.find_one({"id": test_id}, {"_id": 0, "questions": 0})
    return updated


DIFFICULTIES = ("easy", "medium", "hard")
_VALID_STATUSES = ("active", "pending_review", "inactive")


def _normalize_class(value: str) -> str:
    """'Class 9' / 'Class 10' -> '9' / '10'. Falls back to any digits found."""
    v = (value or "").strip()
    m = re.search(r"(\d{1,2})", v)
    return m.group(1) if m else v


def _normalize_correct_option(value: str) -> Optional[int]:
    """'Option B' / 'B' -> 1; also accepts numeric '1'-'4' -> 0-3."""
    v = (value or "").strip().upper()
    m = re.search(r"([A-D])", v)
    if m:
        return ord(m.group(1)) - ord("A")
    m = re.search(r"([1-4])", v)
    if m:
        return int(m.group(1)) - 1
    return None


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


@api_router.post("/questions/import")
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
    try:
        rows = list(csv.DictReader(io.StringIO(text)))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV parse error: {e}")
    if not rows:
        raise HTTPException(status_code=400, detail="CSV contains no data rows")

    imported = duplicates = flagged = 0
    errors = []
    now = datetime.now(timezone.utc).isoformat()
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

        problems = []
        if not question:
            problems.append("empty question")
        if any(not o for o in options):
            problems.append("missing option text")
        if correct_index is None:
            problems.append("invalid 'Correct Option'")
        if not class_level:
            problems.append("missing class")
        if not subject:
            problems.append("missing subject")
        if not chapter:
            problems.append("missing chapter")
        if problems:
            errors.append({"row": i + 2, "source_id": src_id, "problems": problems})
            continue

        doc = {"id": str(uuid.uuid4()), "class_level": class_level, "subject": subject,
               "chapter": chapter, "topic": topic, "question": question, "options": options,
               "correct_index": correct_index, "explanation": explanation, "difficulty": difficulty,
               "status": status, "source": "import", "source_id": src_id,
               "dedup_key": _dedup_key(question), "created_by": user["id"], "created_at": now}
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
            "errors": errors, "total_rows": len(rows)}


@api_router.get("/questions")
async def list_questions(class_level: Optional[str] = None, subject: Optional[str] = None,
                         chapter: Optional[str] = None, topic: Optional[str] = None,
                         difficulty: Optional[str] = None, status: Optional[str] = None,
                         user: dict = Depends(require_role("teacher", "admin"))):
    q = {}
    if class_level:
        q["class_level"] = class_level
    if subject:
        q["subject"] = subject
    if chapter:
        q["chapter"] = chapter
    if topic:
        q["topic"] = topic
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
    students_raw = await db.users.find({"role": "student", "batch_ids": batch_id}).to_list(500)
    students = [{"id": str(s["_id"]), "name": s["name"],
                 "is_disabled": bool(s.get("is_disabled", False)),
                 "is_blocked": bool(s.get("is_blocked", False))} for s in students_raw]
    student_ids = [s["id"] for s in students]
    subs = await db.submissions.find({"student_id": {"$in": student_ids}}, {"_id": 0}).to_list(3000) if student_ids else []
    per_student = {}
    for s in subs:
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
        subs = await db.submissions.find({"student_id": user["id"], "kind": "test"}, {"_id": 0}).to_list(500)
        avg = round(sum(s.get("score", 0) for s in subs) / len(subs), 1) if subs else 0
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
        return {"tests_taken": len(subs), "avg_score": avg,
                "batches": len(batch_docs), "notes": note_count}
    q = {} if user["role"] == "admin" else {"teacher_id": user["id"]}
    return {"notes": await db.notes.count_documents(q),
            "tests": await db.tests.count_documents({**q, "kind": "test"}),
            "dpps": await db.tests.count_documents({**q, "kind": "dpp"}),
            "batches": await db.batches.count_documents(q if user["role"] == "admin" else {"teacher_id": user["id"]}),
            "students": await db.users.count_documents({"role": "student"})}


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


app.include_router(api_router)
_cors_origins = (os.environ.get('CORS_ORIGINS') or "http://localhost:3000,http://127.0.0.1:3000").strip()
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=[o.strip() for o in _cors_origins.split(',') if o.strip()],
                   allow_methods=["*"], allow_headers=["*"])


CATALOG = {
    "9": {},
    "10": {},
}
_SUBJECTS = {
    "Science": ["Matter in Our Surroundings", "Atoms and Molecules", "The Fundamental Unit of Life",
                "Motion", "Force and Laws of Motion", "Gravitation", "Tissues", "Life Processes",
                "Chemical Reactions and Equations", "Light - Reflection and Refraction", "Electricity",
                "Carbon and its Compounds", "Heredity and Evolution"],
    "Maths": ["Number Systems", "Polynomials", "Coordinate Geometry", "Linear Equations", "Triangles",
              "Circles", "Real Numbers", "Quadratic Equations", "Arithmetic Progressions",
              "Trigonometry", "Statistics", "Probability"],
    "Social Science": ["The French Revolution", "Physical Features of India", "Democracy in the Contemporary World",
                       "The Rise of Nationalism in Europe", "Resources and Development", "Power Sharing",
                       "Development", "Nationalism in India"],
    "English": ["Prose - The Fun They Had", "Poetry - The Road Not Taken", "Grammar and Writing",
                "A Letter to God", "Nelson Mandela", "Reading Comprehension"],
    "Hindi": ["गद्य - दो बैलों की कथा", "पद्य - सूरदास के पद", "व्याकरण", "कबीर की साखियाँ", "पत्र लेखन"],
}
for cl in ("9", "10"):
    CATALOG[cl] = {subj: chapters for subj, chapters in _SUBJECTS.items()}


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
