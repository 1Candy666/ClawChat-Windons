// Extract plain text from Word / PowerPoint / Excel / PDF files, with no native dependencies.
const zlib = require('zlib');
const path = require('path');

const MAX_CHARS = 150000;

// ---- minimal ZIP reader (docx/pptx/xlsx are zip files) ----
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 Office 文件（可能是旧版 .doc/.ppt/.xls，或文件损坏）');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    entries[name] = { method, csize, off };
    p += 46 + nlen + xlen + clen;
  }
  return {
    names: Object.keys(entries),
    get(name) {
      const e = entries[name];
      if (!e) return null;
      const lnlen = buf.readUInt16LE(e.off + 26), lxlen = buf.readUInt16LE(e.off + 28);
      const start = e.off + 30 + lnlen + lxlen;
      const data = buf.slice(start, start + e.csize);
      return (e.method === 0 ? data : zlib.inflateRawSync(data)).toString('utf8');
    },
  };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unxml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e] ?? m;
  });
}
const tidy = (t) => t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

function docxText(xml) {
  const body = xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>(\s*<\/w:tc>)/g, '$1')
    .replace(/<\/w:tc>/g, ' | ')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:instrText[^>]*>[\s\S]*?<\/w:instrText>/g, '')
    .replace(/<[^>]+>/g, '');
  return tidy(unxml(body));
}

function docx(z) {
  let t = docxText(z.get('word/document.xml') || '');
  const notes = ['word/footnotes.xml', 'word/endnotes.xml'].map((n) => z.get(n)).filter(Boolean).map(docxText).join('\n').trim();
  if (notes) t += '\n\n【脚注/尾注】\n' + notes;
  return t;
}

function pptx(z) {
  const slides = z.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  return slides.map((n, i) => {
    const xml = z.get(n).replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, '');
    return `--- 第 ${i + 1} 页 ---\n${tidy(unxml(xml))}`;
  }).join('\n\n');
}

function xlsx(z) {
  const shared = [];
  const ss = z.get('xl/sharedStrings.xml');
  if (ss) for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) || []) shared.push(unxml(si.replace(/<rPh[\s\S]*?<\/rPh>/g, '').replace(/<[^>]+>/g, '')));
  const wb = z.get('xl/workbook.xml') || '';
  const names = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => unxml(m[1]));
  const sheets = z.names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  return sheets.map((n, i) => {
    const rows = (z.get(n).match(/<row[\s\S]*?<\/row>/g) || []).slice(0, 2000).map((row) =>
      (row.match(/<c [\s\S]*?(?:\/>|<\/c>)/g) || []).map((c) => {
        const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        const isT = (c.match(/<is>([\s\S]*?)<\/is>/) || [])[1];
        if (/t="s"/.test(c) && v != null) return shared[+v] ?? '';
        if (isT) return unxml(isT.replace(/<[^>]+>/g, ''));
        return v != null ? unxml(v) : '';
      }).join(','));
    return `--- 工作表：${names[i] || n} ---\n${rows.join('\n')}`;
  }).join('\n\n');
}

async function pdf(buf) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { totalPages, text } = await extractText(doc, { mergePages: false });
  const body = text.map((t, i) => `--- 第 ${i + 1} 页 ---\n${tidy(t)}`).join('\n\n');
  if (!body.replace(/--- 第 \d+ 页 ---/g, '').trim()) throw new Error(`这个 PDF 共 ${totalPages} 页，但没有可提取的文字（可能是扫描件/图片）`);
  return body;
}

const DOC_RE = /\.(docx|pptx|xlsx|pdf)$/i;

async function extract(buf, name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  let t;
  if (ext === 'pdf') t = await pdf(buf);
  else {
    const z = readZip(buf);
    t = ext === 'docx' ? docx(z) : ext === 'pptx' ? pptx(z) : xlsx(z);
  }
  if (!t.trim()) throw new Error('没有提取到文字');
  if (t.length > MAX_CHARS) t = t.slice(0, MAX_CHARS) + `\n…（内容太长，只保留了前 ${MAX_CHARS} 字）`;
  return t;
}

module.exports = { extract, DOC_RE };
