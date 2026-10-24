/* Warehouse Office — âm thanh (tạo bằng Web Audio, không cần file) và hiệu ứng pháo giấy */
(function (MD) {
  'use strict';
  const U = MD.U;
  const FX = {};
  const KEY = 'office_fx';
  FX.opt = Object.assign({ sound: true, typing: false, music: false }, U.store.get(KEY, {}));
  FX.typingActive = () => false;
  const saveOpt = () => U.store.set(KEY, FX.opt);
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let ctx = null, master = null;
  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, start, dur, type, vol, dest) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    const t = c.currentTime + start;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function keyClick() {
    const c = ac(); if (!c) return;
    const len = Math.floor(c.sampleRate * 0.025);
    const b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 5);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = b; f.type = 'bandpass'; f.frequency.value = 2200 + Math.random() * 1800; g.gain.value = 0.22;
    src.connect(f); f.connect(g); g.connect(master); src.start();
  }

  const SOUNDS = {
    click: () => tone(880, 0, 0.06, 'triangle', 0.05),
    open: () => { tone(660, 0, 0.09, 'sine', 0.08); tone(990, 0.06, 0.12, 'sine', 0.07); },
    success: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.3, 'triangle', 0.1)),
    notify: () => { tone(784, 0, 0.14, 'sine', 0.1); tone(1175, 0.12, 0.22, 'sine', 0.09); },
    error: () => { tone(240, 0, 0.18, 'square', 0.04); tone(190, 0.15, 0.25, 'square', 0.04); }
  };
  FX.sound = (name) => { if (!FX.opt.sound || !SOUNDS[name]) return; try { SOUNDS[name](); } catch (e) { /* bỏ qua */ } };

  /* Tiếng gõ phím khi có nhân viên đang làm việc trên văn phòng */
  (function typingLoop() {
    const next = () => setTimeout(typingLoop, 60 + Math.random() * 160 + (Math.random() < 0.12 ? 700 : 0));
    try { if (FX.opt.typing && ctx && document.visibilityState === 'visible' && FX.typingActive()) keyClick(); } catch (e) { /* bỏ qua */ }
    next();
  })();

  /* Nhạc nền lo-fi nhẹ: Cmaj7 → Am7 → Fmaj7 → G7, có giai điệu ngẫu nhiên */
  const CHORDS = [[261.6, 329.6, 392, 493.9], [220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [196, 246.9, 293.7, 349.2]];
  let musicTimer = null, bar = 0, musicGain = null;
  function playBar() {
    const c = ac(); if (!c) return;
    const ch = CHORDS[bar % CHORDS.length];
    ch.forEach((f) => tone(f / 2, 0, 2.3, 'sine', 0.05, musicGain));
    tone(ch[0] / 4, 0, 1.1, 'triangle', 0.07, musicGain);
    tone(ch[0] / 4, 1.2, 0.9, 'triangle', 0.06, musicGain);
    for (let i = 0; i < 4; i++) if (Math.random() < 0.7) tone(ch[Math.floor(Math.random() * 4)] * 2, i * 0.55 + 0.1, 0.45, 'sine', 0.035, musicGain);
    bar++;
  }
  function music(on) {
    if (on) {
      const c = ac(); if (!c || musicTimer) return;
      musicGain = c.createGain(); musicGain.gain.value = 0.8; musicGain.connect(master);
      playBar(); musicTimer = setInterval(playBar, 2300);
    } else {
      clearInterval(musicTimer); musicTimer = null;
      if (musicGain) { const g = musicGain; g.gain.setTargetAtTime(0, ctx.currentTime, 0.3); setTimeout(() => g.disconnect(), 1500); musicGain = null; }
    }
  }

  FX.toggle = (k) => {
    FX.opt[k] = !FX.opt[k]; saveOpt();
    if (k === 'music') music(FX.opt.music);
    if (FX.opt[k] && k !== 'music') FX.sound('click');
    if (k === 'typing' && FX.opt.typing) ac();
    return FX.opt[k];
  };
  /* Nhạc chỉ bật được sau thao tác của người dùng (chính sách trình duyệt) */
  document.addEventListener('pointerdown', () => { if (FX.opt.music && !musicTimer) music(true); }, { once: true });

  /* Pháo giấy */
  FX.confetti = (n = 90) => {
    if (reduced()) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#06b6d4', '#facc15'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--dx', (Math.random() * 240 - 120) + 'px');
      p.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg');
      p.style.animationDelay = Math.random() * 0.35 + 's';
      p.style.animationDuration = 1.6 + Math.random() * 1.2 + 's';
      if (i % 3 === 0) p.style.borderRadius = '50%';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3400);
  };

  FX.celebrate = () => { FX.sound('success'); FX.confetti(); };

  MD.FX = FX;
})(window.MD);
