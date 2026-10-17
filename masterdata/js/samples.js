/* Master Data Pro — dữ liệu mẫu có cài sẵn lỗi để trải nghiệm */
(function (MD) {
  'use strict';
  const P = MD.Parsers;
  const S = {};
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const day = (y, m, d) => new Date(y, m - 1, d);

  const ITEMS = [
    ['VT-1001', 'Ốc vít M6 inox', 'Cái', 'Phụ kiện', 1200], ['VT-1002', 'Bu lông M10 thép', 'Cái', 'Phụ kiện', 3500],
    ['VT-1003', 'Dây điện Cadivi 2.5mm', 'Mét', 'Điện', 8900], ['VT-1004', 'Sơn chống gỉ Jotun 5L', 'Thùng', 'Hoá chất', 685000],
    ['VT-1005', 'Găng tay bảo hộ', 'Đôi', 'Bảo hộ', 15000], ['VT-1006', 'Băng keo điện Nano', 'Cuộn', 'Điện', 7000],
    ['VT-1007', 'Keo silicon A500', 'Chai', 'Hoá chất', 45000], ['VT-1008', 'Mũi khoan sắt 8mm', 'Cái', 'Dụng cụ', 32000],
    ['VT-1009', 'Dầu nhớt Castrol 4L', 'Can', 'Hoá chất', 420000], ['VT-1010', 'Khẩu trang 3M', 'Hộp', 'Bảo hộ', 95000],
    ['VT-1011', 'Ống nhựa PVC 21', 'Mét', 'Nước', 12000], ['VT-1012', 'Co nối PVC 21', 'Cái', 'Nước', 3000],
    ['VT-1013', 'Bóng đèn LED 9W', 'Cái', 'Điện', 38000], ['VT-1014', 'Công tắc Panasonic', 'Cái', 'Điện', 26000],
    ['VT-1015', 'Giấy A4 Double A', 'Ram', 'Văn phòng', 78000], ['VT-1016', 'Pin AA Panasonic', 'Vỉ', 'Văn phòng', 22000]
  ];
  const KHO = ['Kho Hà Nội', 'Kho HCM', 'Kho Đà Nẵng'];

  S.inventory = () => {
    seed = 7;
    const head = ['STT', 'Mã hàng', 'Tên hàng', 'ĐVT', 'Nhóm hàng', 'Kho', 'Số lô', 'Hạn dùng', 'Tồn đầu kỳ', 'Nhập trong kỳ', 'Xuất trong kỳ', 'Tồn cuối kỳ', 'Đơn giá', 'Thành tiền'];
    const rows = [];
    let n = 0;
    for (let k = 0; k < 14; k++) ITEMS.forEach((it, ii) => {
      if (rnd() < 0.45) return;
      const kho = KHO[(k + ii) % 3];
      const lot = 'L' + (2401 + k * 3 + (ii % 3));
      const o = Math.floor(rnd() * 400), a = Math.floor(rnd() * 300), x = Math.floor(rnd() * (o + a));
      const c = o + a - x;
      const exp = ['Hoá chất', 'Bảo hộ'].includes(it[3]) ? day(2026, 1 + Math.floor(rnd() * 24), 1 + Math.floor(rnd() * 27)) : '';
      rows.push([++n, it[0], it[1], it[2], it[3], kho, lot, exp, o, a, x, c, it[4], c * it[4]]);
    });
    // ---- cài lỗi ----
    const r = (i) => rows[i % rows.length];
    // tìm dòng thứ k thoả điều kiện (để lỗi cài vào đúng loại hàng)
    const find = (pred, k = 0) => rows.filter(pred)[k] || rows[k];
    const unit = (u, k) => find((x) => x[3] === u, k);
    const sku = (c, k) => find((x) => x[1] === c, k);
    r(3)[2] = r(3)[2] + '  ';                          // thừa khoảng trắng
    unit('Cái', 1)[3] = 'cái'; unit('Cái', 3)[3] = 'Chiếc'; unit('Cái', 5)[3] = 'pcs'; unit('Mét', 1)[3] = 'met';
    r(7)[5] = 'Kho HN'; r(15)[5] = 'kho ha noi'; r(21)[5] = 'Kho Hồ Chí Minh'; r(26)[5] = 'Kho TP.HCM';
    r(10)[11] = r(10)[11] + 15;                       // tồn cuối lệch công thức
    r(14)[13] = r(14)[13] * 10;                       // thành tiền sai
    r(18)[10] = r(18)[8] + r(18)[9] + 5; r(18)[11] = -5; r(18)[13] = -5 * r(18)[12]; // xuất vượt tồn -> tồn âm
    r(20)[8] = String(r(20)[8]); r(23)[9] = r(23)[9] >= 1000 ? r(23)[9].toLocaleString('vi-VN') : String(r(23)[9]); // số dạng chữ
    r(25)[12] = 0; r(25)[13] = 0;                      // đơn giá 0
    r(28)[1] = r(28)[1].toLowerCase(); r(31)[1] = r(31)[1].replace('-', ''); // sai mẫu mã
    sku('VT-1003', 2)[2] = 'Dây điện Cadivi 2,5 li';  // cùng mã khác tên
    sku('VT-1009', 1)[3] = 'Lít';                     // cùng mã khác ĐVT
    find((x) => x[4] === 'Điện', 2)[4] = 'Dien'; find((x) => x[4] === 'Điện', 4)[4] = 'điện';
    find((x) => x[7] instanceof Date, 1)[7] = '15/13/2026'; find((x) => x[7] instanceof Date, 3)[7] = '2026-03-05';
    r(46)[1] = ''; r(48)[2] = '';
    r(50)[12] = r(50)[12] * 100; r(50)[13] = r(50)[11] * r(50)[12]; // gõ thừa số 0
    r(52)[2] = r(52)[2].normalize('NFD');             // Unicode tổ hợp
    { const x = unit('Cái', 7); x[9] += 0.5; x[11] += 0.5; x[13] = x[11] * x[12]; } // số lẻ với đơn vị đếm
    r(56)[2] = r(56)[2].replace(' ', '\u00a0');      // ký tự ẩn
    rows.splice(30, 0, rows[29].slice());             // dòng trùng
    rows.splice(60, 0, ['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    rows.push(['', 'TỔNG CỘNG', '', '', '', '', '', '', '', '', '', '', '', rows.reduce((s, x) => s + (typeof x[13] === 'number' ? x[13] : 0), 0)]);
    const extra = ITEMS[2]; rows.push([++n, 'VT-2003', extra[1], extra[2], extra[3], 'Kho Hà Nội', 'L2499', '', 10, 0, 0, 10, extra[4], 10 * extra[4]]); // 1 hàng 2 mã
    const aoa = [['BÁO CÁO NHẬP XUẤT TỒN — QUÝ 3/2026'], ['Đơn vị: Công ty ABC'], []].concat([head], rows);
    return [P.fromAOA(aoa, 'Mẫu - Nhập xuất tồn.xlsx', { file: 'Mẫu - Nhập xuất tồn.xlsx', kind: 'sample' })];
  };

  S.hr = () => {
    seed = 11;
    const ho = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Huỳnh'];
    const dem = ['Văn', 'Thị', 'Minh', 'Ngọc', 'Hoàng', 'Thanh', 'Quốc', 'Thu', 'Đức', 'Gia'];
    const ten = ['An', 'Bình', 'Châu', 'Dũng', 'Hà', 'Hùng', 'Lan', 'Linh', 'Nam', 'Phương', 'Quân', 'Tâm', 'Trang', 'Tuấn', 'Vy'];
    const pb = ['Kinh doanh', 'Kế toán', 'Nhân sự', 'Kho vận', 'CNTT', 'Marketing'];
    const cv = ['Nhân viên', 'Trưởng nhóm', 'Chuyên viên', 'Trưởng phòng'];
    const head = ['Mã NV', 'Họ và tên', 'Giới tính', 'Ngày sinh', 'Số CCCD', 'Số điện thoại', 'Email', 'Phòng ban', 'Chức vụ', 'Ngày vào làm', 'Tỉnh/TP', 'Trạng thái'];
    const rows = [];
    for (let i = 1; i <= 140; i++) {
      const name = `${pick(ho)} ${pick(dem)} ${pick(ten)}`;
      const g = name.includes(' Thị ') ? 'Nữ' : pick(['Nam', 'Nữ']);
      const dob = day(1970 + Math.floor(rnd() * 32), 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28));
      const jd = day(2012 + Math.floor(rnd() * 14), 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28));
      const phone = '09' + String(Math.floor(rnd() * 1e8)).padStart(8, '0');
      const mail = MD.U.stripAccents(name).toLowerCase().split(' ').reverse().join('.') + i + '@abc.vn';
      rows.push(['NV' + String(i).padStart(4, '0'), name, g, dob, '0' + String(Math.floor(rnd() * 1e11)).padStart(11, '0'), phone, mail, pick(pb), pick(cv), jd, pick(['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng']), 'Đang làm việc']);
    }
    const r = (i) => rows[i];
    r(2)[1] = 'nguyễn văn an'; r(4)[1] = 'TRẦN THỊ LAN'; r(6)[1] = 'Lê  Minh   Tâm';
    r(8)[2] = 'nam'; r(9)[2] = 'F'; r(10)[2] = 'Male';
    r(12)[3] = '31/02/1990'; r(13)[3] = day(2015, 5, 5); r(14)[3] = '1988-07-12'; r(15)[3] = '07/25/1992';
    r(17)[4] = 12345678; r(18)[4] = 1234567890; r(19)[4] = r(20)[4];
    r(21)[5] = 912345678; r(22)[5] = '+84 912 345 679'; r(23)[5] = '0912.345.680'; r(24)[5] = '12345';
    r(26)[6] = 'abc@gmail'; r(27)[6] = 'Tran.Binh@ABC.vn'; r(28)[6] = r(29)[6];
    r(30)[7] = 'HCNS'; r(31)[7] = 'phòng nhân sự'; r(32)[7] = 'Ke toan'; r(33)[7] = 'Sales'; r(34)[7] = 'IT';
    r(36)[10] = 'HCM'; r(37)[10] = 'Ha Noi'; r(38)[10] = 'TPHCM'; r(39)[10] = 'HN';
    r(41)[9] = day(2027, 1, 1); r(42)[0] = 'NV0001'; r(43)[0] = 'nv0044'; r(44)[0] = 'NV-045';
    r(46)[11] = 'Nghỉ việc'; r(47)[11] = 'active'; r(48)[1] = ''; r(50)[1] = 'Phạm Văn 2';
    rows.splice(60, 0, rows[59].slice());
    const aoa = [head].concat(rows);
    return [P.fromAOA(aoa, 'Mẫu - Danh sách nhân sự.xlsx', { file: 'Mẫu - Danh sách nhân sự.xlsx', kind: 'sample' })];
  };

  S.reconcile = () => {
    seed = 19;
    const head = ['Mã hàng', 'Tên hàng', 'Kho', 'Tồn hệ thống'];
    const head2 = ['Ma hang', 'Ten hang', 'Kho', 'SL kiểm kê thực tế'];
    const a = [], b = [];
    ITEMS.forEach((it) => KHO.slice(0, 2).forEach((k) => {
      const q = 20 + Math.floor(rnd() * 300);
      a.push([it[0], it[1], k, q]);
      const roll = rnd();
      if (roll < 0.08) return;                                // thiếu trong kiểm kê
      b.push([it[0], it[1], k, roll < 0.3 ? q - Math.ceil(rnd() * 10) : q]);
    }));
    b.push(['VT-3001', 'Kìm cắt Stanley', 'Kho Hà Nội', 12]);   // có thực tế, không có hệ thống
    b.push([' vt-1001 ', 'Ốc vít M6 inox', 'kho hà nội', 999]);
    return [
      P.fromAOA([head].concat(a), 'Mẫu - Tồn hệ thống.xlsx', { file: 'Mẫu - Tồn hệ thống.xlsx', kind: 'sample' }),
      P.fromAOA([head2].concat(b), 'Mẫu - Kiểm kê thực tế.xlsx', { file: 'Mẫu - Kiểm kê thực tế.xlsx', kind: 'sample' })
    ];
  };

  MD.Samples = S;
})(window.MD);
