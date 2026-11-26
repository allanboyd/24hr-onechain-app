// V3-11a: Home has no "What needs a decision…" line; the My dashboards filter toolbar sits at the right of the greeting
// and still opens the filters; scrollbars use the brand colour. Run: node tests/design-v3/home-head.mjs <base> <outDir>
import { chromium } from 'playwright';
const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base); await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Sign in to the web as Daniel' }).first().click(); await p.locator('aside nav a').first().waitFor();
await p.goto(`${base}#/`); await p.locator('.page-head h1').waitFor(); await p.waitForTimeout(2500);
ok(await p.getByText('What needs a decision, and where the business stands.').count() === 0, 'no "What needs a decision…" line');
const head = p.locator('.page-head');
ok(await head.locator('.toolbar').count() === 1 && await p.locator('.page-head ~ * .toolbar, main > .toolbar').count() === 0, 'the filter toolbar is in the header');
const h1 = await head.locator('h1').boundingBox(), tb = await head.locator('.toolbar').boundingBox();
ok(!!h1 && !!tb && tb.x > h1.x + h1.width && tb.x + tb.width > 1100, `toolbar at the right of the greeting (x ${Math.round(tb?.x ?? 0)})`);
await head.locator('.toolbar button[title="Filters"]').click(); await p.waitForTimeout(500);
ok(await p.getByRole('dialog').count() > 0, 'the toolbar still opens the filters');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
const sc = await p.evaluate(() => getComputedStyle(document.documentElement).scrollbarColor);
ok(/rgb|color-mix/.test(sc) && !/auto/.test(sc), `brand scrollbar colour (${sc})`);
await p.screenshot({ path: `${out}/home-head.png`, clip: { x: 248, y: 60, width: 1192, height: 300 } });
ok(!errs.length, `no page errors ${errs.join(' | ')}`);
await b.close(); console.log(fails ? `${fails} check(s) failed` : 'all home header checks passed'); process.exit(fails ? 1 : 0);
