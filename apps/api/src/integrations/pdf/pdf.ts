// Typst (in-process via @myriaddreamin/typst-ts-node-compiler): millisecond renders, no Chromium.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import type { Config } from '../../config/config';
import type { AckPdfData, FilesPort, PdfPort, PoLetterData } from '../ports';

const TZ = 'Africa/Nairobi';
const fmtDate = (d: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(d));
const fmtDateTime = (d: string) => `${fmtDate(d)}, ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(d))} EAT`;
const num = (n: number, dp = 0) => new Intl.NumberFormat('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

export function repoRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  while (dir !== path.dirname(dir)) { if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir; dir = path.dirname(dir); }
  return path.resolve(start);
}
/** The BTW lockup: brand kit asset when present (packages/ui/src/assets/brand), else the supplied logo. */
export function brandLogo(root = repoRoot()): string {
  const dir = path.join(root, 'packages/ui/src/assets/brand');
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter((f) => /\.(png|jpe?g|svg)$/i.test(f) && /logo/i.test(f) && !/(reverse|white|dark|mono|mark|icon|favicon)/i.test(f));
    const best = files.sort((a, b) => Number(/full|lockup|primary|horizontal/i.test(b)) - Number(/full|lockup|primary|horizontal/i.test(a)) || Number(/\.png$/i.test(b)) - Number(/\.png$/i.test(a)))[0];
    if (best) return path.join(dir, best);
  }
  return path.join(root, 'docs/inspiration/preffered-logo.jpeg');
}

export class TypstPdf implements PdfPort {
  private readonly templates: string;
  private compiler: NodeCompiler | null = null;
  constructor(private readonly cfg: Config, private readonly files: FilesPort) {
    this.templates = path.join(repoRoot(), 'apps/api/templates');
  }
  private c() {
    this.compiler ??= NodeCompiler.create({ workspace: this.templates, fontArgs: [{ fontPaths: this.cfg.PDF_FONT_DIRS.split(',').filter(existsSync) }] });
    return this.compiler;
  }
  /** Resolve a data URL, stored file id or path to bytes and map it into the virtual workspace; returns the typst path. */
  private async img(c: NodeCompiler, name: string, src: string | undefined | null): Promise<string | null> {
    if (!src) return null;
    if (this.skipUserImages && name !== 'logo') return null;
    let body: Buffer | null = null, ext = 'png';
    const m = src.match(/^data:([^;]+);base64,(.*)$/);
    if (m) { body = Buffer.from(m[2], 'base64'); ext = MIME_EXT[m[1]] ?? 'png'; }
    else if (existsSync(src)) { body = readFileSync(src); ext = path.extname(src).slice(1).toLowerCase().replace('jpeg', 'jpg'); }
    else { const f = await this.files.get(src); if (f) { body = f.body; ext = MIME_EXT[f.contentType] ?? 'png'; } }
    if (!body) return null;
    const p = `/${name}.${ext}`;
    c.mapShadow(path.join(this.templates, p), body);
    return p;
  }
  private compile(c: NodeCompiler, template: string, data: unknown) {
    c.mapShadow(path.join(this.templates, 'data.json'), Buffer.from(JSON.stringify(data)));
    const res = c.compile({ mainFileContent: readFileSync(path.join(this.templates, `${template}.typ`), 'utf8') }) as any;
    const doc = res.result;
    if (!doc) {
      const diag = res.takeDiagnostics?.() ?? res.error;
      const msg = diag ? JSON.stringify(c.fetchDiagnostics(diag)).slice(0, 800) : 'unknown error';
      throw new Error(`PDF template ${template} failed: ${msg}`);
    }
    return Buffer.from(c.pdf(doc));
  }

  async render(template: 'po-letter' | 'acknowledgement', data: unknown): Promise<Buffer> {
    const build = async () => {
      const c = this.c();
      c.resetShadow();
      if (template === 'po-letter') return this.compile(c, template, await this.poData(c, data as PoLetterData));
      return this.compile(c, template, await this.ackData(c, data as AckPdfData));
    };
    try { return await build(); }
    catch (e) {
      // A corrupt user image (signature, stamp, photo) must never make the document unavailable: render without them.
      if (!/image/i.test(String((e as Error).message)) || this.skipUserImages) throw e;
      this.skipUserImages = true;
      try { return await build(); } finally { this.skipUserImages = false; }
    }
  }
  private skipUserImages = false;

