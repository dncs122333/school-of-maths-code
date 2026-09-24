# VidyaLab (School of Maths)

A coaching-center platform for **CBSE Classes 9–10**. Teachers create batches, publish AI-generated study notes and materials, and launch bank-driven tests and daily practice (DPP). Students take timed tests, practice, and see a difficulty- and recency-weighted **mastery map** that highlights their weak topics.

## Features

- **AI study notes** — 3-pass Gemini pipeline (extract → generate → verify/gap-fill) with concept images and dynamic anti-piracy rotating watermark (student name + email)
- **Class materials** — chapter-tagged file uploads with authenticated downloads
- **Question bank** — CSV import with validation, dedupe, answer-key sanity checks, and automatic startup seeding
- **Bank-driven tests & DPP** — 30/50/20 difficulty mix, async creation, per-student option shuffle, and hierarchical topic fallback
- **Mastery engine** — weighted score (`easy 1.0 / medium 1.5 / hard 2.0`), recency decay, weak/developing/strong bands
- **Diagnostic test** — 10-question syllabus-wide cold-start assessment
- **Student Dashboard** — cosmic dark theme, streak tracker, interactive Mastery Map, AI Focus Today recommendations, and circular progress rings
- **Teacher Dashboard** — command hub, batch switcher, class heatmap (student × topic), weak topic leaderboard, and student velocity roster
- **Batch Leaderboard** — students ranked by overall mastery (`#1 🥇, #2 🥈...`) on `/batches` with 1-click diagnostic drilldown modals
- **Light anti-cheat** — tab-switch tracking, deterministic grading

## Tech stack

| Layer | Tech |
|---|---|
| Backend | FastAPI · Motor (MongoDB) · Pydantic · bcrypt · PyJWT |
| Frontend | React 19 · Tailwind CSS · shadcn/ui · react-router · axios |
| Database | MongoDB |
| Files | Emergent Object Storage |
| AI | Gemini 3.1 Pro (notes/MCQ) · Gemini 3.1 Flash (images) |

## Architecture & docs

- [System Architecture v2.0](docs/system_architecture_v2.0.md)
- [Technical Specification v3.0](docs/SPEC_v3.0.md)
- [Build Plan & Status](docs/BUILD_PLAN.md)
- [Local Development Guide](LOCAL_DEVELOPMENT_GUIDE.md)
- [Setup & Run Guide](SETUP_AND_RUN.md)

## Project structure

```
backend/
  server.py          # FastAPI entrypoint: routes, startup seed + background tasks
  config.py          # env + shared constants
  db.py              # Mongo client + API router
  models.py          # Pydantic request models
  auth.py            # hashing, JWT, current-user, role guards
  ai.py              # object storage + Gemini (notes/images)
  lib/mastery.py     # pure mastery engine
  seed/sample_questions.csv   # 44-question seed bank
  tests/             # integration tests
frontend/            # React 19 SPA (CRA + CRACO)
  src/
    components/dashboard/  # MasteryMap, ClassHeatmap, StudentRosterRadar, WeakTopicCard, etc.
    pages/                 # StudentDashboard, TeacherDashboard, Batches, Notes, Quizzes
docs/                # architecture, spec, plan
```

## Getting started

### 1. MongoDB

```bash
# Option A: Standalone binary on macOS (recommended for local dev)
/Users/dhruv/mongodb-local/mongodb-macos-aarch64-8.0.12/bin/mongod \
  --dbpath /Users/dhruv/mongodb-local/data \
  --logpath /Users/dhruv/mongodb-local/logs/mongod.log \
  --port 27017 --fork

# Option B: Docker
docker run -d -p 27017:27017 --name vidya-mongo mongo:7
```

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cat > .env <<'EOF'
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=test_database
JWT_SECRET=dev_secret_key_1234567890
ADMIN_EMAIL=admin@vidya.com
ADMIN_PASSWORD=admin123
EMERGENT_LLM_KEY=            # required only for AI notes/images
CORS_ORIGINS=*
EOF

uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

### 3. Frontend

```bash
cd frontend
cat > .env <<'EOF'
REACT_APP_BACKEND_URL=http://localhost:8001
EOF

npm install
npm start
```

Open **http://localhost:3000** — the seeded admin is `admin@vidya.com` / `admin123`.

## Seeding the question bank

The question bank is **automatically seeded on startup** from `backend/seed/sample_questions.csv` if empty. You can also import questions via the UI or API:

```bash
curl -X POST http://localhost:8001/api/questions/import \
  -H "Authorization: Bearer <teacher-or-admin-token>" \
  -F "file=@backend/seed/sample_questions.csv" -F "status=active"
```

CSV columns: `ID, Class, Subject, Chapter, Topic, Question, Option A–D, Correct Option, Explanation, Difficulty`.
