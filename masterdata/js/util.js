/* Master Data Pro — tiện ích dùng chung */
window.MD = window.MD || {};
(function (MD) {
  'use strict';

  const U = {};

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  U.esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  U.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  U.fmtNum = (n, d = 0) => (n == null || isNaN(n)) ? '—'
    : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: 0 });

  U.pct = (x, d = 1) => (x == null || isNaN(x)) ? '—' : (x * 100).toFixed(d).replace('.', ',') + '%';

  U.isEmpty = (v) => v == null || (typeof v === 'string' && v.trim() === '') ||
    (typeof v === 'number' && isNaN(v));

  /* Bỏ dấu tiếng Việt */
  U.stripAccents = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');

  /* Khoá so sánh: thường, bỏ dấu, chỉ giữ chữ-số, gộp khoảng trắng */
  U.key = (s) => U.stripAccents(String(s == null ? '' : s).toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ').trim();

  /* Fingerprint: token đã sắp xếp, loại trùng */
  U.fingerprint = (s) => Array.from(new Set(U.key(s).split(' ').filter(Boolean))).sort().join(' ');

  /* Mặt nạ hình dạng mã: chữ -> A, số -> 9 */
  U.shape = (s) => String(s).trim().replace(/[A-Za-z]/g, 'A').replace(/[0-9]/g, '9');

  U.levenshtein = (a, b, max) => {
    if (a === b) return 0;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let prev = new Array(lb + 1), cur = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
      cur[0] = i; let rowMin = i;
      for (let j = 1; j <= lb; j++) {
        const c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      [prev, cur] = [cur, prev];
    }
    return prev[lb];
  };

  /* ---------- Số ---------- */
  // Trả về {num, style} style: 'plain' | 'vn' (1.234,5) | 'us' (1,234.5) | null nếu không phải số
  U.parseNumStr = (raw) => {
    let s = String(raw).trim().replace(/[\s\u00a0]/g, '');
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/^(vnd|vnđ|đ|\$|usd)/i, '').replace(/(vnd|vnđ|đ|\$|usd|%)$/i, '');
    if (!/^[-+]?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
    if (s[0] === '-') { neg = !neg; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
    let style = 'plain', num;
    const hasDot = s.includes('.'), hasComma = s.includes(',');
    if (hasDot && hasComma) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) { style = 'vn'; num = parseFloat(s.replace(/\./g, '').replace(',', '.')); }
      else { style = 'us'; num = parseFloat(s.replace(/,/g, '')); }
    } else if (hasComma) {
      if (/^\d{1,3}(,\d{3})+$/.test(s)) { style = 'us'; num = parseFloat(s.replace(/,/g, '')); }
      else if ((s.match(/,/g) || []).length === 1) { style = 'vn'; num = parseFloat(s.replace(',', '.')); }
      else return null;
    } else if (hasDot) {
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) { style = 'vn'; num = parseFloat(s.replace(/\./g, '')); }
      else if ((s.match(/\./g) || []).length === 1) { style = 'plain'; num = parseFloat(s); }
      else return null;
    } else num = parseFloat(s);
    if (isNaN(num)) return null;
    return { num: neg ? -num : num, style };
  };

  U.toNum = (v) => {
    if (typeof v === 'number') return isNaN(v) ? null : v;
    if (v instanceof Date || U.isEmpty(v)) return null;
    const p = U.parseNumStr(v);
    return p ? p.num : null;
  };

  /* ---------- Ngày ---------- */
  const mkDate = (y, m, d) => {
    if (y < 100) y += y < 50 ? 2000 : 1900;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  };
  // Trả về {date, fmt, invalid}
  U.parseDateStr = (raw) => {
    const s = String(raw).trim();
    let m;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/))) {
      const d = mkDate(+m[1], +m[2], +m[3]);
      return d ? { date: d, fmt: 'yyyy-mm-dd' } : { invalid: true, fmt: 'yyyy-mm-dd' };
    }
    if ((m = s.match(/^(\d{1,2})([-/.])(\d{1,2})\2(\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/))) {
      const a = +m[1], b = +m[3], y = +m[4], sep = m[2];
      const yy = m[4].length === 2 ? 'yy' : 'yyyy';
      if (b > 12 && a <= 12) {
        const d = mkDate(y, a, b);
        return d ? { date: d, fmt: `mm${sep}dd${sep}${yy}` } : { invalid: true, fmt: 'mm/dd' };
      }
      const d = mkDate(y, b, a);
      return d ? { date: d, fmt: `dd${sep}mm${sep}${yy}` } : { invalid: true, fmt: `dd${sep}mm${sep}${yy}` };
    }
    if ((m = s.match(/^(\d{1,2})\s*(?:tháng|thg|th)\s*(\d{1,2})\s*(?:năm|,|\/)?\s*(\d{4})$/i))) {
      const d = mkDate(+m[3], +m[2], +m[1]);
      return d ? { date: d, fmt: 'chữ (dd tháng mm năm yyyy)' } : { invalid: true, fmt: 'chữ' };
    }
    return null;
  };

  U.excelSerialToDate = (n) => {
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };

  U.toDate = (v) => {
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') return (v > 20000 && v < 80000) ? U.excelSerialToDate(v) : null;
    if (U.isEmpty(v)) return null;
    const p = U.parseDateStr(v);
    return p && p.date ? p.date : null;
  };

  U.fmtDate = (d) => {
    if (!(d instanceof Date) || isNaN(d)) return '';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  };

  U.display = (v) => {
    if (v instanceof Date) return U.fmtDate(v);
    if (v == null) return '';
    return String(v);
  };

  U.today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  U.daysBetween = (a, b) => Math.round((b - a) / 86400000);

  U.stamp = () => {
    const d = new Date(), p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`;
  };

  /* ---------- Lưu trữ an toàn ---------- */
  U.store = {
    get(k, def) { try { const v = localStorage.getItem('md_' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem('md_' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('md_' + k); } catch (e) { /* bỏ qua */ } }
  };

  /* ---------- Tải file ---------- */
  U.download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };

  U.safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);

  /* ---------- Toast ---------- */
  U.toast = (msg, type = 'info', ms = 3500) => {
    let box = U.$('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + type; t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  };

  U.loading = (on, text) => {
    const el = U.$('#loading');
    if (!el) return;
    el.hidden = !on;
    if (text) U.$('#loadingText').textContent = text;
  };

  U.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  U.cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  MD.U = U;
})(window.MD);
