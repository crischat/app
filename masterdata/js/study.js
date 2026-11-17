(function (MD) {
  'use strict';
  const U = MD.U, A = MD.Analyzer;
  const { $, esc } = U;
  const ST = {};
  const UNASSIGNED = '(Chưa xác định)';

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
  const SUM_ROLES = ['amount', 'qty', 'closing', 'opening', 'inflow', 'outflow'];
  const SCOREISH = /(score|diem|eff|efficiency|uph|ty le|rate|kpi|nang suat|hieu suat|grade|level)/;
  const DIM_ROLES = ['position', 'dept', 'team', 'category', 'warehouse', 'supplier', 'status', 'unit', 'gender', 'address'];

  const ds0len = (H) => (H[H.length - 1] || '').startsWith('Cấp bậc (suy luận từ') ? H.length - 1 : H.length;
  const ABBR = [[/\b(tp )?hcm\b|\btphcm\b|\bsai gon\b|\bho chi minh\b/g, 'hochiminh'], [/\bhn\b|\bha noi\b/g, 'hanoi'], [/\bdn\b|\bda nang\b/g, 'danang']];
  const abbr = (k) => ABBR.reduce((x, [re, to]) => x.replace(re, to), k).replace(/\s+/g, ' ').trim();
  const HX = (ds, c) => (c.levelSrc >= 0 ? ds.headers.concat(['Cấp bậc (suy luận từ ' + ds.headers[c.levelSrc] + ')']) : ds.headers);

  function detect(ds, res) {
    const P = res.profile || [], n = ds.rows.length, H0 = ds.headers;
    const isNum = (p) => p.type === 'number' && p.num;
    const entity = P.find((p) => p.type !== 'empty' && p.fillRate > 0.9 && p.uniqueRatio < 0.995 && p.uniqueRatio > 0.05 &&
      (['emp_id', 'sku'].includes(p.role) || ENTITY_RE.test(nk(p.name))));
    const date = P.find((p) => p.type === 'date' && !['expiry', 'dob', 'join_date'].includes(p.role));
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
      agg: !primary ? 'count' : (SUM_ROLES.includes(primary.role) || /(so luong|qty|thanh tien|amount|doanh thu|revenue|gia tri|value|ton)/.test(nk(primary.name))) ? 'sum' : 'mean',
      mode: 'auto', thr: '', audience: 'exec', freq: 'once', need: 'present', n
    };
  }

  function catPass(v, kind, passVals) {
    const k = nk(U.display(v));
    if (!k) return null;
    if (kind === 'custom') return (passVals || []).includes(k) ? 1 : 0;
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
    out.log.push({ step: 'Nạp dữ liệu gốc', what: 'Giữ nguyên trạng làm cơ sở đối chiếu', n: R.length, left: R.length });
    if (dropRows.size) out.log.push({ step: 'Loại dòng trống / dòng tổng', what: 'Tránh cộng trùng giá trị tổng hợp', n: dropRows.size, left: R.length - dropRows.size });
    out.log.push({ step: 'Loại bản ghi trùng lặp', what: 'Bản ghi trùng hoàn toàn làm sai số đếm', n: dup, left: base.length });

    const canon = {};
    (res.clusters || []).forEach((cl) => { const m = new Map(); cl.groups.forEach((g) => g.variants.forEach((x) => { if (x.v !== g.canonical && (nk(x.v).replace(/ /g, '') === nk(g.canonical).replace(/ /g, '') || (A.canonKey && A.canonKey(x.v, cl.role) === A.canonKey(g.canonical, cl.role)))) m.set(x.v, g.canonical); })); canon[cl.col] = m; });
    const VL = ds.headers.length;
    const base0 = (r, j) => { const s = U.display(r[j]).trim().replace(/\s+/g, ' '); if (!s) return UNASSIGNED; return (canon[j] && canon[j].get(U.display(r[j]))) || s; };
    const typo = {}, typoList = [];
    c.dims.concat(c.levelSrc >= 0 ? [c.levelSrc] : []).forEach((j) => {
      if (j === VL || typo[j]) return;
      const cnt = new Map();
      base.forEach((i) => { const v = base0(R[i], j); if (v !== UNASSIGNED) cnt.set(v, (cnt.get(v) || 0) + 1); });
      const sig = (v) => { const k = abbr(nk(v)); return k.length < 4 ? '#' + k : k.split(' ').map((w) => (w.length >= 4 ? w.replace(/s$/, '').split('').sort().join('') : w)).join(' '); };
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
      base.forEach((i) => { const p = catPass(R[i][c.target], c.targetKind, c.passVals), v = num(R[i][P]); if (p === 1 && v > 0) { lo = Math.min(lo, v); cnt++; } });
      if (isFinite(lo)) {
        base.forEach((i) => { const p = catPass(R[i][c.target], c.targetKind, c.passVals), v = num(R[i][P]); if (p === 0 && v >= lo) failAbove.push(i); });
        if (failAbove.length <= cnt * 0.02) { thr = lo; thrAuto = true; }
      }
    }
    out.thr = thr; out.thrAuto = thrAuto;
    out.passList = [];
    if (c.target >= 0) { const seenP = new Set(); base.forEach((i) => { const v = U.display(R[i][c.target]).trim(); if (v && !seenP.has(v) && catPass(R[i][c.target], c.targetKind, c.passVals) === 1) { seenP.add(v); out.passList.push(v); } }); }

    const rows = [];
    let zeroComp = 0, recalced = 0, levelChanged = 0, invalid = 0, rawSum = 0, rawN = 0, rawPass = 0, rawPassN = 0;
    const zeroEx = [];
    base.forEach((i) => {
      const r = R[i];
      const pv0 = P >= 0 ? num(r[P]) : null;
      if (pv0 != null) { rawSum += pv0; rawN++; }
      const cp0 = c.target >= 0 ? catPass(r[c.target], c.targetKind, c.passVals) : (thr != null && pv0 != null ? +(pv0 >= thr) : null);
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
      else if (c.target >= 0) pass = catPass(r[c.target], c.targetKind, c.passVals);
      if (recalc && cp0 != null && pass != null && pass !== cp0) levelChanged++;
      const bad = P >= 0 && (pv == null || (pv === 0 && c.agg === 'mean')) || (c.target >= 0 && catPass(r[c.target], c.targetKind, c.passVals) == null && !recalc);
      if (bad) { invalid++; return; }
      const d = c.date >= 0 ? U.toDate(r[c.date]) : null;
      rows.push({ i, ent: c.entity >= 0 ? U.display(r[c.entity]).trim() : 'r' + i, d, t: d ? +d : i, pv, pass, cv, dims: c.dims.map((j) => dimVal(r, j)), recalc });
    });
    if (typoList.length) out.log.push({ step: 'Chuẩn hoá biến thể chính tả', what: typoList.slice(0, 3).map((x) => x.from + ' → ' + x.to).join(', ') + ' — phát hiện tự động, cần phê duyệt', n: typoList.reduce((a, x) => a + x.n, 0), left: base.length });
    if (mapped) out.log.push({ step: 'Chuẩn hoá giá trị danh mục', what: 'Hợp nhất khác biệt hoa/thường, dấu, khoảng trắng', n: mapped, left: base.length });
    if (zeroComp) out.log.push({ step: 'Xử lý giá trị 0 ở cấu phần', what: rel ? `Chuyển 0 thành rỗng, tính lại ${H[P]} trên các cấu phần có dữ liệu` : 'Giá trị 0 thể hiện không thực hiện, không phải kết quả bằng 0', n: zeroComp, left: base.length });
    out.log.push({ step: 'Loại bản ghi không hợp lệ', what: 'Thiếu chỉ số đo lường hoặc mã kết quả ngoài danh mục', n: invalid, left: rows.length });

    const by = new Map();
    rows.forEach((x) => { if (!by.has(x.ent)) by.set(x.ent, []); by.get(x.ent).push(x); });
    by.forEach((list) => list.sort((a, b) => a.t - b.t || a.i - b.i));
    let mode = c.mode;
    if (mode === 'auto') {
      if (c.entity < 0 || c.date < 0) mode = 'rows';
      else {
        let rep = 0, multi = 0;
        by.forEach((l) => { if (l.length >= 2) { rep++; if (l.every((x) => x.d) && new Set(l.map((x) => +x.d)).size >= 2) multi++; } });
        mode = rep && multi / rep >= 0.6 ? 'latest' : 'rows';
      }
    }
    out.mode = mode;
    const latest = [];
    if (mode === 'latest') by.forEach((list) => latest.push(list[list.length - 1])); else rows.forEach((x) => latest.push(x));
    out.nEnt = c.entity >= 0 ? by.size : rows.length;
    out.multi = c.entity >= 0 && mode !== 'latest' && rows.length / Math.max(1, by.size) >= 1.1;
    if (mode === 'latest') out.log.push({ step: 'Lấy kết quả mới nhất theo ' + H[c.entity], what: 'Chỉ số hiện trạng tính theo đối tượng, không theo lần ghi nhận', n: rows.length - latest.length, left: latest.length });
    out.rows = rows; out.latest = latest; out.by = by; out.dup = dup; out.blanks = blanks; out.mapped = mapped;
    out.zeroComp = zeroComp; out.zeroEx = zeroEx; out.recalced = recalced; out.levelChanged = levelChanged; out.invalid = invalid;
    out.rawSum = rawSum; out.rawMean = rawN ? rawSum / rawN : null; out.rawRate = rawPassN ? rawPass / rawPassN : null;

    const hasPass = rows.some((x) => x.pass != null);
    out.hasPass = hasPass;
    const agg = P < 0 ? 'count' : c.agg;
    out.agg = agg;
    out.dir = hasPass || (agg === 'mean' && P >= 0 && SCOREISH.test(nk(H[P]))) ? 'low' : 'top';
    out.fmt = (x) => (hasPass ? pc(x) : agg === 'mean' ? f1(x) : fN(x));
    out.valLabel = hasPass ? 'Tỷ lệ đạt' : agg === 'sum' ? 'Tổng ' + H[P] : agg === 'count' ? 'Số bản ghi' : 'Trung bình ' + H[P];
    const M = (list) => {
      const n = list.length, pv = list.filter((x) => x.pv != null);
      const mean = pv.length ? pv.reduce((s, x) => s + x.pv, 0) / pv.length : null;
      const sum = pv.reduce((s, x) => s + x.pv, 0);
      const pl = list.filter((x) => x.pass != null), ps = pl.reduce((s, x) => s + x.pass, 0);
      return { n, mean, sum, pass: ps, rate: pl.length ? ps / pl.length : null, val: hasPass ? (pl.length ? ps / pl.length : null) : agg === 'sum' ? sum : agg === 'count' ? n : mean };
    };
    out.M = M;
    out.head = M(latest);
    out.perRow = M(rows);
    const minN = Math.max(latest.length >= 300 ? 10 : 3, Math.round(latest.length * 0.005));
    out.minN = minN;
    out.gaps = c.dims.map((j, k) => {
      const g = new Map();
      latest.forEach((x) => { const v = x.dims[k]; if (!g.has(v)) g.set(v, []); g.get(v).push(x); });
      const all = Array.from(g.entries()).map(([v, l]) => Object.assign({ v }, M(l)));
      const tot = all.reduce((a, x) => a + (out.dir === 'top' ? (x.val || 0) : x.n), 0) || 1;
      all.forEach((x) => { x.share = (out.dir === 'top' ? (x.val || 0) : x.n) / tot; });
      const sgn = out.dir === 'low' ? 1 : -1;
      const shown = all.filter((x) => x.n >= (out.dir === 'low' ? minN : 1)).sort((a, b) => sgn * ((a.val ?? 0) - (b.val ?? 0)));
      const real = shown.filter((x) => x.v !== UNASSIGNED);
      const big = real.filter((x) => x.n >= latest.length * 0.05);
      return { j, name: H[j], groups: shown, nGroups: all.length, hidden: all.length - shown.length, low: out.dir === 'low' ? (big[0] || real[0]) : real[0], high: real[real.length - 1], top3: real.slice(0, 3).reduce((a, x) => a + x.share, 0), unassigned: (g.get(UNASSIGNED) || []).length };
    });

    out.compStats = comps.map((j, k) => {
      const v = rows.map((x) => x.cv[k]).filter((x) => x != null && x > 0);
      return { j, name: H[j], mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, n: v.length };
    }).filter((x) => x.mean != null).sort((a, b) => a.mean - b.mean);

    if (c.date >= 0) {
      const yrs = new Map(), g0 = out.gaps[0], lowV = g0 && g0.low ? g0.low.v : null;
      const ds0 = rows.filter((x) => x.d).map((x) => +x.d), span = ds0.length ? (Math.max(...ds0) - Math.min(...ds0)) / 864e5 : 0;
      const byMonth = span < 730;
      out.trendUnit = byMonth ? 'Tháng' : 'Năm';
      rows.forEach((x) => { if (!x.d) return; const y = byMonth ? x.d.getFullYear() + '-' + String(x.d.getMonth() + 1).padStart(2, '0') : x.d.getFullYear(); if (!yrs.has(y)) yrs.set(y, []); yrs.get(y).push(x); });
      out.trend = Array.from(yrs.entries()).sort((a, b) => (a[0] > b[0] ? 1 : -1)).map(([y, l]) => {
        const m = M(l), r = { y, n: m.n, val: m.val };
        if (lowV != null) { const ll = l.filter((x) => x.dims[0] === lowV); r.lowShare = ll.length / l.length; r.lowVal = ll.length >= 5 ? M(ll).val : null; r.lowN = ll.length; }
        return r;
      });
      out.trendLow = lowV;
      const t = out.trend; out.mix = null;
      for (let k = 1; k < t.length; k++) {
        const a = t[k - 1], b = t[k];
        if (out.dir === 'low' && a.val != null && b.val != null && b.val < a.val && lowV != null && b.lowShare - a.lowShare > 0.08 && (b.lowVal == null || a.lowVal == null || b.lowVal >= a.lowVal - 0.01)) {
          out.mix = { y: b.y, prev: a, cur: b }; break;
        }
      }
      const lt = t.filter((x) => x.lowVal != null);
      out.lowTrend = lt.length >= 2 ? { from: lt[0], to: lt[lt.length - 1] } : null;
    }

    if (c.entity >= 0 && mode === 'latest') {
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
    structure: 'Chuẩn hoá cấu trúc bảng: một dòng tiêu đề, loại bỏ dòng tổng/dòng trống xen giữa và ô gộp.',
    missing: 'Không xoá bản ghi; gán nhãn "Unassigned" để vẫn tính vào tổng và tách riêng khi phân tích theo nhóm. Thiết lập trường bắt buộc tại nguồn.',
    duplicate: 'Loại bỏ bản ghi trùng trước mọi phép đếm; với trùng khoá, xác định bản ghi hợp lệ theo quy tắc (ví dụ bản mới nhất).',
    conflict: 'Xây dựng bảng danh mục chuẩn (Master Data) và tra cứu thay vì nhập tay.',
    inconsistent: 'Dùng bảng ánh xạ (mapping table) có kiểm soát; bổ sung bước phát hiện biến thể mới, chỉ gắn cờ để người phụ trách phê duyệt.',
    format: 'Ép kiểu dữ liệu ngay ở bước nạp (số, ngày) để tránh sai lệch khi tổng hợp.',
    pattern: 'Chuẩn hoá định dạng mã (chữ hoa/thường, độ dài, số 0 đầu).',
    whitespace: 'Làm sạch khoảng trắng và ký tự ẩn (TRIM/CLEAN) trên toàn bộ cột văn bản.',
    outlier: 'Đối chiếu chứng từ gốc; không tự động loại bỏ, gắn cờ để kiểm tra.',
    logic: 'Kiểm tra theo công thức nghiệp vụ và điều chỉnh tại hệ thống nguồn.',
    custom: 'Xử lý theo quy tắc kiểm tra đã thiết lập.'
  };

  function issueRows(ds, res, c, o) {
    const H = HX(ds, c), list = [];
    res.checks.filter((k) => k.sev !== 'info').forEach((k) => {
      const s0 = k.sample && k.sample[0];
      const ex = s0 ? (s0.value != null && s0.value !== '' ? `"${U.display(s0.value)}"` : '') + (s0.suggest ? ` → "${U.display(s0.suggest)}"` : '') : '';
      list.push({ sev: k.sev, what: k.check, cat: A.CATS[k.cat].label, cols: k.cols.slice(0, 3).join(', '), n: k.n, ex: ex || (s0 && s0.msg) || '', fix: FIX[k.cat] });
    });
    if (o.zeroComp) list.unshift({ sev: 'high', what: 'Giá trị 0 ở cột cấu phần được tính như kết quả thực', cat: 'Sai logic nghiệp vụ', cols: c.comps.map((j) => H[j]).join(', '), n: o.zeroComp, ex: o.zeroEx[0] || '', fix: o.rel === 'mean' ? `Giá trị 0 thể hiện cấu phần không được thực hiện: chuyển thành rỗng và tính lại ${H[c.primary]} trên các cấu phần có dữ liệu; lưu giá trị gốc để đối chiếu.` : 'Chuyển 0 thành rỗng để không làm sai lệch giá trị trung bình.' });
    if (o.multi) list.unshift({ sev: 'info', what: `Một ${H[c.entity]} xuất hiện trên nhiều bản ghi`, cat: 'Đơn vị phân tích', cols: H[c.entity], n: o.rows.length - o.nEnt, ex: `${fN(o.rows.length)} bản ghi / ${fN(o.nEnt)} ${H[c.entity]}`, fix: `Đếm ${H[c.entity]} bằng phép đếm phân biệt (DISTINCTCOUNT / UNIQUE) và tổng hợp chỉ số bằng SUM; không dùng số dòng làm số đối tượng.` });
    if (c.entity >= 0 && o.mode === 'latest' && o.rows.length > o.latest.length) list.unshift({ sev: 'medium', what: 'Một đối tượng có nhiều lần ghi nhận theo thời gian', cat: 'Đơn vị phân tích', cols: H[c.entity], n: o.rows.length - o.latest.length, ex: `${fN(o.rows.length)} lần ghi nhận / ${fN(o.latest.length)} ${H[c.entity]}`, fix: 'Chỉ số hiện trạng tính trên kết quả mới nhất của từng đối tượng (cờ Is Latest); chỉ số xu hướng tính trên toàn bộ lần ghi nhận trong kỳ.' });
    if (o.typoList.length) list.push({ sev: 'medium', what: 'Biến thể chính tả ở cột phân nhóm (đảo ký tự, số nhiều)', cat: 'Nhập không thống nhất', cols: Array.from(new Set(o.typoList.map((x) => x.col))).join(', '), n: o.typoList.reduce((a, x) => a + x.n, 0), ex: o.typoList.slice(0, 2).map((x) => `"${x.from}" → "${x.to}"`).join(', '), fix: 'Ánh xạ về giá trị phổ biến hơn; từ dưới 4 ký tự yêu cầu khớp tuyệt đối. Chỉ gắn cờ, việc gộp do người phụ trách dữ liệu phê duyệt.' });
    c.dims.forEach((j) => { if (o.blanks[j] && !list.some((x) => x.cols.includes(H[j]) && x.cat === A.CATS.missing.label)) list.push({ sev: 'medium', what: 'Thiếu giá trị ở cột phân nhóm', cat: A.CATS.missing.label, cols: H[j], n: o.blanks[j], ex: '(rỗng)', fix: FIX.missing }); });
    return list.sort((a, b) => A.SEV[a.sev].order - A.SEV[b.sev].order || b.n - a.n);
  }

  function reportScore(c, o, ds) {
    const n = ds.rows.length, dims = c.dims.length, hasDate = c.date >= 0;
    const s = { bi: 0, xl: 0, ppt: 0 }, why = { bi: [], xl: [], ppt: [] };
    const add = (k, p, t) => { s[k] += p; why[k].push(t); };
    if (n > 5000) add('bi', 2, `Quy mô ${fN(n)} bản ghi: phù hợp mô hình dữ liệu, Excel bắt đầu chậm`); else add('xl', 2, `Quy mô ${fN(n)} bản ghi: Excel xử lý hiệu quả`);
    if (c.freq === 'daily' || c.freq === 'weekly') { add('bi', 3, 'Cập nhật định kỳ: quy trình làm sạch tự động chạy lại khi Refresh'); if (c.freq === 'weekly') add('xl', 1, 'Chu kỳ tuần/tháng vẫn đáp ứng được bằng Power Query trong Excel'); }
    if (c.freq === 'once') { add('ppt', 3, 'Phân tích một lần: trọng tâm là kết luận và khuyến nghị'); add('xl', 1, 'Excel đủ để tính toán và lưu bằng chứng'); }
    if (dims >= 2 && hasDate) add('bi', 2, `${dims} chiều phân tích kết hợp thời gian: cần lọc chéo và drill-down`);
    if (o.multi || o.mode === 'latest') add('bi', 1, 'Nhiều bản ghi trên mỗi đối tượng: cần measure đếm phân biệt / kết quả mới nhất');
    if (c.audience === 'exec') { add('ppt', 2, 'Ban lãnh đạo: cần thông điệp ngắn gọn, 3–5 phát hiện và khuyến nghị'); add('bi', 1, 'Có thể đính kèm dashboard để tra cứu chi tiết'); }
    if (c.audience === 'ops') add('xl', 3, 'Bộ phận vận hành: cần danh sách chi tiết để xử lý, cập nhật, lọc theo từng dòng');
    if (c.audience === 'analyst') { add('bi', 3, 'Đội phân tích / IT: cần mô hình dữ liệu, measure và luồng xử lý minh bạch'); add('ppt', 1, 'Kèm bản PDF xuất từ báo cáo để lưu hành'); }
    if (c.need === 'explore') add('bi', 2, 'Nhu cầu tự khám phá: slicer, drill-through, tooltip');
    if (c.need === 'track') add('xl', 3, 'Nhu cầu theo dõi xử lý từng bản ghi: Excel / Google Sheets thuận tiện nhất');
    if (c.need === 'present') add('ppt', 2, 'Mục tiêu trình bày và ra quyết định');
    if (o.gaps.filter((g) => g.low).length + (o.compStats.length ? 1 : 0) + (o.repeat ? 1 : 0) <= 4) add('ppt', 1, 'Số lượng phát hiện chính vừa với một bộ slide ngắn');
    const order = Object.entries(s).sort((a, b) => b[1] - a[1]);
    return { s, why, best: order[0][0], second: order[1][0] };
  }

  function bar(v, max, cls) { const w = max ? Math.max(2, Math.round((v / max) * 100)) : 0; return `<span class="sb-bar ${cls || ''}"><i style="width:${w}%"></i></span>`; }

  function findings(c, o, H) {
    const F = [], unit = c.entity >= 0 ? (o.mode === 'latest' ? 'đối tượng' : H[c.entity]) : 'bản ghi';
    const isRate = o.hasPass, fmt = o.fmt;
    const tl = o.thr != null ? `${H[c.primary]} ≥ ${o.thr}` : (c.target >= 0 ? `đạt theo ${H[c.target]}` : '');
    const what = o.agg === 'sum' ? 'tổng ' + H[c.primary] : 'số ' + unit;
    o.gaps.forEach((g) => {
      if (!g.low || !g.high || g.low === g.high || g.nGroups < 2 || (o.dir === 'top' && g.low.share >= 0.9)) return;
      if (o.dir === 'low') {
        const share = g.low.n / o.latest.length;
        const diff = isRate ? f1(Math.abs(g.high.val - g.low.val) * 100) + ' điểm %' : f1(Math.abs(g.high.val - g.low.val));
        F.push({ t: `Khoảng cách lớn nhất theo ${g.name}: nhóm “${g.low.v}”`, n: `Nhóm này chiếm ${pc(share, 0)} ${'số ' + unit}, ${o.valLabel.toLowerCase()} ${fmt(g.low.val)} so với ${fmt(g.high.val)} của “${g.high.v}” (chênh ${diff}).` });
      } else {
        F.push({ t: `Mức độ tập trung theo ${g.name}: “${g.low.v}” dẫn đầu với ${pc(g.low.share, 0)} ${what}`, n: g.nGroups > 3 ? `3 nhóm lớn nhất chiếm ${pc(g.top3, 0)} ${what} — ưu tiên kiểm soát theo nguyên tắc Pareto.` : `${g.low.v}: ${fmt(g.low.val)}.` });
      }
    });
    F.splice(2);
    if (o.compStats.length >= 2) {
      const lo = o.compStats[0], hi = o.compStats[o.compStats.length - 1];
      F.push({ t: `${lo.name} là cấu phần yếu nhất`, n: `Trung bình ${f1(lo.mean)}, thấp hơn ${hi.name} ${f1(hi.mean - lo.mean)} — cấu phần có dư địa cải thiện lớn nhất.` });
    }
    const unitL = (o.trendUnit || 'Năm').toLowerCase();
    if (o.mix) F.push({ t: `Biến động ${unitL} ${o.mix.y} chủ yếu do thay đổi cơ cấu, không phải do suy giảm thực chất`, n: `Tỷ trọng nhóm “${o.trendLow}” tăng từ ${pc(o.mix.prev.lowShare, 0)} lên ${pc(o.mix.cur.lowShare, 0)}.${o.lowTrend ? ` Trong nội bộ nhóm, chỉ số đi từ ${fmt(o.lowTrend.from.lowVal)} (${o.lowTrend.from.y}) lên ${fmt(o.lowTrend.to.lowVal)} (${o.lowTrend.to.y}).` : ''}` });
    else if (o.trend && o.trend.length >= 2) {
      const a = o.trend[0], b = o.trend[o.trend.length - 1];
      const pk = o.trend.reduce((m, x) => ((x.val || 0) > (m.val || 0) ? x : m), o.trend[0]);
      const ch = a.val ? (b.val - a.val) / Math.abs(a.val) : null;
      F.push({ t: `Xu hướng ${a.y} – ${b.y}: ${b.val >= a.val ? 'tăng' : 'giảm'}${ch != null && !isRate ? ' ' + pc(Math.abs(ch), 0) : ''}`, n: `${o.valLabel}: ${fmt(a.val)} → ${fmt(b.val)}; đỉnh tại ${pk.y} (${fmt(pk.val)}).` });
    }
    if (o.repeat && o.repeat.n >= 10) {
      const bg = o.repeat.byGroup, lo = bg[0], hi = bg[bg.length - 1];
      F.push({ t: 'Đo lường lặp lại cho thấy cải thiện, nhưng phân bổ chưa đồng đều giữa các nhóm', n: `${pc(o.repeat.impRate, 0)} đối tượng có kết quả lần gần nhất cao hơn lần đầu (bình quân ${o.repeat.gain >= 0 ? '+' : ''}${fmt(o.repeat.gain)}).${lo && hi && lo !== hi ? ` Tỷ lệ được đo lại: “${lo.v}” ${pc(lo.rate)} so với “${hi.v}” ${pc(hi.rate)}.` : ''}` });
    }
    if (!F.length) F.push({ t: 'Chưa đủ thông tin để xác định phát hiện', n: 'Chọn chỉ số đo lường và ít nhất một chiều phân tích ở phần Cấu hình, hoặc dùng “AI rà soát cấu hình”.' });
    return { list: F, tl };
  }

  function biPlan(c, o, H) {
    const T = 'Fact', P = c.primary >= 0 ? H[c.primary] : 'Value', E = c.entity >= 0 ? H[c.entity] : null, D = c.date >= 0 ? H[c.date] : null;
    const meets = o.hasPass, latest = E && o.mode === 'latest';
    const dax = [
      ['Entity Count', latest ? `CALCULATE ( COUNTROWS ( ${T} ), ${col(T, 'Is Latest')} = 1 )` : E ? `DISTINCTCOUNT ( ${col(T, E)} )` : `COUNTROWS ( ${T} )`, 'Mẫu số của mọi tỷ lệ' + (E ? ` — đếm theo ${E}` : '')],
      o.agg === 'sum' && ['Total ' + P, `SUM ( ${col(T, P)} )`, 'Chỉ số chính'],
      o.agg === 'sum' && ['Share of Total', `DIVIDE ( [Total ${P}], CALCULATE ( [Total ${P}], ALLSELECTED ( ${T} ) ) )`, 'Tỷ trọng theo nhóm, phục vụ phân tích Pareto'],
      meets && ['Meeting Target', `CALCULATE ( [Entity Count], ${col(T, 'Meets Target')} = 1 )`, 'Số đối tượng đạt chuẩn'],
      meets && ['Target Rate', 'DIVIDE ( [Meeting Target], [Entity Count] )', 'Chỉ số chính; DIVIDE trả rỗng khi mẫu số bằng 0'],
      meets && ['Below Target', '[Entity Count] - [Meeting Target]', 'Quy mô cần cải thiện — cơ sở lập kế hoạch'],
      c.primary >= 0 && o.agg !== 'sum' && ['Average ' + P, latest ? `CALCULATE ( AVERAGE ( ${col(T, P)} ), ${col(T, 'Is Latest')} = 1 )` : `AVERAGE ( ${col(T, P)} )`, 'Giá trị bình quân'],
      D && meets && latest && ['Target Rate (Period)', `DIVIDE ( CALCULATE ( COUNTROWS ( ${T} ), ${col(T, 'Meets Target')} = 1 ), COUNTROWS ( ${T} ) )`, 'Xu hướng theo kỳ tính trên toàn bộ lần ghi nhận trong kỳ'],
      o.compStats.length && ['Weakest Component', `VAR t = { ${o.compStats.map((x) => `("${x.name}", AVERAGE ( ${col(T, x.name)} ))`).join(', ')} }\nRETURN MINX ( TOPN ( 1, t, [Value2], ASC ), [Value1] )`, 'Xác định cấu phần yếu nhất bằng tính toán, không gán cứng'],
      latest && ['Repeat Rate', `DIVIDE ( CALCULATE ( [Entity Count], ${col(T, 'Attempts')} >= 2 ), [Entity Count] )`, 'Tỷ lệ đối tượng được đo lại'],
      ['Highlight Color', `IF ( ${meets ? '[Target Rate] < 0.5' : o.agg === 'sum' ? '[Share of Total] >= 0.2' : c.primary >= 0 ? `[Average ${P}] < ${String(Math.round((o.head.mean || 0) * 10) / 10)}` : 'FALSE ()'}, "#E8730C", "#1F3864" )`, 'Định dạng có điều kiện tự động theo dữ liệu']
    ].filter(Boolean);
    const m = [
      ['SourceFilePath', 'Tham số đường dẫn nguồn', 'Chuyển giao và refresh trên máy khác không cần sửa mã'],
      ['Raw', 'Nạp dữ liệu gốc, ép kiểu; không load vào model', 'Một nguồn duy nhất cho mọi bước kiểm tra'],
      c.dims.length ? ['MappingTable', 'Bảng ánh xạ giá trị sai → chuẩn', 'Kiểm soát, kiểm toán được; dễ bổ sung'] : null,
      [T, `Loại trùng → gắn cờ lỗi → chuẩn hoá theo mapping → giá trị rỗng = "Unassigned"${o.zeroComp ? ` → 0 thành null, tính lại ${P}` : ''}${latest ? ' → Is Latest, Attempts' : ''}${meets ? ', Meets Target' : ''}`, 'Bảng sự kiện trung tâm, mọi measure đọc từ đây'],
      latest && o.repeat ? ['Progress', `Mỗi ${E} có từ 2 lần ghi nhận: lần đầu, lần gần nhất, mức thay đổi`, 'Phục vụ biểu đồ phân tán trước – sau'] : null,
      ['DataQuality', 'Thống kê từng loại lỗi trên dữ liệu gốc kèm ví dụ', 'Trang chất lượng dữ liệu, số liệu tính tự động'],
      ['CleaningLog', 'Các bước xử lý, số bản ghi ảnh hưởng và còn lại', `Truy vết ${o.log.map((x) => fN(x.left)).filter((v, i, a) => a.indexOf(v) === i).join(' → ')}`]
    ].filter(Boolean);
    const latestM = latest ? `= Table.AddColumn(Prev, "Is Latest", each if [${D || 'Index'}] = List.Max(Table.SelectRows(Prev, (r) => r[${E}] = [${E}])[${D || 'Index'}]) then 1 else 0, Int64.Type)` : '';
    const g = o.gaps.filter((x) => x.low);
    const pages = [
      ['Tổng quan điều hành', `Thẻ chỉ số (${meets ? 'Target Rate, Below Target' : o.agg === 'sum' ? 'Total ' + P : 'Average ' + P}, Entity Count)${D ? '; biểu đồ đường theo kỳ' + (o.mix ? ' (tách đường tổng và nhóm trọng điểm)' : '') : ''}; phân bổ theo mức kết quả.`],
      g.length ? ['Phân tích theo nhóm', `Bar chart theo ${g.map((x) => x.name).join(', ')}${o.dir === 'low' ? ` (nhóm ≥ ${o.minN})` : ''}; matrix nhóm × mức; định dạng có điều kiện.`] : null,
      (o.compStats.length || o.repeat) ? ['Động lực & cải thiện', `${o.compStats.length ? 'So sánh cấu phần (tô màu cấu phần yếu nhất). ' : ''}${o.repeat ? 'Tỷ lệ đo lại theo nhóm; scatter lần đầu so với lần gần nhất.' : ''}`] : null,
      ['Chất lượng dữ liệu', 'Bảng vấn đề (loại, cột, số bản ghi, ví dụ, hướng xử lý), nhật ký làm sạch, so sánh trước – sau.']
    ].filter(Boolean);
    return { dax, m, pages, latestM };
  }

  function xlPlan(c, o, H) {
    const P = c.primary >= 0 ? H[c.primary] : 'Value', E = c.entity >= 0 ? H[c.entity] : null, D = c.date >= 0 ? H[c.date] : null;
    const latest = E && o.mode === 'latest', d0 = c.dims.find((j) => j < ds0len(H));
    const passList = (o.passList || []).map((v) => `"${v}"`).join(',');
    return [
      ['Raw', 'Lưu nguyên trạng dữ liệu gốc, khoá sheet', '—'],
      ['Clean (Table: tblClean)', 'Power Query: Data → Get Data → From Table/Range; các bước tương tự mô hình BI', 'Cột tính toán bổ sung bên phải'],
      latest && ['Cột Is Latest', `Đánh dấu bản ghi mới nhất của mỗi ${E}`, D ? `=--([@[${D}]]=MAXIFS([${D}],[${E}],[@[${E}]]))` : `=--(COUNTIF([${E}],[@[${E}]])=COUNTIF(INDEX([${E}],1):[@[${E}]],[@[${E}]]))`],
      o.hasPass && ['Cột Meets Target', 'Đạt chuẩn hay chưa', o.thr != null ? `=--([@[${P}]]>=${o.thr})` : `=--ISNUMBER(MATCH([@[${H[c.target]}]],{${passList}},0))`],
      latest && ['Cột Attempts', `Số lần ghi nhận của mỗi ${E}`, `=COUNTIF([${E}],[@[${E}]])`],
      ['PivotTable', `Rows: ${c.dims.map((j) => H[j]).join(' / ') || '(chiều phân tích)'}${D ? '; Columns: kỳ' : ''}; Values: ${o.agg === 'sum' ? 'Sum' : o.agg === 'count' ? 'Count' : 'Average'} of ${P}${latest ? '; Filter: Is Latest = 1' : ''}`, 'Show Values As → % of Grand Total / % of Row Total'],
      ['Dashboard', 'Thẻ chỉ số bằng công thức, Pivot Chart và Slicer', o.hasPass ? `=COUNTIFS(tblClean[Is Latest],1,tblClean[Meets Target],1)/COUNTIFS(tblClean[Is Latest],1)` : o.agg === 'sum' ? `=SUMIFS(tblClean[${P}],tblClean[${d0 != null ? H[d0] : 'Nhóm'}],A2)/SUM(tblClean[${P}])` : E && !latest ? `=COUNTA(UNIQUE(tblClean[${E}]))` : c.primary >= 0 ? `=AVERAGE(tblClean[${P}])` : '=ROWS(tblClean)'],
      ['Issue Log', 'Danh sách vấn đề + Người phụ trách, Trạng thái, Hạn xử lý', 'Data Validation → List cho cột Trạng thái'],
      ['Cleaning Log', 'Các bước xử lý và số bản ghi còn lại', '=ROWS(tblClean)']
    ].filter(Boolean);
  }

  function pptPlan(c, o, H, fd) {
    const isRate = o.hasPass, h = o.head, fmt = o.fmt;
    const s = [
      ['Thông điệp chính', isRate ? `${fmt(h.val)} ${c.entity >= 0 ? 'đối tượng' : 'bản ghi'} đạt chuẩn — khoảng cách tập trung ở một số nhóm` : `${o.valLabel}: ${fmt(h.val)} — ${fd.list[0] ? fd.list[0].t.toLowerCase() : 'các điểm cần lưu ý'}`, 'Tiêu đề là một câu kết luận, không phải tên chủ đề'],
      ['Bức tranh tổng thể', `${fN(o.nEnt)} ${c.entity >= 0 ? H[c.entity] : 'bản ghi'} · ${o.valLabel} ${fmt(h.val)}${isRate ? ` · ${fN(h.n - h.pass)} chưa đạt` : ''}`, 'Một con số chính kèm diễn giải ngắn']
    ];
    fd.list.forEach((f, i) => s.push([`Phát hiện ${i + 1}`, f.t, f.n]));
    s.push(['Khuyến nghị', 'Hành động — đối tượng áp dụng — chỉ số đo lường — thời điểm đánh giá lại', 'Mỗi khuyến nghị gắn với một phát hiện']);
    s.push(['Phụ lục: Dữ liệu & phương pháp', `${fN(o.log[0].n)} → ${fN(o.log[o.log.length - 1].left)} bản ghi sau chuẩn bị; so sánh trước – sau`, 'Chứng minh độ tin cậy của số liệu']);
    s.push(['Phụ lục: Giả định & giới hạn', 'Phạm vi kết luận và các điểm cần xác nhận', 'Minh bạch về giới hạn của dữ liệu']);
    return s;
  }

  function limits(c, o, H) {
    const L = [];
    o.gaps.forEach((g) => {
      if (g.unassigned) L.push(`${fN(g.unassigned)} ${c.entity >= 0 ? 'đối tượng' : 'bản ghi'} (${pc(g.unassigned / o.latest.length, 0)}) chưa có thông tin ${g.name}: được giữ lại trong tổng và tách riêng khi phân tích theo nhóm.${o.dir === 'low' ? ' Nếu nhóm này nghiêng về phân khúc yếu, khoảng cách thực tế có thể lớn hơn.' : ''}`);
      if (g.hidden) L.push(`${g.hidden} nhóm thuộc ${g.name} có dưới ${o.minN} bản ghi được loại khỏi biểu đồ do cỡ mẫu nhỏ dễ tạo tỷ lệ cực đoan.`);
    });
    if (o.repeat && o.repeat.n) L.push('Nhóm được đo lại không được chọn ngẫu nhiên; mức cải thiện quan sát được chưa đủ để kết luận quan hệ nhân quả. Cần thử nghiệm có nhóm đối chứng.');
    if (o.thrAuto) L.push(`Ngưỡng đạt được suy ra từ dữ liệu (${H[c.primary]} ≥ ${o.thr} tương ứng trạng thái đạt ở ${H[c.target]}); cần xác nhận với chủ sở hữu dữ liệu.`);
    if (o.recalced) L.push(`${fN(o.recalced)} bản ghi được tính lại ${H[c.primary]} do có cấu phần ghi nhận 0; giá trị gốc được lưu để đối chiếu.`);
    if (c.date >= 0 && o.mode === 'latest') L.push('Chỉ số xu hướng tính trên mọi lần ghi nhận trong kỳ; chỉ số hiện trạng tính trên kết quả mới nhất của từng đối tượng.');
    if (o.dir === 'top' && o.gaps.some((g) => g.nGroups > 3)) L.push('Tỷ trọng lớn chưa đồng nghĩa với bất thường; cần so sánh với kế hoạch, định mức hoặc cùng kỳ để đánh giá chênh lệch.');
    L.push('Dữ liệu trả lời câu hỏi “ở đâu” và “bao nhiêu”; để giải thích “vì sao” cần kết hợp thêm nguồn dữ liệu liên quan.');
    return L;
  }

  function actions(c, o, H) {
    const A2 = [];
    const g = o.gaps.find((x) => x.low && x.nGroups >= 2 && !(o.dir === 'top' && x.low.share >= 0.9));
    if (g && o.dir === 'low') A2.push(`Ưu tiên nguồn lực cho nhóm “${g.low.v}” (${g.name}) — ${fN(o.hasPass ? g.low.n - (g.low.pass || 0) : g.low.n)} ${o.hasPass ? 'đối tượng chưa đạt' : 'đối tượng'}, nơi cải thiện tạo tác động lớn nhất.`);
    if (g && o.dir === 'top') A2.push(`Tập trung kiểm soát “${g.low.v}” (${g.name}, ${pc(g.low.share, 0)})${g.nGroups > 3 ? ` và nhóm dẫn đầu (3 nhóm = ${pc(g.top3, 0)})` : ''}.`);
    if (o.compStats.length >= 2) A2.push(`Thiết kế chương trình cải thiện trọng tâm vào ${o.compStats[0].name} thay vì dàn trải.`);
    if (o.repeat && o.repeat.byGroup.length >= 2 && o.dir === 'low') A2.push(`Mở rộng đo lường / đào tạo cho nhóm “${o.repeat.byGroup[0].v}” (hiện ${pc(o.repeat.byGroup[0].rate)}) dưới dạng thí điểm có nhóm đối chứng; đánh giá lại sau 3–6 tháng.`);
    if (o.trend && o.trend.length >= 2) A2.push(`Thiết lập KPI theo dõi ${o.valLabel.toLowerCase()} theo ${(o.trendUnit || 'năm').toLowerCase()}${g && o.dir === 'low' ? ', tách riêng nhóm trọng điểm' : ''}, kèm ngưỡng cảnh báo.`);
    A2.push('Kiểm soát chất lượng tại nguồn: trường bắt buộc, danh sách chọn cho cột phân nhóm, kiểm tra mã hợp lệ khi nhập.');
    return A2;
  }

  function execSummary(c, o, H, fd, res) {
    const out = [];
    out.push(`${o.valLabel}: <b>${o.fmt(o.head.val)}</b> trên ${fN(o.nEnt)} ${c.entity >= 0 ? esc(H[c.entity]) : 'bản ghi'}${o.hasPass ? ` — ${fN(o.head.n - o.head.pass)} chưa đạt chuẩn` : ''}.`);
    fd.list.slice(0, 2).forEach((f) => out.push(esc(f.t) + '.'));
    out.push(`Độ tin cậy dữ liệu: ${res.score}/100; ${fN(o.log[0].n - o.rows.length)} bản ghi bị loại sau chuẩn bị, ${pc(res.rowsWithIssues / Math.max(1, res.rows), 0)} bản ghi gốc có ít nhất một vấn đề.`);
    return out;
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
    const isRate = o.hasPass, fmt = o.fmt;
    const sel = (id, list, v, none) => `<select id="${id}" data-sk>${none ? `<option value="-1">${none}</option>` : ''}${list.map((j) => `<option value="${j}" ${+v === j ? 'selected' : ''}>${esc(H[j])}</option>`).join('')}</select>`;
    const allIdx = ds.headers.map((h, j) => j);
    const h = o.head, ent = c.entity >= 0 ? H[c.entity] : 'bản ghi';
    const before = o.rawRate != null && isRate ? { a: o.rawRate, b: h.rate, l: 'Tỷ lệ đạt', f: pc, tol: 0.005 } : o.agg === 'sum' ? { a: o.rawSum, b: o.M(o.rows).sum, l: 'Tổng ' + H[c.primary], f: fN, tol: Math.abs(o.rawSum || 0) * 0.002 } : o.agg === 'count' ? { a: ds.rows.length, b: o.rows.length, l: 'Số bản ghi', f: fN, tol: 0 } : { a: o.rawMean, b: o.M(o.rows).mean, l: 'Trung bình ' + H[c.primary], f: f1, tol: 0.5 };
    const RL = { bi: 'Power BI', xl: 'Excel', ppt: 'PowerPoint' };
    const maxS = Math.max(...Object.values(rep.s), 1);
    const ai = MD.AI && MD.AI.settings();
    const tab = ST[key].tab || rep.best;
    const aggOpt = (v, l) => `<option value="${v}" ${o.agg === v ? 'selected' : ''}>${l}</option>`;

    body.innerHTML = `
    <div class="card sb-cfg">
      <div class="cardhead"><h3>Cấu hình phân tích</h3><span class="muted">Hệ thống tự nhận diện — điều chỉnh nếu cần</span></div>
      <div class="formgrid">
        <label class="field">Đơn vị phân tích${sel('skEnt', allIdx, c.entity, '— Mỗi bản ghi là một đối tượng —')}</label>
        <label class="field">Chỉ số đo lường${sel('skPri', c.nums, c.primary, '— Không có (đếm bản ghi) —')}</label>
        <label class="field">Cách tổng hợp<select id="skAgg" data-sk>${aggOpt('sum', 'Tổng (SUM)')}${aggOpt('mean', 'Trung bình (AVERAGE)')}${aggOpt('count', 'Đếm (COUNT)')}</select></label>
        <label class="field">Cột thời gian${sel('skDate', allIdx, c.date, '— Không có —')}</label>
        <label class="field">Ngưỡng đạt (${c.primary >= 0 ? esc(H[c.primary]) : 'chỉ số'} ≥)<input id="skThr" data-sk type="number" placeholder="${o.thr != null ? 'tự nhận diện: ' + o.thr : 'không áp dụng'}" value="${esc(c.thr)}"></label>
      </div>
      <div class="sb-dims mt"><span class="muted">Chiều phân tích:</span> ${c.dimPool.slice(0, 16).map((j) => `<label class="check"><input type="checkbox" data-skdim="${j}" ${c.dims.includes(j) ? 'checked' : ''}> ${esc(H[j])}</label>`).join('')}</div>
      <div class="row wrap mt sb-airow"><button class="btn" id="sbReview"><svg class="ic"><use href="#i-ai"/></svg> AI rà soát cấu hình</button><span class="muted">${ai && ai.key ? `Sử dụng ${ai.provider === 'gemini' ? 'Gemini' : 'Claude'} (thay đổi tại tab Cài đặt). Chỉ gửi tên cột, thống kê và giá trị phổ biến — không gửi toàn bộ dữ liệu.` : 'Chưa có API key — nhập Gemini hoặc Claude key tại tab <a href="#settings" data-go="settings">Cài đặt &amp; Drive</a>.'}</span></div>
    </div>

    ${ST[key].review ? reviewCard(ST[key].review) : ''}

    <div class="card mt sb-exec"><h3>Tóm tắt điều hành</h3><ul class="sb-list">${execSummary(c, o, H, fd, res).map((x) => `<li>${x}</li>`).join('')}</ul></div>

    <section class="sb-sec"><h2><b>1</b> Tổng quan dữ liệu</h2>
      <div class="kpis">
        <div class="kpi"><div class="lbl">Bản ghi gốc</div><div class="val">${fN(ds.rows.length)}</div><div class="sub">${ds.headers.length} cột</div></div>
        <div class="kpi"><div class="lbl">Bản ghi hợp lệ</div><div class="val">${fN(o.rows.length)}</div><div class="sub">loại ${fN(ds.rows.length - o.rows.length)} bản ghi</div></div>
        ${c.entity >= 0 ? `<div class="kpi"><div class="lbl">Số ${esc(ent)} phân biệt</div><div class="val">${fN(o.nEnt)}</div><div class="sub">${f1(o.rows.length / Math.max(1, o.nEnt))} bản ghi / đối tượng</div></div>` : ''}
        <div class="kpi"><div class="lbl">${esc(o.valLabel)}</div><div class="val sb-acc">${fmt(h.val)}</div><div class="sub">${fd.tl ? esc(fd.tl) : esc(c.primary >= 0 ? H[c.primary] : 'số bản ghi')}</div></div>
        <div class="kpi"><div class="lbl">Điểm chất lượng</div><div class="val">${res.score}<small style="font-size:14px;color:var(--muted)">/100</small></div><div class="sub">${pc(res.rowsWithIssues / Math.max(1, res.rows), 0)} bản ghi có vấn đề</div></div>
      </div>
      <table class="tbl sb-tbl sb-meta"><tbody>
        <tr><th>Đơn vị phân tích</th><td>${c.entity < 0 ? 'Mỗi bản ghi là một đối tượng.' : o.mode === 'latest' ? `Mỗi <code>${esc(ent)}</code> có nhiều lần ghi nhận theo thời gian → chỉ số hiện trạng dùng kết quả mới nhất. Tính theo bản ghi: ${fmt(o.perRow.val)}; theo đối tượng: ${fmt(h.val)}.` : o.multi ? `Một <code>${esc(ent)}</code> xuất hiện trên nhiều bản ghi (theo kho, lô, nhóm…) → đếm phân biệt, tổng hợp bằng SUM.` : `Mỗi <code>${esc(ent)}</code> là một bản ghi.`}</td></tr>
        <tr><th>Chỉ số đo lường</th><td>${c.primary >= 0 ? `<code>${esc(H[c.primary])}</code> · tổng hợp: ${{ sum: 'tổng', mean: 'trung bình', count: 'đếm' }[o.agg]}${o.rel ? ` · bằng ${o.rel === 'mean' ? 'trung bình' : 'tổng'} của ${c.comps.map((j) => `<code>${esc(H[j])}</code>`).join(', ')}` : ''}${o.thr != null ? ` · ngưỡng đạt ≥ ${o.thr}${o.thrAuto ? ` (suy ra từ <code>${esc(H[c.target])}</code>)` : ''}` : ''}` : 'Không có cột số phù hợp — phân tích theo số lượng bản ghi.'}</td></tr>
        <tr><th>Chiều phân tích</th><td>${c.dims.length ? c.dims.map((j) => `<code>${esc(H[j])}</code>`).join(', ') : '—'}</td></tr>
        <tr><th>Thời gian</th><td>${c.date >= 0 ? `<code>${esc(H[c.date])}</code>${o.trend && o.trend.length ? ` · ${o.trend[0].y} – ${o.trend[o.trend.length - 1].y}` : ''}` : 'Không có cột thời gian giao dịch.'}</td></tr>
        <tr><th>Khung câu hỏi</th><td>Hiện trạng ra sao → Chênh lệch nằm ở đâu → Yếu tố nào tác động → Cần hành động gì → Dữ liệu có đáng tin cậy.</td></tr>
      </tbody></table>
    </section>

    <section class="sb-sec"><h2><b>2</b> Đánh giá chất lượng dữ liệu <small>${iss.length} vấn đề</small></h2>
      <div class="tablewrap"><table class="tbl sb-tbl"><thead><tr><th>#</th><th>Mức độ</th><th>Vấn đề</th><th>Cột</th><th>Bản ghi</th><th>Ví dụ</th><th>Hướng xử lý</th></tr></thead><tbody>
      ${iss.slice(0, 25).map((x, i) => `<tr><td>${i + 1}</td><td><span class="sev ${x.sev}">${A.SEV[x.sev].label}</span></td><td><b>${esc(x.what)}</b><div class="muted">${esc(x.cat)}</div></td><td>${esc(x.cols)}</td><td class="num">${fN(x.n)}</td><td class="sb-ex">${esc(x.ex)}</td><td>${esc(x.fix)}</td></tr>`).join('')}
      ${iss.length ? '' : '<tr><td colspan="7" class="muted">Không phát hiện vấn đề theo bộ quy tắc hiện hành.</td></tr>'}
      </tbody></table></div>
      ${iss.length > 25 ? `<p class="muted">Còn ${iss.length - 25} vấn đề mức thấp — xem chi tiết tại tab <a href="#issues" data-go="issues">Danh sách lỗi</a>.</p>` : ''}
    </section>

    <section class="sb-sec"><h2><b>3</b> Chuẩn bị dữ liệu</h2>
      <p class="muted">Toàn bộ thực hiện bằng Power Query (Excel hoặc Power BI), không chỉnh sửa thủ công: quy trình lặp lại được khi có dữ liệu mới và truy vết được từng bước.</p>
      <div class="tablewrap"><table class="tbl sb-tbl"><thead><tr><th>Bước xử lý</th><th>Mô tả</th><th>Ảnh hưởng</th><th>Còn lại</th></tr></thead><tbody>
      ${o.log.map((x, i) => `<tr><td><b>${esc(x.step)}</b></td><td>${esc(x.what)}</td><td class="num">${i === 0 ? '' : fN(x.n)}</td><td class="num"><b>${fN(x.left)}</b></td></tr>`).join('')}
      </tbody></table></div>
      <div class="grid2 mt">
        <div class="note"><b>Tác động của chuẩn bị dữ liệu</b><br>${esc(before.l)}: ${before.f(before.a)} (gốc) → ${before.f(before.b)} (sau xử lý). ${Math.abs((before.b || 0) - (before.a || 0)) > before.tol ? 'Chênh lệch đủ lớn để <b>thay đổi kết luận</b> nếu dùng dữ liệu thô.' : 'Chênh lệch không đáng kể.'}</div>
        <div class="note warn"><b>Nguyên tắc quản trị dữ liệu</b><br>Gắn cờ lỗi trước khi sửa · lưu giá trị gốc khi tính lại · ánh xạ có kiểm soát, việc gộp giá trị do người phụ trách phê duyệt.</div>
      </div>
    </section>

    <section class="sb-sec"><h2><b>4</b> Phân tích &amp; phát hiện</h2>
      <div class="sb-finds">${fd.list.map((f, i) => `<div class="sb-find"><span class="sb-n">${i + 1}</span><div><b>${esc(f.t)}</b><div>${esc(f.n)}</div></div></div>`).join('')}</div>
      <div class="grid2 mt">
        ${o.gaps.filter((g) => g.groups.length > 1).map((g) => { const mx = Math.max(...g.groups.map((x) => Math.abs(x.val || 0))); return `<div class="card"><h3>${o.dir === 'low' ? 'Chênh lệch' : 'Phân bổ'} theo ${esc(g.name)}</h3><p class="muted">${esc(o.valLabel)}${o.dir === 'low' ? ` · nhóm ≥ ${o.minN} bản ghi` : ' · sắp xếp giảm dần'}${g.hidden ? ` · ẩn ${g.hidden} nhóm nhỏ` : ''}</p>
          <div class="sb-bars">${g.groups.slice(0, 14).map((x) => `<div class="sb-row"><span class="sb-l" title="${esc(x.v)}">${esc(x.v)}</span>${bar(Math.abs(x.val || 0), mx, x === g.low ? 'low' : '')}<span class="sb-v">${fmt(x.val)}</span><span class="sb-c">${o.dir === 'top' ? pc(x.share, 0) : fN(x.n)}</span></div>`).join('')}</div></div>`; }).join('')}
        ${o.compStats.length ? (() => { const mx = Math.max(...o.compStats.map((x) => x.mean)); return `<div class="card"><h3>So sánh cấu phần</h3><p class="muted">Giá trị bình quân, loại trừ giá trị 0 (không thực hiện)</p><div class="sb-bars">${o.compStats.map((x, i) => `<div class="sb-row"><span class="sb-l">${esc(x.name)}</span>${bar(x.mean, mx, i === 0 ? 'low' : '')}<span class="sb-v">${f1(x.mean)}</span><span class="sb-c"></span></div>`).join('')}</div></div>`; })() : ''}
        ${o.trend && o.trend.length > 1 ? `<div class="card"><h3>Xu hướng theo ${(o.trendUnit || 'Năm').toLowerCase()}</h3><p class="muted">${esc(H[c.date])}${o.trendLow ? ` · cột cuối: nhóm “${esc(o.trendLow)}”` : ''}</p>
          <table class="tbl sb-tbl"><thead><tr><th>${o.trendUnit || 'Năm'}</th><th>Bản ghi</th><th>${esc(o.valLabel)}</th>${o.trendLow ? '<th>Tỷ trọng nhóm</th><th>Chỉ số nhóm</th>' : ''}</tr></thead><tbody>
          ${o.trend.map((t) => `<tr${o.mix && o.mix.y === t.y ? ' class="sb-hl"' : ''}><td>${t.y}</td><td class="num">${fN(t.n)}</td><td class="num">${fmt(t.val)}</td>${o.trendLow ? `<td class="num">${pc(t.lowShare, 0)}</td><td class="num">${t.lowVal == null ? '—' : fmt(t.lowVal)}</td>` : ''}</tr>`).join('')}</tbody></table>
          ${o.mix ? `<p class="note warn mt"><b>Hiệu ứng cơ cấu (mix effect):</b> biến động kỳ ${o.mix.y} đến từ thay đổi tỷ trọng nhóm, không phải suy giảm thực chất. Nên trình bày song song đường tổng và đường của nhóm trọng điểm.</p>` : ''}</div>` : ''}
        ${o.repeat && o.repeat.n ? (() => { const r = o.repeat; return `<div class="card"><h3>Đo lường lặp lại</h3>
          <div class="kpis sb-mini"><div class="kpi"><div class="lbl">Đối tượng ≥ 2 lần</div><div class="val">${fN(r.n)}</div><div class="sub">${pc(r.rate)} tổng số</div></div><div class="kpi"><div class="lbl">Có cải thiện</div><div class="val">${pc(r.impRate, 0)}</div><div class="sub">bình quân ${r.gain >= 0 ? '+' : ''}${fmt(r.gain)}</div></div>${isRate ? `<div class="kpi"><div class="lbl">Chuyển sang đạt</div><div class="val">${fN(r.up)}</div></div>` : ''}</div>
          ${r.byGroup.length ? `<p class="muted">Tỷ lệ được đo lại theo nhóm</p><div class="sb-bars">${r.byGroup.slice(0, 10).map((x, i) => `<div class="sb-row"><span class="sb-l">${esc(x.v)}</span>${bar(x.rate, 1, i === 0 ? 'low' : '')}<span class="sb-v">${pc(x.rate)}</span><span class="sb-c">${fN(x.n)}</span></div>`).join('')}</div>` : ''}</div>`; })() : ''}
      </div>
    </section>

    <section class="sb-sec"><h2><b>5</b> Khuyến nghị</h2>
      <div class="card"><ol class="sb-ol">${actions(c, o, H).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
    </section>

    <section class="sb-sec"><h2><b>6</b> Đề xuất hình thức báo cáo</h2>
      <div class="formgrid sb-q">
        <label class="field">Đối tượng sử dụng<select id="skAud" data-sk><option value="exec" ${c.audience === 'exec' ? 'selected' : ''}>Ban lãnh đạo</option><option value="ops" ${c.audience === 'ops' ? 'selected' : ''}>Bộ phận vận hành</option><option value="analyst" ${c.audience === 'analyst' ? 'selected' : ''}>Đội phân tích / IT</option></select></label>
        <label class="field">Tần suất cập nhật<select id="skFreq" data-sk><option value="once" ${c.freq === 'once' ? 'selected' : ''}>Một lần</option><option value="weekly" ${c.freq === 'weekly' ? 'selected' : ''}>Hàng tuần / tháng</option><option value="daily" ${c.freq === 'daily' ? 'selected' : ''}>Hàng ngày</option></select></label>
        <label class="field">Mục đích<select id="skNeed" data-sk><option value="present" ${c.need === 'present' ? 'selected' : ''}>Trình bày, ra quyết định</option><option value="explore" ${c.need === 'explore' ? 'selected' : ''}>Khai thác, tự phân tích</option><option value="track" ${c.need === 'track' ? 'selected' : ''}>Theo dõi, xử lý chi tiết</option></select></label>
      </div>
      <div class="sb-rep mt">${['bi', 'xl', 'ppt'].map((k) => `<div class="sb-card ${rep.best === k ? 'best' : ''}"><div class="sb-rh"><b>${RL[k]}</b>${rep.best === k ? '<span class="sb-tag">Đề xuất</span>' : rep.second === k ? '<span class="sb-tag alt">Bổ trợ</span>' : ''}</div>${bar(rep.s[k], maxS, rep.best === k ? '' : 'mute')}<ul>${rep.why[k].map((w) => `<li>${esc(w)}</li>`).join('') || '<li class="muted">Không có tiêu chí nổi bật</li>'}</ul></div>`).join('')}</div>
      <p class="note mt">Phương án: <b>${RL[rep.best]}</b> là sản phẩm chính, <b>${RL[rep.second]}</b> bổ trợ${rep.best === 'bi' ? ' (kèm bản PDF cho người dùng không có Power BI)' : ''}.</p>
      <div class="sb-tabs mt">${['bi', 'xl', 'ppt'].map((k) => `<button class="chip ${k === tab ? 'on' : ''}" data-sbtab="${k}">Thiết kế ${RL[k]}</button>`).join('')}</div>
      <div class="card mt sb-pane" data-pane="bi" ${tab === 'bi' ? '' : 'hidden'}>
        <h3>Luồng dữ liệu (Power Query)</h3>
        <table class="tbl sb-tbl"><thead><tr><th>Query</th><th>Chức năng</th><th>Lý do</th></tr></thead><tbody>${bi.m.map((x) => `<tr><td><code>${esc(x[0])}</code></td><td>${esc(x[1])}</td><td>${esc(x[2])}</td></tr>`).join('')}</tbody></table>
        ${bi.latestM ? `<p class="muted mt">Cột Is Latest (M):</p><pre class="sb-code">${esc(bi.latestM)}</pre>` : ''}
        <h3 class="mt">Measure (DAX)</h3>
        ${bi.dax.map((x) => `<div class="sb-dax"><div><b>${esc(x[0])}</b> <span class="muted">— ${esc(x[2])}</span></div><pre class="sb-code">${esc(x[0])} =\n${esc(x[1])}</pre></div>`).join('')}
        <h3 class="mt">Cấu trúc trang</h3><ol class="sb-ol">${bi.pages.map((p) => `<li><b>${esc(p[0])}:</b> ${esc(p[1])}</li>`).join('')}</ol>
        <p class="muted">Mô hình: ưu tiên star schema đơn giản; cột thứ bậc dùng Sort by Column; cột mã và năm đặt Don't summarize.</p>
      </div>
      <div class="card mt sb-pane" data-pane="xl" ${tab === 'xl' ? '' : 'hidden'}>
        <h3>Cấu trúc workbook</h3>
        <table class="tbl sb-tbl"><thead><tr><th>Sheet / cột</th><th>Chức năng</th><th>Công thức</th></tr></thead><tbody>${xl.map((x) => `<tr><td><b>${esc(x[0])}</b></td><td>${esc(x[1])}</td><td><code>${esc(x[2])}</code></td></tr>`).join('')}</tbody></table>
      </div>
      <div class="card mt sb-pane" data-pane="ppt" ${tab === 'ppt' ? '' : 'hidden'}>
        <h3>Cấu trúc slide — mỗi slide một thông điệp</h3>
        <table class="tbl sb-tbl"><thead><tr><th>#</th><th>Slide</th><th>Tiêu đề (kết luận)</th><th>Nội dung</th></tr></thead><tbody>${ppt.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x[0])}</td><td><b>${esc(x[1])}</b></td><td>${esc(x[2])}</td></tr>`).join('')}</tbody></table>
      </div>
    </section>

    <section class="sb-sec"><h2><b>7</b> Giả định &amp; giới hạn</h2>
      <ul class="sb-list">${limits(c, o, H).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </section>

    <div class="card row wrap sb-act">
      <button class="btn primary" id="sbDl"><svg class="ic"><use href="#i-down"/></svg> Xuất báo cáo phân tích (HTML)</button>
      <button class="btn" id="sbAI"><svg class="ic"><use href="#i-ai"/></svg> AI soạn báo cáo tóm tắt</button>
      <span class="muted">AI chỉ nhận các chỉ số tổng hợp, không nhận dữ liệu gốc.</span>
    </div>
    <div class="card mt aiout" id="sbAIOut" ${ST[key].ai ? '' : 'hidden'}>${ST[key].ai && window.marked ? marked.parse(ST[key].ai) : ''}</div>`;
  }

  function reviewCard(r) {
    const li = (a) => (a && a.length ? `<ul class="sb-list">${a.map((x) => `<li>${esc(typeof x === 'string' ? x : [x.what, x.cols && '(' + x.cols + ')', x.fix && '→ ' + x.fix].filter(Boolean).join(' '))}</li>`).join('')}</ul>` : '');
    return `<div class="card mt sb-review"><h3>Kết quả AI rà soát</h3>
      ${r.story ? `<p><b>${esc(r.dataType || 'Dữ liệu')}:</b> ${esc(r.story)}</p>` : ''}
      ${r.applied && r.applied.length ? `<p class="muted">Đã điều chỉnh: ${esc(r.applied.join(' · '))}</p>` : '<p class="muted">Giữ nguyên cấu hình tự nhận diện.</p>'}
      ${r.extraIssues && r.extraIssues.length ? `<b>Vấn đề dữ liệu bổ sung</b>${li(r.extraIssues)}` : ''}
      ${r.analysis && r.analysis.length ? `<b>Hướng phân tích bổ sung</b>${li(r.analysis)}` : ''}
      ${r.questions && r.questions.length ? `<b>Cần xác nhận với chủ sở hữu dữ liệu</b>${li(r.questions)}` : ''}
      ${r.warnings && r.warnings.length ? `<div class="note warn mt">${r.warnings.map(esc).join('<br>')}</div>` : ''}</div>`;
  }

  function schema(ds, res) {
    return (res.profile || []).filter((p) => p.type !== 'empty').map((p) => ({
      col: p.name, type: p.type, role: p.role || undefined, fill: Math.round(p.fillRate * 100) + '%', unique: p.unique,
      top: p.type === 'number' ? undefined : p.top.slice(0, 8).map((t) => `${String(t.v).slice(0, 40)} (${t.c})`),
      stats: p.num ? { min: p.num.min, max: p.num.max, mean: Math.round(p.num.mean * 100) / 100 } : undefined,
      dates: p.dateRange ? [U.fmtDate(p.dateRange.min), U.fmtDate(p.dateRange.max)] : undefined
    }));
  }

  async function review(ds, res) {
    const AI = MD.AI, s = AI.settings();
    if (!s.key) { U.toast('Chưa có API key — nhập Gemini hoặc Claude key tại tab Cài đặt', 'err', 6000); return; }
    const st = ST[ds.id], c = st.cfg, H = HX(ds, c), o = st.o;
    const cur = { entity: H[c.entity] || null, mode: o.mode, primary: H[c.primary] || null, agg: o.agg, date: H[c.date] || null, target: H[c.target] || null, threshold: o.thr, dims: c.dims.map((j) => H[j]) };
    const prompt = `Bạn là chuyên gia phân tích dữ liệu doanh nghiệp (BI/Excel). Dưới đây là hồ sơ các cột của file "${ds.name}" (${ds.rows.length} dòng), không phải toàn bộ dữ liệu:
${JSON.stringify(schema(ds, res))}

Cấu hình hệ thống tự nhận diện (có thể chưa đúng):
${JSON.stringify(cur)}

Các vấn đề hệ thống đã phát hiện: ${JSON.stringify(res.checks.slice(0, 15).map((k) => k.check + ' [' + k.cols.slice(0, 2).join(', ') + '] ' + k.n))}

Hãy rà soát và trả về DUY NHẤT một JSON hợp lệ (không markdown) theo cấu trúc:
{"dataType":"loại dữ liệu, 3-6 từ","story":"1-2 câu: dữ liệu phục vụ câu hỏi quản trị nào",
"entity":"tên cột mã đối tượng hoặc null","mode":"latest nếu mỗi đối tượng được ghi nhận nhiều lần theo thời gian và cần lấy kết quả mới nhất; rows nếu không",
"primary":"tên cột số quan trọng nhất hoặc null","agg":"sum | mean | count",
"date":"tên cột thời gian giao dịch/kỳ báo cáo (không dùng ngày sinh, hạn dùng) hoặc null",
"target":{"col":"tên cột trạng thái đạt/không đạt","passValues":["các giá trị được xem là đạt"]} hoặc null,
"threshold":ngưỡng đạt của cột primary (số) hoặc null,
"dims":["2-3 cột phân nhóm có ý nghĩa quản trị nhất, theo thứ tự ưu tiên"],
"extraIssues":[{"what":"vấn đề dữ liệu hệ thống chưa phát hiện","cols":"cột","fix":"hướng xử lý"}],
"analysis":["2-4 hướng phân tích nên bổ sung, nêu cụ thể tên cột"],
"questions":["2-3 điểm cần xác nhận với chủ sở hữu dữ liệu"],
"warnings":["các điểm dễ diễn giải sai, nếu có"]}
Chỉ sử dụng đúng tên cột có trong danh sách. Viết tiếng Việt, văn phong chuyên nghiệp, ngắn gọn.`;
    U.loading(true, 'AI đang rà soát cấu hình…');
    try {
      const r = await AI.call([{ role: 'user', content: prompt }], { json: true, purpose: 'smart' });
      const txt = (r.text || '').replace(/```json|```/g, '');
      const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('AI không trả về JSON hợp lệ');
      const j = JSON.parse(m[0]);
      const idx = (name) => (name ? ds.headers.findIndex((x) => nk(x) === nk(name)) : -1);
      const applied = [];
      const setIdx = (k, name, label) => { if (name === undefined) return; const v = name === null ? -1 : idx(name); if (name !== null && v < 0) return; if (c[k] !== v) { c[k] = v; applied.push(`${label}: ${v >= 0 ? ds.headers[v] : 'không có'}`); } };
      setIdx('entity', j.entity, 'Đơn vị phân tích');
      setIdx('date', j.date, 'Thời gian');
      const pk = idx(j.primary);
      if (j.primary && pk >= 0 && pk !== c.primary) { c.primary = pk; if (!c.nums.includes(pk)) c.nums.push(pk); c.comps = c.comps.filter((x) => x !== pk); applied.push('Chỉ số: ' + ds.headers[pk]); }
      if (['sum', 'mean', 'count'].includes(j.agg) && j.agg !== c.agg) { c.agg = j.agg; applied.push('Tổng hợp: ' + { sum: 'tổng', mean: 'trung bình', count: 'đếm' }[j.agg]); }
      if (['latest', 'rows'].includes(j.mode) && j.mode !== o.mode) { c.mode = j.mode; applied.push(j.mode === 'latest' ? 'Lấy kết quả mới nhất' : 'Tính trên mọi bản ghi'); }
      if (j.target && j.target.col && idx(j.target.col) >= 0 && Array.isArray(j.target.passValues) && j.target.passValues.length) {
        const tk = idx(j.target.col);
        if (tk !== c.target) { c.target = tk; c.targetKind = 'custom'; c.passVals = j.target.passValues.map((v) => nk(v)); applied.push(`Đạt khi ${ds.headers[tk]} ∈ {${j.target.passValues.join(', ')}}`); }
      }
      if (typeof j.threshold === 'number' && c.primary >= 0 && String(j.threshold) !== String(o.thr)) { c.thr = String(j.threshold); applied.push('Ngưỡng ≥ ' + j.threshold); }
      if (Array.isArray(j.dims)) {
        const d = j.dims.map(idx).filter((k) => k >= 0 && k !== c.entity);
        const keep = c.dims.includes(ds.headers.length) ? [ds.headers.length] : [];
        const nd = keep.concat(d.filter((k) => !keep.includes(k))).slice(0, 4);
        if (d.length && nd.join() !== c.dims.join()) { c.dims = nd; d.forEach((k) => { if (!c.dimPool.includes(k)) c.dimPool.push(k); }); applied.push('Chiều: ' + d.map((k) => ds.headers[k]).join(', ')); }
      }
      st.review = Object.assign({}, j, { applied });
      U.toast(applied.length ? `AI đã điều chỉnh ${applied.length} thiết lập` : 'AI xác nhận cấu hình hiện tại', 'ok', 5000);
    } catch (e) { U.toast('AI lỗi: ' + e.message, 'err', 8000); }
    U.loading(false);
    render(ds, res);
  }

  function summaryJSON(ds, res) {
    const s = ST[ds.id]; if (!s || !s.o) return '';
    const c = s.cfg, o = s.o, H = HX(ds, c);
    return JSON.stringify({
      file: ds.name, rows: ds.rows.length, validRows: o.rows.length, entities: o.nEnt, entityCol: c.entity >= 0 ? H[c.entity] : null,
      metric: o.valLabel, value: o.head.val, threshold: o.thr, qualityScore: res.score,
      preparation: o.log, issues: issueRows(ds, res, c, o).slice(0, 15).map((x) => ({ what: x.what, cols: x.cols, n: x.n })),
      breakdowns: o.gaps.map((g) => ({ dim: g.name, groups: g.groups.slice(0, 12).map((x) => ({ v: x.v, n: x.n, val: x.val, share: x.share })) })),
      components: o.compStats, trend: o.trend, mixEffect: o.mix, repeat: o.repeat, findings: findings(c, o, H).list.map((f) => f.t + ': ' + f.n),
      aiReview: s.review ? { story: s.review.story, questions: s.review.questions } : undefined
    });
  }

  function exportHTML(ds) {
    const el = $('#studyBody'); if (!el) return;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.sb-cfg,.sb-act,.sb-tabs,.sb-q').forEach((n) => n.remove());
    clone.querySelectorAll('[hidden]').forEach((n) => n.removeAttribute('hidden'));
    clone.querySelectorAll('select,input,button').forEach((n) => n.remove());
    const css = `body{font-family:Inter,Segoe UI,sans-serif;max-width:1080px;margin:24px auto;padding:0 16px;color:#1e293b;line-height:1.55}h1{font-size:24px;margin-bottom:2px}h2{font-size:18px;border-bottom:2px solid #1F3864;padding-bottom:4px;margin-top:28px}h2 b{background:#1F3864;color:#fff;border-radius:6px;padding:0 8px;margin-right:6px}h2 small{color:#64748b;font-weight:500;font-size:13px}h3{font-size:15px;margin:0 0 6px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f5f9}.sb-meta th{width:170px}.num{text-align:right}code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}.kpi{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px}.kpi .lbl,.muted,.kpi .sub{color:#64748b;font-size:12px}.kpi .val{font-size:22px;font-weight:700}.sb-acc{color:#E8730C}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-top:12px}.sb-exec{border-left:4px solid #1F3864}.note{background:#eef2ff;border-radius:8px;padding:10px 12px;font-size:13px}.note.warn{background:#fff7ed}.sb-row{display:grid;grid-template-columns:160px 1fr 70px 48px;gap:8px;align-items:center;font-size:12.5px;margin:3px 0}.sb-l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-bar{display:block;height:10px;background:#f1f5f9;border-radius:5px}.sb-bar i{display:block;height:100%;background:#1F3864;border-radius:5px}.sb-bar.low i{background:#E8730C}.sb-v{text-align:right;font-weight:600}.sb-c{text-align:right;color:#64748b}.sb-find{display:flex;gap:10px;border-left:4px solid #E8730C;background:#fff7ed;padding:8px 12px;margin:8px 0;border-radius:6px}.sb-n{font-weight:800;color:#E8730C}.sb-code{background:#0f172a;color:#e2e8f0;padding:8px 10px;border-radius:6px;font-size:12px;white-space:pre-wrap}.sb-rep{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.sb-card{border:1px solid #e2e8f0;border-radius:10px;padding:10px}.sb-card.best{border:2px solid #E8730C}.sb-tag{background:#E8730C;color:#fff;border-radius:99px;padding:1px 8px;font-size:11px;margin-left:6px}.sb-tag.alt{background:#64748b}.sev{font-size:11px;font-weight:600}.sb-hl td{background:#fff7ed}@media(max-width:700px){.grid2,.sb-rep{grid-template-columns:1fr}}@media print{.card{break-inside:avoid}}`;
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Báo cáo phân tích dữ liệu - ${esc(ds.name)}</title><style>${css}</style></head><body><h1>Báo cáo phân tích dữ liệu</h1><p class="muted">Nguồn: ${esc(ds.name)} · Lập ngày ${new Date().toLocaleDateString('vi-VN')}</p>${clone.innerHTML}</body></html>`;
    U.download(new Blob([html], { type: 'text/html' }), U.safeName(`Bao cao phan tich - ${ds.name.replace(/\.\w+$/, '')}.html`));
  }

  async function runAI(ds, res) {
    const AI = MD.AI; const s = AI.settings();
    if (!s.key) { U.toast('Chưa có API key — nhập tại tab Cài đặt', 'err'); return; }
    U.loading(true, 'AI đang soạn báo cáo tóm tắt…');
    try {
      const r = await AI.call([{ role: 'user', content: `Dưới đây là kết quả phân tích một bộ dữ liệu (JSON, chỉ số tổng hợp):\n${summaryJSON(ds, res)}\n\nSoạn báo cáo tóm tắt bằng tiếng Việt, văn phong chuyên nghiệp, ngắn gọn, gồm:\n1. Tóm tắt điều hành (2–3 câu).\n2. Các phát hiện chính (tối đa 4), mỗi phát hiện: tiêu đề dạng kết luận + số liệu minh chứng.\n3. Khuyến nghị hành động (3–5 ý, nêu rõ đối tượng áp dụng và chỉ số đo lường).\n4. Rủi ro & giới hạn của dữ liệu.\n5. Các câu hỏi người xem báo cáo có thể đặt ra và gợi ý trả lời ngắn.\nKhông đưa ra số liệu ngoài dữ liệu đã cung cấp.` }]);
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
      else if (t.id === 'skEnt') { c.entity = +t.value; c.mode = 'auto'; }
      else if (t.id === 'skPri') { c.primary = +t.value; c.comps = []; c.thr = ''; }
      else if (t.id === 'skAgg') c.agg = t.value;
      else if (t.id === 'skDate') { c.date = +t.value; c.mode = 'auto'; }
      else if (t.id === 'skThr') c.thr = t.value;
      else if (t.id === 'skAud') c.audience = t.value;
      else if (t.id === 'skFreq') c.freq = t.value;
      else if (t.id === 'skNeed') c.need = t.value;
      else return;
      const y = window.scrollY; render(ds, res); window.scrollTo(0, y);
    });
    document.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest('[data-sbtab],#sbDl,#sbAI,#sbReview'); if (!t) return;
      const ds = getDs(), res = getRes(); if (!ds || !ST[ds.id]) return;
      if (t.dataset.sbtab) { ST[ds.id].tab = t.dataset.sbtab; document.querySelectorAll('[data-sbtab]').forEach((b) => b.classList.toggle('on', b === t)); document.querySelectorAll('.sb-pane').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.sbtab; }); return; }
      if (t.id === 'sbDl') return exportHTML(ds);
      if (t.id === 'sbAI') return runAI(ds, res);
      if (t.id === 'sbReview') return review(ds, res);
    });
  }

  MD.Study = { render, bind, detect, compute, summaryJSON };
})(window.MD);
