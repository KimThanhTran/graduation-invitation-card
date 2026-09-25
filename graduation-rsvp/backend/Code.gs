/**
 * Code.gs — Google Apps Script backend for the Graduation RSVP card.
 *
 * Sheet columns (row 1 = header):
 *   A: ID | B: Full Name | C: Phone | D: Status | E: Responded At
 *
 * Open registration: anyone can RSVP with name + phone number.
 * The phone number identifies a guest:
 * - New phone      -> append a new row
 * - Existing phone -> update that row's name/status (no duplicate rows)
 *
 * Deploy as Web app: Execute as "Me", Who has access "Anyone".
 * The sheet itself can stay private (Restricted).
 */

// Trim, collapse spaces, limit length
function cleanName(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').slice(0, 100);
}

// Vietnamese mobile number -> "0xxxxxxxxx", or null if invalid. Accepts +84 / 84 prefixes.
function normalizePhone(s) {
  let p = String(s || '').replace(/[\s.\-()]/g, '');
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  else if (p.startsWith('84') && p.length === 11) p = '0' + p.slice(2);
  return /^0\d{9}$/.test(p) ? p : null;
}

// Prevent a name like "=HYPERLINK(...)" from being stored as a formula
function safeCell(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function findGuestRowByPhone(sheet, phone) {
  if (sheet.getLastRow() < 2) return -1;

  const phones = sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < phones.length; i++) {
    if (normalizePhone(phones[i][0]) === phone) return i + 2; // actual sheet row
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
    const phone = normalizePhone(data.phone);

    if (name.length < 2) return json({ error: 'Invalid name' });
    if (!phone) return json({ error: 'Invalid phone' });
    if (!['Accepted', 'Declined'].includes(data.status)) return json({ error: 'Invalid status' });

    // Lock covers lookup + write so two submissions with the same phone can't create duplicates
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
      const row = findGuestRowByPhone(sheet, phone);
      // Leading apostrophes keep values as text: phone keeps its leading 0,
      // and Sheets doesn't reparse dd/MM as MM/dd
      const now = "'" + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
      const values = [safeCell(name), "'" + phone, data.status, now];

      if (row === -1) {
        const newRow = sheet.getLastRow() + 1;
        sheet.getRange(newRow, 1, 1, 5).setValues([[newRow - 1].concat(values)]);
        return json({ saved: true, isNew: true, name: name });
      }

      sheet.getRange(row, 2, 1, 4).setValues([values]);
      return json({ saved: true, isNew: false, name: name });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ error: String(err) });
  }
}
