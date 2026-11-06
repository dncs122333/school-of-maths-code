"""Weekly reports to parents, and the rule behind every average and rank: only counted class tests.

Queue and sending tests run the code directly against a scratch database with a fake sender, so no email leaves.
Route tests use a running server.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import certifi
import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import APP_TIMEZONE  # noqa: E402
import mailer  # noqa: E402
import parent_reports as pr  # noqa: E402

frontend_env = dotenv_values("frontend/.env") if os.path.exists("frontend/.env") else {}
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/") or "http://localhost:8001"
API = f"{BASE_URL}/api"

UTC = timezone.utc
# Sunday 8 Nov 2026, 7 pm IST: a Sunday batch's report came due an hour ago
NOW = datetime(2026, 11, 8, 19, 0, tzinfo=APP_TIMEZONE).astimezone(UTC)
SUNDAY = 6
RESULT = [{"topic": "Trigonometry", "is_correct": False}, {"topic": "Trigonometry", "is_correct": False},
          {"topic": "Circles", "is_correct": True}, {"topic": "Circles", "is_correct": True}]


def iso(moment):
    return moment.isoformat()


@pytest.fixture
def scratch():
    client = MongoClient(os.environ["MONGO_URL"], tlsCAFile=certifi.where())
    name = f"scratch_reports_{uuid.uuid4().hex[:8]}"
    yield name, client[name]
    client.drop_database(name)
    client.close()


def run(name, work):
    async def go():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"], tlsCAFile=certifi.where())
        try:
            return await work(client[name])
        finally:
            client.close()
    return asyncio.run(go())


def add_batch(db, **extra):
    batch = {"id": uuid.uuid4().hex, "name": "Morning Maths", "class_level": "10", "teacher_id": "t1", "report_weekday": SUNDAY, **extra}
    db.batches.insert_one(dict(batch))
    return batch


def add_student(db, batch, name="Aarav Test", consent="confirmed", email=None, **extra):
    doc = {"role": "student", "name": name, "email": f"{uuid.uuid4().hex[:8]}@mail.test", "batch_ids": [batch["id"]],
           "batch_enrolled_at": {batch["id"]: iso(NOW - timedelta(days=60))}, "parent_consent_status": consent,
           "parent": {"name": "Parent", "phone": "9812300000", "email": email or f"p{uuid.uuid4().hex[:8]}@mail.test"}, **extra}
    return str(db.users.insert_one(doc).inserted_id)


def add_test(db, batch, days_ago=2, **extra):
    closed = NOW - timedelta(days=days_ago)
    test = {"id": uuid.uuid4().hex, "title": "Weekly Test", "kind": "test", "batch_id": batch["id"], "teacher_id": "t1",
            "status": "ready", "valid_from": iso(closed - timedelta(hours=2)), "valid_until": iso(closed), "makeups": [], "excused_student_ids": [], **extra}
    db.tests.insert_one(dict(test))
    return test


def add_sub(db, test, student_id, score=50.0, kind=None, days_ago=2):
    db.submissions.insert_one({"id": uuid.uuid4().hex, "test_id": test["id"], "student_id": student_id, "kind": kind or test["kind"], "score": score,
                               "correct": 2, "total": 4, "results": RESULT, "created_at": iso(NOW - timedelta(days=days_ago))})


def fake_sender(fail_for=()):
    sent = []

    async def send(to_email, parent_name, report):
        if to_email in fail_for:
            raise RuntimeError("secret detail")
        sent.append(to_email)
        return "msg-1"
    return send, sent


def reports_for(name, batch):
    return run(name, lambda adb: pr.build_batch_reports(adb, batch, NOW - timedelta(days=7), NOW))


# ------------------------- What goes in a report -------------------------
def test_only_teacher_class_tests_count(scratch):
    name, db = scratch
    batch = add_batch(db)
    sid = add_student(db, batch)
    real = add_test(db, batch, title="Real")
    add_sub(db, real, sid, score=50)
    for bad in (add_test(db, batch, title="Self made", student_id=sid), add_test(db, batch, title="Deleted", is_deleted=True),
                add_test(db, batch, title="Draft", is_draft=True), add_test(db, batch, title="Practice", kind="dpp")):
        add_sub(db, bad, sid, score=100)
    report = reports_for(name, batch)[sid]
    assert [t["title"] for t in report["tests"]] == ["Real"]
    assert report["overall"]["average"] == 50 and report["overall"]["assigned"] == 1


def test_missed_counts_as_zero_excused_is_left_out_and_ties_share_a_rank(scratch):
    name, db = scratch
    batch = add_batch(db)
    steady, lucky, tied, excused = (add_student(db, batch, name=n) for n in ("Steady A", "Lucky B", "Tied C", "Excused D"))
    t1, t2 = add_test(db, batch, days_ago=2, title="T1"), add_test(db, batch, days_ago=3, title="T2", excused_student_ids=[excused])
    for sid, score in ((steady, 80), (tied, 80), (lucky, 100), (excused, 70)):
        add_sub(db, t1, sid, score=score)
    for sid in (steady, tied):
        add_sub(db, t2, sid, score=80, days_ago=3)
    reports = reports_for(name, batch)
    overall = {sid: reports[sid]["overall"] for sid in reports}
    assert overall[steady]["average"] == overall[tied]["average"] == 80 and overall[steady]["rank"] == overall[tied]["rank"] == 1
    assert overall[lucky]["average"] == 50 and overall[lucky]["rank"] == 4  # 100 on one test, the other missed
    assert overall[excused]["average"] == 70 and overall[excused]["rank"] == 3
    statuses = {t["title"]: t["status"] for t in reports[lucky]["tests"]}
    assert statuses == {"T1": "taken", "T2": "absent"}
    assert {t["title"]: t["status"] for t in reports[excused]["tests"]}["T2"] == "excused"
    t1_row = next(t for t in reports[lucky]["tests"] if t["title"] == "T1")
    assert t1_row["rank"] == 1 and t1_row["sat"] == 4 and t1_row["class_average"] == 82.5


def test_tests_not_ready_are_held_back_for_the_next_report(scratch):
    name, db = scratch
    batch = add_batch(db)
    sid = add_student(db, batch)
    done = add_test(db, batch, title="Done")
    add_sub(db, done, sid, score=60)
    # Released early by the teacher, but a make-up is still open: must not appear yet
    open_makeup = add_test(db, batch, title="Makeup open", results_released_at=iso(NOW - timedelta(days=1)),
                           makeups=[{"student_id": "other", "opens_at": iso(NOW), "closes_at": iso(NOW + timedelta(days=1))}])
    add_sub(db, open_makeup, sid, score=99)
    still_open = add_test(db, batch, title="Still open", valid_until=iso(NOW + timedelta(hours=3)))
    add_sub(db, still_open, sid, score=99)
    report = reports_for(name, batch)[sid]
    assert [t["title"] for t in report["tests"]] == ["Done"]
    assert report["overall"]["average"] == 60
    later = run(name, lambda adb: pr.build_batch_reports(adb, batch, NOW, NOW + timedelta(days=7)))[sid]
    assert {t["title"] for t in later["tests"]} == {"Makeup open", "Still open"}


def test_report_counts_right_wrong_and_not_attempted(scratch):
    name, db = scratch
    batch = add_batch(db)
    sid, older = add_student(db, batch), add_student(db, batch, name="Old Result")
    test = add_test(db, batch)
    db.submissions.insert_one({"test_id": test["id"], "student_id": sid, "kind": "test", "score": 25, "correct": 1, "total": 4, "created_at": iso(NOW),
                               "answers": [2, 1, -1, 3],
                               "results": [{"q": 0, "topic": "A", "is_correct": True, "answered": True}, {"q": 1, "topic": "A", "is_correct": False, "answered": True},
                                           {"q": 2, "topic": "A", "is_correct": False, "answered": False}, {"q": 3, "topic": "A", "is_correct": False}]})
    db.submissions.insert_one({"test_id": test["id"], "student_id": older, "kind": "test", "score": 50, "correct": 2, "total": 4, "created_at": iso(NOW)})
    reports = reports_for(name, batch)
    row = reports[sid]["tests"][0]
    assert (row["right"], row["wrong"], row["not_attempted"]) == (1, 2, 1)
    subject, html, text = mailer.render_weekly_report(reports[sid])
    assert "1 right" in html and "2 wrong" in html and "1 not attempted" in html
    assert "1 right, 2 wrong, 1 not attempted" in text
    # Older results with no per-question detail fall back to the plain count
    _, html, text = mailer.render_weekly_report(reports[older])
    assert "2/4 correct" in html and "2/4 correct" in text and "not attempted" not in html


def test_student_who_joined_after_the_test_gets_no_absent_mark(scratch):
    name, db = scratch
    batch = add_batch(db)
    add_test(db, batch)
    late = add_student(db, batch, batch_enrolled_at={batch["id"]: iso(NOW - timedelta(hours=1))})
    assert late not in reports_for(name, batch)


def test_report_has_topics_change_and_never_names_classmates(scratch):
    name, db = scratch
    batch = add_batch(db, report_note="Bring a geometry box")
    sid, other = add_student(db, batch, name="Aarav Test"), add_student(db, batch, name="Secret Classmate")
    old, new = add_test(db, batch, days_ago=10, title="Old"), add_test(db, batch, days_ago=2, title="New")
    add_sub(db, old, sid, score=40, days_ago=10)
    add_sub(db, new, sid, score=80)
    add_sub(db, new, other, score=60)
    report = reports_for(name, batch)[sid]
    assert report["overall"]["change"] == 20  # from 40 to 60 (average of 40 and 80)
    assert [t["topic"] for t in report["strong_topics"]] == ["Circles"]
    assert [t["topic"] for t in report["weak_topics"]] == ["Trigonometry"]
    assert "Trigonometry" in report["next_step"]
    assert report["summary"] == "Aarav took 1 of 1 class test this week and scored 80%, above the class average of 70%."
    subject, html, text = mailer.render_weekly_report(report)
    assert "Aarav Test" in subject
    for body in (html, text):
        assert "Secret Classmate" not in body
        assert "Bring a geometry box" in body and "Only class tests" in body
    report["teacher_note"] = "<script>alert(1)</script>"
    assert "<script>" not in mailer.render_weekly_report(report)[1]


# ------------------------- Queue and sending -------------------------
def test_due_only_after_6pm_on_the_day_and_never_twice(scratch):
    name, db = scratch
    batch = add_batch(db)
    sid = add_student(db, batch)
    add_sub(db, add_test(db, batch), sid)
    before = NOW - timedelta(hours=2)  # 5 pm: last Sunday's report was too long ago to send late
    assert run(name, lambda adb: pr.queue_due_batches(adb, before)) == 0
    assert run(name, lambda adb: pr.queue_due_batches(adb, NOW)) == 1
    assert run(name, lambda adb: pr.queue_due_batches(adb, NOW + timedelta(minutes=5))) == 0
    send, sent = fake_sender()
    assert run(name, lambda adb: pr.send_queued(adb, NOW, send=send)) == 1
    assert run(name, lambda adb: pr.send_queued(adb, NOW, send=send)) == 0
    assert run(name, lambda adb: pr.queue_due_batches(adb, NOW + timedelta(hours=1))) == 0
    assert len(sent) == 1 and db.parent_reports.find_one({"student_id": sid})["message_id"] == "msg-1"


def test_week_with_no_class_test_sends_nothing_and_says_why(scratch):
    name, db = scratch
    batch = add_batch(db)
    add_student(db, batch)
    assert run(name, lambda adb: pr.queue_due_batches(adb, NOW)) == 0
    run_doc = db.parent_report_runs.find_one({"batch_id": batch["id"]})
    assert run_doc["status"] == "skipped" and run_doc["reason"] == "no_class_test"
    status = run(name, lambda adb: pr.batch_status(adb, batch, NOW))
    assert status["last_run"]["reason"] == "no_class_test"


def test_no_day_or_paused_batch_sends_nothing_and_paused_tests_wait(scratch):
    name, db = scratch
    no_day = add_batch(db, report_weekday=None)
    add_sub(db, add_test(db, no_day), add_student(db, no_day))
    paused = add_batch(db, reports_paused=True)
    sid = add_student(db, paused)
    add_sub(db, add_test(db, paused), sid)
    assert run(name, lambda adb: pr.queue_due_batches(adb, NOW)) == 0
    assert db.parent_reports.count_documents({}) == 0
    db.batches.update_one({"id": paused["id"]}, {"$set": {"reports_paused": False}})
    next_week = NOW + timedelta(days=7)
    assert run(name, lambda adb: pr.queue_due_batches(adb, next_week)) == 1


def test_consent_is_needed_and_withdrawal_stops_a_queued_email(scratch):
    name, db = scratch
    batch = add_batch(db)
    waiting, ok, ok2 = add_student(db, batch, consent="pending"), add_student(db, batch), add_student(db, batch)
    test = add_test(db, batch)
    for sid in (waiting, ok, ok2):
        add_sub(db, test, sid)
    assert run(name, lambda adb: pr.queue_due_batches(adb, NOW)) == 2
    assert db.parent_reports.find_one({"student_id": waiting})["reason"] == "no_parent_consent"
    db.users.update_one({"_id": ObjectId(ok)}, {"$set": {"parent_consent_status": "withdrawn"}})
    send, sent = fake_sender()
    assert run(name, lambda adb: pr.send_queued(adb, NOW, send=send)) == 1
    item = db.parent_reports.find_one({"student_id": ok})
    assert item["status"] == "skipped" and item["reason"] == "no_parent_consent" and len(sent) == 1


def test_pausing_one_student_leaves_the_rest_of_the_batch(scratch):
    name, db = scratch
    batch = add_batch(db)
    paused, other, stops_later = (add_student(db, batch, name=n) for n in ("Paused A", "Other B", "Later C"))
    db.users.update_one({"_id": ObjectId(paused)}, {"$set": {"report_paused_batch_ids": [batch["id"]]}})
    test = add_test(db, batch)
    for sid in (paused, other, stops_later):
        add_sub(db, test, sid)
    assert run(name, pr.weekday_load)[SUNDAY] == 2
    assert run(name, lambda adb: pr.queue_due_batches(adb, NOW)) == 2
    assert db.parent_reports.find_one({"student_id": paused})["reason"] == "paused_for_student"
    # Pausing also stops a report that's already waiting to go
    db.users.update_one({"_id": ObjectId(stops_later)}, {"$set": {"report_paused_batch_ids": [batch["id"]]}})
    send, sent = fake_sender()
    assert run(name, lambda adb: pr.send_queued(adb, NOW, send=send)) == 1
    assert db.parent_reports.find_one({"student_id": stops_later})["reason"] == "paused_for_student"
    assert db.parent_reports.find_one({"student_id": other})["status"] == "sent" and len(sent) == 1
    # Paused in one batch only: their report from another batch still goes
    second = add_batch(db, report_weekday=SUNDAY)
    db.users.update_one({"_id": ObjectId(paused)}, {"$push": {"batch_ids": second["id"]}})
    add_sub(db, add_test(db, second), paused)
    assert run(name, lambda adb: pr.queue_due_batches(adb, NOW)) == 1


def test_daily_cap_carries_over_to_the_next_day(scratch):
    name, db = scratch
    batch = add_batch(db)
    test = add_test(db, batch)
    for i in range(5):
        add_sub(db, test, add_student(db, batch, name=f"S{i}"))
    run(name, lambda adb: pr.queue_due_batches(adb, NOW))
    send, sent = fake_sender()
    assert run(name, lambda adb: pr.send_queued(adb, NOW, send=send, cap=3)) == 3
    assert run(name, lambda adb: pr.send_queued(adb, NOW, send=send, cap=3)) == 0
    tomorrow = NOW + timedelta(days=1)
    delayed = run(name, lambda adb: pr.batch_status(adb, batch, tomorrow))["last_run"]["delayed"]
    assert delayed == 2
    assert run(name, lambda adb: pr.send_queued(adb, tomorrow, send=send, cap=3)) == 2
    assert len(sent) == 5


def test_one_bad_student_does_not_stop_the_rest_and_failures_retry_then_stop(scratch, caplog):
    name, db = scratch
    batch = add_batch(db)
    test = add_test(db, batch)
    good = add_student(db, batch)
    bad = add_student(db, batch, email="bad@mail.test")
    add_sub(db, test, good)
    add_sub(db, test, bad)
    run(name, lambda adb: pr.queue_due_batches(adb, NOW))
    send, sent = fake_sender(fail_for=("bad@mail.test",))
    assert run(name, lambda adb: pr.send_queued(adb, NOW, send=send)) == 1
    assert db.parent_reports.find_one({"student_id": bad})["status"] == "queued"
    for _ in range(2):
        run(name, lambda adb: pr.send_queued(adb, NOW, send=send))
    item = db.parent_reports.find_one({"student_id": bad})
    assert item["status"] == "failed" and item["attempts"] == 3 and item["error"] == "RuntimeError"
    assert "secret detail" not in caplog.text
    assert db.parent_reports.find_one({"student_id": good})["status"] == "sent"


def test_bad_data_in_one_batch_does_not_stop_another(scratch):
    name, db = scratch
    broken = add_batch(db)
    db.tests.insert_one({"id": "broken", "kind": "test", "batch_id": broken["id"], "teacher_id": "t1", "valid_until": iso(NOW - timedelta(days=1))})
    db.submissions.insert_one({"test_id": "broken", "student_id": add_student(db, broken), "score": "not a number", "created_at": iso(NOW)})
    good = add_batch(db)
    add_sub(db, add_test(db, good), add_student(db, good))
    assert run(name, lambda adb: pr.queue_due_batches(adb, NOW)) == 1


def test_fake_addresses_are_skipped_not_sent(scratch):
    name, db = scratch
    batch = add_batch(db)
    sid = add_student(db, batch, email="parent@example.com")
    add_sub(db, add_test(db, batch), sid)
    run(name, lambda adb: pr.queue_due_batches(adb, NOW))
    send, sent = fake_sender()
    assert run(name, lambda adb: pr.send_queued(adb, NOW, send=send)) == 0
    assert not sent and db.parent_reports.find_one({"student_id": sid})["reason"] == "undeliverable_address"


def test_day_picker_counts_parents_who_can_get_a_report(scratch):
    name, db = scratch
    batch = add_batch(db, report_weekday=2)
    add_student(db, batch)
    add_student(db, batch)
    add_student(db, batch, consent="pending")
    load = run(name, pr.weekday_load)
    assert load[2] == 2 and load[3] == 0


def test_last_due_uses_india_time():
    # 1 am IST on Monday is still Sunday evening's window
    monday_1am = datetime(2026, 11, 9, 1, 0, tzinfo=APP_TIMEZONE)
    assert pr.last_due(SUNDAY, monday_1am).astimezone(APP_TIMEZONE).date().isoformat() == "2026-11-08"
    sunday_5pm = datetime(2026, 11, 8, 17, 0, tzinfo=APP_TIMEZONE)
    assert pr.last_due(SUNDAY, sunday_5pm).astimezone(APP_TIMEZONE).date().isoformat() == "2026-11-01"


# ------------------------- Numbers across the app, through a running server -------------------------
live_db = None


def _live():
    global live_db
    if live_db is None:
        live_db = MongoClient(os.environ["MONGO_URL"], tlsCAFile=certifi.where())[os.environ["DB_NAME"]]
    return live_db


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def _teacher():
    r = requests.post(f"{API}/auth/register", json={"name": "Report T", "email": f"test_teacher_{uuid.uuid4().hex[:8]}@example.com",
                                                    "password": "password123", "role": "teacher"}, timeout=20)
    assert r.status_code == 200, r.text
    return _headers(r.json()["token"]), r.json()["user"]["id"]


def _live_student(name, batch):
    r = requests.post(f"{API}/auth/register", json={"name": name, "email": f"test_student_{uuid.uuid4().hex[:8]}@example.com", "password": "password123"}, timeout=20)
    assert r.status_code == 200, r.text
    h = _headers(r.json()["token"])
    assert requests.post(f"{API}/batches/join", json={"code": batch["code"]}, headers=h, timeout=20).status_code == 200
    return h, r.json()["user"]["id"]


def _live_test(batch, teacher_id, hours_ago=3, kind="test", **extra):
    now = datetime.now(UTC)
    test = {"id": uuid.uuid4().hex, "title": "Live T", "kind": kind, "batch_id": batch["id"], "teacher_id": teacher_id, "class_level": "10",
            "status": "ready", "is_active": True, "duration_minutes": 20, "valid_from": iso(now - timedelta(hours=hours_ago + 1)),
            "valid_until": iso(now - timedelta(hours=hours_ago)), "makeups": [], "excused_student_ids": [],
            "questions": [{"id": "q1", "question": "Q?", "options": ["A", "B", "C", "D"], "correct_index": 0, "topic": "Circles"}], **extra}
    _live().tests.insert_one(dict(test))
    return test


def _live_sub(test, student_id, score, kind=None):
    _live().submissions.insert_one({"id": uuid.uuid4().hex, "test_id": test["id"], "student_id": student_id, "student_name": "x",
                                    "kind": kind or test["kind"], "batch_id": test["batch_id"], "score": score, "correct": round(score / 20), "total": 5,
                                    "results": [{"topic": "Circles", "chapter": "Circles", "subject": "Maths", "is_correct": i < round(score / 20)} for i in range(5)],
                                    "answers": [0] * 5, "created_at": iso(datetime.now(UTC) - timedelta(hours=2))})


def _batch(teacher):
    r = requests.post(f"{API}/batches", json={"name": f"Reports {uuid.uuid4().hex[:6]}", "class_level": "10"}, headers=teacher, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def test_students_cannot_make_their_own_class_test():
    teacher, _ = _teacher()
    h, sid = _live_student("Forger", _batch(teacher))
    for forced in ("test", "banana", "class_test"):
        r = requests.post(f"{API}/tests/diagnostic", json={"kind": forced, "class_level": "9"}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert _live().tests.find_one({"id": r.json()["id"]})["kind"] == "diagnostic"


def test_self_made_practice_and_deleted_tests_stay_out_of_every_average_and_rank():
    teacher, tid = _teacher()
    batch = _batch(teacher)
    h1, a = _live_student("Alpha", batch)
    h2, b = _live_student("Beta", batch)
    real = _live_test(batch, tid)
    _live_sub(real, a, 60)
    _live_sub(real, b, 80)
    deleted = _live_test(batch, tid, is_deleted=True)
    _live_sub(deleted, a, 100)
    _live_sub(deleted, b, 0)
    forged = _live_test(batch, None, student_id=a, batch_id=None)
    _live_sub(forged, a, 100)
    practice = _live_test(batch, tid, kind="dpp")
    _live_sub(practice, a, 100)

    term = requests.get(f"{API}/reports/batch/{batch['id']}/term", headers=teacher, timeout=30).json()
    rows = {r["student_id"]: r for r in term["student_summaries"]}
    assert rows[a]["avg_score"] == 60 and rows[a]["tests_taken"] == 1 and rows[a]["rank"] == 2
    assert rows[b]["avg_score"] == 80 and rows[b]["rank"] == 1

    topper = requests.get(f"{API}/batches/{batch['id']}/topper", headers=teacher, timeout=30).json()
    assert topper["topper"]["student_id"] == b
    assert {t["student_id"]: t["rank"] for t in topper["leaderboard"]} == {a: 2, b: 1}  # matches the term report

    stats = requests.get(f"{API}/stats", headers=h1, timeout=30).json()
    assert stats["tests_taken"] == 1 and stats["avg_score"] == 60

    mastery = requests.get(f"{API}/mastery/teacher", params={"batch_id": batch["id"]}, headers=teacher, timeout=30).json()
    assert mastery["class_avg_score"] == 70


def test_missed_class_test_counts_as_zero_in_term_rank_and_topper():
    teacher, tid = _teacher()
    batch = _batch(teacher)
    _, steady = _live_student("Steady", batch)
    _, lucky = _live_student("Lucky", batch)
    db = _live()
    # Their join date is set back, so these tests count as given after they joined
    db.users.update_many({"_id": {"$in": [ObjectId(steady), ObjectId(lucky)]}},
                         {"$set": {f"batch_enrolled_at.{batch['id']}": iso(datetime.now(UTC) - timedelta(days=30))}})
    t1, t2 = _live_test(batch, tid), _live_test(batch, tid)
    _live_sub(t1, steady, 80)
    _live_sub(t2, steady, 80)
    _live_sub(t1, lucky, 100)
    term = requests.get(f"{API}/reports/batch/{batch['id']}/term", headers=teacher, timeout=30).json()
    rows = {r["student_id"]: r for r in term["student_summaries"]}
    assert rows[steady]["rank"] == 1 and rows[lucky]["rank"] == 2 and rows[lucky]["rank_score"] == 50
    topper = requests.get(f"{API}/batches/{batch['id']}/topper", headers=teacher, timeout=30).json()
    assert topper["topper"]["student_id"] == steady


def test_leaderboard_ranks_class_tests_only_and_ties_share():
    teacher, tid = _teacher()
    batch = _batch(teacher)
    h1, a = _live_student("A", batch)
    _, b = _live_student("B", batch)
    now = datetime.now(UTC)
    test = _live_test(batch, tid, valid_until=iso(now + timedelta(hours=1)))
    _live_sub(test, a, 80)
    _live_sub(test, b, 80)
    board = requests.get(f"{API}/tests/{test['id']}/leaderboard", headers=h1, timeout=20).json()
    assert [row["rank"] for row in board] == [1, 1]
    practice = _live_test(batch, tid, kind="dpp", valid_until=iso(now + timedelta(hours=1)))
    assert requests.get(f"{API}/tests/{practice['id']}/leaderboard", headers=h1, timeout=20).status_code == 403
    rows = requests.get(f"{API}/tests/{practice['id']}/leaderboard", headers=teacher, timeout=20)
    assert rows.status_code == 200


def test_infinite_or_negative_times_are_refused_and_reports_survive():
    teacher, tid = _teacher()
    batch = _batch(teacher)
    h, sid = _live_student("Times", batch)
    now = datetime.now(UTC)
    test = _live_test(batch, tid, valid_from=iso(now - timedelta(minutes=5)), valid_until=iso(now + timedelta(hours=1)))
    assert requests.get(f"{API}/tests/{test['id']}", headers=h, timeout=20).status_code == 200
    for bad in ("1e999", "-1", "100000"):
        body = '{"answers":[0],"times":[%s]}' % bad
        r = requests.post(f"{API}/tests/{test['id']}/submit", data=body, headers={**h, "Content-Type": "application/json"}, timeout=20)
        assert r.status_code == 422, (bad, r.status_code)
        r = requests.put(f"{API}/tests/{test['id']}/draft", data=body, headers={**h, "Content-Type": "application/json"}, timeout=20)
        assert r.status_code == 422, (bad, r.status_code)
    assert requests.post(f"{API}/tests/{test['id']}/submit", json={"answers": [0], "times": [12.5]}, headers=h, timeout=20).status_code == 200


def test_report_settings_preview_and_status_are_for_the_batch_owner():
    teacher, tid = _teacher()
    other, _ = _teacher()
    batch = _batch(teacher)
    url = f"{API}/batches/{batch['id']}"
    assert requests.put(url, json={"report_weekday": 3}, headers=other, timeout=20).status_code == 403
    assert requests.get(f"{url}/reports/status", headers=other, timeout=20).status_code == 403
    assert requests.get(f"{url}/reports/preview", headers=other, timeout=20).status_code == 403
    assert requests.post(f"{url}/reports/retry", headers=other, timeout=20).status_code == 403
    assert requests.put(url, json={"report_weekday": 9}, headers=teacher, timeout=20).status_code == 400

    r = requests.put(url, json={"report_weekday": 3, "report_note": "  Bring a box  "}, headers=teacher, timeout=20)
    assert r.status_code == 200, r.text
    status = requests.get(f"{url}/reports/status", headers=teacher, timeout=20).json()
    assert status["report_weekday"] == 3 and status["report_note"] == "Bring a box" and not status["reports_paused"]
    assert status["next_send"] and status["daily_cap"] == 250 and status["last_run"] is None

    assert requests.get(f"{url}/reports/preview", headers=teacher, timeout=20).json() == {"has_report": False, "reason": "no_class_test"}
    _, sid = _live_student("Preview", batch)
    _live_sub(_live_test(batch, tid), sid, 75)
    preview = requests.get(f"{url}/reports/preview", params={"student_id": sid}, headers=teacher, timeout=30).json()
    assert preview["has_report"] and "75" in preview["html"] and "Bring a box" in preview["html"]

    assert requests.put(url, json={"reports_paused": True, "report_weekday": -1}, headers=teacher, timeout=20).status_code == 200
    status = requests.get(f"{url}/reports/status", headers=teacher, timeout=20).json()
    assert status["reports_paused"] and status["report_weekday"] is None


def test_teacher_can_pause_and_resume_one_students_report():
    teacher, tid = _teacher()
    other, _ = _teacher()
    batch = _batch(teacher)
    _, sid = _live_student("Pause Me", batch)
    url = f"{API}/batches/{batch['id']}/students/{sid}/report-pause"
    assert requests.put(url, json={"paused": True}, headers=other, timeout=20).status_code == 403
    assert requests.put(url, json={"paused": True}, headers=teacher, timeout=20).status_code == 200
    def row():
        roster = requests.get(f"{API}/batches/{batch['id']}/students", headers=teacher, timeout=20).json()
        return next(r for r in (roster["students"] if isinstance(roster, dict) else roster) if r["id"] == sid)
    assert row()["report_paused"] is True and row()["parent_consent_status"] == "confirmed"  # consent untouched
    assert requests.put(url, json={"paused": False}, headers=teacher, timeout=20).status_code == 200
    assert row()["report_paused"] is False


def test_erasing_a_student_removes_their_reports():
    teacher, _ = _teacher()
    batch = _batch(teacher)
    _, sid = _live_student("Erased", batch)
    _live().parent_reports.insert_one({"id": uuid.uuid4().hex, "batch_id": batch["id"], "student_id": sid, "week": "2026-11-08", "status": "sent", "report": {"student_name": "Erased"}})
    admin = requests.post(f"{API}/auth/login", json={"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]}, timeout=20).json()["token"]
    assert requests.delete(f"{API}/admin/students/{sid}", headers=_headers(admin), timeout=30).status_code == 200
    assert _live().parent_reports.count_documents({"student_id": sid}) == 0
