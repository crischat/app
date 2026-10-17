/* Interview Copilot — Phỏng vấn thử với AI: AI hỏi bằng giọng nói, bạn trả lời bằng mic, cuối buổi chấm điểm */
(function (MD) {
  'use strict';
  const U = MD.U, AI = MD.AI, AU = MD.Audio;
  const { $, $$, esc } = U;
  const MK = {};
  const OKEY = 'copilot_mock';
  const PERSONAS = {
    hr: 'Chuyên viên/Trưởng phòng Nhân sự (vòng HR: giới thiệu, động lực, lý do nghỉ việc, văn hoá, lương & điều kiện làm việc, đi lại, thời gian bắt đầu)',
    manager: 'Quản lý trực tiếp của vị trí (Hiring Manager: kinh nghiệm thực tế, cách xử lý tình huống, kết quả đạt được, kế hoạch 90 ngày, quản lý đội nhóm)',
    tech: 'Chuyên gia kỹ thuật/dữ liệu (chuyên môn: Excel/VBA, Power BI, SQL, master data, quy trình kho, tự động hoá — hỏi sâu "làm thế nào", con số, cách kiểm chứng)',
    director: 'Giám đốc vận hành (tầm nhìn, tư duy kinh doanh, ưu tiên, ra quyết định, gây áp lực nhẹ)'
  };
  const PERSONA_LABEL = { hr: 'HR', manager: 'Quản lý trực tiếp', tech: 'Chuyên môn / kỹ thuật', director: 'Giám đốc vận hành' };
  const DIFF = { easy: 'Thân thiện, gợi mở, ít hỏi vặn', real: 'Thực tế như buổi phỏng vấn thật, có hỏi đào sâu khi trả lời chung chung', hard: 'Khó: hỏi vặn, thử thách mâu thuẫn, đòi số liệu, gây áp lực vừa phải (vẫn lịch sự)' };
  const opts = () => Object.assign({ persona: 'hr', lang: 'vi', n: 8, diff: 'real', voice: '', rate: 1.05, wait: 2.5, hint: true, showQ: true }, U.store.get(OKEY, {}));
  const saveOpts = (p) => U.store.set(OKEY, Object.assign(opts(), p));

  // Trạng thái buổi tập
  const M = { active: false, state: 'idle', turns: [], messages: [], parts: [], pendingStt: 0, timer: null, mic: null, listener: null, ttsEnd: 0, asked: 0, startedAt: 0, ended: false, hintAbort: null };

  /* =================== Giọng đọc =================== */
  // Giọng AI Gemini (đọc tốt tiếng Việt, không cần cài giọng trên máy). Giá trị opts.voice: 'g:<tên giọng>'
  const GEMINI_VOICES = { Kore: 'Nữ — rõ ràng, chắc chắn', Aoede: 'Nữ — nhẹ nhàng', Leda: 'Nữ — trẻ trung', Zephyr: 'Nữ — tươi sáng', Charon: 'Nam — trầm, điềm tĩnh', Puck: 'Nam — vui vẻ', Orus: 'Nam — chắc chắn', Fenrir: 'Nam — hào hứng' };
  const voices = () => (window.speechSynthesis ? speechSynthesis.getVoices() : []);
  const voicesFor = (lang) => voices().filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
  const isGemini = (o) => !o.voice || o.voice.startsWith('g:');
  function pickVoice(o) {
    const list = voicesFor(o.lang);
    return list.find((v) => v.name === o.voice) || list.find((v) => /natural|online|google/i.test(v.name)) || list[0] || null;
  }
  function stopSpeaking() {
    M.ttsStop = true;
    if (window.speechSynthesis) speechSynthesis.cancel();
    if (M.src) {
      // giảm âm trong ~50 ms rồi mới dừng -> không bị tiếng bụp khi bấm Bỏ qua/Kết thúc
      try { const t = M.ac.currentTime; M.gain.gain.setTargetAtTime(0, t, 0.012); M.src.onended = null; M.src.stop(t + 0.06); } catch (e) { /* đã dừng */ }
      M.src = null;
    }
    if (M.speakDone) { const f = M.speakDone; M.speakDone = null; f(); }
  }

  // Tìm mô hình Gemini đọc giọng (tên có "tts") trong danh sách Google trả về, nhớ lại để lần sau khỏi tìm
  async function ttsModel(key, refresh) {
    const s = U.store.get('settings', {});
    if (s.geminiTTSModel && !refresh) return s.geminiTTSModel;
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || 'Không lấy được danh sách mô hình');
    const list = (j.models || []).map((m) => m.name.replace(/^models\//, '')).filter((n) => /tts/i.test(n));
    if (!list.length) throw new Error('Key Gemini này chưa có mô hình đọc giọng (TTS).');
    const ver = (n) => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const model = list.sort((a, b) => ((/flash/.test(b) ? 10 : 0) + ver(b)) - ((/flash/.test(a) ? 10 : 0) + ver(a)))[0];
    U.store.set('settings', Object.assign(U.store.get('settings', {}), { geminiTTSModel: model }));
    return model;
  }

  // Gọi Gemini TTS cho 1 đoạn văn -> AudioBuffer đã làm sạch
  async function ttsFetch(text, voiceName) {
    const key = MD.CP.keys().geminiKey;
    if (!key) throw new Error('Chưa có Gemini key');
    let model = await ttsModel(key), r;
    for (let attempt = 0; attempt < 2; attempt++) {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } })
      });
      if (r.status === 404 && attempt === 0) { model = await ttsModel(key, true); continue; } // mô hình đã đổi tên -> tìm lại
      break;
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((r.status === 429 ? 'Hết hạn mức giọng đọc Gemini: ' : 'Gemini TTS: ') + ((j.error && j.error.message) || r.status));
    const part = (((j.candidates || [])[0] || {}).content || { parts: [] }).parts.find((p) => p.inlineData);
    if (!part) throw new Error('Gemini TTS không trả về âm thanh');
    return pcmToBuffer(part.inlineData.data, part.inlineData.mimeType || '');
  }

  /* PCM 16-bit -> AudioBuffer, có làm sạch để tránh tiếng "bụp/khẹt":
     - bỏ header nếu dữ liệu là file WAV
     - cắt đuôi im lặng/nhiễu và 25 ms cuối (hay có mẫu lỗi)
     - tăng âm dần 10 ms ở đầu, giảm âm dần 40 ms ở cuối */
  function pcmToBuffer(b64, mime) {
    const bin = atob(b64);
    let off = 0, rate = +((mime.match(/rate=(\d+)/) || [])[1] || 24000);
    if (bin.slice(0, 4) === 'RIFF') {
      const u32 = (i) => (bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8) | (bin.charCodeAt(i + 2) << 16) | (bin.charCodeAt(i + 3) << 24)) >>> 0;
      rate = u32(24) || rate;
      let p = 12; while (p + 8 <= bin.length) { const id = bin.slice(p, p + 4), sz = u32(p + 4); if (id === 'data') { off = p + 8; break; } p += 8 + sz + (sz & 1); }
    }
    const total = Math.floor((bin.length - off) / 2);
    const f = new Float32Array(total);
    for (let i = 0; i < total; i++) { let v = bin.charCodeAt(off + 2 * i) | (bin.charCodeAt(off + 2 * i + 1) << 8); if (v >= 0x8000) v -= 0x10000; f[i] = v / 0x8000; }
    // tìm mẫu cuối cùng còn tiếng nói rõ (bỏ qua đuôi im lặng/nhiễu), giữ thêm 60 ms cho tự nhiên
    let end = total - Math.round(rate * 0.025);
    let lastVoice = 0; for (let i = end - 1; i >= 0; i--) { if (Math.abs(f[i]) > 0.02) { lastVoice = i; break; } }
    end = Math.max(1, Math.min(end, lastVoice + Math.round(rate * 0.06)));
    const fin = Math.min(Math.round(rate * 0.01), end), fout = Math.min(Math.round(rate * 0.04), end);
    for (let i = 0; i < fin; i++) f[i] *= i / fin;
    for (let i = 0; i < fout; i++) f[end - 1 - i] *= i / fout;
    M.ac = M.ac || new (window.AudioContext || window.webkitAudioContext)();
    const buf = M.ac.createBuffer(1, end, rate);
    buf.getChannelData(0).set(f.subarray(0, end));
    return buf;
  }

  function playBuffer(buf) {
    return new Promise(async (resolve) => {
      if (M.ac.state === 'suspended') await M.ac.resume();
      const src = M.ac.createBufferSource(); src.buffer = buf;
      // đi qua 1 nút gain để có thể tắt mượt khi bấm dừng, không bị bụp
      const g = M.ac.createGain(); src.connect(g); g.connect(M.ac.destination);
      M.src = src; M.gain = g; M.speakDone = resolve;
      src.onended = () => { M.src = null; M.speakDone = null; resolve(); };
      src.start();
    });
  }

  // Chia đoạn đọc thành các câu (gộp câu quá ngắn) để câu đầu phát sớm hơn
  function chunkText(text) {
    const sents = text.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]*\s*/g) || [text];
    const out = [];
    sents.forEach((s) => { s = s.trim(); if (!s) return; if (out.length && (out[out.length - 1].length < 40 || s.length < 25)) out[out.length - 1] += ' ' + s; else out.push(s); });
    return out.length ? out : [text];
  }

  // Đọc bằng Gemini: phát câu 1 ngay khi có, trong lúc đó tạo sẵn câu tiếp theo
  async function geminiSpeak(text, voiceName) {
    const parts = chunkText(text);
    M.ttsStop = false;
    let next = ttsFetch(parts[0], voiceName);
    for (let i = 0; i < parts.length; i++) {
      const buf = await next;
      if (M.ttsStop) return;
      if (i + 1 < parts.length) { next = ttsFetch(parts[i + 1], voiceName); next.catch(() => {}); }
      const st = $('#mkInfo'); if (st && i === 0) st.textContent = '';
      await playBuffer(buf);
      if (M.ttsStop) return;
    }
  }

  MK._test = { pcmToBuffer, chunkText }; // dùng để kiểm tra tự động

  // Dò sẵn mô hình đọc giọng để lần đọc đầu không phải chờ thêm
  MK.warmup = () => { const k = MD.CP.keys().geminiKey; if (k && isGemini(opts())) ttsModel(k).catch(() => {}); };
  async function speak(text) {
    const o = opts();
    if (isGemini(o)) {
      const st = $('#mkInfo'); if (st) st.textContent = 'đang tạo giọng đọc…';
      try { await geminiSpeak(text, (o.voice || 'g:Kore').slice(2)); M.ttsEnd = Date.now(); if (st) st.textContent = ''; return; }
      catch (e) {
        U.toast('Giọng Gemini lỗi: ' + e.message + (voicesFor(o.lang).length ? ' — chuyển sang giọng trình duyệt.' : ' — chỉ hiện chữ.'), 'err', 7000);
        if (!voicesFor(o.lang).length) { M.ttsEnd = Date.now(); return; }
      }
    }
    return browserSpeak(text);
  }

  function browserSpeak(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      const o = opts(), v = pickVoice(o);
      speechSynthesis.cancel();
      // đọc từng câu: Chrome hay dừng giữa chừng với đoạn đọc dài > 15 giây
      const sents = text.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]*\s*/g) || [text];
      let i = 0;
      const next = () => {
        if (i >= sents.length || !M.active) { M.ttsEnd = Date.now(); return resolve(); }
        const u = new SpeechSynthesisUtterance(sents[i++].trim());
        u.lang = o.lang === 'en' ? 'en-US' : 'vi-VN'; if (v) u.voice = v; u.rate = +o.rate || 1;
        u.onend = next; u.onerror = next;
        speechSynthesis.speak(u);
      };
      next();
    });
  }

  /* =================== Prompt =================== */
  function interviewerSys() {
    const CP = MD.CP, p = CP.profile(), o = opts();
    return `Bạn đóng vai NGƯỜI PHỎNG VẤN: ${PERSONAS[o.persona]}.
Bạn đang phỏng vấn ứng viên ${p.name || ''} cho vị trí "${p.role || '(chưa rõ)'}" tại "${p.company || '(chưa rõ)'}". Phỏng vấn bằng ${o.lang === 'en' ? 'TIẾNG ANH' : 'TIẾNG VIỆT'} (xưng hô tự nhiên${o.lang === 'vi' ? ': chị/anh – em' : ''}).
Phong cách: ${DIFF[o.diff]}.
Quy tắc:
- Mỗi lượt chỉ nói 1 câu hỏi (có thể kèm 1 câu dẫn ngắn). Văn nói tự nhiên, tối đa 3 câu, KHÔNG markdown, KHÔNG gạch đầu dòng, KHÔNG emoji — vì nội dung sẽ được đọc to.
- Dựa vào CV và JD để hỏi cụ thể (dự án, con số, công ty cũ, khoảng trống, điểm chưa khớp với JD). Nếu câu trả lời chung chung, thiếu số liệu hoặc mâu thuẫn với CV → hỏi đào sâu trước khi chuyển chủ đề.
- KHÔNG khen, chấm điểm hay nhận xét câu trả lời trong lúc phỏng vấn (chỉ phản hồi ngắn kiểu "Ừ, chị hiểu" rồi hỏi tiếp).
- Tổng khoảng ${o.n} câu hỏi chính. Câu áp chót: mời ứng viên đặt câu hỏi cho bạn và trả lời ngắn gọn, hợp lý. Sau đó cảm ơn, nói bước tiếp theo, rồi kết thúc bằng thẻ [KẾT THÚC] ở cuối cùng.
- Nếu tin nhắn của ứng viên là "(…)" mô tả hành động (bỏ qua, im lặng), xử lý tự nhiên như người phỏng vấn thật.
- Bạn KHÔNG biết các ghi chú riêng của ứng viên ngoài CV.

# CV ỨNG VIÊN
${(p.cv || '(không có CV)').slice(0, 20000)}

# MÔ TẢ CÔNG VIỆC / BỐI CẢNH CÔNG TY (bạn là người của công ty này)
${(p.jd || '(không có JD — tự giả định hợp lý theo vị trí)').slice(0, 10000)}`;
  }

  const aiOpts = () => Object.assign({}, MD.CP.sugOpts(), { maxTokens: 1500 });

  /* =================== Giao diện =================== */
  MK.render = () => {
    const body = $('#mockBody'); if (!body) return;
    if (M.active || M.feedback !== undefined) return renderLive();
    const o = opts(), p = MD.CP.profile(), k = MD.CP.keys();
    const vlist = voicesFor(o.lang);
    MK.warmup();
    const sel = (id, obj, cur) => `<select id="${id}">${Object.entries(obj).map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    body.innerHTML = `
      ${!k.geminiKey ? '<div class="note warn">Cần Gemini API key để nghe câu trả lời của bạn — nhập ở tab <a href="#settings" data-go="settings">Cài đặt</a>.</div>' : ''}
      ${!p.cv ? '<div class="note warn mt">Chưa có CV — AI sẽ hỏi chung chung. Nhập ở tab <a href="#profile" data-go="profile">Hồ sơ của tôi</a>.</div>' : ''}
      <div class="card ${!k.geminiKey || !p.cv ? 'mt' : ''}">
        <div class="formgrid">
          <label class="field">Người phỏng vấn${sel('mkPersona', PERSONA_LABEL, o.persona)}</label>
          <label class="field">Ngôn ngữ${sel('mkLang', { vi: 'Tiếng Việt', en: 'Tiếng Anh' }, o.lang)}</label>
          <label class="field">Số câu hỏi chính${sel('mkN', { 5: '5 câu (~10 phút)', 8: '8 câu (~15 phút)', 12: '12 câu (~25 phút)' }, o.n)}</label>
          <label class="field">Độ khó${sel('mkDiff', { easy: 'Thân thiện', real: 'Thực tế', hard: 'Khó — gây áp lực' }, o.diff)}</label>
          <label class="field">Giọng đọc<select id="mkVoice">
            <optgroup label="Giọng AI Gemini (không cần cài, dùng key Gemini)">${Object.entries(GEMINI_VOICES).map(([v, l]) => `<option value="g:${v}" ${(o.voice || 'g:Kore') === 'g:' + v ? 'selected' : ''}>${v} — ${l}</option>`).join('')}</optgroup>
            <optgroup label="Giọng có sẵn trên máy">${vlist.length ? vlist.map((v) => `<option value="${esc(v.name)}" ${v.name === o.voice ? 'selected' : ''}>${esc(v.name)}</option>`).join('') : `<option value="" disabled>(máy chưa có giọng ${o.lang === 'en' ? 'tiếng Anh' : 'tiếng Việt'})</option>`}</optgroup>
          </select></label>
          <label class="field">Tốc độ đọc <span class="muted">${o.rate}x</span><input type="range" id="mkRate" min="0.7" max="1.4" step="0.05" value="${o.rate}"><span class="muted">Chỉ áp dụng cho giọng có sẵn trên máy.</span></label>
          <label class="field">Tự chốt câu trả lời khi im lặng<select id="mkWait">${[1.5, 2, 2.5, 3, 4, 6].map((s) => `<option value="${s}" ${+o.wait === s ? 'selected' : ''}>${s} giây</option>`).join('')}</select></label>
        </div>
        <div class="row wrap mt">
          <label class="check"><input type="checkbox" id="mkHint" ${o.hint ? 'checked' : ''}><span>Hiện gợi ý Copilot trong lúc tập (luyện liếc gợi ý như buổi thật)</span></label>
          <label class="check"><input type="checkbox" id="mkShowQ" ${o.showQ ? 'checked' : ''}><span>Hiện chữ câu hỏi (bỏ chọn để luyện nghe)</span></label>
        </div>
        <ul class="steps mt muted" style="font-size:13px">
          <li>Đeo tai nghe để mic không thu lại giọng AI. Trả lời xong thì im lặng ${o.wait} giây hoặc bấm <b>Space</b>.</li>
          <li>Câu hỏi do ${MD.CP.sugProvider() === 'claude' ? 'Claude' : 'Gemini'} soạn (đổi ở Cài đặt → AI gợi ý).</li>
          <li>Giọng AI Gemini: đọc tự nhiên cả tiếng Việt lẫn tiếng Anh, mất khoảng 1–3 giây để tạo mỗi câu; tốn thêm hạn mức Gemini (gói miễn phí giới hạn số lần đọc mỗi ngày). Nếu lỗi sẽ tự chuyển sang giọng trên máy, hoặc chỉ hiện chữ.</li>
        </ul>
        <div class="row wrap mt"><button class="btn primary" id="mkStart">▶ Bắt đầu phỏng vấn thử</button><button class="btn" id="mkTestVoice">🔊 Nghe thử giọng</button></div>
      </div>`;
  };

  function renderLive() {
    const o = opts();
    $('#mockBody').innerHTML = `
      <div class="card livebar">
        <div class="meters"><span class="livechip ${M.active ? 'on' : ''}" id="mkState">${stateLabel()}</span>
          <div class="meter"><span>🎙 Tôi</span><i><b id="mkLv"></b></i></div><span class="muted" id="mkInfo"></span></div>
        <div class="row wrap">
          ${M.active ? `<button class="btn primary" id="mkDone" title="Space">✓ Trả lời xong</button><button class="btn" id="mkRepeat">🔁 Nhắc lại câu hỏi</button><button class="btn" id="mkSkip">⏭ Bỏ qua câu này</button><button class="btn danger" id="mkEnd">■ Kết thúc &amp; chấm điểm</button>`
            : '<button class="btn primary" id="mkAgain">↺ Buổi mới</button><button class="btn" data-go="history">Xem trong Lịch sử</button>'}
        </div>
      </div>
      <div class="livegrid mt">
        <div class="card col"><div class="cardhead"><h3>Hội thoại</h3><span class="muted">${PERSONA_LABEL[o.persona]} · ${o.lang === 'en' ? 'English' : 'Tiếng Việt'}</span></div>
          <div class="transcript" id="mkTranscript"></div></div>
        <div class="card col">${M.feedback !== undefined && !M.active
          ? `<div class="cardhead"><h3>Nhận xét &amp; chấm điểm</h3></div><div class="aiout" id="mkFeedback">${M.feedback ? MD.CP.md(M.feedback) : '<p class="muted">Đang chấm điểm…</p>'}</div>`
          : `<div class="cardhead"><h3>Gợi ý Copilot</h3><span class="muted" id="mkHintState"></span></div><div class="suggest aiout" id="mkHint">${o.hint ? '<p class="muted">Gợi ý sẽ hiện khi AI hỏi xong.</p>' : '<p class="muted">Đã tắt gợi ý — tự trả lời như buổi thật.</p>'}</div>`}</div>
      </div>`;
    renderTurns();
  }

  function stateLabel() {
    return { idle: '● Chưa bắt đầu', thinking: '… AI đang nghĩ câu hỏi', speaking: '🔊 AI đang hỏi', listening: '🎙 Đến lượt bạn — đang nghe', processing: '… đang chép lời bạn', ended: '● Đã kết thúc' }[M.state] || M.state;
  }
  function setState(s) {
    M.state = s;
    const el = $('#mkState'); if (el) { el.textContent = stateLabel(); el.classList.toggle('on', s === 'listening'); }
  }
  function renderTurns() {
    const box = $('#mkTranscript'); if (!box) return;
    const o = opts();
    box.innerHTML = M.turns.map((t, i) => {
      if (t.who === 'note') return `<div class="turn note">${esc(t.text)}</div>`;
      const hideQ = t.who === 'them' && !o.showQ && M.active && i === M.turns.length - 1;
      return `<div class="turn ${t.who} ${t.pending ? 'pending' : ''}"><div class="who">${t.who === 'them' ? 'Người phỏng vấn (AI)' : 'Tôi'}</div>
        <div class="txt">${hideQ ? '<i class="muted">(đang ẩn chữ — nghe và trả lời)</i>' : t.pending ? '… ' + esc(t.text || 'đang chép lời') : esc(t.text)}</div>${t.tr && !hideQ ? `<div class="tr">${esc(t.tr)}</div>` : ''}</div>`;
    }).join('') || '<p class="muted">Đang chuẩn bị…</p>';
    box.scrollTop = box.scrollHeight;
  }

  /* =================== Luồng buổi tập =================== */
  async function start() {
    const k = MD.CP.keys();
    if (!k.geminiKey) return U.toast('Cần Gemini API key (tab Cài đặt).', 'err');
    readForm();
    try { M.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { return U.toast('Không được cấp quyền micro: ' + e.message, 'err', 7000); }
    Object.assign(M, { active: true, state: 'thinking', turns: [], messages: [], parts: [], pendingStt: 0, asked: 0, ended: false, startedAt: Date.now(), feedback: undefined, id: U.uid() });
    const c = MD.CP.cset();
    M.listener = AU.listen(M.mic, {
      sensitivity: c.sensitivity, silenceMs: 700,
      onLevel: (v) => { const b = $('#mkLv'); if (b) b.style.width = (v * 100) + '%'; },
      onSpeaking: (sp) => { if (M.state !== 'listening') return; clearTimeout(M.timer); if (!sp) armFinish(); else info('đang nói…'); },
      onSegment: onAnswerSegment
    });
    window.onbeforeunload = () => (M.active ? 'Đang phỏng vấn thử' : undefined);
    renderLive();
    M.messages.push({ role: 'user', content: '(Ứng viên vừa vào phòng họp trực tuyến. Hãy chào ngắn gọn và hỏi câu đầu tiên.)' });
    interviewerTurn();
  }

  function info(t) { const el = $('#mkInfo'); if (el) el.textContent = t || ''; }

  async function interviewerTurn() {
    if (!M.active) return;
    setState('thinking'); info('');
    const o = opts();
    // giữ nhịp: đủ số câu thì nhắc AI chuyển sang phần ứng viên hỏi lại & kết thúc
    if (M.asked >= o.n) { const last = M.messages[M.messages.length - 1]; if (last && last.role === 'user' && typeof last.content === 'string') last.content += `\n\n(Đã đủ ${o.n} câu hỏi chính — mời ứng viên hỏi lại nếu chưa mời, rồi kết thúc buổi với thẻ [KẾT THÚC].)`; }
    const t = { who: 'them', text: '', pending: true }; M.turns.push(t); renderTurns();
    let text = '';
    try {
      const r = await AI.call(M.messages, Object.assign(aiOpts(), { system: interviewerSys(), onText: (x) => { t.text = x.replace(/\[KẾT THÚC\]/g, ''); if (opts().showQ) renderTurns(); } }));
      text = r.text;
    } catch (e) { t.pending = false; t.text = ''; M.turns.pop(); M.turns.push({ who: 'note', text: 'Lỗi AI: ' + e.message + ' — bấm "Nhắc lại câu hỏi" để thử lại.' }); renderTurns(); setState('listening'); return; }
    if (!M.active) return;
    const end = /\[KẾT THÚC\]/.test(text);
    const spoken = text.replace(/\[KẾT THÚC\]/g, '').replace(/[*_#>`]/g, '').trim();
    t.text = spoken; t.pending = false; renderTurns();
    M.messages.push({ role: 'assistant', content: text });
    M.asked++;
    M.lastQ = spoken;
    if (opts().hint && !end) hint(spoken);
    setState('speaking');
    await speak(spoken);
    if (!M.active) return;
    if (end) { M.ended = true; return finish(); }
    startListening();
  }

  function startListening() {
    M.parts = []; M.pendingStt = 0; M.answerStart = Date.now();
    setState('listening'); info('Mời bạn trả lời…');
  }

  function onAnswerSegment(seg) {
    // bỏ qua âm thanh bắt đầu khi AI còn đang đọc (tiếng loa lọt vào mic).
    // seg.start đã lùi 0,3 giây đệm trước tiếng nói -> cộng lại để lấy lúc thật sự bắt đầu nói.
    if (M.state !== 'listening' || seg.start + 300 < M.ttsEnd) return;
    const idx = M.parts.length; M.parts.push(null); M.pendingStt++;
    let cur = M.turns[M.turns.length - 1];
    if (!cur || cur.who !== 'me' || cur.closed) { cur = { who: 'me', text: '', pending: true }; M.turns.push(cur); }
    cur.pending = true; renderTurns();
    MD.CP.sttCall(seg, 'me', opts().lang).then((j) => {
      M.parts[idx] = j.text || '';
      cur.text = M.parts.filter(Boolean).join(' ');
    }).catch((e) => { M.parts[idx] = ''; U.toast('Chép lời lỗi: ' + e.message, 'err'); })
      .finally(() => {
        M.pendingStt--; cur.pending = M.pendingStt > 0; renderTurns();
        if (M.finishWanted && M.pendingStt === 0) finishAnswer(true);
      });
  }

  function armFinish() {
    clearTimeout(M.timer);
    const wait = Math.max(300, opts().wait * 1000 - 700); // đã chờ 0,7 giây im lặng khi cắt câu
    M.timer = setTimeout(() => { if (M.state === 'listening' && M.parts.length) finishAnswer(); }, wait);
    info(`im lặng — tự chốt sau ${opts().wait}s (Space để chốt ngay)`);
  }

  function finishAnswer(forced) {
    // chỉ chốt khi đang nghe, hoặc đang chờ chép lời xong; bỏ qua khi AI đang nghĩ/nói
    if (!['listening', 'processing'].includes(M.state)) return;
    if (M.state === 'processing' && !forced) return;
    clearTimeout(M.timer);
    if (M.pendingStt > 0) { M.finishWanted = true; setState('processing'); return; }
    M.finishWanted = false;
    const ans = M.parts.filter(Boolean).join(' ').trim();
    const cur = M.turns[M.turns.length - 1];
    if (cur && cur.who === 'me') { cur.closed = true; cur.pending = false; cur.text = ans; }
    if (!ans) { setState('listening'); info('Chưa nghe được câu trả lời — nói lại hoặc bấm “Bỏ qua câu này”.'); return; }
    if (M.hintAbort) M.hintAbort.abort();
    M.messages.push({ role: 'user', content: ans });
    renderTurns();
    interviewerTurn();
  }

  function skipQuestion() {
    clearTimeout(M.timer);
    stopSpeaking();
    const cur = M.turns[M.turns.length - 1];
    if (cur && cur.who === 'me') cur.closed = true;
    M.turns.push({ who: 'me', text: '(bỏ qua câu này)', closed: true });
    M.messages.push({ role: 'user', content: '(Ứng viên xin bỏ qua câu này, hãy hỏi câu khác.)' });
    renderTurns(); interviewerTurn();
  }

  /* ---------- Gợi ý Copilot song song ---------- */
  async function hint(question) {
    const box = $('#mkHint'); if (!box) return;
    if (M.hintAbort) M.hintAbort.abort();
    const ctrl = new AbortController(); M.hintAbort = ctrl;
    const CP = MD.CP, t0 = Date.now(), o = opts();
    box.classList.add('streaming'); box.innerHTML = '<p class="muted">Đang soạn gợi ý…</p>';
    const st = $('#mkHintState');
    const hist = M.turns.filter((x) => x.who !== 'note' && x.text).slice(-16).map((x) => ({ who: x.who, text: x.text }));
    try {
      const r = await AI.call([{ role: 'user', content: `Bản ghi cuộc trò chuyện gần đây:\n${CP.transcriptText(hist, 16)}\n\nHãy gợi ý cho lượt mới nhất của Người phỏng vấn. Câu hỏi bằng ${o.lang === 'en' ? 'tiếng Anh' : 'tiếng Việt'} → phần "Trả lời (nói theo)" viết bằng ${o.lang === 'en' ? 'tiếng Anh' : 'tiếng Việt'}.` }],
        Object.assign(CP.sugOpts(), { system: CP.SUG_SYS(), signal: ctrl.signal, onText: (x) => { if (M.hintAbort === ctrl) box.innerHTML = CP.md(x); } }));
      if (M.hintAbort === ctrl) { box.innerHTML = CP.md(r.text); if (st) st.textContent = `${((Date.now() - t0) / 1000).toFixed(1)}s · ${r.model}`; }
    } catch (e) { if (e.name !== 'AbortError') box.innerHTML = `<p style="color:var(--bad)">${esc(e.message)}</p>`; }
    box.classList.remove('streaming');
  }

  /* ---------- Kết thúc & chấm điểm ---------- */
  async function finish() {
    if (!M.active) return;
    M.active = false; window.onbeforeunload = null;
    clearTimeout(M.timer);
    stopSpeaking();
    if (M.hintAbort) M.hintAbort.abort();
    if (M.listener) M.listener.stop();
    if (M.mic) M.mic.getTracks().forEach((t) => t.stop());
    setState('ended');
    const CP = MD.CP, o = opts();
    const turns = M.turns.filter((t) => (t.who === 'me' || t.who === 'them') && t.text).map((t) => ({ who: t.who, text: t.text, tr: '', start: M.startedAt }));
    M.feedback = '';
    renderLive();
    if (!turns.some((t) => t.who === 'me')) { M.feedback = 'Buổi tập chưa có câu trả lời nào để chấm.'; renderLive(); return; }
    const box = () => $('#mkFeedback');
    try {
      const r = await AI.call([{ role: 'user', content: `Đây là bản ghi buổi PHỎNG VẤN THỬ (người phỏng vấn do AI đóng vai: ${PERSONA_LABEL[o.persona]}, ${o.lang === 'en' ? 'tiếng Anh' : 'tiếng Việt'}, độ khó ${DIFF[o.diff]}). Lưu ý câu trả lời của tôi được chép từ giọng nói nên có thể sai chính tả nhẹ — không chấm lỗi chép lời.\n\n${CP.transcriptText(turns, 400)}\n\nHãy đóng vai huấn luyện viên phỏng vấn, nhận xét THẲNG THẮN bằng tiếng Việt (Markdown):\n## Điểm tổng: x/10 — <1 câu đánh giá>\n## Từng câu hỏi\nVới mỗi câu: **Câu hỏi**, tóm tắt câu tôi trả lời, **Điểm x/10**, ✅ làm tốt, ⚠\ufe0f cần sửa (đối chiếu hồ sơ, câu trả lời đã chuẩn bị và chiến lược — vd tụt lương, nói lòng vòng, thiếu số liệu, mâu thuẫn CV), 💬 **Câu trả lời mẫu tốt hơn** (bằng ngôn ngữ của câu hỏi, đọc trong 60 giây, đúng sự thật trong hồ sơ).\n## 3 việc cần luyện trước buổi thật` }],
        Object.assign(CP.sugOpts(), { system: CP.SUG_SYS(), maxTokens: 12000, effort: 'medium', onText: (x) => { M.feedback = x; if (box()) box().innerHTML = CP.md(x); } }));
      M.feedback = r.text;
    } catch (e) { M.feedback = '⚠\ufe0f Không chấm điểm được: ' + e.message; }
    if (box()) box().innerHTML = CP.md(M.feedback);
    // lưu vào Lịch sử (cũng thành trí nhớ cho các buổi sau)
    const list = CP.sessions();
    list.unshift({ id: M.id, title: `Phỏng vấn thử — ${PERSONA_LABEL[o.persona]} (${o.lang === 'en' ? 'EN' : 'VI'})`, lang: o.lang, startedAt: M.startedAt, endedAt: Date.now(), turns, sugs: [], analysis: '', summary: M.feedback, mock: true });
    CP.saveSessions(list);
    U.toast('Đã lưu buổi tập vào Lịch sử', 'ok');
  }

  function readForm() {
    if (!$('#mkPersona')) return;
    saveOpts({ persona: $('#mkPersona').value, lang: $('#mkLang').value, n: +$('#mkN').value, diff: $('#mkDiff').value, voice: $('#mkVoice').value, rate: +$('#mkRate').value, wait: +$('#mkWait').value, hint: $('#mkHint').checked, showQ: $('#mkShowQ').checked });
  }

  /* =================== Sự kiện =================== */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('#mkStart,#mkTestVoice,#mkDone,#mkRepeat,#mkSkip,#mkEnd,#mkAgain'); if (!t) return;
    switch (t.id) {
      case 'mkStart': return start();
      case 'mkTestVoice': {
        readForm(); const o = opts();
        const was = M.active; M.active = true;
        return speak(o.lang === 'en' ? 'Hello, thanks for joining. Could you briefly introduce yourself?' : 'Chào em, cảm ơn em đã tham gia buổi phỏng vấn. Em giới thiệu ngắn gọn về bản thân nhé.').then(() => { M.active = was; });
      }
      case 'mkDone': return finishAnswer(true);
      case 'mkRepeat': {
        if (M.state === 'listening' && M.lastQ) { setState('speaking'); return speak(M.lastQ).then(() => { if (M.active) startListening(); }); }
        if (M.state === 'listening' && !M.lastQ) return interviewerTurn();
        return;
      }
      case 'mkSkip': return skipQuestion();
      case 'mkEnd': return finish();
      case 'mkAgain': M.feedback = undefined; M.turns = []; setState('idle'); return MK.render();
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'mkLang') { readForm(); if (!isGemini(opts())) saveOpts({ voice: '' }); MK.render(); }
    else if (e.target.closest && e.target.closest('#mockBody') && !M.active) readForm();
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'mkRate') { const s = e.target.parentElement.querySelector('.muted'); if (s) s.textContent = e.target.value + 'x'; } });
  document.addEventListener('keydown', (e) => {
    if (!M.active || e.code !== 'Space' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    e.preventDefault(); finishAnswer(true);
  });
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { if ($('#tab-mock.active') && !M.active && M.feedback === undefined) MK.render(); };

  MD.Mock = MK;
})(window.MD);
