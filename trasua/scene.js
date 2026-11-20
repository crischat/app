'use strict';
// ================= Bản vẽ 2D (đơn vị mm) + Cảnh 2D / 3D =================
const POTS_X = [330, 530, 730, 930];               // tâm 4 bình trà dọc dải kính
const TEA_ORDER = ['olong', 'den', 'thai', 'gao'];
const zoneX = () => { let x = 0; return CART.zones.map(z => { const r = { ...z, x }; x += z.w; return r; }); };
const shopName = () => (S && S.settings.shopName) || 'TRÀ SỮA';

function dimH(x1, x2, y, label, cls = '') {
  return `<g class="dim ${cls}"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><line x1="${x1}" y1="${y - 25}" x2="${x1}" y2="${y + 25}"/><line x1="${x2}" y1="${y - 25}" x2="${x2}" y2="${y + 25}"/>
    <text x="${(x1 + x2) / 2}" y="${y - 16}" text-anchor="middle">${label}</text></g>`;
}
function dimV(y1, y2, x, label, cls = '') {
  const m = (y1 + y2) / 2;
  return `<g class="dim ${cls}"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><line x1="${x - 25}" y1="${y1}" x2="${x + 25}" y2="${y1}"/><line x1="${x - 25}" y1="${y2}" x2="${x + 25}" y2="${y2}"/>
    <text transform="translate(${x - 16},${m}) rotate(-90)" text-anchor="middle">${label}</text></g>`;
}
function lvl(tea) { return D ? clamp(potMl(tea) / POT.yield, 0, 1) : 0.8; }

// ---- Mặt trước (phía khách) ----
function frontInner(o = {}) {
  const C = CART, Y = z => C.H - z;
  let g = '';
  g += `<rect class="sign" x="0" y="${Y(C.H)}" width="${C.L}" height="${C.signH}" rx="24"/>
    <text class="signt" x="${C.L / 2}" y="${Y(C.H - C.signH / 2) + 38}" text-anchor="middle">🧋 ${esc(shopName())}</text>`;
  g += `<rect class="inox" x="0" y="${Y(C.postTop) - 20}" width="${C.L}" height="20"/>`;
  for (const x of [0, C.L - C.post]) g += `<rect class="post" x="${x}" y="${Y(C.postTop)}" width="${C.post}" height="${C.postTop - C.counter}"/>`;
  g += `<rect class="glass" x="${C.post}" y="${Y(C.glassTop)}" width="${C.L - 2 * C.post}" height="${C.glassTop - C.counter}"/>`;
  TEA_ORDER.forEach((tea, i) => {
    const cx = POTS_X[i], h = C.pot.h, w = C.pot.d, l = lvl(tea), lh = (h - 40) * l;
    g += `<rect class="pot" x="${cx - w / 2}" y="${Y(C.counter + h)}" width="${w}" height="${h}" rx="22"/>
      <rect x="${cx - w / 2 + 12}" y="${Y(C.counter + 12 + lh)}" width="${w - 24}" height="${lh}" rx="12" style="fill:${TEAS[tea].color}"/>
      <rect class="inox" x="${cx - w / 2 - 6}" y="${Y(C.counter + h + 24)}" width="${w + 12}" height="24" rx="8"/>
      <rect class="inox" x="${cx - 14}" y="${Y(C.counter + 70)}" width="28" height="40"/>
      <text class="lbl xs" x="${cx}" y="${Y(C.counter + h + 45 + (i % 2) * 45)}" text-anchor="middle">${TEAS[tea].name}</text>`;
  });
  g += `<rect class="pot" x="1040" y="${Y(C.counter + 220)}" width="140" height="220" rx="20"/><rect x="1052" y="${Y(C.counter + 160)}" width="116" height="148" rx="10" style="fill:#b79ad6"/>
    <text class="lbl sm" x="1110" y="${Y(C.counter + 250)}" text-anchor="middle">Bột khoai</text>
    <rect class="pot" x="1215" y="${Y(C.counter + 280)}" width="90" height="280" rx="16"/><rect x="1225" y="${Y(C.counter + 200)}" width="70" height="190" rx="8" style="fill:#e9c46a"/>
    <text class="lbl sm" x="1260" y="${Y(C.counter + 310)}" text-anchor="middle">Syrup</text>`;
  g += `<rect class="inox" x="-20" y="${Y(C.counter)}" width="${C.L + 40}" height="${C.topT}"/>`;
  g += `<rect class="cab" x="0" y="${Y(C.cabTop)}" width="${C.L}" height="${C.cabTop - C.clear}" rx="10"/>`;
  g += `<rect class="decal" x="330" y="${Y(C.cabTop - 50)}" width="1000" height="560" rx="24"/>
    <text class="menut" x="830" y="${Y(C.cabTop - 140)}" text-anchor="middle">MENU</text>
    ${DRINKS.map((d, i) => `<text class="menul" x="380" y="${Y(C.cabTop - 220 - i * 72)}">${d.name}</text><text class="menul" x="1290" y="${Y(C.cabTop - 220 - i * 72)}" text-anchor="end">${S ? fk(S.price.drinks[d.id].M) + ' / ' + fk(S.price.drinks[d.id].L) : ''}</text>`).join('')}`;
  g += `<rect class="qr" x="60" y="${Y(C.cabTop - 80)}" width="200" height="200" rx="10"/><text class="lbl sm" x="160" y="${Y(C.cabTop - 200)}" text-anchor="middle" style="fill:#2e2218">QR</text>
    <text class="lbl sm" x="160" y="${Y(C.cabTop - 330)}" text-anchor="middle" style="fill:#fff">Quét để</text><text class="lbl sm" x="160" y="${Y(C.cabTop - 380)}" text-anchor="middle" style="fill:#fff">chuyển khoản</text>`;
  for (const cx of [170, C.L - 170]) g += `<rect class="inox" x="${cx - 30}" y="${Y(C.clear)}" width="60" height="${C.clear - C.wheel / 2}"/><circle class="wheel" cx="${cx}" cy="${Y(C.wheel / 2)}" r="${C.wheel / 2}"/><circle class="inox" cx="${cx}" cy="${Y(C.wheel / 2)}" r="30"/>`;
  if (o.ground !== false) g += `<line class="ground" x1="-300" y1="${C.H}" x2="${C.L + 300}" y2="${C.H}"/>`;
  if (o.dims) {
    g += dimH(0, C.L, C.H + 150, '1600');
    g += dimV(0, C.H, -170, '2100 (tổng cao)');
    g += dimV(Y(C.clear), C.H, -330, 'gầm 150') + dimV(Y(C.cabTop), Y(C.clear), -330, 'tủ 730');
    g += dimV(Y(C.counter), C.H, C.L + 130, '900 (mặt bàn)');
    g += dimV(Y(C.glassTop), Y(C.counter), C.L + 300, 'kính 600') + dimV(Y(C.postTop), Y(C.glassTop), C.L + 300, 'thoáng 300') + dimV(Y(C.H), Y(C.postTop), C.L + 300, 'biển 300');
    g += `<text class="lbl sm" x="170" y="${C.H + 90}" text-anchor="middle">bánh Ø200</text>`;
  }
  return g;
}
function frontSVG() { return `<svg class="bp" viewBox="-480 -80 2560 2400">${frontInner({ dims: true })}</svg>`; }

