# VidyaLab — MVP Build Plan & Status

**Source of truth:** `docs/SPEC_v3.0.md` (Consolidated Technical Specification v3.0).  
**Branch:** `fix-test-race-condition-and-media-auth`  
**Last updated:** 2026-08-30

## Decisions locked (resolved from spec §9 Open Questions)

| Decision | Value |
|---|---|
| Question source | Hand-seeded CSV bank (`backend/seed/sample_questions.csv`, 44 questions) with automatic startup seed |
| Subjects in scope | Maths + Science (notes/materials keep all 5 subjects) |
| Difficulty mix / count | 30% easy / 50% medium / 20% hard, 10 questions default |
| Materials upload | In scope — implemented on `/resources` (authenticated download) |
| Student leaderboard | In scope — batch student rankings (#1, #2, #3...) on `/batches` |
| AI notes | Kept as-is (Gemini 3.1 Pro multi-pass pipeline) |

## Build order (each step independently shippable)

| # | Step | Status | Notes |
|---|---|---|---|
| 1 | Data plumbing — extend `submissions` (answers + times), save DPP attempts | ✅ **Done** | `answers[]` + `times[]` + `tab_switches`; DPP repeat history; `GET /tests/{id}/submissions` |
| 2 | Question bank — `question_bank` collection + import/browse/delete + seed | ✅ **Done** | `POST /questions/import` (CSV), `GET /questions`, `DELETE /questions/{id}`; answer-key sanity flag; dedupe |
| 3 | Bank-driven tests — async `POST /tests`, sample from bank, hierarchical fallback | ✅ **Done** | Asynchronous test generation, 30/50/20 difficulty mix, topic ➔ chapter ➔ subject ➔ class fallback; auto-seed on startup |
| 4 | Mastery engine — `lib/mastery.py` + `GET /mastery/*` + diagnostic test | ✅ **Done** | Weighted score (`easy 1.0 / medium 1.5 / hard 2.0`), recency decay, weak/developing/strong bands, `POST /tests/diagnostic` |
| 5 | Weak-topic dashboard + teacher reports + batch leaderboard (React) | ✅ **Done** | Magazine-style `StudentDashboard`, command-center `TeacherDashboard`, `MasteryMap`, `ClassHeatmap`, `StudentRosterRadar`, `Batches` rankings and deep-dive modal |
| 6 | Documentation & system synchronization | ✅ **Done** | All architectural specs, API endpoints, setup guides, and project overviews synchronized |

## Implementation notes / deviations from spec §3

- **`submissions` shape**: implemented as flat `answers: List[int]` + `times: List[float]` (+ `tab_switches`). Per-question `topic`/`difficulty` are derived by joining against the test's snapshotted `questions` (each snapshot question carries its topic/difficulty) rather than duplicated in the submission.
- **Hierarchical question sampling fallback**: when a teacher creates a test for a specific topic, if the question bank has fewer than the requested number of questions for that exact topic, `_sample_bank_questions` automatically falls back to chapter ➔ subject ➔ class level to ensure test generation never fails.
- **Answer-key sanity check**: importer flags explanation-vs-key `Option X` mismatches as `status: pending_review` for teacher review in `PendingReviewsQueue`.
- **Batch Leaderboard & Student Analysis**: `Batches.js` provides cohort-level rankings and instant student diagnostic modals with topic breakdown and attempt timeline.
