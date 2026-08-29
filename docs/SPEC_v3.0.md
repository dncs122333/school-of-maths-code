# VidyaLab (School of Maths) — Consolidated Technical Specification v3.0

**Status:** Adapted for the existing codebase — locked for the MVP build
**Date:** 2026-08-30
**Replaces:** `consolidated_spec_v2.0-2.pdf` (the Flutter / Node / Postgres direction) and `system_architecture_v1.0.pdf`
**Target:** Single-teacher coaching centers · Classes 9–10 · CBSE · 100 students (MVP)

> **Build decision (2026-08-30):** *Evolve the existing VidyaLab codebase* (FastAPI + MongoDB + React 19), **hand-seeded MCQ bank** (user supplies sample questions for the MVP), and a **web mobile-responsive** frontend. The v2.0 spec's Flutter/Node/Postgres/Redis/R2/phone-OTP/Razorpay stack is **not** adopted.

---

## 1. Purpose & Source of Truth

This document is the single consolidated specification for the MVP. It keeps the v2.0 **product scope** (auth, notes, class tests, chapter practice, results/review, basic dashboard) but re-expresses it on the **existing VidyaLab stack**, so we build on working code instead of rewriting it.

Where v2.0 and this document conflict, **this document wins**.

### 1.1 Stack mapping (v2.0 → v3.0)

| Concern | v2.0 (not adopted) | v3.0 (existing VidyaLab) |
|---|---|---|
| Frontend | Flutter (Android native) | **React 19** (web, mobile-responsive) + Tailwind + shadcn/ui |
| Backend | Node.js + Fastify | **FastAPI (Python)** |
| Database | PostgreSQL + Redis | **MongoDB** (Motor, async) |
| Auth | Phone OTP + JWT | **Email/password (bcrypt) + JWT** (7-day), roles student/teacher/admin |
| File storage | Cloudflare R2 | **Emergent Object Storage** |
| Question source | "Platform bank (external)" | **Hand-seeded `question_bank` collection** (+ optional AI draft → review) |
| AI | none (MCQ-only) | **Gemini 3.1 Pro** (existing — retained for notes; optional for question drafting) |
| Payments | Razorpay | **Deferred** (out of MVP) |
| Push | none in MVP | none in MVP (in-app only) |
| Parent app | token web page | **Deferred** |

### 1.2 Scope

- **Classes:** 9 & 10 (existing catalog already has 5 subjects; the test/practice MVP focuses on Maths + Science, but notes/materials keep all existing subjects).
- **Language:** English.
- **Platform:** web, mobile-responsive. Native apps deferred.
- **Buyer:** single-teacher centers. Teacher = center owner. No multi-teacher roles in MVP.

---

## 2. Roles & Auth

| Role | Capabilities |
|---|---|
| **Student** | Join batch by code, read notes, view/download materials, take timed tests + DPP, see scores/explanations, view own mastery. |
| **Teacher** | Create batches, generate notes, upload materials, create tests/DPP, seed/review questions, view results & mastery reports. |
| **Admin** | Seeded super-user; visibility across centers; question-bank moderation. |

- Auth stays **email/password → bcrypt → JWT (7-day)**, roles `student|teacher|admin` (already implemented). Admin seeded from env.
- **Phone OTP is deferred** — the v2.0 phone-first model is dropped to avoid rebuilding auth.

---

## 3. Data Model (MongoDB collections)

### 3.1 Existing (unchanged unless noted)

- **`users`** — `_id`, name, email (unique), password_hash, role, batch_ids[], created_at.
- **`batches`** — id, name, class_level, code, teacher_id, teacher_name.
- **`notes`** — id, title, class_level, subject, chapter, topic, intro, sections[], mnemonics[], quick_revision[], coverage, status, teacher_id. *(Existing AI "beautiful notes" pipeline — kept as the Notes feature.)*
- **`resources`** — id, title, batch_id, class_level, subject, chapter, topic, storage_path, filename, content_type, size, teacher_id, is_deleted. *(Existing "materials" = original-file sharing — kept.)*
- **`tests`** — id, title, kind (`test`|`dpp`), class_level, subject, chapter, topic, batch_id, duration_minutes, valid_hours, valid_from, valid_until, questions[], teacher_id. *(Extended: add `status` for async creation + `difficulty` per question.)*
- **`submissions`** — id, test_id, student_id, student_name, score, correct, total, created_at. *(Extended — see §3.2.)*

### 3.2 Extended — `submissions` (critical fix)

Every submission must capture **per-question answers + topic/difficulty + time**, otherwise mastery and analytics are impossible:

