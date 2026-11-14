/* Interview Copilot — Hỏi nhanh: tìm trong câu trả lời đã chuẩn bị, không có thì hỏi Gemini (nhanh) */
(function (MD) {
  'use strict';
  const U = MD.U, AI = MD.AI, $ = U.$, esc = U.esc;
  const STOP = new Set('a an the is are do does did you your we our i me my to of in on for and or what how why when where which who with about can could would will have has be this that it at as from tell us please em chi anh la co khong gi nao the va cua cho voi duoc minh ban'.split(' '));
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
      <button class="btn primary" id="qkAsk">✨ Hỏi AI</button><button class="btn" id="qkClr">Xoá</button></div>
      <div class="muted" id="qkState" style="margin-top:4px"></div>
      <div class="aiout qk-ai" id="qkAI" hidden></div>
      <div id="qkHits"></div>`;
    tab.prepend(el);
    let tm;
    $('#qkIn').addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => showHits($('#qkIn').value), 120); });
    $('#qkIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const q = $('#qkIn').value.trim(); if (q) askAI(q); } });
    $('#qkAsk').onclick = () => { const q = $('#qkIn').value.trim(); if (q) askAI(q); };
    $('#qkClr').onclick = () => { if (ctl) ctl.abort(); $('#qkIn').value = ''; $('#qkHits').innerHTML = ''; $('#qkAI').hidden = true; $('#qkState').textContent = ''; $('#qkIn').focus(); };
  }

  MD.Quick = { match, askAI, mount };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})(window.MD);
