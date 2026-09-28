# Frontend

Static invitation card built with plain HTML, CSS, and Vanilla JavaScript.

- `index.html` — main entry point
- `admin.html` — Wish Studio: password-protected page that renders guests' wishes as
  1080×1920 / 1440×2560 PNG images for stories (not linked from the invitation)
- `assets/css/style.css` — invitation styling
- `assets/css/admin.css` — Wish Studio styling
- `assets/js/config.js` — shared config (`API_URL` = Apps Script `/exec` URL)
- `assets/js/matrix.js` — Matrix rain background
- `assets/js/countdown.js` — graduation countdown
- `assets/js/rsvp.js` — RSVP form and submission
- `assets/js/admin.js` — Wish Studio login and canvas image renderer
- `assets/js/main.js` — initialization and coordination
- `assets/images/` — logos and visual assets

Run by opening `index.html` in a browser (no build step). `admin.html` must be opened
over http(s) (e.g. GitHub Pages) so the PNG export works.
