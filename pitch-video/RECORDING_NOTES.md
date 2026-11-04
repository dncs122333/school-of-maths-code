- s04: console errors: Access to XMLHttpRequest at 'http://localhost:8011/api/resources/493e84e7-0398-47ae-88fa-99f2f75e6dfb/file' from origin 'http://localhost:3011' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource. | Failed to load resource: net::ERR_FAILED
- s05p: failed – locator.click: Timeout 30000ms exceeded.
- s06: failed – locator.scrollIntoViewIfNeeded: Timeout 30000ms exceeded.
- s07: 2 loading indicator(s) visible
# Recording notes (for the School of Maths team)

Things found while filming the demo. Nothing here was changed in the app.

- **Bug: notes with "–" (en dash) or other non-Latin characters in the file name can't be opened.**
  `GET /api/resources/{id}/file` returns 500: `server.py` `download_resource` puts the file name straight into the
  `Content-Disposition` header, which only allows Latin-1. Fix: send an ASCII fallback plus `filename*=UTF-8''…`.
  The demo uses plain-hyphen file names to avoid it.
- **Fee status shows "Partial Paid" for students who are fully up to date**, because the schedule runs to March and
  months not yet due count as unpaid. Might be worth a "Paid to date" status.
- s05p: failed – locator.click: Timeout 30000ms exceeded.
- **Phone test screen: the "Next" button is covered by the question navigator** at 390 px width (Playwright reports
  `nav[aria-label="Questions"]` intercepting the click), and the timer badge is cut off at the right edge.
- s04: console errors: Access to XMLHttpRequest at 'http://localhost:8011/api/resources/493e84e7-0398-47ae-88fa-99f2f75e6dfb/file' from origin 'http://localhost:3011' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource. | Failed to load resource: net::ERR_FAILED
- s05p: failed – locator.scrollIntoViewIfNeeded: Timeout 30000ms exceeded.
