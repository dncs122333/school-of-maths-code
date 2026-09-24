# VidyaLab (School of Maths) — Project Overview

> An EdTech platform for CBSE **Class 9 & 10** coaching/tuition centres. Teachers turn rough notes into beautiful, exam-accurate study notes, share original files with a batch, and run timed competitive MCQ tests & daily practice — all organised by class, subject, chapter and batch with real-time mastery telemetry.

---

## 1. Functional Overview

### 1.1 User Roles
| Role | Can do |
|---|---|
| **Student** | Join batches by code, read AI notes, view/download shared materials, take timed tests, practice DPPs, see scores, analyze weak topics on the Mastery Map, and track diagnostic calibration. |
| **Teacher** | Create/manage batches, generate AI notes, upload materials, create timed tests & DPPs, seed/import question bank CSVs, view class mastery heatmaps, track student rankings, and review flagged questions. |
| **Admin** | Seeded super-user with full teacher capabilities and platform-wide visibility across all data and system statistics. |

### 1.2 Core Features
1. **AI "Beautiful Notes"**
   - Teacher pastes rough notes or uploads a **PDF / DOCX / TXT** file (text auto-extracted).
   - A **multi-pass accuracy engine** generates the notes:
     1. **Extract** — pulls an exhaustive checklist of every definition, fact, formula, unit and example.
     2. **Generate** — writes structured, memorable notes covering every checklist item.
     3. **Verify + Gap-fill** — re-checks coverage and adds any missed points.
   - Notes are aligned to the **CBSE 2025–26 (2026 board exam) syllabus & NCERT** for the chosen class/subject/chapter.
   - Output includes sections, key points, **formulas**, concept **illustrations (AI images)**, mnemonics and quick-revision.
   - **Asynchronous**: creation returns instantly; an animated loader polls until the note is `ready`.

2. **Class Materials (direct uploads, no AI)**
   - Teacher uploads any file (PDF/image/DOCX/PPTX/TXT) and assigns it to a **batch**.
   - The **original file** is viewable/downloadable — unchanged — by **students in that batch only**.
   - Authenticated blob download prevents token leakage in URLs.

3. **Timed Competitive Tests (Bank-Driven)**
   - Teacher selects **class → subject → chapter → topic (optional)** and a **batch**.
   - Tests sample from the **verified question bank** using a standard difficulty mix (~30% easy / 50% medium / 20% hard) with a hierarchical fallback (topic ➔ chapter ➔ subject ➔ class).
   - Teacher sets **duration** (per-attempt timer) and **validity window** (hours from activation).
   - Student runner: sticky countdown timer, auto-submit on timeout, tab-switch integrity tracking, scored result with per-question review & explanations. Option order is randomized per student; double-submission is blocked.

4. **DPP (Daily Practice Problems)**
   - Untimed MCQ practice, open to students, repeatable, with instant step-by-step explanations.
   - Every attempt is saved to `submissions` to feed personal and cohort mastery calculations.

5. **Diagnostic Assessment**
   - 10-question syllabus-wide diagnostic (`POST /api/tests/diagnostic`) cold-starts a student's personal mastery heatmap.

6. **Question Bank & Review Queue**
   - Bulk CSV import (`POST /api/questions/import`) with automated column validation, duplicate detection, and answer-key sanity checks.
   - Explanation-vs-key mismatches are automatically flagged as `pending_review` for teacher review in `PendingReviewsQueue`.

7. **Student Dashboard (Cosmic Observatory)**
   - **Hero Greeting & Streak Capsule**: Dynamic time-of-day greeting, fire streak counter with weekly day dots (`M T W T F S S`), and accuracy KPI tiles.
   - **Quick Study Sprints**: Action cards for DPP, Timed Mocks, AI Notes, and Batch Resources.
   - **Mastery Radar**: Interactive subject/chapter/topic cognitive map with color-coded band glows (`#34D399` Strong 🟢, `#FBBF24` Developing 🟡, `#F87171` Weak 🔴) and 1-click topic drilldown modal.
   - **AI Focus Today**: High-ROI concept recommendation banner with direct practice CTA.
   - **Targeted Weak Topics**: Circular SVG progress rings, CBSE board exam weightage notes, and 1-click DPP generation.
   - **Recent Activity Timeline**: Last 5 attempts with score pills, accuracy ratios, and trend indicators (`TrendingUp` / `TrendingDown`).