```python
{
  "id": ..., "test_id": ..., "kind": "test|dpp", "title": ...,
  "student_id": ..., "student_name": ...,
  "class_level": ..., "subject": ..., "chapter": ..., "topic": ...,
  "score": ..., "correct": ..., "total": ...,
  "answers": [
    {"q": 0, "chosen": 2, "is_correct": true, "time_s": 21.4,
     "topic": "Quadratic Equations", "difficulty": "medium"}
  ],
  "created_at": ...
}
```

- DPP attempts are **now saved** too (today they are discarded — `server.py` only inserts for `kind=="test"`). The double-submit guard applies to `kind=="test"` only; DPPs allow repeat history.

### 3.3 New — `question_bank` (hand-seeded)

```python
{
  "id": ..., "class_level": 10, "subject": "Maths",
  "chapter": "Quadratic Equations", "topic": "Nature of roots",
  "difficulty": "easy|medium|hard",
  "question": "...", "options": [{"id":"A","text":"..."}, ...],
  "correct_index": 0, "explanation": "...",
  "source": "SEEDED|AI_DRAFT|TEACHER",
  "status": "ACTIVE|DRAFT|REJECTED",
  "teacher_id": ..., "created_at": ...
}
```

- **MVP path:** user supplies sample questions → imported via JSON/CSV (`source: SEEDED`, `status: ACTIVE`).
- **Optional (accuracy booster):** Gemini drafts (`source: AI_DRAFT`, `status: DRAFT`) → teacher/admin reviews → `ACTIVE` or `REJECTED`.
- **Rule:** tests/DPP only draw from `status == ACTIVE` questions. Grading is always deterministic (never AI).

> **Implemented schema (v3.0 build, commit `0426556`):** the fields above are concrete as
> `class_level: "9" | "10"` (string, matching the rest of the codebase), `options: ["A", "B", "C", "D"]`
> (flat string array, matching `tests.questions`), `correct_index: 0-3`, `difficulty: easy|medium|hard`
> (default `medium`), `status: active | pending_review | inactive` (lowercase), `source: import | ai_draft | teacher`.
> Import is via `POST /questions/import` (CSV); seed file: `backend/seed/sample_questions.csv`.

### 3.4 Mastery (computed on read — no extra collection for v1)

Per-student per-topic score, computed from `submissions.answers`:

```
mastery(topic) = Σ weight(a) · correct(a) / Σ weight(a)
weight(a)      = recency_decay × difficulty_weight
recency_decay   = 0.9 ^ (days_since_attempt / 7)
difficulty_weight = easy 1.0 · medium 1.5 · hard 2.0
```

Bands: **< 55% weak · 55–75% developing · > 75% strong**. Extra signals: time-per-question vs. class median, wrong-answer streaks, last-attempt recency.

---

## 4. Features (lean MVP)

### 4.1 Notes (existing — unchanged)
AI "beautiful notes" (extract → generate → verify → gap-fill) + chapter-tagged materials upload with authenticated downloads. Kept as-is; no new work.

### 4.2 Class Test (timed) — *question source changed to the bank*
Teacher selects **class → subject → chapter → topic(s) → batch → question count → duration → validity window**.
- System **samples N `ACTIVE` questions from `question_bank`** (difficulty mix ≈ 30% easy / 50% medium / 20% hard) and snapshots them into `tests.questions`.
- **Option order randomized per student** at `GET /tests/{id}`.
- Student runner (existing `QuizRunner`): sticky countdown, palette navigation, auto-submit on timeout, double-submit blocked, correct answers hidden during attempt.
- Result: score + per-question review + explanations + leaderboard.

> **Change from today:** `POST /tests` currently calls Gemini to generate MCQs synchronously (slow, cost, accuracy risk). v3.0 makes tests **bank-driven and async**: insert `status: processing` → sample questions → `ready`; poll like notes. This removes the 60s-timeout risk and the per-test AI cost.

### 4.3 DPP / Chapter Practice (untimed)
Untimed, repeatable practice drawn from the bank, instant explanations. Every attempt saved to `submissions` (feeds mastery). No leaderboard.

### 4.4 Results & Review
Instant score + per-question review + explanations (existing). Mastery updates derive from saved answers.

