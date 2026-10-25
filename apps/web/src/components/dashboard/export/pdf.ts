// Tiny PDF writer (no dependency), loaded lazily by the export menu. A4 landscape: title, definition / unit / period / filters /
// freshness lines, the chart(s) as JPEG images (rendered in the light theme), then the data table paged with a repeated header.
// Text uses the PDF base-14 Helvetica with WinAnsi encoding (characters outside it are transliterated).
import { metaLines, saveBlob, type ExportMeta, type Rows } from './meta';

export interface PdfImage { url: string; width: number; height: number }

// Helvetica / Helvetica-Bold advance widths for ASCII 32–126 (AFM, 1/1000 em).
const REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const WIN: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, '×': 0xd7, '·': 0xb7, '±': 0xb1, '°': 0xb0 };
const TRANS: Record<string, string> = { '→': '->', '←': '<-', '≤': '<=', '≥': '>=', '▲': '+', '▼': '-', '−': '-', '✓': 'ok', '✕': 'x', ' ': ' ', ' ': ' ' };
function winAnsi(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    if (TRANS[ch]) { for (const c of TRANS[ch]) out.push(c.charCodeAt(0)); continue; }
    const c = ch.codePointAt(0)!;
    out.push(WIN[ch] ?? (c >= 32 && c < 127 ? c : c >= 160 && c <= 255 ? c : 63));
  }
  return out;
}
function textWidth(s: string, size: number, bold = false) {
  const w = bold ? BOLD : REG;
  return winAnsi(s).reduce((a, c) => a + (c >= 32 && c <= 126 ? w[c - 32] : 556), 0) * size / 1000;
}
const hex = (s: string) => `<${winAnsi(s).map((c) => c.toString(16).padStart(2, '0')).join('')}>`;
function fit(s: string, max: number, size: number, bold = false) {
  if (textWidth(s, size, bold) <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (textWidth(s.slice(0, mid) + '…', size, bold) <= max) lo = mid; else hi = mid - 1; }
  return s.slice(0, lo) + '…';
}
function wrap(s: string, max: number, size: number) {
  const lines: string[] = []; let cur = '';
  for (const w of s.split(/\s+/)) { const next = cur ? `${cur} ${w}` : w; if (textWidth(next, size) > max && cur) { lines.push(cur); cur = w; } else cur = next; }
  if (cur) lines.push(cur);
  return lines;
}
const rgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' '); };
const num = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

const PW = 842, PH = 595, M = 36, INK = '#0b1a2e', MUTED = '#5b6b82', LINE = '#d5dde8', HEAD = '#e8eff9';

