from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import logging
import uuid
import json
import base64
import io
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
import requests
from bson import ObjectId
from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("vidya")

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY')
APP_NAME = "vidya"

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
storage_key = None

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ------------------------- Storage helpers -------------------------
def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ------------------------- Auth helpers -------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {"sub": user_id, "email": email, "role": role,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_role(*roles):
    async def checker(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Not allowed for your role")
        return user
    return checker


# ------------------------- Models -------------------------
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "student"


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class BatchInput(BaseModel):
    name: str
    class_level: str


class JoinInput(BaseModel):
    code: str


class GenerateNoteInput(BaseModel):
    title: str
    class_level: str
    subject: str
    chapter: str
    topic: Optional[str] = ""
    raw_text: str


class GenerateTestInput(BaseModel):
    title: str
    kind: str = "test"  # test | dpp
    class_level: str
    subject: str
    chapter: str
    topic: Optional[str] = ""
    batch_id: Optional[str] = None
    raw_text: str
    duration_minutes: int = 20
    valid_hours: int = 24
    activate_now: bool = True


class SubmitInput(BaseModel):
    answers: List[int]


# ------------------------- LLM helpers -------------------------
def _strip_json(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("```", 2)[1] if "```" in t else t
        if t.startswith("json"):
            t = t[4:]
    t = t.strip().strip("`").strip()
    start = t.find("{")
    if start > 0:
        t = t[start:]
    end = t.rfind("}")
    if end != -1:
        t = t[:end + 1]
    return t


async def llm_generate_notes(payload: GenerateNoteInput) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"notes-{uuid.uuid4()}",
                   system_message=(
                       "You are an expert CBSE teacher who turns rough notes into beautiful, "
                       "memorable study notes for Class 9-10 students. Never drop any concept from the source. "
                       "Make notes easy to remember with clear structure, analogies and mnemonics."
                   )).with_model("gemini", "gemini-3.1-pro-preview")
    prompt = f"""Convert the following rough notes into structured, beautiful study notes.
Class: {payload.class_level} | Subject: {payload.subject} | Chapter: {payload.chapter} | Topic: {payload.topic or 'General'}

RAW NOTES:
{payload.raw_text}

Return ONLY valid JSON (no markdown fences) with this exact schema:
{{
  "title": "string",
  "intro": "1-2 sentence friendly overview",
  "sections": [
    {{
      "heading": "string",
      "content": "clear explanation in simple language, may use \\n for line breaks",
      "key_points": ["short bullet", "..."],
      "image_prompt": "a short vivid description of a simple educational diagram/illustration for this concept, or empty string if not needed"
    }}
  ],
  "mnemonics": ["memory trick 1", "..."],
  "quick_revision": ["one-line takeaway", "..."]
}}
Keep 3-6 sections. Do not omit any concept present in the raw notes."""
    resp = await chat.send_message(UserMessage(text=prompt))
    data = json.loads(_strip_json(resp))
    return data


async def llm_generate_mcqs(payload: GenerateTestInput) -> list:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"quiz-{uuid.uuid4()}",
                   system_message=(
                       "You are an expert exam setter. You convert raw question sheets into clean, "
                       "competitive multiple-choice questions for CBSE Class 9-10."
                   )).with_model("gemini", "gemini-3.1-pro-preview")
    prompt = f"""Convert the following material into competitive MCQs.
Class: {payload.class_level} | Subject: {payload.subject} | Chapter: {payload.chapter} | Topic: {payload.topic or 'General'}

MATERIAL:
{payload.raw_text}

Return ONLY valid JSON (no markdown fences) as:
{{
  "questions": [
    {{
      "question": "string",
      "options": ["opt A", "opt B", "opt C", "opt D"],
      "correct_index": 0,
      "explanation": "why this is correct"
    }}
  ]
}}
Rules: exactly 4 options each, correct_index is 0-3. If the material already has MCQs, preserve them. If it only has topics/questions, create good MCQs. Produce between 5 and 15 questions."""
    resp = await chat.send_message(UserMessage(text=prompt))
    data = json.loads(_strip_json(resp))
    return data.get("questions", [])


async def gen_concept_image(prompt: str) -> Optional[str]:
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"img-{uuid.uuid4()}",
                       system_message="You create clean, colorful educational illustrations.")
        chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
        msg = UserMessage(text=(
            f"A clean, friendly, colorful educational diagram illustration for a CBSE study note. "
            f"Concept: {prompt}. Flat vector style, pastel colors, clear labels, white background, no text paragraphs."
        ))
        _, images = await chat.send_message_multimodal_response(msg)
        if not images:
            return None
        img = images[0]
        image_bytes = base64.b64decode(img["data"])
        path = f"{APP_NAME}/notes/{uuid.uuid4()}.png"
        put_object(path, image_bytes, img.get("mime_type", "image/png"))
        return path
    except Exception as e:
        logger.error(f"image gen failed: {e}")
        return None


def extract_text_from_file(filename: str, data: bytes) -> str:
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()
    try:
        if ext == "pdf":
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            return "\n".join((p.extract_text() or "") for p in reader.pages)
        if ext in ("docx",):
            import docx
            d = docx.Document(io.BytesIO(data))
            return "\n".join(p.text for p in d.paragraphs)
        if ext in ("txt", "md"):
            return data.decode("utf-8", errors="ignore")
    except Exception as e:
        logger.error(f"extract failed: {e}")
    return ""


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


