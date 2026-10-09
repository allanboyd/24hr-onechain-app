// QA harness: isolated database + API process, raw HTTP helpers and a tiny assertion reporter.
// Never touches the user's `btw` database or the server on :3101.
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import postgres from 'postgres';

export const ROOT = path.resolve(__dirname, '../..');
const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://btw:btw@localhost:55433/btw';

export interface Env { base: string; port: number; dbUrl: string; sql: postgres.Sql; stop: () => Promise<void>; log: () => string }

/** Fresh database `name`, migrated + seeded, and an API process on `port` with extra env. */
export async function boot(name: string, port: number, env: Record<string, string> = {}, opts: { seed?: boolean } = {}): Promise<Env> {
  try { await fetch(`http://localhost:${port}/health`); throw new Error(`port ${port} is already in use — refusing to test someone else's server`); } catch (e) { if (/already in use/.test(String(e))) throw e; }
  const dbUrl = ADMIN_URL.replace(/\/[^/]+$/, `/${name}`);
  const admin = postgres(ADMIN_URL, { onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${name}`);
  await admin.end();
  execSync('pnpm exec drizzle-kit migrate', { cwd: ROOT, env: { ...process.env, DATABASE_URL: dbUrl }, stdio: 'ignore' });
  if (opts.seed !== false) execSync('node -r @swc-node/register src/db/seed.ts', { cwd: ROOT, env: { ...process.env, DATABASE_URL: dbUrl }, stdio: 'ignore' });
  const server: ChildProcess = spawn(process.execPath, ['-r', '@swc-node/register', 'src/main.ts'], {
    cwd: ROOT, env: { ...process.env, DATABASE_URL: dbUrl, PORT: String(port), PUBLIC_URL: `http://localhost:${port}`, NODE_ENV: 'test', SERVE_APPS: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; server.stdout!.on('data', (d) => (log += d)); server.stderr!.on('data', (d) => (log += d));
  const kill = () => { try { server.kill(); } catch { /* gone */ } };
  process.on('exit', kill);
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 400)); }
  const sql = postgres(dbUrl, { onnotice: () => {} });
  return {
    base: `http://localhost:${port}/v1`, port, dbUrl, sql, log: () => log,
    stop: async () => { kill(); await sql.end({ timeout: 2 }); await new Promise((r) => setTimeout(r, 300)); },
  };
}

export interface Res<T = any> { status: number; body: T; headers: Headers; ms: number }
export function client(base: string) {
  async function req<T = any>(method: string, p: string, o: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string; form?: Record<string, string> } = {}): Promise<Res<T>> {
    const headers: Record<string, string> = { ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(o.headers ?? {}) };
    let body: string | undefined;
    if (o.form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(o.form).toString(); }
    else if (o.raw !== undefined) { headers['content-type'] ??= 'application/json'; body = o.raw; }
    else if (o.body !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(o.body); }
    const t0 = performance.now();
    const r = await fetch(`${base}${p}`, { method, headers, body, signal: AbortSignal.timeout(20_000) });
    const text = await r.text();
    let parsed: unknown = text; try { parsed = text ? JSON.parse(text) : null; } catch { /* text */ }
    return { status: r.status, body: parsed as T, headers: r.headers, ms: performance.now() - t0 };
  }
  const tokens = new Map<string, any>();
  async function login(who: string, secret = 'demo1234', extra: Record<string, string> = {}) {
    const pin = /^\d{4,6}$/.test(secret);
    const r = await req('POST', '/auth/login', { body: pin ? { phone: who, pin: secret, ...extra } : { username: who, password: secret, ...extra } });
    if (r.status !== 200) throw new Error(`login ${who} → ${r.status} ${JSON.stringify(r.body)}`);
    tokens.set(who, r.body);
    return r.body as { accessToken: string; refreshToken: string; deviceId: string; user: { id: string } };
  }
  return { req, login, tokens };
}

// ---- reporting --------------------------------------------------------------------------
export const results: { suite: string; name: string; ok: boolean; detail?: string }[] = [];
let suite = '';
export const section = (s: string) => { suite = s; console.log(`\n── ${s}`); };
export function ok(cond: unknown, name: string, detail?: unknown) {
  const pass = !!cond;
  results.push({ suite, name, ok: pass, detail: pass ? undefined : String(typeof detail === 'string' ? detail : JSON.stringify(detail))?.slice(0, 300) });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${pass || detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)?.slice(0, 300)}`}`);
}
export const expectStatus = (r: Res, want: number | number[], name: string) => ok((Array.isArray(want) ? want : [want]).includes(r.status), `${name} → ${r.status}`, r.body);
export function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} QA checks passed`);
  for (const f of failed) console.log(`  FAIL [${f.suite}] ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  return failed.length;
}
