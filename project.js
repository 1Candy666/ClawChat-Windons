// Project folders: every project is a plain folder that people and agents share.
const { ipcMain, shell, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const IMG = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const TEXTY = /\.(md|txt|csv|tsv|json|py|m|log|ya?ml|tex|bib|dat)$/i;

function inside(dir, rel) {
  const root = path.resolve(dir);
  const p = path.resolve(root, rel || '.');
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('路径超出了项目文件夹');
  return p;
}
function thumb(p) {
  try {
    if (fs.statSync(p).size > 4 * 1024 * 1024) return null;
    const ext = path.extname(p).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
    return `data:${mime};base64,` + fs.readFileSync(p).toString('base64');
  } catch { return null; }
}
function readText(p, max = 60000) {
  const buf = fs.readFileSync(p);
  let t = buf.slice(0, max).toString('utf8').replace(/^﻿/, '');
  if (/�/.test(t.slice(0, 2000))) { try { t = new TextDecoder('gbk').decode(buf.slice(0, max)); } catch {} }
  return buf.length > max ? t + `\n…（文件共 ${buf.length} 字节，这里只显示前 ${max} 字节）` : t;
}

// A shallow, size-capped look at folders the user points at, so the lead can plan without guessing.
function scan(paths) {
  const out = [];
  for (const raw of paths) {
    const p = String(raw || '').trim().replace(/^["']|["']$/g, '');
    if (!p) continue;
    const item = { path: p, exists: false, tree: [], readme: '' };
    try {
      const st = fs.statSync(p);
      item.exists = true;
      if (st.isFile()) { item.tree.push(`${path.basename(p)}  (${st.size} 字节)`); if (TEXTY.test(p) && st.size < 200000) item.readme = readText(p, 8000); }
      else {
        let n = 0;
        const walk = (d, depth, prefix) => {
          let ents = [];
          try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
          ents.sort((a, b) => a.name.localeCompare(b.name));
          for (const e of ents) {
            if (n >= 120) return;
            if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__') continue;
            const full = path.join(d, e.name);
            if (e.isDirectory()) { item.tree.push(`${prefix}${e.name}/`); n++; if (depth < 2) walk(full, depth + 1, prefix + '  '); }
            else { let size = 0; try { size = fs.statSync(full).size; } catch {} item.tree.push(`${prefix}${e.name}  (${size} 字节)`); n++; }
          }
        };
        walk(p, 0, '');
        const rd = fs.readdirSync(p).find((f) => /^(readme|说明)/i.test(f) && TEXTY.test(f));
        if (rd) item.readme = readText(path.join(p, rd), 8000);
      }
    } catch (e) { item.error = String(e.message || e); }
    out.push(item);
  }
  return out;
}

function listFiles(dir, rel) {
  const root = inside(dir, rel);
  const out = [];
  let imgs = 0;
  const walk = (d, depth) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= 80 || e.name.startsWith('.') || e.name === '__pycache__') continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 3) walk(full, depth + 1); continue; }
      let st; try { st = fs.statSync(full); } catch { continue; }
      const f = { path: full, rel: path.relative(root, full), size: st.size, mtime: st.mtimeMs };
      if (IMG.test(full) && imgs < 12) { f.img = thumb(full); imgs++; }
      out.push(f);
    }
  };
  walk(root, 0);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

// Numeric comparison of a produced CSV against a reference CSV. Cells that parse as numbers are compared with a
// relative tolerance; everything else must match exactly. Rows are matched by position, columns by header name.
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
function compareCsv(refPath, outPath, rtol = 1e-9) {
  const ref = parseCsv(fs.readFileSync(refPath, 'utf8')), out = parseCsv(fs.readFileSync(outPath, 'utf8'));
  const res = { ok: true, rtol, refRows: Math.max(0, ref.length - 1), outRows: Math.max(0, out.length - 1), compared: 0, maxRel: 0, problems: [] };
  const bad = (msg) => { res.ok = false; if (res.problems.length < 30) res.problems.push(msg); };
  if (!ref.length) { bad('参考文件是空的'); return res; }
  if (!out.length) { bad('产出文件是空的'); return res; }
  const rh = ref[0].map((x) => x.trim()), oh = out[0].map((x) => x.trim());
  const missing = rh.filter((h) => !oh.includes(h)), extra = oh.filter((h) => !rh.includes(h));
  if (missing.length) bad(`产出缺少这些列：${missing.join('、')}`);
  if (extra.length) res.extraCols = extra;
  if (ref.length !== out.length) bad(`行数不同：参考 ${ref.length - 1} 行，产出 ${out.length - 1} 行`);
  const n = Math.min(ref.length, out.length);
  for (let r = 1; r < n; r++) {
    for (let c = 0; c < rh.length; c++) {
      const oc = oh.indexOf(rh[c]); if (oc < 0) continue;
      const a = (ref[r][c] ?? '').trim(), b = (out[r][oc] ?? '').trim();
      res.compared++;
      if (a === b) continue;
      if (NUM.test(a) && NUM.test(b)) {
        const x = Number(a), y = Number(b);
        const rel = Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y), 1e-300);
        if (rel > res.maxRel) res.maxRel = rel;
        if (rel <= rtol || (x === 0 && Math.abs(y) <= rtol)) continue;
        bad(`第 ${r} 行「${rh[c]}」：参考 ${a}，产出 ${b}（相对差 ${rel.toExponential(2)}）`);
      } else bad(`第 ${r} 行「${rh[c]}」：参考「${a}」，产出「${b}」`);
    }
  }
  if (!res.ok && res.problems.length >= 30) res.problems.push('…（只列出前 30 处）');
  return res;
}

function register() {
  ipcMain.handle('proj:compareCsv', (_e, { ref, out, rtol }) => { try { return compareCsv(ref, out, rtol || 1e-9); } catch (e) { return { ok: false, error: String(e.message || e), problems: [] }; } });
  ipcMain.handle('proj:scan', (_e, paths) => scan(paths));
  ipcMain.handle('proj:mkdirs', (_e, { dir, rels }) => { fs.mkdirSync(dir, { recursive: true }); for (const r of rels || []) fs.mkdirSync(inside(dir, r), { recursive: true }); return true; });
  ipcMain.handle('proj:write', (_e, { dir, rel, text }) => { const p = inside(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, 'utf8'); return p; });
  ipcMain.handle('proj:append', (_e, { dir, rel, text }) => { const p = inside(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.appendFileSync(p, text, 'utf8'); return p; });
  ipcMain.handle('proj:read', (_e, { dir, rel, max }) => { try { return readText(inside(dir, rel), max || 60000); } catch { return null; } });
  ipcMain.handle('proj:files', (_e, { dir, rel }) => { try { return listFiles(dir, rel); } catch { return []; } });
  ipcMain.handle('proj:exists', (_e, p) => { try { return fs.existsSync(p); } catch { return false; } });
  ipcMain.handle('proj:isEmpty', (_e, p) => { try { return !fs.existsSync(p) || fs.readdirSync(p).length === 0; } catch { return false; } });
  ipcMain.handle('proj:open', (_e, p) => shell.openPath(p));
  ipcMain.handle('proj:pick', async (e, title) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openDirectory', 'createDirectory'], title: title || '选择文件夹' });
    return r.canceled ? null : r.filePaths[0];
  });
}

module.exports = { register, scan, listFiles, compareCsv, parseCsv };
