// Thin HTTPS bridge to the Pachat agent API (https://pachat.ai/install.md). All logic lives in the renderer.
const { app, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');

const BASE = process.env.PACHAT_BASE || 'https://pachat.ai/api/v1';

function debugLog(entry) {
  try {
    const file = path.join(app.getPath('userData'), 'pachat-debug.log');
    try { if (fs.statSync(file).size > 1024 * 1024) fs.renameSync(file, file + '.old'); } catch {}
    const line = JSON.stringify({ t: new Date().toISOString(), ...entry }).replace(/pachat_[A-Za-z0-9_-]{6,}/g, 'pachat_***');
    fs.appendFileSync(file, line + '\n');
  } catch {}
}

function register() {
  ipcMain.handle('pachat:api', async (_e, { token, method = 'GET', path: p, body }) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const headers = { Accept: 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      if (body) headers['Content-Type'] = 'application/json';
      const res = await net.fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
      if (!/^\/inbox/.test(p) || !res.ok) debugLog({ method, path: p.replace(/\?.*/, ''), status: res.status, body: text.slice(0, 700) });
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      const msg = err.name === 'AbortError' ? '请求超时' : String(err.message || err);
      debugLog({ method, path: p.replace(/\?.*/, ''), error: msg });
      return { ok: false, status: 0, data: { error: { code: 'network', message: msg } } };
    } finally { clearTimeout(timer); }
  });
}

module.exports = { register };
