# Production Deployment Plan (India, low cost)

**Status:** agreed direction. The code changes in section 3 are done (5 November 2026), on branch `release/prod-readiness`. Nothing is deployed yet. For the step-by-step launch, follow [deploy/README.md](../deploy/README.md).

**Decisions so far:**
- **Scale:** up to 500 students in year one.
- **Backend:** our own small server in India.
- **Database:** Atlas free tier in Mumbai, with our own nightly backups.
- **Login:** email and password.

**Goal:** the best experience for students on Indian mobile networks and low-end Android phones, at the lowest monthly cost.

This replaces `PRODUCTION_DEPLOYMENT_GUIDE.md`, which used Singapore/US free tiers that sleep and have no backups.

---

## 1. Monthly cost estimate

All prices are approximate (November 2026, $1 ≈ ₹85). Foreign providers add 18% GST on Indian invoices. Check prices again on the day you buy.

| Item | Choice | ₹ / month |
| :--- | :--- | ---: |
| Backend server | DigitalOcean **Bangalore**, 2 GB RAM / 1 vCPU, $12 + GST | ~₹1,200 |
| Database | MongoDB Atlas **M0 free**, AWS **Mumbai** | ₹0 |
| Frontend hosting + CDN | Cloudflare Pages (free; commercial use allowed) | ₹0 |
| File storage (notes) + DB backups | Cloudflare R2 (10 GB free; no download fees) | ₹0 |
| DNS, HTTPS, DDoS protection | Cloudflare free plan | ₹0 |
| Password-reset emails | Brevo free (300 emails/day) | ₹0 |
| Error tracking | Sentry free | ₹0 |
| Uptime alerts | UptimeRobot free | ₹0 |
| Domain | `.in` domain, about ₹800/yr | ~₹70 |
| **Total** | | **~₹1,270 / month** |

**First year: about ₹15,000.**

**Cheaper option: ~₹700/month (~₹8,500/yr).** Use a Hostinger KVM 2 VPS in their Mumbai data centre (about ₹600–700/mo on a 12–24 month prepay) instead of DigitalOcean. You get more RAM for less money. The trade-offs are:
- you must prepay for the year or two;
- no hourly billing;
- slower support;
- snapshots are less flexible.

The setup scripts in this plan work on either provider.

**Not recommended: Oracle Cloud Always Free (₹0).** Sign-up is often refused, and Oracle can reclaim servers it considers idle. One lost server on an exam morning costs more than a year of the ₹1,200 option.

**One-time and later costs:**
- Google Play account: ~₹2,100 once.
- Apple developer account: ~₹8,500/yr. Only needed for store apps; the PWA needs neither.

**When to spend more** (not needed at up to 500 students):

| Trigger | Upgrade | New cost |
| :--- | :--- | :--- |
| Database over ~400 MB, or more than ~1,500 active students | Atlas Flex, Mumbai (backups built in) | +₹700–2,500/mo |
| Server CPU regularly above 70% during tests | 4 GB / 2 vCPU server | ~₹2,400/mo total |
| SMS OTP login wanted | MSG91 or similar, plus one-time DLT registration | ~₹0.20 per OTP |

---

## 2. Architecture

```
Student phone / laptop (browser or installed PWA)
   │ HTTPS, served from Cloudflare's edge in Mumbai/Delhi/Chennai/…
   ▼
Cloudflare  ── app.<domain> ──► Cloudflare Pages: React build (cached at the edge)
            └─ api.<domain> ──► DigitalOcean Bangalore server
                                  Docker Compose:
                                    caddy    (HTTPS to Cloudflare, gzip)
                                    backend  (FastAPI, 2 uvicorn workers)
                                  cron: nightly DB backup → R2
                                    │ ~10–15 ms
                                    ├──► MongoDB Atlas M0, AWS Mumbai
                                    ├──► Cloudflare R2 (notes, images, backups)
                                    └──► Gemini API (teacher's own key; AI import only)
```

**Why this gives the best experience:**
- **Everything is in India.** Cloudflare serves the app from cities near the student. The API server (Bangalore) and the database (Mumbai) are about 10–15 ms apart. Today each database call takes about 35 ms from a laptop, and a single screen makes several of them. With this layout, most API calls should finish in well under 100 ms for students in India.
- **The app loads once, then opens instantly.** A service worker (to be added, section 3) caches the app on the phone. Reopening it on a weak 3G/4G signal shows the UI straight away instead of a blank screen.
- **Cloudflare stays in front of the API**, adding free DDoS protection and hiding the server's IP address.

**Capacity at this size:**
- A 2 GB server running 2 workers handles about 150 students starting a class test together. That is far above 500 students total.
- Atlas M0 limits: 512 MB storage, about 100 operations per second, 500 connections. 500 students' worth of tests, submissions and reports is well under 100 MB.

---

## 3. Code changes before launch

All done, except that the parts needing real accounts or a real server have not been run: see "Not tested yet" in [deploy/README.md](../deploy/README.md).

