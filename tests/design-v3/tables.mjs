// V3-8 checks on the Purchase orders table (TanStack): search, Filters panel with counts, chips, range, address kept,
// old links still filter, Status still reaches deleted orders, sort, CSV = the filtered rows, phone cards.
// Run: node tests/design-v3/tables.mjs http://localhost:5173/ <outDir>   (shared stack up, demo build)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(base); await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Sign in to the web as Daniel' }).first().click();
await p.locator('aside nav a').first().waitFor({ timeout: 20_000 });

const rowsShown = async () => Number(((await p.locator('.dt-foot .caption').first().textContent()) ?? '').match(/of ([\d,]+)/)?.[1]?.replace(/,/g, '') ?? 0);
const hash = () => decodeURIComponent(new URL(p.url()).hash);
const col = (n) => p.locator(`.dt-table tbody tr td:nth-child(${n})`).allTextContents();
await p.goto(`${base}#/pos?stage=all`); await p.locator('.dt-table tbody tr').first().waitFor(); await p.waitForTimeout(800);
const all = await rowsShown();
ok(all > 10, `all orders listed (${all})`);
ok(await p.locator('form.filterbar, .filter-bar').count() === 0, 'the separate filter bar is gone (filters are in the table)');

// search
await p.getByPlaceholder('Search reference, title, supplier…').fill('Kampala'); await p.waitForTimeout(500);
const nSearch = await rowsShown();
ok(nSearch > 0 && nSearch < all, `search "Kampala" narrows ${all} → ${nSearch}`);
ok((await col(4)).every((t) => /Kampala/.test(t)), 'every row found has a Kampala supplier');
ok(hash().includes('q=Kampala'), 'search kept in the address (?q=)');
await p.getByRole('button', { name: 'Clear the search' }).click(); await p.waitForTimeout(400);
ok(await rowsShown() === all && !hash().includes('q='), 'clear search → all rows, address clean');

// Filters panel: supplier pick-list with counts
await p.getByRole('button', { name: /^Filters/ }).click(); await p.waitForTimeout(300);
const panel = p.getByRole('dialog', { name: /Filters for orders/ });
ok(await panel.isVisible(), 'Filters panel opens');
const supOpts = panel.locator('fieldset', { hasText: 'Supplier' }).locator('.dt-opt');
const first = (await supOpts.first().innerText()).split('\n');
const [supName, supCount] = [first[0].trim(), Number(first.at(-1))];
ok(supName.includes(',') && supCount > 0, `supplier choices with counts ("${supName}" ${supCount})`);
await supOpts.first().locator('input').check(); await p.waitForTimeout(400);
ok(await rowsShown() === supCount, `ticking "${supName}" shows its ${supCount} orders`);
const supParam = hash().match(/supplier=([^&]+)/)?.[1] ?? '';
ok(!!supParam && !supParam.includes(' '), `supplier filter kept in the address as an id (?supplier=${supParam})`);
await p.screenshot({ path: `${out}/tables-panel.png` });
await panel.getByRole('button', { name: 'Done' }).click(); await p.waitForTimeout(300);
ok(await p.locator('.dt-chip', { hasText: 'Supplier:' }).count() === 1, 'a "Supplier: …" chip shows');
await p.screenshot({ path: `${out}/tables-chips.png` });
await p.getByRole('button', { name: 'Remove the Supplier filter' }).click(); await p.waitForTimeout(400);
ok(await p.locator('.dt-chip', { hasText: 'Supplier:' }).count() === 0 && !hash().includes('supplier=') && await rowsShown() === all, 'removing the chip drops that filter');

// range on Amount
await p.getByRole('button', { name: /^Filters/ }).click(); await p.waitForTimeout(300);
await panel.locator('fieldset', { hasText: 'Amount' }).getByLabel('From').fill('50000'); await panel.locator('fieldset', { hasText: 'Amount' }).getByLabel('From').press('Tab'); await p.waitForTimeout(400);
await panel.getByRole('button', { name: 'Done' }).click(); await p.waitForTimeout(300);
const amounts = (await col(7)).map((t) => Number(t.replace(/[^\d.]/g, '')));
ok(amounts.length > 0 && amounts.every((a) => a >= 50000), `Amount from 50,000: ${amounts.length} rows, all ≥ 50,000`);
ok(await p.locator('.dt-chip', { hasText: 'Amount: from 50,000' }).count() === 1 && hash().includes('amount=50000,'), 'Amount chip + ?amount=50000,');
// CSV = filtered rows
const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'CSV' }).click()]);
const csv = readFileSync(await dl.path(), 'utf8').trim().split('\n');
ok(csv.length - 1 === await rowsShown(), `CSV has the ${csv.length - 1} filtered rows`);
// search + range together, then clear all
await p.getByPlaceholder('Search reference, title, supplier…').fill('Nairobi'); await p.waitForTimeout(400);
ok((await col(4)).every((t) => /Nairobi/.test(t)) && (await col(7)).every((t) => Number(t.replace(/[^\d.]/g, '')) >= 50000), 'search + range together');
await p.locator('.dt-chips').getByRole('button', { name: 'Clear all' }).click(); await p.waitForTimeout(400);
ok(await rowsShown() === all && !/amount=|supplier=|q=/.test(hash()), 'Clear all → every order, address clean');

// sort by Amount (biggest first)
await p.locator('th', { hasText: 'Amount' }).getByRole('button').click(); await p.waitForTimeout(400);
const sortedA = (await col(7)).map((t) => Number(t.replace(/[^\d.]/g, ''))).filter((x) => x);
ok(sortedA.every((x, i) => i === 0 || sortedA[i - 1] >= x), 'Amount sorts biggest first');

