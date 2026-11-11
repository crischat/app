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
  const opts = () => Object.assign({ source: 'screen', target: 'vi', engine: 'live', voice: false, vspeed: 1.25, showSrc: true, size: 26 }, U.store.get(OKEY, {}));
  const saveOpts = (p) => U.store.set(OKEY, Object.assign(opts(), p));

  const S = {
    active: false, stream: null, ctx: null, proc: null, engine: 'live', model: '',
    conn: null, pending: [], fails: 0, reconnects: 0, rotating: false,
    src: [], dst: [], lastSrcAt: 0, lastDstAt: 0, srcStarts: [], lat: [],
    outCtx: null, outIn: null, fb: null, pip: null, startedAt: 0, id: '',
    open: { src: { text: '' }, dst: { text: '' } }, vq: [], vbuf: [], vlen: 0, vrate: 24000, vplaying: null, D: {}
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

  // Vị trí bật chép lời chưa rõ: tài liệu Live Translate đặt trong generationConfig, Live API chung đặt ở cấp setup.
  // 'both' gửi cả hai (máy chủ bỏ qua chỗ không dùng thì vẫn có chữ); bị báo sai cấu trúc thì thử 'setup', rồi 'gen'.
  const VARIANTS = ['both', 'setup', 'gen'];
  function setupMsg(model, variant) {
    const gc = { responseModalities: ['AUDIO'], translationConfig: { targetLanguageCode: opts().target, echoTargetLanguage: false } };
    const setup = { model: 'models/' + model, generationConfig: gc };
    if (variant !== 'gen') { setup.inputAudioTranscription = {}; setup.outputAudioTranscription = {}; }
    if (variant !== 'setup') { gc.inputAudioTranscription = {}; gc.outputAudioTranscription = {}; }
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
    // ưu tiên kiểu bị ép (khi có giọng mà không có chữ), rồi kiểu đã nhớ, rồi thứ tự mặc định
    const first = S.forceVariant || (VARIANTS.includes(s.liveTransVariant2) ? s.liveTransVariant2 : 'both');
    const order = [first].concat(VARIANTS.filter((v) => v !== first));
    S.forceVariant = null;
    let lastErr;
    for (const v of order) {
      try {
        const c = await openConn(key, S.model, v);
        S.variant = v; S.D.lastErr = ''; // lỗi của các lần thử kiểu khác không còn ý nghĩa khi đã kết nối được
        if (s.liveTransVariant2 !== v) U.store.set('settings', Object.assign(U.store.get('settings', {}), { liveTransVariant2: v }));
        return c;
      } catch (e) {
        lastErr = e; S.D.lastErr = e.message;
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

  // đoạn giọng có tiếng thật hay chỉ là im lặng (lấy mẫu thưa cho nhanh)
  function pcmLoud(b64data) {
    const bin = atob(b64data), n = bin.length >> 1; let sum = 0, k = 0;
    for (let i = 0; i < n; i += 8, k++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 0x8000) v -= 0x10000; sum += v * v; }
    return k && Math.sqrt(sum / k) / 32768 >= 0.004;
  }

  function onServer(m, c) {
    const D = S.D; D.msgs++;
    D.lastKeys = Object.keys(m).join(',') + (m.serverContent ? '{' + Object.keys(m.serverContent).join(',') + '}' : '');
    if (m.error) D.lastErr = JSON.stringify(m.error).slice(0, 160);
    if (m.goAway && c === S.conn) rotate('làm mới phiên');
    const sc = m.serverContent; if (!sc || c !== S.conn) return;
    if (sc.inputTranscription && sc.inputTranscription.text) { D.inTx++; addText('src', sc.inputTranscription.text); }
    if (sc.outputTranscription && sc.outputTranscription.text) { D.outTx++; addText('dst', sc.outputTranscription.text); }
    if (sc.modelTurn && sc.modelTurn.parts) sc.modelTurn.parts.forEach((p) => {
      if (p.text) { D.outTx++; addText('dst', p.text); } // phòng khi mô hình trả chữ trực tiếp
      if (p.inlineData && p.inlineData.data) {
        D.audio++; if (pcmLoud(p.inlineData.data)) D.voiced = (D.voiced || 0) + 1;
        if (voiceOn()) playPcm(p.inlineData.data, p.inlineData.mimeType || '');
      }
    });
  }

  /* =================== Thu âm thanh -> PCM 16 kHz =================== */
  const b64 = (i16) => { const u = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  function sendChunk(c, i16) {
    c.ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64(i16), mimeType: 'audio/pcm;rate=16000' } } }));
    S.D.sent++;
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
      const rms = Math.sqrt(sum / d.length);
      S.D.level = rms; if (rms > 0.004) S.D.lastSoundAt = Date.now();
      const lv = $('#ipLv'); if (lv) lv.style.width = Math.min(100, rms / 0.12 * 100) + '%';
      if (S.engine !== 'live') return;
      const n = Math.floor(d.length / ratio), out = new Int16Array(n);
      // không bao giờ chặn âm thanh đầu vào (bản trước chặn khi đang đọc dịch -> mất ~90% lời nói)
      for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, d[Math.floor(i * ratio)])); out[i] = x < 0 ? x * 0x8000 : x * 0x7fff; }
      if (S.conn && S.conn.ready && S.conn.ws.readyState === 1) sendChunk(S.conn, out);
      else { S.pending.push(out); if (S.pending.length > 60) S.pending.shift(); } // giữ tối đa ~8 giây trong lúc nối lại
    };
    S.ctx = ctx; S.proc = proc;
  }

  /* =================== Giọng dịch: nhanh hơn mà không méo =================== */
  // Gom các mảnh PCM 24 kHz thành từng cụm (ngắt khi 250 ms không có mảnh mới, hoặc đủ 3 giây),
  // rồi phát bằng <audio> có giữ cao độ (preservesPitch) ở tốc độ đã chọn. Dồn nhiều thì tự tăng tốc / bỏ bớt để đuổi kịp.
  function ensureOut() {
    if (S.outCtx) { if (S.outCtx.state === 'suspended') S.outCtx.resume(); return; }
    S.outCtx = new (window.AudioContext || window.webkitAudioContext)();
    // lọc âm cao + giới hạn đỉnh: chặn tiếng chói nếu mô hình sinh nhiễu
    const lp = S.outCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7500;
    const lim = S.outCtx.createDynamicsCompressor(); lim.threshold.value = -8; lim.ratio.value = 12; lim.attack.value = 0.002; lim.release.value = 0.1;
    lp.connect(lim); lim.connect(S.outCtx.destination); S.outIn = lp;
  }
  const voiceOn = () => opts().voice && S.ownExcluded !== false;
  function playPcm(data, mime) {
    const rate = +((mime.match(/rate=(\d+)/) || [])[1] || 24000);
    const bin = atob(data), n = bin.length >> 1, i16 = new Int16Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) { const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); i16[i] = v >= 0x8000 ? v - 0x10000 : v; sum += i16[i] * i16[i]; }
    // Gemini gửi cả các đoạn im lặng giữa câu: không đưa vào hàng đợi (chỉ làm chậm giọng dịch)
    if (Math.sqrt(sum / Math.max(1, n)) / 32768 < 0.004 && !S.vlen) return;
    S.vbuf.push(i16); S.vlen += n; S.vrate = rate;
    clearTimeout(S.vtimer);
    if (S.vlen > rate * 3) flushVoice(); else S.vtimer = setTimeout(flushVoice, 250);
  }
  function flushVoice() {
    if (!S.vlen) return;
    const n = S.vlen, rate = S.vrate, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    let o = 44; S.vbuf.forEach((c) => { for (let i = 0; i < c.length; i++, o += 2) v.setInt16(o, c[i], true); });
    S.vbuf = []; S.vlen = 0;
    S.vq.push(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
    while (S.vq.length > 5) URL.revokeObjectURL(S.vq.shift()); // tụt quá xa -> bỏ cụm cũ nhất cho kịp lời đang nói
    playNextVoice();
  }
  function playNextVoice() {
    if (S.vplaying || !S.vq.length) return;
    const url = S.vq.shift(), a = new Audio(url);
    a.preservesPitch = true;
    const base = +opts().vspeed || 1.25, backlog = S.vq.length;
    a.playbackRate = Math.min(2, base * (backlog >= 3 ? 1.3 : backlog >= 1 ? 1.12 : 1));
    ensureOut();
    try { S.outCtx.createMediaElementSource(a).connect(S.outIn); } catch (e) { /* phát thẳng nếu không nối được */ }
    S.vplaying = a;
    const done = () => { URL.revokeObjectURL(url); if (S.vplaying === a) S.vplaying = null; S.vEndAt = Date.now(); playNextVoice(); };
    a.onended = done; a.onerror = done;
    a.play().catch(done);
  }
  function stopVoice() {
    clearTimeout(S.vtimer); S.vbuf = []; S.vlen = 0;
    if (S.vplaying) { try { S.vplaying.pause(); } catch (e) { /* bỏ qua */ } S.vplaying = null; }
    (S.vq || []).forEach((u) => URL.revokeObjectURL(u)); S.vq = [];
  }

  /* =================== Chữ: tách từng câu, chống lặp =================== */
  const GAP = 1500; // ngừng > 1,5 giây -> chốt câu đang dở
  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const words = (s) => norm(s).replace(/[^\p{L}\p{N}\s']/gu, ' ').split(' ').filter(Boolean);
  const VN = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
  // câu nằm ở dòng GỐC nhưng lại là ngôn ngữ đích -> giọng dịch bị thu ngược lại, bỏ
  // đo theo TỈ LỆ từ có dấu tiếng Việt, không bỏ cả câu tiếng Anh chỉ vì dính 1 chữ tiếng Việt
  const vnRatio = (s) => { const w = words(s); return w.length ? w.filter((x) => VN.test(x)).length / w.length : 0; };
  const looksLikeTarget = (s) => (opts().target === 'vi' ? vnRatio(s) >= 0.35 : vnRatio(s) < 0.1 && words(s).length >= 3);
  function overlap(a, b) { const B = new Set(b); let i = 0; new Set(a).forEach((w) => { if (B.has(w)) i++; }); return i / Math.min(new Set(a).size, B.size); }

  // gộp mảnh mới vào câu đang dở: bỏ mảnh gửi lại, thay bản cộng dồn, nối phần chồng lấn
  function mergeFrag(cur, frag, lastFrag) {
    const nc = norm(cur), nf = norm(frag);
    if (!nf) return cur;
    if (nf.length >= 6 && nf === norm(lastFrag || '')) return cur;
    if (nf.length >= 12 && nc.endsWith(nf)) return cur;
    if (nc.length >= 2 && nf.length > nc.length && nf.startsWith(nc)) return frag.trimStart();
    for (let k = Math.min(cur.length, frag.length); k >= 10; k--) {
      if (cur.slice(-k).toLowerCase() === frag.slice(0, k).toLowerCase()) return cur + frag.slice(k);
    }
    return cur + frag;
  }

  // chốt 1 câu: bỏ câu trùng / mảnh đuôi lặp; câu GẦN GIỐNG câu vừa rồi = bản sửa của máy chủ -> thay thế
  function pushSentence(kind, text, at) {
    text = text.replace(/\s+/g, ' ').trim(); if (!text) return;
    if (kind === 'src' && looksLikeTarget(text)) { S.D.echo = (S.D.echo || 0) + 1; return; }
    const arr = S[kind], wn = words(text);
    if (!wn.length) return;
    for (let j = arr.length - 1; j >= Math.max(0, arr.length - 2); j--) {
      const p = arr[j], wp = words(p.text);
      if (!wp.length) continue; // hàng bù trống
      if (norm(p.text) === norm(text)) return;
      if (wn.length <= 4 && wn.every((x) => wp.includes(x))) return;
      if (wn.length >= 3 && wp.length >= 3 && overlap(wn, wp) >= 0.85) { p.text = text; return; }
    }
    arr.push({ text, at });
    if (kind === 'src') S.srcStarts.push(at);
    else { const st = S.srcStarts[arr.length - 1]; if (st) { S.lat.push((Date.now() - st) / 1000); if (S.lat.length > 8) S.lat.shift(); } }
  }

  function addText(kind, frag) {
    const now = Date.now(), o = S.open[kind]; S.lastFragAt = now;
    (S.evlog = S.evlog || []).push({ t: now - S.startedAt, k: kind, x: frag }); if (S.evlog.length > 600) S.evlog.shift();
    if (o.text && now - o.at > GAP) { pushSentence(kind, o.text, o.start); o.text = ''; }
    if (!o.text) { o.text = frag.trimStart(); o.start = now; } else o.text = mergeFrag(o.text, frag, o.lastFrag);
    o.at = now; o.lastFrag = frag;
    // tách các câu đã có dấu kết thúc, phần dở giữ lại
    let m;
    while ((m = o.text.match(/^\s*([^.!?…]*?\p{L}[^.!?…]*[.!?…]+["')\]]?)(\s+|$)/u))) {
      pushSentence(kind, m[1], o.start);
      o.text = o.text.slice(m[0].length); o.start = now;
    }
    renderStage(); status();
  }
  function flushOpen(force) {
    const now = Date.now();
    ['src', 'dst'].forEach((k) => { const o = S.open[k]; if (o.text && (force || now - o.at > GAP)) { pushSentence(k, o.text, o.start); o.text = ''; } });
  }
  // Hết một lượt nói (cả hai bên im > 2,5 giây) mà số câu Anh/Việt lệch nhau -> bù hàng trống cho bên thiếu,
  // để lượt sau bắt đầu thẳng hàng (lệch không kéo dài cả buổi)
  function resync() {
    if (!S.lastFragAt || Date.now() - S.lastFragAt < 2500 || S.open.src.text || S.open.dst.text) return;
    const d = S.src.length - S.dst.length, at = Date.now();
    if (d > 0) for (let i = 0; i < d; i++) S.dst.push({ text: '', at, pad: true });
    if (d < 0) for (let i = 0; i < -d; i++) { S.src.push({ text: '', at, pad: true }); S.srcStarts.push(at); }
  }
  // dự phòng: mỗi câu ngắn trả về cùng lúc gốc + dịch
  function addPair(src, dst) {
    const now = Date.now();
    if (src) pushSentence('src', src, now);
    if (dst) pushSentence('dst', dst, now);
    renderStage();
  }

  /* =================== Phụ đề song ngữ: mỗi câu 1 hàng (Anh trên, Việt dưới), cuộn xem lại =================== */
  function rows() {
    const out = [], os = S.open.src.text, od = S.open.dst.text;
    const n = Math.max(S.src.length + (os ? 1 : 0), S.dst.length + (od ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const s = S.src[i], d = S.dst[i];
      out.push({ en: s ? s.text : (i === S.src.length ? os : ''), vi: d ? d.text : (i === S.dst.length ? od : ''), at: (s || d || {}).at || Date.now(), live: !d });
    }
    return out;
  }
  function stageIn(doc) {
    const st = doc.getElementById('ipStage'); if (!st) return null;
    if (!st.querySelector('.ip-rows')) {
      st.innerHTML = '<div class="ip-rows"></div><button class="ip-jump" hidden>↓ Mới nhất</button><div class="ip-diag"></div>';
      const box = st.querySelector('.ip-rows'), jump = st.querySelector('.ip-jump');
      box.addEventListener('scroll', () => { if (box.scrollHeight - box.scrollTop - box.clientHeight < 40) jump.hidden = true; });
      jump.addEventListener('click', () => { box.scrollTop = box.scrollHeight; jump.hidden = true; });
    }
    return st;
  }
  function renderStage() {
    const o = opts(), list = rows();
    const tm = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const html = list.slice(-200).map((r, i, a) => `<div class="ip-row ${i === a.length - 1 ? 'now' : ''}">
        ${o.showSrc ? `<div class="ip-en"><time>${tm(r.at)}</time>${esc(r.en) || '<span class="muted">…</span>'}</div>` : ''}
        <div class="ip-vi">${esc(r.vi) || '<span class="muted">… đang dịch</span>'}</div></div>`).join('')
      || `<div class="ip-row"><div class="ip-vi muted">Phụ đề song ngữ hiện ở đây: mỗi câu một dòng ${o.target === 'vi' ? 'Anh' : 'Việt'} và một dòng ${o.target === 'vi' ? 'Việt' : 'Anh'}.</div></div>`;
    [document, S.pip && S.pip.document].forEach((doc) => {
      if (!doc) return;
      const st = stageIn(doc); if (!st) return;
      st.style.setProperty('--ip-size', o.size + 'px');
      const box = st.querySelector('.ip-rows'), jump = st.querySelector('.ip-jump');
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
      box.innerHTML = html;
      // đang cuộn lên xem lại thì giữ nguyên, chỉ hiện nút "Mới nhất"
      if (atBottom) box.scrollTop = box.scrollHeight; else jump.hidden = false;
    });
    renderDiag();
    const log = $('#ipLog');
    if (log && log.closest('details') && log.closest('details').open) {
      log.innerHTML = list.map((r) => `<div class="turn them"><div class="txt">${esc(r.vi || '…')}</div>${r.en ? `<div class="tr">${esc(r.en)}</div>` : ''}</div>`).join('') || '<p class="muted">Biên bản đầy đủ của buổi dịch.</p>';
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
      audio: { suppressLocalAudioPlayback: false, restrictOwnAudio: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
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
    // Giọng dịch có bị thu ngược lại không? Tab: không (chỉ thu tab Teams). Mic: Chrome tự khử tiếng vọng.
    // Âm thanh hệ thống: chỉ an toàn khi Chrome loại trừ được âm thanh của chính trang này (restrictOwnAudio).
    const tr = S.stream.getAudioTracks()[0], st = (tr && tr.getSettings) ? tr.getSettings() : {};
    S.ownExcluded = o.source !== 'screen' || st.restrictOwnAudio === true;
    if (o.voice && !S.ownExcluded) U.toast('Chrome này chưa loại trừ được âm thanh của chính trang khỏi âm thanh hệ thống → tắt giọng dịch để tránh dội, chỉ chạy phụ đề. Muốn nghe giọng dịch: dùng Teams trên trình duyệt (nguồn tab).', 'info', 10000);
    Object.assign(S, { active: true, src: [], dst: [], srcStarts: [], lat: [], pending: [], fails: 0, reconnects: 0, lastSrcAt: 0, lastDstAt: 0, startedAt: Date.now(), id: U.uid(), engine: o.engine, conn: null, open: { src: { text: '' }, dst: { text: '' } }, tried: new Set(), forceVariant: null, evlog: [] });
    S.D = { sent: 0, msgs: 0, inTx: 0, outTx: 0, audio: 0, level: 0, lastSoundAt: 0, lastErr: '', lastKeys: '', warn: '' };
    clearInterval(S.wd); S.wd = setInterval(watchdog, 1000);
    S.stream.getTracks().forEach((t) => t.addEventListener('ended', () => { if (S.active) { U.toast('Đã dừng chia sẻ — kết thúc dịch.', 'info'); stop(); } }));
    ensureOut(); // tạo bộ phát ngay trong lúc bấm nút (Chrome chặn tự phát âm thanh nếu tạo về sau)
    IP.render();
    startCapture(new MediaStream(S.stream.getAudioTracks()));
    if (S.engine === 'live') {
      status('đang kết nối…');
      try { await useConn(await connect()); }
      catch (e) { S.D.lastErr = e.message; U.toast('Không mở được Gemini Live: ' + e.message + ' — chuyển sang dịch theo câu ngắn.', 'err', 9000); switchToFallback(); }
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
          S.D.msgs++; S.D.inTx++; S.D.outTx++;
          addPair(j.text, j.translation || j.text); status();
        }).catch((e) => { S.D.lastErr = e.message; if (Date.now() - t0 < 60000) status('lỗi: ' + e.message.slice(0, 60)); });
      }
    });
    status();
  }

  /* =================== Chẩn đoán: tự phát hiện vì sao không ra chữ =================== */
  const WARN = {
    silent: '🔇 Chrome KHÔNG thu được âm thanh nào (thanh 🔊 trống). Teams cài trên máy thường phát ra “thiết bị liên lạc” (Default Communication Device) khác thiết bị Chrome thu. Cách chắc nhất: mở cuộc họp bằng Teams trên trình duyệt và chọn nguồn “chia sẻ tab”. Hoặc: Win+R → mmsys.cpl → Playback → chuột phải thiết bị bạn đang nghe Teams → Set as Default Device + Set as Default Communication Device, rồi trong Teams → Cài đặt → Thiết bị → Loa chọn đúng thiết bị đó.',
    audioNoText: '🔈 Gemini trả giọng dịch nhưng không kèm chữ — bật “🎧 Đọc bản dịch” để nghe trong lúc mình đổi cách bật chép lời.',
    noReply: '⏳ Đã gửi âm thanh nhưng Gemini chưa trả gì — xem lỗi bên dưới, hoặc đổi Chế độ sang “Theo câu ngắn”.'
  };
  function watchdog() {
    if (!S.active) return;
    const before = S.src.length + S.dst.length; flushOpen(); resync(); if (S.src.length + S.dst.length !== before) renderStage();
    const D = S.D, now = Date.now(), up = now - S.startedAt;
    let warn = '';
    if (up > 8000 && now - Math.max(D.lastSoundAt, S.startedAt) > 8000) warn = 'silent';
    else if (S.engine === 'live' && (D.voiced || 0) >= 25 && D.inTx + D.outTx === 0) warn = 'audioNoText';
    else if (S.engine === 'live' && up > 15000 && D.sent > 80 && D.msgs === 0 && now - D.lastSoundAt < 3000) warn = 'noReply';
    if (warn !== D.warn) {
      D.warn = warn;
      if (warn === 'silent') U.toast('Không thu được âm thanh từ Teams — xem hướng dẫn trong khung phụ đề.', 'err', 8000);
    }
    // có giọng mà không có chữ -> thử kiểu bật chép lời khác (mỗi kiểu một lần)
    if (warn === 'audioNoText' && !S.rotating) {
      S.tried.add(S.variant);
      const next = VARIANTS.find((v) => !S.tried.has(v));
      if (next) { S.forceVariant = next; D.voiced = 0; rotate('đổi cách bật chép lời → ' + next); }
    }
    renderDiag();
  }
  function renderDiag() {
    const D = S.D; if (!D) return;
    const bars = '▮'.repeat(Math.min(8, Math.round(D.level / 0.12 * 8))).padEnd(8, '▯');
    const html = !S.active ? '' : `<div>🔊 ${bars} · gửi ${D.sent} · nhận ${D.msgs} (gốc ${D.inTx} · dịch ${D.outTx} · giọng ${D.audio}${D.echo ? ' · lọc ' + D.echo + ' câu dội' : ''}${opts().voice ? (voiceOn() ? ' · đang đọc dịch' : ' · giọng dịch tắt (tránh dội)') : ''}) · ${S.engine === 'live' ? 'Live/' + (S.variant || '…') : 'câu ngắn'}</div>`
      + (D.warn ? `<div class="ip-warn">${esc(WARN[D.warn])}</div>` : '')
      + (D.lastErr ? `<div class="ip-err">Lỗi gần nhất: ${esc(D.lastErr)}</div>` : '');
    [document, S.pip && S.pip.document].forEach((doc) => { if (!doc) return; const el = doc.querySelector('.ip-diag'); if (el) el.innerHTML = html; });
  }

  function stop() {
    if (!S.active) return;
    S.active = false; window.onbeforeunload = null; clearInterval(S.wd);
    if (S.conn) { try { S.conn.ws.close(1000); } catch (e) { /* đã đóng */ } S.conn = null; }
    if (S.fb) { S.fb.stop(); S.fb = null; }
    if (S.proc) { S.proc.onaudioprocess = null; try { S.ctx.close(); } catch (e) { /* đã đóng */ } }
    if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    stopVoice(); flushOpen(true);
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
          <label class="field inl" style="flex-direction:row;align-items:center;gap:6px">Tốc độ giọng<select id="ipVSpeed">${[1, 1.15, 1.25, 1.4, 1.6].map((x) => `<option value="${x}" ${+o.vspeed === x ? 'selected' : ''}>${x}x</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" id="ipShowSrc" ${o.showSrc ? 'checked' : ''}><span>Hiện dòng gốc</span></label>
        </div>
        ${o.voice ? '<p class="muted" style="font-size:12.5px;margin:6px 0 0">Giọng dịch không bao giờ làm ngắt phần nghe. Với nguồn “âm thanh hệ thống”, giọng dịch chỉ bật khi Chrome loại trừ được âm thanh của chính trang này (nếu không, app tự tắt giọng và chỉ chạy phụ đề để tránh dội). Nguồn tab (Teams trên trình duyệt) luôn nghe được giọng dịch. Luôn đeo tai nghe.</p>' : ''}
        <div class="row wrap mt">
          ${S.active ? '<button class="btn danger" id="ipStop">■ Dừng dịch</button>' : '<button class="btn primary" id="ipStart">▶ Bắt đầu dịch</button>'}
          <button class="btn" id="ipPip">📌 Phụ đề nổi trên Teams</button>
          <button class="btn ghost" id="ipClear">Xoá màn hình</button>
          <button class="btn ghost" id="ipDl">⬇ Tải biên bản</button>
          <button class="btn ghost" id="ipLog2" title="Các gói chữ Gemini gửi về (không có âm thanh) — gửi cho người hỗ trợ khi có lỗi">⬇ Nhật ký kỹ thuật</button>
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
    const t = e.target.closest('#ipStart,#ipStop,#ipPip,#ipClear,#ipDl,#ipLog2'); if (!t) return;
    if (t.id === 'ipLog2') {
      if (!(S.evlog || []).length) return U.toast('Chưa có dữ liệu', 'info');
      const info = { model: S.model, variant: S.variant, engine: S.engine, diag: S.D, events: S.evlog };
      return U.download(new Blob([JSON.stringify(info, null, 1)], { type: 'application/json' }), 'dich-cabin-nhat-ky.json');
    }
    if (t.id === 'ipStart') return start();
    if (t.id === 'ipStop') return stop();
    if (t.id === 'ipPip') return openPip().catch((er) => U.toast('Không mở được cửa sổ nổi: ' + er.message, 'err'));
    if (t.id === 'ipClear') { S.src = []; S.dst = []; S.srcStarts = []; S.open = { src: { text: '' }, dst: { text: '' } }; return renderStage(); }
    if (t.id === 'ipDl') {
      const n = Math.max(S.src.length, S.dst.length); if (!n) return U.toast('Chưa có nội dung', 'info');
      let txt = `Dịch cabin — ${new Date(S.startedAt || Date.now()).toLocaleString('vi-VN')}\n\n`;
      for (let i = 0; i < n; i++) txt += `[${new Date(((S.src[i] || S.dst[i]) || {}).at || Date.now()).toLocaleTimeString('vi-VN')}]\n${(S.src[i] || {}).text || ''}\n→ ${(S.dst[i] || {}).text || ''}\n\n`;
      return U.download(new Blob([txt], { type: 'text/plain;charset=utf-8' }), 'dich-cabin.txt');
    }
  });
  document.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'ipVSpeed') return saveOpts({ vspeed: +e.target.value });
    if (id === 'ipVoice' || id === 'ipShowSrc') {
      saveOpts({ voice: $('#ipVoice').checked, showSrc: $('#ipShowSrc').checked });
      if (id === 'ipVoice') { if ($('#ipVoice').checked) { if (S.active) ensureOut(); } else stopVoice(); return IP.render(); }
      return renderStage();
    }
    if (/^ip(Source|Target|Engine)$/.test(id)) readForm();
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'ipSize') return;
    saveOpts({ size: +e.target.value });
    const s = e.target.parentElement.querySelector('.muted'); if (s) s.textContent = e.target.value + 'px';
    renderStage();
  });

  IP._test = { addText, setupMsg, S, flushOpen, resync, playPcm }; // kiểm tra tự động
  MD.Interp = IP;
})(window.MD);
