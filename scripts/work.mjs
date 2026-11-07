// Daily work loop: backend + both frontends (hot reload), live API.
//   pnpm work            office web :5173 · field :5174 · API :3101
//   pnpm work -y         same, plus a public ngrok URL for the office web app
//   pnpm work --reset    fresh demo seed first
//   pnpm work --mock     also start in-browser mock copies (web :5183, field :5184)
//   pnpm work --stop     stop the frontends + ngrok started by this script
//   pnpm work --stop --all  also stop the API on :3101 (Docker db stays up)
import { spawn, spawnSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const mock = args.includes('--mock');
const ngrokOn = args.includes('-y') || args.includes('--yes') || args.includes('--ngrok');
const stopOnly = args.includes('--stop');
const stopAll = args.includes('--all');
const ROOT = new URL('..', import.meta.url).pathname;
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
const out = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
const step = (s) => console.log(`\n▸ ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async (url) => { try { const r = await fetch(url); return r.ok || r.status === 404; } catch { return false; } };
const wait = async (url, ms = 90_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await up(url)) return true; await sleep(400); }
  return false;
};
const pidsOn = (port) => {
  try {
    return [...out(`ss -lptn 'sport = :${port}'`).matchAll(/pid=(\d+)/g)].map((m) => Number(m[1]));
  } catch { return []; }
};
const killTree = (pid) => {
  try { execSync(`pkill -TERM -P ${pid}`, { stdio: 'ignore' }); } catch { /* no children */ }
  try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ }
};
const ngrokBin = () => {
  const home = `${process.env.HOME}/.local/bin/ngrok`;
  if (spawnSync('ngrok', ['version']).status === 0) return 'ngrok';
  if (existsSync(home) && spawnSync(home, ['version']).status === 0) return home;
  return null;
};

if (stopOnly) {
  const ports = [5173, 5174, 5183, 5184, 4040, ...(stopAll ? [3101] : [])];
  const pids = [...new Set(ports.flatMap(pidsOn))];
  if (!pids.length) console.log('Nothing to stop (frontends and ngrok are not running).');
  else {
    step(`Stopping ${pids.length} process${pids.length === 1 ? '' : 'es'} on ${ports.filter((p) => pidsOn(p).length).join(', ')}`);
    pids.forEach(killTree);
    await sleep(400);
    console.log(stopAll ? 'Stopped. Docker db/mail are still up (`docker compose down` if you want those too).' : 'Stopped frontends and ngrok. API on :3101 is still up (add --all to stop it too).');
  }
  process.exit(0);
}

step('Database + email inbox (docker compose)');
sh('docker compose up -d --wait db mail');

step('Tokens');
sh('pnpm tokens', { stdio: 'ignore' });

step('Migrations');
sh('pnpm --filter @btw/server db:migrate', { stdio: ['ignore', 'ignore', 'inherit'] });

const users = Number(out(`docker compose exec -T db psql -U btw -d btw -Atc "select count(*) from users"`) || 0);
if (reset || users === 0) {
  step(reset ? 'Reseeding demo data (--reset)' : 'Seeding demo data (empty database)');
  sh('pnpm --filter @btw/server db:seed');
} else console.log(`  demo data present (${users} users) — use --reset to reseed`);

const children = [];
const run = (name, cmd, cmdArgs, env = process.env) => {
  const c = spawn(cmd, cmdArgs, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `[${name}]`.padEnd(8);
  const pipe = (s) => s.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => console.log(`${tag} ${l}`)));
  pipe(c.stdout); pipe(c.stderr);
  c.on('exit', (code) => { if (code) console.log(`${tag} exited with ${code}`); });
  children.push(c);
  return c;
};
const stop = () => {
  children.forEach((c) => killTree(c.pid));
  process.exit(0);
};
process.on('SIGINT', stop); process.on('SIGTERM', stop);

step('1. Backend (API)');
if (await up('http://localhost:3101/health')) console.log('  already running on :3101 — reusing it');
else {
  run('api', 'pnpm', ['--filter', '@btw/server', 'dev'], { ...process.env, SERVE_APPS: '0' });
  if (!(await wait('http://localhost:3101/health'))) { console.error('✗ API did not start on :3101'); stop(); }
}

step('2. Frontends (hot reload, live API)');
if (await up('http://localhost:5173/')) console.log('  office web already on :5173 — reusing it');
else run('web', 'pnpm', ['--filter', '@btw/web', 'run', 'dev:live', '--', '--host', '--strictPort']);
if (await up('http://localhost:5174/')) console.log('  field app already on :5174 — reusing it');
else run('field', 'pnpm', ['--filter', '@btw/field', 'run', 'dev:live', '--', '--host', '--strictPort']);

if (mock) {
  step('Mock copies (in-browser, no API) — compare while updating');
  if (await up('http://localhost:5183/')) console.log('  mock web already on :5183 — reusing it');
  else run('mock-web', 'pnpm', ['--filter', '@btw/web', 'exec', 'vite', '--port', '5183', '--strictPort', '--host']);
  if (await up('http://localhost:5184/')) console.log('  mock field already on :5184 — reusing it');
  else run('mock-ph', 'pnpm', ['--filter', '@btw/field', 'exec', 'vite', '--port', '5184', '--strictPort', '--host']);
}

const webOk = await wait('http://localhost:5173/');
const fieldOk = await wait('http://localhost:5174/');
if (!webOk) console.error('✗ office web did not start on :5173');
if (!fieldOk) console.error('✗ field app did not start on :5174');

let publicUrl = '';
if (ngrokOn) {
  step('3. ngrok (office web :5173)');
  const bin = ngrokBin();
  if (!bin) {
    console.error('ngrok is not installed: https://ngrok.com/download');
    console.error('Stack is running locally. Install ngrok and re-run with -y.');
  } else if (spawnSync(bin, ['config', 'check']).status !== 0) {
    console.error('\nngrok needs your account token once:\n  1. Sign up / log in at https://dashboard.ngrok.com\n  2. Copy the authtoken from "Your Authtoken"\n  3. Run:  ngrok config add-authtoken <TOKEN>\nThen run  pnpm work -y  again.\n');
  } else {
    const ngArgs = ['http', '5173', '--log', 'stdout', '--log-format', 'json'];
    if (process.env.SHARE_DOMAIN) ngArgs.push('--url', process.env.SHARE_DOMAIN);
    if (process.env.SHARE_AUTH) ngArgs.push('--basic-auth', process.env.SHARE_AUTH);
    const ng = spawn(bin, ngArgs, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(ng);
    let buf = '';
    const t0 = Date.now();
    const onLine = (line) => {
      let j; try { j = JSON.parse(line); } catch { return; }
      if (j.lvl === 'eror' || j.err) console.error('ngrok:', j.err ?? j.msg);
      if (!publicUrl && j.url && /^https:\/\//.test(j.url)) publicUrl = j.url.replace(/\/$/, '');
    };
    ng.stdout.on('data', (d) => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); lines.forEach(onLine); });
    ng.stderr.on('data', (d) => process.stderr.write(d));
    while (!publicUrl && Date.now() - t0 < 20_000) await sleep(150);
    if (!publicUrl) console.error('✗ ngrok did not return a public URL');
  }
}

const mockLine = mock ? `
  │ Mock web (compare)  http://localhost:5183/                       │
  │ Mock field          http://localhost:5184/                       │` : '';
const publicLine = publicUrl ? `
  │ PUBLIC (ngrok)      ${(publicUrl + '/').padEnd(42)}│
  │                     first visit: click "Visit Site" on ngrok     │` : (ngrokOn ? `
  │ PUBLIC (ngrok)      not started — see messages above             │` : `
  │ Public URL          pnpm work -y                                 │`);

console.log(`
  ┌──────────────────────────────────────────────────────────────────┐
  │ WORK STACK  (hot reload · live API)                              │
  │                                                                  │
  │ 1 Backend   API          http://localhost:3101/v1                │
  │ 2 Frontend  Office web   http://localhost:5173/                  │
  │             Field app    http://localhost:5174/                  │${mockLine}${publicLine}
  │                                                                  │
  │ Home dashboard tabs — walk these in order as we update:          │
  │   My dashboards     http://localhost:5173/#/                     │
  │   Business          http://localhost:5173/#/dashboards/business  │
  │   Purchasing        http://localhost:5173/#/dashboards/purchasing│
  │   Loading           http://localhost:5173/#/dashboards/loading   │
  │   Fleet             http://localhost:5173/#/dashboards/fleet     │
  │   Fees & expenses   http://localhost:5173/#/dashboards/fees      │
  │   Deliveries        http://localhost:5173/#/dashboards/deliveries│
  │   Warehouse         http://localhost:5173/#/dashboards/warehouse │
  │   Sales             http://localhost:5173/#/dashboards/sales     │
  │   Alerts & admin    http://localhost:5173/#/dashboards/admin     │
  │   Companies         http://localhost:5173/#/overview             │
  │                                                                  │
  │ Web: daniel / demo1234 · Field PIN 1234                          │
  │ Stop: Ctrl+C  or  pnpm work --stop                               │
  └──────────────────────────────────────────────────────────────────┘
`);
