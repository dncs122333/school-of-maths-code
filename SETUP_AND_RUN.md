# VidyaLab — Setup & Run Guide

This guide covers running the app locally on your machine during development.

---

## 1. Prerequisites
- **Python** 3.11+ (virtual environment pre-installed at `backend/.venv`)
- **Node.js** 18+ and **Yarn** (`frontend/node_modules` pre-installed)
- **MongoDB Atlas** (cloud-hosted database; connection string pre-configured in `backend/.env`)
- No local database daemon (mongod/docker) is required!

---

## 2. Environment Variables

### backend/.env
```env
MONGO_URL="mongodb+srv://dncs122333_db_user:6Tci8xfr2euAGJsa@learning.gmqg1hr.mongodb.net/?retryWrites=true&w=majority&appName=learning"
DB_NAME="test_database"
CORS_ORIGINS="*"
JWT_SECRET="dev_secret_key_1234567890"
ADMIN_EMAIL="admin@vidya.com"
ADMIN_PASSWORD="admin123"
EMERGENT_LLM_KEY=""
ENABLE_WATERMARKING="false"
```

### frontend/.env
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```
*(Do not wrap the URL in quotation marks in `frontend/.env`).*

---

## 3. Running Locally (Quick Start)

### Option A: Using Startup Scripts (Recommended)
From the project root:
```bash
# Terminal 1: Start Backend (FastAPI on port 8001)
./start_backend.sh

# Terminal 2: Start Frontend (React on port 3000)
./start_frontend.sh
```

### Option B: Manual Commands
```bash
# Terminal 1: Backend
cd backend
source .venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Terminal 2: Frontend
cd frontend
yarn start        # serves on http://localhost:3000
```

Open **http://localhost:3000**.

The admin account is created automatically on first startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## 4. Dependencies
- **Backend:** Dependencies are already installed in `backend/.venv`. If adding a package:
  `cd backend && source .venv/bin/activate && pip install <pkg>`
- **Frontend:** Dependencies are already installed in `frontend/node_modules`. If adding a package:
  `cd frontend && yarn add <pkg>` (⚠️ use Yarn, not npm)

---

## 5. Health Checks
```bash
# backend up?
curl -s "http://localhost:8001/api/catalog" | head -c 100

# login and hit a protected route
API="http://localhost:8001"
TOKEN=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@vidya.com","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s "$API/api/stats" -H "Authorization: Bearer $TOKEN"
```

---

## 6. Test Accounts
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@vidya.com | admin123 |
| Teacher | teacher@vidya.com | teacher123 |
| Student | student@vidya.com | student123 |
