(function (MD) {
  'use strict';
  const U = MD.U, A = MD.Analyzer;
  const { $, esc } = U;
  const ST = {};
  const UNASSIGNED = '(Chưa gán)';

  const num = (v) => { const n = U.toNum(v); return n == null || isNaN(n) ? null : n; };
  const nk = (s) => U.key(s);
  const pc = (x, d = 1) => U.pct(x, d);
  const f1 = (x) => (x == null || isNaN(x) ? '—' : U.fmtNum(x, 1));
  const fN = (x) => U.fmtNum(x);
  const qn = (h) => "'" + h.replace(/'/g, "''") + "'";
  const col = (t, h) => `${t}[${h}]`;

  const CEFR = ['pre a1', 'below a1', 'a1', 'a1+', 'a2', 'a2+', 'b1', 'b1+', 'b2', 'b2+', 'c1', 'c2'];
  const CEFR_PASS = new Set(['b1', 'b2', 'c1', 'c2']);
  const CEFR_RE = /^(pre a1|below a1|a1|a2|b1|b2|c1|c2)\b/;
  const PASS_WORDS = /^(pass|passed|dat|ok|done|complete|completed|hoan thanh|yes|y|co)$/;
  const FAIL_WORDS = /^(fail|failed|khong dat|chua dat|not ok|no|n|khong|incomplete|chua hoan thanh)$/;
  const PRIMARY_RE = /^(score|total score|overall|overall score|total|tong|tong diem|diem|diem tong|amount|thanh tien|doanh thu|revenue|efficiency|eff|uph|qty|so luong|ket qua)$/;
  const PRIMARY_SOFT = /(score|diem|total|tong|amount|revenue|doanh thu|efficiency|uph|qty|so luong)/;
  const ENTITY_RE = /(^| )(ma|code|id|msnv|staff|emp|employee|sku|nv)( |$)/;
  const DIM_ROLES = ['position', 'dept', 'team', 'category', 'warehouse', 'supplier', 'status', 'unit', 'gender', 'address'];

  const HX = (ds, c) => (c.levelSrc >= 0 ? ds.headers.concat(['Cấp bậc (suy từ ' + ds.headers[c.levelSrc] + ')']) : ds.headers);

  function detect(ds, res) {
    const P = res.profile || [], n = ds.rows.length, H0 = ds.headers;
    const isNum = (p) => p.type === 'number' && p.num;
    const entity = P.find((p) => p.type !== 'empty' && p.fillRate > 0.9 && p.uniqueRatio < 0.995 && p.uniqueRatio > 0.05 &&
      (['emp_id', 'sku'].includes(p.role) || ENTITY_RE.test(nk(p.name))));
    const date = P.find((p) => p.type === 'date');
    const nums = P.filter((p) => isNum(p) && p !== entity && p.role !== 'index' && !/^(nam|year|thang|month|stt)$/.test(nk(p.name)));
    let primary = nums.find((p) => PRIMARY_RE.test(nk(p.name))) || nums.slice().reverse().find((p) => PRIMARY_SOFT.test(nk(p.name)) && !/ (score|diem)$/.test(nk(p.name))) || nums[0];
    let comps = [];
    if (primary) {
      const pm = primary.num.mean, pmax = primary.num.max;
      comps = nums.filter((p) => p !== primary && p.num.mean > pm * 0.5 && p.num.mean < pm * 1.5 && p.num.max <= pmax * 1.6);
      if (comps.length < 2) comps = [];
    }
    const compWords = new Set(comps.map((p) => nk(p.name).split(' ')[0]));
    const isCefrCol = (p) => p.top.length && p.top.filter((t) => CEFR_RE.test(nk(t.v)) || ['nr', '0'].includes(nk(t.v))).reduce((s, t) => s + t.c, 0) / Math.max(1, p.top.reduce((s, t) => s + t.c, 0)) > 0.8;
    const isStatusCol = (p) => p.unique <= 6 && p.top.some((t) => PASS_WORDS.test(nk(t.v))) && p.top.some((t) => FAIL_WORDS.test(nk(t.v)));
    const texty = P.filter((p) => ['text', 'mixed'].includes(p.type) && p !== entity);
    const targets = texty.filter((p) => !compWords.has(nk(p.name).split(' ')[0]) && (isCefrCol(p) || isStatusCol(p)))
      .sort((a, b) => (/(level|cefr|result|ket qua|status|trang thai)/.test(nk(b.name)) - /(level|cefr|result|ket qua|status|trang thai)/.test(nk(a.name))) || a.unique - b.unique);
    const target = targets[0] || null;
    const dims = texty.filter((p) => p !== target && !targets.includes(p) && p.unique >= 2 && p.unique <= 120 && p.fillRate >= 0.3 &&
      !compWords.has(nk(p.name).split(' ')[0]) && !['person_name', 'email', 'phone', 'note', 'name_item', 'address'].includes(p.role) && !isCefrCol(p))
      .sort((a, b) => (DIM_ROLES.includes(b.role) - DIM_ROLES.includes(a.role)) || a.unique - b.unique);
    const lvl = dims.find((p) => p.unique >= 6 && (p.role === 'position' || /(title|chuc danh|chuc vu|position|job|vi tri)/.test(nk(p.name))));
    const VL = H0.length;
    const dimIdx = dims.map((p) => p.idx);
    const defDims = lvl ? [VL, lvl.idx].concat(dimIdx.filter((j) => j !== lvl.idx)).slice(0, 3) : dimIdx.slice(0, 3);
    return {
      levelSrc: lvl ? lvl.idx : -1,
      entity: entity ? entity.idx : -1, date: date ? date.idx : -1, primary: primary ? primary.idx : -1,
      comps: comps.map((p) => p.idx), target: target ? target.idx : -1, targetKind: target ? (isCefrCol(target) ? 'cefr' : 'status') : '',
      dims: defDims, dimPool: (lvl ? [VL] : []).concat(dimIdx), nums: nums.map((p) => p.idx), texts: texty.map((p) => p.idx),
      thr: '', audience: 'exec', freq: 'once', need: 'present', n
    };
  }

  function catPass(v, kind) {
    const k = nk(U.display(v));
    if (!k) return null;
    if (kind === 'cefr') { const m = k.match(CEFR_RE); if (!m) return null; return CEFR_PASS.has(m[1]) ? 1 : 0; }
    if (PASS_WORDS.test(k)) return 1;
    if (FAIL_WORDS.test(k)) return 0;
    return null;
  }

  function compute(ds, res, c) {
    const H = HX(ds, c), R = ds.rows, out = { log: [], issues: [], H };
    const dropRows = new Set();
    res.issues.forEach((it) => { if (it.check === 'Dòng trống giữa bảng' || it.check === 'Dòng tổng lẫn trong dữ liệu') dropRows.add(it.row); });
    const seen = new Set(); let dup = 0;
    const base = [];
    R.forEach((r, i) => {
      if (dropRows.has(i)) return;
      const k = JSON.stringify(r.map((v) => U.display(v)));
      if (seen.has(k)) { dup++; return; }
      seen.add(k); base.push(i);
    });
    out.log.push({ step: 'Dữ liệu gốc', what: 'Đọc nguyên trạng, chưa sửa gì', n: R.length, left: R.length });
    if (dropRows.size) out.log.push({ step: 'Bỏ dòng trống / dòng tổng', what: 'Dòng tổng làm cộng hai lần', n: dropRows.size, left: R.length - dropRows.size });
    out.log.push({ step: 'Bỏ dòng trùng hoàn toàn', what: 'Một bản ghi bị đếm hai lần', n: dup, left: base.length });

    const canon = {};
    (res.clusters || []).forEach((cl) => { const m = new Map(); cl.groups.forEach((g) => g.variants.forEach((x) => { if (x.v !== g.canonical && nk(x.v).replace(/ /g, '') === nk(g.canonical).replace(/ /g, '')) m.set(x.v, g.canonical); })); canon[cl.col] = m; });
    const VL = ds.headers.length;
    const base0 = (r, j) => { const s = U.display(r[j]).trim().replace(/\s+/g, ' '); if (!s) return UNASSIGNED; return (canon[j] && canon[j].get(U.display(r[j]))) || s; };
    const typo = {}, typoList = [];
    c.dims.concat(c.levelSrc >= 0 ? [c.levelSrc] : []).forEach((j) => {
      if (j === VL || typo[j]) return;
      const cnt = new Map();
      base.forEach((i) => { const v = base0(R[i], j); if (v !== UNASSIGNED) cnt.set(v, (cnt.get(v) || 0) + 1); });
      const sig = (v) => { const k = nk(v); return k.length < 4 ? '#' + k : k.split(' ').map((w) => (w.length >= 4 ? w.replace(/s$/, '').split('').sort().join('') : w)).join(' '); };
      const best = new Map();
      Array.from(cnt.entries()).sort((a, b) => b[1] - a[1]).forEach(([v, n]) => { const g = sig(v); if (!best.has(g)) best.set(g, v); });
      const m = new Map();
      cnt.forEach((n, v) => { const b = best.get(sig(v)); if (b !== v) { m.set(v, b); typoList.push({ col: H[j], from: v, to: b, n }); } });
      typo[j] = m;
    });
    const fixT = (j, v) => (typo[j] && typo[j].get(v)) || v;
    const levelOf = (t) => {
      if (t === UNASSIGNED) return UNASSIGNED;
      const k = nk(t);
      if (/\b(director|giam doc|head of|general manager|gm|vp|chief)\b/.test(k)) return '5 · Director';
      if (/\b(manager|quan ly|truong phong|truong bo phan)\b/.test(k)) return '4 · Manager';
      if (/\b(leader|lead|supervisor|truong nhom|to truong|truong ca)\b/.test(k)) return '3 · Team Leader';
      if (/\b(senior|sr|specialist|principal|chuyen vien|expert|engineer|ky su)\b/.test(k)) return '2 · Senior / Specialist';
      return '1 · Staff';
    };
    const dimVal = (r, j) => (j === VL ? levelOf(fixT(c.levelSrc, base0(r, c.levelSrc))) : fixT(j, base0(r, j)));
    let mapped = 0, blanks = {};
    c.dims.forEach((j) => { blanks[j] = 0; });
    base.forEach((i) => c.dims.forEach((j) => { if (j === VL) return; const raw = U.display(R[i][j]); if (!raw.trim()) blanks[j]++; else if (dimVal(R[i], j) !== raw) mapped++; }));
    out.typoList = typoList;

    const P = c.primary, comps = c.comps;
    let rel = '';
    if (P >= 0 && comps.length) {
      let ok = 0, okS = 0, tot = 0;
      base.forEach((i) => {
        const cv = comps.map((j) => num(R[i][j])), pv = num(R[i][P]);
        if (pv == null || cv.some((x) => x == null || x === 0)) return;
        tot++;
        const s = cv.reduce((a, b) => a + b, 0);
        if (Math.abs(pv - s / cv.length) <= 1) ok++;
        if (Math.abs(pv - s) <= 1) okS++;
      });
      if (tot >= 20 && ok / tot >= 0.9) rel = 'mean'; else if (tot >= 20 && okS / tot >= 0.9) rel = 'sum';
    }
    out.rel = rel;

    let thr = c.thr !== '' && !isNaN(+c.thr) ? +c.thr : null, thrAuto = false;
    if (thr == null && c.target >= 0 && P >= 0) {
      let lo = Infinity, failAbove = [], cnt = 0;
      base.forEach((i) => { const p = catPass(R[i][c.target], c.targetKind), v = num(R[i][P]); if (p === 1 && v > 0) { lo = Math.min(lo, v); cnt++; } });
      if (isFinite(lo)) {
        base.forEach((i) => { const p = catPass(R[i][c.target], c.targetKind), v = num(R[i][P]); if (p === 0 && v >= lo) failAbove.push(i); });
        if (failAbove.length <= cnt * 0.02) { thr = lo; thrAuto = true; }
      }
    }
    out.thr = thr; out.thrAuto = thrAuto;

    const rows = [];
    let zeroComp = 0, recalced = 0, levelChanged = 0, invalid = 0, rawSum = 0, rawN = 0, rawPass = 0, rawPassN = 0;
    const zeroEx = [];
    base.forEach((i) => {
      const r = R[i];
      const pv0 = P >= 0 ? num(r[P]) : null;
      if (pv0 != null) { rawSum += pv0; rawN++; }
      const cp0 = c.target >= 0 ? catPass(r[c.target], c.targetKind) : (thr != null && pv0 != null ? +(pv0 >= thr) : null);
      if (cp0 != null) { rawPass += cp0; rawPassN++; }
      const cv = comps.map((j) => num(r[j]));
      let pv = pv0, recalc = false;
      if (comps.length && pv0 > 0 && cv.some((x) => x === 0) && cv.some((x) => x > 0)) {
        zeroComp++;
        if (zeroEx.length < 3) zeroEx.push(`${c.entity >= 0 ? U.display(r[c.entity]) + ': ' : ''}${comps.map((j, k) => H[j] + ' ' + (cv[k] == null ? '–' : cv[k])).join(', ')} → ${H[P]} ${pv0}`);
        cv.forEach((x, k) => { if (x === 0) cv[k] = null; });
        const live = cv.filter((x) => x != null);
        if (rel === 'mean') { pv = Math.round(live.reduce((a, b) => a + b, 0) / live.length); recalc = true; }
      }
      if (recalc) recalced++;
      let pass = null;
      if (thr != null && pv != null && pv > 0) pass = +(pv >= thr);
      else if (c.target >= 0) pass = catPass(r[c.target], c.targetKind);
      if (recalc && cp0 != null && pass != null && pass !== cp0) levelChanged++;
      const bad = P >= 0 && (pv == null || pv === 0) || (c.target >= 0 && catPass(r[c.target], c.targetKind) == null && !recalc);
      if (bad) { invalid++; return; }
      const d = c.date >= 0 ? U.toDate(r[c.date]) : null;
      rows.push({ i, ent: c.entity >= 0 ? U.display(r[c.entity]).trim() : 'r' + i, d, t: d ? +d : i, pv, pass, cv, dims: c.dims.map((j) => dimVal(r, j)), recalc });
    });
    if (typoList.length) out.log.push({ step: 'Sửa lỗi gõ (đảo chữ, số nhiều)', what: typoList.slice(0, 3).map((x) => x.from + ' → ' + x.to).join(', ') + ' — tự phát hiện, cần người xác nhận', n: typoList.reduce((a, x) => a + x.n, 0), left: base.length });
    if (mapped) out.log.push({ step: 'Gộp cách viết khác nhau', what: 'Cùng một giá trị nhưng gõ nhiều kiểu bị tách thành nhiều nhóm', n: mapped, left: base.length });
    if (zeroComp) out.log.push({ step: 'Số 0 ở cột thành phần → để trống', what: rel ? `Tính lại ${H[P]} từ các cột còn lại` : 'Số 0 nghĩa là không làm, không phải 0 điểm', n: zeroComp, left: base.length });
    out.log.push({ step: 'Bỏ bản ghi không hợp lệ', what: 'Kết quả bằng 0, trống hoặc mã kết quả không đúng danh sách', n: invalid, left: rows.length });

    const by = new Map();
    rows.forEach((x) => { if (!by.has(x.ent)) by.set(x.ent, []); by.get(x.ent).push(x); });
    by.forEach((list) => list.sort((a, b) => a.t - b.t || a.i - b.i));
    const latest = [];
    by.forEach((list) => latest.push(list[list.length - 1]));
    if (c.entity >= 0) out.log.push({ step: 'Lấy kết quả mới nhất của mỗi ' + H[c.entity], what: 'Đếm theo đối tượng, không theo lượt', n: rows.length - latest.length, left: latest.length });
    out.rows = rows; out.latest = latest; out.by = by; out.dup = dup; out.blanks = blanks; out.mapped = mapped;
    out.zeroComp = zeroComp; out.zeroEx = zeroEx; out.recalced = recalced; out.levelChanged = levelChanged; out.invalid = invalid;
    out.rawMean = rawN ? rawSum / rawN : null; out.rawRate = rawPassN ? rawPass / rawPassN : null;

    const hasPass = rows.some((x) => x.pass != null);
    out.hasPass = hasPass;
    const M = (list) => {
      const n = list.length, pv = list.filter((x) => x.pv != null);
      const mean = pv.length ? pv.reduce((s, x) => s + x.pv, 0) / pv.length : null;
      const pl = list.filter((x) => x.pass != null), ps = pl.reduce((s, x) => s + x.pass, 0);
      return { n, mean, pass: ps, rate: pl.length ? ps / pl.length : null, val: hasPass ? (pl.length ? ps / pl.length : null) : mean };
    };
    out.M = M;
    out.head = M(latest);
    out.perRow = M(rows);
    const minN = Math.max(10, Math.round(latest.length * 0.005));
    out.minN = minN;
    out.gaps = c.dims.map((j, k) => {
      const g = new Map();
      latest.forEach((x) => { const v = x.dims[k]; if (!g.has(v)) g.set(v, []); g.get(v).push(x); });
      const all = Array.from(g.entries()).map(([v, l]) => Object.assign({ v }, M(l)));
      const shown = all.filter((x) => x.n >= minN).sort((a, b) => (a.val ?? 0) - (b.val ?? 0));
      const real = shown.filter((x) => x.v !== UNASSIGNED);
      const big = real.filter((x) => x.n >= latest.length * 0.05);
      return { j, name: H[j], groups: shown, hidden: all.length - shown.length, low: big[0] || real[0], high: real[real.length - 1], unassigned: (g.get(UNASSIGNED) || []).length };
    });

    out.compStats = comps.map((j, k) => {
      const v = rows.map((x) => x.cv[k]).filter((x) => x != null && x > 0);
      return { j, name: H[j], mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, n: v.length };
    }).filter((x) => x.mean != null).sort((a, b) => a.mean - b.mean);

    if (c.date >= 0) {
      const yrs = new Map(), g0 = out.gaps[0], lowV = g0 && g0.low ? g0.low.v : null;
      rows.forEach((x) => { if (!x.d) return; const y = x.d.getFullYear(); if (!yrs.has(y)) yrs.set(y, []); yrs.get(y).push(x); });
      out.trend = Array.from(yrs.entries()).sort((a, b) => a[0] - b[0]).map(([y, l]) => {
        const m = M(l), r = { y, n: m.n, val: m.val };
        if (lowV != null) { const ll = l.filter((x) => x.dims[0] === lowV); r.lowShare = ll.length / l.length; r.lowVal = ll.length >= 5 ? M(ll).val : null; r.lowN = ll.length; }
        return r;
      });
      out.trendLow = lowV;
      const t = out.trend; out.mix = null;
      for (let k = 1; k < t.length; k++) {
        const a = t[k - 1], b = t[k];
        if (a.val != null && b.val != null && b.val < a.val && lowV != null && b.lowShare - a.lowShare > 0.08 && (b.lowVal == null || a.lowVal == null || b.lowVal >= a.lowVal - 0.01)) {
          out.mix = { y: b.y, prev: a, cur: b }; break;
        }
      }
      const lt = t.filter((x) => x.lowVal != null);
      out.lowTrend = lt.length >= 2 ? { from: lt[0], to: lt[lt.length - 1] } : null;
    }

    if (c.entity >= 0) {
      const rep = [];
      by.forEach((list) => { if (list.length >= 2) rep.push({ ent: list[0].ent, first: list[0], last: list[list.length - 1], n: list.length }); });
      const imp = rep.filter((x) => x.last.pv > x.first.pv).length;
      const gain = rep.length ? rep.reduce((s, x) => s + (x.last.pv - x.first.pv), 0) / rep.length : null;
      const up = rep.filter((x) => x.first.pass === 0 && x.last.pass === 1).length;
      const repSet = new Set(rep.map((x) => x.ent));
      const g0 = out.gaps[0];
      const byGroup = g0 ? g0.groups.filter((g) => g.v !== UNASSIGNED).map((g) => {
        const ents = latest.filter((x) => x.dims[0] === g.v);
        return { v: g.v, n: ents.length, rep: ents.filter((x) => repSet.has(x.ent)).length };
      }).map((x) => Object.assign(x, { rate: x.n ? x.rep / x.n : 0 })).sort((a, b) => a.rate - b.rate) : [];
      out.repeat = { n: rep.length, rate: latest.length ? rep.length / latest.length : 0, imp, impRate: rep.length ? imp / rep.length : null, gain, up, byGroup };
    }
    return out;
  }

  const FIX = {
    structure: ['Đưa về 1 dòng tiêu đề, bỏ dòng tổng/dòng trống xen giữa, bỏ gộp ô', 'Table.Skip / Table.SelectRows'],
    missing: ['Không xoá dòng: gắn nhãn "(Chưa gán)" để vẫn tính vào tổng, tách riêng khi xem theo nhóm. Bắt buộc nhập ở nguồn', 'Table.ReplaceValue(null → "Unassigned")'],
    duplicate: ['Bỏ dòng trùng hoàn toàn trước mọi phép đếm; trùng khoá thì xác định bản đúng (mới nhất)', 'Table.Distinct'],
    conflict: ['Lập bảng Master (mã ↔ tên) và tra cứu, không gõ tay', 'Merge Queries với bảng Master'],
    inconsistent: ['Bảng mapping viết tay: sai → đúng, kèm số dòng; thêm bước dò biến thể mới, chỉ đánh dấu, không tự gộp', 'Merge với CleaningMap, Table.ReplaceValue'],
    format: ['Đặt đúng kiểu dữ liệu ngay bước đầu (số, ngày)', 'Table.TransformColumnTypes'],
    pattern: ['Chuẩn hoá mẫu mã (hoa/thường, độ dài, số 0 đầu)', 'Text.Upper / Text.PadStart'],
    whitespace: ['TRIM / CLEAN mọi cột chữ', 'Text.Trim / Text.Clean'],
    outlier: ['Đối chiếu chứng từ gốc; không tự xoá, đánh dấu để người duyệt', 'Thêm cột cờ Is Outlier'],
    logic: ['Rà theo công thức nghiệp vụ, sửa ở nguồn', 'Cột kiểm tra = công thức, lọc ≠ 0'],
    custom: ['Theo quy tắc riêng đã đặt', '—']
  };

  function issueRows(ds, res, c, o) {
    const H = HX(ds, c), list = [];
    res.checks.filter((k) => k.sev !== 'info').forEach((k) => {
      const ex = k.sample && k.sample[0] ? (k.sample[0].value != null && k.sample[0].value !== '' ? `"${U.display(k.sample[0].value)}"` : '') + (k.sample[0].suggest ? ` → "${U.display(k.sample[0].suggest)}"` : '') : '';
      list.push({ sev: k.sev, what: k.check, cat: A.CATS[k.cat].label, cols: k.cols.slice(0, 3).join(', '), n: k.n, ex: ex || (k.sample[0] && k.sample[0].msg) || '', fix: FIX[k.cat][0] });
    });
    if (o.zeroComp) list.unshift({ sev: 'high', what: 'Số 0 ở cột thành phần bị tính như kết quả thật', cat: 'Sai logic nghiệp vụ', cols: c.comps.map((j) => H[j]).join(', '), n: o.zeroComp, ex: o.zeroEx[0] || '', fix: o.rel === 'mean' ? `Số 0 nghĩa là không làm phần đó → để trống, tính lại ${H[c.primary]} = trung bình các phần đã làm. Giữ cột gốc để so trước/sau` : 'Đổi 0 thành trống để không kéo trung bình xuống sai' });
    if (c.entity >= 0 && o.rows.length > o.latest.length) list.unshift({ sev: 'medium', what: 'Một đối tượng có nhiều dòng (không phải lỗi, nhưng dễ đếm sai)', cat: 'Đơn vị đếm', cols: H[c.entity], n: o.rows.length - o.latest.length, ex: `${fN(o.rows.length)} lượt / ${fN(o.latest.length)} ${H[c.entity]}`, fix: 'Đếm theo đối tượng, lấy kết quả mới nhất (cột Is Latest). Xu hướng theo năm thì mới đếm theo lượt' });
    if (o.typoList.length) list.push({ sev: 'medium', what: 'Lỗi gõ đảo chữ / số nhiều ở cột phân nhóm', cat: 'Nhập không thống nhất', cols: Array.from(new Set(o.typoList.map((x) => x.col))).join(', '), n: o.typoList.reduce((a, x) => a + x.n, 0), ex: o.typoList.slice(0, 2).map((x) => `"${x.from}" → "${x.to}"`).join(', '), fix: 'Bảng mapping viết tay + bước dò: so với giá trị phổ biến hơn theo đảo chữ, số nhiều; từ dưới 4 ký tự phải giống hệt. Chỉ đánh dấu, người quyết định' });
    c.dims.forEach((j) => { if (o.blanks[j] && !list.some((x) => x.cols.includes(H[j]) && /trống|thieu|Thiếu/.test(x.what))) list.push({ sev: 'medium', what: 'Ô trống ở cột phân nhóm', cat: 'Thiếu dữ liệu', cols: H[j], n: o.blanks[j], ex: '(trống)', fix: FIX.missing[0] }); });
    return list.sort((a, b) => A.SEV[a.sev].order - A.SEV[b.sev].order || b.n - a.n);
  }

  function reportScore(c, o, ds) {
    const n = ds.rows.length, dims = c.dims.length, hasDate = c.date >= 0;
    const s = { bi: 0, xl: 0, ppt: 0 }, why = { bi: [], xl: [], ppt: [] };
    const add = (k, p, t) => { s[k] += p; why[k].push(t); };
    if (n > 5000) add('bi', 2, `${fN(n)} dòng: Excel bắt đầu chậm, BI xử lý nhẹ`); else add('xl', 2, `${fN(n)} dòng: Excel xử lý thoải mái`);
    if (c.freq === 'daily' || c.freq === 'weekly') { add('bi', 3, 'Cập nhật định kỳ: chỉ cần Refresh, mọi bước làm sạch chạy lại'); if (c.freq === 'weekly') add('xl', 1, 'Hàng tuần vẫn làm được bằng Power Query trong Excel'); }
    if (c.freq === 'once') { add('ppt', 3, 'Trình bày một lần: người xem cần kết luận, không cần công cụ'); add('xl', 1, 'Làm một lần thì Excel đủ để tính'); }
    if (dims >= 2 && hasDate) add('bi', 2, `${dims} chiều phân tích + thời gian: cần lọc chéo (slicer)`);
    if (c.entity >= 0) add('bi', 1, 'Nhiều dòng/đối tượng: cần measure đếm theo người, BI làm gọn hơn');
    if (c.audience === 'exec') { add('ppt', 2, 'Quản lý cấp cao: 3 phát hiện + 1 đề xuất, đọc trong 5 phút'); add('bi', 1, 'Có thể kèm link dashboard để tự xem thêm'); }
    if (c.audience === 'ops') { add('xl', 3, 'Team vận hành: cần danh sách từng người/từng dòng để xử lý, sửa, lọc'); }
    if (c.audience === 'review') { add('bi', 3, 'Người chấm/IT: muốn thấy luồng dữ liệu, model, measure'); add('ppt', 1, 'Kèm PDF xuất từ report để phòng máy không mở được'); }
    if (c.need === 'explore') add('bi', 2, 'Cần tự khám phá: drill-down, lọc chéo');
    if (c.need === 'track') add('xl', 3, 'Cần ghi chú, cập nhật trạng thái từng dòng: Excel/Sheet tiện nhất');
    if (c.need === 'present') add('ppt', 2, 'Mục tiêu là thuyết phục ra quyết định');
    if (o.gaps.filter((g) => g.low).length + (o.compStats.length ? 1 : 0) + (o.repeat ? 1 : 0) <= 4) add('ppt', 1, 'Số phát hiện chính ít, vừa một bộ slide ngắn');
    const order = Object.entries(s).sort((a, b) => b[1] - a[1]);
    return { s, why, best: order[0][0], second: order[1][0] };
  }

  function bar(v, max, cls) { const w = max ? Math.max(2, Math.round((v / max) * 100)) : 0; return `<span class="sb-bar ${cls || ''}"><i style="width:${w}%"></i></span>`; }

  function findings(c, o, H) {
    const F = [], unit = c.entity >= 0 ? 'người/đối tượng' : 'dòng';
    const isRate = o.hasPass, fmt = (x) => (isRate ? pc(x) : f1(x));
    const tl = o.thr != null ? `${H[c.primary]} ≥ ${o.thr}` : (c.target >= 0 ? `đạt ở ${H[c.target]}` : '');
    o.gaps.forEach((g) => {
      if (!g.low || !g.high || g.low === g.high) return;
      const share = g.low.n / o.latest.length;
      F.push({ k: 'where', t: `Khoảng cách lớn nhất nằm ở ${g.name} = “${g.low.v}”`, n: `${g.low.v}: ${pc(share, 0)} số ${unit}, chỉ ${fmt(g.low.val)}${isRate ? ' đạt' : ''} · ${g.high.v}: ${fmt(g.high.val)}`, w: share * Math.abs(g.high.val - g.low.val) });
    });
    F.splice(2);
    if (o.compStats.length >= 2) {
      const lo = o.compStats[0], hi = o.compStats[o.compStats.length - 1];
      F.push({ k: 'what', t: `${lo.name} là phần kéo kết quả xuống`, n: `${lo.name} ${f1(lo.mean)}, thấp hơn ${hi.name} ${f1(hi.mean - lo.mean)} điểm`, w: 0.5 });
    }
    if (o.mix) F.push({ k: 'trend', t: `Năm ${o.mix.y} giảm do cơ cấu, không phải do kết quả đi xuống`, n: `Năm ${o.mix.y}, nhóm “${o.trendLow}” chiếm ${pc(o.mix.cur.lowShare, 0)} (năm trước ${pc(o.mix.prev.lowShare, 0)}). ${o.lowTrend ? `Riêng nhóm này: ${fmt(o.lowTrend.from.lowVal)} (${o.lowTrend.from.y}) → ${fmt(o.lowTrend.to.lowVal)} (${o.lowTrend.to.y})` : ''}`, w: 0.6 });
    else if (o.trend && o.trend.length >= 2) { const a = o.trend[0], b = o.trend[o.trend.length - 1]; F.push({ k: 'trend', t: `Xu hướng ${a.y} → ${b.y}: ${b.val >= a.val ? 'tăng' : 'giảm'}`, n: `${fmt(a.val)} → ${fmt(b.val)} (đếm theo lượt trong từng năm)`, w: 0.3 }); }
    if (o.repeat && o.repeat.n >= 10) {
      const bg = o.repeat.byGroup, lo = bg[0], hi = bg[bg.length - 1];
      F.push({ k: 'act', t: 'Làm lại có tiến bộ, nhưng tập trung sai nhóm', n: `${pc(o.repeat.impRate, 0)} người làm lại tăng điểm (trung bình +${f1(o.repeat.gain)}).${lo && hi && lo !== hi ? ` Tỷ lệ làm lại: ${lo.v} ${pc(lo.rate)} · ${hi.v} ${pc(hi.rate)}` : ''}`, w: 0.55 });
    }
    return { list: F, tl };
  }

  function biPlan(c, o, H) {
    const T = 'Fact', P = c.primary >= 0 ? H[c.primary] : 'Value', E = c.entity >= 0 ? H[c.entity] : null, D = c.date >= 0 ? H[c.date] : null;
    const meets = o.hasPass;
    const dax = [
      ['Entities', E ? `CALCULATE ( COUNTROWS ( ${T} ), ${col(T, 'Is Latest')} = 1 )` : `COUNTROWS ( ${T} )`, 'Mẫu số của mọi tỷ lệ — đếm theo ' + (E || 'dòng')],
      meets && ['Entities Meeting', `CALCULATE ( [Entities], ${col(T, 'Meets Target')} = 1 )`, 'Tử số'],
      meets && ['Target Rate', 'DIVIDE ( [Entities Meeting], [Entities] )', 'Con số chính. DIVIDE trả trống khi mẫu = 0 thay vì lỗi'],
      meets && ['Below Target', '[Entities] - [Entities Meeting]', 'Số cần kéo lên — con số để lập kế hoạch'],
      ['Average ' + P, `CALCULATE ( AVERAGE ( ${col(T, P)} ), ${E ? col(T, 'Is Latest') + ' = 1' : 'ALL ()'} )`, 'Bối cảnh'],
      D && meets && ['Rate by Year', `DIVIDE ( CALCULATE ( COUNTROWS ( ${T} ), ${col(T, 'Meets Target')} = 1 ), COUNTROWS ( ${T} ) )`, 'Theo năm phải đếm lượt trong năm, không dùng Is Latest'],
      o.compStats.length && ['Weakest Part', `VAR t = { ${o.compStats.map((x) => `("${x.name}", AVERAGE ( ${col(T, x.name)} ))`).join(', ')} }\nRETURN MINX ( TOPN ( 1, t, [Value2], ASC ), [Value1] )`, 'Tự tìm phần yếu nhất, không ghi cứng'],
      E && ['Repeat Rate', `DIVIDE ( CALCULATE ( [Entities], ${col(T, 'Attempts')} >= 2 ), [Entities] )`, 'Ai đang được làm lại'],
      ['Highlight Color', `IF ( [${meets ? 'Target Rate' : 'Average ' + P}] < ${meets ? '0.5' : f1(o.head.mean).replace(',', '.')}, "#E8730C", "#1F3864" )`, 'Màu tự tính: data đổi, màu đổi theo']
    ].filter(Boolean);
    const m = [
      ['SourceFilePath', 'Tham số đường dẫn file', 'Người khác refresh trên máy họ chỉ cần đổi 1 ô'],
      ['Raw', 'Đọc sheet, đặt kiểu dữ liệu. Không load', 'Giữ bản gốc để đếm lỗi trên đúng một nguồn'],
      o.mapped || c.dims.length ? ['CleaningMap', 'Bảng mapping viết tay: sai → đúng', 'Dễ đọc, dễ kiểm, ai cũng thêm dòng được'] : null,
      [T, `Bỏ trùng → gắn cờ Has Issue → sửa theo mapping → trống = "Unassigned"${o.zeroComp ? ` → 0 thành null, tính lại ${P}` : ''} → Is Latest, Attempts${meets ? ', Meets Target' : ''}`, 'Bảng chính, mọi measure đọc từ đây'],
      E && o.repeat ? ['Progress', `Mỗi ${E} có ≥ 2 lần = 1 dòng: lần đầu, lần mới nhất, mức tăng`, 'Scatter cần mỗi chấm là một người'] : null,
      ['DataIssues', 'Đếm từng loại lỗi trên file gốc, kèm ví dụ', 'Trang chất lượng dữ liệu: số tính bằng code, không gõ tay'],
      ['CleaningLog', 'Từng bước, số dòng tác động, số dòng còn lại', `Chứng minh ${o.log.map((x) => fN(x.left)).filter((v, i, a) => a.indexOf(v) === i).join(' → ')}`]
    ].filter(Boolean);
    const latestM = E ? `= Table.AddColumn(Prev, "Is Latest", each if [${D || 'Index'}] = List.Max(Table.SelectRows(Prev, (r) => r[${E}] = [${E}])[${D || 'Index'}]) then 1 else 0, Int64.Type)` : '';
    const g = o.gaps.filter((x) => x.low);
    const pages = [
      ['1 · Tóm tắt', `Thẻ số: ${meets ? 'Target Rate, Below Target' : 'Average'}, Entities. ${D ? 'Line chart theo năm (2 đường nếu có hiệu ứng cơ cấu)' : ''}. Cột phân bố mức kết quả.`],
      g.length ? ['2 · Khoảng cách', `Bar theo ${g.map((x) => x.name).join(', ')} (chỉ nhóm ≥ ${o.minN}), matrix nhóm × mức, tô cam nhóm dưới ngưỡng.`] : null,
      ['3 · Nguyên nhân & cải thiện', `${o.compStats.length ? 'Cột theo thành phần (phần yếu nhất tô cam). ' : ''}${o.repeat ? 'Bar tỷ lệ làm lại theo nhóm, scatter lần đầu vs mới nhất.' : ''}`],
      ['4 · Chất lượng dữ liệu', 'Bảng lỗi (loại, cột, số dòng, ví dụ, cách xử lý) + bảng các bước làm sạch + thẻ trước/sau.']
    ].filter(Boolean);
    return { dax, m, pages, latestM };
  }

  function xlPlan(c, o, H) {
    const P = c.primary >= 0 ? H[c.primary] : 'Value', E = c.entity >= 0 ? H[c.entity] : null, D = c.date >= 0 ? H[c.date] : null;
    return [
      ['Raw', 'Dán nguyên file gốc, khoá sheet, không sửa', '—'],
      ['Clean (Table tên tblClean)', 'Power Query trong Excel: Data → Get Data → From Table. Các bước giống bên BI', 'Thêm cột phụ bên phải'],
      E && ['Cột Is Latest', `Đánh dấu kết quả mới nhất của mỗi ${E}`, D ? `=--([@[${D}]]=MAXIFS([${D}],[${E}],[@[${E}]]))` : `=--(COUNTIF([${E}],[@[${E}]])=COUNTIF(INDEX([${E}],1):[@[${E}]],[@[${E}]]))`],
      o.hasPass && ['Cột Meets Target', 'Đạt mốc hay chưa', o.thr != null ? `=--([@[${P}]]>=${o.thr})` : `=--ISNUMBER(MATCH([@[${H[c.target]}]],{"B1","B2","C1","C2"},0))`],
      E && ['Cột Attempts', 'Số lần của mỗi đối tượng', `=COUNTIF([${E}],[@[${E}]])`],
      ['Pivot', `Rows: ${c.dims.map((j) => H[j]).join(' / ') || '(nhóm)'}${D ? ', Columns: năm' : ''}. Values: đếm + trung bình. Filter Is Latest = 1`, 'Value Field Settings → % of Row Total'],
      ['Dashboard', 'Thẻ số bằng công thức + 3 biểu đồ Pivot Chart + slicer', o.hasPass ? `=COUNTIFS(tblClean[Is Latest],1,tblClean[Meets Target],1)/COUNTIFS(tblClean[Is Latest],1)` : `=AVERAGEIFS(tblClean[${P}],tblClean[Is Latest],1)`],
      ['Issues log', 'Bảng lỗi + cột Người xử lý, Trạng thái, Ngày sửa', 'Data Validation → List cho cột Trạng thái'],
      ['Cleaning log', 'Các bước và số dòng còn lại', '=ROWS(tblClean)']
    ].filter(Boolean);
  }

  function pptPlan(c, o, H, fd) {
    const isRate = o.hasPass, h = o.head, fmt = (x) => (isRate ? pc(x) : f1(x));
    const s = [
      ['Tiêu đề', `${isRate ? `Chỉ ${fmt(h.val)} ${c.entity >= 0 ? H[c.entity] : 'bản ghi'} đạt mốc` : `Kết quả trung bình ${fmt(h.mean)}`} — và khoảng cách nằm ở đâu`, 'Một câu kết luận, không phải tên đề tài'],
      ['Con số chính', `${fN(h.n)} ${c.entity >= 0 ? 'đối tượng' : 'dòng'} · ${isRate ? `${fN(h.n - h.pass)} chưa đạt` : `trung bình ${fmt(h.mean)}`}`, '1 số to + 1 câu giải thích']
    ];
    fd.list.forEach((f, i) => s.push([`Phát hiện ${i + 1}`, f.t, f.n]));
    s.push(['Đề xuất', 'Làm gì, cho nhóm nào, đo bằng chỉ số nào, khi nào xem lại', 'Mỗi đề xuất gắn với một phát hiện']);
    s.push(['Phụ lục · Dữ liệu', `${fN(o.log[0].n)} → ${fN(o.log[o.log.length - 1].left)} bản ghi sau làm sạch; trước/sau làm sạch`, 'Chứng minh số liệu đáng tin']);
    s.push(['Phụ lục · Giới hạn', 'Data chưa chứng minh được điều gì', 'Nói trước khi bị hỏi']);
    return s;
  }

  function limits(c, o, H) {
    const L = [];
    o.gaps.forEach((g) => { if (g.unassigned) L.push(`${fN(g.unassigned)} ${c.entity >= 0 ? 'đối tượng' : 'dòng'} (${pc(g.unassigned / o.latest.length, 0)}) chưa có ${g.name}: vẫn tính vào tổng, tách riêng khi xem theo nhóm. Nếu họ phần lớn thuộc nhóm yếu thì khoảng cách thật còn lớn hơn.`); if (g.hidden) L.push(`${g.hidden} nhóm ${g.name} có dưới ${o.minN} người bị ẩn khỏi biểu đồ vì tỷ lệ của nhóm nhỏ dễ ra 0% hoặc 100%.`); });
    if (o.repeat && o.repeat.n) L.push('Người được làm lại là nhóm đã được chọn (thường có động lực hoặc đang được đào tạo) — chưa chứng minh được làm lại gây ra tiến bộ. Muốn chứng minh: làm pilot có nhóm so sánh.');
    if (o.thrAuto) L.push(`Mốc đạt suy ra từ dữ liệu: ${H[c.primary]} ≥ ${o.thr} tương ứng “đạt” ở ${H[c.target]}. Cần xác nhận với chủ dữ liệu.`);
    if (o.recalced) L.push(`${fN(o.recalced)} bản ghi được tính lại ${H[c.primary]} vì có phần bị ghi 0 (không làm). Giữ cột gốc để so sánh.`);
    if (c.date >= 0) L.push('Xu hướng theo năm đếm theo lượt trong năm (ngoại lệ duy nhất). Các con số khác đếm theo kết quả mới nhất.');
    L.push('Dữ liệu cho biết “ở đâu, bao nhiêu”, chưa cho biết “vì sao”. Cần nối thêm dữ liệu đào tạo/ca làm/thâm niên để giải thích nguyên nhân.');
    return L;
  }

  function actions(c, o, H, fd) {
    const A2 = [];
    const g = o.gaps.find((x) => x.low);
    if (g) A2.push(`Ưu tiên nhóm “${g.low.v}” (${g.name}): ${fN(g.low.n - (g.low.pass || 0))} ${o.hasPass ? 'chưa đạt' : 'đối tượng'} — đây là nơi một điểm % kéo lên nhiều người nhất.`);
    if (o.compStats.length >= 2) A2.push(`Đào tạo tập trung vào ${o.compStats[0].name} (phần thấp nhất) thay vì học dàn trải.`);
    if (o.repeat && o.repeat.byGroup.length >= 2) A2.push(`Mở rộng làm lại / đào tạo cho nhóm ${o.repeat.byGroup[0].v} (hiện ${pc(o.repeat.byGroup[0].rate)}) bằng một pilot có nhóm so sánh, đo lại sau 3–6 tháng.`);
    if (o.hasPass) A2.push('Theo dõi tỷ lệ đạt của nhóm yếu nhất theo quý như một KPI riêng, không chỉ nhìn tỷ lệ chung.');
    A2.push('Sửa từ nguồn: trường bắt buộc, danh sách thả xuống cho cột phân nhóm, mã kết quả hợp lệ — để lần sau không phải làm sạch lại.');
    return A2;
  }

  function render(ds, res) {
    const body = $('#studyBody');
    if (!body) return;
    if (!res || res.kind !== 'table') { body.className = 'empty-state'; body.innerHTML = 'Nạp một file dạng bảng ở tab <b>Nạp dữ liệu</b> để bắt đầu.'; return; }
    body.className = '';
    const key = ds.id;
    if (!ST[key]) ST[key] = { cfg: detect(ds, res) };
    const c = ST[key].cfg, H = HX(ds, c);
    let o;
    try { o = compute(ds, res, c); } catch (e) { console.error(e); body.innerHTML = `<div class="note warn">Không phân tích được: ${esc(e.message)}</div>`; return; }
    ST[key].o = o;
    const iss = issueRows(ds, res, c, o), fd = findings(c, o, H), rep = reportScore(c, o, ds);
    const bi = biPlan(c, o, H), xl = xlPlan(c, o, H), ppt = pptPlan(c, o, H, fd);
    const isRate = o.hasPass, fmt = (x) => (isRate ? pc(x) : f1(x));
    const sel = (id, list, v, none) => `<select id="${id}" data-sk>${none ? `<option value="-1">${none}</option>` : ''}${list.map((j) => `<option value="${j}" ${+v === j ? 'selected' : ''}>${esc(H[j])}</option>`).join('')}</select>`;
    const allIdx = ds.headers.map((h, j) => j);
    const h = o.head, ent = c.entity >= 0 ? H[c.entity] : 'dòng';
    const before = o.rawRate != null && isRate ? { a: o.rawRate, b: h.rate, l: 'Tỷ lệ đạt' } : { a: o.rawMean, b: o.M(o.rows).mean, l: 'Trung bình ' + (c.primary >= 0 ? H[c.primary] : '') };
    const RL = { bi: 'Power BI', xl: 'Excel', ppt: 'PowerPoint' };
    const maxS = Math.max(...Object.values(rep.s), 1);

    body.innerHTML = `
    <div class="card sb-cfg">
      <div class="formgrid">
        <label class="field">Đếm theo${sel('skEnt', allIdx, c.entity, '— Mỗi dòng là 1 đối tượng —')}</label>
        <label class="field">Chỉ số chính${sel('skPri', c.nums, c.primary)}</label>
        <label class="field">Cột thời gian${sel('skDate', allIdx, c.date, '— Không có —')}</label>
        <label class="field">Mốc “đạt” (${c.primary >= 0 ? esc(H[c.primary]) : ''} ≥)<input id="skThr" data-sk type="number" placeholder="${o.thr != null ? 'tự nhận: ' + o.thr : 'bỏ trống = dùng trung bình'}" value="${esc(c.thr)}"></label>
      </div>
      <div class="sb-dims mt"><span class="muted">Chiều phân tích:</span> ${c.dimPool.slice(0, 14).map((j) => `<label class="check"><input type="checkbox" data-skdim="${j}" ${c.dims.includes(j) ? 'checked' : ''}> ${esc(H[j])}</label>`).join('')}</div>
    </div>

    <section class="sb-sec"><h2><b>1</b> Dữ liệu này thật ra là gì</h2>
      <div class="kpis">
        <div class="kpi"><div class="lbl">Bản ghi gốc</div><div class="val">${fN(ds.rows.length)}</div><div class="sub">${ds.headers.length} cột</div></div>
        <div class="kpi"><div class="lbl">Sau làm sạch</div><div class="val">${fN(o.rows.length)}</div><div class="sub">${fN(ds.rows.length - o.rows.length)} dòng bị loại</div></div>
        ${c.entity >= 0 ? `<div class="kpi"><div class="lbl">Số ${esc(ent)} thật</div><div class="val">${fN(o.latest.length)}</div><div class="sub">${f1(o.rows.length / Math.max(1, o.latest.length))} lượt / đối tượng</div></div>` : ''}
        <div class="kpi"><div class="lbl">${isRate ? 'Tỷ lệ đạt' : 'Trung bình'}</div><div class="val sb-acc">${fmt(h.val)}</div><div class="sub">${fd.tl ? esc(fd.tl) : esc(c.primary >= 0 ? H[c.primary] : '')}</div></div>
        <div class="kpi"><div class="lbl">Dòng có lỗi</div><div class="val">${pc(res.rowsWithIssues / Math.max(1, res.rows), 0)}</div><div class="sub">${fN(res.rowsWithIssues)} dòng · điểm CL ${res.score}/100</div></div>
      </div>
      <ul class="sb-list">
        ${c.entity >= 0 && o.rows.length > o.latest.length ? `<li><b>Đơn vị đếm:</b> mỗi <code>${esc(ent)}</code> có thể có nhiều dòng → đếm theo đối tượng, lấy kết quả mới nhất. Đếm theo dòng ra ${fmt(o.perRow.val)}, theo đối tượng ra ${fmt(h.val)} (lệch ${isRate ? f1(Math.abs(o.perRow.val - h.val) * 100) + ' điểm %' : f1(Math.abs(o.perRow.val - h.val))}).</li>` : ''}
        ${c.primary >= 0 ? `<li><b>Chỉ số chính:</b> <code>${esc(H[c.primary])}</code>${o.rel ? ` = ${o.rel === 'mean' ? 'trung bình' : 'tổng'} của ${c.comps.map((j) => `<code>${esc(H[j])}</code>`).join(', ')}` : ''}${o.thr != null ? ` · mốc đạt ≥ ${o.thr}${o.thrAuto ? ' (suy ra từ cột ' + esc(H[c.target]) + ')' : ''}` : ''}.</li>` : ''}
        ${c.dims.length ? `<li><b>Chiều phân tích:</b> ${c.dims.map((j) => `<code>${esc(H[j])}</code>`).join(', ')}${c.date >= 0 ? ` · thời gian <code>${esc(H[c.date])}</code>` : ''}.</li>` : ''}
        <li><b>Câu hỏi quản lý sẽ hỏi, theo thứ tự:</b> thiếu ở đâu → thiếu cái gì → làm gì thì cải thiện → dữ liệu có đáng tin không.</li>
      </ul>
    </section>

    <section class="sb-sec"><h2><b>2</b> Lỗi tìm thấy <small>${iss.length} loại</small></h2>
      <div class="tablewrap"><table class="tbl sb-tbl"><thead><tr><th>#</th><th>Mức</th><th>Lỗi</th><th>Cột</th><th>Số dòng</th><th>Ví dụ</th><th>Cách xử lý</th></tr></thead><tbody>
      ${iss.slice(0, 25).map((x, i) => `<tr><td>${i + 1}</td><td><span class="sev ${x.sev}">${A.SEV[x.sev].label}</span></td><td><b>${esc(x.what)}</b><div class="muted">${esc(x.cat)}</div></td><td>${esc(x.cols)}</td><td class="num">${fN(x.n)}</td><td class="sb-ex">${esc(x.ex)}</td><td>${esc(x.fix)}</td></tr>`).join('')}
      ${iss.length ? '' : '<tr><td colspan="7" class="muted">Không phát hiện lỗi theo các quy tắc hiện tại.</td></tr>'}
      </tbody></table></div>
      ${iss.length > 25 ? `<p class="muted">Còn ${iss.length - 25} loại nhỏ hơn — xem tab <a href="#issues" data-go="issues">Danh sách lỗi</a>.</p>` : ''}
    </section>

    <section class="sb-sec"><h2><b>3</b> Làm lại thế nào</h2>
      <p class="muted">Làm hết trong Power Query (Excel hoặc Power BI), không sửa tay — có file mới chỉ cần Refresh, ai mở cũng thấy từng bước.</p>
      <div class="tablewrap"><table class="tbl sb-tbl"><thead><tr><th>Bước</th><th>Vì sao</th><th>Tác động</th><th>Còn lại</th></tr></thead><tbody>
      ${o.log.map((x) => `<tr><td><b>${esc(x.step)}</b></td><td>${esc(x.what)}</td><td class="num">${x.step === 'Dữ liệu gốc' ? '' : fN(x.n)}</td><td class="num"><b>${fN(x.left)}</b></td></tr>`).join('')}
      </tbody></table></div>
      <div class="grid2 mt">
        <div class="note"><b>Trước làm sạch:</b> ${esc(before.l)} = ${isRate && before.l === 'Tỷ lệ đạt' ? pc(before.a) : f1(before.a)}<br><b>Sau làm sạch:</b> ${isRate && before.l === 'Tỷ lệ đạt' ? pc(before.b) : f1(before.b)} → làm sạch ${Math.abs((before.b || 0) - (before.a || 0)) > (isRate ? 0.005 : 0.5) ? '<b>làm đổi kết luận</b>' : 'không đổi kết luận nhiều'}.</div>
        <div class="note warn"><b>Nguyên tắc:</b> gắn cờ lỗi <i>trước</i> khi sửa (sửa rồi thì hết lỗi để đếm) · giữ cột gốc khi tính lại · mapping viết tay + bước dò biến thể chỉ đánh dấu, người quyết định.</div>
      </div>
    </section>

    <section class="sb-sec"><h2><b>4</b> Phân tích ra sao</h2>
      <div class="sb-finds">${fd.list.map((f, i) => `<div class="sb-find"><span class="sb-n">${i + 1}</span><div><b>${esc(f.t)}</b><div>${esc(f.n)}</div></div></div>`).join('') || '<p class="muted">Chọn thêm chiều phân tích để tìm khoảng cách.</p>'}</div>
      <div class="grid2 mt">
        ${o.gaps.filter((g) => g.groups.length).map((g) => { const mx = Math.max(...g.groups.map((x) => x.val || 0)); return `<div class="card"><h3>Thiếu ở đâu · ${esc(g.name)}</h3><p class="muted">Chỉ nhóm ≥ ${o.minN} ${c.entity >= 0 ? 'đối tượng' : 'dòng'}${g.hidden ? ` · ẩn ${g.hidden} nhóm nhỏ` : ''}</p>
          <div class="sb-bars">${g.groups.slice(0, 14).map((x) => `<div class="sb-row"><span class="sb-l" title="${esc(x.v)}">${esc(x.v)}</span>${bar(x.val || 0, mx, x === g.low ? 'low' : '')}<span class="sb-v">${fmt(x.val)}</span><span class="sb-c">${fN(x.n)}</span></div>`).join('')}</div></div>`; }).join('')}
        ${o.compStats.length ? (() => { const mx = Math.max(...o.compStats.map((x) => x.mean)); return `<div class="card"><h3>Thiếu cái gì · theo thành phần</h3><p class="muted">Trung bình, bỏ các ô 0 (không làm)</p><div class="sb-bars">${o.compStats.map((x, i) => `<div class="sb-row"><span class="sb-l">${esc(x.name)}</span>${bar(x.mean, mx, i === 0 ? 'low' : '')}<span class="sb-v">${f1(x.mean)}</span></div>`).join('')}</div></div>`; })() : ''}
        ${o.trend && o.trend.length ? `<div class="card"><h3>Xu hướng theo năm</h3><p class="muted">Đếm theo lượt trong năm${o.trendLow ? ` · cột cuối: riêng nhóm “${esc(o.trendLow)}”` : ''}</p>
          <table class="tbl sb-tbl"><thead><tr><th>Năm</th><th>Lượt</th><th>${isRate ? 'Tỷ lệ đạt' : 'Trung bình'}</th>${o.trendLow ? `<th>% là nhóm yếu</th><th>Riêng nhóm yếu</th>` : ''}</tr></thead><tbody>
          ${o.trend.map((t) => `<tr${o.mix && o.mix.y === t.y ? ' class="sb-hl"' : ''}><td>${t.y}</td><td class="num">${fN(t.n)}</td><td class="num">${fmt(t.val)}</td>${o.trendLow ? `<td class="num">${pc(t.lowShare, 0)}</td><td class="num">${t.lowVal == null ? '—' : fmt(t.lowVal)}</td>` : ''}</tr>`).join('')}</tbody></table>
          ${o.mix ? `<p class="note warn mt"><b>Hiệu ứng cơ cấu:</b> năm ${o.mix.y} giảm vì nhóm yếu chiếm nhiều lượt hơn, không phải vì kết quả đi xuống → vẽ 2 đường: chung và riêng nhóm yếu.</p>` : ''}</div>` : ''}
        ${o.repeat && o.repeat.n ? (() => { const r = o.repeat; return `<div class="card"><h3>Làm gì thì cải thiện · làm lại</h3>
          <div class="kpis sb-mini"><div class="kpi"><div class="lbl">Làm lại ≥ 2 lần</div><div class="val">${fN(r.n)}</div><div class="sub">${pc(r.rate)} số đối tượng</div></div><div class="kpi"><div class="lbl">Có tăng</div><div class="val">${pc(r.impRate, 0)}</div><div class="sub">trung bình +${f1(r.gain)}</div></div>${isRate ? `<div class="kpi"><div class="lbl">Từ chưa đạt → đạt</div><div class="val">${fN(r.up)}</div></div>` : ''}</div>
          ${r.byGroup.length ? `<div class="sb-bars">${r.byGroup.slice(0, 10).map((x, i) => `<div class="sb-row"><span class="sb-l">${esc(x.v)}</span>${bar(x.rate, 1, i === 0 ? 'low' : '')}<span class="sb-v">${pc(x.rate)}</span><span class="sb-c">${fN(x.n)}</span></div>`).join('')}</div>` : ''}</div>`; })() : ''}
      </div>
      <div class="card mt"><h3>Đề xuất hành động</h3><ol class="sb-ol">${actions(c, o, H, fd).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
    </section>

    <section class="sb-sec"><h2><b>5</b> Nên làm báo cáo dạng nào</h2>
      <div class="formgrid sb-q">
        <label class="field">Ai xem?<select id="skAud" data-sk><option value="exec" ${c.audience === 'exec' ? 'selected' : ''}>Quản lý cấp cao</option><option value="ops" ${c.audience === 'ops' ? 'selected' : ''}>Team vận hành / người xử lý</option><option value="review" ${c.audience === 'review' ? 'selected' : ''}>Người chấm bài / IT / BI</option></select></label>
        <label class="field">Bao lâu cập nhật?<select id="skFreq" data-sk><option value="once" ${c.freq === 'once' ? 'selected' : ''}>Một lần</option><option value="weekly" ${c.freq === 'weekly' ? 'selected' : ''}>Hàng tuần / tháng</option><option value="daily" ${c.freq === 'daily' ? 'selected' : ''}>Hàng ngày</option></select></label>
        <label class="field">Để làm gì?<select id="skNeed" data-sk><option value="present" ${c.need === 'present' ? 'selected' : ''}>Trình bày, ra quyết định</option><option value="explore" ${c.need === 'explore' ? 'selected' : ''}>Tự lọc, khám phá</option><option value="track" ${c.need === 'track' ? 'selected' : ''}>Theo dõi, xử lý từng dòng</option></select></label>
      </div>
      <div class="sb-rep mt">${['bi', 'xl', 'ppt'].map((k) => `<div class="sb-card ${rep.best === k ? 'best' : ''}"><div class="sb-rh"><b>${RL[k]}</b>${rep.best === k ? '<span class="sb-tag">Nên chọn</span>' : rep.second === k ? '<span class="sb-tag alt">Kèm theo</span>' : ''}</div>${bar(rep.s[k], maxS, rep.best === k ? '' : 'mute')}<ul>${rep.why[k].map((w) => `<li>${esc(w)}</li>`).join('') || '<li class="muted">Không có lý do nổi bật</li>'}</ul></div>`).join('')}</div>
      <p class="note mt">Thực tế thường kết hợp: <b>${RL[rep.best]}</b> làm bản chính, <b>${RL[rep.second]}</b> đi kèm${rep.best === 'bi' ? ' (xuất PDF để phòng máy người xem không mở được .pbix)' : ''}.</p>

      <div class="sb-tabs mt" id="sbTabs">${['bi', 'xl', 'ppt'].map((k) => `<button class="chip ${k === (ST[key].tab || rep.best) ? 'on' : ''}" data-sbtab="${k}">Dàn ý ${RL[k]}</button>`).join('')}</div>
      <div class="card mt sb-pane" data-pane="bi" ${(ST[key].tab || rep.best) === 'bi' ? '' : 'hidden'}>
        <h3>Luồng dữ liệu · Power Query</h3>
        <table class="tbl sb-tbl"><thead><tr><th>Query</th><th>Làm gì</th><th>Vì sao</th></tr></thead><tbody>${bi.m.map((x) => `<tr><td><code>${esc(x[0])}</code></td><td>${esc(x[1])}</td><td>${esc(x[2])}</td></tr>`).join('')}</tbody></table>
        ${bi.latestM ? `<p class="muted mt">Cột Is Latest (M):</p><pre class="sb-code">${esc(bi.latestM)}</pre>` : ''}
        <h3 class="mt">Measure (DAX) theo đúng tên cột của file</h3>
        ${bi.dax.map((x) => `<div class="sb-dax"><div><b>${esc(x[0])}</b> <span class="muted">— ${esc(x[2])}</span></div><pre class="sb-code">${esc(x[0])} =\n${esc(x[1])}</pre></div>`).join('')}
        <h3 class="mt">Các trang</h3><ol class="sb-ol">${bi.pages.map((p) => `<li><b>${esc(p[0])}:</b> ${esc(p[1])}</li>`).join('')}</ol>
        <p class="muted">Model: không cần relationship nếu mỗi trang đọc một bảng chính. Sort by column cho cột thứ bậc; cột mã/năm đặt Don't summarize.</p>
      </div>
      <div class="card mt sb-pane" data-pane="xl" ${(ST[key].tab || rep.best) === 'xl' ? '' : 'hidden'}>
        <h3>Cấu trúc file Excel</h3>
        <table class="tbl sb-tbl"><thead><tr><th>Sheet / cột</th><th>Làm gì</th><th>Công thức</th></tr></thead><tbody>${xl.map((x) => `<tr><td><b>${esc(x[0])}</b></td><td>${esc(x[1])}</td><td><code>${esc(x[2])}</code></td></tr>`).join('')}</tbody></table>
      </div>
      <div class="card mt sb-pane" data-pane="ppt" ${(ST[key].tab || rep.best) === 'ppt' ? '' : 'hidden'}>
        <h3>Dàn ý slide — mỗi slide một thông điệp, tiêu đề là câu kết luận</h3>
        <table class="tbl sb-tbl"><thead><tr><th>#</th><th>Slide</th><th>Tiêu đề (kết luận)</th><th>Nội dung</th></tr></thead><tbody>${ppt.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x[0])}</td><td><b>${esc(x[1])}</b></td><td>${esc(x[2])}</td></tr>`).join('')}</tbody></table>
      </div>
    </section>

    <section class="sb-sec"><h2><b>6</b> Giới hạn — nói trước khi bị hỏi</h2>
      <ul class="sb-list">${limits(c, o, H).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </section>

    <div class="card row wrap sb-act">
      <button class="btn primary" id="sbDl">Tải sổ tay (HTML)</button>
      <button class="btn" id="sbAI">AI viết lời kể &amp; câu hỏi phỏng vấn</button>
      <span class="muted">AI chỉ nhận các con số tổng hợp ở trên, không nhận dữ liệu gốc.</span>
    </div>
    <div class="card mt aiout" id="sbAIOut" ${ST[key].ai ? '' : 'hidden'}>${ST[key].ai && window.marked ? marked.parse(ST[key].ai) : ''}</div>`;
  }

  function summaryJSON(ds, res) {
    const s = ST[ds.id]; if (!s || !s.o) return '';
    const c = s.cfg, o = s.o, H = HX(ds, c);
    return JSON.stringify({
      file: ds.name, rows: ds.rows.length, cleanRows: o.rows.length, entities: o.latest.length, entityCol: c.entity >= 0 ? H[c.entity] : null,
      primary: c.primary >= 0 ? H[c.primary] : null, threshold: o.thr, headline: { value: o.head.val, isRate: o.hasPass, perRowValue: o.perRow.val },
      cleaning: o.log, issues: issueRows(ds, res, c, o).slice(0, 15).map((x) => ({ what: x.what, cols: x.cols, n: x.n, ex: x.ex })),
      gaps: o.gaps.map((g) => ({ dim: g.name, groups: g.groups.slice(0, 12).map((x) => ({ v: x.v, n: x.n, val: x.val })) })),
      components: o.compStats, trend: o.trend, mixEffect: o.mix, repeat: o.repeat, findings: findings(c, o, H).list.map((f) => f.t + ': ' + f.n)
    });
  }

  function exportHTML(ds) {
    const el = $('#studyBody'); if (!el) return;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.sb-cfg,.sb-act,.sb-tabs,.sb-q').forEach((n) => n.remove());
    clone.querySelectorAll('[hidden]').forEach((n) => n.removeAttribute('hidden'));
    clone.querySelectorAll('select,input').forEach((n) => n.remove());
    const css = `body{font-family:Inter,Segoe UI,sans-serif;max-width:1080px;margin:24px auto;padding:0 16px;color:#1e293b;line-height:1.5}h1{font-size:24px}h2{font-size:19px;border-bottom:2px solid #1F3864;padding-bottom:4px;margin-top:28px}h2 b{background:#1F3864;color:#fff;border-radius:6px;padding:0 8px;margin-right:6px}h2 small{color:#64748b;font-weight:500;font-size:13px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f5f9}.num{text-align:right}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.kpi{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px}.kpi .lbl,.muted,.kpi .sub{color:#64748b;font-size:12px}.kpi .val{font-size:22px;font-weight:700}.sb-acc{color:#E8730C}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-top:12px}.note{background:#eef2ff;border-radius:8px;padding:10px 12px;font-size:13px}.note.warn{background:#fff7ed}.sb-row{display:grid;grid-template-columns:160px 1fr 64px 48px;gap:8px;align-items:center;font-size:12.5px;margin:3px 0}.sb-l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-bar{display:block;height:10px;background:#f1f5f9;border-radius:5px}.sb-bar i{display:block;height:100%;background:#1F3864;border-radius:5px}.sb-bar.low i{background:#E8730C}.sb-v{text-align:right;font-weight:600}.sb-c{text-align:right;color:#64748b}.sb-find{display:flex;gap:10px;border-left:4px solid #E8730C;background:#fff7ed;padding:8px 12px;margin:8px 0;border-radius:6px}.sb-n{font-weight:800;color:#E8730C}.sb-code{background:#0f172a;color:#e2e8f0;padding:8px 10px;border-radius:6px;font-size:12px;white-space:pre-wrap}.sb-rep{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.sb-card{border:1px solid #e2e8f0;border-radius:10px;padding:10px}.sb-card.best{border:2px solid #E8730C}.sb-tag{background:#E8730C;color:#fff;border-radius:99px;padding:1px 8px;font-size:11px;margin-left:6px}.sb-tag.alt{background:#64748b}.sev{font-size:11px;font-weight:600}.sb-hl td{background:#fff7ed}@media(max-width:700px){.grid2,.sb-rep{grid-template-columns:1fr}}`;
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sổ tay phân tích - ${esc(ds.name)}</title><style>${css}</style></head><body><h1>Sổ tay phân tích — ${esc(ds.name)}</h1><p class="muted">Tạo lúc ${new Date().toLocaleString('vi-VN')}</p>${clone.innerHTML}</body></html>`;
    U.download(new Blob([html], { type: 'text/html' }), U.safeName(`So tay phan tich - ${ds.name.replace(/\.\w+$/, '')}.html`));
  }

  async function runAI(ds, res) {
    const AI = MD.AI; const s = AI.settings();
    if (!s.key) { U.toast('Chưa có API key — vào tab Cài đặt', 'err'); return; }
    U.loading(true, 'AI đang viết…');
    try {
      const r = await AI.call([{ role: 'user', content: `Đây là kết quả phân tích một file dữ liệu (JSON, chỉ số tổng hợp):\n${summaryJSON(ds, res)}\n\nViết bằng tiếng Việt, ngắn gọn:\n1. Câu chuyện của bài trong 2 câu.\n2. 3 phát hiện chính, mỗi phát hiện: tiêu đề kết luận + con số.\n3. Đề xuất hành động (3 ý).\n4. 6 câu hỏi người phỏng vấn/quản lý có thể hỏi về bài này (viết câu hỏi bằng tiếng Anh đơn giản), mỗi câu 2–3 gạch đầu dòng ý trả lời bằng tiếng Anh rất đơn giản, nói số trước.\nKhông bịa số ngoài dữ liệu đã cho.` }]);
      ST[ds.id].ai = r.text;
    } catch (e) { U.toast(e.message, 'err', 8000); }
    U.loading(false);
    render(ds, res);
  }

  function bind(getDs, getRes) {
    document.addEventListener('change', (e) => {
      const t = e.target; if (!t.closest || !t.closest('#studyBody')) return;
      const ds = getDs(), res = getRes(); if (!ds || !ST[ds.id]) return;
      const c = ST[ds.id].cfg;
      if (t.dataset.skdim) { const j = +t.dataset.skdim; c.dims = t.checked ? c.dims.concat(j).slice(-4) : c.dims.filter((x) => x !== j); }
      else if (t.id === 'skEnt') c.entity = +t.value;
      else if (t.id === 'skPri') { c.primary = +t.value; c.comps = []; c.thr = ''; }
      else if (t.id === 'skDate') c.date = +t.value;
      else if (t.id === 'skThr') c.thr = t.value;
      else if (t.id === 'skAud') c.audience = t.value;
      else if (t.id === 'skFreq') c.freq = t.value;
      else if (t.id === 'skNeed') c.need = t.value;
      else return;
      const y = window.scrollY; render(ds, res); window.scrollTo(0, y);
    });
    document.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest('[data-sbtab],#sbDl,#sbAI'); if (!t) return;
      const ds = getDs(), res = getRes(); if (!ds) return;
      if (t.dataset.sbtab) { ST[ds.id].tab = t.dataset.sbtab; document.querySelectorAll('[data-sbtab]').forEach((b) => b.classList.toggle('on', b === t)); document.querySelectorAll('.sb-pane').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.sbtab; }); return; }
      if (t.id === 'sbDl') return exportHTML(ds);
      if (t.id === 'sbAI') return runAI(ds, res);
    });
  }

  MD.Study = { render, bind, detect, compute, summaryJSON };
})(window.MD);
