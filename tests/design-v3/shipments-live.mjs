// V3-15: Shipments with the map on one page (Split / List / Map), cards with progress, map focus and the journey panel.
// Run: node tests/design-v3/shipments-live.mjs <base> <outDir>
import { chromium } from 'playwright';
const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const errs = [];
async function open(w = 1440, h = 900) {
  const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base); await p.getByRole('button', { name: 'Sign in to the web as Daniel' }).first().click(); await p.waitForTimeout(1500);
  return p;
}
const p = await open();
await p.goto(`${base}#/shipments?show=road`); await p.locator('.sc').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(1500);
ok(await p.getByRole('button', { name: 'Split' }).getAttribute('aria-pressed') === 'true' && await p.locator('.mapcard .leaflet-container').count() === 1, 'a wide screen opens in Split: cards and the map');
const cards = await p.locator('.sc').count();
const strip = Number(((await p.locator('[aria-label="Shipments summary"]').textContent()) ?? '').match(/(\d+) of \d+/)?.[1] ?? cards);
ok(cards > 0 && cards === strip, `cards follow the figure picked above (${cards} = ${strip})`);
ok(await p.locator('.sc').first().locator('.pg .dot').count() >= 2, 'each card has the checkpoint progress bar');
// pick a card: the map frames it, the journey panel opens, the address keeps it
await p.locator('.sc').nth(0).click(); await p.waitForTimeout(1500);
const panel = p.locator('.panel');
ok(await panel.count() === 1 && /[?&]sh=/.test(p.url()), 'picking a card opens its journey and keeps it in the address');
const steps = await panel.locator('.jr li').count();
const here = await panel.locator('.jr li.here, .jr li.next').count();
ok(steps >= 2 && here >= 1, `the journey lists every checkpoint (${steps}) and marks where the truck is or goes next`);
ok(await p.locator('.leaflet-overlay-pane path').count() >= 1, 'the picked route is drawn on the map');
const sel = await p.locator('.sc[aria-pressed=true] .reg').textContent();
ok((await panel.locator('.reg').textContent())?.trim() === sel?.trim(), `the panel is the picked truck (${sel?.trim()})`);
await p.screenshot({ path: `${out}/ship-live-picked.png` });
await p.reload(); await p.waitForTimeout(3500);
ok(await p.locator('.panel').count() === 1, 'a link with ?sh= opens the map on that shipment');
await panel.getByRole('button', { name: 'Close' }).click(); await p.waitForTimeout(500);
ok(await p.locator('.panel').count() === 0 && !/[?&]sh=/.test(p.url()), 'Close shuts the panel');
// search filters the cards
await p.locator('.cards input[type=search]').fill(sel?.trim() ?? ''); await p.waitForTimeout(500);
ok(await p.locator('.sc').count() === 1, 'search narrows the cards');
// views
await p.getByRole('button', { name: 'List' }).click(); await p.waitForTimeout(1200);
ok(/view=list/.test(p.url()) && await p.locator('section.dt table').count() === 1, 'List shows the table (export, long searches)');
await p.getByRole('button', { name: 'Map' }).click(); await p.waitForTimeout(1500);
ok(/view=map/.test(p.url()) && await p.locator('.sc').count() === 0 && await p.locator('.mapcard').count() === 1, 'Map shows the map alone');
// a phone opens on the cards
const ph = await open(390, 844);
await ph.goto(`${base}#/shipments?show=road`); await ph.waitForTimeout(3000);
ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: nothing scrolls sideways');
await ph.screenshot({ path: `${out}/ship-live-phone.png` });
ok(!errs.length, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all shipments live checks passed');
process.exit(fails ? 1 : 0);
