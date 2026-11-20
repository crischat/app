'use strict';
// ================= Tiện ích =================
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => (Math.round(n) || 0).toLocaleString('vi-VN') + 'đ';
const fk = n => (Math.round(n / 100) / 10).toLocaleString('vi-VN') + 'k';
const hhmm = m => { m = Math.floor(m); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const R = Math.random;
const pick = a => a[Math.floor(R() * a.length)];
const pickW = o => { let t = 0; for (const k in o) t += o[k]; let r = R() * t; for (const k in o) { r -= o[k]; if (r <= 0) return k; } return Object.keys(o)[0]; };
const poisson = l => { if (l <= 0) return 0; const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const roundK = n => Math.round(n / 1000) * 1000;
const DR = Object.fromEntries(DRINKS.map(d => [d.id, d]));
const TP = Object.fromEntries(TOPPINGS.map(t => [t.id, t]));
const SAVE = 'trasua_sim_v1';
const DAY0 = 5 * 60; // 5:00 bắt đầu chuẩn bị
const teaLife = () => S.settings.teaLifeH * 60, topLife = () => S.settings.topLifeH * 60;
const lifeTxt = m => m >= 1440 ? (Math.round(m / 144) / 10).toLocaleString('vi-VN') + ' ngày' : Math.round(m / 6) / 10 + ' tiếng';

let S = null, D = null;
const UI = { tab: 'ban', modal: null, toast: null, dirty: true, simResult: null, view: (() => { try { return localStorage.getItem('trasua_view') || '2d'; } catch (e) { return '2d'; } })(), labels3d: true };

// ================= Lưu / tải =================
function newState() {
  const st = {
    v: 1, day: 1, start: new Date().toISOString().slice(0, 10),
    settings: { ...DEFAULT_SETTINGS },
    price: { drinks: Object.fromEntries(DRINKS.map(d => [d.id, { ...d.price }])), tops: Object.fromEntries(TOPPINGS.map(t => [t.id, t.price])) },
    itemPrice: Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.price])),
    stock: Object.fromEntries(Object.keys(ITEMS).map(k => [k, 0])),
    money: DEFAULT_SETTINGS.startMoney, rating: 4.2, phase: 'prep',
    weather: rollWeather(), history: [], prepBuys: 0, snap: null,
  };
  return st;
}
function save() { try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) { } }
function load() {
  try { S = JSON.parse(localStorage.getItem(SAVE)); } catch (e) { S = null; }
  if (!S || S.v !== 1) S = newState();
  S.settings = { ...DEFAULT_SETTINGS, ...S.settings };
  if (S.phase === 'open') { // tải lại giữa ngày → quay về đầu ngày
    if (S.snap) { const snap = JSON.parse(S.snap); S = snap; }
    S.phase = 'prep';
    UI.toast = 'Trang bị tải lại giữa ca — ngày ' + S.day + ' được bắt đầu lại từ đầu.';
  }
}

// ================= Giá, giá vốn =================
const uc = id => S.itemPrice[id] / ITEMS[id].pack;
const itemPrice = it => S.price.drinks[it.drink][it.size] + it.tops.reduce((a, t) => a + S.price.tops[t], 0);
const appPrice = it => roundK(itemPrice(it) * (1 + S.settings.appMarkup));
const dayDate = d => { const x = new Date(S.start + 'T00:00:00'); x.setDate(x.getDate() + d - 1); return x; };
const dateStr = x => x.getDate() + '/' + (x.getMonth() + 1);
function rollWeather() { return pickW(Object.fromEntries(WEATHERS.map(w => [w.id, w.p]))); }
const W = id => WEATHERS.find(w => w.id === id);
function teaNeed(drink, size) { return RECIPE[size].tea * (DR[drink].teaRatio || 1); }
function fixedPerDay(st = S.settings) {
  return { rent: st.rentMonth / 30, util: st.utilMonth / 30, dep: st.equipment / (st.equipMonths * 30), labor: st.laborMonth / 30 };
}
// Giá vốn chuẩn 1 ly (đúng định lượng, chưa topping)
function cupCost(drink, size, sugar = 70, ice = 'bt') {
  const r = RECIPE[size], d = DR[drink], tea = TEAS[d.tea], ic = ICES.find(i => i.id === ice);
  const teaMl = teaNeed(drink, size) * (1 + ic.teaPlus);
  const teaCost = teaMl * (tea.gram * uc(tea.item)) / POT.yield;
  const parts = {
    tra: teaCost, kem: r.kem * uc('kem_beo'), sua: r.sua * uc('sua_dac'), duong: r.duong * sugar / 100 * uc('duong'),
    da: r.da * ic.ice * uc('da'), ly: uc(r.cup), khoai: d.khoai ? d.khoai[size] * uc('bot_khoai') : 0,
  };
  parts.total = Object.values(parts).reduce((a, b) => a + b, 0);
  return parts;
}
function topCost(id) {
  const t = TP[id];
  if (t.cook) return t.cook.dry * uc(t.cook.item) / t.cook.yield;
  return t.ready.gram * uc(t.ready.item);
}

// ================= Sinh khách =================
function demandMult(segId, ctx) {
  const seg = SEGMENTS[segId], w = W(ctx.weather);
  let m = seg.dow[ctx.dow] * (segId === 'app' ? w.app : w.walk);
  m *= Math.min(1, 0.7 + 0.034 * (ctx.day - 1));         // quán mới khai trương: khách quen dần
  m *= 0.6 + 0.1 * ctx.rating;                            // uy tín
  const pIdx = DRINKS.reduce((a, d) => a + (ctx.price.drinks[d.id].M / d.price.M + ctx.price.drinks[d.id].L / d.price.L) / 2, 0) / DRINKS.length;
  m *= Math.pow(pIdx, -seg.elastic);                       // độ nhạy giá
  if (segId === 'cn') { const dm = ctx.date.getDate(); if (dm >= 5 && dm <= 10) m *= 1.2; else if (dm >= 25) m *= 0.85; }
  return m;
}
function makeItem(seg, ctx) {
  const dw = {}; for (const d of DRINKS) dw[d.id] = seg.drinks[d.id] * Math.pow(ctx.price.drinks[d.id].M / d.price.M, -2);
  const drink = pickW(dw), size = R() < seg.sizeL ? 'L' : 'M';
  const tIdx = TOPPINGS.reduce((a, t) => a + ctx.price.tops[t.id] / t.price, 0) / TOPPINGS.length;
  const tops = [];
  if (R() < seg.topProb * Math.pow(tIdx, -1)) {
    tops.push(pickW(seg.tops));
    if (R() < seg.top2) { const o = { ...seg.tops }; delete o[tops[0]]; tops.push(pickW(o)); }
  }
  return { drink, size, sugar: +pickW(seg.sugar), ice: pickW(seg.ice), tops: tops.sort(), done: false, cost: 0 };
}
let CID = 1;
function genCustomers(ctx, appOn) {
  const out = [];
  for (const segId in SEGMENTS) {
    if (segId === 'app' && !appOn) continue;
    const seg = SEGMENTS[segId], mult = demandMult(segId, ctx);
    const avgG = Object.entries(seg.group).reduce((a, [k, p]) => a + k * p, 0);
    const sum = seg.shape.reduce((a, b) => a + b, 0);
    seg.shape.forEach((s, i) => {
      const h = 6 + i, span = h === 21 ? 30 : 60;
      const n = poisson(s / sum * seg.cups / avgG * mult * span / 60);
      for (let k = 0; k < n; k++) {
        const g = +pickW(seg.group), items = [];
        for (let j = 0; j < g; j++) items.push(makeItem(seg, ctx));
        out.push({ id: CID++, seg: segId, t: h * 60 + R() * span, items, emoji: pick(seg.emoji), pay: R() < seg.qr ? 'qr' : 'cash', mistakes: 0, swaps: 0, short: 0 });
      }
    });
  }
  return out.sort((a, b) => a.t - b.t);
}
function ctxFor(day) {
  const date = dayDate(day);
  return { day, date, dow: date.getDay(), weather: S.weather, rating: S.rating, price: S.price };
}

// ================= Ngày bán =================
function newLedger() {
  return {
    cash: 0, qr: 0, appGross: 0, appPayout: 0, appFee: 0, cogs: 0, waste: 0, wasteBy: {}, loss: 0, lossBy: {},
    cups: 0, by: Object.fromEntries(DRINKS.map(d => [d.id, { M: 0, L: 0 }])), tops: Object.fromEntries(TOPPINGS.map(t => [t.id, 0])),
    seg: Object.fromEntries(Object.keys(SEGMENTS).map(k => [k, { cups: 0, groups: 0, lostGroups: 0, lostCups: 0 }])),
    hours: Array(17).fill(0), waits: [], mistakes: 0, scores: [], buys: S.prepBuys, rev: 0,
  };
}
function openDay() {
  S.snap = null; S.snap = JSON.stringify(S);
  S.phase = 'open';
  D = {
    t: DAY0, running: true, speed: 1, sched: genCustomers(ctxFor(S.day), S.settings.appOn), cust: [],
    pots: Object.fromEntries(Object.keys(TEAS).map(k => [k, (S.carry && S.carry.pots[k]) || []])), tb: Object.fromEntries(TOPPINGS.filter(t => t.cook).map(t => [t.id, (S.carry && S.carry.tb[t.id]) || []])),
    deliveries: [], cup: null, sel: null, log: [], L: newLedger(), arrivalsClosed: false,
  };
  log('🌅 5:00 — dọn xe, ủ trà, nấu trân châu. 6:00 khách bắt đầu tới.');
  const left = Object.values(D.pots).flat().length + Object.values(D.tb).flat().length;
  if (left) log('🧊 Lấy từ tủ mát: ' + left + ' bình trà / mẻ trân châu còn hạn từ hôm trước', 'ok');
  S.carry = null;
  save(); dirty();
}
function log(msg, cls = '') { D.log.unshift({ t: D.t, msg, cls }); if (D.log.length > 60) D.log.pop(); }
function addWaste(kind, v) { D.L.waste += v; D.L.wasteBy[kind] = (D.L.wasteBy[kind] || 0) + v; }
function addLoss(kind, v) { D.L.loss += v; D.L.lossBy[kind] = (D.L.lossBy[kind] || 0) + v; }
const potMl = tea => D.pots[tea].filter(b => b.ready).reduce((a, b) => a + b.ml, 0);
const topReady = id => { const t = TP[id]; return t.cook ? D.tb[id].filter(b => b.ready).reduce((a, b) => a + b.n, 0) : Math.floor(S.stock[t.ready.item] / t.ready.gram); };

function takeTea(tea, ml) { // lấy trà từ bình sắp hết hạn trước
  let need = ml, cost = 0;
  const bs = D.pots[tea].filter(b => b.ready).sort((a, b) => a.exp - b.exp);
  for (const b of bs) { const u = Math.min(b.ml, need); b.ml -= u; need -= u; cost += u * b.cpm; if (need <= 0) break; }
  D.pots[tea] = D.pots[tea].filter(b => !b.ready || b.ml > 0.5);
  return cost;
}
function takeTop(id) {
  const t = TP[id];
  if (t.cook) {
    const b = D.tb[id].filter(b => b.ready).sort((a, b) => a.exp - b.exp)[0];
    b.n--; const c = b.cpp; D.tb[id] = D.tb[id].filter(x => !x.ready || x.n > 0); return c;
  }
  S.stock[t.ready.item] -= t.ready.gram; return t.ready.gram * uc(t.ready.item);
}
function use(item, q) { S.stock[item] -= q; return q * uc(item); }

