/**
 * Code.gs — Google Apps Script backend for the Graduation RSVP card.
 *
 * Sheet columns (row 1 = header):
 *   A: ID | B: Full Name | C: Status | D: Responded At
 *
 * Open registration: any name can RSVP.
 * - New name      -> append a new row
 * - Existing name -> update that row's status (no duplicate rows)
 *
 * Deploy as Web app: Execute as "Me", Who has access "Anyone".
 * The sheet itself can stay private (Restricted).
 */

// Remove accents, lowercase, collapse spaces: "Nguyễn  Văn A" == "nguyen van a"
function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .trim().replace(/\s+/g, ' ').toLowerCase();
}

// Trim, collapse spaces, limit length
function cleanName(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').slice(0, 100);
}

// Prevent a name like "=HYPERLINK(...)" from being stored as a formula
function safeCell(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function findGuestRow(sheet, name) {
  const target = normalize(name);
  if (!target || sheet.getLastRow() < 2) return -1;

  const names = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < names.length; i++) {
    if (normalize(names[i][0]) === target) return i + 2; // actual sheet row
  }
  return -1;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const name = cleanName(data.name);

    if (name.length < 2) return json({ error: 'Invalid name' });
    if (!['Accepted', 'Declined'].includes(data.status)) return json({ error: 'Invalid status' });

    // Lock covers lookup + write so two guests submitting the same name can't create duplicates
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
      const row = findGuestRow(sheet, name);
      // Leading apostrophe keeps it as text so Sheets doesn't reparse dd/MM as MM/dd
      const now = "'" + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');

      if (row === -1) {
        const newRow = sheet.getLastRow() + 1;
        sheet.getRange(newRow, 1, 1, 4).setValues([[newRow - 1, safeCell(name), data.status, now]]);
        return json({ saved: true, isNew: true, name: name });
      }

      sheet.getRange(row, 3, 1, 2).setValues([[data.status, now]]);
      return json({ saved: true, isNew: false, name: sheet.getRange(row, 2).getValue() });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ error: String(err) });
  }
}
