// ===== Dữ liệu thị trường: Quán trà sữa xe đẩy gần KCN + trường học + khu dân cư =====
// Giá tham khảo mặt bằng bán lẻ 2026 (Đồng Nai / TP.HCM). Sửa được trong tab Cài đặt.

const ITEMS = {
  // id: tên, đơn vị, quy cách gói, giá gói
  tra_olong: { name: 'Trà Ô Long Nhài', unit: 'g', pack: 500, price: 110000, label: 'Gói 500g' },
  tra_den:   { name: 'Trà đen (pha trà sữa)', unit: 'g', pack: 500, price: 65000, label: 'Gói 500g' },
  tra_thai:  { name: 'Trà Thái Xanh', unit: 'g', pack: 400, price: 95000, label: 'Gói 400g' },
  tra_gao:   { name: 'Trà Gạo Rang', unit: 'g', pack: 500, price: 120000, label: 'Gói 500g' },
  bot_khoai: { name: 'Bột Khoai Môn', unit: 'g', pack: 1000, price: 160000, label: 'Bịch 1kg' },
  kem_beo:   { name: 'Bột kem béo', unit: 'g', pack: 1000, price: 75000, label: 'Bịch 1kg' },
  sua_dac:   { name: 'Sữa đặc', unit: 'g', pack: 380, price: 28000, label: 'Lon 380g' },
  duong:     { name: 'Đường cát (nấu syrup)', unit: 'g', pack: 2000, price: 50000, label: 'Bịch 2kg' },
  da:        { name: 'Đá viên', unit: 'g', pack: 20000, price: 30000, label: 'Bao 20kg', melts: true },
  ly_m:      { name: 'Ly M 500ml + màng + ống + túi', unit: 'bộ', pack: 50, price: 90000, label: 'Lốc 50 bộ' },
  ly_l:      { name: 'Ly L 700ml + màng + ống + túi', unit: 'bộ', pack: 50, price: 110000, label: 'Lốc 50 bộ' },
  tcden_kho: { name: 'Trân châu đen (khô)', unit: 'g', pack: 1000, price: 55000, label: 'Bịch 1kg' },
  tctrang_kho:{ name: 'Trân châu trắng (khô)', unit: 'g', pack: 1000, price: 65000, label: 'Bịch 1kg' },
  tcsoi_kho: { name: 'Trân châu sợi (khô)', unit: 'g', pack: 1000, price: 70000, label: 'Bịch 1kg' },
  tc3q:      { name: 'Trân châu 3Q (ăn liền)', unit: 'g', pack: 2000, price: 95000, label: 'Hũ 2kg' },
  thach:     { name: 'Thạch dừa', unit: 'g', pack: 2200, price: 60000, label: 'Hũ 2,2kg' },
};

// Bình ủ trà: 3 lít nước → ~2.700ml trà cốt; ủ 15 phút, dùng trong 5 tiếng
const POT = { water: 3000, yield: 2700, brewMin: 15, lifeMin: 300 };
const TEAS = {
  olong: { name: 'Ô Long Nhài', item: 'tra_olong', gram: 60, color: '#c8a24a' },
  den:   { name: 'Trà đen',     item: 'tra_den',   gram: 60, color: '#8a4b2a' },
  thai:  { name: 'Thái Xanh',   item: 'tra_thai',  gram: 70, color: '#5fae6a' },
  gao:   { name: 'Gạo Rang',    item: 'tra_gao',   gram: 80, color: '#c79a5d' },
};

const DRINKS = [
  { id: 'olong', name: 'Ô Long Nhài', tea: 'olong', price: { M: 22000, L: 27000 }, color: '#d9b878' },
  { id: 'tt',    name: 'Truyền Thống', tea: 'den',  price: { M: 18000, L: 23000 }, color: '#c49a6c' },
  { id: 'thai',  name: 'Thái Xanh',   tea: 'thai',  price: { M: 20000, L: 25000 }, color: '#8fcf8a' },
  { id: 'gao',   name: 'Gạo Rang',    tea: 'gao',   price: { M: 22000, L: 27000 }, color: '#e0c08a' },
  { id: 'khoai', name: 'Khoai Môn',   tea: 'den',   price: { M: 22000, L: 27000 }, color: '#b79ad6', teaRatio: 0.8, khoai: { M: 20, L: 28 } },
];

// Định lượng chuẩn 1 ly (trước khi chỉnh đường/đá)
const RECIPE = {
  M: { ml: 500, tea: 150, kem: 25, sua: 10, duong: 25, da: 200, cup: 'ly_m' },
  L: { ml: 700, tea: 220, kem: 35, sua: 15, duong: 35, da: 280, cup: 'ly_l' },
};

const SUGARS = [100, 70, 50, 30, 0];
const ICES = [
  { id: 'bt',    name: 'Đá bình thường', ice: 1,   teaPlus: 0 },
  { id: 'it',    name: 'Ít đá',          ice: 0.5, teaPlus: 0.2 },
  { id: 'khong', name: 'Không đá',       ice: 0,   teaPlus: 0.4 },
];

