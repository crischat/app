/* Master Data Pro — Báo cáo dữ liệu: lọc theo ngày / danh mục, biểu đồ, pivot, bảng dữ liệu */
(function (MD) {
  'use strict';
  const U = MD.U, A = MD.Analyzer;
  const { esc, $, $$ } = U;
  const Dh = {};
  const charts = {};
  const PALETTE = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'];
  Dh.AGG = { sum: 'Tổng', avg: 'Trung bình', count: 'Đếm dòng', distinct: 'Đếm giá trị khác nhau', max: 'Lớn nhất', min: 'Nhỏ nhất' };
  const GRAN = { auto: 'Tự động', day: 'Ngày', week: 'Tuần', month: 'Tháng', quarter: 'Quý', year: 'Năm' };
  const EMPTY = '(trống)';
  const PAGE = 100;
  // thứ tự ưu tiên khi chọn cột nhóm mặc định
  const DIM_PRI = ['team', 'dept', 'category', 'status', 'warehouse', 'supplier', 'position', 'unit', 'gender', 'address', 'person_name', 'name_item'];
  const MEASURE_PRI = ['amount', 'closing', 'qty', 'inflow', 'outflow', 'price', 'opening'];

  /* ---------- Chuẩn bị dữ liệu (cache theo dataset) ---------- */
  Dh.prepare = (ds, res) => {
    if (ds._dash && ds._dash.resAt === res.at) return ds._dash;
    const H = ds.headers, R = ds.rows, P = res.profile;
    const skip = new Set(res.issues.filter((it) => it.check === 'Dòng trống giữa bảng' || it.check === 'Dòng tổng lẫn trong dữ liệu').map((it) => it.row));
    const rows = []; for (let i = 0; i < R.length; i++) if (!skip.has(i)) rows.push(i);
    const dateCols = P.filter((p) => p.type === 'date').map((p) => p.idx);
    const numCols = P.filter((p) => p.type === 'number' && p.role !== 'index').map((p) => p.idx);
    const textish = P.filter((p) => ['text', 'mixed', 'code'].includes(p.type) && p.unique >= 2);
    const catCols = textish.filter((p) => p.unique <= 300 && (p.uniqueRatio < 0.9 || DIM_PRI.includes(p.role)))
      .sort((a, b) => rank(a.role, DIM_PRI) - rank(b.role, DIM_PRI) || a.unique - b.unique).map((p) => p.idx);
    // cột "nhãn" cho Top N: chữ gần như duy nhất (title, tên hàng, họ tên...)
    const labelCols = textish.filter((p) => !catCols.includes(p.idx) || p.uniqueRatio >= 0.5).map((p) => p.idx)
      .concat(catCols).filter((v, i, a) => a.indexOf(v) === i);
    const dates = {}, nums = {}, cats = {};
    dateCols.forEach((j) => { dates[j] = R.map((r) => U.toDate(r[j])); });
    numCols.forEach((j) => { nums[j] = R.map((r) => U.toNum(r[j])); });
    textish.forEach((p) => { cats[p.idx] = R.map((r) => { const s = A.cleanWS(U.display(r[p.idx])); return s || EMPTY; }); });
    const values = {};
    catCols.forEach((j) => {
      const m = new Map(); rows.forEach((i) => m.set(cats[j][i], (m.get(cats[j][i]) || 0) + 1));
      values[j] = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    });
    ds._dash = { resAt: res.at, rows, dateCols, numCols, catCols, labelCols, dates, nums, cats, values, headers: H };
    return ds._dash;
  };
  const rank = (r, list) => { const i = list.indexOf(r); return i < 0 ? 99 : i; };

  Dh.defaultState = (ds, res) => {
    const C = Dh.prepare(ds, res), P = res.profile;
    const measure = C.numCols.slice().sort((a, b) => rank(P[a].role, MEASURE_PRI) - rank(P[b].role, MEASURE_PRI))[0];
    return {
      dateCol: C.dateCols.length ? C.dateCols[0] : -1, from: '', to: '', f: {}, q: '',
      measure: measure != null ? measure : -1, agg: measure != null ? 'sum' : 'count',
      dimA: C.catCols.length ? C.catCols[0] : -1, dimB: C.catCols.length > 1 ? C.catCols[1] : -1,
      label: C.labelCols.length ? C.labelCols[0] : -1, gran: 'auto', sort: null, dir: 1, page: 0
    };
  };

  /* ---------- Lọc & gộp ---------- */
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  Dh.filter = (ds, C, st) => {
    const from = st.from ? new Date(st.from + 'T00:00:00') : null, to = st.to ? new Date(st.to + 'T23:59:59') : null;
    const fs = Object.entries(st.f).filter(([, s]) => s && s.size).map(([j, s]) => [+j, s]);
    const q = st.q ? U.key(st.q) : '';
    return C.rows.filter((i) => {
      if (st.dateCol >= 0 && (from || to)) {
        const d = C.dates[st.dateCol][i];
        if (!d || (from && d < from) || (to && d > to)) return false;
      }
      for (const [j, s] of fs) if (!s.has(C.cats[j][i])) return false;
      if (q && !U.key(ds.rows[i].map(U.display).join(' ')).includes(q)) return false;
      return true;
    });
  };

  const valOf = (C, st, i) => (st.measure >= 0 ? C.nums[st.measure][i] : null);
  // gộp theo nhóm: trả Map key -> {v, n}
  function group(C, st, idx, keyFn) {
    const m = new Map();
    idx.forEach((i) => {
      const k = keyFn(i); if (k == null) return;
      let g = m.get(k); if (!g) { g = { sum: 0, n: 0, cnt: 0, max: -Infinity, min: Infinity, set: null }; m.set(k, g); }
      g.cnt++;
      const v = valOf(C, st, i);
      if (v != null) { g.sum += v; g.n++; if (v > g.max) g.max = v; if (v < g.min) g.min = v; }
      if (st.agg === 'distinct' && st.label >= 0) { (g.set = g.set || new Set()).add(C.cats[st.label][i]); }
    });
    const out = new Map();
    m.forEach((g, k) => out.set(k, aggVal(g, st)));
    return out;
  }
  function aggVal(g, st) {
    if (st.agg === 'count' || st.measure < 0) return g.cnt;
    if (st.agg === 'distinct') return g.set ? g.set.size : 0;
    if (st.agg === 'avg') return g.n ? g.sum / g.n : 0;
    if (st.agg === 'max') return g.n ? g.max : 0;
    if (st.agg === 'min') return g.n ? g.min : 0;
    return g.sum;
  }
  const total = (C, st, idx) => { const m = group(C, st, idx, () => 'all'); return m.get('all') || 0; };

  function periodKey(d, gran) {
    if (!d) return null;
    if (gran === 'day') return ymd(d);
    if (gran === 'week') { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return ymd(x); }
    if (gran === 'month') return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (gran === 'quarter') return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1);
    return String(d.getFullYear());
  }
  function periodLabel(k, gran) {
    if (gran === 'day') { const [y, m, d] = k.split('-'); return `${d}/${m}/${y.slice(2)}`; }
    if (gran === 'week') { const [y, m, d] = k.split('-'); return `T ${d}/${m}/${y.slice(2)}`; }
    if (gran === 'month') { const [y, m] = k.split('-'); return `${m}/${y}`; }
    if (gran === 'quarter') { const [y, q] = k.split('-'); return `${q}/${y}`; }
    return k;
  }
  function autoGran(C, st, idx) {
    if (st.gran !== 'auto') return st.gran;
    let mn = Infinity, mx = -Infinity;
    idx.forEach((i) => { const d = C.dates[st.dateCol][i]; if (d) { const t = +d; if (t < mn) mn = t; if (t > mx) mx = t; } });
    const days = (mx - mn) / 86400000;
    return !isFinite(days) ? 'month' : days <= 45 ? 'day' : days <= 180 ? 'week' : days <= 1100 ? 'month' : days <= 2500 ? 'quarter' : 'year';
  }

  const fmt = (v, st) => (st.agg === 'avg' ? U.fmtNum(v, 2) : U.fmtNum(v, 2));
  const measureName = (C, st) => (st.agg === 'count' || st.measure < 0 ? 'Số dòng' : st.agg === 'distinct' ? `Số ${C.headers[st.label]} khác nhau` : `${Dh.AGG[st.agg]} ${C.headers[st.measure]}`);
  Dh.measureName = measureName;

  /* ---------- Tính toàn bộ số liệu cho 1 trạng thái ---------- */
  Dh.compute = (ds, res, st) => {
    const C = Dh.prepare(ds, res);
    const idx = Dh.filter(ds, C, st);
    const out = { C, idx, measure: measureName(C, st) };
    out.kpis = [{ label: 'Số dòng', value: U.fmtNum(idx.length), sub: idx.length !== C.rows.length ? `/ ${U.fmtNum(C.rows.length)} dòng` : 'toàn bộ' }];
    C.numCols.slice(0, 4).forEach((j) => {
      let s = 0, n = 0; idx.forEach((i) => { const v = C.nums[j][i]; if (v != null) { s += v; n++; } });
      out.kpis.push({ label: 'Tổng ' + C.headers[j], value: U.fmtNum(s, 2), sub: n ? 'TB ' + U.fmtNum(s / n, 2) : '' });
    });
    if (st.dateCol >= 0) {
      let mn = null, mx = null; idx.forEach((i) => { const d = C.dates[st.dateCol][i]; if (d) { if (!mn || d < mn) mn = d; if (!mx || d > mx) mx = d; } });
      out.kpis.push({ label: C.headers[st.dateCol], value: mn ? U.fmtDate(mn) : '—', sub: mx ? 'đến ' + U.fmtDate(mx) : '' });
    }
    // xu hướng
    if (st.dateCol >= 0) {
      const gran = autoGran(C, st, idx);
      const keyFn = (i) => periodKey(C.dates[st.dateCol][i], gran);
      const tot = group(C, st, idx, keyFn);
      const keys = Array.from(tot.keys()).sort();
      out.trend = { gran, keys, labels: keys.map((k) => periodLabel(k, gran)), total: keys.map((k) => tot.get(k)) };
      if (st.dimB >= 0 && keys.length <= 80) {
        const top = topKeys(group(C, st, idx, (i) => C.cats[st.dimB][i]), 6);
        out.trend.series = top.map((name) => {
          const m = group(C, st, idx.filter((i) => C.cats[st.dimB][i] === name), keyFn);
          return { name, data: keys.map((k) => m.get(k) || 0) };
        });
        const rest = idx.filter((i) => !top.includes(C.cats[st.dimB][i]));
        if (rest.length) { const m = group(C, st, rest, keyFn); out.trend.series.push({ name: 'Khác', data: keys.map((k) => m.get(k) || 0) }); }
      }
    }
    // phân bổ theo nhóm A
    if (st.dimA >= 0) {
      const m = group(C, st, idx, (i) => C.cats[st.dimA][i]);
      out.byA = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    }
    if (st.dimB >= 0) {
      const m = group(C, st, idx, (i) => C.cats[st.dimB][i]);
      out.byB = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    }
    // Top N theo nhãn
    if (st.label >= 0) {
      const m = group(C, Object.assign({}, st, st.agg === 'distinct' ? { agg: 'count' } : {}), idx, (i) => C.cats[st.label][i]);
      out.top = Array.from(m.entries()).filter(([k]) => k !== EMPTY).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }
    // pivot A × B
    if (st.dimA >= 0) {
      const rowsK = (out.byA || []).slice(0, 15).map((x) => x[0]);
      const colsK = st.dimB >= 0 && st.dimB !== st.dimA ? (out.byB || []).slice(0, 8).map((x) => x[0]) : [];
      const grand = total(C, st, idx);
      out.pivot = {
        rows: rowsK, cols: colsK, grand,
        cells: rowsK.map((r) => {
          const sub = idx.filter((i) => C.cats[st.dimA][i] === r);
          const byCol = colsK.length ? group(C, st, sub, (i) => C.cats[st.dimB][i]) : new Map();
          return { total: total(C, st, sub), n: sub.length, vals: colsK.map((c) => byCol.get(c) || 0) };
        })
      };
    }
    return out;
  };
  const topKeys = (m, n) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);

  /* ---------- Mô tả bộ lọc (dùng cho báo cáo) ---------- */
  Dh.describe = (C, st) => {
    const parts = [];
    if (st.dateCol >= 0 && (st.from || st.to)) parts.push(`${C.headers[st.dateCol]}: ${st.from ? U.fmtDate(new Date(st.from + 'T00:00')) : '…'} → ${st.to ? U.fmtDate(new Date(st.to + 'T00:00')) : '…'}`);
    Object.entries(st.f).forEach(([j, s]) => { if (s && s.size) parts.push(`${C.headers[j]}: ${Array.from(s).slice(0, 6).join(', ')}${s.size > 6 ? '…' : ''}`); });
    if (st.q) parts.push(`Tìm "${st.q}"`);
    return parts.length ? parts.join(' · ') : 'Không lọc (toàn bộ dữ liệu)';
  };

  /* ---------- Tóm tắt để đưa vào báo cáo HTML/Excel ---------- */
  Dh.summary = (ds, res, st) => {
    if (!res || res.kind !== 'table') return null;
    const o = Dh.compute(ds, res, st), C = o.C;
    return {
      filters: Dh.describe(C, st), measure: o.measure, kpis: o.kpis,
      trend: o.trend ? { title: `${o.measure} theo ${GRAN[o.trend.gran].toLowerCase()}`, items: o.trend.labels.map((k, i) => ({ k, v: o.trend.total[i] })) } : null,
      byA: o.byA ? { title: `${o.measure} theo ${C.headers[st.dimA]}`, items: o.byA.slice(0, 15).map(([k, v]) => ({ k, v })) } : null,
      byB: o.byB ? { title: `${o.measure} theo ${C.headers[st.dimB]}`, items: o.byB.slice(0, 15).map(([k, v]) => ({ k, v })) } : null,
      top: o.top && o.top.length ? { title: `Top 10 ${C.headers[st.label]}`, items: o.top.map(([k, v]) => ({ k, v })) } : null,
      pivot: o.pivot ? { rowName: C.headers[st.dimA], colName: st.dimB >= 0 ? C.headers[st.dimB] : '', ...o.pivot } : null,
      rows: o.idx
    };
  };

  /* =================== Giao diện =================== */
  const opt = (v, l, sel) => `<option value="${v}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`;

  Dh.renderFilters = (box, ds, res, st) => {
    const C = Dh.prepare(ds, res);
    const msel = (j) => {
      const s = st.f[j], vals = C.values[j];
      return `<details class="msel" data-col="${j}"><summary><b>${esc(C.headers[j])}</b><span>${s && s.size ? s.size + ' đã chọn' : 'Tất cả'}</span></summary>
        <div class="mselpanel">${vals.length > 8 ? '<input type="search" class="mselq" placeholder="Tìm…">' : ''}
          <div class="mselbtns"><button class="btn sm" data-msel-all="${j}">Bỏ chọn (tất cả)</button></div>
          <div class="msellist">${vals.map(([v, n], k) => `<label data-k="${esc(U.key(v))}"><input type="checkbox" data-mv="${j}:${k}" ${s && s.has(v) ? 'checked' : ''}><span>${esc(v)}</span><em>${U.fmtNum(n)}</em></label>`).join('')}</div>
        </div></details>`;
    };
    box.innerHTML = `
      <div class="filters">
        ${C.dateCols.length ? `<label class="field inl">Cột ngày<select data-ds="dateCol">${C.dateCols.map((j) => opt(j, C.headers[j], st.dateCol)).join('')}</select></label>
          <label class="field inl">Từ ngày<input type="date" data-ds="from" value="${st.from}"></label>
          <label class="field inl">Đến ngày<input type="date" data-ds="to" value="${st.to}"></label>
          <div class="row wrap presets">${[['7d', '7 ngày'], ['30d', '30 ngày'], ['month', 'Tháng này'], ['lastmonth', 'Tháng trước'], ['quarter', 'Quý này'], ['year', 'Năm nay'], ['all', 'Tất cả']].map(([k, l]) => `<button class="btn sm" data-preset="${k}">${l}</button>`).join('')}</div>`
        : '<span class="muted">Không có cột ngày tháng — bộ lọc thời gian bị ẩn.</span>'}
      </div>
      <div class="filters mt">
        ${C.catCols.slice(0, 10).map(msel).join('')}
        <input type="search" data-ds="q" placeholder="Tìm trong mọi cột…" value="${esc(st.q)}" class="dashq">
        <button class="btn ghost" data-dash="reset">Xoá lọc</button>
      </div>
      <div class="activef mt" id="dashActive"></div>`;
  };

  Dh.renderControls = (box, ds, res, st) => {
    const C = Dh.prepare(ds, res);
    box.innerHTML = `<div class="filters">
      <label class="field inl">Chỉ số<select data-ds="measure">${opt(-1, 'Số dòng', st.measure)}${C.numCols.map((j) => opt(j, C.headers[j], st.measure)).join('')}</select></label>
      <label class="field inl">Phép tính<select data-ds="agg">${Object.entries(Dh.AGG).map(([k, l]) => opt(k, l, st.agg)).join('')}</select></label>
      <label class="field inl">Nhóm theo<select data-ds="dimA">${opt(-1, '— không —', st.dimA)}${C.catCols.map((j) => opt(j, C.headers[j], st.dimA)).join('')}</select></label>
      <label class="field inl">Tách theo<select data-ds="dimB">${opt(-1, '— không —', st.dimB)}${C.catCols.map((j) => opt(j, C.headers[j], st.dimB)).join('')}</select></label>
      <label class="field inl">Top 10 theo<select data-ds="label">${opt(-1, '— không —', st.label)}${C.labelCols.map((j) => opt(j, C.headers[j], st.label)).join('')}</select></label>
      ${C.dateCols.length ? `<label class="field inl">Chu kỳ<select data-ds="gran">${Object.entries(GRAN).map(([k, l]) => opt(k, l, st.gran)).join('')}</select></label>` : ''}
    </div>`;
  };

  Dh.renderOut = (box, ds, res, st) => {
    const o = Dh.compute(ds, res, st), C = o.C;
    const act = $('#dashActive');
    if (act) act.innerHTML = `<span class="muted">Đang xem:</span> ${esc(Dh.describe(C, st))}`;
    $$('details.msel').forEach((d) => { const j = +d.dataset.col, s = st.f[j]; d.querySelector('summary span').textContent = s && s.size ? s.size + ' đã chọn' : 'Tất cả'; });
    const cardChart = (id, title, extra = '') => `<div class="card"><div class="cardhead"><h3>${esc(title)}</h3>${extra}</div><div class="chartbox"><canvas id="${id}"></canvas></div></div>`;
    const piv = o.pivot;
    box.innerHTML = `
      <div class="kpis">${o.kpis.map((k) => `<div class="kpi"><div class="lbl">${esc(k.label)}</div><div class="val">${esc(k.value)}</div><div class="sub">${esc(k.sub || '')}</div></div>`).join('')}</div>
      ${o.idx.length ? `
      <div class="grid2">
        ${o.trend ? cardChart('dTrend', `${o.measure} theo ${GRAN[o.trend.gran].toLowerCase()}${o.trend.series ? ' · tách theo ' + C.headers[st.dimB] : ''}`) : '<div class="card"><h3>Xu hướng theo thời gian</h3><p class="muted">File không có cột ngày tháng.</p></div>'}
        ${o.byA ? cardChart('dByA', `${o.measure} theo ${C.headers[st.dimA]}`, '<span class="muted">bấm cột để lọc</span>') : '<div class="card"><h3>Phân bổ theo nhóm</h3><p class="muted">Chọn "Nhóm theo".</p></div>'}
      </div>
      <div class="grid2 mt">
        ${o.byB ? cardChart('dByB', `Tỷ trọng theo ${C.headers[st.dimB]}`) : '<div class="card"><h3>Tỷ trọng</h3><p class="muted">Chọn "Tách theo".</p></div>'}
        ${o.top && o.top.length ? cardChart('dTop', `Top 10 ${C.headers[st.label]} — ${st.agg === 'distinct' ? 'Số dòng' : o.measure}`) : '<div class="card"><h3>Top 10</h3><p class="muted">Chọn "Top 10 theo".</p></div>'}
      </div>
      ${piv ? `<div class="card mt"><div class="cardhead"><h3>Bảng tổng hợp: ${esc(C.headers[st.dimA])}${piv.cols.length ? ' × ' + esc(C.headers[st.dimB]) : ''} — ${esc(o.measure)}</h3><button class="btn sm" data-dash="pivotx"><svg class="ic"><use href="#i-down"/></svg> Excel</button></div>
        <div class="tablewrap"><table class="tbl"><thead><tr><th>${esc(C.headers[st.dimA])}</th>${piv.cols.map((c) => `<th class="num">${esc(c)}</th>`).join('')}<th class="num">Tổng</th><th class="num">%</th><th class="num">Số dòng</th></tr></thead><tbody>
        ${piv.rows.map((r, i) => `<tr><td><b>${esc(r)}</b></td>${piv.cells[i].vals.map((v) => `<td class="num">${fmt(v, st)}</td>`).join('')}<td class="num"><b>${fmt(piv.cells[i].total, st)}</b></td><td class="num">${piv.grand ? U.pct(piv.cells[i].total / piv.grand) : ''}</td><td class="num">${U.fmtNum(piv.cells[i].n)}</td></tr>`).join('')}
        <tr><td><b>Tổng cộng</b></td>${piv.cols.map(() => '<td></td>').join('')}<td class="num"><b>${fmt(piv.grand, st)}</b></td><td class="num">100%</td><td class="num">${U.fmtNum(o.idx.length)}</td></tr>
        </tbody></table></div>${(o.byA || []).length > 15 ? `<p class="muted">Hiển thị 15/${o.byA.length} nhóm lớn nhất.</p>` : ''}</div>` : ''}
      ` : '<div class="empty-state">Không có dòng nào khớp bộ lọc.</div>'}
      <div class="card mt"><div class="cardhead"><h3>Dữ liệu đã lọc (${U.fmtNum(o.idx.length)} dòng)</h3><div class="row"><div class="pager" id="dashPager"></div><button class="btn" data-dash="export"><svg class="ic"><use href="#i-down"/></svg> Xuất Excel</button></div></div>
        <div class="tablewrap tall"><table class="tbl compact" id="dashTable"></table></div></div>`;
    renderTable(ds, C, st, o.idx);
    drawCharts(C, st, o);
    return o;
  };

  function renderTable(ds, C, st, idx) {
    let list = idx;
    if (st.sort != null) {
      const j = st.sort, dir = st.dir;
      const key = (i) => { const v = ds.rows[i][j]; const d = v instanceof Date ? +v : null; const n = d != null ? d : U.toNum(v); return n != null ? n : U.key(U.display(v)); };
      list = idx.slice().sort((a, b) => { const x = key(a), y = key(b); return (typeof x === typeof y ? (x < y ? -1 : x > y ? 1 : 0) : typeof x === 'number' ? -1 : 1) * dir; });
    }
    const pages = Math.max(1, Math.ceil(list.length / PAGE)); st.page = Math.min(st.page, pages - 1);
    const pg = $('#dashPager');
    if (pg) pg.innerHTML = pages > 1 ? `<button class="btn sm" data-dpg="-1" ${st.page ? '' : 'disabled'}>‹</button><span class="muted">Trang ${st.page + 1}/${pages}</span><button class="btn sm" data-dpg="1" ${st.page < pages - 1 ? '' : 'disabled'}>›</button>` : '';
    const slice = list.slice(st.page * PAGE, st.page * PAGE + PAGE);
    $('#dashTable').innerHTML = `<thead><tr><th class="rownum">#</th>${ds.headers.map((h, j) => `<th data-dsort="${j}" style="cursor:pointer" title="Bấm để sắp xếp">${esc(h)}${st.sort === j ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>` +
      slice.map((i) => `<tr><td class="rownum">${ds.firstDataRow + i}</td>${ds.rows[i].map((c) => `<td title="${esc(U.display(c))}">${esc(U.display(c))}</td>`).join('')}</tr>`).join('') + '</tbody>';
  }

  function drawCharts(C, st, o) {
    if (!window.Chart) return;
    Object.keys(charts).forEach((k) => { charts[k].destroy(); delete charts[k]; });
    const make = (id, cfg) => { const el = document.getElementById(id); if (el) charts[id] = new Chart(el, cfg); };
    const tick = { callback(v) { return U.fmtNum(v, 1); } };
    if (o.trend) {
      const many = o.trend.keys.length > 40 && !o.trend.series;
      make('dTrend', {
        type: many ? 'line' : 'bar',
        data: { labels: o.trend.labels, datasets: o.trend.series ? o.trend.series.map((s, k) => ({ label: s.name, data: s.data, backgroundColor: PALETTE[k % PALETTE.length], borderRadius: 3, stack: 's' }))
          : [{ label: o.measure, data: o.trend.total, backgroundColor: PALETTE[0], borderColor: PALETTE[0], fill: false, tension: 0.25, pointRadius: 2, borderRadius: 3 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: !!o.trend.series, position: 'bottom', labels: { boxWidth: 10 } } },
          scales: { x: { stacked: !!o.trend.series, grid: { display: false } }, y: { stacked: !!o.trend.series, beginAtZero: true, ticks: tick } } }
      });
    }
    if (o.byA) {
      const items = o.byA.slice(0, 15);
      make('dByA', {
        type: 'bar', data: { labels: items.map(([k]) => k.length > 26 ? k.slice(0, 25) + '…' : k), datasets: [{ data: items.map(([, v]) => v), backgroundColor: items.map(([k]) => (st.f[st.dimA] && st.f[st.dimA].has(k)) ? PALETTE[1] : PALETTE[0]), borderRadius: 4, maxBarThickness: 22 }] },
        options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: tick }, y: { grid: { display: false } } },
          onClick: (e, el) => { if (el[0]) Dh.onDrill && Dh.onDrill(st.dimA, items[el[0].index][0]); } }
      });
    }
    if (o.byB) {
      const top = o.byB.slice(0, 8), rest = o.byB.slice(8).reduce((s, x) => s + x[1], 0);
      const items = rest ? top.concat([['Khác', rest]]) : top;
      make('dByB', {
        type: 'doughnut', data: { labels: items.map(([k]) => k), datasets: [{ data: items.map(([, v]) => v), backgroundColor: items.map((x, k) => PALETTE[k % PALETTE.length]), borderWidth: 1 }] },
        options: { maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'right', labels: { boxWidth: 10 } } },
          onClick: (e, el) => { if (el[0] && items[el[0].index][0] !== 'Khác' || (el[0] && !rest)) Dh.onDrill && Dh.onDrill(st.dimB, items[el[0].index][0]); } }
      });
    }
    if (o.top && o.top.length) {
      make('dTop', {
        type: 'bar', data: { labels: o.top.map(([k]) => k.length > 34 ? k.slice(0, 33) + '…' : k), datasets: [{ data: o.top.map(([, v]) => v), backgroundColor: PALETTE[2], borderRadius: 4, maxBarThickness: 20 }] },
        options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => o.top[it[0].dataIndex][0] } } }, scales: { x: { beginAtZero: true, ticks: tick }, y: { grid: { display: false } } } }
      });
    }
  }

  /* ---------- Bộ chọn nhanh khoảng ngày ---------- */
  Dh.preset = (k) => {
    const t = U.today(), y = t.getFullYear(), m = t.getMonth();
    const r = (a, b) => [a ? ymd(a) : '', b ? ymd(b) : ''];
    if (k === '7d') return r(new Date(y, m, t.getDate() - 6), t);
    if (k === '30d') return r(new Date(y, m, t.getDate() - 29), t);
    if (k === 'month') return r(new Date(y, m, 1), new Date(y, m + 1, 0));
    if (k === 'lastmonth') return r(new Date(y, m - 1, 1), new Date(y, m, 0));
    if (k === 'quarter') { const q = Math.floor(m / 3) * 3; return r(new Date(y, q, 1), new Date(y, q + 3, 0)); }
    if (k === 'year') return r(new Date(y, 0, 1), new Date(y, 11, 31));
    return r(null, null);
  };

  /* ---------- Xuất Excel ---------- */
  Dh.exportRows = (ds, idx) => [ds.headers].concat(idx.map((i) => ds.rows[i]));
  Dh.pivotAOA = (C, st, o) => {
    const p = o.pivot; if (!p) return null;
    return [[C.headers[st.dimA]].concat(p.cols, ['Tổng', '%', 'Số dòng'])]
      .concat(p.rows.map((r, i) => [r].concat(p.cells[i].vals, [p.cells[i].total, p.grand ? p.cells[i].total / p.grand : 0, p.cells[i].n])))
      .concat([['Tổng cộng'].concat(p.cols.map(() => ''), [p.grand, 1, o.idx.length])]);
  };

  MD.Dash = Dh;
})(window.MD);
