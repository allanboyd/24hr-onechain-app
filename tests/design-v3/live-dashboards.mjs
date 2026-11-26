// V3-11 LD-1: the Fleet tab fits the screen; each section scrolls inside itself. Run: node tests/design-v3/live-dashboards.mjs <base> <outDir>
import { chromium } from 'playwright';
const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base, { waitUntil: 'domcontentloaded' });
await p.getByRole('button', { name: 'Sign in to the web as Daniel' }).first().click(); await p.locator('aside nav a').first().waitFor();
await p.goto(`${base}#/dashboards/fleet`); await p.locator('.fit .cell').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(2500);
const box = await p.locator('.fit').boundingBox();
ok(!!box && box.y + box.height <= 900 + 1, `Fleet board fits the screen (bottom at ${Math.round((box?.y ?? 0) + (box?.height ?? 0))} of 900 px)`);
const cells = await p.locator('.fit .cell').evaluateAll((cs) => cs.map((c) => { const b = c.querySelector('.dash-panel .body'); const s = b ? getComputedStyle(b) : null; return { area: c.style.gridArea, overflow: s?.overflowY, scrolls: b ? b.scrollHeight > b.clientHeight + 2 : false, h: Math.round(c.getBoundingClientRect().height) }; }));
console.log('     cells:', JSON.stringify(cells));
ok(cells.length === 5 && cells.every((c) => c.overflow === 'auto'), 'five sections, each scrolls on its own (overflow auto)');
ok(cells.some((c) => c.scrolls), 'at least one section has more than fits and scrolls inside');
const body = p.locator('.fit .cell').first().locator('.dash-panel .body');
const hdrBefore = await p.locator('.fit .cell').first().locator('.dash-panel > header').boundingBox();
await body.evaluate((e) => e.scrollTo(0, 300)); await p.waitForTimeout(200);
const hdrAfter = await p.locator('.fit .cell').first().locator('.dash-panel > header').boundingBox();
ok(hdrBefore?.y === hdrAfter?.y && await p.evaluate(() => scrollY) === 0, 'scrolling a section moves only that section (header and page stay)');
await p.locator('.fit .cell[style*="borders"] .xtick').first().waitFor({ timeout: 15_000 });
const chrome = await p.evaluate(() => {
  const overlap = (a, b) => !!(a && b && a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1);
  const narrow = ['delayed', 'issues', 'updates'].map((area) => {
    const cell = document.querySelector(`.fit .cell[style*="${area}"]`);
    const h3 = cell?.querySelector('h3');
    const cs = h3 ? getComputedStyle(h3) : null;
    const hb = h3?.getBoundingClientRect();
    const icons = [...(cell?.querySelectorAll('.title-row .tip') ?? [])];
    const tools = cell?.querySelector('.dash-panel > header .tools');
    const title = cell?.querySelector('.title-row');
    return {
      area, title: h3?.textContent, w: cell ? Math.round(cell.getBoundingClientRect().width) : 0,
      oneLine: cs?.whiteSpace === 'nowrap', ellipsis: cs?.textOverflow === 'ellipsis',
      hit: icons.some((el) => overlap(hb, el.getBoundingClientRect())),
      wrapped: !!(tools && title && tools.getBoundingClientRect().top >= title.getBoundingClientRect().bottom - 2),
    };
  });
  const ticks = [...document.querySelectorAll('.fit .cell[style*="borders"] .xaxislayer-above .xtick text')].map((t) => ({ text: t.textContent || '', box: t.getBoundingClientRect() }));
  let tickHits = 0;
  for (let i = 0; i < ticks.length; i++) for (let j = i + 1; j < ticks.length; j++) if (overlap(ticks[i].box, ticks[j].box)) tickHits++;
  return { narrow, tickCount: ticks.length, tickHits, tickText: ticks.map((t) => t.text) };
});
console.log('     chrome:', JSON.stringify(chrome));
ok(chrome.narrow.length === 3 && chrome.narrow.every((c) => c.oneLine && c.ellipsis && !c.hit && c.wrapped), 'narrow Fleet cards: title on one line, clear of its icons, tools on the next row');
ok(chrome.tickCount >= 2 && chrome.tickHits === 0, `border heatmap column labels do not overlap (${chrome.tickHits} overlaps across ${chrome.tickCount} labels)`);
ok(await p.getByRole('group', { name: 'Warehouse' }).getByRole('button', { name: 'Combined' }).getAttribute('aria-pressed') === 'true', 'Fleet uses the report filter bar (warehouse chips)');
ok(await p.getByRole('group', { name: 'Period' }).getByRole('button', { name: '30 days' }).getAttribute('aria-pressed') === 'true', 'period chips match the report, 30 days selected');
const barShape = () => p.locator('.fbar').evaluate((bar) => {
  const row = bar.querySelector(':scope > .fbar-row');
  const bits = [...(row?.children ?? [])].map((el) => Math.round(el.getBoundingClientRect().top));
  return { rows: bar.querySelectorAll(':scope > .fbar-row').length, lines: new Set(bits).size, h: Math.round(bar.getBoundingClientRect().height) };
});
const fleetBar = await barShape();
ok(fleetBar.rows === 1 && fleetBar.lines === 1 && fleetBar.h < 90, `Fleet filter bar is one row (${fleetBar.rows} rows, ${fleetBar.lines} line, ${fleetBar.h}px)`);
await p.screenshot({ path: `${out}/fleet-fit.png` });
const tabs = ['business', 'purchasing', 'loading', 'fees', 'deliveries', 'warehouse', 'sales', 'admin'];
for (const tab of tabs) {
  await p.goto(`${base}#/dashboards/${tab}`);
  await p.locator('.dash-panel').first().waitFor({ timeout: 20_000 });
  await p.waitForTimeout(800);
  const bar = await p.locator('.fbar').count();
  const shape = await barShape();
  const panels = await p.locator('.dash-panel').count();
  const method = await p.locator('.dash-method').count();
  ok(bar === 1 && shape.rows === 1 && shape.lines === 1 && shape.h < 90 && panels > 0 && method === 0, `${tab}: one-row filter bar (${shape.h}px), ${panels} cards, no method text`);
  await p.screenshot({ path: `${out}/tab-${tab}.png` });
}
await p.setViewportSize({ width: 390, height: 844 });
await p.goto(`${base}#/dashboards/fleet`);
await p.locator('.fit .cell').first().waitFor({ timeout: 20_000 });
await p.waitForTimeout(500);
ok(await p.locator('.fit .cell').count() === 5, 'phone: sections stacked');
ok(!errs.length, `no page errors ${errs.join(' | ')}`);
await b.close(); console.log(fails ? `${fails} check(s) failed` : 'all live-dashboard checks passed'); process.exit(fails ? 1 : 0);
