/* Interview Copilot — điều khiển giao diện và luồng xử lý thời gian thực */
(function (MD) {
  'use strict';
  const U = MD.U, AI = MD.AI, D = MD.Drive, P = MD.Parsers, AU = MD.Audio;
  const { $, $$, esc } = U;
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  if (window.marked) marked.use({ renderer: { html(t) { return esc(typeof t === 'string' ? t : (t && (t.text || t.raw)) || ''); } } });
  const md = (t) => (window.marked ? marked.parse(t || '') : esc(t || '').replace(/\n/g, '<br>'));

  /* =================== Lưu trữ =================== */
  const PKEY = 'copilot_profile', SKEY = 'copilot_sessions', CKEY = 'copilot_settings';
  const profile = () => Object.assign({ name: '', role: '', company: '', jd: '', cv: '', cvFile: '', experience: '', terms: '', style: 'Ngắn gọn, tự tin, tự nhiên như đang nói; kể kinh nghiệm theo STAR (Tình huống – Nhiệm vụ – Hành động – Kết quả) với số liệu cụ thể.', qa: [] }, U.store.get(PKEY, {}));
  const saveProfile = (p) => { if (!U.store.set(PKEY, p)) U.toast('Không lưu được hồ sơ (bộ nhớ trình duyệt đầy?)', 'err'); };
  const sessions = () => U.store.get(SKEY, []);
  const saveSessions = (a) => {
    // giữ tối đa 30 buổi gần nhất; nếu đầy bộ nhớ thì bỏ bớt biên bản chi tiết các buổi cũ
    let list = a.slice(0, 30);
    while (!U.store.set(SKEY, list) && list.length) { const old = list.find((s) => s.turns && s.turns.length); if (old) old.turns = []; else list = list.slice(0, -1); }
  };
  const cset = () => Object.assign({ sugProvider: '', sugClaudeModel: 'claude-opus-5-5', sugGeminiModel: '', sttModel: '', sensitivity: 3, silenceMs: 700, memory: true, fastSuggest: true, autoDrive: false }, U.store.get(CKEY, {}));
  const saveCset = (p) => U.store.set(CKEY, Object.assign(cset(), p));
  const keys = () => AI.settings();
  const sugProvider = () => { const c = cset(), k = keys(); return c.sugProvider || (k.claudeKey && !k.geminiKey ? 'claude' : 'gemini'); };

  /* =================== Điều hướng =================== */
  let tab = 'live';
  function showTab(name) {
    tab = name;
    $$('.sidenav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
    $('#sidenav').classList.remove('open');
    ({ live: renderStart, profile: renderProfile, prep: renderPrep, history: renderHistory, settings: renderSettings, mock: () => MD.Mock && MD.Mock.render() }[name] || (() => {}))();
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* bỏ qua */ }
  }

  /* =================== Prompt =================== */
  const WHO = { me: 'Tôi', them: 'Người phỏng vấn', note: 'Ghi chú' };
  function profileBlock() {
    const p = profile();
    const qa = p.qa.filter((x) => x.q && x.a).map((x) => `- Hỏi: ${x.q}\n  Đáp: ${x.a}`).join('\n');
    return `# HỒ SƠ ỨNG VIÊN ("Tôi")
Tên: ${p.name || '(chưa nhập)'} · Vị trí ứng tuyển: ${p.role || '(chưa nhập)'} · Công ty: ${p.company || '(chưa nhập)'}

## CV
${(p.cv || '(chưa có CV)').slice(0, 30000)}

## Kinh nghiệm, thành tích, câu chuyện bổ sung
${p.experience || '(trống)'}

## Câu trả lời đã chuẩn bị sẵn
${qa || '(trống)'}

## Mô tả công việc (JD)
${(p.jd || '(trống)').slice(0, 15000)}

## Phong cách trả lời mong muốn
${p.style}`;
  }
  function memoryBlock() {
    if (!cset().memory) return '';
    const list = sessions().filter((s) => s.summary).slice(0, 5);
    if (!list.length) return '';
    return '\n\n# CÁC BUỔI TRƯỚC (tóm tắt)\n' + list.map((s) => `## ${s.title} — ${new Date(s.startedAt).toLocaleDateString('vi-VN')}\n${s.summary.slice(0, 1800)}`).join('\n\n');
  }
  const SUG_SYS = () => `Bạn là trợ lý phỏng vấn thời gian thực, ngồi cạnh ứng viên ("Tôi") trong buổi phỏng vấn/cuộc gọi. Người còn lại là "Người phỏng vấn".
Nhiệm vụ: khi người phỏng vấn vừa hỏi, đưa ra gợi ý để Tôi trả lời NGAY — đọc lướt trong 10 giây.
Quy tắc:
- Chỉ dùng sự thật có trong HỒ SƠ và các buổi trước. KHÔNG bịa kinh nghiệm, số liệu, tên dự án. Nếu hồ sơ không có thông tin, gợi ý cách trả lời trung thực hoặc để chỗ trống [điền …].
- NGÔN NGỮ: phần "Trả lời (nói theo)" dùng ĐÚNG ngôn ngữ của câu hỏi mới nhất — hỏi tiếng Anh thì trả lời tiếng Anh, hỏi tiếng Việt thì trả lời tiếng Việt (quy tắc này ưu tiên hơn phong cách trong hồ sơ). Phần "Ý chính" luôn bằng tiếng Việt. Câu ngắn, tự nhiên như văn nói, ưu tiên STAR khi kể kinh nghiệm.
- Câu hỏi cá nhân / ngoài lề (lương, lý do nghỉ việc, điểm yếu, sở thích, gia đình, thời gian đi làm…): dùng đúng mục "THÔNG TIN NGOÀI LỀ" và kinh nghiệm bổ sung; giữ nhất quán với những gì Tôi đã nói trước đó trong buổi và các buổi trước.
- Nếu lượt mới nhất không phải câu hỏi (chào hỏi, giới thiệu, nói chuyện phiếm), gợi ý 1–2 câu đáp lại phù hợp.
- Nếu có ảnh màn hình (đề bài, code, slide), đọc và dùng nó.
Định dạng bắt buộc (Markdown, không thêm lời dẫn):
**❓ Câu hỏi:** <câu hỏi viết lại gọn> — <dịch tiếng Việt>
**💬 Trả lời (nói theo):**
- <3–5 gạch đầu dòng>
**🇻🇳 Ý chính:** <1–2 câu tiếng Việt>
**📌 Dẫn chứng từ hồ sơ:** <dự án/kinh nghiệm/số liệu cụ thể lấy từ hồ sơ>
**↪\ufe0f Nếu bị hỏi tiếp:** <1–2 gợi ý ngắn>

${profileBlock()}${memoryBlock()}`;

  const transcriptText = (turns, limit) => turns.filter((t) => t.text).slice(-limit)
    .map((t) => `[${WHO[t.who]}] ${t.text}`).join('\n');

  /* =================== Phiên trực tiếp =================== */
  const L = { active: false, turns: [], seq: 0, older: [], analysis: '', running: 0, queue: [], timer: null, sugTimer: null, sugAbort: null, lastShot: null };

  const SHARE_STEP = {
    tab: '<b>Chia sẻ tab</b> → chọn tab cuộc gọi (<b>Google Meet</b> / <b>Teams web</b>) và bật <b>“Chia sẻ cả âm thanh của thẻ”</b> → giọng <b>Người phỏng vấn</b> + hình ảnh để đọc màn hình.',
    screen: '<b>Chia sẻ toàn màn hình</b> → chọn màn hình đang có Teams/Zoom và tick <b>“Chia sẻ âm thanh hệ thống”</b> (chỉ có trên Windows). Nên đặt Copilot ở màn hình khác để không tự đọc chính nó.',
    none: '<b>Không chia sẻ</b> → chỉ nghe mic; mọi lời nói (kể cả người kia nếu loa phát ra) đều ghi là <b>Tôi</b>. Dùng ô “Gõ câu hỏi” để nhờ gợi ý.'
  };
  function renderStart() {
    $('#stepShare').innerHTML = SHARE_STEP[$('#sessSource').value];
    const k = keys();
    $('#keyState').innerHTML = k.geminiKey ? '<b style="color:var(--ok)">✓ đã có</b>' : '<b style="color:var(--bad)">chưa có — vào tab Cài đặt</b>';
    if (!$('#sessTitle').value) { const p = profile(); $('#sessTitle').value = [p.role, p.company].filter(Boolean).join(' — ') || ''; }
  }

  async function startSession() {
    const k = keys();
    if (!k.geminiKey) { U.toast('Cần Gemini API key để chép lời — nhập ở tab Cài đặt.', 'err', 6000); return showTab('settings'); }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return U.toast('Trình duyệt không hỗ trợ thu âm. Hãy dùng Chrome hoặc Edge trên máy tính.', 'err', 7000);
    const c = cset();
    try {
      L.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) { return U.toast('Không được cấp quyền micro: ' + e.message, 'err', 7000); }
    L.tab = null;
    const src = $('#sessSource').value;
    if (src !== 'none') {
      if (!navigator.mediaDevices.getDisplayMedia) { U.toast('Trình duyệt không hỗ trợ chia sẻ màn hình — chỉ dùng mic.', 'err'); }
      else {
        try {
          // displaySurface chỉ là gợi ý cho hộp thoại chọn của Chrome: tab hoặc toàn màn hình
          L.tab = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 2, displaySurface: src === 'screen' ? 'monitor' : 'browser' }, audio: true,
            preferCurrentTab: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include', monitorTypeSurfaces: 'include'
          });
        } catch (e) { U.toast('Bạn chưa chia sẻ — tiếp tục chỉ với mic.', 'info', 6000); }
      }
    }
    L.active = true; L.turns = []; L.older = []; L.analysis = ''; L.queue = []; L.running = 0; L.lastShot = null;
    L.title = $('#sessTitle').value.trim() || 'Buổi ' + new Date().toLocaleString('vi-VN');
    L.lang = $('#sessLang').value; L.startedAt = Date.now(); L.id = U.uid();
    const common = { sensitivity: c.sensitivity, silenceMs: c.silenceMs };
    L.meL = AU.listen(L.mic, Object.assign({}, common, {
      onSegment: (s) => onSegment('me', s), onLevel: (v) => { $('#lvMe').style.width = (v * 100) + '%'; },
      onSpeaking: (b) => { $('#spMe').textContent = b ? 'đang nói…' : ''; }
    }));
    L.themL = null;
    if (L.tab) {
      const at = L.tab.getAudioTracks();
      if (at.length) {
        L.themL = AU.listen(new MediaStream(at), Object.assign({}, common, {
          onSegment: (s) => onSegment('them', s), onLevel: (v) => { $('#lvThem').style.width = (v * 100) + '%'; },
          onSpeaking: (b) => { $('#spThem').textContent = b ? 'đang nói…' : ''; if (b) clearTimeout(L.sugTimer); }
        }));
      } else addNote(src === 'screen' ? '⚠ Không lấy được âm thanh hệ thống — bấm Kết thúc, bắt đầu lại và tick “Chia sẻ âm thanh hệ thống” (chỉ có trên Windows; trên Mac hãy dùng Teams/Meet bản web).' : '⚠ Tab được chia sẻ không có âm thanh — bấm Kết thúc, bắt đầu lại và bật “Chia sẻ cả âm thanh của thẻ”.');
      const vt = L.tab.getVideoTracks()[0];
      if (vt) {
        const v = $('#screenVideo'); v.srcObject = new MediaStream([vt]); v.play().catch(() => {});
        vt.addEventListener('ended', () => addNote('Đã dừng chia sẻ tab — chỉ còn nghe mic.'));
      }
    }
    if (!L.themL) $('#lvThem').parentElement.parentElement.style.opacity = 0.4;
    $('#startCard').hidden = true; $('#liveWrap').hidden = false;
    $('#liveChip').textContent = '● Đang nghe'; $('#liveChip').classList.add('on');
    $('#transcript').innerHTML = ''; $('#suggest').innerHTML = '<p class="muted">Khi người phỏng vấn hỏi xong, gợi ý sẽ hiện ở đây.</p>'; $('#older').innerHTML = ''; $('#analysis').innerHTML = '';
    addNote(`Bắt đầu “${L.title}” · nguồn: mic${L.themL ? (src === 'screen' ? ' + âm thanh hệ thống' : ' + tab cuộc gọi') : ''} · gợi ý bằng ${sugProvider() === 'claude' ? 'Claude' : 'Gemini'}`);
    clearInterval(L.timer);
    L.timer = setInterval(() => { const s = Math.floor((Date.now() - L.startedAt) / 1000); $('#liveTimer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
    window.onbeforeunload = () => (L.active ? 'Phiên đang chạy' : undefined);
  }

  function addNote(text) { L.turns.push({ id: ++L.seq, who: 'note', text, start: Date.now() }); renderTranscript(); }

  function onSegment(who, seg) {
    const t = { id: ++L.seq, who, start: seg.start, end: seg.end, text: '', tr: '', pending: true };
    L.turns.push(t); L.turns.sort((a, b) => a.start - b.start);
    renderTranscript();
    // Gợi ý siêu tốc: người phỏng vấn vừa nói xong -> gửi thẳng âm thanh cho Gemini soạn gợi ý,
    // chạy SONG SONG với bước chép lời thay vì chờ chép lời xong mới gợi ý.
    if (who === 'them' && L.active && $('#autoSuggest').checked && cset().fastSuggest && sugProvider() === 'gemini' && seg.reason !== 'max' && seg.voiceMs >= 900) {
      t.sugFast = true;
      clearTimeout(L.sugTimer);
      suggest({ audio: seg, turn: t });
    }
    L.queue.push({ t, seg, tries: 0 }); pump();
  }

  function pump() {
    while (L.running < 3 && L.queue.length) {
      const job = L.queue.shift(); L.running++;
      transcribe(job).finally(() => { L.running--; pump(); });
    }
  }

  const STT_SCHEMA = { type: 'OBJECT', properties: { text: { type: 'STRING' }, lang: { type: 'STRING' }, translation: { type: 'STRING' } }, required: ['text', 'translation'] };
  // Chép lời + dịch 1 đoạn âm thanh. lang: 'auto' | 'en' | 'vi'. Trả về {text, lang, translation}
  async function sttCall(seg, who, lang) {
    const p = profile();
    const langHint = lang === 'en' ? 'tiếng Anh' : lang === 'vi' ? 'tiếng Việt' : 'tự nhận diện';
    const prompt = `Chép lại NGUYÊN VĂN lời nói trong đoạn âm thanh (giữ ngôn ngữ gốc, có dấu câu, không thêm lời bình). Người nói: ${WHO[who]}. Ngôn ngữ chính của buổi: ${langHint}.
Tên riêng/thuật ngữ có thể xuất hiện: ${[p.company, p.role, p.name, p.terms].filter(Boolean).join(', ') || '(không có)'}.
Sau đó dịch sang ${lang === 'vi' ? 'tiếng Anh' : 'tiếng Việt'} (nếu lời nói đã là ngôn ngữ đích thì dịch sang ${lang === 'vi' ? 'tiếng Việt' : 'tiếng Anh'}).
Nếu không có lời nói rõ ràng (chỉ tiếng ồn, gõ phím, tiếng thở) thì để text rỗng. Trả về JSON {text, lang, translation}.`;
    const r = await AI.call([{ role: 'user', content: [{ type: 'audio', mime: seg.mime, data: seg.b64 }, { type: 'text', text: prompt }] }],
      { provider: 'gemini', model: cset().sttModel || undefined, purpose: 'fast', think: 'off', system: 'Bạn là hệ thống chép lời và phiên dịch chính xác.', json: true, schema: STT_SCHEMA, maxTokens: 4096 });
    let j; try { j = JSON.parse(r.text); } catch (e) { j = { text: r.text.trim(), translation: '' }; }
    return { text: (j.text || '').trim(), translation: (j.translation || '').trim(), lang: j.lang };
  }

  async function transcribe(job) {
    const { t, seg } = job;
    try {
      const j = await sttCall(seg, t.who, L.lang);
      t.text = (j.text || '').trim(); t.tr = (j.translation || '').trim(); t.lang = j.lang; t.pending = false;
      t.lat = (Date.now() - seg.end) / 1000; // độ trễ chép lời tính từ lúc hết câu
      if (!t.text) L.turns = L.turns.filter((x) => x !== t);
      renderTranscript();
      if (t.text && t.who === 'them' && !t.sugFast && $('#autoSuggest').checked && L.active) {
        const isQ = /\?|\b(what|why|how|when|where|who|which|tell me|can you|could you|would you|do you|did you|have you|describe|walk me|explain)\b|\b(gì|sao|thế nào|như thế nào|bao giờ|ở đâu|ai|nào|không\?|hãy|kể|giới thiệu)\b/i.test(t.text);
        if (isQ || t.text.length > 40) { clearTimeout(L.sugTimer); L.sugTimer = setTimeout(() => suggest(), 700); }
      }
    } catch (e) {
      if (/429|hạn mức/.test(e.message) && job.tries < 3) { job.tries++; $('#sugState').textContent = 'Gemini đang giới hạn tốc độ, thử lại…'; await new Promise((r) => setTimeout(r, 4000 * job.tries)); return transcribe(job); }
      t.pending = false; t.text = ''; t.err = e.message;
      renderTranscript();
      U.toast('Chép lời lỗi: ' + e.message, 'err', 6000);
    }
  }

  function renderTranscript() {
    const box = $('#transcript'); if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.classList.toggle('hide-trans', !$('#showTrans').checked);
    box.innerHTML = L.turns.map((t) => {
      if (t.who === 'note') return `<div class="turn note">${esc(t.text)}</div>`;
      const time = new Date(t.start).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `<div class="turn ${t.who} ${t.pending ? 'pending' : ''}"><div class="who">${WHO[t.who]}<time>${time}</time>${t.lat ? `<time title="Độ trễ chép lời tính từ lúc hết câu">· chép lời ${t.lat.toFixed(1)}s</time>` : ''}${t.lang ? `<time>· ${esc(String(t.lang).slice(0, 5))}</time>` : ''}</div>
        <div class="txt">${t.pending ? '… đang chép lời' : t.err ? `<span style="color:var(--bad)">Lỗi: ${esc(t.err)}</span>` : esc(t.text)}</div>${t.tr ? `<div class="tr">${esc(t.tr)}</div>` : ''}</div>`;
    }).join('') || '<p class="muted">Đang nghe…</p>';
    if (atBottom) box.scrollTop = box.scrollHeight;
  }

  /* ---------- Gợi ý ---------- */
  function sugOpts() {
    const prov = sugProvider(), c = cset();
    return { provider: prov, model: prov === 'claude' ? c.sugClaudeModel : (c.sugGeminiModel || undefined), purpose: 'smart', think: 'low', effort: 'low', maxTokens: 6000, cacheSystem: true };
  }

  const langName = (l) => { const k = String(l || '').toLowerCase(); return /^en|english|anh/.test(k) ? 'tiếng Anh' : /^vi|viet/.test(k) ? 'tiếng Việt' : ''; };

  /* arg: chuỗi (câu hỏi gõ tay) | { audio: seg, turn } (gợi ý siêu tốc từ âm thanh) | không có (gợi ý cho lượt mới nhất) */
  async function suggest(arg) {
    const manual = typeof arg === 'string' ? arg : '';
    const fast = arg && typeof arg === 'object' && arg.audio ? arg : null;
    clearTimeout(L.sugTimer);
    if (L.sugAbort) L.sugAbort.abort();
    const ctrl = new AbortController(); L.sugAbort = ctrl;
    const box = $('#suggest');
    const prevText = box.dataset.text || '', prevHtml = box.innerHTML;
    const content = [];
    // bản ghi: ở chế độ siêu tốc, lượt đang nói chưa chép xong nên không đưa vào (âm thanh của nó đi kèm riêng)
    const turns = fast ? L.turns.filter((x) => x !== fast.turn) : L.turns;
    let req = `Bản ghi cuộc trò chuyện gần đây:\n${transcriptText(turns, 24) || '(chưa có)'}\n\n`;
    if (fast) {
      content.push({ type: 'audio', mime: fast.audio.mime, data: fast.audio.b64 });
      req += `Đoạn âm thanh kèm theo là lượt nói MỚI NHẤT của Người phỏng vấn (chưa có trong bản ghi). Hãy nghe kỹ.
- Nếu đó là câu hỏi hoặc yêu cầu cần Tôi trả lời: gợi ý theo đúng định dạng, trả lời bằng đúng ngôn ngữ người phỏng vấn dùng trong đoạn âm thanh.
- Nếu chỉ là câu xã giao/đệm ngắn không cần trả lời (vd "alo", "ok", "ừ", "để chị xem", tiếng ồn): chỉ trả về đúng một chữ SKIP.`;
    } else {
      const last = L.turns.filter((x) => x.who === 'them' && x.text).pop();
      const ln = langName(last && last.lang);
      req += manual ? `Câu hỏi cần trả lời (người dùng gõ tay): ${manual}` : 'Hãy gợi ý cho lượt mới nhất của Người phỏng vấn.';
      if (ln && !manual) req += `\nCâu hỏi mới nhất bằng ${ln} → phần "Trả lời (nói theo)" viết bằng ${ln}.`;
    }
    if ($('#withScreen').checked && L.tab) {
      try { const f = await AU.grabFrame($('#screenVideo')); L.lastShot = f; showShot(f); content.push({ type: 'image', mime: f.mime, data: f.b64 }); req += '\n(Kèm ảnh màn hình cuộc gọi hiện tại.)'; } catch (e) { /* không có hình */ }
    }
    content.push({ type: 'text', text: req });
    box.classList.add('streaming');
    // mốc tính độ trễ: lúc người hỏi nói xong (nếu biết), không thì lúc bấm
    const t0 = Date.now(), tEnd = fast ? fast.audio.end : ((L.turns.filter((x) => x.who === 'them').pop() || {}).end || t0);
    let first = 0, timedOut = false, shown = false;
    const since = () => ((Date.now() - tEnd) / 1000).toFixed(1);
    const show = (txt) => {
      // chưa hiện gì cho tới khi chắc chắn không phải SKIP -> gợi ý cũ không bị xoá oan
      if (!shown) {
        if (/^\s*S(K(I(P)?)?)?\s*$/i.test(txt)) return;
        shown = true;
        if (prevText) { L.older.unshift({ at: Date.now(), text: prevText }); $('#older').innerHTML = L.older.slice(0, 20).map((o) => `<div class="oldsug aiout">${md(o.text)}</div>`).join(''); }
      }
      box.innerHTML = md(txt); box.dataset.text = txt;
    };
    if (!fast) show(''); // gọi tay / sau chép lời: xoá ngay để thấy đang soạn
    if (!fast) box.innerHTML = '<p class="muted">Đang soạn gợi ý…</p>';
    const tick = setInterval(() => { if (!first) $('#sugState').textContent = `${fast ? '⚡ nghe & soạn' : 'đang soạn'}… ${since()}s từ lúc hết câu`; }, 300);
    const killer = setTimeout(() => { timedOut = true; ctrl.abort(); }, SUG_TIMEOUT * 1000);
    try {
      const r = await AI.call([{ role: 'user', content }], Object.assign(sugOpts(), {
        system: SUG_SYS(), signal: ctrl.signal,
        onText: (txt) => {
          if (L.sugAbort !== ctrl) return;
          if (!first && !/^\s*S(K(I(P)?)?)?\s*$/i.test(txt)) { first = Date.now(); $('#sugState').textContent = `chữ đầu ${since()}s sau khi hết câu…`; }
          show(txt);
        }
      }));
      if (L.sugAbort !== ctrl) return;
      if (/^\s*SKIP\s*$/i.test(r.text)) {
        // câu xã giao: giữ nguyên gợi ý cũ
        box.innerHTML = prevHtml; box.dataset.text = prevText;
        $('#sugState').textContent = `bỏ qua câu xã giao (${since()}s)`;
        return;
      }
      show(r.text);
      L.sugs = (L.sugs || []).concat([{ at: Date.now(), q: manual || (fast ? '(âm thanh) ' + (fast.turn.text || '') : lastThem()), text: r.text }]);
      $('#sugState').textContent = `${fast ? '⚡ ' : ''}${first ? 'chữ đầu ' + ((first - tEnd) / 1000).toFixed(1) + 's · ' : ''}xong ${since()}s sau khi hết câu · ${r.model}`;
    } catch (e) {
      if (e.name === 'AbortError' && !timedOut) return;
      const msg = timedOut ? `Quá ${SUG_TIMEOUT} giây chưa có gợi ý — mô hình đang chậm hoặc bị giới hạn. Bấm “Gợi ý ngay” để thử lại, hoặc đổi sang bản Flash/Flash-Lite (hoặc Claude Haiku/Sonnet) trong Cài đặt.` : e.message;
      if (fast && !shown) { box.innerHTML = prevHtml; box.dataset.text = prevText; $('#sugState').textContent = 'gợi ý siêu tốc lỗi: ' + msg.slice(0, 80); }
      else { box.innerHTML = `<p style="color:var(--bad)">${esc(msg)}</p>`; $('#sugState').textContent = ''; }
      // siêu tốc lỗi -> để luồng thường (sau chép lời) gợi ý thay
      if (fast) fast.turn.sugFast = false;
    } finally { clearInterval(tick); clearTimeout(killer); if (L.sugAbort === ctrl) box.classList.remove('streaming'); }
  }
  const SUG_TIMEOUT = 30;
  const lastThem = () => { const t = L.turns.filter((x) => x.who === 'them' && x.text).pop(); return t ? t.text : ''; };

  function showShot(f) { $('#shotWrap').hidden = false; $('#shotImg').src = f.url; }

  async function readScreen() {
    if (!L.tab) return U.toast('Chưa chia sẻ tab nên không đọc được màn hình.', 'err');
    let f; try { f = await AU.grabFrame($('#screenVideo')); } catch (e) { return U.toast(e.message, 'err'); }
    L.lastShot = f; showShot(f);
    if (L.sugAbort) L.sugAbort.abort();
    const ctrl = new AbortController(); L.sugAbort = ctrl;
    const box = $('#suggest'); box.classList.add('streaming'); box.innerHTML = '<p class="muted">Đang đọc màn hình…</p>';
    try {
      const r = await AI.call([{ role: 'user', content: [{ type: 'image', mime: f.mime, data: f.b64 }, { type: 'text', text: `Đây là ảnh màn hình cuộc gọi. Nếu có câu hỏi/đề bài (code, SQL, case study, slide, biểu đồ…): tóm tắt đề, đưa cách làm và đáp án/gợi ý trả lời dựa trên hồ sơ của tôi theo định dạng quy định. Nếu chỉ là màn hình bình thường, mô tả ngắn những gì quan trọng.\n\nBản ghi gần đây:\n${transcriptText(L.turns, 12)}` }] }],
        Object.assign(sugOpts(), { system: SUG_SYS(), signal: ctrl.signal, maxTokens: 6000, onText: (t) => { if (L.sugAbort === ctrl) box.innerHTML = md(t); } }));
      box.innerHTML = md(r.text); box.dataset.text = r.text;
    } catch (e) { if (e.name !== 'AbortError') box.innerHTML = `<p style="color:var(--bad)">${esc(e.message)}</p>`; }
    box.classList.remove('streaming');
  }

  async function analyze() {
    const box = $('#analysis');
    box.innerHTML = '<p class="muted">Đang phân tích cuộc trò chuyện…</p>';
    try {
      const r = await AI.call([{ role: 'user', content: `Toàn bộ bản ghi đến hiện tại:\n${transcriptText(L.turns, 400)}\n\nPhân tích bằng tiếng Việt (Markdown, ngắn gọn):\n## 🎯 Mục tiêu cuộc trò chuyện\n## 🧭 Đang ở giai đoạn nào\n## 🔍 Người phỏng vấn quan tâm điều gì (tiêu chí ngầm)\n## ✅ Tôi đã trả lời tốt / ⚠\ufe0f cần cải thiện\n## ❓ Câu hỏi có thể tới tiếp & ý trả lời\n## 💡 Câu hỏi nên hỏi ngược lại người phỏng vấn` }],
        Object.assign(sugOpts(), { system: SUG_SYS(), maxTokens: 8000, effort: 'medium', onText: (t) => { box.innerHTML = md(t); } }));
      L.analysis = r.text; box.innerHTML = md(r.text);
    } catch (e) { box.innerHTML = `<p style="color:var(--bad)">${esc(e.message)}</p>`; }
  }

  async function stopSession() {
    if (!L.active) return;
    L.active = false; window.onbeforeunload = null;
    clearInterval(L.timer); clearTimeout(L.sugTimer);
    [L.meL, L.themL].forEach((x) => x && x.flush());
    [L.meL, L.themL].forEach((x) => x && x.stop());
    [L.mic, L.tab].forEach((s) => s && s.getTracks().forEach((t) => t.stop()));
    $('#liveChip').textContent = '● Đã kết thúc'; $('#liveChip').classList.remove('on');
    // chờ các đoạn đang chép lời xong (tối đa 15 giây)
    U.loading(true, 'Đang hoàn tất chép lời…');
    const t0 = Date.now(); while ((L.running || L.queue.length) && Date.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 300));
    const sess = {
      id: L.id, title: L.title, lang: L.lang, startedAt: L.startedAt, endedAt: Date.now(),
      turns: L.turns.filter((t) => t.text && t.who !== 'note').map((t) => ({ who: t.who, text: t.text, tr: t.tr, start: t.start })),
      sugs: (L.sugs || []).slice(-40), analysis: L.analysis
    };
    L.sugs = [];
    if (sess.turns.length) {
      U.loading(true, 'AI đang tóm tắt buổi…');
      try {
        const r = await AI.call([{ role: 'user', content: `Bản ghi buổi "${sess.title}":\n${transcriptText(sess.turns, 600)}\n\nViết tóm tắt tiếng Việt (Markdown) để lưu làm trí nhớ cho các buổi sau:\n- Mục tiêu & bối cảnh buổi\n- Các câu hỏi chính và ý tôi đã trả lời\n- Thông tin mới về công ty / vị trí / người phỏng vấn\n- Điểm mạnh, điểm cần cải thiện\n- Việc cần chuẩn bị tiếp / cam kết đã hứa` }],
          Object.assign(sugOpts(), { system: SUG_SYS(), maxTokens: 6000, effort: 'medium' }));
        sess.summary = r.text;
      } catch (e) { sess.summary = ''; U.toast('Không tóm tắt được: ' + e.message, 'err'); }
    }
    const list = sessions(); list.unshift(sess); saveSessions(list);
    U.loading(false);
    if (cset().autoDrive && D.hasToken()) driveSaveSession(sess).catch((e) => U.toast(e.message, 'err'));
    $('#liveWrap').hidden = true; $('#startCard').hidden = false; $('#liveTimer').textContent = '';
    U.toast(sess.turns.length ? 'Đã lưu buổi vào Lịch sử' : 'Buổi không có lời nói nào được ghi', sess.turns.length ? 'ok' : 'info');
    if (sess.turns.length) showTab('history');
  }

  /* =================== Hồ sơ =================== */
  function renderProfile() {
    const p = profile();
    $('#profileBody').innerHTML = `
      <div class="card"><div class="formgrid">
        <label class="field">Tên của tôi<input type="text" id="pName" value="${esc(p.name)}" placeholder="vd: Nguyen Van A (Cris)"></label>
        <label class="field">Vị trí ứng tuyển<input type="text" id="pRole" value="${esc(p.role)}" placeholder="vd: Senior Data Analyst"></label>
        <label class="field">Công ty<input type="text" id="pCompany" value="${esc(p.company)}"></label>
      </div></div>
      <div class="grid2 mt">
        <div class="card"><div class="cardhead"><h3>CV</h3><label class="btn sm">Tải CV (.pdf, .docx, .txt, .md)<input type="file" id="pCvFile" accept=".pdf,.docx,.txt,.md" hidden></label></div>
          <p class="muted" style="margin-top:0">${p.cvFile ? 'Đã nạp: ' + esc(p.cvFile) + ' · ' : ''}${U.fmtNum((p.cv || '').length)} ký tự — sửa trực tiếp nếu trích xuất bị lỗi.</p>
          <textarea id="pCv" rows="16" placeholder="Dán nội dung CV hoặc tải file…">${esc(p.cv)}</textarea></div>
        <div class="card"><h3>Mô tả công việc (JD)</h3><p class="muted" style="margin-top:4px">Dán JD để AI biết nhà tuyển dụng cần gì.</p>
          <textarea id="pJd" rows="16" placeholder="Dán JD…">${esc(p.jd)}</textarea></div>
      </div>
      <div class="grid2 mt">
        <div class="card"><div class="cardhead"><h3>Kinh nghiệm, thành tích, câu chuyện</h3><button class="btn sm" id="pTpl">+ Chèn mẫu câu hỏi ngoài lề</button></div><p class="muted" style="margin-top:0">Những gì CV chưa nói: số liệu, dự án, tình huống khó, và thông tin cá nhân cho các câu hỏi ngoài lề.</p>
          <textarea id="pExp" rows="10">${esc(p.experience)}</textarea></div>
        <div class="card"><h3>Phong cách & thuật ngữ</h3>
          <label class="field mt">Phong cách trả lời<textarea id="pStyle" rows="4">${esc(p.style)}</textarea></label>
          <label class="field mt">Tên riêng, thuật ngữ hay dùng (giúp chép lời chính xác)<textarea id="pTerms" rows="4" placeholder="vd: Power BI, dbt, Snowflake, SAP MM, OKR…">${esc(p.terms)}</textarea></label></div>
      </div>
      <div class="card mt"><div class="cardhead"><h3>Câu trả lời chuẩn bị sẵn (${p.qa.length})</h3><button class="btn sm" id="pQaAdd">+ Thêm</button></div>
        <div id="pQa">${p.qa.map((x, i) => qaRow(x, i)).join('') || '<p class="muted">Chưa có. Thêm tay hoặc tạo ở tab Chuẩn bị.</p>'}</div></div>
      <div class="row wrap mt"><button class="btn primary" id="pSave">Lưu hồ sơ</button><button class="btn" id="pExport"><svg class="ic"><use href="#i-down"/></svg> Xuất hồ sơ (.json)</button><label class="btn">Nhập hồ sơ<input type="file" id="pImport" accept=".json" hidden></label></div>`;
  }
  const OFFTOPIC_TPL = `## THÔNG TIN NGOÀI LỀ (dùng cho câu hỏi cá nhân)
- Giới thiệu ngắn về bản thân (30 giây):
- Quê quán / nơi sống hiện tại, sẵn sàng đi lại/chuyển nơi làm:
- Lý do nghỉ / muốn rời công ty hiện tại:
- Vì sao chọn công ty & vị trí này:
- Điểm mạnh (kèm ví dụ):
- Điểm yếu & cách đang cải thiện:
- Mục tiêu nghề nghiệp 3–5 năm:
- Mức lương hiện tại / mong muốn, có thể thương lượng không:
- Thời gian có thể bắt đầu / thời gian báo nghỉ:
- Sở thích, hoạt động ngoài giờ:
- Phong cách làm việc, làm việc nhóm vs độc lập:
- Một thất bại / sai lầm và bài học:
- Một lần bất đồng với sếp/đồng nghiệp và cách xử lý:
- Áp lực, deadline gấp — cách xử lý:
- Gia đình / hoàn cảnh (chỉ ghi điều muốn chia sẻ):
- Câu hỏi muốn hỏi lại nhà tuyển dụng:`;
  const qaRow = (x, i) => `<div class="qa" data-qa="${i}"><div class="row"><input type="text" class="qaq" value="${esc(x.q)}" placeholder="Câu hỏi" style="flex:1"><button class="btn sm ghost danger" data-qadel="${i}">Xoá</button></div><textarea class="qaa mt" rows="3" placeholder="Câu trả lời">${esc(x.a)}</textarea></div>`;
  function readProfileForm() {
    const p = profile();
    Object.assign(p, { name: $('#pName').value.trim(), role: $('#pRole').value.trim(), company: $('#pCompany').value.trim(), cv: $('#pCv').value, jd: $('#pJd').value, experience: $('#pExp').value, style: $('#pStyle').value, terms: $('#pTerms').value,
      qa: $$('#pQa .qa').map((el) => ({ q: $('.qaq', el).value.trim(), a: $('.qaa', el).value.trim() })).filter((x) => x.q || x.a) });
    return p;
  }
  async function loadCv(file) {
    U.loading(true, 'Đang đọc CV…');
    try {
      let text;
      if (/\.(txt|md)$/i.test(file.name)) text = await file.text();
      else {
        const dss = await P.readFile(file);
        text = dss.map((d) => d.kind === 'text' ? d.lines.join('\n') : [d.headers.join(' | ')].concat(d.rows.map((r) => r.map(U.display).join(' | '))).join('\n')).join('\n\n');
      }
      const p = readProfileForm(); p.cv = text.replace(/\n{3,}/g, '\n\n').trim(); p.cvFile = file.name; saveProfile(p); renderProfile();
      U.toast('Đã nạp CV: ' + U.fmtNum(p.cv.length) + ' ký tự', 'ok');
    } catch (e) { U.toast('Không đọc được CV: ' + e.message, 'err', 7000); }
    U.loading(false);
  }

  /* =================== Chuẩn bị =================== */
  let prepItems = [];
  function renderPrep() {
    const p = profile();
    $('#prepBody').innerHTML = `
      ${!p.cv && !p.jd ? '<div class="note warn">Nhập CV và JD ở tab <a href="#profile" data-go="profile">Hồ sơ của tôi</a> để dự đoán chính xác hơn.</div>' : ''}
      <div class="card ${!p.cv && !p.jd ? 'mt' : ''}"><div class="cardhead"><h3>Dự đoán câu hỏi phỏng vấn</h3>
        <div class="row"><select id="prepN">${[8, 12, 20].map((n) => `<option value="${n}" ${n === 12 ? 'selected' : ''}>${n} câu</option>`).join('')}</select><button class="btn primary" id="prepGen"><svg class="ic"><use href="#i-spark"/></svg> Tạo bộ câu hỏi</button></div></div>
        <div id="prepList">${prepItems.length ? prepList() : '<p class="muted">AI sẽ tạo câu hỏi sát JD kèm câu trả lời mẫu dựa trên CV — chọn câu muốn lưu vào “Câu trả lời chuẩn bị sẵn”.</p>'}</div></div>
      <div class="card mt"><h3>Luyện tập 1 câu</h3>
        <label class="field mt">Câu hỏi<input type="text" id="prQ" placeholder="vd: Tell me about a time you handled messy data under a tight deadline."></label>
        <label class="field mt">Câu trả lời của tôi (gõ hoặc dán)<textarea id="prA" rows="5"></textarea></label>
        <div class="row mt"><button class="btn primary" id="prGo">Chấm & sửa giúp tôi</button></div>
        <div class="aiout mt" id="prOut"></div></div>`;
  }
  const prepList = () => prepItems.map((x, i) => `<div class="qa"><label class="check"><input type="checkbox" data-prep="${i}" checked><b>${esc(x.q)}</b></label>${x.vi ? `<div class="muted" style="margin:2px 0 6px 24px">${esc(x.vi)}</div>` : ''}<div class="aiout" style="margin-left:24px">${md(x.a)}</div></div>`).join('') +
    '<div class="row mt"><button class="btn primary" id="prepSave">Lưu các câu đã chọn vào hồ sơ</button></div>';
  async function prepGen() {
    const n = +$('#prepN').value;
    U.loading(true, 'AI đang soạn bộ câu hỏi…');
    try {
      const r = await AI.call([{ role: 'user', content: `Dựa trên JD và CV, dự đoán ${n} câu hỏi phỏng vấn có khả năng cao nhất (trộn: giới thiệu bản thân, chuyên môn kỹ thuật, tình huống/hành vi, động lực, câu hỏi khó/bẫy). Ngôn ngữ phỏng vấn: ${$('#sessLang').value === 'vi' ? 'tiếng Việt' : 'tiếng Anh'}.
Với mỗi câu, viết câu trả lời mẫu NGẮN dựa đúng vào hồ sơ (gạch đầu dòng, STAR nếu cần), không bịa.
Trả về đúng định dạng, các câu cách nhau bằng dòng "---":
Q: <câu hỏi>
VI: <dịch tiếng Việt>
A: <câu trả lời mẫu, có thể nhiều dòng>` }],
        Object.assign(sugOpts(), { system: SUG_SYS(), maxTokens: 8000, effort: 'medium' }));
      prepItems = r.text.split(/\n-{3,}\n?/).map((b) => {
        const q = (b.match(/^\s*Q:\s*(.+)$/m) || [])[1], vi = (b.match(/^\s*VI:\s*(.+)$/m) || [])[1];
        const a = (b.split(/^\s*A:\s*/m)[1] || '').trim();
        return q ? { q: q.trim(), vi: (vi || '').trim(), a } : null;
      }).filter(Boolean);
      if (!prepItems.length) throw new Error('AI trả về sai định dạng — thử lại.');
      $('#prepList').innerHTML = prepList();
    } catch (e) { U.toast(e.message, 'err', 7000); }
    U.loading(false);
  }

  /* =================== Lịch sử =================== */
  function renderHistory() {
    const list = sessions();
    const conn = D.hasToken();
    $('#histBody').innerHTML = `
      <div class="card row wrap"><button class="btn" id="hBackup"><svg class="ic"><use href="#i-drive"/></svg> Sao lưu hồ sơ + lịch sử lên Drive</button><button class="btn" id="hRestore">Khôi phục từ Drive</button><button class="btn" id="hExport"><svg class="ic"><use href="#i-down"/></svg> Xuất .json</button><label class="btn">Nhập .json<input type="file" id="hImport" accept=".json" hidden></label><span class="muted">${conn ? 'Google: đã kết nối' : 'Google: chưa kết nối (sẽ hỏi khi bấm)'}</span></div>
      <div class="mt">${list.length ? list.map((s, i) => `<div class="sesscard"><div class="cardhead" style="margin:0"><div><h4>${esc(s.title)}</h4><span class="muted">${new Date(s.startedAt).toLocaleString('vi-VN')} · ${Math.round((s.endedAt - s.startedAt) / 60000)} phút · ${s.turns.length} lượt nói</span></div>
        <div class="row wrap"><button class="btn sm" data-hmd="${i}">Tải .md</button><button class="btn sm" data-hdrive="${i}">Lưu lên Drive</button><button class="btn sm ghost danger" data-hdel="${i}">Xoá</button></div></div>
        ${s.summary ? `<div class="aiout mt">${md(s.summary)}</div>` : ''}
        ${s.turns.length ? `<details class="mt"><summary>Biên bản (${s.turns.length} lượt)</summary><div class="transcript" style="max-height:420px">${s.turns.map((t) => `<div class="turn ${t.who}"><div class="who">${WHO[t.who]}<time>${new Date(t.start).toLocaleTimeString('vi-VN')}</time></div><div class="txt">${esc(t.text)}</div>${t.tr ? `<div class="tr">${esc(t.tr)}</div>` : ''}</div>`).join('')}</div></details>` : ''}
        ${s.analysis ? `<details class="mt"><summary>Phân tích trong buổi</summary><div class="aiout">${md(s.analysis)}</div></details>` : ''}</div>`).join('') : '<div class="empty-state">Chưa có buổi nào.</div>'}</div>`;
  }
  const sessionMd = (s) => `# ${s.title}\n${new Date(s.startedAt).toLocaleString('vi-VN')} · ${Math.round((s.endedAt - s.startedAt) / 60000)} phút\n\n## Tóm tắt\n${s.summary || '(không có)'}\n\n## Biên bản\n` +
    s.turns.map((t) => `**${WHO[t.who]}** (${new Date(t.start).toLocaleTimeString('vi-VN')}): ${t.text}${t.tr ? `\n> ${t.tr}` : ''}`).join('\n\n') +
    (s.analysis ? `\n\n## Phân tích trong buổi\n${s.analysis}` : '') +
    ((s.sugs || []).length ? '\n\n## Gợi ý đã đưa ra\n' + s.sugs.map((g) => `### ${g.q ? g.q.slice(0, 120) : 'Gợi ý'}\n${g.text}`).join('\n\n') : '');
  const snapshot = () => ({ app: 'Interview Copilot', version: 1, savedAt: new Date().toISOString(), profile: profile(), sessions: sessions(), settings: cset() });
  function applySnapshot(st) {
    if (!st || st.app !== 'Interview Copilot') throw new Error('File không đúng định dạng Interview Copilot');
    if (st.profile) saveProfile(Object.assign(profile(), st.profile));
    const have = new Set(sessions().map((s) => s.id));
    saveSessions(sessions().concat((st.sessions || []).filter((s) => !have.has(s.id))).sort((a, b) => b.startedAt - a.startedAt));
    if (st.settings) saveCset(st.settings);
  }
  async function copilotFolder() { const root = await D.root(); return D.ensureFolder('Interview Copilot', root.id); }
  async function driveSaveSession(s) {
    if (!D.hasToken()) await D.connect('');
    const f = await copilotFolder();
    const r = await D.upload(new Blob([sessionMd(s)], { type: 'text/markdown' }), U.safeName(`${new Date(s.startedAt).toISOString().slice(0, 16).replace('T', ' ').replace(':', '')} - ${s.title}.md`), f.id, 'text/markdown');
    await driveBackup(true);
    U.toast('Đã lưu buổi lên Drive ✓', 'ok');
    return r;
  }
  async function driveBackup(silent) {
    if (!D.hasToken()) await D.connect('');
    const f = await copilotFolder();
    const ex = await D.findFile('copilot-state.json', f.id);
    await D.upload(new Blob([JSON.stringify(snapshot())], { type: 'application/json' }), 'copilot-state.json', f.id, 'application/json', ex && ex.id);
    if (!silent) U.toast('Đã sao lưu hồ sơ + lịch sử lên Drive ✓', 'ok');
  }
  async function driveRestore() {
    if (!D.hasToken()) await D.connect('');
    const f = await copilotFolder();
    const ex = await D.findFile('copilot-state.json', f.id);
    if (!ex) throw new Error('Chưa có bản sao lưu Copilot trên Drive.');
    applySnapshot(JSON.parse(await D.readText(ex.id)));
  }

  /* =================== Cài đặt =================== */
  function renderSettings() {
    const k = keys(), c = cset(), prov = sugProvider();
    const gm = k.geminiModels || [];
    // "Tự chọn" hiển thị luôn mô hình sẽ được dùng, để thấy ngay app chọn gì
    const auto = (purpose) => (gm.length ? AI.pickGeminiDefault(gm, purpose) : '');
    const gOpts = (sel, purpose, label) => `<option value="">Tự chọn — ${label}${auto(purpose) ? ' → ' + esc(auto(purpose)) : ''}</option>` + gm.map((m) => `<option value="${esc(m.id)}" ${m.id === sel ? 'selected' : ''}>${esc(m.label)} · ${esc(m.id)}</option>`).join('');
    $('#setBody').innerHTML = `
      <div class="grid2">
        <div class="card"><div class="cardhead"><h3>Gemini — nghe & chép lời (bắt buộc)</h3><span class="chip ${k.geminiKey ? 'on' : ''}">${k.geminiKey ? 'Đã có key' : 'Chưa có key'}</span></div>
          <label class="field">Gemini API key<input type="password" id="cGKey" value="${esc(k.geminiKey)}" placeholder="Dán key từ aistudio.google.com/apikey" autocomplete="off"></label>
          <label class="field mt">Mô hình chép lời<select id="cStt">${gOpts(c.sttModel, 'fast', 'Flash-Lite nhanh nhất')}</select><span class="muted">Nên dùng Flash-Lite/Flash. Tránh bản Pro hoặc tên mã lạ: chậm vì “suy nghĩ” lâu.</span></label>
          <div class="row wrap mt"><button class="btn" id="cGList">Tải danh sách mô hình</button><button class="btn" id="cGTest">Kiểm tra key</button></div>
          <p class="muted" style="font-size:12.5px">Key lưu trên trình duyệt, dùng chung với Master Data Pro. Gói miễn phí giới hạn số lần gọi/phút — buổi dài có thể bị chậm.</p></div>
        <div class="card"><h3>AI gợi ý câu trả lời</h3>
          <label class="field mt">Nhà cung cấp<select id="cProv"><option value="gemini" ${prov === 'gemini' ? 'selected' : ''}>Gemini</option><option value="claude" ${prov === 'claude' ? 'selected' : ''}>Claude</option></select></label>
          ${prov === 'claude' ? `
          <label class="field mt">Claude API key<input type="password" id="cCKey" value="${esc(k.claudeKey)}" placeholder="sk-ant-…" autocomplete="off"></label>
          <label class="field mt">Mô hình Claude<select id="cCModel">${AI.MODELS.map((m) => `<option value="${m.id}" ${m.id === c.sugClaudeModel ? 'selected' : ''}>${m.label}</option>`).join('')}</select><span class="muted">Cần nhanh trong phỏng vấn trực tiếp: Sonnet 5.5 hoặc Haiku 5.5 trả lời nhanh hơn Opus.</span></label>`
          : `<label class="field mt">Mô hình Gemini cho gợi ý<select id="cGModel">${gOpts(c.sugGeminiModel, 'smart', 'Flash')}</select></label>`}
          <div class="row mt"><button class="btn" id="cTestSug">Thử gợi ý</button></div></div>
      </div>
      <div class="grid2 mt">
        <div class="card"><h3>Nghe & ngắt câu</h3>
          <label class="field mt">Độ nhạy micro (1 = ít nhạy, 5 = rất nhạy)<input type="range" id="cSens" min="1" max="5" step="1" value="${c.sensitivity}"></label>
          <label class="field mt">Ngắt câu sau khoảng lặng (ms)<input type="number" id="cSil" min="400" max="3000" step="100" value="${c.silenceMs}"></label>
          <label class="check mt"><input type="checkbox" id="cMem" ${c.memory ? 'checked' : ''}><span>Dùng tóm tắt 5 buổi gần nhất làm ngữ cảnh</span></label>
          <label class="check mt"><input type="checkbox" id="cFast" ${c.fastSuggest ? 'checked' : ''}><span><b>⚡ Gợi ý siêu tốc</b> (chỉ khi gợi ý bằng Gemini): người hỏi vừa nói xong là gửi thẳng âm thanh để soạn gợi ý, song song với chép lời — nhanh hơn khoảng 2–3 giây, tốn thêm 1 lượt gọi Gemini mỗi câu của người kia.</span></label></div>
        <div class="card"><h3>Google Drive</h3>
          <p class="muted">Dùng chung kết nối với Master Data Pro. Lưu vào <b>${esc(D.rootName())}/Interview Copilot/</b>.</p>
          <label class="check"><input type="checkbox" id="cAutoDrive" ${c.autoDrive ? 'checked' : ''}><span>Tự lưu biên bản lên Drive khi kết thúc buổi</span></label>
          <div class="row wrap mt">${D.hasToken() ? `<span class="chip on">Đã kết nối${D.user ? ' · ' + esc(D.user.emailAddress) : ''}</span>` : '<button class="btn primary" id="cConn">Kết nối Google</button>'}</div></div>
      </div>
      <div class="row mt"><button class="btn primary" id="cSave">Lưu cài đặt</button></div>`;
  }
  function saveSettingsForm() {
    const kp = { geminiKey: $('#cGKey').value.trim() };
    if ($('#cCKey')) kp.claudeKey = $('#cCKey').value.trim();
    U.store.set('settings', Object.assign(U.store.get('settings', {}), kp));
    const p = { sttModel: $('#cStt').value, sugProvider: $('#cProv').value, sensitivity: +$('#cSens').value, silenceMs: +$('#cSil').value || 700, memory: $('#cMem').checked, fastSuggest: $('#cFast').checked, autoDrive: $('#cAutoDrive').checked };
    if ($('#cCModel')) p.sugClaudeModel = $('#cCModel').value;
    if ($('#cGModel')) p.sugGeminiModel = $('#cGModel').value;
    saveCset(p);
  }

  /* =================== Sự kiện =================== */
  function bind() {
    $('#sidenav').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });
    $('#navToggle').addEventListener('click', () => $('#sidenav').classList.toggle('open'));
    $('#themeBtn').addEventListener('click', () => {
      const order = ['', 'dark', 'light'], c = document.documentElement.dataset.theme || '', v = order[(order.indexOf(c) + 1) % 3];
      if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme;
      if (v) U.store.set('theme', v); else U.store.del('theme');
    });
    $('#showTrans').addEventListener('change', renderTranscript);
    $('#manualQ').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.value.trim()) { const q = e.target.value.trim(); e.target.value = ''; L.turns.push({ id: ++L.seq, who: 'them', text: q, start: Date.now(), tr: '(gõ tay)' }); renderTranscript(); suggest(q); } });
    document.addEventListener('keydown', (e) => {
      if (!L.active) return;
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); [L.themL].forEach((x) => x && x.flush()); setTimeout(() => suggest(), 300); }
      if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) { e.preventDefault(); readScreen(); }
    });

    document.addEventListener('click', async (e) => {
      const t = e.target.closest('button, [data-go]'); if (!t) return;
      const d = t.dataset;
      if (d.go) { e.preventDefault(); return showTab(d.go); }
      if (d.qadel) { const p = readProfileForm(); p.qa.splice(+d.qadel, 1); saveProfile(p); return renderProfile(); }
      if (d.hmd) { const s = sessions()[+d.hmd]; return U.download(new Blob([sessionMd(s)], { type: 'text/markdown' }), U.safeName(s.title + '.md')); }
      if (d.hdrive) { U.loading(true, 'Đang lưu lên Drive…'); try { await driveSaveSession(sessions()[+d.hdrive]); } catch (er) { U.toast(er.message, 'err', 7000); } U.loading(false); return; }
      if (d.hdel) { if (confirm('Xoá buổi này khỏi trình duyệt?')) { const l = sessions(); l.splice(+d.hdel, 1); saveSessions(l); renderHistory(); } return; }
      switch (t.id) {
        case 'btnStart': return startSession();
        case 'btnStop': return stopSession();
        case 'btnSuggest': [L.themL].forEach((x) => x && x.flush()); return setTimeout(() => suggest(), 300);
        case 'btnShot': return readScreen();
        case 'btnAnalyze': return analyze();
        case 'pSave': saveProfile(readProfileForm()); return U.toast('Đã lưu hồ sơ', 'ok');
        case 'pTpl': {
          const el = $('#pExp');
          if (/## THÔNG TIN NGOÀI LỀ/.test(el.value)) return U.toast('Mẫu đã có trong ô này', 'info');
          el.value = (el.value.trim() ? el.value.trim() + '\n\n' : '') + OFFTOPIC_TPL;
          el.focus(); el.scrollTop = el.scrollHeight;
          return U.toast('Đã chèn mẫu — điền phần sau dấu “:” rồi bấm Lưu hồ sơ', 'ok', 5000);
        }
        case 'pQaAdd': { const p = readProfileForm(); p.qa.push({ q: '', a: '' }); saveProfile(p); return renderProfile(); }
        case 'pExport': return U.download(new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' }), 'interview-copilot.json');
        case 'prepGen': return prepGen();
        case 'prepSave': {
          const p = profile();
          $$('[data-prep]').filter((c) => c.checked).forEach((c) => { const x = prepItems[+c.dataset.prep]; p.qa.push({ q: x.q, a: x.a }); });
          saveProfile(p); return U.toast('Đã lưu vào câu trả lời chuẩn bị sẵn', 'ok');
        }
        case 'prGo': {
          const q = $('#prQ').value.trim(), a = $('#prA').value.trim(); if (!q) return U.toast('Nhập câu hỏi', 'err');
          const box = $('#prOut'); box.innerHTML = '<p class="muted">Đang chấm…</p>';
          try {
            await AI.call([{ role: 'user', content: `Câu hỏi phỏng vấn: ${q}\nCâu trả lời của tôi: ${a || '(chưa có — hãy soạn giúp)'}\n\nChấm điểm /10 (rõ ràng, đúng trọng tâm, có số liệu, khớp JD), chỉ ra 3 điểm cần sửa (tiếng Việt), rồi viết lại câu trả lời tốt hơn bằng ngôn ngữ của câu hỏi, dựa đúng hồ sơ, đọc trong 60–90 giây.` }],
              Object.assign(sugOpts(), { system: SUG_SYS(), maxTokens: 6000, effort: 'medium', onText: (x) => { box.innerHTML = md(x); } }));
          } catch (er) { box.innerHTML = `<p style="color:var(--bad)">${esc(er.message)}</p>`; }
          return;
        }
        case 'hBackup': U.loading(true, 'Đang sao lưu…'); try { await driveBackup(); } catch (er) { U.toast(er.message, 'err', 7000); } U.loading(false); return;
        case 'hRestore': U.loading(true, 'Đang khôi phục…'); try { await driveRestore(); U.toast('Đã khôi phục hồ sơ + lịch sử', 'ok'); renderHistory(); } catch (er) { U.toast(er.message, 'err', 7000); } U.loading(false); return;
        case 'hExport': return U.download(new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' }), 'interview-copilot.json');
        case 'cSave': saveSettingsForm(); U.toast('Đã lưu cài đặt', 'ok'); return renderSettings();
        case 'cGList': saveSettingsForm(); U.loading(true, 'Đang lấy danh sách mô hình…');
          try { const list = await AI.listGeminiModels(keys().geminiKey); U.store.set('settings', Object.assign(U.store.get('settings', {}), { geminiModels: list })); AI.resetGeminiAuto(); U.toast(`Có ${list.length} mô hình`, 'ok'); } catch (er) { U.toast(er.message, 'err', 7000); }
          U.loading(false); return renderSettings();
        case 'cGTest': saveSettingsForm(); U.loading(true, 'Đang kiểm tra…');
          try { const r = await AI.call([{ role: 'user', content: 'Reply with one word: OK' }], { provider: 'gemini', model: cset().sttModel || undefined, purpose: 'fast', think: 'off', maxTokens: 256 }); U.toast('Gemini hoạt động ✓ (' + r.model + ')', 'ok'); } catch (er) { U.toast(er.message, 'err', 8000); }
          U.loading(false); return renderSettings();
        case 'cTestSug': saveSettingsForm(); U.loading(true, 'Đang thử gợi ý…');
          try { const r = await AI.call([{ role: 'user', content: 'Bản ghi:\n[Người phỏng vấn] Could you briefly introduce yourself?\n\nHãy gợi ý cho lượt mới nhất.' }], Object.assign(sugOpts(), { system: SUG_SYS() })); U.toast('Gợi ý hoạt động ✓ (' + r.model + ')', 'ok'); } catch (er) { U.toast(er.message, 'err', 8000); }
          U.loading(false); return renderSettings();
        case 'cConn': try { await D.connect('consent'); U.toast('Đã kết nối Google', 'ok'); } catch (er) { U.toast(er.message, 'err', 8000); } return renderSettings();
      }
    });
    document.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.id === 'pCvFile' && t.files[0]) { const p = readProfileForm(); saveProfile(p); return loadCv(t.files[0]); }
      if ((t.id === 'pImport' || t.id === 'hImport') && t.files[0]) { try { applySnapshot(JSON.parse(await t.files[0].text())); U.toast('Đã nhập dữ liệu', 'ok'); showTab(tab); } catch (er) { U.toast(er.message, 'err'); } }
      if (t.id === 'cProv') { saveSettingsForm(); renderSettings(); }
      if (t.id === 'sessSource') renderStart();
    });
  }

  // Nâng cấp cài đặt cũ (v2): ngắt câu nhanh hơn, bỏ mô hình tự chọn cũ (có thể là bản "suy nghĩ" chậm)
  (function migrate() {
    const c = U.store.get(CKEY, {});
    if (c.v >= 2) return;
    if (c.silenceMs === 900) c.silenceMs = 700;
    c.v = 2; U.store.set(CKEY, c);
    AI.resetGeminiAuto();
    const s = U.store.get('settings', {});
    if (s.geminiModel && !/flash|pro|lite/.test(s.geminiModel)) { delete s.geminiModel; U.store.set('settings', s); }
  })();

  // API nội bộ cho tab Phỏng vấn thử (mock.js)
  MD.CP = { profile, cset, keys, sugProvider, sugOpts, SUG_SYS, md, sessions, saveSessions, sttCall, transcriptText, WHO, showTab, langName };

  bind();
  const start = (location.hash || '').slice(1);
  showTab(['live', 'mock', 'profile', 'prep', 'history', 'settings'].includes(start) ? start : 'live');
})(window.MD);
