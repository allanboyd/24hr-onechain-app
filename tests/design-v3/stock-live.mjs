// V3-15: Stock made easy: warehouse cards, short rows with a cover bar and "what to do", details on the row, no sideways
// scrolling. Run: node tests/design-v3/stock-live.mjs <base> <outDir>
import { chromium } from 'playwright';
const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const errs = [];
async function open(w, h = 900) {
  const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base); await p.getByRole('button', { name: 'Sign in to the web as Daniel' }).first().click(); await p.waitForTimeout(1500);
  await p.goto(`${base}#/stock?show=all`); await p.locator('.whc').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(1200);
  return p;
}
const p = await open(1440);
const noSide = async (pg) => pg.evaluate(() => { const t = document.querySelector('section.dt .table-wrap, section.dt [class*=wrap]'); return document.documentElement.scrollWidth <= innerWidth + 1 && (!t || t.scrollWidth <= t.clientWidth + 2); });
ok(await noSide(p), '1440 px: the stock table fits, nothing scrolls sideways');
const heads = (await p.locator('section.dt thead th').allTextContents()).map((x) => x.trim().toLowerCase());
ok(heads.some((h) => h.startsWith('on hand')) && heads.some((h) => h.startsWith('what to do')) && !heads.some((h) => h.startsWith('received') || h.startsWith('sold')), `short rows: on hand with cover and what to do (${heads.filter(Boolean).join(', ')})`);
ok(await p.locator('.cbar').count() > 0, 'each line shows a cover bar');
const cards = await p.locator('.whc').count();
ok(cards >= 2, `one card per warehouse (${cards})`);
const name = (await p.locator('.whc .nm').first().textContent())?.trim();
await p.locator('.whc').first().click(); await p.waitForTimeout(800);
const whs = new Set((await p.locator('section.dt tbody tr td:nth-child(2)').allTextContents()).map((x) => x.trim()));
ok(/wh=/.test(p.url()) && whs.size === 1 && [...whs][0] === name, `a warehouse card filters the page to ${name}`);
await p.locator('.whc').first().click(); await p.waitForTimeout(500);
// details stay one click away
await p.locator('section.dt tbody tr').first().click(); await p.waitForTimeout(800);
ok(await p.getByText('Sold', { exact: true }).count() > 0 && await p.getByText('Received', { exact: true }).count() > 0, 'a row opens its details: received, sold and the rest');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.getByRole('button', { name: 'By product' }).click(); await p.waitForTimeout(800);
ok(/by=product/.test(p.url()), 'Group by product is kept in the address');
await p.screenshot({ path: `${out}/stock-live.png` });
const ph = await open(390, 844);
ok(await noSide(ph), '390 px: nothing scrolls sideways');
await ph.screenshot({ path: `${out}/stock-live-phone.png`, fullPage: false });
ok(!errs.length, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all stock live checks passed');
process.exit(fails ? 1 : 0);
