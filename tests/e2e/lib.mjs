// Shared harness for the end-to-end journeys: isolated instance, people (browser contexts), steps, report.
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const OUT = path.join(HERE, 'out');
export const BUILD = path.join(HERE, '.build');
export const PORT = Number(process.env.E2E_PORT ?? 3197);
export const BASE = `http://localhost:${PORT}`;
export const WEB = `${BASE}/`;
export const FIELD = `${BASE}/app/`;
export const API = `${BASE}/v1`;
export const DB_NAME = 'btw_e2e';
export const DB_URL = `postgres://btw:btw@localhost:55433/${DB_NAME}`;
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:18025';
export const PASS = 'demo1234';
export const PIN = '1234';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const psql = (sql, db = 'btw') => execSync(`docker compose exec -T db psql -U btw -d ${db} -v ON_ERROR_STOP=1 -Atc ${JSON.stringify(sql)}`, { cwd: ROOT, encoding: 'utf8' }).trim();
export const sql = (q) => psql(q, DB_NAME);

// ---------------------------------------------------------------------------------------------
// Instance: own database + own server (port 3197) serving the http-mode builds of both apps.
let server;
export async function startInstance({ build = process.env.E2E_SKIP_BUILD !== '1' } = {}) {
  console.log('▸ database', DB_NAME);
  execSync('docker compose up -d --wait db mail', { cwd: ROOT, stdio: 'ignore' });
  psql(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  psql(`CREATE DATABASE ${DB_NAME}`);
  const apiDir = path.join(ROOT, 'apps/api');
  const env = { ...process.env, DATABASE_URL: DB_URL };
  execSync('pnpm exec drizzle-kit migrate', { cwd: apiDir, env, stdio: 'ignore' });
  execSync('node -r @swc-node/register src/db/seed.ts', { cwd: apiDir, env, stdio: 'ignore' });
  if (build) {
    // Same build as `pnpm start` (relative /v1), into the suite's own folder so the user's dist/ is never touched.
    console.log('▸ building web + field (VITE_API=http, /v1) → tests/e2e/.build');
    const benv = { ...process.env, VITE_API: 'http', VITE_API_URL: '/v1' };
    execSync('pnpm tokens', { cwd: ROOT, stdio: 'ignore' });
    for (const app of ['web', 'field']) execSync(`pnpm --filter @btw/${app} exec vite build --outDir ${path.join(BUILD, app)} --emptyOutDir --logLevel error`, { cwd: ROOT, env: benv, stdio: 'inherit' });
  }
  console.log(`▸ server on :${PORT}`);
  const filesDir = path.join(apiDir, 'var/files-e2e'); rmSync(filesDir, { recursive: true, force: true });
  server = spawn(process.execPath, ['-r', '@swc-node/register', 'src/main.ts'], {
    cwd: apiDir, env: { ...env, PORT: String(PORT), NODE_ENV: 'test', FILES_DIR: filesDir, SERVE_APPS: '1', WEB_DIST: path.join(BUILD, 'web'), FIELD_DIST: path.join(BUILD, 'field') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; mkdirSync(OUT, { recursive: true });
  const slog = path.join(OUT, 'server.log'); writeFileSync(slog, '');
  const keep = (d) => { log += d; try { writeFileSync(slog, String(d), { flag: 'a' }); } catch { /* ignore */ } };
  server.stdout.on('data', keep); server.stderr.on('data', keep);
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* booting */ } await sleep(500); }
  throw new Error(`server did not start:\n${log.slice(-2000)}`);
}
export function stopInstance() { try { server?.kill(); } catch { /* gone */ } }

// ---------------------------------------------------------------------------------------------
// People: one browser context each (separate storage = separate phones/PCs), with error capture.
let browser;
export async function launch() { browser = await chromium.launch(); return browser; }
export async function closeBrowser() { await browser?.close(); }

export const VIEW = { desktop: { width: 1440, height: 900 }, laptop: { width: 1024, height: 768 }, phone: { width: 390, height: 844 } };
export async function person(name, { kind = 'web', viewport } = {}) {
  const isPhone = kind === 'field';
  const ctx = await browser.newContext({
    viewport: viewport ?? (isPhone ? VIEW.phone : VIEW.desktop), deviceScaleFactor: 1, isMobile: isPhone, hasTouch: isPhone,
    timezoneId: 'Africa/Nairobi', locale: 'en-GB', acceptDownloads: true, permissions: [],
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const p = { name, kind, ctx, page, console: [], failed: [], expect: [] };
  page.on('pageerror', (e) => p.console.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') p.console.push(m.text()); });
  const answered = new WeakSet();
  page.on('response', async (r) => {
    answered.add(r.request()); const u = r.url();
    if (r.status() < 400 || !u.startsWith(BASE)) return;
    const entry = `${r.status()} ${r.request().method()} ${u.slice(BASE.length)}`; p.failed.push(entry);
    try { const b = await r.json(); const i = p.failed.lastIndexOf(entry); if (i >= 0 && b?.title) p.failed[i] = `${entry} “${b.title}”`; } catch { /* not JSON */ }
  });
  // Chromium reports some completed requests (e.g. 204 with an unread body) as aborted; only count ones with no response.
  page.on('requestfailed', (r) => { const u = r.url(); if (u.startsWith(BASE) && !answered.has(r)) p.failed.push(`FAILED ${r.method()} ${u.slice(BASE.length)} (${r.failure()?.errorText})`); });
  await page.goto(kind === 'field' ? FIELD : WEB);
  await page.waitForLoadState('networkidle').catch(() => {});
  return p;
}

// ---- web ----
export async function webSignIn(p, phone) {
  const page = p.page;
  if (await page.locator('button[aria-label="Sign out"]').count()) { await page.click('button[aria-label="Sign out"]'); await sleep(600); }
  await page.fill('#login-user', phone); await page.fill('#login-pass', PASS);
  await page.click('form button:has-text("Sign in")');
  await page.waitForSelector('aside.side', { timeout: 15000 });
  await sleep(500);
}
export async function webGo(p, hash, wait = 1200) {
  // Same hash = no navigation (web screens don't poll), so reload to get fresh data.
  const same = await p.page.evaluate((h) => location.hash === `#${h}`, hash);
  if (same) { await p.page.reload(); await p.page.waitForSelector('aside.side', { timeout: 15000 }).catch(() => {}); }
  else await p.page.evaluate((h) => (location.hash = h), hash);
  await sleep(wait);
}

// ---- field ----
export async function fieldSignIn(p, phone, pin = PIN) {
  const page = p.page;
  await page.locator('input[type=tel]').fill(phone);
  await page.getByRole('button', { name: /continue/i }).click();
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.pad'), null, { timeout: 15000 });
  await sleep(1200);
}
/** Drag the slide-to-confirm knob all the way (scoped to an optional container). */
export async function slide(page, within = page) {
  const knob = within.locator('.knob').first();
  await knob.scrollIntoViewIfNeeded();
  const kb = await knob.boundingBox(); const tb = await within.locator('.track').first().boundingBox();
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2); await page.mouse.down();
  for (let i = 1; i <= 16; i++) await page.mouse.move(kb.x + kb.width / 2 + (tb.width * i) / 16, kb.y + kb.height / 2);
  await page.mouse.up(); await sleep(300);
}
export async function knobLabel(page) {
  const k = page.locator('.knob');
  if (!(await k.count())) return null; // no slide on screen (e.g. at destination) — don't wait for one
  return (await k.first().getAttribute('aria-label', { timeout: 2000 }).catch(() => null))?.replace('Slide to confirm: ', '') ?? null;
}
/** Waits until the predicate on the knob label holds (polls; the field app refreshes on its own). */
export async function waitForLabel(page, re, timeout = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const l = await knobLabel(page); if (l && re.test(l)) return l; await sleep(500); }
  throw new Error(`slide label never matched ${re} (last: ${await knobLabel(page)})`);
}
export async function sign(page, canvas) {
  await canvas.scrollIntoViewIfNeeded();
  const c = await canvas.boundingBox();
  await page.mouse.move(c.x + 30, c.y + c.height * 0.6); await page.mouse.down();
  for (let i = 0; i <= 20; i++) await page.mouse.move(c.x + 30 + i * 10, c.y + c.height * (0.6 - 0.3 * Math.sin(i / 3)), { steps: 2 });
  await page.mouse.up(); await sleep(200);
}
export const PHOTO = path.join(ROOT, 'tools/mockups/fixtures/damage-photo.jpg');

// ---- api (read-only checks and dev endpoints) ----
export async function apiLogin(body) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`login ${r.status}`); return (await r.json()).accessToken;
}
// Access tokens live 15 min; long journeys re-login transparently (tokens are cached per credential).
const tokens = new Map();
export async function apiToken(body) { const k = JSON.stringify(body); if (!tokens.has(k)) tokens.set(k, await apiLogin(body)); return { k, body }; }
export async function apiGet(token, p) {
  const tok = typeof token === 'string' ? token : tokens.get(token.k);
  let r = await fetch(`${API}${p}`, { headers: { authorization: `Bearer ${tok}` } });
  if (r.status === 401 && typeof token !== 'string') { tokens.set(token.k, await apiLogin(token.body)); r = await fetch(`${API}${p}`, { headers: { authorization: `Bearer ${tokens.get(token.k)}` } }); }
  if (!r.ok) throw new Error(`GET ${p} → ${r.status}`); return r.json();
}
export async function apiPost(p, body, token) {
  const r = await fetch(`${API}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const txt = await r.text(); return { status: r.status, body: txt ? JSON.parse(txt) : null };
}

// ---- layout checks ----
export async function overflow(page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const over = document.documentElement.scrollWidth > w + 1;
    const culprits = over ? [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > w + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.table-wrap, .leaflet-container, [style*="overflow"]'); }).slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`) : [];
    return { over, width: document.documentElement.scrollWidth, viewport: w, culprits };
  });
}

