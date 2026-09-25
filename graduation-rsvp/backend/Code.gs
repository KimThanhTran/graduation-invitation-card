/**
 * Code.gs — Google Apps Script backend for the Graduation RSVP card.
 *
 * Sheet columns (row 1 = header):
 *   A: ID | B: Full Name | C: Status | D: Responded At | E: Wish | F: Wished At
 *
 * Open registration: any name can RSVP.
 * - New name      -> append a new row
 * - Existing name -> update that row's status (no duplicate rows)
 *
 * Actions (POST body JSON):
 * - { action: 'rsvp', name, status: 'Accepted' | 'Declined' }
 * - { action: 'wish', name, message }  -> saves a wish on an existing guest's row
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

// Trim and limit wish length (keeps line breaks)
function cleanWish(s) {
  return String(s || '').trim().slice(0, 500);
}

function nowText() {
  // Leading apostrophe keeps it as text so Sheets doesn't reparse dd/MM as MM/dd
  return "'" + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
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

    if (data.action === 'wish') return saveWish(name, cleanWish(data.message));

    if (!['Accepted', 'Declined'].includes(data.status)) return json({ error: 'Invalid status' });

    // Lock covers lookup + write so two guests submitting the same name can't create duplicates
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
      const row = findGuestRow(sheet, name);
      const now = nowText();

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

// Wishes are only accepted from guests who already responded (row must exist)
function saveWish(name, message) {
  if (!message) return json({ error: 'Empty wish' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const row = findGuestRow(sheet, name);
    if (row === -1) return json({ error: 'Guest not found' });

    sheet.getRange(row, 5, 1, 2).setValues([[safeCell(message), nowText()]]);
    return json({ saved: true });
  } finally {
    lock.releaseLock();
  }
}