### 4.5 Batches (existing — unchanged)
Create batch (auto join-code), student joins by code, tests/materials scoped to batch. Kept as-is. *(v2.0's per-batch status/left_at is not needed for MVP.)*

### 4.6 Dashboard & Weak-Topic Mastery (new — the differentiator)
- **Student weak-topic dashboard:** per-topic mastery %, band badge, weakest first.
- **Teacher reports:** class heatmap (student × topic), per-student drill-down, class weak-topic ranking.
- **Diagnostic test:** `POST /tests/diagnostic` — 10-question cold-start spanning the syllabus.

### 4.7 Question bank management (new)
- `POST /questions/import` (JSON/CSV) · `POST /questions` (single) · `GET /questions?class_level=&subject=&chapter=` · `PUT /questions/{id}/review` (approve/reject drafts).

---

## 5. API Endpoints

### 5.1 Existing (unchanged, all under `/api`)
```
POST /auth/register        POST /auth/login        GET /auth/me
GET  /catalog              GET  /stats
POST /batches              GET  /batches           POST /batches/join
POST /extract              POST /notes             GET  /notes          GET /notes/{note_id}
GET  /media/{path}
POST /resources            GET  /resources         DELETE /resources/{id}   GET /resources/{id}/file
POST /tests                GET  /tests             GET  /tests/{test_id}
POST /tests/{test_id}/submit                         GET /tests/{test_id}/leaderboard
```

### 5.2 New (this MVP)
```
POST   /questions/import          # JSON/CSV bulk seed (user sample questions)
POST   /questions                 # single question
GET    /questions                 # browse ACTIVE bank by class/subject/chapter/topic
PUT    /questions/{id}/review     # approve/reject AI drafts (admin/teacher)
GET    /mastery/me                # student: per-topic mastery + bands
GET    /mastery/teacher?batch_id= # teacher: student × topic matrix + class weak ranking
GET    /mastery/teacher/student/{id}  # drill-down: trend, per-topic, time stats
POST   /tests/diagnostic          # 10-question cold-start test
```

### 5.3 Changed behavior
- `POST /tests` → async + bank-sampling (no synchronous Gemini call).
- `POST /tests/{id}/submit` → save full `answers[]` + `times[]`; save DPP attempts too.

---

## 6. Anti-Cheat & Integrity (web-adapted, light)

| Concern | Approach |
|---|---|
| Tab/window switch | `document.visibilitychange` → log; warn at 2 switches, flag at 3 (maps naturally to web — v2.0's approach was actually web-oriented). |
| Auto-submit on timeout | existing `QuizRunner` countdown → submit (already works). |
| Double submission | existing guard (already works). |
| Correct answers during attempt | hidden (already works). |
| Option-order randomization | server-side shuffle at `GET /tests/{id}`. |
| Device lock / offline sync | **deferred** (not meaningful for web MVP). |

---

## 7. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Mobile-responsive (360px+) | usable, no horizontal scroll |
| Home/dashboard load | < 2s |
| Test start | < 500ms |
| Auto-grading | deterministic, instant |
| Question accuracy | 100% hand-reviewed before `ACTIVE` |

---

## 8. Deferred (explicitly out of MVP)

Payments/monetization · native Android/iOS apps · phone OTP · push notifications · parent email/portal · image-upload notes (keep AI notes + materials) · offline sync · multi-teacher centers · regional languages · state boards.

---

## 9. Open Questions

| ID | Question | Status |
|---|---|---|
| Q-01 | Sample question format the user will provide (JSON? Excel? plain text with answer key?) — needed for `POST /questions/import`. | **RESOLVED** — CSV: `ID, Class, Subject, Chapter, Topic, Question, Option A–D, Correct Option, Explanation, Difficulty`. Seeded at `backend/seed/sample_questions.csv`. |
| Q-02 | Subjects in scope for tests/practice: Maths only, or Maths + Science first? | **RESOLVED** — Maths + Science (notes/materials keep all 5 subjects). |
| Q-03 | Difficulty mix target (30/50/20 vs. other) and question count defaults per test. | **RESOLVED** — 30% easy / 50% medium / 20% hard, 10 questions default. |
| Q-04 | Keep Gemini AI notes in the MVP as-is, or also gate/reduce AI spend? | OPEN (default: keep, since already working) |
| Q-05 | Whether to keep the `SOM-gemini-ai-studio/` and old v2.0 docs, or archive them to avoid confusion. | **RESOLVED** — old v2.0 docs archived under `docs/archive/` (superseded). |

---

## 10. Build Order (each step independently shippable)

1. **Data plumbing** — extend `submissions` (answers + times), save DPP attempts, add per-question topic/difficulty. *(Everything downstream depends on this.)*
2. **Question bank** — `question_bank` collection + import/browse/review endpoints + seed the user's sample questions.
3. **Bank-driven tests** — make `POST /tests` async and sample from the bank (drop synchronous Gemini generation for tests).
4. **Mastery engine** — `lib/mastery.py` + `GET /mastery/*` endpoints.
5. **Weak-topic dashboard + teacher reports** — student dashboard + class heatmap + drill-down (React).
6. **Hygiene** — split `server.py` into modules, fix CORS (explicit origins), replace placeholder README.