// ---- vòng thời gian ----
function step() {
  const t = D.t;
  for (const dl of D.deliveries.filter(x => x.t <= t)) { S.stock[dl.item] += dl.qty; log('📦 Hàng mua gấp đã tới: ' + ITEMS[dl.item].name); dirty(); }
  D.deliveries = D.deliveries.filter(x => x.t > t);
  while (D.sched.length && D.sched[0].t <= t) {
    const c = D.sched.shift(), seg = SEGMENTS[c.seg];
    c.pStart = c.t;
    if (c.seg === 'app') { c.state = 'new'; c.deadline = c.t + seg.patQ * S.settings.patMult; log('🛵 Đơn app mới (' + c.items.length + ' ly) — bấm Nhận đơn', 'app'); }
    else {
      const crowd = D.cust.filter(x => x.seg !== 'app' && (x.state === 'wait' || x.state === 'order')).length;
      c.state = 'wait'; c.deadline = c.t + seg.patQ * S.settings.patMult * (crowd >= 4 ? 0.8 : 1);
      log(c.emoji + ' ' + seg.name + ' tới xe (' + c.items.length + ' ly)');
    }
    D.cust.push(c); dirty();
  }
  for (const tea in D.pots) for (const b of D.pots[tea]) {
    if (!b.ready && b.readyAt <= t) { b.ready = true; log('🫖 Bình ' + TEAS[tea].name + ' đã ủ xong (' + Math.round(b.ml) + 'ml)', 'ok'); dirty(); }
    if (b.ready && b.exp <= t) { addWaste('Trà quá hạn', b.ml * b.cpm); log('🗑️ Đổ ' + Math.round(b.ml) + 'ml trà ' + TEAS[tea].name + ' quá hạn', 'bad'); b.ml = 0; b.dead = true; dirty(); }
  }
  for (const tea in D.pots) D.pots[tea] = D.pots[tea].filter(b => !b.dead);
  for (const id in D.tb) for (const b of D.tb[id]) {
    if (!b.ready && b.readyAt <= t) { b.ready = true; log('🍡 ' + TP[id].name + ' đã nấu xong (' + b.n + ' phần)', 'ok'); dirty(); }
    if (b.ready && b.exp <= t) { addWaste('Topping quá hạn', b.n * b.cpp); log('🗑️ Bỏ ' + b.n + ' phần ' + TP[id].name + ' quá hạn (bị cứng)', 'bad'); b.dead = true; dirty(); }
  }
  for (const id in D.tb) D.tb[id] = D.tb[id].filter(b => !b.dead);
  for (const c of D.cust) {
    if (c.state === 'wait' && t > c.deadline) leave(c, 'đợi lâu quá nên bỏ đi');
    else if (c.state === 'order' && c.seg !== 'app' && t > c.deadline) leave(c, 'chờ pha lâu quá, hủy không lấy nữa');
    else if (c.state === 'new' && t > c.deadline) leave(c, 'đơn app tự hủy vì quán không nhận kịp');
    else if (c.state === 'order' && c.seg === 'app') {
      if (!c.driver && t >= c.driverAt) { c.driver = true; log('🛵 Tài xế tới lấy đơn #' + c.id, 'app'); dirty(); }
      if (t > c.deadline) leave(c, 'khách hủy đơn app vì quá lâu');
    }
  }
  if (!D.arrivalsClosed && t >= S.settings.closeMin) { D.arrivalsClosed = true; log('🌙 21:30 — hết giờ nhận khách. Phục vụ nốt rồi bấm "Đóng ca".', 'warn'); dirty(); }
  if (t >= S.settings.closeMin + 45) closeDay(true);
}
function leave(c, why) {
  c.state = 'left';
  const made = c.items.filter(i => i.done).reduce((a, i) => a + i.cost, 0);
  if (made) addWaste('Ly đã pha nhưng khách bỏ', made);
  const sg = D.L.seg[c.seg]; sg.lostGroups++; sg.lostCups += c.items.length;
  rate(1.5);
  log(c.emoji + ' Khách ' + SEGMENTS[c.seg].name.toLowerCase() + ' ' + why + ' (mất ' + c.items.length + ' ly)', 'bad');
  if (D.sel === c.id) D.sel = null;
  if (UI.modal && UI.modal.id === c.id) UI.modal = null;
  D.cust = D.cust.filter(x => x !== c); dirty();
}
function rate(score) { S.rating = clamp(S.rating * 0.96 + score * 0.04, 1, 5); D.L.scores.push(score); }

