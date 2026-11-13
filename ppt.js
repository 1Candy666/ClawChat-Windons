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
function unsourced(text, c) { return [...String(text || '').matchAll(NUM)].map((m) => m[0]).filter((t) => /\d/.test(t) && !/^\d{4}$/.test(t) && !sourced(t, c)); }

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
const C = { ink: '1F2937', muted: '6B7280', accent: '1F4E79', line: 'D9DEE5', red: 'C0392B', soft: 'F3F6FA' };
const FONT = 'Microsoft YaHei';

// text with unsourced numbers in red
function runs(text, c, base, flagged) {
  const out = []; let last = 0; const s = String(text || '');
  for (const m of s.matchAll(NUM)) {
    const t = m[0]; if (!/\d/.test(t) || /^\d{4}$/.test(t) || sourced(t, c)) continue;
    if (m.index > last) out.push({ text: s.slice(last, m.index), options: { ...base } });
    out.push({ text: t, options: { ...base, color: C.red, bold: true } }); flagged.push(t); last = m.index + t.length;
  }
  if (last < s.length) out.push({ text: s.slice(last), options: { ...base } });
  return out.length ? out : [{ text: s, options: { ...base } }];
}

function frame(pres, slide, title, n, total, sources, flaggedHere) {
  slide.background = { color: 'FFFFFF' };
  slide.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.42, w: 0.09, h: 0.55, fill: { color: C.accent }, line: { color: C.accent } });
  slide.addText(title || '', { x: 0.72, y: 0.3, w: 11.9, h: 0.8, fontFace: FONT, fontSize: 26, bold: true, color: C.ink, valign: 'middle' });
  slide.addShape(pres.ShapeType.line, { x: 0.5, y: 6.92, w: 12.33, h: 0, line: { color: C.line, width: 0.75 } });
  const src = (sources || []).filter(Boolean).join('；');
  slide.addText((src ? '来源：' + src : '') + (flaggedHere.length ? `${src ? '　' : ''}⚠ 标红的数字没在项目文件里找到，请核对` : ''), { x: 0.5, y: 6.97, w: 11.3, h: 0.35, fontFace: FONT, fontSize: 9.5, color: flaggedHere.length ? C.red : C.muted, valign: 'middle' });
  slide.addText(`${n} / ${total}`, { x: 11.83, y: 6.97, w: 1, h: 0.35, fontFace: FONT, fontSize: 9.5, color: C.muted, align: 'right', valign: 'middle' });
}

function bulletsBox(slide, items, c, box, flagged, size = 18) {
  const paras = [];
  (items || []).slice(0, 7).forEach((b, i) => {
    // paragraph options go on the first run only: a run that carries `bullet` starts a new paragraph
    const r = runs(b, c, { fontFace: FONT, fontSize: size, color: C.ink }, flagged);
    r[0].options = { ...r[0].options, bullet: { indent: 18 }, paraSpaceBefore: i ? 10 : 0 };
    r[r.length - 1].options = { ...r[r.length - 1].options, breakLine: true };
    paras.push(...r);
  });
  if (paras.length) slide.addText(paras, { ...box, valign: 'top', lineSpacingMultiple: 1.2 });
}

