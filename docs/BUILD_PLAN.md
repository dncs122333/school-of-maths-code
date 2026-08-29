# VidyaLab — MVP Build Plan & Status

**Source of truth:** `docs/SPEC_v3.0.md` (Consolidated Technical Specification v3.0).
**Branch:** `submission-data-plumbing-accio` (integrates `website-design-enhancements-1` + new work).
**Last updated:** 2026-08-30

## Decisions locked (resolved from spec §9 Open Questions)

| Decision | Value |
|---|---|
| Question source | Hand-seeded CSV bank (`backend/seed/sample_questions.csv`, 44 questions) |
| Subjects in scope | Maths + Science (notes/materials keep all 5 subjects) |
| Difficulty mix / count | 30% easy / 50% medium / 20% hard, 10 questions default |
| Materials upload | In scope — implemented on `website-design-enhancements-1` (`/resources`) |
| Student leaderboard | In scope |
| AI notes | Keep as-is (Gemini 3.1 Pro) |

## Build order (each step independently shippable)

| # | Step | Status | Notes |
|---|---|---|---|
| 1 | Data plumbing — extend `submissions` (answers + times), save DPP attempts | ✅ **Done** (`fcbdcb5`) | `answers[]` + `times[]` + `tab_switches`; DPP repeat history; `GET /tests/{id}/submissions` |
| 2 | Question bank — `question_bank` collection + import/browse/delete + seed | ✅ **Done** (`0426556`, `cc96aa3`) | `POST /questions/import` (CSV), `GET /questions`, `DELETE /questions/{id}`; answer-key sanity flag; dedupe |
| 3 | Bank-driven tests — async `POST /tests`, sample from bank, per-student option shuffle | ⏳ Next | Drop synchronous Gemini generation for tests |
| 4 | Mastery engine — `lib/mastery.py` + `GET /mastery/*` + diagnostic test | ⏳ Pending | Weighted score, recency decay, bands |
| 5 | Weak-topic dashboard + teacher reports (React) | ⏳ Pending | Student mastery view, class heatmap, drill-down |
| 6 | Hygiene — split `server.py`, CORS explicit origins, README | ⏳ Pending | |

## Implementation notes / deviations from spec §3

- **`submissions` shape** (spec §3.2 shows a nested object example, §5.3 says flat): implemented as
  flat `answers: List[int]` + `times: List[float]` (+ `tab_switches`). Per-question `topic`/`difficulty`
  will be **derived by joining against the test's snapshotted `questions`** (each snapshot question carries
  its topic/difficulty) rather than duplicated in the submission. This keeps the submission lean and avoids
  drift if a bank question is later edited.
- **`question_bank` field casing/type** normalized to match the existing codebase — see the
  "Implemented schema" note in `SPEC_v3.0.md` §3.3.
- **Answer-key sanity check**: importer flags explanation-vs-key `Option X` mismatches (Q9-style) as
  `status: pending_review` for hand-review.

## Known open items

- Spec §9 Q-04 (gate/reduce Gemini note spend) still open — default: keep as-is.
- Spec §4.2 claims `QuizRunner` has "palette navigation"; current runner only has Prev/Next + progress bar.
  Palette (question grid) is a nice-to-have to confirm during Step 5.