// ================= Hành động =================
const A = {};
A.tab = v => { UI.tab = v; dirty(); };
A.speed = v => { D.speed = +v; D.running = true; dirty(); };
A.pause = () => { D.running = !D.running; dirty(); };
A.buy = item => {
  const it = ITEMS[item], price = S.itemPrice[item];
  if (S.phase === 'open') {
    const cost = Math.round(price * 1.15);
    if (S.money < cost) return toast('Không đủ tiền');
    S.money -= cost; D.L.buys += cost;
    D.deliveries.push({ t: D.t + 20, item, qty: it.pack });
    log('🛒 Mua gấp ' + it.label + ' ' + it.name + ' (' + fmt(cost) + ', +15%), 20 phút nữa tới');
  } else {
    if (S.money < price) return toast('Không đủ tiền');
    S.money -= price; S.prepBuys += price; S.stock[item] += it.pack;
  }
  dirty();
};
A.buySuggest = () => {
  const sug = suggest(); let spent = 0;
  for (const [item, packs] of Object.entries(sug.packs)) for (let i = 0; i < packs; i++) {
    if (S.money < S.itemPrice[item]) break;
    S.money -= S.itemPrice[item]; S.prepBuys += S.itemPrice[item]; S.stock[item] += ITEMS[item].pack; spent += S.itemPrice[item];
  }
  toast(spent ? 'Đã mua ' + fmt(spent) + ' hàng theo đề xuất' : 'Kho đã đủ cho ngày mai'); dirty();
};
A.open = () => openDay();
A.sel = id => { D.sel = +id; dirty(); };
A.take = id => {
  const c = D.cust.find(x => x.id === +id); if (!c) return;
  c.state = 'order'; c.taken = D.t; c.deadline = D.t + (SEGMENTS[c.seg].patW + 2 * (c.items.length - 1)) * S.settings.patMult; D.sel = c.id; dirty();
};
A.appAccept = id => {
  const c = D.cust.find(x => x.id === +id); if (!c) return;
  c.state = 'order'; c.taken = D.t; c.driverAt = D.t + 8 + R() * 8; c.deadline = c.t + 35; D.sel = c.id;
  log('✅ Nhận đơn app #' + c.id + ', tài xế tới khoảng ' + hhmm(c.driverAt), 'app'); dirty();
};
A.appReject = id => { const c = D.cust.find(x => x.id === +id); if (c) leave(c, 'đơn app bị quán từ chối'); };
A.out = v => { // báo hết món
  const [id, idx] = v.split(':').map(Number); const c = D.cust.find(x => x.id === id); if (!c) return;
  const it = c.items[idx];
  if (R() < 0.6) {
    const seg = SEGMENTS[c.seg]; let alt = null;
    for (let k = 0; k < 20 && !alt; k++) { const x = makeItem(seg, ctxFor(S.day)); if (canMake(x) && (x.drink !== it.drink || x.tops.join() !== it.tops.join())) alt = x; }
    if (alt) { c.items[idx] = alt; c.swaps++; log('🔁 Khách đổi sang ' + itemText(alt), 'warn'); toast('Khách: "Vậy cho mình ' + itemText(alt) + ' nha"'); dirty(); return; }
  }
  c.items.splice(idx, 1);
  D.L.seg[c.seg].lostCups++;
  log('😕 Khách bỏ 1 ly vì hết món', 'bad');
  if (!c.items.length) { c.items.push({ done: true, cost: 0 }); leave(c, 'không mua nữa vì hết món'); return; }
  checkReady(c); dirty();
};
function canMake(it) {
  const d = DR[it.drink];
  if (potMl(d.tea) < teaNeed(it.drink, it.size) * 1.4) return false;
  return it.tops.every(t => topReady(t) > 0);
}
// ---- pha chế ----
A.cup = size => {
  if (D.cup) return toast('Đang có 1 ly trên bàn — giao hoặc bỏ ly trước');
  const r = RECIPE[size]; if (S.stock[r.cup] < 1) return toast('Hết ly size ' + size + '! Mua gấp trong tab Kho');
  D.cup = { size, cost: use(r.cup, 1), drink: null, sugar: null, ice: null, tops: [], sealed: false }; dirty();
};
A.pour = drink => {
  const c = D.cup; if (!c) return toast('Lấy ly M hoặc L trước');
  if (c.sealed) return toast('Ly đã dập màng');
  if (c.drink) return toast('Ly này đã có trà ' + DR[c.drink].name);
  const d = DR[drink], r = RECIPE[c.size], need = teaNeed(drink, c.size);
  if (potMl(d.tea) < need) return toast('Bình ' + TEAS[d.tea].name + ' không đủ trà — ủ bình mới ở Bếp sau');
  if (S.stock.kem_beo < r.kem || S.stock.sua_dac < r.sua) return toast('Hết bột kem béo / sữa đặc');
  if (d.khoai && S.stock.bot_khoai < d.khoai[c.size]) return toast('Hết bột khoai môn');
  c.cost += takeTea(d.tea, need) + use('kem_beo', r.kem) + use('sua_dac', r.sua) + (d.khoai ? use('bot_khoai', d.khoai[c.size]) : 0);
  c.drink = drink; dirty();
};
A.sugar = v => {
  const c = D.cup; if (!c) return toast('Chưa có ly');
  if (c.sealed) return toast('Ly đã dập màng');
  if (c.sugar !== null) return toast('Đã cho đường rồi, không rút ra được');
  const g = RECIPE[c.size].duong * v / 100; if (S.stock.duong < g) return toast('Hết đường');
  c.cost += use('duong', g); c.sugar = +v; dirty();
};
A.ice = v => {
  const c = D.cup; if (!c) return toast('Chưa có ly');
  if (!c.drink) return toast('Rót trà sữa trước rồi mới cho đá');
  if (c.sealed) return toast('Ly đã dập màng');
  if (c.ice) return toast('Đã cho đá rồi');
  const ic = ICES.find(i => i.id === v), r = RECIPE[c.size], tea = DR[c.drink].tea;
  const extra = teaNeed(c.drink, c.size) * ic.teaPlus, g = r.da * ic.ice;
  if (S.stock.da < g) return toast('Hết đá! Mua gấp bao đá');
  if (extra && potMl(tea) < extra) return toast('Không đủ trà để châm thêm (ít/không đá phải châm thêm trà)');
  c.cost += use('da', g) + (extra ? takeTea(tea, extra) : 0); c.ice = v; dirty();
};
A.top = id => {
  const c = D.cup; if (!c) return toast('Chưa có ly');
  if (c.sealed) return toast('Ly đã dập màng');
  if (c.tops.includes(id)) return toast('Đã thêm ' + TP[id].name);
  if (topReady(id) < 1) return toast(TP[id].cook ? TP[id].name + ' chưa có — nấu mẻ mới ở Bếp sau' : 'Hết ' + TP[id].name);
  c.cost += takeTop(id); c.tops.push(id); c.tops.sort(); dirty();
};
A.seal = () => {
  const c = D.cup; if (!c) return toast('Chưa có ly');
  if (!c.drink || c.sugar === null || !c.ice) return toast('Cần đủ: trà sữa, đường, đá rồi mới dập màng');
  c.sealed = true; dirty();
};
A.discard = () => { if (!D.cup) return; addWaste('Ly pha hỏng / sai', D.cup.cost); log('🗑️ Bỏ 1 ly (' + fmt(D.cup.cost) + ')', 'bad'); D.cup = null; dirty(); };
const same = (c, it) => !it.done && c.drink === it.drink && c.size === it.size && c.sugar === it.sugar && c.ice === it.ice && c.tops.join() === it.tops.join();
A.serve = () => {
  const c = D.cup; if (!c) return toast('Chưa có ly');
  if (!c.sealed) return toast('Dập màng trước khi giao');
  const order = D.cust.filter(x => x.state === 'order');
  let cust = order.find(x => x.id === D.sel && x.items.some(i => same(c, i))) || order.find(x => x.items.some(i => same(c, i)));
  if (!cust) {
    const sel = D.cust.find(x => x.id === D.sel);
    if (sel && sel.state === 'order') { sel.mistakes++; D.L.mistakes++; sel.deadline -= 1; toast(sel.emoji + ' "Ủa, mình đâu có gọi ly này!" — kiểm tra lại phiếu'); }
    else toast('Ly này không khớp đơn nào đang chờ');
    return dirty();
  }
  const it = cust.items.find(i => same(c, i)); it.done = true; it.cost = c.cost; D.cup = null; D.sel = cust.id;
  checkReady(cust); dirty();
};
function checkReady(c) {
  if (c.items.every(i => i.done)) {
    if (c.seg === 'app') { c.ready = true; log('📦 Đơn app #' + c.id + ' đã xong, chờ tài xế', 'app'); }
    else { c.state = 'pay'; openPay(c); }
  }
}
// ---- thu tiền ----
function openPay(c) {
  const total = c.items.reduce((a, i) => a + itemPrice(i), 0);
  let given = total;
  if (c.pay === 'cash' && R() > 0.25) {
    const cand = SEGMENTS[c.seg].bills.filter(b => b > total);
    given = cand.length ? pick(cand) : Math.ceil((total + 1) / 50000) * 50000;
  }
  UI.modal = { type: 'pay', id: c.id, total, given, change: 0, qrOk: R() > 0.05 };
  D.sel = c.id;
}
A.pay = id => { const c = D.cust.find(x => x.id === +id); if (c) { openPay(c); dirty(); } };
A.chg = v => { UI.modal.change += +v; dirty(); };
A.chgClear = () => { UI.modal.change = 0; dirty(); };
A.chgGive = () => {
  const m = UI.modal, c = D.cust.find(x => x.id === m.id); if (!c) { UI.modal = null; return dirty(); }
  const need = m.given - m.total;
  if (m.change < need) { c.short++; toast(c.emoji + ' "Thối thiếu ' + fmt(need - m.change) + ' rồi bạn ơi!"'); return; }
  if (m.change > need) { addLoss('Thối dư tiền', m.change - need); log('💸 Thối dư ' + fmt(m.change - need), 'bad'); }
  finishPay(c, 'cash');
};
A.qrOk = () => {
  const m = UI.modal, c = D.cust.find(x => x.id === m.id); if (!c) { UI.modal = null; return dirty(); }
  if (!m.qrOk) { addLoss('Xác nhận CK khi tiền chưa về', m.total); log('⚠️ Tiền chuyển khoản chưa về mà đã cho khách đi — mất ' + fmt(m.total), 'bad'); finishPay(c, 'qrLost'); return; }
  finishPay(c, 'qr');
};
A.qrCheck = () => {
  const m = UI.modal; const c = D.cust.find(x => x.id === m.id);
  if (m.qrOk) { c.short++; toast(c.emoji + ' "Tiền về rồi mà bạn, xem lại đi!"'); }
  else { m.qrOk = true; toast(c.emoji + ' "À mình bấm nhầm, chuyển lại rồi nè"'); }
  dirty();
};
A.closeModal = () => { UI.modal = null; dirty(); };
function finishPay(c, how) {
  const total = UI.modal ? UI.modal.total : c.items.reduce((a, i) => a + itemPrice(i), 0);
  if (how === 'cash') { S.money += total; D.L.cash += total; }
  if (how === 'qr') { S.money += total; D.L.qr += total; }
  D.L.rev += total; record(c);
  UI.modal = null; dirty();
}
function record(c) {
  const L = D.L, wait = D.t - c.t;
  for (const i of c.items) {
    L.cogs += i.cost; L.cups++; L.by[i.drink][i.size]++; i.tops.forEach(t => L.tops[t]++);
    L.hours[clamp(Math.floor(c.t / 60) - 5, 0, 16)]++;
  }
  L.seg[c.seg].cups += c.items.length; L.seg[c.seg].groups++; L.waits.push(wait);
  const score = clamp(5 - Math.max(0, wait - (c.seg === 'app' ? 15 : 6)) * 0.25 - c.mistakes * 0.5 - c.swaps * 0.3 - c.short * 0.5 - (c.driverWait || 0), 1, 5);
  rate(score);
  log((score >= 4.5 ? '😊' : score >= 3 ? '🙂' : '😒') + ' Xong ' + c.items.length + ' ly cho ' + SEGMENTS[c.seg].name.toLowerCase() + ' — chờ ' + Math.round(wait) + ' phút', 'ok');
  c.state = 'done'; if (D.sel === c.id) D.sel = null;
  D.cust = D.cust.filter(x => x !== c);
}
A.handoff = id => {
  const c = D.cust.find(x => x.id === +id); if (!c) return;
  if (!c.ready) return toast('Đơn chưa pha xong');
  if (!c.driver) return toast('Tài xế chưa tới');
  const gross = c.items.reduce((a, i) => a + appPrice(i), 0), fee = gross * S.settings.appFee * (1 + S.settings.appVat);
  c.driverWait = Math.max(0, D.t - c.driverAt - 10) * 0.1;
  S.money += gross - fee; D.L.appGross += gross; D.L.appFee += fee; D.L.appPayout += gross - fee; D.L.rev += gross - fee;
  record(c); dirty();
};
// ---- bếp sau ----
A.brew = v => {
  const [tea, half] = v.split(':'), T = TEAS[tea], f = half === '1' ? 0.5 : 1, g = T.gram * f;
  if (D.pots[tea].length >= 4) return toast('Tối đa 4 bình mỗi vị');
  if (S.stock[T.item] < g) return toast('Hết ' + ITEMS[T.item].name);
  const cost = use(T.item, g), ml = POT.yield * f;
  D.pots[tea].push({ ml, cpm: cost / ml, readyAt: D.t + POT.brewMin, exp: D.t + POT.brewMin + teaLife(), ready: false });
  log('🫖 Bắt đầu ủ ' + (f < 1 ? 'nửa bình ' : 'bình ') + T.name + ' (' + g + 'g trà + ' + POT.water * f / 1000 + 'L nước), xong lúc ' + hhmm(D.t + POT.brewMin)); dirty();
};
A.cook = v => {
  const [id, half] = v.split(':'), t = TP[id], f = half === '1' ? 0.5 : 1, ck = t.cook, dry = ck.dry * f;
  if (Object.values(D.tb).flat().some(b => !b.ready)) return toast('Bếp đang nấu 1 nồi rồi (chỉ có 1 bếp ga)');
  if (S.stock[ck.item] < dry) return toast('Hết ' + ITEMS[ck.item].name);
  const cost = use(ck.item, dry), n = Math.round(ck.yield * f);
  D.tb[id].push({ n, cpp: cost / n, readyAt: D.t + ck.min, exp: D.t + ck.min + topLife(), ready: false });
  log('🍳 Nấu ' + dry + 'g ' + t.name + ' → ' + n + ' phần, xong lúc ' + hhmm(D.t + ck.min)); dirty();
};
// ---- đóng ca ----
A.close = () => {
  const pending = D.cust.length;
  if (D.t < S.settings.closeMin && !confirm('Chưa tới 21:30. Đóng ca sớm?')) return;
  if (pending && !confirm(pending + ' khách/đơn chưa xong sẽ bị mất. Vẫn đóng ca?')) return;
  closeDay(false);
};
function closeDay(auto) {
  for (const c of [...D.cust]) leave(c, 'không được phục vụ vì quán đóng cửa');
  if (D.cup) A.discard();
  // Trà & topping còn hạn: cất tủ mát dùng tiếp hôm sau (giờ quy về ngày mới)
  const shift = b => ({ ...b, ready: true, readyAt: b.readyAt - 1440, exp: b.exp - 1440 });
  S.carry = { pots: {}, tb: {} };
  for (const tea in D.pots) S.carry.pots[tea] = D.pots[tea].map(shift).filter(b => b.exp > DAY0 && b.ml > 1);
  for (const id in D.tb) S.carry.tb[id] = D.tb[id].map(shift).filter(b => b.exp > DAY0 && b.n > 0);
  for (const tea in D.pots) for (const b of D.pots[tea]) if (b.exp - 1440 <= DAY0) addWaste('Trà quá hạn', b.ml * b.cpm);
  for (const id in D.tb) for (const b of D.tb[id]) if (b.exp - 1440 <= DAY0) addWaste('Topping quá hạn', b.n * b.cpp);
  if (S.stock.da > 0) { const melt = S.stock.da * S.settings.iceMelt; addWaste('Đá tan qua đêm', melt * uc('da')); S.stock.da -= melt; }
  for (const dl of D.deliveries) S.stock[dl.item] += dl.qty;
  const L = D.L, fx = fixedPerDay(), fixed = fx.rent + fx.util + fx.dep + fx.labor;
  S.money -= fx.rent + fx.util + fx.labor; // khấu hao không trừ tiền mặt
  const date = dayDate(S.day);
  const rep = {
    day: S.day, date: dateStr(date), dow: date.getDay(), weather: S.weather, ...L,
    fixed: fx, fixedTotal: fixed, profit: L.rev - L.cogs - L.waste - L.loss - fixed,
    gross: L.cash + L.qr + L.appGross, rating: S.rating, money: S.money, stockValue: stockValue(),
    lostCups: Object.values(L.seg).reduce((a, s) => a + s.lostCups, 0),
    avgWait: L.waits.length ? L.waits.reduce((a, b) => a + b, 0) / L.waits.length : 0,
  };
  delete rep.scores; delete rep.waits;
  S.history.push(rep);
  S.day++; S.phase = 'prep'; S.weather = rollWeather(); S.prepBuys = 0; S.snap = null;
  D = null; UI.modal = null; UI.tab = 'baocao';
  save();
  toast(auto ? 'Hết giờ — tự đóng ca.' : 'Đã đóng ca, xem báo cáo ngày.');
  dirty();
}
const stockValue = () => Object.keys(ITEMS).reduce((a, k) => a + S.stock[k] * uc(k), 0);

