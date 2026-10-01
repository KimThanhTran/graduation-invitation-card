/**
 * rsvp.js
 * Guest Verification & RSVP Interaction Engine
 * Features:
 * - State management: idle -> checking -> confirmed | declined
 * - Guest verification & RSVP storage via Google Apps Script + Google Sheet
 * - Celebratory cyber particle burst system on #celebration-canvas
 * - High-tech confirmation ticket with unique pass hash and check-in QR code
 * - Calendar integration (.ics export / Google Calendar URL)
 * - Downloadable ticket image (canvas render) & guest wishes
 * - Local storage persistence for seamless guest session
 */

(function () {
  'use strict';

  // Constants
  const STORAGE_KEY = 'hutech_grad_rsvp_2026';

  // Google Apps Script Web App URL, set in config.js
  const API_URL = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';

  const MAX_ATTEMPTS = 3;

  /**
   * POST to the Apps Script backend, retrying transient failures.
   * Apps Script answers via a redirect to script.googleusercontent.com, and that
   * second hop sometimes returns a 404 page even though doPost already ran.
   * The backend is safe to repeat (duplicate names and repeated wishes are skipped).
   * Returns the parsed JSON plus `retried: true` if an earlier attempt failed.
   */
  async function postToApi(payload) {
    if (!API_URL) {
      throw new Error('API_URL is not configured in rsvp.js');
    }
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // No Content-Type header -> sent as text/plain, which avoids a CORS preflight to Apps Script
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return attempt > 1 ? { ...data, retried: true } : data;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 600 * attempt));
      }
    }
    throw lastError;
  }

  /**
   * Send an RSVP. New names are added to the sheet; existing names are kept as-is.
   * Returns { saved: true, isNew, name } | { error }
   */
  function submitRsvp(name, status) {
    return postToApi({
      action: 'rsvp',
      name: name,
      status: status === 'confirmed' ? 'Accepted' : 'Declined'
    });
  }

  /** Save a guest wish on the guest's sheet row. Returns { saved: true } | { error } */
  function submitWish(name, message) {
    return postToApi({ action: 'wish', name: name, message: message });
  }

  /** Store the ticket image on the host's Drive (first ticket per guest wins). Returns { saved, existed, passId } | { error } */
  function submitTicket(name, passId, image) {
    return postToApi({ action: 'ticket', name: name, passId: passId, image: image });
  }

  /* ========================================================
   * Celebration Confetti / Particle Engine
   * ======================================================== */
  const BURST_EMOJIS = ['🎓', '✨', '🎉', '💚', '💜'];
  const PETAL_EMOJIS = ['✨', '💚', '💜', '🍃'];

  class CelebrationFX {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;

      this.ctx = this.canvas.getContext('2d');
      this.particles = [];
      this.isRunning = false;
      this.rafId = null;

      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = this.width * dpr;
      this.canvas.height = this.height * dpr;
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.ctx.scale(dpr, dpr);
    }

    burst() {
      this.resize();
      this.particles = [];
      const particleCount = Math.min(window.innerWidth < 640 ? 70 : 120, 140);
      
      const colors = [
        '#40c463', // Mint
        '#b9a3e0', // Soft purple
        '#7952b3', // Obsidian purple
        '#d2f5dc', // Pale mint
        '#d4d4d8', // Platinum
        '#ffffff'  // Pure star white
      ];

      const originX = this.width / 2;
      const originY = Math.min(this.height * 0.45, this.height - 180);

      for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 9;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const isShapeRect = Math.random() > 0.5;
        const emoji = Math.random() < 0.3 ? BURST_EMOJIS[Math.floor(Math.random() * BURST_EMOJIS.length)] : null;

        this.particles.push({
          x: originX + (Math.random() - 0.5) * 80,
          y: originY + (Math.random() - 0.5) * 40,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3.5, // Initial upward kick
          size: emoji ? 18 + Math.random() * 14 : 3 + Math.random() * 5,
          color: color,
          alpha: 1,
          decay: emoji ? 0.006 + Math.random() * 0.006 : 0.008 + Math.random() * 0.014,
          rotation: Math.random() * 360,
          rotSpeed: (Math.random() - 0.5) * (emoji ? 6 : 12),
          isRect: isShapeRect,
          emoji: emoji,
          gravity: 0.18,
          sway: 0,
          phase: 0
        });
      }

      this.start();
    }

    /** Gentle falling petals — used for the decline response */
    petals() {
      this.resize();
      this.particles = [];
      const count = window.innerWidth < 640 ? 22 : 36;

      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * this.width,
          y: -30 - Math.random() * this.height * 0.5,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 1.6 + Math.random() * 1.6,
          size: 16 + Math.random() * 12,
          color: '#b9a3e0',
          alpha: 1,
          decay: 0.0028 + Math.random() * 0.0018,
          rotation: Math.random() * 360,
          rotSpeed: (Math.random() - 0.5) * 3,
          isRect: false,
          emoji: PETAL_EMOJIS[Math.floor(Math.random() * PETAL_EMOJIS.length)],
          gravity: 0,
          sway: 0.6 + Math.random() * 0.8,
          phase: Math.random() * Math.PI * 2
        });
      }

      this.start();
    }

    start() {
      if (!this.isRunning) {
        this.isRunning = true;
        this.animate();
      }
    }

    animate() {
      if (!this.isRunning) return;

      this.ctx.clearRect(0, 0, this.width, this.height);

      let aliveCount = 0;

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (p.alpha <= 0) continue;

        aliveCount++;
        p.phase += 0.04;
        p.x += p.vx + Math.sin(p.phase) * p.sway;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.98;
        p.rotation += p.rotSpeed;
        p.alpha -= p.decay;

        this.ctx.save();
        this.ctx.globalAlpha = Math.max(0, p.alpha);
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate((p.rotation * Math.PI) / 180);

        if (p.emoji) {
          this.ctx.font = `${p.size}px serif`;
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(p.emoji, 0, 0);
          this.ctx.restore();
          continue;
        }

        this.ctx.fillStyle = p.color;
        this.ctx.shadowColor = p.color;
        this.ctx.shadowBlur = 6;

        if (p.isRect) {
          this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size * 1.5, p.size * 0.7);
        } else {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          this.ctx.fill();
        }

        this.ctx.restore();
      }

      if (aliveCount > 0) {
        this.rafId = requestAnimationFrame(() => this.animate());
      } else {
        this.isRunning = false;
        this.ctx.clearRect(0, 0, this.width, this.height);
      }
    }

    stop() {
      this.isRunning = false;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.ctx) {
        this.ctx.clearRect(0, 0, this.width, this.height);
      }
    }
  }

  /* ========================================================
   * Ticket Image Renderer (1600 x 800 PNG, landscape pass with tear-off stub)
   * ======================================================== */
  /** Ticket outline: rounded rect with half-circle notches where the stub tears off */
  function ticketPath(ctx, x, y, w, h, r, sx, n) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(sx - n, y);
    ctx.arc(sx, y, n, Math.PI, 0, true);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.lineTo(sx + n, y + h);
    ctx.arc(sx, y + h, n, 0, Math.PI, true);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Split text into lines that fit maxWidth with the current ctx.font */
  function wrapLines(ctx, text, maxWidth) {
    const lines = [];
    let line = '';
    text.split(' ').forEach(word => {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  /** Cut text with an ellipsis so it fits maxWidth with the current ctx.font */
  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  }

  /* ========================================================
   * Ticket QR code (scanned by admin.html to check guests in)
   * Payload: HUTGRAD:1:<passId>:<url-encoded name> (ASCII-only so any scanner decodes it)
   * ======================================================== */
  function ticketQrPayload(passId, guestName) {
    return `HUTGRAD:1:${passId}:${encodeURIComponent(guestName)}`;
  }

  /**
   * Draw a QR code as dark modules on a light rounded tile.
   * Returns false when the QR library didn't load, so callers can fall back.
   */
  function drawQrCode(ctx, text, x, y, size, dark = '#0d1117', light = '#f0f6fc') {
    if (typeof window.qrcode !== 'function') return false;
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();

    const count = qr.getModuleCount();
    const quiet = 2; // light margin in modules, needed by scanners
    const cell = size / (count + quiet * 2);

    ctx.save();
    ctx.fillStyle = light;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, size, size, size * 0.06);
    else ctx.rect(x, y, size, size);
    ctx.fill();
    ctx.fillStyle = dark;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          // +0.5px overlap hides hairline gaps between modules
          ctx.fillRect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.5, cell + 0.5);
        }
      }
    }
    ctx.restore();
    return true;
  }

  async function renderTicketImage(guestName, passId) {
    const W = 1600;
    const H = 800;
    const ACCENT = '#40c463';
    const SOFT_ACCENT = '#b9a3e0';
    const MUTED = '#8b949e';

    // Make sure web fonts are ready before drawing text on canvas
    if (document.fonts && document.fonts.load) {
      await Promise.all([
        document.fonts.load('900 60px Orbitron'),
        document.fonts.load('700 40px "Space Grotesk"'),
        document.fonts.load('500 30px "Plus Jakarta Sans"'),
        document.fonts.load('600 26px "JetBrains Mono"')
      ]).catch(() => {});
    }

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background
    const bg = ctx.createRadialGradient(W * 0.35, 0, 50, W / 2, H * 0.4, W * 0.8);
    bg.addColorStop(0, '#1c1633');
    bg.addColorStop(0.55, '#0d1117');
    bg.addColorStop(1, '#010409');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Card shell with a mint to purple rim; the stub starts at sx
    const cx = 50, cy = 50, cw = W - 100, ch = H - 100;
    const stubW = 400;
    const sx = cx + cw - stubW;
    const notch = 26;
    ticketPath(ctx, cx, cy, cw, ch, 36, sx, notch);
    ctx.fillStyle = 'rgba(22, 27, 34, 0.92)';
    ctx.fill();
    const border = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
    border.addColorStop(0, ACCENT);
    border.addColorStop(0.5, '#7952b3');
    border.addColorStop(1, '#d2f5dc');
    ctx.lineWidth = 4;
    ctx.strokeStyle = border;
    ctx.shadowColor = 'rgba(64, 196, 99, 0.6)';
    ctx.shadowBlur = 30;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const dashed = (xa, ya, xb, yb, alpha = 0.4) => {
      ctx.save();
      ctx.setLineDash([12, 10]);
      ctx.strokeStyle = `rgba(64, 196, 99, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xa, ya);
      ctx.lineTo(xb, yb);
      ctx.stroke();
      ctx.restore();
    };

    // Perforation between the main pass and the stub
    dashed(sx, cy + notch + 10, sx, cy + ch - notch - 10, 0.6);

    /* ---------- Main section ---------- */
    const x0 = cx + 60;
    const x1 = sx - 50;
    const mainW = x1 - x0;

    // Header row
    ctx.font = '600 24px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#34d399';
    ctx.fillText('STATUS 200', x0, cy + 65);
    ctx.textAlign = 'right';
    ctx.fillStyle = ACCENT;
    ctx.fillText('OFFICIAL PASS // CONFIRMED', x1, cy + 65);
    ctx.textAlign = 'left';
    dashed(x0, cy + 95, x1, cy + 95);

    // Hero title: cap on the left, title stacked beside it
    ctx.font = '104px serif';
    ctx.fillText('🎓', x0 - 6, cy + 255);

    const xT = x0 + 150;
    ctx.font = '900 68px Orbitron, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(64, 196, 99, 0.5)';
    ctx.shadowBlur = 24;
    ctx.fillText('GRADUATION', xT, cy + 195);
    const titleGrad = ctx.createLinearGradient(xT, 0, xT + 560, 0);
    titleGrad.addColorStop(0, ACCENT);
    titleGrad.addColorStop(1, SOFT_ACCENT);
    ctx.fillStyle = titleGrad;
    ctx.font = '900 54px Orbitron, sans-serif';
    ctx.fillText('CLASS OF 2026', xT, cy + 262);
    ctx.shadowBlur = 0;

    ctx.font = '700 30px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('HUTECH — Khoa Công nghệ thông tin', x0, cy + 325);

    // Guest name (drops to two smaller lines for long names)
    ctx.font = '500 26px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText('Trân trọng chào đón', x0, cy + 385);

    let nameSize = 58;
    ctx.font = `700 ${nameSize}px "Space Grotesk", sans-serif`;
    let nameLines = [guestName];
    if (ctx.measureText(guestName).width > mainW) {
      nameSize = 42;
      ctx.font = `700 ${nameSize}px "Space Grotesk", sans-serif`;
      nameLines = wrapLines(ctx, guestName, mainW);
      if (nameLines.length > 2) {
        nameLines = [nameLines[0], fitText(ctx, nameLines.slice(1).join(' '), mainW)];
      }
    }
    ctx.fillStyle = ACCENT;
    ctx.shadowColor = 'rgba(64, 196, 99, 0.55)';
    ctx.shadowBlur = 20;
    nameLines.forEach((line, i) => ctx.fillText(line, x0, cy + 448 + i * nameSize * 1.12));
    ctx.shadowBlur = 0;

    // Event details
    const detailsTop = cy + 525;
    dashed(x0, detailsTop, x1, detailsTop);

    const details = [
      ['DATE', '08/11/2026'],
      ['GUEST ARRIVAL', '10:30 AM'],
      ['CEREMONY', '08:30 AM']
    ];
    details.forEach(([label, value], i) => {
      const x = x0 + i * 260;
      ctx.font = '600 22px "JetBrains Mono", monospace';
      ctx.fillStyle = MUTED;
      ctx.fillText(label, x, detailsTop + 48);
      ctx.font = '700 36px "Space Grotesk", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(value, x, detailsTop + 92);
    });

    ctx.font = '500 25px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = SOFT_ACCENT;
    ctx.fillText('📍 Thu Duc Campus — HUTECH Khu Công nghệ cao TP.HCM', x0, detailsTop + 142);

    /* ---------- Stub ---------- */
    const s0 = sx + 45;
    const s1 = cx + cw - 45;
    const sMid = (s0 + s1) / 2;
    const stubInner = s1 - s0;

    ctx.textAlign = 'center';
    ctx.font = '700 26px "JetBrains Mono", monospace';
    ctx.fillStyle = ACCENT;
    ctx.fillText('ADMIT ONE', sMid, cy + 65);
    dashed(s0, cy + 95, s1, cy + 95);

    const stubField = (label, value, y, size) => {
      ctx.font = '600 20px "JetBrains Mono", monospace';
      ctx.fillStyle = MUTED;
      ctx.fillText(label, sMid, y);
      ctx.font = `700 ${size}px "Space Grotesk", sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(fitText(ctx, value, stubInner), sMid, y + size + 8);
    };
    stubField('GUEST', guestName, cy + 145, 32);
    stubField('ZONE', 'GUEST AREA — HALL A', cy + 220, 24);
    stubField('DATE', '08/11/2026 · 10:30 AM', cy + 290, 24);

    // Check-in QR (admin scans it at the gate)
    const qrSize = 230;
    const qrY = cy + 350;
    const hasQr = drawQrCode(ctx, ticketQrPayload(passId, guestName), sMid - qrSize / 2, qrY, qrSize);

    if (!hasQr) {
      // QR library unavailable: decorative barcode seeded from the pass id
      const barW = stubInner - 20, barH = 120;
      const barX = sMid - barW / 2;
      let seed = 7;
      for (const c of passId) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
      ctx.fillStyle = ACCENT;
      for (let bx = barX; bx < barX + barW;) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        const w = 2 + (seed % 5);
        ctx.fillRect(bx, qrY + 55, Math.min(w, barX + barW - bx), barH);
        bx += w + 2 + ((seed >>> 8) % 4);
      }
    }
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillStyle = MUTED;
    ctx.fillText(fitText(ctx, passId, stubInner), sMid, qrY + qrSize + 42);

    return canvas;
  }

  /* ========================================================
   * RSVP Controller Class
   * ======================================================== */
  class RSVPController {
    constructor() {
      // Views
      this.idleView = document.getElementById('rsvp-form');
      this.scanningView = document.getElementById('rsvp-scanning');
      this.confirmedView = document.getElementById('rsvp-confirmed');
      this.declinedView = document.getElementById('rsvp-declined');

      // Elements
      this.nameInput = document.getElementById('guest-name-input');
      this.inputWrapper = document.getElementById('input-wrapper');
      this.clearBtn = document.getElementById('clear-input-btn');
      this.feedbackEl = document.getElementById('input-feedback');
      this.btnAccept = document.getElementById('btn-accept');
      this.btnDecline = document.getElementById('btn-decline');
      this.stateBadge = document.getElementById('rsvp-state-badge');
      this.scanProgress = document.getElementById('scan-progress-fill');
      this.scanSubtitle = document.getElementById('scan-subtitle');

      // Confirmation display elements
      this.confirmedNameEl = document.getElementById('confirmed-guest-name');
      this.declinedNameEl = document.getElementById('declined-guest-name');
      this.ticketPassIdEl = document.getElementById('ticket-pass-id');
      this.ticketQrEl = document.getElementById('ticket-qr');
      this.btnAddCalendar = document.getElementById('btn-add-calendar');
      this.btnEditRsvp = document.getElementById('btn-edit-rsvp');
      this.btnReconsider = document.getElementById('btn-reconsider');
      this.btnDownloadTicket = document.getElementById('btn-download-ticket');
      this.wishBoxes = Array.from(document.querySelectorAll('[data-wish-box]'));

      // Particle FX instance
      this.celebrationFX = new CelebrationFX('celebration-canvas');

      // State: 'idle' | 'checking' | 'confirmed' | 'declined'
      this.currentState = 'idle';
      this.guestData = {
        name: '',
        status: null,
        passId: '',
        timestamp: null,
        wish: ''
      };

      this.init();
    }

    init() {
      this.loadSavedState();
      this.bindEvents();
      this.bindWishBoxes();
    }

    bindEvents() {
      // Input handling
      this.nameInput.addEventListener('input', () => {
        this.clearFeedback();
        this.toggleClearBtn();
      });

      this.clearBtn.addEventListener('click', () => {
        this.nameInput.value = '';
        this.nameInput.focus();
        this.toggleClearBtn();
        this.clearFeedback();
      });

      // Submit Form (Accept)
      this.idleView.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleAccept();
      });

      // Decline Button
      this.btnDecline.addEventListener('click', () => {
        this.handleDecline();
      });

      // Reset / Edit Response
      if (this.btnEditRsvp) {
        this.btnEditRsvp.addEventListener('click', () => this.resetToIdle());
      }
      if (this.btnReconsider) {
        this.btnReconsider.addEventListener('click', () => this.resetToIdle());
      }

      // Add to Calendar
      if (this.btnAddCalendar) {
        this.btnAddCalendar.addEventListener('click', () => this.exportCalendarEvent());
      }

      // Download ticket as image
      if (this.btnDownloadTicket) {
        this.btnDownloadTicket.addEventListener('click', () => this.downloadTicket());
      }
    }

    bindWishBoxes() {
      this.wishBoxes.forEach(box => {
        const input = box.querySelector('.wish-input');
        const counter = box.querySelector('.wish-counter');

        input.addEventListener('input', () => {
          counter.textContent = `${input.value.length}/500`;
          this.setWishFeedback(box, '');
        });
        box.querySelector('.wish-send').addEventListener('click', () => this.sendWish(box));
      });
      this.renderWishBoxes();
    }

    setWishFeedback(box, message, isError = true) {
      const el = box.querySelector('.wish-feedback');
      el.textContent = message;
      el.className = `wish-feedback ${message ? (isError ? 'feedback-error' : 'feedback-success') : ''}`;
    }

    /** Show the form, or the "sent" state if this guest already sent a wish */
    renderWishBoxes() {
      const wish = this.guestData.wish || '';
      this.wishBoxes.forEach(box => {
        box.classList.toggle('is-sent', !!wish);
        box.querySelector('.wish-sent-text').textContent = wish;
        if (!wish) {
          box.querySelector('.wish-input').value = '';
          box.querySelector('.wish-counter').textContent = '0/500';
          this.setWishFeedback(box, '');
        }
      });
    }

    async sendWish(box) {
      const input = box.querySelector('.wish-input');
      const sendBtn = box.querySelector('.wish-send');
      const message = input.value.trim();

      if (!message) {
        this.setWishFeedback(box, 'Bạn hãy viết vài lời chúc trước khi gửi nhé.');
        input.focus();
        window.SoundFX && window.SoundFX.playError();
        return;
      }
      if (sendBtn.disabled || !this.guestData.name) return;

      sendBtn.disabled = true;
      this.setWishFeedback(box, 'Đang gửi lời chúc...', false);

      try {
        const result = await submitWish(this.guestData.name, message);
        if (!result.saved) throw new Error(result.error || 'Wish not saved');

        this.guestData.wish = message;
        this.saveState();
        this.renderWishBoxes();
        window.SoundFX && window.SoundFX.playSuccess();
        window.showCyberToast('💌 Đã gửi lời chúc, cảm ơn bạn!');
      } catch (err) {
        console.error('Wish error:', err);
        this.setWishFeedback(box, 'Chưa gửi được lời chúc. Vui lòng thử lại sau ít phút.');
        window.SoundFX && window.SoundFX.playError();
      } finally {
        sendBtn.disabled = false;
      }
    }

    toggleClearBtn() {
      if (this.clearBtn) {
        this.clearBtn.style.display = this.nameInput.value.trim() ? 'block' : 'none';
      }
    }

    showFeedback(message, isError = true) {
      if (!this.feedbackEl) return;
      this.feedbackEl.textContent = message;
      this.feedbackEl.className = `input-feedback ${isError ? 'feedback-error' : 'feedback-success'}`;
      if (isError) {
        this.inputWrapper.classList.add('input-shake');
        setTimeout(() => this.inputWrapper.classList.remove('input-shake'), 600);
      }
    }

    clearFeedback() {
      if (!this.feedbackEl) return;
      this.feedbackEl.textContent = '';
      this.feedbackEl.className = 'input-feedback';
    }

    setState(newState) {
      this.currentState = newState;

      // Update state badge
      if (this.stateBadge) {
        this.stateBadge.textContent = `STATE: ${newState.toUpperCase()}`;
        this.stateBadge.className = `status-badge badge-${newState.replace(/\s+/g, '-')}`;
      }

      // Hide all views
      [this.idleView, this.scanningView, this.confirmedView, this.declinedView].forEach(v => {
        if (v) v.classList.remove('active');
      });

      // Activate appropriate view
      if (newState === 'idle') {
        this.idleView.classList.add('active');
      } else if (newState === 'checking guest') {
        this.scanningView.classList.add('active');
      } else if (newState === 'confirmed') {
        this.confirmedView.classList.add('active');
      } else if (newState === 'declined') {
        this.declinedView.classList.add('active');
      }
    }

    handleAccept() {
      const rawName = this.nameInput.value.trim();
      if (!rawName) {
        this.showFeedback('Vui lòng nhập họ và tên của bạn để xác nhận.');
        this.nameInput.focus();
        window.SoundFX && window.SoundFX.playError();
        return;
      }

      if (rawName.length < 2) {
        this.showFeedback('Họ và tên quá ngắn. Vui lòng nhập tối thiểu 2 ký tự.');
        this.nameInput.focus();
        window.SoundFX && window.SoundFX.playError();
        return;
      }

      window.SoundFX && window.SoundFX.playBeep();
      this.processRSVP(rawName, 'confirmed');
    }

    handleDecline() {
      const rawName = this.nameInput.value.trim();
      if (!rawName) {
        this.showFeedback('Vui lòng nhập họ và tên trước khi chọn từ chối để hệ thống ghi nhận.');
        this.nameInput.focus();
        window.SoundFX && window.SoundFX.playError();
        return;
      }

      window.SoundFX && window.SoundFX.playMuted();
      this.processRSVP(rawName, 'declined');
    }

    async processRSVP(guestName, status) {
      if (this.isSubmitting) return;
      this.isSubmitting = true;

      // Transition to checking state
      this.setState('checking guest');
      if (this.scanSubtitle) {
        this.scanSubtitle.textContent = `Đang đồng bộ giao thức xác thực khách mời [${guestName}]...`;
      }

      // Animate progress bar
      if (this.scanProgress) {
        this.scanProgress.style.width = '0%';
        setTimeout(() => { this.scanProgress.style.width = '65%'; }, 150);
        setTimeout(() => { this.scanProgress.style.width = '100%'; }, 550);
      }

      try {
        // Keep the scanning animation visible for at least 750ms
        const minDelay = new Promise(resolve => setTimeout(resolve, 750));
        const [result] = await Promise.all([submitRsvp(guestName, status), minDelay]);

        if (!result.saved) {
          throw new Error(result.error || 'RSVP not saved');
        }

        // Use the name as stored in the sheet (first spelling wins for duplicates),
        // and the pass already on Drive if this guest has one
        const displayName = result.name || guestName;
        const passId = result.passId || this.generatePassId();
        this.guestData = {
          name: displayName,
          status: status,
          passId: passId,
          timestamp: new Date().toISOString(),
          wish: '',
          ticketSaved: !!result.passId
        };

        this.saveState();
        this.renderWishBoxes();

        if (status === 'confirmed') {
          this.showConfirmed(displayName, passId);
          this.syncTicket();
        } else {
          this.showDeclined(displayName);
        }

        // Name already on the list: the sheet kept the first response, the guest can still add a wish.
        // After a retry, "already there" may just be this guest's own first attempt, so stay quiet.
        if (result.isNew === false && !result.retried) {
          window.showCyberToast(`👋 ${displayName} đã đăng ký trước đó — bạn vẫn có thể gửi thêm lời chúc nhé!`, 4500);
        }
      } catch (err) {
        console.error('RSVP error:', err);
        this.setState('idle');
        this.showFeedback('Không thể kết nối tới hệ thống. Vui lòng thử lại sau ít phút.');
        window.SoundFX && window.SoundFX.playError();
      } finally {
        this.isSubmitting = false;
      }
    }

    /**
     * Upload this guest's ticket image to the host's Drive in the background.
     * Runs after a new confirmation and again on later visits until it succeeds,
     * so guests who confirmed before this existed get their ticket saved too.
     */
    async syncTicket() {
      const guest = this.guestData;
      if (this.isSyncingTicket || guest.status !== 'confirmed' || guest.ticketSaved || !guest.passId) return;
      this.isSyncingTicket = true;

      try {
        const canvas = await renderTicketImage(guest.name, guest.passId);
        const result = await submitTicket(guest.name, guest.passId, canvas.toDataURL('image/jpeg', 0.9));
        // "Not attending" / "Guest not found" won't change on retry, so stop trying for those too
        if (result.saved || result.error === 'Not attending' || result.error === 'Guest not found') {
          // Guest reset or re-submitted meanwhile: don't mark the new session
          if (this.guestData !== guest) return;
          guest.ticketSaved = true;
          if (result.passId && result.passId !== guest.passId) {
            // A ticket from an earlier visit is on Drive: show that same pass here
            guest.passId = result.passId;
            if (this.ticketPassIdEl) this.ticketPassIdEl.textContent = result.passId;
            this.renderTicketQr(guest.name, result.passId);
          }
          this.saveState();
        }
      } catch (err) {
        console.warn('Ticket sync failed, will retry on next visit:', err);
      } finally {
        this.isSyncingTicket = false;
      }
    }

    generatePassId() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return `HUT-IT-2026-${code}`;
    }

    /** Draw the check-in QR on the on-page ticket (same payload as the downloadable image) */
    renderTicketQr(guestName, passId) {
      const canvas = this.ticketQrEl;
      if (!canvas || !passId) return;
      const size = 240; // drawn at 2x, shown smaller via CSS
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      canvas.hidden = !drawQrCode(ctx, ticketQrPayload(passId, guestName), 0, 0, size);
    }

    showConfirmed(guestName, passId) {
      if (this.confirmedNameEl) this.confirmedNameEl.textContent = guestName;
      if (this.ticketPassIdEl) this.ticketPassIdEl.textContent = passId;
      this.renderTicketQr(guestName, passId);

      this.setState('confirmed');
      window.BgMusic && window.BgMusic.duck();
      window.SoundFX && window.SoundFX.playSuccess();

      // Launch celebratory particle confetti
      this.celebrationFX.burst();

      // Notification toast
      window.showCyberToast(`✓ Xác nhận tham dự thành công: ${guestName}`);
    }

    showDeclined(guestName) {
      if (this.declinedNameEl) this.declinedNameEl.textContent = guestName;

      this.setState('declined');
      window.SoundFX && window.SoundFX.playMuted();

      // Soft falling petals instead of a celebration burst
      this.celebrationFX.petals();

      window.showCyberToast(`💐 Đã ghi nhận phản hồi từ: ${guestName}`);
    }

    resetToIdle() {
      this.guestData = { name: '', status: null, passId: '', timestamp: null, wish: '' };
      localStorage.removeItem(STORAGE_KEY);
      this.renderWishBoxes();
      this.nameInput.value = '';
      this.toggleClearBtn();
      this.clearFeedback();
      this.setState('idle');
      this.celebrationFX.stop();
      window.SoundFX && window.SoundFX.playBeep();
      setTimeout(() => this.nameInput.focus(), 100);
    }

    saveState() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.guestData));
      } catch (e) {
        console.warn('LocalStorage error:', e);
      }
    }

    loadSavedState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.name && parsed.status) {
            this.guestData = parsed;
            this.nameInput.value = parsed.name;
            this.toggleClearBtn();

            if (parsed.status === 'confirmed') {
              if (this.confirmedNameEl) this.confirmedNameEl.textContent = parsed.name;
              if (!parsed.passId) this.guestData.passId = this.generatePassId();
              if (this.ticketPassIdEl) this.ticketPassIdEl.textContent = this.guestData.passId;
              this.renderTicketQr(parsed.name, this.guestData.passId);
              this.setState('confirmed');
              // Returning guest whose ticket isn't on Drive yet (e.g. confirmed before tickets were saved)
              setTimeout(() => this.syncTicket(), 1500);
            } else if (parsed.status === 'declined') {
              if (this.declinedNameEl) this.declinedNameEl.textContent = parsed.name;
              this.setState('declined');
            }
            return;
          }
        }
      } catch (e) {
        console.warn('Error reading saved RSVP:', e);
      }

      this.setState('idle');
    }

    /** Render the confirmed pass onto a canvas and save it as a PNG */
    async downloadTicket() {
      if (this.isRenderingTicket) return;
      this.isRenderingTicket = true;

      try {
        const name = this.guestData.name || this.confirmedNameEl.textContent;
        const passId = this.guestData.passId || this.ticketPassIdEl.textContent;
        const canvas = await renderTicketImage(name, passId);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const fileName = `ve-moi-tot-nghiep-${passId}.png`;

        // On phones the share sheet lets guests save straight to Photos
        const file = new File([blob], fileName, { type: 'image/png' });
        const isTouch = window.matchMedia('(pointer: coarse)').matches;
        if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: 'Vé mời Lễ Tốt Nghiệp' });
            return;
          } catch (err) {
            if (err.name === 'AbortError') return;
            // Otherwise fall through to a normal download
          }
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        window.showCyberToast('🖼️ Đã tải vé về máy!');
      } catch (err) {
        console.error('Ticket export error:', err);
        window.showCyberToast('Không tạo được ảnh vé, vui lòng thử lại.');
      } finally {
        this.isRenderingTicket = false;
      }
    }

    exportCalendarEvent() {
      const title = 'Lễ Tốt Nghiệp — HUTECH Khoa Công nghệ thông tin';
      const location = 'Thu Duc Campus — HUTECH Khu Công nghệ cao TP.HCM';
      const description = 'Lễ Trao Bằng Tốt Nghiệp Kỹ Sư Công Nghệ Thông Tin ĐH HUTECH. Giờ đón khách: 10:30 AM (lễ bắt đầu lúc 08:30).';
      
      // Guest arrival 2026-11-08 10:30 to 12:30 (UTC+7 -> UTC: 20261108T033000Z to 20261108T053000Z)
      const startDate = '20261108T033000Z';
      const endDate = '20261108T053000Z';

      // Open Google Calendar event creation URL directly
      const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDate}/${endDate}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}`;
      window.open(googleCalUrl, '_blank', 'noopener,noreferrer');
      window.showCyberToast('📅 Đang mở Google Calendar...');
    }
  }

  // Expose globally
  window.RSVPController = RSVPController;
  // Exposed for local previews/tests
  window.GradTicket = { renderTicketImage, ticketQrPayload };
})();