### Must-have (launch blockers)

| # | Change | Why |
| :-- | :--- | :--- |
| 1 | **Rate-limit login and signup** per IP and per email, stored in a MongoDB collection that expires old entries. | There is no limit today, so passwords can be guessed without end. |
| 2 | **Use the real client IP:** Caddy accepts Cloudflare's `CF-Connecting-IP` only from Cloudflare's address ranges and passes it on; uvicorn runs with `--proxy-headers`. | Behind a proxy, every request looks like it comes from one IP (`server.py:859`). One bad actor would block batch joins for the whole school. |
| 3 | **Add `GET /api/health`** (database status, no login needed). | For uptime alerts and deploy checks. |
| 4 | **Fix the Docker setup.** The backend image listens on 8000 but compose maps 8001. Match the Python version to the `.venv` (3.11). Build the frontend with **yarn**, commit `yarn.lock`, and delete `package-lock.json`. | Builds should be the same as local, and the image does not run as configured today. |
| 5 | **Move uploads to R2.** Set the `S3_*` variables. Write `backend/scripts/migrate_to_r2.py` to copy `backend/local_storage/` (12 files, 1.3 MB). Stop tracking `local_storage/`. | Files on the server's disk are lost if the server is rebuilt, and the backups don't include them. |
| 6 | **Password reset by email** (Brevo). Reset tokens are single-use and expire after 30 minutes. | Without it, every forgotten password becomes a WhatsApp message to you. |
| 7 | **Nightly backup:** `backend/scripts/backup_db.py` → R2, keeping 30 days, plus `restore_db.py`. In Python, so the server needs no extra MongoDB tools; the file layout matches `mongodump --gzip`. | The free Atlas tier has no backups. |
| 8 | **Production files:** `docker-compose.prod.yml`, `Caddyfile`, `deploy.sh` and a one-time `server-setup.sh` (firewall, Docker, swap, automatic security updates, non-root user). | Lets the server be rebuilt from scratch in about 15 minutes. |

### Experience (₹0 to run, large effect on phones)

| # | Change | Why |
| :-- | :--- | :--- |
| 9 | **Service worker** (Workbox; CRA already supports it). Cache the app shell and static files, and always fetch API data fresh. Show an "Update available — tap to refresh" toast after a deploy. | Instant reopen on slow networks, plus a complete PWA install on Android. |
| 10 | **Compress API responses** in Caddy (`encode zstd gzip`), which skips PDFs and images, so Python spends no CPU on it. | Report and question JSON shrinks 70–85%, which matters on mobile data. |
| 11 | **Cache headers:** immutable for `/static/*` and no-cache for `index.html`, via Pages `_headers`. Add `_redirects` for SPA routes. | Repeat visits download almost nothing. |
| 12 | **Bundle check:** load KaTeX, charts and admin pages only when they are opened. Aim for under 250 KB of gzipped JavaScript on the student home screen. | Low-end Android phones spend seconds just parsing large bundles. |
| 13 | **Hash passwords off the main event loop** (`asyncio.to_thread`). | 40 logins at the start of a test won't freeze the app for everyone else. |
| 14 | **Run the auto-submit sweep in one worker only**, using a lock document. | Avoids repeated work every 2 minutes. |

### Safety and quality

| # | Change |
| :-- | :--- |
| 15 | Security headers on the frontend: HSTS, `nosniff`, `Referrer-Policy`, a CSP allowing `api.<domain>`, and `frame-ancestors 'none'`. |
| 16 | Sentry in the backend and frontend, switched on only when `SENTRY_DSN` is set. |
| 17 | Never log the Gemini request URL, which contains the teacher's key (`ai.py:146`). |
| 18 | With `ENV=production`, warn at startup about a short `JWT_SECRET` or `localhost` in `CORS_ORIGINS`. |
| 19 | Make the 2 failing `test_questions_json` tests pass and stabilise `test_report_aggregations::test_12`, so CI can block bad deploys. |
| 20 | DPDP Act 2023 basics for minors: privacy and terms pages, a guardian-consent checkbox at signup (saves `consent_at`), and an admin "delete student data" action. |

**Estimated effort: about 4–5 working days.**

---

## 4. Environments

| | Frontend | Backend | Database | Files |
| :--- | :--- | :--- | :--- | :--- |
| Local | `localhost:3000` | `localhost:8001` | Atlas dev cluster, `som_dev` | local disk |
| Staging | Pages preview (`staging` branch) | same server, second container on another port, `api-staging.<domain>` | **second free M0 cluster** (Atlas allows one per project, so use a second project) | `som-files-staging` |
| Production | `app.<domain>` | `api.<domain>` | M0 Mumbai, `som_prod` | `som-files` |

Staging shares the production server, so it costs nothing extra. It is stopped except while rehearsing.

Production starts with an **empty database**. Pytest creates `test_*` users, and those, along with the current development data, do not go live.

