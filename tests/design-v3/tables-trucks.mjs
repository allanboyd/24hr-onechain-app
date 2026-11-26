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
await p.goto(`${base}#/trucks`); await rows().first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(800);
const b0 = await rows().count();
ok(b0 > 0 && await p.locator('section.dt input[type=search]').count() === 1, `Board: trucks in the shared table with search (${b0})`);
const reg = (await rows().first().locator('td').first().locator('strong').textContent())?.trim() ?? '';
await p.locator('section.dt input[type=search]').fill(reg); await p.waitForTimeout(500);
ok(await rows().count() === 1 && /q=/.test(p.url()), `Board: search finds ${reg} and stays in the address`);
await rows().first().click(); await p.waitForTimeout(800);
ok(await p.locator('[role=dialog], dialog[open], aside.drawer, .drawer').count() > 0, 'Board: a row opens the truck');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.goto(`${base}#/trucks?state=Delayed`); await rows().first().waitFor({ timeout: 15_000 }); await p.waitForTimeout(600);
const states = await rows().locator('td .badge, td [class*=badge]').allTextContents();
ok(states.length > 0 && states.every((x) => /Delayed/i.test(x)), `Board: the State filter from the address (${states.length} delayed)`);
await p.screenshot({ path: `${out}/trucks-board.png` });

// Costs
await p.goto(`${base}#/trucks?tab=costs`); await p.waitForTimeout(2500);
const provTable = p.locator('section.dt').first(), truckTable = p.locator('section.dt').nth(1);
const t0 = await truckTable.locator('tbody tr').count();
await provTable.locator('tbody tr').first().click(); await p.waitForTimeout(800);
const t1 = await truckTable.locator('tbody tr').count();
ok(/provider=/.test(p.url()) && t1 > 0 && t1 <= t0 && await truckTable.locator('.chip, [class*=chip]').count() > 0, `Costs: a provider narrows the trucks (${t0} → ${t1}) with a chip`);
await p.screenshot({ path: `${out}/trucks-costs.png`, fullPage: true });
ok(!errs.length, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all truck tables checks passed');
process.exit(fails ? 1 : 0);
