// Group-meeting deck: build an editable .pptx from an outline the lead wrote, and check that every
// number on the slides can be found in the project's own files.
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let Pptx;
function pptx() { if (!Pptx) { const m = require('./vendor/pptxgen.js'); Pptx = m.default || m; } return Pptx; }

const TEXTY = /\.(md|txt|csv|tsv|json|log)$/i;
const SKIP = new Set(['.clawchat', '组会汇报', 'node_modules', '__pycache__', '.git']);

// ---------- numbers ----------
const NUM = /[-−]?\d{1,3}(?:,\d{3})+(?![\d.])(?:\.\d+)?|[-−]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g; // 1,234.5 | 1.25e-3 (a CSV's "1.2,3.4" stays two numbers)
function toNum(s) { return Number(String(s).replace(/−/g, '-').replace(/,/g, '')); }
function decimals(s) { const m = String(s).match(/\.(\d+)(?:[eE]|$)/); return m ? m[1].length : 0; }

function corpus(dir) {
  const nums = []; let text = '';
  const walk = (d, depth) => {
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 4) walk(p, depth + 1); continue; }
      if (!TEXTY.test(e.name)) continue;
      try { if (fs.statSync(p).size > 5e6) continue; text += '\n' + fs.readFileSync(p, 'utf8'); } catch {}
    }
  };
  walk(dir, 0);
  for (const m of text.matchAll(NUM)) { const v = toNum(m[0]); if (Number.isFinite(v)) nums.push(v); }
  return { nums, text };
}
// a number on a slide counts as sourced if a project file has it at the shown precision
// (68.2% matches 68.19274…), also allowing that one side may be a fraction and the other a percent
function sourced(token, c) {
  const v = toNum(token); if (!Number.isFinite(v)) return true;
  const d = decimals(token), tol = 0.5 * Math.pow(10, -d) + 1e-12;
  if (Number.isInteger(v) && Math.abs(v) <= 12 && d === 0) return true; // counts, item numbers, "3 个算例"
  if (c.text.includes(token)) return true;
  for (const y of c.nums) { const a = Math.abs(y), b = Math.abs(v); if (Math.abs(a - b) <= tol || Math.abs(a * 100 - b) <= tol || Math.abs(a / 100 - b) <= tol / 100) return true; }
  return false;
}
// section and figure references are not data: §2.3, 第 3 页, 图 1, 表 2, Fig. 3, 2.3 节
function isRef(s, at, tok) { const before = s.slice(Math.max(0, at - 5), at), after = s.slice(at + tok.length, at + tok.length + 2); return /(§|第|图|表|Fig\.?|Table|Eq\.?|式)\s*$/i.test(before) || /^\s*(节|章|页|条|步)/.test(after); }
function unsourced(text, c) { const s = String(text || ''); return [...s.matchAll(NUM)].filter((m) => /\d/.test(m[0]) && !/^\d{4}$/.test(m[0]) && !isRef(s, m.index, m[0]) && !sourced(m[0], c)).map((m) => m[0]); }

// ---------- images ----------
function imgSize(p) {
  const b = fs.readFileSync(p);
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + len; }
  }
  return { w: 4, h: 3 };
}
function fit(p, box) { const s = imgSize(p); const r = Math.min(box.w / s.w, box.h / s.h); const w = s.w * r, h = s.h * r; return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }; }

// ---------- deck ----------
// Palette shared with the app: deep navy for weight, instrument blue for emphasis, cool sheets for panels.
const C = { navy: '1B2F4B', ink: '1D2731', body: '2E3A46', muted: '6A7682', accent: '2B59C3', tint: 'E7EDFA', sheet: 'F3F5F8', line: 'D7DDE3', red: 'C0392B', amber: 'B7791F', white: 'FFFFFF' };
const FONT = 'Microsoft YaHei';
const W = 13.333, H = 7.5, MX = 0.62;

