// V3-8 batch 2: Truck desk Board and Costs on the shared table. Run: node tests/design-v3/tables-trucks.mjs <base> <outDir>
import { chromium } from 'playwright';
const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base, { waitUntil: 'domcontentloaded' });
await p.getByRole('button', { name: 'Sign in to the web as Daniel' }).first().click(); await p.locator('aside nav a').first().waitFor();
const rows = () => p.locator('section.dt table tbody tr');

// Board
// V3-15: the Truck desk in the left-menu layout; the Board opens as lanes by state, with a map option
await p.goto(`${base}#/trucks`); await p.locator('.lane').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(800);
const menu = (await p.getByRole('navigation', { name: 'Truck desk' }).locator('.lb').allTextContents()).map((x) => x.trim());
ok(JSON.stringify(menu) === JSON.stringify(['Board', 'Queues', 'Providers & trucks', 'Costs']), `left menu: ${menu.join(', ')}`);
const lanes = (await p.locator('.lane h3 span:first-child').allTextContents()).map((x) => x.trim());
ok(JSON.stringify(lanes) === JSON.stringify(['Waiting & loading', 'On the road', 'Delayed', 'Arrived']), 'Board: four lanes by state');
const laneSum = (await p.locator('.lane h3 .n').allTextContents()).reduce((a, x) => a + Number(x), 0);
ok(laneSum > 0 && await p.locator('.tc').count() === laneSum, `each lane counts its cards (${laneSum})`);
await p.locator('.tc').first().click(); await p.waitForTimeout(800);
ok(await p.locator('[role=dialog], dialog[open], aside.drawer, .drawer').count() > 0, 'a truck card opens the truck');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.getByRole('button', { name: 'With map' }).click(); await p.waitForTimeout(2500);
ok(/layout=map/.test(p.url()) && await p.locator('.withmap .leaflet-container').count() === 1, 'With map: lanes and the live map on one screen');
await p.screenshot({ path: `${out}/trucks-lanes-map.png` });
await p.getByRole('button', { name: 'Table' }).click(); await rows().first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(800);
const b0 = await rows().count();
ok(b0 > 0 && await p.locator('section.dt input[type=search]').count() === 1, `Board: trucks in the shared table with search (${b0})`);
const reg = (await rows().first().locator('td').first().locator('strong').textContent())?.trim() ?? '';
await p.locator('section.dt input[type=search]').fill(reg); await p.waitForTimeout(500);
ok(await rows().count() === 1 && /q=/.test(p.url()), `Board: search finds ${reg} and stays in the address`);
await rows().first().click(); await p.waitForTimeout(800);
ok(await p.locator('[role=dialog], dialog[open], aside.drawer, .drawer').count() > 0, 'Board: a row opens the truck');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.goto(`${base}#/trucks?state=Delayed&layout=table`); await p.reload(); await rows().first().waitFor({ timeout: 15_000 }); await p.waitForTimeout(600);
const states = await rows().locator('td .badge, td [class*=badge]').allTextContents();
ok(states.length > 0 && states.every((x) => /Delayed/i.test(x)), `Board: the State filter from the address (${states.length} delayed)`);
await p.screenshot({ path: `${out}/trucks-board.png` });

// Costs: By provider | By truck as tabs; picking a provider opens its trucks
await p.goto(`${base}#/trucks?tab=costs&by=truck`); await p.reload(); await p.locator('section.dt tbody tr').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(800);
const t0 = await p.locator('section.dt tbody tr').count();
await p.locator('.tabs', { hasText: 'By provider' }).getByText('By provider').click(); await p.waitForTimeout(600);
await p.locator('section.dt tbody tr').first().click(); await p.waitForTimeout(800);
const t1 = await p.locator('section.dt tbody tr').count();
ok(/provider=/.test(p.url()) && /by=truck/.test(p.url()) && await p.locator('section.dt').count() === 1 && t1 > 0 && t1 <= t0 && await p.locator('.dt-chips, [class*=chip]').count() > 0, `Costs: one table at a time; a provider opens its trucks (${t0} → ${t1}) with a chip`);
// the menu: one card per part with a description; Queues lists as tabs
ok(await p.locator('nav[aria-label="Truck desk"] .mc .ds').count() === 4, 'the menu: a card per part, each with a short description');
await p.locator('nav[aria-label="Truck desk"] .mc', { hasText: 'Queues' }).click(); await p.waitForTimeout(1500);
const qtabs = (await p.locator('.tabs', { hasText: 'Waiting trucks' }).locator('button, a').allTextContents()).map((x) => x.replace(/\d+$/, '').trim());
ok(JSON.stringify(qtabs) === JSON.stringify(['Waiting trucks', 'To load', 'Recently loaded']) && await p.locator('.qwrap section').count() === 1, `Queues: ${qtabs.join(' | ')} as tabs, one list at a time`);
await p.screenshot({ path: `${out}/trucks-costs.png`, fullPage: true });
ok(!errs.length, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all truck tables checks passed');
process.exit(fails ? 1 : 0);
