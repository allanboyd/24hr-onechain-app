// Offline sync (MA-06): every outbox op through POST /sync/batch, idempotent replay, ordering, partial
// rejection, stale items, concurrent duplicate submits.
import { client, ok, section, type Env } from './harness';

const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const key = () => crypto.randomUUID();

export async function syncSuite(env: Env) {
  const c = client(env.base);
  const T = {
    dir: (await c.login('dir')).accessToken, plan: (await c.login('kabonge')).accessToken, joel: (await c.login('+254700000003', '1234')).accessToken,
    asie: (await c.login('+250700000007', '1234')).accessToken, drv1: (await c.login('+254711000001', '1234')).accessToken, zonas: (await c.login('+211900000008', '1234')).accessToken,
  };
  const app = { 'x-channel': 'app', 'x-app-version': '1.0.0' };
  const batch = (token: string, items: { op: string; payload: unknown; idempotencyKey?: string }[]) =>
    c.req('POST', '/sync/batch', { token, headers: app, body: items.map((x) => ({ idempotencyKey: x.idempotencyKey ?? key(), op: x.op, payload: x.payload })) });
  const ref = (await c.req('GET', '/ref', { token: T.dir })).body;
  const work = (await c.req('GET', '/field/driver', { token: T.drv1 })).body;
  const leg = work.trips[0].leg;
  const nextIdx = leg.passes.findIndex((p: any) => !p.arrivedAt);
  const cpA = leg.passes[nextIdx].checkpointId, cpB = leg.passes[nextIdx + 1].checkpointId;

  section('Sync · every outbox op applies once');
  // leg.pass (arrive + depart in order, one batch)
  const k1 = key(), k2 = key();
  let r = await batch(T.drv1, [{ idempotencyKey: k1, op: 'leg.pass', payload: { legId: leg.id, checkpointId: cpA, kind: 'arrived' } }, { idempotencyKey: k2, op: 'leg.pass', payload: { legId: leg.id, checkpointId: cpA, kind: 'departed' } }]);
  ok(r.status === 200 && r.body.every((x: any) => x.status === 'applied'), 'arrive + depart in one batch, in order', r.body);
  // replay the same keys (phone retried after a timeout)
  r = await batch(T.drv1, [{ idempotencyKey: k1, op: 'leg.pass', payload: { legId: leg.id, checkpointId: cpA, kind: 'arrived' } }, { idempotencyKey: k2, op: 'leg.pass', payload: { legId: leg.id, checkpointId: cpA, kind: 'departed' } }]);
  ok(r.body.every((x: any) => x.status === 'duplicate') && r.body[0].result?.id === leg.id, 'replay returns duplicates with the stored result, nothing re-applied', r.body.map((x: any) => x.status));
  // leg.pass.undo of a duplicate-safe op
  r = await batch(T.drv1, [{ op: 'leg.pass', payload: { legId: leg.id, checkpointId: cpB, kind: 'arrived' } }, { op: 'leg.pass.undo', payload: { legId: leg.id, checkpointId: cpB, kind: 'arrived' } }]);
  const afterUndo = (await c.req('GET', '/field/driver', { token: T.drv1 })).body.trips[0].leg;
  ok(r.body.every((x: any) => x.status === 'applied') && !afterUndo.passes.find((p: any) => p.checkpointId === cpB).arrivedAt, 'leg.pass then leg.pass.undo → checkpoint open again', r.body);
  // leg.issue + issue.fix
  r = await batch(T.drv1, [{ op: 'leg.issue', payload: { legId: leg.id, issue: { reason: 'QA sync breakdown', place: 'QA' } } }]);
  const iss = r.body[0].result.issues.find((i: any) => i.reason === 'QA sync breakdown');
  ok(r.body[0].status === 'applied' && iss, 'leg.issue applied');
  r = await batch(T.drv1, [{ op: 'issue.fix', payload: { legId: leg.id, issueId: iss.id } }]);
  ok(r.body[0].status === 'applied' && r.body[0].result.issues.find((i: any) => i.id === iss.id).fixedAt, 'issue.fix applied');
  // positions
  r = await batch(T.drv1, [{ op: 'positions', payload: { items: [{ legId: leg.id, lat: -0.9, lng: 30.9 }] } }]);
  ok(r.body[0].status === 'applied' && r.body[0].result.accepted === 1, 'positions applied', r.body[0]);
  // waiting.add + loading.confirm by the loading point (Joel at KBL)
  const freeTruck = ref.trucks.find((t: any) => t.reg === 'KCX 220D') ?? ref.trucks.find((t: any) => t.providerId === 'pr-joly');
  const queue = (await c.req('GET', '/waiting?loadingPointId=s-kbl', { token: T.joel })).body as any[];
  const qTruck = ref.trucks.find((t: any) => !queue.some((w) => w.truckId === t.id && w.status === 'Waiting') && t.reg === 'SSD 410K') ?? ref.trucks.find((t: any) => !queue.some((w) => w.truckId === t.id));
  r = await batch(T.joel, [{ op: 'waiting.add', payload: { loadingPointId: 's-kbl', truckId: qTruck.id, driverId: 'd7' } }]);
  ok(['applied', 'rejected'].includes(r.body[0].status) && (r.body[0].status === 'applied' || /already/.test(r.body[0].error?.title)), 'waiting.add applied (or truck already queued)', r.body[0]);
  const pending = ((await c.req('GET', '/loadings?loadingPointId=s-kbl', { token: T.joel })).body as any[]).find((l) => l.status === 'Pending');
  const lk = key();
  const confirm = { op: 'loading.confirm', idempotencyKey: lk, payload: { id: pending.id, input: { truckId: freeTruck.id, driverId: freeTruck.defaultDriverId ?? 'd4', loadedQty: Object.fromEntries(pending.lines.map((l: any) => [l.planLineId, l.orderedQty])), agreedTransport: 1200 } } };
  // concurrent duplicate submits: the phone sends the same queued item 5 times at once
  const many = await Promise.all(Array.from({ length: 5 }, () => batch(T.joel, [confirm])));
  const statuses = many.map((m) => m.body[0]?.status);
  const shipCount = await env.sql`select count(*)::int as n from shipments where po_id = ${pending.poId} and truck_no = ${pending.truckNo}`;
  ok(statuses.filter((s) => s === 'applied').length === 1 && shipCount[0].n === 1, `5 concurrent submits of one loading → applied once (${statuses.join(',')}), 1 shipment`, { statuses, shipments: shipCount[0].n });
  const newLeg = many.find((m) => m.body[0].status === 'applied')!.body[0].result.legs[0];
  r = await batch(T.joel, [{ op: 'leg.dispatch', payload: { legId: newLeg.id, source: 'office' } }]);
  ok(r.body[0].status === 'applied', 'leg.dispatch applied', r.body[0]);

  section('Sync · partial rejection, stale items, unknown ops');
  r = await batch(T.drv1, [
    { op: 'leg.issue', payload: { legId: leg.id, issue: { reason: 'QA ok 1', place: 'x' } } },
    { op: 'leg.issue', payload: { legId: 'leg-does-not-exist', issue: { reason: 'x', place: 'x' } } },
    { op: 'teleport', payload: {} },
    { op: 'leg.issue', payload: { legId: leg.id, issue: { reason: 'QA ok 2', place: 'x' } } },
  ]);
  ok(r.body.map((x: any) => x.status).join() === 'applied,rejected,rejected,applied', 'one bad item does not block the rest', r.body.map((x: any) => `${x.status}${x.error ? ':' + x.error.status : ''}`));
  ok(r.body[2].error?.status === 400, 'unknown op → rejected 400', r.body[2]);
  const missing = await c.req('POST', '/sync/batch', { token: T.drv1, body: [{ op: 'leg.issue', payload: {} }] });
  ok(missing.status === 200 && missing.body[0].status === 'rejected', 'item without idempotency key rejected', missing.body);
  // stale: acknowledge Asie's arrived leg on the web, then a queued pass for that leg arrives from a phone
  const kdaLegs = (await c.req('GET', '/field/receiver', { token: T.asie })).body.incoming as any[];
  const target = kdaLegs.find((x) => x.leg.driverId === 'd1') ?? kdaLegs[0];
  const lines = target.leg.lines.map((l: any) => ({ productId: l.productId, expected: l.loadedQty, received: l.loadedQty, damaged: 0 }));
  const ackKey = key();
  r = await batch(T.asie, [{ idempotencyKey: ackKey, op: 'leg.acknowledge', payload: { legId: target.leg.id, input: { receiverName: 'QA Asie', lines, signature: SIG } } }]);
  ok(r.body[0].status === 'applied', 'leg.acknowledge applied', r.body[0]);
  r = await batch(T.drv1, [{ op: 'leg.pass', payload: { legId: target.leg.id, checkpointId: target.leg.passes.at(-1).checkpointId, kind: 'arrived' } }]);
  ok(r.body[0].status === 'rejected' && r.body[0].error?.status === 409, 'stale check-in after acknowledgement → rejected 409 (the phone shows it, nothing changes)', r.body[0]);
  // a second receiver device replays an acknowledgement with a different key → second ack refused, stock posted once
  r = await batch(T.asie, [{ op: 'leg.acknowledge', payload: { legId: target.leg.id, input: { receiverName: 'QA dup', lines, signature: SIG } } }]);
  ok(r.body[0].status === 'rejected' && r.body[0].error?.status === 409, 'second acknowledgement (different key) → 409', r.body[0]);
  const moves = await env.sql`select count(*)::int as n from stock_moves where kind = 'received' and ref = ${target.shipment.ref}`;
  ok(moves[0].n === lines.length, `stock received posted exactly once per line (${moves[0].n})`, moves[0]);
  // rejected items stay rejected on replay (no double processing after the client retries)
  const badKey = key();
  await batch(T.zonas, [{ idempotencyKey: badKey, op: 'leg.acknowledge', payload: { legId: target.leg.id, input: { receiverName: 'x', lines } } }]);
  r = await batch(T.zonas, [{ idempotencyKey: badKey, op: 'leg.acknowledge', payload: { legId: target.leg.id, input: { receiverName: 'x', lines } } }]);
  ok(r.body[0].status === 'rejected' && r.body[0].error?.status === 403, 'a rejected item replays as rejected with the same status', r.body[0]);

  section('Sync · sales offline');
  const stock = ((await c.req('GET', '/stock', { token: T.zonas })).body as any[]).find((x) => x.warehouseId === 'w-juba' && x.closing > 10);
  const sk = key();
  const sale = { op: 'sale.create', idempotencyKey: sk, payload: { input: { warehouseId: 'w-juba', customer: 'QA offline', kind: 'Cash', lines: [{ productId: stock.productId, qty: 3, price: 12 }], currency: 'USD', paid: 36, at: new Date().toISOString() } } };
  const twice = await Promise.all([batch(T.zonas, [sale]), batch(T.zonas, [sale])]);
  const sales = await env.sql`select count(*)::int as n from sales where customer = 'QA offline'`;
  ok(sales[0].n === 1 && twice.map((t) => t.body[0].status).sort().join() === 'applied,duplicate', 'the same offline sale sent twice concurrently is recorded once', { sales: sales[0].n, statuses: twice.map((t) => t.body[0].status) });
  const after = ((await c.req('GET', '/stock', { token: T.zonas })).body as any[]).find((x) => x.warehouseId === 'w-juba' && x.productId === stock.productId);
  ok(after.closing === stock.closing - 3, 'stock reduced once (−3)', { before: stock.closing, after: after.closing });
  const big = await c.req('POST', '/sync/batch', { token: T.drv1, body: Array.from({ length: 201 }, () => ({ idempotencyKey: key(), op: 'positions', payload: { items: [] } })) });
  ok(big.status === 400, 'batches over 200 items are refused', big.status);
}
