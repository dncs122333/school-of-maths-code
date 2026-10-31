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
    return batch


async def _verify_teacher_test_access(user: dict, test: dict) -> dict:
    """Verifies that the teacher or admin has permission to view the test's reports."""
    batch_id = test.get("batch_id")
    batch = None
    if batch_id and batch_id not in ("Saved / Unassigned", ""):
        batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})

    if user.get("role") == "admin":
        return batch or {}

    if batch and batch.get("teacher_id") == user.get("id"):
        return batch
    if test.get("created_by") == user.get("id"):
        return batch or {}

    raise HTTPException(status_code=403, detail="You do not have permission to view reports for this test")


@router.get("/test/{test_id}")
async def get_test_report(test_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    """Returns detailed per-test batch metrics, psychometrics, and anomalies."""
    test = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    batch = await _verify_teacher_test_access(user, test)

    submissions = await db.submissions.find({"test_id": test_id}, {"_id": 0}).to_list(1000)

    # Fetch active student count for completion calculation
    enrolled_count = None
    if batch and "student_ids" in batch:
        enrolled_count = len(batch["student_ids"])

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

    enrolled_count = len(batch.get("student_ids", [])) if batch else len(submissions)
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

    now = datetime.now(timezone.utc)
    recent_start = (now - timedelta(days=7)).isoformat()
    prior_start = (now - timedelta(days=14)).isoformat()

    recent_subs = await db.submissions.find({
        "batch_id": batch_id,
        "created_at": {"$gte": recent_start}
    }, {"_id": 0}).to_list(2000)

    prior_subs = await db.submissions.find({
        "batch_id": batch_id,
        "created_at": {"$gte": prior_start, "$lt": recent_start}
    }, {"_id": 0}).to_list(2000)

    return compute_weekly_digest(batch_id, batch, recent_subs, prior_subs, now=now)


@router.get("/batch/{batch_id}/term")
async def get_batch_term_report(batch_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    """Computes cumulative term overview with NCERT syllabus coverage and student rank matrix."""
    batch = await _verify_teacher_batch_access(user, batch_id)

    student_ids = batch.get("student_ids") or []
    student_map = {}
    if student_ids:
        cursor = db.users.find({"id": {"$in": student_ids}}, {"_id": 0, "id": 1, "name": 1})
        async for u in cursor:
            student_map[u["id"]] = u.get("name", "Student")

    all_submissions = await db.submissions.find({"batch_id": batch_id}, {"_id": 0}).to_list(5000)

    return compute_term_report(batch_id, batch, all_submissions, student_map)
