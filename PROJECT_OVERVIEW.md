# VidyaLab (School of Maths) — Project Overview

> An EdTech platform for CBSE **Class 9 & 10** coaching/tuition centres. Teachers turn rough notes into beautiful, exam-accurate study notes, share original files with a batch, and run timed competitive MCQ tests & daily practice — all organised by class, subject, chapter and batch.

---

## 1. Functional Overview

### 1.1 User Roles
| Role | Can do |
|------|--------|
| **Student** | Join batches by code, read AI notes, view/download shared materials, take timed tests, practice DPPs, see scores & explanations. |
| **Teacher** | Create batches, generate AI notes, upload raw materials to a batch, create timed tests & DPPs, preview answer keys, manage/delete content. |
| **Admin** | Seeded super-user with visibility across all teachers' content and platform stats. |

### 1.2 Core Features
1. **AI "Beautiful Notes"**
   - Teacher pastes rough notes or uploads a **PDF / DOCX / TXT** file (text auto-extracted).
   - A **multi-pass accuracy engine** generates the notes:
     1. **Extract** — pulls an exhaustive checklist of every definition, fact, formula, unit and example.
     2. **Generate** — writes structured, memorable notes covering every checklist item.
     3. **Verify + Gap-fill** — re-checks coverage and adds any missed points.
   - Notes are aligned to the **CBSE 2025–26 (2026 board exam) syllabus & NCERT** for the chosen class/subject/chapter.
   - Output includes sections, key points, **formulas**, concept **illustrations (AI images)**, mnemonics and quick-revision.
   - **Asynchronous**: creation returns instantly; an animated loader polls until the note is `ready` (avoids gateway timeouts on long jobs).

2. **Class Materials (direct uploads, no AI)**
   - Teacher uploads any file (PDF/image/DOCX/PPTX/TXT) and assigns it to a **batch**.
   - The **original file** is viewable/downloadable — unchanged — by **students in that batch only**.
   - In-app viewer for images/PDF/text; files grouped into **chapter folders**.

3. **Timed Competitive Tests**
   - Teacher uploads/pastes a test sheet, chooses **class → subject → chapter → topic (optional)** and a **batch**.
   - AI converts it into clean 4-option MCQs.
   - Teacher sets **duration** (per-attempt timer) and **validity window** (hours from activation) — the test is live to the batch only within that window.
   - Student runner: sticky countdown timer, question navigation, auto-submit on timeout, scored result with per-question review & explanations. Correct answers are hidden during the attempt; double-submission is blocked.

4. **DPP (Daily Practice Problems)**
   - Untimed AI-generated MCQ practice, open to all students, repeatable, with instant explanations.

5. **Batches**
   - Teachers create batches (auto join-code); students join by code. Tests & materials are scoped to batches.

6. **Dashboards & Stats**
   - Role-based dashboards with stat tiles (notes, tests, DPPs, batches / tests taken, average score) and quick actions.

### 1.3 Seeded CBSE Catalog
- Classes **9** and **10**; subjects **Science, Maths, Social Science, English, Hindi**, each with a chapter list used across notes/tests/materials dropdowns.

---

## 2. Technical Overview

### 2.1 Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router, Tailwind CSS, shadcn/ui, Framer Motion, lucide-react, sonner (toasts), axios |
| Backend | FastAPI (Python), Motor (async MongoDB), Pydantic, PyJWT, bcrypt |
| Database | MongoDB |
| AI | Gemini **3.1 Pro** (text) + **Nano Banana** image model, via the **Emergent Universal LLM key** (`emergentintegrations`) |
| Storage | Emergent Object Storage (AI images + uploaded materials) |
| File parsing | `pypdf` (PDF), `python-docx` (DOCX), plain text |

