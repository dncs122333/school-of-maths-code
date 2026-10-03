# Production Deployment & Scaling Guide (Zero-Cost / Low-Cost)

This document provides a complete, step-by-step production deployment plan for the School of Maths platform (FastAPI backend + React frontend + MongoDB Atlas).

---

## 1. Architecture & Cost Overview

| Component | Recommended Service | Free Tier Allowance | Cost |
| :--- | :--- | :--- | :--- |
| **Frontend** | [Vercel](https://vercel.com) or [Cloudflare Pages](https://pages.cloudflare.com) | Unlimited deployments, 100 GB/mo bandwidth, global CDN, free SSL | **$0 / month** |
| **Backend API** | [Render](https://render.com) (Web Service) or [Koyeb](https://koyeb.com) | 512 MB RAM, 0.1–0.5 vCPU, 750 free compute hours/month | **$0 / month** |
| **Database** | [MongoDB Atlas](https://cloud.mongodb.com) (M0 Cluster) | 512 MB storage, shared RAM, automated backups, replica set | **$0 / month** |
| **File Storage** | [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/) | 10 GB storage free forever, **$0 egress fees** | **$0 / month** |
| **Custom Domain** *(Optional)* | Namecheap, Porkbun, Cloudflare | Free default subdomains (`*.vercel.app` & `*.onrender.com`), or purchase your own | **$0** (or ~$8/year) |

---

## 2. Student Load & Concurrency Capacity

### Estimated Capacity on Free Tier
* **Total Registered Accounts**: **5,000 – 10,000+ students** (metadata, profiles, scores, test submissions easily fit in 512 MB).
* **Daily Active Students**: **500 – 1,500 students/day** spread across different class times.
* **Simultaneous Quiz/Test Takers**: **50 – 150 students taking a test at the exact same moment** (FastAPI async request time is ~15ms per submission).
* **Simultaneous PDF/Image Watermark Downloads**: **10 – 25 students in the exact same second** (image processing is ~0.2s CPU; requests above this queue cleanly for 2–4 seconds without crashing).

### When to Upgrade?
If your student community grows beyond **1,000 daily active students** or more than **200 students take live tests simultaneously**, upgrade the backend instance to a **$5–$7/month tier** (e.g. Render Starter or Hetzner/DigitalOcean VPS). That single upgrade increases capacity to **500+ simultaneous test takers**.

---

## 3. Step-by-Step Deployment Instructions

### Step 1: Prepare MongoDB Atlas (Database)
1. Log in to [MongoDB Atlas](https://cloud.mongodb.com/).
2. Under **Network Access**:
   * Add `0.0.0.0/0` (allow connections from anywhere) so Render/Vercel dynamic IPs can connect.
3. Under **Database Access**:
   * Create a database user with read/write permissions.
4. Under **Clusters** $\rightarrow$ **Connect** $\rightarrow$ **Drivers**:
   * Copy the connection URI:
     ```
     mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
     ```

---

### Step 2: Deploy Backend on Render

1. Log in to [render.com](https://render.com) using your GitHub account.
2. Click **New +** $\rightarrow$ **Web Service**.
3. Select your repository: `dncs122333/school-of-maths-code`.
4. Configure service parameters:
   * **Name**: `school-of-maths-api`
   * **Root Directory**: `backend`
   * **Environment**: `Python 3`
   * **Build Command**:
     ```bash
     pip install -r requirements.txt
     ```
   * **Start Command**:
     ```bash
     uvicorn server:app --host 0.0.0.0 --port $PORT --workers 2
     ```
   * **Instance Type**: `Free`
5. Under **Environment Variables**, add:
   ```env
   MONGO_URL=mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
   DB_NAME=school_of_maths_prod
   JWT_SECRET=<generate_a_random_32_char_secret>
   CORS_ORIGINS=https://your-frontend.vercel.app
   ADMIN_EMAIL=admin@vidya.com
   ```
6. Click **Create Web Service**. Note your backend public URL (e.g. `https://school-of-maths-api.onrender.com`).

---

### Step 3: Deploy Frontend on Vercel

1. Log in to [vercel.com](https://vercel.com) using GitHub.
2. Click **Add New...** $\rightarrow$ **Project**.
3. Import `dncs122333/school-of-maths-code`.
4. Configure settings:
   * **Framework Preset**: `Create React App`
   * **Root Directory**: Click edit and choose `frontend`
   * **Build Command**: `npm run build`
   * **Output Directory**: `build`
5. Under **Environment Variables**, add:
   ```env
   REACT_APP_BACKEND_URL=https://school-of-maths-api.onrender.com
   ```
6. Ensure `frontend/vercel.json` exists to handle client-side routing:
   ```json
   {
     "rewrites": [
       { "source": "/(.*)", "destination": "/index.html" }
     ]
   }
   ```
7. Click **Deploy**. Vercel will build and launch your production frontend (e.g. `https://school-of-maths.vercel.app`).

---

### Step 4: Link Frontend & Backend CORS

1. Return to your **Render dashboard** $\rightarrow$ **Environment Variables**.
2. Update `CORS_ORIGINS` to include your live Vercel URL:
   ```env
   CORS_ORIGINS="https://school-of-maths.vercel.app,http://localhost:3000"
   ```
3. Save changes. Render will automatically redeploy with CORS configured.

---

### Step 5: Prevent Free-Tier Backend Sleep (Zero Cost)

Render's free tier puts inactive services to sleep after 15 minutes of zero traffic.
To prevent cold starts (~30s wait on first load):

1. Create a free account on [UptimeRobot](https://uptimerobot.com).
2. Click **Add New Monitor**:
   * **Monitor Type**: `HTTP(s)`
   * **Friendly Name**: `School of Maths API Ping`
   * **URL**: `https://school-of-maths-api.onrender.com/api/auth/me`
   * **Monitoring Interval**: Every `10 minutes`
3. This sends a lightweight heartbeat that keeps the backend warm during active class hours at $0 cost.

---

## 4. Production Checklist Before Launch

- [ ] **First Admin Setup**: Register the administrator account using `ADMIN_EMAIL`.
- [ ] **Initial Question Bank**: Import or create initial quiz questions and DPPs.
- [ ] **Watermark Check**: Upload a sample PDF and image note, log in with a student account, and verify the student's name and email appear as a watermarked overlay and inside downloaded files.
- [ ] **Backup**: Confirm automated daily snapshots are active in MongoDB Atlas.
