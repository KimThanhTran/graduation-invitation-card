/**
 * main.js
 * Master Initialization & Micro-Interaction Coordinator
 * Features:
 * - Initializes Matrix rain, Countdown, RSVP controller
 * - Web Audio API synthesized cyber sound effects (zero external files required)
 * - 3D parallax tilt micro-interaction on the hero graduation card
 * - Link sharing with cyber toast notification
 * - Card entrance and HUD micro-animations
 */

(function () {
  'use strict';

  /* ========================================================
   * Synthesized Cyber Audio FX (Web Audio API)
   * ======================================================== */
  class CyberAudioEngine {
    constructor() {
      this.audioCtx = null;
      this.isMuted = true; // Off by default for respectful UX
      this.soundBtn = document.getElementById('sound-toggle-btn');

      if (this.soundBtn) {
        this.soundBtn.addEventListener('click', () => this.toggleSound());
      }
    }

    ensureContext() {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.audioCtx = new AudioContext();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    }

    toggleSound() {
      this.ensureContext();
      this.isMuted = !this.isMuted;
      
      if (this.soundBtn) {
        const icon = this.soundBtn.querySelector('.sound-icon');
        const text = this.soundBtn.querySelector('.sound-text');
        if (this.isMuted) {
          if (icon) icon.textContent = '🔇';
          if (text) text.textContent = 'FX OFF';
          this.soundBtn.classList.remove('sound-active');
          window.showCyberToast('Âm thanh hiệu ứng: TẮT');
        } else {
          if (icon) icon.textContent = '🔊';
          if (text) text.textContent = 'FX ON';
          this.soundBtn.classList.add('sound-active');
          window.showCyberToast('Âm thanh hiệu ứng: BẬT');
          this.playBeep(880, 0.08);
        }
      }
    }

    playBeep(freq = 600, duration = 0.06, type = 'sine') {
      if (this.isMuted) return;
      this.ensureContext();
      if (!this.audioCtx) return;

      try {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
      } catch (e) {
        // Audio error silent fallback
      }
    }

    playSuccess() {
      if (this.isMuted) return;
      this.ensureContext();
      if (!this.audioCtx) return;

      const chords = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      chords.forEach((freq, idx) => {
        setTimeout(() => {
          this.playBeep(freq, 0.25, 'triangle');
        }, idx * 90);
      });
    }

    playMuted() {
      if (this.isMuted) return;
      this.playBeep(320, 0.15, 'sawtooth');
    }

    playError() {
      if (this.isMuted) return;
      this.playBeep(220, 0.12, 'square');
      setTimeout(() => this.playBeep(180, 0.18, 'square'), 120);
    }
  }

  /* ========================================================
   * Cyber Toast Notification
   * ======================================================== */
  window.showCyberToast = function (message, duration = 3000) {
    const toast = document.getElementById('cyber-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('visible');

    if (window._toastTimeout) {
      clearTimeout(window._toastTimeout);
    }

    window._toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, duration);
  };

  /* ========================================================
   * Photo Card 3D Tilt / Parallax Effect
   * ======================================================== */
  function initPhotoTilt() {
    const photoContainer = document.getElementById('photo-container');
    if (!photoContainer || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Only apply on non-touch devices with hover capabilities
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      photoContainer.addEventListener('mousemove', (e) => {
        const rect = photoContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -10;
        const rotateY = ((x - centerX) / centerX) * 10;

        photoContainer.style.transform = `perspective(800px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
      });

      photoContainer.addEventListener('mouseleave', () => {
        photoContainer.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      });
    }
  }

  /* ========================================================
   * Share Button Handler
   * ======================================================== */
  function initShareButton() {
    const shareBtn = document.getElementById('share-btn');
    if (!shareBtn) return;

    shareBtn.addEventListener('click', async () => {
      window.SoundFX && window.SoundFX.playBeep(720, 0.08);

      const shareData = {
        title: 'GRADUATION INVITATION | HUTECH IT',
        text: 'Trân trọng kính mời bạn đến tham dự Lễ Tốt Nghiệp — Khoa Công nghệ thông tin, Đại học HUTECH ngày 01/11/2026!',
        url: window.location.href
      };

      if (navigator.share && window.innerWidth < 768) {
        try {
          await navigator.share(shareData);
          return;
        } catch (e) {
          // Fallback to clipboard
        }
      }

      // Copy link to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        window.showCyberToast('🔗 Đã sao chép link lời mời vào bộ nhớ tạm!');
      } catch (err) {
        window.showCyberToast('🔗 Link: ' + window.location.href);
      }
    });
  }

  /* ========================================================
   * Initialize All Modules on DOM Ready
   * ======================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Sound FX
    window.SoundFX = new CyberAudioEngine();

    // 2. Initialize Matrix Background
    if (window.MatrixRain) {
      new window.MatrixRain('matrix-canvas');
    }

    // 3. Initialize Countdown Timer
    if (window.CountdownTimer) {
      new window.CountdownTimer();
    }

    // 4. Initialize RSVP Controller
    if (window.RSVPController) {
      new window.RSVPController();
    }

    // 5. Initialize Micro-Interactions
    initPhotoTilt();
    initShareButton();

    // Add entrance animation class to main card
    const card = document.getElementById('invitation-card');
    if (card) {
      requestAnimationFrame(() => {
        card.classList.add('card-entered');
      });
    }

    console.log(
      '%c 🎓 GRADUATION INVITATION // HUTECH IT 2026 %c System initialized.',
      'background: #ff2e93; color: #000; font-weight: bold; padding: 4px 8px; border-radius: 3px;',
      'color: #ff85c0;'
    );
  });
})();
