# AI Coding Agent Development Guidelines

This document provides mandatory operational instructions for AI coding agents (Antigravity, Claude, Cursor, Copilot, etc.) working on this repository in local development.

---

### 1. Database: MongoDB Atlas Only
- **DO NOT attempt to install, search for, or start a local MongoDB daemon** (`mongod`, `localhost:27017`, `127.0.0.1:27017`, or `docker run mongo`).
- The application connects strictly to **MongoDB Atlas Cloud**.
- The connection string is pre-configured in `backend/.env` under `MONGO_URL`.
- `backend/db.py` enforces MongoDB Atlas SRV URIs and will reject any local URI.

---

### 2. Backend Environment (Python)
- **The virtual environment is already created and fully provisioned** at `backend/.venv`.
- **DO NOT recreate the virtual environment** (`python -m venv`) and **DO NOT run `pip install -r requirements.txt`** blindly (all requirements are already installed).
- Always run backend commands using `backend/.venv`:
  ```bash
  # Option 1: Using the provided script
  ./start_backend.sh

  # Option 2: Directly via .venv
  cd backend && source .venv/bin/activate && uvicorn server:app --host 0.0.0.0 --port 8001 --reload
  ```
- To run tests:
  ```bash
  backend/.venv/bin/pytest backend/tests/ -n 0
  ```

---

### 3. Frontend Environment (React)
- Dependencies are pre-installed in `frontend/node_modules`.
- Always use **Yarn** (do NOT use npm):
  ```bash
  # Option 1: Using the provided script
  ./start_frontend.sh

  # Option 2: Directly via yarn
  cd frontend && yarn start
  ```
- Frontend dev server runs on `http://localhost:3000` and proxies API calls to `http://localhost:8001`.

---

### 4. Admin Credentials & Auth
- Default administrator is seeded automatically on startup:
  - **Email:** `admin@vidya.com`
  - **Password:** `admin123`
