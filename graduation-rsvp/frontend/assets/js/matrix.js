/**
 * matrix.js
 * Cyber Graduation Rain Background
 * Features:
 * - Emoji characters: 🎓, 📜, 💻, 📚, ✨, ⚡, 👨‍💻, 👩‍💻
 * - Vertical falling streams with variable speeds and opacities
 * - Subtle hot pink / rose / blush accents with fading trail
 * - Non-intrusive subtle background so text readability remains pristine
 * - Fully responsive with Retina / mobile performance throttling
 */

(function () {
  'use strict';

  const CHARACTERS = ['🎓', '📜', '💻', '📚', '✨', '⚡', '👨‍💻', '👩‍💻'];
  
  // Neon accent colors for the trailing glow & highlights
  const ACCENT_COLORS = [
    { text: '#ff2e93', glow: 'rgba(255, 46, 147, 0.45)' }, // Hot Pink
    { text: '#ff85c0', glow: 'rgba(255, 133, 192, 0.4)' },  // Soft Pink
    { text: '#e11d74', glow: 'rgba(225, 29, 116, 0.4)' },  // Deep Rose
    { text: '#f9a8d4', glow: 'rgba(249, 168, 212, 0.35)' }, // Blush Glow
    { text: '#fcd34d', glow: 'rgba(252, 211, 77, 0.35)' }   // Subtle Gold
  ];

  class MatrixRain {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;

      this.ctx = this.canvas.getContext('2d');
      this.columns = [];
      this.fontSize = 26;
      this.columnWidth = 32;
      this.isRunning = false;
      this.rafId = null;
      this.lastFrameTime = 0;
      this.targetFps = 35; // Smooth yet battery-friendly frame rate
      this.frameInterval = 1000 / this.targetFps;

      this.init();
    }

    init() {
      this.resize();
      this.setupColumns();
      this.bindEvents();
      this.start();
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

      // Adjust column spacing based on device width
      if (this.width < 640) {
        this.fontSize = 20;
        this.columnWidth = 26;
      } else if (this.width < 1024) {
        this.fontSize = 22;
        this.columnWidth = 28;
      } else {
        this.fontSize = 26;
        this.columnWidth = 34;
      }

      this.numColumns = Math.floor(this.width / this.columnWidth);
    }

    setupColumns() {
      this.columns = [];
      for (let i = 0; i < this.numColumns; i++) {
        const colorObj = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
        this.columns.push({
          x: i * this.columnWidth + (this.columnWidth - this.fontSize) / 2,
          y: Math.random() * -this.height, // Stagger initial start positions
          speed: 1.2 + Math.random() * 2.2, // Random speed
          char: CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)],
          opacity: 0.12 + Math.random() * 0.38, // Subtle opacity to avoid distracting from card
          glowColor: colorObj.glow,
          textColor: colorObj.text,
          changeCounter: Math.floor(Math.random() * 20),
          step: Math.floor(Math.random() * 8)
        });
      }
    }

    bindEvents() {
      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          this.resize();
          this.setupColumns();
        }, 150);
      });

      // Pause when tab not visible to save CPU/battery
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.stop();
        } else {
          this.start();
        }
      });
    }

    render(timestamp) {
      if (!this.isRunning) return;

      const elapsed = timestamp - this.lastFrameTime;
      if (elapsed > this.frameInterval) {
        this.lastFrameTime = timestamp - (elapsed % this.frameInterval);

        // Fading dark trail effect
        // Dark navy-black with subtle transparency
        this.ctx.fillStyle = 'rgba(5, 4, 5, 0.18)';
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.ctx.font = `${this.fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        for (let i = 0; i < this.columns.length; i++) {
          const col = this.columns[i];

          // Periodically mutate character
          col.changeCounter++;
          if (col.changeCounter > 15) {
            col.char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
            col.changeCounter = 0;
          }

          // Render subtle neon glow around character
          this.ctx.save();
          this.ctx.globalAlpha = col.opacity;
          this.ctx.shadowColor = col.glowColor;
          this.ctx.shadowBlur = 8;
          
          this.ctx.fillText(col.char, col.x, col.y);
          this.ctx.restore();

          // Advance position
          col.y += col.speed * 4;

          // Reset when drop falls beyond the screen
          if (col.y > this.height + 40) {
            col.y = -30 - Math.random() * 60;
            col.speed = 1.0 + Math.random() * 2.2;
            col.opacity = 0.12 + Math.random() * 0.38;
            col.char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
            const colorObj = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
            col.glowColor = colorObj.glow;
            col.textColor = colorObj.text;
          }
        }
      }

      this.rafId = requestAnimationFrame((t) => this.render(t));
    }

    start() {
      if (!this.isRunning) {
        this.isRunning = true;
        this.lastFrameTime = performance.now();
        this.rafId = requestAnimationFrame((t) => this.render(t));
      }
    }

    stop() {
      this.isRunning = false;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }
  }

  // Expose globally
  window.MatrixRain = MatrixRain;
})();
