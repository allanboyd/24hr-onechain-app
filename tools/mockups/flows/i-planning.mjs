// I · Period planning, POs against the plan, planned vs actual, role-restricted views (docs/07-amendments-plan.md).
// Drives the whole chain through the UI: planner drafts a quarter plan with a monthly split → director approves with
// signature → amendment → PO draft over plan with a reason → director sees the marks → planned vs actual.
import { open, shot, finish } from '../snap.mjs';
const out = process.argv[2];
const w = (s, ms = 900) => s.page.waitForTimeout(ms);
const dlg = (s) => s.page.locator('dialog[open]');
const month = new Date().toISOString().slice(0, 7);
async function sign(s) {
  const c = dlg(s).locator('canvas').first(); await c.scrollIntoViewIfNeeded(); const b = await c.boundingBox();
  await s.page.mouse.move(b.x + 30, b.y + b.height * 0.6); await s.page.mouse.down();
  for (let i = 0; i <= 24; i++) await s.page.mouse.move(b.x + 30 + i * 11, b.y + b.height * (0.6 - 0.3 * Math.sin(i / 3)), { steps: 2 });
  await s.page.mouse.up(); await w(s, 200);
}
const btn = (s, name, exact = false) => s.page.getByRole('button', { name, exact }).first();
/** Switch the signed-in demo user inside the same browser (mock data lives in this browser's storage). */
async function as(s, u, company = 'e-btw') {
  await s.page.evaluate(({ u, company }) => { localStorage.setItem('btw-user', u); localStorage.setItem(`btw-company:${u}`, company); if (company !== 'group') localStorage.setItem(`btw-entity:${u}`, company); }, { u, company });
  await s.page.evaluate(() => (location.hash = '/')); await s.page.reload(); await w(s, 1200); s.user = u;
}

// ---- Planner (BTW): new quarter plan, lines, monthly split, validation, submit
let s = await open({ app: 'web', user: 'u-kabonge', outDir: out });
await s.go('/period-plans/new', 1500);
await s.page.fill('input[type=month]', month); await w(s, 800);
await shot(s, 'I01-web-period-plan-new', 'New period plan · choose the period', 'Planner picks 1 month, a quarter, half a year, a year or custom dates; quarters follow the calendar. Optionally start from an earlier plan; overlapping plans are warned about (PL-06, PL-11).');
await btn(s, /Create draft|Copy into a new draft/).click(); await w(s, 1800);
for (let i = 0; i < 2; i++) { await btn(s, /Add (the first )?line/).click(); await w(s, 300); }
const prods = await s.page.$$eval('select[aria-label="Brand, line 1"] option', (os) => os.map((o) => o.value));
if (prods[1]) await s.page.selectOption('select[aria-label="Brand, line 2"]', prods[1]);
await s.page.fill('input[aria-label="Planned cases, line 1"]', '6000');
await s.page.fill('input[aria-label="Planned cases, line 2"]', '3600');
await btn(s, 'Split by month').click(); await w(s, 300);
const firstMonth = s.page.locator('tr.split input[type=number]').first();
await firstMonth.fill('2500'); await w(s, 200);
await btn(s, 'Submit for approval').click(); await w(s, 900);
await shot(s, 'I02-web-period-plan-split-check', 'Period plan · lines, monthly split and checks', 'Lines carry supplier, brand · package, planned cases, price and destination (Country – Town). The optional monthly split must add up to the line; submitting lists every problem (PL-07, PL-08).');
await btn(s, 'Spread evenly').click(); await w(s, 300);
await btn(s, 'Submit for approval').click(); await w(s, 1500);
await shot(s, 'I03-web-period-plan-submitted', 'Period plan · submitted', 'Submitted plans are locked for the planner; directors are notified and approve on web or app (PL-09).');
const planUrl = await s.page.evaluate(() => location.hash);

