# Backend (Google Apps Script + Google Sheet)

`Code.gs` receives RSVP requests from the frontend, checks the guest name against
the sheet, and writes the response. The sheet can stay **private** — the script
runs with the owner's permissions.

## Sheet format (first tab, row 1 = header)

| ID | Full Name | Email | Status | Responded At |
|----|-----------|-------|--------|--------------|

Fill in `Full Name` for every invited guest. `Status` (`Accepted` / `Declined`)
and `Responded At` are written by the script. Name matching ignores
accents, letter case, and extra spaces.

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