@api_router.post("/notes")
async def create_note(body: GenerateNoteInput, user: dict = Depends(require_role("teacher", "admin"))):
    if not body.raw_text.strip():
        raise HTTPException(status_code=400, detail="Notes content is empty")
    data = await llm_generate_notes(body)
    sections = data.get("sections", [])
    img_done = 0
    for s in sections:
        p = (s.get("image_prompt") or "").strip()
        if p and img_done < 3:
            path = await gen_concept_image(p)
            if path:
                s["image_path"] = path
                img_done += 1
        s.pop("image_prompt", None)
    doc = {"id": str(uuid.uuid4()), "title": body.title or data.get("title", "Untitled"),
           "class_level": body.class_level, "subject": body.subject, "chapter": body.chapter,
           "topic": body.topic or "", "intro": data.get("intro", ""), "sections": sections,
           "mnemonics": data.get("mnemonics", []), "quick_revision": data.get("quick_revision", []),
           "teacher_id": user["id"], "teacher_name": user["name"],
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.notes.insert_one(doc)
    doc.pop("_id", None)
    return doc


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


# ------------------------- Tests / DPP -------------------------
@api_router.post("/tests")
async def create_test(body: GenerateTestInput, user: dict = Depends(require_role("teacher", "admin"))):
    if not body.raw_text.strip():
        raise HTTPException(status_code=400, detail="Content is empty")
    questions = await llm_generate_mcqs(body)
    if not questions:
        raise HTTPException(status_code=400, detail="Could not build questions from the material")
    now = datetime.now(timezone.utc)
    valid_from = now if body.activate_now else now
    doc = {"id": str(uuid.uuid4()), "title": body.title, "kind": body.kind,
           "class_level": body.class_level, "subject": body.subject, "chapter": body.chapter,
           "topic": body.topic or "", "batch_id": body.batch_id,
           "duration_minutes": body.duration_minutes, "valid_hours": body.valid_hours,
           "valid_from": valid_from.isoformat(),
           "valid_until": (valid_from + timedelta(hours=body.valid_hours)).isoformat(),
           "questions": questions, "teacher_id": user["id"], "teacher_name": user["name"],
           "created_at": now.isoformat()}
    await db.tests.insert_one(doc)
    doc.pop("_id", None)
    return {"id": doc["id"], "title": doc["title"], "question_count": len(questions)}


def _strip_answers(test: dict) -> dict:
    t = dict(test)
    t["question_count"] = len(t.get("questions", []))
    t["questions"] = [{"question": q["question"], "options": q["options"]} for q in t.get("questions", [])]
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
    if user["role"] == "student" and kind != "dpp":
        q["batch_id"] = {"$in": user.get("batch_ids", [])}
    tests = await db.tests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    now = datetime.now(timezone.utc)
    out = []
    for t in tests:
        vu = datetime.fromisoformat(t["valid_until"])
        vf = datetime.fromisoformat(t["valid_from"])
        sub = await db.submissions.find_one({"test_id": t["id"], "student_id": user["id"]}, {"_id": 0})
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
                raise HTTPException(status_code=403, detail="You have already submitted this test")
        return _strip_answers(test)
    return test


@api_router.post("/tests/{test_id}/submit")
async def submit_test(test_id: str, body: SubmitInput, user: dict = Depends(require_role("student"))):
    test = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(status_code=404, detail="Not found")
    if test["kind"] == "test" and await db.submissions.find_one({"test_id": test_id, "student_id": user["id"]}):
        raise HTTPException(status_code=403, detail="Already submitted")
    questions = test["questions"]
    correct = 0
    review = []
    for i, q in enumerate(questions):
        chosen = body.answers[i] if i < len(body.answers) else -1
        is_ok = chosen == q["correct_index"]
        if is_ok:
            correct += 1
        review.append({"question": q["question"], "options": q["options"], "chosen": chosen,
                       "correct_index": q["correct_index"], "explanation": q.get("explanation", ""),
                       "is_correct": is_ok})
    total = len(questions)
    score = round(correct / total * 100) if total else 0
    sub = {"id": str(uuid.uuid4()), "test_id": test_id, "kind": test["kind"], "title": test["title"],
           "student_id": user["id"], "student_name": user["name"], "score": score,
           "correct": correct, "total": total, "created_at": datetime.now(timezone.utc).isoformat()}
    if test["kind"] == "test":
        await db.submissions.insert_one(dict(sub))
    return {"score": score, "correct": correct, "total": total, "review": review}


@api_router.get("/tests/{test_id}/leaderboard")
async def leaderboard(test_id: str, user: dict = Depends(get_current_user)):
    subs = await db.submissions.find({"test_id": test_id}, {"_id": 0}).sort("score", -1).to_list(200)
    return [{"student_name": s["student_name"], "score": s["score"], "correct": s["correct"],
             "total": s["total"]} for s in subs]


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
        subs = await db.submissions.find({"student_id": user["id"]}, {"_id": 0}).to_list(500)
        avg = round(sum(s["score"] for s in subs) / len(subs)) if subs else 0
        return {"tests_taken": len(subs), "avg_score": avg,
                "batches": await db.batches.count_documents({"id": {"$in": user.get("batch_ids", [])}}),
                "notes": await db.notes.count_documents({})}
    q = {} if user["role"] == "admin" else {"teacher_id": user["id"]}
    return {"notes": await db.notes.count_documents(q),
            "tests": await db.tests.count_documents({**q, "kind": "test"}),
            "dpps": await db.tests.count_documents({**q, "kind": "dpp"}),
            "batches": await db.batches.count_documents(q if user["role"] == "admin" else {"teacher_id": user["id"]}),
            "students": await db.users.count_documents({"role": "student"})}


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
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
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@vidya.com").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({"name": "Admin", "email": admin_email,
                                   "password_hash": hash_password(admin_pw), "role": "admin",
                                   "batch_ids": [], "created_at": datetime.now(timezone.utc).isoformat()})
    elif not verify_password(admin_pw, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pw)}})
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
