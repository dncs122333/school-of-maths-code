import asyncio
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from bson import ObjectId

try:
    from lib.class_tests import batch_class_tests, drop_uncounted_class_tests
    from db import db
    from auth import require_role, get_current_user
    from reports.aggregations import compute_test_analytics, compute_weekly_digest, compute_term_report, parse_utc_datetime
    from reports.pdf import render_test_report_pdf
except ImportError:
    from ..lib.class_tests import batch_class_tests, drop_uncounted_class_tests
    from ..db import db
    from ..auth import require_role, get_current_user
    from .aggregations import compute_test_analytics, compute_weekly_digest, compute_term_report, parse_utc_datetime
    from .pdf import render_test_report_pdf

logger = logging.getLogger("reports")
router = APIRouter(prefix="/reports", tags=["reports"])


async def fetch_cursor_paged(cursor, limit: int = 5000, context: str = "items") -> tuple:
    """Pages through a cursor up to limit, warning if the retrieval cap is reached."""
    items = []
    warning = None
    async for doc in cursor:
        items.append(doc)
        if len(items) >= limit:
            warning = f"Data retrieval limit reached ({limit} {context}). Results may be truncated."
            logger.warning(warning)
            break
    return items, warning


async def _roster_docs(batch_ids: list) -> list:
    """Students enrolled in any of batch_ids, with what the reports need (one query for all of it)."""
    docs, _ = await fetch_cursor_paged(
        db.users.find({"role": "student", "batch_ids": {"$in": batch_ids}},
                      {"_id": 1, "name": 1, "batch_enrolled_at": 1, "disabled_batch_ids": 1, "blocked_batch_ids": 1}),
        limit=5000, context="students")
    return docs


def _roster_ids(docs: list, batch_ids: list, active_only: bool = False) -> list:
    """Student ids from roster docs. active_only leaves out students disabled or blocked in every one of
    batch_ids: they can't take tests, so they don't belong in completion denominators."""
    sids = []
    for s in docs:
        if active_only:
            inactive = set(s.get("disabled_batch_ids") or []) | set(s.get("blocked_batch_ids") or [])
            if all(bid in inactive for bid in batch_ids):
                continue
        # Submissions key students by str(_id); some users also carry a legacy, different "id" field
        sids.append(str(s["_id"]))
    return sids


async def _roster(batch_ids: list, active_only: bool = False) -> list:
    return _roster_ids(await _roster_docs(batch_ids), batch_ids, active_only)


async def _verify_teacher_batch_access(user: dict, batch_id: Optional[str]) -> dict:
    """Verifies that the teacher or admin has permission to view batch data. Archived batches stay
    reachable by direct link (read-only history); the batch picker already hides them."""
    if not batch_id:
        return {}
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if user.get("role") != "admin":
        if batch.get("teacher_id") != user.get("id"):
            raise HTTPException(status_code=403, detail="You do not have permission to view reports for this batch")

    # Enrolment lives on db.users.batch_ids; a student_ids list stored on the batch can be stale
    docs = await _roster_docs([batch_id])
    batch["student_ids"] = _roster_ids(docs, [batch_id])
    batch["active_student_ids"] = _roster_ids(docs, [batch_id], active_only=True)
    batch["_roster_docs"] = docs  # names and join dates for the term report, without re-reading users
    batch["is_archived"] = bool(batch.get("archived_at"))
    return batch