8. **Teacher Dashboard & Command Hub**
   - **Educator Toolkit**: Quick action strip for `+ AI Study Note`, `+ Timed Test`, `+ Daily Practice (DPP)`, `+ Upload Materials`, and `Import CSV`.
   - **Batch Switcher Capsule Strip**: Instant 1-click batch switching with active glow and student count badges.
   - **Class Mastery Heatmap**: Student × Topic matrix with cell breakdown modals, cohort distribution counters, and "Filter Weak Students" toggle.
   - **Class Weak Topics Leaderboard**: Ranked list of lowest-scoring concepts with 1-click `+ Create DPP` button.
   - **Student Roster Radar**: Real-time search by name, filter chips (`Needs Help`, `Top Performers`), and deep-dive student history modal.

9. **Batches & Student Leaderboard (`/batches`)**
   - Teachers create batches (auto join-code); students join by code.
   - **Batch Leaderboard**: Students automatically ranked (`#1 🥇`, `#2 🥈`, `#3 🥉`, `#4...`) by overall mastery score.
   - **Student Deep-Dive Modal**: Detailed topic score bars, attempt counts, and chronological assessment history.

---

## 2. Technical Overview

### 2.1 Stack
| Layer | Technology |
|---|---|
| Frontend | React 19, React Router, Tailwind CSS, shadcn/ui, Framer Motion, lucide-react, sonner (toasts), axios |
| Backend | FastAPI (Python), Motor (async MongoDB), Pydantic, PyJWT, bcrypt |
| Database | MongoDB (standalone local binary on macOS or Atlas) |
| AI | Gemini **3.1 Pro** (text) + **Nano Banana** image model, via the **Emergent Universal LLM key** (`emergentintegrations`) |
| Storage | Emergent Object Storage (AI images + uploaded materials) |
| File parsing | `pypdf` (PDF), `python-docx` (DOCX), plain text |

### 2.2 Architecture
- **Routing:** all backend routes are prefixed with `/api`. Default local ports: Backend on `:8001`, Frontend on `:3000`.
- **Frontend → backend:** requests use `REACT_APP_BACKEND_URL`; JWT is stored in `localStorage` (`vidya_token`) and sent as `Authorization: Bearer <token>`.
- **Auth:** email/password with bcrypt hashing and JWT (7-day expiry). Roles: `student`, `teacher`, `admin`. Admin is seeded idempotently on startup from env.
- **Async jobs:** `POST /api/notes` and `POST /api/tests` return immediately with a `processing` status ID; the frontend polls until the document becomes `ready`.
- **Mastery Engine (`backend/lib/mastery.py`):** Pure functional mastery calculation:
  $$ \text{mastery}(\text{topic}) = \frac{\sum \text{weight}(a) \cdot \text{correct}(a)}{\sum \text{weight}(a)} $$
  with recency decay ($0.9^{\text{days}/7}$) and difficulty weighting (easy: 1.0, medium: 1.5, hard: 2.0).

### 2.3 Data Model (MongoDB collections)
| Collection | Key fields |
|---|---|
| `users` | `_id`, name, email (unique), password_hash, role, batch_ids[], created_at |
| `batches` | id, name, class_level, code, teacher_id, teacher_name, created_at |
| `notes` | id, title, class_level, subject, chapter, topic, intro, sections[], mnemonics[], quick_revision[], coverage, status, teacher_id |
| `tests` | id, title, kind (`test`/`dpp`), class_level, subject, chapter, topic, batch_id, duration_minutes, valid_hours, valid_from, valid_until, questions[], status, teacher_id |
| `submissions` | id, test_id, kind, student_id, student_name, score, correct, total, answers[], times[], tab_switches, created_at |
| `question_bank` | id, class_level, subject, chapter, topic, difficulty, question, options[], correct_index, explanation, source, status, created_at |
| `resources` | id, title, batch_id, class_level, subject, chapter, topic, storage_path, filename, content_type, size, teacher_id, is_deleted |