// ================= Đề xuất nhập hàng =================
function expectedCups(day = S.day) {
  const ctx = ctxFor(day); let n = 0;
  for (const s in SEGMENTS) { if (s === 'app' && !S.settings.appOn) continue; n += SEGMENTS[s].cups * demandMult(s, ctx); }
  return n;
}
function suggest() {
  const cups = Math.ceil(expectedCups() * 1.15);
  const ctx = ctxFor(S.day), need = Object.fromEntries(Object.keys(ITEMS).map(k => [k, 0]));
  const teaMl = Object.fromEntries(Object.keys(TEAS).map(k => [k, 0])), topN = {};
  const segW = {}; for (const s in SEGMENTS) if (s !== 'app' || S.settings.appOn) segW[s] = SEGMENTS[s].cups;
  const N = 400;
  for (let i = 0; i < N; i++) {
    const it = makeItem(SEGMENTS[pickW(segW)], ctx), r = RECIPE[it.size], d = DR[it.drink], ic = ICES.find(x => x.id === it.ice);
    teaMl[d.tea] += teaNeed(it.drink, it.size) * (1 + ic.teaPlus) * cups / N;
    need.kem_beo += r.kem * cups / N; need.sua_dac += r.sua * cups / N; need.duong += r.duong * it.sugar / 100 * cups / N;
    need.da += r.da * ic.ice * cups / N; need[r.cup] += cups / N; if (d.khoai) need.bot_khoai += d.khoai[it.size] * cups / N;
    it.tops.forEach(t => topN[t] = (topN[t] || 0) + cups / N);
  }
  const minB = life => life >= 1000 ? 1 : 3; // hạn ngắn thì phải ủ/nấu nhiều lần trong ngày
  for (const tea in TEAS) { const have = ((S.carry && S.carry.pots[tea]) || []).reduce((a, b) => a + b.ml, 0), ml = teaMl[tea] - have; if (ml > 0) need[TEAS[tea].item] += Math.max(Math.ceil(ml / (POT.yield / 2)), minB(teaLife())) * TEAS[tea].gram / 2; }
  for (const t of TOPPINGS) {
    const n = topN[t.id] || 0; if (!n) continue;
    if (t.cook) { const have = ((S.carry && S.carry.tb[t.id]) || []).reduce((a, b) => a + b.n, 0), m = n - have; if (m > 0) need[t.cook.item] += Math.max(Math.ceil(m / (t.cook.yield / 2)), minB(topLife())) * t.cook.dry / 2; }
    else need[t.ready.item] += n * t.ready.gram;
  }
  const packs = {}; let cost = 0;
  for (const k in need) {
    const lack = need[k] - S.stock[k];
    if (lack > 0) { packs[k] = Math.ceil(lack / ITEMS[k].pack); cost += packs[k] * S.itemPrice[k]; }
  }
  return { cups, need, packs, cost };
}

// ================= Mô phỏng nhanh N ngày =================
function simulate(days, svcMin, accuracy, appOn) {
  const st = S, rows = []; let rating = st.rating;
  const pots = Object.fromEntries(Object.keys(TEAS).map(k => [k, { ml: 0, exp: 0, cpm: 0 }]));
  const tb = Object.fromEntries(TOPPINGS.filter(t => t.cook).map(t => [t.id, { n: 0, exp: 0, cpp: 0 }]));
  let iceLeft = 0;
  for (let d = 1; d <= days; d++) {
    const off = (d - 1) * 1440; // thời gian tuyệt đối để trà/topping giữ qua ngày
    const date = dayDate(st.day + d - 1), weather = rollWeather();
    const ctx = { day: st.history.length + d, date, dow: date.getDay(), weather, rating, price: st.price };
    const cs = genCustomers(ctx, appOn);
    const L = { rev: 0, gross: 0, cogs: 0, waste: 0, fee: 0, cups: 0, lost: 0, ice: 0 };
    let free = 6 * 60, sc = 0, scn = 0;
    for (const c of cs) {
      const seg = SEGMENTS[c.seg];
      const start = Math.max(c.t, free), abs = off + start;
      if (c.seg !== 'app' && start - c.t > seg.patQ + 2) { L.lost += c.items.length; rating = rating * .96 + 1.5 * .04; continue; }
      free = start + c.items.length * svcMin * (R() > accuracy ? 2 : 1);
      for (const it of c.items) {
        const d = DR[it.drink], r = RECIPE[it.size], ic = ICES.find(x => x.id === it.ice), T = TEAS[d.tea];
        const ml = teaNeed(it.drink, it.size) * (1 + ic.teaPlus), p = pots[d.tea];
        if (p.ml < ml || p.exp < abs) { if (p.exp < abs) L.waste += p.ml * p.cpm; const cost = T.gram / 2 * uc(T.item); const keep = p.exp >= abs ? p.ml : 0; p.cpm = (cost + keep * p.cpm) / (POT.yield / 2 + keep); p.ml = POT.yield / 2 + keep; p.exp = abs + teaLife(); }
        let cost = ml * p.cpm; p.ml -= ml;
        cost += r.kem * uc('kem_beo') + r.sua * uc('sua_dac') + r.duong * it.sugar / 100 * uc('duong') + r.da * ic.ice * uc('da') + uc(r.cup) + (d.khoai ? d.khoai[it.size] * uc('bot_khoai') : 0);
        L.ice += r.da * ic.ice;
        for (const tid of it.tops) {
          const t = TP[tid];
          if (t.cook) {
            const b = tb[tid];
            if (b.n < 1 || b.exp < abs) { if (b.exp < abs) L.waste += b.n * b.cpp; const n = t.cook.yield / 2; b.cpp = t.cook.dry / 2 * uc(t.cook.item) / n; b.n = n; b.exp = abs + topLife(); }
            b.n--; cost += b.cpp;
          } else cost += topCost(tid);
        }
        if (R() > accuracy) L.waste += cost; // pha sai làm lại
        L.cogs += cost; L.cups++;
        const price = itemPrice(it);
        if (c.seg === 'app') { const g = appPrice(it), f = g * st.settings.appFee * (1 + st.settings.appVat); L.gross += g; L.fee += f; L.rev += g - f; }
        else { L.gross += price; L.rev += price; }
      }
      const wait = free - c.t, s = clamp(5 - Math.max(0, wait - 6) * 0.25, 1, 5); rating = rating * .96 + s * .04;
    }
    const endAbs = off + 1440 + DAY0;
    for (const k in pots) if (pots[k].exp < endAbs) { L.waste += pots[k].ml * pots[k].cpm; pots[k].ml = 0; }
    for (const k in tb) if (tb[k].exp < endAbs) { L.waste += tb[k].n * tb[k].cpp; tb[k].n = 0; }
    const needIce = Math.max(0, L.ice - iceLeft), bags = Math.ceil(needIce / ITEMS.da.pack);
    iceLeft = iceLeft + bags * ITEMS.da.pack - L.ice; const melt = iceLeft * st.settings.iceMelt; L.waste += melt * uc('da'); iceLeft -= melt;
    const fx = fixedPerDay(), fixed = fx.rent + fx.util + fx.dep + fx.labor;
    rows.push({ d, date: dateStr(date), dow: date.getDay(), weather, ...L, fixed, profit: L.rev - L.cogs - L.waste - fixed, rating });
  }
  return rows;
}

// ================= Giao diện =================
function dirty() { UI.dirty = true; }
let toastTimer = null;
function toast(msg) { UI.toast = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => { UI.toast = null; dirty(); }, 3200); dirty(); }
const sugarTxt = s => s === 100 ? '100% đường' : s === 0 ? 'không đường' : s + '% đường';
const iceTxt = i => ICES.find(x => x.id === i).name;
function itemText(it) { return DR[it.drink].name + ' ' + it.size + ', ' + sugarTxt(it.sugar) + ', ' + iceTxt(it.ice).toLowerCase() + (it.tops.length ? ', + ' + it.tops.map(t => TP[t].short).join(' + ') : ''); }
function speech(c) {
  const parts = c.items.map(it => {
    let s = '1 ' + DR[it.drink].name.toLowerCase() + ' size ' + it.size;
    if (it.sugar !== 100) s += it.sugar === 0 ? ', không đường' : it.sugar === 50 ? ', ít ngọt thôi' : ', ' + it.sugar + '% đường';
    if (it.ice !== 'bt') s += ', ' + iceTxt(it.ice).toLowerCase();
    if (it.tops.length) s += ', thêm ' + it.tops.map(t => TP[t].name.toLowerCase()).join(' với ');
    return s;
  });
  const call = c.seg === 'hs' ? 'Chị ơi cho em ' : c.seg === 'cn' ? 'Em ơi lấy anh/chị ' : 'Cho cô/chú ';
  return call + parts.join('; ') + (c.seg === 'hs' ? ' nha chị!' : ' nha.');
}

function render() {
  UI.dirty = false;
  $('#top').innerHTML = renderTop();
  const tabs = [['ban', '🧋 Bán hàng'], ['kho', '📦 Kho & nhập hàng'], ['congthuc', '📋 Định lượng & giá vốn'], ['baocao', '📊 Báo cáo'], ['banve', '🛠️ Bản vẽ xe 2D/3D'], ['mophong', '🔮 Mô phỏng nhanh'], ['caidat', '⚙️ Cài đặt']];
  $('#tabs').innerHTML = tabs.map(([k, n]) => `<button class="tab ${UI.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}">${n}</button>`).join('');
  const v = { ban: renderSales, kho: renderKho, congthuc: renderRecipe, baocao: renderReport, mophong: renderSim, caidat: renderSettings, banve: renderBanVe }[UI.tab];
  $('#main').innerHTML = v();
  renderStage();
  $('#modal').innerHTML = UI.modal ? renderModal() : '';
  $('#toast').innerHTML = UI.toast ? `<div class="toastbox">${esc(UI.toast)}</div>` : '';
}
function renderTop() {
  const date = dayDate(S.day), w = W(S.weather);
  const L = D && D.L;
  const profitNow = L ? L.rev - L.cogs - L.waste - L.loss : 0;
  const speeds = D ? `<div class="speeds">
      <button class="sp ${!D.running ? 'on' : ''}" data-a="pause">${D.running ? '⏸' : '▶'}</button>
      ${[1, 2, 4].map(s => `<button class="sp ${D.running && D.speed === s ? 'on' : ''}" data-a="speed" data-v="${s}" title="1 phút trong game = ${Math.round(S.settings.secPerMin / s * 10) / 10} giây">x${s}</button>`).join('')}
      <span id="ffbadge" class="ffb"></span>
    </div>` : '';
  return `<div class="brand">🧋 <b>Xe Trà Sữa</b> <span class="mute">mô phỏng</span></div>
    <div class="stat"><span class="lbl">Ngày ${S.day}</span><b>${DOW_NAMES[date.getDay()]} ${dateStr(date)}</b></div>
    <div class="stat"><span class="lbl">Thời tiết</span><b>${w.icon} ${w.name}</b></div>
    <div class="stat clock"><span class="lbl">${D ? (D.t < 360 ? 'Chuẩn bị' : D.arrivalsClosed ? 'Hết giờ' : 'Đang bán') : 'Chưa mở'}</span><b class="num" id="clock">${D ? hhmm(D.t) : '--:--'}</b></div>
    ${speeds}
    <div class="stat"><span class="lbl">Tiền vốn</span><b class="num">${fmt(S.money)}</b></div>
    <div class="stat"><span class="lbl">Uy tín</span><b>⭐ ${S.rating.toFixed(2)}</b></div>
    ${L ? `<div class="stat"><span class="lbl">Hôm nay</span><b>${L.cups} ly · <span class="${profitNow >= 0 ? 'good' : 'bad'}">${fk(profitNow)}</span></b></div>` : ''}`;
}

