/* Warehouse Office — lưu trữ trên Google Drive (/DIY/Warehouse), hoặc chế độ thử trong trình duyệt khi chưa kết nối */
(function (MD) {
  'use strict';
  const U = MD.U;
  const S = {};
  const SCOPES = 'https://www.googleapis.com/auth/drive';
  const API = 'https://www.googleapis.com/drive/v3';
  const UP = 'https://www.googleapis.com/upload/drive/v3';
  const FOLDER = 'application/vnd.google-apps.folder';
  S.MIME = { FOLDER, GSHEET: 'application/vnd.google-apps.spreadsheet', GDOC: 'application/vnd.google-apps.document' };
  S.PATH = ['DIY', 'Warehouse'];
  S.SUB = { data: 'data', boss: 'Cấp trên', req: 'Yêu cầu & Issue', staff: 'Nhân viên', reports: 'Reports', sys: 'Hệ thống' };
  const DATA_NAME = 'office.json';
  /* Chỉ các tài khoản Google này được vào app. Lưu dạng SHA-256 của email (chữ thường) để không lộ email trong repo công khai.
     Thêm người: chạy  python -c "import hashlib;print(hashlib.sha256(b'email@gmail.com').hexdigest())"  rồi thêm vào danh sách. */
  S.OWNERS = ['63583c77823b8d934ffeeb864522e692e450477977a8d1f3a15d3fc135b32012'];
  const DEMO_KEY = 'office_demo';

  let token = null, tokenExp = 0, client = null, pending = null;
  try {
    const t = JSON.parse(sessionStorage.getItem('wo_token') || 'null');
    if (t && t.exp > Date.now()) { token = t.v; tokenExp = t.exp; }
  } catch (e) { /* bỏ qua */ }

  S.clientId = () => (U.store.get('settings', {}).googleClientId || (window.MD_CONFIG && MD_CONFIG.googleClientId) || '').trim();
  S.connected = () => !!token && Date.now() < tokenExp;
  S.user = null;
  S.folders = {};
  S.dataFileId = null;
  S.dataModified = null;

  function ensureClient() {
    if (client) return client;
    if (!window.google || !google.accounts || !google.accounts.oauth2) throw new Error('Chưa tải được Google Identity Services, kiểm tra mạng.');
    const id = S.clientId();
    if (!id) throw new Error('Chưa có Google OAuth Client ID (xem tab Cài đặt).');
    client = google.accounts.oauth2.initTokenClient({
      client_id: id, scope: SCOPES,
      callback: (resp) => {
        if (resp.error) { pending && pending.reject(new Error(resp.error_description || resp.error)); pending = null; return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPES)) {
          pending && pending.reject(new Error('Bạn chưa cấp quyền Google Drive đầy đủ. Bấm Kết nối lại và tick ô cho phép Drive.')); pending = null; return;
        }
        token = resp.access_token; tokenExp = Date.now() + (resp.expires_in - 60) * 1000;
        try { sessionStorage.setItem('wo_token', JSON.stringify({ v: token, exp: tokenExp })); } catch (e) { /* bỏ qua */ }
        pending && pending.resolve(token); pending = null;
      },
      error_callback: (e) => { pending && pending.reject(new Error(e.message || e.type || 'Đăng nhập bị huỷ')); pending = null; }
    });
    return client;
  }

  S.connect = (prompt = '') => new Promise((resolve, reject) => {
    try { pending = { resolve, reject }; ensureClient().requestAccessToken({ prompt }); } catch (e) { reject(e); }
  });

  S.disconnect = () => {
    if (token && window.google && google.accounts) google.accounts.oauth2.revoke(token, () => {});
    token = null; tokenExp = 0; S.user = null; client = null; S.folders = {}; S.dataFileId = null; S.dataModified = null;
    try { sessionStorage.removeItem('wo_token'); } catch (e) { /* bỏ qua */ }
  };

  async function api(url, opts = {}, raw) {
    if (!S.connected()) throw new Error('Phiên Google Drive đã hết hạn. Bấm "Kết nối Drive" để đăng nhập lại.');
    const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {}) }));
    if (r.status === 401) { token = null; tokenExp = 0; throw new Error('Phiên Google Drive đã hết hạn. Bấm "Kết nối Drive" để đăng nhập lại.'); }
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const j = await r.json(); msg = (j.error && (j.error.message || j.error)) || msg; } catch (e) { /* bỏ qua */ }
      throw new Error('Google Drive: ' + msg);
    }
    if (raw) return r;
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? r.json() : r.text();
  }

  const qEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  S.qEsc = qEsc;
  const F_FIELDS = 'files(id,name,mimeType,modifiedTime,createdTime,size,webViewLink,parents)';

  S.list = async (q, fields = F_FIELDS, order = 'createdTime desc') => {
    let out = [], page = '';
    do {
      const url = `${API}/files?pageSize=200&orderBy=${encodeURIComponent(order)}&fields=nextPageToken,${fields}&q=${encodeURIComponent(q)}` + (page ? '&pageToken=' + page : '');
      const r = await api(url);
      out = out.concat(r.files || []);
      page = r.nextPageToken;
    } while (page);
    return out;
  };

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /* Kiểm tra tài khoản vừa đăng nhập có phải chủ app không. Sai thì thu hồi quyền ngay. */
  S.verifyOwner = async () => {
    const me = await api(`${API}/about?fields=user(displayName,emailAddress,photoLink)`);
    S.user = me.user;
    const email = String(me.user.emailAddress || '').trim().toLowerCase();
    const ok = S.OWNERS.includes(await sha256(email));
    if (!ok) S.disconnect();
    return { ok, email };
  };

  S.get = (id, fields = 'id,name,mimeType,modifiedTime,webViewLink,parents') => api(`${API}/files/${id}?fields=${fields}`);

  S.ensureFolder = async (name, parentId) => {
    const pid = parentId || 'root';
    const q = `name='${qEsc(name)}' and mimeType='${FOLDER}' and trashed=false and '${pid}' in parents`;
    const found = await S.list(q, 'files(id,name,webViewLink)', 'createdTime');
    if (found[0]) return found[0];
    return api(`${API}/files?fields=id,name,webViewLink`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [pid] })
    });
  };

  S.initFolders = async () => {
    let p = null;
    for (const n of S.PATH) p = await S.ensureFolder(n, p && p.id);
    S.folders.root = p;
    const keys = Object.keys(S.SUB);
    const subs = await Promise.all(keys.map((k) => S.ensureFolder(S.SUB[k], p.id)));
    keys.forEach((k, i) => { S.folders[k] = subs[i]; });
    return S.folders;
  };

  /* Tải file lên. convertTo = mime Google (Sheets/Docs) để Drive tự chuyển đổi */
  S.upload = async (blob, name, parentId, opt = {}) => {
    const meta = opt.fileId ? { name } : { name, parents: [parentId] };
    if (opt.convertTo && !opt.fileId) meta.mimeType = opt.convertTo;
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', new Blob([blob], { type: opt.mime || blob.type || 'application/octet-stream' }));
    const f = 'id,name,mimeType,webViewLink,modifiedTime';
    const url = opt.fileId ? `${UP}/files/${opt.fileId}?uploadType=multipart&fields=${f}` : `${UP}/files?uploadType=multipart&fields=${f}`;
    return api(url, { method: opt.fileId ? 'PATCH' : 'POST', body: form });
  };

  S.readText = async (id, mimeType) => {
    if (mimeType === S.MIME.GDOC) return api(`${API}/files/${id}/export?mimeType=text/plain`);
    if (mimeType === S.MIME.GSHEET) return api(`${API}/files/${id}/export?mimeType=text/csv`);
    const r = await api(`${API}/files/${id}?alt=media`, {}, true);
    return r.text();
  };

  S.rename = (id, name) => api(`${API}/files/${id}?fields=id,name`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });

  S.folderLink = (id) => `https://drive.google.com/drive/folders/${id}`;

  /* ---------- Dữ liệu chính: data/office.json ---------- */
  S.loadData = async () => {
    if (!S.connected()) {
      S.dataFileId = null;
      return U.store.get(DEMO_KEY, null);
    }
    const q = `name='${DATA_NAME}' and '${S.folders.data.id}' in parents and trashed=false`;
    const f = (await S.list(q, 'files(id,modifiedTime)', 'modifiedTime desc'))[0];
    if (!f) { S.dataFileId = null; S.dataModified = null; return null; }
    S.dataFileId = f.id; S.dataModified = f.modifiedTime;
    return JSON.parse(await S.readText(f.id));
  };

  S.saveData = async (data) => {
    data.updatedAt = new Date().toISOString();
    if (!S.connected()) { U.store.set(DEMO_KEY, data); return; }
    if (S.dataFileId) {
      const m = await S.get(S.dataFileId, 'modifiedTime');
      if (S.dataModified && m.modifiedTime !== S.dataModified) {
        const e = new Error('Dữ liệu trên Drive vừa được sửa ở nơi khác (máy/tab khác). Bấm Đồng bộ để tải bản mới nhất trước khi sửa tiếp.');
        e.conflict = true; throw e;
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const r = await S.upload(blob, DATA_NAME, S.folders.data.id, { mime: 'application/json', fileId: S.dataFileId });
    S.dataFileId = r.id; S.dataModified = r.modifiedTime;
    /* Mỗi ngày giữ 1 bản sao lưu để phòng file chính bị hỏng */
    const day = new Date().toISOString().slice(0, 10);
    if (U.store.get('office_backupDay') !== day) {
      U.store.set('office_backupDay', day);
      S.upload(blob, `office-backup-${day}.json`, S.folders.data.id, { mime: 'application/json' }).catch(() => {});
    }
  };

  S.clearDemo = () => U.store.del(DEMO_KEY);

  MD.Store = S;
})(window.MD);
