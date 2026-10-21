"""External integrations: Emergent object storage + Gemini (notes, images)."""
import base64
import io
import json
import os
import mimetypes
import difflib
import requests
from pathlib import Path
from typing import Optional
from config import EMERGENT_KEY, STORAGE_URL, logger, ROOT_DIR
from db import db
from models import GenerateNoteInput

# Local storage fallback when no cloud key is available
_LOCAL_STORE = ROOT_DIR / "local_storage"
_USE_LOCAL = not bool(EMERGENT_KEY)

storage_key = None

def init_storage(force: bool = False):
    global storage_key
    if _USE_LOCAL:
        _LOCAL_STORE.mkdir(parents=True, exist_ok=True)
        return "local"
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    if _USE_LOCAL:
        dest = _LOCAL_STORE / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        # Store content-type alongside the file
        (dest.parent / (dest.name + ".ct")).write_text(content_type)
        return {"path": path}
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
    if _USE_LOCAL:
        dest = _LOCAL_STORE / path
        if not dest.exists():
            raise FileNotFoundError(f"Local storage: {path} not found")
        ct_file = dest.parent / (dest.name + ".ct")
        ct = ct_file.read_text() if ct_file.exists() else mimetypes.guess_type(str(dest))[0] or "application/octet-stream"
        return dest.read_bytes(), ct
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def delete_object(path: str) -> None:
    """Remove a stored object. Raises on failure — callers decide how soft to be."""
    if _USE_LOCAL:
        dest = _LOCAL_STORE / path
        dest.unlink(missing_ok=True)
        (dest.parent / (dest.name + ".ct")).unlink(missing_ok=True)
        return
    key = init_storage()
    resp = requests.delete(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.delete(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()




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


async def _gemini_json(system: str, prompt: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"g-{uuid.uuid4()}",
                   system_message=system).with_model("gemini", "gemini-3.1-pro-preview")
    resp = await chat.send_message(UserMessage(text=prompt))
    return json.loads(_strip_json(resp))


async def llm_generate_notes(payload: GenerateNoteInput) -> dict:
    """Multi-pass pipeline for maximum accuracy & completeness (time is not a constraint):
    1) Extract an exhaustive checklist of every fact/definition/formula/example.
    2) Generate structured beautiful notes that MUST cover every checklist item.
    3) Verify coverage; if anything is missing, generate extra sections to fill the gaps."""
    ctx = ("Board: CBSE — align strictly with the CBSE 2025-26 session (2026 board examination) syllabus "
           "and the corresponding latest NCERT textbook. Use standard NCERT terminology, definitions, "
           "SI units and formulas.\n"
           f"Class: {payload.class_level} | Subject: {payload.subject} | "
           f"Chapter: {payload.chapter} | Topic: {payload.topic or 'General'}")

    # ---- Pass 1: exhaustive extraction ----
    checklist = []
    try:
        ex = await _gemini_json(
            "You are a meticulous CBSE subject expert on the 2025-26 (2026 board exam) syllabus and latest NCERT "
            "textbooks. You extract EVERY single piece of information from source material without missing anything.",
            f"""{ctx}

From the SOURCE below, extract an EXHAUSTIVE checklist of every atomic piece of information a student
must learn: every definition, fact, law, formula (with exact symbols), unit, value/constant, classification,
example, cause-effect, diagram idea and exception. Do not summarise or merge — list each point separately.
Preserve all numbers, formulas and technical terms EXACTLY.

SOURCE:
{payload.raw_text}

Return ONLY valid JSON: {{"points": ["point 1", "point 2", "..."]}}""")
        checklist = [p for p in ex.get("points", []) if isinstance(p, str) and p.strip()]
    except Exception as e:
        logger.error(f"notes extraction pass failed: {e}")

    checklist_block = "\n".join(f"- {p}" for p in checklist) if checklist else payload.raw_text

    # ---- Pass 2: generate beautiful notes covering the full checklist ----
    data = await _gemini_json(
        "You are a beloved CBSE teacher who writes beautiful, accurate, memorable study notes for Class 9-10 "
        "strictly aligned with the CBSE 2025-26 (2026 board exam) syllabus and the latest NCERT textbook. "
        "Accuracy is non-negotiable: never invent facts, never change any formula, value or definition, and "
        "NEVER omit a point from the checklist. Explain in simple language with analogies students remember.",
        f"""{ctx}

Write complete, beautiful study notes. You MUST cover EVERY item in the CHECKLIST below — do not drop any.
Keep every formula, number and term exactly as given. Group related points into logical sections; use as many
sections as needed (completeness matters more than brevity). Preserve formulas in the content text.
Ensure the notes reflect the CBSE 2025-26 (2026 board exam) syllabus for this class, subject and chapter using
standard NCERT definitions, terminology, SI units and formulas. If the uploaded source omits an essential
board-syllabus point for this chapter, add it accurately (clearly integrated) so nothing important for the
2026 exam is missing — but never contradict the source.

CHECKLIST (cover all of these):
{checklist_block}

ORIGINAL SOURCE (for extra context):
{payload.raw_text}

Return ONLY valid JSON (no markdown fences) with this exact schema:
{{
  "title": "string",
  "intro": "2-3 sentence friendly overview",
  "sections": [
    {{
      "heading": "string",
      "content": "clear, accurate explanation in simple language; keep formulas exact; may use \\n for line breaks",
      "key_points": ["short precise bullet", "..."],
      "formulas": ["exact formula if any, else omit"],
      "image_prompt": "short vivid description of a simple educational diagram for this concept, or empty string"
    }}
  ],
  "mnemonics": ["memory trick", "..."],
  "quick_revision": ["one-line takeaway per key idea", "..."]
}}""")

    # ---- Pass 3: coverage verification + gap fill ----
    if checklist:
        try:
            covered_text = json.dumps({"sections": [{"heading": s.get("heading", ""),
                                                      "content": s.get("content", ""),
                                                      "key_points": s.get("key_points", [])}
                                                     for s in data.get("sections", [])]})
            verify = await _gemini_json(
                "You are a strict QA reviewer ensuring no concept was missed in study notes.",
                f"""Compare the CHECKLIST against the NOTES. List only checklist points that are NOT
adequately covered in the notes (missing facts, formulas, values or definitions).

CHECKLIST:
{checklist_block}

NOTES:
{covered_text}

Return ONLY valid JSON: {{"missing": ["missing point", "..."]}}""")
            missing = [m for m in verify.get("missing", []) if isinstance(m, str) and m.strip()]
            if missing:
                fill = await _gemini_json(
                    "You are a CBSE teacher adding the remaining points to study notes, accurately and clearly.",
                    f"""{ctx}

Add clear, accurate notes covering ONLY these previously-missed points. Keep formulas/values exact.

MISSED POINTS:
{chr(10).join('- ' + m for m in missing)}

Return ONLY valid JSON with extra sections:
{{"sections": [{{"heading": "string", "content": "string", "key_points": ["..."], "image_prompt": ""}}]}}""")
                data.setdefault("sections", []).extend(fill.get("sections", []))
        except Exception as e:
            logger.error(f"notes verification pass failed: {e}")

    data["_coverage"] = {"total_points": len(checklist)}
    return data


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


async def extract_questions_from_media(
    file_bytes: bytes,
    mime_type: str,
    api_key: str,
    class_level: str,
    subject: str,
    chapter: str,
    allowed_topics: list,
    model: str = "gemini-2.5-flash"
) -> list:
    """
    Directly calls Google Generative Language API (Gemini multimodal) with teacher's key.
    Extracts MCQs/questions from an uploaded image or PDF.
    Enforces that 'topic' is chosen STRICTLY from allowed_topics.
    """
    if not api_key or not api_key.strip():
        raise ValueError("Gemini API key is required.")

    b64_data = base64.b64encode(file_bytes).decode("utf-8")

    topics_prompt_block = "\n".join(f"- {t}" for t in allowed_topics) if allowed_topics else "- General Concepts"

    system_instruction = (
        f"You are an expert CBSE examiner and curriculum analyst for Class {class_level} {subject}. "
        f"You are analyzing a question paper / worksheet for Chapter: '{chapter}'.\n"
        f"Your task is to accurately extract all multiple choice questions (MCQs) and single choice questions.\n"
        f"Preserve mathematical equations in clean LaTeX or standard mathematical notation (e.g. $x^2 + 5x + 6 = 0$, ax² + bx + c).\n"
        f"MANDATORY TOPIC RULE:\n"
        f"Each question's 'topic' field MUST be selected EXACTLY from the following list of approved topics for this chapter:\n"
        f"{topics_prompt_block}\n"
        f"Do NOT invent, paraphrase, or use any other topic name."
    )

    user_prompt = (
        "Analyze the attached document (image or PDF) and extract all multiple choice questions.\n"
        "For each question:\n"
        "1. 'question': The complete question statement.\n"
        "2. 'options': Array of 4 option strings [Option A, Option B, Option C, Option D] (or 2 for True/False).\n"
        "3. 'correct_index': Integer 0-3 (0 for A, 1 for B, 2 for C, 3 for D). "
        "If the answer key is visible or marked, use it. Otherwise, solve the question accurately.\n"
        "4. 'explanation': Detailed step-by-step reasoning or mathematical proof.\n"
        "5. 'topic': EXACT string matching one from the APPROVED TOPICS list above.\n"
        "6. 'difficulty': One of 'easy', 'medium', 'hard'.\n"
        "7. 'marks': Numerical marks (default 1.0 or as indicated on paper).\n\n"
        "Return ONLY a JSON object with this structure:\n"
        "{\n"
        '  "questions": [\n'
        '    {\n'
        '      "question": "...",\n'
        '      "options": ["A", "B", "C", "D"],\n'
        '      "correct_index": 0,\n'
        '      "explanation": "...",\n'
        '      "topic": "...",\n'
        '      "difficulty": "easy",\n'
        '      "marks": 1.0\n'
        '    }\n'
        '  ]\n'
        "}"
    )

    # Candidate models for Google Generative Language REST API
    # Prioritizes requested flash model, with standard fallbacks
    models_to_try = [model, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
    seen = set()
    candidate_models = [m for m in models_to_try if m and not (m in seen or seen.add(m))]

    last_error = None
    for target_model in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={api_key.strip()}"
        req_body = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": b64_data
                            }
                        },
                        {
                            "text": f"{system_instruction}\n\n{user_prompt}"
                        }
                    ]
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.2
            }
        }

        try:
            resp = requests.post(url, json=req_body, timeout=120)
            if resp.status_code == 200:
                result_json = resp.json()
                candidates = result_json.get("candidates") or []
                if not candidates:
                    raise ValueError("Gemini returned no candidates. The file may be empty or unreadable.")
                parts = candidates[0].get("content", {}).get("parts") or []
                if not parts:
                    raise ValueError("Gemini returned empty content.")
                raw_text = parts[0].get("text", "")
                parsed = json.loads(_strip_json(raw_text))
                raw_questions = parsed.get("questions") if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])

                # Align topics strictly to allowed_topics
                cleaned = []
                for q in raw_questions:
                    if not isinstance(q, dict):
                        continue
                    q_text = str(q.get("question") or "").strip()
                    if not q_text:
                        continue
                    raw_opts = q.get("options") or []
                    opts = [str(o).strip() for o in raw_opts if str(o).strip()]
                    if len(opts) < 2:
                        continue

                    raw_topic = str(q.get("topic") or "").strip()
                    if allowed_topics:
                        if raw_topic in allowed_topics:
                            final_topic = raw_topic
                        else:
                            close = difflib.get_close_matches(raw_topic, allowed_topics, n=1, cutoff=0.35)
                            final_topic = close[0] if close else allowed_topics[0]
                    else:
                        final_topic = raw_topic or "General"

                    try:
                        c_idx = int(q.get("correct_index", 0))
                        if c_idx < 0 or c_idx >= len(opts):
                            c_idx = 0
                    except Exception:
                        c_idx = 0

                    diff = str(q.get("difficulty") or "medium").lower()
                    if diff not in ("easy", "medium", "hard"):
                        diff = "medium"

                    try:
                        marks = float(q.get("marks", 1.0) or 1.0)
                    except Exception:
                        marks = 1.0

                    cleaned.append({
                        "question": q_text,
                        "options": opts,
                        "correct_index": c_idx,
                        "explanation": str(q.get("explanation") or "").strip(),
                        "topic": final_topic,
                        "topics": [final_topic],
                        "class_level": str(class_level),
                        "subject": str(subject),
                        "chapter": str(chapter),
                        "difficulty": diff,
                        "marks": marks,
                        "question_type": "single_choice"
                    })
                return cleaned
            elif resp.status_code in (404,):
                last_error = f"Model {target_model} not found (404)"
                continue
            else:
                err_data = resp.json().get("error", {}) if resp.text.startswith("{") else {}
                err_msg = err_data.get("message") or resp.text
                raise ValueError(f"Gemini API returned error ({resp.status_code}): {err_msg}")
        except requests.RequestException as e:
            last_error = str(e)
            continue

    raise ValueError(f"Failed to generate content with Gemini: {last_error}")



