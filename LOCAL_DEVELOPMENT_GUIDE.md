# VidyaLab (School of Maths) — Local Development & Architecture Guide

This document contains startup commands, connection details, architecture overview, and requirements to resume development quickly.

---

## 1. Local Startup Commands

The project consists of three services running concurrently. Start them in the following order:

### Step 1: Start MongoDB
MongoDB runs using a local standalone binary downloaded into your home directory:
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
3. **Async Job Processing:** For multi-pass AI note generation (`POST /api/notes`), the server immediately returns a `processing` status ID and spins off a background `asyncio` task. The frontend polls `GET /api/notes/{id}` until the note status becomes `ready`.

---

## 4. Functional Requirements

1. **Role-Based Access Control (RBAC):**
   - **Student:** Join batches with a 6-character code, read AI notes, view/download shared chapter materials, take timed competitive tests, practice untimed DPPs, view score reports & explanations.
   - **Teacher:** Create/manage batches, generate AI notes from raw text/files, upload batch-scoped materials, create timed tests & DPPs, preview answer keys.
   - **Admin:** Seeded platform super-user with visibility across all teachers' data and system statistics.
2. **AI "Beautiful Notes" Engine:**
   - Text extraction from raw text, PDF, DOCX, TXT.
   - Multi-pass pipeline:
     1. *Extract* checklist of definitions, formulas, and concepts.
     2. *Generate* structured notes with CBSE 2025–26 syllabus alignment.
     3. *Verify & Gap Fill* to ensure zero omission of syllabus concepts.
   - Rich sections, formulas, concept diagram prompts, mnemonics, and quick revision points.
3. **Timed Tests & DPPs:**
   - AI generation of 4-option MCQs.
   - Tests have duration limits, validity windows, and single-submission constraints with real-time timers.
   - DPPs are open practice items that can be retaken anytime with immediate explanations.
4. **Batch Scoping:**
   - Materials and test availability are strictly scoped to students enrolled in specific batches.

---

## 5. Non-Functional Requirements

1. **Concurrency & Performance:**
   - Fully asynchronous backend (`FastAPI` + `Motor`) prevents long LLM API calls from blocking routine database reads and auth endpoints.
2. **Fault Tolerance & Recovery:**
   - Background tasks handle errors gracefully; on backend reboot, startup sweeps reset interrupted note generations older than 20 minutes to `failed`.
3. **Security:**
   - Password hashing with `bcrypt` (salt rounds handled).
   - Role-scoped endpoint dependency injection (`require_role("teacher", "admin")`).
   - Secure file retrieval verifying student batch membership before serving media streams.
4. **UX & Design Standards:**
   - "Cosmic Observatory" dark theme using Tailwind CSS and Framer Motion micro-interactions.
   - Non-blocking polling indicators for asynchronous AI workflows.
