/* Kho hồ sơ trên Google Drive: ô 1 = Hồ sơ gốc (GOC…), ô 2 = Vị trí (VT - …), + ngôn ngữ trả lời */
(function (MD) {
  'use strict';
  const U = MD.U, D = MD.Drive, $ = U.$, esc = U.esc;
  const FOLDER = 'Cris Personal - Hồ sơ';
  const SKEY = 'copilot_kho';
  const st = () => Object.assign({ goc: '', vt: '', gocName: '', vtName: '', at: 0 }, U.store.get(SKEY, {}));
  const save = (o) => U.store.set(SKEY, Object.assign(st(), o));
  let files = { goc: [], vt: [] };

  // Gộp: hồ sơ gốc + gói vị trí. Câu trả lời của vị trí đứng trước (ưu tiên khi khớp).
  function merge(goc, vt) {
    const p = JSON.parse(JSON.stringify(goc.profile || goc));
    if (!vt) { p.role = p.role || ''; return p; }
    p.role = vt.role || vt.name || p.role;
    p.company = vt.company || p.company;
    p.jd = vt.jd || '';
    if (vt.notes) p.experience = (p.experience || '') + '\n\n## GHI CHÚ RIÊNG CHO VỊ TRÍ NÀY\n' + vt.notes;
    if (vt.style) p.style = (p.style || '') + '\n' + vt.style;
    if (vt.terms) p.terms = [p.terms, vt.terms].filter(Boolean).join(', ');
    const seen = new Set();
    p.qa = [].concat(vt.qa || [], p.qa || []).filter((x) => { const k = (x.q || '').trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
    return p;
  }

  const fmtT = (t) => t ? new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';
  const nice = (n) => n.replace(/\.json$/i, '');

  function status(msg, kind) {
    const el = $('#khState'); if (!el) return;
    el.className = 'kh-state ' + (kind || '');
    el.innerHTML = msg;
  }
  function drawSelects() {
    const s = st();
    const opt = (list, cur, none) => (none ? `<option value="">${none}</option>` : '') +
      list.map((f) => `<option value="${esc(f.id)}" ${f.id === cur ? 'selected' : ''}>${esc(nice(f.name))} · ${fmtT(f.modifiedTime)}</option>`).join('');
    $('#khGoc').innerHTML = files.goc.length ? opt(files.goc, s.goc) : '<option value="">(chưa có file GOC…)</option>';
    $('#khVt').innerHTML = opt(files.vt, s.vt, '— Không chọn vị trí (chỉ hồ sơ gốc) —');
  }
  function drawCurrent() {
    const s = st();
    if (!s.at) return status(D.hasToken() ? 'Chọn hồ sơ rồi bấm Tải' : 'Chưa kết nối — đang dùng hồ sơ lưu trên máy này', 'warn');
    status(`✓ Đang dùng: <b>${esc(s.gocName || 'hồ sơ gốc')}</b>${s.vtName ? ' + <b>' + esc(s.vtName) + '</b>' : ''} · tải lúc ${fmtT(s.at)}`, 'ok');
  }

  async function connect() {
    status('Đang kết nối Google Drive…');
    try {
      if (!D.hasToken()) await D.connect('');
      const folder = await D.findFolderAnywhere(FOLDER);
      if (!folder) throw new Error(`Không thấy thư mục “${FOLDER}” trên Drive.`);
      const list = (await D.listFolder(folder.id)).filter((f) => /\.json$/i.test(f.name));
      list.sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''));
      files.goc = list.filter((f) => /^goc\b/i.test(f.name));
      files.vt = list.filter((f) => /^vt\b/i.test(f.name));
      const s = st();
      if (!files.goc.some((f) => f.id === s.goc) && files.goc[0]) save({ goc: files.goc[0].id });
      if (s.vt && !files.vt.some((f) => f.id === s.vt)) save({ vt: '' });
      drawSelects();
      await load();
    } catch (e) {
      const m = /insufficient|scope|403/i.test(e.message) ? 'Thiếu quyền đọc Drive — bấm Kết nối lại và chọn Cho phép.' : e.message;
      status('⚠ ' + esc(m), 'err');
    }
  }

  async function load() {
    const gid = $('#khGoc').value, vid = $('#khVt').value;
    if (!gid) return status('Chưa có hồ sơ gốc trên Drive.', 'err');
    status('Đang tải hồ sơ…');
    try {
      const goc = JSON.parse(await D.readText(gid));
      const vt = vid ? JSON.parse(await D.readText(vid)) : null;
      const p = merge(goc, vt);
      MD.CP.saveProfile(p);
      const g = files.goc.find((f) => f.id === gid), v = files.vt.find((f) => f.id === vid);
      save({ goc: gid, vt: vid, gocName: g ? nice(g.name) : '', vtName: v ? nice(v.name) : '', at: Date.now() });
      drawCurrent();
      U.toast(`Đã tải: ${p.qa.length} câu trả lời chuẩn bị sẵn`, 'ok');
    } catch (e) { status('⚠ Không đọc được file: ' + esc(e.message), 'err'); }
  }

  function mount() {
    const tab = $('#tab-live'); if (!tab || $('#khoCard')) return;
    const el = document.createElement('div');
    el.className = 'card kh'; el.id = 'khoCard';
    const lang = MD.CP.answerLang();
    el.innerHTML = `<div class="kh-row">
        <button class="btn primary" id="khConn">☁ Kết nối Drive</button>
        <label class="kh-f">① Hồ sơ gốc<select id="khGoc"><option value="">(bấm Kết nối Drive)</option></select></label>
        <label class="kh-f">② Vị trí phỏng vấn<select id="khVt"><option value="">— Không chọn vị trí —</option></select></label>
        <label class="kh-f kh-lang">Ngôn ngữ trả lời<select id="khLang">
          <option value="en" ${lang === 'en' ? 'selected' : ''}>🇬🇧 Tiếng Anh</option>
          <option value="vi" ${lang === 'vi' ? 'selected' : ''}>🇻🇳 Tiếng Việt</option>
          <option value="bi" ${lang === 'bi' ? 'selected' : ''}>🇬🇧🇻🇳 Song ngữ</option></select></label>
        <button class="btn" id="khReload" title="Tải lại bản mới nhất từ Drive">↻</button>
      </div><div id="khState" class="kh-state"></div>`;
    tab.prepend(el);
    $('#khConn').onclick = connect;
    $('#khReload').onclick = () => (D.hasToken() ? connect() : connect());
    $('#khGoc').onchange = load;
    $('#khVt').onchange = load;
    $('#khLang').onchange = (e) => { U.store.set('copilot_lang', e.target.value); U.toast('Ngôn ngữ trả lời: ' + e.target.selectedOptions[0].textContent, 'ok'); };
    drawCurrent();
  }

  MD.Kho = { connect, load, merge, mount };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})(window.MD);
