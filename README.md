# Graduation Invitation Card

A personal digital graduation invitation for the HUTECH University Faculty of Information Technology ceremony, with a live countdown and an RSVP form that records responses in a private Google Sheet.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Google Apps Script](https://img.shields.io/badge/Google_Apps_Script-4285F4?logo=google&logoColor=white)
![Google Sheets](https://img.shields.io/badge/Google_Sheets-34A853?logo=googlesheets&logoColor=white)

**Event:** Graduation ceremony, November 1, 2026, 08:00 (UTC+7), HUTECH Thu Duc Campus (guests welcomed from 07:30).

The page text is mostly Vietnamese with English headings, in a futuristic "cyber HUD" style.

## Features

- Responsive single-page invitation card with event date, time and location, plus a Google Maps link
- Countdown to the ceremony, with "live" and "completed" states once the date passes
- Animated emoji "rain" canvas background
- RSVP flow: enter your name, then accept or decline
  - Responses are sent to a Google Apps Script web app and stored in Google Sheets
  - Duplicate names are not added twice; a returning guest only updates their status (matching ignores accents, case and extra spaces)
  - Accepting shows a confirmation ticket with a generated pass code and a confetti effect
  - The response is remembered in the browser (`localStorage`), and guests can change it later
- "Add to calendar" button that opens a prefilled Google Calendar event
- Share button (native share sheet on mobile, otherwise copies the link)
- Optional synthesized sound effects (Web Audio API, off by default, no audio files)
- 3D tilt effect on the photo card, respecting `prefers-reduced-motion`
- Backend input hardening: name length limit, status whitelist, protection against spreadsheet formula injection, and a script lock to avoid duplicate rows from simultaneous submissions

## Tech stack

- **Frontend:** plain HTML, CSS and vanilla JavaScript, with no build step or dependencies (Google Fonts only)
- **Backend:** Google Apps Script web app (`Code.gs`) bound to a Google Sheet

## Project structure

```
.
├── index.html                      # Redirects to graduation-rsvp/frontend/index.html
└── graduation-rsvp/
    ├── frontend/
    │   ├── index.html              # The invitation page
    │   └── assets/
    │       ├── css/style.css       # All styling
    │       ├── images/image.png    # Hero photo / social preview image
    │       └── js/
    │           ├── main.js         # Initialization, sound FX, share, tilt effect
    │           ├── countdown.js    # Countdown to the ceremony
    │           ├── matrix.js       # Background canvas animation
    │           └── rsvp.js         # RSVP state machine and API call
    └── backend/
        ├── Code.gs                 # Apps Script: receives RSVPs, writes to the sheet
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

The RSVP form posts to the URL stored in `API_URL` at the top of `graduation-rsvp/frontend/assets/js/rsvp.js`. To collect responses in your own sheet:

1. Create a Google Sheet. In the first tab, put this header in row 1:

   | ID | Full Name | Status | Responded At |
   | --- | --- | --- | --- |

2. Open **Extensions > Apps Script**, replace the default code with `graduation-rsvp/backend/Code.gs`, and save.
3. Choose **Deploy > New deployment > Web app** with **Execute as: Me** and **Who has access: Anyone**. Authorize the script.
4. Copy the web app URL (it ends in `/exec`) and set it as `API_URL` in `rsvp.js`:

   ```js
   const API_URL = 'https://script.google.com/macros/s/<your-deployment-id>/exec';
   ```

5. The sheet itself can stay private (sharing set to Restricted), because the script runs with the owner's permissions.

After editing `Code.gs`, publish a new version under **Deploy > Manage deployments**, otherwise the old code keeps being served.

### Customize the invitation

Event details are in `graduation-rsvp/frontend/index.html`. The countdown target is `TARGET_DATE` in `countdown.js`, and the calendar event details are in `exportCalendarEvent()` in `rsvp.js`. Replace `assets/images/image.png` with your own photo.

## How the RSVP request works

The frontend sends `POST` with a JSON body (`{ action: "rsvp", name, status }`, where `status` is `Accepted` or `Declined`) and no `Content-Type` header, which keeps it a "simple" request and avoids a CORS preflight to Apps Script. The script replies with `{ saved: true, isNew, name }` or `{ error }`. Responded-at timestamps are stored in Vietnam time (`dd/MM/yyyy HH:mm:ss`).

## Deployment

The site is static, so any static host can serve it. The repository does not configure a specific hosting service.

## License

No license file is included in this repository.
