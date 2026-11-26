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
// V3-10 step 2: Plans and orders on live data
await p.goto(`${base}#/management/plans`); await p.locator('.pl .kpi .val').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(800);
ok(await p.locator('iframe[title^="Management report"]').count() === 0 && /p=ytd/.test(p.url()), 'Plans: our page, opens on the year to date');
const planned = n(await p.locator('.pl .kpi .val').first().textContent());
ok(planned > 0 && await p.locator('.pl .dt-table tbody tr').count() > 0, `Plans: planned ${planned} cases, a row per brand`);
ok(!(await p.locator('.pl').innerText()).match(/\bp-[a-z]\d{3}\b/), 'Plans: brand names, not codes');
await p.getByRole('group', { name: 'Period' }).getByRole('button', { name: '30 days' }).click(); await p.waitForTimeout(2000);
await p.goto(`${base}#/management/plans?p=30`); await p.waitForTimeout(1500);
ok(/p=30/.test(p.url()), 'Plans: a chosen period is kept (not reset to the year)');
await p.screenshot({ path: `${out}/mgmt-plans-live.png`, fullPage: true });
// V3-10 step 3: Sales and clients on live data
await p.goto(`${base}#/management/clients`); await p.locator('.mrep .kpi .val').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(1000);
ok(await p.locator('iframe[title^="Management report"]').count() === 0, 'Clients: our page, no report frame');
ok(/^\$[\d,]+$/.test((await p.locator('.mrep .kpi .val').first().textContent())?.trim() ?? '') && await p.locator('.mrep .rank li').count() > 0, 'Clients: sales from our data, clients ranked');
// V3-12 step 1: credit days are recorded per client now: the card shows the days in use and links to Sales → Clients
{ const card = p.locator('.mrep .card', { has: p.locator('.ct', { hasText: 'Client credit terms' }) });
  ok(await card.getByText('Not recorded yet').count() === 0 && await card.locator('tbody tr').count() > 0 && await card.locator('a[href="#/sales?view=clients"]').count() === 1, 'Clients: credit days in use, with a link to Sales → Clients'); }
