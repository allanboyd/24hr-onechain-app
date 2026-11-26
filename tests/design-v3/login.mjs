// V3-6 / V3-16: the web sign-in: the form first (with a show / hide eye), the demo accounts below it; a brand panel on wide
// screens; nothing sideways on a phone. Run: node tests/design-v3/login.mjs <base> <outDir>
import { chromium } from 'playwright';
const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark' })).newPage();  // V3-16: light even on a dark device
  await p.goto(base); await p.locator('#login-user').waitFor({ timeout: 15_000 });
  const formY = (await p.locator('#login-user').boundingBox())?.y ?? 9e9;
  const demoY = (await p.getByRole('button', { name: /Sign in to the web as/ }).first().boundingBox())?.y ?? 0;
  ok(formY < demoY && formY < h, `${w} px: the sign-in form comes first, on the first screen`);
  await p.locator('#login-pass').fill('x'); await p.getByRole('button', { name: 'Show the password' }).click();
  ok(await p.locator('#login-pass').getAttribute('type') === 'text', `${w} px: the eye shows the password`);
  ok(!(await p.locator('main').innerText()).includes('—'), `${w} px: no em dash`);
  ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light', `${w} px: light by default on a dark-mode device`);
  if (w === 1440) ok(await p.locator('aside.side .hero').isVisible() && await p.locator('aside.side .trk').isVisible(), 'wide: the blue brand panel and the truck card');
  else ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: nothing sideways');
  await p.screenshot({ path: `${out}/login-${w}.png` });
  await p.close();
}
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all login checks passed');
process.exit(fails ? 1 : 0);
