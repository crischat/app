/* Interview Copilot — Hỏi nhanh: tìm trong câu trả lời đã chuẩn bị, không có thì hỏi Gemini (nhanh) */
(function (MD) {
  'use strict';
  const U = MD.U, AI = MD.AI, $ = U.$, esc = U.esc;
  const STOP = new Set('a an the is are do does did you your we our i me my to of in on for and or what how why when where which who with about can could would will have has be this that it at as from tell us please so little bit briefly just maybe some kind like okay ok well now let yeah really bit more could please em chi anh la co khong gi nao the va cua cho voi duoc minh ban'.split(' '));
  const toks = (s) => U.stripAccents(String(s).toLowerCase()).replace(/\(english\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w));

  // điểm khớp 0..1 giữa câu hỏi và từng câu đã chuẩn bị
  function match(q) {
    const t = toks(q); if (!t.length) return [];
    return MD.CP.profile().qa.filter((x) => x.q && x.a).map((x) => {
      const xt = new Set(toks(x.q)); let s = 0;
      t.forEach((w) => {
        if (xt.has(w)) { s += 1; return; }
        for (const y of xt) if (y.length > 3 && w.length > 3 && y.slice(0, 4) === w.slice(0, 4)) { s += 0.6; break; }
      });
      return { x, s: s / Math.sqrt(t.length * Math.max(3, xt.size)) };
    }).filter((r) => r.s > 0.3).sort((a, b) => b.s - a.s).slice(0, 3);
  }

  const SYS = () => `Bạn là trợ lý phỏng vấn, trả lời THẬT NHANH cho ứng viên ("Tôi") dưới đây.
Trả lời đúng định dạng, không thêm gì khác:
**VN:** <dịch câu hỏi sang tiếng Việt, 1 dòng>
**Trả lời (nói theo):**
- <2–4 câu ngắn, đơn giản, dễ đọc to, ngôi thứ nhất, cùng ngôn ngữ với câu hỏi; dùng số liệu thật trong hồ sơ nếu hợp>
**Lưu ý:** <1 dòng tiếng Việt>
Chỉ dùng sự thật trong hồ sơ; KHÔNG bịa kinh nghiệm. Nếu hồ sơ không có: trả lời trung thực + việc tương tự đã làm + sẵn sàng học.

${MD.CP.profileBlock()}`;

  const fmt = (t) => MD.CP.md(String(t || '').replace(/\n(?=\*\*)/g, '\n\n'));
  let ctl = null;
  async function askAI(q) {
    const k = MD.CP.keys();
    if (!k.geminiKey && !k.claudeKey) return U.toast('Cần Gemini key — nhập ở tab Cài đặt.', 'err');
    if (ctl) ctl.abort(); ctl = new AbortController(); const my = ctl;
    showHits(q);
    const c = cur(); if (!c || c.src !== 'paste' || c.q !== q) addPaste(q);
    const box = $('#qkAI'), st = $('#qkState'), t0 = Date.now(); let first = 0;
    box.hidden = false; box.innerHTML = '<p class="muted">Đang hỏi…</p>'; st.textContent = '';
    try {
      const r = await AI.call([{ role: 'user', content: [{ type: 'text', text: 'Câu hỏi: ' + q }] }], {
        provider: k.geminiKey ? 'gemini' : 'claude', purpose: 'fast', think: 'off', effort: 'low', maxTokens: 1200, cacheSystem: true,
        model: k.geminiKey ? undefined : MD.CP.cset().sugClaudeModel,
        system: SYS(), signal: my.signal,
        onText: (t) => { if (my !== ctl) return; if (!first) first = Date.now(); box.innerHTML = fmt(t); }
      });
      if (my !== ctl) return;
      box.innerHTML = fmt(r.text);
      st.textContent = `${first ? 'chữ đầu ' + ((first - t0) / 1000).toFixed(1) + 's · ' : ''}xong ${((Date.now() - t0) / 1000).toFixed(1)}s · ${r.model || ''}`;
    } catch (e) { if (e.name !== 'AbortError') { box.innerHTML = `<p class="err">Lỗi: ${esc(e.message)}</p>`; } }
  }

  function showHits(q) {
    const hits = match(q);
    $('#qkHits').innerHTML = hits.map((h, i) => `<div class="qk-hit"><span class="pill">${i === 0 ? 'Đã chuẩn bị · khớp nhất' : 'Gần giống'}</span>
      <div class="qk-q">${esc(h.x.q.replace(/^\(English\)\s*/, ''))}</div><div class="aiout">${MD.CP.md(h.x.a)}</div></div>`).join('');
    return hits;
  }

  function mount() {
    const tab = $('#tab-live'); if (!tab || $('#quickAsk')) return;
    const el = document.createElement('details');
    el.className = 'card qk'; el.id = 'quickAsk'; el.open = true;
    el.innerHTML = `<summary><b>⚡ Hỏi nhanh</b> <span class="muted">— gõ/dán câu hỏi: hiện câu đã chuẩn bị; không có thì Enter để AI trả lời ngay</span></summary>
      <div class="row mt" style="gap:8px"><input type="text" id="qkIn" placeholder="vd: How good is your SQL?  (Enter = hỏi AI)" style="flex:1">
      <button class="btn primary" id="qkAsk">✨ Hỏi AI</button><button class="btn" id="qkClr">Xoá</button><button class="btn" id="qkPip" title="Cửa sổ nhỏ luôn nổi trên Teams">🪟 Cửa sổ nổi</button></div>
      <div class="muted" id="qkState" style="margin-top:4px"></div>
      <div class="aiout qk-ai" id="qkAI" hidden></div>
      <div id="qkHits"></div>`;
    tab.prepend(el);
    let tm;
    $('#qkIn').addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => showHits($('#qkIn').value), 120); });
    $('#qkIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const q = $('#qkIn').value.trim(); if (q) askAI(q); } });
    $('#qkAsk').onclick = () => { const q = $('#qkIn').value.trim(); if (q) askAI(q); };
    $('#qkPip').onclick = openPip;
    $('#qkClr').onclick = () => { if (ctl) ctl.abort(); $('#qkIn').value = ''; $('#qkHits').innerHTML = ''; $('#qkAI').hidden = true; $('#qkState').textContent = ''; $('#qkIn').focus(); };
  }

  /* =================== Lịch sử hỏi-đáp cho cửa sổ nổi ===================
     Mỗi mục = 1 câu hỏi (có thể gồm nhiều đoạn nói liền nhau). Mục mới tạo NGAY lúc người kia
     nói xong (trước khi chép lời) để gợi ý AI chạy song song luôn gắn đúng câu. */
  const P = { win: null, hist: [] };
  const MERGE_MS = 4500, MAX_HIST = 12;
  const cur = () => P.hist[P.hist.length - 1];
  function freezePrev() {
    const c = cur(); if (c && c.ai == null) c.ai = aiHtml(c.src);
  }
  function rematch(e) { const h = e.q ? match(e.q)[0] : null; e.prep = h && h.s >= 0.4 ? h.x : null; }
  // người phỏng vấn vừa nói xong 1 đoạn (chưa có chữ)
  function beginTurn(id) {
    const c = cur(), now = Date.now();
    if (c && c.src === 'live' && now - c.at < MERGE_MS && c.ids.length < 4) { c.ids.push(id); c.parts[id] = null; c.at = now; }
    else {
      freezePrev();
      P.hist.push({ src: 'live', ids: [id], parts: { [id]: null }, trs: {}, q: '', tr: '', prep: null, ai: null, at: now });
      if (P.hist.length > MAX_HIST) P.hist.shift();
    }
    pipRender();
  }
  function entryOf(id) { return P.hist.find((e) => e.ids && e.ids.includes(id)); }
  function joinParts(e) {
    e.q = e.ids.map((i) => e.parts[i]).filter(Boolean).join(' ');
    e.tr = e.ids.map((i) => e.trs[i]).filter(Boolean).join(' ');
  }
  function dropTurn(id) {
    const e = entryOf(id); if (!e) return;
    e.ids = e.ids.filter((i) => i !== id); delete e.parts[id];
    if (!e.ids.length) P.hist = P.hist.filter((x) => x !== e); else joinParts(e);
    pipRender();
  }
  // Phiên trực tiếp: đã chép lời xong -> hiện NGAY câu đã chuẩn bị nếu khớp (không chờ AI)
  function onHeard(text, tr, id) {
    let e = id != null ? entryOf(id) : null;
    if (!e) { beginTurn(id != null ? id : 'x' + Date.now()); e = cur(); id = e.ids[e.ids.length - 1]; }
    e.parts[id] = text; e.trs[id] = tr || ''; joinParts(e); rematch(e);
    const box = $('#prepHit');
    if (box && e === cur()) box.innerHTML = !e.prep ? '' : `<div class="qk-hit prep-hit"><span class="pill">⚡ Đã chuẩn bị · khớp câu vừa nghe</span>
      <div class="muted" style="margin-top:4px">🎧 ${esc(e.q)}${e.tr ? ' — ' + esc(e.tr) : ''}</div>
      <div class="qk-q">${esc(e.prep.q.replace(/^\(English\)\s*/, ''))}</div><div class="aiout">${MD.CP.md(e.prep.a)}</div></div>`;
    pipRender();
  }
  function addPaste(q) {
    freezePrev();
    const e = { src: 'paste', q, tr: '', prep: null, ai: null, at: Date.now() }; rematch(e);
    P.hist.push(e); if (P.hist.length > MAX_HIST) P.hist.shift();
    pipRender(); return e;
  }

  /* =================== Cửa sổ nổi (luôn nằm trên Teams) =================== */
  const FSKEY = 'copilot_pipfs';
  const PIP_CSS = `
    *{box-sizing:border-box} html,body{margin:0;height:100%}
    body{font:var(--fs,15px)/1.5 system-ui,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e5e7eb;display:flex;flex-direction:column}
    .bar{display:flex;gap:6px;align-items:center;padding:6px 8px;background:#111827;border-bottom:1px solid #1f2937;font-size:12px}
    .bar input[type=range]{width:100px}
    .paste{display:flex;gap:6px;padding:6px 8px;border-bottom:1px solid #1f2937}
    .paste textarea{flex:1;font:13px system-ui;min-height:2.6em;max-height:7em;resize:vertical;background:#0b1220;color:#e5e7eb;border:1px solid #334155;border-radius:8px;padding:6px}
    button{font:12px system-ui;border:1px solid #334155;background:#1e293b;color:#e5e7eb;border-radius:8px;padding:4px 10px;cursor:pointer}
    button.pri{background:#2563eb;border-color:#2563eb;color:#fff;font-weight:600}
    .main{flex:1;overflow:auto;padding:8px}
    .lbl{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px}
    .q{background:#3b2a07;border-left:4px solid #f59e0b;border-radius:8px;padding:8px 10px;margin-bottom:8px}
    .q .lbl{color:#fbbf24} .q .en{font-weight:600;color:#fde68a} .q .vi{color:#d6d3d1;font-style:italic;margin-top:2px}
    .a{border-radius:8px;padding:8px 10px;margin-bottom:8px}
    .a.prep{background:#052e1a;border-left:4px solid #22c55e} .a.prep .lbl{color:#4ade80}
    .a.ai{background:#0c1d3a;border-left:4px solid #3b82f6} .a.ai .lbl{color:#93c5fd}
    .a p{margin:.2em 0} .a ul,.a ol{margin:.2em 0;padding-left:1.2em} .a li{margin:.15em 0}
    .a strong{color:#fff} .mut{color:#94a3b8;font-size:12px}
    .old{border-top:1px dashed #334155;margin-top:10px;padding-top:6px}
    .old>summary{cursor:pointer;list-style:none;color:#fbbf24;opacity:.85}
    .old>summary::-webkit-details-marker{display:none}
    .old>summary .n{color:#94a3b8;font-size:11px;margin-right:6px}
    .old[open]>summary{margin-bottom:6px}
    .listen{color:#fbbf24}`;
  const fsGet = () => Math.min(24, Math.max(8, +U.store.get(FSKEY, 15) || 15));
  function aiHtml(src) {
    const box = src === 'paste' ? $('#qkAI') : $('#suggest');
    if (!box || box.hidden) return '';
    const t = box.textContent;
    if (t.length < 80 && /Khi người phỏng vấn hỏi xong|Đang soạn gợi ý|Đang hỏi/.test(t)) return '';
    return box.innerHTML;
  }
  function qBlock(e, lbl) {
    const body = e.q ? esc(e.q) : (e.src === 'live' ? '<span class="listen">🎧 đang chép lời…</span>' : '');
    return `<div class="q"><div class="lbl">${lbl}${e.src === 'paste' ? ' (dán tay)' : ''}</div><div class="en">${body}</div>${e.tr ? `<div class="vi">${esc(e.tr)}</div>` : ''}</div>`;
  }
  function aBlock(e, ai) {
    return (e.prep ? `<div class="a prep"><div class="lbl">✅ Trả lời đã chuẩn bị</div>${MD.CP.md(e.prep.a)}</div>` : '')
      + (ai ? `<div class="a ai"><div class="lbl">✨ Gợi ý AI</div>${ai}</div>` : '');
  }
  function pipRender() {
    if (!P.win || P.win.closed) return;
    const m = P.win.document.getElementById('pm'); if (!m) return;
    const c = cur();
    if (!c) { m.innerHTML = '<div class="mut">Chưa có câu hỏi. Bắt đầu phiên ở tab Phiên trực tiếp, hoặc dán câu hỏi vào ô trên rồi Enter.</div>'; return; }
    // giữ trạng thái mở/đóng của các câu trước khi vẽ lại
    const shut = new Set([...m.querySelectorAll('details.old:not([open])')].map((d) => d.dataset.at));
    const older = P.hist.slice(0, -1).reverse();
    m.innerHTML = qBlock(c, '❓ Câu hỏi mới nhất') + aBlock(c, aiHtml(c.src))
      + older.map((e, i) => `<details class="old" data-at="${e.at}"${shut.has(String(e.at)) ? '' : ' open'}><summary><span class="n">▸ Câu trước ${i + 1}</span>${esc(e.q || '…')}</summary>
          ${e.tr ? `<div class="mut" style="font-style:italic;margin-bottom:4px">${esc(e.tr)}</div>` : ''}${aBlock(e, e.ai)}</details>`).join('');
  }
  // theo dõi khung gợi ý ở trang chính để cửa sổ nổi cập nhật theo luồng chữ
  let obs = null;
  function watchBoxes() {
    if (obs) return;
    obs = new MutationObserver(() => pipRender());
    ['#suggest', '#qkAI'].forEach((s) => { const el = $(s); if (el) obs.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] }); });
  }
  function pasteAsk(q) {
    q = String(q || '').trim(); if (!q) return;
    const e = addPaste(q);
    const inp = $('#qkIn'); if (inp) inp.value = q;
    const h = match(q)[0];
    if (h && h.s >= 0.75) { const b = $('#qkAI'); if (ctl) ctl.abort(); if (b) { b.hidden = true; b.innerHTML = ''; } e.ai = null; pipRender(); } // khớp rất chắc: khỏi gọi AI
    else askAI(q);
  }
  async function openPip() {
    if (P.win && !P.win.closed) { P.win.focus(); return; }
    let w = null, floating = true;
    if (window.documentPictureInPicture) {
      try { w = await documentPictureInPicture.requestWindow({ width: 440, height: 560 }); } catch (e) { w = null; }
    }
    if (!w) {
      floating = false;
      w = window.open('', 'copilotPip', 'width=440,height=560');
      if (!w) return U.toast('Trình duyệt chặn cửa sổ bật lên — cho phép popup cho trang này.', 'err', 7000);
    }
    P.win = w;
    const d = w.document;
    d.title = 'Copilot — hỏi & đáp';
    d.head.innerHTML = `<meta charset="utf-8"><style>${PIP_CSS}</style>`;
    d.body.innerHTML = `<div class="bar"><b>Cỡ chữ</b><input type="range" id="pfs" min="8" max="24" step="1"><span id="pfsv"></span>
        <span style="flex:1"></span><button id="pclr">Xoá</button></div>
      <div class="paste"><textarea id="pq" placeholder="Dán câu hỏi copy từ Teams (Ctrl+V) — tự hỏi luôn"></textarea><button class="pri" id="pask">Hỏi</button></div>
      <div class="main" id="pm"></div>`;
    const setFs = (v) => { v = Math.min(24, Math.max(8, +v || 15)); d.body.style.setProperty('--fs', v + 'px'); d.getElementById('pfsv').textContent = v + 'px'; U.store.set(FSKEY, v); };
    const r = d.getElementById('pfs'); r.value = fsGet(); setFs(fsGet());
    r.addEventListener('input', () => setFs(r.value));
    const pq = d.getElementById('pq');
    const go = () => { const v = pq.value; pq.value = ''; pasteAsk(v); };
    pq.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    pq.addEventListener('paste', () => setTimeout(() => { if (pq.value.trim()) go(); }, 30)); // dán xong là hỏi luôn
    d.getElementById('pask').onclick = go;
    d.getElementById('pclr').onclick = () => { if (ctl) ctl.abort(); P.hist = []; const b = $('#qkAI'); if (b) { b.hidden = true; b.innerHTML = ''; } pipRender(); pq.focus(); };
    watchBoxes(); pipRender();
    w.addEventListener('pagehide', () => { P.win = null; });
    if (!floating) U.toast('Trình duyệt này chưa hỗ trợ cửa sổ luôn nổi — đã mở cửa sổ thường. Dùng Chrome/Edge bản mới để nổi trên Teams.', 'info', 7000);
  }

  MD.Quick = { match, askAI, mount, onHeard, beginTurn, dropTurn, openPip, pasteAsk, _P: P };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})(window.MD);
