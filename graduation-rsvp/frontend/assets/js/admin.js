/**
 * admin.js
 * Admin console (password checked by the Apps Script backend):
 * - Dashboard: RSVP / wish / check-in stats and the guest list (with manual check-in)
 * - Check-in: scans the QR on guests' tickets with the camera and records arrival
 * - Wish Studio: renders a guest's wish as a portrait image (1080x1920 or 1440x2560)
 */

(function () {
  'use strict';

  const API_URL = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
  const SESSION_KEY = 'hutech_grad_admin_pw';
  const PHOTO_SRC = 'assets/images/image.png';

  // Everything is drawn on a 1080x1920 grid, then scaled to the chosen size
  const BASE_W = 1080;
  const BASE_H = 1920;

  // Every color the image uses. Swap this object to try another palette.
  // Current: Nordic Cyber (#0D1117 + mint #40C463 + purple #7952B3)
  const THEME = {
    bg: ['#1c1633', '#0d1117', '#010409'],          // top -> bottom
    orbs: ['rgba(64, 196, 99, 0.16)', 'rgba(121, 82, 179, 0.12)', 'rgba(185, 163, 224, 0.07)'],
    orbFade: 'rgba(13, 17, 23, 0)',
    grid: 'rgba(64, 196, 99, 0.05)',
    glyph: '#40c463',
    glyphHead: '#b9a3e0',
    accent: '#40c463',
    accentGlow: 'rgba(64, 196, 99, 0.4)',
    status: '#86efac',
    statusGlow: 'rgba(134, 239, 172, 0.5)',
    chipBg: 'rgba(134, 239, 172, 0.12)',
    halo: 'rgba(64, 196, 99, 0.22)',
    haloFade: 'rgba(64, 196, 99, 0)',
    avatarFill: '#161b22',
    ring: ['#b9a3e0', '#40c463', '#7952b3'],
    orbit: 'rgba(64, 196, 99, 0.45)',
    title: ['#7952b3', '#d2f5dc', '#40c463'],
    titleGlow: 'rgba(64, 196, 99, 0.3)',
    card: ['#161b22', '#0d1117'],
    cardShadow: 'rgba(0, 0, 0, 0.55)',
    border: ['#b9a3e0', '#40c463', '#5a3d8a'],
    dash: 'rgba(64, 196, 99, 0.35)',
    quote: 'rgba(64, 196, 99, 0.18)',
    senderGlow: 'rgba(64, 196, 99, 0.3)',
    text: '#f0f6fc',
    secondary: '#8b949e',
    muted: '#6e7681'
  };

  const FONT = {
    display: 'Orbitron',
    heading: '"Space Grotesk"',
    body: '"Plus Jakarta Sans"',
    mono: '"JetBrains Mono"'
  };

  const $ = (id) => document.getElementById(id);

  /* ========================================================
   * API
   * ======================================================== */
  const MAX_ATTEMPTS = 3;

  // Retries like rsvp.js: Apps Script's redirect hop sometimes returns a 404 page.
  // adminAuth is read-only and check-in keeps the first time, so repeating either is safe.
  async function callAdmin(payload) {
    if (!API_URL) throw new Error('API_URL is not configured in config.js');
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // No Content-Type header -> text/plain, which avoids a CORS preflight to Apps Script
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        lastError = err;
        if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
    throw lastError;
  }

  function sessionGet() {
    try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; }
  }

  function sessionSet(value) {
    try {
      if (value) sessionStorage.setItem(SESSION_KEY, value);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* storage unavailable: user just re-enters the password */ }
  }

  /* ========================================================
   * Helpers
   * ======================================================== */

  // Deterministic PRNG so the background/barcode stays stable while typing
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function wishCode(seed) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    let n = seed;
    for (let i = 0; i < 4; i++) {
      code += chars[n % chars.length];
      n = Math.floor(n / chars.length);
    }
    return `HUT-IT-2026-WISH-${code}`;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function dashedLine(ctx, x1, y, x2, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.restore();
  }

  // Word-wrap text to maxWidth; respects line breaks and splits over-long words
  function wrapText(ctx, text, maxWidth) {
    const lines = [];
    text.split(/\r?\n/).forEach((paragraph) => {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push('');
        return;
      }
      let line = '';
      words.forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
          line = candidate;
          return;
        }
        if (line) lines.push(line);
        // Break a single word that is wider than the box
        line = '';
        for (const ch of word) {
          if (ctx.measureText(line + ch).width > maxWidth && line) {
            lines.push(line);
            line = ch;
          } else {
            line += ch;
          }
        }
      });
      if (line) lines.push(line);
    });
    // Drop leading/trailing blank lines
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines;
  }

  // Largest font size (maxSize..minSize) whose wrapped text fits the box
  function fitText(ctx, text, fontFor, maxWidth, maxHeight, maxSize, minSize, lineHeight) {
    for (let size = maxSize; size >= minSize; size -= 2) {
      ctx.font = fontFor(size);
      const lines = wrapText(ctx, text, maxWidth);
      if (lines.length * size * lineHeight <= maxHeight) {
        return { size, lines };
      }
    }
    // Still too long at the minimum size: truncate with an ellipsis
    ctx.font = fontFor(minSize);
    const maxLines = Math.floor(maxHeight / (minSize * lineHeight));
    const lines = wrapText(ctx, text, maxWidth).slice(0, maxLines);
    if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*\S*$/, '') + '…';
    return { size: minSize, lines };
  }

  function fitSingleLine(ctx, text, fontFor, maxWidth, maxSize, minSize) {
    let size = maxSize;
    ctx.font = fontFor(size);
    while (size > minSize && ctx.measureText(text).width > maxWidth) {
      size -= 2;
      ctx.font = fontFor(size);
    }
    return size;
  }

  /* ========================================================
   * Renderer
   * ======================================================== */
  function drawBackground(ctx, rand) {
    const bg = ctx.createLinearGradient(0, 0, 0, BASE_H);
    bg.addColorStop(0, THEME.bg[0]);
    bg.addColorStop(0.55, THEME.bg[1]);
    bg.addColorStop(1, THEME.bg[2]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, BASE_W, BASE_H);

    // Ambient glow orbs
    const orbs = [
      { x: 540, y: 260, r: 620, color: THEME.orbs[0] },
      { x: 940, y: 1680, r: 560, color: THEME.orbs[1] },
      { x: 80, y: 1150, r: 420, color: THEME.orbs[2] }
    ];
    orbs.forEach((o) => {
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      g.addColorStop(0, o.color);
      g.addColorStop(1, THEME.orbFade);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, BASE_W, BASE_H);
    });

    // Tech grid
    ctx.save();
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= BASE_W; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, BASE_H);
      ctx.stroke();
    }
    for (let y = 0; y <= BASE_H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(BASE_W, y);
      ctx.stroke();
    }
    ctx.restore();

    // Matrix rain columns with graduation / tech glyphs
    const glyphs = ['0', '1', '0', '1', '{', '}', '<', '/', '>', '🎓', '💻', '⚡', '✦', '📜'];
    ctx.save();
    ctx.font = `26px ${FONT.mono}`;
    ctx.textAlign = 'center';
    for (let x = 27; x < BASE_W; x += 54) {
      if (rand() < 0.35) continue;
      const startY = Math.floor(rand() * BASE_H);
      const length = 6 + Math.floor(rand() * 14);
      for (let i = 0; i < length; i++) {
        const y = startY + i * 34;
        if (y > BASE_H) break;
        // Brighter "head" at the bottom of each column
        const isHead = i === length - 1;
        ctx.globalAlpha = isHead ? 0.3 : 0.04 + (i / length) * 0.1;
        ctx.fillStyle = isHead ? THEME.glyphHead : THEME.glyph;
        ctx.fillText(glyphs[Math.floor(rand() * glyphs.length)], x, y);
      }
    }
    ctx.restore();
  }

  function drawCorners(ctx) {
    const inset = 44;
    const len = 64;
    ctx.save();
    ctx.strokeStyle = THEME.accent;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 4;
    ctx.shadowColor = THEME.accentGlow;
    ctx.shadowBlur = 6;
    [
      [inset, inset, 1, 1],
      [BASE_W - inset, inset, -1, 1],
      [inset, BASE_H - inset, 1, -1],
      [BASE_W - inset, BASE_H - inset, -1, -1]
    ].forEach(([x, y, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(x, y + dy * len);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * len, y);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawHeader(ctx) {
    ctx.save();
    ctx.font = `700 26px ${FONT.mono}`;
    ctx.textBaseline = 'middle';

    // Status dot
    ctx.fillStyle = THEME.status;
    ctx.shadowColor = THEME.statusGlow;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(104, 126, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'left';
    ctx.fillText('SYS.MESSAGE // 2026', 126, 126);

    ctx.fillStyle = THEME.secondary;
    ctx.textAlign = 'right';
    ctx.fillText('HUTECH · IT', BASE_W - 90, 126);
    ctx.restore();
  }

  function drawAvatar(ctx, photo) {
    const cx = 540;
    const cy = 390;
    const r = 150;

    ctx.save();
    // Halo
    const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.7);
    halo.addColorStop(0, THEME.halo);
    halo.addColorStop(1, THEME.haloFade);
    ctx.fillStyle = halo;
    ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);

    // Photo (cover-fit) or graduation cap
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = THEME.avatarFill;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    if (photo) {
      const scale = Math.max((r * 2) / photo.naturalWidth, (r * 2) / photo.naturalHeight);
      const w = photo.naturalWidth * scale;
      const h = photo.naturalHeight * scale;
      // Bias upward so faces stay in frame
      ctx.drawImage(photo, cx - w / 2, cy - r - (h - r * 2) * 0.2, w, h);
    } else {
      ctx.font = `150px ${FONT.body}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🎓', cx, cy + 8);
    }
    ctx.restore();

    // Neon ring
    const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    ring.addColorStop(0, THEME.ring[0]);
    ring.addColorStop(0.5, THEME.ring[1]);
    ring.addColorStop(1, THEME.ring[2]);
    ctx.strokeStyle = ring;
    ctx.lineWidth = 7;
    ctx.shadowColor = THEME.accentGlow;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.stroke();

    // Outer dashed orbit
    ctx.shadowBlur = 0;
    ctx.strokeStyle = THEME.orbit;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 12]);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawTitle(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    ctx.font = `900 104px ${FONT.display}`;
    const g = ctx.createLinearGradient(200, 0, 880, 0);
    g.addColorStop(0, THEME.title[0]);
    g.addColorStop(0.5, THEME.title[1]);
    g.addColorStop(1, THEME.title[2]);
    ctx.fillStyle = g;
    ctx.shadowColor = THEME.titleGlow;
    ctx.shadowBlur = 18;
    ctx.fillText('THANK YOU', 540, 710);

    ctx.shadowBlur = 0;
    ctx.font = `600 40px ${FONT.heading}`;
    ctx.fillStyle = THEME.secondary;
    ctx.fillText('Cảm ơn lời chúc của bạn', 540, 776);
    ctx.restore();
  }

  function drawMessageCard(ctx, data) {
    const x = 80;
    const y = 840;
    const w = BASE_W - 160;
    const h = 800;

    ctx.save();
    // Card body
    roundRect(ctx, x, y, w, h, 36);
    const body = ctx.createLinearGradient(x, y, x + w, y + h);
    body.addColorStop(0, THEME.card[0]);
    body.addColorStop(1, THEME.card[1]);
    ctx.fillStyle = body;
    ctx.shadowColor = THEME.cardShadow;
    ctx.shadowBlur = 50;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Border
    const border = ctx.createLinearGradient(x, y, x + w, y + h);
    border.addColorStop(0, THEME.border[0]);
    border.addColorStop(0.6, THEME.border[1]);
    border.addColorStop(1, THEME.border[2]);
    ctx.strokeStyle = border;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Header strip: status chip + type (mirrors the RSVP ticket)
    ctx.textBaseline = 'middle';
    ctx.font = `700 24px ${FONT.mono}`;
    const chip = 'STATUS 200';
    const chipW = ctx.measureText(chip).width + 28;
    roundRect(ctx, x + 44, y + 44, chipW, 44, 8);
    ctx.fillStyle = THEME.chipBg;
    ctx.fill();
    ctx.fillStyle = THEME.status;
    ctx.textAlign = 'left';
    ctx.fillText(chip, x + 58, y + 67);

    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'right';
    ctx.font = `600 24px ${FONT.mono}`;
    ctx.fillText('MESSAGE // RECEIVED', x + w - 44, y + 67);

    dashedLine(ctx, x + 44, y + 118, x + w - 44, THEME.dash);

    // Decorative quote mark
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 190px ${FONT.heading}`;
    ctx.fillStyle = THEME.quote;
    ctx.fillText('“', x + 36, y + 290);

    // Wish text, auto-sized to fill the box
    const boxTop = y + 170;
    const boxHeight = 430;
    const lineHeight = 1.5;
    const wish = data.wish || 'Lời chúc sẽ hiện ở đây...';
    // Narrower than the card so centered lines clear the quote mark
    const fit = fitText(ctx, wish, (s) => `500 ${s}px ${FONT.body}`, w - 260, boxHeight, 58, 28, lineHeight);
    ctx.font = `500 ${fit.size}px ${FONT.body}`;
    ctx.fillStyle = data.wish ? THEME.text : THEME.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const blockHeight = fit.lines.length * fit.size * lineHeight;
    let lineY = boxTop + (boxHeight - blockHeight) / 2 + (fit.size * lineHeight) / 2;
    fit.lines.forEach((line) => {
      ctx.fillText(line, BASE_W / 2, lineY);
      lineY += fit.size * lineHeight;
    });

    dashedLine(ctx, x + 44, y + 630, x + w - 44, THEME.dash);

    // Sender
    const sender = data.sender ? `— ${data.sender}` : '— Người gửi';
    const senderSize = fitSingleLine(ctx, sender, (s) => `700 ${s}px ${FONT.heading}`, w - 120, 50, 30);
    ctx.font = `700 ${senderSize}px ${FONT.heading}`;
    ctx.fillStyle = data.sender ? THEME.accent : THEME.muted;
    ctx.shadowColor = THEME.senderGlow;
    ctx.shadowBlur = data.sender ? 8 : 0;
    ctx.fillText(sender, BASE_W / 2, data.relation ? y + 690 : y + 712);
    ctx.shadowBlur = 0;

    if (data.relation) {
      ctx.font = `600 26px ${FONT.mono}`;
      ctx.fillStyle = THEME.secondary;
      ctx.fillText(data.relation.toUpperCase(), BASE_W / 2, y + 744);
    }
    ctx.restore();
  }

  function drawFooter(ctx, rand, code) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Ticket meta
    const meta = [
      ['CEREMONY', 'GRADUATION 2026'],
      ['DATE', '08.11.2026'],
      ['VENUE', 'THU DUC CAMPUS']
    ];
    meta.forEach(([label, value], i) => {
      const cx = 220 + i * 320;
      ctx.font = `600 20px ${FONT.mono}`;
      ctx.fillStyle = THEME.muted;
      ctx.fillText(label, cx, 1690);
      ctx.font = `700 24px ${FONT.mono}`;
      ctx.fillStyle = THEME.text;
      ctx.fillText(value, cx, 1724);
    });

    // Barcode
    const barTop = 1762;
    const barHeight = 58;
    const barWidth = 520;
    let bx = (BASE_W - barWidth) / 2;
    const end = bx + barWidth;
    ctx.fillStyle = THEME.accent;
    while (bx < end) {
      const w = 2 + Math.floor(rand() * 5);
      if (rand() > 0.35) ctx.fillRect(bx, barTop, Math.min(w, end - bx), barHeight);
      bx += w + 2 + Math.floor(rand() * 3);
    }

    ctx.font = `700 24px ${FONT.mono}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(code, BASE_W / 2, 1850);
    ctx.restore();
  }

  function renderWish(canvas, data, photo) {
    const scale = data.width / BASE_W;
    canvas.width = data.width;
    canvas.height = Math.round(BASE_H * scale);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // Seed from the content so the "random" details don't flicker while typing
    const seed = hashString(`${data.sender}|${data.wish}`);
    const code = wishCode(seed);

    drawBackground(ctx, mulberry32(seed));
    drawCorners(ctx);
    drawHeader(ctx);
    drawAvatar(ctx, photo);
    drawTitle(ctx);
    drawMessageCard(ctx, data);
    drawFooter(ctx, mulberry32(seed ^ 0x9e3779b9), code);
  }

  /* ========================================================
   * Page controller
   * ======================================================== */
  const els = {
    loginView: $('login-view'),
    loginForm: $('login-form'),
    passwordInput: $('password-input'),
    loginBtn: $('login-btn'),
    loginFeedback: $('login-feedback'),
    app: $('admin-app'),
    tabButtons: document.querySelectorAll('.tab-btn'),
    logoutBtn: $('logout-btn'),
    refreshAllBtn: $('refresh-all-btn'),
    // Dashboard
    statTotal: $('stat-total'),
    statAccepted: $('stat-accepted'),
    statDeclined: $('stat-declined'),
    statWishes: $('stat-wishes'),
    statChecked: $('stat-checked'),
    statCheckedOf: $('stat-checked-of'),
    statCheckedBar: $('stat-checked-bar'),
    guestSearch: $('guest-search'),
    filterChips: document.querySelectorAll('.filter-chips .chip'),
    guestTbody: $('guest-tbody'),
    guestEmpty: $('guest-empty'),
    // Check-in scanner
    scanToggleBtn: $('scan-toggle-btn'),
    scannerVideo: $('scanner-video'),
    scannerFrame: $('scanner-frame'),
    scannerIdle: $('scanner-idle'),
    scanResult: $('scan-result'),
    scanResultIcon: $('scan-result-icon'),
    scanResultTitle: $('scan-result-title'),
    scanResultSub: $('scan-result-sub'),
    scannerFeedback: $('scanner-feedback'),
    // Wish Studio
    senderInput: $('sender-input'),
    guestList: $('guest-list'),
    relationInput: $('relation-input'),
    wishInput: $('wish-input'),
    wishCount: $('wish-count'),
    sizeSelect: $('size-select'),
    photoToggle: $('photo-toggle'),
    downloadBtn: $('download-btn'),
    shareBtn: $('share-btn'),
    studioFeedback: $('studio-feedback'),
    canvas: $('wish-canvas'),
    inboxList: $('inbox-list'),
    inboxEmpty: $('inbox-empty'),
    inboxCount: $('inbox-count'),
    refreshBtn: $('refresh-btn'),
    selectAllWrap: $('select-all-wrap'),
    selectAll: $('select-all'),
    bulkBar: $('bulk-bar'),
    bulkDownloadBtn: $('bulk-download-btn'),
    bulkFeedback: $('bulk-feedback')
  };

  let photo = null;
  let renderTimer = null;
  let password = null;
  let guests = [];
  let guestFilter = 'all';
  let assetsReady = null;
  let inboxWishes = [];          // wishes currently listed in the inbox
  const picked = new Set();      // indexes into inboxWishes chosen for bulk download

  function setFeedback(el, message, type) {
    el.textContent = message;
    el.className = `feedback ${type || ''}`;
  }

  // Same matching rule as the backend: ignore accents, case and extra spaces
  function normalizeName(s) {
    return String(s || '')
      .normalize('NFD').replace(/\p{M}/gu, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .trim().replace(/\s+/g, ' ').toLowerCase();
  }

  /* ---------- Wish Studio ---------- */

  function readForm() {
    return {
      sender: els.senderInput.value.trim().replace(/\s+/g, ' '),
      relation: els.relationInput.value.trim().replace(/\s+/g, ' '),
      wish: els.wishInput.value.trim(),
      width: Number(els.sizeSelect.value) || BASE_W
    };
  }

  function render() {
    renderWish(els.canvas, readForm(), els.photoToggle.checked ? photo : null);
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 120);
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function slugify(s) {
    return normalizeName(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function fileName() {
    return `loi-chuc-${slugify(readForm().sender) || 'khach-moi'}.png`;
  }

  function canvasBlob() {
    render();
    return new Promise((resolve, reject) => {
      els.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))), 'image/png');
    });
  }

  function validateForExport() {
    const data = readForm();
    if (!data.sender || !data.wish) {
      setFeedback(els.studioFeedback, 'Vui lòng nhập tên người gửi và nội dung lời chúc.', 'error');
      return false;
    }
    return true;
  }

  async function handleDownload() {
    if (!validateForExport()) return;
    try {
      const blob = await canvasBlob();
      const name = fileName();
      saveBlob(blob, name);
      setFeedback(els.studioFeedback, `Đã tải ${name} (${els.canvas.width}×${els.canvas.height}).`, 'success');
    } catch (err) {
      console.error(err);
      setFeedback(els.studioFeedback, 'Không xuất được ảnh. Hãy mở trang qua web (http/https), không mở file trực tiếp.', 'error');
    }
  }

  async function handleShare() {
    if (!validateForExport()) return;
    try {
      const blob = await canvasBlob();
      const file = new File([blob], fileName(), { type: 'image/png' });
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user closed the share sheet
      console.error(err);
      setFeedback(els.studioFeedback, 'Không chia sẻ được, hãy dùng nút Tải ảnh PNG.', 'error');
    }
  }

  function fillGuestList() {
    els.guestList.innerHTML = '';
    guests.forEach((g) => {
      const option = document.createElement('option');
      option.value = g.name;
      els.guestList.appendChild(option);
    });
  }

  // A guest's cell holds all their wishes separated by a blank line (see saveWish in Code.gs)
  function splitWishes(wish) {
    return String(wish || '').split(/\n\s*\n/).map((w) => w.trim()).filter(Boolean);
  }

  function extractWishes() {
    const wishes = [];
    guests.forEach((g) => {
      splitWishes(g.wish).forEach((text) => wishes.push({ name: g.name, text, wishedAt: g.wishedAt }));
    });
    return wishes.reverse(); // newest rows first
  }

  function selectWish(wish, button) {
    els.senderInput.value = wish.name;
    els.wishInput.value = wish.text.slice(0, 500);
    els.wishCount.textContent = `${els.wishInput.value.length}/500`;
    els.inboxList.querySelectorAll('.inbox-item.active').forEach((b) => b.classList.remove('active'));
    button.classList.add('active');
    setFeedback(els.studioFeedback, '', '');
    render();
  }

  function renderInbox() {
    const wishes = extractWishes();
    inboxWishes = wishes;
    picked.clear();
    els.inboxList.innerHTML = '';
    els.inboxCount.textContent = wishes.length ? `(${wishes.length})` : '';
    els.inboxEmpty.hidden = wishes.length > 0;
    els.selectAllWrap.hidden = wishes.length === 0;
    els.bulkBar.hidden = wishes.length === 0;
    setFeedback(els.bulkFeedback, '', '');

    wishes.forEach((wish, index) => {
      const li = document.createElement('li');
      li.className = 'inbox-row';

      // Checkbox picks the wish for bulk download; clicking the wish itself still opens it in the editor
      const pick = document.createElement('label');
      pick.className = 'inbox-pick';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.setAttribute('aria-label', `Chọn lời chúc của ${wish.name}`);
      box.addEventListener('change', () => {
        if (box.checked) picked.add(index);
        else picked.delete(index);
        li.classList.toggle('picked', box.checked);
        updateBulkBar();
      });
      pick.appendChild(box);
      li.appendChild(pick);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inbox-item';

      const top = document.createElement('div');
      top.className = 'inbox-item-top';
      const name = document.createElement('span');
      name.className = 'inbox-name';
      name.textContent = wish.name;
      const time = document.createElement('span');
      time.className = 'inbox-time';
      time.textContent = wish.wishedAt || '';
      top.append(name, time);

      const text = document.createElement('div');
      text.className = 'inbox-text';
      text.textContent = wish.text;

      button.append(top, text);
      button.addEventListener('click', () => selectWish(wish, button));
      li.appendChild(button);
      els.inboxList.appendChild(li);
    });
    updateBulkBar();
  }

  /* ---------- Bulk download: selected wishes -> one ZIP (a PNG per wish + a .txt) ---------- */
  const JSZIP_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  const JSZIP_SRI = 'sha512-XMVd28F1oH/O71fzwBnV7HucLxVwtxf26XV8P4wPk26EDxuGZ91N8bsOttmnomcCD3CS5ZMRL50H0GgOHvegtg==';
  let jszipPromise = null;

  // Loaded on first use so the studio page stays light
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!jszipPromise) {
      jszipPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = JSZIP_SRC;
        script.integrity = JSZIP_SRI;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve(window.JSZip);
        script.onerror = () => {
          jszipPromise = null;
          reject(new Error('Could not load JSZip'));
        };
        document.head.appendChild(script);
      });
    }
    return jszipPromise;
  }

  function updateBulkBar() {
    const count = picked.size;
    const total = inboxWishes.length;
    els.bulkDownloadBtn.disabled = count === 0;
    els.bulkDownloadBtn.textContent = count
      ? `⬇ TẢI ${count} LỜI CHÚC ĐÃ CHỌN (ZIP)`
      : '⬇ TẢI LỜI CHÚC ĐÃ CHỌN';
    els.selectAll.checked = total > 0 && count === total;
    els.selectAll.indeterminate = count > 0 && count < total;
  }

  function setAllPicked(checked) {
    picked.clear();
    els.inboxList.querySelectorAll('.inbox-row').forEach((row, index) => {
      row.querySelector('.inbox-pick input').checked = checked;
      row.classList.toggle('picked', checked);
      if (checked) picked.add(index);
    });
    updateBulkBar();
  }

  function blobFromCanvas(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))), 'image/png');
    });
  }

  async function handleBulkDownload() {
    const chosen = [...picked].sort((a, b) => a - b).map((i) => inboxWishes[i]).filter(Boolean);
    if (!chosen.length) return;

    els.bulkDownloadBtn.disabled = true;
    setFeedback(els.bulkFeedback, 'Đang chuẩn bị...', '');
    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      const width = Number(els.sizeSelect.value) || BASE_W;
      const usePhoto = els.photoToggle.checked ? photo : null;
      const canvas = document.createElement('canvas');
      const textParts = [];

      for (let i = 0; i < chosen.length; i++) {
        const wish = chosen[i];
        setFeedback(els.bulkFeedback, `Đang tạo ảnh ${i + 1}/${chosen.length}...`, '');

        renderWish(canvas, { sender: wish.name, relation: '', wish: wish.text.slice(0, 500), width }, usePhoto);
        const blob = await blobFromCanvas(canvas);

        // Numbered so several wishes from the same guest never overwrite each other
        zip.file(`${String(i + 1).padStart(2, '0')}-loi-chuc-${slugify(wish.name) || 'khach-moi'}.png`, blob);

        textParts.push(`${i + 1}. ${wish.name}${wish.wishedAt ? ` (${wish.wishedAt})` : ''}\n${wish.text}`);

        // Let the page repaint between images
        await new Promise((r) => setTimeout(r, 0));
      }

      zip.file('loi-chuc.txt', `\ufeff${textParts.join('\n\n----------\n\n')}\n`);

      setFeedback(els.bulkFeedback, 'Đang nén file ZIP...', '');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const stamp = new Date().toISOString().slice(0, 10);
      saveBlob(zipBlob, `loi-chuc-${stamp}.zip`);
      setFeedback(els.bulkFeedback, `Đã tải ${chosen.length} lời chúc (${chosen.length} ảnh + loi-chuc.txt).`, 'success');
    } catch (err) {
      console.error(err);
      setFeedback(els.bulkFeedback, 'Không tạo được file ZIP. Kiểm tra mạng rồi thử lại.', 'error');
    } finally {
      updateBulkBar();
    }
  }

  function loadPhoto() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // fall back to the 🎓 icon
      img.src = PHOTO_SRC;
    });
  }

  async function loadFonts() {
    // Canvas only uses fonts that are already loaded; the sample text pulls in Vietnamese subsets
    const sample = 'Cảm ơn lời chúc Ưu Đạt — ĐƯỢC';
    try {
      await Promise.all([
        document.fonts.load(`900 104px ${FONT.display}`, 'THANK YOU'),
        document.fonts.load(`600 40px ${FONT.heading}`, sample),
        document.fonts.load(`700 50px ${FONT.heading}`, sample),
        document.fonts.load(`500 40px ${FONT.body}`, sample),
        document.fonts.load(`600 24px ${FONT.mono}`, sample),
        document.fonts.load(`700 24px ${FONT.mono}`, sample)
      ]);
    } catch (e) {
      console.warn('Font loading failed, using fallbacks:', e);
    }
  }

  /* ---------- Dashboard ---------- */

  function renderStats() {
    const accepted = guests.filter((g) => g.status === 'Accepted');
    const checked = accepted.filter((g) => g.checkedInAt);
    const wishCount = guests.reduce((n, g) => n + splitWishes(g.wish).length, 0);

    els.statTotal.textContent = guests.length;
    els.statAccepted.textContent = accepted.length;
    els.statDeclined.textContent = guests.filter((g) => g.status === 'Declined').length;
    els.statWishes.textContent = wishCount;
    els.statChecked.textContent = checked.length;
    els.statCheckedOf.textContent = accepted.length;
    els.statCheckedBar.style.width = accepted.length ? `${Math.round((checked.length / accepted.length) * 100)}%` : '0%';
  }

  function guestMatchesFilter(g) {
    const query = normalizeName(els.guestSearch.value);
    if (query && !normalizeName(g.name).includes(query)) return false;
    if (guestFilter === 'Accepted' || guestFilter === 'Declined') return g.status === guestFilter;
    if (guestFilter === 'checked') return !!g.checkedInAt;
    if (guestFilter === 'waiting') return g.status === 'Accepted' && !g.checkedInAt;
    return true;
  }

  function cell(text, className) {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function renderGuestTable() {
    const rows = guests.filter(guestMatchesFilter);
    els.guestTbody.innerHTML = '';
    els.guestEmpty.hidden = rows.length > 0;

    rows.forEach((g) => {
      const tr = document.createElement('tr');
      tr.appendChild(cell(String(g.id), 'col-id'));
      tr.appendChild(cell(g.name, 'col-name'));

      const statusTd = document.createElement('td');
      const badge = document.createElement('span');
      const accepted = g.status === 'Accepted';
      badge.className = `badge ${accepted ? 'badge-yes' : 'badge-no'}`;
      badge.textContent = accepted ? 'Tham dự' : g.status === 'Declined' ? 'Từ chối' : (g.status || '—');
      statusTd.appendChild(badge);
      tr.appendChild(statusTd);

      tr.appendChild(cell(g.respondedAt || '—', 'col-time'));

      const wishes = splitWishes(g.wish).length;
      tr.appendChild(cell(wishes ? `💬 ${wishes}` : '—', 'col-wish'));

      const checkTd = document.createElement('td');
      checkTd.className = 'col-check';
      if (g.checkedInAt) {
        checkTd.textContent = `✅ ${g.checkedInAt}`;
      } else if (accepted) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-mini';
        btn.textContent = 'Check-in';
        btn.addEventListener('click', () => manualCheckIn(g, btn));
        checkTd.appendChild(btn);
      } else {
        checkTd.textContent = '—';
      }
      tr.appendChild(checkTd);
      els.guestTbody.appendChild(tr);
    });
  }

  function renderAll() {
    renderStats();
    renderGuestTable();
    fillGuestList();
    renderInbox();
  }

  /* ---------- Check-in ---------- */

  // Keep the local list in sync with a check-in result so the dashboard updates without a reload
  function applyCheckIn(result) {
    const g = guests.find((x) => normalizeName(x.name) === normalizeName(result.name));
    if (g && result.checkedInAt) g.checkedInAt = result.checkedInAt;
    renderStats();
    renderGuestTable();
  }

  async function checkIn(passId, name) {
    const result = await callAdmin({ action: 'checkin', password: password, passId: passId || '', name: name || '' });
    if (result.auth === false) {
      logout();
      throw new Error('Session expired');
    }
    if (result.ok) applyCheckIn(result);
    return result;
  }

  async function manualCheckIn(g, btn) {
    btn.disabled = true;
    btn.textContent = '...';
    try {
      const result = await checkIn(g.passId, g.name);
      if (!result.ok) {
        btn.disabled = false;
        btn.textContent = 'Thử lại';
        alert(result.error === 'Not attending' ? `${g.name} chưa xác nhận tham dự.` : `Không check-in được: ${result.error || 'lỗi'}`);
      }
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = 'Thử lại';
    }
  }

  // Ticket QR payload written by rsvp.js: HUTGRAD:1:<passId>:<url-encoded name>
  function parseTicketQr(text) {
    const match = /^HUTGRAD:1:([A-Z0-9-]+):(.*)$/i.exec(String(text || '').trim());
    if (!match) return null;
    let name = '';
    try { name = decodeURIComponent(match[2]); } catch (e) { name = match[2]; }
    return { passId: match[1], name: name };
  }

  const scanner = {
    stream: null,
    detector: null,
    canvas: null,
    timer: null,
    busy: false,
    lastCode: '',
    lastAt: 0
  };

  function showScanResult(kind, title, sub) {
    const icons = { ok: '✅', already: '🔁', error: '⛔' };
    els.scanResult.hidden = false;
    els.scanResult.className = `scan-result scan-${kind}`;
    els.scanResultIcon.textContent = icons[kind] || '';
    els.scanResultTitle.textContent = title;
    els.scanResultSub.textContent = sub || '';
  }

  // jsQR is only fetched for browsers without the native BarcodeDetector (e.g. iPhone Safari)
  function loadJsQr() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('jsQR failed to load'));
      document.head.appendChild(script);
    });
  }

  async function detectCode() {
    const video = els.scannerVideo;
    if (!video.videoWidth) return null;

    if (scanner.detector) {
      const codes = await scanner.detector.detect(video);
      return codes.length ? codes[0].rawValue : null;
    }

    // jsQR fallback: sample a downscaled frame
    const scale = Math.min(1, 640 / video.videoWidth);
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    if (!scanner.canvas) scanner.canvas = document.createElement('canvas');
    scanner.canvas.width = w;
    scanner.canvas.height = h;
    const ctx = scanner.canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h);
    const code = window.jsQR(frame.data, w, h, { inversionAttempts: 'dontInvert' });
    return code ? code.data : null;
  }

  async function handleScannedCode(text) {
    // Ignore the same ticket held in front of the camera for a few seconds
    const now = Date.now();
    if (text === scanner.lastCode && now - scanner.lastAt < 4000) return;
    scanner.lastCode = text;
    scanner.lastAt = now;

    const ticket = parseTicketQr(text);
    if (!ticket) {
      showScanResult('error', 'Không phải vé mời', 'Mã QR này không thuộc thiệp tốt nghiệp.');
      return;
    }

    showScanResult('already', 'Đang kiểm tra...', ticket.name);
    try {
      const result = await checkIn(ticket.passId, ticket.name);
      if (result.ok && !result.already) {
        showScanResult('ok', `Chào mừng ${result.name}!`, `Check-in lúc ${result.checkedInAt}`);
        if (navigator.vibrate) navigator.vibrate(120);
      } else if (result.ok) {
        showScanResult('already', `${result.name} đã check-in rồi`, `Lúc ${result.checkedInAt}`);
      } else if (result.error === 'Not attending') {
        showScanResult('error', `${result.name || ticket.name} chưa xác nhận tham dự`, 'Trạng thái trong sheet không phải Accepted.');
      } else {
        showScanResult('error', 'Không tìm thấy khách', `${ticket.name} · ${ticket.passId}`);
      }
    } catch (err) {
      console.error(err);
      showScanResult('error', 'Lỗi kết nối', 'Kiểm tra mạng rồi quét lại.');
      scanner.lastCode = ''; // allow an immediate retry
    }
  }

  async function scanLoop() {
    if (!scanner.stream) return;
    if (!scanner.busy) {
      scanner.busy = true;
      try {
        const text = await detectCode();
        if (text) await handleScannedCode(text);
      } catch (err) {
        console.warn('Scan frame failed:', err);
      } finally {
        scanner.busy = false;
      }
    }
    scanner.timer = setTimeout(scanLoop, 250);
  }

  async function startScanner() {
    setFeedback(els.scannerFeedback, '', '');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setFeedback(els.scannerFeedback, 'Trình duyệt này không hỗ trợ camera. Hãy mở trang bằng Chrome hoặc Safari qua https.', 'error');
      return;
    }
    els.scanToggleBtn.disabled = true;
    try {
      // Prefer the native detector; otherwise use jsQR
      scanner.detector = null;
      if ('BarcodeDetector' in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats.includes('qr_code')) scanner.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        } catch (e) { /* fall back to jsQR */ }
      }
      if (!scanner.detector) await loadJsQr();

      scanner.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      els.scannerVideo.srcObject = scanner.stream;
      await els.scannerVideo.play();
      els.scannerFrame.classList.add('scanning');
      els.scannerIdle.hidden = true;
      els.scanToggleBtn.textContent = '⏹ DỪNG QUÉT';
      scanLoop();
    } catch (err) {
      console.error(err);
      stopScanner();
      setFeedback(els.scannerFeedback,
        err && err.name === 'NotAllowedError'
          ? 'Bạn chưa cho phép dùng camera. Hãy cấp quyền camera cho trang này rồi thử lại.'
          : 'Không mở được camera hoặc bộ quét QR.', 'error');
    } finally {
      els.scanToggleBtn.disabled = false;
    }
  }

  function stopScanner() {
    clearTimeout(scanner.timer);
    if (scanner.stream) scanner.stream.getTracks().forEach((t) => t.stop());
    scanner.stream = null;
    els.scannerVideo.srcObject = null;
    els.scannerFrame.classList.remove('scanning');
    els.scannerIdle.hidden = false;
    els.scanToggleBtn.textContent = '📷 BẮT ĐẦU QUÉT';
  }

  /* ---------- Tabs, session ---------- */

  function switchTab(name) {
    els.tabButtons.forEach((btn) => {
      const active = btn.dataset.tab === name;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    ['dashboard', 'checkin', 'studio'].forEach((tab) => {
      $(`tab-${tab}`).hidden = tab !== name;
    });
    if (name !== 'checkin') stopScanner();
    if (name === 'studio' && assetsReady) assetsReady.then(render);
  }

  async function openApp(list) {
    guests = list || [];
    els.loginView.hidden = true;
    els.app.hidden = false;
    renderAll();
    switchTab('dashboard');
    assetsReady = Promise.all([loadFonts(), loadPhoto().then((img) => { photo = img; })]);
    await assetsReady;
    render();
  }

  async function refreshAll() {
    if (!password) return;
    [els.refreshAllBtn, els.refreshBtn].forEach((b) => { b.disabled = true; });
    try {
      const result = await callAdmin({ action: 'adminAuth', password: password });
      if (!result.ok) {
        logout();
        return;
      }
      guests = result.guests || [];
      renderAll();
    } catch (err) {
      console.error(err);
      setFeedback(els.studioFeedback, 'Không tải lại được dữ liệu.', 'error');
    } finally {
      [els.refreshAllBtn, els.refreshBtn].forEach((b) => { b.disabled = false; });
    }
  }

  async function login(candidate, silent) {
    els.loginBtn.disabled = true;
    if (!silent) setFeedback(els.loginFeedback, 'Đang kiểm tra...', '');
    try {
      const result = await callAdmin({ action: 'adminAuth', password: candidate });
      if (result.ok) {
        password = candidate;
        sessionSet(candidate);
        setFeedback(els.loginFeedback, '', '');
        await openApp(result.guests);
        return;
      }
      sessionSet(null);
      setFeedback(els.loginFeedback,
        result.error ? `Lỗi máy chủ: ${result.error}` : 'Sai mật khẩu.', 'error');
    } catch (err) {
      console.error(err);
      setFeedback(els.loginFeedback, 'Không kết nối được tới hệ thống. Thử lại sau.', 'error');
    } finally {
      els.loginBtn.disabled = false;
    }
  }

  function logout() {
    stopScanner();
    password = null;
    guests = [];
    sessionSet(null);
    els.passwordInput.value = '';
    renderAll();
    els.app.hidden = true;
    els.loginView.hidden = false;
    els.passwordInput.focus();
  }

  function bindEvents() {
    els.loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const candidate = els.passwordInput.value;
      if (!candidate) {
        setFeedback(els.loginFeedback, 'Vui lòng nhập mật khẩu.', 'error');
        return;
      }
      login(candidate, false);
    });

    els.logoutBtn.addEventListener('click', logout);
    els.refreshAllBtn.addEventListener('click', refreshAll);
    els.refreshBtn.addEventListener('click', refreshAll);
    els.tabButtons.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

    // Dashboard filters
    els.guestSearch.addEventListener('input', renderGuestTable);
    els.filterChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        guestFilter = chip.dataset.filter;
        els.filterChips.forEach((c) => c.classList.toggle('active', c === chip));
        renderGuestTable();
      });
    });

    // Scanner
    els.scanToggleBtn.addEventListener('click', () => (scanner.stream ? stopScanner() : startScanner()));
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopScanner(); });

    // Wish Studio
    [els.senderInput, els.relationInput, els.wishInput].forEach((input) => {
      input.addEventListener('input', () => {
        setFeedback(els.studioFeedback, '', '');
        scheduleRender();
      });
    });
    els.wishInput.addEventListener('input', () => {
      els.wishCount.textContent = `${els.wishInput.value.length}/500`;
    });
    els.sizeSelect.addEventListener('change', render);
    els.photoToggle.addEventListener('change', render);

    els.downloadBtn.addEventListener('click', handleDownload);
    els.selectAll.addEventListener('change', () => setAllPicked(els.selectAll.checked));
    els.bulkDownloadBtn.addEventListener('click', handleBulkDownload);
    els.shareBtn.addEventListener('click', handleShare);

    // Native share sheet (post straight to a story) where the browser supports sharing files
    try {
      const probe = new File([new Blob()], 'probe.png', { type: 'image/png' });
      els.shareBtn.hidden = !(navigator.canShare && navigator.canShare({ files: [probe] }));
    } catch (e) {
      els.shareBtn.hidden = true;
    }
  }

  bindEvents();

  // Resume a session opened earlier in this tab
  const saved = sessionGet();
  if (saved) login(saved, true);
  else els.passwordInput.focus();

  // Exposed for local previews/tests
  window.WishStudio = { renderWish, parseTicketQr, simulateScan: handleScannedCode };
})();