// text with unsourced numbers in red
function runs(text, c, base, flagged) {
  const out = []; let last = 0; const s = String(text || '');
  for (const m of s.matchAll(NUM)) {
    const t = m[0]; if (!/\d/.test(t) || /^\d{4}$/.test(t) || isRef(s, m.index, t) || sourced(t, c)) continue;
    if (m.index > last) out.push({ text: s.slice(last, m.index), options: { ...base } });
    out.push({ text: t, options: { ...base, color: C.red, bold: true } }); flagged.push(t); last = m.index + t.length;
  }
  if (last < s.length) out.push({ text: s.slice(last), options: { ...base } });
  return out.length ? out : [{ text: s, options: { ...base } }];
}
// rough width of a string in "full-width characters", to pick font sizes and card heights
const cjkLen = (t) => [...String(t || '')].reduce((n, ch) => n + (/[⺀-￿]/.test(ch) ? 1 : 0.55), 0);

function frame(pres, slide, title, n, total, sources, flaggedHere) {
  slide.background = { color: C.white };
  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.09, fill: { color: C.navy }, line: { color: C.navy, width: 0 } });
  const ts = cjkLen(title) > 26 ? 24 : 28;
  slide.addText(title || '', { x: MX, y: 0.38, w: W - 2 * MX, h: 0.85, fontFace: FONT, fontSize: ts, bold: true, color: C.navy, valign: 'middle', margin: 0 });
  slide.addShape(pres.ShapeType.rect, { x: MX, y: 1.3, w: 0.9, h: 0.06, fill: { color: C.accent }, line: { color: C.accent, width: 0 } });
  const src = (sources || []).filter(Boolean).join('；');
  if (flaggedHere.length) slide.addText('⚠ 标红的数字没在项目文件里找到，讲之前请核对', { x: MX, y: 6.86, w: 7, h: 0.3, fontFace: FONT, fontSize: 10, color: C.red, bold: true, margin: 0 });
  slide.addText(src ? '来源：' + src : '', { x: MX, y: 7.1, w: W - 2 * MX - 1.2, h: 0.28, fontFace: FONT, fontSize: 9, color: C.muted, margin: 0 });
  slide.addText(`${n} / ${total}`, { x: W - MX - 1.1, y: 7.1, w: 1.1, h: 0.28, fontFace: FONT, fontSize: 9, color: C.muted, align: 'right', margin: 0 });
}

// one paragraph of runs (red numbers keep their place inside the line)
function para(text, c, base, flagged) { return runs(text, c, base, flagged); }

// Points as cards: 1–3 points stack full width, 4–6 sit in two columns. Cards fill the body area
// so a short slide does not leave the bottom half empty.
function pointCards(pres, slide, items, c, box, flagged, { size } = {}) {
  const pts = (items || []).filter(Boolean).slice(0, 6);
  if (!pts.length) return;
  const cols = pts.length >= 4 ? 2 : 1, rows = Math.ceil(pts.length / cols), gap = 0.22;
  const cw = (box.w - gap * (cols - 1)) / cols;
  const longest = Math.max(...pts.map(cjkLen));
  const fs = size || (cols === 2 ? (longest > 30 ? 17 : 19) : (longest > 40 ? 19 : 22));
  const ch = Math.min((box.h - gap * (rows - 1)) / rows, cols === 1 ? 1.35 : 1.6);
  const top = box.y + Math.max(0, (box.h - (ch * rows + gap * (rows - 1))) / 2.6);
  pts.forEach((t, k) => {
    const col = cols === 2 ? k % 2 : 0, row = cols === 2 ? Math.floor(k / 2) : k;
    const x = box.x + col * (cw + gap), y = top + row * (ch + gap);
    slide.addShape(pres.ShapeType.rect, { x, y, w: cw, h: ch, fill: { color: C.sheet }, line: { color: C.sheet, width: 0 } });
    slide.addShape(pres.ShapeType.rect, { x, y, w: 0.07, h: ch, fill: { color: k === 0 ? C.accent : '9AAFD8' }, line: { width: 0, color: C.accent } });
    slide.addText(para(t, c, { fontFace: FONT, fontSize: fs, color: C.ink }, flagged), { x: x + 0.3, y, w: cw - 0.5, h: ch, valign: 'middle', margin: 0, lineSpacingMultiple: 1.12 });
  });
}

