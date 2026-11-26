// V3-5 checks against a PRODUCTION build served by the API server (docs/23 §6).
// Run: node tests/design-v3/pwa.mjs http://localhost:3101 [rebuild-cmd]
//   rebuild-cmd (optional): a shell command that rebuilds apps/field with different code, to test the update banner.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import qrcode from '../../apps/field/node_modules/qrcode-generator/dist/qrcode.mjs'; // a phone-app dependency

const [base, rebuild] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();

// ---- office web: installable, worker active, API never cached
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(`${base}/`); await p.waitForTimeout(1500);
  const man = await p.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); return l ? (await fetch(l.href)).json() : null; });
  ok(man?.name === 'BTW Office' && man.display === 'standalone' && man.icons?.some((i) => i.sizes === '512x512'), 'web: manifest linked, standalone, 512 px icon');
  const scope = await p.evaluate(() => navigator.serviceWorker.ready.then((r) => r.scope));
  ok(scope === `${base}/`, `web: service worker active for ${scope}`);
  await p.reload(); await p.waitForTimeout(2500); // now controlled; the app calls /v1 while it loads
  const hasApi = await p.evaluate(async () => { for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (new URL(r.url).pathname.startsWith('/v1/')) return true; return false; });
  ok(!hasApi, 'web: no /v1 answer is stored in any cache (live data only)');
  const shellCached = await p.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('btw-office-shell-')));
  ok(shellCached, 'web: app shell precached');
  await ctx.close();
}

// ---- phone app: install page with a QR of the app link
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${base}/app/install.html`); await p.waitForTimeout(1200);
  const appUrl = `${base}/app/`;
  const svg = await p.locator('.qr svg').evaluate((e) => e.outerHTML).catch(() => '');
  const qr = qrcode(0, 'M'); qr.addData(appUrl); qr.make();
  const expected = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  const norm = (s) => s.replace(/\s+/g, ' ').replace(/ ?\/>/g, '>').replace(/<\/(path|rect)>/g, '').trim();
  const pathOf = (s) => (s.match(/ d="([^"]+)"/) ?? [])[1];
  ok(!!svg && pathOf(norm(svg)) === pathOf(norm(expected)), `install page: QR encodes exactly ${appUrl}`);
  ok(await p.getByRole('heading', { name: 'iPhone (Safari)' }).count() === 1 && await p.getByRole('heading', { name: 'Android (Chrome)' }).count() === 1, 'install page: iPhone and Android steps');
  ok(await p.getByRole('link', { name: 'Open the app' }).count() === 1, 'install page: Open the app link');
  await p.screenshot({ path: 'docs/work/shots/V3-5/install-pc.png', fullPage: true }).catch(() => {});
  await ctx.close();
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage(); await mp.goto(`${base}/app/install.html`); await mp.waitForTimeout(1000);
  ok(await mp.locator('.qr').count() === 0, 'install page on a phone: no QR (you are already on the phone)');
  await mp.screenshot({ path: 'docs/work/shots/V3-5/install-phone.png', fullPage: true }).catch(() => {});
  await m.close();
}

// ---- phone app: "A new version is ready" after a new build takes over
if (rebuild) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${base}/app/`); await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(800);
  await p.reload(); await p.waitForTimeout(1500); // controlled by v1 from the start
  ok(await p.evaluate(() => !!navigator.serviceWorker.controller), 'phone: page controlled by the installed worker');
  ok(await p.getByText('A new version is ready.').count() === 0, 'phone: no banner while nothing changed');
  execSync(rebuild, { stdio: 'ignore' }); // deploy "v2"
  await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
  await p.getByText('A new version is ready.').waitFor({ timeout: 20_000 }).catch(() => {});
  ok(await p.getByText('A new version is ready.').count() === 1, 'phone: banner shows once the new version takes over');
  await p.screenshot({ path: 'docs/work/shots/V3-5/phone-update-banner.png' }).catch(() => {});
  await p.getByRole('button', { name: 'Update' }).click(); await p.waitForTimeout(2000);
  ok(await p.getByText('A new version is ready.').count() === 0, 'phone: Update reloads into the new version (banner gone)');
  await ctx.close();
}

await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all PWA checks passed');
process.exit(fails ? 1 : 0);
