// E — Loading point (giver) and receiver (LD-01..04, §17.4/17.5, AK-01..05, DS-02, MA-03, MA-06).
// One browser session so the hand-over at KBL becomes the truck the receiver signs for in Kigali.
import { open, finish, API_PATH, FIXTURES } from '../snap.mjs';
import { shot, slide, sign, wait, as } from './field-helpers.mjs';
const out = process.argv[2];
const PHOTO = FIXTURES + '/damage-photo.jpg';
const sheet = (s) => s.page.locator('.sheet.modal');

// ---- Loading point: Joel at KBL Nairobi
const s = await open({ app: 'field', user: 'u-joel', outDir: out });
await wait(s, 2000);
await shot(s, 'E01-field-loading-home', 'Loading point · next truck', 'Joel at KBL Nairobi sees ONE card: the truck at the front of the waiting queue and the order line it should take (§17.4, LD-01).');
await s.page.getByRole('button', { name: 'Load this truck' }).click(); await wait(s);
await sheet(s).getByLabel(/Agreed transport price/).fill('1650');
await s.page.setInputFiles('input[type=file]', [PHOTO]); await wait(s, 300);
await shot(s, 'E02-field-loading-handover', 'Hand-over · load the truck', 'Truck from the front of the queue ("Change" to pick another), driver, cases prefilled from the PO with big steppers, delivery-note photo, agreed transport price (§17.5, LD-01..04).');
await sheet(s).locator('input[type=number]').first().fill('2600'); await sheet(s).locator('input[type=number]').first().blur();
await slide(s, sheet(s));
await sheet(s).locator('.error-box').scrollIntoViewIfNeeded();
await shot(s, 'E03-field-loading-capacity', 'Hand-over · over capacity', 'ONE slide hands the truck over; the truck capacity check stops it with a plain message instead (§7.3 #3).');
await sheet(s).locator('input[type=number]').first().fill('1980'); await sheet(s).locator('input[type=number]').first().blur(); await wait(s, 300);
await slide(s, sheet(s)); await wait(s, 1200);
await shot(s, 'E04-field-loading-done', 'Loading point · after hand-over', 'The shipment and the driver\'s trip are created; the card moves to the next truck or says nothing is left to load. The truck now shows on the map once it leaves.', { keepToast: true });

// Tesfie handles two loading points
await as(s, 'u-tesfie');
await shot(s, 'E05-field-loading-two-points', 'Loading point · two sites', 'Tesfie covers GBI Mombasa and SBL Mwanza: a switcher at the top of the sheet, nothing else changes (§17.3).');

// Drive the new truck to the transfer point in Kigali (as the office + driver would)
await s.page.evaluate(async (API) => {
  const api = await import(API);
  const list = await api.shipments.list();
  const sh = list.find((x) => x.legs[0].routeId === 'r-nbo-goma' && !x.legs[0].passes[0].departedAt);
  const leg = sh.legs[0];
  await api.tracking.splitAt(leg.id, 'cp-kigali');
  await api.tracking.dispatch(leg.id, 'driver');
  const l2 = (await api.shipments.get(sh.id)).legs[0];
  for (const p of l2.passes.slice(1)) { await api.shipments.pass(leg.id, p.checkpointId, 'arrived', 'geofence'); if (p.checkpointId !== l2.toId) await api.shipments.pass(leg.id, p.checkpointId, 'departed', 'geofence'); }
}, API_PATH);

// ---- Receiver: Asie Kigali
await as(s, 'u-asie'); await wait(s, 1000);
await shot(s, 'E06-field-receiver-arrived', 'Receiver · truck has arrived', 'Asie sees the trucks coming to Kigali and Goma on the map; the arrived truck is the ONE card: "Receive & sign" (MA-03).');
await s.page.getByRole('button', { name: 'Receive & sign' }).click(); await wait(s);
await shot(s, 'E07-field-receive-check', 'Receive · one tap when all is fine', 'Expected cases per brand; "Everything arrived OK" skips straight to signing. Most deliveries take three taps and a signature (AK-01).');
await s.page.getByRole('button', { name: /short or damaged/ }).click(); await wait(s);
const steppers = sheet(s).locator('input[type=number]');
await steppers.nth(0).fill('1974'); await steppers.nth(0).blur();
await steppers.nth(1).fill('5'); await steppers.nth(1).blur(); await wait(s, 200);
await sheet(s).getByPlaceholder(/crates crushed/).fill('6 short, 5 cases broken in the trailer');
await s.page.setInputFiles('input[type=file]', [PHOTO]); await wait(s, 300);
await shot(s, 'E08-field-receive-adjust', 'Receive · short and damaged', 'Received and damaged per brand with big steppers (type to replace), a remark is required for any difference, damage photos (AK-02, AK-03).');
await s.page.getByRole('button', { name: 'Next' }).click(); await wait(s);
await sheet(s).getByLabel('Your name').fill('Jeanne Uwase');
await sign(s);
await sheet(s).locator('.knob').scrollIntoViewIfNeeded();
await shot(s, 'E09-field-receive-sign', 'Receive · confirm & sign', 'Summary of good cases, discrepancy note (sent to the office, AK-04), transfer point vs final destination (stock posts only at the final warehouse, AK-05), name, signature, ONE slide.');
await slide(s, sheet(s)); await wait(s, 1200);
await shot(s, 'E10-field-receive-done', 'Receiver · after signing', 'The truck leaves the list; the acknowledgement, signature and photos go to the office (queued if offline).', { keepToast: true });

// Office plans the next leg Kigali → Goma; Asie sends it on
await s.page.evaluate(async (API) => {
  const api = await import(API);
  const list = await api.shipments.list();
  const sh = list.find((x) => x.legs.length === 1 && x.legs[0].toId === 'cp-kigali' && x.legs[0].status === 'Acknowledged');
  await api.shipments.addLeg(sh.id, 'r-kgl-goma', 't8', 'd5');
}, API_PATH);
await s.page.reload(); await wait(s, 1500);
await shot(s, 'E11-field-receiver-send-on', 'Receiver · send a transfer leg on', 'At a transfer point the same person becomes the giver: the planned Kigali → Goma leg is the card (DS-02).');
await s.page.getByRole('button', { name: 'Load & hand over' }).click(); await wait(s);
await shot(s, 'E12-field-transfer-handover', 'Transfer hand-over', 'Same hand-over sheet as at the brewery: truck, driver, the good cases carried forward from the receipt, photo, one slide.');
await slide(s, sheet(s)); await wait(s, 1000);
await finish(s);

// Zonas in Juba; dark mode
let z = await open({ app: 'field', user: 'u-zonas', outDir: out });
await wait(z, 2000);
await shot(z, 'E13-field-receiver-zonas', 'Receiver · Zonas Juba', 'A truck still on the road: the card shows when it arrives and whether it is late; "It\'s here — receive now" covers a truck that never checked in.');
await finish(z);
z = await open({ app: 'field', user: 'u-asie', outDir: out, theme: 'dark' });
await wait(z, 2000);
await shot(z, 'E14-field-receiver-dark', 'Receiver · dark mode', 'Same screen in dark theme.');
await finish(z);
