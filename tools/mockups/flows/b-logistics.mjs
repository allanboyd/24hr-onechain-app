import { open, shot, finish, API_PATH } from '../snap.mjs';
const out = process.argv[2];
const API = API_PATH;
const as = async (s, u) => { await s.page.evaluate((u) => localStorage.setItem('btw-user', u), u); await s.page.reload(); await s.page.waitForTimeout(600); s.user = u; };
const dlg = (s) => s.page.locator('dialog[open]');

// ---- Walkthrough: loader → office → transfer ----
const s = await open({ app: 'web', user: 'u-joel', outDir: out });
await s.go('/loading');
await shot(s, 'B01-web-loading-kbl', 'Loading & waiting list — KBL Nairobi (loader Joel)', 'Ordered truck queue for the loading point with reorder/remove, driver app status and time waited; PO truck lines waiting to be loaded and recently loaded trucks linked to their shipments. LD-01, §17.4.');
await s.page.getByRole('button', { name: 'Add truck' }).click(); await s.page.waitForTimeout(300);
await shot(s, 'B02-web-loading-add-known', 'Add truck to queue — known truck', 'Trucks already in the queue are disabled; drivers without the app are marked (they check in by SMS). §17.4.', { fullPage: false });
await dlg(s).getByRole('tab', { name: 'New market truck' }).click();
const f = dlg(s).locator('input');
await f.nth(0).fill('Company Q Transporters'); await f.nth(1).fill('1900'); await f.nth(2).fill('KCZ 991X'); await f.nth(3).fill('ZG 7712'); await f.nth(4).fill('Ali Hassan'); await f.nth(5).fill('+254722000111');
await shot(s, 'B03-web-loading-add-market', 'Add truck to queue — new market truck', 'Non-regular truck hired from the market: company, truck, trailer, driver captured on the spot and queued at the end. §17.4, Q-R3.', { fullPage: false });
await dlg(s).getByRole('button', { name: 'Add to queue' }).click(); await s.page.waitForTimeout(500);
await s.page.getByRole('button', { name: 'Record loading' }).first().click(); await s.page.waitForTimeout(300);
await dlg(s).locator('table input.num').first().fill('2300');
await dlg(s).locator('input[type=number]').last().fill('950');
await dlg(s).getByRole('button', { name: 'Confirm loading' }).click(); await s.page.waitForTimeout(500);
await shot(s, 'B04-web-loading-record-capacity-error', 'Record loading — over capacity', 'Truck defaults to the top of the queue. Loaded vs ordered variance, live capacity bar and the server capacity error shown inside the dialog. LD-01/02/04, §7.3 #3, §17.5 agreed price.', { fullPage: false });
await dlg(s).locator('table input.num').first().fill('1980');
await dlg(s).getByRole('button', { name: 'Confirm loading' }).click(); await s.page.waitForTimeout(900);
const shipUrl = await s.page.evaluate(() => location.hash);
await shot(s, 'B05-web-shipment-new-loaded-loader', 'New shipment after loading (loader view)', 'Loading creates the shipment and leg 1 with loaded quantities (−20 variance) and the agreed transport cost; loaders see status only. DS-01.');