function sideNotes(pres, slide, items, c, box, flagged) {
  const pts = (items || []).filter(Boolean).slice(0, 4);
  if (!pts.length) return;
  slide.addShape(pres.ShapeType.rect, { ...box, fill: { color: C.sheet }, line: { color: C.sheet, width: 0 } });
  const paras = [];
  pts.forEach((t, k) => {
    const r = para(t, c, { fontFace: FONT, fontSize: 15, color: C.ink }, flagged);
    r[0].options = { ...r[0].options, bullet: { code: '25A0', indent: 16 }, paraSpaceBefore: k ? 14 : 0 };
    r[r.length - 1].options = { ...r[r.length - 1].options, breakLine: true };
    paras.push(...r);
  });
  slide.addText(paras, { x: box.x + 0.25, y: box.y + 0.3, w: box.w - 0.5, h: box.h - 0.6, valign: 'top', margin: 0, lineSpacingMultiple: 1.15 });
}

async function build({ dir, outPath, deck, presenter }) {
  const c = corpus(dir);
  const P = pptx(); const pres = new P();
  pres.layout = 'LAYOUT_WIDE'; pres.title = deck.title || '组会汇报'; pres.author = presenter || '';
  const slides = (deck.slides || []).filter((s) => s && (s.title || s.bullets || s.items));
  const total = slides.length + 1;
  const report = [];

  // cover: a navy field carrying the title, the meeting details on white below
  const cover = pres.addSlide(); cover.background = { color: C.white };
  cover.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: 4.9, fill: { color: C.navy }, line: { color: C.navy, width: 0 } });
  cover.addShape(pres.ShapeType.rect, { x: MX + 0.1, y: 1.45, w: 1.1, h: 0.08, fill: { color: '7FA2E8' }, line: { width: 0, color: '7FA2E8' } });
  cover.addText(deck.title || '组会汇报', { x: MX + 0.1, y: 1.75, w: W - 2 * MX - 0.2, h: 1.6, fontFace: FONT, fontSize: cjkLen(deck.title) > 20 ? 34 : 40, bold: true, color: C.white, valign: 'top', margin: 0 });
  cover.addText(deck.subtitle || '', { x: MX + 0.1, y: 3.5, w: W - 2 * MX - 0.2, h: 0.9, fontFace: FONT, fontSize: 17, color: 'C9D6EE', valign: 'top', margin: 0 });
  cover.addText([{ text: presenter || '', options: { bold: true, color: C.ink, fontSize: 18, breakLine: true } }, { text: `组会汇报　${deck.date || ''}`, options: { color: C.muted, fontSize: 14 } }], { x: MX + 0.1, y: 5.45, w: 8, h: 1.1, fontFace: FONT, valign: 'top', margin: 0 });
  if (deck.coverNotes) cover.addNotes(deck.coverNotes);

  slides.forEach((s, k) => {
    const slide = pres.addSlide(); const flagged = [];
    const body = { x: MX, y: 1.65, w: W - 2 * MX, h: 5.0 };
    if (s.type === 'figure' && s.image) {
      const img = path.resolve(dir, s.image);
      const ok = img.startsWith(path.resolve(dir) + path.sep) && fs.existsSync(img) && /\.(png|jpe?g)$/i.test(img);
      const side = (s.bullets || []).length > 0;
      const box = side ? { x: MX, y: 1.62, w: 8.25, h: 4.75 } : { x: MX, y: 1.62, w: W - 2 * MX, h: 4.75 };
      slide.addShape(pres.ShapeType.rect, { ...box, fill: { color: C.white }, line: { color: C.line, width: 0.75 } });
      if (ok) slide.addImage({ path: img, ...fit(img, { x: box.x + 0.15, y: box.y + 0.15, w: box.w - 0.3, h: box.h - 0.3 }) });
      else slide.addText(`（找不到图片：${s.image}）`, { ...box, fontFace: FONT, fontSize: 14, color: C.red, align: 'center' });
      if (s.caption) slide.addText(para(s.caption, c, { fontFace: FONT, fontSize: 11.5, color: C.muted }, flagged), { x: box.x, y: box.y + box.h + 0.05, w: box.w, h: 0.32, align: 'center', margin: 0 });
      if (side) sideNotes(pres, slide, s.bullets, c, { x: box.x + box.w + 0.3, y: box.y, w: W - MX - (box.x + box.w + 0.3), h: box.h }, flagged);
    } else if (s.type === 'table' && Array.isArray(s.columns) && Array.isArray(s.rows)) {
      const cols = s.columns.slice(0, 7), rows = s.rows.slice(0, 10);
      const fsz = rows.length > 6 || cols.length > 5 ? 13 : 15;
      const head = cols.map((h, j) => ({ text: String(h), options: { bold: true, color: C.white, fill: { color: C.navy }, fontFace: FONT, fontSize: fsz, align: j ? 'center' : 'left', valign: 'middle' } }));
      const bodyRows = rows.map((r, i) => cols.map((_, j) => ({ text: para(String(r[j] ?? ''), c, { fontFace: FONT, fontSize: fsz, color: C.ink, bold: j === 0 }, flagged), options: { fill: { color: i % 2 ? C.sheet : C.white }, align: j ? 'center' : 'left', valign: 'middle' } })));
      const rowH = fsz > 13 ? 0.48 : 0.4;
      slide.addTable([head, ...bodyRows], { x: MX, y: 1.7, w: W - 2 * MX, colW: cols.map(() => (W - 2 * MX) / cols.length), rowH, border: { type: 'solid', color: C.line, pt: 0.5 }, margin: [0.04, 0.12, 0.04, 0.12], autoPage: false });
      const used = 1.7 + rowH * (rows.length + 1) + 0.3;
      if (s.bullets?.length) pointCards(pres, slide, s.bullets.slice(0, 3), c, { x: MX, y: used, w: W - 2 * MX, h: 6.65 - used }, flagged, { size: 16 });
    } else if (s.type === 'qa' && Array.isArray(s.items)) {
      const qs = s.items.slice(0, 4), cols = qs.length > 2 ? 2 : 1, rows = Math.ceil(qs.length / cols), gap = 0.25;
      const cw = (W - 2 * MX - gap * (cols - 1)) / cols, chh = (5.0 - gap * (rows - 1)) / rows;
      qs.forEach((x, i) => {
        const cx = MX + (cols === 2 ? (i % 2) * (cw + gap) : 0), cy = 1.65 + (cols === 2 ? Math.floor(i / 2) : i) * (chh + gap);
        slide.addShape(pres.ShapeType.rect, { x: cx, y: cy, w: cw, h: chh, fill: { color: C.white }, line: { color: C.line, width: 0.75 } });
        slide.addShape(pres.ShapeType.rect, { x: cx, y: cy, w: cw, h: 0.07, fill: { color: C.accent }, line: { width: 0, color: C.accent } });
        const a = para(x.a, c, { fontFace: FONT, fontSize: 15.5, color: C.body }, flagged);
        if (x.src) a.push({ text: `\n见 ${x.src}`, options: { fontFace: FONT, fontSize: 12, color: C.muted, breakLine: false } });
        slide.addText([{ text: x.q, options: { fontFace: FONT, fontSize: 17.5, bold: true, color: C.navy, breakLine: true, paraSpaceAfter: 6 } }, ...a], { x: cx + 0.28, y: cy + 0.22, w: cw - 0.56, h: chh - 0.4, valign: 'top', margin: 0, lineSpacingMultiple: 1.15 });
      });
    } else pointCards(pres, slide, s.bullets, c, body, flagged);
    frame(pres, slide, s.title, k + 2, total, s.sources, flagged);
    if (s.notes) slide.addNotes(s.notes);
    if (flagged.length) report.push({ slide: k + 2, title: s.title, numbers: [...new Set(flagged)] });
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await pres.writeFile({ fileName: outPath });
  return { ok: true, path: outPath, slides: total, flagged: report };
}

function register() {
  ipcMain.handle('ppt:build', async (_e, args) => { try { return await build(args); } catch (err) { return { ok: false, msg: String(err.message || err) }; } });
  ipcMain.handle('ppt:check', (_e, { dir, texts }) => { const c = corpus(dir); return (texts || []).map((t) => unsourced(t, c)); });
}

module.exports = { register, build, corpus, sourced, unsourced };
