# VidyaLab — Setup & Run Guide

This guide covers running the app **inside the Emergent environment** (already configured) and **locally on your own machine**.

---

## 1. Prerequisites
- **Python** 3.11+
- **Node.js** 18+ and **Yarn** (⚠️ use Yarn, not npm)
- **MongoDB** running locally (or a connection string)
- An **Emergent Universal LLM key** with balance (for AI notes/tests/images)

---

## 2. Environment Variables

### backend/.env
```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"
CORS_ORIGINS="*"
JWT_SECRET="<a long random secret>"
ADMIN_EMAIL="admin@vidya.com"
ADMIN_PASSWORD="admin123"
EMERGENT_LLM_KEY="sk-emergent-xxxxxxxxxxxxx"
```

### frontend/.env
```
REACT_APP_BACKEND_URL="https://<your-app>.preview.emergentagent.com"
```
> Rules: the frontend must call the backend only via `REACT_APP_BACKEND_URL`, and all backend routes are prefixed with `/api`. Do not hardcode URLs/keys. For local dev you may set `REACT_APP_BACKEND_URL="http://localhost:8001"`.

---

## 3. Running in the Emergent Environment (already set up)

Both services run under **supervisor** with hot-reload; you normally don't start them manually.

```bash
# check status
sudo supervisorctl status

# restart after changing .env or installing dependencies
sudo supervisorctl restart backend
sudo supervisorctl restart frontend
sudo supervisorctl restart all
```

**Logs**
```bash
tail -n 100 /var/log/supervisor/backend.err.log
tail -n 100 /var/log/supervisor/frontend.err.log
```

Code edits to `server.py` or the React `src/` hot-reload automatically. Restart is only needed after editing `.env` or installing packages.

---

## 4. Running Locally (from scratch)

### 4.1 Start MongoDB
```bash
# example (Linux service) — or run your own mongod / Atlas string
sudo systemctl start mongod
```

### 4.2 Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# start the API on port 8001
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```
The admin account is created automatically on first startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### 4.3 Frontend
```bash
cd frontend
yarn install
yarn start        # serves on http://localhost:3000
```

Open **http://localhost:3000**.

---

## 5. Installing / Updating Dependencies
- **Backend:** `pip install <pkg> && pip freeze > requirements.txt` (never hand-edit blindly)
- **Frontend:** `yarn add <pkg>` (auto-updates `package.json`; never use npm)

---

## 6. First-Run Walkthrough
1. Open the app → **Get started** → register as a **Teacher** (or log in as admin).
2. **Batches** → create a batch → copy the **join code**.
3. Register a **Student** → on the dashboard, **Join a batch** with the code.
4. **Teacher → Class Notes**: paste/upload rough notes, pick class/subject/chapter → **Generate** (wait for the "ready" loader — AI is multi-pass).
5. **Teacher → Materials**: upload a PDF/image to the batch — the student can view/download it as-is.
6. **Teacher → Tests → New test**: paste a sheet, pick the batch, set duration & validity → **Create & activate**.
7. **Student**: open **Tests**, take the timed test, submit, and review the score & explanations.

---

## 7. Health Checks
```bash
# backend up?
curl -s "$REACT_APP_BACKEND_URL/api/catalog" | head -c 100

# login and hit a protected route
API=$REACT_APP_BACKEND_URL
TOKEN=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@vidya.com","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s "$API/api/stats" -H "Authorization: Bearer $TOKEN"
```

---

## 8. Troubleshooting
| Symptom | Cause / Fix |
|--------|-------------|
| Notes show **"failed"**; logs say *"Budget has been exceeded"* | Emergent LLM key out of balance → **Profile → Manage plan → Universal Key → Add Balance** (or enable auto top-up). |
| Note stuck on **"Generating"** for a long time | Multi-pass jobs take 60–120s; a worker restart auto-marks stale (>20 min) notes as failed — just regenerate. |
| **401 / not authenticated** in UI | Token missing/expired — log in again; ensure requests send `Authorization: Bearer`. |
| Frontend can't reach backend | Check `REACT_APP_BACKEND_URL` and that backend routes are under `/api`. |
| Backend won't start | `tail -n 100 /var/log/supervisor/backend.err.log` — usually a syntax error or bad `.env`. |
| Login fails for known user | Verify credentials in `memory/test_credentials.md`; admin is re-seeded from `.env` on startup. |

---

## 9. Test Accounts
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@vidya.com | admin123 |
| Teacher | teacher@vidya.com | teacher123 |
| Student | student@vidya.com | student123 |