async def _verify_teacher_test_access(user: dict, test: dict) -> dict:
    """Verifies that the teacher or admin has permission to view the test's reports."""
    batch_id = test.get("batch_id")
    batch = None
    if batch_id == "all":
        # "All Students" = every student in the test teacher's batches; without this the report had no
        # roster and showed no completion rate
        teacher_batches = [b["id"] async for b in db.batches.find(
            {"teacher_id": test.get("teacher_id"), "archived_at": {"$exists": False}}, {"_id": 0, "id": 1})]
        batch = {"id": "all", "name": "All Students", "teacher_id": test.get("teacher_id"),
                 "student_ids": await _roster(teacher_batches, active_only=True) if teacher_batches else []}
    elif batch_id and batch_id not in ("Saved / Unassigned", ""):
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

    if batch and batch.get("id") != "all":
        # Completion denominator: students who can take the test (not disabled/blocked here)
        batch["student_ids"] = await _roster([batch["id"]], active_only=True)

    if user.get("role") == "admin":
        return batch or {}

    if batch and batch.get("teacher_id") == user.get("id"):
        return batch
    if test.get("created_by") == user.get("id") or test.get("teacher_id") == user.get("id"):
        return batch or {}
    if test.get("student_id") and batch and batch.get("teacher_id") == user.get("id"):
        return batch

    raise HTTPException(status_code=403, detail="You do not have permission to view reports for this test")


async def _get_batch_submissions_query(batch_id: str, student_ids: Optional[list] = None,
                                       teacher_id: Optional[str] = None) -> dict:
    """Builds the submission query matching this batch's tests, the batch teacher's "All Students" tests
    (taken by these students) and student diagnostic/targeted attempts."""
    test_or = [{"batch_id": batch_id}]
    if student_ids:
        # "All Students" submissions are only safe to include when filtered to this batch's students below
        if teacher_id:
            test_or.append({"batch_id": "all", "teacher_id": teacher_id})
        test_or.append({"student_id": {"$in": student_ids}})
    batch_test_ids = [t["id"] async for t in db.tests.find({"$or": test_or}, {"id": 1})]

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
    submissions, cap_warn = await fetch_cursor_paged(
        db.submissions.find({"test_id": test_id}, {"_id": 0}),
        limit=5000,
        context="submissions"
    )

    # Active student roster count: None when no resolvable batch roster exists (prevents fake 100% completion)
    enrolled_count = len(batch["student_ids"]) if (batch and batch.get("student_ids")) else None

    analytics = compute_test_analytics(test, submissions, batch=batch, enrolled_count=enrolled_count)
    if cap_warn:
        analytics["cap_warning"] = cap_warn
        analytics["is_capped"] = True
    return analytics