export function pdfBytes(meta: ExportMeta, rows: Rows, images: PdfImage[] = []): Uint8Array {
  const pages: string[][] = [];
  let ops: string[] = [], y = PH - M;
  const newPage = () => { ops = []; pages.push(ops); y = PH - M - 10; };
  const text = (x: number, yy: number, s: string, size: number, o: { bold?: boolean; color?: string } = {}) =>
    ops.push(`BT /${o.bold ? 'F2' : 'F1'} ${size} Tf ${rgb(o.color ?? INK)} rg ${x.toFixed(2)} ${yy.toFixed(2)} Td ${hex(s)} Tj ET`);
  const rect = (x: number, yy: number, w: number, h: number, fill: string) => ops.push(`${rgb(fill)} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  const hline = (x0: number, x1: number, yy: number, color = LINE, w = 0.6) => ops.push(`${rgb(color)} RG ${w} w ${x0.toFixed(2)} ${yy.toFixed(2)} m ${x1.toFixed(2)} ${yy.toFixed(2)} l S`);

  newPage(); y = PH - M;
  // title + meta
  y -= 18; text(M, y, fit(meta.title, PW - 2 * M, 18, true), 18, { bold: true });
  y -= 8;
  for (const line of metaLines(meta)) for (const l of wrap(line, PW - 2 * M, 9)) { y -= 12; text(M, y, l, 9, { color: MUTED }); }
  y -= 8; hline(M, PW - M, y, '#a3b1c6', 0.8); y -= 10;

  // charts
  const imgNames: { name: string; img: PdfImage }[] = [];
  for (const img of images) {
    const w = PW - 2 * M, h = Math.min(img.height * (w / img.width), PH - 2 * M - 40);
    const ww = img.width * (h / img.height);
    if (y - h < M + 20) newPage();
    const name = `Im${imgNames.length}`; imgNames.push({ name, img });
    ops.push(`q ${ww.toFixed(2)} 0 0 ${h.toFixed(2)} ${M.toFixed(2)} ${(y - h).toFixed(2)} cm /${name} Do Q`);
    y -= h + 14;
  }

  // table
  if (rows.length) {
    const head = rows[0].map(String), body = rows.slice(1);
    const FS = 8.5, RH = 15, avail = PW - 2 * M;
    const cellText = (v: string | number) => (typeof v === 'number' ? num(v) : String(v ?? ''));
    const isNum = head.map((_, i) => body.length > 0 && body.every((r) => typeof r[i] === 'number' || r[i] === '' || r[i] == null) && body.some((r) => typeof r[i] === 'number'));
    let widths = head.map((h, i) => Math.min(240, Math.max(textWidth(h, FS, true), ...body.map((r) => textWidth(cellText(r[i]), FS))) + 12));
    const total = widths.reduce((a, b) => a + b, 0);
    widths = total > avail ? widths.map((w) => (w * avail) / total) : widths;
    const tw = widths.reduce((a, b) => a + b, 0);
    const drawHead = () => {
      rect(M, y - RH + 4, tw, RH, HEAD);
      let x = M;
      head.forEach((h, i) => { const s = fit(h, widths[i] - 8, FS, true); text(isNum[i] ? x + widths[i] - 4 - textWidth(s, FS, true) : x + 4, y - 7, s, FS, { bold: true }); x += widths[i]; });
      y -= RH; hline(M, M + tw, y + 4, '#a3b1c6', 0.8);
    };
    if (y < M + 3 * RH + 20) newPage();
    drawHead();
    if (!body.length) { text(M + 4, y - 7, 'No data yet', FS, { color: MUTED }); y -= RH; }
    for (const r of body) {
      if (y - RH < M + 16) { newPage(); drawHead(); }
      let x = M;
      r.forEach((v, i) => { if (i >= widths.length) return; const s = fit(cellText(v), widths[i] - 8, FS); text(isNum[i] ? x + widths[i] - 4 - textWidth(s, FS) : x + 4, y - 7, s, FS); x += widths[i]; });
      y -= RH; hline(M, M + tw, y + 4);
    }
  }
  // footers
  pages.forEach((p, i) => {
    ops = p;
    text(M, M - 16, fit(`BTW Supply Chain · ${meta.title}`, 500, 8), 8, { color: MUTED });
    const s = `Page ${i + 1} of ${pages.length}`; text(PW - M - textWidth(s, 8), M - 16, s, 8, { color: MUTED });
  });

  // ── serialise ──
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = []; let len = 0; const offsets: number[] = [];
  const put = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); len += u.length; };
  const obj = (n: number, body: string | (Uint8Array | string)[]) => { offsets[n] = len; put(`${n} 0 obj\n`); (Array.isArray(body) ? body : [body]).forEach(put); put('\nendobj\n'); };
  put('%PDF-1.4\n'); put(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const firstImg = 5, firstPage = firstImg + imgNames.length;
  const kids = pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  imgNames.forEach(({ img }, i) => {
    const b64 = img.url.slice(img.url.indexOf(',') + 1), bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    obj(firstImg + i, [`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`, bytes, '\nendstream']);
  });
  const xo = imgNames.length ? `/XObject << ${imgNames.map((x, i) => `/${x.name} ${firstImg + i} 0 R`).join(' ')} >>` : '';
  pages.forEach((p, i) => {
    const content = enc.encode(p.join('\n'));
    obj(firstPage + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xo} >> /Contents ${firstPage + i * 2 + 1} 0 R >>`);
    obj(firstPage + i * 2 + 1, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
  });
  const count = firstPage + pages.length * 2;
  const xref = len;
  put(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.slice(1, count).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R /Info << /Title ${hex(meta.title)} /Producer (BTW Supply Chain) >> >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len); let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

export function downloadPdf(name: string, meta: ExportMeta, rows: Rows, images: PdfImage[] = []) {
  saveBlob(new Blob([pdfBytes(meta, rows, images) as BlobPart], { type: 'application/pdf' }), `${name}.pdf`);
}
