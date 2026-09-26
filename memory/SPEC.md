# SPEC — School of Maths (VidyaLab)

FastAPI + MongoDB backend, React 19 (CRA + craco) frontend. Cloned from
`dncs122333/school-of-maths-code` branch `correct-docs` and run in-pod.

Public URL: https://correct-docs-preview.preview.emergentagent.com

## Layout / run

- `backend/` — FastAPI on :8001 (supervisor `backend`). Entry `server.py`; every route is on
  `api_router = APIRouter(prefix="/api")` from `db.py`, included at the bottom of `server.py`.
  Modules: `auth.py` (bcrypt + JWT), `ai.py` (object storage + Gemini), `models.py`,
  `config.py`, `lib/mastery.py`.
- `frontend/` — CRA on :3000 (supervisor `frontend`, `yarn dev` → `craco start`).
- `mongodb` — in-pod mongod. `backend/.env`: `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`, `JWT_SECRET`.
- Object storage falls back to `backend/local_storage/` when `EMERGENT_LLM_KEY` is absent.

### API base (changed in this session)
`frontend/src/lib/api.js` uses a **relative** `/api` base (empty `REACT_APP_BACKEND_URL`), proxied
to `http://localhost:8001` by the `"proxy"` field in `frontend/package.json`. This makes calls
same-origin so they work both locally and behind the public preview ingress. `craco.config.js`
sets `allowedHosts: "all"` because the ingress arrives with a non-localhost Host header.

## Roles & auth

JWT bearer token in `localStorage.vidya_token`, sent via an axios request interceptor;
`get_current_user` also accepts an `access_token` cookie. Roles: `student`, `teacher`, `admin`.
Login page `/auth`. Credentials: see `memory/test_credentials.md`.

## Key flows

- **Batches** — teacher creates a batch (6-hex join code); student joins by code.
- **Notes** — teacher-authored sections; batch-scoped or general. `/notes/:id` reader renders
  `WatermarkOverlay` with the reader's name • email.
- **Materials** (`/materials`) — teacher uploads a file to a batch; students in that batch list,
  preview and download it. Grouped into folders by chapter.
- **Tests / DPP** — sampled from `question_bank` (auto-seeded from `seed/sample_questions.csv`),
  per-student deterministic option shuffling, submissions feed mastery.
- **Mastery / Reports** — `lib/mastery.py` topic scores; teacher sees per-student breakdown.

## Materials data model (`db.resources`)

`id` (uuid4 str), `title`, `batch_id`, `batch_name`, `class_level`, `subject`, `chapter`, `topic`,
`storage_path`, `filename`, `content_type`, `size`, `teacher_id`, `teacher_name`, `is_deleted`,
`created_at`. `storage_path` is **never** returned by `GET /resources` (projected out).

### Materials security contract (fixed this session)

| Rule | Behaviour |
|---|---|
| Extension allowlist | pdf, png, jpg, jpeg, webp, gif, txt, docx, pptx — anything else `400` |
| Content type | derived from `_MIME[ext]`; the client's `content_type` is never trusted |
| Upload cap | 25 MB, read in 1 MB chunks (never unbounded), over-cap → `413` |
| Batch ownership | uploader must own the batch (admin exempt), else `403` |
| Disposition | `inline` only for pdf/images/txt (`_PREVIEW_INLINE`); docx/pptx → `attachment` |
| Filename header | `[";]` + CRLF replaced, plus RFC 5987 `filename*=UTF-8''…` |
| Delete | soft-delete flag + best-effort `delete_object()` in try/except |
| File access | `403` unless owner, admin, or a student enrolled in the batch; bad token `401` |

`GET /resources/{id}/file` accepts a bearer header **or** `?auth=<token>` (used by direct links).

## Watermark

`WatermarkOverlay.js` tiles a 380×200 rotated SVG of "name • email":
- font size scales down with text length so long names never clip;
- two data URIs — light fill on screen, dark `rgba(15,23,42,0.18)` swapped in under `print:`,
  with `print-color-adjust: exact` so it survives printing;
- floating badge: animated on `sm:` and up, compact + static below `sm:` (no mobile jank).

`AuthedImage.js` creates its blob URL inside the effect and revokes that same local in cleanup;
on failure it renders an "Image unavailable" placeholder instead of an endless skeleton.

## Tests

```bash
cd /app/backend && python -m pytest        # 69 passed
cd /app/backend && python seed.py          # idempotent demo teacher + student
```

`backend/pytest.ini` is canonical (`-n 2 --dist loadscope`) — do not edit. Suites hit the live
uvicorn process and default to `http://localhost:8001` when `REACT_APP_BACKEND_URL` is unset.
`tests/test_resources.py` covers the 12 original cases plus 7 added for the allowlist (svg/html),
the 25 MB cap, cross-teacher batch upload, `storage_path` leakage, and `?auth=` 401/403.