// ---- Tab bán hàng ----
function renderSales() {
  if (S.phase === 'prep') return renderPrep();
  const walk = D.cust.filter(c => c.seg !== 'app'), apps = D.cust.filter(c => c.seg === 'app');
  const vbtn = (k, n) => `<button class="btn tiny ${UI.view === k ? 'on' : ''}" data-a="view" data-v="${k}">${n}</button>`;
  return `<div class="viewbar"><span class="small mute">Chế độ xem:</span>${vbtn('bang', '📋 Bảng')}${vbtn('2d', '🖼️ Cảnh 2D')}${vbtn('3d', '🧊 Cảnh 3D')}<span class="small mute">${UI.view === 'bang' ? '' : 'Bấm vào khách trong cảnh để nhận order / thu tiền. 3D: kéo để xoay, cuộn để phóng.'}</span></div>
  <div class="sales">
    <section class="col">
      <div class="card"><h3>Khách tại xe <span class="pill">${walk.length}</span></h3>
        ${walk.length ? walk.map(custCard).join('') : `<p class="empty">${D.t < 360 ? 'Chưa tới giờ mở cửa (6:00). Tranh thủ ủ trà, nấu trân châu ở Bếp sau →' : 'Đang vắng khách. Bấm x4 / x8 để tua nhanh.'}</p>`}
      </div>
      ${S.settings.appOn ? `<div class="card"><h3>🛵 Đơn app <span class="pill">${apps.length}</span></h3>${apps.length ? apps.map(custCard).join('') : '<p class="empty">Chưa có đơn.</p>'}</div>` : ''}
    </section>
    <section class="col wide">${renderTicket()}${renderBench()}</section>
    <section class="col">${renderKitchen()}${renderLog()}</section>
  </div>`;
}
function patPct(c) { return clamp((c.deadline - D.t) / Math.max(1, c.deadline - (c.state === 'wait' || c.state === 'new' ? c.pStart : c.taken)), 0, 1); }
function custCard(c) {
  const seg = SEGMENTS[c.seg], done = c.items.filter(i => i.done).length, sel = D.sel === c.id;
  let btn = '';
  if (c.state === 'wait') btn = `<button class="btn pri" data-a="take" data-v="${c.id}">Nhận order</button>`;
  else if (c.state === 'new') btn = `<button class="btn pri" data-a="appAccept" data-v="${c.id}">Nhận đơn</button><button class="btn ghost" data-a="appReject" data-v="${c.id}">Từ chối</button>`;
  else if (c.state === 'pay') btn = `<button class="btn gold" data-a="pay" data-v="${c.id}">💰 Thu tiền</button>`;
  else if (c.seg === 'app' && c.ready) btn = c.driver ? `<button class="btn gold" data-a="handoff" data-v="${c.id}">Giao tài xế</button>` : '<span class="mute small">Chờ tài xế…</span>';
  else btn = `<button class="btn ${sel ? 'on' : ''}" data-a="sel" data-v="${c.id}">${sel ? 'Đang xem' : 'Xem phiếu'}</button>`;
  const drv = c.seg === 'app' && c.state === 'order' ? (c.driver ? ' · 🛵 tài xế đang đợi' : ' · tài xế tới ~' + hhmm(c.driverAt)) : '';
  return `<div class="cust ${sel ? 'sel' : ''} st-${c.state}" data-a="${c.state === 'order' ? 'sel' : ''}" data-v="${c.id}">
    <div class="av">${c.emoji}</div>
    <div class="ci"><div><b>${seg.name}</b> <span class="mute small">#${c.id} · ${c.items.length} ly${c.state !== 'wait' && c.state !== 'new' ? ' · xong ' + done + '/' + c.items.length : ''}${drv}</span></div>
      <div class="bar"><i data-pat="${c.id}" style="width:${patPct(c) * 100}%"></i></div></div>
    <div class="cb">${btn}</div></div>`;
}
function renderTicket() {
  const c = D.cust.find(x => x.id === D.sel);
  if (!c || c.state === 'wait' || c.state === 'new') return `<div class="card ticket"><h3>Phiếu order</h3><p class="empty">Bấm <b>Nhận order</b> ở khách để xem họ gọi gì. Có thể nhận nhiều khách cùng lúc rồi pha lần lượt.</p></div>`;
  const total = c.items.reduce((a, i) => a + (c.seg === 'app' ? appPrice(i) : itemPrice(i)), 0);
  return `<div class="card ticket"><h3>Phiếu #${c.id} — ${c.emoji} ${SEGMENTS[c.seg].name} ${c.seg === 'app' ? '<span class="pill app">app</span>' : c.pay === 'qr' ? '<span class="pill">chuyển khoản</span>' : '<span class="pill">tiền mặt</span>'}</h3>
    ${c.seg !== 'app' ? `<div class="bubble">“${esc(speech(c))}”</div>` : ''}
    <ul class="items">${c.items.map((it, i) => `<li class="${it.done ? 'done' : ''}">
      <span class="ck">${it.done ? '✅' : '⬜'}</span>
      <span class="dot" style="background:${DR[it.drink].color}"></span>
      <span class="it"><b>${DR[it.drink].name}</b> <span class="sz">${it.size}</span> · ${sugarTxt(it.sugar)} · ${iceTxt(it.ice)}${it.tops.length ? ' · <b>+ ' + it.tops.map(t => TP[t].name).join(' + ') + '</b>' : ''}</span>
      <span class="num">${fk(c.seg === 'app' ? appPrice(it) : itemPrice(it))}</span>
      ${!it.done && c.state === 'order' ? `<button class="btn tiny ghost" data-a="out" data-v="${c.id}:${i}" title="Báo khách hết món">Hết</button>` : ''}
    </li>`).join('')}</ul>
    <div class="tot">Tổng: <b class="num">${fmt(total)}</b>${c.seg === 'app' ? ` <span class="mute small">(sàn thu ${Math.round(S.settings.appFee * (1 + S.settings.appVat) * 1000) / 10}% → quán nhận ${fmt(total * (1 - S.settings.appFee * (1 + S.settings.appVat)))})</span>` : ''}</div>
  </div>`;
}
function renderCup() {
  const c = D.cup;
  if (!c) return `<div class="cupwrap"><div class="cup empty-cup"><span>Chưa lấy ly</span></div></div>`;
  const col = c.drink ? DR[c.drink].color : 'transparent';
  const h = c.size === 'L' ? 150 : 120;
  return `<div class="cupwrap"><div class="cup" style="height:${h}px">
      ${c.sealed ? '<div class="seal">màng ép</div>' : ''}
      <div class="liquid" style="height:${c.drink ? 78 : 0}%;background:${col}">
        ${c.ice && c.ice !== 'khong' ? `<div class="ice">${c.ice === 'bt' ? '🧊🧊🧊' : '🧊'}</div>` : ''}
      </div>
      <div class="toplayer">${c.tops.map(t => `<i style="background:${TP[t].color}"></i>`).join('')}</div>
      <span class="sizetag">${c.size}</span>
    </div>
    <div class="cupinfo">
      <div><b>${c.drink ? DR[c.drink].name : '— chưa rót trà sữa'}</b> · size ${c.size}</div>
      <div>${c.sugar !== null ? sugarTxt(c.sugar) : '— chưa cho đường'} · ${c.ice ? iceTxt(c.ice) : '— chưa cho đá'}</div>
      <div>${c.tops.length ? '+ ' + c.tops.map(t => TP[t].name).join(' + ') : 'không topping'}</div>
      <div class="mute small">Giá vốn ly này: <b class="num">${fmt(c.cost)}</b> ${c.sealed ? '· ✅ đã dập màng' : ''}</div>
    </div></div>`;
}
function renderBench() {
  const c = D.cup;
  const step = !c ? 1 : !c.drink ? 2 : c.sugar === null ? 3 : !c.ice ? 4 : !c.sealed ? 5 : 6;
  const hl = n => step === n ? 'next' : '';
  return `<div class="card bench"><h3>Bàn pha chế</h3>
    ${renderCup()}
    <div class="station ${hl(1)}"><span class="sl">1. Ly</span>
      ${['M', 'L'].map(s => `<button class="btn big" data-a="cup" data-v="${s}">Ly ${s}<small>${RECIPE[s].ml}ml · còn ${S.stock[RECIPE[s].cup]}</small></button>`).join('')}</div>
    <div class="station ${hl(2)}"><span class="sl">2. Trà sữa</span>
      ${DRINKS.map(d => { const ml = potMl(d.tea); return `<button class="btn big drink ${ml < 150 ? 'low' : ''}" data-a="pour" data-v="${d.id}" style="--dc:${d.color}">${d.name}<small>${TEAS[d.tea].name}: ${Math.round(ml)}ml</small></button>`; }).join('')}</div>
    <div class="station ${hl(3)}"><span class="sl">3. Đường</span>
      ${SUGARS.map(s => `<button class="btn" data-a="sugar" data-v="${s}">${s}%</button>`).join('')}</div>
    <div class="station ${hl(4)}"><span class="sl">4. Đá</span>
      ${ICES.map(i => `<button class="btn" data-a="ice" data-v="${i.id}">${i.name}</button>`).join('')}</div>
    <div class="station"><span class="sl">Topping</span>
      ${TOPPINGS.map(t => { const n = topReady(t.id); return `<button class="btn ${n < 1 ? 'low' : ''}" data-a="top" data-v="${t.id}"><i class="sw" style="background:${t.color}"></i>${t.short}<small>${n} phần</small></button>`; }).join('')}</div>
    <div class="station ${hl(5)} ${hl(6)}"><span class="sl">5. Xong</span>
      <button class="btn" data-a="seal">🔒 Dập màng</button>
      <button class="btn pri" data-a="serve">🤲 Giao ly</button>
      <button class="btn ghost" data-a="discard">🗑️ Bỏ ly</button></div>
  </div>`;
}
function renderKitchen() {
  const cooking = Object.values(D.tb).flat().some(b => !b.ready);
  const potRow = tea => {
    const bs = D.pots[tea], ready = bs.filter(b => b.ready), brewing = bs.filter(b => !b.ready);
    const ml = ready.reduce((a, b) => a + b.ml, 0), exp = ready.length ? Math.min(...ready.map(b => b.exp)) : 0;
    return `<div class="krow"><div><b>${TEAS[tea].name}</b><div class="small mute">${Math.round(ml)}ml ≈ ${Math.floor(ml / 150)} ly M${ready.length ? ' · hết hạn <span data-cd="' + exp + '">' + hhmm(exp) + '</span>' : ''}${brewing.length ? ' · <span class="warn">đang ủ, xong ' + hhmm(brewing[0].readyAt) + '</span>' : ''}</div>
      <div class="lvl"><i style="width:${Math.min(100, ml / POT.yield * 100)}%;background:${TEAS[tea].color}"></i></div></div>
      <div class="kb"><button class="btn tiny" data-a="brew" data-v="${tea}:1">½ bình</button><button class="btn tiny" data-a="brew" data-v="${tea}:0">Bình 3L</button></div></div>`;
  };
  const topRow = t => {
    const bs = D.tb[t.id], ready = bs.filter(b => b.ready), ck = bs.filter(b => !b.ready);
    const n = ready.reduce((a, b) => a + b.n, 0), exp = ready.length ? Math.min(...ready.map(b => b.exp)) : 0;
    return `<div class="krow"><div><b>${t.name}</b><div class="small mute">${n} phần${ready.length ? ' · hết hạn ' + hhmm(exp) : ''}${ck.length ? ' · <span class="warn">đang nấu, xong ' + hhmm(ck[0].readyAt) + '</span>' : ''}</div></div>
      <div class="kb"><button class="btn tiny" ${cooking ? 'disabled' : ''} data-a="cook" data-v="${t.id}:1">Mẻ 11</button><button class="btn tiny" ${cooking ? 'disabled' : ''} data-a="cook" data-v="${t.id}:0">Mẻ 22</button></div></div>`;
  };
  const low = Object.keys(ITEMS).filter(k => {
    const per = { kem_beo: 30, sua_dac: 12, duong: 30, da: 240, ly_m: 1, ly_l: 1, bot_khoai: 24 }[k];
    return per && S.stock[k] < per * 8;
  });
  return `<div class="card"><h3>🔥 Bếp sau</h3>
    <div class="ksub">Bình ủ trà (dùng trong ${lifeTxt(teaLife())}, cất tủ mát qua đêm)</div>${Object.keys(TEAS).map(potRow).join('')}
    <div class="ksub">Nồi trân châu (1 bếp, dùng trong ${lifeTxt(topLife())})</div>${TOPPINGS.filter(t => t.cook).map(topRow).join('')}
    <div class="ksub">Ăn liền</div>${TOPPINGS.filter(t => !t.cook).map(t => `<div class="krow"><div><b>${t.name}</b><div class="small mute">${topReady(t.id)} phần</div></div></div>`).join('')}
    ${low.length ? `<div class="lowbox">⚠️ Sắp hết: ${low.map(k => `<button class="btn tiny" data-a="buy" data-v="${k}">${ITEMS[k].name} (${Math.round(S.stock[k])}${ITEMS[k].unit})</button>`).join(' ')}<div class="small mute">Bấm để mua gấp (+15%, 20 phút giao)</div></div>` : ''}
    <div style="margin-top:10px"><button class="btn ghost" data-a="close">🌙 Đóng ca</button></div>
  </div>`;
}
function renderLog() { return `<div class="card"><h3>Nhật ký</h3><div class="log">${D.log.map(l => `<div class="${l.cls}"><span class="num mute">${hhmm(l.t)}</span> ${esc(l.msg)}</div>`).join('')}</div></div>`; }

