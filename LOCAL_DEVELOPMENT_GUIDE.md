# VidyaLab (School of Maths) — Local Development & Architecture Guide

This document contains startup commands, connection details, architecture overview, and requirements to resume development quickly.

---

## 1. Local Startup Commands

The project consists of three services running concurrently. Start them in the following order:

### Step 1: Start MongoDB
MongoDB runs using a local standalone binary downloaded into your home directory (or via Docker):
```bash
/Users/dhruv/mongodb-local/mongodb-macos-aarch64-8.0.12/bin/mongod \
  --dbpath /Users/dhruv/mongodb-local/data \
  --logpath /Users/dhruv/mongodb-local/logs/mongod.log \
  --port 27017 --fork
```
*(Note: Because of `--fork`, MongoDB runs as a background daemon process. You only need to run this once per system reboot.)*

### Step 2: Start the Backend (FastAPI)
The backend runs on port `8001` and connects to local MongoDB:
```bash
cd backend
source .venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```
*(Note: On startup, the backend automatically seeds the admin user and seeds the question bank from `backend/seed/sample_questions.csv` if `db.question_bank` is empty.)*

### Step 3: Start the Frontend (React)
The frontend runs on port `3000`:
```bash
cd frontend
npm start
```

---

## 2. Environment & Connections

### Backend Configuration (`backend/.env`)
```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"
CORS_ORIGINS="*"
JWT_SECRET="dev_secret_key_1234567890"
ADMIN_EMAIL="admin@vidya.com"
ADMIN_PASSWORD="admin123"
EMERGENT_LLM_KEY="sk-emergent-test"
```

### Frontend Configuration (`frontend/.env`)
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```
*(Important: Do **not** wrap the URL in quotation marks in `frontend/.env`, otherwise React keeps the literal quote characters and breaks Axios base URLs).*

### Default Admin Account
Created automatically on startup from `backend/.env`:
- **Email:** `admin@vidya.com`
- **Password:** `admin123`

---

## 3. Project Architecture

### Tech Stack
- **Frontend:** React 19, Tailwind CSS, shadcn/ui, Framer Motion, Axios (Port 3000)
- **Backend:** Python FastAPI, Motor (Async MongoDB driver), PyJWT, bcrypt, pypdf, python-docx (Port 8001)
- **Database:** MongoDB (Port 27017)
- **AI / LLM:** Gemini 3.1 Pro (via Emergent Universal LLM API)
- **Object Storage:** Emergent Object Storage proxy (for concept images and uploaded batch files)

### System Flow & Lifecycle
1. **Client-Server Communication:** React frontend calls `/api/*` on the FastAPI server with Axios.
2. **Auth Flow:** Stateless JWTs stored in `localStorage` (`vidya_token`) sent via `Authorization: Bearer <token>` header.
3. **Async Job Processing:** For multi-pass AI note generation (`POST /api/notes`) and test generation (`POST /api/tests`), the server immediately returns a `processing` status ID and spins off a background task. The frontend polls until status becomes `ready`.
4. **Mastery Engine:** Built in `backend/lib/mastery.py`. Derives topic retention scores on read from student submissions using difficulty weights and recency decay.

---

## 4. Key Endpoints & Routes

### Backend API Endpoints (all under `/api`)
- **Auth:** `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- **Mastery Telemetry:**
  - `GET /mastery/me` — Student mastery radar & band badges (`weak <55%`, `developing 55-75%`, `strong >75%`)
  - `GET /mastery/teacher?batch_id=` — Cohort student × topic heatmap matrix & weak topic ranking
  - `GET /mastery/teacher/student/{id}` — Individual student assessment history & concept breakdown
- **Tests & Practice:**
  - `POST /tests` — Bank-driven test creation with 30/50/20 difficulty mix and topic/chapter/subject/class fallback
  - `POST /tests/diagnostic` — 10-question cold-start syllabus diagnostic
  - `POST /tests/{id}/submit` — Submits test answers, logs per-question timings and tab switches
- **Question Bank:**
  - `POST /questions/import` — CSV question bank importer with validation & sanity checks
  - `GET /questions` — Browse verified question bank
  - `PUT /questions/{id}/review` — Approve/reject flagged draft questions
- **Batches & Materials:**
  - `POST /batches`, `GET /batches`, `POST /batches/join`
  - `POST /resources`, `GET /resources`, `GET /resources/{id}/file`

### Frontend Application Routes
- `/dashboard` — Role-delegated home (`StudentDashboard` for students, `TeacherDashboard` for teachers/admins)
- `/teacher/dashboard` — Direct route to Teacher Command Hub
- `/batches?batch_id=X` — Active batches manager with student leaderboard rankings (`#1 🥇, #2 🥈...`) and diagnostic modal
- `/tests` / `/dpp` — Timed test assessment runners and untimed daily practice
- `/notes` — AI Study notes library and reader (with anti-piracy rotating watermark)

---

## 5. Non-Functional Requirements & Security

1. **Concurrency & Performance:**
   - Fully asynchronous backend (`FastAPI` + `Motor`) prevents long LLM API calls from blocking routine database reads and auth endpoints.
2. **Fault Tolerance & Recovery:**
   - Background tasks handle errors gracefully; on backend reboot, startup sweeps reset interrupted note generations older than 20 minutes to `failed`.
   - Hierarchical fallback ensures tests always build reliably even if specific topic questions are scarce.
3. **Security & Anti-Piracy:**
   - Password hashing with `bcrypt`.
   - Role-scoped endpoint dependency injection (`require_role("teacher", "admin")`).
   - Secure file retrieval verifying student batch membership before serving media streams.
   - **Dynamic Rotating Watermark**: When students view teacher notes, a tiled diagonal watermark (-25°) containing student name and email is rendered over all content and concept illustrations, coupled with an animated floating security token to prevent screenshotting, screen-recording, or unauthorized material sharing.
4. **UX & Design Standards:**
   - "Cosmic Observatory" dark theme using Tailwind CSS and Framer Motion micro-interactions.
