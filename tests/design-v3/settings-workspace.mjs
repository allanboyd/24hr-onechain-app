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
// Approvals: the business rules, read-only
await p.goto(`${base}#/system/approvals`); await p.locator('.rules dl div').first().waitFor({ timeout: 15_000 });
const rules = await p.locator('.rules dt').allTextContents();
ok(rules.includes('Loading allowance') && rules.includes('Purchase orders need director approval') && await p.locator('.rules input, .rules select').count() === 0, `Approvals: business rules shown read-only (${rules.length})`);
// Exchange rates: approve a rate with a confirm step
await p.goto(`${base}#/system/rates`); await p.locator('section.dt table tbody tr').first().waitFor({ timeout: 15_000 });
const r0 = await p.locator('section.dt table tbody tr').count();
await p.getByRole('button', { name: 'Approve a rate' }).click(); await p.locator('dialog[open]').waitFor();
await p.locator('dialog[open] select').selectOption('RWF');
await p.locator('dialog[open] input[type=month]').fill('2027-01');
const nums = p.locator('dialog[open] input[type=number]');
await nums.nth(0).fill('1400'); await nums.nth(1).fill('1410');
await p.locator('dialog[open]').getByRole('button', { name: 'Review' }).click(); await p.waitForTimeout(300);
ok(await p.locator('dialog[open]', { hasText: 'Approve RWF for January 2027?' }).count() === 1, 'Exchange rates: approving asks first, naming the month and currency');
await p.locator('dialog[open]', { hasText: 'Approve RWF' }).getByRole('button', { name: 'Approve' }).click(); await p.waitForTimeout(1000);
await p.locator('input[type=search]').first().fill('2027'); await p.waitForTimeout(400);
ok(r0 > 0 && await p.locator('section.dt table tbody tr', { hasText: 'January 2027' }).count() === 1 && await p.locator('section.dt table tbody tr', { hasText: 'January 2027' }).getByText('1,400.00').count() === 1, 'Exchange rates: the new rate is listed (RWF, January 2027, 1,400)');
await p.screenshot({ path: `${out}/ws-rates.png` });
// Thresholds: Save only when changed, with a confirm step; Cancel; Reset to defaults
await p.goto(`${base}#/system/thresholds`); await p.locator('#th-pv').waitFor({ timeout: 15_000 });
const pvBlock = p.locator('section', { has: p.locator('#th-pv') });
const saveBtn = pvBlock.getByRole('button', { name: 'Save' });
ok(await saveBtn.isDisabled(), 'Thresholds: Save is off until something changes');
const behind = pvBlock.locator('input[type=number]').first();
await behind.fill('80'); await p.waitForTimeout(200);
await pvBlock.getByRole('button', { name: 'Cancel' }).click(); await p.waitForTimeout(200);
ok(await behind.inputValue() === '85', 'Thresholds: Cancel puts the saved value back (85%)');
await behind.fill('80'); await saveBtn.click(); await p.locator('dialog[open]').waitFor();
await p.locator('dialog[open]').getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(800);
await p.reload(); await p.locator('#th-pv').waitFor();
ok(await p.locator('section', { has: p.locator('#th-pv') }).locator('input[type=number]').first().inputValue() === '80', 'Thresholds: saved after a reload (80%)');
await p.locator('section', { has: p.locator('#th-pv') }).getByRole('button', { name: 'Reset to defaults' }).click();
await p.locator('section', { has: p.locator('#th-pv') }).getByRole('button', { name: 'Save' }).click(); await p.locator('dialog[open]').getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/ws-thresholds.png` });
// a planner sees thresholds but cannot change them
const k = await signIn('Kabonge');
await k.goto(`${base}#/system/thresholds`); await k.locator('#th-pv').waitFor({ timeout: 15_000 });
ok(await k.locator('input[type=number]').first().isDisabled() && await k.getByRole('button', { name: 'Save' }).count() === 0, 'planner: thresholds visible, not editable');
// a warehouse user: only the inbox
const q = await signIn('Yonas');
await q.goto(`${base}#/system/alerts`); await q.waitForTimeout(2500);
ok(await q.locator('.tabs', { hasText: 'Open exceptions' }).count() === 0 && (await q.locator('main h1').first().textContent())?.trim() === 'Alerts', 'warehouse user: Alerts shows the inbox only');
ok(!errs.length, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all settings workspace checks passed');
process.exit(fails ? 1 : 0);