function renderPrep() {
  const date = dayDate(S.day), w = W(S.weather), sug = suggest(), exp = expectedCups();
  const notes = [];
  if (date.getDay() === 0) notes.push('Chủ nhật: học sinh nghỉ, công nhân phần lớn nghỉ — dân cư đông hơn.');
  if (date.getDay() === 6) notes.push('Thứ 7: học sinh học nửa buổi.');
  const dm = date.getDate(); if (dm >= 5 && dm <= 10) notes.push('Đầu tháng nhận lương: công nhân mua mạnh tay hơn.'); if (dm >= 25) notes.push('Cuối tháng: công nhân hết tiền, mua ít hơn.');
  if (S.weather === 'mua') notes.push('Mưa: khách tại xe giảm mạnh, đơn app tăng.'); if (S.weather === 'nong') notes.push('Nắng nóng: khách tăng ~25%, đá hao nhanh.');
  if (S.history.length < 9) notes.push('Quán mới mở: khách chưa biết nhiều, lượng khách tăng dần trong 10 ngày đầu.');
  const last = S.history[S.history.length - 1];
  return `<div class="prep">
    <div class="card"><h2>Chuẩn bị ngày ${S.day} — ${DOW_NAMES[date.getDay()]} ${dateStr(date)}</h2>
      <p class="fc">${w.icon} Dự báo: <b>${w.name}</b> · Dự kiến khoảng <b>${Math.round(exp * 0.85)}–${Math.round(exp * 1.15)} ly</b></p>
      <ul>${notes.map(n => `<li>${n}</li>`).join('')}</ul>
      ${last ? `<p class="mute">Hôm qua: ${last.cups} ly, mất ${last.lostCups} ly, lãi <b class="${last.profit >= 0 ? 'good' : 'bad'}">${fmt(last.profit)}</b>.</p>` : `<div class="tip"><b>Cách chơi:</b> Mỗi ngày bắt đầu lúc 5:00. Ủ trà và nấu trân châu ở <b>Bếp sau</b> trước 6:00. Khách tới → <b>Nhận order</b> → pha theo thứ tự <b>Ly → Trà sữa → Đường → Đá → Topping → Dập màng → Giao ly</b> → thu tiền, thối tiền đúng. Đơn app: nhận đơn, pha xong, đợi tài xế tới rồi giao. Mọi nguyên liệu trừ kho theo đúng định lượng (xem tab Định lượng).</div>`}
    </div>
    <div class="card"><h3>Kho cho ngày mai</h3>
      <table class="tbl"><tr><th>Nguyên liệu</th><th>Tồn</th><th>Cần ~</th><th>Đề xuất mua</th></tr>
      ${Object.keys(ITEMS).map(k => `<tr><td>${ITEMS[k].name}</td><td class="num">${Math.round(S.stock[k]).toLocaleString('vi-VN')} ${ITEMS[k].unit}</td><td class="num">${Math.round(sug.need[k]).toLocaleString('vi-VN')}</td>
        <td>${sug.packs[k] ? `<b>${sug.packs[k]} × ${ITEMS[k].label}</b>` : '<span class="good">đủ</span>'}</td></tr>`).join('')}
      </table>
      <p>Tổng đề xuất: <b>${fmt(sug.cost)}</b> · Tiền đang có: <b>${fmt(S.money)}</b></p>
      <div class="row"><button class="btn gold" data-a="buySuggest">🛒 Mua theo đề xuất</button><button class="btn" data-a="tab" data-v="kho">Tự chọn mua ở tab Kho</button>
      <button class="btn pri big" data-a="open">🌅 Mở xe (bắt đầu 5:00)</button></div>
      <p class="small mute">Đá để thùng giữ nhiệt, qua đêm tan ~${Math.round(S.settings.iceMelt * 100)}%. Trà ủ dùng trong ${lifeTxt(teaLife())}, trân châu nấu dùng trong ${lifeTxt(topLife())} — còn hạn thì cất tủ mát dùng tiếp.</p>
    </div></div>`;
}

// ---- Kho ----
function renderKho() {
  const open = S.phase === 'open';
  return `<div class="card"><h2>Kho & nhập hàng</h2>
    <p>${open ? '<b class="warn">Đang trong ca:</b> mua gấp ở tạp hóa gần đó, giá +15%, 20 phút sau mới có hàng.' : 'Đang chuẩn bị: mua ở chợ đầu mối / đại lý, giá gốc.'} Tiền: <b>${fmt(S.money)}</b> · Giá trị tồn kho: <b>${fmt(stockValue())}</b></p>
    <table class="tbl"><tr><th>Nguyên liệu</th><th>Quy cách</th><th>Giá gói</th><th>Đơn giá</th><th>Tồn</th><th></th></tr>
    ${Object.entries(ITEMS).map(([k, it]) => `<tr><td>${it.name}${it.melts ? ' <span class="small mute">(tan bớt qua đêm)</span>' : ''}</td><td>${it.label}</td><td class="num">${fmt(S.itemPrice[k])}</td>
      <td class="num small">${(uc(k)).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}đ/${it.unit}</td><td class="num">${Math.round(S.stock[k]).toLocaleString('vi-VN')} ${it.unit}</td>
      <td><button class="btn tiny pri" data-a="buy" data-v="${k}">+1 ${open ? '(' + fk(S.itemPrice[k] * 1.15) + ')' : ''}</button></td></tr>`).join('')}
    </table></div>`;
}

// ---- Định lượng & giá vốn ----
function renderRecipe() {
  const fee = S.settings.appFee * (1 + S.settings.appVat);
  const rows = DRINKS.flatMap(d => ['M', 'L'].map(sz => {
    const c = cupCost(d.id, sz), p = S.price.drinks[d.id][sz], ap = roundK(p * (1 + S.settings.appMarkup));
    return `<tr><td><b>${d.name}</b></td><td>${sz}</td><td class="num">${fmt(c.total)}</td><td class="num">${fmt(p)}</td><td class="num good">${fmt(p - c.total)}</td><td class="num">${Math.round((p - c.total) / p * 100)}%</td><td class="num">${fmt(ap)}</td><td class="num">${fmt(ap * (1 - fee) - c.total)}</td></tr>`;
  })).join('');
  const r = RECIPE;
  return `<div class="card"><h2>Định lượng chuẩn 1 ly</h2>
    <table class="tbl"><tr><th>Thành phần</th><th>Size M (ly 500ml)</th><th>Size L (ly 700ml)</th><th>Ghi chú</th></tr>
      <tr><td>Trà cốt</td><td>${r.M.tea} ml</td><td>${r.L.tea} ml</td><td>Khoai Môn dùng trà đen ${r.M.tea * .8}/${r.L.tea * .8} ml</td></tr>
      <tr><td>Bột kem béo</td><td>${r.M.kem} g</td><td>${r.L.kem} g</td><td>Hòa tan với trà nóng</td></tr>
      <tr><td>Sữa đặc</td><td>${r.M.sua} ml</td><td>${r.L.sua} ml</td><td>Tạo vị béo ngậy</td></tr>
      <tr><td>Đường (100%)</td><td>${r.M.duong} g</td><td>${r.L.duong} g</td><td>70% = ${r.M.duong * .7}/${r.L.duong * .7}g · 50% = ${r.M.duong / 2}/${r.L.duong / 2}g</td></tr>
      <tr><td>Bột khoai môn</td><td>20 g</td><td>28 g</td><td>Chỉ món Khoai Môn</td></tr>
      <tr><td>Đá viên</td><td>${r.M.da} g</td><td>${r.L.da} g</td><td>Ít đá: ½ đá, châm thêm 20% trà · Không đá: châm thêm 40% trà</td></tr>
      <tr><td>Topping</td><td>1 phần ~50 g</td><td>1 phần ~50 g</td><td>3Q, thạch dừa: 40 g/phần</td></tr>
      <tr><td>Ly + màng + ống + túi</td><td>1 bộ ly M</td><td>1 bộ ly L</td><td></td></tr>
    </table>
    <h3>Pha trà cốt & nấu trân châu</h3>
    <ul class="small">
      <li><b>Bình trà 3L:</b> ${Object.values(TEAS).map(t => t.name + ' ' + t.gram + 'g').join(', ')} + 3 lít nước 90–95°C, ủ 15 phút, lọc bã → ~2,7 lít trà cốt ≈ 18 ly M hoặc 12 ly L. Hạn dùng đang đặt: ${lifeTxt(teaLife())} (để tủ mát, sửa ở Cài đặt).</li>
      <li><b>Trân châu đen / trắng / sợi:</b> 500g khô, nước sôi gấp 8 lần, nấu 30–40 phút, ủ 15 phút, xả lạnh, ngâm đường đen → ~1,1kg ≈ 22 phần. Hạn dùng đang đặt: ${lifeTxt(topLife())} (sửa ở Cài đặt). Có thể nấu nửa mẻ (250g → 11 phần) lúc vắng khách.</li>
      <li><b>3Q, thạch dừa:</b> ăn liền, múc 40g/phần.</li>
    </ul></div>
  <div class="card"><h3>Giá vốn & lãi gộp từng ly (70% đường, đá bình thường, chưa topping)</h3>
    <table class="tbl"><tr><th>Món</th><th>Size</th><th>Giá vốn</th><th>Giá bán xe</th><th>Lãi gộp</th><th>%</th><th>Giá app (+${Math.round(S.settings.appMarkup * 100)}%)</th><th>Lãi qua app</th></tr>${rows}</table>
    <h3>Topping</h3>
    <table class="tbl"><tr><th>Topping</th><th>Giá vốn/phần</th><th>Giá bán</th><th>Lãi</th></tr>
      ${TOPPINGS.map(t => `<tr><td>${t.name}</td><td class="num">${fmt(topCost(t.id))}</td><td class="num">${fmt(S.price.tops[t.id])}</td><td class="num good">${fmt(S.price.tops[t.id] - topCost(t.id))}</td></tr>`).join('')}
    </table>
    <p class="small mute">Giá vốn trên là khi dùng hết nguyên liệu. Thực tế còn hao hụt: trà/trân châu quá hạn phải đổ, đá tan, pha sai — xem dòng "Hao hụt" trong Báo cáo. Sàn app thu ${Math.round(S.settings.appFee * 100)}% + VAT ${Math.round(S.settings.appVat * 100)}% trên phí = ${Math.round(fee * 1000) / 10}%.</p></div>`;
}

