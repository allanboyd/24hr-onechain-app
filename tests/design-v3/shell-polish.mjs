// V3-1b checks: no group titles, logo at the top per company, company select (keyboard), sliding switch, top bar title,
// sidebar open / close (button, Ctrl+B, remembered), phone drawer.
// Run: node tests/design-v3/shell-polish.mjs http://localhost:5173/ <outDir>   (shared stack up, demo build)
import { chromium } from 'playwright';

const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(base); await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Sign in to the web as Daniel' }).first().click();
await p.locator('aside nav a').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(600);
await p.evaluate(() => localStorage.removeItem('btw-sidebar-collapsed'));

// SB-2: no group titles, order kept
const navText = await p.locator('aside nav').innerText();
ok(!/OVERVIEW|PROCUREMENT|LOGISTICS|STOCK & SALES|ADMIN/i.test(navText.replace(/Stock|Sales/g, '')), 'no menu group titles');
ok((await p.locator('aside nav [role=group]').count()) >= 4, 'groups kept for screen readers (role=group with a name)');

// SB-5: page title in the top bar
await p.goto(`${base}#/pos`); await p.waitForTimeout(1500);
ok((await p.locator('header.top .pt').textContent())?.trim() === 'Purchase orders', 'top bar shows the page title (Purchase orders)');

// SB-3 + SB-1: company select, keyboard; logo at the top for each company
const face = p.getByRole('button', { name: /^Company:/ });
await face.focus(); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(200);
ok(await p.getByRole('listbox', { name: 'Companies' }).isVisible(), 'company select opens with ↓');
await p.keyboard.press('Escape'); await p.waitForTimeout(150);
ok(!(await p.getByRole('listbox', { name: 'Companies' }).count()) && await face.evaluate((e) => e === document.activeElement), 'Esc closes and focus returns to the button');
const heights = [];
for (const word of ['BTW', 'Nihna', 'Kivu']) {
  await face.click(); await p.getByRole('option', { name: new RegExp(word) }).first().click(); await p.waitForTimeout(1500);
  const box = await p.locator('aside .brand img').first().boundingBox();
  heights.push(Math.round(box?.height ?? 0));
  ok((box?.height ?? 0) >= 28 && (box?.y ?? 99) < 60, `${word}: logo at the top of the sidebar (${Math.round(box?.height ?? 0)} px high)`);
  await p.screenshot({ path: `${out}/polish-${word}.png`, clip: { x: 0, y: 0, width: 760, height: 300 } });
}
ok(Math.max(...heights) - Math.min(...heights) <= 2, `logos the same height (${heights.join(', ')})`);
await face.click(); await p.getByRole('option', { name: /^Group/ }).click(); await p.waitForTimeout(1200);

// SB-4: the switch thumb slides
const thumbX = () => p.locator('.seg .thumb').evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m41);
const x0 = await thumbX();
ok(await p.locator('.seg .thumb').evaluate((e) => parseFloat(getComputedStyle(e).transitionDuration) > 0), 'switch thumb has a transition');
await p.getByRole('group', { name: 'Operations or management' }).getByRole('link', { name: 'Management' }).click(); await p.waitForTimeout(800);
const x1 = await thumbX();
ok(x1 > x0 + 50, `switch thumb slid to Management (${Math.round(x0)} → ${Math.round(x1)} px)`);
await p.screenshot({ path: `${out}/polish-mgmt.png` });

// SB-6: sidebar open / close
const sideW = () => p.locator('aside.side').evaluate((e) => Math.round(e.getBoundingClientRect().width));
await p.goto(`${base}#/pos`); await p.waitForTimeout(1200);
ok(await sideW() >= 240, `sidebar open (${await sideW()} px)`);
await p.getByRole('button', { name: 'Close the sidebar' }).click(); await p.waitForTimeout(500);
ok(await sideW() <= 80, `sidebar closed to a rail (${await sideW()} px)`);
ok(await p.locator('aside nav a[title="Purchase orders"]').count() === 1, 'rail: items keep a tooltip and name');
await p.screenshot({ path: `${out}/polish-rail.png` });
await p.reload(); await p.locator('aside nav a').first().waitFor(); await p.waitForTimeout(800);
ok(await sideW() <= 80, 'closed sidebar remembered after reload');
await p.keyboard.press('Control+b'); await p.waitForTimeout(500);
ok(await sideW() >= 240, 'Ctrl+B opens it again');
await p.evaluate(() => scrollTo(0, 400)); await p.waitForTimeout(300);
ok(await p.locator('header.top.scrolled').count() === 1, 'top bar gets its shadow once the page scrolls');
await p.screenshot({ path: `${out}/polish-ops.png` });

// phone: the drawer
await p.setViewportSize({ width: 390, height: 844 }); await p.goto(`${base}#/`); await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Open the menu' }).click(); await p.waitForTimeout(500);
ok(await p.locator('aside.side').evaluate((e) => e.getBoundingClientRect().left >= 0), 'phone: the menu drawer opens');
ok(await p.getByRole('button', { name: /^Company:/ }).isVisible(), 'phone: company select in the drawer');
await p.screenshot({ path: `${out}/polish-phone.png` });
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all V3-1b checks passed');
process.exit(fails ? 1 : 0);
