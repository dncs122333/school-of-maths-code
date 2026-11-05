# School of Maths — Setup & Run Guide

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
MONGO_URL="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority"
DB_NAME="test_database"
CORS_ORIGINS="*"
JWT_SECRET="dev_secret_key_1234567890"
ADMIN_EMAIL="admin@somacademy.example.com"
ADMIN_PASSWORD="admin123"
# Optional: Cloudflare R2 / S3-compatible storage for uploads.
# Leave unset to store files on local disk in backend/local_storage/.
S3_ENDPOINT_URL=""          # e.g. https://<account_id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
S3_BUCKET=""
S3_REGION="auto"
ENABLE_WATERMARKING="true"   # stamps student PDF/image downloads with their name and email; "false" to disable
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
  -d '{"email":"admin@somacademy.example.com","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s "$API/api/stats" -H "Authorization: Bearer $TOKEN"
```

---

## 6. Test Accounts
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@somacademy.example.com | admin123 |
| Teacher | teacher@somacademy.example.com | teacher123 |
| Student | student@somacademy.example.com | student123 |
