/* Master Data Pro — kết nối Google Drive & Google Sheets (Google Identity Services) */
(function (MD) {
  'use strict';
  const U = MD.U;
  const D = {};
  const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets.readonly';
  let token = null, tokenExp = 0, client = null, pending = null;

  D.clientId = () => (U.store.get('settings', {}).googleClientId || (window.MD_CONFIG && MD_CONFIG.googleClientId) || '').trim();
  D.rootName = () => (U.store.get('settings', {}).driveFolder || 'Master Data Pro').trim();
  D.hasToken = () => !!token && Date.now() < tokenExp;
  D.user = null;

  function ensureClient() {
    if (client) return client;
    if (!window.google || !google.accounts || !google.accounts.oauth2) throw new Error('Chưa tải được Google Identity Services — kiểm tra mạng.');
    const id = D.clientId();
    if (!id) throw new Error('Chưa cấu hình Google OAuth Client ID (tab Cài đặt).');
    client = google.accounts.oauth2.initTokenClient({
      client_id: id, scope: SCOPES,
      callback: (resp) => {
        if (resp.error) { pending && pending.reject(new Error(resp.error_description || resp.error)); pending = null; return; }
        token = resp.access_token; tokenExp = Date.now() + (resp.expires_in - 60) * 1000;
        pending && pending.resolve(token); pending = null;
      },
      error_callback: (e) => { pending && pending.reject(new Error(e.message || e.type || 'Đăng nhập bị huỷ')); pending = null; }
    });
    return client;
  }

  D.connect = (prompt = '') => new Promise((resolve, reject) => {
    try {
      const c = ensureClient();
      pending = { resolve, reject };
      c.requestAccessToken({ prompt });
    } catch (e) { reject(e); }
  }).then(async (t) => {
    try {
      const me = await api('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)');
      D.user = me.user;
    } catch (e) { /* bỏ qua */ }
    document.dispatchEvent(new CustomEvent('md:drive', { detail: { connected: true } }));
    return t;
  });

  D.disconnect = () => {
    if (token && window.google) google.accounts.oauth2.revoke(token, () => {});
    token = null; tokenExp = 0; D.user = null; client = null;
    document.dispatchEvent(new CustomEvent('md:drive', { detail: { connected: false } }));
  };

  D.resetClient = () => { client = null; };

  async function getToken() {
    if (D.hasToken()) return token;
    return D.connect('');
  }

  async function api(url, opts = {}) {
    const t = await getToken();
    const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + t }, opts.headers || {}) }));
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const j = await r.json(); msg = (j.error && (j.error.message || j.error)) || msg; } catch (e) { /* bỏ qua */ }
      throw new Error('Google API: ' + msg);
    }
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? r.json() : r.blob();
  }

  const qEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  D.findFolder = async (name, parentId) => {
    const q = `name='${qEsc(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (parentId ? ` and '${parentId}' in parents` : ` and 'root' in parents`);
    const r = await api('https://www.googleapis.com/drive/v3/files?fields=files(id,name,webViewLink)&q=' + encodeURIComponent(q));
    return r.files && r.files[0];
  };

  D.ensureFolder = async (name, parentId) => {
    const f = await D.findFolder(name, parentId);
    if (f) return f;
    return api('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : undefined })
    });
  };

  D.upload = async (blob, name, parentId, mime, fileId) => {
    const meta = fileId ? { name } : { name, parents: parentId ? [parentId] : undefined };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', new Blob([blob], { type: mime || blob.type || 'application/octet-stream' }));
    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name,webViewLink`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
    return api(url, { method: fileId ? 'PATCH' : 'POST', body: form });
  };

  D.findFile = async (name, parentId) => {
    const q = `name='${qEsc(name)}' and trashed=false and '${parentId}' in parents`;
    const r = await api('https://www.googleapis.com/drive/v3/files?fields=files(id,name,modifiedTime,webViewLink)&q=' + encodeURIComponent(q));
    return r.files && r.files[0];
  };

  D.listFolder = async (parentId) => {
    const q = `'${parentId}' in parents and trashed=false`;
    const r = await api('https://www.googleapis.com/drive/v3/files?orderBy=createdTime desc&pageSize=100&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&q=' + encodeURIComponent(q));
    return r.files || [];
  };

  /* Cấu trúc thư mục: <root>/Báo cáo/<thời gian - tên file>/ */
  D.root = async () => D.ensureFolder(D.rootName());
  D.reportFolder = async (title) => {
    const root = await D.root();
    const rep = await D.ensureFolder('Báo cáo', root.id);
    return D.ensureFolder(U.safeName(`${U.stamp()} - ${title}`), rep.id);
  };

  /* Sao lưu / khôi phục cấu hình + lịch sử */
  D.backupState = async (state) => {
    const root = await D.root();
    const name = 'master-data-state.json';
    const ex = await D.findFile(name, root.id);
    return D.upload(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), name, root.id, 'application/json', ex && ex.id);
  };
  D.restoreState = async () => {
    const root = await D.root();
    const ex = await D.findFile('master-data-state.json', root.id);
    if (!ex) return null;
    const blob = await api(`https://www.googleapis.com/drive/v3/files/${ex.id}?alt=media`);
    return JSON.parse(await (blob instanceof Blob ? blob.text() : JSON.stringify(blob)));
  };

  /* Đọc nội dung 1 file (do app tạo) thành chuỗi */
  D.readText = async (fileId) => {
    const b = await api(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    return b instanceof Blob ? b.text() : JSON.stringify(b);
  };

  /* Đọc Google Sheet (kể cả riêng tư) qua Sheets API */
  D.readSheet = async (id) => {
    const meta = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties(title,sheetId)`);
    const titles = meta.sheets.map((s) => s.properties.title);
    const qs = titles.map((t) => 'ranges=' + encodeURIComponent(`'${t.replace(/'/g, "''")}'`)).join('&');
    const data = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
    const out = [];
    data.valueRanges.forEach((vr, i) => {
      const ds = MD.Parsers.fromAOA(vr.values || [], titles.length > 1 ? `${meta.properties.title} › ${titles[i]}` : meta.properties.title, { file: meta.properties.title, kind: 'gsheet', sheet: titles[i], sheetId: id });
      if (ds) out.push(ds);
    });
    return out;
  };

  MD.Drive = D;
})(window.MD);
