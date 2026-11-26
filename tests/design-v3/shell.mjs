// V3-1 checks: Operations | Management switch, process-ordered menus, removed pages keep access, kept report frame, brand.
// Run: node tests/design-v3/shell.mjs http://localhost:5173/ <outDir>   (shared stack up, demo build)
import { chromium } from 'playwright';

const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const OPS = ['Home', 'Period plans', 'Purchase orders', 'Truck desk', 'Shipments', 'Shipment map', 'Goods transfers', 'Stock', 'Warehouse expenses', 'Sales', 'Master data', 'Settings & alerts'];
const MGMT = ['Overview', 'Executive report', 'Plans and orders', 'Sales and clients', 'Supplier balances', 'Cash and closing', 'Warehouse performance'];
const b = await chromium.launch();
async function signIn(name, width = 1440) {
  const p = await b.newPage({ viewport: { width, height: 900 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(base); await p.waitForTimeout(1200);
  await p.getByRole('button', { name: `Sign in to the web as ${name}` }).first().click();
  await p.locator('aside nav a').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(500);
  return p;
}
const items = (p) => p.locator('aside nav a .lbl').allTextContents().then((xs) => xs.map((x) => x.trim()));
const seg = (p) => p.getByRole('group', { name: 'Operations or management' });

// ---- director
const p = await signIn('Daniel');
ok(await seg(p).count() === 1, 'director: switch shows');
ok(JSON.stringify(await items(p)) === JSON.stringify(OPS), `director: Operations menu in process order (${(await items(p)).join(', ')})`);
ok(!(await items(p)).some((x) => ['Performance', 'Selling prices', 'Transport costs'].includes(x)), 'Performance, Selling prices, Transport costs are off the menu');
await p.screenshot({ path: `${out}/shell-ops.png` });
await seg(p).getByRole('link', { name: 'Management' }).click(); await p.waitForTimeout(2500);
ok(p.url().endsWith('#/management/overview'), `switch → Management opens the report overview (${p.url().split('#')[1]})`);
ok(JSON.stringify(await items(p)) === JSON.stringify(MGMT), `Management menu (${(await items(p)).join(', ')})`);
ok(await seg(p).getByRole('link', { name: 'Management' }).getAttribute('aria-current') === 'true', 'switch marks Management as current');
// Management pages are our own pages now (V3-10); the report frame only backs its hidden pages (checked in management.mjs)
await p.locator('aside nav a', { hasText: 'Supplier balances' }).click(); await p.waitForTimeout(2500);
ok((await p.locator('main h1').first().textContent())?.trim() === 'Supplier balances', 'changing Management page shows the new page');
await p.screenshot({ path: `${out}/shell-mgmt.png` });
await seg(p).getByRole('link', { name: 'Operations' }).click(); await p.waitForTimeout(2000);
ok(p.url().endsWith('#/') && JSON.stringify(await items(p)) === JSON.stringify(OPS), 'switch → Operations goes home with the Operations menu');
// One entry for the dashboards (26 Nov): a dashboard tab keeps Home selected in the Operations menu
await p.goto(`${base}#/dashboards/sales`); await p.waitForTimeout(2500);
ok(await seg(p).getByRole('link', { name: 'Operations' }).getAttribute('aria-current') === 'true' && await p.locator('aside nav a.active', { hasText: 'Home' }).count() === 1, 'a dashboard tab is on the Operations side with Home marked current');
ok(await p.locator('[role=tablist] [aria-selected=true], .tabs a[aria-current]').first().textContent().then((t) => t?.trim() !== 'Overview').catch(() => false), 'and it shows that dashboard tab');
for (const r of ['/performance', '/selling-prices', '/transport-costs']) {
  await p.goto(`${base}#${r}`); await p.waitForTimeout(1500);
  ok(await p.getByText('Not available for your role').count() === 0, `director still opens ${r} by link`);
}
// V3-1g: Shipment map on its own entry; System settings & logs = Users & access, Audit log, Settings
await p.locator('aside nav a', { hasText: 'Shipment map' }).click(); await p.waitForTimeout(2500);
ok(/view=map/.test(p.url()) && await p.locator('aside nav a.active', { hasText: 'Shipment map' }).count() === 1 && await p.locator('aside nav a.active', { hasText: /^Shipments$/ }).count() === 0, 'Shipment map opens the map and is the current entry (not Shipments)');
await p.locator('aside nav a', { hasText: /^Shipments$/ }).click(); await p.waitForTimeout(1500);
ok(!/view=map/.test(p.url()) && await p.locator('aside nav a.active', { hasText: /^Shipments$/ }).count() === 1, 'Shipments opens the list');
// V3-13: Settings & alerts workspace: a left menu inside the page, one address per section; Alerts left the main sidebar
await p.locator('aside nav a', { hasText: 'Settings & alerts' }).click(); await p.waitForTimeout(2500);
ok(p.url().endsWith('#/system/alerts') && (await p.locator('main h1').first().textContent())?.trim() === 'Alerts' && await p.locator('aside nav a.active', { hasText: 'Settings & alerts' }).count() === 1, 'Settings & alerts opens Alerts and stays current');
const sys = p.getByRole('navigation', { name: 'Settings & alerts' });
ok(JSON.stringify((await sys.locator('a').allTextContents()).map((x) => x.trim())) === JSON.stringify(['Alerts', 'My notifications', 'Approvals', 'Exchange rates', 'Thresholds', 'Users & access', 'Audit log', 'Integrations']), 'its sections for a director, in groups');
await sys.getByRole('link', { name: 'Audit log' }).click(); await p.waitForTimeout(2000);
ok(p.url().endsWith('#/system/audit') && (await p.locator('main h1').first().textContent())?.trim() === 'Audit log' && await sys.locator('a[aria-current=page]').textContent().then((t) => t?.trim() === 'Audit log'), 'Audit log: own address, highlighted in the left menu');
await p.evaluate(() => { window.__kept = 7; });
await sys.getByRole('link', { name: 'Approvals' }).click(); await p.waitForTimeout(1500);
ok(await p.getByRole('switch', { name: 'Advance payments need director approval' }).count() === 1 && await p.evaluate(() => window.__kept) === 7, 'Approvals opens without reloading the page');
for (const [old, h1] of [['#/notifications', 'Alerts'], ['#/users', 'Users & access'], ['#/audit', 'Audit log'], ['#/integrations', 'Integrations']]) {
  await p.goto(base + old); await p.waitForTimeout(1800);
  ok((await p.locator('main h1').first().textContent())?.trim() === h1 && await p.locator('aside nav a.active', { hasText: 'Settings & alerts' }).count() === 1, `old address ${old} opens ${h1} in the workspace`);
}
await p.goto(`${base}#/system/approvals`); await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/system-settings.png` });
// brand: no subtitle lines; marks small
const brand = await p.locator('aside .brand').innerText();
ok(!/BTW · NUD · Kivu/.test(brand), 'brand: no subtitle line');
const markH = await p.locator('aside .brand .marks > *').first().evaluate((e) => e.getBoundingClientRect().height).catch(() => 0);
ok(markH > 0 && markH <= 24, `brand: company marks 24 px (${markH})`);
await p.setViewportSize({ width: 390, height: 844 }); await p.goto(`${base}#/`); await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Open the menu' }).click(); await p.waitForTimeout(500);
ok(await seg(p).isVisible(), 'phone width: switch inside the menu drawer');
await p.screenshot({ path: `${out}/shell-phone.png` });

// ---- warehouse user: no switch, removed pages still closed
const q = await signIn('Yonas');
ok((await items(q)).includes('Home') && !(await items(q)).includes('Live dashboards'), 'warehouse user: one Home entry for the dashboards');
await q.goto(`${base}#/system/alerts`); await q.waitForTimeout(2000);
ok(JSON.stringify((await q.getByRole('navigation', { name: 'Settings & alerts' }).locator('a').allTextContents()).map((x) => x.trim())) === JSON.stringify(['Alerts', 'My notifications']), 'warehouse user: Settings & alerts shows Alerts and My notifications only');
await q.goto(`${base}#/system/approvals`); await q.waitForTimeout(1500);
ok(await q.getByRole('switch', { name: 'Advance payments need director approval' }).count() === 0, 'warehouse user: Approvals does not open');
ok(await seg(q).count() === 0, 'warehouse user: no switch');
for (const r of ['/performance', '/selling-prices', '/transport-costs', '/management/cash', '/dashboards']) {
  await q.goto(`${base}#${r}`); await q.waitForTimeout(1500);
  const blocked = await q.getByText('Not available for your role').count() > 0;
  if (r === '/dashboards') ok(!blocked, 'warehouse user: #/dashboards keeps its old rule (open)');
  if (r === '/dashboards') { const tabs = await q.locator('[role=tablist] a, .tabs a').allTextContents(); ok(!tabs.map((x) => x.trim()).includes('Business') && !tabs.includes('Companies'), `warehouse user: only the tabs their role allows (${tabs.map((x) => x.trim()).join(', ')})`); }
  else ok(blocked, `warehouse user: ${r} → Not available`);
}
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all V3-1 checks passed');
process.exit(fails ? 1 : 0);