// ---- Báo cáo ----
function bars(vals, labels, color = 'var(--accent)', h = 120) {
  const max = Math.max(1, ...vals), w = 100 / vals.length;
  return `<svg viewBox="0 0 100 ${h / 3}" preserveAspectRatio="none" class="chart" style="height:${h}px">${vals.map((v, i) => { const bh = Math.abs(v) / max * (h / 3 - 4); return `<rect x="${i * w + w * .15}" y="${h / 3 - bh}" width="${w * .7}" height="${bh}" fill="${v < 0 ? 'var(--bad)' : color}"><title>${labels[i]}: ${v}</title></rect>`; }).join('')}</svg>
    <div class="xl">${labels.map(l => `<span>${l}</span>`).join('')}</div>`;
}
function pl(r) {
  const row = (k, v, cls = '') => `<tr class="${cls}"><td>${k}</td><td class="num">${fmt(v)}</td></tr>`;
  return `<table class="tbl pl">
    ${row('Bán tại xe — tiền mặt', r.cash)}${row('Bán tại xe — chuyển khoản', r.qr)}
    ${r.appGross ? row('Đơn app (giá trên app)', r.appGross) + row('− Phí sàn app + VAT', -r.appFee) : ''}
    ${row('= Doanh thu thực nhận', r.rev, 'sum')}
    ${row('− Giá vốn ly đã bán', -r.cogs)}
    ${row('− Hao hụt (đổ trà, topping, đá tan, ly hỏng)', -r.waste)}
    ${r.loss ? row('− Thất thoát (thối dư, CK chưa về)', -r.loss) : ''}
    ${row('− Mặt bằng / ngày', -r.fixed.rent)}${row('− Điện nước ga / ngày', -r.fixed.util)}${row('− Khấu hao xe & dụng cụ / ngày', -r.fixed.dep)}
    ${r.fixed.labor ? row('− Tiền công / ngày', -r.fixed.labor) : ''}
    ${row('= LÃI RÒNG', r.profit, 'sum ' + (r.profit >= 0 ? 'good' : 'bad'))}
  </table>`;
}
function renderReport() {
  const H = S.history;
  if (!H.length) return `<div class="card"><h2>Báo cáo</h2><p class="empty">Chưa có ngày nào. Bán xong 1 ngày sẽ có báo cáo lãi lỗ ở đây.</p></div>`;
  const r = H[H.length - 1];
  const tot = H.reduce((a, x) => ({ cups: a.cups + x.cups, rev: a.rev + x.rev, profit: a.profit + x.profit, lost: a.lost + x.lostCups, waste: a.waste + x.waste }), { cups: 0, rev: 0, profit: 0, lost: 0, waste: 0 });
  const n = H.length, avgP = tot.profit / n;
  const drinkRows = DRINKS.map(d => `<tr><td>${d.name}</td><td class="num">${r.by[d.id].M}</td><td class="num">${r.by[d.id].L}</td></tr>`).join('');
  const topPct = r.cups ? Math.round(Object.values(r.tops).reduce((a, b) => a + b, 0) / r.cups * 100) : 0;
  const wb = Object.entries(r.wasteBy).map(([k, v]) => `<li>${k}: <b>${fmt(v)}</b></li>`).join('');
  return `<div class="grid2">
    <div class="card"><h2>Ngày ${r.day} — ${DOW_NAMES[r.dow]} ${r.date} ${W(r.weather).icon}</h2>
      <div class="kpis">
        <div><span>Ly bán</span><b>${r.cups}</b></div><div><span>Ly mất</span><b class="bad">${r.lostCups}</b></div>
        <div><span>Chờ TB</span><b>${r.avgWait.toFixed(1)}'</b></div><div><span>Pha sai</span><b>${r.mistakes}</b></div>
        <div><span>Có topping</span><b>${topPct}%</b></div><div><span>Uy tín</span><b>⭐${r.rating.toFixed(2)}</b></div>
      </div>
      ${pl(r)}
      ${wb ? `<div class="small"><b>Chi tiết hao hụt:</b><ul>${wb}</ul></div>` : ''}
      ${S.phase === 'prep' ? `<button class="btn pri big" data-a="tab" data-v="ban">➡️ Chuẩn bị ngày ${S.day}</button>` : ''}
    </div>
    <div class="card"><h3>Ly bán theo giờ</h3>${bars(r.hours, r.hours.map((_, i) => (i + 5) + 'h'))}
      <h3>Theo món</h3><table class="tbl"><tr><th>Món</th><th>M</th><th>L</th></tr>${drinkRows}</table>
      <h3>Theo nhóm khách</h3><table class="tbl"><tr><th>Nhóm</th><th>Ly bán</th><th>Ly mất</th></tr>
      ${Object.entries(r.seg).map(([k, s]) => `<tr><td>${SEGMENTS[k].name}</td><td class="num">${s.cups}</td><td class="num">${s.lostCups}</td></tr>`).join('')}</table>
    </div></div>
    <div class="card"><h2>Tổng ${n} ngày</h2>
      <div class="kpis">
        <div><span>Tổng ly</span><b>${tot.cups}</b></div><div><span>TB ly/ngày</span><b>${(tot.cups / n).toFixed(1)}</b></div>
        <div><span>Tổng lãi</span><b class="${tot.profit >= 0 ? 'good' : 'bad'}">${fmt(tot.profit)}</b></div><div><span>Lãi TB/ngày</span><b>${fmt(avgP)}</b></div>
        <div><span>Ước lãi/tháng</span><b class="${avgP >= 0 ? 'good' : 'bad'}">${fmt(avgP * 30)}</b></div><div><span>Hoàn vốn xe</span><b>${avgP > 0 ? (S.settings.equipment / (avgP * 30 + fixedPerDay().dep * 30)).toFixed(1) + ' tháng' : '—'}</b></div>
      </div>
      <h3>Lãi theo ngày</h3>${bars(H.map(x => Math.round(x.profit / 1000)), H.map(x => 'N' + x.day), 'var(--good)')}
      <table class="tbl"><tr><th>Ngày</th><th>Thời tiết</th><th>Ly</th><th>Mất</th><th>Doanh thu</th><th>Hao hụt</th><th>Lãi</th></tr>
      ${H.slice().reverse().map(x => `<tr><td>${x.day} · ${DOW_NAMES[x.dow]} ${x.date}</td><td>${W(x.weather).icon}</td><td class="num">${x.cups}</td><td class="num">${x.lostCups}</td><td class="num">${fk(x.rev)}</td><td class="num">${fk(x.waste)}</td><td class="num ${x.profit >= 0 ? 'good' : 'bad'}">${fk(x.profit)}</td></tr>`).join('')}</table>
    </div>`;
}

// ---- Mô phỏng nhanh ----
A.runSim = () => {
  const days = clamp(+$('#simDays').value || 30, 1, 365), svc = clamp(+$('#simSvc').value || 1.5, 0.5, 5), acc = clamp(+$('#simAcc').value || 97, 50, 100) / 100;
  UI.simResult = { rows: simulate(days, svc, acc, $('#simApp').checked), days, svc, acc };
  dirty();
};
function renderSim() {
  const s = UI.simResult;
  let res = '';
  if (s) {
    const rows = s.rows, n = rows.length, sum = k => rows.reduce((a, r) => a + r[k], 0);
    const p = sum('profit'), cups = sum('cups'), lost = sum('lost');
    const byDow = [1, 2, 3, 4, 5, 6, 0].map(d => { const rr = rows.filter(r => r.dow === d); return rr.length ? rr.reduce((a, r) => a + r.cups, 0) / rr.length : 0; });
    res = `<div class="kpis">
      <div><span>TB ly/ngày</span><b>${(cups / n).toFixed(1)}</b></div><div><span>Ly mất TB</span><b class="bad">${(lost / n).toFixed(1)}</b></div>
      <div><span>Doanh thu TB/ngày</span><b>${fmt(sum('rev') / n)}</b></div><div><span>Hao hụt TB/ngày</span><b>${fmt(sum('waste') / n)}</b></div>
      <div><span>Lãi TB/ngày</span><b>${fmt(p / n)}</b></div><div><span>Lãi quy ra tháng</span><b class="${p >= 0 ? 'good' : 'bad'}">${fmt(p / n * 30)}</b></div>
    </div>
    <table class="tbl pl">
      <tr><td>Doanh thu thực nhận (${n} ngày)</td><td class="num">${fmt(sum('rev'))}</td></tr>
      <tr><td>− Giá vốn</td><td class="num">${fmt(-sum('cogs'))}</td></tr>
      <tr><td>− Hao hụt</td><td class="num">${fmt(-sum('waste'))}</td></tr>
      <tr><td>− Phí sàn app (đã trừ trong doanh thu)</td><td class="num mute">${fmt(-sum('fee'))}</td></tr>
      <tr><td>− Mặt bằng, điện nước, khấu hao${S.settings.laborMonth ? ', tiền công' : ''}</td><td class="num">${fmt(-sum('fixed'))}</td></tr>
      <tr class="sum"><td>= Lãi ròng</td><td class="num ${p >= 0 ? 'good' : 'bad'}">${fmt(p)}</td></tr></table>
    <h3>Ly TB theo thứ</h3>${bars(byDow.map(x => Math.round(x)), ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'])}
    <h3>Lãi theo ngày (nghìn đồng)</h3>${bars(rows.map(r => Math.round(r.profit / 1000)), rows.map(r => r.date), 'var(--good)')}`;
  }
  return `<div class="card"><h2>🔮 Mô phỏng nhanh</h2>
    <p>Máy tự bán thay bạn N ngày với cùng mô hình khách, giá và chi phí hiện tại — để xem nhanh lãi/tháng trước khi bỏ tiền thật. Không ảnh hưởng ván chơi.</p>
    <div class="form">
      <label>Số ngày <input id="simDays" type="number" value="${s ? s.days : 30}" min="1" max="365"></label>
      <label>Thời gian pha 1 ly (phút) <input id="simSvc" type="number" step="0.1" value="${s ? s.svc : 1.5}"></label>
      <label>Độ chính xác pha (%) <input id="simAcc" type="number" value="${s ? Math.round(s.acc * 100) : 97}"></label>
      <label class="chk"><input id="simApp" type="checkbox" ${S.settings.appOn ? 'checked' : ''}> Bán trên app</label>
      <button class="btn pri" data-a="runSim">Chạy mô phỏng</button>
    </div>${res}</div>`;
}

