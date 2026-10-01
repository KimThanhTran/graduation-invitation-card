/**
 * config.js
 * Shared frontend configuration (used by rsvp.js and admin.js).
 */
window.APP_CONFIG = Object.freeze({
  // Google Apps Script Web App URL (see backend/README.md)
  API_URL: 'https://script.google.com/macros/s/AKfycbxWwwsPYZffKC5PvjCm1gssKdZofaiHLcbv91wf_fkfFwWWKvpTW4SciR1YnVUWg7VJ/exec',

  // After this moment the card switches to "thank you" mode (countdown + RSVP are replaced).
  // Preview anytime with ?mode=after (or force the normal card with ?mode=before).
  EVENT_END: '2026-11-08T13:00:00+07:00',

  // Link to the photo album shown after the ceremony (Google Photos / Drive). Leave '' until ready.
  ALBUM_URL: ''
});
