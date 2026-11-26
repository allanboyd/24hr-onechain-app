// V3-12 step 3: supplier money on the PO page; Management reads it. Run: node tests/design-v3/supplier-money.mjs <base> <outDir>
import { chromium } from 'playwright';
const [base, out = '.'] = process.argv.slice(2);
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base, { waitUntil: 'domcontentloaded' });
await p.getByRole('button', { name: 'Sign in to the web as Daniel' }).first().click(); await p.locator('aside nav a').first().waitFor();
const cnKpi = async () => {
  await p.goto(`${base}#/management/suppliers`); await p.locator('.mrep .kpi').first().waitFor({ timeout: 20_000 }); await p.waitForTimeout(800);
  return Number(((await p.locator('.mrep .kpi', { has: p.locator('.lbl', { hasText: /^Credit notes$/ }) }).locator('.val').textContent()) ?? '').replace(/[^0-9.-]/g, ''));
};
const cn0 = await cnKpi();
ok(await p.getByText('Not recorded yet').count() === 0, 'Supplier balances: nothing says "Not recorded yet"');
// an issued purchase order with prices: the newest one in the list that is not waiting for approval
await p.goto(`${base}#/pos`); await p.waitForTimeout(2500);
const hrefs = await p.locator('table tbody a[href^="#/pos/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
let opened = false;
for (const h of hrefs.slice(0, 40)) {
  await p.goto(base + h); await p.waitForTimeout(1500);
  // a PO with nothing recorded yet, so the figures below start from zero (earlier runs leave theirs on the shared database)
  if (await p.getByRole('button', { name: 'Add pro-forma' }).count() && await p.locator('.supplier-money', { hasText: 'Nothing recorded yet' }).count()) { opened = true; break; }
}
ok(opened, 'an issued PO shows the Supplier money card with Add pro-forma');
const facts = () => p.locator('.supplier-money .facts').innerText();
await p.getByRole('button', { name: 'Add pro-forma' }).click(); await p.locator('dialog[open]').waitFor();
await p.locator('dialog[open] input[type=number]').first().fill('5000');
await p.locator('dialog[open] input[placeholder="Pro-forma number"]').fill('PF-TEST');
await p.locator('dialog[open]').getByRole('button', { name: 'Add pro-forma' }).click(); await p.waitForTimeout(1200);
ok(/Pro-forma\s*\n?\s*\S+ 5,000\.00/.test(await facts()) || (await facts()).includes('5,000.00'), 'the pro-forma shows on the PO');
await p.getByRole('button', { name: 'Record advance' }).click(); await p.locator('dialog[open]').waitFor();
await p.locator('dialog[open] input[type=number]').first().fill('2000');
await p.screenshot({ path: `${out}/po-supplier-money-advance.png` });
await p.locator('dialog[open]').getByRole('button', { name: 'Record advance' }).click(); await p.waitForTimeout(1200);
ok((await facts()).includes('2,000.00') && (await facts()).includes('3,000.00'), 'advance 2,000 paid, 3,000 still open');
await p.getByRole('button', { name: 'Record credit note' }).click(); await p.locator('dialog[open]').waitFor();
await p.locator('dialog[open] input[type=number]').first().fill('150');
await p.locator('dialog[open]').getByRole('button', { name: 'Record credit note' }).click(); await p.waitForTimeout(1200);
ok(await p.locator('.supplier-money tbody tr', { hasText: 'Credit note' }).count() >= 1, 'the credit note is listed on the PO');
const poUrl = p.url();
// approval on: the next advance waits; a director approves it on the PO
await p.goto(`${base}#/system/approvals`); await p.getByRole('switch', { name: 'Advance payments need director approval' }).click(); await p.locator('dialog[open]').getByRole('button', { name: /^Turn (on|off)$/ }).click(); await p.waitForTimeout(600);
await p.goto(poUrl); await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Record advance' }).click(); await p.locator('dialog[open]').waitFor();
await p.locator('dialog[open] input[type=number]').first().fill('500');
await p.locator('dialog[open]').getByRole('button', { name: 'Record advance' }).click(); await p.waitForTimeout(1200);
ok((await facts()).includes('Waiting for a director') && await p.getByRole('button', { name: 'Approve' }).count() === 1, 'with approval on, the advance waits and the director sees Approve');
await p.screenshot({ path: `${out}/po-supplier-money.png`, fullPage: false });
await p.getByRole('button', { name: 'Approve' }).click(); await p.waitForTimeout(1200);
ok((await facts()).includes('2,500.00') && !(await facts()).includes('Waiting for a director'), 'approved: advances paid 2,500');
await p.goto(`${base}#/system/approvals`); await p.getByRole('switch', { name: 'Advance payments need director approval' }).click(); await p.locator('dialog[open]').getByRole('button', { name: /^Turn (on|off)$/ }).click(); await p.waitForTimeout(600);
const cn1 = await cnKpi();
ok(cn1 >= cn0 + 149, `Management → Supplier balances: credit notes went up (${cn0} → ${cn1})`);
ok(await p.locator('.mrep table tbody tr', { hasText: 'Credit note' }).count() >= 1, 'the statement lists the credit note');
await p.screenshot({ path: `${out}/mgmt-suppliers-recorded.png`, fullPage: true });
ok(!errs.length, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(fails ? `${fails} check(s) failed` : 'all supplier money checks passed');
process.exit(fails ? 1 : 0);