// Topping: 1 phần / ly. Loại cần nấu: 1 mẻ 500g khô → 22 phần, dùng trong 4 tiếng
const TOPPINGS = [
  { id: 'tcden',   name: 'Trân châu đen',   short: 'TC đen',   price: 5000, cook: { item: 'tcden_kho', dry: 500, yield: 22, min: 40 }, life: 240, color: '#3b2a22' },
  { id: 'tctrang', name: 'Trân châu trắng', short: 'TC trắng', price: 5000, cook: { item: 'tctrang_kho', dry: 500, yield: 22, min: 30 }, life: 240, color: '#e9e4d8' },
  { id: 'tcsoi',   name: 'Trân châu sợi',   short: 'TC sợi',   price: 6000, cook: { item: 'tcsoi_kho', dry: 500, yield: 22, min: 30 }, life: 240, color: '#d8c39a' },
  { id: 'tc3q',    name: 'Trân châu 3Q',    short: '3Q',       price: 7000, ready: { item: 'tc3q', gram: 40 }, color: '#f2ead6' },
  { id: 'thach',   name: 'Thạch dừa',       short: 'Thạch',    price: 5000, ready: { item: 'thach', gram: 40 }, color: '#f7f3e8' },
];

// Nhóm khách. shape = độ đông theo giờ 6h..21h; cups = số ly/ngày mục tiêu (ngày thường, trời nắng)
const SEGMENTS = {
  hs: {
    name: 'Học sinh', emoji: ['🧑‍🎓', '👧', '👦'], cups: 15,
    shape: [2.2,0.6,0.2,0.2,1.0,2.6,0.6,0.3,0.3,0.6,2.6,3.2,0.8,0.4,0.3,0.1],
    group: { 1: .6, 2: .3, 3: .1 },
    drinks: { olong: 8, tt: 20, thai: 30, gao: 10, khoai: 32 },
    sizeL: .25, topProb: .85, top2: .3,
    tops: { tcden: 35, tctrang: 20, tcsoi: 10, tc3q: 15, thach: 20 },
    sugar: { 100: 45, 70: 30, 50: 20, 30: 5, 0: 0 },
    ice: { bt: 75, it: 20, khong: 5 },
    qr: .35, bills: [20000, 50000, 50000, 100000],
    patQ: 7, patW: 10, elastic: 2.0,
    dow: [0.2, 1, 1, 1, 1, 1, 0.6],
  },
  cn: {
    name: 'Công nhân', emoji: ['👷', '👷‍♀️', '🧑‍🔧'], cups: 20,
    shape: [0.8,0.4,0.1,0.1,0.3,2.5,1.5,0.3,0.4,0.4,0.8,3.0,2.0,0.8,1.2,0.6],
    group: { 1: .5, 2: .3, 3: .15, 4: .05 },
    drinks: { olong: 15, tt: 35, thai: 20, gao: 15, khoai: 15 },
    sizeL: .6, topProb: .7, top2: .15,
    tops: { tcden: 50, tctrang: 15, tcsoi: 10, tc3q: 10, thach: 15 },
    sugar: { 100: 40, 70: 35, 50: 20, 30: 5, 0: 0 },
    ice: { bt: 70, it: 25, khong: 5 },
    qr: .45, bills: [20000, 50000, 100000, 100000, 200000, 500000],
    patQ: 6, patW: 9, elastic: 1.5,
    dow: [0.45, 1, 1, 1, 1, 1, 0.9],
  },
  dc: {
    name: 'Dân cư', emoji: ['👩', '👨', '👵', '👨‍👧'], cups: 10,
    shape: [0.4,0.6,0.8,0.8,0.6,0.5,0.4,0.4,0.8,1.0,1.0,0.8,1.0,1.6,1.6,0.6],
    group: { 1: .55, 2: .3, 3: .15 },
    drinks: { olong: 30, tt: 15, thai: 10, gao: 25, khoai: 20 },
    sizeL: .4, topProb: .5, top2: .1,
    tops: { tcden: 20, tctrang: 15, tcsoi: 15, tc3q: 25, thach: 25 },
    sugar: { 100: 15, 70: 30, 50: 35, 30: 15, 0: 5 },
    ice: { bt: 55, it: 35, khong: 10 },
    qr: .5, bills: [50000, 100000, 100000, 200000, 500000],
    patQ: 10, patW: 14, elastic: 0.8,
    dow: [1.3, 1, 1, 1, 1, 1, 1.3],
  },
  app: {
    name: 'Đơn app', emoji: ['🛵'], cups: 7,
    shape: [0,0.1,0.3,0.5,1.0,1.4,0.8,0.6,1.0,1.2,0.8,0.8,1.0,1.2,1.0,0.3],
    group: { 1: .5, 2: .3, 3: .15, 4: .05 },
    drinks: { olong: 22, tt: 20, thai: 18, gao: 20, khoai: 20 },
    sizeL: .5, topProb: .75, top2: .25,
    tops: { tcden: 35, tctrang: 15, tcsoi: 15, tc3q: 20, thach: 15 },
    sugar: { 100: 30, 70: 35, 50: 25, 30: 8, 0: 2 },
    ice: { bt: 65, it: 30, khong: 5 },
    qr: 1, bills: [],
    patQ: 5, patW: 25, elastic: 1.0,
    dow: [1.2, 1, 1, 1, 1, 1, 1.1],
  },
};