// ---- Mặt bằng mặt bàn (nhìn từ trên) ----
function topSVG() {
  const C = CART, fs = C.frontStrip, zs = zoneX();
  let g = `<rect class="inox" x="0" y="0" width="${C.L}" height="${C.W}"/>
    <rect class="glass" x="0" y="-12" width="${C.L}" height="14"/><rect class="glass" x="-12" y="0" width="14" height="${C.W}"/><rect class="glass" x="${C.L - 2}" y="0" width="14" height="${C.W}"/>`;
  for (const [x, y] of [[0, 0], [C.L - C.post, 0], [0, C.W - C.post], [C.L - C.post, C.W - C.post]]) g += `<rect class="post" x="${x}" y="${y}" width="${C.post}" height="${C.post}"/>`;
  g += `<line class="zone" x1="0" y1="${fs}" x2="${C.L}" y2="${fs}"/>`;
  TEA_ORDER.forEach((tea, i) => g += `<circle cx="${POTS_X[i]}" cy="${fs / 2}" r="${C.pot.d / 2}" style="fill:${TEAS[tea].color}" class="potc"/><text class="lbl xs" x="${POTS_X[i]}" y="${fs / 2 + 12}" text-anchor="middle">${TEAS[tea].name}</text>`);
  g += `<circle cx="1110" cy="${fs / 2}" r="70" style="fill:#b79ad6" class="potc"/><text class="lbl xs" x="1110" y="${fs / 2 + 12}" text-anchor="middle">Khoai</text>
    <circle cx="1260" cy="${fs / 2}" r="45" style="fill:#e9c46a" class="potc"/>`;
  zs.forEach((z, i) => {
    if (i) g += `<line class="zone" x1="${z.x}" y1="${fs}" x2="${z.x}" y2="${C.W}"/>`;
  });
  const [zo, zm, zi, zt, zsl] = zs;
  g += `<rect class="item" x="${zo.x + 40}" y="${fs + 90}" width="220" height="140" rx="10"/><text class="lbl xs" x="${zo.x + 150}" y="${fs + 170}" text-anchor="middle">QR + máy tính</text>
    <rect class="item" x="${zo.x + 40}" y="${fs + 260}" width="220" height="200" rx="10"/><text class="lbl xs" x="${zo.x + 150}" y="${fs + 370}" text-anchor="middle">phiếu order</text>`;
  for (let k = 0; k < 3; k++) g += `<circle class="item" cx="${zm.x + 80 + k * 120}" cy="${fs + 150}" r="50"/>`;
  g += `<text class="lbl xs" x="${zm.x + 200}" y="${fs + 240}" text-anchor="middle">bình lắc ×3</text>
    <rect class="item" x="${zm.x + 30}" y="${fs + 290}" width="160" height="160" rx="12"/><text class="lbl xs" x="${zm.x + 110}" y="${fs + 380}" text-anchor="middle">kem béo</text>
    <rect class="item" x="${zm.x + 210}" y="${fs + 290}" width="160" height="160" rx="12"/><text class="lbl xs" x="${zm.x + 290}" y="${fs + 380}" text-anchor="middle">sữa đặc</text>`;
  g += `<rect class="icebin" x="${zi.x + 10}" y="${fs + 30}" width="230" height="450" rx="10"/><text class="lbl xs" x="${zi.x + 125}" y="${fs + 260}" text-anchor="middle">ĐÁ</text>`;
  const tops = ['tcden', 'tctrang', 'tcsoi', 'tc3q', 'thach', null];
  tops.forEach((t, k) => {
    const col = k % 2, row = Math.floor(k / 2), x = zt.x + 4 + col * 176, y = fs + 7 + row * 162;
    g += `<rect class="tray" x="${x}" y="${y}" width="176" height="162" rx="8" style="${t ? 'fill:' + TP[t].color : ''}"/><text class="lbl xs" x="${x + 88}" y="${y + 92}" text-anchor="middle" ${t === 'tcden' ? 'style="fill:#fff"' : ''}>${t ? TP[t].short : 'dự phòng'}</text>`;
  });
  g += `<rect class="item" x="${zsl.x + 35}" y="${fs + 80}" width="220" height="330" rx="12"/><text class="lbl xs" x="${zsl.x + 145}" y="${fs + 250}" text-anchor="middle">máy dập</text>
    <circle class="item" cx="${zsl.x + 80}" cy="${fs + 450}" r="40"/><circle class="item" cx="${zsl.x + 200}" cy="${fs + 450}" r="48"/>`;
  zs.forEach((z, i) => g += `<text class="lbl xs b halo" x="${z.x + z.w / 2}" y="${fs + 45}" text-anchor="middle">${i + 1}. ${z.name}</text>`);
  g += `<text class="lbl sm b" x="${C.L / 2}" y="-60" text-anchor="middle">▲ PHÍA KHÁCH (kính) ▲</text><text class="lbl sm b" x="${C.L / 2}" y="${C.W + 90}" text-anchor="middle">▼ PHÍA NGƯỜI BÁN (đứng ở đây) ▼</text>`;
  zs.forEach(z => g += dimH(z.x, z.x + z.w, C.W + 190, z.w));
  g += dimH(0, C.L, C.W + 320, '1600');
  g += dimV(0, C.W, -120, '700') + dimV(0, fs, -260, 'dải bình ' + fs) + dimV(fs, C.W, -260, 'khu pha ' + (C.W - fs));
  return `<svg class="bp" viewBox="-380 -140 2260 1520">${g}</svg>`;
}

