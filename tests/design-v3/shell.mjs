// V3-1 checks: Operations | Management switch, process-ordered menus, removed pages keep access, kept report frame, brand.
// Run: node tests/design-v3/shell.mjs http://localhost:5173/ <outDir>   (shared stack up, demo build)
import { chromium } from 'playwright';

const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const OPS = ['Home', 'Period plans', 'Purchase orders', 'Truck desk', 'Shipments', 'Goods transfers', 'Stock', 'Warehouse expenses', 'Sales', 'Master data', 'Users & access', 'Audit log', 'Alerts'];
const MGMT = ['Overview', 'Executive report', 'Plans and orders', 'Sales and clients', 'Supplier balances', 'Cash and closing', 'Warehouse performance', 'Live dashboards'];
const b = await chromium.launch();
async function signIn(name, width = 1440) {
  const p = await b.newPage({ viewport: { width, height: 900 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(base); await p.waitForTimeout(1200);
  await p.getByRole('button', { name: `Sign in to the web as ${name}` }).first().click();
  await p.locator('aside nav a').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(500);
  return p;
}
const items = (p) => p.locator('aside nav a').allTextContents().then((xs) => xs.map((x) => x.trim()));
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
// the report frame stays loaded between Management pages
const frame = () => p.frames().find((f) => f.url().includes('/management/report.html'));
await frame()?.evaluate(() => { window.__kept = 42; });
await p.locator('aside nav a', { hasText: 'Supplier balances' }).click(); await p.waitForTimeout(1500);
ok(await frame()?.evaluate(() => window.__kept) === 42, 'report frame kept (not reloaded) when changing Management page');
ok((await frame()?.locator('main h1').first().textContent())?.trim() === 'Supplier balances', 'and it shows the new page');
await p.screenshot({ path: `${out}/shell-mgmt.png` });
await p.locator('aside nav a', { hasText: 'Live dashboards' }).click(); await p.waitForTimeout(2000);
ok(await seg(p).getByRole('link', { name: 'Management' }).getAttribute('aria-current') === 'true', 'Live dashboards is on the Management side');
await seg(p).getByRole('link', { name: 'Operations' }).click(); await p.waitForTimeout(2000);
ok(p.url().endsWith('#/') && JSON.stringify(await items(p)) === JSON.stringify(OPS), 'switch → Operations goes home with the Operations menu');
for (const r of ['/performance', '/selling-prices', '/transport-costs']) {
  await p.goto(`${base}#${r}`); await p.waitForTimeout(1500);
  ok(await p.getByText('Not available for your role').count() === 0, `director still opens ${r} by link`);
}
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
ok(await seg(q).count() === 0, 'warehouse user: no switch');
for (const r of ['/performance', '/selling-prices', '/transport-costs', '/management/cash', '/dashboards']) {
  await q.goto(`${base}#${r}`); await q.waitForTimeout(1500);
  const blocked = await q.getByText('Not available for your role').count() > 0;
  if (r === '/dashboards') ok(!blocked, 'warehouse user: #/dashboards keeps its old rule (open)');
  else ok(blocked, `warehouse user: ${r} → Not available`);
}
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all V3-1 checks passed');
process.exit(fails ? 1 : 0);
