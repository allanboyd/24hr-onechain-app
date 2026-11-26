// V3-6: on a phone nothing may stick out sideways (the page would pan and carry the top bar away), and both bars stay
// pinned while scrolling. Runs in Chromium and, when it can launch, WebKit as an iPhone 13 (Safari).
// Run: node tests/design-v3/phone-scroll.mjs <base>   (WebKit without system libraries: PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1)
import { chromium, webkit, devices } from 'playwright';
const [base] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const PATHS = ['#/', '#/plans', '#/pos', '#/trucks', '#/trucks?tab=queues', '#/trucks?tab=providers', '#/trucks?tab=costs', '#/shipments', '#/shipments?view=list',
  '#/transfers', '#/stock', '#/stock?by=product', '#/warehouse-expenses', '#/sales', '#/master-data', '#/system/alerts', '#/system/profile', '#/system/users', '#/system/audit',
  '#/management/overview', '#/management/purchases', '#/management/clients', '#/management/suppliers', '#/management/cash', '#/management/stock', '#/management/transport', '#/management/sales'];
const engines = [['chromium', chromium, { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true }], ['webkit', webkit, devices['iPhone 13']]];
for (const [name, eng, ctx] of engines) {
  let b; try { b = await eng.launch(); } catch { console.log(`skip ${name}: cannot launch here`); continue; }
  const p = await (await b.newContext(ctx)).newPage();
  await p.goto(base); await p.getByRole('button', { name: 'Sign in to the web as Daniel' }).first().click(); await p.waitForTimeout(3000);
  for (const path of PATHS) {
    await p.goto(base + path);
    await p.locator('main.content h1, main.content h2').first().waitFor({ timeout: 15_000 }).catch(() => {});
    await p.waitForTimeout(2000); // charts, tables and filters settle
    const r = await p.evaluate(() => {
      const W = innerWidth; const wide = document.documentElement.scrollWidth;
      const out = wide > W + 1 ? [...document.querySelectorAll('main *')].filter((e) => { const x = e.getBoundingClientRect(); if (x.right <= W + 1 || !x.width) return false; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX)) return false; return true; }) : [];
      const first = out.filter((e) => !out.includes(e.parentElement)).slice(0, 2).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].filter((c) => !c.startsWith('s-'))[0] ?? ''} ${Math.round(e.getBoundingClientRect().width)}px`);
      scrollTo(400, 900);
      return { W, wide, first };
    });
    await p.waitForTimeout(300);
    const bars = await p.evaluate(() => { const t = document.querySelector('header.top')?.getBoundingClientRect(); const n = document.querySelector('nav[aria-label="Main places"]')?.getBoundingClientRect(); return { sx: scrollX, tl: Math.round(t?.left ?? -1), tt: Math.round(t?.top ?? -1), nl: Math.round(n?.left ?? -1), nb: Math.round(n?.bottom ?? -1), H: innerHeight }; });
    ok(r.wide <= r.W + 1 && bars.sx === 0 && bars.tl === 0 && bars.tt === 0 && bars.nl === 0 && Math.abs(bars.nb - bars.H) <= 2,
      `${name} ${path}: no sideways scroll, bars pinned${r.wide > r.W + 1 ? ` (page ${r.wide}px: ${r.first.join(', ')})` : ''}${bars.tl || bars.tt || bars.sx ? ` top bar at ${bars.tl},${bars.tt} scrollX ${bars.sx}` : ''}`);
  }
  await b.close();
}
console.log(fails ? `${fails} check(s) failed` : 'all phone scroll checks passed');
process.exit(fails ? 1 : 0);
