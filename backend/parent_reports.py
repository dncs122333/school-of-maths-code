"""Weekly class-test reports emailed to parents.

Each batch has a report day. At 6 pm IST that day the batch's reports are worked out and saved in a queue
(`parent_reports`), then sent a few at a time, at most REPORT_DAILY_EMAIL_CAP a day. Anything over the cap waits
for the next day, so a busy day can't use up the email limit that consent and reset emails also rely on.

Only counted class tests are used (lib/class_tests.py), and only once the results are out and every make-up has
closed. A test that isn't ready yet is picked up by the batch's next report.
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from config import APP_TIMEZONE, REPORT_DAILY_EMAIL_CAP, logger
from lib.class_tests import assign_ranks, batch_class_tests, class_rank_score
from lib.mastery import is_answered, round_half_up
from mailer import EmailOff, _undeliverable, send_weekly_report
from reports.aggregations import _attendance, parse_utc_datetime, topic_band

REPORT_HOUR = 18  # 6 pm IST
LATE_LIMIT = timedelta(hours=36)  # a server down at report time still sends once it's back, within this long
MAX_ATTEMPTS = 3
LOOP_SECONDS = 300
SEND_PER_ROUND = 100
_LOCK_ID = "weekly_reports"


def last_due(weekday: int, now: datetime) -> datetime:
    """The most recent report time for this weekday (0 Monday to 6 Sunday) at or before `now`."""
    local = now.astimezone(APP_TIMEZONE)
    due = local.replace(hour=REPORT_HOUR, minute=0, second=0, microsecond=0) - timedelta(days=(local.weekday() - weekday) % 7)
    return due if due <= local else due - timedelta(days=7)


def week_key(due: datetime) -> str:
    return due.astimezone(APP_TIMEZONE).date().isoformat()


def ready_at(test: Dict[str, Any]) -> Optional[datetime]:
    """When a class test can go in a report: results released, and every window and make-up closed. A teacher's
    early release doesn't count until then, so a student still due to sit the test can't be told about it."""
    times = [test.get("results_released_at"), test.get("valid_until")]
    times += [m.get("closes_at") for m in (test.get("makeups") or [])]
    parsed = [t for t in (parse_utc_datetime(v) for v in times if v) if t]
    return max(parsed) if parsed else None


def _ist_date(value: Optional[datetime]) -> Optional[str]:
    return value.astimezone(APP_TIMEZONE).date().isoformat() if value else None


def _topics(subs: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """A student's topics across these submissions: up to 3 strongest and 3 needing work."""
    totals: Dict[str, List[int]] = {}
    for sub in subs:
        for row in sub.get("results") or []:
            name = row.get("topic") or row.get("chapter") or "General"
            pair = totals.setdefault(name, [0, 0])
            pair[0] += 1 if row.get("is_correct") else 0
            pair[1] += 1
    rows = [{"topic": name, "correct": c, "total": t, "accuracy": round_half_up(c / t * 100), "band": topic_band(c / t * 100, t)}
            for name, (c, t) in totals.items()]
    strong = sorted((r for r in rows if r["band"] == "strong"), key=lambda r: (-r["accuracy"], r["topic"]))[:3]
    weak = sorted((r for r in rows if r["band"] in ("weak", "developing")), key=lambda r: (r["accuracy"], r["topic"]))[:3]
    return strong, weak


def _answer_counts(sub: Dict[str, Any]) -> Dict[str, Optional[int]]:
    """Right, wrong and not attempted. Old submissions with no per-question results can't split the last two."""
    results = sub.get("results") or []
    if not results:
        return {"wrong": None, "not_attempted": None}
    answers = sub.get("answers")
    not_attempted = sum(1 for i, r in enumerate(results) if not r.get("is_correct") and not is_answered(r, answers, i))
    right = sum(1 for r in results if r.get("is_correct"))
    return {"right": right, "wrong": len(results) - right - not_attempted, "not_attempted": not_attempted}