@router.get("/test/{test_id}/pdf")
async def download_test_report_pdf(test_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    """Downloads un-watermarked, official PDF assessment report for a test."""
    test = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    batch = await _verify_teacher_test_access(user, test)
    submissions, cap_warn = await fetch_cursor_paged(
        db.submissions.find({"test_id": test_id}, {"_id": 0}),
        limit=5000,
        context="submissions"
    )

    enrolled_count = len(batch["student_ids"]) if (batch and batch.get("student_ids")) else None
    analytics = compute_test_analytics(test, submissions, batch=batch, enrolled_count=enrolled_count)
    if cap_warn:
        analytics["cap_warning"] = cap_warn
        analytics["is_capped"] = True

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
    """Computes 7-day rolling mastery movement and completion trends for a batch.
    Dates are strictly compared in UTC to eliminate mixed-offset string comparison misbucketing.
    """
    batch = await _verify_teacher_batch_access(user, batch_id)
    student_ids = batch.get("student_ids") or []

    now = datetime.now(timezone.utc)
    recent_start_dt = now - timedelta(days=7)
    prior_start_dt = now - timedelta(days=14)

    sub_query = await _get_batch_submissions_query(batch_id, student_ids, batch.get("teacher_id"))

    # Use a buffered cutoff query (16 days) to ensure all timezone offsets (+14:00/-12:00) are fetched
    query = dict(sub_query)
    query["created_at"] = {"$gte": (now - timedelta(days=16)).isoformat()}

    window_subs, cap_warn = await fetch_cursor_paged(
        db.submissions.find(query, {"_id": 0}),
        limit=5000,
        context="weekly digest submissions"
    )
    window_subs = await drop_uncounted_class_tests(db, window_subs)

    recent_subs = []
    prior_subs = []
    for s in window_subs:
        dt = parse_utc_datetime(s.get("created_at"))
        if dt is not None:
            if dt >= recent_start_dt:
                recent_subs.append(s)
            elif dt >= prior_start_dt:
                prior_subs.append(s)

    # Participation is out of students who can take tests (disabled/blocked left out)
    digest = compute_weekly_digest(batch_id, {**batch, "student_ids": batch.get("active_student_ids") or []},
                                   recent_subs, prior_subs, now=now)
    if cap_warn:
        digest["cap_warning"] = cap_warn
        digest["is_capped"] = True
    return digest


@router.get("/batch/{batch_id}/term")
async def get_batch_term_report(
    batch_id: str,
    subject: Optional[str] = Query(None),
    start: Optional[str] = Query(None, description="Period start date (YYYY-MM-DD, inclusive)"),
    end: Optional[str] = Query(None, description="Period end date (YYYY-MM-DD, inclusive)"),
    user: dict = Depends(require_role("teacher", "admin"))
):
    """Computes the term overview (all time, or the start..end period) with NCERT syllabus coverage,
    attendance and the student rank matrix."""
    period_start, period_end = _parse_period(start, end)
    batch = await _verify_teacher_batch_access(user, batch_id)
    student_ids = batch.get("student_ids") or []

    roster_docs = batch.pop("_roster_docs", [])
    student_map = {str(u["_id"]): u.get("name", "Student") for u in roster_docs}
    enrolled_at = {str(u["_id"]): (u.get("batch_enrolled_at") or {}).get(batch_id) for u in roster_docs}
    enrolled_at = {k: v for k, v in enrolled_at.items() if v}

    # Independent reads run together: the submission query's test ids and the attendance class tests
    sub_query, class_tests = await asyncio.gather(
        _get_batch_submissions_query(batch_id, student_ids, batch.get("teacher_id")),
        batch_class_tests(db, batch_id, batch.get("teacher_id")))
    if period_start:
        # Coarse string prefilter with a day's buffer for mixed offsets; exact UTC filtering below
        sub_query["created_at"] = {"$gte": (period_start - timedelta(days=1)).isoformat()}
    all_submissions, cap_warn = await fetch_cursor_paged(
        db.submissions.find(sub_query, {"_id": 0}),
        limit=10000,
        context="term submissions"
    )
    all_submissions = await drop_uncounted_class_tests(db, all_submissions)
    if period_start or period_end:
        all_submissions = [s for s in all_submissions if _in_period(s.get("created_at"), period_start, period_end)]

    # Attendance counts this batch's live class tests (plus the teacher's "All Students" ones) and join dates
    if period_start or period_end:
        class_tests = [t for t in class_tests if _in_period(t.get("valid_from"), period_start, period_end)]

    try:
        term = None
        if period_start or period_end:
            term = {"name": f"{start or 'Start'} to {end or 'today'}", "start": start, "end": end}
        report = compute_term_report(batch_id, batch, all_submissions, student_map, term=term, subject=subject,
                                     class_tests=class_tests, enrolled_at=enrolled_at)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    report["is_archived"] = batch.get("is_archived", False)
    if cap_warn:
        report["cap_warning"] = cap_warn
        report["is_capped"] = True
    return report


def _parse_period(start: Optional[str], end: Optional[str]) -> tuple:
    """YYYY-MM-DD bounds -> UTC datetimes [start 00:00, end+1day 00:00). Raises 400 on bad input."""
    def _day(v, name):
        if not v:
            return None
        try:
            return datetime.strptime(v, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"{name} must be a date like 2026-04-01")
    s, e = _day(start, "start"), _day(end, "end")
    if e:
        e = e + timedelta(days=1)
    if s and e and s >= e:
        raise HTTPException(status_code=400, detail="start must be on or before end")
    return s, e


def _in_period(value, period_start, period_end) -> bool:
    dt = parse_utc_datetime(value)
    if dt is None:
        return False
    return (not period_start or dt >= period_start) and (not period_end or dt < period_end)
