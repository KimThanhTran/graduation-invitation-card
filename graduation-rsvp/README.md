# Graduation RSVP

Personal digital graduation invitation card with RSVP.

- **University:** HUTECH University — Faculty of Information Technology
- **Event:** Graduation ceremony
- **Date:** November 8, 2026 — guests welcomed 10:30 AM – 12:00 PM
- **Location:** Thu Duc Campus

## Structure

- `frontend/` — static invitation card (HTML, CSS, Vanilla JS)
- `backend/` — Google Apps Script that stores RSVPs (no duplicate names) in a private Google Sheet

The root `index.html` (one level up) redirects to `frontend/index.html`.

## Preview locally (before pushing)

Pushing to `main` publishes the live site on GitHub Pages, so check changes on localhost first:

```bash
node graduation-rsvp/dev-server.js
```

Run it from the repo root (no install needed), then open:

- Invitation: http://localhost:5500/graduation-rsvp/frontend/index.html
- Admin: http://localhost:5500/graduation-rsvp/frontend/admin.html
- Post-ceremony page: add `?mode=after` to the invitation URL

The local page still uses the real Apps Script backend, so an RSVP sent from localhost is
saved to the real sheet.
