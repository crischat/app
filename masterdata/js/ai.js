/* Master Data Pro — Chuyên gia AI (Claude API, gọi trực tiếp từ trình duyệt bằng key của người dùng) */
(function (MD) {
  'use strict';
  const U = MD.U, A = MD.Analyzer;
  const AI = {};
  AI.MODELS = [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — sâu nhất (mặc định)' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — nhanh, cân bằng' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — rẻ nhất' }
  ];
  const FALLBACK_OK = ['claude-opus-5-5', 'claude-sonnet-5-5'];

  AI.settings = () => {
    const s = U.store.get('settings', {});
    return { key: s.claudeKey || '', model: s.claudeModel || 'claude-opus-5-5', effort: s.claudeEffort || 'medium', sendSamples: s.aiSamples !== false };
  };

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

  AI.call = async (messages, opts = {}) => {
    const s = AI.settings();
    if (!s.key) throw new Error('Chưa nhập Claude API key (tab Cài đặt).');
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
  };

  MD.AI = AI;
})(window.MD);