// ---- Mặt bên ----
function sideSVG() {
  const C = CART, Y = z => C.H - z, W = C.W;
  let g = `<rect class="cab" x="0" y="${Y(C.cabTop)}" width="${W}" height="${C.cabTop - C.clear}" rx="10"/>
    <rect class="inox" x="-20" y="${Y(C.counter)}" width="${W + 40}" height="${C.topT}"/>
    <rect class="glass" x="${C.post}" y="${Y(C.glassTop)}" width="${W - 2 * C.post}" height="${C.glassTop - C.counter}"/>
    <rect class="post" x="0" y="${Y(C.postTop)}" width="${C.post}" height="${C.postTop - C.counter}"/><rect class="post" x="${W - C.post}" y="${Y(C.postTop)}" width="${C.post}" height="${C.postTop - C.counter}"/>
    <rect class="inox" x="0" y="${Y(C.postTop) - 20}" width="${W}" height="20"/>
    <rect class="sign" x="0" y="${Y(C.H)}" width="70" height="${C.signH}" rx="10"/>
    <rect class="pot" x="${C.frontStrip / 2 - 90}" y="${Y(C.counter + C.pot.h)}" width="180" height="${C.pot.h}" rx="22"/>`;
  for (const cx of [130, W - 130]) g += `<rect class="inox" x="${cx - 30}" y="${Y(C.clear)}" width="60" height="${C.clear - C.wheel / 2}"/><circle class="wheel" cx="${cx}" cy="${Y(C.wheel / 2)}" r="100"/>`;
  // người để so sánh
  const person = (x, h, lbl) => `<g class="person"><circle cx="${x}" cy="${Y(h - 110)}" r="110"/><rect x="${x - 150}" y="${Y(h - 240)}" width="300" height="${h - 240 - 800}" rx="80"/><rect x="${x - 120}" y="${Y(800)}" width="100" height="800" rx="40"/><rect x="${x + 20}" y="${Y(800)}" width="100" height="800" rx="40"/></g><text class="lbl sm" x="${x}" y="${C.H + 80}" text-anchor="middle">${lbl}</text>`;
  g += person(-450, 1650, 'Khách (cao 1m65)') + person(W + 480, 1600, 'Người bán');
  g += `<line class="ground" x1="-800" y1="${C.H}" x2="${W + 850}" y2="${C.H}"/>`;
  g += dimH(0, W, C.H + 190, '700') + dimH(0, C.frontStrip, Y(C.counter) - 420, 'bình ' + C.frontStrip);
  g += dimV(Y(C.counter), C.H, W + 150, '900') + dimV(Y(C.glassTop), Y(C.counter), W + 150, '600') + dimV(Y(C.H), C.H, -150, '2100');
  g += `<text class="lbl sm b" x="0" y="${Y(C.H) - 40}">◀ khách</text><text class="lbl sm b" x="${W}" y="${Y(C.H) - 40}" text-anchor="end">người bán ▶</text>`;
  return `<svg class="bp" viewBox="-900 -120 2550 2420">${g}</svg>`;
}

// ---- Tủ dưới (nhìn từ phía người bán) ----
function cabinetSVG() {
  const C = CART, Y = z => C.cabTop - z + 60, h = C.cabTop - C.clear;
  const zs = zoneX().map(z => ({ ...z, x: C.L - z.x - z.w })); // phía sau: trái/phải đảo ngược
  let g = `<rect class="inox" x="-20" y="${Y(C.counter)}" width="${C.L + 40}" height="${C.topT}"/><rect class="cab" x="0" y="${Y(C.cabTop)}" width="${C.L}" height="${h}" rx="10"/>`;
  zs.forEach((z, i) => {
    const top = Y(C.cabTop) + 20, hh = h - 40;
    if (z.id === 'order') g += `<rect class="door" x="${z.x + 15}" y="${top}" width="${z.w - 30}" height="160" rx="8"/><rect class="handle" x="${z.x + z.w / 2 - 50}" y="${top + 70}" width="100" height="18" rx="9"/>
      <rect class="door" x="${z.x + 15}" y="${top + 180}" width="${z.w - 30}" height="${hh - 180}" rx="8"/>`;
    else g += `<rect class="door" x="${z.x + 15}" y="${top}" width="${z.w - 30}" height="${hh}" rx="8"/><rect class="handle" x="${z.x + 30}" y="${top + hh / 2 - 60}" width="18" height="120" rx="9"/>`;
    const words = [], mx = Math.floor((z.w - 70) / 19); let cur = '';
    for (const w of z.below.split(' ')) { if ((cur + ' ' + w).trim().length > mx && cur) { words.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) words.push(cur);
    words.forEach((w, k) => g += `<text class="lbl xs" x="${z.x + z.w / 2 + 12}" y="${top + hh / 2 + 30 + (k - words.length / 2) * 44}" text-anchor="middle" style="fill:#fff">${w}</text>`);
    g += dimH(z.x, z.x + z.w, Y(C.clear) + 120, z.w);
  });
  g += dimH(0, C.L, Y(C.clear) + 250, '1600') + dimV(Y(C.cabTop), Y(C.clear), -110, '730');
  return `<svg class="bp" viewBox="-260 -40 2120 1200">${g}</svg>`;
}

// ---- Sơ đồ mặt bằng quán ----
function siteSVG() {
  const AW = 4000, AH = 3500, cx0 = 1200, cy0 = 1300, C = CART;
  let g = `<rect class="area" x="0" y="0" width="${AW}" height="${AH}"/>
    <rect class="road" x="-200" y="${AH}" width="${AW + 400}" height="700"/><text class="lbl b" x="${AW / 2}" y="${AH + 400}" text-anchor="middle" style="fill:#fff">LÒNG ĐƯỜNG</text>
    <rect class="wall" x="-200" y="-260" width="${AW + 400}" height="260"/><text class="lbl sm" x="${AW / 2}" y="-90" text-anchor="middle" style="fill:#fff">Tường / nhà phía sau</text>`;
  g += `<circle class="umb" cx="${cx0 + 800}" cy="${cy0 + 450}" r="1200"/><text class="lbl xs" x="${cx0 - 80}" y="${cy0 + 330}" text-anchor="middle">dù Ø2400</text>`;
  g += `<rect class="tbl2" x="300" y="150" width="1000" height="500" rx="20"/><text class="lbl xs" x="800" y="380" text-anchor="middle">Bàn phụ 1000×500</text><text class="lbl xs" x="800" y="490" text-anchor="middle">bếp ga + nồi trân châu</text>
    <rect class="item" x="1500" y="150" width="600" height="500" rx="20"/><text class="lbl xs" x="1800" y="380" text-anchor="middle">Tủ mát / thùng đá</text><text class="lbl xs" x="1800" y="490" text-anchor="middle">dự trữ 600×500</text>`;
  g += `<text class="lbl xs" x="${cx0 + 800}" y="${cy0 - 230}" text-anchor="middle">lối đứng bán</text>`;
  g += `<g transform="translate(${cx0},${cy0})"><rect class="cab" x="0" y="0" width="${C.L}" height="${C.W}" rx="10"/><rect class="glass" x="0" y="${C.W - 14}" width="${C.L}" height="14"/>
    <text class="lbl sm b" x="${C.L / 2}" y="${C.W / 2 + 10}" text-anchor="middle" style="fill:#fff">XE 1600×700</text></g>`;
  g += `<rect class="wait" x="${cx0 - 200}" y="${cy0 + C.W + 60}" width="${C.L + 400}" height="1100" rx="30"/><text class="lbl sm" x="${cx0 + 800}" y="${cy0 + C.W + 640}" text-anchor="middle">Khách đứng chờ / gọi món</text>`;
  g += `<rect class="stool" x="250" y="2200" width="400" height="400" rx="200"/><rect class="stool" x="250" y="2750" width="400" height="400" rx="200"/><text class="lbl xs" x="450" y="2130" text-anchor="middle">ghế chờ</text>`;
  g += `<rect class="board" x="3200" y="2150" width="600" height="250" rx="10"/><text class="lbl xs" x="3500" y="2100" text-anchor="middle">bảng menu chữ A</text>`;
  g += `<circle class="bin" cx="3550" cy="1500" r="200"/><text class="lbl xs" x="3550" y="1515" text-anchor="middle">rác</text>`;
  g += `<rect class="bike" x="3150" y="2650" width="700" height="800" rx="40"/><text class="lbl xs" x="3500" y="3060" text-anchor="middle">chỗ dừng xe máy</text><text class="lbl xs" x="3500" y="3160" text-anchor="middle">/ shipper</text>`;
  g += dimH(0, AW, -400, '4000') + dimV(0, AH, -230, '3500');
  g += dimH(cx0, cx0 + C.L, cy0 - 80, '1600') + dimV(cy0, cy0 + C.W, cx0 + C.L + 120, '700');
  g += dimV(650, cy0, 2750, '650') + dimV(cy0 + C.W + 60, cy0 + C.W + 1160, cx0 + C.L + 320, '1100');
  return `<svg class="bp site" viewBox="-500 -560 5000 4900">${g}</svg>`;
}

function dlSVG(id, name) {
  const el = document.querySelector('#' + id + ' svg'); if (!el) return;
  const css = [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).filter(t => t.includes('.bp')).join('\n'); } catch (e) { return ''; } }).join('\n');
  const root = getComputedStyle(document.documentElement), vars = ['--ink', '--mute', '--accent', '--line', '--panel'].map(v => v + ':' + root.getPropertyValue(v)).join(';');
  const src = el.outerHTML.replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg" style="${vars};background:#fff"`).replace('>', `><style>${css}</style>`);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' })); a.download = name + '.svg'; a.click();
}
A.dl = v => { const [id, name] = v.split('|'); dlSVG(id, name); };
A.print = () => window.print();
A.view = v => { UI.view = v; try { localStorage.setItem('trasua_view', v); } catch (e) { } dirty(); };
A.labels3d = () => { UI.labels3d = !UI.labels3d; if (T3.ok) T3.labels.visible = UI.labels3d; dirty(); };

