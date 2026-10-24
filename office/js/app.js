/* Warehouse Office — giao diện: văn phòng chibi, task, việc cấp trên, KPI, cài đặt */
(function (MD) {
  'use strict';
  const U = MD.U, S = MD.Store, M = MD.Model, P = MD.Prompts, C = MD.Chibi, FX = MD.FX;
  const $ = U.$, esc = U.esc;

  const A = {
    view: 'office', drawer: null, modal: null, saving: false, dirty: false, syncing: false, savedAt: null,
    lastSync: 0, conflict: false, badFiles: new Set(), showClosed: false,
    filter: { staff: '', status: 'open', q: '' }, kpi: { kind: 'month', ref: new Date() }, tick: 0
  };

  const VIEWS = [
    ['office', 'Văn phòng'], ['tasks', 'Task nhân viên'], ['boss', 'Yêu cầu & Issue'], ['kpi', 'KPI'], ['settings', 'Cài đặt']
  ];
  const GEMINI_URL = 'https://gemini.google.com/app';
  const CLAUDE_URL = 'https://claude.ai/new';

  /* ---------- Lưu ---------- */
  let saveTimer = null;
  function save(now) {
    if (A.conflict) { U.toast('Dữ liệu đang lệch với Drive. Bấm Đồng bộ trước khi sửa tiếp.', 'warn', 6000); return; }
    A.dirty = true; renderSaveState();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, now ? 0 : 700);
  }
  async function doSave() {
    if (A.saving) { saveTimer = setTimeout(doSave, 400); return; }
    A.saving = true; renderSaveState();
    try { await S.saveData(M.data); A.dirty = false; A.savedAt = new Date(); }
    catch (e) { U.toast(e.message, 'error', 8000); if (e.conflict) A.conflict = true; }
    finally { A.saving = false; renderSaveState(); }
  }
  async function flushSave() {
    clearTimeout(saveTimer);
    if (A.dirty && !A.conflict) await doSave();
    while (A.saving) await new Promise((r) => setTimeout(r, 150));
  }

  function renderSaveState() {
    const el = $('#saveState');
    if (!el) return;
    let txt, cls;
    if (!S.connected()) { txt = 'Chế độ thử · chưa lưu lên Drive'; cls = 'demo'; }
    else if (A.conflict) { txt = 'Lệch dữ liệu · bấm Đồng bộ'; cls = 'err'; }
    else if (A.syncing) { txt = 'Đang đồng bộ…'; cls = 'busy'; }
    else if (A.saving || A.dirty) { txt = 'Đang lưu lên Drive…'; cls = 'busy'; }
    else { txt = A.savedAt ? 'Đã lưu ' + A.savedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Đã kết nối Drive'; cls = 'ok'; }
    el.className = 'savestate ' + cls; el.textContent = txt;
  }

  /* ---------- Kết nối & tải dữ liệu ---------- */
  async function startDrive() {
    U.loading(true, 'Đang mở thư mục /DIY/Warehouse trên Drive…');
    try {
      await S.initFolders();
      let d = await S.loadData();
      if (!d) {
        const demo = U.store.get('office_demo', null);
        d = demo && demo.tasks && demo.tasks.length && !demo.isSample && confirm('Chưa có dữ liệu trên Drive. Chuyển dữ liệu bạn đã nhập ở chế độ thử lên Drive?') ? demo : M.blank();
        delete d.isSample;
        M.data = M.normalize(d);
        M.log('Hệ thống', 'Tạo văn phòng mới trên Drive /DIY/Warehouse');
        await S.saveData(M.data);
      } else M.data = M.normalize(d);
      A.conflict = false; A.savedAt = new Date();
      await ensureGuides();
      U.loading(true, 'Đang đọc kết quả Claude…');
      const r = await M.sync();
      if (r.scores || r.boss) { await S.saveData(M.data); U.toast(`Có ${r.scores} điểm mới, ${r.boss} cập nhật việc cấp trên`, 'success'); }
      A.lastSync = Date.now();
    } catch (e) {
      U.toast(e.message, 'error', 9000);
    } finally { U.loading(false); render(); }
  }

  /* ---------- Cổng đăng nhập: bắt buộc Google, chỉ email chủ app ---------- */
  const DEV = ['localhost', '127.0.0.1'].includes(location.hostname);
  function showGate(msg) {
    A.authed = false; A.drawer = null; M.data = M.blank();
    if (A.modal) closeModal();
    $('#view').innerHTML = ''; renderDrawer();
    $('#gate').hidden = false;
    $('#gateMsg').textContent = msg || ''; $('#gateMsg').hidden = !msg;
    $('#gateDemo').hidden = !DEV;
  }
  function hideGate() { $('#gate').hidden = true; }
  const denied = (email) => `Tài khoản ${email} không có quyền dùng app này. Hãy đăng nhập bằng tài khoản Google của chủ app.`;

  async function connect() {
    try {
      await S.connect(A.authed ? '' : 'select_account');
      const v = await S.verifyOwner();
      if (!v.ok) { showGate(denied(v.email)); return; }
      A.authed = true; hideGate();
      await startDrive();
    } catch (e) { if (A.authed) U.toast(e.message, 'error', 9000); else showGate(e.message); }
  }

  async function syncNow(quiet) {
    if (!S.connected()) { if (!quiet) U.toast('Chưa kết nối Drive. Bấm "Kết nối Drive".', 'warn'); return; }
    if (A.syncing) return;
    try {
      if (!A.conflict) await flushSave();
      A.syncing = true; renderSaveState();
      const meta = S.dataFileId ? await S.get(S.dataFileId, 'modifiedTime') : null;
      if (meta && (meta.modifiedTime !== S.dataModified || A.conflict)) {
        M.data = M.normalize(await S.loadData());
        A.conflict = false;
        if (!quiet) U.toast('Đã tải bản mới nhất từ Drive', 'info');
      }
      const r = await M.sync();
      const errs = r.errors.filter((e) => !A.badFiles.has(e));
      errs.forEach((e) => { A.badFiles.add(e); U.toast('Không đọc được file kết quả ' + e, 'warn', 8000); });
      if (r.scores || r.boss) { A.syncing = false; save(true); U.toast(`Đã cập nhật ${r.scores} điểm, ${r.boss} yêu cầu/issue`, 'success'); FX.celebrate(); }
      else if (!quiet) U.toast('Đã đồng bộ. Chưa có kết quả mới từ Claude.', 'info');
      A.lastSync = Date.now();
    } catch (e) { U.toast(e.message, 'error', 8000); }
    finally { A.syncing = false; render(); }
  }

  /* Lưu 2 tài liệu hướng dẫn (Gem, Claude) vào /DIY/Warehouse/Hệ thống */
  async function ensureGuides(force) {
    const docs = M.data.settings.docs || {};
    const put = async (key, name, text) => {
      if (docs[key] && !force) return;
      const blob = new Blob([text], { type: 'text/plain' });
      try {
        const r = await S.upload(blob, name, S.folders.sys.id, { mime: 'text/plain', convertTo: S.MIME.GDOC, fileId: docs[key] && docs[key].id });
        docs[key] = { id: r.id, link: r.webViewLink };
      } catch (e) {
        if (!docs[key]) throw e;
        const r = await S.upload(blob, name, S.folders.sys.id, { mime: 'text/plain', convertTo: S.MIME.GDOC });
        docs[key] = { id: r.id, link: r.webViewLink };
      }
    };
    await put('gem', 'HUONG-DAN-GEM (dán vào Gem trên Gemini)', P.gem());
    await put('claude', 'HUONG-DAN-CLAUDE (quy tắc chấm điểm và chốt việc)', P.claudeGuide());
    if (!M.data.settings.docs || force) { M.data.settings.docs = docs; await S.saveData(M.data); }
    M.data.settings.docs = docs;
  }

  /* ---------- Drive helpers ---------- */
  const EXT_MIME = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
    xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12', csv: 'text/csv',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', pdf: 'application/pdf'
  };
  async function uploadOne(file, folderId, prefix) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const mime = file.type || EXT_MIME[ext] || 'application/octet-stream';
    const name = prefix + file.name;
    const r = await S.upload(file, name, folderId, { mime });
    const out = { id: r.id, name: r.name, link: r.webViewLink };
    /* Tạo thêm bản Google Sheets/Docs để Gemini và Claude đọc chắc chắn được */
    const conv = ['xlsx', 'xls', 'xlsm', 'csv'].includes(ext) ? S.MIME.GSHEET : ['docx', 'doc'].includes(ext) ? S.MIME.GDOC : null;
    if (conv) {
      try {
        const g = await S.upload(file, name.replace(/\.[^.]+$/, '') + ' (bản Google)', folderId, { mime, convertTo: conv });
        out.gid = g.id; out.glink = g.webViewLink;
      } catch (e) { U.toast(`Không tạo được bản Google cho ${file.name}: ${e.message}`, 'warn', 6000); }
    }
    return out;
  }
  async function uploadMany(files, folderId, prefix) {
    const out = [];
    if (!S.connected()) return files.map((f) => ({ id: 'thu-' + U.uid(), name: prefix + f.name }));
    U.loading(true, `Đang tải ${files.length} file lên Drive…`);
    try { for (const f of files) out.push(await uploadOne(f, folderId, prefix)); }
    finally { U.loading(false); }
    return out;
  }
  async function ensureStaffFolder(s) {
    if (s.folderId) return s.folderId;
    const f = await S.ensureFolder(U.safeName(s.name), S.folders.staff.id);
    s.folderId = f.id; return f.id;
  }
  async function ensureTaskFolder(t) {
    if (t.folderId || !S.connected()) return;
    const pid = await ensureStaffFolder(M.staff(t.staffId));
    const f = await S.ensureFolder(U.safeName(`${t.id} ${t.title}`), pid);
    t.folderId = f.id;
  }
  async function ensureBossFolder(c) {
    if (c.folderId || !S.connected()) return;
    const parent = c.source === 'boss' ? S.folders.boss : (S.folders.req || S.folders.boss);
    const f = await S.ensureFolder(U.safeName(`${c.id} ${c.title}`), parent.id);
    c.folderId = f.id;
  }
  async function writeRequestDoc(obj, name, text) {
    if (!S.connected() || !obj.folderId) return;
    try {
      const r = await S.upload(new Blob([text], { type: 'text/plain' }), name, obj.folderId, { mime: 'text/plain', convertTo: S.MIME.GDOC, fileId: obj.reqDocId });
      obj.reqDocId = r.id;
    } catch (e) { U.toast('Không ghi được file yêu cầu: ' + e.message, 'warn'); }
  }

  /* ---------- Khung chung ---------- */
  function renderShell() {
    $('#nav').innerHTML = VIEWS.map(([k, l]) => `<button class="tab ${A.view === k ? 'on' : ''}" data-act="view" data-v="${k}">${l}</button>`).join('');
    const btn = $('#driveBtn');
    if (S.connected()) {
      btn.innerHTML = `<svg><use href="#i-drive"/></svg><span>${esc((S.user && S.user.emailAddress) || 'Đã kết nối')}</span>`;
      btn.dataset.act = 'openRoot'; btn.title = 'Mở /DIY/Warehouse trên Drive';
    } else {
      btn.innerHTML = '<svg><use href="#i-drive"/></svg><span>Kết nối Drive</span>';
      btn.dataset.act = 'connect'; btn.title = 'Đăng nhập Google để lưu mọi thứ lên Drive';
    }
    $('#demoBar').hidden = S.connected();
    renderSaveState();
  }

  function render() {
    if (!A.authed) return;
    renderShell();
    const v = $('#view');
    v.className = 'view v-' + A.view;
    v.innerHTML = ({ office: viewOffice, tasks: viewTasks, boss: viewBoss, kpi: viewKpi, settings: viewSettings })[A.view]();
    renderDrawer();
    if (A.modal && A.modal.kind === 'task') {
      const t = M.data.tasks.find((x) => x.id === A.modal.id);
      if (t) $('#modalBody').innerHTML = `<button class="x" data-act="close" aria-label="Đóng">×</button>${taskCard(t, true)}`;
    }
  }

  /* ---------- Văn phòng ---------- */

  const MOOD_ICON = { idle: '☕', work: '⌨️', late: '❗', wait: '⏳', done: '⭐' };
  function seat(s) {
    const st = M.staffState(s);
    return `<button class="seat k-${s.kind} m-${st.mood}" data-act="openStaff" data-id="${s.id}" title="Mở bàn của ${esc(s.name)}">
      <span class="plate">${esc(s.name)}${s.kind === 'sup' ? ' <small>(Bạn)</small>' : ''}</span>
      <span class="emote">${MOOD_ICON[st.mood] || ''}</span>
      <span class="state">${esc(st.text)}</span>
      ${C.person(s, st.mood)}
      <span class="role">${esc(s.role)}</span>
    </button>`;
  }

  function aiCounts() {
    const grade = M.data.tasks.filter((t) => !t.hidden && t.status === 'da-nop').length;
    const gem = M.data.boss.filter((c) => ['moi', 'gemini'].includes(c.status)).length;
    const chot = M.data.boss.filter((c) => c.status === 'claude').length;
    return { grade, gem, chot };
  }

  function aiSeat() {
    const n = aiCounts();
    return `<button class="seat k-ai" data-act="openAi" title="Bàn AI: Gemini làm nháp, Claude kiểm tra và chốt">
      <span class="plate">Bàn AI</span>
      <span class="state">Gemini ${n.gem} việc · Claude ${n.grade + n.chot} việc</span>
      <span class="duo">${C.robot('gemini', n.gem ? 'work' : 'idle')}${C.robot('claude', n.grade + n.chot ? 'work' : 'idle')}</span>
      <span class="role">Gemini làm nháp · Claude chốt</span>
    </button>`;
  }

  function banner() {
    const open = M.data.tasks.filter((t) => !t.hidden && ['moi', 'dang-lam'].includes(t.status)).length;
    const late = M.data.tasks.filter((t) => !t.hidden && M.overdue(t)).length;
    const n = aiCounts();
    const boss = M.data.boss.filter(M.OPEN).length;
    const p1 = M.data.boss.filter((c) => M.OPEN(c) && c.priority === 'P1').length;
    const busy = open || n.grade || boss;
    const h = new Date().getHours();
    const hello = h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    return `<div class="banner ${busy ? 'busy' : ''} ${late || p1 ? 'late' : ''}">
      <em class="hello">${hello}, ${esc((M.data.staff.find((x) => x.kind === 'sup') || {}).name || 'sếp')} 👋</em>
      <b>${busy ? 'ĐANG LÀM VIỆC' : 'ĐANG NGHỈ'}</b>
      <span>${busy ? `${open} task đang chạy · ${n.grade} bài chờ chấm · ${boss} yêu cầu/issue` : 'Chưa có công việc đang chạy'}</span>
      <small>${p1 ? `🚨 ${p1} việc P1 khẩn` : ''}${p1 && late ? ' · ' : ''}${late ? `⚠ ${late} task trễ hạn` : ''}${!p1 && !late ? (busy ? '✅ Mọi thứ đang trong hạn' : 'Pha cà phê lên ca.') : ''}</small>
    </div>`;
  }

  const IDLE_LINES = ['Rảnh tay, chờ sếp giao việc.', 'Pha cà phê, chuẩn bị chiến.', 'Dọn lại file Excel cho gọn.', 'Kiểm tra lại master data cho chắc.', 'Quạt tay, tiết kiệm điện công ty.'];
  function tickerLines() {
    const out = [];
    M.workers().forEach((s) => {
      const ts = M.data.tasks.filter((t) => t.staffId === s.id && !t.hidden);
      const late = ts.find(M.overdue);
      const sub = ts.find((t) => t.status === 'da-nop');
      const work = ts.find((t) => ['moi', 'dang-lam'].includes(t.status));
      if (late) out.push([s.name, `Task ${late.id} trễ ${M.lateDays(late)} ngày rồi, em đang gấp rút làm.`]);
      else if (sub) out.push([s.name, `Em nộp ${sub.id} rồi, sếp nhờ Claude chấm giúp em nha.`]);
      else if (work) out.push([s.name, `Đang xử lý "${work.title}".`]);
      else out.push([s.name, IDLE_LINES[(s.id.length + A.tick) % IDLE_LINES.length]]);
    });
    M.bosses().forEach((b) => {
      const c = M.data.boss.find((x) => x.source === 'boss' && x.from === b.id && M.OPEN(x));
      if (c) out.push([b.name, `Việc "${c.title}" xong chưa em?`]);
    });
    const n = aiCounts();
    if (n.grade) out.push(['Claude', `Có ${n.grade} bài chờ chấm. Bấm vào Bàn AI để gửi tôi một lượt.`]);
    if (n.gem) out.push(['Gemini', `Tôi có ${n.gem} yêu cầu/issue cần làm nháp.`]);
    M.data.boss.filter((c) => M.OPEN(c) && c.priority === 'P1').forEach((c) => out.unshift(['🚨 P1', `${c.id} ${c.title} (${(M.SOURCES[c.source] || {}).label || ''})`]));
    return out;
  }

  function logPanel() {
    const log = M.data.log.slice(0, 80);
    return `<aside class="logpanel">
      <div class="logh"><span>NHẬT KÝ</span><span class="chip">${M.data.log.length}</span></div>
      <ol>${log.length ? log.map((l, i) => {
        const d = new Date(l.at);
        return `<li><span class="ln">${String(i + 1).padStart(3, '0')}</span><span class="lt">${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span> <b>${esc(l.who)}</b> ${esc(l.text)}</li>`;
      }).join('') : '<li class="muted">Chưa có hoạt động. Bấm vào một nhân viên để giao task.</li>'}</ol>
    </aside>`;
  }

  function fxBar() {
    const b = (k, on, off, title) => `<button class="fxb ${FX.opt[k] ? 'on' : ''}" data-act="fxToggle" data-k="${k}" title="${title}">${FX.opt[k] ? on : off}</button>`;
    return `<div class="fxbar">${b('sound', '🔔 Âm báo', '🔕 Âm báo', 'Bật/tắt âm báo')}${b('typing', '⌨️ Tiếng gõ', '⌨️ Tắt gõ', 'Tiếng gõ phím khi nhân viên đang làm')}${b('music', '🎵 Nhạc', '🎵 Tắt nhạc', 'Nhạc nền nhẹ')}<button class="fxb" data-act="fullscreen" title="Toàn màn hình">⛶</button></div>`;
  }

  function viewOffice() {
    const st = M.data.staff;
    const bosses = st.filter((s) => s.kind === 'boss');
    const sup = st.filter((s) => s.kind === 'sup');
    const leaders = st.filter((s) => s.kind === 'staff' && s.tier === 'leader');
    const clerks = st.filter((s) => s.kind === 'staff' && s.tier !== 'leader');
    const lines = tickerLines();
    const tl = lines.length ? lines[A.tick % lines.length] : null;
    return `<div class="office">
      ${logPanel()}
      <div class="floor">
        <div class="row r-top">${bosses[0] ? seat(bosses[0]) : '<span></span>'}${banner()}${bosses.slice(1).map(seat).join('') || '<span></span>'}</div>
        <div class="row r-mid">${leaders.map(seat).join('')}${sup.map(seat).join('')}${aiSeat()}</div>
        <div class="row r-bot">${clerks.map(seat).join('')}</div>
        <div class="ticker" id="ticker">${tl ? `<b>${esc(tl[0])}</b> ${esc(tl[1])}` : ''}</div>
        <div class="watermark">&lt;/&gt; WAREHOUSE</div>
      </div>
      ${fxBar()}
    </div>`;
  }

  /* ---------- Thẻ task ---------- */
  const pill = (map, st) => `<span class="pill ${(map[st] || {}).cls || ''}">${esc((map[st] || {}).label || st)}</span>`;
  const fileLink = (f) => (f.link ? `<a href="${esc(f.link)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : `<span>${esc(f.name)}</span>`) +
    (f.glink ? ` <a class="gcopy" href="${esc(f.glink)}" target="_blank" rel="noopener">bản Google</a>` : '');

  function scoreBox(t) {
    const fin = M.final(t);
    if (fin == null) return t.rounds.length ? `<div class="score wait">⏳ Chờ Claude chấm lần nộp ${t.rounds.length}</div>` : '';
    const sc = t.score;
    const late = M.lateDays(t);
    const rows = sc ? `
      <div><span>Chất lượng</span><b>${sc.quality}/40</b></div>
      <div><span>Đầy đủ</span><b>${sc.completeness}/30</b></div>
      <div><span>Trình bày</span><b>${sc.presentation}/10</b></div>
      <div><span>Đúng hạn</span><b>${M.ontime(t)}/20</b>${late ? `<em>trễ ${late} ngày</em>` : ''}</div>
      <div><span>Nộp lại</span><b>×${M.factor(t).toFixed(1)}</b><em>${t.rounds.length} lần nộp</em></div>` : '';
    return `<div class="score g-${M.grade(fin)}">
      <div class="total"><b>${fin}</b><span>điểm · loại ${M.grade(fin)}</span>${t.override != null && t.override !== '' ? '<em>Bạn đã sửa điểm</em>' : ''}</div>
      <div class="parts">${rows}</div>
      ${sc && sc.comment ? `<p class="cmt">${esc(sc.comment)}</p>` : ''}
      ${sc && sc.issues && sc.issues.length ? `<ul class="issues">${sc.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${t.overrideNote ? `<p class="cmt"><b>Ghi chú của bạn:</b> ${esc(t.overrideNote)}</p>` : ''}
      ${sc && sc.link ? `<a class="small" href="${esc(sc.link)}" target="_blank" rel="noopener">File chấm của ${esc(sc.reviewer)}</a>` : ''}
    </div>`;
  }

  function taskCard(t, full) {
    const s = M.staff(t.staffId) || { name: '?' };
    const late = M.overdue(t);
    const closed = ['dong', 'huy'].includes(t.status);
    return `<article class="tcard ${late ? 'late' : ''} ${closed ? 'closed' : ''}" data-id="${t.id}">
      <header><b class="tid">${t.id}</b><span class="ttl">${esc(t.title)}</span>${pill(M.STATUS, t.status)}</header>
      <div class="meta">${full ? `<span>👤 ${esc(s.name)}</span>` : ''}<span>Giao ${M.fmt(t.assignedAt)}</span><span class="${late ? 'bad' : ''}">Hạn ${M.fmt(t.due)}${late ? ` · trễ ${M.lateDays(t)} ngày` : ''}</span><span>Độ khó: ${M.DIFF[String(t.difficulty)] || '—'}</span><span>Nộp ${t.rounds.length} lần</span></div>
      ${t.request ? `<p class="req">${esc(t.request)}</p>` : ''}
      ${t.attach.length ? `<div class="files"><span>File giao:</span> ${t.attach.map(fileLink).join(' · ')}</div>` : ''}
      ${t.rounds.map((r, i) => `<div class="files"><span>Lần ${i + 1} (${new Date(r.at).toLocaleDateString('vi-VN')}):</span> ${r.files.map(fileLink).join(' · ')}</div>`).join('')}
      ${scoreBox(t)}
      ${closed ? '' : `<label class="drop" data-drop="${t.id}"><input type="file" multiple data-upload="${t.id}" hidden><span>📎 Kéo file bài nộp vào đây hoặc bấm để chọn file</span></label>`}
      <div class="acts">
        ${t.rounds.length ? `<button class="btn sm primary" data-act="grade" data-id="${t.id}">${t.score ? 'Kiểm tra lại' : 'Nhờ Claude chấm'}</button>` : ''}
        ${t.rounds.length ? `<button class="btn sm" data-act="override" data-id="${t.id}">Sửa điểm</button>` : ''}
        <select class="sel sm" data-change="status" data-id="${t.id}" aria-label="Trạng thái">${Object.keys(M.STATUS).map((k) => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${M.STATUS[k].label}</option>`).join('')}</select>
        ${t.folderId ? `<a class="btn sm ghost" href="${S.folderLink(t.folderId)}" target="_blank" rel="noopener">Thư mục</a>` : ''}
        <button class="btn sm ghost" data-act="editTask" data-id="${t.id}">Sửa</button>
        <button class="btn sm ghost" data-act="hideTask" data-id="${t.id}">${t.hidden ? 'Hiện lại' : 'Xoá'}</button>
      </div>
    </article>`;
  }

  /* ---------- Ngăn kéo (bấm vào bàn) ---------- */
  function kpiChips(s) {
    const m = M.kpi(s.id, M.period('month').from, M.period('month').to);
    const y = M.kpi(s.id, M.period('year').from, M.period('year').to);
    const c = (label, k) => `<div class="kchip g-${k.grade}"><span>${label}</span><b>${k.avg == null ? '—' : k.avg}</b><em>${k.n} task · loại ${k.grade}</em></div>`;
    return `<div class="kchips">${c('KPI tháng này', m)}${c('KPI năm nay', y)}<div class="kchip"><span>Đang mở</span><b>${m.open}</b><em>${m.overdue} trễ hạn</em></div></div>`;
  }

  function drawerHead(s, sub) {
    const st = M.staffState(s);
    return `<div class="dhead"><div class="dav">${C.person(s, st.mood)}</div><div><h2>${esc(s.name)}</h2><p>${esc(s.role)}${s.duty ? ' · ' + esc(s.duty) : ''}</p>${sub || ''}<button class="btn sm ghost" data-act="editStaff" data-id="${s.id}">✎ Sửa thông tin</button></div><button class="x" data-act="closeDrawer" aria-label="Đóng">×</button></div>`;
  }

  const DTABS = [['task', 'Task'], ['routine', 'Việc định kỳ'], ['issue', 'Issue'], ['eval', 'Đánh giá'], ['profile', 'Hồ sơ']];
  function drawerWorker(s) {
    const tab = A.dtab || 'task';
    const nIssue = M.data.boss.filter((c) => c.staffRef === s.id).length;
    const tabs = `<div class="dtabs">${DTABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="dtab" data-k="${k}">${l}${k === 'routine' ? ` <i>${s.routines.length}</i>` : k === 'issue' ? ` <i>${nIssue}</i>` : ''}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'task') {
      const ts = M.data.tasks.filter((t) => t.staffId === s.id && !t.hidden && (A.showClosed || !['dong', 'huy'].includes(t.status)))
        .sort((a, b) => (a.status === 'da-cham') - (b.status === 'da-cham') || String(a.due || '9').localeCompare(String(b.due || '9')));
      body = `<div class="dbar"><button class="btn primary" data-act="newTask" data-id="${s.id}">+ Giao task</button>
        <label class="chk"><input type="checkbox" data-change="showClosed" ${A.showClosed ? 'checked' : ''}> Hiện task đã đóng</label></div>
        <div class="tlist">${ts.length ? ts.map((t) => taskCard(t)).join('') : '<p class="empty">Chưa có task nào. Bấm "+ Giao task" khi có việc cần giao.</p>'}</div>`;
    } else if (tab === 'routine') {
      const dm = M.routineDailyMin(s);
      body = `<p class="muted small">Việc lặp lại hằng ngày/tuần/tháng của ${esc(s.name)}. App dùng phần này để tính khối lượng công việc và đánh giá định biên.</p>
        <div class="rlist">${s.routines.length ? s.routines.map((r) => `<div class="ritem"><div><b>${esc(r.name)}</b>${r.note ? `<p class="small muted">${esc(r.note)}</p>` : ''}</div><span class="pill">${(M.FREQ[r.freq] || M.FREQ.ngay).label}</span><span class="mono">${r.minutes} phút</span><button class="btn sm ghost" data-act="editRoutine" data-id="${s.id}" data-r="${r.id}">Sửa</button><button class="btn sm ghost" data-act="delRoutine" data-id="${s.id}" data-r="${r.id}" aria-label="Xoá">✕</button></div>`).join('') : '<p class="empty">Chưa có việc định kỳ nào.</p>'}</div>
        <div class="rsum">Tổng việc định kỳ ≈ <b>${(dm / 60).toFixed(1)} giờ/ngày</b> (${Math.round(dm / 60 / (Number(M.data.settings.hoursPerDay) || 7.5) * 100)}% công suất một ngày)</div>
        <div class="acts"><button class="btn primary" data-act="addRoutine" data-id="${s.id}">+ Thêm việc định kỳ</button><button class="btn ghost" data-act="pasteRoutines" data-id="${s.id}">Dán nhiều dòng</button></div>`;
    } else if (tab === 'issue') {
      const cs = M.data.boss.filter((c) => c.staffRef === s.id).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
      body = `<p class="muted small">Issue liên quan đến ${esc(s.name)} (sai sót, trễ hạn, quá tải…). Thông tin riêng tư, không đưa vào báo cáo gửi phòng ban khác.</p>
        <div class="dbar"><button class="btn primary" data-act="newItem" data-src="staff" data-kind="issue" data-staff="${s.id}">+ Ghi nhận issue</button></div>
        <div class="tlist">${cs.length ? cs.map(bossCard).join('') : '<p class="empty">Chưa có issue nào.</p>'}</div>`;
    } else if (tab === 'eval') {
      body = evalBox(s);
    } else {
      body = profileBox(s);
    }
    return drawerHead(s) + kpiChips(s) + tabs + body;
  }

  function loadBar(w) {
    const pct = Math.round(w.load * 100);
    return `<div class="lbar t-${w.tone}"><span style="width:${Math.min(100, pct)}%"></span><b>${w.enough ? pct + '%' : '—'}</b></div>`;
  }
  function evalBox(s) {
    const pm = M.period('month', A.kpi.ref), w = M.workload(s, pm.from, pm.to);
    return `<div class="evalbox t-${w.tone}">
      <div class="ehead"><span>${pm.label}</span><b>${w.verdict}</b></div>
      ${loadBar(w)}
      <div class="parts"><div><span>Việc định kỳ</span><b>${w.routineH.toFixed(0)} h</b></div><div><span>Task phát sinh</span><b>${w.adhocH.toFixed(0)} h</b><em class="muted">${w.tasks} task</em></div><div><span>Công suất</span><b>${w.cap.toFixed(0)} h</b></div><div><span>KPI tháng</span><b>${w.kpi.avg == null ? '—' : w.kpi.avg}</b></div></div>
      <p class="cmt">💡 ${esc(w.advice)}</p>
      <p class="small muted">Gợi ý tự động dựa trên giờ ước tính, chỉ để tham khảo. Quyết định tuyển thêm hay cắt giảm cần trao đổi thực tế. Xem cả nhóm ở trang KPI › Định biên.</p>
    </div>`;
  }
  function profileBox(s) {
    const row = (l, v) => (v ? `<div><span>${l}</span><b>${esc(v)}</b></div>` : '');
    const rows = row('Họ tên', s.name) + row('Chức danh', s.role) + row('Phụ trách', s.duty) + row('Email', s.email) + row('Điện thoại', s.phone) +
      row('Ngày vào làm', s.startDate ? M.fmt(s.startDate) : '') + row('Kỹ năng / ghi chú', s.notes);
    return `<div class="profile">${rows}</div>
      <div class="acts"><button class="btn" data-act="editStaff" data-id="${s.id}">✎ Sửa hồ sơ</button></div>`;
  }

  function drawerBossPerson(s) {
    const cs = M.data.boss.filter((c) => c.source === 'boss' && c.from === s.id).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
    const tab = A.dtab === 'profile' ? 'profile' : 'task';
    return drawerHead(s) + `<div class="dtabs"><button class="${tab === 'task' ? 'on' : ''}" data-act="dtab" data-k="task">Việc giao</button><button class="${tab === 'profile' ? 'on' : ''}" data-act="dtab" data-k="profile">Hồ sơ</button></div>` +
      (tab === 'profile' ? profileBox(s) : `<div class="dbar"><button class="btn primary" data-act="newItem" data-src="boss" data-boss="${s.id}">+ Thêm việc ${esc(s.name)} giao</button></div>
      <div class="tlist">${cs.length ? cs.map(bossCard).join('') : '<p class="empty">Chưa có việc nào từ cấp trên này.</p>'}</div>`);
  }

  function drawerSup(s) {
    const n = aiCounts();
    const notes = (M.data.notes || []).slice(0, 30);
    const openBoss = M.data.boss.filter(M.OPEN).sort((a, b) => a.priority.localeCompare(b.priority) || String(a.due || '9').localeCompare(String(b.due || '9')));
    return drawerHead(s, '<p class="muted">Bàn làm việc: soạn yêu cầu, gửi Gemini làm, gửi Claude soát và chốt.</p>') + `
      <div class="composer">
        <textarea id="supText" rows="5" placeholder="Bạn cần xử lý việc gì? VD: Tổng hợp chênh lệch cycle count tuần 43 từ file trong thư mục ..., đề xuất nguyên nhân và hướng xử lý."></textarea>
        <details><summary>Dán kết quả Gemini để Claude soát (tuỳ chọn)</summary><textarea id="supGem" rows="5" placeholder="Dán câu trả lời của Gemini vào đây, Claude sẽ kiểm tra và sửa lỗi."></textarea></details>
        <div class="acts">
          <button class="btn primary" data-act="supSend" data-target="gemini">Gửi Gemini làm</button>
          <button class="btn claude" data-act="supSend" data-target="claude">Gửi Claude kiểm tra</button>
          <button class="btn ghost" data-act="supToBoss">Lưu thành yêu cầu/issue</button>
        </div>
      </div>
      <div class="dsec"><h3>Cần bạn xử lý</h3>
        <div class="todo">
          <button class="todoi" data-act="gradeAll" ${n.grade ? '' : 'disabled'}><b>${n.grade}</b> bài nhân viên chờ chấm <span>Gửi Claude chấm hết →</span></button>
          ${openBoss.map((c) => `<button class="todoi" data-act="view" data-v="boss"><span class="prio ${M.PRIO[c.priority].cls}">${c.priority}</span><b>${c.id}</b> ${(M.SOURCES[c.source] || {}).icon || ''} ${esc(c.title)} <span>${pill(M.BOSS_STATUS, c.status)}</span></button>`).join('')}
        </div>
      </div>
      <div class="dsec"><h3>Lịch sử yêu cầu</h3>
        <div class="chat">${notes.length ? notes.map((x) => `<div class="msg"><div class="mh"><b>${x.target === 'gemini' ? 'Gửi Gemini' : 'Gửi Claude'}</b><span>${new Date(x.at).toLocaleString('vi-VN')}</span></div><p>${esc(x.text)}</p><button class="btn sm ghost" data-act="reuseNote" data-i="${M.data.notes.indexOf(x)}">Dùng lại</button></div>`).join('') : '<p class="empty">Chưa có yêu cầu nào.</p>'}</div>
      </div>`;
  }

  function renderDrawer() {
    const el = $('#drawer');
    const s = A.drawer && M.staff(A.drawer);
    if (!s) { el.classList.remove('open'); el.innerHTML = ''; $('#scrim').hidden = true; return; }
    const keep = $('#supText') ? { a: $('#supText').value, b: ($('#supGem') || {}).value } : null;
    const scroll = el.scrollTop;
    el.innerHTML = s.kind === 'sup' ? drawerSup(s) : s.kind === 'boss' ? drawerBossPerson(s) : drawerWorker(s);
    if (keep && $('#supText')) { $('#supText').value = keep.a; if ($('#supGem')) $('#supGem').value = keep.b || ''; }
    el.scrollTop = scroll;
    el.classList.add('open'); $('#scrim').hidden = false;
  }

  /* ---------- Modal ---------- */
  function modal(html, kind, id) {
    A.modal = { kind: kind || 'html', id };
    $('#modalBody').innerHTML = `<button class="x" data-act="close" aria-label="Đóng">×</button>${html}`;
    $('#modal').hidden = false;
    const f = $('#modalBody input:not([type=file]), #modalBody textarea');
    if (f && kind !== 'task') setTimeout(() => f.focus(), 30);
  }
  function closeModal() { A.modal = null; $('#modal').hidden = true; $('#modalBody').innerHTML = ''; }

  function promptModal(title, text, target, note) {
    const name = target === 'gemini' ? 'Gemini' : 'Claude';
    modal(`<h3>${esc(title)}</h3>
      <p class="muted">${note || (target === 'gemini'
        ? 'Câu lệnh đã soạn sẵn. Bấm nút để copy và mở Gem của bạn, rồi dán (Ctrl+V) vào ô chat.'
        : 'Dán vào Claude Code (app Claude) hoặc claude.ai, nhớ bật kết nối Google Drive. Claude tạo file kết quả xong thì quay lại đây, app sẽ tự đồng bộ.')}</p>
      <textarea id="promptText" class="mono" rows="16">${esc(text)}</textarea>
      <div class="acts end"><button class="btn" data-act="copyOnly">Chỉ copy</button><button class="btn ${target === 'gemini' ? 'primary' : 'claude'}" data-act="copyOpen" data-target="${target}">Copy & mở ${name}</button></div>`);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    }
  }

  /* ---------- Task: tạo / sửa ---------- */
  function taskForm(t, staffId) {
    const edit = !!t;
    t = t || { staffId: staffId || (M.workers()[0] || {}).id, difficulty: 1.5, assignedAt: M.iso(U.today()), due: '' };
    modal(`<h3>${edit ? 'Sửa task ' + t.id : 'Giao task mới'}</h3>
      <div class="form">
        <label>Nhân viên<select id="fStaff">${M.workers().map((s) => `<option value="${s.id}" ${s.id === t.staffId ? 'selected' : ''}>${esc(s.name)} · ${esc(s.role)}</option>`).join('')}</select></label>
        <label>Tên task<input id="fTitle" value="${esc(t.title || '')}" placeholder="VD: Đối soát tồn kho tuần 43"></label>
        <label class="full">Yêu cầu chi tiết <small>(Claude chấm dựa trên phần này, nên ghi rõ đầu ra và tiêu chí đạt)</small>
          <textarea id="fReq" rows="7" placeholder="Đầu vào: ...&#10;Đầu ra cần nộp: ...&#10;Tiêu chí đạt: ...">${esc(t.request || '')}</textarea></label>
        <label>Độ khó<select id="fDiff">${Object.keys(M.DIFF).map((k) => `<option value="${k}" ${String(t.difficulty) === k ? 'selected' : ''}>${M.DIFF[k]} (hệ số ${k})</option>`).join('')}</select></label>
        <label>Ngày giao<input type="date" id="fAssigned" value="${esc(t.assignedAt || '')}"></label>
        <label>Hạn chót<input type="date" id="fDue" value="${esc(t.due || '')}"></label>
        <label>Giờ ước tính <small>(để trống: theo độ khó)</small><input type="number" id="fHours" min="0" step="0.5" value="${esc(t.hours || '')}" placeholder="Dễ 2 · Vừa 4 · Khó 8"></label>
        ${edit ? '' : '<label class="full">File giao kèm (tuỳ chọn)<input type="file" id="fFiles" multiple></label>'}
      </div>
      <div class="acts end"><button class="btn" data-act="close">Huỷ</button><button class="btn primary" data-act="saveTask" data-id="${edit ? t.id : ''}">${edit ? 'Lưu thay đổi' : 'Giao task'}</button></div>`);
  }

  const reqText = (t) => `YÊU CẦU ${t.id}: ${t.title}\nNgày giao: ${M.fmt(t.assignedAt)} · Hạn chót: ${M.fmt(t.due)} · Độ khó: ${M.DIFF[String(t.difficulty)]}\n\n${t.request || ''}`;

  async function saveTask(id) {
    const title = $('#fTitle').value.trim();
    if (!title) { U.toast('Nhập tên task', 'warn'); return; }
    const vals = { staffId: $('#fStaff').value, title, request: $('#fReq').value.trim(), difficulty: Number($('#fDiff').value), assignedAt: $('#fAssigned').value, due: $('#fDue').value, hours: Number($('#fHours').value) || null };
    try {
      if (id) {
        const t = M.data.tasks.find((x) => x.id === id);
        const moved = t.staffId !== vals.staffId;
        Object.assign(t, vals);
        if (moved) t.folderId = null;
        await ensureTaskFolder(t);
        await writeRequestDoc(t, `yeu-cau-${t.id}`, reqText(t));
        M.log('Bạn', `Sửa ${t.id}`);
      } else {
        const t = Object.assign({ id: M.nextId('T'), status: 'moi', rounds: [], attach: [], seen: [], history: [], createdAt: new Date().toISOString() }, vals);
        M.data.tasks.push(t);
        const files = Array.from(($('#fFiles') || {}).files || []);
        U.loading(true, 'Đang tạo thư mục task trên Drive…');
        try {
          await ensureTaskFolder(t);
          await writeRequestDoc(t, `yeu-cau-${t.id}`, reqText(t));
        } finally { U.loading(false); }
        if (files.length) t.attach = await uploadMany(files, t.folderId, 'giao-');
        M.log('Bạn', `Giao ${t.id} "${t.title}" cho ${M.staff(t.staffId).name}, hạn ${M.fmt(t.due)}`);
      }
      save(); closeModal(); render();
    } catch (e) { U.toast(e.message, 'error', 8000); save(); render(); }
  }

  async function submitFiles(id, files) {
    const t = M.data.tasks.find((x) => x.id === id);
    if (!t || !files.length) return;
    try {
      await ensureTaskFolder(t);
      const round = { at: new Date().toISOString(), files: await uploadMany(files, t.folderId, `nop-lan${t.rounds.length + 1}-`) };
      t.rounds.push(round);
      t.status = 'da-nop';
      M.log(M.staff(t.staffId).name, `Nộp ${t.id} lần ${t.rounds.length} (${files.length} file)`);
      save(); render();
      U.toast(`Đã nhận bài nộp ${t.id}. Bấm "Nhờ Claude chấm" để chấm điểm.`, 'success');
    } catch (e) { U.toast(e.message, 'error', 8000); }
  }

  function overrideForm(t) {
    modal(`<h3>Sửa điểm ${t.id}</h3>
      <p class="muted">Điểm do Claude chấm và app tính: <b>${t.score ? Math.round((M.aiPoints(t.score) + M.ontime(t)) * M.factor(t)) : '—'}</b>. Nhập điểm cuối của bạn (0–100), để trống để dùng lại điểm tự tính.</p>
      <div class="form"><label>Điểm cuối<input id="fOv" type="number" min="0" max="100" value="${t.override != null ? esc(t.override) : ''}"></label>
      <label class="full">Ghi chú lý do<textarea id="fOvNote" rows="3">${esc(t.overrideNote || '')}</textarea></label></div>
      <div class="acts end"><button class="btn" data-act="close">Huỷ</button><button class="btn primary" data-act="saveOverride" data-id="${t.id}">Lưu điểm</button></div>`);
  }

  /* ---------- Yêu cầu & Issue (cấp trên, phòng ban, nhà cung cấp, kho, nhân viên) ---------- */
  const srcTag = (c) => { const x = M.SOURCES[c.source] || M.SOURCES.boss; return `<span class="src" style="--c:${x.color}">${x.icon} ${x.label}</span>`; };
  const prioTag = (c) => `<span class="prio ${(M.PRIO[c.priority] || M.PRIO.P3).cls}">${c.priority}</span>`;

  function bossCard(c) {
    const late = !['gui', 'huy', 'chot', 'cho'].includes(c.status) && M.day(c.due) && U.today() > M.day(c.due);
    const st = c.status;
    const issue = c.kind === 'issue';
    const who = M.requester(c);
    const esc2 = c.escalate ? (M.staff(c.escalate) || {}).name : '';
    const last = c.source === 'boss' ? '3. Gửi cấp trên' : issue ? '3. Đóng issue' : '3. Trả lời người yêu cầu';
    return `<article class="tcard boss k-${c.source} ${issue ? 'issue' : ''} ${late ? 'late' : ''} ${['gui', 'huy'].includes(st) ? 'closed' : ''}" style="--c:${(M.SOURCES[c.source] || M.SOURCES.boss).color}">
      <header>${prioTag(c)}<b class="tid">${c.id}</b><span class="ttl">${issue ? '🐞 ' : ''}${esc(c.title)}</span>${pill(M.BOSS_STATUS, st)}</header>
      <div class="meta">${srcTag(c)}${who ? `<span>Từ ${esc(who)}</span>` : ''}<span>Nhận ${M.fmt(c.receivedAt)}</span><span class="${late ? 'bad' : ''}">Hạn ${M.fmt(c.due)}${late ? ' · quá hạn' : ''}</span>${esc2 ? `<span>📣 Báo ${esc(esc2)}</span>` : ''}</div>
      ${c.refs ? `<div class="files"><span>Mã liên quan:</span> <span class="mono">${esc(c.refs)}</span></div>` : ''}
      ${c.content ? `<p class="req">${esc(c.content)}</p>` : ''}
      ${issue && (c.scope || c.cause || c.temp || c.fix) ? `<div class="iss">${c.scope ? `<div><span>Phạm vi</span>${esc(c.scope)}</div>` : ''}${c.cause ? `<div><span>Nguyên nhân</span>${esc(c.cause)}</div>` : ''}${c.temp ? `<div><span>Xử lý tạm</span>${esc(c.temp)}</div>` : ''}${c.fix ? `<div><span>Khắc phục</span>${esc(c.fix)}</div>` : ''}</div>` : ''}
      ${c.files.length ? `<div class="files"><span>File:</span> ${c.files.map(fileLink).join(' · ')}</div>` : ''}
      ${c.draft ? `<div class="files"><span>Bản nháp Gemini:</span> <a href="${esc(c.draft.link)}" target="_blank" rel="noopener">${esc(c.draft.name)}</a></div>` : ''}
      ${c.result ? `<div class="files ok"><span>Claude đã chốt:</span> <a href="${esc(c.result.link)}" target="_blank" rel="noopener">${esc(c.result.name)}</a></div>` : ''}
      <div class="flow">
        <span class="${['gemini', 'claude', 'chot', 'cho', 'gui'].includes(st) ? 'done' : 'now'}">1. Gemini làm</span>
        <span class="${['chot', 'cho', 'gui'].includes(st) ? 'done' : st === 'claude' ? 'now' : ''}">2. Claude chốt</span>
        <span class="${st === 'gui' ? 'done' : ['chot', 'cho'].includes(st) ? 'now' : ''}">${last}</span>
      </div>
      <div class="acts">
        <button class="btn sm primary" data-act="bossGemini" data-id="${c.id}">Gửi Gemini</button>
        ${st === 'gemini' || st === 'moi' ? `<button class="btn sm" data-act="bossStatus" data-st="claude" data-id="${c.id}">Gemini xong</button>` : ''}
        <button class="btn sm claude" data-act="bossClaude" data-id="${c.id}">Nhờ Claude chốt</button>
        ${M.OPEN(c) && st !== 'cho' && c.source !== 'boss' ? `<button class="btn sm" data-act="bossStatus" data-st="cho" data-id="${c.id}">Chờ phản hồi</button>` : ''}
        ${M.OPEN(c) ? `<button class="btn sm ok" data-act="bossStatus" data-st="gui" data-id="${c.id}">${c.source === 'boss' ? 'Đã gửi cấp trên' : 'Xong'}</button>` : ''}
        ${c.folderId ? `<a class="btn sm ghost" href="${S.folderLink(c.folderId)}" target="_blank" rel="noopener">Thư mục</a>` : ''}
        <button class="btn sm ghost" data-act="editBoss" data-id="${c.id}">Sửa</button>
        ${st === 'huy' || st === 'gui' ? `<button class="btn sm ghost" data-act="bossStatus" data-st="moi" data-id="${c.id}">Mở lại</button>` : `<button class="btn sm ghost" data-act="bossStatus" data-st="huy" data-id="${c.id}">Hủy</button>`}
      </div>
    </article>`;
  }

  /* opt: { source, kind, from (boss id), staffRef } khi tạo mới */
  function bossForm(c, opt) {
    const edit = !!c;
    opt = opt || {};
    c = c || { source: opt.source || 'boss', kind: opt.kind || 'request', from: opt.from || (M.bosses()[0] || {}).id, staffRef: opt.staffRef || (M.workers()[0] || {}).id, receivedAt: M.iso(U.today()), priority: 'P3' };
    const o = (v, l, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`;
    modal(`<h3>${edit ? 'Sửa ' + c.id : 'Thêm yêu cầu / issue'}</h3>
      <div class="seg wide" id="bKindSeg"><button class="${c.kind !== 'issue' ? 'on' : ''}" data-act="bKind" data-k="request">📝 Yêu cầu / việc được giao</button><button class="${c.kind === 'issue' ? 'on' : ''}" data-act="bKind" data-k="issue">🐞 Issue / sự cố</button></div>
      <input type="hidden" id="bKind" value="${c.kind}">
      <div class="form">
        <label>Nguồn<select id="bSource" data-bf="source">${Object.keys(M.SOURCES).map((k) => o(k, M.SOURCES[k].icon + ' ' + M.SOURCES[k].label, c.source)).join('')}</select></label>
        <label class="bf bf-boss">Cấp trên giao<select id="bFrom">${M.bosses().map((b) => o(b.id, esc(b.name) + ' · ' + esc(b.role), c.from)).join('')}</select></label>
        <label class="bf bf-staff">Nhân viên liên quan<select id="bStaff">${M.workers().map((w) => o(w.id, esc(w.name), c.staffRef)).join('')}</select></label>
        <label class="bf bf-other">Người / bên yêu cầu<input id="bReq" value="${esc(c.requester || '')}" placeholder="VD: Finance – chị Lan, NCC ABC, Ca đêm kho B"></label>
        <label>Ưu tiên<select id="bPrio" data-bf="prio">${Object.keys(M.PRIO).map((k) => o(k, M.PRIO[k].label, c.priority)).join('')}</select></label>
        <label class="full">Tiêu đề<input id="bTitle" value="${esc(c.title || '')}" placeholder="VD: Lệch tồn 12 SKU kho A sau cycle count"></label>
        <label class="full">Nội dung<textarea id="bContent" rows="5">${esc(c.content || '')}</textarea></label>
        <label class="full bf bf-issue">Phạm vi / số liệu<input id="bScope" value="${esc(c.scope || '')}" placeholder="VD: 12 SKU, chênh 340 thùng, 3 location"></label>
        <label class="bf bf-issue">Nguyên nhân (nếu biết)<input id="bCause" value="${esc(c.cause || '')}"></label>
        <label class="bf bf-issue">Xử lý tạm đã làm<input id="bTemp" value="${esc(c.temp || '')}"></label>
        <label class="bf bf-issue">Khắc phục lâu dài<input id="bFix" value="${esc(c.fix || '')}"></label>
        <label>Mã liên quan<input id="bRefs" value="${esc(c.refs || '')}" placeholder="PO / ASN / GRN / SKU"></label>
        <label>Ngày nhận<input type="date" id="bRecv" value="${esc(c.receivedAt || '')}"></label>
        <label>Hạn chót <small>(trống: theo ưu tiên)</small><input type="date" id="bDue" value="${esc(c.due || '')}"></label>
        <label>Cần báo cáo cấp trên<select id="bEsc"><option value="">Không</option>${M.bosses().map((b) => o(b.id, esc(b.name), c.escalate)).join('')}</select></label>
        <label class="full">File liên quan${edit ? ' (thêm file mới)' : ''}<input type="file" id="bFiles" multiple></label>
      </div>
      <div class="acts end"><button class="btn" data-act="close">Huỷ</button><button class="btn primary" data-act="saveBoss" data-id="${edit ? c.id : ''}">${edit ? 'Lưu' : 'Thêm'}</button></div>`);
    bossFormSync();
  }
  function bossFormSync() {
    const src = $('#bSource').value, kind = $('#bKind').value;
    U.$$('#modalBody .bf').forEach((el) => { el.hidden = true; });
    U.$$('#modalBody .bf-' + (src === 'boss' ? 'boss' : src === 'staff' ? 'staff' : 'other')).forEach((el) => { el.hidden = false; });
    if (kind === 'issue') U.$$('#modalBody .bf-issue').forEach((el) => { el.hidden = false; });
  }

  const bossReqText = (c) => `${c.kind === 'issue' ? 'ISSUE' : 'YÊU CẦU'} ${c.id}: ${c.title}\nNguồn: ${(M.SOURCES[c.source] || {}).label} · Từ: ${M.requester(c)} · Ưu tiên: ${c.priority}\nNhận: ${M.fmt(c.receivedAt)} · Hạn: ${M.fmt(c.due)}${c.refs ? '\nMã liên quan: ' + c.refs : ''}\n\n${c.content || ''}` +
    (c.kind === 'issue' ? `\n\nPhạm vi: ${c.scope || ''}\nNguyên nhân: ${c.cause || ''}\nXử lý tạm: ${c.temp || ''}\nKhắc phục: ${c.fix || ''}` : '');

  const defaultDue = (recv, prio) => {
    const d = M.day(recv) || U.today();
    return M.iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + ((M.PRIO[prio] || M.PRIO.P3).days)));
  };

  async function createBoss(vals, files) {
    const c = Object.assign({ status: 'moi', files: [], seen: [], createdAt: new Date().toISOString() }, vals);
    c.source = c.source || 'boss'; c.kind = c.kind || 'request'; c.priority = c.priority || 'P3';
    if (!c.due) c.due = defaultDue(c.receivedAt, c.priority);
    c.id = M.nextId(M.itemPrefix(c));
    M.data.boss.push(c);
    await ensureBossFolder(c);
    await writeRequestDoc(c, `yeu-cau-${c.id}`, bossReqText(c));
    if (files && files.length) c.files = await uploadMany(files, c.folderId, '');
    M.log('Bạn', `Nhận ${c.id} "${c.title}" (${(M.SOURCES[c.source] || {}).label}${M.requester(c) ? ' · ' + M.requester(c) : ''}, ${c.priority})`);
    FX.sound('notify');
    return c;
  }

  async function saveBoss(id) {
    const title = $('#bTitle').value.trim();
    if (!title) { U.toast('Nhập tiêu đề', 'warn'); return; }
    const source = $('#bSource').value, kind = $('#bKind').value;
    const vals = {
      source, kind, title, content: $('#bContent').value.trim(), receivedAt: $('#bRecv').value, due: $('#bDue').value, priority: $('#bPrio').value,
      from: source === 'boss' ? $('#bFrom').value : null, staffRef: source === 'staff' ? $('#bStaff').value : null,
      requester: source === 'boss' || source === 'staff' ? '' : $('#bReq').value.trim(), refs: $('#bRefs').value.trim(), escalate: $('#bEsc').value || null,
      scope: kind === 'issue' ? $('#bScope').value.trim() : '', cause: kind === 'issue' ? $('#bCause').value.trim() : '',
      temp: kind === 'issue' ? $('#bTemp').value.trim() : '', fix: kind === 'issue' ? $('#bFix').value.trim() : ''
    };
    const files = Array.from($('#bFiles').files || []);
    U.loading(true, 'Đang lưu lên Drive…');
    try {
      if (id) {
        const c = M.data.boss.find((x) => x.id === id);
        if (!vals.due) vals.due = defaultDue(vals.receivedAt, vals.priority);
        Object.assign(c, vals);
        await ensureBossFolder(c);
        await writeRequestDoc(c, `yeu-cau-${c.id}`, bossReqText(c));
        U.loading(false);
        if (files.length) c.files = c.files.concat(await uploadMany(files, c.folderId, ''));
      } else { U.loading(false); await createBoss(vals, files); }
      save(); closeModal(); render();
    } catch (e) { U.toast(e.message, 'error', 8000); save(); render(); }
    finally { U.loading(false); }
  }

  /* Sheet nhập tay việc cấp trên */
  const SHEET_HEAD = ['Ngày nhận (dd/mm/yyyy)', 'Người giao', 'Tiêu đề', 'Nội dung', 'Hạn chót (dd/mm/yyyy)', 'Ưu tiên (P1–P4)', 'Ghi chú'];
  async function bossSheet() {
    if (!S.connected()) { U.toast('Cần kết nối Drive', 'warn'); return; }
    let sh = M.data.settings.bossSheet;
    if (!sh) {
      const csv = M.toCsv([SHEET_HEAD, [M.fmt(M.iso(U.today())), (M.bosses()[0] || {}).name || '', 'Ví dụ: Báo cáo tồn kho tháng', 'Xoá dòng ví dụ này rồi điền việc thật', '', 'P3', '']]);
      const r = await S.upload(new Blob([csv], { type: 'text/csv' }), 'Viec-cap-tren (nhap tay)', S.folders.boss.id, { mime: 'text/csv', convertTo: S.MIME.GSHEET });
      sh = M.data.settings.bossSheet = { id: r.id, link: r.webViewLink };
      save();
    }
    window.open(sh.link, '_blank', 'noopener');
  }

  async function importBossSheet() {
    const sh = M.data.settings.bossSheet;
    if (!sh) { U.toast('Chưa có Sheet nhập tay. Bấm "Mở Sheet nhập tay" để tạo.', 'warn'); return; }
    U.loading(true, 'Đang đọc Sheet…');
    try {
      const rows = M.parseCsv(await S.readText(sh.id, S.MIME.GSHEET));
      let added = 0;
      for (const r of rows.slice(1)) {
        const [recv, from, title, content, due, prio] = r.map((x) => String(x || '').trim());
        if (!title && !content) continue;
        if (/^Ví dụ/i.test(title)) continue;
        const key = [recv, from, title, content].join('|');
        if (M.data.imported.includes(key)) continue;
        const boss = M.bosses().find((b) => from && U.key(b.name) === U.key(from)) || M.bosses().find((b) => from && U.key(b.name).includes(U.key(from))) || M.bosses()[0];
        const rd = U.toDate(recv), dd = U.toDate(due);
        const pr = /^P[1-4]/i.test(prio) ? prio.slice(0, 2).toUpperCase() : ({ 'gấp': 'P1', 'cao': 'P2', 'thấp': 'P4' })[String(prio).toLowerCase()] || 'P3';
        await createBoss({ source: 'boss', from: boss.id, title: title || content.slice(0, 60), content, receivedAt: rd ? M.iso(rd) : M.iso(U.today()), due: dd ? M.iso(dd) : '', priority: pr });
        M.data.imported.push(key);
        added++;
      }
      save(); render();
      U.toast(added ? `Đã nhập ${added} việc mới từ Sheet` : 'Không có dòng mới trong Sheet', added ? 'success' : 'info');
    } catch (e) { U.toast(e.message, 'error', 8000); }
    finally { U.loading(false); }
  }

  /* ---------- Các trang ---------- */
  function viewTasks() {
    const f = A.filter;
    const q = U.key(f.q);
    const list = M.data.tasks.filter((t) => (!f.staff || t.staffId === f.staff) &&
      (f.status === 'all' ? !t.hidden : f.status === 'hidden' ? t.hidden : f.status === 'open' ? !t.hidden && !['dong', 'huy'].includes(t.status) : !t.hidden && t.status === f.status) &&
      (!q || U.key(t.id + ' ' + t.title + ' ' + t.request).includes(q)))
      .sort((a, b) => b.id.localeCompare(a.id));
    return `<div class="page">
      <div class="phead"><h1>Task nhân viên</h1><button class="btn primary" data-act="newTask">+ Giao task</button></div>
      <div class="filters">
        <select class="sel" data-change="fStaff"><option value="">Tất cả nhân viên</option>${M.workers().map((s) => `<option value="${s.id}" ${f.staff === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <select class="sel" data-change="fStatus">${[['open', 'Đang mở'], ['all', 'Tất cả'], ...Object.keys(M.STATUS).map((k) => [k, M.STATUS[k].label]), ['hidden', 'Đã xoá']].map(([k, l]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="inp" data-change="fQ" placeholder="Tìm mã, tên task…" value="${esc(f.q)}">
        ${M.data.tasks.some((t) => !t.hidden && t.status === 'da-nop') ? '<button class="btn claude" data-act="gradeAll">Gửi Claude chấm tất cả bài chờ</button>' : ''}
      </div>
      <div class="tablewrap"><table class="tbl">
        <thead><tr><th>Mã</th><th>Nhân viên</th><th>Task</th><th>Giao</th><th>Hạn</th><th>Trạng thái</th><th class="r">Nộp</th><th class="r">Điểm</th><th>Loại</th></tr></thead>
        <tbody>${list.length ? list.map((t) => {
          const fin = M.final(t);
          return `<tr data-act="openTask" data-id="${t.id}" class="${M.overdue(t) ? 'late' : ''}"><td class="mono">${t.id}</td><td>${esc((M.staff(t.staffId) || {}).name || '')}</td><td>${esc(t.title)}</td><td>${M.fmt(t.assignedAt)}</td><td>${M.fmt(t.due)}${M.overdue(t) ? ' ⚠' : ''}</td><td>${pill(M.STATUS, t.status)}</td><td class="r">${t.rounds.length}</td><td class="r"><b>${fin == null ? '—' : fin}</b></td><td><span class="grade g-${M.grade(fin)}">${M.grade(fin)}</span></td></tr>`;
        }).join('') : '<tr><td colspan="9" class="empty">Không có task phù hợp.</td></tr>'}</tbody>
      </table></div>
    </div>`;
  }

  function viewBoss() {
    const f = A.bf || (A.bf = { src: '', kind: '', st: 'open' });
    const list = M.data.boss.filter((c) => (!f.src || c.source === f.src) && (!f.kind || c.kind === f.kind) &&
      (f.st === 'all' || (f.st === 'open' ? M.OPEN(c) : !M.OPEN(c))))
      .sort((a, b) => (!M.OPEN(a) - !M.OPEN(b)) || a.priority.localeCompare(b.priority) || String(a.due || '9').localeCompare(String(b.due || '9')));
    const open = M.data.boss.filter(M.OPEN);
    const chip = (k, label, n) => `<button class="schip ${f.src === k ? 'on' : ''}" data-act="bfSrc" data-k="${k}" ${k ? `style="--c:${M.SOURCES[k].color}"` : ''}>${label} <b>${n}</b></button>`;
    return `<div class="page">
      <div class="phead"><h1>Yêu cầu & Issue</h1><div class="acts">
        <button class="btn ghost" data-act="bossSheet">Sheet nhập tay (cấp trên)</button>
        <button class="btn ghost" data-act="importBoss">Nhập từ Sheet</button>
        <button class="btn" data-act="newItem" data-kind="issue">🐞 Ghi nhận issue</button>
        <button class="btn primary" data-act="newItem">+ Thêm yêu cầu</button></div></div>
      <div class="schips">${chip('', 'Tất cả nguồn', open.length)}${Object.keys(M.SOURCES).map((k) => chip(k, M.SOURCES[k].icon + ' ' + M.SOURCES[k].label, open.filter((c) => c.source === k).length)).join('')}</div>
      <div class="filters">
        <div class="seg"><button class="${!f.kind ? 'on' : ''}" data-act="bfKind" data-k="">Tất cả</button><button class="${f.kind === 'request' ? 'on' : ''}" data-act="bfKind" data-k="request">Yêu cầu</button><button class="${f.kind === 'issue' ? 'on' : ''}" data-act="bfKind" data-k="issue">Issue</button></div>
        <div class="seg"><button class="${f.st === 'open' ? 'on' : ''}" data-act="bfSt" data-k="open">Đang mở</button><button class="${f.st === 'done' ? 'on' : ''}" data-act="bfSt" data-k="done">Đã xong</button><button class="${f.st === 'all' ? 'on' : ''}" data-act="bfSt" data-k="all">Tất cả</button></div>
        <span class="muted small">P1 khẩn: phản hồi 1 giờ · P2: trong ngày · P3: 1 ngày · P4: khi rảnh</span>
      </div>
      <div class="cards">${list.length ? list.map(bossCard).join('') : '<p class="empty">Không có mục nào. Bấm "+ Thêm yêu cầu" hoặc "Ghi nhận issue".</p>'}</div>
    </div>`;
  }

  function viewKpi() {
    const p = M.period(A.kpi.kind, A.kpi.ref);
    const rows = M.workers().map((s) => ({ s, k: M.kpi(s.id, p.from, p.to) }));
    const team = M.kpi('', p.from, p.to);
    const tasks = team.tasks.slice().sort((a, b) => a.staffId.localeCompare(b.staffId) || a.id.localeCompare(b.id));
    return `<div class="page">
      <div class="phead"><h1>KPI nhân viên</h1><div class="acts">
        <button class="btn ghost" data-act="kpiCsv">Tải CSV</button>
        <button class="btn primary" data-act="kpiSheet">Xuất Google Sheet vào Reports</button></div></div>
      <div class="filters">
        <div class="seg"><button class="${A.kpi.kind === 'month' ? 'on' : ''}" data-act="kpiKind" data-k="month">Tháng</button><button class="${A.kpi.kind === 'year' ? 'on' : ''}" data-act="kpiKind" data-k="year">Năm</button></div>
        <button class="btn sm ghost" data-act="kpiMove" data-d="-1">‹</button><b class="plabel">${p.label}</b><button class="btn sm ghost" data-act="kpiMove" data-d="1">›</button>
      </div>
      <div class="kgrid">${rows.map(({ s, k }) => `<div class="kcard g-${k.grade}">
        <div class="kav">${C.person(s, k.grade === 'A' ? 'done' : 'idle')}</div>
        <div><h3>${esc(s.name)}</h3><p class="muted">${esc(s.role)}</p>
        <div class="kbig"><b>${k.avg == null ? '—' : k.avg}</b><span class="grade g-${k.grade}">${k.grade}</span></div>
        <p class="kmeta">${k.n} task đã chấm · đúng hạn ${k.ontimeRate == null ? '—' : U.pct(k.ontimeRate, 0)} · ${k.assigned} task giao trong kỳ</p></div></div>`).join('')}
        <div class="kcard team"><div><h3>Cả nhóm</h3><div class="kbig"><b>${team.avg == null ? '—' : team.avg}</b><span class="grade g-${team.grade}">${team.grade}</span></div><p class="kmeta">${team.n} task đã chấm · ${team.open} đang mở · ${team.overdue} trễ hạn</p></div></div>
      </div>
      <p class="muted small">Điểm TB có hệ số độ khó (Dễ 1 · Vừa 1.5 · Khó 2), tính theo ngày nộp lần đầu. Xếp loại: A ≥ 85 · B ≥ 70 · C ≥ 50 · D &lt; 50.</p>
      ${staffingSection(p)}
      <h2 class="h2">Chi tiết task đã chấm</h2>
      <div class="tablewrap"><table class="tbl">
        <thead><tr><th>Mã</th><th>Nhân viên</th><th>Task</th><th>Độ khó</th><th class="r">Chất lượng</th><th class="r">Đầy đủ</th><th class="r">Trình bày</th><th class="r">Đúng hạn</th><th class="r">Nộp lại</th><th class="r">Điểm</th><th>Loại</th></tr></thead>
        <tbody>${tasks.length ? tasks.map((t) => `<tr data-act="openTask" data-id="${t.id}"><td class="mono">${t.id}</td><td>${esc(M.staff(t.staffId).name)}</td><td>${esc(t.title)}</td><td>${M.DIFF[String(t.difficulty)]}</td>
          <td class="r">${t.score ? t.score.quality : '—'}</td><td class="r">${t.score ? t.score.completeness : '—'}</td><td class="r">${t.score ? t.score.presentation : '—'}</td><td class="r">${M.ontime(t)}</td><td class="r">×${M.factor(t).toFixed(1)}</td><td class="r"><b>${M.final(t)}</b></td><td><span class="grade g-${M.grade(M.final(t))}">${M.grade(M.final(t))}</span></td></tr>`).join('') : '<tr><td colspan="11" class="empty">Chưa có task nào được chấm trong kỳ này.</td></tr>'}</tbody>
      </table></div>
    </div>`;
  }

  function staffingSection(p) {
    const team = M.team(p.from, p.to);
    return `<section class="staffing">
      <div class="phead"><h2 class="h2">Khối lượng công việc & định biên <small>${p.label}</small></h2>
        <button class="btn claude" data-act="staffingClaude">Nhờ Claude phân tích định biên</button></div>
      <div class="verdict t-${team.tone}">${team.tone === 'over' ? '📈' : team.tone === 'low' ? '📉' : team.tone === 'ok' ? '✅' : 'ℹ️'} ${esc(team.verdict)}</div>
      <div class="tablewrap"><table class="tbl">
        <thead><tr><th>Nhân viên</th><th class="r">Việc định kỳ</th><th class="r">Task phát sinh</th><th class="r">Tổng giờ</th><th style="min-width:160px">Tải</th><th>Đánh giá</th><th>Gợi ý</th></tr></thead>
        <tbody>${team.rows.map(({ s, w }) => `<tr><td><b>${esc(s.name)}</b><br><span class="small muted">${esc(s.role)}</span></td><td class="r">${w.routineH.toFixed(0)} h<br><span class="small muted">${s.routines.length} việc</span></td><td class="r">${w.adhocH.toFixed(0)} h<br><span class="small muted">${w.tasks} task</span></td><td class="r"><b>${w.totalH.toFixed(0)}</b> / ${w.cap.toFixed(0)} h</td><td>${loadBar(w)}</td><td><span class="vtag t-${w.tone}">${w.verdict}</span></td><td class="small">${esc(w.advice)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="capset">Công suất: <input class="inp sm" type="number" step="0.5" min="1" max="12" data-change="hoursPerDay" value="${esc(M.data.settings.hoursPerDay)}"> giờ hiệu quả/ngày × <input class="inp sm" type="number" min="15" max="31" data-change="daysPerMonth" value="${esc(M.data.settings.daysPerMonth)}"> ngày/tháng · Thiếu việc &lt; 50% · Phù hợp 50–85% · Đầy tải 85–105% · Quá tải &gt; 105%</div>
      <p class="small muted">Đây là gợi ý dựa trên giờ ước tính của việc định kỳ và task, không phải kết luận nhân sự. Trước khi tuyển thêm hay cắt giảm, hãy kiểm chứng bằng quan sát thực tế và trao đổi với nhân viên.</p>
    </section>`;
  }

  function kpiRows() {
    const p = M.period(A.kpi.kind, A.kpi.ref);
    const out = [[`KPI ${p.label}`], ['Nhân viên', 'Vai trò', 'Số task đã chấm', 'Điểm TB (có hệ số)', 'Xếp loại', 'Tỷ lệ đúng hạn', 'Task đang mở', 'Task trễ hạn']];
    M.workers().forEach((s) => {
      const k = M.kpi(s.id, p.from, p.to);
      out.push([s.name, s.role, k.n, k.avg == null ? '' : k.avg, k.grade, k.ontimeRate == null ? '' : Math.round(k.ontimeRate * 100) + '%', k.open, k.overdue]);
    });
    out.push([], ['Mã', 'Nhân viên', 'Task', 'Độ khó', 'Ngày giao', 'Hạn chót', 'Ngày nộp đầu', 'Số lần nộp', 'Chất lượng /40', 'Đầy đủ /30', 'Trình bày /10', 'Đúng hạn /20', 'Hệ số nộp lại', 'Điểm cuối', 'Xếp loại', 'Nhận xét']);
    M.kpi('', p.from, p.to).tasks.forEach((t) => {
      out.push([t.id, M.staff(t.staffId).name, t.title, M.DIFF[String(t.difficulty)], M.fmt(t.assignedAt), M.fmt(t.due), U.fmtDate(M.kpiDay(t)), t.rounds.length,
        t.score ? t.score.quality : '', t.score ? t.score.completeness : '', t.score ? t.score.presentation : '', M.ontime(t), M.factor(t).toFixed(1), M.final(t), M.grade(M.final(t)), t.overrideNote || (t.score ? t.score.comment : '')]);
    });
    return { rows: out, label: p.label };
  }


  function viewSettings() {
    const d = M.data.settings.docs || {};
    const KIND = { boss: 'Cấp trên', sup: 'Supervisor (bạn)', staff: 'Nhân viên' };
    return `<div class="page settings">
      <div class="phead"><h1>Cài đặt</h1></div>
      <section class="card">
        <h2>1. Google Drive <small>bắt buộc, mọi dữ liệu nằm ở đây</small></h2>
        ${S.connected()
          ? `<p>Đã kết nối: <b>${esc((S.user && S.user.emailAddress) || '')}</b>. Thư mục: <a href="${S.folderLink(S.folders.root.id)}" target="_blank" rel="noopener">/DIY/Warehouse</a>.</p>
             <div class="acts"><button class="btn ghost" data-act="syncNow">Đồng bộ ngay</button><button class="btn ghost" data-act="disconnect">Ngắt kết nối</button></div>`
          : `<p>Chưa kết nối. App đang ở <b>chế độ thử</b>, dữ liệu chỉ nằm trong trình duyệt này.</p><div class="acts"><button class="btn primary" data-act="connect">Kết nối Drive</button></div>`}
        <details><summary>Cấu trúc thư mục trên Drive</summary><pre class="mono">/DIY/Warehouse/
  data/          office.json (dữ liệu app) + bản sao lưu mỗi ngày
  Cấp trên/      mỗi việc 1 thư mục C-xxx + Sheet nhập tay
  Nhân viên/     &lt;tên&gt;/T-xxx …/  yêu cầu, file nộp, file chấm điểm
  Reports/       KPI xuất ra Google Sheet
  Hệ thống/      hướng dẫn cho Gem và Claude</pre></details>
        <details><summary>Lần đầu báo lỗi quyền? (thêm quyền Drive cho OAuth Client)</summary>
          <ol class="steps"><li>Mở <a href="https://console.cloud.google.com/auth/scopes" target="_blank" rel="noopener">Google Cloud › Google Auth Platform › Data Access</a>, chọn project đang dùng cho Master Data Pro.</li>
          <li>Bấm <b>Add or remove scopes</b>, tick <code>.../auth/drive</code> (See, edit, create, and delete all of your Google Drive files), lưu lại.</li>
          <li>Ở mục <b>Audience</b>, kiểm tra email của bạn có trong <b>Test users</b>.</li>
          <li>Quay lại đây bấm Kết nối Drive. Google sẽ cảnh báo "ứng dụng chưa được xác minh": bấm <b>Nâng cao › Tiếp tục</b>, rồi tick ô cho phép Drive.</li></ol></details>
        <label class="inline">Google OAuth Client ID <input class="inp" data-change="clientId" value="${esc(S.clientId())}"></label>
      </section>

      <section class="card">
        <h2>2. Nhân sự</h2>
        <p class="muted small">Thứ tự cấp bậc: Cấp trên (Manager, Senior Sup) › Supervisor (bạn) › Leader › Clerk. Bấm "Sửa" để đổi họ tên, chức danh, phụ trách, giới tính và nhân vật.</p>
        <div class="staffed">${M.data.staff.map((s) => `<div class="srow">
          <div class="sav">${C.person(s, 'idle')}</div>
          <div><b>${esc(s.name)}</b><span class="muted small"> · ${KIND[s.kind]}${s.kind === 'staff' ? (s.tier === 'leader' ? ' (Leader)' : ' (Clerk)') : ''} · ${s.gender === 'nu' ? 'Nữ' : 'Nam'}</span><br><span class="small">${esc(s.role)}${s.duty ? ' · ' + esc(s.duty) : ''}</span></div>
          <div class="acts"><button class="btn sm" data-act="editStaff" data-id="${s.id}">Sửa</button>${s.kind === 'staff' ? `<button class="btn sm ghost" data-act="delStaff" data-id="${s.id}" title="Xoá nhân viên">Xoá</button>` : ''}</div>
        </div>`).join('')}</div>
        <div class="acts"><button class="btn ghost" data-act="addStaff">+ Thêm nhân viên</button><button class="btn" data-act="exportCtx">📤 Xuất bối cảnh nhân sự cho Claude/Gemini</button></div>
        <p class="small muted">Nút xuất tạo file .md gồm cơ cấu, chức danh, phụ trách, việc định kỳ (không gồm email, số điện thoại) và lưu một bản Google Doc vào /DIY/Warehouse/Hệ thống để Claude đọc qua Drive. Tải file .md lên phần Context của project Claude hoặc Knowledge của Gem mỗi khi nhân sự thay đổi.</p>
      </section>

      <section class="card">
        <h2>3. Gemini (Gem "Warehouse Supervisor")</h2>
        <ol class="steps">
          <li>Mở <a href="https://gemini.google.com/gems/create" target="_blank" rel="noopener">gemini.google.com › Gem manager › New Gem</a>, đặt tên <b>Warehouse Supervisor</b>.</li>
          <li>Chọn model mạnh nhất có trong danh sách (Argon / Pro), không chọn bản Flash.</li>
          <li>Dán hướng dẫn bên dưới vào ô <b>Instructions</b>, lưu Gem.</li>
          <li>Mở Gem vừa tạo, copy đường link trên thanh địa chỉ, dán vào ô bên dưới để nút "Gửi Gemini" mở đúng Gem.</li></ol>
        <label class="inline">Link Gem <input class="inp" data-change="gemUrl" value="${esc(M.data.settings.gemUrl || '')}" placeholder="https://gemini.google.com/gem/..."></label>
        <textarea class="mono" rows="10" readonly id="gemText">${esc(P.gem())}</textarea>
        <div class="acts"><button class="btn" data-act="copyEl" data-el="gemText">Copy hướng dẫn Gem</button>${d.gem ? `<a class="btn ghost" href="${esc(d.gem.link)}" target="_blank" rel="noopener">Bản trên Drive</a>` : ''}</div>
      </section>

      <section class="card">
        <h2>4. Claude (kiểm tra, chấm điểm, chốt)</h2>
        <ol class="steps">
          <li>Dùng <b>app Claude</b> (Claude Code) hoặc <b>claude.ai</b>, đăng nhập tài khoản Claude của bạn.</li>
          <li>Bật kết nối <b>Google Drive</b> (Cài đặt › Connectors) với Gmail chứa thư mục /DIY.</li>
          <li>Trong app này, bấm "Nhờ Claude chấm" hoặc "Nhờ Claude chốt" để copy câu lệnh, dán vào Claude. Claude đọc file và tạo file kết quả trong Drive, app tự cập nhật điểm khi bạn quay lại tab.</li></ol>
        <textarea class="mono" rows="10" readonly id="claudeText">${esc(P.claudeGuide())}</textarea>
        <div class="acts"><button class="btn" data-act="copyEl" data-el="claudeText">Copy hướng dẫn Claude</button>${d.claude ? `<a class="btn ghost" href="${esc(d.claude.link)}" target="_blank" rel="noopener">Bản trên Drive</a>` : ''}
        ${S.connected() ? '<button class="btn ghost" data-act="rewriteGuides">Ghi lại 2 hướng dẫn lên Drive</button>' : ''}</div>
      </section>

      <section class="card">
        <h2>5. Quy tắc chấm điểm</h2>
        <ul class="rules"><li>Claude chấm: Chất lượng/độ chính xác <b>40</b> · Đầy đủ so với yêu cầu <b>30</b> · Trình bày <b>10</b>.</li>
        <li>App tự tính Đúng hạn <b>20</b>: trừ 5 điểm mỗi ngày nộp trễ (tính lần nộp đầu).</li>
        <li>Nộp lại: mỗi lần nộp lại trừ <b>10%</b> tổng điểm. Bạn luôn sửa được điểm cuối.</li>
        <li>KPI: trung bình có hệ số độ khó (Dễ 1 · Vừa 1.5 · Khó 2). A ≥ 85 · B ≥ 70 · C ≥ 50 · D &lt; 50. Xoá task chỉ là ẩn, không mất lịch sử.</li></ul>
      </section>

      <section class="card">
        <h2>6. Dữ liệu</h2>
        <div class="acts"><button class="btn ghost" data-act="exportJson">Tải bản sao lưu (JSON)</button>
        ${S.connected() ? '' : '<button class="btn ghost" data-act="resetDemo">Xoá dữ liệu thử</button>'}</div>
      </section>
    </div>`;
  }

  /* ---------- Sửa thông tin nhân sự ---------- */
  function staffForm(s) {
    const edit = !!s;
    const d = s || { kind: 'staff', tier: 'clerk', name: '', role: 'Data Clerk', duty: '', gender: 'nam', look: 'm-short' };
    const p = C.resolve(d);
    const opt = (v, l, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`;
    modal(`<h3>${edit ? 'Sửa thông tin: ' + esc(d.name) : 'Thêm nhân viên'}</h3>
      <div class="sform">
        <div class="spv" id="sfPreview">${C.person(d, 'work')}</div>
        <div class="form">
          <label>Họ tên<input id="sfName" value="${esc(d.name)}" placeholder="VD: Nguyễn Văn A"></label>
          <label>Chức danh<input id="sfRole" value="${esc(d.role)}" placeholder="VD: Senior Supervisor"></label>
          <label class="full">Phụ trách<input id="sfDuty" value="${esc(d.duty || '')}" placeholder="VD: Master data SKU và location"></label>
          <label>Email<input id="sfEmail" type="email" value="${esc(d.email || '')}"></label>
          <label>Điện thoại<input id="sfPhone" value="${esc(d.phone || '')}"></label>
          <label>Ngày vào làm<input id="sfStart" type="date" value="${esc(d.startDate || '')}"></label>
          <label class="full">Kỹ năng / ghi chú<textarea id="sfNotes" rows="2" placeholder="VD: Giỏi Excel/Power Query, đang học SQL; cần kèm thêm phần ASN">${esc(d.notes || '')}</textarea></label>
          <label>Giới tính<select id="sfGender" data-sf="gender">${opt('nam', 'Nam', d.gender)}${opt('nu', 'Nữ', d.gender)}</select></label>
          ${d.kind === 'staff'
            ? `<label>Cấp<select id="sfTier">${opt('clerk', 'Clerk', d.tier)}${opt('leader', 'Leader', d.tier)}</select></label>`
            : `<label>Cấp<input value="${d.kind === 'boss' ? 'Cấp trên' : 'Supervisor (bạn)'}" disabled></label>`}
          <label>Nhân vật<select id="sfLook" data-sf="look"></select></label>
          <label>Màu tóc<input type="color" id="sfHair" data-sf="color" value="${p.hair}" data-custom="${d.hairColor ? 1 : ''}"></label>
          <label>Màu áo<input type="color" id="sfShirt" data-sf="color" value="${p.shirt}" data-custom="${d.shirtColor ? 1 : ''}"></label>
          <label>Màu da<input type="color" id="sfSkin" data-sf="color" value="${p.skin}" data-custom="${d.skinColor ? 1 : ''}"></label>
        </div>
      </div>
      <div class="acts end"><button class="btn ghost" data-act="resetColors">Màu mặc định</button><button class="btn" data-act="close">Huỷ</button><button class="btn primary" data-act="saveStaff" data-id="${edit ? d.id : ''}">${edit ? 'Lưu' : 'Thêm nhân viên'}</button></div>`);
    staffLooks(false, C.presetKey(d.look));
  }

  const COLOR_FIELDS = [['sfHair', 'hairColor', 'hair'], ['sfShirt', 'shirtColor', 'shirt'], ['sfSkin', 'skinColor', 'skin']];
  function staffDraft() {
    const d = { gender: $('#sfGender').value, look: $('#sfLook').value };
    COLOR_FIELDS.forEach(([id, k]) => { if ($('#' + id).dataset.custom) d[k] = $('#' + id).value; });
    return d;
  }
  function staffPreview() {
    const base = C.resolve({ gender: $('#sfGender').value, look: $('#sfLook').value });
    COLOR_FIELDS.forEach(([id, , pk]) => { if (!$('#' + id).dataset.custom) $('#' + id).value = base[pk]; });
    $('#sfPreview').innerHTML = C.person(staffDraft(), 'work');
  }
  function staffLooks(_, cur) {
    const sel = $('#sfLook');
    const keep = cur || sel.value;
    const keys = C.keysFor($('#sfGender').value);
    sel.innerHTML = keys.map((k) => `<option value="${k}" ${k === keep ? 'selected' : ''}>${C.PRESETS[k].label}</option>`).join('');
    if (!keys.includes(keep)) sel.value = keys[0];
    staffPreview();
  }
  async function saveStaff(id) {
    const name = $('#sfName').value.trim();
    if (!name) { U.toast('Nhập họ tên', 'warn'); return; }
    const d = staffDraft();
    const vals = { name, role: $('#sfRole').value.trim(), duty: $('#sfDuty').value.trim(), gender: d.gender, look: d.look,
      email: $('#sfEmail').value.trim(), phone: $('#sfPhone').value.trim(), startDate: $('#sfStart').value, notes: $('#sfNotes').value.trim(),
      hairColor: d.hairColor || null, shirtColor: d.shirtColor || null, skinColor: d.skinColor || null };
    if ($('#sfTier')) vals.tier = $('#sfTier').value;
    if (id) {
      const s = M.staff(id);
      const renamed = s.name !== name;
      Object.assign(s, vals);
      if (renamed && s.folderId && S.connected()) S.rename(s.folderId, U.safeName(name)).catch((e) => U.toast('Không đổi được tên thư mục: ' + e.message, 'warn'));
      M.log('Bạn', `Cập nhật thông tin ${name}`);
    } else {
      M.data.staff.push(Object.assign({ id: 's' + U.uid(), kind: 'staff' }, vals));
      M.log('Bạn', `Thêm nhân viên ${name}`);
    }
    save(); closeModal(); render();
  }

  /* ---------- Việc định kỳ (daily task) ---------- */
  function routineForm(s, r) {
    const edit = !!r;
    r = r || { name: '', freq: 'ngay', minutes: 60, note: '' };
    modal(`<h3>${edit ? 'Sửa' : 'Thêm'} việc định kỳ · ${esc(s.name)}</h3>
      <div class="form">
        <label class="full">Tên việc<input id="rName" value="${esc(r.name)}" placeholder="VD: Đối soát tồn WMS với thực tế"></label>
        <label>Tần suất<select id="rFreq">${Object.keys(M.FREQ).map((k) => `<option value="${k}" ${k === r.freq ? 'selected' : ''}>${M.FREQ[k].label}</option>`).join('')}</select></label>
        <label>Thời gian mỗi lần (phút)<input id="rMin" type="number" min="1" step="5" value="${esc(r.minutes)}"></label>
        <label class="full">Ghi chú (đầu vào, đầu ra, công cụ)<input id="rNote" value="${esc(r.note || '')}"></label>
      </div>
      <div class="acts end"><button class="btn" data-act="close">Huỷ</button><button class="btn primary" data-act="saveRoutine" data-id="${s.id}" data-r="${edit ? r.id : ''}">Lưu</button></div>`);
  }
  function saveRoutine(sid, rid) {
    const s = M.staff(sid);
    const v = { name: $('#rName').value.trim(), freq: $('#rFreq').value, minutes: Math.max(1, Math.round(Number($('#rMin').value) || 0)), note: $('#rNote').value.trim() };
    if (!v.name) { U.toast('Nhập tên việc', 'warn'); return; }
    if (rid) Object.assign(s.routines.find((x) => x.id === rid), v);
    else s.routines.push(Object.assign({ id: U.uid() }, v));
    M.log('Bạn', `${rid ? 'Sửa' : 'Thêm'} việc định kỳ của ${s.name}: ${v.name}`);
    save(); closeModal(); renderDrawer();
  }
  function pasteForm(s) {
    modal(`<h3>Dán nhiều việc định kỳ · ${esc(s.name)}</h3>
      <p class="muted">Mỗi dòng một việc theo dạng <code>Tên việc | tần suất | số phút</code>. Tần suất: ngày, tuần hoặc tháng. Có thể copy thẳng 3 cột từ Excel (ngăn bằng Tab).</p>
      <textarea id="rPaste" class="mono" rows="10" placeholder="Đối soát tồn WMS | ngày | 120&#10;Báo cáo KPI tuần | tuần | 180&#10;Báo cáo tồn tháng | tháng | 480"></textarea>
      <div class="acts end"><button class="btn" data-act="close">Huỷ</button><button class="btn primary" data-act="savePaste" data-id="${s.id}">Thêm vào danh sách</button></div>`);
  }
  function savePaste(sid) {
    const s = M.staff(sid);
    let n = 0;
    $('#rPaste').value.split(/\r?\n/).forEach((line) => {
      const parts = line.split(/\t|\|/).map((x) => x.trim()).filter(Boolean);
      if (!parts.length) return;
      const f = U.key(parts[1] || 'ngay');
      const freq = /thang|month/.test(f) ? 'thang' : /tuan|week/.test(f) ? 'tuan' : 'ngay';
      const minutes = Math.max(1, Math.round(Number(String(parts[2] || parts[1] || '').replace(/[^\d.]/g, '')) || 30));
      s.routines.push({ id: U.uid(), name: parts[0], freq, minutes, note: '' });
      n++;
    });
    if (!n) { U.toast('Chưa có dòng nào hợp lệ', 'warn'); return; }
    M.log('Bạn', `Thêm ${n} việc định kỳ cho ${s.name}`);
    save(); closeModal(); renderDrawer();
    U.toast(`Đã thêm ${n} việc định kỳ`, 'success');
  }

  /* ---------- Xuất bối cảnh nhân sự (.md) cho Claude/Gemini ---------- */
  function contextMd() {
    const kindName = (s) => (s.kind === 'boss' ? 'Cấp trên' : s.kind === 'sup' ? 'Supervisor (người dùng)' : s.tier === 'leader' ? 'Leader' : 'Clerk');
    const lines = [`# Bối cảnh nhân sự (xuất từ Warehouse Office, ${U.fmtDate(new Date())})`, '',
      'Thông tin nội bộ, dùng làm bối cảnh khi xử lý yêu cầu, chấm bài và đánh giá công việc.', '',
      '## Cơ cấu', '', '| Cấp | Họ tên | Chức danh | Phụ trách | Ngày vào làm |', '|---|---|---|---|---|'];
    M.data.staff.forEach((s) => lines.push(`| ${kindName(s)} | ${s.name} | ${s.role || ''} | ${s.duty || ''} | ${s.startDate ? M.fmt(s.startDate) : ''} |`));
    lines.push('', 'Báo cáo mặc định gửi cấp trên trực tiếp; việc lớn (chi phí, khách hàng lớn, sự cố) báo thêm cấp cao hơn.', '', '## Việc định kỳ và kỹ năng', '');
    M.workers().forEach((s) => {
      lines.push(`### ${s.name} (${s.role || kindName(s)})`);
      if (s.notes) lines.push(`Kỹ năng / ghi chú: ${s.notes}`);
      if (s.routines.length) s.routines.forEach((r) => lines.push(`- ${r.name}: ${(M.FREQ[r.freq] || M.FREQ.ngay).label.toLowerCase()}, ${r.minutes} phút/lần${r.note ? ` (${r.note})` : ''}`));
      else lines.push('- (chưa nhập việc định kỳ)');
      lines.push(`- Tổng việc định kỳ ≈ ${(M.routineDailyMin(s) / 60).toFixed(1)} giờ/ngày`, '');
    });
    lines.push('## Công suất chuẩn', '', `${M.data.settings.hoursPerDay} giờ làm hiệu quả/ngày × ${M.data.settings.daysPerMonth} ngày/tháng = ${M.capacity()} giờ/người/tháng.`, '');
    return lines.join('\n');
  }
  async function exportContext() {
    const md = contextMd();
    U.download(new Blob([md], { type: 'text/markdown' }), 'BOI-CANH-NHAN-SU.md');
    if (!S.connected()) return;
    try {
      const docs = M.data.settings.docs || (M.data.settings.docs = {});
      const blob = new Blob([md], { type: 'text/plain' });
      let r;
      try { r = await S.upload(blob, 'BOI-CANH-NHAN-SU', S.folders.sys.id, { mime: 'text/plain', convertTo: S.MIME.GDOC, fileId: docs.ctx && docs.ctx.id }); }
      catch (e) { r = await S.upload(blob, 'BOI-CANH-NHAN-SU', S.folders.sys.id, { mime: 'text/plain', convertTo: S.MIME.GDOC }); }
      docs.ctx = { id: r.id, link: r.webViewLink };
      save();
      U.toast('Đã tải file .md và cập nhật BOI-CANH-NHAN-SU trên Drive', 'success');
    } catch (e) { U.toast('Đã tải file .md, nhưng chưa lưu được lên Drive: ' + e.message, 'warn', 7000); }
  }

  /* ---------- Dữ liệu mẫu cho chế độ thử ---------- */
  function sampleData() {
    const d = M.blank();
    d.isSample = true;
    const today = U.today();
    const off = (n) => M.iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));
    const at = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n, 15).toISOString();
    const mk = (o) => Object.assign({ rounds: [], attach: [], seen: [], history: [], difficulty: 1.5, assignedAt: off(-3) }, o);
    d.tasks = [
      mk({ id: 'T-001', staffId: 'c1', title: 'Đối soát tồn kho tuần này', request: 'So sánh tồn WMS với số đếm thực tế, liệt kê chênh lệch > 1%.', due: off(2), status: 'dang-lam' }),
      mk({ id: 'T-002', staffId: 'c2', title: 'Cập nhật master data 120 SKU mới', request: 'Tạo file upload WMS đủ cột: mã, mô tả, UOM, kích thước, trọng lượng.', due: off(-1), status: 'dang-lam', difficulty: 2 }),
      mk({ id: 'T-003', staffId: 'c3', title: 'Báo cáo aging stock', request: 'Tồn > 90 ngày theo khách hàng, kèm biểu đồ.', due: off(0), status: 'da-nop', rounds: [{ at: at(0), files: [{ id: 'thu-1', name: 'nop-lan1-aging.xlsx' }] }] }),
      mk({ id: 'T-004', staffId: 'leader', title: 'Tổng hợp KPI kho tuần', request: 'Gom KPI inbound/outbound, độ chính xác tồn.', due: off(-2), status: 'da-cham', rounds: [{ at: at(-2), files: [{ id: 'thu-2', name: 'nop-lan1-kpi.xlsx' }] }],
        score: { quality: 35, completeness: 27, presentation: 9, comment: 'Số liệu khớp, thiếu phần nguyên nhân chênh lệch outbound.', strengths: [], issues: ['Thiếu phân tích nguyên nhân'], reviewer: 'Claude', at: at(-1) } })
    ];
    d.seq.T = 4;
    const it = (o) => Object.assign({ kind: 'request', files: [], seen: [], receivedAt: off(-1), status: 'moi' }, o);
    d.boss = [
      it({ id: 'C-001', source: 'boss', from: 'boss1', title: 'Báo cáo tồn kho chậm luân chuyển Q4', content: 'Danh sách SKU tồn > 180 ngày, đề xuất thanh lý.', due: off(3), priority: 'P2', status: 'gemini' }),
      it({ id: 'R-001', source: 'dept', requester: 'Finance – chị Lan', title: 'Xuất giá trị tồn kho cuối tháng', content: 'Cần file giá trị tồn theo khách hàng để khoá sổ.', due: off(2), priority: 'P3' }),
      it({ id: 'I-001', source: 'vendor', kind: 'issue', requester: 'NCC Minh Phát', title: 'ASN sai số lượng 3 PO', content: 'ASN báo 1.200 thùng, nhận thực tế 1.140.', scope: '3 PO, thiếu 60 thùng, 2 SKU', refs: 'PO 4500123, 4500124, 4500131', due: off(0), priority: 'P1', escalate: 'boss1' }),
      it({ id: 'I-002', source: 'staff', kind: 'issue', staffRef: 'c2', title: 'Sai UOM khi tạo SKU lặp lại', content: '2 lần trong tháng nhập UOM thùng thay vì cái.', due: off(5), priority: 'P3' })
    ];
    d.seq.C = 1; d.seq.R = 1; d.seq.I = 2;
    const rt = (name, freq, minutes) => ({ id: U.uid(), name, freq, minutes });
    d.staff.find((x) => x.id === 'leader').routines = [rt('Phân việc và kiểm tra chéo cho 3 clerk', 'ngay', 90), rt('Báo cáo KPI tuần', 'tuan', 180), rt('Họp giao ca', 'ngay', 30)];
    d.staff.find((x) => x.id === 'c1').routines = [rt('Đối soát tồn WMS và thực tế', 'ngay', 120), rt('Xử lý chênh lệch cycle count', 'ngay', 90), rt('Báo cáo tồn tháng', 'thang', 480)];
    d.staff.find((x) => x.id === 'c2').routines = [rt('Tạo/sửa master data SKU', 'ngay', 150), rt('Kiểm tra location trống', 'ngay', 45)];
    d.staff.find((x) => x.id === 'c3').routines = [rt('Báo cáo aging', 'tuan', 120)];
    d.log = [{ at: new Date().toISOString(), who: 'Hệ thống', text: 'Đây là dữ liệu mẫu ở chế độ thử. Kết nối Drive để bắt đầu thật.' }];
    return d;
  }

  /* ---------- Sự kiện ---------- */
  const actions = {
    view: (el) => { A.view = el.dataset.v; A.drawer = null; closeModal(); render(); window.scrollTo(0, 0); },
    connect: () => connect(),
    disconnect: async () => { if (!confirm('Đăng xuất và ngắt kết nối Drive trên trình duyệt này?')) return; await flushSave(); S.disconnect(); showGate('Đã đăng xuất.'); },
    demo: () => { if (!DEV) return; A.authed = true; hideGate(); M.data = M.normalize(U.store.get('office_demo', null) || sampleData()); render(); },
    openRoot: () => S.folders.root && window.open(S.folderLink(S.folders.root.id), '_blank', 'noopener'),
    syncNow: () => syncNow(false),
    openStaff: (el) => { A.drawer = el.dataset.id; A.dtab = 'task'; FX.sound('open'); renderDrawer(); },
    dtab: (el) => { A.dtab = el.dataset.k; renderDrawer(); },
    fxToggle: (el) => { FX.toggle(el.dataset.k); render(); },
    fullscreen: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); },
    newItem: (el) => bossForm(null, { source: el.dataset.src, kind: el.dataset.kind, from: el.dataset.boss, staffRef: el.dataset.staff }),
    bKind: (el) => { $('#bKind').value = el.dataset.k; U.$$('#bKindSeg button').forEach((b) => b.classList.toggle('on', b === el)); bossFormSync(); },
    bfSrc: (el) => { A.bf.src = el.dataset.k; render(); },
    bfKind: (el) => { A.bf.kind = el.dataset.k; render(); },
    bfSt: (el) => { A.bf.st = el.dataset.k; render(); },
    addRoutine: (el) => routineForm(M.staff(el.dataset.id)),
    editRoutine: (el) => { const s = M.staff(el.dataset.id); routineForm(s, s.routines.find((r) => r.id === el.dataset.r)); },
    delRoutine: (el) => { const s = M.staff(el.dataset.id); const r = s.routines.find((x) => x.id === el.dataset.r); if (!confirm(`Xoá việc định kỳ "${r.name}"?`)) return; s.routines = s.routines.filter((x) => x !== r); save(); renderDrawer(); },
    saveRoutine: (el) => saveRoutine(el.dataset.id, el.dataset.r),
    pasteRoutines: (el) => pasteForm(M.staff(el.dataset.id)),
    savePaste: (el) => savePaste(el.dataset.id),
    staffingClaude: () => { const p = M.period('month', A.kpi.ref); promptModal('Nhờ Claude phân tích định biên', P.staffing(p.label, M.team(p.from, p.to)), 'claude', 'Dán vào project Warehouse DIY trên claude.ai. Claude phân tích từ số liệu bên dưới, không cần đọc Drive.'); },
    exportCtx: () => exportContext(),
    closeDrawer: () => { A.drawer = null; renderDrawer(); },
    close: () => closeModal(),
    openAi: () => {
      const n = aiCounts();
      modal(`<h3>Bàn AI</h3>
        <div class="aiduo"><div>${C.robot('gemini', n.gem ? 'work' : 'idle')}<h4>Gemini (Gem)</h4><p>Làm nháp việc cấp trên và việc hằng ngày, luôn tự soát lỗi và tự sửa trước khi trả lời.</p></div>
        <div>${C.robot('claude', n.grade + n.chot ? 'work' : 'idle')}<h4>Claude</h4><p>Cấp cao hơn Gemini: kiểm tra, sửa lỗi, chốt kết quả và chấm điểm bài nhân viên. Ghi kết quả thẳng vào Drive.</p></div></div>
        <div class="todo">
          <button class="todoi" data-act="gradeAll" ${n.grade ? '' : 'disabled'}><b>${n.grade}</b> bài chờ chấm <span>Gửi Claude chấm hết →</span></button>
          <button class="todoi" data-act="view" data-v="boss"><b>${n.gem}</b> việc cấp trên chờ Gemini · <b>${n.chot}</b> chờ Claude chốt <span>Mở →</span></button>
          <button class="todoi" data-act="openGem"><b>Gem</b> Mở Gem Warehouse Supervisor <span>→</span></button>
        </div>`);
    },
    openGem: () => window.open(M.data.settings.gemUrl || GEMINI_URL, '_blank', 'noopener'),
    newTask: (el) => taskForm(null, el.dataset.id),
    editTask: (el) => taskForm(M.data.tasks.find((t) => t.id === el.dataset.id)),
    saveTask: (el) => saveTask(el.dataset.id),
    openTask: (el) => modal('', 'task', el.dataset.id) || render(),
    hideTask: (el) => {
      const t = M.data.tasks.find((x) => x.id === el.dataset.id);
      if (!t.hidden && !confirm(`Xoá ${t.id}? Task sẽ được ẩn (không mất file trên Drive, không tính vào KPI).`)) return;
      t.hidden = !t.hidden; M.log('Bạn', `${t.hidden ? 'Xoá' : 'Hiện lại'} ${t.id}`); save(); render();
    },
    grade: async (el) => {
      const t = M.data.tasks.find((x) => x.id === el.dataset.id);
      try { await ensureTaskFolder(t); } catch (e) { U.toast(e.message, 'error'); }
      promptModal(`${t.score ? 'Kiểm tra lại' : 'Chấm'} ${t.id} bằng Claude`, P.grade(t, !!t.score), 'claude');
    },
    gradeAll: () => {
      const ts = M.data.tasks.filter((t) => !t.hidden && t.status === 'da-nop');
      if (!ts.length) return;
      promptModal(`Claude chấm ${ts.length} bài chờ`, P.gradeBatch(ts), 'claude');
    },
    override: (el) => overrideForm(M.data.tasks.find((x) => x.id === el.dataset.id)),
    saveOverride: (el) => {
      const t = M.data.tasks.find((x) => x.id === el.dataset.id);
      const v = $('#fOv').value.trim();
      t.override = v === '' ? null : Math.max(0, Math.min(100, Math.round(Number(v))));
      t.overrideNote = $('#fOvNote').value.trim();
      if (t.override != null && ['da-nop', 'dang-lam', 'moi'].includes(t.status)) t.status = 'da-cham';
      M.log('Bạn', `Sửa điểm ${t.id}: ${t.override == null ? 'dùng điểm tự tính' : t.override}`);
      save(); closeModal(); render();
    },
    newBoss: (el) => bossForm(null, { source: 'boss', from: el.dataset.id }),
    editBoss: (el) => bossForm(M.data.boss.find((c) => c.id === el.dataset.id)),
    saveBoss: (el) => saveBoss(el.dataset.id),
    bossStatus: (el) => {
      const c = M.data.boss.find((x) => x.id === el.dataset.id);
      c.status = el.dataset.st; M.log('Bạn', `${c.id}: ${M.BOSS_STATUS[c.status].label}`); save(); render();
      if (c.status === 'gui') FX.celebrate();
    },
    bossGemini: async (el) => {
      const c = M.data.boss.find((x) => x.id === el.dataset.id);
      try { await ensureBossFolder(c); } catch (e) { U.toast(e.message, 'error'); }
      if (c.status === 'moi') { c.status = 'gemini'; save(); render(); }
      promptModal(`Gửi Gemini làm ${c.id}`, P.bossGemini(c), 'gemini',
        'Copy và mở Gem, dán câu lệnh. Khi Gemini xong, xuất kết quả sang Google Docs/Sheets, đổi tên bắt đầu bằng "gemini-ban-nhap-' + c.id + '" và chuyển vào thư mục việc này. App sẽ tự nhận ra.');
    },
    bossClaude: async (el) => {
      const c = M.data.boss.find((x) => x.id === el.dataset.id);
      try { await ensureBossFolder(c); } catch (e) { U.toast(e.message, 'error'); }
      promptModal(`Nhờ Claude chốt ${c.id}`, P.bossClaude(c), 'claude');
    },
    bossSheet: () => bossSheet().catch((e) => U.toast(e.message, 'error', 8000)),
    importBoss: () => importBossSheet(),
    supSend: (el) => {
      const text = $('#supText').value.trim();
      const gem = ($('#supGem') || {}).value ? $('#supGem').value.trim() : '';
      if (!text && !gem) { U.toast('Nhập nội dung cần xử lý', 'warn'); return; }
      const target = el.dataset.target;
      const body = target === 'claude' && gem ? `${text}\n\nKẾT QUẢ CỦA GEMINI CẦN SOÁT:\n${gem}` : text;
      M.data.notes = M.data.notes || [];
      M.data.notes.unshift({ at: new Date().toISOString(), target, text: body });
      if (M.data.notes.length > 100) M.data.notes.length = 100;
      M.log('Bạn', `Gửi ${target === 'gemini' ? 'Gemini' : 'Claude'}: ${text.slice(0, 60)}`);
      save();
      promptModal(target === 'gemini' ? 'Gửi Gemini' : 'Gửi Claude kiểm tra', P.free(body, target), target);
    },
    reuseNote: (el) => { const n = M.data.notes[Number(el.dataset.i)]; if (n && $('#supText')) { $('#supText').value = n.text; $('#supText').focus(); } },
    supToBoss: () => { const text = $('#supText').value.trim(); bossForm(null, { source: 'boss' }); if (text) { $('#bContent').value = text; $('#bTitle').value = text.split('\n')[0].slice(0, 80); } },
    copyOnly: async () => { if (await copyText($('#promptText').value)) U.toast('Đã copy câu lệnh', 'success'); },
    copyOpen: async (el) => {
      const ok = await copyText($('#promptText').value);
      const target = el.dataset.target;
      window.open(target === 'gemini' ? (M.data.settings.gemUrl || GEMINI_URL) : CLAUDE_URL, '_blank', 'noopener');
      U.toast(ok ? 'Đã copy. Dán (Ctrl+V) vào ô chat.' : 'Không copy được, hãy chọn và copy thủ công.', ok ? 'success' : 'warn', 5000);
      closeModal();
    },
    copyEl: async (el) => { if (await copyText($('#' + el.dataset.el).value)) U.toast('Đã copy', 'success'); },
    rewriteGuides: async () => { U.loading(true, 'Đang ghi hướng dẫn…'); try { await ensureGuides(true); U.toast('Đã ghi lại 2 hướng dẫn lên Drive', 'success'); } catch (e) { U.toast(e.message, 'error'); } finally { U.loading(false); render(); } },
    kpiKind: (el) => { A.kpi.kind = el.dataset.k; render(); },
    kpiMove: (el) => {
      const r = A.kpi.ref, d = Number(el.dataset.d);
      A.kpi.ref = A.kpi.kind === 'year' ? new Date(r.getFullYear() + d, 0, 1) : new Date(r.getFullYear(), r.getMonth() + d, 1);
      render();
    },
    kpiCsv: () => { const { rows, label } = kpiRows(); U.download(new Blob([M.toCsv(rows)], { type: 'text/csv' }), U.safeName(`KPI ${label}.csv`)); },
    kpiSheet: async () => {
      if (!S.connected()) { U.toast('Cần kết nối Drive', 'warn'); return; }
      const { rows, label } = kpiRows();
      U.loading(true, 'Đang tạo Google Sheet…');
      try {
        const r = await S.upload(new Blob([M.toCsv(rows)], { type: 'text/csv' }), `KPI ${label.replace('/', '-')} (xuất ${U.stamp()})`, S.folders.reports.id, { mime: 'text/csv', convertTo: S.MIME.GSHEET });
        M.log('Bạn', `Xuất KPI ${label} ra Google Sheet`); save();
        window.open(r.webViewLink, '_blank', 'noopener');
      } catch (e) { U.toast(e.message, 'error', 8000); } finally { U.loading(false); }
    },
    addStaff: () => staffForm(null),
    editStaff: (el) => staffForm(M.staff(el.dataset.id)),
    saveStaff: (el) => saveStaff(el.dataset.id),
    resetColors: () => { ['sfHair', 'sfShirt', 'sfSkin'].forEach((id) => { $('#' + id).dataset.custom = ''; }); staffLooks(true); },
    delStaff: (el) => {
      const s = M.staff(el.dataset.id);
      if (M.data.tasks.some((t) => t.staffId === s.id)) { U.toast(`${s.name} đã có task, không xoá được (để giữ lịch sử KPI). Có thể đổi tên thay vì xoá.`, 'warn', 7000); return; }
      if (!confirm(`Xoá ${s.name}?`)) return;
      M.data.staff = M.data.staff.filter((x) => x.id !== s.id); save(); render();
    },
    exportJson: () => U.download(new Blob([JSON.stringify(M.data, null, 1)], { type: 'application/json' }), `warehouse-office-${M.iso(new Date())}.json`),
    resetDemo: () => { if (!confirm('Xoá dữ liệu thử và nạp lại dữ liệu mẫu?')) return; S.clearDemo(); M.data = M.normalize(sampleData()); render(); }
  };

  const changes = {
    status: (el) => {
      const t = M.data.tasks.find((x) => x.id === el.dataset.id);
      t.status = el.value; M.log('Bạn', `${t.id} → ${M.STATUS[t.status].label}`); save(); render();
    },
    showClosed: (el) => { A.showClosed = el.checked; renderDrawer(); },
    fStaff: (el) => { A.filter.staff = el.value; render(); },
    fStatus: (el) => { A.filter.status = el.value; render(); },
    fQ: (el) => { A.filter.q = el.value; render(); const i = $('[data-change=fQ]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); },
    gemUrl: (el) => { M.data.settings.gemUrl = el.value.trim(); save(); },
    hoursPerDay: (el) => { M.data.settings.hoursPerDay = Math.max(1, Math.min(12, Number(el.value) || 7.5)); save(); render(); },
    daysPerMonth: (el) => { M.data.settings.daysPerMonth = Math.max(15, Math.min(31, Math.round(Number(el.value) || 22))); save(); render(); },
    clientId: (el) => { const s = U.store.get('settings', {}); s.googleClientId = el.value.trim(); U.store.set('settings', s); U.toast('Đã lưu Client ID. Tải lại trang để áp dụng.', 'info'); }
  };

  function bindEvents() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      if (el.tagName === 'A' && el.getAttribute('href')) return;
      const fn = actions[el.dataset.act];
      if (fn) { e.preventDefault(); fn(el, e); }
    });
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.upload) { submitFiles(el.dataset.upload, Array.from(el.files || [])); el.value = ''; return; }
      if (el.dataset.bf) { bossFormSync(); return; }
      if (el.dataset.sf) { if (el.dataset.sf === 'gender') staffLooks(); else if (el.dataset.sf === 'look') staffPreview(); return; }
      const fn = changes[el.dataset.change];
      if (fn) fn(el);
    });
    document.addEventListener('input', U.debounce((e) => { if (e.target.dataset.change === 'fQ') changes.fQ(e.target); }, 350));
    document.addEventListener('input', (e) => { if (e.target.dataset.sf === 'color') { e.target.dataset.custom = '1'; staffPreview(); } });
    ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => {
      const z = e.target.closest && e.target.closest('[data-drop]');
      if (z) { e.preventDefault(); z.classList.add('over'); }
    }));
    document.addEventListener('dragleave', (e) => { const z = e.target.closest && e.target.closest('[data-drop]'); if (z) z.classList.remove('over'); });
    document.addEventListener('drop', (e) => {
      const z = e.target.closest && e.target.closest('[data-drop]');
      if (!z) return;
      e.preventDefault(); z.classList.remove('over');
      submitFiles(z.dataset.drop, Array.from(e.dataTransfer.files || []));
    });
    $('#scrim').addEventListener('click', () => { A.drawer = null; renderDrawer(); });
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#modal').hidden) closeModal(); else if (A.drawer) { A.drawer = null; renderDrawer(); }
    });
    $('#syncBtn').addEventListener('click', () => syncNow(false));
    /* Quay lại tab (sau khi Claude ghi kết quả) thì tự đồng bộ */
    const auto = () => { if (document.visibilityState === 'visible' && S.connected() && Date.now() - A.lastSync > 20000) syncNow(true); };
    window.addEventListener('focus', auto);
    document.addEventListener('visibilitychange', auto);
    setInterval(() => { if (document.visibilityState === 'visible' && S.connected() && Date.now() - A.lastSync > 180000) syncNow(true); }, 30000);
    window.addEventListener('beforeunload', (e) => { if (A.dirty || A.saving) { e.preventDefault(); e.returnValue = ''; } });
    setInterval(() => {
      A.tick++;
      const tk = $('#ticker');
      if (A.view === 'office' && tk) {
        const lines = tickerLines();
        const tl = lines[A.tick % lines.length];
        if (tl) { tk.classList.remove('in'); void tk.offsetWidth; tk.innerHTML = `<b>${esc(tl[0])}</b> ${esc(tl[1])}`; tk.classList.add('in'); }
      }
    }, 6000);
  }

  async function init() {
    bindEvents();
    FX.typingActive = () => A.authed && A.view === 'office' && M.workers().some((s) => M.staffState(s).mood === 'work');
    if (!S.connected()) { showGate(); return; }
    try {
      const v = await S.verifyOwner();
      if (!v.ok) { showGate(denied(v.email)); return; }
    } catch (e) { showGate(e.message); return; }
    A.authed = true; hideGate();
    M.data = M.blank();
    render();
    await startDrive();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.MD);
