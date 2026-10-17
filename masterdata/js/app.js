/* Master Data Pro — điều khiển giao diện */
(function (MD) {
  'use strict';
  const U = MD.U, A = MD.Analyzer, P = MD.Parsers, E = MD.Export, D = MD.Drive, AI = MD.AI;
  const { $, $$, esc } = U;
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  if (window.marked) marked.use({ renderer: { html(t) { return esc(typeof t === 'string' ? t : (t && (t.text || t.raw)) || ''); } } });

  const S = {
    datasets: [], active: null, results: {}, files: {}, charts: {}, tab: 'upload', ai: {},
    f: { q: '', cat: '', check: '', col: '', sev: new Set(Object.keys(A.SEV)), row: null }, page: 0,
    rec: { a: null, b: null, result: null, view: 'diffs' }, driveLinks: {}
  };
  const PAGE = 100;
  const DEFAULTS = { domain: 'auto', outlierK: 3, expiryWarnDays: 30, fuzzy: true, customRules: [], autoDrive: false, driveFolder: 'Master Data Pro' };
  const settings = () => Object.assign({}, DEFAULTS, U.store.get('settings', {}));
  const saveSettings = (patch) => U.store.set('settings', Object.assign(U.store.get('settings', {}), patch));
  const cur = () => S.datasets.find((d) => d.id === S.active);
  const curRes = () => (S.active ? S.results[S.active] : null);
  const sevBadge = (s) => `<span class="sev ${s}">${A.SEV[s].label}</span>`;
  const catDot = (c) => `<span class="catdot" style="background:${A.CATS[c].color}"></span>`;
  const scoreColor = (s) => (s >= 80 ? 'var(--ok)' : s >= 65 ? 'var(--warn)' : 'var(--bad)');
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  /* =================== Điều hướng =================== */
  function showTab(name) {
    S.tab = name;
    $$('.sidenav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
    $('#sidenav').classList.remove('open');
    render(name);
    window.scrollTo({ top: 0 });
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* bỏ qua */ }
  }
  function render(name) {
    try {
      ({ upload: renderUpload, overview: renderOverview, issues: renderIssues, profile: renderProfile, clean: renderClean,
        reconcile: renderReconcile, rules: renderRules, ai: renderAI, report: renderReport, history: renderHistory, settings: renderSettings }[name] || (() => {}))();
    } catch (e) { console.error(e); U.toast('Lỗi hiển thị: ' + e.message, 'err'); }
  }

  function refreshTop() {
    const sel = $('#dsSelect');
    sel.innerHTML = S.datasets.length ? S.datasets.map((d) => `<option value="${d.id}" ${d.id === S.active ? 'selected' : ''}>${esc(d.name)}</option>`).join('') : '<option value="">— Chưa có dữ liệu —</option>';
    const res = curRes(), chip = $('#dsScore');
    if (res) {
      chip.hidden = false; chip.textContent = `${res.score}/100 · ${A.grade(res.score).g}`;
      chip.style.background = `color-mix(in srgb, ${scoreColor(res.score)} 16%, transparent)`; chip.style.color = scoreColor(res.score);
      $('#navIssues').textContent = res.issues.length ? (res.issues.length > 999 ? '999+' : res.issues.length) : '';
    } else { chip.hidden = true; $('#navIssues').textContent = ''; }
  }

  function setActive(id) {
    S.active = id; S.page = 0; S.f.row = null;
    refreshTop(); render(S.tab);
  }

  /* =================== Nạp & phân tích =================== */
  async function addFiles(list) {
    const added = [];
    for (const f of list) {
      try {
        U.loading(true, `Đang đọc ${f.name}…`);
        const dss = await P.readFile(f);
        S.files[f.name] = f;
        if (!dss.length) U.toast(`${f.name}: không tìm thấy dữ liệu`, 'err');
        dss.forEach((d) => { S.datasets.push(d); added.push(d); });
      } catch (e) { console.error(e); U.toast(`${f.name}: ${e.message}`, 'err', 7000); }
    }
    U.loading(false);
    if (added.length) await analyzeList(added, true);
  }

  async function addDatasets(dss) { dss.filter(Boolean).forEach((d) => S.datasets.push(d)); await analyzeList(dss.filter(Boolean), true); }

  async function analyzeList(list, go) {
    const cfg = settings();
    for (const d of list) {
      U.loading(true, `Đang phân tích ${d.name} (${U.fmtNum(d.rows.length)} dòng)…`);
      await new Promise((r) => setTimeout(r, 30));
      try { const res = A.analyze(d, cfg); S.results[d.id] = res; addHistory(d, res); }
      catch (e) { console.error(e); U.toast(`Phân tích ${d.name} lỗi: ${e.message}`, 'err', 7000); }
    }
    U.loading(false);
    if (list.length) S.active = (list.find((d) => d.kind === 'table') || list[0]).id;
    S.page = 0; S.f.row = null;
    refreshTop();
    if (go) showTab('overview'); else render(S.tab);
    if (cfg.autoDrive && D.hasToken() && S.active) saveToDrive(S.active).catch((e) => U.toast(e.message, 'err'));
  }

  /* =================== Lịch sử =================== */
  function addHistory(d, res) {
    const h = U.store.get('history', []);
    h.unshift({ id: U.uid(), dsId: d.id, at: res.at, name: d.name, file: d.source && d.source.file, rows: res.rows, cols: res.cols, score: res.score, issues: res.issues.length, crit: (res.bySev.critical || 0) + (res.bySev.high || 0), byCat: res.byCat, domain: res.domain });
    U.store.set('history', h.slice(0, 300));
  }

  /* =================== Tab: Nạp dữ liệu =================== */
  function renderUpload() {
    const card = $('#dsListCard');
    card.hidden = !S.datasets.length;
    $('#dsList').innerHTML = `<thead><tr><th>Bảng</th><th>Loại</th><th class="num">Dòng</th><th class="num">Cột</th><th class="num">Điểm</th><th class="num">Lỗi</th><th></th></tr></thead><tbody>` +
      S.datasets.map((d) => {
        const r = S.results[d.id];
        return `<tr class="${d.id === S.active ? 'sel' : ''}"><td><b>${esc(d.name)}</b></td><td>${esc((d.source && d.source.kind) || '')}${d.kind === 'text' ? ' · văn bản' : ''}</td>
        <td class="num">${U.fmtNum(d.kind === 'text' ? d.lines.length : d.rows.length)}</td><td class="num">${d.kind === 'text' ? '—' : d.headers.length}</td>
        <td class="num" style="color:${r ? scoreColor(r.score) : ''};font-weight:700">${r ? r.score : '—'}</td><td class="num">${r ? U.fmtNum(r.issues.length) : '—'}</td>
        <td class="row"><button class="btn sm" data-view="${d.id}">Xem</button><button class="btn sm ghost danger" data-del="${d.id}" aria-label="Xoá">✕</button></td></tr>`;
      }).join('') + '</tbody>';
    const ds = cur();
    const pc = $('#previewCard');
    pc.hidden = !ds;
    if (!ds) return;
    $('#previewName').textContent = ds.name;
    $('#headerRowInput').value = ds.kind === 'table' ? ds.headerRow + 1 : '';
    $('#headerRowInput').disabled = $('#headerRowApply').disabled = ds.kind !== 'table' || !ds.raw;
    const res = curRes();
    const bad = new Set();
    if (res) res.issues.forEach((it) => { if (it.row >= 0 && it.col >= 0) bad.add(it.row + ':' + it.col); });
    const rows = ds.rows.slice(0, 200);
    $('#previewTable').innerHTML = `<thead><tr><th class="rownum">#</th>${ds.headers.map((h) => `<th title="${esc(h)}">${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
      rows.map((r, i) => `<tr><td class="rownum">${ds.firstDataRow + i}</td>${r.map((c, j) => `<td class="${bad.has(i + ':' + j) ? 'bad' : ''}" title="${esc(U.display(c))}">${esc(U.display(c))}</td>`).join('')}</tr>`).join('') +
      (ds.rows.length > 200 ? `<tr><td colspan="${ds.headers.length + 1}" class="muted">… còn ${U.fmtNum(ds.rows.length - 200)} dòng</td></tr>` : '') + '</tbody>';
  }

  /* =================== Biểu đồ =================== */
  function chart(id, cfg) {
    if (!window.Chart) return;
    if (S.charts[id]) S.charts[id].destroy();
    const el = document.getElementById(id); if (!el) return;
    Chart.defaults.color = U.cssVar('--text2');
    Chart.defaults.borderColor = U.cssVar('--border');
    Chart.defaults.font.family = 'Inter, Segoe UI, sans-serif';
    S.charts[id] = new Chart(el, cfg);
  }
  const sevColors = () => Object.keys(A.SEV).map((k) => U.cssVar('--sev-' + k));

  /* =================== Tab: Tổng quan =================== */
  function renderOverview() {
    const ds = cur(), res = curRes(), body = $('#ovBody');
    if (!res) { body.className = 'empty-state'; body.innerHTML = 'Nạp dữ liệu ở tab <b>Nạp dữ liệu</b> để bắt đầu.'; $('#ovSub').textContent = 'Chưa có kết quả phân tích.'; return; }
    body.className = '';
    const g = A.grade(res.score);
    $('#ovSub').innerHTML = `${esc(ds.name)} · <b>${E.domainLabel(res.domain)}</b>${res.keyName ? ` · cột khoá: <b>${esc(res.keyName)}</b>` : ''} · quét trong ${U.fmtNum(res.ms)} ms`;
    const ch = (res.bySev.critical || 0) + (res.bySev.high || 0);
    body.innerHTML = `
      <div class="kpis">
        <div class="kpi score"><div class="lbl">Điểm chất lượng</div><div class="val" style="color:${scoreColor(res.score)}">${res.score}<small style="font-size:15px;color:var(--muted)">/100</small></div>
          <div class="sub">Hạng ${g.g} — ${g.t}</div><div class="gauge"><i style="width:${res.score}%;background:${scoreColor(res.score)}"></i></div></div>
        <div class="kpi"><div class="lbl">${res.kind === 'text' ? 'Đoạn văn' : 'Số dòng dữ liệu'}</div><div class="val">${U.fmtNum(res.rows)}</div><div class="sub">${res.kind === 'text' ? U.fmtNum(res.words) + ' từ' : res.cols + ' cột'}</div></div>
        <div class="kpi"><div class="lbl">Tổng số lỗi</div><div class="val">${U.fmtNum(res.issues.length)}</div><div class="sub">${res.checks.length} loại kiểm tra phát hiện</div></div>
        <div class="kpi"><div class="lbl">Dòng có lỗi</div><div class="val">${U.fmtNum(res.rowsWithIssues)}</div><div class="sub">${U.pct(1 - res.cleanRowRate)} số dòng</div></div>
        <div class="kpi"><div class="lbl">Nghiêm trọng + Cao</div><div class="val" style="color:${ch ? 'var(--bad)' : 'var(--ok)'}">${U.fmtNum(ch)}</div><div class="sub">cần xử lý trước</div></div>
      </div>
      <div class="card"><div class="dims">${Object.entries(res.dims).map(([k, v]) => `<div class="dim"><b style="color:${scoreColor(v * 100)}">${U.pct(v, 0)}</b><span>${A.DIMS[k]}</span></div>`).join('')}</div></div>
      <div class="grid2 mt">
        <div class="card"><div class="cardhead"><h3>Lỗi theo nhóm</h3></div><div class="chartbox"><canvas id="cCat"></canvas></div></div>
        <div class="card"><div class="cardhead"><h3>Lỗi theo mức độ</h3></div><div class="chartbox"><canvas id="cSev"></canvas></div></div>
      </div>
      <div class="grid2 mt">
        <div class="card"><div class="cardhead"><h3>Cột nhiều lỗi nhất</h3></div><div class="chartbox"><canvas id="cCol"></canvas></div></div>
        <div class="card"><div class="cardhead"><h3>Các chiều chất lượng</h3></div><div class="chartbox"><canvas id="cDim"></canvas></div></div>
      </div>
      <div class="grid2 mt">
        <div class="card"><div class="cardhead"><h3>Lỗi theo từng mục</h3><span class="muted">bấm để xem chi tiết</span></div>
          <div class="checklist">${res.checks.length ? res.checks.map((c) => `<div class="item" data-check="${esc(c.check)}" data-cat="${c.cat}">${sevBadge(c.sev)}
            <div><b>${esc(c.check)}</b><div class="muted" style="font-size:12px">${catDot(c.cat)}${A.CATS[c.cat].label}${c.cols.length ? ' · ' + esc(c.cols.slice(0, 3).join(', ')) + (c.cols.length > 3 ? '…' : '') : ''}</div></div>
            <span class="n">${U.fmtNum(c.n)}</span></div>`).join('') : '<p class="muted">Không phát hiện lỗi 🎉</p>'}</div></div>
        <div class="card"><div class="cardhead"><h3>Khuyến nghị của chuyên gia</h3></div>
          <ul class="reclist">${res.recommendations.map((r) => `<li>${sevBadge(r.sev)}<span>${esc(r.text)}</span></li>`).join('')}</ul>
          ${res.truncated ? '<p class="note warn mt">Số lỗi quá lớn — chỉ hiển thị 60.000 lỗi đầu, các thống kê đếm vẫn đầy đủ.</p>' : ''}
          <div class="row wrap mt"><button class="btn primary" data-go="report">Xem báo cáo</button><button class="btn" data-go="clean">Làm sạch tự động</button><button class="btn" data-go="ai">Hỏi chuyên gia AI</button></div></div>
      </div>`;
    const cats = Object.entries(res.byCat).sort((a, b) => b[1] - a[1]);
    chart('cCat', { type: 'doughnut', data: { labels: cats.map(([k]) => A.CATS[k].label), datasets: [{ data: cats.map(([, v]) => v), backgroundColor: cats.map(([k]) => A.CATS[k].color), borderWidth: 1, borderColor: U.cssVar('--surface') }] },
      options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10 } } },
        onClick: (e, el) => { if (el[0]) gotoIssues({ cat: cats[el[0].index][0] }); } } });
    const sk = Object.keys(A.SEV);
    chart('cSev', { type: 'bar', data: { labels: sk.map((k) => A.SEV[k].label), datasets: [{ data: sk.map((k) => res.bySev[k] || 0), backgroundColor: sevColors(), borderRadius: 4, maxBarThickness: 46 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
        onClick: (e, el) => { if (el[0]) gotoIssues({ sev: sk[el[0].index] }); } } });
    const cols = Object.entries(res.byCol).sort((a, b) => b[1] - a[1]).slice(0, 12);
    chart('cCol', { type: 'bar', data: { labels: cols.map(([k]) => k.length > 22 ? k.slice(0, 21) + '…' : k), datasets: [{ data: cols.map(([, v]) => v), backgroundColor: U.cssVar('--accent'), borderRadius: 4, maxBarThickness: 18 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } },
        onClick: (e, el) => { if (el[0]) gotoIssues({ col: cols[el[0].index][0] }); } } });
    const dk = Object.keys(res.dims);
    chart('cDim', { type: 'radar', data: { labels: dk.map((k) => A.DIMS[k]), datasets: [{ data: dk.map((k) => +(res.dims[k] * 100).toFixed(1)), backgroundColor: 'rgba(59,130,246,.18)', borderColor: U.cssVar('--accent'), pointBackgroundColor: U.cssVar('--accent') }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: 'transparent' }, grid: { color: U.cssVar('--border') }, angleLines: { color: U.cssVar('--border') } } } } });
  }

  function gotoIssues(f) {
    S.f = { q: '', cat: f.cat || '', check: f.check || '', col: f.col || '', sev: f.sev ? new Set([f.sev]) : new Set(Object.keys(A.SEV)), row: f.row != null ? f.row : null };
    S.page = 0;
    showTab('issues');
  }

  /* =================== Tab: Danh sách lỗi =================== */
  function filteredIssues() {
    const res = curRes(); if (!res) return [];
    const q = U.key(S.f.q);
    return res.issues.filter((it) => S.f.sev.has(it.sev) && (!S.f.cat || it.cat === S.f.cat) && (!S.f.check || it.check === S.f.check) &&
      (!S.f.col || it.colName === S.f.col) && (S.f.row == null || it.row === S.f.row) &&
      (!q || U.key(`${it.value} ${it.msg} ${it.check} ${it.colName} ${it.excelRow} ${it.suggest || ''}`).includes(q)))
      .sort((a, b) => A.SEV[a.sev].order - A.SEV[b.sev].order || (a.row - b.row) || (a.col - b.col));
  }

  function renderIssues() {
    const res = curRes();
    const opt = (v, l, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`;
    $('#fSearch').value = S.f.q;
    if (!res) { $('#issueTable').innerHTML = ''; $('#issueCount').textContent = 'Chưa có dữ liệu'; $('#pager').innerHTML = ''; return; }
    $('#fCat').innerHTML = opt('', 'Mọi nhóm lỗi', S.f.cat) + Object.keys(res.byCat).map((k) => opt(k, `${A.CATS[k].label} (${res.byCat[k]})`, S.f.cat)).join('');
    $('#fCheck').innerHTML = opt('', 'Mọi loại kiểm tra', S.f.check) + res.checks.filter((c) => !S.f.cat || c.cat === S.f.cat).map((c) => opt(c.check, `${c.check} (${c.n})`, S.f.check)).join('');
    $('#fCol').innerHTML = opt('', 'Mọi cột', S.f.col) + Object.entries(res.byCol).sort((a, b) => b[1] - a[1]).map(([k, v]) => opt(k, `${k} (${v})`, S.f.col)).join('');
    $('#fSev').innerHTML = Object.keys(A.SEV).map((k) => `<label><input type="checkbox" value="${k}" ${S.f.sev.has(k) ? 'checked' : ''}>${sevBadge(k)}<span>${res.bySev[k] || 0}</span></label>`).join('');
    const list = filteredIssues();
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    S.page = Math.min(S.page, pages - 1);
    $('#issueCount').innerHTML = `${U.fmtNum(list.length)} lỗi${list.length !== res.issues.length ? ` <span class="muted">/ ${U.fmtNum(res.issues.length)}</span>` : ''}${S.f.row != null ? ` · <span class="muted">dòng ${cur().firstDataRow + S.f.row}</span>` : ''}`;
    $('#pager').innerHTML = pages > 1 ? `<button class="btn sm" data-pg="-1" ${S.page ? '' : 'disabled'}>‹</button><span class="muted">Trang ${S.page + 1}/${pages}</span><button class="btn sm" data-pg="1" ${S.page < pages - 1 ? '' : 'disabled'}>›</button>` : '';
    const slice = list.slice(S.page * PAGE, S.page * PAGE + PAGE);
    $('#issueTable').innerHTML = `<thead><tr><th>Mức độ</th><th>Nhóm</th><th>Kiểm tra</th><th class="num">Dòng</th><th>Cột</th><th>Giá trị</th><th>Mô tả</th><th>Đề xuất</th></tr></thead><tbody>` +
      (slice.length ? slice.map((it) => `<tr class="click" data-issue="${it.id}"><td>${sevBadge(it.sev)}</td><td>${catDot(it.cat)}${A.CATS[it.cat].label}</td><td>${esc(it.check)}</td>
        <td class="num">${it.excelRow || '—'}</td><td>${esc(it.colName || '—')}</td><td class="val mono">${esc(it.value == null ? '' : it.value)}</td><td>${esc(it.msg)}</td><td class="val">${esc(it.suggest || '')}</td></tr>`).join('')
        : '<tr><td colspan="8" class="muted">Không có lỗi khớp bộ lọc.</td></tr>') + '</tbody>';
  }

  function openRecord(issueId) {
    const ds = cur(), res = curRes();
    const it = res.issues.find((x) => x.id === +issueId); if (!it) return;
    let html = `<p>${sevBadge(it.sev)} <b>${esc(it.check)}</b></p><p>${esc(it.msg)}</p>`;
    if (it.suggest) html += `<p class="note">Đề xuất: <b>${esc(it.suggest)}</b></p>`;
    if (it.row >= 0 && ds.kind === 'table') {
      const r = ds.rows[it.row];
      const rowIssues = res.issues.filter((x) => x.row === it.row);
      const badCols = new Set(rowIssues.map((x) => x.col));
      html += `<h3 class="mt">Bản ghi dòng ${it.excelRow}</h3><div class="kv mt">` + ds.headers.map((h, j) => `<div>${esc(h)}</div><div class="${badCols.has(j) ? 'bad' : ''}">${esc(U.display(r[j])) || '<span class="muted">(trống)</span>'}</div>`).join('') + '</div>';
      html += `<h3 class="mt">Tất cả lỗi của dòng này (${rowIssues.length})</h3><ul>` + rowIssues.map((x) => `<li>${sevBadge(x.sev)} ${esc(x.colName ? x.colName + ': ' : '')}${esc(x.check)}</li>`).join('') + '</ul>';
      if (it.dupOf != null) html += `<p class="muted">Dòng gốc trùng: ${ds.firstDataRow + it.dupOf}</p>`;
    } else if (ds.kind === 'text' && it.row >= 0) {
      html += `<h3 class="mt">Đoạn ${it.row + 1}</h3><p class="note">${esc(ds.lines[it.row])}</p>`;
    }
    $('#drawerTitle').textContent = it.excelRow ? `Dòng ${it.excelRow}` : 'Chi tiết';
    $('#drawerBody').innerHTML = html;
    $('#drawer').hidden = false;
  }

  function exportIssues() {
    const list = filteredIssues(); const ds = cur();
    if (!list.length) return U.toast('Không có lỗi để xuất');
    const aoa = [['Mức độ', 'Nhóm', 'Kiểm tra', 'Dòng', 'Cột', 'Giá trị', 'Mô tả', 'Đề xuất']].concat(list.map((it) => [A.SEV[it.sev].label, A.CATS[it.cat].label, it.check, it.excelRow || '', it.colName, it.value || '', it.msg, it.suggest || '']));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Lỗi');
    U.download(E.workbookBlob(wb), U.safeName(`Loi - ${ds.name}.xlsx`));
  }

  /* =================== Tab: Hồ sơ cột =================== */
  function renderProfile() {
    const ds = cur(), res = curRes(), body = $('#profileBody');
    if (!res) { body.className = 'empty-state'; body.textContent = 'Chưa có dữ liệu.'; return; }
    if (res.kind === 'text') {
      body.className = 'card';
      body.innerHTML = `<h3>Tài liệu văn bản</h3><dl class="prof"><dt>Số đoạn</dt><dd>${U.fmtNum(ds.lines.length)}</dd><dt>Số từ</dt><dd>${U.fmtNum(res.words)}</dd></dl><p class="muted">Các bảng trong tài liệu (nếu có) được tách thành bảng riêng — chọn ở ô phía trên.</p>`;
      return;
    }
    body.className = 'profgrid';
    const typeLbl = { number: 'Số', date: 'Ngày', text: 'Chữ', code: 'Mã', email: 'Email', phone: 'SĐT', mixed: 'Lẫn lộn', empty: 'Trống' };
    body.innerHTML = res.profile.map((p) => {
      const nIss = res.byCol[p.name] || 0;
      const maxTop = p.top.length ? p.top[0].c : 1;
      return `<div class="card prof">
        <h4>${esc(p.name)} <span class="typebadge">${typeLbl[p.type] || p.type}</span>${p.role && p.role !== 'index' ? `<span class="rolebadge">${A.ROLE_LABEL[p.role] || p.role}</span>` : ''}${p.idx === res.keyCol ? '<span class="rolebadge">🔑 khoá</span>' : ''}</h4>
        <div class="bar" title="Độ đầy ${U.pct(p.fillRate)}"><i style="width:${p.fillRate * 100}%;background:${scoreColor(p.fillRate * 100)}"></i></div>
        <dl>
          <dt>Có dữ liệu</dt><dd>${U.fmtNum(p.filled)} (${U.pct(p.fillRate, 0)})</dd>
          <dt>Giá trị khác nhau</dt><dd>${U.fmtNum(p.unique)}</dd>
          ${p.num ? `<dt>Min / Max</dt><dd>${U.fmtNum(p.num.min, 2)} / ${U.fmtNum(p.num.max, 2)}</dd><dt>Trung bình</dt><dd>${U.fmtNum(p.num.mean, 2)}</dd><dt>Tổng</dt><dd>${U.fmtNum(p.num.sum, 2)}</dd>${p.num.neg ? `<dt>Số âm</dt><dd style="color:var(--bad)">${p.num.neg}</dd>` : ''}` : ''}
          ${p.dateRange ? `<dt>Từ — đến</dt><dd>${U.fmtDate(p.dateRange.min)} — ${U.fmtDate(p.dateRange.max)}</dd>` : ''}
          ${p.type !== 'number' && p.filled ? `<dt>Độ dài</dt><dd>${p.lenMin} – ${p.lenMax} ký tự</dd>` : ''}
          <dt>Số lỗi</dt><dd>${nIss ? `<a href="#" data-colissues="${esc(p.name)}">${U.fmtNum(nIss)}</a>` : '0'}</dd>
        </dl>
        <div class="topvals">${p.top.slice(0, 6).map((t) => `<div><i style="width:${t.c / maxTop * 100}%"></i><span title="${esc(t.v)}">${esc(t.v)}</span><b>${U.fmtNum(t.c)}</b></div>`).join('')}</div>
      </div>`;
    }).join('');
  }

  /* =================== Tab: Làm sạch =================== */
  const FIX_LABEL = {
    ws: 'Dọn khoảng trắng & ký tự ẩn', nfc: 'Chuẩn Unicode dựng sẵn (NFC)', num: 'Chuyển số dạng chữ → số', date: 'Chuyển ngày dạng chữ → ngày',
    title: 'Viết hoa chuẩn họ tên', phone: 'Chuẩn hoá SĐT về 0xxxxxxxxx', pad12: 'Bổ sung số 0 đầu CCCD', upper: 'Viết HOA mã',
    lower: 'Email về chữ thường', map: 'Gộp biến thể về giá trị chuẩn'
  };
  function renderClean() {
    const ds = cur(), res = curRes(), body = $('#cleanBody');
    if (!res || ds.kind !== 'table') { body.className = 'empty-state'; body.textContent = res ? 'Làm sạch chỉ áp dụng cho dữ liệu dạng bảng.' : 'Chưa có kết quả phân tích.'; return; }
    body.className = '';
    const fc = {};
    res.issues.forEach((it) => { if (it.fix) fc[it.fix] = (fc[it.fix] || 0) + 1; });
    const nDup = res.checks.filter((c) => c.check === 'Dòng trùng hoàn toàn').reduce((s, c) => s + c.n, 0);
    const nEmpty = res.checks.filter((c) => ['Dòng trống giữa bảng', 'Dòng tổng lẫn trong dữ liệu'].includes(c.check)).reduce((s, c) => s + c.n, 0);
    body.innerHTML = `
      <div class="grid2">
        <div class="card"><div class="cardhead"><h3>Sửa tự động</h3></div>
          ${Object.keys(fc).length ? Object.keys(FIX_LABEL).filter((k) => fc[k]).map((k) => `<label class="check"><input type="checkbox" data-fix="${k}" checked><span>${FIX_LABEL[k]} <b>(${U.fmtNum(fc[k])} ô)</b></span></label>`).join('') : '<p class="muted">Không có lỗi sửa tự động được.</p>'}
          <hr style="border:0;border-top:1px solid var(--border);margin:12px 0">
          <label class="check"><input type="checkbox" id="optDup" ${nDup ? 'checked' : 'disabled'}><span>Xoá dòng trùng hoàn toàn (${nDup})</span></label>
          <label class="check"><input type="checkbox" id="optEmpty" ${nEmpty ? 'checked' : 'disabled'}><span>Xoá dòng trống / dòng tổng xen giữa (${nEmpty})</span></label>
          <p class="muted" style="font-size:12.5px">Các lỗi cần người quyết định (trùng mã, không khớp, sai logic) không bị sửa tự động — xem tab Danh sách lỗi.</p>
          <div class="row wrap mt"><button class="btn" id="cleanPreview">Xem trước thay đổi</button><button class="btn primary" id="cleanDownload"><svg class="ic"><use href="#i-down"/></svg> Tải file sạch</button><button class="btn" id="cleanReanalyze">Tạo bảng sạch &amp; phân tích lại</button></div>
        </div>
        <div class="card"><div class="cardhead"><h3>Nhóm biến thể (${res.clusters.reduce((s, c) => s + c.groups.length, 0)})</h3><span class="muted">sửa ô để chọn giá trị chuẩn</span></div>
          <div style="max-height:520px;overflow:auto">${res.clusters.length ? res.clusters.map((c) => `<h4 style="margin:10px 0 6px">${esc(c.colName)}</h4>` + c.groups.map((g, gi) => `
            <div class="cluster"><div class="head"><input type="checkbox" checked data-cl="${c.col}:${gi}" aria-label="Áp dụng nhóm"><input type="text" value="${esc(g.canonical)}" data-canon="${c.col}:${gi}" list="dl-${c.col}-${gi}" aria-label="Giá trị chuẩn">
              <datalist id="dl-${c.col}-${gi}">${g.variants.map((v) => `<option value="${esc(v.v)}">`).join('')}</datalist><span class="muted">${g.total} ô</span></div>
              <div class="vars">${g.variants.map((v) => `<span>${showHidden(v.v)}<b>×${v.c}</b></span>`).join('')}</div></div>`).join('')).join('') : '<p class="muted">Không phát hiện giá trị nhập nhiều cách.</p>'}</div>
        </div>
      </div>
      <div class="card mt" id="cleanResult" hidden></div>`;
  }

  // Làm lộ ký tự ẩn để phân biệt các biến thể trông giống hệt nhau
  function showHidden(v) {
    let h = esc(v).replace(/^ +| +$/g, (m) => '<u title="khoảng trắng thừa">' + '·'.repeat(m.length) + '</u>')
      .replace(/ {2,}/g, (m) => '<u title="nhiều dấu cách">' + '·'.repeat(m.length) + '</u>')
      .replace(/\u00a0/g, '<u title="khoảng trắng cứng (NBSP)">⍽</u>').replace(/[\u200b-\u200f\ufeff]/g, '<u title="ký tự vô hình">¤</u>');
    if (v !== v.normalize('NFC')) h += ' <em class="muted" title="Unicode tổ hợp">(NFD)</em>';
    return h;
  }

  function cleanParams() {
    const res = curRes();
    const enabled = new Set($$('#cleanBody [data-fix]').filter((x) => x.checked).map((x) => x.dataset.fix));
    const ov = {};
    res.clusters.forEach((c) => c.groups.forEach((g, gi) => {
      const on = $(`#cleanBody [data-cl="${c.col}:${gi}"]`).checked;
      const canon = $(`#cleanBody [data-canon="${c.col}:${gi}"]`).value;
      ov[c.col] = ov[c.col] || {};
      g.variants.forEach((v) => { ov[c.col][v.v] = on ? canon : v.v; });
    }));
    return { enabled, ov, opts: { dropDupRows: $('#optDup') && $('#optDup').checked, dropEmpty: $('#optEmpty') && $('#optEmpty').checked } };
  }

  function doClean() {
    const ds = cur(), res = curRes(), p = cleanParams();
    // nhóm biến thể đã sửa giá trị chuẩn -> cả biến thể trùng giá trị chuẩn cũ cũng cần đổi
    const extra = [];
    res.clusters.forEach((c) => c.groups.forEach((g) => {
      const target = p.ov[c.col] && p.ov[c.col][g.variants[0].v];
      if (p.enabled.has('map') && target != null && target !== g.canonical) {
        ds.rows.forEach((r, i) => { if (U.display(r[c.col]) === g.canonical) extra.push({ row: i, col: c.col, fix: 'map', suggest: target }); });
      }
    }));
    const pseudo = extra.length ? Object.assign({}, res, { issues: res.issues.concat(extra) }) : res;
    return A.clean(ds, pseudo, p.enabled, p.ov, p.opts);
  }

  function cleanPreview() {
    const ds = cur(), out = doClean(), box = $('#cleanResult');
    const changes = [];
    const map = out.rows.length === ds.rows.length;
    if (map) ds.rows.forEach((r, i) => r.forEach((v, j) => { const nv = out.rows[i][j]; if (U.display(v) !== U.display(nv) || typeof v !== typeof nv) changes.push([ds.firstDataRow + i, ds.headers[j], U.display(v), U.display(nv)]); }));
    box.hidden = false;
    box.innerHTML = `<div class="cardhead"><h3>Kết quả: ${U.fmtNum(out.changed)} ô được sửa, ${U.fmtNum(out.removed)} dòng bị xoá</h3></div>` +
      (map ? `<div class="tablewrap"><table class="tbl"><thead><tr><th class="num">Dòng</th><th>Cột</th><th>Trước</th><th>Sau</th></tr></thead><tbody>${changes.slice(0, 300).map((c) => `<tr><td class="num">${c[0]}</td><td>${esc(c[1])}</td><td class="mono">${esc(JSON.stringify(c[2]).slice(1, -1))}</td><td class="mono">${esc(c[3])}</td></tr>`).join('')}</tbody></table></div>${changes.length > 300 ? `<p class="muted">… và ${changes.length - 300} thay đổi khác</p>` : ''}`
        : '<p class="muted">Bỏ chọn "xoá dòng" để xem chi tiết từng ô thay đổi.</p>');
  }

  /* =================== Tab: Đối chiếu =================== */
  function renderReconcile() {
    const tables = S.datasets.filter((d) => d.kind === 'table');
    const body = $('#recBody');
    if (tables.length < 2) {
      body.innerHTML = `<div class="empty-state">Cần ít nhất 2 bảng. Nạp thêm file hoặc dùng mẫu <button class="btn sm" data-sample="reconcile">Tồn hệ thống vs kiểm kê</button></div>`;
      return;
    }
    const R = S.rec;
    // mặc định: 2 bảng nạp gần nhất
    if (!tables.find((d) => d.id === R.a)) R.a = tables[tables.length - 2].id;
    if (!tables.find((d) => d.id === R.b) || R.b === R.a) R.b = (tables.slice().reverse().find((d) => d.id !== R.a) || tables[1]).id;
    const dA = tables.find((d) => d.id === R.a), dB = tables.find((d) => d.id === R.b);
    const pairs = A.suggestPairs(dA, dB);
    const rA = S.results[dA.id];
    let keyA = R.keyA && R.keyFor === dA.id + dB.id ? R.keyA : [rA && rA.keyCol >= 0 ? rA.keyCol : 0];
    if (!(R.keyA && R.keyFor === dA.id + dB.id)) {
      const wA = dA.headers.findIndex((h) => A.roleOf(h) === 'warehouse'), wB = dB.headers.findIndex((h) => A.roleOf(h) === 'warehouse');
      if (wA >= 0 && wB >= 0 && !keyA.includes(wA)) keyA.push(wA);
    }
    const pairOf = (i) => { const p = pairs.find((x) => x[0] === i); return p ? p[1] : -1; };
    const sel = (id, list, v) => `<select id="${id}">${list.map((d) => `<option value="${d.id}" ${d.id === v ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>`;
    body.innerHTML = `
      <div class="card">
        <div class="formgrid">
          <label class="field">Bảng A (gốc / hệ thống)${sel('recA', tables, R.a)}</label>
          <label class="field">Bảng B (so sánh / thực tế)${sel('recB', tables, R.b)}</label>
          <label class="field">Dung sai số<span class="muted">Chênh lệch ≤ mức này coi là khớp</span><input type="number" id="recTol" value="${R.tol || 0}" step="any" min="0"></label>
        </div>
        <h3 class="mt">Ghép cột</h3>
        <p class="muted">Đánh dấu 🔑 các cột tạo thành khoá so khớp; chọn cột tương ứng ở bảng B để so sánh giá trị.</p>
        <div class="tablewrap"><table class="tbl"><thead><tr><th>🔑</th><th>Cột bảng A</th><th>Cột tương ứng bảng B</th></tr></thead><tbody>
          ${dA.headers.map((h, i) => `<tr><td><input type="checkbox" data-reckey="${i}" ${keyA.includes(i) ? 'checked' : ''}></td><td>${esc(h)}</td>
            <td><select data-recpair="${i}"><option value="-1">— bỏ qua —</option>${dB.headers.map((hb, j) => `<option value="${j}" ${pairOf(i) === j ? 'selected' : ''}>${esc(hb)}</option>`).join('')}</select></td></tr>`).join('')}
        </tbody></table></div>
        <div class="row mt"><button class="btn primary" id="recRun"><svg class="ic"><use href="#i-play"/></svg> Đối chiếu</button></div>
      </div>
      <div id="recOut"></div>`;
    if (R.result && R.resultFor === dA.id + dB.id) renderRecOut();
  }

  function runReconcile() {
    const R = S.rec;
    const dA = S.datasets.find((d) => d.id === R.a), dB = S.datasets.find((d) => d.id === R.b);
    const keyA = $$('[data-reckey]').filter((x) => x.checked).map((x) => +x.dataset.reckey);
    if (!keyA.length) return U.toast('Chọn ít nhất 1 cột khoá', 'err');
    const keyB = keyA.map((i) => +$(`[data-recpair="${i}"]`).value);
    if (keyB.some((j) => j < 0)) return U.toast('Mỗi cột khoá cần có cột tương ứng ở bảng B', 'err');
    const pairs = $$('[data-recpair]').map((s) => [+s.dataset.recpair, +s.value]).filter(([i, j]) => j >= 0 && !keyA.includes(i));
    R.tol = +$('#recTol').value || 0;
    R.keyA = keyA; R.keyFor = dA.id + dB.id;
    U.loading(true, 'Đang đối chiếu…');
    setTimeout(() => {
      R.result = A.reconcile(dA, dB, keyA, keyB, pairs, R.tol); R.resultFor = dA.id + dB.id;
      U.loading(false); renderRecOut();
    }, 30);
  }

  function renderRecOut() {
    const R = S.rec, r = R.result, out = $('#recOut'); if (!out) return;
    const nDiffCells = r.diffs.reduce((s, d) => s + d.diffs.length, 0);
    const deltaByCol = {};
    r.diffs.forEach((d) => d.diffs.forEach((x) => { if (x.delta != null) deltaByCol[x.colA] = (deltaByCol[x.colA] || 0) + x.delta; }));
    const tabs = { diffs: `Chênh lệch (${r.diffs.length})`, onlyA: `Chỉ có ở A (${r.onlyA.length})`, onlyB: `Chỉ có ở B (${r.onlyB.length})` };
    let table = '';
    if (R.view === 'diffs') table = `<thead><tr><th>Khoá</th><th class="num">Dòng A</th><th class="num">Dòng B</th><th>Cột</th><th>Giá trị A</th><th>Giá trị B</th><th class="num">Chênh (B−A)</th></tr></thead><tbody>` +
      r.diffs.slice(0, 2000).map((d) => d.diffs.map((x, k) => `<tr>${k ? '<td></td><td></td><td></td>' : `<td><b>${esc(d.key)}</b></td><td class="num">${d.rowA}</td><td class="num">${d.rowB}</td>`}<td>${esc(x.colA)}</td><td>${esc(x.a)}</td><td>${esc(x.b)}</td><td class="num" style="color:${x.delta < 0 ? 'var(--bad)' : x.delta > 0 ? 'var(--ok)' : ''}">${x.delta != null ? U.fmtNum(x.delta, 4) : ''}</td></tr>`).join('')).join('') + '</tbody>';
    else table = `<thead><tr><th>Khoá</th><th class="num">Dòng</th></tr></thead><tbody>` + r[R.view].slice(0, 2000).map((x) => `<tr><td>${esc(x.key)}</td><td class="num">${x.rowA || x.rowB}</td></tr>`).join('') + '</tbody>';
    out.innerHTML = `
      <div class="kpis mt">
        <div class="kpi"><div class="lbl">Khớp khoá</div><div class="val">${U.fmtNum(r.matched)}</div></div>
        <div class="kpi"><div class="lbl">Lệch giá trị</div><div class="val" style="color:var(--bad)">${U.fmtNum(r.diffs.length)}</div><div class="sub">${U.fmtNum(nDiffCells)} ô</div></div>
        <div class="kpi"><div class="lbl">Chỉ có ở A</div><div class="val">${U.fmtNum(r.onlyA.length)}</div><div class="sub">thiếu ở B</div></div>
        <div class="kpi"><div class="lbl">Chỉ có ở B</div><div class="val">${U.fmtNum(r.onlyB.length)}</div><div class="sub">thừa so với A</div></div>
        <div class="kpi"><div class="lbl">Khoá trùng</div><div class="val">${r.dupA + r.dupB}</div><div class="sub">A: ${r.dupA} · B: ${r.dupB}</div></div>
      </div>
      ${Object.keys(deltaByCol).length ? `<div class="card"><h3>Tổng chênh lệch theo cột (B − A)</h3><div class="row wrap mt">${Object.entries(deltaByCol).map(([k, v]) => `<span class="chip">${esc(k)}: <b style="color:${v < 0 ? 'var(--bad)' : 'var(--ok)'}">${U.fmtNum(v, 4)}</b></span>`).join('')}</div></div>` : ''}
      <div class="card mt"><div class="cardhead"><div class="row wrap">${Object.entries(tabs).map(([k, l]) => `<button class="btn sm ${R.view === k ? 'primary' : ''}" data-recview="${k}">${l}</button>`).join('')}</div>
        <button class="btn" id="recExport"><svg class="ic"><use href="#i-down"/></svg> Xuất Excel</button></div>
        <div class="tablewrap tall"><table class="tbl">${table}</table></div></div>`;
  }

  function exportReconcile() {
    const R = S.rec, r = R.result;
    const dA = S.datasets.find((d) => d.id === R.a), dB = S.datasets.find((d) => d.id === R.b);
    const wb = XLSX.utils.book_new();
    const add = (aoa, n) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n);
    add([['Bảng A', dA.name], ['Bảng B', dB.name], ['Khớp khoá', r.matched], ['Lệch giá trị', r.diffs.length], ['Chỉ có ở A', r.onlyA.length], ['Chỉ có ở B', r.onlyB.length], ['Khoá trùng A', r.dupA], ['Khoá trùng B', r.dupB]], 'Tổng hợp');
    add([['Khoá', 'Dòng A', 'Dòng B', 'Cột A', 'Cột B', 'Giá trị A', 'Giá trị B', 'Chênh (B-A)']].concat(...r.diffs.map((d) => d.diffs.map((x) => [d.key, d.rowA, d.rowB, x.colA, x.colB, x.a, x.b, x.delta == null ? '' : x.delta]))), 'Chênh lệch');
    add([['Khoá', 'Dòng A']].concat(r.onlyA.map((x) => [x.key, x.rowA])), 'Chỉ có ở A');
    add([['Khoá', 'Dòng B']].concat(r.onlyB.map((x) => [x.key, x.rowB])), 'Chỉ có ở B');
    U.download(E.workbookBlob(wb), U.safeName(`Doi chieu - ${dA.name} vs ${dB.name}.xlsx`));
  }

  /* =================== Tab: Quy tắc =================== */
  const RULE_TYPES = { required: 'Bắt buộc nhập', unique: 'Không được trùng', regex: 'Khớp biểu thức (regex)', min: 'Giá trị tối thiểu', max: 'Giá trị tối đa', in: 'Chỉ trong danh sách', len: 'Độ dài ký tự (vd 10 hoặc 8-12)', notfuture: 'Ngày không ở tương lai' };
  function renderRules() {
    const s = settings(), ds = cur();
    const headers = ds && ds.kind === 'table' ? ds.headers : [];
    $('#rulesBody').innerHTML = `
      <div class="card"><h3>Tham số bộ máy</h3>
        <div class="formgrid mt">
          <label class="field">Miền dữ liệu<span class="muted">Tự nhận diện theo tên cột, hoặc ép theo nghiệp vụ</span>
            <select id="rDomain">${[['auto', 'Tự nhận diện'], ['inventory', 'Tồn kho / vật tư'], ['hr', 'Nhân sự / danh bạ'], ['generic', 'Tổng quát']].map(([v, l]) => `<option value="${v}" ${s.domain === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field">Độ nhạy giá trị bất thường (k × IQR)<span class="muted">Nhỏ hơn = bắt nhiều hơn (1.5 – 5)</span><input type="number" id="rK" min="1" max="10" step="0.5" value="${s.outlierK}"></label>
          <label class="field">Cảnh báo sắp hết hạn (ngày)<span class="muted">Áp dụng cho cột Hạn dùng</span><input type="number" id="rExp" min="1" value="${s.expiryWarnDays}"></label>
          <label class="field">So khớp gần đúng<span class="muted">Gộp các giá trị gõ sai 1–2 ký tự</span><label class="check"><input type="checkbox" id="rFuzzy" ${s.fuzzy ? 'checked' : ''}> Bật</label></label>
        </div>
      </div>
      <div class="card mt"><div class="cardhead"><h3>Quy tắc tùy chỉnh (${s.customRules.length})</h3></div>
        <div class="formgrid">
          <label class="field">Tên cột<input type="text" id="nrCol" list="nrCols" placeholder="vd: Mã hàng"><datalist id="nrCols">${headers.map((h) => `<option value="${esc(h)}">`).join('')}</datalist></label>
          <label class="field">Loại quy tắc<select id="nrType">${Object.entries(RULE_TYPES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
          <label class="field">Giá trị<input type="text" id="nrVal" placeholder="vd: ^VT-\\d{4}$ hoặc Cái,Hộp,Thùng"></label>
          <label class="field">Mức độ<select id="nrSev">${Object.keys(A.SEV).filter((k) => k !== 'info').map((k) => `<option value="${k}" ${k === 'medium' ? 'selected' : ''}>${A.SEV[k].label}</option>`).join('')}</select></label>
          <label class="field">Thông báo<input type="text" id="nrMsg" placeholder="(tuỳ chọn)"></label>
        </div>
        <div class="row mt"><button class="btn" id="nrAdd">+ Thêm quy tắc</button></div>
        ${s.customRules.length ? `<div class="tablewrap mt"><table class="tbl"><thead><tr><th>Bật</th><th>Cột</th><th>Quy tắc</th><th>Giá trị</th><th>Mức độ</th><th></th></tr></thead><tbody>
          ${s.customRules.map((r, i) => `<tr><td><input type="checkbox" data-rtoggle="${i}" ${r.enabled !== false ? 'checked' : ''}></td><td>${esc(r.col)}</td><td>${RULE_TYPES[r.type]}</td><td class="mono">${esc(r.value || '')}</td><td>${sevBadge(r.sev)}</td><td><button class="btn sm ghost danger" data-rdel="${i}">Xoá</button></td></tr>`).join('')}
        </tbody></table></div>` : ''}
      </div>
      <div class="row mt"><button class="btn primary" id="rApply"><svg class="ic"><use href="#i-play"/></svg> Lưu &amp; phân tích lại tất cả</button></div>
      <div class="card mt"><h3>Bộ máy đang kiểm tra những gì?</h3>
        <div class="grid2 mt" style="font-size:13px">
          <ul class="steps">
            <li><b>Cấu trúc:</b> dòng trống, dòng tổng lẫn trong dữ liệu, cột không tên, trùng tên cột, ô gộp, cột trống.</li>
            <li><b>Thiếu dữ liệu:</b> ô trống ở cột khoá / cột quan trọng, cột thưa.</li>
            <li><b>Trùng lặp:</b> dòng trùng hoàn toàn, trùng mã khoá (tồn kho: mã + kho + lô), email/SĐT/CCCD dùng chung.</li>
            <li><b>Không khớp:</b> cùng mã khác tên/ĐVT/nhóm, một mặt hàng nhiều mã, cùng mã NV khác họ tên/ngày sinh.</li>
            <li><b>Nhập không thống nhất:</b> “Hà Nội / HN / ha noi”, “Cái / cái / pcs / chiếc”, viết tắt phòng ban, gõ sai 1–2 ký tự, lẫn định dạng ngày & dấu thập phân.</li>
          </ul>
          <ul class="steps">
            <li><b>Định dạng:</b> số/ngày lưu dạng chữ, ngày không tồn tại, email, SĐT Việt Nam, CCCD 12 số, MST, họ tên chứa số, font TCVN3, Unicode tổ hợp.</li>
            <li><b>Mẫu mã:</b> mã lệch mẫu chung (VT-9999 vs VT9999), lẫn hoa/thường.</li>
            <li><b>Bất thường:</b> giá trị lệch xa phân bố (IQR), số âm, đơn giá 0.</li>
            <li><b>Logic tồn kho:</b> Tồn cuối = Đầu + Nhập − Xuất, Thành tiền = SL × Đơn giá, xuất vượt tồn, tồn âm, hết hạn / sắp hết hạn, số lẻ với đơn vị đếm.</li>
            <li><b>Logic nhân sự:</b> tuổi &lt; 15 hoặc &gt; 75, ngày vào làm trước 15 tuổi, giới tính không chuẩn, ngày tương lai.</li>
          </ul>
        </div>
      </div>`;
  }

  function saveRuleParams() {
    saveSettings({ domain: $('#rDomain').value, outlierK: +$('#rK').value || 3, expiryWarnDays: +$('#rExp').value || 30, fuzzy: $('#rFuzzy').checked });
  }

  /* =================== Tab: AI =================== */
  function renderAI() {
    const ds = cur(), res = curRes(), s = AI.settings(), body = $('#aiBody');
    if (!res) { body.innerHTML = '<div class="empty-state">Chưa có kết quả phân tích.</div>'; return; }
    const conv = S.ai[ds.id] || { messages: [], view: [] };
    const gem = s.provider === 'gemini';
    body.innerHTML = `
      ${!s.key ? `<div class="note warn">Chưa có ${gem ? 'Gemini' : 'Claude'} API key. Vào <a href="#settings" data-go="settings">Cài đặt</a> để nhập key.</div>` : ''}
      <div class="card ${s.key ? '' : 'mt'}">
        <div class="formgrid">
          <label class="field">Nhà cung cấp AI<select id="aiProvider">${Object.entries(AI.PROVIDERS).map(([k, l]) => `<option value="${k}" ${k === s.provider ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field">Mô hình${gem ? geminiModelSelect('aiModel', s) : `<select id="aiModel">${AI.MODELS.map((m) => `<option value="${m.id}" ${m.id === s.model ? 'selected' : ''}>${m.label}</option>`).join('')}</select>`}</label>
          ${gem ? '' : `<label class="field">Mức suy luận<select id="aiEffort">${[['low', 'Thấp — nhanh'], ['medium', 'Vừa (khuyên dùng)'], ['high', 'Cao'], ['xhigh', 'Rất cao'], ['max', 'Tối đa']].map(([v, l]) => `<option value="${v}" ${v === s.effort ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
          <label class="field">Dữ liệu gửi đi<label class="check"><input type="checkbox" id="aiSamples" ${s.sendSamples ? 'checked' : ''}> Kèm 25 dòng mẫu</label><span class="muted">Luôn gửi thống kê và tối đa 3 ví dụ mỗi loại lỗi; không gửi toàn bộ file.</span></label>
        </div>
        <div class="row mt"><button class="btn primary" id="aiRun" ${s.key ? '' : 'disabled'}><svg class="ic"><use href="#i-ai"/></svg> ${conv.view.length ? 'Phân tích lại từ đầu' : 'Phân tích chuyên sâu'}</button></div>
      </div>
      <div class="card mt aiout" id="aiOut">${conv.view.length ? conv.view.map((m) => `<div class="chatmsg ${m.role}">${m.role === 'user' ? esc(m.text) : marked.parse(m.text)}</div>`).join('') : '<p class="muted">Kết quả nhận định sẽ hiển thị ở đây và được đưa vào báo cáo.</p>'}</div>
      ${conv.view.length ? `<div class="card mt"><label class="field">Hỏi thêm chuyên gia<textarea id="aiAsk" rows="3" placeholder="vd: Viết công thức Excel để chặn trùng mã hàng; nhóm lỗi nào ảnh hưởng giá vốn nhiều nhất?"></textarea></label><div class="row mt"><button class="btn primary" id="aiSend">Gửi</button></div></div>` : ''}`;
  }

  async function aiRun(followUp) {
    const ds = cur(), res = curRes();
    if (AI.settings().provider === 'gemini') saveSettings({ geminiModel: $('#aiModel').value, aiSamples: $('#aiSamples').checked });
    else saveSettings({ claudeModel: $('#aiModel').value, claudeEffort: $('#aiEffort').value, aiSamples: $('#aiSamples').checked });
    let conv = S.ai[ds.id];
    if (!followUp || !conv) {
      const ctx = AI.buildContext(ds, res, $('#aiSamples').checked);
      conv = S.ai[ds.id] = { messages: [{ role: 'user', content: `Dưới đây là kết quả quét chất lượng dữ liệu (JSON):\n${ctx}\n\nHãy viết báo cáo phân tích chuyên gia gồm: (1) Đánh giá tổng quan & mức rủi ro, (2) Phân tích từng nhóm lỗi quan trọng kèm nguyên nhân gốc rễ, (3) Điểm bất thường đáng chú ý khác, (4) Kế hoạch xử lý ưu tiên (ngay / tuần này / dài hạn), (5) Quy tắc kiểm soát & Data Validation đề xuất.` }], view: [{ role: 'user', text: 'Phân tích chuyên sâu toàn bộ kết quả quét' }] };
    } else {
      const q = $('#aiAsk').value.trim(); if (!q) return;
      conv.messages.push({ role: 'user', content: q }); conv.view.push({ role: 'user', text: q });
    }
    U.loading(true, 'Chuyên gia AI đang phân tích…');
    try {
      const r = await AI.call(conv.messages);
      conv.messages.push({ role: 'assistant', content: r.content });
      conv.view.push({ role: 'assistant', text: r.text });
      conv.last = conv.view.filter((m) => m.role === 'assistant').map((m) => m.text).join('\n\n---\n\n');
    } catch (e) {
      conv.messages.pop(); conv.view.pop();
      if (!conv.messages.length) delete S.ai[ds.id];
      U.toast(e.message, 'err', 8000);
    }
    U.loading(false); renderAI();
  }

  /* =================== Tab: Báo cáo =================== */
  function renderReport() {
    const ds = cur(), res = curRes(), fr = $('#reportFrame');
    $$('#reportActions button').forEach((b) => { b.disabled = !res; });
    $('#repDriveLink').innerHTML = S.driveLinks[S.active] ? `<a href="${S.driveLinks[S.active]}" target="_blank" rel="noopener">Mở thư mục trên Drive ↗</a>` : '';
    fr.srcdoc = res ? E.html(ds, res, S.ai[ds.id] && S.ai[ds.id].last) : '<p style="font-family:sans-serif;color:#64748b;padding:24px">Chưa có kết quả phân tích.</p>';
  }

  async function saveToDrive(id) {
    const ds = S.datasets.find((d) => d.id === id), res = S.results[id];
    if (!ds || !res) return;
    U.loading(true, 'Đang kết nối Google Drive…');
    try {
      if (!D.hasToken()) await D.connect('');
      U.loading(true, 'Đang tạo thư mục báo cáo…');
      const folder = await D.reportFolder(ds.name);
      U.loading(true, 'Đang tải báo cáo lên Drive…');
      const aiText = S.ai[ds.id] && S.ai[ds.id].last;
      await D.upload(new Blob([E.html(ds, res, aiText)], { type: 'text/html' }), 'Báo cáo.html', folder.id, 'text/html');
      await D.upload(E.workbookBlob(E.workbook(ds, res)), 'Báo cáo chi tiết.xlsx', folder.id, XLSX_MIME);
      if (aiText) await D.upload(new Blob([aiText], { type: 'text/markdown' }), 'Nhận định AI.md', folder.id, 'text/markdown');
      const f = ds.source && S.files[ds.source.file];
      if (f) await D.upload(f, 'Gốc - ' + f.name, folder.id, f.type);
      await D.backupState(stateSnapshot());
      S.driveLinks[id] = folder.webViewLink;
      const h = U.store.get('history', []); const e = h.find((x) => x.dsId === id); if (e) { e.drive = folder.webViewLink; U.store.set('history', h); }
      U.toast('Đã lưu lên Google Drive ✓', 'ok');
      if (S.tab === 'report') renderReport();
    } catch (e) { console.error(e); U.toast(e.message, 'err', 8000); }
    U.loading(false);
  }

  // Claude key không bao giờ rời trình duyệt; Gemini key chỉ đi kèm khi người dùng bật "sao lưu key vào Drive riêng"
  const stateSnapshot = () => {
    const s = Object.assign({}, U.store.get('settings', {})); delete s.claudeKey;
    if (!s.backupGeminiKey) delete s.geminiKey;
    return { app: 'Master Data Pro', version: 1, savedAt: new Date().toISOString(), settings: s, history: U.store.get('history', []) };
  };

  /* =================== Tab: Lịch sử =================== */
  function renderHistory() {
    const h = U.store.get('history', []), body = $('#histBody');
    body.innerHTML = `
      <div class="card row wrap"><button class="btn" id="hExport"><svg class="ic"><use href="#i-down"/></svg> Xuất Excel</button><button class="btn" id="hBackup"><svg class="ic"><use href="#i-drive"/></svg> Sao lưu lên Drive</button><button class="btn" id="hRestore">Khôi phục từ Drive</button><button class="btn ghost danger ml-auto" id="hClear">Xoá lịch sử</button></div>
      ${h.length ? `<div class="card mt"><h3>Điểm chất lượng theo thời gian</h3><div class="chartbox sm mt"><canvas id="cHist"></canvas></div></div>
      <div class="card mt"><div class="tablewrap tall"><table class="tbl"><thead><tr><th>Thời gian</th><th>Bảng</th><th>Miền</th><th class="num">Dòng</th><th class="num">Lỗi</th><th class="num">NT+Cao</th><th class="num">Điểm</th><th>Drive</th></tr></thead><tbody>
        ${h.map((x) => `<tr><td>${new Date(x.at).toLocaleString('vi-VN')}</td><td>${esc(x.name)}</td><td>${E.domainLabel(x.domain)}</td><td class="num">${U.fmtNum(x.rows)}</td><td class="num">${U.fmtNum(x.issues)}</td><td class="num">${U.fmtNum(x.crit)}</td><td class="num" style="color:${scoreColor(x.score)};font-weight:700">${x.score}</td><td>${x.drive ? `<a href="${esc(x.drive)}" target="_blank" rel="noopener">Mở ↗</a>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div>` : '<div class="empty-state mt">Chưa có lần phân tích nào.</div>'}`;
    if (h.length) {
      const pts = h.slice(0, 60).reverse();
      chart('cHist', { type: 'line', data: { labels: pts.map((x) => new Date(x.at).toLocaleDateString('vi-VN') + ' · ' + x.name.slice(0, 18)), datasets: [{ data: pts.map((x) => x.score), borderColor: U.cssVar('--accent'), backgroundColor: 'rgba(59,130,246,.15)', fill: true, tension: 0.3, pointRadius: 3 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 }, x: { ticks: { display: false }, grid: { display: false } } } } });
    }
  }

  /* =================== Tab: Cài đặt =================== */
  function renderSettings() {
    const s = U.store.get('settings', {}), ai = AI.settings();
    const origin = location.origin;
    const conn = D.hasToken();
    $('#setBody').innerHTML = `
      <div class="grid2">
        <div class="card"><div class="cardhead"><h3><svg class="ic"><use href="#i-drive"/></svg> Google Drive &amp; Sheets</h3><span class="chip ${conn ? 'on' : ''}">${conn ? 'Đã kết nối' + (D.user ? ' · ' + esc(D.user.emailAddress) : '') : 'Chưa kết nối'}</span></div>
          <label class="field">Google OAuth Client ID<input type="text" id="sClient" value="${esc(s.googleClientId || (window.MD_CONFIG && MD_CONFIG.googleClientId) || '')}" placeholder="xxxxxxxx.apps.googleusercontent.com"></label>
          <label class="field mt">Tên thư mục gốc trên Drive<input type="text" id="sFolder" value="${esc(s.driveFolder || 'Master Data Pro')}"></label>
          <label class="check mt"><input type="checkbox" id="sAuto" ${s.autoDrive ? 'checked' : ''}><span>Tự động lưu báo cáo lên Drive sau mỗi lần phân tích (khi đã kết nối)</span></label>
          <div class="row wrap mt"><button class="btn" id="sSaveG">Lưu</button>${conn ? '<button class="btn" id="sOpenRoot">Mở thư mục ↗</button><button class="btn ghost danger" id="sDisc">Ngắt kết nối</button>' : '<button class="btn primary" id="sConn">Kết nối Google</button>'}</div>
          <details class="mt"><summary><b>Hướng dẫn tạo Client ID (5 phút, miễn phí)</b></summary>
            <ol class="steps">
              <li>Mở <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud Console</a> → tạo project “Master Data Pro”.</li>
              <li><b>APIs &amp; Services → Library</b>: bật <b>Google Drive API</b> và <b>Google Sheets API</b>.</li>
              <li><b>OAuth consent screen</b> (Google Auth Platform → Branding/Audience): loại <b>External</b>, điền tên app + email; mục <b>Test users</b> thêm email Google của bạn.</li>
              <li><b>Credentials → Create credentials → OAuth client ID</b> → loại <b>Web application</b>.</li>
              <li><b>Authorized JavaScript origins</b>: thêm <code>${esc(origin)}</code> ${origin !== 'https://crischat.github.io' ? 'và <code>https://crischat.github.io</code>' : ''} → Create.</li>
              <li>Sao chép <b>Client ID</b> dán vào ô bên trên → Lưu → Kết nối Google.</li>
            </ol>
            <p class="muted">Quyền xin: <code>drive.file</code> (chỉ thấy file do app tạo) và <code>spreadsheets.readonly</code> (đọc Google Sheet bạn dán link). Lần đầu Google báo “ứng dụng chưa xác minh” → Nâng cao → Tiếp tục.</p>
          </details>
        </div>
        <div class="card"><div class="cardhead"><h3><svg class="ic"><use href="#i-ai"/></svg> Chuyên gia AI</h3><span class="chip ${ai.key ? 'on' : ''}">${ai.key ? 'Đang dùng ' + (ai.provider === 'gemini' ? 'Gemini' : 'Claude') : 'Chưa có key'}</span></div>
          <label class="field">Nhà cung cấp mặc định<select id="sProvider">${Object.entries(AI.PROVIDERS).map(([k, l]) => `<option value="${k}" ${k === ai.provider ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          ${ai.provider === 'gemini' ? `
          <label class="field mt">Gemini API key<input type="password" id="sGKey" value="${esc(ai.geminiKey)}" placeholder="Dán key Gemini (AI Studio / Google Cloud)" autocomplete="off"></label>
          <label class="field mt">Mô hình Gemini${geminiModelSelect('sGModel', ai)}</label>
          <label class="check mt"><input type="checkbox" id="sGBackup" ${s.backupGeminiKey ? 'checked' : ''}><span>Sao lưu Gemini key vào <b>Google Drive riêng</b> của tôi (để máy khác bấm “Khôi phục từ Drive” là có key)</span></label>
          <p class="muted" style="font-size:12.5px">Lấy key tại <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Nên giới hạn key chỉ cho “Generative Language API”. Gói miễn phí: Google có thể dùng dữ liệu gửi lên để cải thiện sản phẩm — tắt “Kèm 25 dòng mẫu” với dữ liệu nhạy cảm.</p>
          <div class="row wrap mt"><button class="btn" id="sSaveAI">Lưu</button><button class="btn" id="sGList">Tải danh sách mô hình</button><button class="btn" id="sTestAI">Kiểm tra key</button>${ai.geminiKey ? '<button class="btn ghost danger" id="sDelKey">Xoá key</button>' : ''}</div>`
          : `
          <label class="field mt">Claude API key<input type="password" id="sKey" value="${esc(ai.claudeKey)}" placeholder="sk-ant-..." autocomplete="off"></label>
          <p class="muted" style="font-size:12.5px">Key chỉ lưu trên trình duyệt này — không đưa lên GitHub, không sao lưu lên Drive. Lấy key tại <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>.</p>
          <label class="field mt">Mô hình mặc định<select id="sModel">${AI.MODELS.map((m) => `<option value="${m.id}" ${m.id === ai.model ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
          <div class="row wrap mt"><button class="btn" id="sSaveAI">Lưu</button><button class="btn" id="sTestAI">Kiểm tra key</button>${ai.claudeKey ? '<button class="btn ghost danger" id="sDelKey">Xoá key</button>' : ''}</div>`}
        </div>
      </div>
      <div class="grid2 mt">
        <div class="card"><h3>Giao diện</h3>
          <div class="row mt">${[['', 'Theo hệ thống'], ['light', 'Sáng'], ['dark', 'Tối']].map(([v, l]) => `<button class="btn ${(document.documentElement.dataset.theme || '') === v ? 'primary' : ''}" data-theme-set="${v}">${l}</button>`).join('')}</div></div>
        <div class="card"><h3>Dữ liệu trên trình duyệt</h3><p class="muted">File bạn nạp không được gửi đi đâu, trừ khi bạn bấm lưu lên Drive hoặc dùng AI (chỉ gửi bản tóm tắt).</p>
          <div class="row wrap"><button class="btn" id="sExportCfg"><svg class="ic"><use href="#i-down"/></svg> Tải cấu hình (.json)</button><label class="btn">Nhập cấu hình<input type="file" id="sImportCfg" accept=".json" hidden></label><button class="btn ghost danger" id="sReset">Xoá toàn bộ cài đặt</button></div></div>
      </div>`;
  }

  // Ô chọn mô hình Gemini: danh sách lấy từ Google; chưa tải thì để "tự chọn bản Flash mới nhất"
  function geminiModelSelect(id, ai) {
    const list = ai.geminiModels.slice();
    if (ai.geminiModel && !list.some((m) => m.id === ai.geminiModel)) list.unshift({ id: ai.geminiModel, label: ai.geminiModel });
    return `<select id="${id}"><option value="" ${ai.geminiModel ? '' : 'selected'}>Tự chọn (Flash mới nhất)</option>${list.map((m) => `<option value="${esc(m.id)}" ${m.id === ai.geminiModel ? 'selected' : ''}>${esc(m.label)} · ${esc(m.id)}</option>`).join('')}</select>`;
  }

  // Lưu ô cài đặt AI đang hiển thị (Claude hoặc Gemini)
  function saveAIFields() {
    const p = {};
    if ($('#sKey')) Object.assign(p, { claudeKey: $('#sKey').value.trim(), claudeModel: $('#sModel').value });
    if ($('#sGKey')) Object.assign(p, { geminiKey: $('#sGKey').value.trim(), geminiModel: $('#sGModel').value, backupGeminiKey: $('#sGBackup').checked });
    saveSettings(p);
  }

  function applyState(st) {
    if (!st || st.app !== 'Master Data Pro') throw new Error('File cấu hình không hợp lệ');
    const keep = U.store.get('settings', {});
    U.store.set('settings', Object.assign({}, st.settings, { claudeKey: keep.claudeKey, geminiKey: (st.settings && st.settings.geminiKey) || keep.geminiKey }));
    const h = U.store.get('history', []); const ids = new Set(h.map((x) => x.id));
    U.store.set('history', h.concat((st.history || []).filter((x) => !ids.has(x.id))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300));
  }

  /* =================== Gắn sự kiện =================== */
  function bind() {
    $('#sidenav').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });
    $('#navToggle').addEventListener('click', () => $('#sidenav').classList.toggle('open'));
    $('#dsSelect').addEventListener('change', (e) => setActive(e.target.value));
    $('#themeBtn').addEventListener('click', () => {
      const order = ['', 'dark', 'light'], c = document.documentElement.dataset.theme || '';
      setTheme(order[(order.indexOf(c) + 1) % 3]);
    });
    $('#driveChip').addEventListener('click', () => showTab('settings'));
    document.addEventListener('md:drive', updateDriveChip);

    // Nạp file
    const dz = $('#dropZone');
    $('#fileInput').addEventListener('change', (e) => { addFiles(Array.from(e.target.files)); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', (e) => addFiles(Array.from(e.dataTransfer.files)));
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => { if (!dz.contains(e.target)) { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files)); } });
    $('#gsLoad').addEventListener('click', async () => {
      const url = $('#gsUrl').value.trim(); if (!url) return;
      U.loading(true, 'Đang đọc Google Sheet…');
      try { const dss = await P.readGoogleSheet(url); U.loading(false); if (!dss.length) throw new Error('Sheet trống'); await addDatasets(dss); }
      catch (e) { U.loading(false); U.toast(e.message, 'err', 8000); }
    });

    // Uỷ quyền sự kiện chung
    document.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-sample],[data-view],[data-del],[data-go],[data-check],[data-issue],[data-pg],[data-colissues],[data-recview],[data-rdel],[data-theme-set],#analyzeAll,#clearAll,#headerRowApply,#fReset,#fExport,#drawerClose,#cleanPreview,#cleanDownload,#cleanReanalyze,#recRun,#recExport,#nrAdd,#rApply,#aiRun,#aiSend,#repDrive,#repXlsx,#repHtml,#repPrint,#hExport,#hBackup,#hRestore,#hClear,#sSaveG,#sConn,#sDisc,#sOpenRoot,#sSaveAI,#sGList,#sTestAI,#sDelKey,#sExportCfg,#sReset');
      if (!t) return;
      const d = t.dataset;
      if (d.sample) { e.preventDefault(); return addDatasets(MD.Samples[d.sample]()); }
      if (d.view) { setActive(d.view); return showTab('overview'); }
      if (d.del) { S.datasets = S.datasets.filter((x) => x.id !== d.del); delete S.results[d.del]; if (S.active === d.del) S.active = S.datasets[0] ? S.datasets[0].id : null; refreshTop(); return renderUpload(); }
      if (d.go) { e.preventDefault(); return showTab(d.go); }
      if (d.check && t.classList.contains('item')) return gotoIssues({ cat: d.cat, check: d.check });
      if (d.issue) return openRecord(d.issue);
      if (d.pg) { S.page += +d.pg; return renderIssues(); }
      if (d.colissues) { e.preventDefault(); return gotoIssues({ col: d.colissues }); }
      if (d.recview) { S.rec.view = d.recview; return renderRecOut(); }
      if (d.rdel) { const s = settings(); s.customRules.splice(+d.rdel, 1); saveSettings({ customRules: s.customRules }); return renderRules(); }
      if (d.themeSet !== undefined) { setTheme(d.themeSet); return renderSettings(); }
      switch (t.id) {
        case 'analyzeAll': return analyzeList(S.datasets.slice(), false);
        case 'clearAll': S.datasets = []; S.results = {}; S.active = null; S.ai = {}; refreshTop(); return renderUpload();
        case 'headerRowApply': {
          const ds = cur(); const n = +$('#headerRowInput').value - 1;
          if (!ds || !ds.raw || n < 0 || n >= ds.raw.length) return U.toast('Dòng tiêu đề không hợp lệ', 'err');
          const nd = P.fromAOA(ds.raw, ds.name, ds.source, { headerRow: n }); nd.id = ds.id; nd.merges = ds.merges;
          S.datasets[S.datasets.indexOf(ds)] = nd; delete S.ai[ds.id];
          return analyzeList([nd], false);
        }
        case 'fReset': gotoIssues({}); return;
        case 'fExport': return exportIssues();
        case 'drawerClose': $('#drawer').hidden = true; return;
        case 'cleanPreview': return cleanPreview();
        case 'cleanDownload': { const out = doClean(); return U.download(E.cleanBlob(cur(), out.rows), U.safeName(`${cur().name.replace(/\.\w+$/, '')} - da lam sach.xlsx`)); }
        case 'cleanReanalyze': {
          const ds = cur(), before = curRes().score, out = doClean();
          const nd = Object.assign({}, ds, { id: U.uid(), name: ds.name + ' (đã làm sạch)', rows: out.rows, raw: null, merges: 0, blankHeaders: [], source: Object.assign({}, ds.source, { kind: 'cleaned' }) });
          S.datasets.push(nd);
          await analyzeList([nd], true);
          return U.toast(`Điểm: ${before} → ${S.results[nd.id].score}`, 'ok', 6000);
        }
        case 'recRun': return runReconcile();
        case 'recExport': return exportReconcile();
        case 'nrAdd': {
          const col = $('#nrCol').value.trim(); if (!col) return U.toast('Nhập tên cột', 'err');
          const s = settings();
          s.customRules.push({ col, type: $('#nrType').value, value: $('#nrVal').value.trim(), sev: $('#nrSev').value, msg: $('#nrMsg').value.trim(), enabled: true, name: `${col}: ${RULE_TYPES[$('#nrType').value]}` });
          saveRuleParams(); saveSettings({ customRules: s.customRules }); return renderRules();
        }
        case 'rApply': saveRuleParams(); return analyzeList(S.datasets.slice(), false);
        case 'aiRun': return aiRun(false);
        case 'aiSend': return aiRun(true);
        case 'repDrive': return saveToDrive(S.active);
        case 'repXlsx': return U.download(E.workbookBlob(E.workbook(cur(), curRes())), U.safeName(`Bao cao - ${cur().name}.xlsx`));
        case 'repHtml': return U.download(new Blob([E.html(cur(), curRes(), S.ai[S.active] && S.ai[S.active].last)], { type: 'text/html' }), U.safeName(`Bao cao - ${cur().name}.html`));
        case 'repPrint': return $('#reportFrame').contentWindow.print();
        case 'hExport': {
          const h = U.store.get('history', []);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Thời gian', 'Bảng', 'Miền', 'Dòng', 'Cột', 'Lỗi', 'NT+Cao', 'Điểm', 'Drive']].concat(h.map((x) => [new Date(x.at).toLocaleString('vi-VN'), x.name, E.domainLabel(x.domain), x.rows, x.cols, x.issues, x.crit, x.score, x.drive || '']))), 'Lịch sử');
          return U.download(E.workbookBlob(wb), 'Lich su phan tich.xlsx');
        }
        case 'hBackup': U.loading(true, 'Đang sao lưu…'); try { const f = await D.backupState(stateSnapshot()); U.toast('Đã sao lưu lên Drive: ' + f.name, 'ok'); } catch (er) { U.toast(er.message, 'err', 8000); } U.loading(false); return;
        case 'hRestore': U.loading(true, 'Đang khôi phục…'); try { const st = await D.restoreState(); if (!st) throw new Error('Chưa có bản sao lưu trên Drive'); applyState(st); U.toast('Đã khôi phục cấu hình & lịch sử', 'ok'); renderHistory(); } catch (er) { U.toast(er.message, 'err', 8000); } U.loading(false); return;
        case 'hClear': if (confirm('Xoá toàn bộ lịch sử phân tích trên trình duyệt này?')) { U.store.set('history', []); renderHistory(); } return;
        case 'sSaveG': saveSettings({ googleClientId: $('#sClient').value.trim(), driveFolder: $('#sFolder').value.trim() || 'Master Data Pro', autoDrive: $('#sAuto').checked }); D.resetClient(); U.toast('Đã lưu', 'ok'); return renderSettings();
        case 'sConn': saveSettings({ googleClientId: $('#sClient').value.trim(), driveFolder: $('#sFolder').value.trim() || 'Master Data Pro', autoDrive: $('#sAuto').checked }); D.resetClient();
          try { await D.connect('consent'); U.toast('Đã kết nối Google', 'ok'); } catch (er) { U.toast(er.message, 'err', 8000); } return renderSettings();
        case 'sDisc': D.disconnect(); return renderSettings();
        case 'sOpenRoot': try { const r = await D.root(); window.open(r.webViewLink, '_blank', 'noopener'); } catch (er) { U.toast(er.message, 'err'); } return;
        case 'sSaveAI': saveAIFields(); U.toast('Đã lưu', 'ok'); return renderSettings();
        case 'sGList': saveAIFields(); U.loading(true, 'Đang lấy danh sách mô hình Gemini…');
          try {
            const list = await AI.listGeminiModels(AI.settings().geminiKey);
            const keep = AI.settings().geminiModel;
            saveSettings({ geminiModels: list, geminiModel: list.some((m) => m.id === keep) ? keep : AI.pickGeminiDefault(list) });
            U.toast(`Có ${list.length} mô hình Gemini dùng được`, 'ok');
          } catch (er) { U.toast(er.message, 'err', 8000); }
          U.loading(false); return renderSettings();
        case 'sTestAI': saveAIFields(); U.loading(true, 'Đang kiểm tra key…');
          try { const r = await AI.call([{ role: 'user', content: 'Trả lời đúng một từ: OK' }], { effort: 'low', maxTokens: 64 }); U.toast('Key hoạt động ✓ (' + r.model + ')', 'ok'); } catch (er) { U.toast(er.message, 'err', 8000); } U.loading(false); return renderSettings();
        case 'sDelKey': saveSettings(AI.settings().provider === 'gemini' ? { geminiKey: '' } : { claudeKey: '' }); return renderSettings();
        case 'sExportCfg': return U.download(new Blob([JSON.stringify(stateSnapshot(), null, 2)], { type: 'application/json' }), 'master-data-state.json');
        case 'sReset': if (confirm('Xoá toàn bộ cài đặt, quy tắc, key và lịch sử trên trình duyệt này?')) { ['settings', 'history', 'theme'].forEach(U.store.del); location.reload(); } return;
      }
    });

    document.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.closest('#fSev')) { S.f.sev = new Set($$('#fSev input').filter((x) => x.checked).map((x) => x.value)); S.page = 0; return renderIssues(); }
      if (t.id === 'fCat') { S.f.cat = t.value; S.f.check = ''; S.page = 0; return renderIssues(); }
      if (t.id === 'fCheck') { S.f.check = t.value; S.page = 0; return renderIssues(); }
      if (t.id === 'fCol') { S.f.col = t.value; S.page = 0; return renderIssues(); }
      if (t.id === 'recA') { S.rec.a = t.value; S.rec.keyA = null; return renderReconcile(); }
      if (t.id === 'recB') { S.rec.b = t.value; S.rec.keyA = null; return renderReconcile(); }
      if (t.dataset.rtoggle) { const s = settings(); s.customRules[+t.dataset.rtoggle].enabled = t.checked; return saveSettings({ customRules: s.customRules }); }
      if (t.id === 'sProvider') { saveAIFields(); saveSettings({ aiProvider: t.value }); return renderSettings(); }
      if (t.id === 'aiProvider') { saveSettings({ aiProvider: t.value }); return renderAI(); }
      if (t.id === 'sImportCfg' && t.files[0]) { try { applyState(JSON.parse(await t.files[0].text())); U.toast('Đã nhập cấu hình', 'ok'); renderSettings(); } catch (er) { U.toast(er.message, 'err'); } }
    });
    $('#fSearch').addEventListener('input', U.debounce((e) => { S.f.q = e.target.value; S.page = 0; renderIssues(); }, 250));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#drawer').hidden = true; });
  }

  function setTheme(v) {
    if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme;
    U.store.set('theme', v || null);
    if (!v) U.store.del('theme');
    render(S.tab);
  }

  function updateDriveChip() {
    const c = $('#driveChip'), on = D.hasToken();
    c.classList.toggle('on', on);
    c.querySelector('span').textContent = on ? 'Drive: đã kết nối' : 'Drive: chưa kết nối';
  }

  bind();
  refreshTop();
  const start = (location.hash || '').slice(1);
  showTab($(`.sidenav button[data-tab="${start}"]`) ? start : 'upload');
})(window.MD);