// ---- Director: list, approve with signature, amend
await as(s, 'u-daniel');
await s.go('/period-plans', 2500);
await shot(s, 'I04-web-period-plans-overview', 'Period plans · overview', 'Plans in force today, awaiting approval, upcoming periods; planned purchases by month and cases planned by supplier.');
await s.go('/period-plans?tab=list', 1500);
await shot(s, 'I05-web-period-plans-list', 'Period plans · list', 'Every period plan with its period, kind, lines, cases, value and status; directors land on “Awaiting approval”.');
await s.go(planUrl.slice(1), 1800);
await btn(s, 'Approve & sign').click(); await w(s, 500); await sign(s);
await shot(s, 'I06-web-period-plan-approve', 'Director approves with signature', 'Same drawn signature and date stamp as purchase orders; the approved plan is locked (PL-09).', { fullPage: false });
await dlg(s).getByRole('button', { name: 'Approve & sign' }).click(); await w(s, 1500);
await shot(s, 'I07-web-period-plan-approved', 'Period plan · approved and locked', 'Approved plan with its signature stamp in the history; “Amend” starts a versioned amendment and “Copy to a new period” starts the next plan (PL-10, PL-11).');
await btn(s, 'Amend').click(); await w(s, 400);
await dlg(s).locator('textarea').fill('Demand in Goma higher than forecast');
await shot(s, 'I08-web-period-plan-amend', 'Amendment with a reason', 'Changes after approval are versioned amendments: a reason is required and the approved version stays in the history until the amendment is approved (PL-10).', { fullPage: false });
await dlg(s).getByRole('button', { name: 'Cancel' }).click();

// ---- Planner: PO draft above the plan → reason required
await as(s, 'u-kabonge');
await s.go('/plans/new', 1500);
await btn(s, /Create draft/).click(); await w(s, 1800);
await s.page.fill('input[placeholder^="e.g. October"]', 'Plan check order');
await btn(s, /Add (the first )?truck/).click(); await w(s, 300);
await s.page.fill('input[aria-label="Quantity, truck 1"]', '2200');
await btn(s, /Add (the first )?truck/).click(); await w(s, 300);
await s.page.fill('input[aria-label="Quantity, truck 2"]', '2200');
await btn(s, /Add (the first )?truck/).click(); await w(s, 300);
await s.page.fill('input[aria-label="Quantity, truck 3"]', '2200');
await btn(s, 'Save draft').click(); await w(s, 1500);
await btn(s, 'Submit for approval').click(); await w(s, 900);
await shot(s, 'I09-web-po-against-plan', 'PO draft · planned, ordered and remaining', 'Each brand shows planned, already ordered, this PO and remaining from the approved period plan; above the plan is marked “Over plan” and needs a reason before submitting (PO-06, PO-07).');
const reason = s.page.locator('input[aria-label^="Reason for"]').first();
if (await reason.count()) await reason.fill('Extra stock for the Goma festival season');
await btn(s, 'Submit for approval').click(); await w(s, 1500);
const poUrl = await s.page.evaluate(() => location.hash);

// ---- Director: PO approval shows the marks
await as(s, 'u-daniel');
await s.go(poUrl.slice(1), 2000);
await btn(s, 'Approve & sign').click(); await w(s, 600);
await shot(s, 'I10-web-po-approval-marks', 'PO approval · over-plan and unplanned marks', 'Before issuing, the director sees every line over plan or not in the plan with the planner’s reason (PO-08).', { fullPage: false });
await dlg(s).getByRole('button', { name: 'Cancel' }).click();
await s.go('/reports?r=pv', 4000);
await shot(s, 'I11-web-planned-vs-actual', 'Planned vs actual · company', 'Planned, ordered, plan used %, expected to date, variance and remaining; flags Behind plan / On track / Over plan / Unplanned with director-set thresholds; running totals by month with a “today” marker; plan used per brand; lines drill down to the POs (PV-01..07, §10.1).');
await s.go('/', 3500);
await shot(s, 'I12-web-dashboard-plan-tile', 'Dashboard · planned vs actual tile', 'The command view shows this quarter’s plan used against what was expected by today, with flag counts.');

await as(s, 'u-daniel', 'group');
await s.go('/reports?r=pv', 4500);
await shot(s, 'I13-web-planned-vs-actual-group', 'Planned vs actual · group', 'In Group scope the report adds a by-company comparison and a Company column; directors see the three companies side by side.');

// ---- Role-restricted: a receiver opening planning
await as(s, 'u-asie');
await s.go('/period-plans', 1500);
await shot(s, 'I14-web-role-restricted', 'Role-restricted view', 'Users only see their own features (role × feature matrix): a receiver’s navigation has no planning, purchase orders or finance, and a direct link shows “Not available for your role”.');
await finish(s);