def _test_rows(sid: str, week_tests: List[Dict[str, Any]], subs_by_test: Dict[str, Dict[str, Dict[str, Any]]],
               joined: Optional[datetime]) -> List[Dict[str, Any]]:
    rows = []
    for test in week_tests:
        opens = parse_utc_datetime(test.get("valid_from"))
        attempts = subs_by_test.get(test["id"], {})
        mine = attempts.get(sid)
        if not mine and joined and opens and opens < joined:
            continue  # the test was before this student joined
        scores = [float(s.get("score", 0)) for s in attempts.values()]
        row = {"title": test.get("title") or "Class test", "date": _ist_date(opens),
               "class_average": round_half_up(sum(scores) / len(scores), 1) if scores else None, "sat": len(scores)}
        if mine:
            score = float(mine.get("score", 0))
            row.update(status="taken", score=round_half_up(score, 1), correct=mine.get("correct"), total=mine.get("total"),
                       rank=1 + sum(1 for s in scores if s > score), **_answer_counts(mine))
        else:
            row["status"] = "excused" if sid in (test.get("excused_student_ids") or []) else "absent"
        rows.append(row)
    return rows


def _summary(first_name: str, rows: List[Dict[str, Any]]) -> str:
    taken = [r for r in rows if r["status"] == "taken"]
    tests = f"{len(rows)} class test" + ("" if len(rows) == 1 else "s")
    if not taken:
        return f"{first_name} didn't take the {tests} this week." if len(rows) > 1 else f"{first_name} didn't take this week's class test."
    average = sum(r["score"] for r in taken) / len(taken)
    class_scores = [r["class_average"] for r in taken if r["class_average"] is not None]
    text = f"{first_name} took {len(taken)} of {tests} this week and scored {round_half_up(average, 1):g}%"
    if class_scores:
        class_average = round_half_up(sum(class_scores) / len(class_scores), 1)
        compared = "above" if average > class_average else "below" if average < class_average else "the same as"
        text += f", {compared} the class average of {class_average:g}%"
    return text + "."


def _next_step(rows: List[Dict[str, Any]], weak: List[Dict[str, Any]]) -> str:
    if weak:
        return f"Extra practice on {weak[0]['topic']} before the next test."
    if not any(r["status"] == "taken" for r in rows):
        return "Please speak to the teacher about the missed work."
    return "Keep up the regular practice."


async def build_batch_reports(db, batch: Dict[str, Any], window_start: datetime, window_end: datetime) -> Dict[str, Dict[str, Any]]:
    """Each enrolled student's report for tests that became ready in this window, by student id. Empty when
    there are none. Other students' names never go in a report."""
    batch_id = batch["id"]
    class_tests = [t for t in await batch_class_tests(db, batch_id, batch.get("teacher_id"))
                   if (ready_at(t) or window_end) < window_end]
    week_tests = sorted((t for t in class_tests if window_start <= ready_at(t)), key=lambda t: t.get("valid_from") or "")
    if not week_tests:
        return {}
    earlier_tests = [t for t in class_tests if ready_at(t) < window_start]
    students = await db.users.find({"role": "student", "batch_ids": batch_id},
                                   {"name": 1, "batch_enrolled_at": 1}).to_list(None)
    student_ids = [str(s["_id"]) for s in students]
    enrolled_at = {str(s["_id"]): (s.get("batch_enrolled_at") or {}).get(batch_id) for s in students}

    subs_by_student: Dict[str, List[Dict[str, Any]]] = {sid: [] for sid in student_ids}
    subs_by_test: Dict[str, Dict[str, Dict[str, Any]]] = {}
    subs = await db.submissions.find({"test_id": {"$in": [t["id"] for t in class_tests]}, "student_id": {"$in": student_ids}},
                                     {"_id": 0}).sort("created_at", 1).to_list(None)
    for sub in subs:
        attempts = subs_by_test.setdefault(sub["test_id"], {})
        if sub["student_id"] not in attempts:  # first attempt only
            attempts[sub["student_id"]] = sub
            subs_by_student[sub["student_id"]].append(sub)

    # Class rank: the same rule as the term report and the leaderboard
    standings = []
    for sid in student_ids:
        attendance = _attendance(sid, subs_by_student[sid], class_tests, enrolled_at.get(sid), window_end)
        score = class_rank_score([float(s.get("score", 0)) for s in subs_by_student[sid]], attendance["tests_assigned"])
        standings.append({"student_id": sid, "score": round_half_up(score, 1) if score is not None else None, **attendance})
    standings.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0)))
    assign_ranks(standings, "score")
    standing_of = {r["student_id"]: r for r in standings}
    ranked = sum(1 for r in standings if r["rank"] is not None)

    week_ids = {t["id"] for t in week_tests}
    reports = {}
    start_local, end_local = window_start.astimezone(APP_TIMEZONE), window_end.astimezone(APP_TIMEZONE)
    for student in students:
        sid = str(student["_id"])
        joined = parse_utc_datetime(enrolled_at[sid]) if enrolled_at.get(sid) else None
        rows = _test_rows(sid, week_tests, subs_by_test, joined)
        if not rows:
            continue  # joined after this week's tests
        earlier_subs = [s for s in subs_by_student[sid] if s["test_id"] not in week_ids]
        earlier = _attendance(sid, earlier_subs, earlier_tests, enrolled_at.get(sid), window_start)
        earlier_score = class_rank_score([float(s.get("score", 0)) for s in earlier_subs], earlier["tests_assigned"])
        standing = standing_of[sid]
        strong, weak = _topics([s for s in subs_by_student[sid] if s["test_id"] in week_ids])
        name = student.get("name") or "Your student"
        reports[sid] = {
            "student_name": name, "batch_name": batch.get("name") or "Batch", "class_level": batch.get("class_level"),
            "week_start": start_local.date().isoformat(), "week_end": end_local.date().isoformat(),
            "summary": _summary(name.split()[0], rows), "tests": rows,
            "overall": {"average": standing["score"], "rank": standing["rank"], "ranked_students": ranked,
                        "attended": standing["tests_attended"], "assigned": standing["tests_assigned"],
                        "change": (round_half_up(standing["score"] - earlier_score, 1)
                                   if earlier_score is not None and standing["score"] is not None else None)},
            "strong_topics": strong, "weak_topics": weak, "next_step": _next_step(rows, weak),
            "teacher_note": (batch.get("report_note") or "").strip() or None,
        }
    return reports


