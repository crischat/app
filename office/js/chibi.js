/* Warehouse Office — vẽ nhân vật chibi bằng SVG (không cần ảnh ngoài) */
(function (MD) {
  'use strict';
  const C = {};

  /* Kiểu nhân vật theo giới tính, chọn trong ô Sửa thông tin. Màu tóc, màu áo chỉnh riêng được. */
  C.PRESETS = {
    'm-suit':   { gender: 'nam', label: 'Vest, cà vạt, rẽ ngôi', skin: '#f1c7a5', hair: '#1f2937', style: 'side', shirt: '#1e3a5f', acc: ['tie'] },
    'm-glass':  { gender: 'nam', label: 'Tóc ngắn, đeo kính', skin: '#efc19d', hair: '#2b2118', style: 'short', shirt: '#3b82f6', acc: ['glasses'] },
    'm-short':  { gender: 'nam', label: 'Tóc ngắn, sơ mi', skin: '#f1c7a5', hair: '#111827', style: 'short', shirt: '#0ea5e9', acc: [] },
    'm-spiky':  { gender: 'nam', label: 'Tóc dựng, tai nghe', skin: '#f6d2b8', hair: '#f5c542', style: 'spiky', shirt: '#22c55e', acc: ['headphones'] },
    'm-cap':    { gender: 'nam', label: 'Mũ lưỡi trai', skin: '#e9b48f', hair: '#3f2a1e', style: 'short', shirt: '#f97316', acc: ['cap'] },
    'm-curly':  { gender: 'nam', label: 'Tóc xoăn, râu', skin: '#e9b48f', hair: '#2b2118', style: 'curly', shirt: '#334155', acc: ['beard'] },
    'm-gray':   { gender: 'nam', label: 'Tóc bạc, kính, ria', skin: '#f6d2b8', hair: '#e5e7eb', style: 'curly', shirt: '#475569', acc: ['glasses', 'mustache', 'tie'] },
    'm-bald':   { gender: 'nam', label: 'Hói, râu quai nón', skin: '#f1c7a5', hair: '#6b4a32', style: 'bald', shirt: '#e2e8f0', acc: ['glasses', 'beard'] },
    'f-long':   { gender: 'nu', label: 'Tóc dài, nơ vàng', skin: '#f8d7c0', hair: '#2a1d17', style: 'long', shirt: '#60a5fa', acc: ['bow'] },
    'f-pony':   { gender: 'nu', label: 'Đuôi ngựa, nơ hồng', skin: '#f8d7c0', hair: '#a0522d', style: 'ponytail', shirt: '#14b8a6', acc: ['bow-pink'] },
    'f-bob':    { gender: 'nu', label: 'Tóc bob, khuyên tai', skin: '#f6d2b8', hair: '#1f2937', style: 'bob', shirt: '#ec4899', acc: ['earrings'] },
    'f-bun':    { gender: 'nu', label: 'Búi tóc, kính', skin: '#f8d7c0', hair: '#3f2a1e', style: 'bun', shirt: '#a855f7', acc: ['glasses'] },
    'f-suit':   { gender: 'nu', label: 'Tóc dài, vest công sở', skin: '#f6d2b8', hair: '#4a2c1d', style: 'long', shirt: '#1e3a5f', acc: ['collar', 'earrings'] },
    'f-curly':  { gender: 'nu', label: 'Tóc xoăn, kính', skin: '#f6d2b8', hair: '#7c3aed', style: 'curly', shirt: '#f43f5e', acc: ['glasses'] },
    'f-cap':    { gender: 'nu', label: 'Tóc đỏ, mũ lưỡi trai', skin: '#f8d7c0', hair: '#dc4b3c', style: 'long', shirt: '#f97316', acc: ['cap'] },
    'f-gray':   { gender: 'nu', label: 'Tóc bạc búi, kính', skin: '#f6d2b8', hair: '#d1d5db', style: 'bun', shirt: '#475569', acc: ['glasses', 'collar'] }
  };
  /* Tên kiểu cũ (bản đầu) → kiểu mới */
  C.ALIAS = { grandpa: 'm-gray', bald: 'm-bald', beard: 'm-curly', bow: 'f-long', spiky: 'm-spiky', cap: 'f-cap', curlyg: 'f-curly', pony: 'f-pony', short: 'm-short', bun: 'f-bun' };

  C.keysFor = (gender) => Object.keys(C.PRESETS).filter((k) => C.PRESETS[k].gender === gender);
  C.presetKey = (look) => (C.PRESETS[look] ? look : C.ALIAS[look] || null);

  /* Ghép kiểu có sẵn với màu riêng của từng người */
  C.resolve = (s) => {
    const key = C.presetKey(s.look) || C.keysFor(s.gender === 'nu' ? 'nu' : 'nam')[0];
    const p = Object.assign({}, C.PRESETS[key]);
    if (s.hairColor) p.hair = s.hairColor;
    if (s.shirtColor) p.shirt = s.shirtColor;
    if (s.skinColor) p.skin = s.skinColor;
    return p;
  };

  const curlyBlob = (cx, cy, r, color, n) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (Math.PI * i) / (n - 1);
      s += `<circle cx="${(cx + Math.cos(a) * r).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.9).toFixed(1)}" r="8.5" fill="${color}"/>`;
    }
    return s;
  };

  function hairBack(p) {
    const h = p.hair;
    switch (p.style) {
      case 'long': return `<path d="M29 46 Q27 13 60 13 Q93 13 91 46 L93 84 Q82 89 77 72 L43 72 Q38 89 27 84Z" fill="${h}"/>`;
      case 'bob': return `<path d="M27 46 Q25 12 60 12 Q95 12 93 46 L93 66 Q87 72 80 66 L40 66 Q33 72 27 66Z" fill="${h}"/>`;
      case 'ponytail': return `<ellipse cx="91" cy="46" rx="9" ry="20" fill="${h}" transform="rotate(18 91 46)"/>`;
      case 'curly': return curlyBlob(60, 44, 27, h, 9) + (p.gender === 'nu' ? `<circle cx="32" cy="62" r="8" fill="${h}"/><circle cx="88" cy="62" r="8" fill="${h}"/>` : '') + `<circle cx="34" cy="54" r="7" fill="${h}"/><circle cx="86" cy="54" r="7" fill="${h}"/>`;
      case 'bun': return `<circle cx="60" cy="14" r="10" fill="${h}"/>`;
      default: return '';
    }
  }

  function hairFront(p) {
    const h = p.hair;
    switch (p.style) {
      case 'short': return `<path d="M32 47 Q29 15 60 15 Q91 15 88 47 Q85 30 70 29 Q60 34 48 29 Q36 31 32 47Z" fill="${h}"/>`;
      case 'side': return `<path d="M31 47 Q28 15 58 14 Q90 13 89 45 Q87 31 76 27 Q66 25 52 30 Q40 34 35 40 Q33 43 31 47Z" fill="${h}"/><path d="M52 30 Q60 20 76 22" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="2"/>`;
      case 'spiky': return `<path d="M31 45 L28 25 L39 30 L41 14 L52 23 L60 9 L67 23 L79 14 L81 30 L92 25 L89 45 Q82 30 60 30 Q38 30 31 45Z" fill="${h}"/>`;
      case 'long':
      case 'ponytail':
      case 'bun': return `<path d="M32 46 Q31 17 60 17 Q89 17 88 46 Q80 27 67 31 Q59 25 49 31 Q38 29 32 46Z" fill="${h}"/>`;
      case 'bob': return `<path d="M31 46 Q31 16 60 16 Q89 16 89 46 L85 33 Q60 29 35 33Z" fill="${h}"/>`;
      case 'curly': return `<path d="M33 40 Q36 20 60 20 Q84 20 87 40 Q74 30 60 31 Q46 30 33 40Z" fill="${h}"/>`;
      case 'bald': return `<ellipse cx="33" cy="50" rx="4" ry="7" fill="${h}"/><ellipse cx="87" cy="50" rx="4" ry="7" fill="${h}"/>`;
      default: return '';
    }
  }

  function body(p) {
    const a = p.acc || [];
    let s = `<path d="M36 98 Q36 72 60 72 Q84 72 84 98Z" fill="${p.shirt}"/>`;
    if (a.includes('tie') || a.includes('collar')) {
      s += '<path d="M51 73 L60 90 L69 73 L65 72 L60 80 L55 72Z" fill="#f8fafc"/>';
      if (a.includes('tie')) s += '<path d="M58 77 L60 80 L62 77 L63.5 91 L60 95 L56.5 91Z" fill="#dc2626"/>';
    } else s += '<path d="M54 72 L60 80 L66 72Z" fill="#fff" opacity=".85"/>';
    return s;
  }

  function accessories(p) {
    let s = '';
    const a = p.acc || [];
    if (a.includes('beard')) s += `<path d="M36 56 Q38 80 60 82 Q82 80 84 56 Q78 70 60 70 Q42 70 36 56Z" fill="${p.style === 'bald' ? '#6b4a32' : p.hair}"/>`;
    if (a.includes('mustache')) s += `<path d="M50 61 Q55 57 60 61 Q65 57 70 61 Q65 64 60 62 Q55 64 50 61Z" fill="${p.hair}"/>`;
    if (a.includes('glasses')) s += '<g fill="none" stroke="#1f2937" stroke-width="1.8"><circle cx="49" cy="49" r="6.5"/><circle cx="71" cy="49" r="6.5"/><path d="M55.5 49h9"/></g>';
    if (a.includes('earrings')) s += '<circle cx="32" cy="58" r="2.2" fill="#facc15"/><circle cx="88" cy="58" r="2.2" fill="#facc15"/>';
    if (a.includes('headphones')) s += '<path d="M30 48 Q30 14 60 14 Q90 14 90 48" fill="none" stroke="#2563eb" stroke-width="4"/><rect x="25" y="42" width="9" height="15" rx="4" fill="#2563eb"/><rect x="86" y="42" width="9" height="15" rx="4" fill="#2563eb"/>';
    if (a.includes('cap')) s += '<path d="M31 36 Q32 12 60 12 Q88 12 89 36Z" fill="#1d4ed8"/><path d="M30 36 Q60 30 98 38 Q94 42 60 39 Q40 39 30 40Z" fill="#1e40af"/><circle cx="60" cy="22" r="3" fill="#facc15"/>';
    if (a.includes('bow')) s += '<g transform="translate(40 20) rotate(-18)"><path d="M0 0 L-11 -7 L-11 7Z M0 0 L11 -7 L11 7Z" fill="#facc15"/><circle r="3" fill="#eab308"/></g>';
    if (a.includes('bow-pink')) s += '<g transform="translate(60 16)"><path d="M0 0 L-11 -7 L-11 7Z M0 0 L11 -7 L11 7Z" fill="#f472b6"/><circle r="3" fill="#ec4899"/></g>';
    return s;
  }

  function face(p, mood) {
    const nu = p.gender === 'nu';
    let eyes = `<g class="eyes"><ellipse cx="49" cy="49" rx="3.2" ry="4.2" fill="#1f2937"/><ellipse cx="71" cy="49" rx="3.2" ry="4.2" fill="#1f2937"/><circle cx="50.2" cy="47.6" r="1.1" fill="#fff"/><circle cx="72.2" cy="47.6" r="1.1" fill="#fff"/></g>`;
    if (nu) eyes += '<path d="M45.5 46 L43.5 44.5 M74.5 46 L76.5 44.5" stroke="#1f2937" stroke-width="1.4" stroke-linecap="round"/>';
    const brows = nu
      ? '<path d="M45 41.5 Q49 39.5 53 41.5 M67 41.5 Q71 39.5 75 41.5" fill="none" stroke="#3f2a1e" stroke-width="1.3" stroke-linecap="round"/>'
      : `<path d="M44.5 41.5 L53.5 40.5 M66.5 40.5 L75.5 41.5" fill="none" stroke="${p.style === 'bald' ? '#6b4a32' : p.hair === '#e5e7eb' ? '#9ca3af' : '#1f2937'}" stroke-width="2.4" stroke-linecap="round"/>`;
    const lip = nu ? '#e11d48' : '#7c2d12';
    let mouth = `<path d="M55 60 Q60 64 65 60" fill="none" stroke="${lip}" stroke-width="2" stroke-linecap="round"/>`;
    if (mood === 'done') {
      eyes = '<path d="M45 50 Q49 45 53 50 M67 50 Q71 45 75 50" fill="none" stroke="#1f2937" stroke-width="2.4" stroke-linecap="round"/>';
      mouth = `<path d="M53 58 Q60 67 67 58Z" fill="${lip}"/>`;
    } else if (mood === 'late') {
      mouth = `<path d="M54 63 Q57 60 60 63 Q63 66 66 63" fill="none" stroke="${lip}" stroke-width="2" stroke-linecap="round"/>`;
    } else if (mood === 'idle') {
      eyes = '<path d="M45 49 Q49 52 53 49 M67 49 Q71 52 75 49" fill="none" stroke="#1f2937" stroke-width="2.2" stroke-linecap="round"/>';
    } else if (mood === 'wait') {
      mouth = `<circle cx="60" cy="61" r="2.6" fill="${lip}"/>`;
    }
    const blush = `<ellipse cx="43" cy="57" rx="4" ry="2.4" fill="#fb7185" opacity="${nu ? '.6' : '.35'}"/><ellipse cx="77" cy="57" rx="4" ry="2.4" fill="#fb7185" opacity="${nu ? '.6' : '.35'}"/>`;
    const sweat = mood === 'late' ? '<path class="sweat" d="M86 32 Q90 39 86 42 Q82 39 86 32Z" fill="#7dd3fc"/>' : '';
    return brows + eyes + blush + mouth + sweat;
  }

  function desk(extra) {
    return `
      <rect x="6" y="92" width="108" height="9" rx="3" fill="#c08a5b"/>
      <rect x="10" y="101" width="100" height="17" rx="2" fill="#a06f45"/>
      <rect x="40" y="73" width="40" height="21" rx="3" fill="#334155"/>
      <text x="60" y="87" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9" font-weight="700" fill="#7dd3fc">&lt;/&gt;</text>
      <g class="mug"><rect x="14" y="83" width="10" height="10" rx="2" fill="#f8fafc"/><path d="M24 85 q4 0 4 3 q0 3 -4 3" fill="none" stroke="#f8fafc" stroke-width="1.6"/></g>
      <g class="plant"><rect x="96" y="84" width="11" height="9" rx="2" fill="#f1f5f9"/><path d="M101 84 Q95 70 99 66 Q102 74 101 84 Q104 70 110 68 Q108 78 101 84" fill="#22c55e"/></g>
      ${extra || ''}`;
  }

  /* Nhân vật người: who = object nhân sự (look, gender, màu riêng) hoặc tên kiểu; mood = work|idle|late|wait|done */
  C.person = (who, mood) => {
    const p = typeof who === 'string' ? C.resolve({ look: who }) : C.resolve(who || {});
    return `<svg class="chibi mood-${mood}" viewBox="0 0 120 120" aria-hidden="true">
      <g class="bob">
        ${hairBack(p)}
        ${body(p)}
        <circle cx="60" cy="47" r="28" fill="${p.skin}"/>
        <ellipse cx="32" cy="50" rx="4" ry="6" fill="${p.skin}"/><ellipse cx="88" cy="50" rx="4" ry="6" fill="${p.skin}"/>
        ${hairFront(p)}
        ${face(p, mood)}
        ${accessories(p)}
      </g>
      ${desk(`<g class="hands"><ellipse class="hand-l" cx="37" cy="91" rx="6" ry="4.5" fill="${p.skin}"/><ellipse class="hand-r" cx="83" cy="91" rx="6" ry="4.5" fill="${p.skin}"/></g>`)}
    </svg>`;
  };

  /* Robot AI: kind = gemini | claude */
  C.robot = (kind, mood) => {
    const col = kind === 'gemini' ? '#4f8cff' : '#d97757';
    const dark = kind === 'gemini' ? '#1e3a8a' : '#7c2d12';
    const badge = kind === 'gemini'
      ? '<path d="M60 80 Q61 86 66 87 Q61 88 60 94 Q59 88 54 87 Q59 86 60 80Z" fill="#fff"/>'
      : '<g stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M60 80v14M53 87h14M55 82l10 10M65 82l-10 10"/></g>';
    return `<svg class="chibi robot mood-${mood}" viewBox="0 0 120 120" aria-hidden="true">
      <g class="bob">
        <path d="M60 10 V20" stroke="${dark}" stroke-width="3"/><circle class="antenna" cx="60" cy="9" r="4.5" fill="${col}"/>
        <path d="M38 98 Q38 74 60 74 Q82 74 82 98Z" fill="${col}"/>
        ${badge}
        <rect x="32" y="20" width="56" height="50" rx="16" fill="${col}"/>
        <rect x="39" y="29" width="42" height="31" rx="10" fill="#0f172a"/>
        <g class="eyes"><rect x="48" y="38" width="7" height="10" rx="3.5" fill="#7dd3fc"/><rect x="65" y="38" width="7" height="10" rx="3.5" fill="#7dd3fc"/></g>
        <path d="M54 53 Q60 57 66 53" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round"/>
        <rect x="27" y="38" width="6" height="14" rx="3" fill="${dark}"/><rect x="87" y="38" width="6" height="14" rx="3" fill="${dark}"/>
      </g>
      ${desk(`<g class="hands"><ellipse class="hand-l" cx="37" cy="91" rx="6" ry="4.5" fill="${dark}"/><ellipse class="hand-r" cx="83" cy="91" rx="6" ry="4.5" fill="${dark}"/></g>`)}
    </svg>`;
  };

  MD.Chibi = C;
})(window.MD);