// ---- Cài đặt ----
A.saveSettings = () => {
  const num = id => +$('#' + id).value;
  DRINKS.forEach(d => { S.price.drinks[d.id].M = num('p_' + d.id + '_M'); S.price.drinks[d.id].L = num('p_' + d.id + '_L'); });
  TOPPINGS.forEach(t => S.price.tops[t.id] = num('t_' + t.id));
  Object.keys(ITEMS).forEach(k => S.itemPrice[k] = num('i_' + k));
  ['rentMonth', 'utilMonth', 'equipment', 'equipMonths', 'laborMonth', 'teaLifeH', 'topLifeH'].forEach(k => S.settings[k] = num('s_' + k));
  S.settings.iceMelt = clamp(num('s_iceMelt') / 100, 0, 1);
  S.settings.appMarkup = num('s_appMarkup') / 100; S.settings.appFee = num('s_appFee') / 100; S.settings.appVat = num('s_appVat') / 100;
  S.settings.appOn = $('#s_appOn').checked;
  S.settings.secPerMin = clamp(num('s_secPerMin'), 1, 30); S.settings.patMult = +$('#s_patMult').value; S.settings.autoFF = $('#s_autoFF').checked;
  save(); toast('Đã lưu cài đặt');
};
A.reset = () => {
  if (!confirm('Xóa toàn bộ ván chơi và bắt đầu lại từ ngày 1 với vốn ' + fmt($('#s_start').value) + '?')) return;
  const start = +$('#s_start').value || DEFAULT_SETTINGS.startMoney;
  S = newState(); S.money = start; S.settings.startMoney = start; D = null; UI.tab = 'ban'; save(); dirty();
};
function renderSettings() {
  const inp = (id, v, step = 1000) => `<input id="${id}" type="number" step="${step}" value="${v}">`;
  return `<div class="grid2"><div class="card"><h2>Giá bán tại xe</h2>
    <table class="tbl"><tr><th>Món</th><th>M</th><th>L</th></tr>${DRINKS.map(d => `<tr><td>${d.name}</td><td>${inp('p_' + d.id + '_M', S.price.drinks[d.id].M)}</td><td>${inp('p_' + d.id + '_L', S.price.drinks[d.id].L)}</td></tr>`).join('')}</table>
    <table class="tbl"><tr><th>Topping</th><th>Giá</th></tr>${TOPPINGS.map(t => `<tr><td>${t.name}</td><td>${inp('t_' + t.id, S.price.tops[t.id])}</td></tr>`).join('')}</table>
    <p class="small mute">Tăng giá → mỗi ly lãi hơn nhưng khách giảm (học sinh nhạy giá nhất, dân cư ít nhạy nhất).</p>
    <h3>Chi phí cố định</h3>
    <div class="form col">
      <label>Mặt bằng / tháng ${inp('s_rentMonth', S.settings.rentMonth, 100000)}</label>
      <label>Điện nước ga / tháng ${inp('s_utilMonth', S.settings.utilMonth, 50000)}</label>
      <label>Tiền xe + dụng cụ ${inp('s_equipment', S.settings.equipment, 100000)}</label>
      <label>Khấu hao trong (tháng) ${inp('s_equipMonths', S.settings.equipMonths, 1)}</label>
      <label>Tiền công thuê người / tháng (0 = tự bán) ${inp('s_laborMonth', S.settings.laborMonth, 500000)}</label>
    </div>
    <h3>Nhịp chơi</h3>
    <div class="form col">
      <label>Tốc độ x1: 1 phút trong game = bao nhiêu giây thật ${inp('s_secPerMin', S.settings.secPerMin, 1)}</label>
      <label>Độ kiên nhẫn của khách <select id="s_patMult">${[[1.6, 'Dễ — khách chờ lâu'], [1.3, 'Vừa'], [1, 'Sát thực tế']].map(([v, n]) => `<option value="${v}" ${S.settings.patMult == v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="chk"><input id="s_autoFF" type="checkbox" ${S.settings.autoFF ? 'checked' : ''}> Tự tua nhanh khi không có khách</label>
    </div>
    <h3>Hạn dùng & bảo quản</h3>
    <div class="form col">
      <label>Trà cốt đã ủ, cất tủ mát (giờ) ${inp('s_teaLifeH', S.settings.teaLifeH, 1)}</label>
      <label>Trân châu đã nấu (giờ) ${inp('s_topLifeH', S.settings.topLifeH, 1)}</label>
      <label>Đá tan qua đêm trong thùng giữ nhiệt (%) ${inp('s_iceMelt', Math.round(S.settings.iceMelt * 100), 5)}</label>
    </div>
    <p class="small mute">72 giờ = 3 ngày. Còn hạn thì cuối ngày cất tủ mát, hôm sau dùng tiếp. Thực tế: trân châu nấu xong sau 4–6 tiếng bắt đầu cứng, để tủ lạnh qua đêm phải hấp/ngâm đường lại; trà cốt tủ mát ngon nhất trong 24–48 giờ. Nên thử thật vài mẻ rồi chỉnh số này cho đúng.</p>
    <h3>App giao hàng (ShopeeFood / GrabFood)</h3>
    <div class="form col">
      <label class="chk"><input id="s_appOn" type="checkbox" ${S.settings.appOn ? 'checked' : ''}> Có bán trên app (áp dụng từ ngày sau)</label>
      <label>Giá app cao hơn giá xe (%) ${inp('s_appMarkup', Math.round(S.settings.appMarkup * 100), 1)}</label>
      <label>Chiết khấu sàn (%) ${inp('s_appFee', Math.round(S.settings.appFee * 100), 1)}</label>
      <label>VAT trên phí sàn (%) ${inp('s_appVat', Math.round(S.settings.appVat * 100), 1)}</label>
    </div></div>
    <div class="card"><h2>Giá nhập nguyên liệu</h2>
      <table class="tbl"><tr><th>Nguyên liệu</th><th>Quy cách</th><th>Giá</th></tr>${Object.entries(ITEMS).map(([k, it]) => `<tr><td>${it.name}</td><td>${it.label}</td><td>${inp('i_' + k, S.itemPrice[k])}</td></tr>`).join('')}</table>
      <button class="btn pri big" data-a="saveSettings">💾 Lưu cài đặt</button>
      <h3>Chơi lại từ đầu</h3>
      <div class="form"><label>Vốn nguyên liệu ban đầu ${inp('s_start', S.settings.startMoney, 100000)}</label><button class="btn ghost" data-a="reset">↺ Chơi lại</button></div>
      <p class="small mute">Ván chơi lưu trong trình duyệt này (tự lưu cuối mỗi ngày).</p>
    </div></div>`;
}

// ---- Modal thu tiền ----
function renderModal() {
  const m = UI.modal, c = D && D.cust.find(x => x.id === m.id);
  if (!c) return '';
  if (c.pay === 'qr') {
    return `<div class="ov"><div class="mbox"><h3>${c.emoji} Khách quét mã QR chuyển khoản</h3>
      <p>Tổng tiền: <b class="num big">${fmt(m.total)}</b></p>
      <div class="bank"><div class="small mute">📱 Thông báo ngân hàng của quán</div>${m.qrOk ? `<div class="good">+${fmt(m.total)} · ND: "tra sua" · vừa xong</div>` : '<div class="mute">Chưa có giao dịch mới</div>'}</div>
      <p class="small">Khách đưa màn hình "chuyển thành công". Kiểm tra thông báo ngân hàng trước khi cho khách đi.</p>
      <div class="row"><button class="btn pri" data-a="qrOk">✅ Đã nhận tiền</button><button class="btn" data-a="qrCheck">❓ Chưa thấy tiền, nhờ khách xem lại</button></div></div></div>`;
  }
  const need = m.given - m.total;
  return `<div class="ov"><div class="mbox"><h3>${c.emoji} Thu tiền mặt</h3>
    <p>Tổng tiền: <b class="num big">${fmt(m.total)}</b></p>
    <p>Khách đưa: <b class="num big">${fmt(m.given)}</b></p>
    ${need === 0 ? '<p class="good">Khách đưa vừa đủ, không cần thối.</p>' : '<p>Bạn tự tính tiền thối và đưa cho khách:</p>'}
    <div class="bills">${[1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000].map(b => `<button class="bill" data-a="chg" data-v="${b}">${fk(b)}</button>`).join('')}</div>
    <p>Đang thối: <b class="num big">${fmt(m.change)}</b> <button class="btn tiny ghost" data-a="chgClear">Xóa</button></p>
    <div class="row"><button class="btn pri" data-a="chgGive">${need === 0 ? '✅ Xong' : '🤝 Đưa tiền thối'}</button></div></div></div>`;
}

// ---- cập nhật nhanh mỗi khung hình ----
function updateDyn() {
  updateStage();
  if (!D) return;
  const ck = $('#clock'); if (ck) ck.textContent = hhmm(D.t);
  const fb = $('#ffbadge'); if (fb) fb.textContent = D.ff && D.running ? '⏩ vắng khách, đang tua' : '';
  document.querySelectorAll('[data-pat]').forEach(el => {
    const c = D.cust.find(x => x.id === +el.dataset.pat); if (!c) return;
    const p = patPct(c); el.style.width = p * 100 + '%'; el.className = p < .3 ? 'bad' : p < .6 ? 'warn' : '';
  });
}

// ================= Khởi động =================
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el || !el.dataset.a) return;
  if (el.classList.contains('cust') && e.target.closest('button')) return;
  const f = A[el.dataset.a]; if (f) { f(el.dataset.v, el); }
});
let last = performance.now();
function loop(now) {
  const dt = Math.min(now - last, 250); last = now;
  if (D && D.running && S.phase === 'open' && !(UI.modal && D.speed > 2)) {
    const busy = D.cup || UI.modal || D.cust.some(c => c.state !== 'order' || c.seg !== 'app' || !c.ready || c.driver);
    const base = D.speed / S.settings.secPerMin;
    D.ff = !busy && S.settings.autoFF && D.t < S.settings.closeMin;
    D.t += dt / 1000 * (D.ff ? Math.max(base, 2.5) : base); step();
  }
  if (UI.dirty) render(); else updateDyn();
  requestAnimationFrame(loop);
}
function boot() { load(); render(); requestAnimationFrame(loop); }