function renderBanVe() {
  const total = BOM.reduce((a, b) => a + b[2], 0);
  const card = (id, title, desc, svg) => `<div class="card dwg" id="${id}"><div class="dwgh"><h3>${title}</h3><button class="btn tiny" data-a="dl" data-v="${id}|${id}">⬇ Tải SVG</button></div><p class="small mute">${desc}</p>${svg}</div>`;
  return `<div class="card noprint"><h2>🛠️ Bản vẽ xe trà sữa — đưa xưởng báo giá</h2>
      <p>Mô hình 3D ở trên: kéo để xoay, cuộn để phóng to. Tất cả kích thước tính bằng <b>mm</b>. Bạn có thể tải từng bản vẽ (SVG, mở bằng trình duyệt hoặc in) hoặc in cả trang ra PDF.</p>
      <div class="row"><button class="btn pri" data-a="print">🖨️ In / lưu PDF cả bộ</button><button class="btn" data-a="labels3d">${UI.labels3d ? 'Ẩn' : 'Hiện'} nhãn 3D</button></div></div>
    <div class="grid2">
      ${card('dwg-front', '1. Mặt trước (phía khách)', 'Biển LED 300, khoảng thoáng 300 để treo đèn, kính 3 mặt cao 600. 4 bình trà đặt sát kính để khách thấy màu.', frontSVG())}
      ${card('dwg-top', '2. Mặt bàn nhìn từ trên', 'Dải 200 sát kính đặt bình trà. Khu pha 500 phía người bán chia 5 khu theo thứ tự làm ly, đi một chiều trái → phải.', topSVG())}
      ${card('dwg-side', '3. Mặt bên', 'Mặt bàn cao 900 vừa tầm người đứng pha. Kính chắn bụi phía khách, phía người bán để trống.', sideSVG())}
      ${card('dwg-cab', '4. Tủ dưới (nhìn từ phía người bán)', 'Từ phía sau nhìn vào nên thứ tự ngăn ngược với mặt trước. Mỗi ngăn thẳng hàng với khu trên mặt bàn.', cabinetSVG())}
    </div>
    ${card('dwg-site', '5. Sơ đồ mặt bằng quán (4m × 3,5m)', 'Gợi ý bố trí trên vỉa hè/mặt bằng thuê: xe quay mặt ra đường, người bán đứng giữa xe và bàn phụ, khách đứng phía trước, chừa chỗ dừng xe máy và shipper.', siteSVG())}
    <div class="card"><h3>Bảng vật tư dự kiến</h3>
      <table class="tbl"><tr><th>Hạng mục</th><th>Kích thước (mm)</th><th>Giá dự kiến</th></tr>${BOM.map(b => `<tr><td>${b[0]}</td><td>${b[1]}</td><td class="num">${fmt(b[2])}</td></tr>`).join('')}
      <tr class="sum"><td><b>Tổng</b></td><td></td><td class="num"><b>${fmt(total)}</b></td></tr></table>
      <h3>Lưu ý khi đặt xưởng</h3>
      <ul class="small"><li>Inox 304 cho mặt bàn và khay (chịu nước đường, không gỉ); khung có thể inox 201 cho rẻ hơn.</li>
      <li>Thùng đá âm khoét lỗ mặt bàn 230×450, có ống xả nước tan xuống can nước thải ở ngăn dưới.</li>
      <li>Kính cường lực 5mm, phía khách có thể làm cửa lùa nhỏ 300 ở khu "Dập ly & giao" để đưa ly.</li>
      <li>Đi dây điện 12V âm trong khung tới biển LED và đèn dưới mái; ổ cắm 220V (qua inverter) cho máy dập ly.</li>
      <li>2 bánh trước có khóa; gầm 150 để dễ đẩy qua lề đường.</li></ul></div>`;
}