// an old link (?supplier=<id>) still filters
await p.goto(`${base}#/pos?stage=all&supplier=${supParam}`); await p.waitForTimeout(1500);
ok(await p.locator('.dt-chip', { hasText: `Supplier: ${supName}` }).count() === 1 && await rowsShown() === supCount, `an old ?supplier= link opens filtered (${supCount} orders, chip "${supName}")`);
// Status still reaches deleted orders
await p.goto(`${base}#/pos?stage=all`); await p.waitForTimeout(1200);
ok(await p.getByLabel('Status').locator('option', { hasText: /deleted/i }).count() === 1, 'Status in the table toolbar still offers deleted orders');
ok(await p.getByRole('combobox', { name: 'Status' }).count() === 1, 'one Status select in the toolbar');

// ---- phase 2 batch 1: the other DataTable screens ----
async function screen(path, word, filterLegend, chipLabel, param) {
  await p.goto(`${base}#${path}`); await p.locator('.dt-table tbody tr, .dt-cards .dt-card').first().waitFor({ timeout: 15_000 }).catch(() => {}); await p.waitForTimeout(800);
  const n0 = await rowsShown();
  ok(await p.locator('.dt-search input').count() === 1, `${path}: search box in the table`);
  if (word) {
    await p.locator('.dt-search input').fill(word); await p.waitForTimeout(500);
    const n1 = await rowsShown();
    ok(n1 > 0 && n1 <= n0, `${path}: search "${word}" ${n0} → ${n1}`);
    await p.getByRole('button', { name: 'Clear the search' }).click(); await p.waitForTimeout(300);
  }
  if (filterLegend) {
    await p.getByRole('button', { name: /^Filters/ }).click(); await p.waitForTimeout(300);
    const fs = p.getByRole('dialog', { name: /Filters for/ }).locator('fieldset', { hasText: filterLegend });
    const o = fs.locator('.dt-opt').first(); const cnt = Number((await o.innerText()).split('\n').at(-1));
    await o.locator('input').check(); await p.waitForTimeout(400);
    await p.getByRole('dialog', { name: /Filters for/ }).getByRole('button', { name: 'Done' }).click();
    ok(await rowsShown() === cnt, `${path}: ${filterLegend} filter → ${cnt} rows (its count)`);
    ok(await p.locator('.dt-chip', { hasText: `${chipLabel}:` }).count() === 1 && hash().includes(`${param}=`), `${path}: chip "${chipLabel}" + ?${param}=`);
    await p.locator('.dt-chips').getByRole('button', { name: 'Clear all' }).click(); await p.waitForTimeout(300);
  }
  ok(await p.locator('form.filterbar, .filter-bar').count() === 0, `${path}: no separate filter bar`);
}
await screen('/shipments?show=all', 'KBL', 'Status', 'Status', 'status');
await screen('/sales', 'a', 'Warehouse', 'Warehouse', 'wh');
await screen('/transport-costs', 'SSD', 'Provider', 'Provider', 'provider');
await screen('/transport-costs?tab=trips', 'SSD', 'Route', 'Route', 'route');
await screen('/stock?show=all', 'Gin', 'Level', 'Level', 'level');
// batch 2: hand-written tables moved to DataTable
await screen('/warehouse-expenses?show=all&from=2026-01-01', 'Offloading', 'Category', 'Category', 'cat');
await screen('/re-exports?show=all', 'ASIE', 'From → to', 'From → to', 'route');
// sidebar: every item the same distance apart (V3-1d)
{
  const tops = await p.locator('aside nav a').evaluateAll((as) => as.map((a) => a.getBoundingClientRect().top));
  const gaps = tops.slice(1).map((t, i) => Math.round(t - tops[i]));
  ok(gaps.length > 5 && Math.max(...gaps) - Math.min(...gaps) <= 1, `sidebar items evenly spaced (${[...new Set(gaps)].join(', ')} px)`);
}
// BUG-3: Stock's table follows its filters (it used to list every line)
await p.goto(`${base}#/stock?show=all`); await p.waitForTimeout(2000);
const allLines = await rowsShown();
await p.getByRole('button', { name: /^Filters/ }).click(); await p.waitForTimeout(300);
const lvl = p.getByRole('dialog', { name: /Filters for/ }).locator('fieldset', { hasText: 'Level' }).locator('.dt-opt').first();
const lvlCount = Number((await lvl.innerText()).split('\n').at(-1)); await lvl.locator('input').check(); await p.waitForTimeout(400);
await p.getByRole('dialog', { name: /Filters for/ }).getByRole('button', { name: 'Done' }).click();
const stripText = (await p.locator('.filter-note').first().textContent()) ?? '';
ok(await rowsShown() === lvlCount && lvlCount < allLines && stripText.includes(`${lvlCount} of`), `BUG-3: Stock table = strip = ${lvlCount} of ${allLines} lines`);
await p.locator('.dt-chips').getByRole('button', { name: 'Clear all' }).click(); await p.waitForTimeout(300);
// the Shipments map uses the same filtered rows
await p.goto(`${base}#/shipments?show=all&q=KBL&view=map`); await p.waitForTimeout(2500);
ok(/Showing \d+ of/.test((await p.locator('.filter-note').first().textContent()) ?? ''), 'Shipments map: the strip counts the searched rows');

// phone: cards + search still there
await p.setViewportSize({ width: 390, height: 844 }); await p.goto(`${base}#/pos?stage=all`); await p.waitForTimeout(1800);
ok(await p.locator('.dt-cards .dt-card').count() > 0 && await p.getByPlaceholder('Search reference, title, supplier…').isVisible(), 'phone: cards with the search box');
await p.screenshot({ path: `${out}/tables-phone.png` });
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all V3-8 table checks passed');
process.exit(fails ? 1 : 0);
