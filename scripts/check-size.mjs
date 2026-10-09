// Performance budget from docs/03-mvp-plan.md §2.2: initial JS (gzipped) per app. Run after `pnpm build`.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const BUDGET = { web: 120, field: 80 }; // KB gzipped, entry chunk (lazy chunks such as the map are excluded)
let failed = false;
for (const [app, kb] of Object.entries(BUDGET)) {
  // The entry chunk is the module script in dist/index.html (several index-*.js chunks may exist).
  const dist = path.join('apps', app, 'dist');
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const entry = html.match(/<script[^>]+type="module"[^>]+src="\.?\/?([^"]+\.js)"/)?.[1];
  if (!entry) throw new Error(`No module entry script in ${dist}/index.html`);
  const size = gzipSync(readFileSync(path.join(dist, entry))).length / 1024;
  const ok = size <= kb;
  failed ||= !ok;
  console.log(`${ok ? '✓' : '✗'} ${app.padEnd(5)} ${size.toFixed(1)} KB gzipped (budget ${kb} KB)`);
}
process.exit(failed ? 1 : 0);
