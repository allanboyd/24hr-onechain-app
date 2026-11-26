// V3-14: My profile (Settings & alerts → My account → Profile). Run: node tests/design-v3/profile.mjs <base> <outDir>
import { chromium } from 'playwright';
const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch();
const errs = [];
async function signIn(name, w = 1440) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } }); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base); await p.getByRole('button', { name: `Sign in to the web as ${name}` }).first().click(); await p.locator('aside nav a, header').first().waitFor();
  return p;
}
const p = await signIn('Daniel');
await p.getByRole('link', { name: /^My profile/ }).click(); await p.waitForTimeout(2000);
ok(p.url().endsWith('#/system/profile') && (await p.locator('main h1').first().textContent())?.trim() === 'Profile', 'the name in the top bar opens Profile');
const nav = p.getByRole('navigation', { name: 'Settings & alerts' });
ok(await nav.locator('a[aria-current=page]').textContent().then((t) => t?.trim() === 'Profile'), 'Profile is first, under My account');
ok(await p.locator('input[disabled]').first().inputValue().then((v) => /^\+?\d/.test(v)), 'the phone is shown, not editable');
ok(await p.locator('.scope dt', { hasText: 'Roles' }).count() === 1, 'what I can see is listed, read-only');
// details: Save only when changed; the new name shows in the top bar
const name = p.locator('input[autocomplete=name]');
const save = p.locator('section', { has: p.locator('#pf-d') }).getByRole('button', { name: 'Save' });
ok(await save.isDisabled(), 'Save is off until something changes');
await name.fill('Daniel Test'); await save.click(); await p.waitForTimeout(800);
ok((await p.locator('a.acct .nm').textContent())?.trim() === 'Daniel Test', 'a new name shows in the top bar at once');
await name.fill('Daniel'); await save.click(); await p.waitForTimeout(600);
// password: mismatch refused; change works
const sec = p.locator('section', { has: p.locator('#pf-s') });
const pw = sec.locator('input[type=password]');
await pw.nth(0).fill('whatever1'); await pw.nth(1).fill('newpassword1'); await pw.nth(2).fill('different1');
await sec.getByRole('button', { name: /^Change (password|PIN)$/ }).click(); await p.waitForTimeout(400);
ok(await sec.locator('[role=alert]').count() === 1, 'two different new passwords are refused');
await pw.nth(2).fill('newpassword1');
const demo = await p.getByText('Demo data (in this browser)').count() > 0;
await sec.getByRole('button', { name: /^Change (password|PIN)$/ }).click(); await p.waitForTimeout(800);
if (demo) ok(await sec.locator('[role=alert]').count() === 0 && await pw.nth(0).inputValue() === '', 'the password is changed and the form clears');
// on the real server the demo account's password is not 'whatever1': a wrong current password must be refused (and nothing changes)
else ok(/current password is not right/.test(await sec.locator('[role=alert]').textContent() ?? ''), 'real server: a wrong current password is refused');
ok(await p.locator('a.acct').count() === 1, 'still signed in after the change');
// preferences: theme kept after a reload
await p.getByRole('radio', { name: 'Dark' }).click(); await p.waitForTimeout(300);
await p.reload(); await p.waitForTimeout(2000);
ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark' && await p.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked') === 'true', 'the theme is kept after a reload');
await p.screenshot({ path: `${out}/profile-dark.png`, fullPage: true });
await p.getByRole('radio', { name: 'Follow this device' }).click(); await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/profile.png`, fullPage: true });
// a warehouse user has Profile too
const q = await signIn('Yonas');
await q.goto(`${base}#/system/profile`); await q.waitForTimeout(2000);
ok((await q.locator('main h1').first().textContent())?.trim() === 'Profile' && await q.locator('.scope dt', { hasText: 'Warehouses' }).count() === 1, 'a warehouse user sees their own profile and warehouse');
const ph = await signIn('Daniel', 390);
await ph.goto(`${base}#/system/profile`); await ph.waitForTimeout(2000);
await ph.screenshot({ path: `${out}/profile-phone.png`, fullPage: true });
ok(!errs.length, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all profile checks passed');
process.exit(fails ? 1 : 0);
