/**
 * rsvp.js
 * Guest Verification & RSVP Interaction Engine
 * Features:
 * - State management: idle -> checking -> confirmed | declined
 * - Guest verification & RSVP storage via Google Apps Script + Google Sheet
 * - Celebratory cyber particle burst system on #celebration-canvas
 * - High-tech confirmation ticket with unique pass hash
 * - Calendar integration (.ics export / Google Calendar URL)
 * - Local storage persistence for seamless guest session
 */

(function () {
  'use strict';

  // Constants
  const STORAGE_KEY = 'hutech_grad_rsvp_2026';

  // Google Apps Script Web App URL (see backend/README.md). Paste the /exec URL here.
  const API_URL = 'https://script.google.com/macros/s/AKfycbxWwwsPYZffKC5PvjCm1gssKdZofaiHLcbv91wf_fkfFwWWKvpTW4SciR1YnVUWg7VJ/exec';

  /**
   * Send an RSVP to the Apps Script backend.
   * New names are added to the sheet; existing names get their status updated.
   * Returns { saved: true, isNew, name } | { error }
   */
  async function submitRsvp(name, status) {
    if (!API_URL) {
      throw new Error('API_URL is not configured in rsvp.js');
    }
    // No Content-Type header -> sent as text/plain, which avoids a CORS preflight to Apps Script
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'rsvp',
        name: name,
        status: status === 'confirmed' ? 'Accepted' : 'Declined'
      })
    });
    return res.json();
  }

  /* ========================================================
   * Celebration Confetti / Particle Engine
   * ======================================================== */
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
        '#ff2e93', // Hot pink
        '#ff85c0', // Soft pink
        '#e11d74', // Deep rose
        '#facc15', // Radiant gold
        '#f43f5e', // HUTECH red accent
        '#ffffff'  // Pure star white
      ];

      const originX = this.width / 2;
      const originY = Math.min(this.height * 0.45, this.height - 180);

      for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 9;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const isShapeRect = Math.random() > 0.5;

        this.particles.push({
          x: originX + (Math.random() - 0.5) * 80,
          y: originY + (Math.random() - 0.5) * 40,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3.5, // Initial upward kick
          size: 3 + Math.random() * 5,
          color: color,
          alpha: 1,
          decay: 0.008 + Math.random() * 0.014,
          rotation: Math.random() * 360,
          rotSpeed: (Math.random() - 0.5) * 12,
          isRect: isShapeRect,
          gravity: 0.18
        });
      }

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
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.98;
        p.rotation += p.rotSpeed;
        p.alpha -= p.decay;

        this.ctx.save();
        this.ctx.globalAlpha = Math.max(0, p.alpha);
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate((p.rotation * Math.PI) / 180);
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
      this.btnAddCalendar = document.getElementById('btn-add-calendar');
      this.btnEditRsvp = document.getElementById('btn-edit-rsvp');
      this.btnReconsider = document.getElementById('btn-reconsider');

      // Particle FX instance
      this.celebrationFX = new CelebrationFX('celebration-canvas');

      // State: 'idle' | 'checking' | 'confirmed' | 'declined'
      this.currentState = 'idle';
      this.guestData = {
        name: '',
        status: null,
        passId: '',
        timestamp: null
      };

      this.init();
    }

    init() {
      this.loadSavedState();
      this.bindEvents();
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

        // Use the name as stored in the sheet (first spelling wins for duplicates)
        const displayName = result.name || guestName;
        const passId = this.generatePassId();
        this.guestData = {
          name: displayName,
          status: status,
          passId: passId,
          timestamp: new Date().toISOString()
        };

        this.saveState();

        if (status === 'confirmed') {
          this.showConfirmed(displayName, passId);
        } else {
          this.showDeclined(displayName);
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

    generatePassId() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return `HUT-IT-2026-${code}`;
    }

    showConfirmed(guestName, passId) {
      if (this.confirmedNameEl) this.confirmedNameEl.textContent = guestName;
      if (this.ticketPassIdEl) this.ticketPassIdEl.textContent = passId;

      this.setState('confirmed');
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

      window.showCyberToast(`Đã ghi nhận phản hồi từ: ${guestName}`);
    }

    resetToIdle() {
      this.guestData = { name: '', status: null, passId: '', timestamp: null };
      localStorage.removeItem(STORAGE_KEY);
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
              if (this.ticketPassIdEl) this.ticketPassIdEl.textContent = parsed.passId || 'HUT-IT-2026-CONFIRMED';
              this.setState('confirmed');
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

    exportCalendarEvent() {
      const title = 'Lễ Tốt Nghiệp — HUTECH Khoa Công nghệ thông tin';
      const location = 'Thu Duc Campus — HUTECH Khu Công nghệ cao TP.HCM';
      const description = 'Lễ Trao Bằng Tốt Nghiệp Kỹ Sư & Cử Nhân Công Nghệ Thông Tin ĐH HUTECH. Giờ đón khách: 07:30 AM.';
      
      // Target: 2026-11-01 08:00 to 12:00 (UTC+7 -> UTC: 20261101T010000Z to 20261101T050000Z)
      const startDate = '20261101T010000Z';
      const endDate = '20261101T050000Z';

      // Open Google Calendar event creation URL directly
      const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDate}/${endDate}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}`;
      window.open(googleCalUrl, '_blank', 'noopener,noreferrer');
      window.showCyberToast('📅 Đang mở Google Calendar...');
    }
  }

  // Expose globally
  window.RSVPController = RSVPController;
})();
