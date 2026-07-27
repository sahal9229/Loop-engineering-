/* ==========================================================================
   NEON SNAKE — Premium Arcade Edition
   Vanilla JS game engine — no frameworks, no external libraries.
   ========================================================================== */
(() => {
  'use strict';

  /* ======================================================================
     CONSTANTS & CONFIG
     ====================================================================== */
  const GRID_SIZE = 22; // cols === rows

  const COLORS = {
    blue: '#3ab4ff',
    cyan: '#23f7dd',
    purple: '#b464ff',
    pink: '#ff4fd8',
    gold: '#ffd23a',
    green: '#4dff9e',
    red: '#ff4f6d',
    white: '#eaf6ff'
  };

  const DIFFICULTY = {
    easy:   { label: 'Easy',   movesPerSec: 6,  powerupMult: 1.35, spawnMult: 1.3 },
    medium: { label: 'Medium', movesPerSec: 9,  powerupMult: 1.0,  spawnMult: 1.0 },
    hard:   { label: 'Hard',   movesPerSec: 13, powerupMult: 0.8,  spawnMult: 0.8 },
    insane: { label: 'Insane', movesPerSec: 18, powerupMult: 0.6,  spawnMult: 0.6 }
  };

  const MODE_LABEL = { classic: 'Classic', wrap: 'Wrap Around' };

  const DIRS = {
    up:    { x: 0, y: -1 },
    down:  { x: 0, y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  const COMBO_WINDOW = 4200; // ms — time allowed between eats to keep combo alive
  const MAX_COMBO = 9;

  const STORAGE_KEY = 'neonSnake.stats.v1';

  /* ======================================================================
     HELPERS
     ====================================================================== */
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const choice = (arr) => arr[randInt(0, arr.length - 1)];
  const easeOutBack = (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  function weightedPick(entries) {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const e of entries) {
      if (r < e.weight) return e.key;
      r -= e.weight;
    }
    return entries[entries.length - 1].key;
  }
  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  /* ======================================================================
     STORAGE (persistent stats)
     ====================================================================== */
  const Storage = {
    defaults: { highScore: 0, gamesPlayed: 0, longestSnake: 3, highestLevel: 1, totalApples: 0 },
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...this.defaults };
        return { ...this.defaults, ...JSON.parse(raw) };
      } catch (e) {
        return { ...this.defaults };
      }
    },
    save(stats) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch (e) { /* ignore quota errors */ }
    }
  };

  /* ======================================================================
     AUDIO ENGINE — Web Audio API, fully synthesized, no audio files
     ====================================================================== */
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.muted = false;
      this.musicOn = true;
      this.musicNodes = null;
    }

    ensureContext() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
    }

    resume() {
      this.ensureContext();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    setMuted(muted) {
      this.muted = muted;
      if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }

    setMusicOn(on) {
      this.musicOn = on;
      if (!this.ctx) return;
      if (on) this.startMusic(); else this.stopMusic();
    }

    tone(freq, dur, { type = 'sine', gain = 0.25, delay = 0, glideTo = null, filterFreq = null } = {}) {
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      let node = osc;
      if (filterFreq) {
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = filterFreq;
        osc.connect(f);
        node = f;
      }
      node.connect(g);
      g.connect(this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    noiseBurst(dur, { gain = 0.2, delay = 0, filterFreq = 4000 } = {}) {
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime + delay;
      const bufferSize = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f).connect(g).connect(this.sfxGain);
      src.start(t0);
    }

    click()      { this.resume(); this.tone(520, 0.08, { type: 'square', gain: 0.15 }); }
    eat()        { this.resume(); this.tone(660, 0.09, { type: 'triangle', gain: 0.28, glideTo: 880 }); }
    golden()     { this.resume(); this.tone(880, 0.12, { type: 'sine', gain: 0.3, glideTo: 1320 }); this.tone(1320, 0.18, { type: 'sine', gain: 0.22, delay: 0.08, glideTo: 1760 }); }
    powerup()    { this.resume(); this.tone(440, 0.16, { type: 'sawtooth', gain: 0.16, glideTo: 220, filterFreq: 2200 }); this.tone(660, 0.16, { type: 'sine', gain: 0.2, delay: 0.05, glideTo: 990 }); }
    levelUp()    { this.resume(); [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', gain: 0.26, delay: i * 0.08 })); }
    pause()      { this.resume(); this.tone(400, 0.1, { type: 'sine', gain: 0.2, glideTo: 260 }); }
    resumeSnd()  { this.resume(); this.tone(260, 0.1, { type: 'sine', gain: 0.2, glideTo: 420 }); }
    gameOver()   { this.resume(); [392, 349, 294, 220].forEach((f, i) => this.tone(f, 0.28, { type: 'sawtooth', gain: 0.2, delay: i * 0.14, filterFreq: 1200 })); this.noiseBurst(0.4, { gain: 0.15, delay: 0.1 }); }
    victory()    { this.resume(); [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', gain: 0.28, delay: i * 0.1 })); }

    startMusic() {
      if (!this.ctx || this.musicNodes) return;
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      o1.type = 'sine'; o2.type = 'sine';
      o1.frequency.value = 110; o2.frequency.value = 110 * 1.5;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.06;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      o1.connect(filter); o2.connect(filter);
      filter.connect(this.musicGain);
      o1.start(); o2.start(); lfo.start();
      this.musicNodes = { o1, o2, lfo, filter };
      this.musicGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 1.2);
    }

    stopMusic() {
      if (!this.musicGain) return;
      this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
      if (this.musicNodes) {
        const nodes = this.musicNodes;
        this.musicNodes = null;
        setTimeout(() => { try { nodes.o1.stop(); nodes.o2.stop(); nodes.lfo.stop(); } catch (e) {} }, 900);
      }
    }
  }

  /* ======================================================================
     PARTICLE SYSTEM — in-canvas effects
     ====================================================================== */
  class ParticleSystem {
    constructor() { this.particles = []; }

    burst(x, y, color, count = 16, opts = {}) {
      const speed = opts.speed || 2.4;
      const life = opts.life || 600;
      const size = opts.size || 3;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const spd = speed * (0.4 + Math.random() * 0.9);
        this.particles.push({
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: life * (0.7 + Math.random() * 0.6),
          age: 0,
          size: size * (0.6 + Math.random() * 0.8),
          color
        });
      }
    }

    update(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.age += dt;
        if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
        p.x += p.vx * (dt / 16.67);
        p.y += p.vy * (dt / 16.67);
        p.vx *= 0.94;
        p.vy *= 0.94;
      }
    }

    render(ctx) {
      for (const p of this.particles) {
        const t = 1 - p.age / p.life;
        ctx.save();
        ctx.globalAlpha = clamp(t, 0, 1);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.size * t), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    clear() { this.particles.length = 0; }
  }

  /* ======================================================================
     AMBIENT BACKGROUND PARTICLES — full-viewport canvas, always drifting
     ====================================================================== */
  class BackgroundFX {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dots = [];
      this.resize();
      window.addEventListener('resize', () => this.resize());
      this.last = null;
      this.colors = [COLORS.blue, COLORS.cyan, COLORS.purple, COLORS.pink];
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(70, Math.floor((window.innerWidth * window.innerHeight) / 18000));
      this.dots = Array.from({ length: count }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: 0.6 + Math.random() * 1.8,
        vy: -0.06 - Math.random() * 0.12,
        vx: (Math.random() - 0.5) * 0.06,
        phase: Math.random() * Math.PI * 2,
        color: choice([COLORS.blue, COLORS.cyan, COLORS.purple, COLORS.pink])
      }));
    }

    frame(ts) {
      if (this.last == null) this.last = ts;
      const dt = ts - this.last;
      this.last = ts;
      const w = window.innerWidth, h = window.innerHeight;
      this.ctx.clearRect(0, 0, w, h);
      for (const d of this.dots) {
        d.y += d.vy * (dt / 16.67);
        d.x += d.vx * (dt / 16.67);
        if (d.y < -10) d.y = h + 10;
        if (d.x < -10) d.x = w + 10;
        if (d.x > w + 10) d.x = -10;
        const alpha = 0.25 + Math.sin(ts / 900 + d.phase) * 0.2;
        this.ctx.beginPath();
        this.ctx.fillStyle = d.color;
        this.ctx.globalAlpha = clamp(alpha, 0.05, 0.5);
        this.ctx.shadowColor = d.color;
        this.ctx.shadowBlur = 6;
        this.ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.globalAlpha = 1;
      requestAnimationFrame((t) => this.frame(t));
    }

    start() { requestAnimationFrame((t) => this.frame(t)); }
  }

  /* ======================================================================
     FOOD DEFINITIONS
     ====================================================================== */
  const PRIMARY_FOOD = [
    { key: 'apple', weight: 88 },
    { key: 'golden', weight: 12 }
  ];
  const SPECIAL_FOOD = [
    { key: 'speed', weight: 34 },
    { key: 'slow', weight: 33 },
    { key: 'ghost', weight: 33 }
  ];
  const FOOD_META = {
    apple:  { color: COLORS.red,    score: 10, label: 'Apple' },
    golden: { color: COLORS.gold,   score: 50, label: 'Golden Apple', life: 6000 },
    speed:  { color: COLORS.blue,   score: 5,  label: 'Speed Berry',  life: 7000 },
    slow:   { color: COLORS.green,  score: 5,  label: 'Slow Berry',   life: 7000 },
    ghost:  { color: COLORS.purple, score: 5,  label: 'Ghost Apple',  life: 7000 }
  };

  /* ======================================================================
     MAIN GAME
     ====================================================================== */
  class SnakeGame {
    constructor() {
      this.audio = new AudioEngine();
      this.particles = new ParticleSystem();
      this.stats = Storage.load();

      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.wrap = document.getElementById('canvasWrap');
      this.cellSize = 20;

      this.state = 'menu'; // menu | playing | paused | gameover
      this.difficulty = 'easy';
      this.mode = 'classic';
      this.soundOn = true;
      this.musicOn = true;
      this.mobileControlPref = 'auto'; // auto | on | off

      this.cacheDom();
      this.bindMenuEvents();
      this.bindControls();
      this.bindResize();
      this.detectTouch();
      this.refreshMenuStats();

      this.rafId = null;
      this.lastFrameTime = null;
      this.accumulator = 0;

      new BackgroundFX(document.getElementById('bgParticles')).start();
    }

    /* ---------------- DOM cache ---------------- */
    cacheDom() {
      this.dom = {
        menuScreen: document.getElementById('menuScreen'),
        gameScreen: document.getElementById('gameScreen'),
        difficultyGroup: document.getElementById('difficultyGroup'),
        modeGroup: document.getElementById('modeGroup'),
        soundToggle: document.getElementById('soundToggle'),
        musicToggle: document.getElementById('musicToggle'),
        mobileToggle: document.getElementById('mobileControlsToggle'),
        startBtn: document.getElementById('startBtn'),
        statHigh: document.getElementById('statHigh'),
        statGames: document.getElementById('statGames'),
        statLongest: document.getElementById('statLongest'),

        hudScore: document.getElementById('hudScore'),
        hudHigh: document.getElementById('hudHigh'),
        hudLevel: document.getElementById('hudLevel'),
        hudSpeed: document.getElementById('hudSpeed'),
        hudCombo: document.getElementById('hudCombo'),
        hudDifficulty: document.getElementById('hudDifficulty'),
        hudMode: document.getElementById('hudMode'),
        hudTime: document.getElementById('hudTime'),
        hudPowerupWrap: document.getElementById('hudPowerupWrap'),
        hudPowerupName: document.getElementById('hudPowerupName'),
        hudPowerupBar: document.getElementById('hudPowerupBar'),
        pauseBtn: document.getElementById('pauseBtn'),
        muteBtn: document.getElementById('muteBtn'),
        levelUpBanner: document.getElementById('levelUpBanner'),
        floatingScoreLayer: document.getElementById('floatingScoreLayer'),

        touchControls: document.getElementById('touchControls'),
        touchPauseBtn: document.getElementById('touchPauseBtn'),

        pauseOverlay: document.getElementById('pauseOverlay'),
        resumeBtn: document.getElementById('resumeBtn'),
        pauseRestartBtn: document.getElementById('pauseRestartBtn'),
        pauseMenuBtn: document.getElementById('pauseMenuBtn'),

        gameOverOverlay: document.getElementById('gameOverOverlay'),
        finalScore: document.getElementById('finalScore'),
        finalHigh: document.getElementById('finalHigh'),
        finalLevel: document.getElementById('finalLevel'),
        finalCombo: document.getElementById('finalCombo'),
        newHighBadge: document.getElementById('newHighBadge'),
        playAgainBtn: document.getElementById('playAgainBtn'),
        gameOverMenuBtn: document.getElementById('gameOverMenuBtn')
      };
    }

    /* ---------------- Menu / settings wiring ---------------- */
    bindMenuEvents() {
      this.dom.difficultyGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.option-btn');
        if (!btn) return;
        this.audio.click();
        [...this.dom.difficultyGroup.children].forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        this.difficulty = btn.dataset.difficulty;
      });

      this.dom.modeGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.option-btn');
        if (!btn) return;
        this.audio.click();
        [...this.dom.modeGroup.children].forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        this.mode = btn.dataset.mode;
      });

      this.dom.soundToggle.addEventListener('click', () => {
        this.soundOn = !this.soundOn;
        this.audio.setMuted(!this.soundOn);
        this.updateToggleBtn(this.dom.soundToggle, this.soundOn);
        if (this.soundOn) this.audio.click();
        this.syncMuteIcon();
      });

      this.dom.musicToggle.addEventListener('click', () => {
        this.musicOn = !this.musicOn;
        this.updateToggleBtn(this.dom.musicToggle, this.musicOn);
        this.audio.setMusicOn(this.musicOn && this.state === 'playing');
        this.audio.click();
      });

      this.dom.mobileToggle.addEventListener('click', () => {
        const order = ['auto', 'on', 'off'];
        const idx = (order.indexOf(this.mobileControlPref) + 1) % order.length;
        this.mobileControlPref = order[idx];
        this.dom.mobileToggle.textContent = this.mobileControlPref.toUpperCase();
        this.dom.mobileToggle.classList.toggle('active', this.mobileControlPref !== 'off');
        this.applyMobileControlPref();
        this.audio.click();
      });

      this.dom.startBtn.addEventListener('click', () => {
        this.audio.resume();
        this.audio.click();
        this.startGame();
      });

      this.dom.pauseBtn.addEventListener('click', () => this.togglePause());
      this.dom.touchPauseBtn.addEventListener('click', () => this.togglePause());
      this.dom.muteBtn.addEventListener('click', () => {
        this.soundOn = !this.soundOn;
        this.audio.setMuted(!this.soundOn);
        this.updateToggleBtn(this.dom.soundToggle, this.soundOn);
        this.syncMuteIcon();
      });

      this.dom.resumeBtn.addEventListener('click', () => this.togglePause());
      this.dom.pauseRestartBtn.addEventListener('click', () => this.startGame());
      this.dom.pauseMenuBtn.addEventListener('click', () => this.goToMenu());

      this.dom.playAgainBtn.addEventListener('click', () => this.startGame());
      this.dom.gameOverMenuBtn.addEventListener('click', () => this.goToMenu());
    }

    updateToggleBtn(btn, on) {
      btn.classList.toggle('active', on);
      btn.textContent = on ? 'ON' : 'OFF';
      btn.setAttribute('aria-pressed', String(on));
    }

    syncMuteIcon() { this.dom.muteBtn.textContent = this.soundOn ? '🔊' : '🔇'; }

    detectTouch() {
      const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      document.body.classList.toggle('mobile-detected', isTouch);
      this.applyMobileControlPref();
    }

    applyMobileControlPref() {
      document.body.classList.remove('show-touch-controls', 'hide-touch-controls');
      if (this.mobileControlPref === 'on') document.body.classList.add('show-touch-controls');
      else if (this.mobileControlPref === 'off') document.body.classList.add('hide-touch-controls');
      // 'auto' leaves it to the CSS hover/pointer media query
    }

    refreshMenuStats() {
      this.dom.statHigh.textContent = this.stats.highScore;
      this.dom.statGames.textContent = this.stats.gamesPlayed;
      this.dom.statLongest.textContent = this.stats.longestSnake;
    }

    /* ---------------- Input ---------------- */
    bindControls() {
      window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) e.preventDefault();

        if (key === 'm') { this.dom.muteBtn.click(); return; }

        if (this.state === 'playing' || this.state === 'paused') {
          if (key === ' ') { this.togglePause(); return; }
          if (key === 'r') { this.startGame(); return; }
        }
        if (this.state !== 'playing') return;

        const map = {
          arrowup: 'up', w: 'up',
          arrowdown: 'down', s: 'down',
          arrowleft: 'left', a: 'left',
          arrowright: 'right', d: 'right'
        };
        if (map[key]) this.queueDirection(map[key]);
      });

      // D-Pad
      this.dom.touchControls.querySelectorAll('.dpad-btn').forEach((btn) => {
        const fire = (e) => {
          e.preventDefault();
          btn.classList.add('pressed');
          this.queueDirection(btn.dataset.dir);
          setTimeout(() => btn.classList.remove('pressed'), 120);
        };
        btn.addEventListener('pointerdown', fire);
      });

      // Swipe controls on canvas
      let touchStart = null;
      const wrap = this.wrap;
      wrap.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        touchStart = { x: t.clientX, y: t.clientY };
      }, { passive: true });
      wrap.addEventListener('touchend', (e) => {
        if (!touchStart) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStart.x;
        const dy = t.clientY - touchStart.y;
        touchStart = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        if (Math.abs(dx) > Math.abs(dy)) this.queueDirection(dx > 0 ? 'right' : 'left');
        else this.queueDirection(dy > 0 ? 'down' : 'up');
      }, { passive: true });
    }

    bindResize() {
      const resize = () => this.resizeCanvas();
      window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', () => setTimeout(resize, 150));
    }

    resizeCanvas() {
      const rect = this.wrap.getBoundingClientRect();
      const size = Math.floor(Math.min(rect.width, rect.height));
      if (size <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(size * dpr);
      this.canvas.height = Math.floor(size * dpr);
      this.canvas.style.width = size + 'px';
      this.canvas.style.height = size + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cellSize = size / GRID_SIZE;
      this.cssSize = size;
    }

    queueDirection(dirName) {
      if (this.state !== 'playing') return;
      const dir = DIRS[dirName];
      if (!dir) return;
      const cur = this.pendingDirection || this.direction;
      if (cur.x === -dir.x && cur.y === -dir.y) return; // no instant 180
      this.pendingDirection = dir;
    }

    /* ---------------- Game lifecycle ---------------- */
    startGame() {
      const diff = DIFFICULTY[this.difficulty];

      this.score = 0;
      this.level = 1;
      this.nextLevelScore = 150;
      this.combo = 1;
      this.longestCombo = 1;
      this.lastEatTime = 0;
      this.elapsed = 0;
      this.pausedAccum = 0;

      this.direction = { x: 1, y: 0 };
      this.pendingDirection = null;
      const mid = Math.floor(GRID_SIZE / 2);
      this.snake = [
        { x: mid - 1, y: mid }, { x: mid - 2, y: mid }, { x: mid - 3, y: mid }
      ];
      this.prevSnake = this.snake.map((s) => ({ ...s }));
      this.growPending = 0;

      this.activePowerup = null; // { type, endTime, duration }
      this.speedMultiplier = 1;
      this.ghostActive = false;

      this.foods = [];
      this.specialSpawnTimer = this.randomSpecialDelay(diff);
      this.spawnPrimaryFood();

      this.particles.clear();
      this.dom.floatingScoreLayer.innerHTML = '';

      this.resizeCanvas();
      this.updateHudStatic();
      this.updateHud();

      this.setState('playing');
      this.dom.gameOverOverlay.classList.remove('active');
      this.dom.pauseOverlay.classList.remove('active');
      this.dom.pauseBtn.textContent = '❚❚';

      this.audio.setMusicOn(this.musicOn);

      this.accumulator = 0;
      this.lastFrameTime = null;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame((t) => this.loop(t));
    }

    setState(state) {
      this.state = state;
      this.dom.menuScreen.classList.toggle('active', state === 'menu');
      this.dom.gameScreen.classList.toggle('active', state !== 'menu');
    }

    goToMenu() {
      this.setState('menu');
      this.dom.pauseOverlay.classList.remove('active');
      this.dom.gameOverOverlay.classList.remove('active');
      this.audio.stopMusic();
      if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
      this.refreshMenuStats();
    }

    togglePause() {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.pauseStartedAt = performance.now();
        this.dom.pauseOverlay.classList.add('active');
        this.dom.pauseBtn.textContent = '▶';
        this.audio.pause();
        this.audio.setMusicOn(false);
      } else if (this.state === 'paused') {
        this.state = 'playing';
        this.pausedAccum += performance.now() - this.pauseStartedAt;
        this.dom.pauseOverlay.classList.remove('active');
        this.dom.pauseBtn.textContent = '❚❚';
        this.audio.resumeSnd();
        this.audio.setMusicOn(this.musicOn);
        this.lastFrameTime = null; // avoid a huge dt jump on resume
      }
    }

    /* ---------------- Food spawning ---------------- */
    randomSpecialDelay(diff) {
      return (8000 + Math.random() * 6000) * diff.spawnMult;
    }

    occupiedSet(extraFoods) {
      const set = new Set(this.snake.map((s) => `${s.x},${s.y}`));
      (extraFoods || this.foods).forEach((f) => set.add(`${f.x},${f.y}`));
      return set;
    }

    randomFreeCell(occupied) {
      let x, y, tries = 0;
      do {
        x = randInt(0, GRID_SIZE - 1);
        y = randInt(0, GRID_SIZE - 1);
        tries++;
      } while (occupied.has(`${x},${y}`) && tries < 400);
      return { x, y };
    }

    spawnPrimaryFood() {
      this.foods = this.foods.filter((f) => f.category !== 'primary');
      const key = weightedPick(PRIMARY_FOOD);
      const cell = this.randomFreeCell(this.occupiedSet());
      const meta = FOOD_META[key];
      const diff = DIFFICULTY[this.difficulty];
      this.foods.push({
        category: 'primary', type: key, x: cell.x, y: cell.y,
        spawnedAt: performance.now(), life: meta.life ? meta.life * diff.spawnMult : null,
        bobPhase: Math.random() * Math.PI * 2
      });
    }

    spawnSpecialFood() {
      if (this.foods.some((f) => f.category === 'special')) return;
      const key = weightedPick(SPECIAL_FOOD);
      const cell = this.randomFreeCell(this.occupiedSet());
      const meta = FOOD_META[key];
      const diff = DIFFICULTY[this.difficulty];
      this.foods.push({
        category: 'special', type: key, x: cell.x, y: cell.y,
        spawnedAt: performance.now(), life: meta.life * diff.spawnMult,
        bobPhase: Math.random() * Math.PI * 2
      });
    }

    /* ---------------- Main loop ---------------- */
    loop(ts) {
      this.rafId = requestAnimationFrame((t) => this.loop(t));
      if (this.lastFrameTime == null) this.lastFrameTime = ts;
      let dt = ts - this.lastFrameTime;
      this.lastFrameTime = ts;
      dt = Math.min(dt, 100); // clamp huge gaps (tab switch etc.)

      if (this.state === 'playing') {
        this.elapsed = performance.now() - this.gameStart - this.pausedAccum;
        this.updateTiming(ts, dt);
      }

      this.particles.update(dt);
      this.render(this.accumTickAlpha || 0);
      this.updateHudDynamic();
    }

    updateTiming(ts, dt) {
      if (this.gameStart == null) this.gameStart = performance.now() - this.pausedAccum;

      const diff = DIFFICULTY[this.difficulty];
      let movesPerSec = diff.movesPerSec + (this.level - 1) * 0.55;
      movesPerSec = Math.min(movesPerSec, diff.movesPerSec * 2.1);
      movesPerSec *= this.speedMultiplier;
      const tickInterval = 1000 / movesPerSec;
      this.currentMovesPerSec = movesPerSec;

      this.accumulator += dt;
      let safety = 0;
      while (this.accumulator >= tickInterval && safety < 8) {
        this.prevSnake = this.snake.map((s) => ({ ...s }));
        this.tick();
        this.accumulator -= tickInterval;
        safety++;
        if (this.state !== 'playing') { this.accumulator = 0; break; }
      }
      this.accumTickAlpha = clamp(this.accumulator / tickInterval, 0, 1);

      // special food spawn timer
      this.specialSpawnTimer -= dt;
      if (this.specialSpawnTimer <= 0) {
        this.spawnSpecialFood();
        this.specialSpawnTimer = this.randomSpecialDelay(diff);
      }

      // expire foods with a lifespan
      const now = performance.now();
      this.foods = this.foods.filter((f) => {
        if (f.life == null) return true;
        if (now - f.spawnedAt >= f.life) {
          if (f.category === 'primary') this.spawnPrimaryFood();
          return false;
        }
        return true;
      });

      // power-up expiry
      if (this.activePowerup && now >= this.activePowerup.endTime) {
        this.clearPowerup();
      }

      // combo expiry
      if (this.combo > 1 && now - this.lastEatTime > COMBO_WINDOW) {
        this.combo = 1;
      }
    }

    tick() {
      if (this.pendingDirection) {
        this.direction = this.pendingDirection;
        this.pendingDirection = null;
      }

      const head = this.snake[0];
      let nx = head.x + this.direction.x;
      let ny = head.y + this.direction.y;

      const outOfBounds = nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE;

      if (this.mode === 'wrap') {
        nx = (nx + GRID_SIZE) % GRID_SIZE;
        ny = (ny + GRID_SIZE) % GRID_SIZE;
      } else if (outOfBounds) {
        if (this.ghostActive) {
          nx = (nx + GRID_SIZE) % GRID_SIZE;
          ny = (ny + GRID_SIZE) % GRID_SIZE;
        } else {
          this.endGame();
          return;
        }
      }

      // self collision (tail cell will vacate this tick unless growing)
      const willGrow = this.growPending > 0;
      const bodyToCheck = willGrow ? this.snake : this.snake.slice(0, -1);
      if (bodyToCheck.some((s) => s.x === nx && s.y === ny)) {
        this.endGame();
        return;
      }

      this.snake.unshift({ x: nx, y: ny });
      if (willGrow) this.growPending--; else this.snake.pop();

      // food collision
      const hitIndex = this.foods.findIndex((f) => f.x === nx && f.y === ny);
      if (hitIndex !== -1) this.eatFood(this.foods[hitIndex], hitIndex);

      this.stats.longestSnake = Math.max(this.stats.longestSnake, this.snake.length);
    }

    eatFood(food, index) {
      const meta = FOOD_META[food.type];
      const now = performance.now();
      const withinCombo = now - this.lastEatTime <= COMBO_WINDOW;
      this.combo = withinCombo ? Math.min(MAX_COMBO, this.combo + 1) : 1;
      this.longestCombo = Math.max(this.longestCombo, this.combo);
      this.lastEatTime = now;

      const scoreMult = this.activePowerup && this.activePowerup.type === 'speed' ? 2 : 1;
      const gained = Math.round(meta.score * this.combo * scoreMult);
      this.addScore(gained);

      this.foods.splice(index, 1);
      this.growPending += food.category === 'primary' ? 1 : 0;

      const px = (food.x + 0.5) * this.cellSize;
      const py = (food.y + 0.5) * this.cellSize;
      this.particles.burst(px, py, meta.color, food.type === 'golden' ? 28 : 16, {
        speed: food.type === 'golden' ? 3.4 : 2.2,
        life: food.type === 'golden' ? 900 : 550
      });
      this.spawnFloatingScore(food.x, food.y, `+${gained}`, food.type === 'golden');

      if (food.category === 'primary') {
        this.stats.totalApples++;
        this.spawnPrimaryFood();
      }

      if (food.type === 'golden') this.audio.golden();
      else this.audio.eat();

      if (food.category === 'special') this.applyPowerup(food.type);
    }

    applyPowerup(type) {
      const diff = DIFFICULTY[this.difficulty];
      const baseDuration = 6000;
      const duration = baseDuration * diff.powerupMult;
      this.activePowerup = { type, endTime: performance.now() + duration, duration };
      this.speedMultiplier = type === 'speed' ? 1.6 : type === 'slow' ? 0.55 : 1;
      this.ghostActive = type === 'ghost';
      this.audio.powerup();

      const px = (this.snake[0].x + 0.5) * this.cellSize;
      const py = (this.snake[0].y + 0.5) * this.cellSize;
      this.particles.burst(px, py, FOOD_META[type].color, 20, { speed: 3, life: 700 });
    }

    clearPowerup() {
      this.activePowerup = null;
      this.speedMultiplier = 1;
      this.ghostActive = false;
    }

    addScore(amount) {
      this.score += amount;
      while (this.score >= this.nextLevelScore) {
        this.level++;
        this.nextLevelScore += 150 + (this.level - 1) * 40;
        this.showLevelUp();
      }
    }

    showLevelUp() {
      this.audio.levelUp();
      if (this.level % 5 === 0) this.audio.victory();
      const el = this.dom.levelUpBanner;
      el.classList.remove('show');
      // force reflow to restart CSS animation
      void el.offsetWidth;
      el.classList.add('show');
    }

    spawnFloatingScore(gx, gy, text, big) {
      const el = document.createElement('div');
      el.className = 'floating-score';
      el.textContent = text;
      el.style.left = `${(gx + 0.5) * this.cellSize}px`;
      el.style.top = `${gy * this.cellSize}px`;
      if (big) { el.style.fontSize = '1.4rem'; el.style.color = COLORS.gold; }
      this.dom.floatingScoreLayer.appendChild(el);
      setTimeout(() => el.remove(), 950);
    }

    endGame() {
      this.state = 'gameover';
      this.audio.gameOver();
      this.audio.stopMusic();

      const px = (this.snake[0].x + 0.5) * this.cellSize;
      const py = (this.snake[0].y + 0.5) * this.cellSize;
      this.particles.burst(px, py, COLORS.red, 34, { speed: 4.2, life: 900, size: 4 });
      this.snake.forEach((s, i) => {
        if (i % 2 === 0) {
          this.particles.burst((s.x + 0.5) * this.cellSize, (s.y + 0.5) * this.cellSize, COLORS.pink, 6, { speed: 1.6, life: 500 });
        }
      });

      this.stats.gamesPlayed++;
      this.stats.longestSnake = Math.max(this.stats.longestSnake, this.snake.length);
      this.stats.highestLevel = Math.max(this.stats.highestLevel, this.level);
      const isNewHigh = this.score > this.stats.highScore;
      if (isNewHigh) this.stats.highScore = this.score;
      Storage.save(this.stats);

      this.dom.finalScore.textContent = this.score;
      this.dom.finalHigh.textContent = this.stats.highScore;
      this.dom.finalLevel.textContent = this.level;
      this.dom.finalCombo.textContent = `x${this.longestCombo}`;
      this.dom.newHighBadge.classList.toggle('show', isNewHigh);

      setTimeout(() => this.dom.gameOverOverlay.classList.add('active'), 260);
    }

    /* ---------------- HUD ---------------- */
    updateHudStatic() {
      this.dom.hudDifficulty.textContent = DIFFICULTY[this.difficulty].label;
      this.dom.hudMode.textContent = MODE_LABEL[this.mode];
      this.dom.hudHigh.textContent = this.stats.highScore;
      this.syncMuteIcon();
    }

    pulse(el) {
      el.parentElement.classList.remove('pulse');
      void el.offsetWidth;
      el.parentElement.classList.add('pulse');
    }

    updateHud() {
      if (this.dom.hudScore.textContent != this.score) {
        this.dom.hudScore.textContent = this.score;
        this.pulse(this.dom.hudScore);
      }
      this.dom.hudLevel.textContent = this.level;
      this.dom.hudCombo.textContent = `x${this.combo}`;
      this.dom.hudSpeed.textContent = (this.currentMovesPerSec || DIFFICULTY[this.difficulty].movesPerSec).toFixed(1);
    }

    updateHudDynamic() {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      this.updateHud();
      this.dom.hudTime.textContent = formatTime(this.elapsed || 0);

      if (this.activePowerup) {
        const now = performance.now();
        const remain = clamp((this.activePowerup.endTime - now) / this.activePowerup.duration, 0, 1);
        this.dom.hudPowerupWrap.style.display = 'flex';
        this.dom.hudPowerupName.textContent = FOOD_META[this.activePowerup.type].label;
        this.dom.hudPowerupBar.style.width = `${remain * 100}%`;
      } else {
        this.dom.hudPowerupWrap.style.display = 'none';
      }
    }

    /* ---------------- Rendering ---------------- */
    render(alpha) {
      const ctx = this.ctx;
      const size = this.cssSize || 0;
      if (!size) return;
      ctx.clearRect(0, 0, size, size);

      this.drawGrid(ctx, size);

      if (this.state === 'playing' || this.state === 'paused' || this.state === 'gameover') {
        this.drawFoods(ctx);
        this.drawSnake(ctx, alpha);
      }

      this.particles.render(ctx);
    }

    drawGrid(ctx, size) {
      ctx.save();
      ctx.strokeStyle = 'rgba(120,170,255,0.05)';
      ctx.lineWidth = 1;
      for (let i = 1; i < GRID_SIZE; i++) {
        const p = i * this.cellSize;
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
      }
      ctx.restore();
    }

    drawFoods(ctx) {
      const now = performance.now();
      for (const f of this.foods) {
        const meta = FOOD_META[f.type];
        const age = now - f.spawnedAt;
        const spawnT = clamp(age / 260, 0, 1);
        const scale = easeOutBack(spawnT);
        const bob = Math.sin(now / 260 + f.bobPhase) * this.cellSize * 0.08;
        const cx = (f.x + 0.5) * this.cellSize;
        const cy = (f.y + 0.5) * this.cellSize + bob;
        const r = this.cellSize * 0.34 * scale;

        let flicker = 1;
        if (f.life) {
          const remain = 1 - age / f.life;
          if (remain < 0.28) flicker = 0.4 + 0.6 * Math.abs(Math.sin(now / 90));
        }

        ctx.save();
        ctx.globalAlpha = flicker;
        ctx.shadowColor = meta.color;
        ctx.shadowBlur = 18;
        ctx.fillStyle = meta.color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = flicker * 0.55;
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath();
        ctx.arc(cx - r * 0.32, cy - r * 0.32, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    drawSnake(ctx, alpha) {
      const n = this.snake.length;
      const positions = this.snake.map((s, i) => {
        const prev = this.prevSnake[i] || s;
        let dx = s.x - prev.x, dy = s.y - prev.y;
        // handle wrap-around interpolation without a visual streak across the board
        if (Math.abs(dx) > 1) dx = dx > 0 ? dx - GRID_SIZE : dx + GRID_SIZE;
        if (Math.abs(dy) > 1) dy = dy > 0 ? dy - GRID_SIZE : dy + GRID_SIZE;
        const ix = prev.x + dx * alpha;
        const iy = prev.y + dy * alpha;
        return { x: (ix + 0.5) * this.cellSize, y: (iy + 0.5) * this.cellSize };
      });

      ctx.save();
      if (this.ghostActive) ctx.globalAlpha = 0.65 + 0.2 * Math.sin(performance.now() / 100);

      // body
      for (let i = n - 1; i >= 1; i--) {
        const p = positions[i];
        const t = 1 - i / n;
        const r = this.cellSize * (0.32 + t * 0.14);
        const color = lerpColor(COLORS.purple, COLORS.blue, t);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(p.x - r, p.y - r, r * 2, r * 2, r * 0.9) : ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // head
      const head = positions[0];
      const hr = this.cellSize * 0.46;
      ctx.fillStyle = COLORS.cyan;
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(head.x - hr, head.y - hr, hr * 2, hr * 2, hr * 0.85);
      else ctx.arc(head.x, head.y, hr, 0, Math.PI * 2);
      ctx.fill();

      // eyes (animated, oriented to movement direction)
      const dir = this.pendingDirection || this.direction;
      const perp = { x: -dir.y, y: dir.x };
      const eyeOffset = hr * 0.42;
      const eyeForward = hr * 0.32;
      const blinking = Math.sin(performance.now() / 1800) > 0.985;
      ctx.shadowBlur = 0;
      [1, -1].forEach((side) => {
        const ex = head.x + perp.x * eyeOffset * side + dir.x * eyeForward;
        const ey = head.y + perp.y * eyeOffset * side + dir.y * eyeForward;
        ctx.fillStyle = '#0a1420';
        ctx.beginPath();
        ctx.ellipse(ex, ey, hr * 0.16, blinking ? hr * 0.02 : hr * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!blinking) {
          ctx.fillStyle = '#eaf6ff';
          ctx.beginPath();
          ctx.arc(ex + dir.x * hr * 0.05, ey + dir.y * hr * 0.05, hr * 0.07, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.restore();
    }
  }

  function lerpColor(c1, c2, t) {
    const p1 = hexToRgb(c1), p2 = hexToRgb(c2);
    const r = Math.round(lerp(p1.r, p2.r, t));
    const g = Math.round(lerp(p1.g, p2.g, t));
    const b = Math.round(lerp(p1.b, p2.b, t));
    return `rgb(${r},${g},${b})`;
  }
  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }

  /* ======================================================================
     BOOT
     ====================================================================== */
  window.addEventListener('DOMContentLoaded', () => {
    window.__snakeGame = new SnakeGame();
  });
})();
