/* Master Data Pro — xuất báo cáo Excel / HTML */
(function (MD) {
  'use strict';
  const U = MD.U, A = MD.Analyzer;
  const E = {};

  const sheet = (aoa, widths) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    if (aoa.length > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: aoa[0].length - 1 } }) };
    return ws;
  };

  E.workbook = (ds, res, opts = {}) => {
    const wb = XLSX.utils.book_new();
    const g = A.grade(res.score);
    const sum = [
      ['BÁO CÁO CHẤT LƯỢNG DỮ LIỆU — Master Data Pro'], [],
      ['Tệp / bảng', ds.name], ['Thời điểm', new Date().toLocaleString('vi-VN')],
      ['Miền dữ liệu', domainLabel(res.domain)], ['Số dòng', res.rows], ['Số cột', res.cols],
      ['Điểm chất lượng', res.score + '/100 (' + g.g + ' — ' + g.t + ')'],
      ['Số lỗi', res.issues.length], ['Dòng có lỗi', res.rowsWithIssues], ['Tỷ lệ dòng sạch', U.pct(res.cleanRowRate)], [],
      ['CHIỀU CHẤT LƯỢNG', 'Tỷ lệ']
    ];
    Object.entries(res.dims).forEach(([k, v]) => sum.push([A.DIMS[k], U.pct(v)]));
    sum.push([], ['NHÓM LỖI', 'Số lượng']);
    Object.entries(res.byCat).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => sum.push([A.CATS[k].label, v]));
    sum.push([], ['MỨC ĐỘ', 'Số lượng']);
    Object.keys(A.SEV).forEach((k) => res.bySev[k] && sum.push([A.SEV[k].label, res.bySev[k]]));
    sum.push([], ['KHUYẾN NGHỊ']);
    res.recommendations.forEach((r, i) => sum.push([`${i + 1}. [${A.SEV[r.sev].label}]`, r.text]));
    XLSX.utils.book_append_sheet(wb, sheet(sum, [28, 90]), 'Tổng quan');

    const chk = [['Nhóm', 'Kiểm tra', 'Mức độ', 'Số lượng', 'Cột liên quan', 'Ví dụ']];
    res.checks.forEach((c) => chk.push([A.CATS[c.cat].label, c.check, A.SEV[c.sev].label, c.n, c.cols.join(', '),
      c.sample.slice(0, 3).map((s) => (s.excelRow ? 'Dòng ' + s.excelRow + ': ' : '') + (s.value || '')).join(' ; ')]));
    XLSX.utils.book_append_sheet(wb, sheet(chk, [22, 34, 12, 10, 30, 70]), 'Lỗi theo mục');

    const det = [['#', 'Mức độ', 'Nhóm', 'Kiểm tra', 'Dòng', 'Cột', 'Giá trị', 'Mô tả', 'Đề xuất sửa']];
    res.issues.forEach((it) => det.push([it.id, A.SEV[it.sev].label, A.CATS[it.cat].label, it.check, it.excelRow || '', it.colName || '', it.value || '', it.msg, it.suggest || '']));
    XLSX.utils.book_append_sheet(wb, sheet(det, [6, 12, 20, 30, 8, 20, 30, 60, 24]), 'Chi tiết lỗi');

    if (res.profile && res.profile.length) {
      const pr = [['Cột', 'Vai trò', 'Kiểu', 'Có dữ liệu', 'Trống', '% đầy', 'Giá trị khác nhau', 'Min', 'Max', 'Trung bình', 'Tổng', 'Top giá trị']];
      res.profile.forEach((p) => pr.push([p.name, p.role ? A.ROLE_LABEL[p.role] || p.role : '', p.type, p.filled, p.missing, U.pct(p.fillRate), p.unique,
        p.num ? p.num.min : (p.dateRange ? U.fmtDate(p.dateRange.min) : ''), p.num ? p.num.max : (p.dateRange ? U.fmtDate(p.dateRange.max) : ''),
        p.num ? +p.num.mean.toFixed(4) : '', p.num ? p.num.sum : '', p.top.slice(0, 5).map((t) => `${t.v} (${t.c})`).join(' | ')]));
      XLSX.utils.book_append_sheet(wb, sheet(pr, [24, 14, 10, 10, 8, 8, 10, 12, 12, 12, 14, 60]), 'Hồ sơ cột');
    }
    if (res.clusters && res.clusters.length) {
      const cl = [['Cột', 'Giá trị chuẩn đề xuất', 'Biến thể', 'Số lần']];
      res.clusters.forEach((c) => c.groups.forEach((g) => g.variants.forEach((v) => cl.push([c.colName, g.canonical, v.v, v.c]))));
      XLSX.utils.book_append_sheet(wb, sheet(cl, [22, 30, 30, 8]), 'Biến thể');
    }
    if (ds.kind === 'table') {
      const byRow = new Map();
      res.issues.forEach((it) => { if (it.row >= 0) { if (!byRow.has(it.row)) byRow.set(it.row, []); byRow.get(it.row).push((it.colName ? it.colName + ': ' : '') + it.check); } });
      const data = [['Dòng gốc', 'Số lỗi', 'Chi tiết lỗi'].concat(ds.headers)];
      ds.rows.forEach((r, i) => { const l = byRow.get(i) || []; data.push([ds.firstDataRow + i, l.length, l.join(' ; ')].concat(r)); });
      XLSX.utils.book_append_sheet(wb, sheet(data, [8, 7, 50].concat(ds.headers.map(() => 16))), 'Dữ liệu + lỗi');
    }
    const dash = opts.dash;
    if (dash) {
      const a = [['BÁO CÁO DỮ LIỆU'], ['Bộ lọc', dash.filters], ['Chỉ số', dash.measure], []];
      dash.kpis.forEach((k) => a.push([k.label, k.value, k.sub || '']));
      [dash.trend, dash.byA, dash.byB, dash.top].filter(Boolean).forEach((sec) => {
        a.push([], [sec.title.toUpperCase(), 'Giá trị']);
        sec.items.forEach((it) => a.push([it.k, it.v]));
      });
      XLSX.utils.book_append_sheet(wb, sheet(a, [34, 22, 18]), 'Báo cáo dữ liệu');
      const p = dash.pivot;
      if (p) {
        const pv = [[p.rowName].concat(p.cols, ['Tổng', '%', 'Số dòng'])]
          .concat(p.rows.map((r, i) => [r].concat(p.cells[i].vals, [p.cells[i].total, p.grand ? +(p.cells[i].total / p.grand).toFixed(4) : 0, p.cells[i].n])))
          .concat([['Tổng cộng'].concat(p.cols.map(() => ''), [p.grand, 1, dash.rows.length])]);
        XLSX.utils.book_append_sheet(wb, sheet(pv, [26].concat(p.cols.map(() => 14), [14, 8, 10])), 'Tổng hợp');
      }
      if (dash.rows.length !== ds.rows.length) {
        XLSX.utils.book_append_sheet(wb, sheet([ds.headers].concat(dash.rows.map((i) => ds.rows[i])), ds.headers.map(() => 16)), 'Dữ liệu đã lọc');
      }
    }
    if (opts.cleanRows) {
      XLSX.utils.book_append_sheet(wb, sheet([ds.headers].concat(opts.cleanRows), ds.headers.map(() => 16)), 'Dữ liệu sạch');
    }
    return wb;
  };

  E.workbookBlob = (wb) => new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  E.cleanBlob = (ds, rows) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet([ds.headers].concat(rows), ds.headers.map(() => 16)), 'Dữ liệu sạch');
    return E.workbookBlob(wb);
  };

  const domainLabel = (d) => ({ inventory: 'Tồn kho / vật tư', hr: 'Nhân sự / danh bạ', generic: 'Tổng quát', document: 'Tài liệu văn bản' }[d] || d);
  E.domainLabel = domainLabel;

  /* ---------- SVG biểu đồ thanh ngang (dùng trong HTML độc lập) ---------- */
  const svgBars = (items, max) => {
    max = max || Math.max(1, ...items.map((i) => i.v));
    const h = 26, w = 520, lw = 190;
    return `<svg viewBox="0 0 ${w} ${items.length * h + 4}" width="100%" role="img" style="max-width:${w}px">` + items.map((it, i) => {
      const bw = Math.max(2, (w - lw - 60) * it.v / max);
      return `<text x="0" y="${i * h + 17}" font-size="12" fill="#334155">${U.esc(it.k.length > 28 ? it.k.slice(0, 27) + '…' : it.k)}</text>` +
        `<rect x="${lw}" y="${i * h + 5}" width="${bw}" height="16" rx="3" fill="${it.c || '#2563eb'}"/>` +
        `<text x="${lw + bw + 6}" y="${i * h + 17}" font-size="12" fill="#0f172a">${U.fmtNum(it.v)}</text>`;
    }).join('') + '</svg>';
  };

  // Phần "Báo cáo dữ liệu" (nội dung file: chỉ số, xu hướng, phân bổ, top, bảng tổng hợp)
  const dataSection = (d) => {
    if (!d) return '';
    const bars = (sec, color) => sec ? `<div><h3>${U.esc(sec.title)}</h3>${svgBars(sec.items.slice(0, 15).map((it) => ({ k: it.k, v: it.v, c: color })))}</div>` : '';
    const p = d.pivot;
    const pivot = p ? `<h3>Bảng tổng hợp: ${U.esc(p.rowName)}${p.cols.length ? ' × ' + U.esc(p.colName) : ''} — ${U.esc(d.measure)}</h3>
      <table><thead><tr><th>${U.esc(p.rowName)}</th>${p.cols.map((c) => `<th>${U.esc(c)}</th>`).join('')}<th>Tổng</th><th>%</th><th>Số dòng</th></tr></thead><tbody>
      ${p.rows.map((r, i) => `<tr><td><b>${U.esc(r)}</b></td>${p.cells[i].vals.map((v) => `<td>${U.fmtNum(v, 2)}</td>`).join('')}<td><b>${U.fmtNum(p.cells[i].total, 2)}</b></td><td>${p.grand ? U.pct(p.cells[i].total / p.grand) : ''}</td><td>${U.fmtNum(p.cells[i].n)}</td></tr>`).join('')}
      <tr><td><b>Tổng cộng</b></td>${p.cols.map(() => '<td></td>').join('')}<td><b>${U.fmtNum(p.grand, 2)}</b></td><td>100%</td><td>${U.fmtNum(d.rows.length)}</td></tr></tbody></table>` : '';
    const trend = d.trend ? `<h3>${U.esc(d.trend.title)}</h3>${d.trend.items.length > 24
      ? `<table><thead><tr><th>Kỳ</th><th>Giá trị</th></tr></thead><tbody>${d.trend.items.map((it) => `<tr><td>${U.esc(it.k)}</td><td>${U.fmtNum(it.v, 2)}</td></tr>`).join('')}</tbody></table>`
      : svgBars(d.trend.items.map((it) => ({ k: it.k, v: it.v, c: '#2563eb' })))}` : '';
    return `<section><h2>A. Báo cáo dữ liệu</h2><p class="muted">Bộ lọc: ${U.esc(d.filters)}</p>
      <div class="kpis">${d.kpis.map((k) => `<div class="kpi"><span>${U.esc(k.label)}</span><b>${U.esc(k.value)}</b><span>${U.esc(k.sub || '')}</span></div>`).join('')}</div>
      ${trend}<div class="grid2">${bars(d.byA, '#2563eb')}${bars(d.byB, '#8b5cf6')}</div>${bars(d.top, '#10b981')}${pivot}</section>
      <h2 style="margin-top:40px">B. Chất lượng dữ liệu</h2>`;
  };

  E.html = (ds, res, aiText, dash) => {
    const g = A.grade(res.score);
    const sevColor = { critical: '#b91c1c', high: '#dc2626', medium: '#d97706', low: '#64748b', info: '#0ea5e9' };
    const catItems = Object.entries(res.byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k: A.CATS[k].label, v, c: A.CATS[k].color }));
    const colItems = Object.entries(res.byCol).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => ({ k, v, c: '#475569' }));
    const groups = {};
    res.checks.forEach((c) => { (groups[c.cat] = groups[c.cat] || []).push(c); });
    const sections = Object.keys(A.CATS).filter((k) => groups[k]).map((cat, si) => {
      const list = groups[cat];
      const total = list.reduce((s, c) => s + c.n, 0);
      return `<section><h2>${si + 1}. ${A.CATS[cat].label} <small>${U.fmtNum(total)} lỗi</small></h2>` + list.map((c) => `
        <h3><span class="sev" style="background:${sevColor[c.sev]}">${A.SEV[c.sev].label}</span> ${U.esc(c.check)} — ${U.fmtNum(c.n)}</h3>
        ${c.cols.length ? `<p class="muted">Cột: ${U.esc(c.cols.join(', '))}</p>` : ''}
        <table><thead><tr><th>Dòng</th><th>Cột</th><th>Giá trị</th><th>Mô tả</th><th>Đề xuất</th></tr></thead><tbody>
        ${res.issues.filter((it) => it.cat === c.cat && it.check === c.check).slice(0, 15).map((it) => `<tr><td>${it.excelRow || '—'}</td><td>${U.esc(it.colName)}</td><td>${U.esc(it.value)}</td><td>${U.esc(it.msg)}</td><td>${U.esc(it.suggest || '')}</td></tr>`).join('')}
        </tbody></table>${c.n > 15 ? `<p class="muted">… và ${U.fmtNum(c.n - 15)} dòng khác (xem file Excel kèm theo)</p>` : ''}`).join('') + '</section>';
    }).join('');
    const prof = (res.profile || []).map((p) => `<tr><td>${U.esc(p.name)}</td><td>${p.role ? A.ROLE_LABEL[p.role] || p.role : ''}</td><td>${p.type}</td><td>${U.pct(p.fillRate, 0)}</td><td>${U.fmtNum(p.unique)}</td><td>${U.esc(p.top.slice(0, 3).map((t) => t.v).join(', '))}</td></tr>`).join('');
    const ai = aiText && window.marked ? `<section><h2>Nhận định của chuyên gia AI</h2><div class="ai">${marked.parse(aiText)}</div></section>` : '';
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Báo cáo chất lượng dữ liệu — ${U.esc(ds.name)}</title>
<style>
body{font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;margin:0;background:#f8fafc;line-height:1.5}
.wrap{max-width:1000px;margin:0 auto;padding:32px 20px}
header{border-bottom:3px solid #1d4ed8;padding-bottom:16px;margin-bottom:24px}
h1{margin:0 0 4px;font-size:26px}h2{font-size:20px;margin:32px 0 12px;border-left:4px solid #1d4ed8;padding-left:10px}
h2 small{font-weight:500;color:#64748b;font-size:14px}h3{font-size:15px;margin:18px 0 6px}
.muted{color:#64748b;font-size:13px;margin:2px 0 8px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.kpi{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px}.kpi b{display:block;font-size:24px}
.kpi span{color:#64748b;font-size:13px}
.score{font-size:44px;font-weight:800;color:${res.score >= 80 ? '#15803d' : res.score >= 65 ? '#b45309' : '#b91c1c'}}
table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;margin:6px 0}
th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f5f9}
.sev{color:#fff;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:600;vertical-align:middle}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}@media(max-width:720px){.grid2{grid-template-columns:1fr}}
.rec li{margin:6px 0}.ai{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:8px 18px}
footer{margin-top:40px;color:#94a3b8;font-size:12px;text-align:center}
@media print{body{background:#fff}.wrap{padding:0}section{page-break-inside:auto}h2{page-break-after:avoid}}
</style></head><body><div class="wrap">
<header><h1>${dash ? 'Báo cáo dữ liệu &amp; chất lượng' : 'Báo cáo chất lượng dữ liệu'}</h1><div class="muted">${U.esc(ds.name)} · ${domainLabel(res.domain)} · ${new Date().toLocaleString('vi-VN')}</div></header>
${dataSection(dash)}
<div class="kpis">
<div class="kpi"><span>Điểm chất lượng</span><div class="score">${res.score}<small style="font-size:16px">/100</small></div><span>Hạng ${g.g} — ${g.t}</span></div>
<div class="kpi"><span>Số dòng</span><b>${U.fmtNum(res.rows)}</b></div>
<div class="kpi"><span>Tổng số lỗi</span><b>${U.fmtNum(res.issues.length)}</b></div>
<div class="kpi"><span>Dòng có lỗi</span><b>${U.fmtNum(res.rowsWithIssues)}</b><span>${U.pct(1 - res.cleanRowRate)} số dòng</span></div>
<div class="kpi"><span>Nghiêm trọng + Cao</span><b style="color:#b91c1c">${U.fmtNum((res.bySev.critical || 0) + (res.bySev.high || 0))}</b></div>
</div>
<h2>Các chiều chất lượng</h2>
<table><tr>${Object.keys(res.dims).map((k) => `<th>${A.DIMS[k]}</th>`).join('')}</tr><tr>${Object.values(res.dims).map((v) => `<td><b>${U.pct(v)}</b></td>`).join('')}</tr></table>
<div class="grid2"><div><h2>Lỗi theo nhóm</h2>${svgBars(catItems)}</div><div><h2>Cột nhiều lỗi nhất</h2>${svgBars(colItems)}</div></div>
<h2>Khuyến nghị ưu tiên</h2><ol class="rec">${res.recommendations.map((r) => `<li><span class="sev" style="background:${sevColor[r.sev]}">${A.SEV[r.sev].label}</span> ${U.esc(r.text)}</li>`).join('')}</ol>
${ai}
<h2>Tổng hợp theo mục</h2>
<table><thead><tr><th>Nhóm</th><th>Kiểm tra</th><th>Mức độ</th><th>Số lượng</th><th>Cột</th></tr></thead><tbody>
${res.checks.map((c) => `<tr><td>${A.CATS[c.cat].label}</td><td>${U.esc(c.check)}</td><td><span class="sev" style="background:${sevColor[c.sev]}">${A.SEV[c.sev].label}</span></td><td>${U.fmtNum(c.n)}</td><td>${U.esc(c.cols.slice(0, 4).join(', '))}</td></tr>`).join('')}
</tbody></table>
${sections}
${prof ? `<section><h2>Hồ sơ cột</h2><table><thead><tr><th>Cột</th><th>Vai trò</th><th>Kiểu</th><th>% đầy</th><th>Giá trị khác</th><th>Phổ biến</th></tr></thead><tbody>${prof}</tbody></table></section>` : ''}
<footer>Tạo bởi Master Data Pro · crischat.github.io/app/masterdata</footer>
</div></body></html>`;
  };

  MD.Export = E;
})(window.MD);
