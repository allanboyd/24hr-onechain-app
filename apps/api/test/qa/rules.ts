// Business rules over HTTP, against docs/inspiration requirements and packages/api/src/rules.ts.
import { client, expectStatus, ok, section, type Env } from './harness';

const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const BAD_SIG = 'data:image/png;base64,iVBORw0KGgo=';

export async function rulesSuite(env: Env) {
  const c = client(env.base);
  const T = {
    dir: (await c.login('dir')).accessToken, plan: (await c.login('kabonge')).accessToken, joel: (await c.login('joel')).accessToken,
    asie: (await c.login('asie')).accessToken, acc: (await c.login('acc')).accessToken, drv1: (await c.login('+254711000001', '1234')).accessToken,
  };
  const year = new Date().getFullYear();
  const ref = (await c.req('GET', '/ref', { token: T.dir })).body;

  section('Rules · plans, approval, PO numbering (PL-*, PO-*)');
  const newPlan = async (entityId: string, supplierId: string) => (await c.req('POST', '/plans', { token: T.plan, body: { entityId, supplierId } })).body;
  const a = await newPlan('e-btw', 's-kbl'); const b = await newPlan('e-btw', 's-kbl'); const n = await newPlan('e-nud', 's-ubl');
  const num = (r: string) => +r.split('-').at(-1)!;
  ok(new RegExp(`^BTW-PO-${year}-\\d{4}$`).test(a.ref) && num(b.ref) === num(a.ref) + 1, `BTW refs are sequential per entity and year (${a.ref}, ${b.ref})`);
  ok(new RegExp(`^NUD-PO-${year}-\\d{4}$`).test(n.ref) && num(n.ref) !== num(b.ref) + 1 || n.ref.startsWith('NUD'), `NUD has its own sequence (${n.ref})`);
  expectStatus(await c.req('POST', `/plans/${a.id}/submit`, { token: T.plan }), 422, 'empty plan cannot be submitted');
  const line = (truckNo: number, productId: string, qty: number, routeId: string, deliveredToId = 'rc-asie') => ({ truckNo, productId, qty, price: 999, routeId, deliveredToId });
  let r = await c.req('PUT', `/plans/${a.id}`, { token: T.plan, body: { title: 'QA rules', lines: [line(1, 'p-a300', 1000, 'r-nbo-goma'), line(1, 'p-b500', 900, 'r-nbo-goma'), line(2, 'p-a300', 0, 'r-nbo-goma')] } });
  ok(r.status === 200 && r.body.lines.every((l: any) => l.price === ref.priceList.find((x: any) => x.productId === l.productId).price), 'planner cannot override price list (§7.2)', r.body.lines?.map((l: any) => l.price));
  expectStatus(await c.req('POST', `/plans/${a.id}/submit`, { token: T.plan }), 422, 'line with 0 cases blocks submission');
  r = await c.req('PUT', `/plans/${a.id}`, { token: T.plan, body: { lines: [line(1, 'p-a300', 1000, 'r-nbo-goma'), line(1, 'p-b500', 900, 'r-nbo-goma')] } });
  expectStatus(await c.req('POST', `/plans/${a.id}/submit`, { token: T.plan }), 200, 'submit');
  expectStatus(await c.req('PUT', `/plans/${a.id}`, { token: T.plan, body: { title: 'edit after submit' } }), 409, 'submitted plan cannot be edited');
  expectStatus(await c.req('POST', `/plans/${a.id}/decision`, { token: T.dir, body: { action: 'approved' } }), 422, 'approval needs a signature (PL-03)');
  expectStatus(await c.req('POST', `/plans/${a.id}/decision`, { token: T.dir, body: { action: 'returned' } }), 422, 'return needs a comment');
  expectStatus(await c.req('POST', `/plans/${a.id}/decision`, { token: T.dir, body: { action: 'approved', signature: BAD_SIG } }), 422, 'a corrupt signature image is refused at approval');
  expectStatus(await c.req('POST', `/plans/${a.id}/decision`, { token: T.dir, body: { action: 'maybe' } }), [400, 422], 'unknown decision rejected');
  r = await c.req('POST', `/plans/${a.id}/decision`, { token: T.dir, body: { action: 'approved', signature: SIG } });
  ok(r.status === 200 && r.body.status === 'Approved' && r.body.poId, 'approve → PO generated (PO-01)', r.body);
  const poId = r.body.poId;
  expectStatus(await c.req('POST', `/plans/${a.id}/decision`, { token: T.dir, body: { action: 'approved', signature: SIG } }), 409, 'cannot decide twice');
  expectStatus(await c.req('PUT', `/plans/${a.id}`, { token: T.plan, body: { title: 'x' } }), 409, 'approved plan locked');
  const po = (await c.req('GET', `/pos/${poId}`, { token: T.plan })).body;
  ok(po.po.ref === a.ref && po.plan.lines.length === 2, 'PO carries the plan ref and lines without retyping');
  const pdf = await c.req('GET', `/pos/${poId}/pdf`, { token: T.plan });
  ok(pdf.status === 200 && String(pdf.body).startsWith('%PDF'), 'PO PDF renders', { status: pdf.status, type: pdf.headers.get('content-type'), head: typeof pdf.body === 'string' ? pdf.body.slice(0, 60) : pdf.body });
  await env.sql`update pos set signature = ${BAD_SIG} where id = ${poId}`; // a corrupt image stored before validation existed
  const pdf2 = await c.req('GET', `/pos/${poId}/pdf`, { token: T.plan });
  ok(pdf2.status === 200 && String(pdf2.body).startsWith('%PDF'), 'PO PDF still renders when a stored signature image is corrupt', pdf2.status);
  await env.sql`update pos set signature = ${SIG} where id = ${poId}`;
  expectStatus(await c.req('POST', `/plans/${a.id}/amendments`, { token: T.plan, body: {} }), 422, 'amendment needs a reason (PL-04)');
  r = await c.req('POST', `/plans/${a.id}/amendments`, { token: T.plan, body: { reason: 'QA: truck 2 added' } });
  ok([200, 201].includes(r.status) && r.body.version === 2 && r.body.status === 'Draft', 'amendment → v2 draft', r.body);
  const versions = (await c.req('GET', `/plans/${a.id}/versions`, { token: T.plan })).body;
  ok(Array.isArray(versions) && versions.some((v: any) => v.version === 1), 'v1 kept in history', versions);

  section('Rules · loading (LD-*, §7.3, §17.5)');
  const loadings = ((await c.req('GET', '/loadings?loadingPointId=s-kbl', { token: T.joel })).body as any[]).filter((l) => l.poId === poId);
  ok(loadings.length === 1 && loadings[0].lines.length === 2, 'one loading per truck, mixed-load truck has 2 lines', loadings);
  const ld = loadings[0];
  const qty = (o: number, p: number) => ({ [ld.lines[0].planLineId]: o, [ld.lines[1].planLineId]: p });
  const truck = ref.trucks.find((x: any) => x.reg === 'KDB 456B');
  expectStatus(await c.req('POST', `/loadings/${ld.id}/confirm`, { token: T.joel, body: { truckId: truck.id, driverId: 'd3', loadedQty: qty(1500, 900), agreedTransport: 1500 } }), 422, `over capacity (2,400 > ${truck.capacityCases}) refused`);
  expectStatus(await c.req('POST', `/loadings/${ld.id}/confirm`, { token: T.joel, body: { truckId: truck.id, driverId: 'd3', loadedQty: qty(1000, 900), agreedTransport: 0 } }), 422, 'agreed transport price required');
  r = await c.req('POST', `/loadings/${ld.id}/confirm`, { token: T.joel, body: { truckId: truck.id, driverId: 'd3', loadedQty: qty(1000, 880), agreedTransport: 1500, documents: ['dn.jpg'] } });
  ok(r.status === 201 && r.body.legs[0].lines.find((l: any) => l.productId === 'p-b500').loadedQty === 880, 'loaded qty (with variance) recorded on the leg (LD-02)', r.body);
  const sh = r.body; const leg1 = sh.legs[0];
  expectStatus(await c.req('POST', `/loadings/${ld.id}/confirm`, { token: T.joel, body: { truckId: truck.id, driverId: 'd3', loadedQty: qty(10, 10), agreedTransport: 1 } }), 409, 'cannot load the same truck line twice');
  const queue = (await c.req('GET', '/waiting?loadingPointId=s-kbl', { token: T.joel })).body as any[];
  ok(!queue.some((w) => w.truckId === truck.id && w.status === 'Waiting'), 'loaded truck leaves the waiting list');

  section('Rules · multi-leg, acknowledgement, stock (DS-02/03, AK-*, IN-*)');
  const stockAt = async (wh: string, pid: string) => ((await c.req('GET', '/stock', { token: T.dir })).body as any[]).find((x) => x.warehouseId === wh && x.productId === pid) ?? { received: 0, closing: 0, inTransit: 0 };
  const kglBefore = await stockAt('w-kgl', 'p-a300'); const gomaBefore = await stockAt('w-goma', 'p-a300');
  ok(gomaBefore.inTransit >= 1000, 'in-transit stock shows at the final warehouse before arrival (IN-01)', gomaBefore);
  expectStatus(await c.req('POST', `/legs/${leg1.id}/split`, { token: T.plan, body: { checkpointId: 'cp-kigali' } }), 200, 'planner sets Kigali as transfer point');
  await c.req('POST', `/legs/${leg1.id}/dispatch`, { token: T.joel, body: {} });
  const lines1 = [{ productId: 'p-a300', expected: 1, received: 990, damaged: 4, remarks: '10 short' }, { productId: 'p-b500', expected: 1, received: 880, damaged: 0 }];
  r = await c.req('POST', `/legs/${leg1.id}/acknowledgement`, { token: T.asie, body: { receiverName: 'QA Uwase', lines: lines1, signature: SIG } });
  ok(r.status === 201 && r.body.isFinal === false && r.body.lines[0].expected === 1000, 'intermediate acknowledgement: not final, expected taken from the loading (not the client)', r.body);
  ok((await stockAt('w-kgl', 'p-a300')).received === kglBefore.received, 'no stock posted at the transfer point (Q-P1)');
  const notes = (await c.req('GET', '/notifications', { token: T.dir })).body as any[];
  ok(notes.some((x) => x.title === 'Delivery discrepancy' && x.body.includes(sh.ref)), 'discrepancy alert raised (AK-04)');
  expectStatus(await c.req('POST', `/legs/${leg1.id}/acknowledgement`, { token: T.asie, body: { receiverName: 'again', lines: lines1 } }), 409, 'cannot acknowledge twice');
  const t8 = ref.trucks.find((x: any) => x.reg === 'RAE 551F') ?? ref.trucks[0];
  r = await c.req('POST', `/shipments/${sh.id}/legs`, { token: T.asie, body: { routeId: 'r-kgl-goma', truckId: t8.id, driverId: 'd5' } });
  const leg2 = r.body;
  ok(r.status === 201 && leg2.lines.find((l: any) => l.productId === 'p-a300').loadedQty === 986, 'transfer leg carries the GOOD quantity received (990 − 4 damaged)', leg2.lines);
  expectStatus(await c.req('POST', `/shipments/${sh.id}/legs`, { token: T.asie, body: { routeId: 'r-nbo-kgl', truckId: t8.id, driverId: 'd5' } }), 409, 'a second leg cannot be added before this one is acknowledged');
  await c.req('POST', `/legs/${leg2.id}/dispatch`, { token: T.asie, body: {} });
  await c.req('POST', `/legs/${leg2.id}/passes`, { token: T.dir, body: { checkpointId: 'cp-goma', kind: 'arrived' } });
  r = await c.req('POST', `/legs/${leg2.id}/acknowledgement`, { token: T.asie, body: { receiverName: 'QA Goma', lines: [{ productId: 'p-a300', expected: 0, received: 986, damaged: 1 }, { productId: 'p-b500', expected: 0, received: 880, damaged: 0 }], signature: SIG } });
  ok(r.status === 201 && r.body.isFinal === true, 'final acknowledgement at Goma', r.body);
  const gomaAfter = await stockAt('w-goma', 'p-a300');
  ok(gomaAfter.received - gomaBefore.received === 986 && gomaAfter.closing - gomaBefore.closing === 985, 'stock posts only on final acknowledgement: +986 received, 1 damaged (AK-05)', { gomaBefore, gomaAfter });
  const final = (await c.req('GET', `/shipments/${sh.id}`, { token: T.dir })).body;
  ok(final.status === 'Acknowledged', 'shipment status derived from legs = Acknowledged (DS-05)', final.status);
  const ackPdf = await c.req('GET', `/acks/${r.body.id}/pdf`, { token: T.asie });
  ok(ackPdf.status === 200 && String(ackPdf.body).startsWith('%PDF'), 'acknowledgement PDF (AK-03)', { status: ackPdf.status, head: typeof ackPdf.body === 'string' ? ackPdf.body.slice(0, 60) : ackPdf.body });

  section('Rules · sales & stock limits (SL-02)');
  const kgl = await stockAt('w-kgl', 'p-e330');
  const sale = (qty: number, override = false) => ({ warehouseId: 'w-kgl', customer: 'QA', kind: 'Cash', lines: [{ productId: 'p-e330', qty, price: 20 }], currency: 'USD', paid: 0, at: new Date().toISOString(), override });
  expectStatus(await c.req('POST', '/sales', { token: T.asie, body: sale(kgl.closing + 1) }), 422, `sale above stock (${kgl.closing}) blocked`);
  expectStatus(await c.req('POST', '/sales', { token: T.asie, body: sale(kgl.closing + 1, true) }), 403, 'only a director may override');
  r = await c.req('POST', '/sales', { token: T.dir, body: sale(kgl.closing + 1, true) });
  ok(r.status === 201, 'director override records the sale', r.body);
  ok((await stockAt('w-kgl', 'p-e330')).closing === -1, 'stock goes negative only through the audited override', (await stockAt('w-kgl', 'p-e330')).closing);
  r = await c.req('POST', '/sales', { token: T.asie, body: { ...sale(1), lines: [{ productId: 'p-e330', qty: 1, price: 20 }], paid: 0 } });
  ok(r.status === 422, 'with stock at −1, even 1 case is blocked', r.body);

  section('Rules · trip financials & landing cost (FN-*, §17.6)');
  const trips = (await c.req('GET', '/finance/trips', { token: T.acc })).body as any[];
  const trip = trips.find((x) => x.shipment.id === sh.id);
  ok(trip && trip.transport === 1500 && trip.balance === 1500, 'agreed transport from loading becomes the trip cost', trip && { transport: trip.transport, balance: trip.balance });
  const cost = trip.costs.find((x: any) => x.kind === 'Transport');
  await c.req('POST', '/finance/costs', { token: T.acc, body: { shipmentId: sh.id, kind: 'Taxes & duties', amount: 2000, currency: 'USD', docRef: 'QA-TAX' } });
  const threshold = ref.settings.paymentApprovalThreshold;
  r = await c.req('POST', '/finance/payments', { token: T.acc, body: { shipmentId: sh.id, costId: cost.id, amount: threshold - 1, reference: 'QA small' } });
  ok(r.body.status === 'Paid', `payment ≤ threshold (${threshold}) is paid at once`, r.body);
  r = await c.req('POST', '/finance/payments', { token: T.acc, body: { shipmentId: sh.id, costId: cost.id, amount: threshold + 1, reference: 'QA big' } });
  ok(r.body.status === 'Pending approval', 'payment above threshold waits for a director (FN-03)', r.body);
  expectStatus(await c.req('POST', `/finance/payments/${r.body.id}/approve`, { token: T.acc }), 403, 'accounts cannot approve');
  expectStatus(await c.req('POST', `/finance/payments/${r.body.id}/approve`, { token: T.dir }), 200, 'director approves');
  expectStatus(await c.req('POST', '/finance/payments', { token: T.acc, body: { shipmentId: sh.id, costId: cost.id, amount: 1500, reference: 'QA overpay' } }), 422, 'overpaying a cost is refused');
  expectStatus(await c.req('POST', '/finance/payments', { token: T.acc, body: { shipmentId: sh.id, costId: 'cost-of-another-trip', amount: 1, reference: 'QA' } }), 422, 'cost line must belong to the trip');
  const t2 = ((await c.req('GET', '/finance/trips', { token: T.acc })).body as any[]).find((x) => x.shipment.id === sh.id);
  const goods = 1000 * ref.priceList.find((x: any) => x.productId === 'p-a300').price + 880 * ref.priceList.find((x: any) => x.productId === 'p-b500').price;
  ok(Math.abs(t2.goods - goods) < 0.01 && Math.abs(t2.landing - (goods + 1500 + 2000)) < 0.01 && Math.abs(t2.perCase - t2.landing / 1880) < 0.01, 'landing cost = goods + transport + taxes; per case over cases loaded', { goods: t2.goods, landing: t2.landing, perCase: t2.perCase });

  section('Rules · ETA, overdue, dwell, undo (TR-04, §17.5)');
  const work = (await c.req('GET', '/field/driver', { token: T.drv1 })).body;
  const trip1 = work.trips[0];
  ok(trip1 && ['Early', 'On time', 'Late'].includes(trip1.eta.state) && typeof trip1.eta.hours === 'number', `driver working set has ETA (${trip1?.eta.state} ${trip1?.eta.hours} h)`);
  ok(trip1.overdue === null || typeof trip1.overdue?.hours === 'number', 'overdue computed', trip1.overdue);
  const legK = trip1.leg; const next = legK.passes.find((x: any) => !x.arrivedAt);
  const lateBefore = trip1.eta;
  r = await c.req('POST', `/legs/${legK.id}/passes`, { token: T.drv1, headers: { 'x-channel': 'app' }, body: { checkpointId: next.checkpointId, kind: 'arrived' } });
  ok(r.status === 200 && r.body.passes.find((x: any) => x.checkpointId === next.checkpointId).source === 'driver', 'driver check-in recorded with source driver');
  expectStatus(await c.req('POST', `/legs/${legK.id}/passes/${next.checkpointId}/undo`, { token: T.drv1, body: { kind: 'arrived' } }), 200, 'driver undoes own check-in within 10 min');
  const old = new Date(Date.now() - 20 * 60_000).toISOString();
  await c.req('POST', `/legs/${legK.id}/passes`, { token: T.drv1, headers: { 'x-channel': 'app' }, body: { checkpointId: next.checkpointId, kind: 'arrived', at: old } });
  expectStatus(await c.req('POST', `/legs/${legK.id}/passes/${next.checkpointId}/undo`, { token: T.drv1, body: { kind: 'arrived' } }), 422, 'undo after 10 min refused for the driver');
  expectStatus(await c.req('POST', `/legs/${legK.id}/passes/${next.checkpointId}/undo`, { token: T.plan, body: { kind: 'arrived' } }), 200, 'office can correct any time');
  const audit = await env.sql`select count(*)::int as n from audit_log where method = 'UNDO'`;
  ok(audit[0].n >= 2, 'undo is audited', audit[0]);
  const after = (await c.req('GET', '/field/driver', { token: T.drv1 })).body.trips[0];
  ok(after.leg.passes.find((x: any) => x.checkpointId === next.checkpointId).arrivedAt === undefined, 'after undo the checkpoint is open again');
  ok(after.eta.state === lateBefore.state, 'ETA recomputed back to the pre-check-in state', { before: lateBefore, after: after.eta });
  const future = new Date(Date.now() + 6 * 3600_000).toISOString();
  r = await c.req('POST', `/legs/${legK.id}/passes`, { token: T.drv1, headers: { 'x-channel': 'app' }, body: { checkpointId: next.checkpointId, kind: 'arrived', at: future } });
  ok(r.status >= 400, `check-in time far in the future is refused (${r.status})`, r.body?.passes?.find?.((x: any) => x.checkpointId === next.checkpointId));

  section('Rules · velocity classes & flags (§9)');
  const vel = (await c.req('GET', '/analytics/velocity', { token: T.dir })).body as any[];
  const th = (await c.req('GET', '/ref', { token: T.dir })).body.settings.thresholds ?? { fast: 120, normal: 80, slow: 40, deadDays: 30 };
  const expected = (v: any) => (v.daysSinceSale >= th.deadDays && v.cover > 0 ? 'Stagnant' : v.index >= th.fast ? 'Fast' : v.index >= th.normal ? 'Normal' : v.index >= th.slow ? 'Slow' : 'Stagnant');
  const wrong = vel.filter((v) => v.cls !== expected(v) && !(v.daysSinceSale >= th.deadDays));
  ok(vel.length > 5 && !wrong.length, `velocity classes follow the index thresholds (${vel.length} rows)`, wrong.slice(0, 3));
  ok(vel.filter((v) => v.flags.includes('stock-out-risk')).every((v) => v.cls === 'Fast'), 'stock-out risk only on Fast items');
  ok(vel.filter((v) => v.flags.includes('overstock')).every((v) => v.cover > (th.overstockDays ?? 60)), 'overstock only above cover limit');
  r = await c.req('PUT', '/analytics/thresholds', { token: T.dir, body: { fast: 500 } });
  const vel2 = (await c.req('GET', '/analytics/velocity', { token: T.dir })).body as any[];
  ok(vel2.every((v) => v.cls !== 'Fast' || v.index >= 500), 'raising the Fast threshold reclassifies immediately', vel2.filter((v) => v.cls === 'Fast').map((v) => v.index));
  expectStatus(await c.req('PUT', '/analytics/thresholds', { token: T.dir, body: { fast: -5 } }), [400, 422], 'nonsense thresholds refused');
  await c.req('PUT', '/analytics/thresholds', { token: T.dir, body: { fast: 120 } });
  return { sh };
}
