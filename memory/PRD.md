# VidyaLab — Product Requirements Document

## Original Problem Statement
Build an EdTech platform for CBSE Class 9 & 10 students with notes, DPP, and timed tests. Tuition teachers upload rough notes that are converted into beautiful, memorable notes (no concept missing) with concept images. Teachers upload test sheets for a batch; a test is chosen via dropdown by class/subject/chapter/topic(optional) and converted into a timed competitive MCQ test valid only for a certain duration from activation (set by the teacher).

## Architecture
- **Frontend**: React 19, Tailwind, Shadcn UI, Framer Motion. JWT stored in localStorage (`vidya_token`), Bearer header via axios interceptor.
- **Backend**: FastAPI + MongoDB (motor). All routes under `/api`.
- **AI**: Gemini 3.1 Pro (note & MCQ generation) + Gemini Nano Banana (concept images) via Emergent Universal LLM key.
- **Storage**: Emergent Object Storage for AI-generated concept images, served via `/api/media/{path}`.

## User Personas
- **Teacher**: creates batches, uploads notes/test sheets, launches timed tests & DPPs.
- **Student**: joins batches by code, reads notes, takes timed tests, practices DPPs.
- **Admin**: platform overview (admin@vidya.com).

## Core Requirements (static)
1. Rough notes -> beautiful structured notes with sections, key points, concept images, mnemonics, quick revision.
2. Timed competitive MCQ tests bound to a batch with class/subject/chapter/topic + duration + validity window from activation.
3. DPP (daily practice, untimed, open to all students).
4. Role-based JWT auth (teacher/student/admin).

## Implemented (2026-08-16)
- JWT auth (register/login/me) with 3 roles, idempotent admin seed.
- CBSE catalog seed (Class 9 & 10: Science, Maths, Social Science, English, Hindi + chapters).
- Batches: create + join by code, student counts.
- AI beautiful notes (paste text or PDF/DOCX extract) with up to 3 Nano Banana concept images.
- AI MCQ tests (timed, batch-bound, validity window) + DPPs (untimed, open).
- Student test runner with countdown timer, answer navigation, submit, scored result + per-question review/explanations. Double-submit blocked; correct answers hidden during test.
- Dashboards (role-based), stats, leaderboard endpoint.
- Verified: 29/29 backend tests pass, frontend E2E 100%.

## Backlog / Remaining
- P1: Student-side leaderboard UI; friendlier "already submitted" UX (currently bounces with toast).
- P1: Image OCR extraction for uploaded photo test sheets (currently PDF/DOCX/TXT text extraction).
- P2: Test scheduling for future activation (currently activate-now); analytics per batch.
- P2: Validate `kind` with pydantic Literal; split server.py into modules.

## Next Tasks
- Add leaderboard view for students after submitting a test.
- Add per-batch performance analytics for teachers.
