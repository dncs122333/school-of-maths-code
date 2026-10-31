"""FastAPI endpoints for reports engine (Per-test batch, weekly digest, term overview)."""
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from bson import ObjectId

try:
    from db import db
    from auth import require_role, get_current_user
    from reports.aggregations import compute_test_analytics, compute_weekly_digest, compute_term_report
    from reports.pdf import render_test_report_pdf
except ImportError:
    from ..db import db
    from ..auth import require_role, get_current_user
    from .aggregations import compute_test_analytics, compute_weekly_digest, compute_term_report
    from .pdf import render_test_report_pdf

router = APIRouter(prefix="/reports", tags=["reports"])


async def _verify_teacher_batch_access(user: dict, batch_id: Optional[str]) -> dict:
    """Verifies that the teacher or admin has permission to view batch data."""
    if not batch_id:
        return {}
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if user.get("role") != "admin":
        if batch.get("teacher_id") != user.get("id"):
            raise HTTPException(status_code=403, detail="You do not have permission to view reports for this batch")

    # Populate student_ids if missing or empty from batch doc (students are stored in db.users with batch_ids)
    if "student_ids" not in batch or not batch["student_ids"]:
        students_raw = await db.users.find({"role": "student", "batch_ids": batch_id}, {"_id": 1, "id": 1}).to_list(1000)
        sids = []
        for s in students_raw:
            sid = str(s.get("id") or s["_id"])
            if sid not in sids:
                sids.append(sid)
        batch["student_ids"] = sids

    return batch


async def _verify_teacher_test_access(user: dict, test: dict) -> dict:
    """Verifies that the teacher or admin has permission to view the test's reports."""
    batch_id = test.get("batch_id")
    batch = None
    if batch_id and batch_id not in ("Saved / Unassigned", ""):
        batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    elif test.get("student_id"):
        # Targeted sprint / diagnostic test without explicit batch: resolve student's batch
        st_id = test["student_id"]
        conds = [{"id": st_id}]
        if ObjectId.is_valid(st_id):
            conds.append({"_id": ObjectId(st_id)})
        student = await db.users.find_one({"$or": conds})
        if student and student.get("batch_ids"):
            teacher_id = user.get("id")
            for bid in student["batch_ids"]:
                b = await db.batches.find_one({"id": bid}, {"_id": 0})
                if b and (user.get("role") == "admin" or b.get("teacher_id") == teacher_id):
                    batch = b
                    break
            if not batch and student["batch_ids"]:
                batch = await db.batches.find_one({"id": student["batch_ids"][0]}, {"_id": 0})

    if batch:
        if "student_ids" not in batch or not batch["student_ids"]:
            bid = batch.get("id")
            students_raw = await db.users.find({"role": "student", "batch_ids": bid}, {"_id": 1, "id": 1}).to_list(1000)
            batch["student_ids"] = [str(s.get("id") or s["_id"]) for s in students_raw]

    if user.get("role") == "admin":
        return batch or {}

    if batch and batch.get("teacher_id") == user.get("id"):
        return batch
    if test.get("created_by") == user.get("id") or test.get("teacher_id") == user.get("id"):
        return batch or {}
    if test.get("student_id") and batch and batch.get("teacher_id") == user.get("id"):
        return batch

    raise HTTPException(status_code=403, detail="You do not have permission to view reports for this test")


async def _get_batch_submissions_query(batch_id: str, student_ids: Optional[list] = None) -> dict:
    """Builds the submission query matching both explicit batch submissions and student diagnostic/targeted attempts."""
    test_q = {"$or": [{"batch_id": batch_id}, {"student_id": {"$in": student_ids}}]} if student_ids else {"batch_id": batch_id}
    batch_test_ids = [t["id"] async for t in db.tests.find(test_q, {"id": 1})]

    or_clauses = [{"batch_id": batch_id}]
    if batch_test_ids:
        or_clauses.append({"test_id": {"$in": batch_test_ids}})

    sub_query = {"$or": or_clauses}
    if student_ids:
        sub_query["student_id"] = {"$in": student_ids}
    return sub_query


@router.get("/test/{test_id}")
async def get_test_report(test_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    """Returns detailed per-test batch metrics, psychometrics, and anomalies."""
    test = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    batch = await _verify_teacher_test_access(user, test)
    submissions = await db.submissions.find({"test_id": test_id}, {"_id": 0}).to_list(1000)

    # Fetch active student count for completion calculation
    enrolled_count = len(batch["student_ids"]) if (batch and "student_ids" in batch) else len(submissions)

    analytics = compute_test_analytics(test, submissions, batch=batch, enrolled_count=enrolled_count)
    return analytics


@router.get("/test/{test_id}/pdf")
async def download_test_report_pdf(test_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    """Downloads un-watermarked, official PDF assessment report for a test."""
    test = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    batch = await _verify_teacher_test_access(user, test)
    submissions = await db.submissions.find({"test_id": test_id}, {"_id": 0}).to_list(1000)

    enrolled_count = len(batch["student_ids"]) if (batch and "student_ids" in batch) else len(submissions)
    analytics = compute_test_analytics(test, submissions, batch=batch, enrolled_count=enrolled_count)

    pdf_bytes = render_test_report_pdf(analytics)

    safe_title = re.sub(r'[^a-zA-Z0-9_\-]', '_', test.get("title", "Assessment"))[:30]
    filename = f"report_{safe_title}_{test_id[:6]}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache"
        }
    )


@router.get("/batch/{batch_id}/weekly")
async def get_batch_weekly_digest(batch_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    """Computes 7-day rolling mastery movement and completion trends for a batch."""
    batch = await _verify_teacher_batch_access(user, batch_id)
    student_ids = batch.get("student_ids") or []

    now = datetime.now(timezone.utc)
    recent_start = (now - timedelta(days=7)).isoformat()
    prior_start = (now - timedelta(days=14)).isoformat()

    sub_query = await _get_batch_submissions_query(batch_id, student_ids)

    recent_query = dict(sub_query)
    recent_query["created_at"] = {"$gte": recent_start}
    recent_subs = await db.submissions.find(recent_query, {"_id": 0}).to_list(2000)

    prior_query = dict(sub_query)
    prior_query["created_at"] = {"$gte": prior_start, "$lt": recent_start}
    prior_subs = await db.submissions.find(prior_query, {"_id": 0}).to_list(2000)

    return compute_weekly_digest(batch_id, batch, recent_subs, prior_subs, now=now)


@router.get("/batch/{batch_id}/term")
async def get_batch_term_report(
    batch_id: str,
    subject: Optional[str] = Query(None),
    user: dict = Depends(require_role("teacher", "admin"))
):
    """Computes cumulative term overview with NCERT syllabus coverage and student rank matrix."""
    batch = await _verify_teacher_batch_access(user, batch_id)
    student_ids = batch.get("student_ids") or []

    student_map = {}
    if student_ids:
        conds = [{"id": {"$in": student_ids}}]
        valid_oids = [ObjectId(sid) for sid in student_ids if ObjectId.is_valid(sid)]
        if valid_oids:
            conds.append({"_id": {"$in": valid_oids}})
        cursor = db.users.find({"$or": conds}, {"_id": 1, "id": 1, "name": 1})
        async for u in cursor:
            name = u.get("name", "Student")
            if "id" in u:
                student_map[str(u["id"])] = name
            student_map[str(u["_id"])] = name

    sub_query = await _get_batch_submissions_query(batch_id, student_ids)
    all_submissions = await db.submissions.find(sub_query, {"_id": 0}).to_list(5000)

    return compute_term_report(batch_id, batch, all_submissions, student_map, subject=subject)
