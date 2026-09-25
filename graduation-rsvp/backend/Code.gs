/**
 * Code.gs — Google Apps Script backend for the Graduation RSVP card.
 *
 * Sheet columns (row 1 = header):
 *   A: ID | B: Full Name | C: Email | D: Status | E: Responded At
 *
 * Deploy as Web app: Execute as "Me", Who has access "Anyone".
 * The sheet itself can stay private (Restricted).
 */

// Remove accents, lowercase, collapse spaces: "Nguyễn  Văn A" == "nguyen van a"
function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .trim().replace(/\s+/g, ' ').toLowerCase();
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
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const row = findGuestRow(sheet, data.name);

    if (row === -1) return json({ found: false });

    const fullName = sheet.getRange(row, 2).getValue();

    if (data.action === 'lookup') {
      return json({ found: true, name: fullName, status: sheet.getRange(row, 4).getValue() });
    }

    if (data.action === 'rsvp' && ['Accepted', 'Declined'].includes(data.status)) {
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        sheet.getRange(row, 4, 1, 2).setValues([[data.status, new Date()]]);
      } finally {
        lock.releaseLock();
      }
      return json({ found: true, name: fullName, saved: true });
    }

    return json({ error: 'Invalid request' });
  } catch (err) {
    return json({ error: String(err) });
  }
}
