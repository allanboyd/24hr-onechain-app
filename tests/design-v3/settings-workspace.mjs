// V3-13: Settings & alerts workspace → Alerts (Open exceptions + Inbox). Run: node tests/design-v3/settings-workspace.mjs <base> <outDir>
import { chromium } from 'playwright';
const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const errs = [];
async function signIn(name) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base); await p.getByRole('button', { name: `Sign in to the web as ${name}` }).first().click(); await p.locator('aside nav a').first().waitFor();
  return p;
}
const rows = (p) => p.locator('section.dt table tbody tr');
const p = await signIn('Daniel');
await p.goto(`${base}#/system/alerts`); await rows(p).first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(800);
ok(await p.getByRole('tab', { name: /Open exceptions/ }).count() + await p.locator('.tabs a, .tabs button', { hasText: 'Open exceptions' }).count() > 0, 'Alerts: Open exceptions and Inbox views for a director');
const total = await rows(p).count();
const sevs = await p.locator('.sevs .sev').allTextContents();
ok(total > 0 && sevs.length === 4 && /Critical/.test(sevs[0]), `Open exceptions listed (${total}) with counts by severity: ${sevs.map((x) => x.trim()).join(' · ')}`);
const firstSev = (await rows(p).first().locator('.sev').textContent())?.trim();
ok(firstSev === 'Critical' || firstSev === 'High', `the most severe come first (${firstSev})`);
// filter by severity through the Filters panel
await p.getByRole('button', { name: /^Filters/ }).click(); await p.waitForTimeout(300);
const panel = p.locator('.dt-panel, [role=dialog], .filters-panel').first();
const crit = p.getByRole('checkbox', { name: /Critical/ }).first();
if (await crit.count()) { await crit.check(); await p.waitForTimeout(400); }
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
const critRows = await rows(p).locator('.sev').allTextContents();
ok(critRows.length > 0 && critRows.every((x) => x.trim() === 'Critical'), `severity filter: only Critical (${critRows.length})`);
await p.screenshot({ path: `${out}/ws-exceptions.png` });
await rows(p).first().click(); await p.waitForTimeout(1500);
ok(!/#\/system/.test(p.url()), `an exception opens its record (${p.url().split('#')[1]})`);
// inbox
await p.goto(`${base}#/system/alerts?view=inbox`); await rows(p).first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(600);
const unread0 = await p.locator('section.dt tr.unread').count();
ok(unread0 > 0 && await p.getByRole('button', { name: 'Mark all read' }).isEnabled(), `Inbox: unread alerts highlighted (${unread0})`);
await p.locator('select', { has: p.locator('option[value="today"]') }).first().selectOption('30'); await p.waitForTimeout(400);
ok(/since=30/.test(p.url()), 'the date filter is kept in the address');
await p.getByRole('button', { name: 'Mark all read' }).click(); await p.waitForTimeout(800);
ok(await p.locator('section.dt tr.unread').count() === 0, 'Mark all read clears the highlight');
await p.screenshot({ path: `${out}/ws-inbox.png` });
// a warehouse user: only the inbox
const q = await signIn('Yonas');
await q.goto(`${base}#/system/alerts`); await q.waitForTimeout(2500);
ok(await q.locator('.tabs', { hasText: 'Open exceptions' }).count() === 0 && (await q.locator('main h1').first().textContent())?.trim() === 'Alerts', 'warehouse user: Alerts shows the inbox only');
ok(!errs.length, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all settings workspace checks passed');
process.exit(fails ? 1 : 0);
