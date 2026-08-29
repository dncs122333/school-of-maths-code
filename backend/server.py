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
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, Query, Header
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware

from config import logger, EMERGENT_KEY, DIFFICULTIES, _VALID_STATUSES
from db import db, api_router
from models import RegisterInput, LoginInput, BatchInput, JoinInput, GenerateNoteInput, GenerateTestInput, SubmitInput
from auth import hash_password, verify_password, create_access_token, get_current_user, require_role, user_from_token
from ai import init_storage, put_object, get_object, gen_concept_image, extract_text_from_file, llm_generate_notes
from lib.mastery import compute_topic_mastery

app = FastAPI()

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
    uid = str(user["_id"])
    token = create_access_token(uid, email, user["role"])
    return {"token": token, "user": {"id": uid, "name": user["name"], "email": email,
                                     "role": user["role"], "batch_ids": user.get("batch_ids", [])}}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ------------------------- Catalog -------------------------
@api_router.get("/catalog")
async def catalog():
    return CATALOG


# ------------------------- Batches -------------------------
@api_router.post("/batches")
async def create_batch(body: BatchInput, user: dict = Depends(require_role("teacher", "admin"))):
    code = secrets.token_hex(3).upper()
    doc = {"id": str(uuid.uuid4()), "name": body.name, "class_level": body.class_level,
           "code": code, "teacher_id": user["id"], "teacher_name": user["name"],
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.batches.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/batches")
async def list_batches(user: dict = Depends(get_current_user)):
    if user["role"] in ("teacher", "admin"):
        q = {} if user["role"] == "admin" else {"teacher_id": user["id"]}
    else:
        q = {"id": {"$in": user.get("batch_ids", [])}}
    batches = await db.batches.find(q, {"_id": 0}).to_list(500)
    for b in batches:
        b["student_count"] = await db.users.count_documents({"batch_ids": b["id"]})
    return batches


@api_router.post("/batches/join")
async def join_batch(body: JoinInput, user: dict = Depends(require_role("student"))):
    batch = await db.batches.find_one({"code": body.code.upper().strip()}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Invalid batch code")
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$addToSet": {"batch_ids": batch["id"]}})
    return batch


# ------------------------- Notes -------------------------
@api_router.post("/extract")
async def extract(file: UploadFile = File(...), user: dict = Depends(require_role("teacher", "admin"))):
    data = await file.read()
    text = extract_text_from_file(file.filename, data)
    return {"text": text, "filename": file.filename}


async def _process_note(note_id: str, body: GenerateNoteInput):
    try:
        data = await llm_generate_notes(body)
        sections = data.get("sections", [])
        img_done = 0
        for s in sections:
            p = (s.get("image_prompt") or "").strip()
            if p and img_done < 4:
                path = await gen_concept_image(p)
                if path:
                    s["image_path"] = path
                    img_done += 1
            s.pop("image_prompt", None)
        await db.notes.update_one({"id": note_id}, {"$set": {
            "title": body.title or data.get("title", "Untitled"),
            "intro": data.get("intro", ""), "sections": sections,
            "mnemonics": data.get("mnemonics", []), "quick_revision": data.get("quick_revision", []),
            "coverage": data.get("_coverage", {}), "status": "ready"}})
    except Exception as e:
        logger.error(f"note processing failed: {e}")
        await db.notes.update_one({"id": note_id}, {"$set": {"status": "failed", "error": str(e)[:200]}})


@api_router.post("/notes")
async def create_note(body: GenerateNoteInput, user: dict = Depends(require_role("teacher", "admin"))):
    if not body.raw_text.strip():
        raise HTTPException(status_code=400, detail="Notes content is empty")
    note_id = str(uuid.uuid4())
    doc = {"id": note_id, "title": body.title or "Untitled",
           "class_level": body.class_level, "subject": body.subject, "chapter": body.chapter,
           "topic": body.topic or "", "intro": "", "sections": [], "mnemonics": [], "quick_revision": [],
           "coverage": {}, "status": "processing",
           "teacher_id": user["id"], "teacher_name": user["name"],
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.notes.insert_one(doc)
    asyncio.create_task(_process_note(note_id, body))
    return {"id": note_id, "status": "processing"}


@api_router.get("/notes")
async def list_notes(class_level: Optional[str] = None, subject: Optional[str] = None,
                     chapter: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if user["role"] == "teacher":
        q["teacher_id"] = user["id"]
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
    return note


# ------------------------- Materials (direct uploads, no AI) -------------------------
_MIME = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
         "webp": "image/webp", "gif": "image/gif", "txt": "text/plain",
         "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}


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
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
    ct = file.content_type or _MIME.get(ext, "application/octet-stream")
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
    items = await db.resources.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.delete("/resources/{res_id}")
async def delete_resource(res_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    res = await db.resources.find_one({"id": res_id}, {"_id": 0})
    if not res:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and res["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your resource")
    await db.resources.update_one({"id": res_id}, {"$set": {"is_deleted": True}})
    return {"ok": True}


@api_router.get("/resources/{res_id}/file")
async def download_resource(res_id: str, authorization: str = Header(None)):
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else None
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
    return Response(content=content, media_type=res.get("content_type", ct),
                    headers={"Content-Disposition": f'inline; filename="{res["filename"]}"'})


# ------------------------- Tests / DPP -------------------------
async def _build_test(test_id: str, body: GenerateTestInput):
    """Background task: sample ACTIVE questions from the bank, snapshot them, mark ready."""
    try:
        questions = await _sample_bank_questions(body.class_level, body.subject, body.chapter,
                                                 body.topic or "", body.question_count)
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
                                 topic: str, count: int) -> list:
    q = {"class_level": class_level, "status": "active"}
    if subject:
        q["subject"] = subject
    if chapter:
        q["chapter"] = chapter
    if topic:
        q["topic"] = topic
    pool = await db.question_bank.find(q, {"_id": 0}).to_list(1000)
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
    out = []
    for t in tests:
        vu = datetime.fromisoformat(t["valid_until"])
        vf = datetime.fromisoformat(t["valid_from"])
        subs = await db.submissions.find({"test_id": t["id"], "student_id": user["id"]}, {"_id": 0}) \
            .sort("created_at", -1).to_list(1)
        sub = subs[0] if subs else None
        out.append({"id": t["id"], "title": t["title"], "kind": t["kind"], "subject": t["subject"],
                    "chapter": t["chapter"], "topic": t["topic"], "class_level": t["class_level"],
                    "duration_minutes": t["duration_minutes"], "question_count": len(t.get("questions", [])),
                    "valid_from": t["valid_from"], "valid_until": t["valid_until"],
                    "is_active": (t["kind"] == "dpp") or (vf <= now <= vu),
                    "submitted": bool(sub), "score": sub.get("score") if sub else None})
    return out


@api_router.get("/tests/{test_id}")
async def get_test(test_id: str, user: dict = Depends(get_current_user)):
    test = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] == "student":
        if test["kind"] == "test":
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


# ------------------------- Question bank -------------------------
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
    students = [{"id": str(s["_id"]), "name": s["name"]} for s in students_raw]
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
async def media(path: str):
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
        avg = round(sum(s["score"] for s in subs) / len(subs)) if subs else 0
        batch_docs = await db.batches.find({"id": {"$in": user.get("batch_ids", [])}}, {"_id": 0, "class_level": 1}).to_list(20)
        class_levels = [b["class_level"] for b in batch_docs]
        note_count = await db.notes.count_documents({"class_level": {"$in": class_levels}}) if class_levels else 0
        return {"tests_taken": len(subs), "avg_score": avg,
                "batches": len(batch_docs), "notes": note_count}
    q = {} if user["role"] == "admin" else {"teacher_id": user["id"]}
    return {"notes": await db.notes.count_documents(q),
            "tests": await db.tests.count_documents({**q, "kind": "test"}),
            "dpps": await db.tests.count_documents({**q, "kind": "dpp"}),
            "batches": await db.batches.count_documents(q if user["role"] == "admin" else {"teacher_id": user["id"]}),
            "students": await db.users.count_documents({"role": "student"})}


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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
