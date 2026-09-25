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
   * Background Music
   * On by default, but browsers only allow playback after the
   * guest's first tap/click/key, so it starts on that gesture.
   * Turning it off is remembered for later visits.
   * ======================================================== */
  const MUSIC_PREF_KEY = 'hutech_grad_music';

  class BackgroundMusic {
    constructor(src) {
      this.btn = document.getElementById('music-toggle-btn');
      if (!this.btn) return;

      this.volume = 0.5;
      this.audio = new Audio(src);
      this.audio.loop = true;
      this.audio.preload = 'auto';
      this.audio.volume = this.volume;

      let pref = null;
      try { pref = localStorage.getItem(MUSIC_PREF_KEY); } catch (e) { /* storage blocked */ }
      this.wantsMusic = pref !== 'off';
      this.render();

      this.btn.addEventListener('click', () => this.toggle());

      // Start on the first gesture anywhere (the button handles its own click)
      const events = ['pointerdown', 'keydown', 'touchstart'];
      const onFirstGesture = (e) => {
        events.forEach(ev => document.removeEventListener(ev, onFirstGesture, true));
        if (this.btn.contains(e.target)) return;
        if (this.wantsMusic) this.play();
      };
      events.forEach(ev => document.addEventListener(ev, onFirstGesture, true));

      // Pause while the tab is in the background (phones keep playing otherwise)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.audio.pause();
        else if (this.wantsMusic && this.started) this.play();
      });
    }

    play() {
      this.audio.play().then(() => {
        this.started = true;
        this.render();
      }).catch(() => {
        // Blocked until a real user gesture; the next tap on the button will retry
      });
    }

    toggle() {
      // Follow what the guest sees: a silent button means "turn on", even before the first play
      this.wantsMusic = this.audio.paused;
      try { localStorage.setItem(MUSIC_PREF_KEY, this.wantsMusic ? 'on' : 'off'); } catch (e) { /* storage blocked */ }

      if (this.wantsMusic) {
        this.play();
        window.showCyberToast('🎵 Nhạc nền: BẬT');
      } else {
        this.audio.pause();
        window.showCyberToast('🎵 Nhạc nền: TẮT');
      }
      this.render();
    }

    /** Briefly lower the music so a celebration sound can be heard */
    duck(ms = 2500) {
      if (!this.audio || this.audio.paused) return;
      this.audio.volume = this.volume * 0.3;
      clearTimeout(this.duckTimer);
      this.duckTimer = setTimeout(() => { this.audio.volume = this.volume; }, ms);
    }

    render() {
      const playing = this.wantsMusic && !this.audio.paused;
      this.btn.classList.toggle('sound-active', playing);
      this.btn.setAttribute('aria-pressed', String(playing));
      this.btn.querySelector('.music-text').textContent = playing ? 'MUSIC ON' : 'MUSIC OFF';
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
    window.BgMusic = new BackgroundMusic('assets/audio/nhacnen.mp4');

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