await as(s, 'u-testfie'); // truck follow-up officer: every truck, route and company (docs/12)
await shot(s, 'B06-web-shipment-office-actions', 'Shipment — office actions (Testfie, truck follow-up)', 'Dispatch, record arrival/departure for drivers without the app, plan an unload-and-transfer point at an intermediate warehouse, and log truck issues. DS-02, §17.5.');
await s.page.getByRole('button', { name: /Unload & transfer at/ }).first().click(); await s.page.waitForTimeout(500);
await s.page.getByRole('button', { name: /Dispatch from/ }).click(); await s.page.waitForTimeout(500);
await s.page.getByRole('button', { name: /Mark arrived/ }).click(); await s.page.waitForTimeout(500);
await s.page.getByRole('button', { name: 'Log truck issue' }).click(); await s.page.waitForTimeout(300);
await dlg(s).getByRole('button', { name: 'Breakdown' }).click();
await dlg(s).locator('input[type=datetime-local]').fill('2026-10-10T14:00');
await shot(s, 'B07-web-shipment-log-issue', 'Log truck issue', 'Where it stopped, reason (quick picks), and the new due date at destination; an open issue with a due date overrides the ETA. §17.5, TR-05.', { fullPage: false });
await dlg(s).getByRole('button', { name: 'Log issue' }).click(); await s.page.waitForTimeout(600);
await shot(s, 'B08-web-shipment-issue-open', 'Shipment — dispatched, issue open', 'Leg 1 now ends at Asie Gisenyi (unload point). Checkpoint timeline shows each check-in with its source (office); the open issue is listed with “Mark fixed”.');
await s.page.getByRole('button', { name: 'Mark fixed' }).click(); await s.page.waitForTimeout(400);
// Simulate the rest of leg 1 + receiver acknowledgement at Kigali (field app) through the same API module
await s.page.evaluate(async ({ API, hash }) => {
  const api = await import(API);
  const id = hash.split('/').pop();
  const sh = await api.shipments.get(id); const leg = sh.legs[0];
  for (const p of leg.passes.slice(1)) { if (!p.arrivedAt) await api.shipments.pass(leg.id, p.checkpointId, 'arrived', 'geofence'); if (p.checkpointId !== leg.toId && !p.departedAt) await api.shipments.pass(leg.id, p.checkpointId, 'departed', 'geofence'); }
  await api.shipments.acknowledge(leg.id, { receiverName: 'Asie Gisenyi – J. Uwase', lines: [{ productId: 'p-a300', expected: 1980, received: 1972, damaged: 5, remarks: '5 cases broken, 8 short' }], signature: 'sig' });
}, { API, hash: shipUrl });
await s.page.reload(); await s.page.waitForTimeout(700);
await s.page.getByRole('button', { name: /Send on — new shipment/ }).click(); await s.page.waitForTimeout(300);
await shot(s, 'B09-web-shipment-transfer-dialog', 'Send on — new shipment', 'After the goods are received into stock at the intermediate warehouse, ops sends them on as a NEW shipment on a route starting there; it carries forward the good quantity received. Doc 08 §2.', { fullPage: false });
await dlg(s).getByRole('button', { name: 'Create shipment' }).click(); await s.page.waitForTimeout(900);
await shot(s, 'B10-web-shipment-multileg-reconciliation', 'Journey — chain of shipments', 'The new shipment Gisenyi → Juba (re-export) opens; its Journey card shows the whole chain: shipment 1 received into stock at Gisenyi with 8 short + 5 damaged, shipment 2 on a truck carrying the 1,967 good cases. Doc 08 §2, DS-01..05.');
await finish(s);

