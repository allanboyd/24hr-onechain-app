// V3-8 batch 2: Users, Audit log, Master data (Suppliers, Companies, Receiving companies, Drivers, Warehouses) on the shared
// table. Run: node tests/design-v3/tables-admin.mjs <base> <outDir>
import { chromium } from 'playwright';
const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base, { waitUntil: 'domcontentloaded' });
await p.getByRole('button', { name: 'Sign in to the web as Daniel' }).first().click(); await p.locator('aside nav a').first().waitFor();
const shown = async () => Number(((await p.locator('.dt-foot .caption').first().textContent().catch(() => '')) ?? '').match(/of ([\d,]+)/)?.[1]?.replace(/,/g, '') ?? (await p.locator('section.dt table tbody tr').count()));
const search = (txt) => p.locator('input[type=search]').first().fill(txt);

// Users
await p.goto(`${base}#/users`); await p.locator('section.dt table tbody tr').first().waitFor({ timeout: 20_000 });
const u0 = await p.locator('section.dt table tbody tr').count();
await search('Yonas'); await p.waitForTimeout(400);
ok(u0 > 2 && await p.locator('section.dt table tbody tr').count() === 1 && await p.locator('table tbody tr', { hasText: 'Yonas' }).count() === 1, `Users: search in the table (${u0} → 1)`);
await search(''); await p.waitForTimeout(300);
await p.getByRole('button', { name: /^Filters/ }).click(); await p.waitForTimeout(300);
ok(await p.getByText('Field sign-in', { exact: false }).count() > 0, 'Users: Field sign-in is offered as a filter');
await p.keyboard.press('Escape');
await p.locator('table tbody tr', { hasText: 'Yonas' }).click(); await p.waitForTimeout(500);
ok(await p.locator('dialog[open]').count() === 1, 'Users: a row opens the user');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// Audit log: server filters in the toolbar; a row opens before → after
await p.goto(`${base}#/audit`); await p.locator('section.dt table tbody tr.clickable').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(800);
ok(await p.locator('.dt-toolbar select, .dt-tools select, table ~ * select, select').count() >= 2 && await p.locator('section.dt table tbody tr').count() > 0, 'Audit log: user / feature filters with the table');
await p.locator('section.dt table tbody tr').first().click(); await p.waitForTimeout(500);
ok(await p.locator('dialog[open]').count() === 1, 'Audit log: a row opens its details');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/tables-audit.png` });

// Master data
await p.goto(`${base}#/master?tab=suppliers`); await p.waitForTimeout(1500);
const s0 = await p.locator('section.dt table tbody tr').count();
await search('KBL'); await p.waitForTimeout(400);
ok(s0 > 1 && await p.locator('section.dt table tbody tr').count() >= 1 && await p.locator('section.dt table tbody tr').count() < s0, `Master data → Suppliers: search (${s0} → ${await p.locator('section.dt table tbody tr').count()})`);
await p.goto(`${base}#/master?tab=companies`); await p.waitForTimeout(1500);
ok(await p.locator('section.dt table tbody tr').count() >= 3 && await p.getByRole('button', { name: /CSV/ }).count() > 0, 'Master data → Companies: the shared table with CSV');
for (const [tab, label] of [['Receiving companies', 'receiving'], ['Drivers', 'drivers'], ['Warehouses', 'warehouses']]) {
  await p.getByRole('tab', { name: tab }).click(); await p.waitForTimeout(1200);
  ok(await p.locator('input[type=search]').count() >= 1 && await p.locator('section.dt table tbody tr').count() > 0, `Master data → ${tab}: search box and rows`);
}
await p.getByRole('tab', { name: 'Drivers' }).click(); await p.waitForTimeout(1000);
const d0 = await p.locator('section.dt table tbody tr').count();
await search('zzz-no-driver'); await p.waitForTimeout(400);
ok(d0 > 0 && (await p.getByText('No driver matches').count()) === 1, 'Master data → Drivers: an empty search says so');
await p.screenshot({ path: `${out}/tables-drivers.png` });
ok(!errs.length, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all admin tables checks passed');
process.exit(fails ? 1 : 0);
