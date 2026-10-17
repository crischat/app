/* Master Data Pro — bộ máy phân tích chất lượng dữ liệu */
(function (MD) {
  'use strict';
  const U = MD.U;
  const A = {};

  /* ---------- Danh mục lỗi & mức độ ---------- */
  A.CATS = {
    structure: { label: 'Cấu trúc bảng', color: '#64748b', dim: 'validity' },
    missing: { label: 'Thiếu dữ liệu', color: '#f59e0b', dim: 'completeness' },
    duplicate: { label: 'Trùng lặp', color: '#ef4444', dim: 'uniqueness' },
    conflict: { label: 'Dữ liệu không khớp', color: '#dc2626', dim: 'consistency' },
    inconsistent: { label: 'Nhập không thống nhất', color: '#8b5cf6', dim: 'consistency' },
    format: { label: 'Sai định dạng', color: '#3b82f6', dim: 'validity' },
    pattern: { label: 'Mã sai mẫu', color: '#06b6d4', dim: 'validity' },
    whitespace: { label: 'Khoảng trắng / ký tự ẩn', color: '#94a3b8', dim: 'consistency' },
    outlier: { label: 'Giá trị bất thường', color: '#f97316', dim: 'accuracy' },
    logic: { label: 'Sai logic nghiệp vụ', color: '#be123c', dim: 'accuracy' },
    custom: { label: 'Quy tắc tùy chỉnh', color: '#0d9488', dim: 'validity' }
  };
  A.SEV = {
    critical: { label: 'Nghiêm trọng', w: 10, order: 0 },
    high: { label: 'Cao', w: 5, order: 1 },
    medium: { label: 'Trung bình', w: 2, order: 2 },
    low: { label: 'Thấp', w: 0.5, order: 3 },
    info: { label: 'Thông tin', w: 0, order: 4 }
  };
  A.DIMS = {
    completeness: 'Đầy đủ', validity: 'Hợp lệ', uniqueness: 'Duy nhất', consistency: 'Nhất quán', accuracy: 'Chính xác'
  };

  /* ---------- Nhận diện vai trò cột theo tên ---------- */
  const ROLE_RULES = [
    ['expiry', /\b(han dung|hsd|han su dung|expiry|exp date|expire|expiration|best before)\b/],
    ['dob', /\b(ngay sinh|nam sinh|dob|birth|date of birth|sinh nhat)\b/],
    ['join_date', /\b(ngay vao|ngay vao lam|ngay nhan viec|join|hire date|start date)\b/],
    ['date', /\b(ngay|date|thoi gian|time)\b/],
    ['emp_id', /\b(ma nv|ma nhan vien|msnv|ma so nv|ma so nhan vien|employee id|emp id|staff id|emp code)\b/],
    ['email', /\b(email|e mail|mail|thu dien tu)\b/],
    ['phone', /\b(sdt|so dien thoai|dien thoai|phone|mobile|di dong|tel|hotline)\b/],
    ['id_card', /\b(cccd|cmnd|cmt|can cuoc|id card|passport|ho chieu|so dinh danh)\b/],
    ['tax', /\b(mst|ma so thue|tax)\b/],
    ['sku', /\b(sku|ma hang|ma vt|ma vat tu|ma sp|ma san pham|item code|product code|part no|part number|ma hh|ma hang hoa|item no|material)\b|^ma$/],
    ['opening', /\b(ton dau|dau ky|ton dau ky|opening|begin|beginning)\b/],
    ['closing', /\b(ton cuoi|cuoi ky|ton cuoi ky|closing|ending|ton kho|ton hien tai|on hand|stock)\b/],
    ['inflow', /\b(nhap|sl nhap|so luong nhap|nhap trong ky|receipt|received|in qty|inbound)\b/],
    ['outflow', /\b(xuat|sl xuat|so luong xuat|xuat trong ky|issue|issued|out qty|outbound)\b/],
    ['amount', /\b(thanh tien|gia tri|tong tien|amount|value|total)\b/],
    ['price', /\b(don gia|gia|gia von|gia ban|price|unit cost|cost)\b/],
    ['qty', /\b(so luong|sl|qty|quantity|ton)\b/],
    ['unit', /\b(dvt|don vi|don vi tinh|unit|uom)\b/],
    ['warehouse', /\b(kho|warehouse|wh|location|vi tri|bin)\b/],
    ['batch', /\b(lo|so lo|batch|lot)\b/],
    ['supplier', /\b(nha cung cap|ncc|supplier|vendor)\b/],
    ['team', /\b(team|teams|doi|doi nhom|squad|kenh|channel)\b/],
    ['category', /\b(nhom|loai|category|group|nganh hang|class|phan loai)\b/],
    ['name_item', /\b(ten hang|ten vt|ten vat tu|ten sp|ten san pham|item name|product name|description|mo ta|dien giai|ten hh|ten hang hoa|quy cach)\b/],
    ['person_name', /\b(ho ten|ho va ten|full name|ten nv|ten nhan vien|nhan vien|employee name|nguoi)\b/],
    ['name_generic', /\b(ten|name)\b/],
    ['gender', /\b(gioi tinh|gender|sex|phai)\b/],
    ['dept', /\b(phong ban|bo phan|department|dept|phong|division)\b/],
    ['position', /\b(chuc vu|chuc danh|position|title|vi tri cong viec)\b/],
    ['address', /\b(dia chi|address|tinh|thanh pho|city|province|quan|huyen|que quan)\b/],
    ['status', /\b(trang thai|status|tinh trang)\b/],
    ['note', /\b(ghi chu|note|remark|comment)\b/]
  ];
  A.ROLE_LABEL = {
    expiry: 'Hạn dùng', dob: 'Ngày sinh', join_date: 'Ngày vào làm', date: 'Ngày', emp_id: 'Mã nhân viên', email: 'Email',
    phone: 'Số điện thoại', id_card: 'CCCD/CMND', tax: 'Mã số thuế', sku: 'Mã hàng', opening: 'Tồn đầu', closing: 'Tồn cuối',
    inflow: 'Nhập', outflow: 'Xuất', amount: 'Thành tiền', price: 'Đơn giá', qty: 'Số lượng', unit: 'Đơn vị tính',
    warehouse: 'Kho/Vị trí', batch: 'Số lô', supplier: 'Nhà cung cấp', team: 'Team/Nhóm', category: 'Nhóm/Loại', name_item: 'Tên hàng',
    person_name: 'Họ tên', gender: 'Giới tính', dept: 'Phòng ban', position: 'Chức vụ', address: 'Địa chỉ',
    status: 'Trạng thái', note: 'Ghi chú'
  };
  A.roleOf = (h) => {
    const k = U.key(h);
    if (/^(stt|tt|no|#|so tt)$/.test(k)) return 'index';
    for (const [role, re] of ROLE_RULES) if (re.test(k)) return role;
    return null;
  };
  const NUM_ROLES = ['opening', 'closing', 'inflow', 'outflow', 'amount', 'price', 'qty'];
  const DATE_ROLES = ['expiry', 'dob', 'join_date', 'date'];
  const CAT_ROLES = ['team', 'unit', 'warehouse', 'supplier', 'category', 'name_item', 'gender', 'dept', 'position', 'address', 'status', 'person_name'];

  /* ---------- Từ điển đồng nghĩa (chuẩn hoá biến thể) ---------- */
  const SYN_COMMON = {
    'hn': 'ha noi', 'tp hn': 'ha noi', 'tp ha noi': 'ha noi', 'thanh pho ha noi': 'ha noi',
    'hcm': 'ho chi minh', 'tphcm': 'ho chi minh', 'tp hcm': 'ho chi minh', 'sg': 'ho chi minh', 'sai gon': 'ho chi minh',
    'tp ho chi minh': 'ho chi minh', 'thanh pho ho chi minh': 'ho chi minh', 'hcmc': 'ho chi minh',
    'dn': 'da nang', 'tp da nang': 'da nang', 'hp': 'hai phong', 'tp hai phong': 'hai phong', 'ct': 'can tho'
  };
  const SYN_ROLE = {
    unit: {
      'pcs': 'cai', 'pc': 'cai', 'ea': 'cai', 'each': 'cai', 'chiec': 'cai', 'c': 'cai', 'unit': 'cai',
      'kgs': 'kg', 'kilogram': 'kg', 'kilo': 'kg', 'ki lo': 'kg',
      'thung': 'thung', 'ctn': 'thung', 'carton': 'thung', 'box': 'hop', 'hop': 'hop',
      'met': 'm', 'meter': 'm', 'metre': 'm', 'lit': 'l', 'litre': 'l', 'liter': 'l', 'ltr': 'l',
      'set': 'bo', 'bo': 'bo', 'roll': 'cuon', 'cuon': 'cuon', 'pack': 'goi', 'goi': 'goi', 'tui': 'goi', 'bag': 'goi',
      'chai': 'chai', 'bottle': 'chai', 'btl': 'chai'
    },
    gender: { 'nam': 'nam', 'male': 'nam', 'm': 'nam', 'trai': 'nam', 'n': 'nam', 'nu': 'nu', 'female': 'nu', 'f': 'nu', 'gai': 'nu' },
    dept: {
      'hcns': 'nhan su', 'nhan su': 'nhan su', 'hr': 'nhan su', 'hanh chinh nhan su': 'nhan su', 'phong nhan su': 'nhan su',
      'kt': 'ke toan', 'ke toan': 'ke toan', 'accounting': 'ke toan', 'phong ke toan': 'ke toan', 'tai chinh ke toan': 'ke toan',
      'kd': 'kinh doanh', 'kinh doanh': 'kinh doanh', 'sales': 'kinh doanh', 'phong kinh doanh': 'kinh doanh',
      'it': 'cntt', 'cntt': 'cntt', 'cong nghe thong tin': 'cntt', 'phong it': 'cntt',
      'mkt': 'marketing', 'marketing': 'marketing', 'kho': 'kho', 'kho van': 'kho', 'logistics': 'kho'
    },
    status: {
      'active': 'dang hoat dong', 'dang hoat dong': 'dang hoat dong', 'hoat dong': 'dang hoat dong', 'dang lam': 'dang hoat dong', 'dang lam viec': 'dang hoat dong',
      'inactive': 'ngung', 'ngung': 'ngung', 'ngung hoat dong': 'ngung', 'nghi viec': 'ngung', 'da nghi': 'ngung'
    }
  };
  const CANON_ROLE = Object.fromEntries(Object.entries(SYN_ROLE).map(([r, m]) => [r, new Set(Object.values(m))]));
  const CANON_COMMON = new Set(Object.values(SYN_COMMON));
  const canonKey = (v, role) => {
    let k = U.key(v);
    const m = (SYN_ROLE[role] || {});
    if (m[k]) return '§' + m[k];
    if (CANON_ROLE[role] && CANON_ROLE[role].has(k)) return '§' + k;
    if (SYN_COMMON[k]) return '§' + SYN_COMMON[k];
    if (CANON_COMMON.has(k)) return '§' + k;
    k = k.replace(/^(tp|thanh pho|tinh|quan|huyen|phong|cong ty|cty|ct)\s+/, '');
    if (SYN_COMMON[k]) return '§' + SYN_COMMON[k];
    if (CANON_COMMON.has(k)) return '§' + k;
    return Array.from(new Set(k.split(' ').filter(Boolean))).sort().join(' ');
  };

  /* ---------- Phân loại giá trị ô ---------- */
  function classify(v) {
    if (U.isEmpty(v)) return { t: 'empty' };
    if (v instanceof Date) return { t: 'date', d: v, fmt: 'excel-date' };
    if (typeof v === 'number') return { t: 'number', n: v };
    if (typeof v === 'boolean') return { t: 'bool' };
    const s = String(v);
    const d = U.parseDateStr(s);
    if (d) return d.invalid ? { t: 'baddate', fmt: d.fmt } : { t: 'datetext', d: d.date, fmt: d.fmt };
    const n = U.parseNumStr(s);
    if (n) return { t: 'numtext', n: n.num, style: n.style };
    return { t: 'text' };
  }

  /* ---------- Kiểm tra định dạng đặc thù ---------- */
  const RE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  const normPhone = (s) => {
    let d = String(s).replace(/[^\d+]/g, '');
    if (d.startsWith('+84')) d = '0' + d.slice(3);
    else if (d.startsWith('84') && d.length === 11) d = '0' + d.slice(2);
    if (/^\d{9}$/.test(d) && /^[35789]/.test(d)) d = '0' + d; // mất số 0 đầu do Excel
    return d;
  };
  const isPhoneVN = (d) => /^0(3|5|7|8|9)\d{8}$/.test(d) || /^02\d{9}$/.test(d);
  // kiểu nhập SĐT: giữ ký tự đầu 0/+ để phân biệt, các chữ số khác -> 9
  const phoneStyle = (s) => { const t = String(s).trim(); return t.charAt(0) + t.slice(1).replace(/\d/g, '9'); };
  const titleCase = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ')
    .replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  // Ký tự Latin-1 mà TCVN3 dùng để mã hoá chữ Việt nhưng KHÔNG có trong bảng chữ tiếng Việt Unicode
  const TCVN3 = /[¸µ¶¹¨ª¬®ÆÇËÎÏÐÑÖØÜÞßåæçëîïðñöøûüþ¾¼½]/g;
  const VN_UNI = /[ăđơưĂĐƠƯẠ-ỹ]/;
  const looksTCVN3 = (s) => { const m = String(s).match(TCVN3); return !!m && m.length >= 2 && !VN_UNI.test(s); };
  const hiddenChars = /[\u00a0\u200b-\u200f\u2028\u2029\ufeff\t\r\n]/;
  const TOTAL_RE = /^(tong|tong cong|cong|total|grand total|sum|subtotal|cong phat sinh)\b/;

  /* =====================================================================
     PHÂN TÍCH BẢNG
     ===================================================================== */
  A.analyze = (ds, cfg = {}) => {
    cfg = Object.assign({ domain: 'auto', outlierK: 3, expiryWarnDays: 30, fuzzy: true, customRules: [] }, cfg);
    if (ds.kind === 'text') return analyzeText(ds, cfg);
    const t0 = performance.now();
    const H = ds.headers, R = ds.rows, nC = H.length, nR = R.length;
    const issues = [];
    let seq = 0;
    const CAP = 60000;
    const counts = {}; // đếm đầy đủ kể cả khi vượt CAP
    const add = (o) => {
      const keyc = o.cat + '|' + o.check;
      counts[keyc] = (counts[keyc] || 0) + 1;
      if (issues.length >= CAP) return;
      o.id = ++seq;
      o.colName = o.col >= 0 ? H[o.col] : '';
      o.excelRow = o.row >= 0 ? ds.firstDataRow + o.row : null;
      if (o.value !== undefined) o.value = U.display(o.value);
      issues.push(o);
    };

    const roles = H.map(A.roleOf);
    const firstIdx = (r) => roles.indexOf(r);

    // Miền dữ liệu
    let domain = cfg.domain;
    if (domain === 'auto') {
      const has = (r) => roles.includes(r);
      const inv = ['sku', 'qty', 'opening', 'closing', 'inflow', 'outflow', 'unit', 'warehouse', 'batch', 'expiry', 'price'].filter(has).length;
      const hr = ['emp_id', 'person_name', 'email', 'phone', 'id_card', 'dob', 'gender', 'dept', 'position', 'join_date'].filter(has).length;
      domain = inv >= 2 && inv >= hr ? 'inventory' : hr >= 2 ? 'hr' : 'generic';
    }
    // cột "Tên"/"Name" chung chung: người (nhân sự) hay hàng hoá (còn lại)
    roles.forEach((r, j) => { if (r === 'name_generic') roles[j] = domain === 'hr' ? 'person_name' : 'name_item'; });
    // Ô lấy từ PDF/Word/PPT/CSV luôn là chữ -> không báo "số/ngày lưu dạng chữ"
    const textCells = ['pdf', 'docx', 'pptx', 'csv', 'tsv', 'txt'].includes(ds.source && ds.source.kind);

    /* ----- Dòng trống / dòng tổng ----- */
    const skip = new Set();
    R.forEach((r, i) => {
      if (r.every((c) => U.isEmpty(c))) {
        skip.add(i);
        add({ cat: 'structure', check: 'Dòng trống giữa bảng', sev: 'low', col: -1, row: i, msg: 'Dòng trống làm đứt vùng dữ liệu, dễ khiến lọc/Pivot bỏ sót' });
        return;
      }
      const texts = r.filter((c) => typeof c === 'string' && c.trim());
      if (texts.length && texts.length <= 2 && texts.some((c) => TOTAL_RE.test(U.key(c)))) {
        skip.add(i);
        add({ cat: 'structure', check: 'Dòng tổng lẫn trong dữ liệu', sev: 'medium', col: -1, row: i, value: texts.join(' | '), msg: 'Dòng tổng/cộng nằm trong vùng dữ liệu sẽ bị cộng trùng khi tính toán' });
      }
    });
    const live = []; for (let i = 0; i < nR; i++) if (!skip.has(i)) live.push(i);

    /* ----- Tiêu đề ----- */
    (ds.blankHeaders || []).forEach((j) => add({ cat: 'structure', check: 'Cột không có tiêu đề', sev: 'medium', col: j, row: -1, msg: `Cột ${MD.Parsers.colLetter(j)} không có tên tiêu đề` }));
    const hk = {};
    H.forEach((h, j) => { const k = U.key(h); (hk[k] = hk[k] || []).push(j); });
    Object.values(hk).filter((a) => a.length > 1).forEach((a) => a.slice(1).forEach((j) =>
      add({ cat: 'structure', check: 'Trùng tên cột', sev: 'medium', col: j, row: -1, value: H[j], msg: `Tên cột trùng với cột ${H[a[0]]}` })));
    if (ds.merges) add({ cat: 'structure', check: 'Có ô gộp (merge)', sev: 'low', col: -1, row: -1, value: ds.merges + ' vùng', msg: 'Ô gộp làm sai khi lọc, sắp xếp và đọc bằng phần mềm' });

    /* ----- Hồ sơ cột ----- */
    const cls = H.map(() => new Array(nR));
    const profile = H.map((h, j) => {
      const tc = { empty: 0, number: 0, numtext: 0, date: 0, datetext: 0, baddate: 0, text: 0, bool: 0 };
      const freq = new Map();
      const nums = [];
      const dates = [];
      const dateFmts = {}, numStyles = {};
      let lenMin = Infinity, lenMax = 0;
      live.forEach((i) => {
        const c = classify(R[i][j]);
        cls[j][i] = c;
        tc[c.t]++;
        if (c.t === 'empty') return;
        const s = U.display(R[i][j]);
        freq.set(s, (freq.get(s) || 0) + 1);
        lenMin = Math.min(lenMin, s.length); lenMax = Math.max(lenMax, s.length);
        if (c.t === 'number' || c.t === 'numtext') nums.push(c.n);
        if (c.t === 'numtext') numStyles[c.style] = (numStyles[c.style] || 0) + 1;
        if (c.t === 'date' || c.t === 'datetext') { dates.push(c.d); dateFmts[c.fmt] = (dateFmts[c.fmt] || 0) + 1; }
      });
      const filled = live.length - tc.empty;
      const role = roles[j];
      let type = 'empty';
      if (filled) {
        const nNum = tc.number + tc.numtext, nDate = tc.date + tc.datetext + tc.baddate, nText = tc.text + tc.bool;
        const isSerialDate = DATE_ROLES.includes(role) && tc.number > 0 && nums.every((n) => n > 20000 && n < 80000);
        if (isSerialDate) type = 'date';
        else if (nDate / filled >= 0.6) type = 'date';
        else if (nNum / filled >= 0.6 && !['sku', 'emp_id', 'phone', 'id_card', 'tax'].includes(role)) type = 'number';
        else if (nText / filled >= 0.6 || ['sku', 'emp_id', 'phone', 'id_card', 'tax', 'email'].includes(role)) type = 'text';
        else type = 'mixed';
        if (type === 'text' && role === 'email') type = 'email';
        if (type === 'text' && role === 'phone') type = 'phone';
        if (type === 'text' && (['sku', 'emp_id', 'id_card', 'tax'].includes(role))) type = 'code';
      }
      const top = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
      const p = {
        idx: j, name: h, role, type, filled, missing: tc.empty, fillRate: live.length ? filled / live.length : 0,
        unique: freq.size, uniqueRatio: filled ? freq.size / filled : 0, top: top.slice(0, 12).map(([v, c]) => ({ v, c })),
        typeCounts: tc, lenMin: filled ? lenMin : 0, lenMax, dateFmts, numStyles, freq
      };
      if (nums.length) {
        const s = nums.slice().sort((a, b) => a - b);
        const q = (x) => { const pos = (s.length - 1) * x, lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); };
        p.num = { min: s[0], max: s[s.length - 1], sum: s.reduce((a, b) => a + b, 0), mean: s.reduce((a, b) => a + b, 0) / s.length, median: q(0.5), q1: q(0.25), q3: q(0.75), n: s.length, neg: s.filter((x) => x < 0).length, zero: s.filter((x) => x === 0).length };
      }
      if (dates.length) {
        const ts = dates.map((d) => +d).sort((a, b) => a - b);
        p.dateRange = { min: new Date(ts[0]), max: new Date(ts[ts.length - 1]) };
      }
      return p;
    });

    // Xác định cột khoá
    let keyCol = firstIdx('sku');
    if (keyCol < 0) keyCol = firstIdx('emp_id');
    if (keyCol < 0) {
      const cand = profile.filter((p) => p.type !== 'empty' && p.uniqueRatio > 0.95 && p.fillRate > 0.9 && /\b(ma|code|id|so)\b/.test(U.key(p.name)) && p.role !== 'index');
      if (cand.length) keyCol = cand[0].idx;
    }

    /* ----- Cột trống / thiếu dữ liệu ----- */
    const keyRoles = ['sku', 'emp_id', 'name_item', 'person_name', 'qty', 'closing', 'unit'];
    profile.forEach((p) => {
      const j = p.idx;
      if (p.type === 'empty') {
        add({ cat: 'structure', check: 'Cột hoàn toàn trống', sev: 'low', col: j, row: -1, msg: 'Cột không có dữ liệu — nên xoá hoặc bổ sung' });
        return;
      }
      if (p.fillRate < 0.5) {
        add({ cat: 'missing', check: 'Cột thưa dữ liệu', sev: keyRoles.includes(p.role) || j === keyCol ? 'high' : 'info', col: j, row: -1, value: U.pct(p.fillRate), msg: `Chỉ ${U.pct(p.fillRate)} số dòng có dữ liệu` });
        if (!(keyRoles.includes(p.role) || j === keyCol)) return;
      }
      const sev = j === keyCol ? 'critical' : keyRoles.includes(p.role) ? 'high' : p.fillRate > 0.9 ? 'medium' : 'low';
      live.forEach((i) => {
        if (cls[j][i].t === 'empty') add({ cat: 'missing', check: j === keyCol ? 'Thiếu mã khoá' : 'Ô bị bỏ trống', sev, col: j, row: i, msg: `Thiếu "${p.name}"` });
      });
    });

    /* ----- Khoảng trắng / Unicode / font ----- */
    profile.forEach((p) => {
      const j = p.idx;
      live.forEach((i) => {
        const v = R[i][j];
        if (typeof v !== 'string' || !v) return;
        if (looksTCVN3(v)) add({ cat: 'format', check: 'Lỗi font TCVN3', sev: 'high', col: j, row: i, value: v, msg: 'Chuỗi có dấu hiệu gõ bằng bảng mã cũ TCVN3 — hiển thị sai trên máy khác' });
        else if (v !== v.normalize('NFC')) add({ cat: 'whitespace', check: 'Unicode tổ hợp (NFD)', sev: 'medium', col: j, row: i, value: v, fix: 'nfc', msg: 'Chữ có dấu dạng tổ hợp — nhìn giống nhưng so khớp/VLOOKUP sẽ thất bại', suggest: v.normalize('NFC') });
        if (hiddenChars.test(v)) add({ cat: 'whitespace', check: 'Ký tự ẩn / xuống dòng', sev: 'medium', col: j, row: i, value: JSON.stringify(v).slice(1, -1), fix: 'ws', msg: 'Có ký tự ẩn (NBSP, zero-width, tab, xuống dòng) gây lệch khi so khớp', suggest: cleanWS(v) });
        else if (v !== v.trim()) add({ cat: 'whitespace', check: 'Thừa khoảng trắng đầu/cuối', sev: 'low', col: j, row: i, value: `"${v}"`, fix: 'ws', msg: 'Khoảng trắng đầu/cuối làm VLOOKUP, lọc trùng không khớp', suggest: cleanWS(v) });
        else if (/ {2,}/.test(v)) add({ cat: 'whitespace', check: 'Nhiều khoảng trắng liền nhau', sev: 'low', col: j, row: i, value: `"${v}"`, fix: 'ws', msg: 'Có 2+ dấu cách liên tiếp', suggest: cleanWS(v) });
      });
    });

    /* ----- Định dạng theo kiểu cột ----- */
    profile.forEach((p) => {
      const j = p.idx, role = p.role;
      if (p.type === 'number') {
        const styles = Object.keys(p.numStyles).filter((s) => s !== 'plain');
        live.forEach((i) => {
          const c = cls[j][i];
          if (c.t === 'numtext') { if (!textCells) add({ cat: 'format', check: 'Số lưu dạng chữ', sev: 'medium', col: j, row: i, value: R[i][j], fix: 'num', suggest: U.fmtNum(c.n, 6), msg: 'Ô số đang ở dạng văn bản — SUM/Pivot sẽ bỏ qua' }); }
          else if (c.t === 'text' || c.t === 'datetext' || c.t === 'baddate' || c.t === 'date') add({ cat: 'format', check: 'Chữ trong cột số', sev: 'high', col: j, row: i, value: R[i][j], msg: `Cột "${p.name}" là số nhưng ô chứa giá trị không phải số` });
        });
        if (styles.length > 1) add({ cat: 'inconsistent', check: 'Lẫn kiểu dấu thập phân', sev: 'medium', col: j, row: -1, value: styles.map((s) => s === 'vn' ? '1.234,5' : '1,234.5').join(' và '), msg: 'Cùng cột vừa dùng dấu phẩy vừa dùng dấu chấm làm thập phân — dễ đọc sai giá trị gấp 1000 lần' });
      }
      if (p.type === 'date') {
        const fmts = Object.entries(p.dateFmts).sort((a, b) => b[1] - a[1]);
        const main = fmts.length ? fmts[0][0] : null;
        live.forEach((i) => {
          const c = cls[j][i];
          if (c.t === 'baddate') add({ cat: 'format', check: 'Ngày không tồn tại', sev: 'high', col: j, row: i, value: R[i][j], msg: 'Ngày không hợp lệ (vd 31/02, tháng 13)' });
          else if (c.t === 'text' || c.t === 'numtext' || (c.t === 'number' && !(c.n > 20000 && c.n < 80000))) add({ cat: 'format', check: 'Không phải ngày', sev: 'high', col: j, row: i, value: R[i][j], msg: `Cột "${p.name}" là ngày nhưng ô không đọc được thành ngày` });
          else if (c.t === 'datetext' && !(textCells && (fmts.length < 2 || c.fmt === main))) add({ cat: 'format', check: 'Ngày lưu dạng chữ', sev: fmts.length > 1 && c.fmt !== main ? 'medium' : 'low', col: j, row: i, value: R[i][j], fix: 'date', suggest: U.fmtDate(c.d), msg: `Ngày dạng văn bản (${c.fmt})` + (c.fmt !== main && main ? ` khác định dạng chủ đạo ${main}` : '') });
          if (c.fmt && c.fmt.startsWith('mm')) add({ cat: 'inconsistent', check: 'Ngày kiểu Mỹ (tháng/ngày)', sev: 'high', col: j, row: i, value: R[i][j], msg: 'Ngày ghi theo kiểu tháng/ngày — các ô khác có thể đang bị đảo ngày-tháng' });
        });
        if (fmts.length > 1) add({ cat: 'inconsistent', check: 'Lẫn nhiều định dạng ngày', sev: 'medium', col: j, row: -1, value: fmts.map(([f, n]) => `${f}: ${n}`).join('; '), msg: 'Một cột ngày dùng nhiều kiểu nhập khác nhau' });
        // ngày tương lai / quá cũ
        if (role !== 'expiry') live.forEach((i) => {
          const d = U.toDate(R[i][j]); if (!d) return;
          const today = U.today();
          if (d > today && role !== 'date') add({ cat: 'logic', check: 'Ngày ở tương lai', sev: 'high', col: j, row: i, value: d, msg: `${A.ROLE_LABEL[role] || p.name} không thể sau hôm nay` });
          else if (d > new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())) add({ cat: 'logic', check: 'Ngày quá xa tương lai', sev: 'medium', col: j, row: i, value: d, msg: 'Ngày giao dịch lớn hơn hôm nay hơn 1 năm' });
          if (d.getFullYear() < 1900) add({ cat: 'logic', check: 'Ngày quá cũ', sev: 'medium', col: j, row: i, value: d, msg: 'Năm < 1900 — thường là lỗi nhập' });
        });
      }
      if (p.type === 'mixed') add({ cat: 'format', check: 'Cột lẫn nhiều kiểu dữ liệu', sev: 'medium', col: j, row: -1, value: Object.entries(p.typeCounts).filter(([k, v]) => v && k !== 'empty').map(([k, v]) => `${k}: ${v}`).join(', '), msg: 'Cột vừa có số, vừa có chữ/ngày — khó tính toán và lọc' });

      // Email
      if (role === 'email') live.forEach((i) => {
        const v = R[i][j]; if (U.isEmpty(v)) return;
        const s = String(v).trim();
        if (!RE_EMAIL.test(s)) add({ cat: 'format', check: 'Email sai định dạng', sev: 'high', col: j, row: i, value: v, msg: 'Email không hợp lệ' });
        else if (s !== s.toLowerCase()) add({ cat: 'inconsistent', check: 'Email có chữ hoa', sev: 'low', col: j, row: i, value: v, fix: 'lower', suggest: s.toLowerCase(), msg: 'Nên lưu email chữ thường để tránh trùng' });
      });
      // SĐT
      if (role === 'phone') {
        const styles = {};
        live.forEach((i) => { const v = R[i][j]; if (!U.isEmpty(v)) { const st = phoneStyle(v); styles[st] = (styles[st] || 0) + 1; } });
        let mainStyle = Object.entries(styles).sort((a, b) => b[1] - a[1])[0];
        // chỉ so kiểu nhập khi có kiểu chủ đạo rõ ràng (≥60%, ≥5 ô) và kiểu đó hợp lệ (bắt đầu bằng 0 hoặc +84)
        if (mainStyle && (p.filled < 5 || mainStyle[1] / p.filled < 0.6 || !/^(0|\+)/.test(mainStyle[0]))) mainStyle = null;
        live.forEach((i) => {
          const v = R[i][j]; if (U.isEmpty(v)) return;
          const d = normPhone(v);
          if (!isPhoneVN(d)) add({ cat: 'format', check: 'SĐT không hợp lệ', sev: 'high', col: j, row: i, value: v, msg: 'Không phải số điện thoại Việt Nam hợp lệ (10 số, đầu 03/05/07/08/09 hoặc 02x)' });
          else if (typeof v === 'number' || /^[35789]\d{8}$/.test(String(v).replace(/\D/g, ''))) add({ cat: 'format', check: 'SĐT mất số 0 đầu', sev: 'medium', col: j, row: i, value: v, fix: 'phone', suggest: d, msg: 'SĐT thiếu số 0 đầu (thường do Excel lưu dạng số)' });
          else if (mainStyle && phoneStyle(v) !== mainStyle[0]) add({ cat: 'inconsistent', check: 'SĐT nhập nhiều kiểu', sev: 'low', col: j, row: i, value: v, fix: 'phone', suggest: d, msg: `Khác kiểu nhập chủ đạo (${mainStyle[0]})` });
        });
      }
      // CCCD/CMND
      if (role === 'id_card') live.forEach((i) => {
        const v = R[i][j]; if (U.isEmpty(v)) return;
        const d = String(v).replace(/\s/g, '');
        if (/^\d+$/.test(d)) {
          if (d.length === 11 && typeof v === 'number') add({ cat: 'format', check: 'CCCD mất số 0 đầu', sev: 'high', col: j, row: i, value: v, fix: 'pad12', suggest: d.padStart(12, '0'), msg: 'CCCD lưu dạng số nên mất số 0 đầu' });
          else if (![9, 12].includes(d.length)) add({ cat: 'format', check: 'CCCD/CMND sai độ dài', sev: 'high', col: j, row: i, value: v, msg: 'CCCD phải 12 số, CMND cũ 9 số' });
        } else if (!/^[A-Z]\d{7,8}$/i.test(d)) add({ cat: 'format', check: 'CCCD/CMND sai ký tự', sev: 'high', col: j, row: i, value: v, msg: 'Chứa ký tự không phải số' });
      });
      // MST
      if (role === 'tax') live.forEach((i) => {
        const v = R[i][j]; if (U.isEmpty(v)) return;
        const d = String(v).replace(/[\s]/g, '');
        if (!/^\d{10}(-\d{3})?$/.test(d)) add({ cat: 'format', check: 'MST sai định dạng', sev: 'medium', col: j, row: i, value: v, msg: 'Mã số thuế phải 10 số hoặc 10 số-3 số' });
      });
      // Họ tên
      if (role === 'person_name' && p.type !== 'number') live.forEach((i) => {
        const v = R[i][j]; if (typeof v !== 'string' || !v.trim()) return;
        const s = cleanWS(v);
        if (/\d/.test(s)) add({ cat: 'format', check: 'Họ tên chứa số', sev: 'high', col: j, row: i, value: v, msg: 'Tên người không nên chứa chữ số' });
        else if (s !== titleCase(s)) add({ cat: 'inconsistent', check: 'Họ tên sai viết hoa', sev: 'low', col: j, row: i, value: v, fix: 'title', suggest: titleCase(s), msg: 'Nên viết hoa chữ cái đầu mỗi từ' });
        if (s.split(' ').length === 1) add({ cat: 'format', check: 'Họ tên chỉ có 1 từ', sev: 'low', col: j, row: i, value: v, msg: 'Có thể thiếu họ hoặc tên' });
      });
    });

    /* ----- Mẫu mã (pattern) ----- */
    profile.forEach((p) => {
      const j = p.idx;
      const isCode = j === keyCol || ['sku', 'emp_id'].includes(p.role) || (p.type === 'code');
      if (!isCode || p.filled < 5) return;
      const shapes = {};
      live.forEach((i) => { const v = R[i][j]; if (!U.isEmpty(v)) { const s = U.shape(U.display(v)); shapes[s] = (shapes[s] || 0) + 1; } });
      const sorted = Object.entries(shapes).sort((a, b) => b[1] - a[1]);
      const main = sorted[0];
      if (main && main[1] / p.filled >= 0.6 && sorted.length > 1) {
        const allowed = new Set(sorted.filter(([, n]) => n / p.filled >= 0.15).map(([s]) => s));
        live.forEach((i) => {
          const v = R[i][j]; if (U.isEmpty(v)) return;
          const sh = U.shape(U.display(v));
          if (!allowed.has(sh)) add({ cat: 'pattern', check: 'Mã khác mẫu chung', sev: 'medium', col: j, row: i, value: v, msg: `Mẫu "${sh}" khác mẫu chủ đạo "${main[0]}" (${U.pct(main[1] / p.filled, 0)})` });
        });
      }
      if (main && /A/.test(main[0])) {
        let withLetters = 0, upper = 0;
        live.forEach((i) => { const v = R[i][j]; if (typeof v === 'string' && /[A-Za-z]/.test(v)) { withLetters++; if (v === v.toUpperCase()) upper++; } });
        if (withLetters && upper / withLetters > 0.6) live.forEach((i) => {
          const v = R[i][j];
          if (typeof v === 'string' && /[a-z]/.test(v)) add({ cat: 'inconsistent', check: 'Mã viết thường/hoa lẫn lộn', sev: 'low', col: j, row: i, value: v, fix: 'upper', suggest: cleanWS(v).toUpperCase(), msg: 'Đa số mã viết HOA' });
        });
      }
    });

    /* ----- Giá trị bất thường / âm ----- */
    profile.forEach((p) => {
      const j = p.idx, role = p.role;
      if (p.type !== 'number' || !p.num || p.role === 'index') return;
      const { q1, q3 } = p.num, iqr = q3 - q1;
      const nonNeg = ['qty', 'price', 'amount', 'opening', 'inflow', 'outflow'].includes(role);
      live.forEach((i) => {
        const n = U.toNum(R[i][j]); if (n == null) return;
        if (n < 0 && (nonNeg || role === 'closing')) add({ cat: 'logic', check: role === 'closing' || role === 'qty' ? 'Tồn kho âm' : 'Số âm bất hợp lý', sev: role === 'closing' || role === 'qty' ? 'critical' : 'high', col: j, row: i, value: R[i][j], msg: `${A.ROLE_LABEL[role]} không được âm` });
        if (n === 0 && role === 'price') add({ cat: 'logic', check: 'Đơn giá bằng 0', sev: 'medium', col: j, row: i, value: R[i][j], msg: 'Đơn giá 0 — hàng khuyến mãi hay thiếu giá?' });
        // Đơn giá/thành tiền khác nhau tự nhiên giữa các mặt hàng -> đơn giá so trong cùng mã (bên dưới), thành tiền đã kiểm bằng công thức
        if (keyCol >= 0 && (role === 'price' || role === 'amount')) return;
        if (p.num.n >= 10 && iqr > 0) {
          const k = cfg.outlierK;
          if (n > q3 + k * iqr || n < q1 - k * iqr) add({ cat: 'outlier', check: 'Giá trị bất thường', sev: 'medium', col: j, row: i, value: R[i][j], msg: `Lệch xa phân bố (Q1=${U.fmtNum(q1, 2)}, Q3=${U.fmtNum(q3, 2)}, trung vị ${U.fmtNum(p.num.median, 2)}) — kiểm tra gõ thừa/thiếu số 0` });
        }
      });
    });

    /* ----- Đơn giá lệch bất thường trong cùng một mã ----- */
    const cPrice = firstIdx('price');
    if (keyCol >= 0 && cPrice >= 0 && profile[cPrice].type === 'number') {
      const byKey = new Map();
      live.forEach((i) => {
        const k = R[i][keyCol], n = U.toNum(R[i][cPrice]);
        if (U.isEmpty(k) || n == null || n <= 0) return;
        const kk = U.key(U.display(k)).replace(/ /g, '');
        if (!byKey.has(kk)) byKey.set(kk, []);
        byKey.get(kk).push([i, n]);
      });
      byKey.forEach((arr) => {
        if (arr.length < 3) return;
        const s = arr.map((x) => x[1]).sort((a, b) => a - b), med = s[Math.floor(s.length / 2)];
        arr.forEach(([i, n]) => {
          const ratio = n / med;
          if (ratio >= 5 || ratio <= 0.2) add({ cat: 'outlier', check: 'Đơn giá lệch bất thường trong cùng mã', sev: 'high', col: cPrice, row: i, value: R[i][cPrice], msg: `Gấp ${ratio >= 1 ? U.fmtNum(ratio, 1) + ' lần' : U.fmtNum(1 / ratio, 1) + ' lần nhỏ hơn'} đơn giá phổ biến ${U.fmtNum(med, 2)} của mã "${U.display(R[i][keyCol])}" — kiểm tra gõ thừa/thiếu số 0` });
        });
      });
    }

    /* ----- Biến thể cùng 1 giá trị (nhập nhiều cách) ----- */
    const clusters = [];
    profile.forEach((p) => {
      const j = p.idx, role = p.role;
      if (!['text', 'mixed'].includes(p.type) || p.filled < 3) return;
      const isCat = CAT_ROLES.includes(role) || (p.uniqueRatio < 0.6 && p.unique <= 3000 && j !== keyCol);
      if (!isCat) return;
      const groups = new Map();
      p.freq.forEach((c, v) => {
        const ck = canonKey(v, role);
        if (!ck) return;
        if (!groups.has(ck)) groups.set(ck, []);
        groups.get(ck).push({ v, c });
      });
      // gộp gần giống (Levenshtein) giữa các nhóm
      if (cfg.fuzzy && groups.size <= 1500) {
        const ks = Array.from(groups.keys()).filter((k) => !k.startsWith('§'));
        const parent = new Map(ks.map((k) => [k, k]));
        const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
        const byLen = ks.slice().sort((a, b) => a.length - b.length);
        for (let a = 0; a < byLen.length; a++) {
          const ka = byLen[a]; if (ka.length < 5) continue;
          const max = ka.length >= 10 ? 2 : 1;
          for (let b = a + 1; b < byLen.length; b++) {
            const kb = byLen[b];
            if (kb.length - ka.length > max) break;
            // không gộp khi khác nhau ở chữ số (vd "Kho 1" vs "Kho 2", "Size 38" vs "Size 39")
            if (ka.replace(/\D/g, '') !== kb.replace(/\D/g, '')) continue;
            if (U.levenshtein(ka, kb, max) <= max) parent.set(find(kb), find(ka));
          }
        }
        ks.forEach((k) => {
          const r = find(k);
          if (r !== k) { groups.get(r).push(...groups.get(k)); groups.delete(k); }
        });
      }
      const colGroups = [];
      groups.forEach((vars) => {
        if (vars.length < 2) return;
        vars.sort((a, b) => b.c - a.c);
        const total = vars.reduce((s, x) => s + x.c, 0);
        colGroups.push({ canonical: cleanWS(vars[0].v), variants: vars, total });
      });
      if (!colGroups.length) return;
      colGroups.sort((a, b) => b.total - a.total);
      clusters.push({ col: j, colName: p.name, role, groups: colGroups });
      const map = new Map();
      colGroups.forEach((g) => g.variants.forEach((x) => { if (x.v !== g.canonical) map.set(x.v, g); }));
      live.forEach((i) => {
        const s = U.display(R[i][j]);
        const g = map.get(s);
        if (g && cleanWS(s) !== g.canonical) add({ cat: 'inconsistent', check: 'Một giá trị nhập nhiều cách', sev: 'medium', col: j, row: i, value: s, fix: 'map', suggest: g.canonical, msg: `Cùng nghĩa với "${g.canonical}" (${g.variants.length} cách viết)` });
      });
    });

    /* ----- Trùng lặp ----- */
    const rowSig = new Map();
    live.forEach((i) => {
      const sig = R[i].map((c) => U.key(U.display(c))).join('\u0001');
      if (!rowSig.has(sig)) rowSig.set(sig, []);
      rowSig.get(sig).push(i);
    });
    let dupRows = 0;
    rowSig.forEach((arr) => {
      if (arr.length < 2) return;
      arr.slice(1).forEach((i) => { dupRows++; add({ cat: 'duplicate', check: 'Dòng trùng hoàn toàn', sev: 'high', col: -1, row: i, value: `= dòng ${ds.firstDataRow + arr[0]}`, msg: `Trùng toàn bộ với dòng ${ds.firstDataRow + arr[0]}`, dupOf: arr[0] }); });
    });
    const dupRowSet = new Set(); rowSig.forEach((a) => a.slice(1).forEach((i) => dupRowSet.add(i)));

    const keyGroups = new Map();
    if (keyCol >= 0) {
      // khoá ghép cho tồn kho: mã + kho + lô
      const parts = [keyCol];
      if (domain === 'inventory') ['warehouse', 'batch'].forEach((r) => { const c = firstIdx(r); if (c >= 0) parts.push(c); });
      const kname = parts.map((c) => H[c]).join(' + ');
      live.forEach((i) => {
        if (dupRowSet.has(i)) return;
        const k0 = R[i][keyCol]; if (U.isEmpty(k0)) return;
        const k = parts.map((c) => U.key(U.display(R[i][c])).replace(/ /g, '')).join('|');
        if (!keyGroups.has(k)) keyGroups.set(k, []);
        keyGroups.get(k).push(i);
      });
      keyGroups.forEach((arr) => {
        if (arr.length < 2) return;
        arr.slice(1).forEach((i) => add({ cat: 'duplicate', check: 'Trùng mã khoá', sev: domain === 'hr' ? 'critical' : 'high', col: keyCol, row: i, value: parts.map((c) => U.display(R[i][c])).join(' | '), msg: `Khoá (${kname}) đã xuất hiện ở dòng ${ds.firstDataRow + arr[0]}` }));
      });
    }

    /* ----- Dữ liệu không khớp (cùng mã khác thuộc tính) ----- */
    if (keyCol >= 0) {
      const byKey = new Map();
      live.forEach((i) => {
        const k = R[i][keyCol]; if (U.isEmpty(k)) return;
        const kk = U.key(U.display(k)).replace(/ /g, '');
        if (!byKey.has(kk)) byKey.set(kk, []);
        byKey.get(kk).push(i);
      });
      const attrRoles = domain === 'inventory' ? ['name_item', 'unit', 'category', 'supplier'] : domain === 'hr' ? ['person_name', 'dob', 'id_card', 'gender', 'email'] : ['name_item', 'person_name', 'unit', 'category'];
      const attrCols = attrRoles.map(firstIdx).filter((c) => c >= 0 && c !== keyCol);
      byKey.forEach((arr) => {
        if (arr.length < 2) return;
        attrCols.forEach((c) => {
          // so với giá trị đa số của mã (không phải dòng đầu tiên)
          const vals = new Map();
          arr.forEach((i) => {
            const v = R[i][c]; if (U.isEmpty(v)) return;
            const k = canonKey(U.display(v), roles[c]);
            if (!vals.has(k)) vals.set(k, { n: 0, i });
            vals.get(k).n++;
          });
          if (vals.size < 2) return;
          const [majK, maj] = Array.from(vals.entries()).sort((a, b) => b[1].n - a[1].n || a[1].i - b[1].i)[0];
          const tie = Array.from(vals.values()).filter((x) => x.n === maj.n).length > 1;
          arr.forEach((i) => {
            const v = R[i][c]; if (U.isEmpty(v)) return;
            if (canonKey(U.display(v), roles[c]) !== majK)
              add({ cat: 'conflict', check: `Cùng mã khác ${A.ROLE_LABEL[roles[c]] || H[c]}`, sev: 'high', col: c, row: i, value: v,
                msg: `Mã "${U.display(R[i][keyCol])}" ${tie ? 'cũng có' : `đa số (${maj.n}/${arr.length} dòng) có`} ${H[c]} = "${U.display(R[maj.i][c])}" (dòng ${ds.firstDataRow + maj.i})` });
          });
        });
      });
      // Cùng tên khác mã (1 hàng/1 người có nhiều mã)
      const nameCol = domain === 'hr' ? firstIdx('person_name') : firstIdx('name_item');
      if (nameCol >= 0 && domain !== 'hr') {
        const byName = new Map();
        live.forEach((i) => {
          const n = R[i][nameCol], k = R[i][keyCol];
          if (U.isEmpty(n) || U.isEmpty(k)) return;
          const nk = U.fingerprint(U.display(n));
          if (!byName.has(nk)) byName.set(nk, new Map());
          const m = byName.get(nk); const kk = U.key(U.display(k)).replace(/ /g, '');
          if (!m.has(kk)) m.set(kk, i);
        });
        byName.forEach((m) => {
          if (m.size < 2) return;
          const list = Array.from(m.values());
          list.slice(1).forEach((i) => add({ cat: 'conflict', check: 'Một mặt hàng nhiều mã', sev: 'medium', col: keyCol, row: i, value: `${U.display(R[i][keyCol])} ↔ ${U.display(R[list[0]][keyCol])}`, msg: `"${U.display(R[i][nameCol])}" đang có ${m.size} mã khác nhau` }));
        });
      }
    }
    // HR: email / SĐT / CCCD dùng chung giữa nhiều người
    if (domain === 'hr' || roles.includes('email') || roles.includes('id_card')) {
      const nameCol = firstIdx('person_name') >= 0 ? firstIdx('person_name') : keyCol;
      ['email', 'phone', 'id_card'].forEach((r) => {
        const c = firstIdx(r); if (c < 0) return;
        const m = new Map();
        live.forEach((i) => {
          const v = R[i][c]; if (U.isEmpty(v)) return;
          const k = r === 'phone' ? normPhone(v) : U.key(U.display(v)).replace(/ /g, '');
          if (!m.has(k)) m.set(k, []);
          m.get(k).push(i);
        });
        m.forEach((arr) => {
          if (arr.length < 2) return;
          const people = new Set(arr.map((i) => nameCol >= 0 ? U.key(U.display(R[i][nameCol])) : i));
          if (people.size < 2 && nameCol >= 0) return;
          arr.slice(1).forEach((i) => add({ cat: 'duplicate', check: `${A.ROLE_LABEL[r]} dùng chung nhiều người`, sev: r === 'id_card' ? 'critical' : 'high', col: c, row: i, value: R[i][c], msg: `Trùng với dòng ${ds.firstDataRow + arr[0]}${nameCol >= 0 ? ` (${U.display(R[arr[0]][nameCol])})` : ''}` }));
        });
      });
    }

    /* ----- Logic nghiệp vụ: Tồn kho ----- */
    const today = U.today();
    if (domain === 'inventory') {
      const cO = firstIdx('opening'), cI = firstIdx('inflow'), cX = firstIdx('outflow'), cC = firstIdx('closing');
      const cQ = cC >= 0 ? cC : firstIdx('qty'), cP = firstIdx('price'), cA = firstIdx('amount');
      const cE = firstIdx('expiry'), cU = firstIdx('unit');
      const cD = roles.findIndex((r, j) => (r === 'date') && profile[j].type === 'date');
      live.forEach((i) => {
        const r = R[i];
        if (cO >= 0 && cI >= 0 && cX >= 0 && cC >= 0) {
          const o = U.toNum(r[cO]) || 0, a = U.toNum(r[cI]) || 0, x = U.toNum(r[cX]) || 0, c = U.toNum(r[cC]);
          if (c != null && Math.abs(o + a - x - c) > 1e-6 * Math.max(1, Math.abs(c)))
            add({ cat: 'logic', check: 'Tồn cuối ≠ Đầu + Nhập − Xuất', sev: 'high', col: cC, row: i, value: r[cC], suggest: U.fmtNum(o + a - x, 4), msg: `${U.fmtNum(o, 2)} + ${U.fmtNum(a, 2)} − ${U.fmtNum(x, 2)} = ${U.fmtNum(o + a - x, 2)}, lệch ${U.fmtNum(c - (o + a - x), 2)}` });
          if (x > o + a + 1e-9) add({ cat: 'logic', check: 'Xuất vượt tồn', sev: 'high', col: cX, row: i, value: r[cX], msg: `Xuất ${U.fmtNum(x, 2)} > tồn đầu + nhập ${U.fmtNum(o + a, 2)}` });
        }
        if (cQ >= 0 && cP >= 0 && cA >= 0) {
          const q = U.toNum(r[cQ]), p = U.toNum(r[cP]), a = U.toNum(r[cA]);
          if (q != null && p != null && a != null) {
            const exp = q * p;
            if (Math.abs(exp - a) > Math.max(1, Math.abs(exp) * 0.005))
              add({ cat: 'logic', check: 'Thành tiền ≠ SL × Đơn giá', sev: 'high', col: cA, row: i, value: r[cA], suggest: U.fmtNum(exp, 2), msg: `${U.fmtNum(q, 2)} × ${U.fmtNum(p, 2)} = ${U.fmtNum(exp, 2)}, lệch ${U.fmtNum(a - exp, 2)}` });
          }
        }
        if (cE >= 0) {
          const d = U.toDate(r[cE]);
          if (d) {
            const left = U.daysBetween(today, d);
            const q = cQ >= 0 ? U.toNum(r[cQ]) : 1;
            if (q !== 0) {
              if (left < 0) add({ cat: 'logic', check: 'Hàng đã hết hạn', sev: 'high', col: cE, row: i, value: d, msg: `Đã quá hạn ${-left} ngày nhưng vẫn còn tồn` });
              else if (left <= cfg.expiryWarnDays) add({ cat: 'logic', check: 'Hàng sắp hết hạn', sev: 'medium', col: cE, row: i, value: d, msg: `Còn ${left} ngày` });
            }
            if (cD >= 0) { const dd = U.toDate(r[cD]); if (dd && d < dd) add({ cat: 'logic', check: 'Hạn dùng trước ngày chứng từ', sev: 'high', col: cE, row: i, value: d, msg: `Hạn dùng ${U.fmtDate(d)} < ${H[cD]} ${U.fmtDate(dd)}` }); }
          }
        }
        if (cQ >= 0 && cU >= 0) {
          const q = U.toNum(r[cQ]); const u = canonKey(U.display(r[cU]), 'unit');
          if (q != null && !Number.isInteger(q) && ['§cai', '§thung', '§hop', '§bo', '§chai', '§goi', '§cuon'].includes(u))
            add({ cat: 'logic', check: 'Số lẻ với đơn vị đếm', sev: 'low', col: cQ, row: i, value: r[cQ], msg: `Đơn vị "${U.display(r[cU])}" thường không có số lẻ` });
        }
      });
    }

    /* ----- Logic nghiệp vụ: Nhân sự ----- */
    if (domain === 'hr') {
      const cB = firstIdx('dob'), cJ = firstIdx('join_date'), cG = firstIdx('gender');
      live.forEach((i) => {
        const r = R[i];
        if (cB >= 0) {
          const b = U.toDate(r[cB]);
          if (b) {
            const age = (today - b) / (365.25 * 86400000);
            if (age < 15) add({ cat: 'logic', check: 'Tuổi dưới 15', sev: 'high', col: cB, row: i, value: b, msg: `Tuổi ${age.toFixed(1)} — dưới tuổi lao động` });
            else if (age > 75) add({ cat: 'logic', check: 'Tuổi trên 75', sev: 'medium', col: cB, row: i, value: b, msg: `Tuổi ${Math.floor(age)} — kiểm tra năm sinh` });
            if (cJ >= 0) { const j = U.toDate(r[cJ]); if (j && (j - b) / (365.25 * 86400000) < 15) add({ cat: 'logic', check: 'Vào làm trước 15 tuổi', sev: 'high', col: cJ, row: i, value: j, msg: 'Ngày vào làm quá sát/ trước ngày sinh' }); }
          }
        }
        if (cG >= 0 && !U.isEmpty(r[cG])) {
          const g = canonKey(U.display(r[cG]), 'gender');
          if (!['§nam', '§nu', 'khac', 'other'].includes(g)) add({ cat: 'format', check: 'Giới tính không chuẩn', sev: 'medium', col: cG, row: i, value: r[cG], msg: 'Giá trị nên là Nam/Nữ/Khác' });
        }
      });
    }

    /* ----- Quy tắc tùy chỉnh ----- */
    (cfg.customRules || []).forEach((rule) => {
      if (rule.enabled === false) return;
      const cols = H.map((h, j) => j).filter((j) => U.key(H[j]) === U.key(rule.col));
      cols.forEach((j) => {
        const seen = new Map();
        live.forEach((i) => {
          const v = R[i][j], empty = U.isEmpty(v), s = U.display(v).trim();
          let bad = false;
          switch (rule.type) {
            case 'required': bad = empty; break;
            case 'unique': if (!empty) { const k = U.key(s); if (seen.has(k)) bad = true; else seen.set(k, i); } break;
            case 'regex': try { bad = !empty && !new RegExp(rule.value).test(s); } catch (e) { bad = false; } break;
            case 'min': { const n = U.toNum(v); bad = n != null && n < +rule.value; break; }
            case 'max': { const n = U.toNum(v); bad = n != null && n > +rule.value; break; }
            case 'in': { const list = String(rule.value).split(/[,;|]/).map((x) => U.key(x)).filter(Boolean); bad = !empty && !list.includes(U.key(s)); break; }
            case 'len': { const [a, b] = String(rule.value).split('-').map(Number); bad = !empty && (s.length < a || s.length > (b || a)); break; }
            case 'notfuture': { const d = U.toDate(v); bad = !!d && d > today; break; }
          }
          if (bad) add({ cat: 'custom', check: rule.name || `${rule.col}: ${rule.type}`, sev: rule.sev || 'medium', col: j, row: i, value: v, msg: rule.msg || `Vi phạm quy tắc ${rule.type}${rule.value ? ' ' + rule.value : ''}` });
        });
      });
    });

    /* ----- Tổng hợp & điểm ----- */
    const res = summarize(ds, issues, counts, profile, live.length);
    Object.assign(res, {
      kind: 'table', domain, roles, keyCol, keyName: keyCol >= 0 ? H[keyCol] : null, clusters,
      dupRows, ms: Math.round(performance.now() - t0), truncated: issues.length >= CAP
    });
    profile.forEach((p) => { delete p.freq; });
    res.profile = profile;
    res.recommendations = recommend(res);
    return res;
  };

  const cleanWS = (s) => String(s).replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, '').replace(/[\u00a0\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  A.cleanWS = cleanWS;
  A.titleCase = titleCase;
  A.normPhone = normPhone;

  function summarize(ds, issues, counts, profile, nLive) {
    const byCat = {}, bySev = {}, byCheck = {}, byCol = {};
    const rowsByDim = { completeness: new Set(), validity: new Set(), uniqueness: new Set(), consistency: new Set(), accuracy: new Set() };
    const rowsAny = new Set();
    issues.forEach((it) => {
      byCat[it.cat] = (byCat[it.cat] || 0) + 1;
      bySev[it.sev] = (bySev[it.sev] || 0) + 1;
      const ck = it.cat + '|' + it.check;
      if (!byCheck[ck]) byCheck[ck] = { cat: it.cat, check: it.check, sev: it.sev, n: 0, cols: new Set(), sample: [] };
      byCheck[ck].n = counts[ck] || byCheck[ck].n + 1;
      if (it.colName) byCheck[ck].cols.add(it.colName);
      if (byCheck[ck].sample.length < 5) byCheck[ck].sample.push(it);
      if (A.SEV[it.sev].order < A.SEV[byCheck[ck].sev].order) byCheck[ck].sev = it.sev;
      if (it.colName) byCol[it.colName] = (byCol[it.colName] || 0) + 1;
      if (it.row >= 0 && it.sev !== 'info') {
        rowsByDim[A.CATS[it.cat].dim].add(it.row);
        rowsAny.add(it.row);
      }
    });
    const nRows = Math.max(1, nLive);
    const usedCols = profile ? profile.filter((p) => p.type !== 'empty') : [];
    const cells = usedCols.length * nLive;
    const filledCells = usedCols.reduce((s, p) => s + p.filled, 0);
    const dims = {
      completeness: cells ? filledCells / cells : 1,
      validity: 1 - rowsByDim.validity.size / nRows,
      uniqueness: 1 - rowsByDim.uniqueness.size / nRows,
      consistency: 1 - rowsByDim.consistency.size / nRows,
      accuracy: 1 - rowsByDim.accuracy.size / nRows
    };
    // phạt thêm theo mức độ nghiêm trọng
    const sevPenalty = issues.reduce((s, it) => s + A.SEV[it.sev].w, 0) / (nRows * 4);
    const base = dims.completeness * 0.2 + dims.validity * 0.2 + dims.uniqueness * 0.2 + dims.consistency * 0.2 + dims.accuracy * 0.2;
    const score = Math.max(0, Math.min(100, Math.round((base - Math.min(0.25, sevPenalty)) * 100)));
    const checks = Object.values(byCheck).map((c) => ({ ...c, cols: Array.from(c.cols) }))
      .sort((a, b) => A.SEV[a.sev].order - A.SEV[b.sev].order || b.n - a.n);
    return {
      datasetId: ds.id, name: ds.name, rows: nLive, totalRows: ds.rows.length, cols: ds.headers.length,
      issues, byCat, bySev, byCol, checks, dims, score, rowsWithIssues: rowsAny.size,
      cleanRowRate: 1 - rowsAny.size / nRows, at: new Date().toISOString()
    };
  }

  A.grade = (s) => s >= 90 ? { g: 'A', t: 'Rất tốt' } : s >= 80 ? { g: 'B', t: 'Tốt' } : s >= 65 ? { g: 'C', t: 'Trung bình' } : s >= 50 ? { g: 'D', t: 'Kém' } : { g: 'E', t: 'Rất kém' };

  /* ---------- Khuyến nghị theo kết quả ---------- */
  function recommend(r) {
    const out = [];
    const has = (cat) => r.byCat[cat] > 0;
    const chk = (name) => r.checks.find((c) => c.check === name);
    if (r.bySev.critical) out.push({ sev: 'critical', text: `Có ${U.fmtNum(r.bySev.critical)} lỗi nghiêm trọng — xử lý trước khi dùng dữ liệu cho báo cáo/đối soát.` });
    if (has('duplicate')) out.push({ sev: 'high', text: `Loại bỏ ${U.fmtNum(r.byCat.duplicate)} bản ghi trùng; thiết lập Data Validation hoặc khoá duy nhất cho cột "${r.keyName || 'mã'}".` });
    if (has('conflict')) out.push({ sev: 'high', text: 'Cùng một mã đang mang nhiều thông tin khác nhau — cần một bảng Master duy nhất (mã ↔ tên ↔ ĐVT) và dùng VLOOKUP/XLOOKUP thay vì gõ tay.' });
    if (has('inconsistent')) out.push({ sev: 'medium', text: 'Nhiều giá trị nhập tuỳ ý (viết tắt, có/không dấu, hoa/thường). Dùng danh sách thả xuống (Data Validation → List) cho các cột danh mục. Tab "Chuẩn hoá" có thể gộp tự động.' });
    if (chk('Số lưu dạng chữ') || chk('Ngày lưu dạng chữ')) out.push({ sev: 'medium', text: 'Số/ngày đang lưu dạng chữ khiến SUM, Pivot, lọc theo ngày bị sai. Dùng tab "Chuẩn hoá" để chuyển đổi hàng loạt.' });
    if (has('whitespace')) out.push({ sev: 'low', text: 'Dọn khoảng trắng/ký tự ẩn (hàm TRIM/CLEAN) — đây là nguyên nhân phổ biến khiến VLOOKUP trả #N/A.' });
    if (chk('Lỗi font TCVN3')) out.push({ sev: 'high', text: 'Một số ô gõ bằng bảng mã cũ TCVN3 — dùng Unikey Toolkit (chuyển mã sang Unicode) trước khi dùng.' });
    if (has('logic')) out.push({ sev: 'high', text: 'Có sai lệch logic nghiệp vụ (tồn, thành tiền, hạn dùng, tuổi...) — rà soát chứng từ gốc của các dòng được đánh dấu.' });
    if (has('missing')) out.push({ sev: 'medium', text: 'Bổ sung các ô bắt buộc còn trống; cân nhắc đặt quy tắc "bắt buộc" ở tab Quy tắc để kiểm tra mỗi lần.' });
    if (has('outlier')) out.push({ sev: 'medium', text: 'Một số giá trị lệch rất xa phân bố — thường do gõ thừa/thiếu số 0 hoặc nhầm đơn vị.' });
    if (has('structure')) out.push({ sev: 'low', text: 'Chuẩn hoá cấu trúc: 1 dòng tiêu đề, không dòng trống/dòng tổng xen giữa, không gộp ô.' });
    if (!out.length) out.push({ sev: 'info', text: 'Dữ liệu sạch theo các quy tắc hiện tại. Có thể bổ sung quy tắc riêng ở tab Quy tắc.' });
    return out;
  }

  /* =====================================================================
     PHÂN TÍCH VĂN BẢN (Word / PDF / PowerPoint)
     ===================================================================== */
  function analyzeText(ds, cfg) {
    const t0 = performance.now();
    const issues = []; const counts = {}; let seq = 0;
    const add = (o) => { const k = o.cat + '|' + o.check; counts[k] = (counts[k] || 0) + 1; o.id = ++seq; o.col = 1; o.colName = 'Nội dung'; o.excelRow = o.row + 1; issues.push(o); };
    const L = ds.lines;
    const dateFmts = {}, dateHits = [], numStyles = {}, numHits = [];
    const phrases = new Map();
    L.forEach((line, i) => {
      if (!line.trim()) return;
      const short = line.length > 140 ? line.slice(0, 140) + '…' : line;
      if (looksTCVN3(line)) add({ cat: 'format', check: 'Lỗi font TCVN3', sev: 'high', row: i, value: short, msg: 'Đoạn văn có dấu hiệu dùng bảng mã cũ' });
      if (line !== line.normalize('NFC')) add({ cat: 'whitespace', check: 'Unicode tổ hợp (NFD)', sev: 'medium', row: i, value: short, msg: 'Chữ có dấu dạng tổ hợp — tìm kiếm/sao chép dễ lỗi' });
      if (/\S {2,}\S/.test(line) && ds.source.kind !== 'pdf') add({ cat: 'whitespace', check: 'Nhiều khoảng trắng liền nhau', sev: 'low', row: i, value: short, msg: 'Có 2+ dấu cách liên tiếp' });
      if (/\s[,.;:!?](\s|$)/.test(line)) add({ cat: 'format', check: 'Khoảng trắng trước dấu câu', sev: 'low', row: i, value: short, msg: 'Dấu câu phải dính liền chữ phía trước' });
      if (/[,.;:](?=[A-Za-zÀ-ỹ])/.test(line.replace(/\d[.,]\d/g, '')) && !/https?:|www\.|@/.test(line)) add({ cat: 'format', check: 'Thiếu khoảng trắng sau dấu câu', sev: 'low', row: i, value: short, msg: 'Sau dấu , . ; : cần một khoảng trắng' });
      const rep = line.match(/(^|\s)(\p{L}{2,})\s+\2(?=\s|$|[,.])/iu);
      if (rep) add({ cat: 'format', check: 'Lặp từ', sev: 'low', row: i, value: short, msg: `Từ "${rep[2]}" bị lặp liền nhau` });
      const opens = (line.match(/[([{]/g) || []).length, closes = (line.match(/[)\]}]/g) || []).length;
      if (opens !== closes) add({ cat: 'format', check: 'Ngoặc không cân', sev: 'low', row: i, value: short, msg: `Mở ${opens} / đóng ${closes} ngoặc` });
      (line.match(/\b\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}\b/g) || []).forEach((tok) => {
        const d = U.parseDateStr(tok); if (!d) return;
        if (d.invalid) add({ cat: 'format', check: 'Ngày không tồn tại', sev: 'high', row: i, value: tok, msg: 'Ngày không hợp lệ' });
        else { dateFmts[d.fmt] = (dateFmts[d.fmt] || 0) + 1; dateHits.push({ i, tok, fmt: d.fmt }); }
      });
      (line.match(/\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?\b/g) || []).forEach((tok) => {
        const n = U.parseNumStr(tok); if (n && n.style !== 'plain') { numStyles[n.style] = (numStyles[n.style] || 0) + 1; numHits.push({ i, tok, style: n.style }); }
      });
      (line.match(/(?:\p{Lu}[\p{L}]+)(?:\s+\p{Lu}[\p{L}]+){1,3}/gu) || []).forEach((ph) => {
        const k = U.fingerprint(ph); if (k.length < 4) return;
        if (!phrases.has(k)) phrases.set(k, new Map());
        const m = phrases.get(k); m.set(ph, (m.get(ph) || 0) + 1);
      });
    });
    const fm = Object.entries(dateFmts).sort((a, b) => b[1] - a[1]);
    if (fm.length > 1) dateHits.filter((h) => h.fmt !== fm[0][0]).forEach((h) => add({ cat: 'inconsistent', check: 'Lẫn nhiều định dạng ngày', sev: 'medium', row: h.i, value: h.tok, msg: `Khác định dạng chủ đạo ${fm[0][0]}` }));
    const ns = Object.entries(numStyles).sort((a, b) => b[1] - a[1]);
    if (ns.length > 1) numHits.filter((h) => h.style !== ns[0][0]).forEach((h) => add({ cat: 'inconsistent', check: 'Lẫn kiểu dấu thập phân', sev: 'medium', row: h.i, value: h.tok, msg: `Tài liệu chủ yếu viết số kiểu ${ns[0][0] === 'vn' ? '1.234,5' : '1,234.5'}` }));
    phrases.forEach((m) => {
      if (m.size < 2) return;
      const vars = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
      vars.slice(1).forEach(([v]) => {
        const i = L.findIndex((l) => l.includes(v));
        add({ cat: 'inconsistent', check: 'Thuật ngữ viết nhiều cách', sev: 'low', row: i, value: v, msg: `Cũng xuất hiện dạng "${vars[0][0]}"` });
      });
    });
    const res = summarize(ds, issues, counts, null, L.length);
    res.dims.completeness = 1;
    Object.assign(res, { kind: 'text', domain: 'document', profile: [], clusters: [], keyCol: -1, ms: Math.round(performance.now() - t0), words: L.join(' ').split(/\s+/).filter(Boolean).length });
    res.recommendations = recommend(res);
    return res;
  }

  /* =====================================================================
     LÀM SẠCH
     ===================================================================== */
  // enabled: Set các fix ('ws','nfc','num','date','title','phone','upper','lower','map','pad12'); overrides: {col:{raw: newVal}}
  A.clean = (ds, res, enabled, overrides = {}, opts = {}) => {
    const rows = ds.rows.map((r) => r.slice());
    const cellFix = new Map();
    res.issues.forEach((it) => {
      if (!it.fix || it.row < 0 || !enabled.has(it.fix)) return;
      const k = it.row + ':' + it.col;
      if (!cellFix.has(k)) cellFix.set(k, {});
      cellFix.get(k)[it.fix] = it.suggest;
    });
    let changed = 0;
    cellFix.forEach((fx, k) => {
      const [i, j] = k.split(':').map(Number);
      let v = rows[i][j];
      const before = v;
      if (fx.nfc !== undefined && typeof v === 'string') v = v.normalize('NFC');
      if (fx.ws !== undefined && typeof v === 'string') v = cleanWS(v);
      if (fx.num !== undefined) { const n = U.toNum(v); if (n != null) v = n; }
      if (fx.date !== undefined) { const d = U.toDate(v); if (d) v = d; }
      if (fx.title !== undefined && typeof v === 'string') v = titleCase(cleanWS(v));
      if (fx.phone !== undefined) v = normPhone(v);
      if (fx.pad12 !== undefined) v = String(v).padStart(12, '0');
      if (fx.upper !== undefined && typeof v === 'string') v = cleanWS(v).toUpperCase();
      if (fx.lower !== undefined && typeof v === 'string') v = cleanWS(v).toLowerCase();
      if (fx.map !== undefined) {
        const o = overrides[j] && overrides[j][U.display(before)];
        v = o !== undefined ? o : fx.map;
      }
      if (v !== before) { rows[i][j] = v; changed++; }
    });
    let removed = 0;
    let out = rows;
    if (opts.dropDupRows || opts.dropEmpty) {
      const drop = new Set();
      res.issues.forEach((it) => {
        if (opts.dropDupRows && it.check === 'Dòng trùng hoàn toàn') drop.add(it.row);
        if (opts.dropEmpty && (it.check === 'Dòng trống giữa bảng' || it.check === 'Dòng tổng lẫn trong dữ liệu')) drop.add(it.row);
      });
      out = rows.filter((r, i) => !drop.has(i));
      removed = drop.size;
    }
    return { rows: out, changed, removed };
  };

  /* =====================================================================
     ĐỐI CHIẾU 2 BẢNG
     ===================================================================== */
  A.reconcile = (dsA, dsB, keyA, keyB, pairs, tol = 0) => {
    const kf = (r, ks) => ks.map((k) => U.key(U.display(r[k])).replace(/ /g, '')).join('|');
    const mapB = new Map(), dupB = new Set(), dupA = new Set();
    dsB.rows.forEach((r, i) => { const k = kf(r, keyB); if (k.replace(/\|/g, '') === '') return; if (mapB.has(k)) dupB.add(k); else mapB.set(k, i); });
    const seenA = new Set();
    const onlyA = [], diffs = [], matched = [];
    dsA.rows.forEach((r, i) => {
      const k = kf(r, keyA); if (k.replace(/\|/g, '') === '') return;
      if (seenA.has(k)) { dupA.add(k); return; }
      seenA.add(k);
      if (!mapB.has(k)) { onlyA.push({ key: keyA.map((c) => U.display(r[c])).join(' | '), rowA: dsA.firstDataRow + i, i }); return; }
      const j = mapB.get(k), rb = dsB.rows[j];
      const d = [];
      pairs.forEach(([ca, cb]) => {
        const va = r[ca], vb = rb[cb];
        const na = U.toNum(va), nb = U.toNum(vb);
        let same;
        if (na != null && nb != null) same = Math.abs(na - nb) <= tol;
        else {
          const da = U.toDate(va), db = U.toDate(vb);
          if (da && db) same = +da === +db;
          else same = U.key(U.display(va)) === U.key(U.display(vb));
        }
        if (!same) d.push({ colA: dsA.headers[ca], colB: dsB.headers[cb], a: U.display(va), b: U.display(vb), delta: na != null && nb != null ? nb - na : null });
      });
      matched.push(k);
      if (d.length) diffs.push({ key: keyA.map((c) => U.display(r[c])).join(' | '), rowA: dsA.firstDataRow + i, rowB: dsB.firstDataRow + j, diffs: d });
    });
    const onlyB = [];
    mapB.forEach((j, k) => { if (!seenA.has(k)) onlyB.push({ key: keyB.map((c) => U.display(dsB.rows[j][c])).join(' | '), rowB: dsB.firstDataRow + j, i: j }); });
    return { onlyA, onlyB, diffs, matched: matched.length, dupA: dupA.size, dupB: dupB.size };
  };

  // Gợi ý ghép cột giữa 2 bảng theo tên/vai trò
  A.suggestPairs = (dsA, dsB) => {
    const pairs = [];
    dsA.headers.forEach((h, i) => {
      const k = U.key(h), r = A.roleOf(h);
      let j = dsB.headers.findIndex((x) => U.key(x) === k);
      if (j < 0 && r) j = dsB.headers.findIndex((x) => A.roleOf(x) === r);
      if (j >= 0 && !pairs.some((p) => p[1] === j)) pairs.push([i, j]);
    });
    return pairs;
  };

  MD.Analyzer = A;
})(window.MD);
