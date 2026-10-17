/* Master Data Pro — đọc file: Excel/CSV/JSON, Google Sheets, PDF, Word, PowerPoint */
(function (MD) {
  'use strict';
  const U = MD.U;
  const P = {};

  /* ---------- Từ mảng 2 chiều -> dataset ---------- */
  const rowEmpty = (r) => !r || r.every((c) => U.isEmpty(c));

  function detectHeaderRow(aoa) {
    let best = 0, bestScore = -1;
    const lim = Math.min(aoa.length, 25);
    for (let i = 0; i < lim; i++) {
      const r = aoa[i] || [];
      const filled = r.filter((c) => !U.isEmpty(c));
      if (filled.length < 2) continue;
      const textish = filled.filter((c) => typeof c === 'string' && U.parseNumStr(c) == null && !U.parseDateStr(c)).length;
      const uniq = new Set(filled.map((c) => U.key(c))).size;
      // tiêu đề: nhiều ô, chủ yếu là chữ, không trùng nhau, có dữ liệu bên dưới
      const below = aoa.slice(i + 1, i + 6).filter((x) => !rowEmpty(x)).length;
      const score = textish * 2 + uniq - (filled.length - textish) * 2 + (below ? 3 : -10);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  P.fromAOA = (aoa, name, source, opts = {}) => {
    aoa = (aoa || []).map((r) => (Array.isArray(r) ? r : []));
    while (aoa.length && rowEmpty(aoa[aoa.length - 1])) aoa.pop();
    if (!aoa.length) return null;
    const h = opts.headerRow != null ? opts.headerRow : detectHeaderRow(aoa);
    let width = 0;
    aoa.forEach((r) => { for (let j = r.length - 1; j >= 0; j--) if (!U.isEmpty(r[j])) { width = Math.max(width, j + 1); break; } });
    if (!width) return null;
    const blankHeaders = [];
    const headers = [];
    for (let j = 0; j < width; j++) {
      let v = aoa[h][j];
      v = U.isEmpty(v) ? '' : String(v instanceof Date ? U.fmtDate(v) : v).replace(/\s+/g, ' ').trim();
      if (!v) { blankHeaders.push(j); v = 'Cột ' + colLetter(j); }
      headers.push(v);
    }
    const rows = aoa.slice(h + 1).map((r) => {
      const out = new Array(width);
      for (let j = 0; j < width; j++) out[j] = r[j] === undefined ? '' : r[j];
      return out;
    });
    return {
      id: U.uid(), name, source, kind: 'table', headers, rows,
      headerRow: h, firstDataRow: h + 2, blankHeaders, preamble: aoa.slice(0, h), raw: aoa
    };
  };

  const colLetter = (n) => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  P.colLetter = colLetter;

  /* ---------- Excel / CSV ---------- */
  P.readWorkbook = (wb, fileName, kind) => {
    const out = [];
    wb.SheetNames.forEach((sn) => {
      const ws = wb.Sheets[sn];
      if (!ws || !ws['!ref']) return;
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
      const ds = P.fromAOA(aoa, wb.SheetNames.length > 1 ? `${fileName} › ${sn}` : fileName, { file: fileName, kind, sheet: sn });
      if (ds) {
        ds.merges = (ws['!merges'] || []).length;
        out.push(ds);
      }
    });
    return out;
  };

  async function readSpreadsheet(file) {
    const buf = await file.arrayBuffer();
    const ext = file.name.split('.').pop().toLowerCase();
    let wb;
    if (['csv', 'tsv', 'txt'].includes(ext)) {
      let text = new TextDecoder('utf-8').decode(buf);
      if (text.includes('\ufffd')) text = new TextDecoder('windows-1258').decode(buf);
      wb = XLSX.read(text.replace(/^\ufeff/, ''), { type: 'string', raw: true, FS: ext === 'tsv' ? '\t' : undefined });
    } else {
      wb = XLSX.read(buf, { type: 'array', cellDates: true, cellNF: false });
    }
    return P.readWorkbook(wb, file.name, ext);
  }

  async function readJSON(file) {
    const data = JSON.parse(await file.text());
    const arr = Array.isArray(data) ? data : (Object.values(data).find(Array.isArray) || [data]);
    const cols = [];
    arr.forEach((o) => o && typeof o === 'object' && Object.keys(o).forEach((k) => { if (!cols.includes(k)) cols.push(k); }));
    const aoa = [cols].concat(arr.map((o) => cols.map((c) => {
      const v = o ? o[c] : '';
      return v != null && typeof v === 'object' ? JSON.stringify(v) : (v == null ? '' : v);
    })));
    const ds = P.fromAOA(aoa, file.name, { file: file.name, kind: 'json' }, { headerRow: 0 });
    return ds ? [ds] : [];
  }

  /* ---------- Văn bản -> dataset dạng text ---------- */
  P.textDataset = (lines, name, source) => {
    const clean = lines.map((l) => String(l)).filter((l, i, a) => !(l.trim() === '' && (a[i - 1] || '').trim() === ''));
    if (!clean.some((l) => l.trim())) return null;
    return { id: U.uid(), name: name + ' (văn bản)', source, kind: 'text', lines: clean, headers: ['Đoạn', 'Nội dung'], rows: clean.map((l, i) => [i + 1, l]), firstDataRow: 1 };
  };

  /* ---------- PDF ---------- */
  async function readPDF(file) {
    if (!window.pdfjsLib) throw new Error('Chưa tải được thư viện PDF');
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const allLines = [];   // {page, cells:[{x,text}]}
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({
        x: it.transform[4], y: it.transform[5], w: it.width || it.str.length * 4, str: it.str
      }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = [];
      items.forEach((it) => {
        const ln = lines.find((l) => Math.abs(l.y - it.y) < 3);
        if (ln) ln.items.push(it); else lines.push({ y: it.y, items: [it] });
      });
      lines.forEach((l) => {
        l.items.sort((a, b) => a.x - b.x);
        const cells = [];
        l.items.forEach((it) => {
          const last = cells[cells.length - 1];
          if (last && it.x - last.end < 7) { last.text += (it.x - last.end > 1.5 ? ' ' : '') + it.str; last.end = it.x + it.w; }
          else cells.push({ x: it.x, end: it.x + it.w, text: it.str });
        });
        allLines.push({ page: p, cells });
      });
    }
    if (!allLines.length) throw new Error('PDF không có lớp chữ (có thể là ảnh scan). Hãy dùng công cụ OCR/Scan PDF trước.');
    const out = [];
    const textDs = P.textDataset(allLines.map((l) => l.cells.map((c) => c.text).join('  ')), file.name, { file: file.name, kind: 'pdf' });
    // gom các dòng liên tiếp có >=3 ô thành bảng
    let block = [];
    const flush = () => {
      if (block.length >= 3) {
        const counts = {};
        block.forEach((l) => { counts[l.cells.length] = (counts[l.cells.length] || 0) + 1; });
        const mode = +Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        const anchors = [];
        block.filter((l) => l.cells.length === mode).forEach((l) => l.cells.forEach((c, j) => { (anchors[j] = anchors[j] || []).push(c.x); }));
        const ax = anchors.map((a) => a.reduce((s, v) => s + v, 0) / a.length);
        const aoa = block.map((l) => {
          const r = new Array(ax.length).fill('');
          l.cells.forEach((c) => {
            let bj = 0, bd = Infinity;
            ax.forEach((x, j) => { const d = Math.abs(x - c.x); if (d < bd) { bd = d; bj = j; } });
            r[bj] = r[bj] ? r[bj] + ' ' + c.text : c.text;
          });
          return r.map((v) => coerce(v));
        });
        const ds = P.fromAOA(aoa, `${file.name} › Bảng ${out.length + 1} (trang ${block[0].page})`, { file: file.name, kind: 'pdf' });
        if (ds && ds.headers.length >= 2) out.push(ds);
      }
      block = [];
    };
    allLines.forEach((l) => { if (l.cells.length >= 3) block.push(l); else flush(); });
    flush();
    if (textDs) out.push(textDs);
    return out;
  }

  // Ô lấy từ PDF/Word/PPT luôn là chữ — giữ nguyên chuỗi để phát hiện lỗi định dạng
  const coerce = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  /* ---------- Word ---------- */
  async function readDOCX(file) {
    if (!window.mammoth) throw new Error('Chưa tải được thư viện Word');
    const buf = await file.arrayBuffer();
    const html = (await mammoth.convertToHtml({ arrayBuffer: buf })).value;
    const raw = (await mammoth.extractRawText({ arrayBuffer: buf })).value;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = [];
    U.$$('table', doc).forEach((t, i) => {
      const aoa = Array.from(t.rows).map((tr) => Array.from(tr.cells).map((td) => coerce(td.textContent)));
      const ds = P.fromAOA(aoa, `${file.name} › Bảng ${i + 1}`, { file: file.name, kind: 'docx' });
      if (ds) out.push(ds);
    });
    const textDs = P.textDataset(raw.split(/\n/), file.name, { file: file.name, kind: 'docx' });
    if (textDs) out.push(textDs);
    return out;
  }

  /* ---------- PowerPoint ---------- */
  async function readPPTX(file) {
    if (!window.JSZip) throw new Error('Chưa tải được thư viện PowerPoint');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => +a.match(/(\d+)\.xml/)[1] - +b.match(/(\d+)\.xml/)[1]);
    const out = [], lines = [];
    for (const sn of slides) {
      const no = +sn.match(/(\d+)\.xml/)[1];
      const xml = new DOMParser().parseFromString(await zip.file(sn).async('string'), 'application/xml');
      const tbls = Array.from(xml.getElementsByTagNameNS('*', 'tbl'));
      tbls.forEach((tbl, ti) => {
        const aoa = Array.from(tbl.getElementsByTagNameNS('*', 'tr')).map((tr) =>
          Array.from(tr.getElementsByTagNameNS('*', 'tc')).map((tc) =>
            coerce(Array.from(tc.getElementsByTagNameNS('*', 't')).map((t) => t.textContent).join(' '))));
        const ds = P.fromAOA(aoa, `${file.name} › Slide ${no} bảng ${ti + 1}`, { file: file.name, kind: 'pptx' });
        if (ds) out.push(ds);
      });
      lines.push(`— Slide ${no} —`);
      Array.from(xml.getElementsByTagNameNS('*', 'p')).forEach((p) => {
        if (p.closest && tbls.some((t) => t.contains(p))) return;
        const txt = Array.from(p.getElementsByTagNameNS('*', 't')).map((t) => t.textContent).join('');
        if (txt.trim()) lines.push(txt);
      });
    }
    const textDs = P.textDataset(lines, file.name, { file: file.name, kind: 'pptx' });
    if (textDs) out.push(textDs);
    return out;
  }

  /* ---------- Điểm vào chung ---------- */
  P.readFile = async (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv', 'tsv', 'txt'].includes(ext)) return readSpreadsheet(file);
    if (ext === 'json') return readJSON(file);
    if (ext === 'pdf') return readPDF(file);
    if (ext === 'docx') return readDOCX(file);
    if (ext === 'pptx') return readPPTX(file);
    if (ext === 'doc' || ext === 'ppt') throw new Error(`Định dạng .${ext} cũ chưa hỗ trợ — hãy lưu lại thành .${ext}x`);
    throw new Error('Chưa hỗ trợ định dạng .' + ext);
  };

  /* ---------- Google Sheets ---------- */
  P.parseSheetUrl = (url) => {
    const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!m) return null;
    const g = String(url).match(/[#&?]gid=(\d+)/);
    return { id: m[1], gid: g ? g[1] : null };
  };

  P.readGoogleSheet = async (url) => {
    const info = P.parseSheetUrl(url);
    if (!info) throw new Error('Link Google Sheet không hợp lệ');
    // 1) Có đăng nhập Google -> dùng Sheets API (đọc được cả file riêng tư)
    if (MD.Drive && MD.Drive.hasToken()) {
      try { return await MD.Drive.readSheet(info.id); } catch (e) { console.warn('Sheets API lỗi, thử link công khai', e); }
    }
    // 2) File công khai -> export xlsx
    try {
      const r = await fetch(`https://docs.google.com/spreadsheets/d/${info.id}/export?format=xlsx`);
      if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) {
        const wb = XLSX.read(await r.arrayBuffer(), { type: 'array', cellDates: true });
        return P.readWorkbook(wb, 'Google Sheet ' + info.id.slice(0, 6), 'gsheet');
      }
    } catch (e) { console.warn('export xlsx bị chặn', e); }
    // 3) gviz CSV (một tab)
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${info.id}/gviz/tq?tqx=out:csv${info.gid ? '&gid=' + info.gid : ''}`);
    if (!r.ok) throw new Error('Không đọc được Sheet. Hãy chia sẻ "Bất kỳ ai có đường liên kết" hoặc kết nối Google ở tab Cài đặt.');
    const text = await r.text();
    if (/<html/i.test(text.slice(0, 200))) throw new Error('Sheet đang ở chế độ riêng tư. Kết nối Google ở tab Cài đặt để đọc.');
    const wb = XLSX.read(text, { type: 'string', raw: true });
    return P.readWorkbook(wb, 'Google Sheet ' + info.id.slice(0, 6), 'csv');
  };

  MD.Parsers = P;
})(window.MD);
