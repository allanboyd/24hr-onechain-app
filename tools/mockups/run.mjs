// pnpm mockups [--only A,D] [--no-gallery]
// Starts the web + field dev servers if they aren't running, runs every mockup flow,
// then builds the review gallery at mockups/gallery/index.html.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { REPO } from './snap.mjs';
import { FLOWS } from './flows.mjs';
import { buildGallery } from './gallery.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].toUpperCase().split(',') : null;
const flows = FLOWS.filter((f) => !only || only.includes(f.key));
const SERVERS = [
  { name: 'web', url: process.env.WEB_URL ?? 'http://localhost:5173/', pkg: '@btw/web', port: 5173 },
  { name: 'field', url: process.env.FIELD_URL ?? 'http://localhost:5174/', pkg: '@btw/field', port: 5174 },
];
const up = async (url) => { try { return (await fetch(url)).ok; } catch { return false; } };
const children = [];
const stop = () => children.forEach((c) => { try { process.kill(-c.pid); } catch { /* already gone */ } });
process.on('exit', stop); process.on('SIGINT', () => process.exit(130));

for (const s of SERVERS) {
  if (await up(s.url)) { console.log(`✓ ${s.name} already running at ${s.url}`); continue; }
  console.log(`… starting ${s.name} dev server on :${s.port}`);
  const c = spawn('pnpm', ['--filter', s.pkg, 'exec', 'vite', '--port', String(s.port), '--strictPort'], { cwd: REPO, detached: true, stdio: 'ignore' });
  children.push(c);
  for (let i = 0; i < 60 && !(await up(s.url)); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up(s.url))) { console.error(`✗ ${s.name} did not start`); process.exit(1); }
}

const runFlow = (f) => new Promise((resolve) => {
  const outDir = path.join(REPO, 'mockups/shots', f.key);
  rmSync(outDir, { recursive: true, force: true });
  const t0 = Date.now();
  const c = spawn(process.execPath, [path.join(REPO, 'tools/mockups/flows', f.file), outDir], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  c.stdout.on('data', (d) => (log += d)); c.stderr.on('data', (d) => (log += d));
  c.on('close', (code) => { console.log(`${code === 0 ? '✓' : '✗'} ${f.key} ${f.file} (${((Date.now() - t0) / 1000).toFixed(0)} s)`); if (code !== 0 || /WARN|error/i.test(log)) console.log(log.trim().replace(/^/gm, '    ')); resolve(code); });
});

// Two at a time: enough parallelism without starving the dev servers.
const codes = [];
for (let i = 0; i < flows.length; i += 2) codes.push(...(await Promise.all(flows.slice(i, i + 2).map(runFlow))));
if (!args.includes('--no-gallery')) {
  const { out, count } = await buildGallery();
  console.log(`\nGallery: ${count} screens → ${path.join(out, 'index.html')}`);
}
stop();
process.exit(codes.some((c) => c !== 0) ? 1 : 0);
