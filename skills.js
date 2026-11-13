// Skills: folders of written rules (SKILL.md + references) that agents follow for a kind of work.
// They live in the app's data folder; a project stage can attach some of them.
const { ipcMain, dialog, BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const MAX_SKILL_BYTES = 5 * 1024 * 1024; // a skill is text; anything bigger is not what we think it is

function root() { const d = path.join(app.getPath('userData'), 'skills'); fs.mkdirSync(d, { recursive: true }); return d; }
const safeName = (n) => String(n || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0, 80) || 'skill';

// "---\nname: x\ndescription: ...\n---" at the top of SKILL.md
function frontmatter(text) {
  const m = text.match(/^﻿?---\s*\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const k = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (k) out[k[1]] = k[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else out.push({ rel: path.relative(base, p).replace(/\\/g, '/'), size: fs.statSync(p).size });
  }
  return out;
}

function describe(name) {
  const dir = path.join(root(), name);
  const md = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(md)) return null;
  const text = fs.readFileSync(md, 'utf8');
  const fm = frontmatter(text);
  // a human title: the agent display name if the skill ships one, else the first heading
  let title = '';
  try { title = (fs.readFileSync(path.join(dir, 'agents', 'openai.yaml'), 'utf8').match(/display_name:\s*["']?([^"'\n]+)/) || [])[1] || ''; } catch {}
  if (!title) title = ((text.replace(/^\uFEFF?---[\s\S]*?\n---/, '').match(/^#\s+(.+)$/m) || [])[1] || '').split(/\s+[·|-]\s+/)[0];
  return { name, title: (title || fm.name || name).trim(), description: fm.description || '', files: walk(dir).map((f) => f.rel), bytes: walk(dir).reduce((s, f) => s + f.size, 0) };
}
function list() {
  return fs.readdirSync(root(), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => describe(e.name)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

// find every folder holding a SKILL.md under `dir` (a single skill, or a bundle with skills/*)
function findSkillDirs(dir, depth = 0, out = []) {
  if (depth > 4) return out;
  if (fs.existsSync(path.join(dir, 'SKILL.md'))) { out.push(dir); return out; }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.') && e.name !== '__MACOSX') findSkillDirs(path.join(dir, e.name), depth + 1, out);
  return out;
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
function importDirs(dirs) {
  const done = [];
  for (const d of dirs) {
    const total = walk(d).reduce((s, f) => s + f.size, 0);
    if (total > MAX_SKILL_BYTES) continue;
    const fm = frontmatter(fs.readFileSync(path.join(d, 'SKILL.md'), 'utf8'));
    const name = safeName(fm.name || path.basename(d));
    const dst = path.join(root(), name);
    fs.rmSync(dst, { recursive: true, force: true });
    copyDir(d, dst);
    done.push(name);
  }
  return done;
}

// minimal zip reader (stored + deflate), enough for skill bundles; refuses paths that climb out
function unzipTo(file, dest) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('不是有效的 zip 文件');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 目录损坏');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const rawName = buf.slice(p + 46, p + 46 + nlen);
    let name = flags & 0x800 ? rawName.toString('utf8') : rawName.toString('utf8');
    if (/�/.test(name)) try { name = new TextDecoder('gbk').decode(rawName); } catch {}
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    const target = path.resolve(dest, name);
    if (!target.startsWith(path.resolve(dest) + path.sep)) continue;
    total += usize;
    if (total > MAX_SKILL_BYTES * 8) throw new Error('压缩包解开后太大，不像是技能包');
    const dataStart = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.slice(dataStart, dataStart + csize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (!data) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
}

function importPath(p) {
  if (fs.statSync(p).isDirectory()) return importDirs(findSkillDirs(p));
  if (!/\.zip$/i.test(p)) throw new Error('请选择技能文件夹或 .zip 压缩包');
  const tmp = fs.mkdtempSync(path.join(app.getPath('temp'), 'clawchat-skill-'));
  try { unzipTo(p, tmp); return importDirs(findSkillDirs(tmp)); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// the SKILL.md text, for models that cannot read files themselves
function readSkill(name, max = 20000) {
  const md = path.join(root(), safeName(name), 'SKILL.md');
  if (!fs.existsSync(md)) return null;
  const t = fs.readFileSync(md, 'utf8').replace(/^﻿/, '');
  return t.length > max ? t.slice(0, max) + '\n…（后面省略）' : t;
}
// give an agent that works in a folder its own copy, at <dir>/.clawchat/skills/<name>
function copyInto(names, dir) {
  const out = [];
  for (const n of names || []) {
    const src = path.join(root(), safeName(n));
    if (!fs.existsSync(path.join(src, 'SKILL.md'))) continue;
    const dst = path.join(dir, '.clawchat', 'skills', safeName(n));
    fs.rmSync(dst, { recursive: true, force: true });
    copyDir(src, dst);
    out.push({ name: n, rel: `.clawchat/skills/${safeName(n)}/SKILL.md` });
  }
  return out;
}

// Skills that ship with ClawChat. Seeded into the library on start; a later version replaces a
// seeded copy only if the user never edited it, and a builtin the user deleted stays deleted.
const BUILTIN = path.join(__dirname, 'builtin-skills');
function dirHash(dir) {
  const h = require('crypto').createHash('sha1');
  for (const f of walk(dir).sort((a, b) => a.rel.localeCompare(b.rel))) h.update(f.rel + '\0').update(fs.readFileSync(path.join(dir, f.rel)));
  return h.digest('hex');
}
function seedBuiltins() {
  if (!fs.existsSync(BUILTIN)) return;
  const metaFile = path.join(root(), '.builtin.json');
  let meta = {}; try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch {}
  meta.seeded = meta.seeded || {}; meta.removed = meta.removed || [];
  for (const e of fs.readdirSync(BUILTIN, { withFileTypes: true })) {
    if (!e.isDirectory() || !fs.existsSync(path.join(BUILTIN, e.name, 'SKILL.md'))) continue;
    const name = safeName(e.name), src = path.join(BUILTIN, e.name), dst = path.join(root(), name);
    if (meta.removed.includes(name)) continue;
    const hash = dirHash(src);
    if (fs.existsSync(dst) && !meta.seeded[name] && dirHash(dst) === hash) { meta.seeded[name] = hash; continue; } // same files imported by hand earlier
    if (fs.existsSync(dst)) {
      const untouched = meta.seeded[name] && dirHash(dst) === meta.seeded[name];
      if (!untouched || meta.seeded[name] === hash) continue;
      fs.rmSync(dst, { recursive: true, force: true });
    }
    copyDir(src, dst);
    meta.seeded[name] = hash;
  }
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
}
function builtinNames() { try { return Object.keys(JSON.parse(fs.readFileSync(path.join(root(), '.builtin.json'), 'utf8')).seeded || {}); } catch { return []; } }
function markRemoved(name) {
  const metaFile = path.join(root(), '.builtin.json');
  try { const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); if (meta.seeded?.[name] && !meta.removed.includes(name)) { meta.removed.push(name); fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1)); } } catch {}
}

function register() {
  try { seedBuiltins(); } catch (err) { console.error('seed skills', err); }
  ipcMain.handle('skills:list', () => { const b = new Set(builtinNames()); return list().map((x) => ({ ...x, builtin: b.has(x.name) })); });
  ipcMain.handle('skills:import', async (e, kind) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), kind === 'zip'
      ? { title: '选择技能压缩包', properties: ['openFile'], filters: [{ name: 'zip', extensions: ['zip'] }] }
      : { title: '选择技能文件夹（含 SKILL.md，或包含多个技能的文件夹）', properties: ['openDirectory'] });
    if (r.canceled) return { ok: true, names: [] };
    try { const names = importPath(r.filePaths[0]); return names.length ? { ok: true, names } : { ok: false, msg: '里面没有找到 SKILL.md' }; }
    catch (err) { return { ok: false, msg: String(err.message || err) }; }
  });
  ipcMain.handle('skills:importPath', (_e, p) => { try { return { ok: true, names: importPath(p) }; } catch (err) { return { ok: false, msg: String(err.message || err) }; } });
  ipcMain.handle('skills:remove', (_e, name) => { markRemoved(safeName(name)); fs.rmSync(path.join(root(), safeName(name)), { recursive: true, force: true }); return true; });
  ipcMain.handle('skills:read', (_e, name) => readSkill(name));
  ipcMain.handle('skills:copyInto', (_e, { names, dir }) => { try { return copyInto(names, dir); } catch { return []; } });
}

module.exports = { register, seedBuiltins, builtinNames, list, importPath, readSkill, copyInto, unzipTo, frontmatter };