// ---------------------------------------------------------------------------------------------
// Steps + report
export const results = [];
let journey = '';
export function startJourney(name) { journey = name; console.log(`\n■ ${name}`); }
/** Runs one step; records console errors / failed requests seen by the given people during it. */
export async function step(name, people, fn, { allow = [] } = {}) {
  const ps = [people].flat().filter(Boolean);
  const before = ps.map((p) => [p.console.length, p.failed.length]);
  const r = { journey, name, ok: true, note: '', console: [], requests: [], shots: [] };
  const t0 = Date.now();
  try { const v = await fn(); if (typeof v === 'string') r.note = v; }
  catch (e) { r.ok = false; r.note = String(e?.message ?? e).split('\n')[0].slice(0, 300); }
  r.ms = Date.now() - t0;
  const allowed = (s) => allow.some((a) => (a instanceof RegExp ? a.test(s) : s.includes(a)));
  ps.forEach((p, i) => {
    r.console.push(...p.console.slice(before[i][0]).filter((x) => !allowed(x)).map((x) => `${p.name}: ${x}`));
    r.requests.push(...p.failed.slice(before[i][1]).filter((x) => !allowed(x)).map((x) => `${p.name}: ${x}`));
  });
  if (r.console.length || r.requests.length) r.ok = false;
  mkdirSync(path.join(OUT, 'shots'), { recursive: true });
  for (const p of ps) {
    const file = `shots/${String(results.length + 1).padStart(3, '0')}-${p.name.replace(/\W+/g, '-')}.png`;
    try { await p.page.screenshot({ path: path.join(OUT, file), fullPage: p.kind === 'web' }); r.shots.push(file); } catch { /* page gone */ }
  }
  results.push(r);
  console.log(`  ${r.ok ? '✓' : '✗'} ${name}${r.note ? ` — ${r.note}` : ''}${r.requests.length ? `\n      requests: ${r.requests.join(' | ').slice(0, 400)}` : ''}${r.console.length ? `\n      console: ${r.console.join(' | ').slice(0, 400)}` : ''}`);
  return r.ok;
}
export const must = (cond, msg) => { if (!cond) throw new Error(msg); };

