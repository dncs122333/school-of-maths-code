# VidyaLab (School of Maths)

A coaching-center platform for **CBSE Classes 9–10**. Teachers create batches, publish
AI-generated study notes and materials, and launch bank-driven tests and daily practice (DPP).
Students take timed tests, practice, and see a difficulty- and recency-weighted **mastery map**
that highlights their weak topics.

## Features

- **AI study notes** — 3-pass Gemini pipeline (extract → generate → verify/gap-fill) with concept images
- **Materials** — chapter-tagged file uploads with authenticated downloads
- **Question bank** — CSV import with validation, dedupe, and answer-key sanity checks
- **Tests & DPP** — bank-driven (30/50/20 difficulty mix), async creation, per-student option shuffle
- **Mastery engine** — weighted score (`easy 1.0 / medium 1.5 / hard 2.0`), recency decay, weak/developing/strong bands
- **Diagnostic test** — 10-question syllabus-wide cold-start
- **Reports** — class heatmap, weak-topic ranking, per-student drill-down
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

## Project structure

```
backend/
  server.py          # FastAPI entrypoint: routes + startup
  config.py          # env + shared constants
  db.py              # Mongo client + API router
  models.py          # Pydantic request models
  auth.py            # hashing, JWT, current-user, role guards
  ai.py              # object storage + Gemini (notes/images)
  lib/mastery.py     # pure mastery engine
  routes/            # (planned) route modules
  seed/sample_questions.csv   # 44-question seed bank
  tests/             # integration tests
frontend/            # React 19 SPA (CRA + CRACO)
docs/                # architecture, spec, plan
```

## Getting started

### 1. MongoDB

```bash
# any local MongoDB; e.g. Docker
docker run -d -p 27017:27017 --name vidya-mongo mongo:7
```

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cat > .env <<'EOF'
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=vidyalab
JWT_SECRET=change-me
ADMIN_EMAIL=admin@vidya.com
ADMIN_PASSWORD=admin123
EMERGENT_LLM_KEY=            # required only for AI notes/images
CORS_ORIGINS=http://localhost:3000
EOF

uvicorn server:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
REACT_APP_BACKEND_URL=http://localhost:8000 yarn install
REACT_APP_BACKEND_URL=http://localhost:8000 yarn start
```

Open http://localhost:3000 — the seeded admin is `admin@vidya.com` / `admin123`.

## Seeding the question bank

```bash
curl -X POST http://localhost:8000/api/questions/import \
  -H "Authorization: Bearer <teacher-or-admin-token>" \
  -F "file=@backend/seed/sample_questions.csv" -F "status=active"
```

CSV columns: `ID, Class, Subject, Chapter, Topic, Question, Option A–D, Correct Option, Explanation, Difficulty`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URL` / `DB_NAME` | yes | database connection |
| `JWT_SECRET` | yes | HS256 signing secret |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | no | seeded admin (defaults shown above) |
| `EMERGENT_LLM_KEY` | AI only | Gemini + object storage |
| `CORS_ORIGINS` | no | allowed origins (default: `localhost:3000`) |
| `INTEGRATION_PROXY_URL` | no | object-storage base URL |

## Testing

```bash
cd backend
REACT_APP_BACKEND_URL=http://localhost:8000 pytest
```

Integration tests require a running backend plus seeded `teacher@vidya.com`/`student@vidya.com`.