  private async poData(c: NodeCompiler, d: PoLetterData) {
    const lines = [...d.lines].sort((a, b) => a.truckNo - b.truckNo);
    const groups = new Map<string, { label: string; qty: number; amt: number }>();
    for (const l of lines) {
      const k = `${l.brand}|${l.pack}`; const g = groups.get(k) ?? { label: `${l.brand} · ${l.pack}`, qty: 0, amt: 0 };
      g.qty += l.qty; g.amt += Math.round(l.qty * l.price * 100) / 100; groups.set(k, g);
    }
    const total = { qty: lines.reduce((a, l) => a + l.qty, 0), amt: lines.reduce((a, l) => a + Math.round(l.qty * l.price * 100) / 100, 0) };
    const logo = d.entity.logo ?? (d.entity.code === 'BTW' ? brandLogo() : null);
    return {
      entity: { name: d.entity.name, address: d.entity.address ?? null, phone: d.entity.phone ?? null, email: d.entity.email ?? null },
      logo: await this.img(c, 'logo', logo),
      date: fmtDate(d.date), ref: d.ref, title: d.title, version: d.version && d.version > 1 ? d.version : null,
      addressedTo: { section: d.addressedTo.section ?? 'The Export Section', name: d.addressedTo.name, city: d.addressedTo.city, country: d.addressedTo.country },
      instruction: d.instruction ?? 'Kindly process and avail stock for loading.',
      currency: d.currency,
      rows: lines.map((l, i) => ({ truckNo: i > 0 && lines[i - 1].truckNo === l.truckNo ? '' : String(l.truckNo), brand: l.brand, pack: l.pack, qty: num(l.qty), price: num(l.price, 2), amount: num(Math.round(l.qty * l.price * 100) / 100, 2) })),
      subtotals: groups.size > 1 ? [...groups.values()].map((g) => ({ label: g.label, qty: num(g.qty), amount: num(g.amt, 2) })) : [],
      truckCount: new Set(lines.map((l) => l.truckNo)).size, totalQty: num(total.qty), totalAmount: num(total.amt, 2),
      preparedBy: { name: d.preparedBy.name, title: d.preparedBy.title ?? null },
      approvedBy: d.approvedBy ? { name: d.approvedBy.name, title: d.approvedBy.title ?? null, at: fmtDate(d.approvedBy.at) } : null,
      signature: await this.img(c, 'signature', d.approvedBy?.signature),
      stamp: await this.img(c, 'stamp', d.stamp),
    };
  }

  private async ackData(c: NodeCompiler, d: AckPdfData) {
    const rows = d.lines.map((l) => { const diff = l.received - l.expected; return { label: `${l.brand} · ${l.pack}`, expected: num(l.expected), received: num(l.received), damaged: num(l.damaged), diff: diff === 0 ? '0' : (diff > 0 ? '+' : '−') + num(Math.abs(diff)), diffBad: diff !== 0, remarks: l.remarks ?? '' }; });
    const t = d.lines.reduce((a, l) => ({ e: a.e + l.expected, r: a.r + l.received, d: a.d + l.damaged }), { e: 0, r: 0, d: 0 });
    const photos: string[] = [];
    for (const [i, p] of (d.photos ?? []).slice(0, 6).entries()) { const x = await this.img(c, `photo-${i}`, p); if (x) photos.push(x); }
    return {
      ...d, receivedAt: fmtDateTime(d.receivedAt), driverName: d.driverName ?? null, logo: await this.img(c, 'logo', brandLogo()),
      rows, totals: { expected: num(t.e), received: num(t.r), damaged: num(t.d), diff: t.r - t.e === 0 ? '0' : (t.r - t.e > 0 ? '+' : '−') + num(Math.abs(t.r - t.e)) },
      discrepancy: d.lines.some((l) => l.received !== l.expected || l.damaged > 0),
      signature: await this.img(c, 'signature', d.signature), photos,
    };
  }
}
