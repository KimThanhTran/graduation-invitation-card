# Frontend

Static invitation card built with plain HTML, CSS, and Vanilla JavaScript.

- `index.html` — main entry point
- `admin.html` — password-protected admin console (not linked from the invitation):
  guest dashboard, QR check-in scanner, and Wish Studio (wish images for stories)
- `assets/css/style.css` — invitation styling
- `assets/css/admin.css` — admin console styling
- `assets/js/config.js` — shared config: `API_URL` (Apps Script `/exec` URL),
  `EVENT_END` (after it the card shows a thank-you page) and `ALBUM_URL` (photo album link)
- `assets/js/matrix.js` — Matrix rain background
- `assets/js/countdown.js` — graduation countdown
- `assets/js/rsvp.js` — RSVP form, ticket (with check-in QR) and wishes
- `assets/js/admin.js` — admin login, dashboard, QR scanner and wish image renderer
- `assets/js/main.js` — initialization and coordination
- `assets/images/` — logos and visual assets

Run by opening `index.html` in a browser (no build step). `admin.html` must be opened
over http(s) (e.g. GitHub Pages) so the PNG export and the camera work.

Preview the post-ceremony page anytime with `index.html?mode=after`.

External scripts (jsDelivr): `qrcode-generator` draws the ticket QR; `jsQR` is loaded
only by the scanner on browsers without the native `BarcodeDetector` (e.g. iPhone).
