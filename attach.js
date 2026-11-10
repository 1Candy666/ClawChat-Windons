// Attachments: store user files locally and turn them into model input.
const { app, ipcMain, shell } = require('electron');
const path = require('path');
const docread = require('./docread');
const fs = require('fs');

const MAX_BYTES = 25 * 1024 * 1024;
const TEXT_MAX = 200 * 1024;
const IMG = /\.(png|jpe?g|gif|webp|bmp)$/i;
const TEXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|ya?ml|toml|ini|cfg|log|py|m|js|ts|jsx|tsx|c|h|cpp|hpp|cs|java|go|rs|rb|php|sh|bat|ps1|sql|html?|css|tex|bib|r|f90|f|dat)$/i;

function attDir() {
  const d = path.join(app.getPath('userData'), 'attachments');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function kindOf(name) { return IMG.test(name) ? 'image' : TEXT.test(name) ? 'text' : docread.DOC_RE.test(name) ? 'doc' : 'other'; }
function mimeOf(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }[ext] || 'application/octet-stream';
}
function safeName(n) { return String(n || 'file').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(-120); }

function readText(p) {
  const buf = fs.readFileSync(p);
  let t = buf.slice(0, TEXT_MAX).toString('utf8');
  if (/�/.test(t.slice(0, 2000))) {
    try { t = new TextDecoder('gbk').decode(buf.slice(0, TEXT_MAX)); } catch {}
  }
  return buf.length > TEXT_MAX ? t + `\n…（文件太长，只截取了前 ${Math.round(TEXT_MAX / 1024)} KB）` : t;
}

// messages may contain content arrays with {type:'att', att:{...}} parts.
// mode: 'vision' (images as image_url), 'noimg' (images as text notes), 'cli' (collect image paths)
function resolveMessages(messages, mode) {
  const images = [];
  const out = messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    const parts = [];
    for (const p of m.content) {
      if (p.type !== 'att') { parts.push(p); continue; }
      const a = p.att;
      const exists = a.path && fs.existsSync(a.path);
      if (!exists) { parts.push({ type: 'text', text: `[附件「${a.name}」已不存在]` }); continue; }
      if (a.kind === 'image') {
        if (mode === 'vision' && p.live) {
          parts.push({ type: 'image_url', image_url: { url: `data:${mimeOf(a.name)};base64,${fs.readFileSync(a.path).toString('base64')}` } });
        } else if (mode === 'cli' && p.live) {
          images.push(a.path); parts.push({ type: 'text', text: `[图片：${a.name}]` });
        } else parts.push({ type: 'text', text: `[图片：${a.name}]` });
      } else if ((a.kind === 'text' || a.kind === 'doc') && !p.live) {
        parts.push({ type: 'text', text: `[附件「${a.name}」的内容在前面已经发过，这里省略]` });
      } else if (a.kind === 'text') {
        parts.push({ type: 'text', text: `【附件 ${a.name}】\n\`\`\`\n${readText(a.path)}\n\`\`\`` });
      } else if (a.kind === 'doc' && a.textPath && fs.existsSync(a.textPath)) {
        parts.push({ type: 'text', text: `【附件 ${a.name}（已提取文字）】\n${fs.readFileSync(a.textPath, 'utf8')}\n【附件 ${a.name} 结束】` });
      } else if (a.kind === 'doc') {
        parts.push({ type: 'text', text: `[附件：${a.name}（文字提取失败：${a.extractError || '未知原因'}）]` });
      } else {
        parts.push({ type: 'text', text: `[附件：${a.name}（${Math.round(a.size / 1024)} KB，暂不支持读取这种格式的内容）]` });
      }
    }
    if (mode === 'vision' && parts.some((x) => x.type === 'image_url')) return { role: m.role, content: parts };
    return { role: m.role, content: parts.map((x) => x.text || '').join('\n\n') };
  });
  return { messages: out, images };
}

function hasImages(messages) {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'att' && p.live && p.att.kind === 'image'));
}

function copyInto(atts, dir) {
  const dest = path.join(dir, 'ClawChat附件');
  const done = [];
  for (const a of atts || []) {
    if (!a.path || !fs.existsSync(a.path)) continue;
    fs.mkdirSync(dest, { recursive: true });
    const target = path.join(dest, safeName(a.name));
    fs.copyFileSync(a.path, target);
    done.push(path.relative(dir, target));
  }
  return done;
}

function register() {
  ipcMain.handle('att:save', async (_e, { name, data }) => {
    const buf = Buffer.from(data);
    if (buf.length > MAX_BYTES) throw new Error(`文件太大（超过 ${MAX_BYTES / 1048576} MB）`);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const p = path.join(attDir(), `${id}_${safeName(name)}`);
    fs.writeFileSync(p, buf);
    const att = { id, name: safeName(name), path: p, size: buf.length, kind: kindOf(name) };
    if (att.kind === 'doc') {
      try {
        const text = await docread.extract(buf, name);
        att.textPath = p + '.txt';
        fs.writeFileSync(att.textPath, text, 'utf8');
        att.chars = text.length;
      } catch (err) { att.extractError = String(err.message || err).slice(0, 200); }
    }
    return att;
  });
  ipcMain.handle('att:open', (_e, p) => shell.openPath(p));
}

module.exports = { register, resolveMessages, hasImages, copyInto };
