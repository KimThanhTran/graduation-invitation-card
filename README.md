# Graduation Invitation Card

A personal digital graduation invitation for the HUTECH University Faculty of Information Technology ceremony, with a live countdown, an RSVP form with wishes and a ticket QR, and an admin console for check-in, all backed by a private Google Sheet.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Google Apps Script](https://img.shields.io/badge/Google_Apps_Script-4285F4?logo=google&logoColor=white)
![Google Sheets](https://img.shields.io/badge/Google_Sheets-34A853?logo=googlesheets&logoColor=white)

**Event:** Graduation ceremony, November 8, 2026, HUTECH Thu Duc Campus (guests welcomed at 10:30, UTC+7).

The page text is mostly Vietnamese with English headings, in a futuristic "cyber HUD" style.

## Features

**Invitation page**
- Responsive single-page invitation card with event date, time and location, plus a Google Maps link
- Countdown to guest arrival, with a thank-you page (and optional photo-album link) after the event; preview it with `?mode=after`
- Matrix-style "rain" canvas background and a 3D tilt effect on the photo card, respecting `prefers-reduced-motion`
- Rich link previews (Open Graph / Twitter cards) for Zalo, Messenger and Facebook
- "Add to calendar" button (prefilled Google Calendar event) and a share button
- Optional synthesized sound effects (Web Audio API, off by default) and background music

**RSVP, wishes and ticket**
- Enter your name, then accept or decline; responses are stored in Google Sheets through an Apps Script web app
- Duplicate names are not added twice (matching ignores accents, case and extra spaces)
- After responding, a guest can leave a wish for the graduate
- Accepting generates a ticket image with a check-in QR code and a confetti effect; the ticket is saved to a private Drive folder
- The response is remembered in the browser (`localStorage`)

**Admin console (`admin.html`, password-protected)**
- Guest dashboard with status, wishes and check-in times
- QR check-in scanner (native `BarcodeDetector`, with a `jsQR` fallback for iPhone) and undo check-in
- Wish Studio: renders wish images for social stories as PNG

**Backend hardening**
- Name length limit, status whitelist, spreadsheet formula-injection protection, script lock against duplicate rows from simultaneous submissions
- The admin password is stored only in Apps Script properties, never in the repository; failed attempts are slowed down and logged as events

## Tech stack

- **Frontend:** plain HTML, CSS and vanilla JavaScript, with no build step (Google Fonts, `qrcode-generator` and `jsQR` loaded from a CDN)
- **Backend:** Google Apps Script web app (`Code.gs`) bound to a Google Sheet, with Google Drive for ticket images

## Project structure

```
.
├── index.html                      # Redirects to graduation-rsvp/frontend/index.html
└── graduation-rsvp/
    ├── frontend/
    │   ├── index.html              # The invitation page
    │   ├── admin.html              # Admin console (dashboard, QR check-in, Wish Studio)
    │   └── assets/
    │       ├── css/                # style.css (invitation), admin.css (admin console)
    │       ├── images/             # Hero photo and social preview image
    │       ├── audio/              # Background music
    │       └── js/
    │           ├── config.js       # API_URL, EVENT_END, ALBUM_URL
    │           ├── main.js         # Initialization, sound FX, share, tilt effect
    │           ├── countdown.js    # Countdown to guest arrival
    │           ├── matrix.js       # Background canvas animation
    │           ├── rsvp.js         # RSVP flow, ticket with QR, wishes
    │           └── admin.js        # Admin login, dashboard, scanner, wish renderer
    └── backend/
        ├── Code.gs                 # Apps Script: RSVPs, wishes, tickets, check-in
        └── README.md               # Backend deployment steps
```

## Getting started

### Run the frontend locally

No install is needed. Clone the repo and open `index.html` (or `graduation-rsvp/frontend/index.html`) in a browser, or serve the folder:

```bash
git clone https://github.com/KimThanhTran/graduation-invitation-card.git
cd graduation-invitation-card
python -m http.server 8000     # then open http://localhost:8000
```

### Set up your own RSVP backend

Full steps are in [`graduation-rsvp/backend/README.md`](graduation-rsvp/backend/README.md). In short:

1. Create a Google Sheet with this header in row 1 of the first tab:

   | ID | Full Name | Status | Responded At | Wish | Wished At | Ticket | Updated At | Checked In |
   | --- | --- | --- | --- | --- | --- | --- | --- | --- |

2. Open **Extensions > Apps Script**, replace the default code with `graduation-rsvp/backend/Code.gs`, and save.
3. Set the Script property `ADMIN_PASSWORD` (Project Settings > Script properties) to protect the admin console.
4. Choose **Deploy > New deployment > Web app** with **Execute as: Me** and **Who has access: Anyone**, and authorize the script (including Drive access for tickets).
5. Copy the web app URL (it ends in `/exec`) into `API_URL` in `graduation-rsvp/frontend/assets/js/config.js`.
6. The sheet itself can stay private, because the script runs with the owner's permissions.

After editing `Code.gs`, publish a new version under **Deploy > Manage deployments**, otherwise the old code keeps being served.

Open `admin.html` over http(s) (for example GitHub Pages) so the camera and PNG export work.

### Customize the invitation

Event details are in `graduation-rsvp/frontend/index.html`. The countdown target is `TARGET_DATE` in `countdown.js`, the end-of-event switch is `EVENT_END` in `config.js`, and the calendar event details are in `exportCalendarEvent()` in `rsvp.js`. Replace `assets/images/image.png` and `og-image.jpg` with your own photos.

## How the RSVP request works

The frontend sends `POST` with a JSON body (for example `{ action: "rsvp", name, status }`, where `status` is `Accepted` or `Declined`) and no `Content-Type` header, which keeps it a "simple" request and avoids a CORS preflight to Apps Script. Other actions cover wishes, ticket upload and the admin calls (`adminAuth`, `checkin`, `uncheckin`). Responded-at timestamps are stored in Vietnam time (`dd/MM/yyyy HH:mm:ss`).

## Deployment

The site is static, so any static host can serve it. The repository does not configure a specific hosting service.

## License

No license file is included in this repository.
