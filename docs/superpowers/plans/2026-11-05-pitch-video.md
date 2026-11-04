# School of Maths Pitch Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce `pitch-video/out/school-of-maths-pitch.mp4`, a ~2:00 16:9 demo with AI English voiceover and burned-in captions, built from real screens of the app running on seeded demo data, climaxing on a student's weak topic going Weak → Strong.

**Architecture:** A separate demo stack (backend :8011 + frontend :3011) points at a separate Atlas database `som_demo`. A staged Python seeder drives the real API (so grading and mastery are the app's own) and backdates timestamps. Playwright scripts record each scene as its own clip; Gemini TTS makes one voice clip per scene; an ffmpeg pipeline composes clips, phone frame, captions and music into the final cut.

**Tech Stack:** Python 3.11 (`backend/.venv`, requests, pymongo), Node + Playwright (in `pitch-video/`, Yarn), ffmpeg (Homebrew), Gemini TTS REST API (existing `GEMINI_API_KEY`).

**Spec:** `docs/superpowers/specs/2026-11-05-pitch-video-design.md`

## Global Constraints

- Audience is the owner of School of Maths; brand on screen and in VO is "School of Maths" only. No "VidyaLab" may appear in any frame.
- Demo data only, in `DB_NAME=som_demo`. Every script that writes must refuse to run unless `DB_NAME == "som_demo"`. Never touch the real database. MongoDB Atlas only, no local mongod (AGENTS.md).
- Do not recreate `backend/.venv` or `pip install -r requirements.txt` (AGENTS.md). Frontend uses Yarn, not npm.
- Ports 3000/8001 belong to another checkout (`school-of-maths-code-qwen`); the demo stack uses **8011** and **3011**.
- No app feature changes for the video. Bugs or rough screens found while recording are listed for the user, not fixed silently.
- Every on-screen number is what the app computes. Transitions between stages are edits between real recordings; the counter animates only between two real values.
- Mastery counts class tests only (`kind="test"`); practice (`dpp`) shows as practice accuracy. Bands: <55 weak, 55–75 developing, >75 strong.
- Output: 1920×1080, H.264 + AAC, < 50 MB, integrated loudness ≈ −14 LUFS, length 1:50–2:15, captions legible on a phone (≥ 48 px at 1080p).
- Fake identities only: student emails end `@demo.schoolofmaths.test`.
- Gemini TTS first; if it sounds poor, **stop and ask the user** before any other provider, account or paid service. Music: royalty-free; **ask the user** before downloading any file (name, source, size).
- User review gates: rough cut, then final cut.

## Review Focus

1. Seeder run twice or a stage re-run → must be idempotent (wipe-and-reseed `som_demo`), never duplicate students or hit "Already submitted" 403s. Test in Task 2.
2. Seeder accidentally pointed at the real DB → must exit non-zero before any write. Test in Task 1.
3. Recency decay shifting the hero's numbers between seeding day and recording day → bands must be asserted at record time, not just seed time. Test in Task 3 (`verify_stage`) and run before every recording in Task 5.
4. "VidyaLab", spinners, toasts, empty states or the dev-error overlay leaking into a clip → a frame check must fail the scene. Test in Task 5.
5. VO longer than its scene clip → captions/audio overrun the cut. Composer must pad or freeze the clip's last frame to VO length + 0.4 s. Test in Task 7.

---

## File Structure

```
pitch-video/
  README.md                 how to run each stage end to end
  .gitignore                out/, clips/, audio/, node_modules/
  demo_env.sh               exports DB_NAME=som_demo, ports, CORS for the demo stack
  start_demo_backend.sh     uvicorn on 8011 with demo env
  start_demo_frontend.sh    yarn start on 3011, REACT_APP_BACKEND_URL=http://localhost:8011
  seed/
    guard.py                require_demo_db()
    demo_questions.csv      ~70 Class 10 Maths questions in the bank CSV format
    roster.py               students, batches, fees (pure data)
    hero.py                 per-stage answer plan for hero + classmates (pure)
    seed_demo.py            CLI: --stage {1,2,3} [--reset]
    verify_stage.py         CLI: asserts expected bands for a stage via the API
    tests/test_guard.py, test_hero.py, test_seed_live.py
  script/scenes.json        scene id, VO text, caption text, target seconds, stage, recorder name
  record/
    package.json            playwright
    lib.mjs                 login(), phoneContext(), desktopContext(), frameCheck()
    scenes/*.mjs            one recorder per scene
    hook/*.html             stylised hook graphics (generic, no real chats)
    endcard.html            logo + wordmark
  voice/tts.py              scenes.json -> audio/<id>.wav (Gemini TTS)
  edit/
    compose.py              clips + audio + captions + music -> out/*.mp4
    phone_frame.png         generated from edit/phone_frame.html
    tests/test_compose.py
```

`.claude/launch.json` gains `demo-backend` (port 8011) and `demo-frontend` (port 3011) configurations.

---

### Task 1: Demo stack and DB guard

**Files:**
- Create: `pitch-video/demo_env.sh`, `start_demo_backend.sh`, `start_demo_frontend.sh`, `.gitignore`, `seed/guard.py`, `seed/tests/test_guard.py`
- Modify: `.claude/launch.json`

**Interfaces:**
- Produces: `guard.require_demo_db() -> None` (raises `SystemExit(2)` unless `os.environ["DB_NAME"] == "som_demo"`); demo API at `http://localhost:8011/api`, demo UI at `http://localhost:3011`.

- [ ] **Step 1: Failing tests** — `test_refuses_real_db` (DB_NAME set to the value in `backend/.env` → `SystemExit` code 2), `test_refuses_missing_db_name`, `test_allows_som_demo`.
- [ ] **Step 2:** Run `backend/.venv/bin/pytest pitch-video/seed/tests/test_guard.py -n 0` → FAIL (module missing).
- [ ] **Step 3:** Implement `require_demo_db()`. `demo_env.sh` exports `DB_NAME=som_demo`, `CORS_ORIGINS=http://localhost:3011`, `ENABLE_WATERMARKING=true`. Backend script: `source demo_env.sh; cd backend; exec .venv/bin/uvicorn server:app --port 8011` (env vars win because `db.py` loads `.env` with `override=False`). Frontend script: `PORT=3011 REACT_APP_BACKEND_URL=http://localhost:8011 BROWSER=none yarn start`.
- [ ] **Step 4:** Tests PASS. Start both via `preview_start` (`demo-backend`, `demo-frontend`); `curl localhost:8011/api/admin/data-source-status` returns available; the UI loads on 3011 and logs in as the seeded admin.
- [ ] **Step 5:** Commit `chore(pitch-video): demo stack on som_demo with DB guard`.

### Task 2: Demo question bank, roster and seeder (stage 1)

**Files:**
- Create: `seed/demo_questions.csv`, `seed/roster.py`, `seed/hero.py`, `seed/seed_demo.py`, `seed/tests/test_hero.py`, `seed/tests/test_seed_live.py`

**Interfaces:**
- Consumes: `require_demo_db()`; demo API.
- Produces:
  - `roster.BATCHES: list[dict]` — "Class 10 – Evening" (hero batch, 25 students, monthly_fee 2500) and "Class 9 – Morning" (12 students, monthly_fee 2000).
  - `roster.STUDENTS: list[dict(name, email, batch)]`; hero = `"Aarav Sharma"`, `aarav.sharma@demo.schoolofmaths.test`.
  - `hero.answer_plan(stage: int) -> dict[email, dict[test_key, dict[topic, float]]]` — target fraction correct per topic per class test / DPP for each student.
  - `seed_demo.main(stage: int, reset: bool)`; CLI `python -m seed_demo --stage N [--reset]`.
  - Demo teacher `meera.iyer@demo.schoolofmaths.test` (approved), demo password from `roster.DEMO_PASSWORD` (also written into `pitch-video/README.md`, not stated in chat).

- [ ] **Step 1: `demo_questions.csv`** — same header as `backend/seed/sample_questions.csv`; Class 10 Maths; ≥ 24 questions for chapter "Quadratic Equations" (topics: roots by factorisation, quadratic formula, nature of roots; easy/medium/hard ≈ 30/50/20), ≥ 8 each for Real Numbers, Polynomials, Linear Equations in Two Variables, Triangles, Trigonometry, Statistics. Questions must be correct maths with one right option; LaTeX where the app's MathText supports it.
- [ ] **Step 2: Failing tests in `test_hero.py`** — run the plan's attempts through `backend/lib/mastery.py` with stage-appropriate dates and assert: after stage 1 hero Quadratics mastery in **30–40** (weak); after stage 2 in **56–70** (developing); after stage 3 in **76–85** (strong); hero's other topics ≥ 60; Quadratics is the lowest class-average topic in the hero batch after stage 1 and its class average rises at each stage; ≥ 4 classmates also cross into developing by stage 3.
- [ ] **Step 3:** Run → FAIL. Implement `hero.answer_plan` until PASS. Dates: class test 1 = 21 days ago, 2 = 10 days ago, 3 = 2 days ago; DPPs between them.
- [ ] **Step 4: Seeder stage 1** — `--reset` drops every collection in `som_demo` (guarded), then via API: admin approves teacher (`/admin/teachers/{id}/approve`), teacher creates batches (`join_requires_approval: true`), imports CSV (`/questions/import-csv`), students register and join by code, teacher approves all but 2 (left pending for the join-request shot), fees recorded via `/batches/{b}/students/{s}/fee` (≈ 80 % paid, 3 pending, 2 partial), 3 materials uploaded via `/resources` (chapter-tagged PDFs generated locally), class test 1 created from explicit `question_ids` and submitted by every student per `answer_plan`, results released. To answer a question "correctly" the seeder computes the display index with `server._question_order`, `server._shuffled_order`, `server._option_seed` (import from `backend/server.py` with `DB_NAME=som_demo`). After submitting, it backdates `submissions.created_at`, test `valid_from/valid_until`, and join/fee dates directly in `som_demo`. Two students skip class test 1 and get a make-up (`/tests/{id}/makeup`).
- [ ] **Step 5: `test_seed_live.py`** (marked `live`, needs demo backend): `--stage 1 --reset` twice in a row succeeds both times with exactly 37 students and one submission per student per test; `GET /mastery/teacher/student/{aarav}` Quadratics band == "weak".
- [ ] **Step 6:** Run live tests → PASS. Commit `feat(pitch-video): staged demo seeder, stage 1`.

### Task 3: Seeder stages 2 and 3, and stage verifier

**Files:**
- Modify: `seed/seed_demo.py`
- Create: `seed/verify_stage.py`; extend `seed/tests/test_seed_live.py`

**Interfaces:**
- Produces: `verify_stage.check(stage: int) -> list[str]` (empty = OK; else human-readable failures); CLI exits 1 on failure.

- [ ] **Step 1: Failing live tests** — after `--stage 2`: hero Quadratics band "developing", hero has ≥ 3 DPP submissions on Quadratics with rising practice accuracy; after `--stage 3`: band "strong", class weak-topic list (`/mastery/teacher`) no longer has Quadratics at #1; `--stage 3` straight after `--stage 1 --reset` also works (stages apply all lower stages if missing).
- [ ] **Step 2:** Run → FAIL. Implement stages 2/3 (DPPs on Quadratics for hero + classmates, class tests 2 and 3, released; a scheduled future class test 4 left unstarted for the "create/schedule" shot). Implement `verify_stage.check` reading the live API with today's date.
- [ ] **Step 3:** Run → PASS. Commit `feat(pitch-video): seeder stages 2-3 and verifier`.

### Task 4: Scene list and voiceover

**Files:**
- Create: `script/scenes.json`, `voice/tts.py`

**Interfaces:**
- Produces: `scenes.json` — array of `{id: "s01".."s13", vo: str, caption: str, target_s: float, stage: 1|2|3|null, recorder: str, layout: "desktop"|"phone"|"full"}`; VO text copied verbatim from the spec's script table, numbers in s09/s11 replaced by the values `verify_stage` reports. `tts.py` writes `audio/<id>.wav` (24 kHz mono) and `audio/durations.json`.

- [ ] **Step 1:** Write `scenes.json` from the spec table. Run seeder stages and fill real numbers into s09/s11 VO and captions.
- [ ] **Step 2:** `tts.py` calls Gemini TTS (`gemini-2.5-flash-preview-tts`, warm, clear, professional English voice; try 2–3 prebuilt voices on s01 and pick one). Skip unchanged scenes (hash of text + voice).
- [ ] **Step 3:** Run; listen check: `durations.json` total 1:45–2:10. Send the user s01 + s11 samples. **If the voice sounds poor, stop and ask.**
- [ ] **Step 4:** Commit `feat(pitch-video): scene list and AI voiceover`.

### Task 5: Scene recorders

**Files:**
- Create: `record/package.json`, `record/lib.mjs`, `record/scenes/s03..s12.mjs`, `record/hook/*.html`, `record/endcard.html`, `edit/phone_frame.html`

**Interfaces:**
- Consumes: `scenes.json`, demo UI on 3011, `verify_stage.check`.
- Produces: `clips/<id>.webm` per scene (desktop 1920×1080; phone 390×844 @2x); `yarn record <id|all>`.
- `lib.mjs`: `login(page, role)`, `desktopContext()`, `phoneContext()`, `smoothScroll()`, `frameCheck(page) -> string[]` (fails on text "VidyaLab", visible spinners/skeletons, toasts with error text, CRA error overlay, console errors).

- [ ] **Step 1:** `cd pitch-video/record && yarn add -D playwright && yarn playwright install chromium`.
- [ ] **Step 2:** `frameCheck` with a test page: a page containing "VidyaLab" returns a failure; a clean demo page returns `[]`.
- [ ] **Step 3:** Recorders per spec table: s03 approve teacher → create batch → join requests; s04 materials + phone notes with watermark; s05 question import, create class test (schedule), phone taking a test; s06 release results, leaderboard, PDF report; s07 fee status tab; s08 heatmap + weak-topic list (stage 1); s09 Aarav's report/mastery map (stage 1); s10 phone Focus Today + DPP (stage 2); s11 mastery map and heatmap at stages 1, 2, 3 (three clips: `s11a/b/c`); s12 weak-topic list + term report (stage 3). Hook s01 and end card s13 render the local HTML pages. Each recorder runs `verify_stage.check(stage)` first and `frameCheck` on key frames; any failure aborts that scene.
- [ ] **Step 4:** `yarn record all` produces every clip with no frame-check failures. Write bugs/rough screens to `pitch-video/RECORDING_NOTES.md` for the user.
- [ ] **Step 5:** Commit `feat(pitch-video): scene recorders`.

### Task 6: Music

- [ ] **Step 1:** Ask the user: supply a track, or approve a specific royalty-free download (name, source, licence, size). Save to `pitch-video/audio/music.mp3`. No commit of the media file.

### Task 7: Composer, rough cut, final cut

**Files:**
- Create: `edit/compose.py`, `edit/tests/test_compose.py`

**Interfaces:**
- Consumes: `scenes.json`, `clips/*`, `audio/*.wav`, `audio/durations.json`, `audio/music.mp3`, `edit/phone_frame.png`.
- Produces: `compose.build_timeline(scenes, durations) -> list[dict(id, start, end, clip, pad_s)]`; `compose.write_srt(timeline, path)`; CLI `python compose.py --rough|--final` → `out/school-of-maths-pitch[-rough].mp4`.

- [ ] **Step 1: Failing tests** — `test_scene_length_is_max_of_clip_and_vo_plus_pad` (VO 6.0 s, clip 4.0 s → scene 6.4 s, `pad_s` 2.4); `test_srt_times_match_timeline`; `test_total_length_within_bounds` (110–135 s for the real scenes.json).
- [ ] **Step 2:** Run → FAIL. `brew install ffmpeg` (confirm `ffmpeg -filters | grep -q subtitles`). Implement.
- [ ] **Step 3:** Composition: phone clips scaled into `phone_frame.png` on a School of Maths yellow/navy background; desktop clips full frame with gentle zoom on key numbers (s09 score, s11 counter); s11 = crossfade a→b→c with a counter overlay animating between the real values; music ducked −18 dB under VO; captions burned (≥ 48 px, bottom-centre, navy box); 0.3 s crossfades between scenes; loudnorm to −14 LUFS; H.264 CRF tuned so file < 50 MB.
- [ ] **Step 4:** Tests PASS. Run `--rough`; check with `ffprobe` (1920×1080, duration 110–135 s, size < 50 MB) and extract 1 frame per scene to confirm no "VidyaLab"/spinners.
- [ ] **Step 5:** Send the rough cut to the user; apply feedback. Then `--final` and send.
- [ ] **Step 6:** Commit code (not media) `feat(pitch-video): composer and final cut`; write `pitch-video/README.md` run-book.
