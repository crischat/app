/* Interview Copilot — Luyện câu: đọc to câu hỏi đã chuẩn bị bằng giọng tiếng Anh, bạn trả lời vào mic,
   rồi so với câu mẫu và đọc theo (shadowing). Không cần API key: dùng giọng và nhận giọng nói của trình duyệt. */
(function (MD) {
  'use strict';
  const U = MD.U, { $, esc } = U;
  const OKEY = 'copilot_drill', MKEY = 'copilot_drill_marks';
  const opts = () => Object.assign({ voice: '', rate: 0.9, onlyVt: true, order: 'seq', showQ: true, autoMic: true, gap: 1.2 }, U.store.get(OKEY, {}));
  const saveOpts = (p) => U.store.set(OKEY, Object.assign(opts(), p));
  const marks = () => U.store.get(MKEY, {});
  const setMark = (q, v) => { const m = marks(); if (v) m[q] = v; else delete m[q]; U.store.set(MKEY, m); };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const S = { list: [], i: 0, heard: '', showA: false, rec: null, listening: false, speaking: false, stop: false };

  /* ---------- Bộ câu ---------- */
  const clean = (q) => q.replace(/^\(English\)\s*/i, '').trim();
  function build() {
    const o = opts(), qa = (MD.CP.profile().qa || []).filter((x) => x.q && x.a && /^\(English\)/i.test(x.q));
    const hasVt = qa.some((x) => x.src === 'vt');
    let list = o.onlyVt && hasVt ? qa.filter((x) => x.src === 'vt') : qa;
    const seen = new Set(); // bỏ câu trùng nội dung trả lời (câu bí danh)
    list = list.filter((x) => { const k = x.a.trim(); if (seen.has(k)) return false; seen.add(k); return true; });
    list = list.map((x) => ({ q: clean(x.q), a: x.a, q_vi: x.q_vi || '', a_vi: x.a_vi || '' }));
    if (o.order === 'rand') list.sort(() => Math.random() - 0.5);
    if (o.order === 'weak') { const m = marks(); list.sort((a, b) => (m[a.q] === 'ok') - (m[b.q] === 'ok')); }
    S.list = list; S.i = 0; S.hasVt = hasVt; reset();
  }
  const cur = () => S.list[S.i];
  function reset() { S.heard = ''; S.showA = false; }

  /* ---------- Giọng đọc ---------- */
  const enVoices = () => (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter((v) => /^en[-_]/i.test(v.lang));
  function pickVoice() {
    const o = opts(), l = enVoices();
    return l.find((v) => v.name === o.voice) || l.find((v) => /natural|online/i.test(v.name) && /en-us/i.test(v.lang)) || l.find((v) => /google us/i.test(v.name)) || l.find((v) => /en-us/i.test(v.lang)) || l[0] || null;
  }
  function stopAll() {
    S.stop = true;
    if (window.speechSynthesis) speechSynthesis.cancel();
    S.speaking = false; stopMic();
  }
  function say(text) {
    return new Promise((res) => {
      if (!window.speechSynthesis) { U.toast('Trình duyệt không có giọng đọc.', 'err'); return res(); }
      const u = new SpeechSynthesisUtterance(text.replace(/^[-\d.\s]+/gm, '').replace(/\n+/g, ' '));
      const v = pickVoice(); if (v) u.voice = v; u.lang = v ? v.lang : 'en-US'; u.rate = +opts().rate || 0.9;
      // Chrome đôi khi im giữa câu dài: giữ cho engine chạy
      const keep = setInterval(() => { if (speechSynthesis.speaking) { speechSynthesis.pause(); speechSynthesis.resume(); } }, 10000);
      const done = () => { clearInterval(keep); S.speaking = false; paint(); res(); };
      u.onend = done; u.onerror = done;
      S.speaking = true; paint(); speechSynthesis.speak(u);
    });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const lines = (a) => a.split('\n').map((s) => s.replace(/^\s*(-|\d+\.)\s*/, '').trim()).filter(Boolean);

  async function playQuestion() {
    stopAll(); S.stop = false;
    await say(cur().q);
    if (!S.stop && opts().autoMic && SR && !S.showA) startMic();
  }
  async function playAnswer() { stopAll(); S.stop = false; await say(lines(cur().a).join(' ')); }
  // Đọc theo: máy đọc từng câu, chừa khoảng lặng bằng độ dài câu để bạn nói lại
  async function shadow() {
    stopAll(); S.stop = false; S.showA = true; paint();
    const ls = lines(cur().a);
    for (let k = 0; k < ls.length && !S.stop; k++) {
      S.line = k; paint();
      const t0 = Date.now(); await say(ls[k]); if (S.stop) break;
      await sleep((Date.now() - t0) * opts().gap + 400);
    }
    S.line = -1; paint();
  }

  /* ---------- Mic: nhận giọng tiếng Anh ---------- */
  function startMic() {
    if (!SR) return U.toast('Trình duyệt này không nhận giọng nói. Dùng Chrome hoặc Edge.', 'err', 6000);
    if (S.listening) return;
    if (window.speechSynthesis) speechSynthesis.cancel();
    const r = new SR(); r.lang = 'en-US'; r.continuous = true; r.interimResults = true;
    let fin = S.heard ? S.heard + ' ' : '';
    r.onresult = (e) => {
      let tmp = '';
      for (let k = e.resultIndex; k < e.results.length; k++) { const t = e.results[k][0].transcript; if (e.results[k].isFinal) fin += t + ' '; else tmp += t; }
      S.heard = (fin + tmp).trim(); const el = $('#drHeard'); if (el) el.textContent = S.heard || '…';
    };
    r.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') U.toast('Mic: ' + e.error, 'err'); };
    r.onend = () => { if (S.listening && S.rec === r) { try { r.start(); } catch (x) { S.listening = false; paint(); } } };
    S.rec = r; S.listening = true;
    try { r.start(); } catch (x) { S.listening = false; }
    paint();
  }
  function stopMic() { if (S.rec) { S.listening = false; try { S.rec.stop(); } catch (x) { /* đã dừng */ } S.rec = null; } }
  function finishAnswer() { stopMic(); S.showA = true; paint(); }

  /* ---------- Chấm nhanh: ý chính và con số đã nói ---------- */
  const STOP = new Set('about after again also because before being could every first from have here into just like make more most much only other over same should some such than that their them then there these they this those very what when where which while will with would your yours year years always really thank thanks please'.split(' '));
  const norm = (s) => s.toLowerCase().replace(/(\d),(\d)/g, '$1$2').replace(/(\d):(\d)/g, '$1h$2').replace(/[^a-z0-9.\s]/g, ' ');
  function score(heard, ans) {
    const h = ' ' + norm(heard).replace(/\./g, ' ') + ' ';
    const nums = [...new Set((norm(ans).match(/\d+([.h]\d+)?/g) || []))];
    const words = [...new Set(norm(ans).replace(/\./g, ' ').split(/\s+/).filter((w) => w.length >= 5 && !STOP.has(w) && !/^\d/.test(w)))];
    const hit = (w) => h.includes(' ' + w) || h.includes(w.slice(0, -1));
    const nHit = nums.filter((n) => h.includes(' ' + n + ' ') || h.includes(' ' + n.split('.')[0] + ' ')), wHit = words.filter(hit);
    return { nums, nHit, words, wHit, pct: words.length ? Math.round(100 * wHit.length / words.length) : 0, wc: heard.split(/\s+/).filter(Boolean).length };
  }

  /* ---------- Giao diện ---------- */
  function paint() {
    const body = $('#drillBody'); if (!body) return;
    const o = opts();
    if (!S.list.length) build();
    const x = cur(), m = marks();
    const done = S.list.filter((y) => m[y.q] === 'ok').length;
    const vs = enVoices(), pv = pickVoice();
    const settings = `<details class="card mt" ${vs.length ? '' : 'open'}><summary><b>⚙ Giọng đọc &amp; cách tập</b> <span class="muted">${esc(pv ? pv.name : 'chưa có giọng tiếng Anh')} · ${o.rate}x</span></summary>
      <div class="formgrid mt">
        <label class="field">Giọng tiếng Anh<select id="drVoice">${vs.length ? vs.map((v) => `<option value="${esc(v.name)}" ${pv && v.name === pv.name ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('') : '<option value="">(máy chưa có giọng tiếng Anh)</option>'}</select>
          <span class="muted">Edge có giọng "Natural" đọc tự nhiên nhất.</span></label>
        <label class="field">Tốc độ đọc <span class="muted" id="drRateV">${o.rate}x</span><input type="range" id="drRate" min="0.6" max="1.3" step="0.05" value="${o.rate}"></label>
        <label class="field">Thứ tự<select id="drOrder">${[['seq', 'Lần lượt'], ['rand', 'Ngẫu nhiên'], ['weak', 'Câu chưa thuộc trước']].map(([v, l]) => `<option value="${v}" ${o.order === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">Khoảng lặng khi đọc theo<select id="drGap">${[[0.8, 'Ngắn'], [1.2, 'Vừa'], [1.8, 'Dài']].map(([v, l]) => `<option value="${v}" ${+o.gap === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="row wrap mt">
        ${S.hasVt ? `<label class="check"><input type="checkbox" id="drOnlyVt" ${o.onlyVt ? 'checked' : ''}><span>Chỉ câu của vị trí đang chọn</span></label>` : ''}
        <label class="check"><input type="checkbox" id="drShowQ" ${o.showQ ? 'checked' : ''}><span>Hiện chữ câu hỏi (bỏ chọn để luyện nghe)</span></label>
        <label class="check"><input type="checkbox" id="drAutoMic" ${o.autoMic ? 'checked' : ''}><span>Đọc xong câu hỏi thì tự bật mic</span></label>
        <button class="btn ghost" id="drResetMarks">Xoá đánh dấu đã thuộc</button>
      </div></details>`;
    if (!x) {
      body.innerHTML = `<div class="note warn">Chưa có câu tiếng Anh nào. Vào tab <b>Phiên trực tiếp</b>, bấm <b>Kết nối Drive</b>, chọn ① GOC và ② vị trí, rồi quay lại đây.</div>${settings}`;
      return;
    }
    const sc = S.heard ? score(S.heard, x.a) : null;
    const ls = lines(x.a);
    body.innerHTML = `
      <div class="card">
        <div class="cardhead"><div><span class="pill">Câu ${S.i + 1}/${S.list.length}</span> <span class="muted">· đã thuộc ${done}/${S.list.length}</span>
          ${m[x.q] === 'ok' ? ' <span class="pill" style="background:var(--ok);color:#fff">✓ Thuộc</span>' : m[x.q] === 'again' ? ' <span class="pill">↻ Tập lại</span>' : ''}</div>
          <div class="row"><button class="btn" id="drGoMock" title="AI đóng vai quản lý, hỏi tình huống bằng tiếng Anh, đưa thêm diễn biến làm khó, cuối buổi chấm điểm (cần key Gemini)">🤖 Phỏng vấn tình huống với AI</button><button class="btn ghost" id="drPrev">← Trước</button><button class="btn ghost" id="drNext">Sau →</button></div></div>
        <div class="dr-q">${o.showQ || S.showA ? esc(x.q) : '<span class="muted">(Đang ẩn chữ — bấm 🔊 để nghe)</span>'}</div>
        ${(o.showQ || S.showA) && x.q_vi ? `<div class="muted">${esc(x.q_vi)}</div>` : ''}
        <div class="row wrap mt">
          <button class="btn primary" id="drPlayQ">🔊 Nghe câu hỏi</button>
          ${S.listening ? '<button class="btn primary" id="drStopMic">⏹ Trả lời xong</button>' : `<button class="btn" id="drMic" ${SR ? '' : 'disabled'}>🎙 Trả lời</button>`}
          <button class="btn" id="drReveal">👁 Xem câu mẫu</button>
          ${S.speaking ? '<button class="btn ghost" id="drStop">■ Dừng đọc</button>' : ''}
        </div>
        ${!SR ? '<div class="note warn mt">Trình duyệt này không nhận giọng nói — vẫn tập được: tự nói to rồi bấm Xem câu mẫu. Dùng Chrome hoặc Edge để có chữ.</div>' : ''}
        ${S.listening || S.heard ? `<div class="mt"><div class="muted">${S.listening ? '🔴 Đang nghe bạn nói (tiếng Anh)…' : 'Bạn đã nói:'}</div><div class="dr-heard" id="drHeard">${esc(S.heard || '…')}</div></div>` : ''}
      </div>
      ${S.showA ? `<div class="card mt">
        <div class="cardhead"><h3>Câu mẫu</h3><div class="row wrap"><button class="btn" id="drPlayA">🔊 Nghe câu mẫu</button><button class="btn" id="drShadow">🗣 Đọc theo từng câu</button></div></div>
        ${sc ? `<div class="note mt">Bạn nói <b>${sc.wc}</b> từ · khớp <b>${sc.pct}%</b> từ khoá${sc.nums.length ? ` · con số: <b>${sc.nHit.length}/${sc.nums.length}</b>` : ''}
          ${sc.nums.length > sc.nHit.length ? `<br>Chưa nói số: ${sc.nums.filter((n) => !sc.nHit.includes(n)).map((n) => `<b>${esc(n)}</b>`).join(', ')}` : ''}
          ${sc.words.length > sc.wHit.length ? `<br><span class="muted">Từ khoá chưa nói: ${sc.words.filter((w) => !sc.wHit.includes(w)).slice(0, 12).map(esc).join(', ')}</span>` : ''}</div>` : ''}
        <ul class="dr-a">${ls.map((l, k) => `<li class="${S.line === k ? 'on' : ''}">${esc(l)}</li>`).join('')}</ul>
        ${x.a_vi ? `<div class="muted mt">🇻🇳 ${esc(x.a_vi)}</div>` : ''}
        <div class="row wrap mt"><button class="btn primary" id="drOk">✓ Thuộc rồi → câu sau</button><button class="btn" id="drAgain">↻ Tập lại sau</button><button class="btn ghost" id="drRetry">🎙 Trả lời lại</button></div>
      </div>` : ''}
      ${settings}
      <p class="muted mt" style="font-size:13px">Phím tắt: <b>Q</b> nghe câu hỏi · <b>R</b> trả lời / xong · <b>A</b> xem câu mẫu · <b>→ ←</b> chuyển câu. Đeo tai nghe để mic không thu lại giọng máy. Muốn AI tự hỏi và chấm cả buổi: tab <b>Phỏng vấn thử với AI</b>, chọn Tiếng Anh.</p>`;
  }
  function go(d) { stopAll(); S.i = (S.i + d + S.list.length) % S.list.length; reset(); paint(); }

  /* ---------- Sự kiện ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('#drillBody button'); if (!t) return;
    const x = cur();
    switch (t.id) {
      case 'drPlayQ': return playQuestion();
      case 'drMic': case 'drRetry': stopAll(); S.stop = false; S.heard = ''; if (t.id === 'drRetry') S.showA = false; return startMic();
      case 'drStopMic': return finishAnswer();
      case 'drReveal': stopMic(); S.showA = true; return paint();
      case 'drStop': return stopAll(), paint();
      case 'drPlayA': return playAnswer();
      case 'drShadow': return shadow();
      case 'drOk': setMark(x.q, 'ok'); return go(1);
      case 'drAgain': setMark(x.q, 'again'); return go(1);
      case 'drPrev': return go(-1);
      case 'drNext': return go(1);
      case 'drGoMock':
        stopAll(); U.store.set('copilot_mock', Object.assign(U.store.get('copilot_mock', {}), { focus: 'scenario', lang: 'en', persona: 'manager', diff: 'real' }));
        return MD.CP.showTab('mock');
      case 'drResetMarks': U.store.set(MKEY, {}); return paint();
    }
  });
  document.addEventListener('change', (e) => {
    const id = e.target.id; if (!/^dr/.test(id)) return;
    if (id === 'drVoice') saveOpts({ voice: e.target.value });
    else if (id === 'drRate') saveOpts({ rate: +e.target.value });
    else if (id === 'drGap') saveOpts({ gap: +e.target.value });
    else if (id === 'drShowQ') saveOpts({ showQ: e.target.checked });
    else if (id === 'drAutoMic') saveOpts({ autoMic: e.target.checked });
    else if (id === 'drOrder' || id === 'drOnlyVt') { saveOpts(id === 'drOrder' ? { order: e.target.value } : { onlyVt: e.target.checked }); stopAll(); build(); }
    paint();
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'drRate') { const s = $('#drRateV'); if (s) s.textContent = e.target.value + 'x'; } });
  document.addEventListener('keydown', (e) => {
    if (!$('#tab-drill.active') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || e.ctrlKey || e.metaKey || e.altKey || !cur()) return;
    const k = e.key.toLowerCase();
    if (k === 'q') playQuestion();
    else if (k === 'r') { if (S.listening) finishAnswer(); else { stopAll(); S.stop = false; S.heard = ''; startMic(); } }
    else if (k === 'a') { stopMic(); S.showA = true; paint(); }
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else return;
    e.preventDefault();
  });
  if (window.speechSynthesis) speechSynthesis.addEventListener('voiceschanged', () => { if ($('#tab-drill.active') && !S.speaking) paint(); });

  MD.Drill = { render: () => { build(); paint(); }, leave: stopAll };
})(window.MD);
