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

from config import logger, EMERGENT_KEY, DIFFICULTIES, _VALID_STATUSES, ROOT_DIR
from db import db, api_router
from models import RegisterInput, LoginInput, BatchInput, JoinInput, GenerateNoteInput, GenerateTestInput, SubmitInput, StartTestInput, AutoSaveInput, SyncLocalInput, EditNoteInput, StartPracticeInput, PracticeAnswerInput, CreateNoticeInput, CreateChallengeInput, ResolveChallengeInput
from PIL import Image, ImageDraw, ImageFont
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
           "academic_year": getattr(body, 'academic_year', '2025-26'), "subjects": getattr(body, 'subjects', []), "status": "ACTIVE",
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
        # Students only see batches they are actively linked to (via legacy or new table)
        active_links = await db.batch_students.find({"student_id": user["id"], "status": "ACTIVE"}, {"_id": 0, "batch_id": 1}).to_list(100)
        linked_ids = [link["batch_id"] for link in active_links]
        legacy_ids = user.get("batch_ids", [])
        all_ids = list(set(linked_ids + legacy_ids))
        q = {"id": {"$in": all_ids}}
        
    batches = await db.batches.find(q, {"_id": 0}).to_list(500)
    for b in batches:
        # Count active students from new link table, fallback to legacy array
        active_links = await db.batch_students.count_documents({"batch_id": b["id"], "status": "ACTIVE"})
        if active_links > 0:
            b["student_count"] = active_links
        else:
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




# ------------------------- Helper: Student Note Access Control (Spec 4.5) -------------------------
async def check_student_note_access(user_id: str, note_doc: dict) -> bool:
    batch_id = note_doc.get("batch_id")
    if not batch_id:
        return False
    active_link = await db.batch_students.find_one({"student_id": user_id, "batch_id": batch_id, "status": "ACTIVE"})
    if active_link:
        return True
    inactive_link = await db.batch_students.find_one({"student_id": user_id, "batch_id": batch_id, "status": "INACTIVE", "left_at": {"$ne": None}})
    if inactive_link:
        left_at = datetime.fromisoformat(inactive_link["left_at"])
        if datetime.now(timezone.utc) - left_at <= timedelta(days=30):
            return True
    return False

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
           "is_pinned": False, "is_deleted": False, "images": [], "max_images": 100,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.notes.insert_one(doc)
    asyncio.create_task(_process_note(note_id, body))
    return {"id": note_id, "status": "processing"}