### 2.4 Key API Endpoints (all under `/api`)

**Auth**
- `POST /auth/register` · `POST /auth/login` · `GET /auth/me`

**Catalog & Stats**
- `GET /catalog` · `GET /stats`

**Batches**
- `POST /batches` · `GET /batches` · `POST /batches/join`

**Mastery & Analytics**
- `GET /mastery/me` (student personal mastery & band ratings)
- `GET /mastery/teacher?batch_id=` (cohort student × topic matrix & weak topic ranking)
- `GET /mastery/teacher/student/{id}` (deep-dive student attempt logs & topic calibrations)

**Question Bank**
- `POST /questions/import` (multipart CSV upload with validation & dedupe)
- `GET /questions` (query question bank with filters)
- `PUT /questions/{id}/review` · `PATCH /questions/{id}` (update status / approve question)
- `DELETE /questions/{id}` (remove question)

**Notes**
- `POST /extract` (file → text) · `POST /notes` (async generate) · `GET /notes` · `GET /notes/{id}`
- `GET /media/{path}` (serves concept images)

**Tests / DPP**
- `POST /tests` (async bank sampling) · `GET /tests?kind=test|dpp` · `GET /tests/{id}`
- `POST /tests/{id}/submit` · `GET /tests/{id}/leaderboard`
- `POST /tests/diagnostic` (10-question cold-start diagnostic)

**Materials**
- `POST /resources` (multipart upload) · `GET /resources` · `DELETE /resources/{id}` · `GET /resources/{id}/file` (Bearer-auth download)

### 2.5 Repository Layout
```
/app
├── backend/
│   ├── server.py                 # FastAPI app: endpoints, startup seed, background workers
│   ├── config.py                 # Shared constants & environment config
│   ├── db.py                     # MongoDB Motor connection & router
│   ├── auth.py                   # Password hashing, JWT, role guards
│   ├── ai.py                     # Gemini notes engine & object storage client
│   ├── models.py                 # Pydantic validation models
│   ├── lib/
│   │   └── mastery.py            # Mastery calculation engine
│   ├── seed/
│   │   └── sample_questions.csv  # 44-question seed bank
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.js                # App shell & role-based routing
│   │   ├── components/
│   │   │   ├── Navbar.js
│   │   │   ├── ProtectedRoute.js
│   │   │   └── dashboard/
│   │   │       ├── MasteryMap.js
│   │   │       ├── WeakTopicCard.js
│   │   │       ├── ActivityTimeline.js
│   │   │       ├── ClassHeatmap.js
│   │   │       ├── StudentRosterRadar.js
│   │   │       ├── PendingReviewsQueue.js
│   │   │       └── ImportQuestionsModal.js
│   │   └── pages/
│   │       ├── Dashboard.js      # Role-based delegator (Student vs Teacher)
│   │       ├── StudentDashboard.js
│   │       ├── TeacherDashboard.js
│   │       ├── Batches.js        # Active batches & student rank leaderboard
│   │       ├── NotesLibrary.js / NoteReader.js / CreateNote.js
│   │       ├── QuizList.js / QuizRunner.js / CreateQuiz.js
│   │       ├── Materials.js
│   │       └── Auth.js / Landing.js
│   ├── package.json
│   └── .env
└── docs/                         # BUILD_PLAN.md, SPEC_v3.0.md, architecture
```

---

## 3. Test Accounts
| Role | Email | Password |
|---|---|---|
| Admin | admin@vidya.com | admin123 |
| Teacher | teacher@vidya.com | teacher123 |
| Student | student@vidya.com | student123 |

*(Admin is seeded automatically on startup from `backend/.env`.)*
