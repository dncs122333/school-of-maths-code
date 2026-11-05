# Open questions and deferred work

Decisions still to make, and work set aside on purpose. Update this when one is settled.

## To discuss with SOM Academy (home page and launch)
The agreed home page design is version 22 of the mockup: `.superpowers/brainstorm/77416-1793870948/content/home-page-a-v22.html` (on this computer only; not in git). The app still shows the old page. The new page can be built with blanks, but must not go live until these are filled in.

**Details to get from the client**
- [ ] Logo and brand colours
- [ ] Phone number and WhatsApp number
- [ ] Area, city, address, map and centre hours
- [ ] Class days and timings
- [ ] Teacher photo, name, subject, qualification and experience
- [ ] Board results (name, score, year, photo), with each family's permission
- [ ] Real quotes from parents and students, with permission
- [ ] Confirm the figures: 40 years, 20,000 students, max 40 per batch
- [ ] Contact email for the Privacy and Terms pages
- [ ] Sign-off on the Privacy Policy and Terms

**Decisions to make with the client**
- [ ] Is there really a test every week? The page promises it.
- [ ] How do parents get the weekly report: a private WhatsApp link (suggested) or their own login? Parents can't see reports in the app today.
- [ ] How do teachers act on weak topics? The page says "Teaching follows the gaps".
- [ ] Which name everywhere: "free trial" (suggested) or "free demo class"?
- [ ] Where do booking requests go: an admin list plus an email (suggested)?
- [ ] Permission to use a real student's report instead of the "Sample" one, or keep the sample
- [ ] Which optional ideas to add: free maths check-up, Google reviews, a section for students, ready-written WhatsApp message, local Google search, Hindi

**Work that follows**
- [ ] Watch `test_class_tests::test_per_student_order_still_grades_correctly`: it failed once in a full run (5 Nov 2026), then passed 40+ repeat runs. The cause is unknown and it checks class-test scoring, so capture the error if it happens again.
- [ ] Add Class 11–12 maths to the syllabus; the app only covers Class 9–10 today
- [ ] Sales site for other centres' owners, on its own web address, after SOM Academy is live. The old front page's text can be its starting point.

## Accounts
- **Phone (OTP) login** — skipped for now (Nov 2026; password reset by email is built). SMS needs a provider such as MSG91 or Twilio, plus cost.
- **Change own password / edit profile** — not built yet.
- **Session length** — tokens last 7 days with no refresh; phone users get logged out weekly. Decide on refresh tokens before the store app.

## Phone app
- **PWA now, store later** (decided, installable: manifest, icons, favicon, safe areas, link previews).
- **Capacitor (Play Store / App Store)** — later. Done already: no full-page reloads on sign-out, no `window.confirm`. Still needed then: set `REACT_APP_BACKEND_URL` to the absolute API address and allow the app origin in CORS; move the token from localStorage to secure storage.
- **Landing page** — consider a separate static site for speed and search engines.

## Teachers
- **Teacher sign-up needs admin approval** (decided, built). Open: should teachers be scoped to one coaching centre, or is this a multi-centre platform?

## UI/UX audit items not yet done
- Diagram upload UI for teachers (questions accept an `image_url` https link via import today).
- Remaining small tap targets and text under 12px across older screens; `aria-label`s on the remaining icon-only buttons.
- Offline support (service worker). Left out on purpose: a caching worker can serve stale app versions after a deploy; add it with an update prompt when needed.
- Link previews use a relative image path; once the site's domain is known, make `og:image` an absolute URL.
- Very long lists (teachers' test library, admin's batch list) have no paging yet.
- A timed practice test whose personal timer already ran out (student opened it earlier) still shows under "To do", then auto-submits as soon as it's opened. Show it as "Time's up" instead.
- Batch detail (student fee rows) not yet checked on a phone after the wrap fix.
- Two backend tests fail on subject capitalisation in question import (`test_questions_json` test_01/test_04); unrelated to UI work, still to fix.

## Repository hygiene
- **Old uploads in git history** — `backend/local_storage/` is no longer tracked (Nov 2026; files stay on disk), but the 12 files remain in past commits. Consider purging them from history if they contain personal data, before the repo is shared with anyone new.
- Unused shadcn UI components and the npm packages only they use (~33 files, ~35 packages) were kept on purpose (Nov 2026); remove when sure they won't be used.
- Old `db.notes` (151 records), `test_submissions` and `topic_mastery` collections are no longer used by any code; data kept on purpose.

## Earlier pending items
- Academic year rollover for batches and fee schedules.
- Scoring with marks and negative marks (fields exist; scoring ignores them).
- Topper ranking rules.
- Splitting the long `chore/remove-emergent` branch into separate PRs.
- "morning maths class 9" data fix.
- Restore UI and fee-history UI for archived batches/students.
- Batch feature re-audit (started, interrupted by the UI/UX audit).
- Tab-switch flag policy on phones (now ignores switches under 3 s; confirm this is fair).
