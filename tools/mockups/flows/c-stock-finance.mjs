import { open, shot, finish } from '../snap.mjs';
const out = process.argv[2];
const w = (s, ms = 500) => s.page.waitForTimeout(ms);

// Director, light
let s = await open({ app: 'web', user: 'u-dir', outDir: out });
await s.go('/inventory', 900);
await shot(s, 'C01-web-inventory', 'Inventory · warehouse × SKU', 'All §7.5 columns plus in-transit, cover, stock level (IN-05), landed cost and value; search, filters, CSV/Excel/PDF export (IN-01, NT-03).');
await s.page.locator('tbody tr.clickable').first().click(); await w(s, 700);
await shot(s, 'C02-web-inventory-ledger', 'Inventory · stock ledger dialog', 'Every movement with its source reference: opening, received from acknowledged shipments, sales, damages (IN-02).', { fullPage: false });
await s.page.keyboard.press('Escape');
await s.go('/sales', 900);
await shot(s, 'C03-web-sales', 'Sales · list and balances', '30-day KPIs, filters by warehouse, payment, type (cash/credit/batch) and customer, plus outstanding balances by customer (SL-01, SL-03).');
await s.page.getByRole('button', { name: 'New sale' }).click(); await w(s);
const qty = s.page.locator('dialog[open] tbody input[type=number]').first();
await qty.fill('99999'); await s.page.getByRole('button', { name: 'Record sale' }).click(); await w(s, 700);
await shot(s, 'C04-web-sale-stock-block', 'New sale · stock check', 'Only SKUs in stock are offered with availability shown; selling above stock is blocked, and only directors see the authorised override (SL-02).', { fullPage: false });
await s.page.keyboard.press('Escape');
await s.go('/finance', 900);
await shot(s, 'C05-web-finance', 'Trip financials', 'Agreed transport from loading, paid, balance, approval status, follow-up date and landing cost per case for each truck, plus balances by transport provider (FN-01, §17.5).');
await s.page.locator('tbody tr.clickable').first().click(); await w(s, 600);
await shot(s, 'C06-web-finance-landing-cost', 'Trip financials · landing cost per truck', 'Expanded trip: costs with document references, payments with Approve, and landing cost = goods + transport + taxes + C&F + loading + storage + other (§17.6, FN-02/03).');
await s.page.getByRole('button', { name: 'Record payment' }).first().click(); await w(s);
await s.page.locator('dialog[open] input[type=number]').first().fill('900'); await w(s, 300);
await shot(s, 'C07-web-finance-record-payment', 'Record payment dialog', 'Amounts above the director threshold warn up front and go to approval (FN-03); the receipt attaches to the shipment (FN-02).', { fullPage: false });
await s.page.keyboard.press('Escape');
await s.go('/analytics', 900);
await shot(s, 'C08-web-analytics', 'Sales velocity · heatmap, table, flags', 'Class counts, brand × warehouse heatmap, the §9.5 table, suggested transfers, director-editable thresholds and the flag list (§9.1–9.3).');
await s.page.locator('button.row-hdr').first().click(); await w(s, 600);
await shot(s, 'C09-web-analytics-drill-brand', 'Velocity · brand → warehouses drill-down', 'Where one brand moves and where it is stuck, with share of sales and a jump to the other direction, warehouse → brands (§9.4).');
await s.go('/master', 700);
await shot(s, 'C10-web-master-products', 'Master data · products', 'SKU = brand + package with the supplier price list and effective date (MD-03/04); Excel import entry point.');
await s.page.getByRole('tab', { name: 'Providers & trucks' }).click(); await w(s);
await shot(s, 'C11-web-master-providers', 'Master data · transport providers → trucks', 'Provider → truck → trailer → default driver, regular vs market (§17.4, MD-05).');
await finish(s);
s = await open({ app: 'web', user: 'u-kabonge', outDir: out });
await s.go('/master', 700);
await s.page.getByRole('tab', { name: 'Routes & checkpoints' }).click(); await w(s);
await s.page.locator('td input[type=number]').nth(7).fill('20'); await w(s, 300);
await shot(s, 'C12-web-master-routes', 'Master data · routes & checkpoints (editable timings)', 'Ordered checkpoints per lane with planned hours, border dwell and geofence radius; Kabonge/Tesfie can adjust the seed timings for review (TR-04, MD-06).');
await finish(s);

// Director, dark
s = await open({ app: 'web', user: 'u-dir', theme: 'dark', outDir: out });
await s.go('/analytics', 900);
await s.page.locator('thead button.hdr').first().click(); await w(s, 600);
await shot(s, 'C13-web-analytics-dark', 'Sales velocity · dark theme, warehouse → brands', 'Dark theme check; warehouse drill-down shows brands driving and dragging the warehouse (§9.4).');
await finish(s);

// Accounts
s = await open({ app: 'web', user: 'u-acc', outDir: out });
await s.go('/finance', 900); await finish(s);

// Receiver (scoped), phone width
s = await open({ app: 'web', user: 'u-asie', width: 390, height: 844, outDir: out });
await s.go('/inventory', 900);
await shot(s, 'C14-web-inventory-390', 'Inventory · phone width (Asie scope)', 'Asie sees only Kigali and Goma; KPIs stack and the table scrolls sideways at 390 px.');
await s.go('/sales', 600); await s.go('/analytics', 600);
await finish(s);
