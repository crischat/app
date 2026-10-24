/* Warehouse Office — dữ liệu, chấm điểm, KPI, đồng bộ kết quả Claude từ Drive */
(function (MD) {
  'use strict';
  const U = MD.U, S = MD.Store;
  const M = {};

  M.STATUS = {
    'moi': { label: 'Mới giao', cls: 's-new' },
    'dang-lam': { label: 'Đang làm', cls: 's-work' },
    'da-nop': { label: 'Đã nộp', cls: 's-sub' },
    'da-cham': { label: 'Đã chấm', cls: 's-done' },
    'dong': { label: 'Đóng', cls: 's-close' },
    'huy': { label: 'Hủy', cls: 's-cancel' }
  };
  M.BOSS_STATUS = {
    'moi': { label: 'Mới nhận', cls: 's-new' },
    'gemini': { label: 'Gemini đang làm', cls: 's-work' },
    'claude': { label: 'Chờ Claude chốt', cls: 's-sub' },
    'chot': { label: 'Claude đã chốt', cls: 's-done' },
    'gui': { label: 'Đã gửi cấp trên', cls: 's-close' },
    'huy': { label: 'Hủy', cls: 's-cancel' }
  };
  M.DIFF = { '1': 'Dễ', '1.5': 'Vừa', '2': 'Khó' };
  M.WEIGHT = { quality: 40, completeness: 30, presentation: 10 };

  /* Cơ cấu mặc định: Manager > Senior Sup > Supervisor (bạn) > Leader > 3 Clerk. Sửa được hết trong app. */
  const DEFAULT_STAFF = [
    { id: 'boss2', kind: 'boss', name: 'Manager', role: 'Warehouse Manager', duty: 'Cấp trên 2', gender: 'nam', look: 'm-gray' },
    { id: 'boss1', kind: 'boss', name: 'Senior Sup', role: 'Senior Supervisor', duty: 'Cấp trên trực tiếp', gender: 'nam', look: 'm-glass' },
    { id: 'sup', kind: 'sup', name: 'Supervisor', role: 'Warehouse Data Management Supervisor', duty: 'Quản lý dữ liệu kho', gender: 'nam', look: 'm-suit' },
    { id: 'leader', kind: 'staff', tier: 'leader', name: 'Leader', role: 'Team Leader', duty: 'Điều phối 3 clerk', gender: 'nu', look: 'f-long' },
    { id: 'c1', kind: 'staff', tier: 'clerk', name: 'Clerk 1', role: 'Data Clerk', duty: '', gender: 'nam', look: 'm-spiky' },
    { id: 'c2', kind: 'staff', tier: 'clerk', name: 'Clerk 2', role: 'Data Clerk', duty: '', gender: 'nu', look: 'f-cap' },
    { id: 'c3', kind: 'staff', tier: 'clerk', name: 'Clerk 3', role: 'Data Clerk', duty: '', gender: 'nu', look: 'f-pony' }
  ];


  M.blank = () => ({
    version: 1, staff: JSON.parse(JSON.stringify(DEFAULT_STAFF)), tasks: [], boss: [], log: [],
    seq: { T: 0, C: 0 }, imported: [], notes: [], settings: { gemUrl: '' }, updatedAt: null
  });

  /* Bổ sung trường còn thiếu khi đọc dữ liệu cũ */
  M.normalize = (d) => {
    const b = M.blank();
    d = Object.assign(b, d || {});
    d.seq = Object.assign({ T: 0, C: 0 }, d.seq);
    d.settings = Object.assign({ gemUrl: '' }, d.settings);
    d.tasks.forEach((t) => { t.rounds = t.rounds || []; t.attach = t.attach || []; t.seen = t.seen || []; t.history = t.history || []; });
    d.boss.forEach((c) => { c.files = c.files || []; c.seen = c.seen || []; });
    const Ch = MD.Chibi;
    d.staff.forEach((s) => {
      if (s.kind === 'staff' && !s.tier) s.tier = s.id === 'leader' ? 'leader' : 'clerk';
      if (Ch) {
        const key = Ch.presetKey(s.look);
        if (key) { s.look = key; if (!s.gender) s.gender = Ch.PRESETS[key].gender; }
      }
      s.gender = s.gender || 'nam';
      s.duty = s.duty || '';
    });
    return d;
  };

  M.data = M.blank();

  M.staff = (id) => M.data.staff.find((s) => s.id === id);
  M.workers = () => M.data.staff.filter((s) => s.kind === 'staff');
  M.bosses = () => M.data.staff.filter((s) => s.kind === 'boss');

  M.nextId = (k) => { M.data.seq[k] = (M.data.seq[k] || 0) + 1; return `${k}-${String(M.data.seq[k]).padStart(3, '0')}`; };

  M.log = (who, text) => {
    M.data.log.unshift({ at: new Date().toISOString(), who, text });
    if (M.data.log.length > 300) M.data.log.length = 300;
  };

  /* ---------- Ngày ---------- */
  M.day = (s) => { if (!s) return null; const d = new Date(String(s).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? null : d; };
  M.iso = (d) => { const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  M.fmt = (s) => { const d = M.day(s); return d ? U.fmtDate(d) : '—'; };
  /* Mốc ngày nộp (ISO có giờ) → ngày theo giờ máy */
  M.localDay = (iso) => { const d = new Date(iso); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

  /* ---------- Chấm điểm ----------
     Claude chấm 3 tiêu chí (tối đa 80). App tự tính:
     - Đúng hạn 20 điểm, trừ 5 điểm cho mỗi ngày nộp trễ (lần nộp đầu).
     - Nộp lại: mỗi lần nộp lại trừ 10% tổng điểm. */
  const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

  M.lateDays = (t) => {
    const due = M.day(t.due);
    if (!due) return 0;
    const ref = t.rounds.length ? M.localDay(t.rounds[0].at) : U.today();
    return Math.max(0, U.daysBetween(due, ref));
  };
  M.ontime = (t) => (t.rounds.length ? Math.max(0, 20 - 5 * M.lateDays(t)) : null);
  M.factor = (t) => Math.max(0, 1 - 0.1 * Math.max(0, t.rounds.length - 1));
  M.aiPoints = (sc) => (sc ? clamp(sc.quality, 40) + clamp(sc.completeness, 30) + clamp(sc.presentation, 10) : null);
  M.final = (t) => {
    if (t.override != null && t.override !== '') return clamp(t.override, 100);
    if (!t.score || !t.rounds.length) return null;
    return Math.round((M.aiPoints(t.score) + M.ontime(t)) * M.factor(t));
  };
  M.grade = (x) => (x == null ? '—' : x >= 85 ? 'A' : x >= 70 ? 'B' : x >= 50 ? 'C' : 'D');
  M.overdue = (t) => ['moi', 'dang-lam'].includes(t.status) && M.day(t.due) && U.today() > M.day(t.due);

  /* Ngày dùng để tính KPI theo kỳ: ngày nộp lần đầu */
  M.kpiDay = (t) => (t.rounds.length ? M.localDay(t.rounds[0].at) : null);

  M.kpi = (staffId, from, to) => {
    const ts = M.data.tasks.filter((t) => !t.hidden && t.status !== 'huy' && (!staffId || t.staffId === staffId));
    const inPeriod = (d) => d && d >= from && d < to;
    const scored = ts.filter((t) => M.final(t) != null && inPeriod(M.kpiDay(t)));
    let sw = 0, sum = 0, ontime = 0;
    scored.forEach((t) => { const w = Number(t.difficulty) || 1; sw += w; sum += w * M.final(t); if (M.lateDays(t) === 0) ontime++; });
    const assigned = ts.filter((t) => inPeriod(M.day(t.assignedAt))).length;
    const avg = sw ? Math.round((sum / sw) * 10) / 10 : null;
    return {
      n: scored.length, avg, grade: M.grade(avg), assigned,
      ontimeRate: scored.length ? ontime / scored.length : null,
      open: ts.filter((t) => ['moi', 'dang-lam', 'da-nop'].includes(t.status)).length,
      overdue: ts.filter(M.overdue).length, tasks: scored
    };
  };

  M.period = (kind, ref) => {
    const r = ref || new Date();
    if (kind === 'year') return { from: new Date(r.getFullYear(), 0, 1), to: new Date(r.getFullYear() + 1, 0, 1), label: 'Năm ' + r.getFullYear() };
    return { from: new Date(r.getFullYear(), r.getMonth(), 1), to: new Date(r.getFullYear(), r.getMonth() + 1, 1), label: `Tháng ${r.getMonth() + 1}/${r.getFullYear()}` };
  };

  /* ---------- Trạng thái nhân vật trên văn phòng ---------- */
  M.staffState = (s) => {
    if (s.kind === 'boss') {
      const open = M.data.boss.filter((c) => c.from === s.id && !['gui', 'huy'].includes(c.status));
      return open.length ? { mood: 'wait', text: `Đang chờ ${open.length} việc`, n: open.length } : { mood: 'idle', text: 'Không có việc chờ', n: 0 };
    }
    if (s.kind === 'sup') {
      const boss = M.data.boss.filter((c) => !['gui', 'huy'].includes(c.status)).length;
      const grade = M.data.tasks.filter((t) => !t.hidden && t.status === 'da-nop').length;
      if (boss) return { mood: 'work', text: `${boss} việc cấp trên` + (grade ? ` · ${grade} bài chờ chấm` : ''), n: boss + grade };
      if (grade) return { mood: 'wait', text: `${grade} bài chờ chấm`, n: grade };
      return { mood: 'idle', text: 'Đang rảnh', n: 0 };
    }
    const ts = M.data.tasks.filter((t) => t.staffId === s.id && !t.hidden && !['dong', 'huy'].includes(t.status));
    const late = ts.filter(M.overdue).length;
    const work = ts.filter((t) => ['moi', 'dang-lam'].includes(t.status)).length;
    const wait = ts.filter((t) => t.status === 'da-nop').length;
    if (late) return { mood: 'late', text: `${late} task trễ hạn`, n: ts.length };
    if (wait) return { mood: 'wait', text: `${wait} bài chờ chấm`, n: ts.length };
    if (work) return { mood: 'work', text: `Đang làm ${work} task`, n: ts.length };
    if (ts.some((t) => t.status === 'da-cham')) return { mood: 'done', text: 'Đã được chấm', n: ts.length };
    return { mood: 'idle', text: 'Đang rảnh', n: 0 };
  };

  /* ---------- Đọc kết quả Claude ghi vào Drive ---------- */
  function parseJson(txt) {
    const s = String(txt || '');
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('không thấy JSON');
    return JSON.parse(s.slice(a, b + 1));
  }

  const findByFile = (list, f) => list.find((x) => x.folderId && (f.parents || []).includes(x.folderId)) ||
    list.find((x) => new RegExp(x.id + '(?![0-9])').test(f.name));

  M.sync = async () => {
    if (!S.connected()) return { scores: 0, boss: 0, errors: [] };
    const errors = [];
    let scores = 0, boss = 0;
    const scoreFiles = await S.list("name contains 'cham-diem' and trashed=false", 'files(id,name,mimeType,parents,createdTime,webViewLink)', 'createdTime');
    for (const f of scoreFiles) {
      const t = findByFile(M.data.tasks, f);
      if (!t || t.seen.includes(f.id)) continue;
      try {
        const j = parseJson(await S.readText(f.id, f.mimeType));
        if (t.score) t.history.push(t.score);
        t.score = {
          quality: clamp(j.quality, 40), completeness: clamp(j.completeness, 30), presentation: clamp(j.presentation, 10),
          comment: String(j.comment || ''), strengths: [].concat(j.strengths || []).map(String), issues: [].concat(j.issues || []).map(String),
          reviewer: String(j.reviewer || 'Claude'), at: f.createdTime, fileId: f.id, link: f.webViewLink, round: t.rounds.length
        };
        if (t.status === 'da-nop' || t.status === 'dang-lam' || t.status === 'moi') t.status = 'da-cham';
        t.seen.push(f.id);
        scores++;
        const sf = M.staff(t.staffId);
        M.log('Claude', `Chấm ${t.id} (${sf ? sf.name : ''}): ${M.final(t)} điểm`);
      } catch (e) {
        errors.push(`${f.name}: ${e.message}`);
      }
    }
    const bossFiles = await S.list("(name contains 'claude-chot' or name contains 'gemini-ban-nhap') and trashed=false", 'files(id,name,mimeType,parents,createdTime,webViewLink)', 'createdTime');
    for (const f of bossFiles) {
      const c = findByFile(M.data.boss, f);
      if (!c || c.seen.includes(f.id)) continue;
      c.seen.push(f.id);
      if (/^claude-chot/i.test(f.name)) {
        c.result = { fileId: f.id, name: f.name, link: f.webViewLink, at: f.createdTime };
        if (!['gui', 'huy'].includes(c.status)) c.status = 'chot';
        M.log('Claude', `Đã chốt ${c.id}: ${c.title}`);
      } else {
        c.draft = { fileId: f.id, name: f.name, link: f.webViewLink, at: f.createdTime };
        if (['moi', 'gemini'].includes(c.status)) c.status = 'claude';
        M.log('Gemini', `Có bản nháp cho ${c.id}`);
      }
      boss++;
    }
    return { scores, boss, errors };
  };

  /* ---------- CSV ---------- */
  M.parseCsv = (text) => {
    const rows = []; let row = [], cur = '', q = false;
    const s = String(text).replace(/^\uFEFF/, '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  };
  M.toCsv = (rows) => '\uFEFF' + rows.map((r) => r.map((c) => {
    const v = c == null ? '' : String(c);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(',')).join('\r\n');

  MD.Model = M;
})(window.MD);
