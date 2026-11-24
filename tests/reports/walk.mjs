// pnpm reports:walk
// Signs in as Daniel and opens every report tab. Each chart card is opened as a table, then back as a chart.
// Uses the office app already on :5173, or starts the mock dev server. WEB_URL overrides the address.
// Writes tests/reports/out/report.md. Exits 1 if a tab is blank, a chart will not switch, or the page throws.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tests/reports/out');
const WEB = process.env.WEB_URL ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const up = async (url) => { try { return (await fetch(url)).ok; } catch { return false; } };

let child = null;
async function ensureServer() {
  if (await up(WEB)) { console.log(`✓ web already running at ${WEB}`); return; }
  console.log('… starting the office app (mock) on :5173');
  child = spawn('pnpm', ['--filter', '@btw/web', 'exec', 'vite', '--port', '5173', '--strictPort', '--host'], {
    cwd: ROOT, detached: true, stdio: 'ignore',
  });
  for (let i = 0; i < 60 && !(await up(WEB)); i++) await sleep(500);
  if (!(await up(WEB))) throw new Error('office app did not start on :5173');
}
const stopServer = () => { if (child?.pid) { try { process.kill(-child.pid); } catch { /* already gone */ } } };

const lines = [];
const problems = [];
const note = (s) => { lines.push(s); console.log(s); };
const fail = (s) => { problems.push(s); note(`✗ ${s}`); };

async function drawn(section) {
  return section.locator('.js-plotly-plot, svg, canvas, table, .nodata, [role="img"]').count();
}

async function walkSection(page, section, label) {
  await section.scrollIntoViewIfNeeded().catch(() => {});
  for (let i = 0; i < 8 && !(await drawn(section)) && !(await section.locator('ul, ol, table').count()); i++) await page.waitForTimeout(400);
  const tableBtn = section.getByRole('button', { name: 'Show table' });
  const viewData = section.getByRole('button', { name: 'View data' });
  if (await tableBtn.count()) {
    await tableBtn.click();
    const table = section.locator('table');
    try { await table.waitFor({ timeout: 5000 }); }
    catch { fail(`${label}: table did not open`); }
    await section.getByRole('button', { name: 'Show chart' }).click();
    return 'chart|table';
  }
  if (await viewData.count()) {
    await viewData.first().click();
    const table = section.locator('table');
    try { await table.waitFor({ timeout: 5000 }); }
    catch { fail(`${label}: View data did not open the table`); }
    await section.getByRole('button', { name: 'Chart' }).click();
    return 'view data';
  }
  if (!(await drawn(section)) && !(await section.locator('ul, ol, table, .kpi').count())) fail(`${label}: nothing drawn`);
  return 'chart';
}

async function quiet(page) {
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"] .skeleton, .dash-panel[aria-busy="true"]'), null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(600);
}

await ensureServer();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(20000);

try {
  await page.addInitScript(() => {
    try { localStorage.setItem('btw-company:u-daniel', 'group'); } catch { /* private */ }
  });
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  const demo = page.getByRole('button', { name: /Sign in to the web as Daniel/i });
  const own = page.getByRole('button', { name: 'Sign in with your own account' });
  await demo.or(own).first().waitFor({ timeout: 20000 });
  if (await demo.count()) await demo.click();
  else {
    await own.click();
    await page.fill('#login-user', 'daniel');
    await page.fill('#login-pass', 'demo1234');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  await page.getByRole('heading', { level: 1, name: /Good / }).waitFor({ timeout: 30000 });
  const tabs = page.locator('nav[aria-label="Dashboards"] a');
  await tabs.nth(7).waitFor({ timeout: 20000 });
  await quiet(page);
  if (await page.getByRole('button', { name: /Advanced analysis/i }).count()) fail('Advanced analysis is still on the page');

  const n = await tabs.count();
  if (n < 8) throw new Error(`expected the report tabs, found ${n}`);
  note(`# Report walk`);
  note('');
  note(`Signed in as Daniel at ${WEB}. ${n} tabs.`);
  note('');
  note('| Tab | Panels | Charts switched |');
  note('|---|---:|---:|');

  for (let i = 0; i < n; i++) {
    const tab = tabs.nth(i);
    const name = (await tab.innerText()).replace(/\s+/g, ' ').trim();
    await tab.click();
    await page.waitForFunction((label) => {
      const cur = document.querySelector('nav[aria-label="Dashboards"] a[aria-current="page"]');
      return cur && cur.textContent.replace(/\s+/g, ' ').trim() === label;
    }, name);
    await page.locator('section.dash-panel, section.tc, section.chart-card, .kpi, .tiles').first().waitFor({ timeout: 30000 });
    await quiet(page);
    await page.waitForTimeout(500);
    const sections = page.locator('section.dash-panel, section.tc, section.chart-card, section.card.flush');
    const count = await sections.count();
    const kpis = await page.locator('.kpi, .tiles').count();
    if (!count && !kpis) fail(`${name}: no report on the tab`);
    let switched = 0;
    const seen = new Set();
    const total = await sections.count();
    for (let s = 0; s < total; s++) {
      const section = sections.nth(s);
      const title = (await section.locator('h2, h3').first().textContent().catch(() => ''))?.trim() || `${name} ${s + 1}`;
      if (seen.has(title)) continue;
      seen.add(title);
      const how = await walkSection(page, section, `${name} · ${title}`);
      if (how !== 'chart') switched++;
    }
    note(`| ${name} | ${Math.max(count, kpis)} | ${switched} |`);
  }

  if (errors.length) fail(`page errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e instanceof Error ? e.message.split('\n')[0] : String(e));
} finally {
  const body = [...lines, '', problems.length ? `Failed (${problems.length}):` : 'Passed.', ...problems.map((p) => `- ${p}`), ''].join('\n');
  writeFileSync(path.join(OUT, 'report.md'), body);
  await page.screenshot({ path: path.join(OUT, 'last.png'), fullPage: false }).catch(() => {});
  await browser.close();
  stopServer();
}

console.log(`\nreport: ${path.join(OUT, 'report.md')}`);
process.exit(problems.length ? 1 : 0);
