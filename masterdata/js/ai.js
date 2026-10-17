/* Master Data Pro — Chuyên gia AI: Claude hoặc Gemini, gọi trực tiếp từ trình duyệt bằng key của người dùng */
(function (MD) {
  'use strict';
  const U = MD.U, A = MD.Analyzer;
  const AI = {};
  AI.PROVIDERS = { claude: 'Claude (Anthropic)', gemini: 'Gemini (Google)' };
  AI.MODELS = [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — sâu nhất (mặc định)' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — nhanh, cân bằng' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — rẻ nhất' }
  ];
  const FALLBACK_OK = ['claude-opus-5-5', 'claude-sonnet-5-5'];
  const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

  AI.settings = () => {
    const s = U.store.get('settings', {});
    const provider = s.aiProvider || (s.claudeKey ? 'claude' : s.geminiKey ? 'gemini' : 'claude');
    return {
      provider, claudeKey: s.claudeKey || '', geminiKey: s.geminiKey || '',
      key: provider === 'gemini' ? (s.geminiKey || '') : (s.claudeKey || ''),
      model: s.claudeModel || 'claude-opus-5-5', geminiModel: s.geminiModel || '',
      geminiModels: s.geminiModels || [], effort: s.claudeEffort || 'medium', sendSamples: s.aiSamples !== false
    };
  };

  /* ---------- Danh sách mô hình Gemini (lấy trực tiếp từ Google, không đoán tên) ---------- */
  AI.listGeminiModels = async (key) => {
    const r = await fetch(`${GEMINI_BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(geminiError(r.status, j));
    const list = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name) && !/embedding|image|tts|audio|live|vision/i.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
    if (!list.length) throw new Error('Key hợp lệ nhưng không thấy mô hình Gemini nào dùng được.');
    return list;
  };
  /* Chọn mô hình Gemini theo mục đích — ưu tiên DÒNG mô hình trước, phiên bản sau:
     fast  (chép lời): Flash-Lite > Flash;  smart (gợi ý): Flash > Flash-Lite > Pro;  balanced: Flash.
     Tên mã lạ (không có flash/pro/lite), bản thử nghiệm, và mô hình chuyên dụng (tts, image, live…) bị đẩy xuống cuối. */
  const FAMILY_W = {
    fast: { lite: 30, flash: 20, pro: -10, other: -40 },
    smart: { flash: 30, lite: 15, pro: 5, other: -40 },
    balanced: { flash: 30, lite: 10, pro: 10, other: -40 }
  };
  AI.pickGeminiDefault = (list, purpose = 'balanced') => {
    const ver = (id) => { const m = id.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const fam = (id) => (/lite/.test(id) ? 'lite' : /flash/.test(id) ? 'flash' : /pro/.test(id) ? 'pro' : 'other');
    const w = FAMILY_W[purpose] || FAMILY_W.balanced;
    const score = (m) => w[fam(m.id)] + ver(m.id) * 2
      - (/preview|exp|\d{2}-\d{2}|latest/.test(m.id) ? 8 : 0)
      - (/tts|audio|image|live|thinking|robotics|computer|nano|gemma|learnlm/.test(m.id) ? 60 : 0);
    return list.slice().sort((a, b) => score(b) - score(a))[0].id;
  };

  function geminiError(status, j) {
    const m = (j.error && j.error.message) || '';
    if (status === 400 && /API key/i.test(m)) return 'Gemini API key không hợp lệ — kiểm tra lại ký tự cuối.';
    if (status === 403) return 'Key không có quyền gọi Gemini API (403): ' + m;
    if (status === 404) return 'Không tìm thấy mô hình Gemini này (404) — bấm "Tải danh sách mô hình" ở tab Cài đặt.';
    if (status === 429) return 'Vượt hạn mức Gemini (429) — gói miễn phí giới hạn số lần/phút, thử lại sau ít phút.';
    return `Gemini API lỗi ${status}: ${m}`;
  }

  const SYSTEM = `Bạn là chuyên gia Master Data / Data Quality cấp cao (15+ năm), am hiểu kho vận, kế toán kho, nhân sự và quản trị dữ liệu doanh nghiệp Việt Nam.
Bạn nhận bản tóm tắt kết quả quét tự động (hồ sơ cột, danh sách lỗi theo nhóm, mẫu dòng). Nhiệm vụ:
- Đánh giá tổng thể chất lượng dữ liệu, nêu rủi ro nghiệp vụ thực tế (sai tồn, sai giá vốn, trùng nhân sự, sai báo cáo...).
- Phân tích nguyên nhân gốc rễ có khả năng nhất cho từng nhóm lỗi (quy trình nhập liệu, thiếu danh mục chuẩn, copy-paste, đổi hệ thống...).
- Chỉ ra những điểm bất thường mà luật tự động có thể bỏ sót khi nhìn vào mẫu dữ liệu.
- Đưa kế hoạch xử lý ưu tiên (việc gì làm ngay, tuần này, dài hạn) và đề xuất quy tắc kiểm soát/Data Validation cụ thể.
Viết tiếng Việt, súc tích, dùng Markdown (tiêu đề ##, bảng khi so sánh, gạch đầu dòng). Trích số liệu cụ thể từ dữ liệu được cung cấp; không bịa số liệu không có.`;

  AI.buildContext = (ds, res, withSamples) => {
    const ctx = {
      tep: ds.name, loai: res.kind, mien_du_lieu: res.domain, so_dong: res.rows, so_cot: res.cols,
      diem_chat_luong: res.score, cac_chieu: Object.fromEntries(Object.entries(res.dims).map(([k, v]) => [A.DIMS[k], U.pct(v)])),
      dong_co_loi: res.rowsWithIssues, cot_khoa: res.keyName,
      ho_so_cot: (res.profile || []).map((p) => ({
        cot: p.name, vai_tro: p.role ? A.ROLE_LABEL[p.role] || p.role : null, kieu: p.type, ty_le_day: U.pct(p.fillRate), so_gia_tri_khac: p.unique,
        top: p.top.slice(0, 5).map((t) => `${t.v} (${t.c})`), so: p.num ? { min: p.num.min, max: p.num.max, tb: +p.num.mean.toFixed(2), tong: p.num.sum } : undefined
      })),
      nhom_loi: res.checks.slice(0, 60).map((c) => ({
        nhom: A.CATS[c.cat].label, kiem_tra: c.check, muc_do: A.SEV[c.sev].label, so_luong: c.n, cot: c.cols.slice(0, 5),
        vi_du: c.sample.slice(0, 3).map((s) => ({ dong: s.excelRow, cot: s.colName, gia_tri: s.value, mo_ta: s.msg }))
      })),
      bien_the: (res.clusters || []).slice(0, 8).map((c) => ({ cot: c.colName, nhom: c.groups.slice(0, 6).map((g) => g.variants.map((v) => `${v.v} (${v.c})`).join(' | ')) }))
    };
    if (withSamples && ds.kind === 'table') {
      ctx.tieu_de = ds.headers;
      ctx.mau_dong = ds.rows.slice(0, 25).map((r) => r.map((c) => U.display(c)));
    } else if (withSamples && ds.kind === 'text') {
      ctx.trich_doan = ds.lines.slice(0, 80).join('\n').slice(0, 8000);
    }
    return JSON.stringify(ctx);
  };

  /* messages theo dạng Claude: {role:'user'|'assistant', content: string | [block...]}
     block: {type:'text', text} | {type:'image', mime, data(base64)} | {type:'audio', mime, data(base64)} (audio: chỉ Gemini)
     opts: provider, model, system, maxTokens, effort (Claude), json + schema (Gemini), onText(textSoFar) => bật streaming */
  AI.call = async (messages, opts = {}) => {
    const s = AI.settings();
    const provider = opts.provider || s.provider;
    return provider === 'gemini' ? callGemini(messages, opts, s) : callClaude(messages, opts, s);
  };

  // Đọc luồng Server-Sent Events, gọi onData(jsonObject) cho mỗi sự kiện.
  // Gemini ngăn sự kiện bằng "\r\n\r\n", Claude bằng "\n\n" -> chuẩn hoá xuống dòng trước khi tách,
  // và xử lý cả phần còn lại trong bộ đệm khi luồng kết thúc.
  async function readSSE(resp, onData) {
    const reader = resp.body.getReader(), dec = new TextDecoder();
    let buf = '';
    const emit = (chunk) => {
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data || data === '[DONE]') return;
      let obj; try { obj = JSON.parse(data); } catch (e) { return; } // bỏ qua dòng hỏng
      onData(obj); // lỗi do onData ném ra (vd sự kiện error) phải được truyền ra ngoài
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf = (buf + dec.decode(value, { stream: true })).replace(/\r\n?/g, '\n');
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) { emit(buf.slice(0, k)); buf = buf.slice(k + 2); }
    }
    buf = (buf + dec.decode()).replace(/\r\n?/g, '\n');
    if (buf.trim()) emit(buf);
  }

  const geminiParts = (content) => typeof content === 'string' ? [{ text: content }]
    : (content || []).map((b) => b.type === 'text' ? { text: b.text } : (b.type === 'image' || b.type === 'audio') ? { inlineData: { mimeType: b.mime, data: b.data } } : null).filter(Boolean);
  const claudeContent = (content) => typeof content === 'string' ? content
    : content.map((b) => {
      if (b.type === 'image') return { type: 'image', source: { type: 'base64', media_type: b.mime, data: b.data } };
      if (b.type === 'audio') throw new Error('Claude không nhận âm thanh — phần nghe/chép lời cần Gemini.');
      return b;
    });

  // purpose: không truyền -> dùng mô hình chung của Master Data Pro; 'fast' / 'smart' -> tự chọn riêng theo mục đích
  AI.geminiModelFor = async (s, want, purpose) => {
    if (want) return want;
    const cacheKey = purpose ? 'geminiAuto_' + purpose : 'geminiModel';
    const cur = U.store.get('settings', {});
    if (cur[cacheKey]) return cur[cacheKey];
    const list = cur.geminiModels && cur.geminiModels.length ? cur.geminiModels : await AI.listGeminiModels(s.geminiKey);
    const model = AI.pickGeminiDefault(list, purpose || 'balanced');
    U.store.set('settings', Object.assign(U.store.get('settings', {}), { [cacheKey]: model, geminiModels: list }));
    return model;
  };
  AI.resetGeminiAuto = () => {
    const cur = U.store.get('settings', {});
    delete cur.geminiAuto_fast; delete cur.geminiAuto_smart;
    U.store.set('settings', cur);
  };

  /* Giảm "suy nghĩ" để trả lời nhanh. Mỗi dòng mô hình nhận tham số khác nhau, nên thử lần lượt
     và nhớ cấu hình mô hình đó chấp nhận (thinkMemo) để các lần sau không phải thử lại. */
  const thinkMemo = {};
  function thinkCandidates(model, level) {
    if (/gemini-(1\.|2\.0)/.test(model)) return [null];
    if (/gemini-2\.5/.test(model)) return [{ thinkingBudget: /pro/.test(model) ? 128 : 0 }, null];
    return level === 'off' ? [{ thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }, { thinkingBudget: 0 }, null] : [{ thinkingLevel: 'low' }, { thinkingBudget: 512 }, null];
  }

  async function callGemini(messages, opts, s) {
    if (!s.geminiKey) throw new Error('Chưa nhập Gemini API key (tab Cài đặt).');
    const model = await AI.geminiModelFor(s, opts.model, opts.purpose);
    const body = {
      systemInstruction: { parts: [{ text: opts.system || SYSTEM }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: geminiParts(m.content) })),
      generationConfig: { maxOutputTokens: opts.maxTokens || 16000 }
    };
    if (opts.json) { body.generationConfig.responseMimeType = 'application/json'; if (opts.schema) body.generationConfig.responseSchema = opts.schema; }
    const stream = typeof opts.onText === 'function';
    const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    const memoKey = model + '|' + opts.think;
    const tries = opts.think ? (memoKey in thinkMemo ? [thinkMemo[memoKey]] : thinkCandidates(model, opts.think)) : [undefined];
    let r;
    for (let i = 0; i < tries.length; i++) {
      if (tries[i]) body.generationConfig.thinkingConfig = tries[i]; else delete body.generationConfig.thinkingConfig;
      r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': s.geminiKey }, body: JSON.stringify(body), signal: opts.signal });
      if (r.ok) { if (opts.think) thinkMemo[memoKey] = tries[i] || null; break; }
      if (r.status === 400 && i < tries.length - 1) {
        const j = await r.clone().json().catch(() => ({}));
        if (/think|budget|level/i.test((j.error && j.error.message) || '')) continue; // mô hình không nhận kiểu cấu hình này -> thử kiểu tiếp theo
      }
      break;
    }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(geminiError(r.status, j)); }
    let text = '', finish = '', usage = null, version = model;
    const take = (j) => {
      if (j.promptFeedback && j.promptFeedback.blockReason) throw new Error('Gemini chặn yêu cầu: ' + j.promptFeedback.blockReason);
      const cand = (j.candidates || [])[0];
      if (j.usageMetadata) usage = j.usageMetadata;
      if (j.modelVersion) version = j.modelVersion;
      if (!cand) return;
      if (cand.finishReason) finish = cand.finishReason;
      text += ((cand.content && cand.content.parts) || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
    };
    if (stream) await readSSE(r, (j) => { take(j); opts.onText(text); });
    else take(await r.json());
    if (['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(finish)) throw new Error('Gemini dừng vì bộ lọc an toàn (' + finish + ').');
    if (!text.trim() && finish === 'MAX_TOKENS' && !opts.json) throw new Error(`Mô hình ${version} dùng hết giới hạn token để "suy nghĩ" mà chưa trả lời — hãy chọn bản Flash/Flash-Lite trong Cài đặt.`);
    if (!text.trim() && !opts.json) throw new Error(`Gemini (${version}) trả về rỗng${finish ? ' — lý do dừng: ' + finish : ''}. Bấm “Gợi ý ngay” để thử lại.`);
    return {
      text: text + (finish === 'MAX_TOKENS' && !opts.json ? '\n\n_(Phản hồi bị cắt do giới hạn độ dài)_' : ''),
      content: [{ type: 'text', text }], usage, model: version
    };
  }

  async function callClaude(messages, opts, s) {
    if (!s.claudeKey) throw new Error('Chưa nhập Claude API key (tab Cài đặt).');
    const model = opts.model || s.model;
    const stream = typeof opts.onText === 'function';
    const body = {
      model, max_tokens: opts.maxTokens || 16000,
      // cacheSystem: system prompt dài và cố định (vd hồ sơ CV) được cache, các lần gọi sau rẻ và nhanh hơn
      system: opts.cacheSystem ? [{ type: 'text', text: opts.system || SYSTEM, cache_control: { type: 'ephemeral' } }] : (opts.system || SYSTEM),
      messages: messages.map((m) => ({ role: m.role, content: claudeContent(m.content) })),
      thinking: { type: 'adaptive' },
      output_config: { effort: opts.effort || s.effort }
    };
    if (stream) body.stream = true;
    const headers = {
      'content-type': 'application/json', 'x-api-key': s.claudeKey, 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    if (FALLBACK_OK.includes(model)) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const m = (j.error && j.error.message) || r.statusText;
      if (r.status === 401) throw new Error('API key không hợp lệ (401).');
      if (r.status === 429) throw new Error('Vượt giới hạn tốc độ (429) — thử lại sau ít phút.');
      throw new Error(`Claude API lỗi ${r.status}: ${m}`);
    }
    let j;
    if (stream) {
      // ghép lại message đầy đủ từ các sự kiện streaming
      const blocks = []; let stop = null, stopDetails = null, usage = null, mdl = model, text = '';
      await readSSE(r, (ev) => {
        if (ev.type === 'message_start') { mdl = ev.message.model; usage = ev.message.usage; }
        else if (ev.type === 'content_block_start') blocks[ev.index] = Object.assign({}, ev.content_block);
        else if (ev.type === 'content_block_delta') {
          const b = blocks[ev.index], d = ev.delta;
          if (d.type === 'text_delta') { b.text = (b.text || '') + d.text; text += d.text; opts.onText(text); }
          else if (d.type === 'thinking_delta') b.thinking = (b.thinking || '') + d.thinking;
          else if (d.type === 'signature_delta') b.signature = (b.signature || '') + d.signature;
        } else if (ev.type === 'message_delta') { stop = ev.delta.stop_reason; stopDetails = ev.delta.stop_details; if (ev.usage) usage = Object.assign({}, usage, ev.usage); }
        else if (ev.type === 'error') throw new Error('Claude API: ' + (ev.error && ev.error.message));
      });
      j = { content: blocks.filter(Boolean), stop_reason: stop, stop_details: stopDetails, usage, model: mdl };
    } else j = await r.json();
    if (j.stop_reason === 'refusal') throw new Error('Mô hình từ chối yêu cầu' + (j.stop_details && j.stop_details.explanation ? ': ' + j.stop_details.explanation : '.'));
    const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return { text: text + (j.stop_reason === 'max_tokens' ? '\n\n_(Phản hồi bị cắt do giới hạn độ dài)_' : ''), content: j.content, usage: j.usage, model: j.model };
  }

  MD.AI = AI;
})(window.MD);
