# Backend (Google Apps Script + Google Sheet)

`Code.gs` receives RSVP requests from the frontend and writes them to the sheet.
The sheet can stay **private** — the script runs with the owner's permissions.

## Sheet format (first tab, row 1 = header)

| ID | Full Name | Status | Responded At | Wish | Wished At |
|----|-----------|--------|--------------|------|-----------|

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

## Deploy

1. Open the sheet → **Extensions → Apps Script**.
2. Replace the default code with the contents of `Code.gs` and save.
3. **Deploy → New deployment** → type **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Authorize, then copy the Web app URL (`https://script.google.com/macros/s/.../exec`).
5. Paste it into `API_URL` at the top of `frontend/assets/js/rsvp.js`.
6. Set the sheet's sharing back to **Restricted**.

After editing `Code.gs` later: **Deploy → Manage deployments → Edit → Version: New version**,
otherwise the URL keeps serving the old code.
