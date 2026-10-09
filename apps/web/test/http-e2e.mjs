// Click-through of the web app against the REAL API (VITE_API=http).
//   pnpm --filter @btw/web test:http      (API must be running on :3101, migrated and seeded)
// Starts its own web dev server on :5175 in http mode, signs in through the UI, runs the main flows,
// and reports each step. Screenshots go to apps/web/test/out/ for review.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out'); mkdirSync(OUT, { recursive: true });
const WEB = 'http://localhost:5175/';
const API = process.env.API_URL ?? 'http://localhost:3101';
const PASS = 'demo1234';
const PHONES = { director: '+254700000001', planner: '+254700000002', loader: '+254700000003', admin: '+254700000010', accounts: '+254700000009' };

const up = async (u) => { try { return (await fetch(u)).ok; } catch { return false; } };
if (!(await up(API + '/health'))) { console.error(`API not reachable at ${API}/health`); process.exit(2); }
let server;
if (!(await up(WEB))) {
  // Same-origin via the dev proxy (/v1 → API), as in local http-mode development.
  server = spawn('pnpm', ['exec', 'vite', '--port', '5175', '--strictPort'], { cwd: path.join(HERE, '..'), env: { ...process.env, VITE_API: 'http', VITE_API_URL: '/v1', API_PROXY_TARGET: API }, detached: true, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up(WEB)); i++) await new Promise((r) => setTimeout(r, 500));
}
const stop = () => { if (server) try { process.kill(-server.pid); } catch { /* gone */ } };
process.on('exit', stop);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Africa/Nairobi', locale: 'en-GB', acceptDownloads: true });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
const failedRequests = [];
page.on('response', (r) => { const u = r.url(); if (u.includes('/v1/') && r.status() >= 400) failedRequests.push(`${r.status()} ${r.request().method()} ${u.slice(u.indexOf('/v1/'))}`); });

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function step(name, fn, { expectStatus } = {}) {
  const before = consoleErrors.length, reqBefore = failedRequests.length;
  try {
    await fn();
    const alerts = await page.locator('.err[role=alert]').allInnerTexts();
    const ok = !alerts.length;
    results.push({ name, ok, note: alerts.join(' | ').slice(0, 200) });
  } catch (e) { results.push({ name, ok: false, note: String(e.message ?? e).split('\n')[0].slice(0, 200) }); }
  const r = results.at(-1);
  const expected = (x) => expectStatus && x.includes(String(expectStatus));
  r.console = consoleErrors.slice(before).filter((x) => !expected(x)); r.requests = failedRequests.slice(reqBefore).filter((x) => !expected(x));
  await page.screenshot({ path: path.join(OUT, `${String(results.length).padStart(2, '0')}-${name.replace(/\W+/g, '-')}.png`), fullPage: true }).catch(() => {});
  console.log(`${r.ok ? '✓' : '✗'} ${name}${r.note ? ' — ' + r.note : ''}${r.requests.length ? `\n    API: ${r.requests.join(', ')}` : ''}${r.console.length ? `\n    console: ${r.console.slice(0, 3).join(' | ').slice(0, 300)}` : ''}`);
}
const go = async (hash, wait = 1200) => {
  if (!(await page.locator('aside.side').count())) throw new Error('not signed in');
  await page.evaluate((h) => (location.hash = h), hash); await sleep(wait);
};
async function signIn(phone) {
  if (await page.locator('button[aria-label="Sign out"]').count()) { await page.click('button[aria-label="Sign out"]'); await sleep(500); }
  await page.fill('#login-user', phone); await page.fill('#login-pass', PASS);
  await page.click('form button:has-text("Sign in")');
  await page.waitForSelector('aside.side', { timeout: 10000 });
  await sleep(800);
}

await page.goto(WEB); await sleep(800);

await step('sign-in rejects a wrong password', async () => {
  await page.fill('#login-user', PHONES.planner); await page.fill('#login-pass', 'wrong');
  await page.click('form button:has-text("Sign in")'); await sleep(1200);
  if (!(await page.locator('form .error').count())) throw new Error('no error shown');
}, { expectStatus: 401 });
await step('planner signs in → dashboard', () => signIn(PHONES.planner));