const WEATHERS = [
  { id: 'nang', name: 'Nắng', icon: '☀️', p: .45, walk: 1, app: 1 },
  { id: 'nong', name: 'Nắng nóng', icon: '🔥', p: .2, walk: 1.25, app: 1.15 },
  { id: 'mat',  name: 'Mát mẻ', icon: '⛅', p: .15, walk: .9, app: 1 },
  { id: 'mua',  name: 'Mưa', icon: '🌧️', p: .2, walk: .6, app: 1.5 },
];

const DEFAULT_SETTINGS = {
  startMoney: 3000000,        // vốn nguyên liệu
  rentMonth: 3000000,         // mặt bằng
  utilMonth: 800000,          // điện nước ga
  equipment: 12900000,        // xe + dụng cụ mới
  equipMonths: 24,            // khấu hao
  laborMonth: 0,              // tiền công thuê người (0 = tự bán)
  appOn: true,
  appMarkup: 0.35,            // giá trên app cao hơn tại xe
  appFee: 0.25,               // chiết khấu sàn
  appVat: 0.10,               // VAT tính trên phí sàn
  openMin: 6 * 60, closeMin: 21 * 60 + 30,
  teaLifeH: 72,               // hạn dùng trà cốt (giờ) khi cất tủ mát
  topLifeH: 72,               // hạn dùng trân châu đã nấu (giờ)
  iceMelt: 0.4,               // phần đá tan qua đêm trong thùng giữ nhiệt
  secPerMin: 5,               // tốc độ x1: 1 phút trong game = 5 giây thật
  autoFF: true,               // tự tua nhanh khi vắng khách
  patMult: 1.3,               // độ kiên nhẫn của khách (1.6 dễ · 1.3 vừa · 1 sát thực tế)
};

const DOW_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

// ===== Kích thước xe (mm) — dùng cho bản vẽ 2D, mô hình 3D =====
// Mặt trước = phía khách (có kính). Mặt sau = phía người bán (để trống).
const CART = {
  L: 1600, W: 700, H: 2100,
  wheel: 200, clear: 150, cabTop: 880, counter: 900, topT: 20,
  glassTop: 1500, postTop: 1800, signH: 300, post: 40,
  frontStrip: 200,               // dải sát kính để bình trà (khách nhìn thấy)
  zones: [                        // chia theo chiều dài, trái → phải (nhìn từ phía khách)
    { id: 'order', name: 'Order & thu tiền', w: 300, top: 'Mã QR, máy tính tiền, phiếu order', below: 'Ngăn kéo tiền + túi, giấy' },
    { id: 'mix',   name: 'Pha & lắc',        w: 400, top: 'Bình lắc, ca đong, hũ kem béo, sữa đặc', below: 'Nguyên liệu khô: trà, bột, đường' },
    { id: 'ice',   name: 'Thùng đá âm',      w: 250, top: 'Thùng đá âm 230×450, sâu 350', below: 'Can nước sạch 20L' },
    { id: 'top',   name: '6 khay topping',   w: 360, top: '6 khay inox GN 1/6 (176×162), 2 cột × 3 hàng', below: 'Ắc quy 12V 100Ah + inverter' },
    { id: 'seal',  name: 'Dập ly & giao',    w: 290, top: 'Máy dập màng 220×330, chồng ly M/L', below: 'Thùng rác + can nước thải' },
  ],
  pot: { d: 180, h: 340, lit: 6 },  // bình ủ trà thủy tinh có vòi
};
const BOM = [
  ['Xe inox 304: khung, tủ 5 ngăn, mặt bàn, kính cường lực 3 mặt, mái, biển LED, 4 bánh xe Ø200 (2 bánh khóa), ắc quy + đèn', '1600×700×2100', 7000000],
  ['Máy dập màng ly bán tự động', '220×330×560', 2000000],
  ['Thùng đá âm inox giữ nhiệt', '230×450×350', 800000],
  ['6 khay inox GN 1/6 sâu 100 + nắp', '176×162×100', 500000],
  ['4 bình ủ trà thủy tinh 6L có vòi + bình lắc, ca đong, muỗng', 'Ø180 × 340', 1000000],
  ['Bếp ga mini + nồi 5L nấu trân châu + bàn phụ', 'bàn 1000×500×750', 600000],
  ['Dù Ø2,4m, bảng menu chữ A, decal mặt tủ', '', 1000000],
];