// ---- Director views ----
const d = await open({ app: 'web', user: 'u-daniel', outDir: out });
await d.go('/shipments');
await shot(d, 'B11-web-shipments-list', 'Shipments & legs', 'Quick filters with counts (on the road, delayed, at border, no check-in, delivered). Last check-in with its source and age, time at a checkpoint vs planned dwell, next checkpoint and ETA. TR-02, TR-04.');
await d.page.getByRole('tab', { name: /No check-in/ }).click(); await d.page.waitForTimeout(300);
await shot(d, 'B12-web-shipments-no-checkin', 'Shipments — “No check-in” filter', 'KBV 894T left Kampala but has not checked in at Mbarara: expected time + current delay passed by more than 3 h. Drivers without GPS are caught this way. TR-05.');
await d.page.getByRole('tab', { name: /On the road/ }).click(); await d.page.waitForTimeout(200);
await d.page.locator('tr', { hasText: 'UBA 789C' }).click(); await d.page.waitForTimeout(700);
await shot(d, 'B13-web-shipment-delayed-border', 'Shipment — delayed at border with open issue', 'UBA 789C at Elegu/Nimule for 20 h against a planned 16 h stop; clearing documents pending; ETA late 32 h because the issue’s new due date overrides the plan. §17.5, TR-04.');
await d.go('/shipments'); await d.page.locator('tr', { hasText: 'KBV 894T' }).click(); await d.page.waitForTimeout(700);
await shot(d, 'B14-web-shipment-overdue', 'Shipment — overdue check-in', 'Red banner with the driver’s phone when the next checkpoint is overdue; office can record the position after a call. TR-05.');
await d.go('/shipments'); await d.page.locator('tr', { hasText: 'RAE 551F' }).click(); await d.page.waitForTimeout(700);
await shot(d, 'B15-web-shipment-seeded-multileg', 'Seeded chain Nairobi → Gisenyi → Goma', 'Shipment 2 of 2: Gisenyi → Goma in transit; the Journey card shows shipment 1 received into stock at Gisenyi. Doc 08 §2.');
await d.go('/tracking', 2800);
await shot(d, 'B16-web-tracking-light', 'Tracking map', 'Active trucks with ETA, overdue and dwell flags; map of checkpoints by kind, dashed route lines (red when late), solid labels for GPS positions and dashed labels when the position is the last checkpoint. TR-02/03.', { fullPage: false });
await d.page.locator('aside li button', { hasText: 'UBA 789C' }).click(); await d.page.waitForTimeout(1500);
await shot(d, 'B16b-web-tracking-focus', 'Tracking map — truck focused', 'Clicking a truck zooms to it and opens a popup with route, ETA, GPS vs last-checkpoint position and a link to the shipment.', { fullPage: false });
await d.go('/notifications');
await shot(d, 'B17-web-notifications', 'Notifications', 'Approvals, delays, discrepancies, payments; unread filter; clicking marks read. NT-01.');
await finish(d);

const k = await open({ app: 'web', user: 'u-daniel', theme: 'dark', outDir: out });
await k.go('/tracking', 2800);
await shot(k, 'B18-web-tracking-dark', 'Tracking map — dark theme', 'Tiles dimmed for dark mode; markers and list use theme tokens.', { fullPage: false });
await k.go('/shipments'); await k.page.locator('tr', { hasText: 'UBA 789C' }).click(); await k.page.waitForTimeout(700);
await shot(k, 'B19-web-shipment-dark', 'Shipment detail — dark theme', 'Same screen in dark mode.');
await finish(k);

const t = await open({ app: 'web', user: 'u-testfie', width: 1024, height: 800, outDir: out });
await t.go('/loading'); await t.page.getByRole('tab', { name: /GBI/ }).click(); await t.page.waitForTimeout(300);
await shot(t, 'B20-web-loading-1024-empty', 'Loading at 1024 px — GBI Mombasa (empty states)', 'Testfie loads only at GBI Mombasa; empty queue and no pending lines explain what to do next.');
await finish(t);

const m = await open({ app: 'web', user: 'u-daniel', width: 390, height: 844, outDir: out });
await m.go('/shipments');
await shot(m, 'B21-web-shipments-390', 'Shipments on a phone browser (390 px)', 'Table becomes one card per truck with status, ETA and overdue flag.');
await m.go('/tracking', 2800);
await shot(m, 'B22-web-tracking-390', 'Tracking on a phone browser (390 px)', 'List above, map below.');
await finish(m);

// Overview tabs — B23+
const o = await open({ app: 'web', user: 'u-daniel', outDir: out });
await o.go('/shipments', 3500);
await shot(o, 'B23-web-shipments-overview', 'Shipments · overview', 'Trucks by status, on-time gauge, transit time vs plan by lane, border waits vs planned dwell, worst legs for shortages and damage; clicks open the filtered list (TR-02..04, DS-03).');
await o.go('/loading', 3500);
await shot(o, 'B24-web-loading-overview', 'Loading · overview', 'Queue and average waiting time per loading point, trucks loaded per day, ordered vs loaded by loading point (LD-02, §17.4).');
await finish(o);