// ================= Cảnh 2D khi bán =================
function skyColor(t) {
  const h = t / 60;
  if (h < 5.5) return ['#1d2540', '#3b4466'];
  if (h < 7) return ['#f2c38f', '#cfe6f2'];
  if (h < 16.5) return ['#9fd3ec', '#e6f3f7'];
  if (h < 18.3) return ['#f0a66b', '#f7d9b0'];
  return ['#1b2236', '#33405e'];
}
function scene2D() {
  const [s1, s2] = skyColor(D.t), night = D.t > 18.3 * 60 || D.t < 5.5 * 60, rain = S.weather === 'mua';
  const walk = D.cust.filter(c => c.seg !== 'app'), apps = D.cust.filter(c => c.seg === 'app');
  const sunX = clamp((D.t - 330) / (1110 - 330), 0, 1) * 1500 + 50, sunY = 140 - Math.sin(clamp((D.t - 330) / 780, 0, 1) * Math.PI) * 100;
  let g = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient>
    <pattern id="rainp" width="40" height="40" patternUnits="userSpaceOnUse"><line x1="30" y1="0" x2="20" y2="30" stroke="#ffffff88" stroke-width="2"/></pattern></defs>
    <rect width="1600" height="560" fill="url(#sky)"/>
    ${night ? `<circle cx="1400" cy="80" r="30" fill="#f4f1de"/>` : `<circle cx="${sunX}" cy="${sunY}" r="34" fill="#ffd166" opacity="${rain ? .3 : 1}"/>`}
    <g opacity=".55"><rect x="20" y="190" width="300" height="200" fill="#8d99ae"/><rect x="60" y="130" width="40" height="80" fill="#8d99ae"/><text x="170" y="300" text-anchor="middle" font-size="28" fill="#fff" font-weight="700">KCN</text>
    <rect x="1150" y="230" width="260" height="160" fill="#c9a27e"/><polygon points="1140,232 1280,170 1420,232" fill="#a5714f"/><text x="1280" y="320" text-anchor="middle" font-size="24" fill="#fff" font-weight="700">TRƯỜNG</text>
    <rect x="1440" y="270" width="140" height="120" fill="#b5838d"/><rect x="380" y="290" width="120" height="100" fill="#b5838d"/></g>
    <rect y="390" width="1600" height="170" fill="${night ? '#4a4540' : '#cbbfae'}"/><rect y="530" width="1600" height="30" fill="${night ? '#2a2a2e' : '#6b6b70'}"/>
    <path d="M90 95 Q 300 20 510 95 Z" fill="#d1495b"/><rect x="298" y="95" width="6" height="110" fill="#555"/>
    <g transform="translate(140,110) scale(0.17)">${frontInner({ ground: false })}</g>
    ${night ? '<rect x="140" y="165" width="272" height="60" fill="#fff6c8" opacity=".25"/>' : ''}`;
  const show = walk.slice(0, 10);
  show.forEach((c, i) => {
    const x = 480 + i * 108, y = 478, sel = D.sel === c.id;
    const act = c.state === 'wait' ? 'take' : c.state === 'pay' ? 'pay' : 'sel';
    const icon = c.state === 'wait' ? '💬' : c.state === 'pay' ? '💰' : c.items.filter(t => t.done).length + '/' + c.items.length;
    g += `<g class="fig" data-a="${act}" data-v="${c.id}">
      ${sel ? `<ellipse cx="${x}" cy="${y + 8}" rx="44" ry="12" fill="#ffb703" opacity=".8"/>` : ''}
      <text x="${x}" y="${y}" font-size="86" text-anchor="middle">${c.emoji}</text>
      <circle cx="${x}" cy="${y - 130}" r="28" fill="#fffaf2" stroke="#0002" stroke-width="2"/>
      <circle data-ring="${c.id}" cx="${x}" cy="${y - 130}" r="28" fill="none" stroke="#2f8f4e" stroke-width="6" stroke-dasharray="175.9" stroke-dashoffset="0" transform="rotate(-90 ${x} ${y - 130})"/>
      <text x="${x}" y="${y - 121}" font-size="${icon.length > 2 ? 20 : 24}" text-anchor="middle" font-weight="700" fill="#2e2218">${icon}</text>
      <text x="${x}" y="${y + 36}" font-size="22" font-weight="700" text-anchor="middle" fill="${night ? '#eee' : '#2e2218'}">${c.items.length} ly</text></g>`;
  });
  if (walk.length > 10) g += `<text x="1520" y="470" font-size="30" font-weight="700">+${walk.length - 10}</text>`;
  apps.forEach((c, i) => {
    const x = 1500 - i * 120;
    if (c.driver) g += `<g class="fig" data-a="${c.ready ? 'handoff' : 'sel'}" data-v="${c.id}"><text x="${x}" y="520" font-size="84" text-anchor="middle">🛵</text><text x="${x}" y="548" font-size="20" font-weight="700" text-anchor="middle" fill="#fff">#${c.id} ${c.ready ? '✔ giao' : '⏳'}</text></g>`;
  });
  const pend = apps.filter(c => !c.driver).length;
  if (pend) g += `<g><rect x="430" y="110" width="150" height="44" rx="22" fill="#ee4d2d"/><text x="505" y="140" font-size="20" text-anchor="middle" fill="#fff" font-weight="700">📱 ${pend} đơn app</text></g>`;
  if (rain) g += `<rect width="1600" height="560" fill="url(#rainp)"/>`;
  g += `<text x="24" y="44" font-size="34" font-weight="800" fill="${night ? '#fff' : '#2e2218'}" font-family="JetBrains Mono">${hhmm(D.t)}</text><text x="130" y="44" font-size="28">${W(S.weather).icon}</text>`;
  if (D.cup) g += `<text x="400" y="380" font-size="40">🥤</text>`;
  return `<svg class="scene2d bp" viewBox="0 0 1600 560">${g}</svg>`;
}

// ================= 3D (three.js, tải khi cần) =================
const T3 = { ok: false, loading: false, mode: null, cust: new Map(), bikes: new Map() };
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function ensure3D() {
  if (T3.ok || T3.loading) return; T3.loading = true;
  try {
    if (!window.THREE) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
    if (!THREE.OrbitControls) await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
    init3D(); T3.ok = true; dirty();
  } catch (e) { $('#stage3d').innerHTML = '<p class="empty" style="padding:20px">Không tải được thư viện 3D (cần mạng). Dùng chế độ 2D nhé.</p>'; }
  T3.loading = false;
}
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; }
function textSprite(text, o = {}) {
  const size = o.size || 44, lines = String(text).split('\n');
  const m = document.createElement('canvas').getContext('2d'); m.font = `600 ${size}px "Be Vietnam Pro", sans-serif`;
  const w = Math.ceil(Math.max(...lines.map(l => m.measureText(l).width)) + size), h = Math.ceil(lines.length * size * 1.25 + size * 0.5);
  const tex = canvasTex(w, h, (x) => {
    x.fillStyle = o.bg || 'rgba(255,250,242,.92)'; const r = size * .4;
    x.beginPath(); x.moveTo(r, 0); x.arcTo(w, 0, w, h, r); x.arcTo(w, h, 0, h, r); x.arcTo(0, h, 0, 0, r); x.arcTo(0, 0, w, 0, r); x.fill();
    x.font = `600 ${size}px "Be Vietnam Pro", sans-serif`; x.fillStyle = o.color || '#2e2218'; x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((l, i) => x.fillText(l, w / 2, size * .25 + size * 1.25 * (i + .5)));
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const sc = o.scale || 0.12; sp.scale.set(sc * w / h, sc, 1); sp.renderOrder = 10; return sp;
}
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? .6, metalness: o.m ?? 0, transparent: o.op !== undefined, opacity: o.op ?? 1, emissive: o.em || 0x000000, emissiveIntensity: o.ei || 1, map: o.map || null });
function box(w, h, d, m, x, y, z) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; return b; }
function cyl(rt, rb, h, m, x, y, z, seg = 24) { const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); c.position.set(x, y, z); c.castShadow = true; return c; }

