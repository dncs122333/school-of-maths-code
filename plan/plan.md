# Atlas-Only Data Source Guardrails

The application will use MongoDB Atlas as its only allowed data source and will make that status visible without revealing any connection details.
Unexpected Learning Queue notes will be inspectable as records, so their presence can be investigated without silently deleting potentially important data.

## Who it's for

- Administrators responsible for the School of Maths data, including Dhruv
- Teachers and students who need a clear, honest message if the database is unavailable

## Core features and experience

- An Atlas-only connection rule: the application will not silently read from or fall back to a local database.
- A restricted administrator data-source status view that clearly reports either **Atlas connected** or **Database unavailable**. It will never show credentials, connection strings, or private infrastructure details.
- A Learning Queue inspection view for administrators showing the current queued notes and their useful audit details, such as title, owner, and creation/update timing, to identify why unexpected items are present.
- A clear outage state across affected screens: **“Database unavailable. Contact Dhruv immediately.”** Normal content will not be shown as if it were current when the database cannot be reached.
- A durable, visible administrator incident notice for database outages so the instruction to contact Dhruv is not missed.

## User flow

1. An administrator signs in and opens the data-source status area.
2. When Atlas is available, the page confirms Atlas as the active source and lists the Learning Queue records currently being served.
3. The administrator can inspect unexpected notes to compare ownership and timing before deciding whether any content should be removed separately.
4. If Atlas is unavailable, the application stops serving database-backed content, shows the database-unavailable message, and displays the high-priority contact-Dhruv notice.
5. Teachers and students continue using normal content flows only while Atlas is confirmed available; otherwise they receive the same clear availability message.

## UI/UX feel

- Operational and unambiguous rather than decorative.
- A compact status signal with clear success and error states, supported by plain-language explanation.
- The queue inspection view is readable and evidence-focused, with important ownership and timing information easy to scan.
- Outage messaging is prominent, calm, and specific about what users should do next.

## Implementation phases

### Phase 1 — MVP: Atlas source-of-truth protection

- Enforce Atlas-only runtime behavior with no local database fallback.
- Add the restricted data-source status and Learning Queue inspection experience.
- Show a persistent database-unavailable message and administrator incident notice when Atlas cannot be reached.
- Preserve existing notes during investigation; this phase does not delete, move, or rewrite any Learning Queue data.

### Phase 2 — Record provenance and investigation history

- Add a fuller per-note provenance trail that records how and when a queue item was created or changed.
- Add filtered investigation views for unexpected records and documented administrator resolution notes.

### Phase 3 — External incident escalation

- Send outage notifications to Dhruv through an explicitly approved communication channel.
- Add escalation acknowledgement and recovery notifications so administrators can see that an incident was received and resolved.

## Assumptions

- MongoDB Atlas is the required and only production data source; local MongoDB must never be used as an automatic fallback.
- The unexpected Learning Queue notes may be historical, imported, or seeded records; they will be exposed for investigation rather than deleted automatically.
- Only administrators should see database-source diagnostics and queue investigation details.
- No confirmed email address, phone number, or messaging channel for Dhruv has been supplied. Phase 1 therefore provides an immediate in-app incident notice instructing contact with Dhruv; automated outreach is reserved for Phase 3 once a channel is approved.
- Database unavailability should block database-backed views and state the problem plainly rather than returning stale-looking content.