### Production secrets

They live in `/opt/som/.env` on the server (`chmod 600`) and are never committed to git.

```env
ENV=production
MONGO_URL=mongodb+srv://<prod-user>:<pw>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DB_NAME=som_prod
JWT_SECRET=<python -c "import secrets;print(secrets.token_urlsafe(48))">
CORS_ORIGINS=https://app.<domain>
ADMIN_EMAIL=<real admin email>
ADMIN_PASSWORD=<one-time; change it in the app after first login>
APP_TIMEZONE=Asia/Kolkata
ENABLE_WATERMARKING=true
S3_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=som-files
S3_REGION=auto
S3_BACKUP_BUCKET=som-backups
APP_URL=https://app.<domain>
BREVO_API_KEY=...
EMAIL_FROM=<sender verified in Brevo>
SENTRY_DSN=...
```

The Pages build variables are `REACT_APP_BACKEND_URL=https://api.<domain>`, `REACT_APP_CONTACT_EMAIL` and, optionally, `REACT_APP_SENTRY_DSN`. They are public, because they end up inside the JavaScript bundle.

---

## 5. Deploys, backups, monitoring

**CI** runs in GitHub Actions on every pull request:
- start the backend against a CI database and run pytest;
- run `yarn install --frozen-lockfile && CI=true yarn build`.

Branch protection keeps `main` green.

**Deploys:**
- *Frontend:* Cloudflare Pages builds `main` automatically. Rollback is one click.
- *Backend:* GitHub Action → SSH → `deploy.sh`. The script runs `git pull`, `docker compose build` and `up -d`, then waits for `/api/health`. If that check fails it rolls back to the previous image tag on its own.
- *Timing:* a deploy causes about 5 seconds of restart. `deploy.sh` refuses to run while a class test is live unless forced, so no student is cut off mid-test.

**Backups:**
- Nightly at 02:00 IST: `backup_db.py` to the `som-backups` bucket, keeping 30 days (and always the newest 7). At this size each file is about 5–20 MB, so this uses well under 1 GB of R2.
- Monthly: restore into the staging cluster and open the app to check it. A backup that has never been restored doesn't count.
- Weekly: a DigitalOcean server snapshot (+20%, about ₹200/mo, optional). The server can be rebuilt from scripts anyway.

**Monitoring:**
- UptimeRobot checks `/api/health` and the app every 5 minutes and sends email or Telegram alerts.
- Sentry reports errors.
- DigitalOcean alerts on CPU above 80% or disk above 80%.

---

## 6. Rollout

| Phase | What | Time |
| :--- | :--- | :--- |
| 0. Code | Section 3 changes on a `release/prod-readiness` branch; CI green; merge into `main` | 4–5 days |
| 1. Accounts | Domain → Cloudflare DNS. Atlas M0 in Mumbai (set the network access list to the server's IP only). R2 buckets and tokens. DigitalOcean BLR1 server. Brevo and Sentry accounts. | ½ day |
| 2. Server | Run `server-setup.sh`, copy in `.env`, first `deploy.sh`, then point `api.<domain>` and `app.<domain>` | ½ day |
| 3. Rehearsal | On staging: full pytest suite; walk through every main feature on a cheap Android phone over 4G; 150 simulated students taking one class test (k6), target p95 under 500 ms; backup-restore drill | 1–2 days |
| 4. Soft launch | Change the admin password, remove `ADMIN_PASSWORD`. One batch for one week. Check Sentry daily. | 1 week |
| 5. Open up | All batches. Monthly restore drill and dependency updates. | ongoing |

**The rehearsal walk-through covers:**
1. Teacher signs up.
2. Admin approves the teacher.
3. Teacher creates a batch.
4. Student joins with the code.
5. Teacher uploads notes.
6. Student views them watermarked.
7. A class test is scheduled.
8. A student takes it, closes the tab mid-test, and it auto-submits.
9. Results are released.
10. Practice test.
11. Term report.
12. Install the PWA on Android and on iPhone.

Because only the server's IP is allowed in Atlas, the database is not open to the internet. This is safer than `0.0.0.0/0`, and possible because our server has a fixed IP.

---

## 7. Phone app path

- **Now: PWA.** It installs from Chrome on Android and Safari on iPhone. With the service worker it behaves like an app: home-screen icon, full screen, instant open. Cost ₹0.
- **Later: Play Store via Capacitor** (~₹2,100 once). This needs a privacy policy URL and `https://localhost` added to `CORS_ORIGINS`.
- **Later: App Store** (~₹8,500/yr). Apple usually rejects pure website wrappers, so add push notifications or offline notes first.

---

## 8. Still to decide

1. **Domain name**, and `.in` or `.com`.
2. **Provider:** DigitalOcean Bangalore (~₹1,200/mo, monthly billing, recommended) or Hostinger Mumbai (~₹700/mo, prepaid 1–2 years).
3. **Launch date**, and which batch goes first.