function buildCart() {
  const C = CART, mm = v => v / 1000, g = new THREE.Group(), L = mm(C.L), Wd = mm(C.W);
  const inox = mat(0xcfd4d9, { m: .7, r: .3 }), glass = mat(0x9fd3ea, { op: .22, r: .1 }), post = mat(0xb8bec4, { m: .6, r: .35 });
  const xL = -L / 2, zF = Wd / 2; // mặt trước ở +z
  for (const x of [xL + .17, -xL - .17]) for (const z of [-.25, .25]) { const w = cyl(.1, .1, .05, mat(0x222222), x, .1, z); w.rotation.x = Math.PI / 2; g.add(w); }
  const menuTex = canvasTex(1600, 730, (x, w, h) => {
    x.fillStyle = '#7a4a2a'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff3df'; x.fillRect(330, 50, 1000, 560);
    x.fillStyle = '#7a4a2a'; x.font = '800 80px "Be Vietnam Pro"'; x.textAlign = 'center'; x.fillText('MENU', 830, 150);
    x.font = '600 52px "Be Vietnam Pro"'; DRINKS.forEach((d, i) => { x.textAlign = 'left'; x.fillText(d.name, 380, 240 + i * 72); x.textAlign = 'right'; x.fillText(S ? fk(S.price.drinks[d.id].M) + ' / ' + fk(S.price.drinks[d.id].L) : '', 1290, 240 + i * 72); });
    x.fillStyle = '#fff'; x.fillRect(60, 80, 200, 200); x.fillStyle = '#2e2218'; x.textAlign = 'center'; x.font = '700 50px "Be Vietnam Pro"'; x.fillText('QR', 160, 195);
  });
  const cabM = mat(0x7a4a2a), cab = new THREE.Mesh(new THREE.BoxGeometry(L, mm(C.cabTop - C.clear), Wd), [cabM, cabM, cabM, cabM, mat(0xffffff, { map: menuTex }), cabM]);
  cab.position.set(0, mm(C.clear + (C.cabTop - C.clear) / 2), 0); cab.castShadow = true; g.add(cab);
  g.add(box(L + .04, .02, Wd + .04, inox, 0, mm(C.counter) - .01, 0));
  const gh = mm(C.glassTop - C.counter), gy = mm(C.counter) + gh / 2;
  g.add(box(L - .08, gh, .008, glass, 0, gy, zF - .004)); g.add(box(.008, gh, Wd - .08, glass, xL + .004, gy, 0)); g.add(box(.008, gh, Wd - .08, glass, -xL - .004, gy, 0));
  const ph = mm(C.postTop - C.counter);
  for (const x of [xL + .02, -xL - .02]) for (const z of [zF - .02, -zF + .02]) g.add(box(.04, ph, .04, post, x, mm(C.counter) + ph / 2, z));
  g.add(box(L + .04, .02, Wd + .04, post, 0, mm(C.postTop), 0));
  const signTex = canvasTex(1600, 300, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#d1495b'); gr.addColorStop(1, '#a0522d'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '800 150px "Be Vietnam Pro"'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🧋 ' + shopName(), w / 2, h / 2 + 8); });
  T3.signMat = mat(0xffffff, { map: signTex, em: 0xffffff, ei: .15 });
  g.add(box(L, mm(C.signH), .06, T3.signMat, 0, mm(C.H - C.signH / 2), zF - .03));
  // bình trà
  T3.pots = {};
  const zP = zF - mm(C.frontStrip) / 2, ph2 = mm(C.pot.h);
  TEA_ORDER.forEach((tea, i) => {
    const x = xL + mm(POTS_X[i]);
    g.add(cyl(.09, .09, ph2, mat(0xe8f4f8, { op: .35, r: .1 }), x, mm(C.counter) + ph2 / 2, zP));
    g.add(cyl(.095, .095, .025, inox, x, mm(C.counter) + ph2 + .012, zP));
    const lg = new THREE.CylinderGeometry(.08, .08, ph2 - .04, 20); lg.translate(0, (ph2 - .04) / 2, 0);
    const liq = new THREE.Mesh(lg, mat(new THREE.Color(TEAS[tea].color), { r: .3 })); liq.position.set(x, mm(C.counter) + .015, zP); g.add(liq); T3.pots[tea] = liq;
    const tap = box(.03, .03, .05, inox, x, mm(C.counter) + .06, zP + .1); g.add(tap);
  });
  g.add(cyl(.07, .07, .22, mat(0xb79ad6), xL + 1.11, mm(C.counter) + .11, zP));
  g.add(cyl(.045, .045, .28, mat(0xe9c46a, { op: .85 }), xL + 1.26, mm(C.counter) + .14, zP));
  // khu pha
  const zs = zoneX(), zB = zF - mm(C.frontStrip) - mm(C.W - C.frontStrip) / 2, cy = mm(C.counter);
  const zc = id => { const z = zs.find(q => q.id === id); return xL + mm(z.x + z.w / 2); };
  g.add(box(.2, .15, .03, mat(0xffffff), zc('order'), cy + .08, zB + .1)); g.add(box(.22, .02, .14, mat(0x333333), zc('order'), cy + .01, zB - .1));
  for (let k = 0; k < 3; k++) g.add(cyl(.045, .04, .2, inox, zc('mix') - .12 + k * .12, cy + .1, zB + .08));
  g.add(cyl(.07, .07, .14, mat(0xfff5e1), zc('mix') - .09, cy + .07, zB - .13)); g.add(cyl(.05, .05, .12, mat(0x2a6fdb), zc('mix') + .09, cy + .06, zB - .13));
  g.add(box(.23, .015, .45, mat(0xdff3fb, { r: .2 }), zc('ice'), cy + .006, zB));
  const tops = ['tcden', 'tctrang', 'tcsoi', 'tc3q', 'thach', null];
  tops.forEach((t, k) => { const col = k % 2, row = Math.floor(k / 2); g.add(box(.17, .02, .155, mat(t ? new THREE.Color(TP[t].color) : 0xcfd4d9, { r: .4 }), zc('top') - .088 + col * .176, cy + .012, zB - .162 + row * .162)); });
  const sealer = new THREE.Group(); sealer.add(box(.22, .12, .33, mat(0xd1495b), 0, .06, 0)); sealer.add(box(.08, .38, .1, mat(0xd1495b), 0, .31, -.11)); sealer.add(box(.2, .06, .2, inox, 0, .45, .02));
  sealer.position.set(zc('seal'), cy, zB + .03); g.add(sealer);
  g.add(cyl(.045, .04, .3, mat(0xf5f5f5, { op: .7 }), zc('seal') - .08, cy + .15, zB - .2)); g.add(cyl(.05, .045, .34, mat(0xf5f5f5, { op: .7 }), zc('seal') + .07, cy + .17, zB - .2));
  const lamp = new THREE.PointLight(0xfff2cc, 0, 3); lamp.position.set(0, mm(C.postTop) - .1, 0); g.add(lamp); T3.lamp = lamp;
  return g;
}
function buildSite() {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), mat(0xcbbfae, { r: .95 })); ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, .6); ground.receiveShadow = true; g.add(ground);
  const grid = new THREE.GridHelper(8, 20, 0xb3a690, 0xb3a690); grid.position.set(0, .002, .6); grid.material.opacity = .35; grid.material.transparent = true; g.add(grid);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 3), mat(0x55565c, { r: .9 })); road.rotation.x = -Math.PI / 2; road.position.set(0, .003, 3.6); g.add(road);
  const pole = cyl(.025, .025, 2.5, mat(0x666666), 1.15, 1.25, -.85); g.add(pole);
  const umb = new THREE.Mesh(new THREE.ConeGeometry(1.25, .4, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xd1495b, side: THREE.DoubleSide, roughness: .8 })); umb.position.set(1.15, 2.6, -.85); umb.castShadow = true; g.add(umb);
  const t = new THREE.Group(); t.add(box(1.0, .03, .5, mat(0x9c7a5b), 0, .74, 0)); for (const x of [-.45, .45]) for (const z of [-.2, .2]) t.add(box(.04, .74, .04, mat(0x666666), x, .37, z));
  t.add(box(.35, .1, .3, mat(0x333333), -.2, .8, 0)); t.add(cyl(.13, .13, .2, mat(0xcfd4d9, { m: .6, r: .3 }), -.2, .95, 0)); t.add(box(.4, .5, .4, mat(0x2a6fdb), .25, 1.0, 0));
  t.position.set(-.2, 0, -1.25); g.add(t);
  const board = box(.6, .9, .05, mat(0x2e2e2e), -1.5, .45, 1.1); board.rotation.x = -.12; g.add(board);
  const bt = textSprite('MENU\nTrà sữa từ ' + (S ? fk(Math.min(...DRINKS.map(d => S.price.drinks[d.id].M))) : '18k'), { size: 40, bg: 'rgba(46,46,46,.95)', color: '#fff', scale: .25 }); bt.position.set(-1.5, .6, 1.17); g.add(bt);
  for (const z of [.0, -.5]) g.add(cyl(.17, .14, .45, mat(0xd62828), -1.7, .225, z));
  g.add(cyl(.2, .17, .6, mat(0x2d6a4f), 1.5, .3, -.6));
  return g;
}
function buildDims() {
  const g = new THREE.Group(), m = new THREE.LineBasicMaterial({ color: 0xa0522d });
  const line = (a, b, label, off) => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]); g.add(new THREE.Line(geo, m));
    const s = textSprite(label, { size: 40, color: '#a0522d', scale: .1 }); s.position.set((a[0] + b[0]) / 2 + off[0], (a[1] + b[1]) / 2 + off[1], (a[2] + b[2]) / 2 + off[2]); g.add(s);
  };
  line([-.8, .0, .55], [.8, .0, .55], '1600 mm', [0, .07, 0]);
  line([.95, 0, .35], [.95, 0, -.35], '700 mm', [.12, .05, 0]);
  line([-.95, 0, .35], [-.95, 2.1, .35], '2100 mm', [-.15, 0, 0]);
  line([-.88, 0, .45], [-.88, .9, .45], 'mặt bàn 900', [-.15, 0, 0]);
  return g;
}
function buildLabels() {
  const g = new THREE.Group(), zs = zoneX();
  zs.forEach((z, i) => { const s = textSprite((i + 1) + '. ' + z.name, { size: 38, scale: .085 }); s.position.set(-.8 + (z.x + z.w / 2) / 1000, 1.12 + (i % 2) * .13, -.3); g.add(s); });
  const s1 = textSprite('4 bình trà Ø180 sát kính', { size: 38, scale: .085 }); s1.position.set(-.17, 1.62, .3); g.add(s1);
  const s2 = textSprite('Tủ 5 ngăn: tiền · khô · nước · ắc quy · rác', { size: 38, scale: .085 }); s2.position.set(0, .5, -.45); g.add(s2);
  const s3 = textSprite('Bàn phụ: bếp ga + nồi trân châu', { size: 38, scale: .085 }); s3.position.set(-.2, 1.5, -1.25); g.add(s3);
  return g;
}
function init3D() {
  const el = $('#stage3d'); el.innerHTML = '';
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.shadowMap.enabled = true; el.appendChild(r.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(42, 2, .05, 60);
  const ctl = new THREE.OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI / 2 - .03; ctl.minDistance = 1; ctl.maxDistance = 12;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a66, .75); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, .85); sun.position.set(3, 6, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 }); scene.add(sun);
  scene.add(buildSite()); scene.add(buildCart());
  const dims = buildDims(), labels = buildLabels(); scene.add(dims); scene.add(labels); labels.visible = UI.labels3d;
  const people = new THREE.Group(); scene.add(people);
  const rainGeo = new THREE.BufferGeometry(), rp = new Float32Array(1200 * 3);
  for (let i = 0; i < 1200; i++) { rp[i * 3] = (Math.random() - .5) * 8; rp[i * 3 + 1] = Math.random() * 4; rp[i * 3 + 2] = (Math.random() - .5) * 6 + .6; }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xcfe3ff, size: .03, transparent: true, opacity: .7 })); scene.add(rain);
  Object.assign(T3, { r, scene, cam, ctl, hemi, sun, dims, labels, people, rain, el });
  // bấm vào khách trong 3D
  const ray = new THREE.Raycaster(), v = new THREE.Vector2(); let down = null;
  r.domElement.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
  r.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6 || T3.mode !== 'game') return;
    const b = r.domElement.getBoundingClientRect(); v.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1);
    ray.setFromCamera(v, cam); const hit = ray.intersectObjects(people.children, true)[0];
    if (hit) { let o = hit.object; while (o && !o.userData.cid) o = o.parent; if (o) { const c = D && D.cust.find(x => x.id === o.userData.cid); if (c) { if (c.state === 'wait') A.take(c.id); else if (c.state === 'pay') A.pay(c.id); else if (c.state === 'new') A.appAccept(c.id); else if (c.seg === 'app' && c.ready && c.driver) A.handoff(c.id); else A.sel(c.id); } } }
  });
  window.addEventListener('resize', size3D);
}
function size3D() {
  if (T3.ok && T3.mode === 'game' && T3.el && T3.el.clientWidth !== T3.lastW) { T3.lastW = T3.el.clientWidth; const m = T3.mode; T3.mode = null; setMode3D(m); return; } if (!T3.ok && !T3.r) return; const w = T3.el.clientWidth, h = T3.el.clientHeight; if (!w || !h) return; T3.r.setSize(w, h, false); T3.r.domElement.style.width = '100%'; T3.r.domElement.style.height = '100%'; T3.cam.aspect = w / h; T3.cam.updateProjectionMatrix(); }
