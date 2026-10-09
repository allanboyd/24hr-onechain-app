// One entry point for the whole platform.
//   pnpm start      → infra + migrate + seed-if-empty + build both apps for the API + ONE server on http://localhost:3101
//   pnpm dev:all    → infra + migrate + seed-if-empty + API (watch) + web :5173 + field :5174 with hot reload, one terminal
//   add --reset     → reseed the demo data first
import { spawn, execSync } from 'node:child_process';

const mode = process.argv[2] ?? 'start';
const reset = process.argv.includes('--reset');
const ROOT = new URL('..', import.meta.url).pathname;
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
const out = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
const step = (s) => console.log(`\n▸ ${s}`);
const httpEnv = (url) => ({ ...process.env, VITE_API: 'http', VITE_API_URL: url });

step('Database + email inbox (docker compose)');
sh('docker compose up -d --wait db mail');

step('Migrations');
sh('pnpm --filter @btw/server db:migrate', { stdio: ['ignore', 'ignore', 'inherit'] });

const users = Number(out(`docker compose exec -T db psql -U btw -d btw -Atc "select count(*) from users"`) || 0);
if (reset || users === 0) { step(reset ? 'Reseeding demo data (--reset)' : 'Seeding demo data (empty database)'); sh('pnpm --filter @btw/server db:seed'); }
else console.log(`  demo data present (${users} users) — use --reset to reseed`);

const children = [];
const run = (name, cmd, args, env = process.env) => {
  const c = spawn(cmd, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `[${name}]`.padEnd(8);
  const pipe = (s) => s.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => console.log(`${tag} ${l}`)));
  pipe(c.stdout); pipe(c.stderr);
  c.on('exit', (code) => { if (code) console.log(`${tag} exited with ${code}`); });
  children.push(c); return c;
};
const stop = () => { children.forEach((c) => c.kill('SIGTERM')); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);

if (mode === 'start') {
  step('Building web + field for the API (same origin, /v1)');
  sh('pnpm tokens', { stdio: 'ignore' });
  sh('pnpm --filter @btw/web build', { env: httpEnv('/v1'), stdio: ['ignore', 'ignore', 'inherit'] });
  sh('pnpm --filter @btw/field build', { env: httpEnv('/v1'), stdio: ['ignore', 'ignore', 'inherit'] });
  step('Starting the single server');
  run('server', 'pnpm', ['--filter', '@btw/server', 'start'], { ...process.env, NODE_ENV: process.env.NODE_ENV ?? 'development' });
  setTimeout(() => console.log(`
  ┌──────────────────────────────────────────────────────────────┐
  │ Office web app   http://localhost:3101/                      │
  │ Field app        http://localhost:3101/app/   (phone size)   │
  │ Logo variants    http://localhost:3101/brand/                │
  │ API              http://localhost:3101/v1   ·  /health       │
  │ Email inbox      http://localhost:18025                      │
  │ Web: +254700000001 / demo1234 · Field PIN 1234 · Ctrl+C stop │
  └──────────────────────────────────────────────────────────────┘`), 6000);
} else {
  step('API (watch) + web + field (hot reload, live API)');
  run('api', 'pnpm', ['--filter', '@btw/server', 'dev'], { ...process.env, SERVE_APPS: '0' });
  run('web', 'pnpm', ['--filter', '@btw/web', 'exec', 'vite', '--port', '5173', '--strictPort'], httpEnv('/v1'));
  run('field', 'pnpm', ['--filter', '@btw/field', 'exec', 'vite', '--port', '5174', '--strictPort'], httpEnv('/v1'));
  setTimeout(() => console.log(`
  Web http://localhost:5173 · Field http://localhost:5174 · API http://localhost:3101/v1 · Inbox http://localhost:18025`), 6000);
}
