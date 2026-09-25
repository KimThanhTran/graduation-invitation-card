/**
 * Code.gs — Google Apps Script backend for the Graduation RSVP card.
 *
 * Sheet columns (row 1 = header):
 *   A: ID | B: Full Name | C: Status | D: Responded At | E: Wish | F: Wished At | G: Ticket
 *
 * Open registration: any name can RSVP.
 * - New name      -> append a new row
 * - Existing name -> nothing is written (first response is kept), but the guest can still send wishes
 *
 * Actions (POST body JSON):
 * - { action: 'rsvp', name, status: 'Accepted' | 'Declined' }
 * - { action: 'wish', name, message }  -> appends a wish to an existing guest's row
 * - { action: 'ticket', name, passId, image } -> saves the ticket image (JPEG data URL) to Drive
 *   and writes its link in column G. Only for Accepted guests; the first ticket per guest is kept.
 *
 * Tickets go to the Drive folder named TICKET_FOLDER_NAME (created on first use, private to the owner).
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

// Cap for all wishes stacked on one row (a Sheets cell holds up to 50,000 chars)
const MAX_WISHES_LENGTH = 5000;

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
    if (data.action === 'ticket') return saveTicket(name, data.passId, data.image);

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

      // Duplicate name: keep the first response untouched, but let the guest continue (e.g. to send a wish).
      // passId of the ticket already on Drive (if any), so the page shows the same pass.
      const passId = sheet.getRange(row, 7).getNote();
      return json({ saved: true, isNew: false, name: sheet.getRange(row, 2).getValue(), passId: passId || undefined });
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

    // Append to any earlier wish on this row instead of overwriting it
    const previous = String(sheet.getRange(row, 5).getValue() || '');
    // Same wish already at the end = a retried request whose first attempt was saved
    if (previous === message || previous.endsWith('\n\n' + message)) return json({ saved: true });
    const wish = previous ? (previous + '\n\n' + message).slice(0, MAX_WISHES_LENGTH) : message;
    sheet.getRange(row, 5, 1, 2).setValues([[safeCell(wish), nowText()]]);
    return json({ saved: true });
  } finally {
    lock.releaseLock();
  }
}

const TICKET_FOLDER_NAME = 'Graduation Tickets';
const MAX_TICKET_BASE64 = 4 * 1024 * 1024; // ~3 MB image

function ticketFolder() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('TICKET_FOLDER_ID');
  if (id) {
    try {
      const folder = DriveApp.getFolderById(id);
      if (!folder.isTrashed()) return folder;
    } catch (e) { /* folder deleted: create a new one below */ }
  }
  const folder = DriveApp.createFolder(TICKET_FOLDER_NAME);
  props.setProperty('TICKET_FOLDER_ID', folder.getId());
  return folder;
}

// Save the guest's ticket image to Drive once and link it in column G (passId kept as the cell note)
function saveTicket(name, passId, image) {
  passId = String(passId || '').replace(/[^A-Z0-9-]/gi, '').slice(0, 40);
  const match = /^data:image\/(jpeg|png);base64,(.+)$/.exec(String(image || ''));
  if (!passId || !match || match[2].length > MAX_TICKET_BASE64) return json({ error: 'Invalid ticket' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const row = findGuestRow(sheet, name);
    if (row === -1) return json({ error: 'Guest not found' });
    if (sheet.getRange(row, 3).getValue() !== 'Accepted') return json({ error: 'Not attending' });

    const cell = sheet.getRange(row, 7);
    // Already saved (earlier visit, other device, or a retried request): keep the first ticket
    if (cell.getValue()) return json({ saved: true, existed: true, passId: cell.getNote() });

    if (!sheet.getRange(1, 7).getValue()) sheet.getRange(1, 7).setValue('Ticket');

    const ext = match[1] === 'png' ? 'png' : 'jpg';
    const guest = String(sheet.getRange(row, 2).getValue()).replace(/[\\/:*?"<>|]/g, '');
    const fileName = (row - 1) + ' - ' + guest + ' - ' + passId + '.' + ext;
    const blob = Utilities.newBlob(Utilities.base64Decode(match[2]), 'image/' + match[1], fileName);
    const file = ticketFolder().createFile(blob);

    cell.setValue(file.getUrl()).setNote(passId);
    return json({ saved: true, existed: false, passId: passId });
  } finally {
    lock.releaseLock();
  }
}
