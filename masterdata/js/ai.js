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
  // Ưu tiên bản Flash mới nhất (gói miễn phí rộng rãi), không chọn bản thử nghiệm nếu có bản ổn định
  AI.pickGeminiDefault = (list) => {
    const ver = (id) => { const m = id.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const score = (m) => ver(m.id) * 10 + (/flash/.test(m.id) ? 3 : 0) - (/lite/.test(m.id) ? 1 : 0) - (/preview|exp|\d{2}-\d{2}/.test(m.id) ? 5 : 0);
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

  // messages theo dạng Claude: {role:'user'|'assistant', content: string | [{type:'text', text}, ...]}
  AI.call = async (messages, opts = {}) => {
    const s = AI.settings();
    const provider = opts.provider || s.provider;
    return provider === 'gemini' ? callGemini(messages, opts, s) : callClaude(messages, opts, s);
  };

  const textOf = (content) => typeof content === 'string' ? content
    : (content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

  async function callGemini(messages, opts, s) {
    if (!s.geminiKey) throw new Error('Chưa nhập Gemini API key (tab Cài đặt).');
    let model = opts.model || s.geminiModel;
    if (!model) {
      const list = await AI.listGeminiModels(s.geminiKey);
      model = AI.pickGeminiDefault(list);
      U.store.set('settings', Object.assign(U.store.get('settings', {}), { geminiModel: model, geminiModels: list }));
    }
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: textOf(m.content) }] })),
      generationConfig: { maxOutputTokens: opts.maxTokens || 16000 }
    };
    const r = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': s.geminiKey }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(geminiError(r.status, j));
    if (j.promptFeedback && j.promptFeedback.blockReason) throw new Error('Gemini chặn yêu cầu: ' + j.promptFeedback.blockReason);
    const cand = (j.candidates || [])[0];
    if (!cand) throw new Error('Gemini không trả về kết quả.');
    if (['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(cand.finishReason)) throw new Error('Gemini dừng vì bộ lọc an toàn (' + cand.finishReason + ').');
    const text = ((cand.content && cand.content.parts) || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
    return {
      text: text + (cand.finishReason === 'MAX_TOKENS' ? '\n\n_(Phản hồi bị cắt do giới hạn độ dài)_' : ''),
      content: [{ type: 'text', text }], usage: j.usageMetadata, model: j.modelVersion || model
    };
  }

  async function callClaude(messages, opts, s) {
    if (!s.claudeKey) throw new Error('Chưa nhập Claude API key (tab Cài đặt).');
    s = Object.assign({}, s, { key: s.claudeKey });
    const model = opts.model || s.model;
    const body = {
      model, max_tokens: 16000, system: SYSTEM, messages,
      thinking: { type: 'adaptive' },
      output_config: { effort: opts.effort || s.effort }
    };
    const headers = {
      'content-type': 'application/json', 'x-api-key': s.key, 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    if (FALLBACK_OK.includes(model)) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = (j.error && j.error.message) || r.statusText;
      if (r.status === 401) throw new Error('API key không hợp lệ (401).');
      if (r.status === 429) throw new Error('Vượt giới hạn tốc độ (429) — thử lại sau ít phút.');
      throw new Error(`Claude API lỗi ${r.status}: ${m}`);
    }
    if (j.stop_reason === 'refusal') throw new Error('Mô hình từ chối yêu cầu' + (j.stop_details && j.stop_details.explanation ? ': ' + j.stop_details.explanation : '.'));
    const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return { text: text + (j.stop_reason === 'max_tokens' ? '\n\n_(Phản hồi bị cắt do giới hạn độ dài)_' : ''), content: j.content, usage: j.usage, model: j.model };
  }

  MD.AI = AI;
})(window.MD);
