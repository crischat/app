/* Interview Copilot — Dịch cabin: dịch liên tục giọng người đang nói (Teams) bằng Gemini Live Translate */
(function (MD) {
  'use strict';
  const U = MD.U, AU = MD.Audio;
  const { $, esc } = U;
  const IP = {};
  const OKEY = 'copilot_interp';
  const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=';
  const DEFAULT_MODEL = 'gemini-3.5-live-translate-preview';
  const SOURCES = {
    screen: 'Teams cài trên máy — toàn màn hình + âm thanh hệ thống (Windows)',
    tab: 'Teams trên trình duyệt — chia sẻ tab có âm thanh',
    mic: 'Micro (thử nghiệm / họp trực tiếp)'
  };
  const opts = () => Object.assign({ source: 'screen', target: 'vi', engine: 'live', voice: false, showSrc: true, size: 26 }, U.store.get(OKEY, {}));
  const saveOpts = (p) => U.store.set(OKEY, Object.assign(opts(), p));

  const S = {
    active: false, stream: null, ctx: null, proc: null, engine: 'live', model: '',
    conn: null, pending: [], fails: 0, reconnects: 0, rotating: false,
    src: [], dst: [], lastSrcAt: 0, lastDstAt: 0, srcStarts: [], lat: [],
    outCtx: null, outIn: null, playAt: 0, fb: null, pip: null, startedAt: 0, id: ''
  };

  /* =================== Kết nối Gemini Live =================== */
  async function liveModel(key) {
    const s = U.store.get('settings', {});
    if (s.geminiLiveTranslate) return s.geminiLiveTranslate;
    let model = DEFAULT_MODEL;
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
      const j = await r.json();
      const list = (j.models || []).filter((m) => /translate/i.test(m.name) && (m.supportedGenerationMethods || []).some((x) => /bidi/i.test(x))).map((m) => m.name.replace(/^models\//, ''));
      const ver = (n) => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
      if (list.length) model = list.sort((a, b) => ver(b) - ver(a) || (/preview/.test(a) ? 1 : -1))[0];
    } catch (e) { /* dùng tên mặc định */ }
    U.store.set('settings', Object.assign(U.store.get('settings', {}), { geminiLiveTranslate: model }));
    return model;
  }

  // Hai kiểu đặt cấu hình chép lời: theo ví dụ của tài liệu Live Translate (trong generationConfig)
  // hoặc theo Live API chung (cấp setup). Thử kiểu đã nhớ trước, sai cấu trúc thì đổi kiểu.
  function setupMsg(model, variant) {
    const gc = { responseModalities: ['AUDIO'], translationConfig: { targetLanguageCode: opts().target, echoTargetLanguage: false } };
    const setup = { model: 'models/' + model, generationConfig: gc };
    if (variant === 'setup') { setup.inputAudioTranscription = {}; setup.outputAudioTranscription = {}; }
    else { gc.inputAudioTranscription = {}; gc.outputAudioTranscription = {}; }
    return { setup };
  }

  function openConn(key, model, variant) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_BASE + encodeURIComponent(key));
      const c = { ws, ready: false, model, variant };
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; try { ws.close(); } catch (e) { /* bỏ qua */ } reject(new Error('Gemini Live không phản hồi sau 10 giây')); } }, 10000);
      ws.onopen = () => ws.send(JSON.stringify(setupMsg(model, variant)));
      ws.onmessage = async (ev) => {
        let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text()); } catch (e) { return; }
        if (m.setupComplete) { c.ready = true; if (!settled) { settled = true; clearTimeout(timer); resolve(c); } return; }
        onServer(m, c);
      };
      ws.onclose = (e) => {
        c.ready = false; clearTimeout(timer);
        if (!settled) { settled = true; const er = new Error(e.reason || `đóng kết nối (mã ${e.code})`); er.code = e.code; return reject(er); }
        onConnClosed(c, e);
      };
    });
  }

  async function connect() {
    const key = MD.CP.keys().geminiKey;
    if (!key) throw new Error('Chưa có Gemini key (tab Cài đặt).');
    S.model = S.model || await liveModel(key);
    const s = U.store.get('settings', {});
    const order = s.liveTransVariant === 'setup' ? ['setup', 'gen'] : ['gen', 'setup'];
    let lastErr;
    for (const v of order) {
      try {
        const c = await openConn(key, S.model, v);
        if (s.liveTransVariant !== v) U.store.set('settings', Object.assign(U.store.get('settings', {}), { liveTransVariant: v }));
        return c;
      } catch (e) {
        lastErr = e;
        if (!/unknown name|invalid json|cannot find field|invalid argument/i.test(e.message)) break; // lỗi khác (key, quyền, mô hình) -> không đổi kiểu
      }
    }
    if (/not found|is not supported|404/i.test(lastErr.message)) { // mô hình đổi tên -> dò lại 1 lần
      U.store.set('settings', Object.assign(U.store.get('settings', {}), { geminiLiveTranslate: '' }));
    }
    throw lastErr;
  }

  async function useConn(c) {
    const old = S.conn; S.conn = c;
    // đẩy phần âm thanh dồn lại trong lúc nối
    while (S.pending.length && c.ws.readyState === 1) sendChunk(c, S.pending.shift());
    if (old && old !== c) setTimeout(() => { try { old.ws.close(); } catch (e) { /* đã đóng */ } }, 1500);
    S.fails = 0; status();
  }

  // Phiên Live chỉ sống ~10–15 phút: khi máy chủ báo sắp đóng (goAway) hoặc kết nối rớt, mở kết nối mới liền mạch
  async function rotate(reason) {
    if (!S.active || S.rotating || S.engine !== 'live') return;
    S.rotating = true; S.reconnects++; status(reason);
    try { await useConn(await connect()); }
    catch (e) {
      S.fails++;
      if (S.fails >= 3) { U.toast('Gemini Live lỗi liên tục (' + e.message + ') — chuyển sang dịch theo câu ngắn.', 'err', 9000); switchToFallback(); }
      else setTimeout(() => rotate('thử nối lại'), 800 * S.fails);
      return;
    } finally { S.rotating = false; }
  }

  function onConnClosed(c, e) {
    if (c !== S.conn || !S.active || S.engine !== 'live') return;
    if (e.code !== 1000) U.toast('Gemini Live ngắt (' + (e.reason || 'mã ' + e.code) + ') — đang nối lại…', 'info', 4000);
    rotate('nối lại');
  }

  function onServer(m, c) {
    if (m.goAway && c === S.conn) rotate('làm mới phiên');
    const sc = m.serverContent; if (!sc || c !== S.conn) return;
    if (sc.inputTranscription && sc.inputTranscription.text) addText('src', sc.inputTranscription.text);
    if (sc.outputTranscription && sc.outputTranscription.text) addText('dst', sc.outputTranscription.text);
    if (sc.modelTurn && sc.modelTurn.parts && opts().voice) sc.modelTurn.parts.forEach((p) => { if (p.inlineData && p.inlineData.data) playPcm(p.inlineData.data, p.inlineData.mimeType || ''); });
    if (sc.interrupted && S.outCtx) S.playAt = S.outCtx.currentTime;
  }

  /* =================== Thu âm thanh -> PCM 16 kHz =================== */
  const b64 = (i16) => { const u = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  function sendChunk(c, i16) {
    c.ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64(i16), mimeType: 'audio/pcm;rate=16000' } } }));
  }
  function startCapture(stream) {
    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 }); } catch (e) { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1); // ~128 ms mỗi khúc ở 16 kHz
    const mute = ctx.createGain(); mute.gain.value = 0;
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    const ratio = ctx.sampleRate / 16000;
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
      const lv = $('#ipLv'); if (lv) lv.style.width = Math.min(100, Math.sqrt(sum / d.length) / 0.12 * 100) + '%';
      if (S.engine !== 'live') return;
      const n = Math.floor(d.length / ratio), out = new Int16Array(n);
      for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, d[Math.floor(i * ratio)])); out[i] = x < 0 ? x * 0x8000 : x * 0x7fff; }
      if (S.conn && S.conn.ready && S.conn.ws.readyState === 1) sendChunk(S.conn, out);
      else { S.pending.push(out); if (S.pending.length > 60) S.pending.shift(); } // giữ tối đa ~8 giây trong lúc nối lại
    };
    S.ctx = ctx; S.proc = proc;
  }

  /* =================== Phát giọng dịch (PCM 24 kHz) liền mạch =================== */
  function ensureOut() {
    if (S.outCtx) { if (S.outCtx.state === 'suspended') S.outCtx.resume(); return; }
    S.outCtx = new (window.AudioContext || window.webkitAudioContext)();
    // lọc âm cao + giới hạn đỉnh: chặn tiếng chói nếu mô hình sinh nhiễu
    const lp = S.outCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7500;
    const lim = S.outCtx.createDynamicsCompressor(); lim.threshold.value = -8; lim.ratio.value = 12; lim.attack.value = 0.002; lim.release.value = 0.1;
    lp.connect(lim); lim.connect(S.outCtx.destination); S.outIn = lp; S.playAt = 0;
  }

  function playPcm(data, mime) {
    const rate = +((mime.match(/rate=(\d+)/) || [])[1] || 24000);
    ensureOut();
    const bin = atob(data), n = bin.length >> 1;
    const buf = S.outCtx.createBuffer(1, n, rate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 0x8000) v -= 0x10000; ch[i] = v / 0x8000; }
    const s = S.outCtx.createBufferSource(); s.buffer = buf; s.connect(S.outIn);
    const t = Math.max(S.outCtx.currentTime + 0.03, S.playAt);
    s.start(t); S.playAt = t + buf.duration;
  }

  /* =================== Chữ: chia đoạn theo khoảng ngắt =================== */
  const GAP = 1500; // ngừng nói > 1,5 giây -> sang đoạn mới
  function addText(kind, text) {
    const now = Date.now(), arr = S[kind], lastAt = kind === 'src' ? S.lastSrcAt : S.lastDstAt;
    const fresh = !arr.length || now - lastAt > GAP;
    if (fresh) {
      arr.push({ text: text.trimStart(), at: now });
      if (kind === 'src') S.srcStarts.push(now);
      else { const st = S.srcStarts[arr.length - 1]; if (st) { S.lat.push((now - st) / 1000); if (S.lat.length > 8) S.lat.shift(); } }
    } else arr[arr.length - 1].text += text;
    if (kind === 'src') S.lastSrcAt = now; else S.lastDstAt = now;
    renderStage(); status();
  }
  // dự phòng: mỗi câu ngắn trả về cùng lúc gốc + dịch
  function addPair(src, dst) {
    const now = Date.now();
    if (src) { S.src.push({ text: src, at: now }); S.srcStarts.push(now); }
    if (dst) S.dst.push({ text: dst, at: now });
    renderStage();
  }

  function renderStage() {
    const o = opts(), stage = S.pip ? S.pip.document.getElementById('ipStage') : $('#ipStage');
    if (!stage) return;
    const last = (arr, n) => arr.slice(-n).map((p, i, a) => `<p class="${i === a.length - 1 ? 'now' : ''}">${esc(p.text)}</p>`).join('');
    stage.style.setProperty('--ip-size', o.size + 'px');
    stage.innerHTML = `${o.showSrc ? `<div class="ip-src">${last(S.src, 2) || '<p class="muted">Chữ gốc hiện ở đây khi có người nói…</p>'}</div>` : ''}
      <div class="ip-dst">${last(S.dst, 3) || `<p class="muted">Bản dịch ${o.target === 'vi' ? 'tiếng Việt' : 'tiếng Anh'} chạy ở đây</p>`}</div>`;
    const log = $('#ipLog');
    if (log) {
      const n = Math.max(S.src.length, S.dst.length);
      let h = ''; for (let i = 0; i < n; i++) h += `<div class="turn them"><div class="txt">${esc((S.dst[i] || {}).text || '…')}</div>${S.src[i] ? `<div class="tr">${esc(S.src[i].text)}</div>` : ''}</div>`;
      log.innerHTML = h || '<p class="muted">Biên bản đầy đủ của buổi dịch.</p>';
      log.scrollTop = log.scrollHeight;
    }
  }

  function status(note) {
    const el = $('#ipStatus'); if (!el) return;
    const avg = S.lat.length ? (S.lat.reduce((a, b) => a + b, 0) / S.lat.length).toFixed(1) : '';
    el.innerHTML = !S.active ? 'Chưa bắt đầu'
      : `${S.engine === 'live' ? `⚡ Live · <code>${esc(S.model)}</code>` : '🧩 Theo câu ngắn (dự phòng)'}${S.conn && S.engine === 'live' && !S.conn.ready ? ' · đang nối…' : ''}${avg ? ` · trễ ~${avg}s` : ''}${S.reconnects ? ` · đã làm mới ${S.reconnects} lần` : ''}${note ? ` · ${esc(note)}` : ''}`;
  }

  /* =================== Bắt đầu / dừng =================== */
  async function getStream(src) {
    if (src === 'mic') return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const st = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1, displaySurface: src === 'screen' ? 'monitor' : 'browser' },
      audio: { suppressLocalAudioPlayback: false, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include'
    });
    if (!st.getAudioTracks().length) {
      st.getTracks().forEach((t) => t.stop());
      throw new Error(src === 'screen' ? 'Không có âm thanh — khi chọn màn hình nhớ tick “Chia sẻ âm thanh hệ thống” (chỉ có trên Windows).' : 'Không có âm thanh — khi chọn tab Teams nhớ bật “Chia sẻ cả âm thanh của thẻ”.');
    }
    return st;
  }

  async function start() {
    readForm();
    const o = opts();
    if (!MD.CP.keys().geminiKey) return U.toast('Cần Gemini API key — nhập ở tab Cài đặt.', 'err');
    try { S.stream = await getStream(o.source); } catch (e) { return U.toast(e.message || 'Chưa cấp quyền', 'err', 8000); }
    Object.assign(S, { active: true, src: [], dst: [], srcStarts: [], lat: [], pending: [], fails: 0, reconnects: 0, lastSrcAt: 0, lastDstAt: 0, startedAt: Date.now(), id: U.uid(), engine: o.engine, conn: null, playAt: 0 });
    S.stream.getTracks().forEach((t) => t.addEventListener('ended', () => { if (S.active) { U.toast('Đã dừng chia sẻ — kết thúc dịch.', 'info'); stop(); } }));
    ensureOut(); // tạo bộ phát ngay trong lúc bấm nút (Chrome chặn tự phát âm thanh nếu tạo về sau)
    IP.render();
    startCapture(new MediaStream(S.stream.getAudioTracks()));
    if (S.engine === 'live') {
      status('đang kết nối…');
      try { await useConn(await connect()); }
      catch (e) { U.toast('Không mở được Gemini Live: ' + e.message + ' — chuyển sang dịch theo câu ngắn.', 'err', 9000); switchToFallback(); }
    } else switchToFallback();
    window.onbeforeunload = () => (S.active ? 'Đang dịch' : undefined);
  }

  function switchToFallback() {
    S.engine = 'chunk';
    if (S.conn) { try { S.conn.ws.close(); } catch (e) { /* đã đóng */ } S.conn = null; }
    if (S.fb) return status();
    const lang = opts().target === 'vi' ? 'en' : 'vi';
    S.fb = AU.listen(new MediaStream(S.stream.getAudioTracks()), {
      silenceMs: 350, maxMs: 5000, minVoiceMs: 300, sensitivity: MD.CP.cset().sensitivity,
      onSegment: (seg) => {
        const t0 = Date.now();
        MD.CP.sttCall(seg, 'them', lang).then((j) => {
          if (!S.active || !j.text) return;
          S.lat.push((Date.now() - seg.end) / 1000); if (S.lat.length > 8) S.lat.shift();
          addPair(j.text, j.translation || j.text); status();
        }).catch((e) => { if (Date.now() - t0 < 60000) status('lỗi: ' + e.message.slice(0, 60)); });
      }
    });
    status();
  }

  function stop() {
    if (!S.active) return;
    S.active = false; window.onbeforeunload = null;
    if (S.conn) { try { S.conn.ws.close(1000); } catch (e) { /* đã đóng */ } S.conn = null; }
    if (S.fb) { S.fb.stop(); S.fb = null; }
    if (S.proc) { S.proc.onaudioprocess = null; try { S.ctx.close(); } catch (e) { /* đã đóng */ } }
    if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    if (S.outCtx) { try { S.outCtx.close(); } catch (e) { /* đã đóng */ } S.outCtx = null; }
    // lưu biên bản vào Lịch sử
    if (S.src.length || S.dst.length) {
      const n = Math.max(S.src.length, S.dst.length), turns = [];
      for (let i = 0; i < n; i++) turns.push({ who: 'them', text: (S.src[i] || {}).text || '', tr: (S.dst[i] || {}).text || '', start: ((S.src[i] || S.dst[i]) || {}).at || S.startedAt });
      const list = MD.CP.sessions();
      list.unshift({ id: S.id, title: `Dịch cabin — ${new Date(S.startedAt).toLocaleString('vi-VN')}`, lang: opts().target, startedAt: S.startedAt, endedAt: Date.now(), turns, sugs: [], analysis: '', summary: '', interp: true });
      MD.CP.saveSessions(list);
      U.toast('Đã lưu biên bản dịch vào Lịch sử', 'ok');
    }
    IP.render();
  }

  /* =================== Phụ đề nổi (luôn trên cùng) =================== */
  async function openPip() {
    if (!('documentPictureInPicture' in window)) return U.toast('Trình duyệt chưa hỗ trợ cửa sổ nổi — dùng Chrome hoặc Edge bản mới.', 'err', 7000);
    if (S.pip) { S.pip.focus(); return; }
    const w = await documentPictureInPicture.requestWindow({ width: 640, height: 220 });
    [...document.styleSheets].forEach((ss) => {
      try { const st = w.document.createElement('style'); st.textContent = [...ss.cssRules].map((r) => r.cssText).join('\n'); w.document.head.appendChild(st); }
      catch (e) { if (ss.href) { const l = w.document.createElement('link'); l.rel = 'stylesheet'; l.href = ss.href; w.document.head.appendChild(l); } }
    });
    w.document.body.className = 'ip-pip';
    w.document.body.innerHTML = '<div id="ipStage" class="ip-stage"></div>';
    S.pip = w;
    w.addEventListener('pagehide', () => { S.pip = null; renderStage(); });
    renderStage();
  }

  /* =================== Giao diện =================== */
  IP.render = () => {
    const body = $('#interpBody'); if (!body) return;
    const o = opts(), k = MD.CP.keys();
    const sel = (id, obj, cur, dis) => `<select id="${id}" ${dis ? 'disabled' : ''}>${Object.entries(obj).map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    body.innerHTML = `
      ${!k.geminiKey ? '<div class="note warn">Cần Gemini API key — nhập ở tab <a href="#settings" data-go="settings">Cài đặt</a>.</div>' : ''}
      <div class="card ${!k.geminiKey ? 'mt' : ''}">
        <div class="formgrid">
          <label class="field">Nguồn âm thanh${sel('ipSource', SOURCES, o.source, S.active)}</label>
          <label class="field">Dịch sang${sel('ipTarget', { vi: 'Tiếng Việt (nghe tiếng Anh)', en: 'Tiếng Anh (nghe tiếng Việt)' }, o.target, S.active)}</label>
          <label class="field">Chế độ${sel('ipEngine', { live: '⚡ Dịch cabin liên tục (Gemini Live)', chunk: '🧩 Theo câu ngắn (dự phòng, chậm hơn)' }, o.engine, S.active)}</label>
          <label class="field">Cỡ chữ phụ đề <span class="muted">${o.size}px</span><input type="range" id="ipSize" min="16" max="48" step="2" value="${o.size}"></label>
        </div>
        <div class="row wrap mt">
          <label class="check"><input type="checkbox" id="ipVoice" ${o.voice ? 'checked' : ''}><span>🎧 Đọc bản dịch vào tai nghe (giọng thông dịch)</span></label>
          <label class="check"><input type="checkbox" id="ipShowSrc" ${o.showSrc ? 'checked' : ''}><span>Hiện chữ gốc</span></label>
        </div>
        <div class="row wrap mt">
          ${S.active ? '<button class="btn danger" id="ipStop">■ Dừng dịch</button>' : '<button class="btn primary" id="ipStart">▶ Bắt đầu dịch</button>'}
          <button class="btn" id="ipPip">📌 Phụ đề nổi trên Teams</button>
          <button class="btn ghost" id="ipClear">Xoá màn hình</button>
          <button class="btn ghost" id="ipDl">⬇ Tải biên bản</button>
          <div class="meter"><span>🔊</span><i><b id="ipLv"></b></i></div>
        </div>
        <p class="muted mt" id="ipStatus" style="font-size:12.5px"></p>
      </div>
      <div id="ipStage" class="ip-stage mt"></div>
      <details class="mt"><summary>Biên bản đầy đủ</summary><div class="transcript mt" id="ipLog" style="max-height:420px"></div></details>
      <details class="mt"><summary><b>Cách dùng với Microsoft Teams</b></summary>
        <ol class="steps">
          <li><b>Teams cài trên máy (Windows):</b> chọn nguồn “toàn màn hình + âm thanh hệ thống” → Bắt đầu → chọn màn hình → tick <b>“Chia sẻ âm thanh hệ thống”</b>. Việc chia sẻ này chỉ nằm trên máy bạn, người trong cuộc họp không thấy.</li>
          <li><b>Teams trên trình duyệt</b> (teams.microsoft.com): chọn nguồn “chia sẻ tab” → chọn tab Teams → bật <b>“Chia sẻ cả âm thanh của thẻ”</b>.</li>
          <li>Bấm <b>📌 Phụ đề nổi</b> để có khung phụ đề luôn nằm trên cửa sổ Teams; kéo nó xuống dưới video.</li>
          <li><b>Đeo tai nghe</b>, nhất là khi bật “Đọc bản dịch”: nếu dùng loa, mic Teams sẽ thu giọng dịch và người khác nghe thấy.</li>
          <li>Dịch cabin bỏ qua phần nói đã là ngôn ngữ đích (vd tiếng Việt khi dịch sang tiếng Việt), nên giọng dịch lọt vào cũng không bị dịch lại.</li>
        </ol>
      </details>`;
    renderStage(); status();
  };

  function readForm() {
    if (!$('#ipSource') || S.active) return;
    saveOpts({ source: $('#ipSource').value, target: $('#ipTarget').value, engine: $('#ipEngine').value, voice: $('#ipVoice').checked, showSrc: $('#ipShowSrc').checked, size: +$('#ipSize').value });
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('#ipStart,#ipStop,#ipPip,#ipClear,#ipDl'); if (!t) return;
    if (t.id === 'ipStart') return start();
    if (t.id === 'ipStop') return stop();
    if (t.id === 'ipPip') return openPip().catch((er) => U.toast('Không mở được cửa sổ nổi: ' + er.message, 'err'));
    if (t.id === 'ipClear') { S.src = []; S.dst = []; S.srcStarts = []; return renderStage(); }
    if (t.id === 'ipDl') {
      const n = Math.max(S.src.length, S.dst.length); if (!n) return U.toast('Chưa có nội dung', 'info');
      let txt = `Dịch cabin — ${new Date(S.startedAt || Date.now()).toLocaleString('vi-VN')}\n\n`;
      for (let i = 0; i < n; i++) txt += `[${new Date(((S.src[i] || S.dst[i]) || {}).at || Date.now()).toLocaleTimeString('vi-VN')}]\n${(S.src[i] || {}).text || ''}\n→ ${(S.dst[i] || {}).text || ''}\n\n`;
      return U.download(new Blob([txt], { type: 'text/plain;charset=utf-8' }), 'dich-cabin.txt');
    }
  });
  document.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'ipVoice' || id === 'ipShowSrc') { saveOpts({ voice: $('#ipVoice').checked, showSrc: $('#ipShowSrc').checked }); if (id === 'ipVoice' && S.active && $('#ipVoice').checked) ensureOut(); return renderStage(); }
    if (/^ip(Source|Target|Engine)$/.test(id)) readForm();
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'ipSize') return;
    saveOpts({ size: +e.target.value });
    const s = e.target.parentElement.querySelector('.muted'); if (s) s.textContent = e.target.value + 'px';
    renderStage();
  });

  IP._test = { addText, setupMsg, S }; // kiểm tra tự động
  MD.Interp = IP;
})(window.MD);
