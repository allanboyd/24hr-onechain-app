// H · Three sibling companies + group view (docs/06-multi-company-plan.md).
import { open, shot, finish } from '../snap.mjs';
const out = process.argv[2];
const w = (s, ms = 900) => s.page.waitForTimeout(ms);
/** Switch the active company the way a user does (top-bar switcher). */
async function company(s, word) {
  const v = await s.page.$$eval('select[aria-label="Company"] option', (os, x) => os.find((o) => o.textContent.includes(x))?.value, word);
  await s.page.selectOption('select[aria-label="Company"]', v); await w(s, 1800);
}
async function firstPo(s) { await s.go('/pos', 1200); await s.page.locator('a[href^="#/pos/"]').first().click(); await w(s, 1800); }

let s = await open({ app: 'web', user: '', outDir: out });
await shot(s, 'H01-web-signin-companies', 'Sign in · three companies', 'The three sibling companies on the sign-in page; demo accounts grouped as Group (directors, admins, staff of all three) and per company. One tap signs in.');
await finish(s);

s = await open({ app: 'web', user: 'u-daniel', outDir: out, company: 'group' });
await s.go('/', 3500);
await shot(s, 'H02-web-group-dashboard', 'Group command view (directors)', 'Consolidated KPIs with each company’s split, a company league table (best per column), sum of companies → less intercompany → consolidated group, sales by month per company, share of group, stock-out risks by company. FX basis stated.');
for (const [word, id, name] of [['BTW', 'H03', 'BTW Global'], ['Nihna', 'H04', 'Nihna Unique'], ['Volcanic', 'H05', 'Kivu']]) {
  await company(s, word); await s.go('/', 3000);
  await shot(s, `${id}-web-dashboard-${name.split(' ')[0].toLowerCase()}`, `${name} · command view`, `The same director switched to ${name}: the sidebar shows ${name}’s logo, the switcher names the company, and every figure is ${name} only.`);
}
await company(s, 'Group'); await s.go('/reports', 4000);
await shot(s, 'H06-web-group-reports', 'Group reports · by company', 'In Group scope every report and overview opens with a “by company” breakdown (each company + group total); clicking a company switches into it.');
await s.go('/sales', 3500);
await shot(s, 'H07-web-group-readonly', 'Group view is read-only', 'Write actions are replaced by “Choose a company to record a sale” with an inline company picker; record-level actions offer “Switch to NUD to act”.');
for (const [word, id, code] of [['BTW', 'H08', 'btw'], ['Nihna', 'H09', 'nud'], ['Volcanic', 'H10', 'kvd']]) {
  await company(s, word); await firstPo(s);
  await shot(s, `${id}-web-po-letter-${code}`, `PO letter · ${code.toUpperCase()} letterhead`, 'Purchase order on the issuing company’s own letterhead (header and footer traced from docs/inspiration), legal line with KRA PIN / registration number (to confirm), stamp in the company colour.');
}
await finish(s);

s = await open({ app: 'web', user: 'u-kabonge', outDir: out, company: 'e-nud' });
await s.go('/', 3000);
await shot(s, 'H11-web-single-company', 'Single-company staff (NUD planner)', 'Staff of one company never see a switcher or other companies’ numbers; the top bar shows their company.');
await s.go('/plans/new', 1200);
await shot(s, 'H12-web-new-plan-company', 'New plan · ordering company', 'The ordering company (letterhead) is the active company, shown with its logo; no free choice of another company.');
await finish(s);

s = await open({ app: 'web', user: 'u-daniel', outDir: out, width: 390, height: 844, company: 'group' });
await s.go('/', 3000);
await shot(s, 'H13-web-group-phone', 'Group view on a phone', 'Switcher, league table and charts at 390 px.');
await finish(s);

for (const [user, id, title] of [['u-drv1', 'H14', 'Field · driver trip with company'], ['u-asie', 'H15', 'Field · receiver sees each truck’s company']]) {
  s = await open({ app: 'field', user, outDir: out });
  await w(s, 2500);
  await shot(s, `${id}-field-${user === 'u-drv1' ? 'driver' : 'receiver'}-company`, title, 'The company of the shipment (logo + name) is shown on the trip, hand-over and receipt; receivers handle trucks for all three companies.');
  await finish(s);
}