export function writeReport(meta) {
  mkdirSync(OUT, { recursive: true });
  const ok = results.filter((r) => r.ok).length;
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const md = [`# E2E run — ${new Date().toISOString()}`, '', `${ok}/${results.length} steps passed · instance ${BASE} · db ${DB_NAME} · ${meta.duration}`, ''];
  let j = '';
  for (const r of results) {
    if (r.journey !== j) { j = r.journey; md.push(`\n## ${j}\n`, '| | Step | Note | ms |', '|---|---|---|---|'); }
    md.push(`| ${r.ok ? '✅' : '❌'} | ${r.name} | ${[r.note, ...r.requests, ...r.console].filter(Boolean).join('<br>').replace(/\|/g, '\\|').slice(0, 600)} | ${r.ms} |`);
  }
  writeFileSync(path.join(OUT, 'report.md'), md.join('\n') + '\n');
  const html = `<!doctype html><meta charset="utf-8"><title>BTW e2e</title><style>body{font:14px system-ui;margin:24px;max-width:1200px}h2{margin-top:32px}.r{border:1px solid #ccd;border-radius:8px;padding:10px;margin:8px 0}.bad{border-color:#b4231b;background:#fdecea}.shots img{max-height:260px;margin:6px 6px 0 0;border:1px solid #ccd}</style>
<h1>BTW end-to-end run</h1><p>${ok}/${results.length} steps passed · ${esc(BASE)} · ${esc(meta.duration)}</p>
${results.map((r, i) => `${i === 0 || results[i - 1].journey !== r.journey ? `<h2>${esc(r.journey)}</h2>` : ''}<div class="r ${r.ok ? '' : 'bad'}"><b>${r.ok ? '✅' : '❌'} ${esc(r.name)}</b> <small>${r.ms} ms</small><div>${esc([r.note, ...r.requests, ...r.console].filter(Boolean).join(' · '))}</div><div class="shots">${r.shots.map((s) => `<a href="${s}"><img src="${s}" loading="lazy"></a>`).join('')}</div></div>`).join('\n')}`;
  writeFileSync(path.join(OUT, 'report.html'), html);
  return { ok, total: results.length };
}
export { existsSync };