async function build({ dir, outPath, deck, presenter }) {
  const c = corpus(dir);
  const P = pptx(); const pres = new P();
  pres.layout = 'LAYOUT_WIDE'; pres.title = deck.title || '组会汇报'; pres.author = presenter || '';
  const slides = (deck.slides || []).filter((s) => s && (s.title || s.bullets || s.items));
  const total = slides.length + 1;
  const report = [];

  // cover
  const cover = pres.addSlide(); cover.background = { color: 'FFFFFF' };
  cover.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.18, fill: { color: C.accent }, line: { color: C.accent } });
  cover.addText(deck.title || '组会汇报', { x: 0.9, y: 2.3, w: 11.5, h: 1.3, fontFace: FONT, fontSize: 36, bold: true, color: C.ink });
  cover.addText(deck.subtitle || '', { x: 0.9, y: 3.6, w: 11.5, h: 0.7, fontFace: FONT, fontSize: 18, color: C.muted });
  cover.addText(`${presenter || ''}　${deck.date || ''}`, { x: 0.9, y: 5.6, w: 11.5, h: 0.5, fontFace: FONT, fontSize: 14, color: C.muted });
  if (deck.coverNotes) cover.addNotes(deck.coverNotes);

  slides.forEach((s, k) => {
    const slide = pres.addSlide(); const flagged = [];
    if (s.type === 'figure' && s.image) {
      const img = path.resolve(dir, s.image);
      const ok = img.startsWith(path.resolve(dir) + path.sep) && fs.existsSync(img) && /\.(png|jpe?g)$/i.test(img);
      const side = (s.bullets || []).length > 0;
      const box = side ? { x: 0.6, y: 1.25, w: 8.1, h: 5.4 } : { x: 0.8, y: 1.25, w: 11.7, h: 5.4 };
      if (ok) slide.addImage({ path: img, ...fit(img, box) });
      else slide.addText(`（找不到图片：${s.image}）`, { ...box, fontFace: FONT, fontSize: 14, color: C.red, align: 'center' });
      if (side) bulletsBox(slide, s.bullets, c, { x: 8.95, y: 1.35, w: 3.9, h: 5.2 }, flagged, 15);
      if (s.caption) slide.addText(runs(s.caption, c, { fontFace: FONT, fontSize: 11, color: C.muted, italic: true }, flagged), { x: 0.6, y: 6.55, w: side ? 8.1 : 11.7, h: 0.35, align: 'center' });
    } else if (s.type === 'table' && Array.isArray(s.columns) && Array.isArray(s.rows)) {
      const cols = s.columns.slice(0, 7), rows = s.rows.slice(0, 10);
      const head = cols.map((h) => ({ text: String(h), options: { bold: true, color: 'FFFFFF', fill: { color: C.accent }, fontFace: FONT, fontSize: 13, align: 'center' } }));
      const body = rows.map((r, i) => cols.map((_, j) => ({ text: runs(String(r[j] ?? ''), c, { fontFace: FONT, fontSize: 12.5, color: C.ink }, flagged), options: { fill: { color: i % 2 ? C.soft : 'FFFFFF' }, align: j ? 'center' : 'left' } })));
      slide.addTable([head, ...body], { x: 0.6, y: 1.35, w: 12.1, colW: cols.map(() => 12.1 / cols.length), border: { type: 'solid', color: C.line, pt: 0.75 }, autoPage: false });
      if (s.bullets?.length) bulletsBox(slide, s.bullets, c, { x: 0.6, y: 1.5 + 0.42 * (rows.length + 1), w: 12.1, h: 5.3 - 0.42 * (rows.length + 1) }, flagged, 15);
    } else if (s.type === 'qa' && Array.isArray(s.items)) {
      const paras = [];
      s.items.slice(0, 4).forEach((x, i) => {
        paras.push({ text: `问：${x.q}`, options: { fontFace: FONT, fontSize: 19, bold: true, color: C.accent, paraSpaceBefore: i ? 18 : 0, breakLine: true } });
        const r = runs(`答：${x.a}${x.src ? `（见 ${x.src}）` : ''}`, c, { fontFace: FONT, fontSize: 16, color: C.ink }, flagged);
        r[0].options = { ...r[0].options, paraSpaceBefore: 4 };
        r[r.length - 1].options = { ...r[r.length - 1].options, breakLine: true }; paras.push(...r);
      });
      slide.addText(paras, { x: 0.7, y: 1.3, w: 12, h: 5.5, valign: 'top' });
    } else bulletsBox(slide, s.bullets, c, { x: 0.8, y: 1.4, w: 11.8, h: 5.3 }, flagged, 20);
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
