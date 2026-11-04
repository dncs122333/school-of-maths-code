# School of Maths — Pitch Video Design

Date: 2026-11-05
Status: draft, awaiting approval

## Intent

A ~2-minute demo video pitching this app to the **owner of School of Maths**, the coaching centre (CBSE Classes 9–10 maths)
it was built for. The message is "here's what we built for your centre", not a generic product ad. The owner wants one platform to share notes, run tests, see results and reports, find each student's weak topics,
and track fees. The video shows all of that, but the **weak-topic analyser** is the hero: the viewer should
*watch a student improve before their eyes*.

Success: the School of Maths owner finishes the video thinking "this replaces my WhatsApp groups, paper tests and
fee register, and it actually makes my students better — let's roll it out."

## Goals

- Show every major feature, briefly, as real screens from the real app.
- Give the weak-topic analyser the most time (~40–50s) and end the story on a student going Weak → Strong.
- Work on mute (burned-in captions) and with sound (AI voiceover + music).

## Non-goals

- No call to action yet. The last frame is the School of Maths name/logo only. A CTA may be added later.
- No vertical/WhatsApp cut in this round (can be cut later from the same footage).
- No Hindi/Hinglish version this round.

## Anti-goals (failure even if it "works")

- Faked numbers. Every score, band and heatmap colour on screen must be what the real app computes from the demo data.
- Showing real students' names, emails or fee data. Demo data only.
- Feeling like a slow software tour. Montage shots stay short; only the climax lingers.
- Looking cluttered or broken: no console errors, loading spinners, empty states or dev-tool chrome in shots.

## Decided

| Decision | Value | Whose call |
|---|---|---|
| Audience | The owner of School of Maths, the centre the app was built for | User |
| Brand name | School of Maths | User |
| Voiceover | English, AI-generated voice | User |
| Hero feature | Weak-topic analyser, student visibly improving | User |
| Ending | Name/logo only, no CTA | User |
| Length | ~2:00 (target 1:50–2:15) | Claude |
| Aspect | 16:9, 1920×1080; student scenes shown inside a phone frame | Claude |
| Captions | Burned in | Claude |
| Music | Calm, confident, royalty-free, ducked under voice | Claude |
| Production | Claude drives the app with scripted browser automation, records, edits; user reviews drafts | Claude |

## How the app actually behaves (constraints the story must respect)

- **Mastery counts class tests only.** Practice tests/DPP and diagnostics weigh 0 in mastery
  (`backend/lib/mastery.py`, `MASTERY_SOURCE_WEIGHTS`); practice shows up as a separate "practice accuracy".
  So the honest improvement story is: **weak in class test → practises weak topic (practice accuracy climbs)
  → scores well in the next class test → mastery band moves Weak → Developing → Strong.**
- Mastery = recency-decayed (0.9^(days/7)), difficulty-weighted (easy 1 / medium 1.5 / hard 2) accuracy.
  Bands: <55 weak, 55–75 developing, >75 strong. The demo data must be designed so the hero's topic crosses
  both thresholds across ~3 class tests.
- Database is MongoDB Atlas only (AGENTS.md). Demo data goes into a **separate database name on the same
  Atlas cluster** (e.g. `DB_NAME=som_demo`), never the real database.
- Fees: per-student fee status and fee history per batch exist (`BatchFeeStatusTab`).

## Demo data (to be seeded into the demo DB)

- School of Maths with 2 batches, e.g. "Class 10 – Evening" (hero batch, ~25 students) and "Class 9 – Morning".
- Believable Indian student names, fake emails (e.g. `@demo.schoolofmaths`), no real people.
- Hero student (e.g. "Aarav Sharma"): weak in **Quadratic Equations** (~35%) after test 1; practice accuracy
  rises over 3 DPPs; class tests 2 and 3 lift mastery into Developing then Strong (target ~75–80%).
- Class-wide: Quadratics is the class's #1 weak topic at the start, so the heatmap shows a red column; a few
  classmates also improve so the column visibly warms.
- Fee records: mostly paid, a few pending/overdue so the fee tab looks real.
- Notes/materials for 2–3 chapters, a question bank, a scheduled class test, released results, a make-up test.
- To show "before" and "after" states, the seed script can be run in stages (after test 1 / after test 2 /
  after test 3), recording the same screen at each stage. That's how "before your eyes" is real, not faked.

## Story and voiceover script (~290 words ≈ 2:00 at a calm pace)