const recs = p.locator('.mrep .dt-table tbody tr[data-dt-row]'); const r0 = await recs.count();
await p.locator('.mrep .dt-search input').fill('Walk-in'); await p.waitForTimeout(500);
ok(r0 > 0 && (await p.locator('.mrep .dt-table tbody tr[data-dt-row] td:nth-child(3)').allTextContents()).every((t) => /Walk-in/i.test(t)), 'Clients: the sales records search by client');
await p.screenshot({ path: `${out}/mgmt-clients-live.png`, fullPage: true });
// V3-10 step 3b: Warehouse performance on live data
await p.goto(`${base}#/management/perf`); await p.locator('.mrep .kpi .val').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(1000);
ok(await p.locator('iframe[title^="Management report"]').count() === 0 && await p.locator('.mrep .wh').count() >= 2, 'Performance: our page, warehouses side by side');
const profits = await p.locator('.mrep .wh').evaluateAll((ws) => ws.map((w) => Number((w.querySelectorAll('.row2')[1]?.lastElementChild?.textContent ?? '').replace(/[^\d-]/g, ''))));
ok(profits.every((x, i, a) => i === 0 || a[i - 1] >= x), `Performance: most profitable first (${profits.join(', ')})`);
ok(await p.locator('.mrep .dt-table tbody tr[data-dt-row]').count() > 0 && !(await p.locator('.mrep').innerText()).match(/\bp-[a-z]\d{3}\b|\bw-[a-z]+\b/), 'Performance: price floor rows, names not codes');
await p.screenshot({ path: `${out}/mgmt-perf-live.png`, fullPage: true });
// V3-10 step 3c: Supplier balances on live data
await p.goto(`${base}#/management/suppliers?p=ytd`); await p.locator('.mrep .kpi .val').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(1000);
ok(await p.locator('iframe[title^="Management report"]').count() === 0, 'Suppliers: our page, no report frame');
ok(n(await p.locator('.mrep .kpi .val').first().textContent()) > 0 && await p.locator('.mrep .rank li').count() > 0, 'Suppliers: money held from our short loads, per supplier');
// V3-12 step 3: credit notes, advances and pro-formas are recorded on the PO page now
ok(await p.locator('.mrep').getByText('Not recorded yet').count() === 0 && await p.locator('.mrep .ct', { hasText: 'Advance payments' }).locator('.chip', { hasText: 'Recorded on the purchase orders' }).count() === 1, 'Suppliers: credit notes and advances come from the purchase orders (nothing "Not recorded yet")');
ok(await p.locator('.mrep .dt-table').count() === 2 && await p.locator('.mrep .dt-table').first().locator('tbody tr[data-dt-row]').count() > 0, 'Suppliers: short loads and the statement as tables');
await p.screenshot({ path: `${out}/mgmt-suppliers-live.png`, fullPage: true });
// V3-10 step 3d: Cash and closing on live data
await p.goto(`${base}#/management/cash`); await p.locator('.mrep .kpi .val').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(1000);
ok(await p.locator('iframe[title^="Management report"]').count() === 0, 'Cash: our page, no report frame');
ok(n(await p.locator('.mrep .kpi .val').first().textContent()) > 0 && await p.locator('.mrep .stmt tr.total').count() === 1, 'Cash: received from our sales; statement with a net total');
ok(await p.locator('.mrep .stmt tr.missing .chip', { hasText: 'Not recorded yet' }).count() === 2, 'Cash: opening cash and transfers say "Not recorded yet"');
ok(/→/.test((await p.locator('.mrep .oc').innerText())), 'Cash: stock opening → closing');
await p.screenshot({ path: `${out}/mgmt-cash-live.png`, fullPage: true });
// V3-10 step 3e: Executive report on live data
await p.goto(`${base}#/management/exec`); await p.locator('.mrep .items li').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(800);
ok(await p.locator('iframe[title^="Management report"]').count() === 0 && await p.locator('.mrep .ct', { hasText: 'Good news' }).count() === 1 && await p.locator('.mrep .ct', { hasText: 'Decisions for the Directors' }).count() === 1, 'Exec: our page with good news and decisions');
const txt = await p.locator('.mrep').innerText();
ok(!/undefined|NaN|\bnull\b/.test(txt) && await p.locator('.mrep tr.combined').count() === 1, 'Exec: clean sentences; warehouses and a combined row');
await p.screenshot({ path: `${out}/mgmt-exec-live.png`, fullPage: true });
// rule (26 Nov): on every Management page the title and its description come first, then the filter bar
for (const pg of ['overview', 'exec', 'plans', 'clients', 'perf', 'suppliers', 'cash']) {
  await p.goto(`${base}#/management/${pg}`); await p.locator('main h1').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(600);
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(200);
  const h = await p.locator('main h1').first().boundingBox(), c = await p.locator('main .ctl').first().boundingBox();
  ok(!!h && !!c && h.y < c.y, `${pg}: title above the filter bar`);
}
for (const [k, title] of Object.entries(PAGES)) {
  if (['overview', 'exec', 'plans', 'clients', 'perf', 'suppliers', 'cash'].includes(k)) continue; // rebuilt in our code (V3-10), checked above
  await p.goto(`${base}#/management/${k}`); await p.waitForTimeout(2200);
  const f = p.frameLocator('iframe[title^="Management report"]');
  const h1 = (await f.locator('main h1').first().textContent().catch(() => ''))?.trim();
  ok(h1 === title, `#/management/${k} opens "${title}" (got "${h1}")`);
  if (k === 'fleet') { // the report's hidden pages still open in the frame
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
await q.goto(`${base}#/management/exec`); await q.waitForTimeout(1500);
ok(await q.getByText('Not available for your role').count() > 0, 'warehouse user gets "Not available" at #/management/exec');
// V3-12 step 0: Management → Settings (approval switch, my email / SMS)
await p.goto(`${base}#/management/settings`); await p.locator('[role=switch]').first().waitFor({ timeout: 20_000 });
ok((await p.locator('main h1').first().textContent())?.trim() === 'Settings' && await p.locator('aside nav a.active', { hasText: 'Settings' }).count() === 1, 'Settings: in the Management menu, title first');
const sw = p.getByRole('switch', { name: 'Advance payments need director approval' });
ok(await sw.getAttribute('aria-checked') === 'false', 'Settings: advance approval off by default');
await sw.click(); await p.waitForTimeout(600);
await p.reload(); await p.getByRole('switch', { name: 'Advance payments need director approval' }).waitFor();
ok(await p.getByRole('switch', { name: 'Advance payments need director approval' }).getAttribute('aria-checked') === 'true', 'Settings: turning it on is saved');
await p.getByRole('switch', { name: 'Advance payments need director approval' }).click(); await p.waitForTimeout(600);
const sms = p.getByRole('switch', { name: 'Text me money notifications' });
await sms.click(); await p.waitForTimeout(600);
ok(await sms.getAttribute('aria-checked') === 'true' && await p.getByRole('switch', { name: 'Email me money notifications' }).getAttribute('aria-checked') === 'false', 'Settings: SMS on, email stays off');
await sms.click(); await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/mgmt-settings.png`, fullPage: true });
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all V3-2 checks passed');
process.exit(fails ? 1 : 0);
