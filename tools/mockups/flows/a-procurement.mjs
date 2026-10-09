import { open, shot, finish } from '../snap.mjs';
const out = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Login
let s = await open({ app: 'web', user: '', outDir: out });
await shot(s, 'A01-web-login', 'Sign in', 'Username or phone + password (UA-04). Demo accounts helper only appears in demo/dev builds; expired sessions come back here with a notice.');
await finish(s);

// Dashboard light / dark / mobile
s = await open({ app: 'web', user: 'u-dir', outDir: out });
await s.go('/', 900);
await shot(s, 'A02-web-dashboard', 'Executive dashboard (director)', 'KPIs (trucks on the road, approvals waiting, stock, 30-day sales), trucks in transit with ETA badges, velocity flags, daily sales and plans awaiting approval (§10 Executive summary, TR-02, §9.3).');
await finish(s);
s = await open({ app: 'web', user: 'u-dir', outDir: out, theme: 'dark' });
await s.go('/', 900);
await shot(s, 'A03-web-dashboard-dark', 'Executive dashboard — dark mode', 'Same screen in dark theme: orange takes the primary role, logo stays on a white tile (02-design-system §2.4, Q-B3).');
await finish(s);
s = await open({ app: 'web', user: 'u-dir', outDir: out, width: 390, height: 844 });
await s.go('/', 900);
await shot(s, 'A04-web-dashboard-mobile', 'Dashboard on a phone browser', 'Responsive web at 390 px: KPI cards stack, route column hides, flags wrap to two lines (§12 Browsers: desktop, tablet, phone).');
await s.page.click('button[aria-label="Menu"]'); await sleep(400);
await shot(s, 'A05-web-nav-drawer-mobile', 'Navigation drawer (phone)', 'Sidebar becomes a drawer with a scrim on small screens; menu items are filtered by role (UA-01).', { fullPage: false });
await finish(s);

// Planner flow
s = await open({ app: 'web', user: 'u-kabonge', outDir: out });
const P = s.page;
await s.go('/plans');
await shot(s, 'A06-web-plans-list', 'Plans list (planner)', 'Status tabs with counts, search and entity filter; every plan shows trucks, cases and amount in the order currency (PL-01, PL-02).');
await s.go('/plans/new');
await shot(s, 'A07-web-plan-new', 'New plan — step 1', 'Pick the ordering entity (letterhead) and supplier export section; the lanes from that loading point and the reference format are shown (§7.1, §17.2, PO-02).');
await P.click('text=Create draft'); await sleep(700);
await P.fill('input[placeholder^="e.g. October"]', "October '26 Order No. 3");
const addTruck = () => P.click('button:has-text("Add truck")');
await addTruck(); await sleep(150); await addTruck(); await sleep(150); await addTruck(); await sleep(150);
const qty = (i) => P.locator('table.lines input.qty').nth(i);
await qty(0).fill('2000');
await qty(1).fill('1200');
await P.click('button[aria-label="Add brand to truck 2"]'); await sleep(150);
// lines order: t1, t2a, t3, t2b? lines render grouped by truck -> t1, t2a, t2b, t3
await qty(2).fill('800');
await qty(3).fill('2400');
await P.locator('table.lines tr').filter({ hasText: '3' }).first();
await P.click('button:has-text("Submit for approval")'); await sleep(3500);
await shot(s, 'A08-web-plan-editor-validation', 'Plan editor — mixed load and validation', 'Draft with 3 trucks; truck 2 is a mixed load (two brands) with its own subtotal; truck 3 is over capacity, so Submit lists what to fix (§7.2, §7.3 #3/#5, PO-05).');
await qty(3).fill('2000'); await sleep(200);
await P.click('button:has-text("Submit for approval")'); await sleep(3500);
const planUrl = await P.evaluate(() => location.hash.slice(1));
await shot(s, 'A09-web-plan-submitted-planner', 'Plan submitted', 'After submitting, the plan is read-only for the planner; history shows who submitted and that directors were notified (PL-02, PL-05).');
// Director takes over in the same browser data
await P.evaluate(() => localStorage.setItem('btw-user', 'u-dir')); await P.reload(); await sleep(500);
await s.go(planUrl, 800);
await shot(s, 'A10-web-plan-director-review', 'Director reviews the plan', 'Director sees order lines grouped by truck, truck/brand subtotals and the grand total, with Return, Reject and Approve & sign (PL-02).');
await P.click('button:has-text("Approve & sign")'); await sleep(400);
const c = await P.locator('dialog canvas').boundingBox();
await P.mouse.move(c.x + 30, c.y + c.height * 0.7); await P.mouse.down();
const pts = [[60, .3], [90, .75], [120, .35], [150, .7], [185, .4], [215, .65], [250, .45], [300, .6], [340, .5]];
for (const [x, y] of pts) await P.mouse.move(c.x + x, c.y + c.height * y, { steps: 6 });
await P.mouse.up(); await sleep(200);
await shot(s, 'A11-web-approve-sign-dialog', 'Approve & sign', 'On-screen e-signature; on confirm the date stamp is applied, the plan locks and the PO is generated with no retyping (PL-03, PO-01).', { fullPage: false });
await P.click('dialog button:has-text("Approve & sign")'); await sleep(3500);
await shot(s, 'A12-web-plan-approved', 'Approved plan with history', 'Locked plan with full approval history and the signature; amendments go through a new version (PL-03, PL-04).');
await s.go('/pos', 800);
await shot(s, 'A13-web-po-list', 'Purchase orders', 'POs generated from approved plans with send status and per-truck progress: loaded, on the road, delivered (PO-01, PO-03, PO-04).');
await P.click('table td.mono a >> nth=0'); await sleep(800);
await shot(s, 'A14-web-po-letter', 'PO letter (screen)', 'Order letter on the entity letterhead: date, export section, Re: title/ref, instruction, truck lines with brand subtotals and total, prepared/approved, signature and date stamp (§7.1, PO-02, PO-05).');
await P.emulateMedia({ media: 'print' }); await sleep(300);
await shot(s, 'A15-web-po-print', 'PO letter — print / PDF view', 'Print view hides app chrome and always prints on white paper, even from dark mode. The real build renders the same layout server-side with Typst.');
await finish(s);

