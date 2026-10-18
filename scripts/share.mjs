// pnpm share  → runs the platform (single point on :3101, demo build) and exposes it with ngrok.
//   SHARE_DOMAIN=my-name.ngrok-free.app   use your reserved/static ngrok domain (stable link)
//   SHARE_AUTH=user:password              ask visitors for a password before anything loads
//   --reset                               fresh demo data first
// One-time: create a free ngrok account and run  ngrok config add-authtoken <TOKEN>
import { spawn, spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 3101;
const up = async () => { try { return (await fetch(`http://localhost:${PORT}/health`)).ok; } catch { return false; } };
const children = [];
const stop = () => { children.forEach((c) => { try { c.kill('SIGTERM'); } catch { /* gone */ } }); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);

// 1. ngrok present and signed in?
if (spawnSync('ngrok', ['version']).status !== 0) { console.error('ngrok is not installed: https://ngrok.com/download'); process.exit(1); }
if (spawnSync('ngrok', ['config', 'check']).status !== 0) {
  console.error('\nngrok needs your account token once:\n  1. Sign up / log in at https://dashboard.ngrok.com\n  2. Copy the authtoken from "Your Authtoken"\n  3. Run:  ngrok config add-authtoken <TOKEN>\nThen run  pnpm share  again.\n');
  process.exit(1);
}

// 2. The platform on :3101 (reuse it if already running, e.g. from `pnpm start`)
if (await up()) console.log(`✓ platform already running on :${PORT}`);
else {
  console.log('… starting the platform (pnpm start)');
  const s = spawn('node', ['scripts/stack.mjs', 'start', ...(process.argv.includes('--reset') ? ['--reset'] : [])], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, VITE_DEMO: '1' } });
  s.stdout.on('data', (d) => process.stdout.write(String(d).split('\n').filter((l) => /▸|seeded|error|Error/.test(l)).map((l) => l + '\n').join('')));
  children.push(s);
  for (let i = 0; i < 300 && !(await up()); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!(await up())) { console.error('✗ the platform did not start — run `pnpm start` to see why'); stop(); }
}

// 3. Tunnel
const args = ['http', String(PORT), '--log', 'stdout', '--log-format', 'json'];
if (process.env.SHARE_DOMAIN) args.push('--url', process.env.SHARE_DOMAIN);
if (process.env.SHARE_AUTH) args.push('--basic-auth', process.env.SHARE_AUTH);
const ng = spawn('ngrok', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
children.push(ng);
let shown = false;
const onLine = (line) => {
  let j; try { j = JSON.parse(line); } catch { return; }
  if (j.lvl === 'eror' || j.err) console.error('ngrok:', j.err ?? j.msg);
  if (!shown && j.url && /^https:\/\//.test(j.url)) {
    shown = true;
    const u = j.url.replace(/\/$/, '');
    console.log(`
  ┌───────────────────────────────────────────────────────────────────────┐
  │ PUBLIC DEMO (share these links)                                       │
  │ Office web app  ${(u + '/').padEnd(54)}│
  │ Field app       ${(u + '/app/').padEnd(54)}│
  │ Logo variants   ${(u + '/brand/').padEnd(54)}│
  │ Web: tap a demo account (password demo1234) · Field: PIN 1234         │
  │ Anyone with the link can use the demo accounts. Ctrl+C to stop.       │
  └───────────────────────────────────────────────────────────────────────┘
  First visit on the free ngrok plan shows an ngrok notice page: click "Visit Site".`);
  }
};
let buf = '';
ng.stdout.on('data', (d) => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); lines.forEach(onLine); });
ng.stderr.on('data', (d) => process.stderr.write(d));
ng.on('exit', (code) => { console.error(`ngrok stopped (${code}).`); stop(); });