function setMode3D(mode) {
  if (T3.mode === mode) return; T3.mode = mode;
  T3.dims.visible = mode === 'blue'; T3.labels.visible = mode === 'blue' && UI.labels3d; T3.people.visible = mode === 'game';
  if (mode === 'blue') { T3.cam.position.set(2.3, 1.9, 2.8); T3.ctl.target.set(0, .9, 0); }
  else { const k = Math.max(1, 1.5 / Math.max(.5, T3.el.clientWidth / Math.max(1, T3.el.clientHeight))); T3.cam.position.set(.6 * k, 3.1 * k, 4.2 + 2.2 * k); T3.ctl.target.set(.5, .7, 1.0); }
  T3.ctl.update(); size3D();
}
const SEG_COL = { hs: 0xf1f1f1, cn: 0x2f5d8a, dc: 0xe07a5f, app: 0x00b14f };
function makePerson(c) {
  const g = new THREE.Group(), h = c.seg === 'hs' ? 1.5 : 1.65, col = SEG_COL[c.seg];
  g.add(cyl(.15, .17, h - .55, mat(col), 0, (h - .55) / 2 + .25, 0));
  g.add(cyl(.12, .12, .5, mat(c.seg === 'hs' ? 0x1d3557 : 0x3d3d3d), 0, .25, 0));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(.11, 16, 12), mat(0xf1c27d)).translateY(h - .17));
  if (c.seg === 'cn') g.add(box(.32, .3, .32, mat(0xf77f00), 0, h - .55, 0));
  if (c.seg === 'hs') g.add(box(.26, .32, .12, mat(0x2a9d8f), 0, h - .5, -.17));
  g.userData.cid = c.id; g.userData.h = h;
  const ring = new THREE.Mesh(new THREE.RingGeometry(.2, .26, 24), new THREE.MeshBasicMaterial({ color: 0xffb703, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .01; ring.visible = false; g.add(ring); g.userData.ring = ring;
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(.36, .04), new THREE.MeshBasicMaterial({ color: 0x2f8f4e, depthTest: false })); bar.position.y = h + .1; bar.renderOrder = 11; g.add(bar); g.userData.bar = bar;
  return g;
}
function makeBike() {
  const g = new THREE.Group();
  g.add(box(.25, .3, 1.1, mat(0x222222), 0, .4, 0));
  for (const z of [-.45, .45]) { const w = cyl(.2, .2, .08, mat(0x111111), 0, .2, z); w.rotation.z = Math.PI / 2; g.add(w); }
  g.add(cyl(.15, .17, .7, mat(0x00b14f), 0, .95, .05)); g.add(new THREE.Mesh(new THREE.SphereGeometry(.13, 14, 10), mat(0x00b14f)).translateY(1.42).translateZ(.05));
  g.add(box(.4, .35, .35, mat(0x00b14f), 0, .95, -.45));
  return g;
}
function update3D() {
  if (!T3.ok) return;
  for (const tea in T3.pots) T3.pots[tea].scale.y = Math.max(.02, lvl(tea));
  let night = false;
  if (T3.mode === 'game' && D) {
    const [s1] = skyColor(D.t); T3.scene.background = new THREE.Color(s1);
    night = D.t > 18.3 * 60 || D.t < 5.5 * 60;
    T3.rain.visible = S.weather === 'mua';
    const seen = new Set(), walk = D.cust.filter(c => c.seg !== 'app');
    walk.forEach((c, i) => {
      seen.add(c.id); let p = T3.cust.get(c.id);
      if (!p) { p = makePerson(c); T3.people.add(p); T3.cust.set(c.id, p); p.position.set(4, 0, 1.2); }
      const row = Math.floor(i / 6), tx = -.7 + (i % 6) * .58 + row * .29, tz = 1.35 + row * .65;
      p.position.x += (tx - p.position.x) * .08; p.position.z += (tz - p.position.z) * .08; p.rotation.y = Math.PI;
      const key = c.state + (c.items.filter(x => x.done).length) + (D.sel === c.id);
      if (p.userData.key !== key) {
        p.userData.key = key; if (p.userData.tag) { p.remove(p.userData.tag); p.userData.tag.material.map.dispose(); p.userData.tag.material.dispose(); }
        const icon = c.state === 'wait' ? '💬 gọi món' : c.state === 'pay' ? '💰 trả tiền' : '⏳ ' + c.items.filter(x => x.done).length + '/' + c.items.length;
        const tag = textSprite(c.emoji + ' ' + c.items.length + ' ly\n' + icon, { size: 40, scale: .24 }); tag.position.y = p.userData.h + .4; p.add(tag); p.userData.tag = tag;
        p.userData.ring.visible = D.sel === c.id;
      }
      const pct = patPct(c); p.userData.bar.scale.x = Math.max(.02, pct); p.userData.bar.material.color.set(pct < .3 ? 0xc2453a : pct < .6 ? 0xd07a14 : 0x2f8f4e);
      p.userData.bar.quaternion.copy(T3.cam.quaternion); p.userData.tag.visible = true;
    });
    for (const [id, p] of T3.cust) if (!seen.has(id)) { T3.people.remove(p); T3.cust.delete(id); }
    const seenB = new Set();
    D.cust.filter(c => c.seg === 'app' && c.driver).forEach((c, i) => {
      seenB.add(c.id); let b = T3.bikes.get(c.id);
      if (!b) { b = makeBike(); b.userData.cid = c.id; T3.people.add(b); T3.bikes.set(c.id, b); b.position.set(2.3 + i * .8, 0, 1.2); b.rotation.y = .3; }
      const key = 'b' + c.ready;
      if (b.userData.key !== key) { b.userData.key = key; if (b.userData.tag) b.remove(b.userData.tag); const tg = textSprite('🛵 #' + c.id + (c.ready ? ' ✔ bấm giao' : ' ⏳ chờ ly'), { size: 40, scale: .22 }); tg.position.y = 1.9; b.add(tg); b.userData.tag = tg; }
    });
    for (const [id, b] of T3.bikes) if (!seenB.has(id)) { T3.people.remove(b); T3.bikes.delete(id); }
    if (T3.rain.visible) { const a = T3.rain.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - .08; if (y < 0) y = 4; a.setY(i, y); } a.needsUpdate = true; }
  } else { T3.scene.background = new THREE.Color(document.documentElement.matches('[data-theme=dark]') || matchMedia('(prefers-color-scheme: dark)').matches ? 0x1e1b16 : 0xece4d6); T3.rain.visible = false; }
  T3.hemi.intensity = night ? .3 : .75; T3.sun.intensity = night ? .1 : .85; T3.lamp.intensity = night ? 1.6 : 0; T3.signMat.emissiveIntensity = night ? .45 : .15;
  T3.ctl.update(); T3.r.render(T3.scene, T3.cam);
}