| # | Time | On screen | Voiceover |
|---|---|---|---|
| 1 | 0:00–0:10 | Hook: quick cut of a messy WhatsApp group, a stack of paper tests, a fee register (stylised stills/graphics, not real chats) | "Right now, running School of Maths means notes on WhatsApp, tests on paper, fees in a register… and no real idea which student is stuck where." |
| 2 | 0:10–0:15 | School of Maths logo/title | "So we built School of Maths its own app — everything in one place." |
| 3 | 0:15–0:25 | Owner approves a teacher; creates a batch; join code; approves student join requests | "Set up your batches in minutes. Students join with a code, and you approve who gets in." |
| 4 | 0:25–0:35 | Materials page; AI notes with diagrams; phone frame showing notes with the student's name watermark | "Share notes and study material instantly. Every page is watermarked with the student's name, so your notes stay yours." |
| 5 | 0:35–0:47 | Question bank import; create class test (schedule, mix of difficulty); phone frame: student taking timed test | "Build tests from your question bank in a few clicks — class tests, practice tests, daily practice. Students take them on their phones." |
| 6 | 0:47–0:55 | Results release, test leaderboard, PDF report download | "Results and reports are ready the moment the test ends." |
| 7 | 0:55–1:02 | Fee status tab: paid / pending | "And fees? Tracked right alongside." |
| 8 | 1:02–1:15 | **Climax begins.** Class heatmap, red Quadratics column; weak-topic leaderboard with Quadratics at #1 | "But here's what really matters. School of Maths finds every weak topic — for the whole class, and for every student." |
| 9 | 1:15–1:25 | Zoom into Aarav's report and mastery map: Quadratics **Weak, ~35%** | "Aarav is struggling with quadratic equations. Thirty-five percent." |
| 10 | 1:25–1:35 | Phone frame: "Focus Today" recommends Quadratics; Aarav does practice; practice accuracy climbs | "So the app tells him exactly what to practise — every day." |
| 11 | 1:35–1:50 | Mastery map/ring animates Weak → Developing → Strong across class tests 2 and 3; heatmap cell red → amber → green; caption "35% → 78%" | "Two class tests later… thirty-five becomes seventy-eight. Weak becomes strong. You watch it happen." |
| 12 | 1:50–2:00 | Class weak-topic list shrinks; term report shows improvement | "Your whole class, getting better — and you can see exactly how." |
| 13 | 2:00–2:05 | End card: School of Maths name/logo | "School of Maths." |

Exact numbers in captions/VO (35%, 78%) are placeholders until the demo data is seeded; the script uses
whatever the app really shows.

## Production pipeline (Claude's calls, builder may refine)

1. **Demo environment:** run backend/frontend locally against `DB_NAME=som_demo` on Atlas; seed script in
   `backend/scripts/` (staged as above). Never touch the real DB.
2. **Recording:** scripted browser automation at 1920×1080 (desktop scenes) and a phone viewport (student
   scenes), recording each shot separately so retakes are cheap. Hide cursor or use a smooth one; no dev chrome.
3. **Voiceover:** AI TTS (Gemini TTS using the existing `GEMINI_API_KEY`, or another provider if quality is
   poor), one clip per scene so timing can be adjusted.
4. **Edit:** ffmpeg (needs installing via Homebrew) or a code-based editor; phone frame overlay, gentle zooms
   on key numbers, burned-in captions, music ducked under VO, crossfades.
5. **Review loop:** user approves (a) this doc + script, (b) a rough cut, (c) the final cut.

Output: `pitch-video/` folder (gitignored for large media) with `school-of-maths-pitch.mp4` plus per-scene
source clips, VO audio and the captions file.

## Calls made after the builder check (Claude's calls)

- **Weak → Strong transition:** recorded as real screens at each seeded stage (after class test 1, 2, 3) and
  joined in the edit with a smooth transition and an animated number counter. Every stage shown is the app's
  real output, so this is not "faked". No new animation code in the app.
- **App code:** no feature work for the video. If recording turns up a bug, spinner or rough screen, Claude
  lists it for the user rather than silently changing the product. Exception: branding, pending the user's answer.
- **End card logo:** `frontend/public/logo512.png` (yellow set-square icon) + "School of Maths" wordmark, pending the user's OK.
- **TTS fallback:** Gemini TTS first. If it sounds poor, Claude stops and asks the user before using any other
  provider, account or paid service.
- **Where it's shown:** not yet known; defaults to a file that works for a meeting laptop, YouTube and a
  WhatsApp forward (1080p H.264, < 50 MB, loudness ~-14 LUFS, captions large enough to read on a phone).
- **Script lock:** demo data is built only after the user approves this doc and script.

## Left to the builder

- Exact automation tooling (Playwright vs Chrome DevTools screencast), editing approach, TTS voice choice
  within "warm, clear, professional English".
- Music track choice (royalty-free only).
- Hook visuals (scene 1) style, as long as they're generic, not screenshots of real chats.
- Fine timing and transitions, within the ~2:00 target.