let planHash = '';
await step('planner creates and submits a plan', async () => {
  await go('/plans/new'); await page.click('text=Create draft'); await sleep(1500);
  await page.fill('input[placeholder^="e.g. October"]', 'HTTP e2e order');
  await page.click('button:has-text("Add truck")'); await sleep(300);
  await page.locator('table.lines input.qty').nth(0).fill('1500');
  await page.click('button:has-text("Submit for approval")'); await sleep(2500);
  planHash = await page.evaluate(() => location.hash.slice(1));
  if (!(await page.locator('text=Submitted').count())) throw new Error('plan not submitted');
});

await step('director signs in and approves with signature', async () => {
  await signIn(PHONES.director); await go(planHash, 1800);
  await page.click('button:has-text("Approve & sign")'); await sleep(400);
  const c = await page.locator('dialog canvas').boundingBox();
  await page.mouse.move(c.x + 30, c.y + 60); await page.mouse.down();
  for (const [x, y] of [[80, 30], [130, 80], [180, 30], [240, 70]]) await page.mouse.move(c.x + x, c.y + y, { steps: 5 });
  await page.mouse.up();
  await page.click('dialog button:has-text("Approve & sign")'); await sleep(2500);
  if (!(await page.locator('text=Approved').count())) throw new Error('not approved');
});

await step('PO letter → download server PDF', async () => {
  const link = page.locator('a:has-text("View purchase order")');
  if (await link.count()) await link.first().click(); else { await go('/pos', 1500); await page.click('table td.mono a >> nth=0'); }
  await sleep(1500);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('button:has-text("Download PDF")')]);
  const file = path.join(OUT, await dl.suggestedFilename()); await dl.saveAs(file);
  const { readFileSync } = await import('node:fs');
  if (!readFileSync(file).subarray(0, 5).toString().startsWith('%PDF')) throw new Error('download is not a PDF');
});
await step('PO → email to supplier', async () => {
  const b = page.locator('button:has-text("Email to supplier"), button:has-text("Mark as sent")');
  if (await b.count()) { await b.first().click(); await sleep(2000); }
  if (!(await page.locator('text=/Sent \\d/').count())) throw new Error('not marked sent');
});

await step('loader records a loading', async () => {
  await signIn(PHONES.loader); await go('/loading', 2000);
  await page.getByRole('button', { name: 'Record loading' }).first().click(); await sleep(500);
  const d = page.locator('dialog[open]');
  await d.locator('input[type=number]').last().fill('900');
  await d.getByRole('button', { name: 'Confirm loading' }).click(); await sleep(2500);
  if (!(await page.evaluate(() => location.hash)).includes('/shipments/')) throw new Error(await d.innerText().catch(() => 'stayed on loading'));
});

await signIn(PHONES.director).catch(() => {});
for (const [name, hash] of [['shipments list', '/shipments'], ['tracking map', '/tracking'], ['inventory', '/inventory'], ['sales', '/sales'], ['trip financials', '/finance'], ['sales velocity', '/analytics'], ['master data', '/master'], ['notifications', '/notifications'], ['users & devices', '/users']])
  await step(`director opens ${name}`, async () => { await go(hash, hash === '/tracking' ? 3000 : 1800); });

await step('admin opens integrations + SMS tester', async () => {
  await signIn(PHONES.admin); await go('/integrations', 1800);
  const btn = page.locator('button:has-text("Send test SMS")');
  if (await btn.count()) { await btn.click(); await sleep(2000); }
});
await step('sign out returns to sign-in', async () => {
  await page.click('button[aria-label="Sign out"]'); await sleep(800);
  if (!(await page.locator('#login-user').count())) throw new Error('not on sign-in');
});

await browser.close(); stop();
const bad = results.filter((r) => !r.ok || r.console.length);
console.log(`\n${results.length - bad.length}/${results.length} steps clean · screenshots in ${OUT}`);
process.exit(bad.length ? 1 : 0);