// ================= Điều phối khung cảnh =================
function stageWant() {
  if (UI.tab === 'banve') return 'blue';
  if (UI.tab === 'ban' && S.phase === 'open' && UI.view !== 'bang') return UI.view;
  return null;
}
function renderStage() {
  const want = stageWant(), st = $('#stage'), s2 = $('#stage2d'), s3 = $('#stage3d');
  st.style.display = want ? '' : 'none';
  s2.style.display = want === '2d' ? '' : 'none'; s3.style.display = want === '3d' || want === 'blue' ? '' : 'none';
  if (want === '2d') s2.innerHTML = scene2D();
  if (want === '3d' || want === 'blue') { if (!T3.ok) { if (!T3.loading) { s3.innerHTML = '<p class="empty" style="padding:20px">Đang tải mô hình 3D…</p>'; ensure3D(); } } else { setMode3D(want === 'blue' ? 'blue' : 'game'); size3D(); } }
}
function updateStage() {
  const want = stageWant();
  if (want === '2d' && D) document.querySelectorAll('[data-ring]').forEach(el => {
    const c = D.cust.find(x => x.id === +el.dataset.ring); if (!c) return; const p = patPct(c);
    el.setAttribute('stroke-dashoffset', 175.9 * (1 - p)); el.setAttribute('stroke', p < .3 ? '#c2453a' : p < .6 ? '#d07a14' : '#2f8f4e');
  });
  if ((want === '3d' || want === 'blue') && T3.ok) update3D();
}
