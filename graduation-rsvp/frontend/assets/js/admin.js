/**
 * admin.js
 * Wish Studio — password-gated page that renders a guest's wish as a
 * portrait image (1080x1920 or 1440x2560) for posting to stories.
 *
 * The password is checked by the Apps Script backend (action "adminAuth"),
 * which also returns the guests and their wishes (pick one to fill the form).
 */

(function () {
  'use strict';

  const API_URL = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
  const SESSION_KEY = 'hutech_grad_admin_pw';
  const PHOTO_SRC = 'assets/images/image.png';

  // Everything is drawn on a 1080x1920 grid, then scaled to the chosen size
  const BASE_W = 1080;
  const BASE_H = 1920;

  const COLORS = {
    pink: '#ff2e93',
    softPink: '#ff85c0',
    rose: '#e11d74',
    gold: '#facc15',
    green: '#34d399',
    white: '#ffffff',
    text: '#f8f1f5',
    secondary: '#b8a9b1',
    muted: '#857680'
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
  // adminAuth is read-only, so repeating it is safe.
  async function adminAuth(password) {
    if (!API_URL) throw new Error('API_URL is not configured in config.js');
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // No Content-Type header -> text/plain, which avoids a CORS preflight to Apps Script
        const res = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'adminAuth', password: password })
        });
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
    bg.addColorStop(0, '#2a0b1d');
    bg.addColorStop(0.45, '#0b0609');
    bg.addColorStop(1, '#000000');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, BASE_W, BASE_H);

    // Ambient glow orbs
    const orbs = [
      { x: 540, y: 260, r: 620, color: 'rgba(255, 46, 147, 0.28)' },
      { x: 940, y: 1680, r: 560, color: 'rgba(225, 29, 116, 0.26)' },
      { x: 80, y: 1150, r: 420, color: 'rgba(236, 72, 153, 0.14)' }
    ];
    orbs.forEach((o) => {
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      g.addColorStop(0, o.color);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, BASE_W, BASE_H);
    });

    // Tech grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 46, 147, 0.045)';
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
        ctx.globalAlpha = isHead ? 0.35 : 0.05 + (i / length) * 0.14;
        ctx.fillStyle = isHead ? COLORS.white : COLORS.pink;
        ctx.fillText(glyphs[Math.floor(rand() * glyphs.length)], x, y);
      }
    }
    ctx.restore();
  }

  function drawCorners(ctx) {
    const inset = 44;
    const len = 64;
    ctx.save();
    ctx.strokeStyle = COLORS.pink;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 4;
    ctx.shadowColor = COLORS.pink;
    ctx.shadowBlur = 12;
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
    ctx.fillStyle = COLORS.green;
    ctx.shadowColor = COLORS.green;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(104, 126, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = COLORS.pink;
    ctx.textAlign = 'left';
    ctx.fillText('SYS.MESSAGE // 2026', 126, 126);

    ctx.fillStyle = COLORS.secondary;
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
    halo.addColorStop(0, 'rgba(255, 46, 147, 0.35)');
    halo.addColorStop(1, 'rgba(255, 46, 147, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);

    // Photo (cover-fit) or graduation cap
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#140a10';
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
    ring.addColorStop(0, COLORS.pink);
    ring.addColorStop(0.5, COLORS.softPink);
    ring.addColorStop(1, COLORS.rose);
    ctx.strokeStyle = ring;
    ctx.lineWidth = 7;
    ctx.shadowColor = COLORS.pink;
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.stroke();

    // Outer dashed orbit
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 46, 147, 0.45)';
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
    g.addColorStop(0, COLORS.pink);
    g.addColorStop(0.5, COLORS.white);
    g.addColorStop(1, COLORS.softPink);
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(255, 46, 147, 0.6)';
    ctx.shadowBlur = 34;
    ctx.fillText('THANK YOU', 540, 710);

    ctx.shadowBlur = 0;
    ctx.font = `600 40px ${FONT.heading}`;
    ctx.fillStyle = COLORS.secondary;
    ctx.fillText('Cảm ơn lời chúc của bạn', 540, 776);
    ctx.restore();
  }

  function drawMessageCard(ctx, data) {
    const x = 80;
    const y = 840;
    const w = BASE_W - 160;
    const h = 800;

    ctx.save();
    // Glass body
    roundRect(ctx, x, y, w, h, 36);
    const body = ctx.createLinearGradient(x, y, x + w, y + h);
    body.addColorStop(0, 'rgba(24, 11, 19, 0.9)');
    body.addColorStop(1, 'rgba(8, 4, 7, 0.94)');
    ctx.fillStyle = body;
    ctx.shadowColor = 'rgba(255, 46, 147, 0.22)';
    ctx.shadowBlur = 50;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Neon border
    const border = ctx.createLinearGradient(x, y, x + w, y + h);
    border.addColorStop(0, COLORS.pink);
    border.addColorStop(0.5, COLORS.rose);
    border.addColorStop(1, COLORS.gold);
    ctx.strokeStyle = border;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Header strip: status chip + type (mirrors the RSVP ticket)
    ctx.textBaseline = 'middle';
    ctx.font = `700 24px ${FONT.mono}`;
    const chip = 'STATUS 200';
    const chipW = ctx.measureText(chip).width + 28;
    roundRect(ctx, x + 44, y + 44, chipW, 44, 8);
    ctx.fillStyle = 'rgba(52, 211, 153, 0.14)';
    ctx.fill();
    ctx.fillStyle = COLORS.green;
    ctx.textAlign = 'left';
    ctx.fillText(chip, x + 58, y + 67);

    ctx.fillStyle = COLORS.pink;
    ctx.textAlign = 'right';
    ctx.font = `600 24px ${FONT.mono}`;
    ctx.fillText('MESSAGE // RECEIVED', x + w - 44, y + 67);

    dashedLine(ctx, x + 44, y + 118, x + w - 44, 'rgba(255, 46, 147, 0.35)');

    // Decorative quote mark
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 190px ${FONT.heading}`;
    ctx.fillStyle = 'rgba(255, 46, 147, 0.22)';
    ctx.fillText('“', x + 36, y + 290);

    // Wish text, auto-sized to fill the box
    const boxTop = y + 170;
    const boxHeight = 430;
    const lineHeight = 1.5;
    const wish = data.wish || 'Lời chúc sẽ hiện ở đây...';
    // Narrower than the card so centered lines clear the quote mark
    const fit = fitText(ctx, wish, (s) => `500 ${s}px ${FONT.body}`, w - 260, boxHeight, 58, 28, lineHeight);
    ctx.font = `500 ${fit.size}px ${FONT.body}`;
    ctx.fillStyle = data.wish ? COLORS.text : COLORS.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const blockHeight = fit.lines.length * fit.size * lineHeight;
    let lineY = boxTop + (boxHeight - blockHeight) / 2 + (fit.size * lineHeight) / 2;
    fit.lines.forEach((line) => {
      ctx.fillText(line, BASE_W / 2, lineY);
      lineY += fit.size * lineHeight;
    });

    dashedLine(ctx, x + 44, y + 630, x + w - 44, 'rgba(255, 46, 147, 0.35)');

    // Sender
    const sender = data.sender ? `— ${data.sender}` : '— Người gửi';
    const senderSize = fitSingleLine(ctx, sender, (s) => `700 ${s}px ${FONT.heading}`, w - 120, 50, 30);
    ctx.font = `700 ${senderSize}px ${FONT.heading}`;
    ctx.fillStyle = data.sender ? COLORS.pink : COLORS.muted;
    ctx.shadowColor = 'rgba(255, 46, 147, 0.45)';
    ctx.shadowBlur = data.sender ? 16 : 0;
    ctx.fillText(sender, BASE_W / 2, data.relation ? y + 690 : y + 712);
    ctx.shadowBlur = 0;

    if (data.relation) {
      ctx.font = `600 26px ${FONT.mono}`;
      ctx.fillStyle = COLORS.secondary;
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
      ['DATE', '01.11.2026'],
      ['VENUE', 'THU DUC CAMPUS']
    ];
    meta.forEach(([label, value], i) => {
      const cx = 220 + i * 320;
      ctx.font = `600 20px ${FONT.mono}`;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(label, cx, 1690);
      ctx.font = `700 24px ${FONT.mono}`;
      ctx.fillStyle = COLORS.text;
      ctx.fillText(value, cx, 1724);
    });

    // Barcode
    const barTop = 1762;
    const barHeight = 58;
    const barWidth = 520;
    let bx = (BASE_W - barWidth) / 2;
    const end = bx + barWidth;
    ctx.fillStyle = COLORS.pink;
    while (bx < end) {
      const w = 2 + Math.floor(rand() * 5);
      if (rand() > 0.35) ctx.fillRect(bx, barTop, Math.min(w, end - bx), barHeight);
      bx += w + 2 + Math.floor(rand() * 3);
    }

    ctx.font = `700 24px ${FONT.mono}`;
    ctx.fillStyle = COLORS.pink;
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
    studioView: $('studio-view'),
    logoutBtn: $('logout-btn'),
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
    refreshBtn: $('refresh-btn')
  };

  let photo = null;
  let renderTimer = null;
  let password = null;

  function setFeedback(el, message, type) {
    el.textContent = message;
    el.className = `feedback ${type || ''}`;
  }

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

  function fileName() {
    const slug = readForm().sender
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `loi-chuc-${slug || 'khach-moi'}.png`;
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
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback(els.studioFeedback, `Đã tải ${a.download} (${els.canvas.width}×${els.canvas.height}).`, 'success');
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

  function fillGuestList(guests) {
    els.guestList.innerHTML = '';
    (guests || []).forEach((g) => {
      const option = document.createElement('option');
      option.value = g.name;
      els.guestList.appendChild(option);
    });
  }

  // A guest's cell holds all their wishes separated by a blank line (see saveWish in Code.gs)
  function extractWishes(guests) {
    const wishes = [];
    (guests || []).forEach((g) => {
      String(g.wish || '').split(/\n\s*\n/).map((w) => w.trim()).filter(Boolean)
        .forEach((text) => wishes.push({ name: g.name, text, wishedAt: g.wishedAt }));
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

  function renderInbox(guests) {
    const wishes = extractWishes(guests);
    els.inboxList.innerHTML = '';
    els.inboxCount.textContent = wishes.length ? `(${wishes.length})` : '';
    els.inboxEmpty.hidden = wishes.length > 0;

    wishes.forEach((wish) => {
      const li = document.createElement('li');
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
  }

  async function refreshInbox() {
    if (!password) return;
    els.refreshBtn.disabled = true;
    try {
      const result = await adminAuth(password);
      if (!result.ok) {
        logout();
        return;
      }
      fillGuestList(result.guests);
      renderInbox(result.guests);
    } catch (err) {
      console.error(err);
      setFeedback(els.studioFeedback, 'Không tải lại được danh sách lời chúc.', 'error');
    } finally {
      els.refreshBtn.disabled = false;
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

  async function openStudio(guests) {
    els.loginView.hidden = true;
    els.studioView.hidden = false;
    fillGuestList(guests);
    renderInbox(guests);
    await Promise.all([loadFonts(), loadPhoto().then((img) => { photo = img; })]);
    render();
  }

  async function login(candidate, silent) {
    els.loginBtn.disabled = true;
    if (!silent) setFeedback(els.loginFeedback, 'Đang kiểm tra...', '');
    try {
      const result = await adminAuth(candidate);
      if (result.ok) {
        password = candidate;
        sessionSet(candidate);
        setFeedback(els.loginFeedback, '', '');
        await openStudio(result.guests);
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
    password = null;
    sessionSet(null);
    els.passwordInput.value = '';
    fillGuestList([]);
    renderInbox([]);
    els.studioView.hidden = true;
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
    els.refreshBtn.addEventListener('click', refreshInbox);

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
  window.WishStudio = { renderWish };
})();