// Seeded PO with mixed-load truck, 1024 tablet
s = await open({ app: 'web', user: 'u-dir', outDir: out, width: 1024, height: 768 });
await s.go('/plans/plan-2', 800);
await shot(s, 'A16-web-plan-tablet', 'Plan review on a tablet (1024 px)', 'Narrower summary column; in read-only mode route and receiving company share a column so all amounts stay visible (§12 Browsers).');
await finish(s);

// Admin: users & devices, integrations (A17–A20)
s = await open({ app: 'web', user: 'u-admin', outDir: out });
await s.go('/users', 900);
await shot(s, 'A17-web-users', 'Users & devices', 'Field-app people (loading point / driver / receiver) and office staff with roles, scope (entities, loading points, warehouses), active phones and last seen (UA-01/02, §17.7).');
await s.page.locator('tr', { hasText: 'Peter Otieno' }).first().click(); await s.page.waitForTimeout(400);
await shot(s, 'A18-web-user-edit', 'Edit user · devices', 'Roles and scopes per person, send a new PIN by SMS, sign a lost phone out remotely, deactivate (MA-08).', { fullPage: false });
await s.page.keyboard.press('Escape');
await s.page.getByRole('button', { name: 'New user' }).click(); await s.page.waitForTimeout(300);
await s.page.locator('#u-name').fill('Amina Wanjiru'); await s.page.locator('#u-phone').fill('+254722000111');
await s.page.locator('dialog[open] label.chip', { hasText: 'Receiver' }).click();
await s.page.locator('dialog[open] label.chip', { hasText: 'Driver' }).click();
await s.page.getByRole('button', { name: 'Create user' }).click(); await s.page.waitForTimeout(300);
await shot(s, 'A19-web-user-validation', 'New user · validation', 'A receiver must be tied to at least one warehouse; the rule is checked before saving and shown in the form.', { fullPage: false });
await s.page.keyboard.press('Escape');
await s.go('/integrations', 900);
await shot(s, 'A20-web-integrations', 'Integrations', 'Which providers are live vs local stand-ins (SMS/USSD, email, push, PDF, files, routing) and an SMS check-in tester. In demo mode it explains that nothing leaves the browser.');
await finish(s);