### 2.2 Architecture
- **Routing:** all backend routes are prefixed with `/api` (Kubernetes ingress routes `/api/*` → backend :8001, everything else → frontend :3000).
- **Frontend → backend:** requests use `REACT_APP_BACKEND_URL`; JWT is stored in `localStorage` (`vidya_token`) and sent as `Authorization: Bearer <token>`.
- **Auth:** email/password with bcrypt hashing and JWT (7-day expiry). Roles: `student`, `teacher`, `admin`. Admin is seeded idempotently on startup from env.
- **Async notes:** `POST /api/notes` inserts a `processing` document and schedules an `asyncio` background task; the doc becomes `ready`/`failed`. A startup sweep marks notes stuck >20 min as `failed`.
- **Design theme:** dark "Cosmic Observatory" (space + science + maths) — Outfit / IBM Plex Sans / JetBrains Mono fonts.

### 2.3 Data Model (MongoDB collections)
| Collection | Key fields |
|-----------|-----------|
| `users` | `_id`, name, email (unique), password_hash, role, batch_ids[], created_at |
| `batches` | id, name, class_level, code, teacher_id, teacher_name |
| `notes` | id, title, class_level, subject, chapter, topic, intro, sections[], mnemonics[], quick_revision[], coverage, status, teacher_id |
| `tests` | id, title, kind (`test`/`dpp`), class_level, subject, chapter, topic, batch_id, duration_minutes, valid_hours, valid_from, valid_until, questions[], teacher_id |
| `submissions` | id, test_id, student_id, student_name, score, correct, total, created_at |
| `resources` | id, title, batch_id, class_level, subject, chapter, topic, storage_path, filename, content_type, size, teacher_id, is_deleted |

### 2.4 Key API Endpoints (all under `/api`)
**Auth**
- `POST /auth/register` · `POST /auth/login` · `GET /auth/me`

**Catalog & Stats**
- `GET /catalog` · `GET /stats`

**Batches**
- `POST /batches` · `GET /batches` · `POST /batches/join`

**Notes**
- `POST /extract` (file → text) · `POST /notes` (async generate) · `GET /notes` · `GET /notes/{id}`
- `GET /media/{path}` (serves AI concept images)

**Tests / DPP**
- `POST /tests` · `GET /tests?kind=test|dpp` · `GET /tests/{id}` · `POST /tests/{id}/submit` · `GET /tests/{id}/leaderboard`

**Materials**
- `POST /resources` (multipart upload) · `GET /resources` · `DELETE /resources/{id}` · `GET /resources/{id}/file` (Bearer-auth download)

### 2.5 Repository Layout
```
/app
├── backend/
│   ├── server.py            # FastAPI app: auth, catalog, batches, notes, tests, materials, AI pipeline
│   ├── requirements.txt
│   └── .env                 # MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_*, EMERGENT_LLM_KEY, CORS_ORIGINS
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── context/AuthContext.js
│   │   ├── lib/api.js
│   │   ├── components/ (Navbar, ProtectedRoute, ui/…)
│   │   └── pages/ (Landing, Auth, Dashboard, NotesLibrary, NoteReader,
│   │              QuizList, QuizRunner, CreateNote, CreateQuiz, Batches, Materials)
│   ├── package.json
│   └── .env                 # REACT_APP_BACKEND_URL
└── memory/                  # PRD.md, test_credentials.md
```

### 2.6 Third-party Integrations & Keys
- **Emergent Universal LLM key** (`EMERGENT_LLM_KEY`) — powers Gemini text + Nano Banana images. If its balance runs out, all AI generation returns *"Budget has been exceeded"*; top up via **Profile → Manage plan → Universal Key → Add Balance**.
- **Emergent Object Storage** — initialised on startup using the same key; stores concept images and uploaded materials.

### 2.7 Notable Design Decisions
- Long AI jobs run **asynchronously** to stay within the 60s ingress timeout.
- Material downloads use **authenticated blob fetch** (Bearer header) — no tokens in URLs/logs.
- Coverage-verification pass makes notes **complete** (nothing missed), prioritising accuracy over speed.

---

## 3. Test Accounts
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@vidya.com | admin123 |
| Teacher | teacher@vidya.com | teacher123 |
| Student | student@vidya.com | student123 |

*(Admin is seeded automatically; teacher/student were created for testing and can be re-registered.)*