async def _window_start(db, batch_id: str, window_end: datetime) -> datetime:
    """From the end of the last report sent, so a test held back or a paused week isn't lost; else a week back."""
    last = await db.parent_report_runs.find_one({"batch_id": batch_id, "status": "queued"}, sort=[("window_end", -1)])
    end = parse_utc_datetime(last.get("window_end")) if last else None
    if end and end < window_end:
        return end
    paused = await db.parent_report_runs.find_one({"batch_id": batch_id, "status": "paused"}, sort=[("window_start", 1)])
    start = parse_utc_datetime(paused.get("window_start")) if paused else None
    return start if start and start < window_end else window_end - timedelta(days=7)


async def preview_batch_reports(db, batch: Dict[str, Any], now: datetime) -> Dict[str, Dict[str, Any]]:
    """What the batch's reports would say if they went out now."""
    return await build_batch_reports(db, batch, await _window_start(db, batch["id"], now), now)


async def queue_due_batches(db, now: datetime) -> int:
    """Saves reports for every batch whose report time has come. Safe to run repeatedly: a run and a report
    each exist once per week, so restarts and the second worker can't send twice."""
    queued = 0
    cursor = db.batches.find({"report_weekday": {"$in": list(range(7))}, "archived_at": {"$exists": False}}, {"_id": 0})
    async for batch in cursor:
        due = last_due(batch["report_weekday"], now)
        if now - due > LATE_LIMIT:
            continue
        week = week_key(due)
        existing = await db.parent_report_runs.find_one({"batch_id": batch["id"], "week": week}, {"_id": 0, "status": 1})
        if batch.get("reports_paused"):
            # Remember where this week started, so its tests go in the next report after resuming
            if not existing:
                window_start = await _window_start(db, batch["id"], due)
                await db.parent_report_runs.update_one({"batch_id": batch["id"], "week": week}, {"$setOnInsert": {
                    "id": str(uuid.uuid4()), "status": "paused", "created_at": now.isoformat(),
                    "window_start": window_start.isoformat(), "window_end": due.isoformat()}}, upsert=True)
            continue
        if existing and existing["status"] != "paused":
            continue
        try:
            queued += await _queue_batch(db, batch, week, due, now)
        except Exception as e:
            # Tried again on the next round; one batch's bad data can't stop the others
            logger.error(f"Weekly report for batch {batch['id']} failed: {type(e).__name__}")
    return queued


