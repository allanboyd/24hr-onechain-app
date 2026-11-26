// V3-6: the phone shell (web app at 390 px): slim top bar with search, bell and avatar; the bottom bar per role; More
// with every menu entry, the switch, the company, theme and sign-out; search. Desktop stays as it was (shell.mjs).
// Run: node tests/design-v3/phone-shell.mjs <base> <outDir>
import { chromium } from 'playwright';
const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const errs = [];
async function signIn(name) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base); await p.getByRole('button', { name: `Sign in to the web as ${name}` }).first().click(); await p.waitForTimeout(2000);
  return p;
}
const bottom = (p) => p.getByRole('navigation', { name: 'Main places' });
const p = await signIn('Daniel');
const places = (await bottom(p).locator('.lb').allTextContents()).map((x) => x.trim());
ok(JSON.stringify(places) === JSON.stringify(['Home', 'Shipments', 'Trucks', 'Alerts', 'More']), `director: bottom bar ${places.join(', ')}`);
const top = await p.locator('header.top').boundingBox();
ok(!!top && top.height <= 60, `top bar is slim (${Math.round(top?.height ?? 0)} px)`);
ok(await p.getByRole('button', { name: 'Toggle theme' }).isHidden() && await p.getByRole('button', { name: 'Sign out', exact: true }).isHidden() && await p.getByRole('button', { name: 'Search', exact: true }).isVisible(), 'theme and sign-out left the top bar; search is in it');
await bottom(p).getByRole('link', { name: /Shipments/ }).click(); await p.waitForTimeout(1500);
ok(/#\/shipments/.test(p.url()) && await bottom(p).locator('a[aria-current=page] .lb').textContent().then((t) => t?.trim() === 'Shipments'), 'a place opens and is highlighted');
ok((await p.locator('.ptitle .pt').textContent())?.trim() === 'Shipments', 'the top bar names the page');
await p.locator('a.acct').click(); await p.waitForTimeout(1500);
ok(/#\/system\/profile/.test(p.url()), 'the avatar opens Profile');
// More
await bottom(p).getByRole('button', { name: 'More' }).click(); await p.waitForTimeout(500);
const sheet = p.getByRole('dialog', { name: 'More' });
const tiles = await sheet.locator('.tiles a').count();
ok(tiles >= 10 && await sheet.getByRole('button', { name: 'Sign out' }).count() === 1 && await sheet.getByRole('radiogroup', { name: 'Theme' }).count() === 1, `More: every menu entry (${tiles}), theme and sign-out`);
await sheet.getByRole('radio', { name: 'Dark' }).click(); await p.waitForTimeout(300);
ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'theme from More');
await p.screenshot({ path: `${out}/phone-more-dark.png` });
await sheet.getByRole('radio', { name: 'Device' }).click();
await sheet.locator('.tiles a', { hasText: 'Stock' }).click(); await p.waitForTimeout(1500);
ok(/#\/stock/.test(p.url()) && await p.getByRole('dialog', { name: 'More' }).count() === 0, 'a tile opens the page and closes More');
// Search
await p.getByRole('button', { name: 'Search', exact: true }).click(); await p.waitForTimeout(400);
await p.keyboard.type('stock'); await p.waitForTimeout(800);
ok(await p.getByRole('dialog', { name: 'Search' }).locator('h3', { hasText: 'Pages' }).count() === 1, 'search finds pages');
await p.locator('input[aria-label="Search"]').fill('kbv'); await p.waitForTimeout(800);
const hit = p.getByRole('dialog', { name: 'Search' }).locator('a', { hasText: 'KBV' }).first();
ok(await hit.count() === 1, 'search finds a truck');
await hit.click(); await p.waitForTimeout(1500);
ok(/#\/shipments.*q=KBV/i.test(p.url()), 'a truck opens its shipments');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'nothing scrolls sideways');
// a warehouse user: their own places
const q = await signIn('Yonas');
const qp = (await bottom(q).locator('.lb').allTextContents()).map((x) => x.trim());
ok(JSON.stringify(qp) === JSON.stringify(['Home', 'Stock', 'Sales', 'Alerts', 'More']) || JSON.stringify(qp) === JSON.stringify(['Home', 'Stock', 'Alerts', 'More']), `warehouse user: ${qp.join(', ')}`);
await q.screenshot({ path: `${out}/phone-warehouse.png` });
ok(!errs.length, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all phone shell checks passed');
process.exit(fails ? 1 : 0);
