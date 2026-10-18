// Renders BTW-Platform-Architecture.html to PDF (static arrows), saves each diagram as diagrams/NN-name.png
// (used by build_docx.py for the Word copy) and reports the page count.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
const p = await b.newPage({ deviceScaleFactor: 2 });
await p.goto('file://' + path.join(here, 'BTW-Platform-Architecture.html'), { waitUntil: 'networkidle' });
await p.waitForFunction(() => document.querySelectorAll('.mxgraph svg').length >= 4, null, { timeout: 30000 });
await p.waitForTimeout(800);
const names = ['01-architecture', '02-process', '03-data-flow', '04-use-cases'];
await p.setViewportSize({ width: 1400, height: 1000 });
await p.waitForTimeout(500);
const dgs = await p.$$('.dg');
for (let i = 0; i < dgs.length && i < names.length; i++) await dgs[i].screenshot({ path: path.join(here, 'diagrams', names[i] + '.png'), scale: 'device' });
await p.emulateMedia({ media: 'print' });
const out = path.join(here, 'BTW-Platform-Architecture.pdf');
await p.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
await b.close();
const { readFileSync } = await import('node:fs');
const pages = (readFileSync(out, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`PDF: ${out} · ${pages} pages`);
