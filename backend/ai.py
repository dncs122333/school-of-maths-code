"""Gemini question extraction (teacher-supplied key)."""
import asyncio
import base64
import json
import difflib
import requests
from config import logger
from curriculum import normalize_taxonomy


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


async def extract_questions_from_media(
    file_bytes: bytes,
    mime_type: str,
    api_key: str,
    class_level: str,
    subject: str,
    chapter: str,
    allowed_topics: list,
    model: str = "gemini-3.8-flash"
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

    # Dynamically check models supported by the teacher's key, filtering for vision-capable models
    discovered_flash = []
    discovered_other = []
    NON_VISION_KEYWORDS = (
        "tts", "audio", "embed", "bidi", "realtime", "imagen", "search",
        "whisper", "transcribe", "aqa", "banana", "robotics", "computer-use", "argon"
    )
    # In a header, not the URL: request errors quote the URL, and those end up in logs and error messages
    key_header = {"x-goog-api-key": api_key.strip()}
    try:
        m_resp = requests.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            headers=key_header,
            timeout=5
        )
        if m_resp.status_code == 200:
            for item in m_resp.json().get("models", []):
                m_name = item.get("name", "").replace("models/", "")
                methods = item.get("supportedGenerationMethods", [])
                if "generateContent" in methods:
                    if any(k in m_name.lower() for k in NON_VISION_KEYWORDS):
                        continue
                    if "flash" in m_name.lower():
                        discovered_flash.append(m_name)
                    else:
                        discovered_other.append(m_name)
            logger.info(f"Discovered vision models for key: flash={discovered_flash}, other={discovered_other}")
    except Exception as e:
        logger.warning(f"Could not list available Gemini models: {e}")

    # Prioritize:
    # 1. User/Teacher requested model (e.g. gemini-3.8-flash)
    # 2. Verified active working flash models
    # 3. Discovered flash models from user's account
    # 4. Fallback pro and open models
    static_priority = [
        model,
        "gemini-3.8-flash",
        "gemini-3-flash-preview",
        "gemini-3.5-flash-lite",
        "gemini-3.7-flash",
        "gemini-3.5-flash",
        "gemini-3.6-flash",
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
        "gemma-4-26b-a4b-it",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-2.0-flash-exp",
        "gemini-2.5-pro",
        "gemini-1.5-pro",
    ]
    raw_list = [model, "gemini-3-flash-preview", "gemini-3.5-flash-lite"] + discovered_flash + static_priority + discovered_other
    seen = set()
    candidate_models = [m for m in raw_list if m and not (m in seen or seen.add(m))]

    last_error = None
    had_high_demand = False

    for target_model in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent"
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
            resp = requests.post(url, json=req_body, headers=key_header, timeout=120)
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

                    cl_norm, subj_norm, chap_norm, _, _ = normalize_taxonomy(
                        class_level, subject, chapter, final_topic, [final_topic]
                    )
                    top_norm = final_topic
                    tops_norm = [final_topic]

                    cleaned.append({
                        "question": q_text,
                        "options": opts,
                        "correct_index": c_idx,
                        "explanation": str(q.get("explanation") or "").strip(),
                        "topic": top_norm,
                        "topics": tops_norm,
                        "class_level": str(cl_norm),
                        "subject": str(subj_norm),
                        "chapter": str(chap_norm),
                        "difficulty": diff,
                        "marks": marks,
                        "question_type": "single_choice"
                    })
                return cleaned

            elif resp.status_code in (503, 429):
                had_high_demand = True
                err_data = resp.json().get("error", {}) if resp.text.startswith("{") else {}
                err_msg = err_data.get("message") or resp.text
                last_error = f"Model {target_model} returned {resp.status_code} ({err_msg})"
                logger.warning(f"Gemini {target_model} busy/high-demand ({resp.status_code}), trying next available model...")
                await asyncio.sleep(0.5)
                continue

            elif resp.status_code in (404,):
                last_error = f"Model {target_model} not found (404)"
                logger.info(f"Gemini {target_model} not found (404), trying next...")
                continue

            elif resp.status_code in (500, 502, 504):
                last_error = f"Model {target_model} returned server error {resp.status_code}"
                logger.warning(f"Gemini {target_model} server error ({resp.status_code}), trying next...")
                continue

            else:
                err_data = resp.json().get("error", {}) if resp.text.startswith("{") else {}
                err_msg = err_data.get("message") or resp.text
                if resp.status_code == 400 and any(w in err_msg.lower() for w in ("not found", "is not supported", "invalid model", "unknown model", "does not exist", "unsupported", "modality", "not enabled")):
                    last_error = f"Model {target_model} not supported ({err_msg})"
                    logger.info(f"Gemini {target_model} not supported ({err_msg}), trying next...")
                    continue
                if resp.status_code == 400 and "api key" in err_msg.lower():
                    raise ValueError(f"Invalid Gemini API Key: {err_msg}")
                raise ValueError(f"Gemini API returned error ({resp.status_code}): {err_msg}")

        except requests.RequestException as e:
            last_error = str(e)
            continue

    if had_high_demand:
        raise ValueError("Google Gemini servers are currently experiencing temporary high demand spikes (503). Please retry in a few moments.")
    raise ValueError(f"Failed to generate content with Gemini: {last_error}")



