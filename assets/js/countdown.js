/**
 * countdown.js
 * Futuristic Digital HUD Countdown
 * Target: November 1, 2026 at 08:00 AM (UTC+7)
 * Features:
 * - Precise second-by-second calculation
 * - Cyber digital glow and glitch tick animation
 * - Handles event in-progress and completion states gracefully
 */

(function () {
  'use strict';

  // Target: November 1, 2026 at 08:00 AM ICT (UTC+7)
  const TARGET_DATE = new Date('2026-11-01T08:00:00+07:00').getTime();

  class CountdownTimer {
    constructor() {
      this.daysEl = document.getElementById('days');
      this.hoursEl = document.getElementById('hours');
      this.minutesEl = document.getElementById('minutes');
      this.secondsEl = document.getElementById('seconds');

      this.daysGlowEl = document.getElementById('days-glow');
      this.hoursGlowEl = document.getElementById('hours-glow');
      this.minutesGlowEl = document.getElementById('minutes-glow');
      this.secondsGlowEl = document.getElementById('seconds-glow');

      this.statusEl = document.getElementById('countdown-status');
      this.timerId = null;

      this.previousValues = {
        days: null,
        hours: null,
        minutes: null,
        seconds: null
      };

      this.init();
    }

    init() {
      this.tick();
      this.timerId = setInterval(() => this.tick(), 1000);
    }

    formatNumber(num) {
      return String(Math.max(0, Math.floor(num))).padStart(2, '0');
    }

    updateElement(mainEl, glowEl, newValue, unitKey) {
      if (!mainEl) return;
      const formatted = this.formatNumber(newValue);

      if (this.previousValues[unitKey] !== formatted) {
        // Trigger subtle digit pulse / glitch class
        mainEl.textContent = formatted;
        if (glowEl) glowEl.textContent = formatted;

        const parentBox = mainEl.closest('.digit-box');
        if (parentBox) {
          parentBox.classList.remove('digit-tick');
          // Force DOM reflow
          void parentBox.offsetWidth;
          parentBox.classList.add('digit-tick');
        }

        this.previousValues[unitKey] = formatted;
      }
    }

    tick() {
      const now = Date.now();
      const distance = TARGET_DATE - now;

      // Event is currently happening (within 6 hours after 08:00)
      if (distance <= 0 && distance >= -6 * 60 * 60 * 1000) {
        this.setPassedState(
          'CEREMONY LIVE',
          'LỄ TỐT NGHIỆP ĐANG DIỄN RA TẠI THU DUC CAMPUS',
          true
        );
        return;
      }

      // Event has concluded
      if (distance < -6 * 60 * 60 * 1000) {
        this.setPassedState(
          'COMPLETED',
          'LỄ TỐT NGHIỆP 2026 ĐÃ HOÀN TẤT TRỌN VẸN',
          false
        );
        return;
      }

      // Time calculations
      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      this.updateElement(this.daysEl, this.daysGlowEl, days, 'days');
      this.updateElement(this.hoursEl, this.hoursGlowEl, hours, 'hours');
      this.updateElement(this.minutesEl, this.minutesGlowEl, minutes, 'minutes');
      this.updateElement(this.secondsEl, this.secondsGlowEl, seconds, 'seconds');
    }

    setPassedState(statusTag, message, isLive) {
      if (this.daysEl) this.daysEl.textContent = '00';
      if (this.hoursEl) this.hoursEl.textContent = '00';
      if (this.minutesEl) this.minutesEl.textContent = '00';
      if (this.secondsEl) this.secondsEl.textContent = '00';

      if (this.statusEl) {
        this.statusEl.innerHTML = `
          <span class="pulse-radar ${isLive ? 'pulse-live' : ''}"></span>
          <span class="status-msg">${message}</span>
        `;
      }
    }

    destroy() {
      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
    }
  }

  // Expose globally
  window.CountdownTimer = CountdownTimer;
})();