async def _queue_batch(db, batch: Dict[str, Any], week: str, due: datetime, now: datetime) -> int:
    window_start = await _window_start(db, batch["id"], due)
    reports = await build_batch_reports(db, batch, window_start, due)
    run = {"id": str(uuid.uuid4()), "batch_id": batch["id"], "week": week, "created_at": now.isoformat(),
           "window_start": window_start.isoformat(), "window_end": due.isoformat()}
    if not reports:
        await db.parent_report_runs.update_one({"batch_id": batch["id"], "week": week},
                                               {"$set": {**run, "status": "skipped", "reason": "no_class_test"}}, upsert=True)
        return 0
    students = {str(u["_id"]): u async for u in db.users.find(
        {"role": "student", "batch_ids": batch["id"]},
        {"parent": 1, "parent_consent_status": 1, "disabled_batch_ids": 1, "blocked_batch_ids": 1, "report_paused_batch_ids": 1})}
    queued = 0
    for sid, report in reports.items():
        student = students.get(sid) or {}
        parent = student.get("parent") or {}
        skip = _skip_reason(student, batch["id"])
        doc = {"id": str(uuid.uuid4()), "batch_id": batch["id"], "student_id": sid, "week": week,
               "parent_email": parent.get("email"), "parent_name": parent.get("name"), "report": report,
               "status": "skipped" if skip else "queued", "reason": skip, "attempts": 0, "created_at": now.isoformat()}
        try:
            await db.parent_reports.insert_one(doc)
            queued += 0 if skip else 1
        except DuplicateKeyError:
            pass
    await db.parent_report_runs.update_one({"batch_id": batch["id"], "week": week}, {"$set": {**run, "status": "queued"}}, upsert=True)
    return queued


def _skip_reason(student: Dict[str, Any], batch_id: str) -> Optional[str]:
    if not student:
        return "student_removed"
    if batch_id in (student.get("disabled_batch_ids") or []) or batch_id in (student.get("blocked_batch_ids") or []):
        return "student_not_active"
    if batch_id in (student.get("report_paused_batch_ids") or []):
        return "paused_for_student"
    if student.get("parent_consent_status") != "confirmed":
        return "no_parent_consent"
    if not (student.get("parent") or {}).get("email"):
        return "no_parent_email"
    return None


async def send_queued(db, now: datetime, send: Callable = send_weekly_report, cap: int = REPORT_DAILY_EMAIL_CAP) -> int:
    """Sends the oldest queued reports, up to what's left of today's cap. Each is checked again just before it
    goes, so a withdrawal, a pause or an erased student stops it."""
    today = _ist_date(now)
    remaining = cap - await db.parent_reports.count_documents({"status": "sent", "sent_on": today})
    if remaining <= 0:
        return 0
    paused = {b["id"] async for b in db.batches.find({"reports_paused": True}, {"_id": 0, "id": 1})}
    sent = 0
    query = {"status": "queued", "batch_id": {"$nin": list(paused)}}
    items = await db.parent_reports.find(query).sort("created_at", 1).to_list(min(remaining, SEND_PER_ROUND))
    for item in items:
        sent += await _send_one(db, item, now, send, today)
    return sent


async def _send_one(db, item: Dict[str, Any], now: datetime, send: Callable, today: str) -> int:
    student = await db.users.find_one({"_id": ObjectId(item["student_id"])}) if ObjectId.is_valid(item["student_id"]) else None
    batch = await db.batches.find_one({"id": item["batch_id"]}, {"id": 1, "archived_at": 1})
    skip = "batch_removed" if not batch or batch.get("archived_at") else _skip_reason(student or {}, item["batch_id"])
    if not skip and _undeliverable(item["parent_email"]):
        skip = "undeliverable_address"
    if skip:
        await db.parent_reports.update_one({"_id": item["_id"]}, {"$set": {"status": "skipped", "reason": skip}})
        return 0
    try:
        message_id = await send(item["parent_email"], item.get("parent_name"), item["report"])
    except EmailOff:
        await db.parent_reports.update_one({"_id": item["_id"]}, {"$set": {"status": "skipped", "reason": "email_not_configured"}})
        return 0
    except Exception as e:
        # Only the error's type: a response could carry the address or key
        attempts = item.get("attempts", 0) + 1
        await db.parent_reports.update_one({"_id": item["_id"]}, {"$set": {
            "attempts": attempts, "error": type(e).__name__, "status": "failed" if attempts >= MAX_ATTEMPTS else "queued"}})
        logger.error(f"Weekly report email failed: {type(e).__name__}")
        return 0
    await db.parent_reports.update_one({"_id": item["_id"]}, {"$set": {
        "status": "sent", "sent_on": today, "sent_at": now.isoformat(), "message_id": message_id}, "$unset": {"error": ""}})
    return 1


