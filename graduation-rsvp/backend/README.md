# Backend (Google Apps Script + Google Sheet)

`Code.gs` receives RSVP requests from the frontend and writes them to the sheet.
The sheet can stay **private** — the script runs with the owner's permissions.

## Sheet format (first tab, row 1 = header)

| ID | Full Name | Status | Responded At | Wish | Wished At | Ticket | Checked In |
|----|-----------|--------|--------------|------|-----------|--------|------------|

Open registration: anyone with the link can RSVP.

- A **new name** is appended as a new row (ID auto-increments).
- An **existing name** is skipped: nothing is written, the first response is
  kept, and no duplicate row is created. The guest still continues to the
  wish box. Matching ignores accents, letter case, and extra spaces.

`Responded At` is Vietnam time (dd/MM/yyyy HH:mm:ss).

After responding (accept or decline), a guest can send a wish. It is written to
`Wish` / `Wished At` on the guest's row; later wishes for the same name are
appended below the earlier ones (blank line between), and `Wished At` shows the
latest.

When a guest accepts, the page renders their ticket image and uploads it. The
script saves it to the Drive folder **Graduation Tickets** (created on first
use, private to the owner) and puts the file link in `Ticket` (the pass id is
kept as the cell's note). Only `Accepted` guests get a ticket, and only the
first one is kept. Guests who confirmed before this existed get theirs uploaded
the next time they open the card on the same device.

The Drive part needs extra permission: the first deploy after adding it asks
you to authorize Drive access.

## Deploy

1. Open the sheet → **Extensions → Apps Script**.
2. Replace the default code with the contents of `Code.gs` and save.
3. **Deploy → New deployment** → type **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Authorize, then copy the Web app URL (`https://script.google.com/macros/s/.../exec`).
5. Paste it into `API_URL` in `frontend/assets/js/config.js`.
6. Set the sheet's sharing back to **Restricted**.

## Admin password

`frontend/admin.html` (dashboard, QR check-in, Wish Studio) asks for a password, checked
here by the `adminAuth` and `checkin` actions. The password lives only in Apps Script,
never in the repo:

1. Apps Script editor → **Project Settings** (⚙️) → **Script properties** → **Add script property**.
2. Property: `ADMIN_PASSWORD`, Value: your password → **Save**.

Changing the password takes effect immediately (no redeploy needed).

## Check-in

Each confirmed ticket carries a QR code: `HUTGRAD:1:<passId>:<url-encoded name>`.
The admin **Check-in** tab scans it with the phone camera (or the dashboard's
manual button) and the `checkin` action writes the arrival time in `Checked In`
(column H, header added on first use). The guest is found by the pass id stored as
the `Ticket` cell note, else by name; only `Accepted` guests can check in, and the
first check-in time is kept.

After editing `Code.gs` later: **Deploy → Manage deployments → Edit → Version: New version**,
otherwise the URL keeps serving the old code.