@api_router.get("/notes")
async def list_notes(class_level: Optional[str] = None, subject: Optional[str] = None,
                     chapter: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"is_deleted": {"$ne": True}}
    if user["role"] == "teacher":
        q["teacher_id"] = user["id"]
    else:
        now = datetime.now(timezone.utc)
        thirty_days_ago = (now - timedelta(days=30)).isoformat()
        valid_links = await db.batch_students.find({
            "student_id": user["id"],
            "$or": [
                {"status": "ACTIVE"},
                {"status": "INACTIVE", "left_at": {"$gte": thirty_days_ago}}
            ]
        }, {"_id": 0, "batch_id": 1}).to_list(100)
        valid_batch_ids = [link["batch_id"] for link in valid_links]
        if not valid_batch_ids:
            return []
        q["batch_id"] = {"$in": valid_batch_ids}
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
    note = await db.notes.find_one({"id": note_id, "is_deleted": {"$ne": True}}, {"_id": 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if user["role"] == "student":
        if not await check_student_note_access(user["id"], note):
            raise HTTPException(status_code=403, detail="Access denied to this note")
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
    out = []
    for t in tests:
        vu = datetime.fromisoformat(t["valid_until"])
        vf = datetime.fromisoformat(t["valid_from"])
        subs = await db.submissions.find({"test_id": t["id"], "student_id": user["id"]}, {"_id": 0}) \
            .sort("created_at", -1).to_list(1)
        sub = subs[0] if subs else None
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
@api_router.post("/api/tests/{test_id}/submit")
async def submit_test(test_id: str, body: SubmitInput, user: dict = Depends(require_role("student"))):
    test = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Not found")
        
    attempt = await db.student_attempts.find_one({"test_id": test_id, "student_id": user["id"], "status": "IN_PROGRESS"}, {"_id": 0})
    if not attempt:
        # Fallback to legacy submission if no active attempt found
        if await db.submissions.find_one({"test_id": test_id, "student_id": user["id"]}):
            raise HTTPException(status_code=403, detail="Already submitted")
        attempt = {"id": str(uuid.uuid4()), "answers": []}
        
    questions = test["questions"]
    total = len(questions)

    answers = list(body.answers)
    answers = (answers + [-1] * total)[:total]

    times = [round(float(t), 2) for t in (body.times or [])]
    times = (times + [0.0] * total)[:total]

    correct = 0
    review = []
    results = []
    for i, q in enumerate(questions):
        order = _shuffled_order(_option_seed(test_id, user["id"], i))
        shuffled_options = [q["options"][j] for j in order]
        chosen = answers[i]                                
        correct_display = order.index(q["correct_index"])  
        is_ok = chosen == correct_display
        if is_ok:
            correct += 1
        review.append({"question": q["question"], "options": shuffled_options, "chosen": chosen,
                       "correct_index": correct_display, "explanation": q.get("explanation", ""),
                       "is_correct": is_ok, "time_s": times[i]})
        results.append({"q": i, "subject": q.get("subject", test.get("subject", "")),
                        "chapter": q.get("chapter", test.get("chapter", "")),
                        "topic": q.get("topic", test.get("topic", "")),
                        "difficulty": q.get("difficulty", "medium"),
                        "is_correct": is_ok, "time_s": times[i]})

    score = round(correct / total * 100) if total else 0
    
    # Grace period & Late Penalty (Spec 5.4.2)
    deadline = test.get("deadline")
    if isinstance(deadline, str):
        try:
            deadline = datetime.fromisoformat(deadline.replace('Z', '+00:00'))
        except:
            deadline = None
            
    grace_hours = test.get("grace_period_hours", 0)
    late_penalty = test.get("late_penalty_percent", 0)
    
    now = datetime.now(timezone.utc)
    status = "submitted"
    penalty_applied = 0
    
    if deadline and now > deadline:
        if grace_hours > 0 and now <= deadline + timedelta(hours=grace_hours):
            status = "late_submitted"
            penalty_applied = late_penalty
            score = max(0, score - penalty_applied)
        else:
            status = "auto_submitted" 

    # Anti-Cheat logic (Spec 11.1 & 11.2)
    tab_switches = max(0, int(body.tab_switches or 0))
    is_flagged = False
    if tab_switches >= 3:
        is_flagged = True
        status = "flagged_submitted"
        
    # Update attempt
    await db.student_attempts.update_one(
        {"id": attempt["id"]}, 
        {"$set": {
            "status": status, 
            "is_flagged": is_flagged, 
            "tab_switch_count": tab_switches, 
            "submitted_at": now.isoformat(),
            "score": correct,
            "percentage": score,
            "penalty_applied": penalty_applied,
            "final_score": correct, 
            "final_percentage": score,
            "answers": [{"question_id": str(i), "selected_option": str(a), "time_spent_seconds": t} for i, a, t in zip(range(total), answers, times)]
        }}
    )
    
    # Mark device session inactive
    await db.active_device_sessions.update_many(
        {"attempt_id": attempt["id"], "is_active": True},
        {"$set": {"is_active": False}}
    )

    sub = {"id": str(uuid.uuid4()), "test_id": test_id, "kind": test["kind"], "title": test["title"],
           "student_id": user["id"], "student_name": user["name"],
           "answers": answers, "times": times, "tab_switches": tab_switches,
           "results": results,
           "score": score, "correct": correct, "total": total, "status": status,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.submissions.insert_one(dict(sub))
    
    return {"score": score, "correct": correct, "total": total, "review": review, "status": status}



# ------------------------- Spec v2.0 Fixes: Test Race Condition & Media Auth -------------------------

@api_router.post("/api/tests/{test_id}/start")
async def start_test(test_id: str, body: StartTestInput, user: dict = Depends(require_role("student"))):
    test = await db.tests.find_one({"id": test_id, "status": "ACTIVE"}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found or not active")

    # Device Locking (Spec 11.4)
    existing_session = await db.active_device_sessions.find_one({
        "test_id": test_id, "student_id": user["id"], "is_active": True
    })
    
    if existing_session and existing_session["device_id"] != body.device_id:
        raise HTTPException(status_code=409, detail="Attempt locked to another device")
        
    if existing_session:
        attempt = await db.student_attempts.find_one({"id": existing_session["attempt_id"]}, {"_id": 0})
        await db.active_device_sessions.update_one(
            {"id": existing_session["id"]}, 
            {"$set": {"last_activity_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"attempt_id": attempt["id"], "answers": attempt.get("answers", []), "resumed": True}

    attempt_id, session_id = str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    attempt = {
        "id": attempt_id, "test_id": test_id, "student_id": user["id"],
        "device_id": body.device_id, "started_at": now,
        "answers": [], "score": 0, "status": "IN_PROGRESS",
        "tab_switch_count": 0, "is_flagged": False, "created_at": now
    }
    session = {
        "id": session_id, "attempt_id": attempt_id, "test_id": test_id,
        "student_id": user["id"], "device_id": body.device_id,
        "started_at": now, "last_activity_at": now, "is_active": True, "created_at": now
    }
    
    await db.student_attempts.insert_one(attempt)
    await db.active_device_sessions.insert_one(session)
    
    return {"attempt_id": attempt_id, "test_config": test, "resumed": False}

@api_router.post("/api/tests/{test_id}/save")
async def auto_save(test_id: str, body: AutoSaveInput, user: dict = Depends(require_role("student"))):
    attempt = await db.student_attempts.find_one({"test_id": test_id, "student_id": user["id"], "status": "IN_PROGRESS"}, {"_id": 0})
    if not attempt:
        raise HTTPException(status_code=404, detail="Active attempt not found")
        
    await db.student_attempts.update_one({"id": attempt["id"]}, {"$set": {"answers": body.answers}})
    await db.active_device_sessions.update_one(
        {"attempt_id": attempt["id"], "is_active": True}, 
        {"$set": {"last_activity_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "saved"}

@api_router.post("/api/tests/{test_id}/sync-local")
async def sync_local(test_id: str, body: SyncLocalInput, user: dict = Depends(require_role("student"))):
    attempt = await db.student_attempts.find_one({"test_id": test_id, "student_id": user["id"], "status": "IN_PROGRESS"}, {"_id": 0})
    if not attempt:
        raise HTTPException(status_code=404, detail="Active attempt not found")
        
    server_answers = {w["question_id"]: w for w in attempt.get("answers", [])}
    for local_item in body.local_queue:
        if "question_id" in local_item:
            server_answers[local_item["question_id"]] = local_item
        
    await db.student_attempts.update_one({"id": attempt["id"]}, {"$set": {"answers": list(server_answers.values())}})
    return {"status": "synced"}



@api_router.put("/notes/{note_id}")
async def edit_note(note_id: str, body: EditNoteInput, user: dict = Depends(require_role("teacher", "admin"))):
    note = await db.notes.find_one({"id": note_id, "teacher_id": user["id"]}, {"_id": 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
        
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.title is not None:
        update_data["title"] = body.title
        
    if body.batch_id is not None:
        update_data["batch_id"] = body.batch_id
        
    if body.is_pinned is not None:
        if body.is_pinned:
            target_batch = body.batch_id or note.get("batch_id")
            if target_batch:
                pinned_count = await db.notes.count_documents({
                    "batch_id": target_batch, "is_pinned": True, "is_deleted": {"$ne": True}, "id": {"$ne": note_id}
                })
                if pinned_count >= 3:
                    raise HTTPException(status_code=400, detail="Max 3 pinned notes per batch")
        update_data["is_pinned"] = body.is_pinned
        
    await db.notes.update_one({"id": note_id}, {"$set": update_data})
    return {"status": "updated"}

@api_router.get("/api/notes/{note_id}/image/{image_id}")
async def get_watermarked_image(note_id: str, image_id: str, user: dict = Depends(require_role("student"))):
    note = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
        
    # Strict Access Control: Verify BatchStudent link (Spec 2.3 & 4.5)
    is_enrolled = await db.batch_students.find_one({
        "batch_id": note.get("batch_id"), "student_id": user["id"], "status": "ACTIVE"
    })
    if not is_enrolled:
        raise HTTPException(status_code=403, detail="Access denied to this note")

    # Fetch raw image from object storage
    images = note.get("images", [])
    if int(image_id) >= len(images):
        raise HTTPException(status_code=404, detail="Image not found")
        
    image_url = images[int(image_id)].get("full_url") or images[int(image_id)].get("url")
    if not image_url:
         raise HTTPException(status_code=404, detail="Image URL not found")
         
    try:
        raw_data, ct = get_object(image_url)
    except Exception:
        raise HTTPException(status_code=404, detail="Image not found in storage")
    
    # Dynamic Watermarking (Spec 4.4)
    try:
        img = Image.open(io.BytesIO(raw_data)).convert("RGBA")
        txt = Image.new("RGBA", img.size, (255,255,255,0))
        
        center_name = user.get("center_name", "Coaching Center")
        watermark_text = f"{user['name']} ・ {center_name}"
        if len(watermark_text) > 25:
            watermark_text = watermark_text[:22] + "..."
            
        try:
            font = ImageFont.truetype("arial.ttf", 12)
        except:
            font = ImageFont.load_default()
            
        draw = ImageDraw.Draw(txt)
        bbox = draw.textbbox((0, 0), watermark_text, font=font)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        
        # Bottom-right, 30% opacity light gray
        draw.text((img.width - w - 10, img.height - h - 10), watermark_text, font=font, fill=(211, 211, 211, 76))
        
        watermarked = Image.alpha_composite(img, txt)
        buf = io.BytesIO()
        watermarked.convert("RGB").save(buf, format="JPEG", quality=85)
        buf.seek(0)
        return Response(content=buf.read(), media_type="image/jpeg")
    except Exception as e:
        # Fallback to raw image if watermarking fails
        return Response(content=raw_data, media_type=ct)


# ------------------------- Spec v2.0: Batch Management & Student Admission -------------------------

@api_router.post("/batches/{batch_id}/students")
async def add_student_to_batch(batch_id: str, body: AddStudentInput, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await db.batches.find_one({"id": batch_id, "teacher_id": user["id"]}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found or access denied")
    if batch.get("status") == "ARCHIVED":
        raise HTTPException(status_code=400, detail="Cannot add students to archived batch")

    # Spec 1.6: Check if student already exists by phone number to re-link them
    existing_student = await db.users.find_one({"phone": body.phone, "role": "student"}, {"_id": 0})
    
    if existing_student:
        student_id = existing_student["id"]
        # Re-link them to the new batch
        await db.users.update_one({"id": student_id}, {"$addToSet": {"batch_ids": batch_id}})
        
        existing_link = await db.batch_students.find_one({"batch_id": batch_id, "student_id": student_id})
        if existing_link:
            await db.batch_students.update_one(
                {"id": existing_link["id"]},
                {"$set": {"status": "ACTIVE", "left_at": None, "joined_at": datetime.now(timezone.utc).isoformat()}}
            )
        else:
            link_doc = {
                "id": str(uuid.uuid4()), "batch_id": batch_id, "student_id": student_id,
                "joined_at": datetime.now(timezone.utc).isoformat(), "left_at": None,
                "status": "ACTIVE", "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.batch_students.insert_one(link_doc)
            
        return {"student_id": student_id, "temp_password": None, "status": "relinked"}

    # Create new student if they don't exist
    student_id = str(uuid.uuid4())
    temp_password = secrets.token_hex(6) 
    
    student_doc = {
        "id": student_id, "name": body.name, "phone": body.phone,
        "email": f"student_{student_id}@local.com",
        "password": hash_password(temp_password), "role": "student",
        "parent_name": body.parent_name, "parent_email": body.parent_email,
        "parent_phone": body.parent_phone, "batch_ids": [batch_id],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(student_doc)

    link_doc = {
        "id": str(uuid.uuid4()), "batch_id": batch_id, "student_id": student_id,
        "joined_at": datetime.now(timezone.utc).isoformat(), "left_at": None,
        "status": "ACTIVE", "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.batch_students.insert_one(link_doc)

    return {"student_id": student_id, "temp_password": temp_password, "status": "created"}

@api_router.put("/batches/{batch_id}/students/{student_id}")
async def mark_student_inactive(batch_id: str, student_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    batch = await db.batches.find_one({"id": batch_id, "teacher_id": user["id"]}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    result = await db.batch_students.update_one(
        {"batch_id": batch_id, "student_id": student_id, "status": "ACTIVE"},
        {"$set": {"status": "INACTIVE", "left_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Active student link not found")
    
    await db.users.update_one({"id": student_id}, {"$pull": {"batch_ids": batch_id}})
    
    return {"status": "inactive"}

@api_router.put("/batches/{batch_id}/archive")
async def archive_batch(batch_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    result = await db.batches.update_one(
        {"id": batch_id, "teacher_id": user["id"]},
        {"$set": {
            "status": "ARCHIVED", 
            "archived_at": datetime.now(timezone.utc).isoformat(), 
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    await db.batch_students.update_many(
        {"batch_id": batch_id, "status": "ACTIVE"},
        {"$set": {"status": "INACTIVE", "left_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"status": "archived"}


# ------------------------- Spec v2.0: Notes Feature (Sections 4.1-4.5, 15.3) -------------------------

@api_router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    # Spec 4.2: Soft delete with 30-day retention
    result = await db.notes.update_one(
        {"id": note_id, "teacher_id": user["id"]},
        {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"status": "deleted"}

@api_router.put("/notes/{note_id}/pin")
async def pin_note(note_id: str, body: PinNoteInput, user: dict = Depends(require_role("teacher", "admin"))):
    note = await db.notes.find_one({"id": note_id, "teacher_id": user["id"]}, {"_id": 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
        
    if body.is_pinned:
        # Spec 2.9: Max 3 pinned notes per batch
        pinned_count = await db.notes.count_documents({
            "batch_id": body.batch_id, "is_pinned": True, "is_deleted": {"$ne": True}
        })
        if pinned_count >= 3:
            raise HTTPException(status_code=400, detail="Max 3 pinned notes per batch")
            
    await db.notes.update_one(
        {"id": note_id},
        {"$set": {"is_pinned": body.is_pinned, "batch_id": body.batch_id, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "updated", "is_pinned": body.is_pinned}

@api_router.post("/notes/{note_id}/bookmark")
async def toggle_bookmark(note_id: str, user: dict = Depends(require_role("student"))):
    existing = await db.student_bookmarks.find_one({"note_id": note_id, "student_id": user["id"]})
    if existing:
        await db.student_bookmarks.delete_one({"_id": existing["_id"]})
        return {"status": "removed"}
    else:
        await db.student_bookmarks.insert_one({
            "id": str(uuid.uuid4()), "note_id": note_id, "student_id": user["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        return {"status": "added"}

@api_router.get("/notes/bookmarks")
async def list_bookmarks(user: dict = Depends(require_role("student"))):
    bookmarks = await db.student_bookmarks.find({"student_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return bookmarks

@api_router.post("/notes/{note_id}/view")
async def mark_note_viewed(note_id: str, user: dict = Depends(require_role("student"))):
    # Spec 2.12: Unique constraint (note_id, student_id)
    await db.note_views.update_one(
        {"note_id": note_id, "student_id": user["id"]},
        {"$set": {"viewed_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"status": "viewed"}

@api_router.post("/notes/{note_id}/images")
async def add_note_image(note_id: str, file: UploadFile = File(...), user: dict = Depends(require_role("teacher", "admin"))):
    note = await db.notes.find_one({"id": note_id, "teacher_id": user["id"]}, {"_id": 0})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
        
    images = note.get("images", [])
    if len(images) >= 100:
        raise HTTPException(status_code=400, detail="Max 100 images per note. Please split into multiple notes.")
        
    content = await file.read()
    img_id = str(uuid.uuid4())
    
    try:
        img = Image.open(io.BytesIO(content))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
            
        max_width = 1200
        if img.width > max_width:
            ratio = max_width / img.width
            new_size = (max_width, int(img.height * ratio))
            img_full = img.resize(new_size, Image.Resampling.LANCZOS)
        else:
            img_full = img.copy()
            
        buf_full = io.BytesIO()
        img_full.save(buf_full, format="JPEG", quality=80, optimize=True)
        full_bytes = buf_full.getvalue()
        
        thumb_width = 300
        ratio = thumb_width / img.width
        new_size = (thumb_width, int(img.height * ratio))
        img_thumb = img.resize(new_size, Image.Resampling.LANCZOS)
        
        buf_thumb = io.BytesIO()
        img_thumb.save(buf_thumb, format="JPEG", quality=60, optimize=True)
        thumb_bytes = buf_thumb.getvalue()
        
        path_full = f"notes/{note_id}/{img_id}_full.jpg"
        path_thumb = f"notes/{note_id}/{img_id}_thumb.jpg"
        
        put_object(path_full, full_bytes, "image/jpeg")
        put_object(path_thumb, thumb_bytes, "image/jpeg")
        
        image_doc = {
            "id": img_id, "original_url": path_full, "thumbnail_url": path_thumb, "full_url": path_full,
            "order_index": len(images), "file_size_kb": len(full_bytes) // 1024,
            "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        logger.error(f"Image compression failed for note {note_id}, falling back to raw upload: {e}")
        ext = file.filename.split(".")[-1].lower() if file.filename else "jpg"
        path_raw = f"notes/{note_id}/{img_id}.{ext}"
        put_object(path_raw, content, file.content_type or "application/octet-stream")
        image_doc = {
            "id": img_id, "original_url": path_raw, "thumbnail_url": path_raw, "full_url": path_raw,
            "order_index": len(images), "file_size_kb": len(content) // 1024,
            "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()
        }
    
    await db.notes.update_one(
        {"id": note_id},
        {"$push": {"images": image_doc}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"image": image_doc}


# ------------------------- Spec v2.0: Chapter Practice Feature (Sections 6.1-6.7, 15.5) -------------------------

@api_router.post("/practice/start")
async def start_practice(body: StartPracticeInput, user: dict = Depends(require_role("student"))):
    # 1. Get student's active batch
    batch_id = user.get("batch_ids", [None])[0]
    if not batch_id:
        link = await db.batch_students.find_one({"student_id": user["id"], "status": "ACTIVE"})
        if link: batch_id = link["batch_id"]
    if not batch_id:
        raise HTTPException(status_code=400, detail="Student not enrolled in any batch")

    # 2. Check Daily Cap (Spec 6.4) - 5 attempts per topic per day (IST)
    IST = timezone(timedelta(hours=5, minutes=30))
    today_ist = datetime.now(IST).date().isoformat()
    topic_key = body.topic or f"ALL_{body.chapter}"
    
    daily_cap = await db.topic_attempt_caps.find_one({
        "student_id": user["id"], "topic_key": topic_key, "date": today_ist
    })
    if daily_cap and daily_cap.get("attempt_count", 0) >= 5:
        raise HTTPException(status_code=400, detail="You've practiced this topic 5 times today. Come back tomorrow!")

    # 3. Check Monthly Slot (Spec 6.5) - Free Tier: 5 slots per month
    month_ist = datetime.now(IST).strftime("%Y-%m")
    monthly_counter = await db.practice_slot_counters.find_one({
        "student_id": user["id"], "month": month_ist
    })
    if monthly_counter and monthly_counter.get("used_slots", 0) >= 5:
        raise HTTPException(status_code=400, detail="You've used 5/5 practice slots this month. Upgrade to Premium for unlimited practice.")

    # 4. Fetch Questions from Bank
    q_filter = {"status": "active", "subject": body.subject, "chapter": body.chapter}
    if body.topic:
        q_filter["topic"] = body.topic
    
    pool = await db.question_bank.find(q_filter, {"_id": 0}).to_list(1000)
    if not pool:
        raise HTTPException(status_code=404, detail="No questions available for this topic.")

    # 5. Question Retirement Rule (Spec 6.2) - Exclude questions used in tests in last 20 days
    twenty_days_ago = (datetime.now(timezone.utc) - timedelta(days=20)).isoformat()
    recent_tests = await db.tests.find({"created_at": {"$gte": twenty_days_ago}}, {"_id": 0, "questions": 1}).to_list(500)
    retired_texts = set()
    for t in recent_tests:
        for q in t.get("questions", []):
            retired_texts.add(q.get("question", ""))
            
    available_pool = [q for q in pool if q.get("question", "") not in retired_texts]
    if not available_pool:
        available_pool = pool # Fallback if all are retired

    # 6. Sample questions
    count = min(body.question_count or 10, len(available_pool))
    selected_questions = random.sample(available_pool, count)
    
    # 7. Create Session
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    session = {
        "id": session_id, "student_id": user["id"], "batch_id": batch_id,
        "subject": body.subject, "chapter": body.chapter, "topic": body.topic,
        "questions": selected_questions, "answers": [],
        "status": "IN_PROGRESS", "started_at": now, "created_at": now
    }
    await db.practice_sessions.insert_one(session)

    # 8. Increment Caps
    await db.topic_attempt_caps.update_one(
        {"student_id": user["id"], "topic_key": topic_key, "date": today_ist},
        {"$inc": {"attempt_count": 1}, "$setOnInsert": {"created_at": now}},
        upsert=True
    )
    await db.practice_slot_counters.update_one(
        {"student_id": user["id"], "month": month_ist},
        {"$inc": {"used_slots": 1}, "$setOnInsert": {"created_at": now, "max_slots": 5}},
        upsert=True
    )

    return {
        "session_id": session_id, 
        "questions": [{"id": q.get("id", str(i)), "question": q["question"], "options": q["options"]} for i, q in enumerate(selected_questions)]
    }

@api_router.post("/practice/{session_id}/answer")
async def save_practice_answer(session_id: str, body: PracticeAnswerInput, user: dict = Depends(require_role("student"))):
    result = await db.practice_sessions.update_one(
        {"id": session_id, "student_id": user["id"], "status": "IN_PROGRESS"},
        {"$push": {"answers": {"question_id": body.question_id, "selected_option": body.selected_option}}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Session not found or already submitted")
    return {"status": "saved"}

@api_router.post("/practice/{session_id}/submit")
async def submit_practice(session_id: str, user: dict = Depends(require_role("student"))):
    session = await db.practice_sessions.find_one({"id": session_id, "student_id": user["id"], "status": "IN_PROGRESS"}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or already submitted")

    questions = session.get("questions", [])
    answers = session.get("answers", [])
    ans_map = {a["question_id"]: a["selected_option"] for a in answers}
    
    correct = 0
    for i, q in enumerate(questions):
        q_id = q.get("id", str(i))
        chosen = ans_map.get(q_id)
        correct_opt = q.get("correct_index", q.get("correct_option", -1))
        if str(chosen) == str(correct_opt):
            correct += 1

    now = datetime.now(timezone.utc).isoformat()
    await db.practice_sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "COMPLETED", "score": correct, "total_questions": len(questions), "completed_at": now}}
    )

    # Update Streak (Spec 6.6)
    streak = await db.practice_streaks.find_one({"student_id": user["id"]})
    IST = timezone(timedelta(hours=5, minutes=30))
    today_ist = datetime.now(IST).date()
    
    if streak:
        last_date_str = streak.get("last_practice_date")
        if isinstance(last_date_str, str):
            last_date = datetime.fromisoformat(last_date_str).date()
        else:
            last_date = last_date_str
            
        diff = (today_ist - last_date).days
        if diff == 1:
            new_streak = streak["current_streak"] + 1
        elif diff > 1:
            new_streak = 1
        else:
            new_streak = streak["current_streak"] # same day
            
        longest = max(streak.get("longest_streak", 0), new_streak)
        await db.practice_streaks.update_one(
            {"student_id": user["id"]},
            {"$set": {"current_streak": new_streak, "longest_streak": longest, "last_practice_date": today_ist.isoformat(), "updated_at": now}}
        )
    else:
        await db.practice_streaks.insert_one({
            "id": str(uuid.uuid4()), "student_id": user["id"],
            "current_streak": 1, "longest_streak": 1,
            "last_practice_date": today_ist.isoformat(),
            "created_at": now, "updated_at": now
        })

    return {"score": correct, "total": len(questions), "status": "completed"}

@api_router.get("/practice/{session_id}/review")
async def get_practice_review(session_id: str, user: dict = Depends(require_role("student"))):
    session = await db.practice_sessions.find_one({"id": session_id, "student_id": user["id"], "status": "COMPLETED"}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Completed session not found")
    return session

@api_router.get("/practice/streak")
async def get_practice_streak(user: dict = Depends(require_role("student"))):
    streak = await db.practice_streaks.find_one({"student_id": user["id"]}, {"_id": 0})
    if not streak:
        return {"current_streak": 0, "longest_streak": 0}
    
    # Check if streak is broken (>24h / missed a day)
    last_date_str = streak.get("last_practice_date")
    if isinstance(last_date_str, str):
        last_date = datetime.fromisoformat(last_date_str).date()
    else:
        last_date = last_date_str
        
    IST = timezone(timedelta(hours=5, minutes=30))
    today_ist = datetime.now(IST).date()
    
    if (today_ist - last_date).days > 1:
        await db.practice_streaks.update_one({"student_id": user["id"]}, {"$set": {"current_streak": 0}})
        streak["current_streak"] = 0
        
    return streak


# ------------------------- Helpers: Chapter Practice (Spec 6.2-6.6) -------------------------
async def get_retired_question_ids(teacher_id: str, days: int = 20):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    tests = await db.tests.find({"teacher_id": teacher_id, "status": {"$in": ["ACTIVE", "CLOSED"]}}, {"id": 1}).to_list(1000)
    test_ids = [t["id"] for t in tests]
    if not test_ids:
        return set()
        
    attempts = await db.submissions.find({
        "test_id": {"$in": test_ids},
        "created_at": {"$gte": cutoff.isoformat()}
    }, {"answers": 1}).to_list(5000)
    
    retired_ids = set()
    for att in attempts:
        for ans in att.get("answers", []):
            if isinstance(ans, dict):
                q_id = ans.get("question_id")
            else:
                q_id = str(ans) # Legacy format fallback
            if q_id:
                retired_ids.add(q_id)
    return retired_ids

async def check_daily_cap(student_id: str, topic: str, cap: int = 5):
    ist_offset = timedelta(hours=5, minutes=30)
    ist_now = datetime.now(timezone.utc) + ist_offset
    today_str = ist_now.strftime("%Y-%m-%d")
    
    cap_doc = await db.topic_attempt_caps.find_one({
        "student_id": student_id, "topic": topic, "date": today_str
    })
    if cap_doc and cap_doc.get("attempt_count", 0) >= cap:
        return False, cap_doc.get("attempt_count", 0)
    return True, cap_doc.get("attempt_count", 0) if cap_doc else 0

async def check_monthly_slot(student_id: str, max_slots: int = 5):
    ist_offset = timedelta(hours=5, minutes=30)
    ist_now = datetime.now(timezone.utc) + ist_offset
    month_str = ist_now.strftime("%Y-%m")
    
    slot_doc = await db.practice_slot_counters.find_one({
        "student_id": student_id, "month": month_str
    })
    if slot_doc and slot_doc.get("used_slots", 0) >= max_slots:
        return False, slot_doc.get("used_slots", 0)
    return True, slot_doc.get("used_slots", 0) if slot_doc else 0

async def update_practice_streak(student_id: str):
    ist_offset = timedelta(hours=5, minutes=30)
    ist_now = datetime.now(timezone.utc) + ist_offset
    today_str = ist_now.strftime("%Y-%m-%d")
    
    streak_doc = await db.practice_streaks.find_one({"student_id": student_id})
    if not streak_doc:
        await db.practice_streaks.insert_one({
            "student_id": student_id, "current_streak": 1, "longest_streak": 1,
            "last_practice_date": today_str, "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
        return 1
        
    last_date = streak_doc.get("last_practice_date")
    if last_date == today_str:
        return streak_doc.get("current_streak", 0)
        
    yesterday = (ist_now - timedelta(days=1)).strftime("%Y-%m-%d")
    new_streak = streak_doc.get("current_streak", 0) + 1 if last_date == yesterday else 1
    longest = max(streak_doc.get("longest_streak", 0), new_streak)
    
    await db.practice_streaks.update_one(
        {"student_id": student_id},
        {"$set": {"current_streak": new_streak, "longest_streak": longest, "last_practice_date": today_str, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return new_streak



# ------------------------- Spec v2.0: Chapter Practice Feature (Sections 6, 15.5) -------------------------

@api_router.post("/api/practice/start")
async def start_practice(body: StartPracticeInput, user: dict = Depends(require_role("student"))):
    now = datetime.now(timezone.utc)
    # IST is UTC + 5:30
    ist_offset = timezone(timedelta(hours=5, minutes=30))
    today_ist = now.astimezone(ist_offset).date()
    current_month = now.astimezone(ist_offset).strftime("%Y-%m")
    
    # 1. Check Monthly Slot (PracticeSlotCounter) - Spec 2.16, 6.5
    counter = await db.practice_slot_counters.find_one({"student_id": user["id"], "month": current_month})
    if not counter:
        counter = {"id": str(uuid.uuid4()), "student_id": user["id"], "month": current_month, "used_slots": 0, "max_slots": 5}
        await db.practice_slot_counters.insert_one(counter)
    if counter["used_slots"] >= counter["max_slots"]:
        raise HTTPException(status_code=403, detail="Monthly practice limit reached. Upgrade to Premium for unlimited practice.")
        
    # 2. Check Daily Cap (TopicAttemptCap) - Spec 2.15, 6.4
    topic_key = body.topic or "ALL"
    cap = await db.topic_attempt_caps.find_one({"student_id": user["id"], "topic": topic_key, "date": today_ist.isoformat()})
    if not cap:
        cap = {"id": str(uuid.uuid4()), "student_id": user["id"], "topic": topic_key, "date": today_ist.isoformat(), "attempt_count": 0}
        await db.topic_attempt_caps.insert_one(cap)
    if cap["attempt_count"] >= 5: # Default daily cap (Spec 6.4)
        raise HTTPException(status_code=403, detail=f"Daily cap reached for this topic. Come back tomorrow!")

    # 3. Fetch Questions & Apply Retirement Rule (Spec 6.2)
    twenty_days_ago = now.astimezone(ist_offset) - timedelta(days=20)
    recent_subs = await db.submissions.find({"student_id": user["id"], "created_at": {"$gte": twenty_days_ago.isoformat()}, "kind": "test"}).to_list(100)
    test_ids = [s["test_id"] for s in recent_subs]
    retired_texts = set()
    if test_ids:
        tests = await db.tests.find({"id": {"$in": test_ids}}, {"questions": 1}).to_list(100)
        for t in tests:
            for q in t.get("questions", []):
                retired_texts.add(q.get("question") or q.get("question_text"))
                
    q_filter = {"subject": body.subject, "chapter": body.chapter, "status": "active"}
    if body.topic and body.topic != "ALL":
        q_filter["topic"] = body.topic
        
    pool = await db.question_bank.find(q_filter, {"_id": 0}).to_list(1000)
    available_pool = [q for q in pool if (q.get("question") or q.get("question_text")) not in retired_texts]
    
    if not available_pool:
        raise HTTPException(status_code=404, detail="No available questions for this topic (pool exhausted or retired).")
        
    import random
    count = min(body.question_count, len(available_pool))
    selected = random.sample(available_pool, count)
    
    # 4. Create PracticeSession (Spec 2.13)
    session_id = str(uuid.uuid4())
    session = {
        "id": session_id, "student_id": user["id"],
        "subject": body.subject, "chapter": body.chapter, "topic": body.topic,
        "questions": selected, "answers": [],
        "score": 0, "total_questions": count, "status": "IN_PROGRESS",
        "started_at": now.isoformat(), "created_at": now.isoformat()
    }
    await db.practice_sessions.insert_one(session)
    
    # 5. Increment Counters
    await db.practice_slot_counters.update_one({"id": counter["id"]}, {"$inc": {"used_slots": 1}})
    await db.topic_attempt_caps.update_one({"id": cap["id"]}, {"$inc": {"attempt_count": 1}})
    
    # 6. Update Streak (Spec 2.14, 6.6)
    streak = await db.practice_streaks.find_one({"student_id": user["id"]})
    if not streak:
        streak = {"id": str(uuid.uuid4()), "student_id": user["id"], "current_streak": 0, "longest_streak": 0, "last_practice_date": None}
        await db.practice_streaks.insert_one(streak)
        
    last_date_str = streak.get("last_practice_date")
    last_date = datetime.fromisoformat(last_date_str).date() if last_date_str else None
    if last_date != today_ist:
        if last_date == today_ist - timedelta(days=1):
            new_streak = streak["current_streak"] + 1
        else:
            new_streak = 1
            
        longest = max(streak["longest_streak"], new_streak)
        await db.practice_streaks.update_one({"id": streak["id"]}, {"$set": {"current_streak": new_streak, "longest_streak": longest, "last_practice_date": today_ist.isoformat()}})

    return {"session_id": session_id, "questions": [{"id": q.get("id", q["question"]), "question": q["question"], "options": q["options"]} for q in selected]}

@api_router.post("/api/practice/{session_id}/answer")
async def save_practice_answer(session_id: str, body: PracticeAnswerInput, user: dict = Depends(require_role("student"))):
    session = await db.practice_sessions.find_one({"id": session_id, "student_id": user["id"], "status": "IN_PROGRESS"})
    if not session:
        raise HTTPException(status_code=404, detail="Active practice session not found")
        
    # Update or insert answer
    answers = session.get("answers", [])
    answers = [a for a in answers if a["question_id"] != body.question_id]
    answers.append({"question_id": body.question_id, "selected_option": body.selected_option})
    
    await db.practice_sessions.update_one({"id": session_id}, {"$set": {"answers": answers}})
    return {"status": "saved"}

@api_router.post("/api/practice/{session_id}/submit")
async def submit_practice(session_id: str, user: dict = Depends(require_role("student"))):
    session = await db.practice_sessions.find_one({"id": session_id, "student_id": user["id"], "status": "IN_PROGRESS"})
    if not session:
        raise HTTPException(status_code=404, detail="Active practice session not found")
        
    correct = 0
    questions = session.get("questions", [])
    answers = {a["question_id"]: a["selected_option"] for a in session.get("answers", [])}
    
    for q in questions:
        q_id = q.get("id") or q.get("question")
        chosen = answers.get(q_id)
        correct_opt = q.get("correct_index") or q.get("correct_option_id")
        # Handle both index (int) and string ID formats
        if str(correct_opt).upper() == str(chosen).upper() or (str(correct_opt).isdigit() and int(correct_opt) == int(chosen)):
            correct += 1
            
    await db.practice_sessions.update_one(
        {"id": session_id}, 
        {"$set": {"status": "COMPLETED", "score": correct, "completed_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"score": correct, "total": len(questions), "status": "completed"}

@api_router.get("/api/practice/streak")
async def get_practice_streak(user: dict = Depends(require_role("student"))):
    streak = await db.practice_streaks.find_one({"student_id": user["id"]}, {"_id": 0})
    if not streak:
        return {"current_streak": 0, "longest_streak": 0}
    return {"current_streak": streak["current_streak"], "longest_streak": streak["longest_streak"]}



# ------------------------- Spec v2.0: Class Notices Feature (Sections 2.18, 2.19, 15.2) -------------------------

@api_router.post("/api/notices")
async def create_notice(body: CreateNoticeInput, user: dict = Depends(require_role("teacher", "admin"))):
    if len(body.message) > 500:
        raise HTTPException(status_code=400, detail="Message max 500 characters")
    if not (1 <= body.ttl_hours <= 720):
        raise HTTPException(status_code=400, detail="TTL must be between 1 and 720 hours")
        
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=body.ttl_hours)
    
    notice = {
        "id": str(uuid.uuid4()), "teacher_id": user["id"], "batch_id": body.batch_id,
        "message": body.message, "ttl_hours": body.ttl_hours,
        "expires_at": expires_at.isoformat(), "is_active": True,
        "created_at": now.isoformat(), "updated_at": now.isoformat()
    }
    await db.notices.insert_one(notice)
    return notice

@api_router.get("/api/notices")
async def list_notices(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    if user["role"] == "student":
        active_links = await db.batch_students.find({"student_id": user["id"], "status": "ACTIVE"}, {"batch_id": 1}).to_list(100)
        legacy_ids = user.get("batch_ids", [])
        batch_ids = list(set([l["batch_id"] for l in active_links] + legacy_ids))
        
        notices = await db.notices.find({
            "batch_id": {"$in": batch_ids}, "is_active": True,
            "expires_at": {"$gt": now.isoformat()}
        }, {"_id": 0}).sort("created_at", -1).to_list(50)
        
        dismissed = await db.notice_reads.find({"student_id": user["id"], "dismissed_at": {"$ne": None}}, {"notice_id": 1}).to_list(500)
        dismissed_ids = {d["notice_id"] for d in dismissed}
        
        return [n for n in notices if n["id"] not in dismissed_ids]
    else:
        return await db.notices.find({"teacher_id": user["id"], "is_active": True}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api_router.delete("/api/notices/{notice_id}")
async def delete_notice(notice_id: str, user: dict = Depends(require_role("teacher", "admin"))):
    result = await db.notices.update_one(
        {"id": notice_id, "teacher_id": user["id"]},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notice not found")
    return {"status": "deleted"}

@api_router.post("/api/notices/{notice_id}/dismiss")
async def dismiss_notice(notice_id: str, user: dict = Depends(require_role("student"))):
    now = datetime.now(timezone.utc)
    await db.notice_reads.update_one(
        {"notice_id": notice_id, "student_id": user["id"]},
        {"$set": {"dismissed_at": now.isoformat()}, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now.isoformat()}},
        upsert=True
    )
    return {"status": "dismissed"}


# ------------------------- Spec v2.0: Challenge Question Feature (Sections 13, 15.9) -------------------------

@api_router.post("/api/challenges")
async def create_challenge(body: CreateChallengeInput, user: dict = Depends(get_current_user)):
    if body.test_id:
        count = await db.challenges.count_documents({
            "test_id": body.test_id, "raised_by": user["id"]
        })
        if count >= 3:
            raise HTTPException(status_code=403, detail="Max 3 challenges per test")
            
    challenge = {
        "id": str(uuid.uuid4()), "question_id": body.question_id,
        "test_id": body.test_id, "practice_session_id": body.practice_session_id,
        "raised_by": user["id"], "reason": body.reason,
        "status": "PENDING", "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.challenges.insert_one(challenge)
    return challenge

@api_router.get("/api/challenges")
async def list_challenges(user: dict = Depends(require_role("teacher", "admin"))):
    if user["role"] == "admin":
        return await db.challenges.find({"status": "PENDING"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    else:
        teacher_tests = await db.tests.find({"teacher_id": user["id"]}, {"id": 1}).to_list(1000)
        test_ids = [t["id"] for t in teacher_tests]
        return await db.challenges.find({"test_id": {"$in": test_ids}}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api_router.put("/api/challenges/{challenge_id}")
async def resolve_challenge(challenge_id: str, body: ResolveChallengeInput, user: dict = Depends(require_role("admin"))):
    if body.status not in ["VALIDATED", "REJECTED"]:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    now = datetime.now(timezone.utc)
    result = await db.challenges.update_one(
        {"id": challenge_id, "status": "PENDING"},
        {"$set": {"status": body.status, "admin_notes": body.admin_notes, "resolved_at": now.isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Challenge not found or already resolved")
        
    return {"status": "resolved"}