async def _claim_round(db, seconds: int = LOOP_SECONDS - 20) -> bool:
    """Each uvicorn worker runs the loop; the first to take this lock does the work for that round."""
    now = datetime.now(timezone.utc)
    try:
        await db.job_locks.update_one({"_id": _LOCK_ID, "until": {"$lte": now}},
                                      {"$set": {"until": now + timedelta(seconds=seconds)}}, upsert=True)
        return True
    except DuplicateKeyError:
        return False


async def weekly_report_loop(db) -> None:
    while True:
        try:
            if await _claim_round(db):
                now = datetime.now(timezone.utc)
                await queue_due_batches(db, now)
                await send_queued(db, now)
        except Exception as e:
            logger.error(f"Weekly report round failed: {type(e).__name__}")
        await asyncio.sleep(LOOP_SECONDS)


async def weekday_load(db) -> Dict[int, int]:
    """How many parents can get a report on each day, for the teacher's day picker."""
    batches = {b["id"]: b["report_weekday"] async for b in db.batches.find(
        {"report_weekday": {"$in": list(range(7))}, "archived_at": {"$exists": False}}, {"_id": 0, "id": 1, "report_weekday": 1})}
    load = {day: 0 for day in range(7)}
    if batches:
        async for student in db.users.find({"role": "student", "parent_consent_status": "confirmed", "batch_ids": {"$in": list(batches)}},
                                           {"_id": 0, "batch_ids": 1, "report_paused_batch_ids": 1}):
            for batch_id in student.get("batch_ids") or []:
                if batch_id in batches and batch_id not in (student.get("report_paused_batch_ids") or []):
                    load[batches[batch_id]] += 1
    return load


async def batch_status(db, batch: Dict[str, Any], now: datetime) -> Dict[str, Any]:
    run = await db.parent_report_runs.find_one({"batch_id": batch["id"]}, {"_id": 0}, sort=[("week", -1)])
    weekday = batch.get("report_weekday")
    counts = {"sent": 0, "queued": 0, "failed": 0, "skipped": 0}
    problems: List[Dict[str, Any]] = []
    delayed = 0
    if run:
        today = _ist_date(now)
        async for item in db.parent_reports.find({"batch_id": batch["id"], "week": run["week"]},
                                                 {"_id": 0, "student_id": 1, "status": 1, "reason": 1, "error": 1, "created_at": 1, "report.student_name": 1}):
            counts[item["status"]] = counts.get(item["status"], 0) + 1
            if item["status"] == "queued" and _ist_date(parse_utc_datetime(item.get("created_at"))) != today:
                delayed += 1
            if item["status"] in ("failed", "skipped"):
                problems.append({"student_id": item["student_id"], "name": (item.get("report") or {}).get("student_name"),
                                 "status": item["status"], "reason": item.get("reason") or item.get("error")})
    next_send = None
    if weekday in range(7):
        due = last_due(weekday, now) + timedelta(days=7)
        next_send = due.isoformat()
    return {"report_weekday": weekday if weekday in range(7) else None, "reports_paused": bool(batch.get("reports_paused")),
            "report_note": batch.get("report_note") or "", "next_send": next_send, "daily_cap": REPORT_DAILY_EMAIL_CAP,
            "weekday_load": await weekday_load(db),
            "last_run": {"week": run["week"], "status": run["status"], "reason": run.get("reason"), "counts": counts,
                         "delayed": delayed, "problems": problems} if run else None}
