// V3-2 checks: every report page opens from our route; report's own menu hidden; report fills the frame; gating.
// Run: node tests/design-v3/management.mjs http://localhost:5173/ <outDir>   (shared stack up, demo build)
import { chromium } from 'playwright';
const [base, out] = process.argv.slice(2);
const PAGES = { overview: 'Overview', exec: 'Executive report', plans: 'Plans and orders', clients: 'Sales and clients', suppliers: 'Supplier balances', cash: 'Cash and closing', perf: 'Warehouse performance', fleet: 'Fleet and trucks', stock: 'Stock and run-out', expenses: 'Expenses' }; // the report's page headings (its menu labels differ for these two)
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
async function signIn(name) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(base); await p.waitForTimeout(1200);
  await p.getByRole('button', { name: `Sign in to the web as ${name}` }).first().click();
  await p.locator('aside nav a').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(500);
  return p;
}
const p = await signIn('Daniel');
// since V3-1 the Management menu sits behind the Operations | Management switch
ok(await p.getByRole('group', { name: 'Operations or management' }).getByRole('link', { name: 'Management' }).count() === 1, 'director sees the Management switch');
// V3-10: Overview is our own page on live data (no frame, no sample banner); the warehouse chips change the figures
await p.goto(`${base}#/management/overview`); await p.locator('.ov .kpi .val').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(800);
ok(await p.locator('iframe[title^="Management report"]').count() === 0 && await p.getByText('Sample data.').count() === 0, 'Overview: our page, no report frame, no sample-data banner');
const revAll = (await p.locator('.ov .kpi .val').first().textContent())?.trim();
ok(/^\$[\d,]+$/.test(revAll ?? ''), `Overview: revenue from our data (${revAll})`);
ok(await p.locator('.ov .ct', { hasText: 'How the company makes profit' }).count() === 1 && await p.locator('.ov .ct', { hasText: 'Act on these first' }).count() === 1, 'Overview: the report\'s cards (profit, act on these first)');
ok(!(await p.locator('.ov').innerText()).match(/\bp-[a-z]\d{3}\b|\bw-[a-z]+\b/), 'Overview: names, not internal codes');
await p.getByRole('group', { name: 'Warehouse' }).getByRole('button').nth(1).click(); await p.waitForTimeout(2500);
const revOne = (await p.locator('.ov .kpi .val').first().textContent())?.trim();
const n = (x) => Number((x ?? '').replace(/[^\d]/g, ''));
ok(n(revOne) < n(revAll) && /wh=/.test(p.url()), `Overview: one warehouse shows less than combined (${revOne} < ${revAll}), kept in the address`);
await p.screenshot({ path: `${out}/mgmt-overview-live.png` });
for (const [k, title] of Object.entries(PAGES)) {
  if (k === 'overview') continue; // rebuilt above
  await p.goto(`${base}#/management/${k}`); await p.waitForTimeout(2200);
  const f = p.frameLocator('iframe[title^="Management report"]');
  const h1 = (await f.locator('main h1').first().textContent().catch(() => ''))?.trim();
  ok(h1 === title, `#/management/${k} opens "${title}" (got "${h1}")`);
  if (k === 'suppliers') {
    const sideHidden = await f.locator('aside.side').evaluate((e) => getComputedStyle(e).display === 'none').catch(() => false);
    ok(sideHidden, `${k}: the report's own menu is hidden`);
    const w = await f.locator('main').evaluate((e) => e.getBoundingClientRect().width).catch(() => 0);
    ok(w > 900, `${k}: report content is wide (${Math.round(w)} px)`);
    await p.screenshot({ path: `${out}/mgmt-${k}.png` });
  }
}
// default page + bad key falls back to overview (whitelist)
await p.goto(`${base}#/management/evil');alert(1);('`); await p.waitForTimeout(2200);
const h = (await p.frameLocator('iframe[title^="Management report"]').locator('main h1').first().textContent().catch(() => ''))?.trim();
ok(h === 'Overview' || await p.locator('.ov h1', { hasText: 'Overview' }).count() === 1, `unknown key falls back to Overview (got "${h || 'our Overview page'}")`);
// Live dashboards still opens for the director
await p.goto(`${base}#/dashboards`); await p.waitForTimeout(2000);
ok(!(await p.getByText('Not available for your role').count()), 'director: #/dashboards still opens');
// gating: a loader has no `reports`
const q = await signIn('Yonas');
ok(await q.getByRole('group', { name: 'Operations or management' }).count() === 0, 'warehouse user does not see the Management switch');
await q.goto(`${base}#/management/cash`); await q.waitForTimeout(1500);
ok(await q.getByText('Not available for your role').count() > 0, 'warehouse user gets "Not available" at #/management/cash');
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all V3-2 checks passed');
process.exit(fails ? 1 : 0);
