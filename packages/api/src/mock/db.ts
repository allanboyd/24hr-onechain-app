// In-browser mock backend. Mirrors the business rules the real server must enforce (§12: rules run on the server),
// so screens built against it behave the same when switched to HTTP. State persists in localStorage.
import * as seed from './seed';
import * as R from '../rules';
import type {
  Acknowledgement, AckLine, CheckpointPass, EtaInfo, Flag, ID, Leg, LegStatus, Loading, Notification, Plan,
  PurchaseOrder, Role, Sale, Shipment, StockRow, TripCost, TripPayment, TruckIssue, VelocityRow, WaitingEntry,
} from '../types';

const KEY = 'btw-mock-v1';
// Browser storage when present (the server imports this module only for the demo snapshot).
const ls = () => (globalThis as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } }).localStorage;
const H = 36e5;
const iso = (t: number) => new Date(t).toISOString();
let seq = Date.now() % 100000;
export const uid = (p: string) => `${p}-${(++seq).toString(36)}`;

export interface DB {
  plans: Plan[]; pos: PurchaseOrder[]; waiting: WaitingEntry[]; loadings: Loading[]; shipments: Shipment[];
  acks: Acknowledgement[]; sales: Sale[]; costs: TripCost[]; payments: TripPayment[]; notifications: Notification[];
  stockMoves: { warehouseId: ID; productId: ID; kind: 'received' | 'damaged' | 'sold' | 'transferIn' | 'transferOut' | 'adjustment'; qty: number; at: string; ref: string }[];
  trucks: typeof seed.trucks; routes: typeof seed.routes;
  // Added on the fly (market trucks); optional so older saved demo data still loads.
  extraDrivers?: typeof seed.drivers; extraProviders?: typeof seed.providers;
}

function routeStops(routeId: ID) { return db.routes.find((r) => r.id === routeId)!.stops; }

function makePasses(routeId: ID, departedAt: number): CheckpointPass[] {
  return R.makePasses(routeStops(routeId), departedAt);
}

function initial(): DB {
  const now = Date.now();
  const trucks = [...seed.trucks, { id: 't8', providerId: 'pr-x', reg: 'RAE 551F', trailer: 'RL 0102', capacityCases: 2200, defaultDriverId: 'd5' }];
  const routes = [...seed.routes, {
    id: 'r-kgl-goma', code: 'KGL-GOM', name: 'Kigali → Goma (transfer leg)', distanceKm: 160,
    stops: [{ checkpointId: 'cp-kigali', plannedHours: 0, plannedDwellHours: 0 }, { checkpointId: 'cp-gisenyi', plannedHours: 4, plannedDwellHours: 10 }, { checkpointId: 'cp-goma', plannedHours: 15, plannedDwellHours: 0 }],
  }];
  const d: DB = {
    plans: structuredClone(seed.plans), pos: [], waiting: structuredClone(seed.waitingList), loadings: [], shipments: [],
    acks: [], sales: seed.seedSales(), costs: [], payments: [], notifications: [], stockMoves: [], trucks, routes,
  };
  db = d;
  const plan1 = d.plans[0];
  d.pos.push({
    id: 'po-1', ref: plan1.ref, planId: plan1.id, entityId: plan1.entityId, supplierId: plan1.supplierId, currency: 'USD',
    date: plan1.date, title: plan1.title, instruction: 'Kindly process and avail stock for loading.', version: 1,
    sentAt: '2026-09-08T10:30:00Z', approvedById: 'u-dir', approvedAt: '2026-09-08T10:02:00Z', signature: 'sig:director',
  });
  createLoadingsForPO(d.pos[0]);

  // Truck 1: Nairobi → Kigali, in transit and running late after a long Malaba dwell.
  const l1 = d.loadings.find((l) => l.truckNo === 1)!;
  completeLoading(l1, 't1', 'd1', 1650, now - 52 * H);
  const sh1 = d.shipments.at(-1)!;
  const leg1 = sh1.legs[0];
  leg1.status = 'In transit'; leg1.departedAt = iso(now - 50 * H);
  leg1.passes = makePasses(leg1.routeId, now - 50 * H);
  const act = [[3.1, 3.5], [8.4, 8.4], [10.6, 11.2], [13.0, 30.5], [36.0, 38.0]] as const; // left Kampala ~12 h ago; Mbarara check-in now overdue
  act.forEach(([a, b], i) => Object.assign(leg1.passes[i + 1], { arrivedAt: iso(now - 50 * H + a * H), departedAt: iso(now - 50 * H + b * H), source: i === 3 ? 'driver' : 'geofence' }));
  Object.assign(leg1.passes[0], { arrivedAt: iso(now - 52 * H), departedAt: iso(now - 50 * H), source: 'office' });
  // tap-only driver (no GPS sharing yet) → position comes from the last checkpoint

  // Truck 2: Nairobi → Juba, waiting at Elegu/Nimule border with an open issue.
  const l2 = d.loadings.find((l) => l.truckNo === 2)!;
  completeLoading(l2, 't3', 'd2', 1900, now - 70 * H);
  const leg2 = d.shipments.at(-1)!.legs[0];
  leg2.status = 'At border'; leg2.departedAt = iso(now - 68 * H);
  leg2.passes = makePasses(leg2.routeId, now - 68 * H);
  [[0, 0], [3, 3.4], [8, 8], [10, 10.5], [12.5, 25], [33, 35], [41, 41]].forEach(([a, b], i) =>
    Object.assign(leg2.passes[i], { arrivedAt: iso(now - 68 * H + a * H), departedAt: iso(now - 68 * H + b * H), source: 'geofence' }));
  const nim = leg2.passes.findIndex((p) => p.checkpointId === 'cp-nimule');
  leg2.passes[nim] = { ...leg2.passes[nim], arrivedAt: iso(now - 20 * H), source: 'sms' };
  leg2.issues.push({ id: uid('iss'), at: iso(now - 18 * H), checkpointId: 'cp-nimule', place: 'Elegu/Nimule border', reason: 'Clearing documents pending (C&F agent)', newDueDate: iso(now + 30 * H) });
  leg2.lastPing = { lat: 3.59, lng: 32.06, at: iso(now - 2 * H) };

  // Truck 3: two-leg shipment Nairobi → Kigali (acknowledged, transfer) → Goma (in transit).
  const l3 = d.loadings.find((l) => l.truckNo === 3)!;
  completeLoading(l3, 't5', 'd5', 1700, now - 110 * H);
  const sh3 = d.shipments.at(-1)!;
  const a = sh3.legs[0];
  a.status = 'In transit'; a.departedAt = iso(now - 108 * H);
  a.passes = makePasses(a.routeId, now - 108 * H);
  a.passes.forEach((p, i) => { const t = now - 108 * H + routeStops(a.routeId)[i].plannedHours * H * 0.97; Object.assign(p, { arrivedAt: iso(t), departedAt: iso(t + routeStops(a.routeId)[i].plannedDwellHours * H), source: 'geofence' }); });
  // the Nairobi→Goma route is split: leg 1 ends in Kigali
  a.routeId = 'r-nbo-kgl'; a.toId = 'cp-kigali'; a.passes = a.passes.slice(0, routeStops('r-nbo-kgl').length);
  acknowledge(a.id, { receiverName: 'Asie Kigali – J. Uwase', lines: [{ productId: 'p-b500', expected: 2000, received: 1994, damaged: 6, remarks: '6 cases crushed (photo)' }], photos: [], signature: 'sig:uwase', postStock: false }, now - 50 * H);
  const leg3b = addLeg(sh3.id, 'r-kgl-goma', 't8', 'd5', now - 6 * H);
  leg3b.status = 'In transit';
  Object.assign(leg3b.passes[0], { arrivedAt: iso(now - 7 * H), departedAt: iso(now - 6 * H), source: 'office' });
  leg3b.lastPing = { lat: -1.78, lng: 29.6, at: iso(now - 0.2 * H) };

  // Costs for truck 1 (landing cost demo)
  const c = (shipmentId: ID, kind: TripCost['kind'], amount: number, docRef?: string) => d.costs.push({ id: uid('cost'), shipmentId, kind, amount, currency: 'USD', docRef });
  c(sh1.id, 'Taxes & duties', 2100, 'RRA-2026-88120'); c(sh1.id, 'Clearing & forwarding', 450, 'CF-0912'); c(sh1.id, 'Loading & offloading', 180);
  c(sh3.id, 'Taxes & duties', 2600, 'RRA-2026-87001'); c(sh3.id, 'Clearing & forwarding', 520, 'CF-0899'); c(sh3.id, 'Storage', 90);
  const tcost = d.costs.find((x) => x.shipmentId === sh1.id && x.kind === 'Transport')!;
  d.payments.push({ id: uid('pay'), shipmentId: sh1.id, costId: tcost.id, amount: 800, at: iso(now - 48 * H), reference: 'MPESA QJ81K2', status: 'Paid' });
  d.payments.push({ id: uid('pay'), shipmentId: sh1.id, costId: tcost.id, amount: 850, at: iso(now - 2 * H), reference: 'BANK TT-55102', status: 'Pending approval' });

  // Opening stock + received from history
  for (const [wh, prods] of Object.entries(seed.opening))
    for (const [pid, q] of Object.entries(prods)) d.stockMoves.push({ warehouseId: wh, productId: pid, kind: 'adjustment', qty: q, at: iso(now - 60 * 864e5), ref: 'Opening balance' });
  for (const s of d.sales) for (const l of s.lines) d.stockMoves.push({ warehouseId: s.warehouseId, productId: l.productId, kind: 'sold', qty: l.qty, at: s.at, ref: s.ref });

  notify('Plan awaiting approval', 'NUD-PO-2026-0009 · October ’26 Order · 4,000 cases', '#/plans/plan-2', ['director']);
  notify('Truck stopped at border', 'UBA 789C at Elegu/Nimule for 20 h — clearing documents pending', `#/shipments/${d.shipments[1].id}`, ['director', 'fleet', 'operations']);
  notify('Delivery discrepancy', `${sh3.ref} leg 1: 6 cases damaged at Asie Kigali`, `#/shipments/${sh3.id}`, ['director', 'operations', 'accounts']);
  notify('Payment needs approval', 'USD 850 transport balance · KDA 123A', '#/finance', ['director', 'accounts']);
  return d;
}

export let db: DB;

/** Fresh demo dataset (same as a mock reset). Used by the server seed so DB and mock demos match. */
export function demoSnapshot(): DB { const d = initial(); return structuredClone(d); }

export function load() {
  try { const raw = ls()?.getItem(KEY); if (raw) { db = JSON.parse(raw); return; } } catch { /* fall through */ }
  db = initial(); save();
}
export function save() { try { ls()?.setItem(KEY, JSON.stringify(db)); } catch { /* quota / private mode */ } }
export function reset() { try { ls()?.removeItem(KEY); } catch { /* ignore */ } db = initial(); save(); }

export function notify(title: string, body: string, link: string | undefined, forRoles: Role[]) {
  db.notifications.unshift({ id: uid('n'), at: iso(Date.now()), title, body, link, read: false, forRoles });
}

// ---- Rules ---------------------------------------------------------------
export const amount = R.amount;

export function nextRef(entityId: ID) {
  const e = seed.entities.find((x) => x.id === entityId)!;
  return R.nextRef(db.plans.map((p) => p.ref), e.poPrefix, new Date().getFullYear());
}

export function createLoadingsForPO(po: PurchaseOrder) {
  const plan = db.plans.find((p) => p.id === po.planId)!;
  const truckNos = [...new Set(plan.lines.map((l) => l.truckNo))];
  for (const no of truckNos) {
    const lines = plan.lines.filter((l) => l.truckNo === no);
    db.loadings.push({
      id: uid('ld'), poId: po.id, truckNo: no, truckId: '', driverId: '', loadingPointId: po.supplierId, status: 'Pending',
      lines: lines.map((l) => ({ planLineId: l.id, productId: l.productId, orderedQty: l.qty, loadedQty: l.qty })),
      agreedTransport: 0, transportCurrency: 'USD', documents: [],
    });
  }
}

export function completeLoading(ld: Loading, truckId: ID, driverId: ID, transport: number, at = Date.now()) {
  ld.truckId = truckId; ld.driverId = driverId; ld.agreedTransport = transport; ld.loadedAt = iso(at); ld.status = 'Loaded';
  const po = db.pos.find((p) => p.id === ld.poId)!;
  const plan = db.plans.find((p) => p.id === po.planId)!;
  const pl = plan.lines.find((l) => l.id === ld.lines[0].planLineId)!;
  const wh = seed.warehouses.find((w) => w.receivingCompanyId === pl.deliveredToId && routeStops(pl.routeId).at(-1)!.checkpointId === w.checkpointId)
    ?? seed.warehouses.find((w) => w.receivingCompanyId === pl.deliveredToId)!;
  const sh: Shipment = {
    id: uid('shp'), ref: `SHP-${new Date(at).getFullYear()}-${String(db.shipments.length + 41).padStart(4, '0')}`,
    poId: po.id, truckNo: ld.truckNo, receivingCompanyId: pl.deliveredToId, warehouseId: wh.id, legs: [], status: 'Loaded',
  };
  db.shipments.push(sh);
  const leg = addLeg(sh.id, pl.routeId, truckId, driverId, at + 2 * H, ld.lines.map((l) => ({ productId: l.productId, loadedQty: l.loadedQty })));
  leg.status = 'Loaded'; sh.status = deriveShipmentStatus(sh);
  db.costs.push({ id: uid('cost'), shipmentId: sh.id, legId: leg.id, kind: 'Transport', amount: transport, currency: ld.transportCurrency, docRef: `Agreed at loading ${ld.loadedAt.slice(0, 10)}` });
  const w = db.waiting.find((x) => x.truckId === truckId && x.status !== 'Loaded');
  if (w) w.status = 'Loaded';
  return sh;
}

export function addLeg(shipmentId: ID, routeId: ID, truckId: ID, driverId: ID, departAt: number, lines?: Leg['lines']): Leg {
  const sh = db.shipments.find((s) => s.id === shipmentId)!;
  const prev = sh.legs.at(-1);
  const stops = routeStops(routeId);
  const prevAck = prev?.ackId ? db.acks.find((a) => a.id === prev.ackId) : undefined;
  const leg: Leg = {
    id: uid('leg'), seq: sh.legs.length + 1, routeId, fromId: stops[0].checkpointId, toId: stops.at(-1)!.checkpointId,
    truckId, driverId, status: 'Planned', plannedArrival: iso(departAt + stops.at(-1)!.plannedHours * H),
    passes: makePasses(routeId, departAt), issues: [],
    // DS-02/DS-03: next leg carries forward what was actually received (good stock) on the previous leg
    lines: lines ?? (prevAck ? prevAck.lines.map((l) => ({ productId: l.productId, loadedQty: l.received - l.damaged })) : prev!.lines),
  };
  sh.legs.push(leg);
  sh.status = deriveShipmentStatus(sh);
  return leg;
}

export function deriveShipmentStatus(sh: Shipment): LegStatus { // DS-05
  return R.deriveShipmentStatus(sh, seed.warehouses.find((w) => w.id === sh.warehouseId)?.checkpointId, routeStops);
}

// TR-04 rule-based ETA (see rules.ts).
export function etaOf(leg: Leg): EtaInfo {
  return R.etaOf(leg, routeStops(leg.routeId));
}

export function recordPass(legId: ID, checkpointId: ID, kind: 'arrived' | 'departed', source: CheckpointPass['source'], at = Date.now()) {
  const { sh, leg } = findLeg(legId);
  const cp = seed.checkpoints.find((c) => c.id === checkpointId)!;
  const ev = R.applyPass(leg, checkpointId, kind, source, cp.kind, at);
  if (ev === 'dispatched') notify('Truck dispatched', `${truckReg(leg.truckId)} left ${cp.name}`, `#/shipments/${sh.id}`, ['operations', 'fleet']);
  else if (ev === 'arrived') notify('Truck arrived', `${truckReg(leg.truckId)} at ${cp.name} — awaiting acknowledgement`, `#/shipments/${sh.id}`, ['receiver', 'operations', 'director']);
  sh.status = deriveShipmentStatus(sh);
}

export function acknowledge(legId: ID, input: { receiverName: string; lines: AckLine[]; photos: Acknowledgement['photos']; signature?: string; postStock?: boolean }, at = Date.now()) {
  const { sh, leg } = findLeg(legId);
  const wh = seed.warehouses.find((w) => w.checkpointId === leg.toId);
  const hasDiscrepancy = input.lines.some((l) => l.received !== l.expected || l.damaged > 0);
  const ack: Acknowledgement = { id: uid('ack'), legId, shipmentId: sh.id, warehouseId: wh?.id ?? sh.warehouseId, receiverName: input.receiverName, at: iso(at), lines: input.lines, signature: input.signature, photos: input.photos, hasDiscrepancy };
  db.acks.push(ack);
  leg.ackId = ack.id; leg.status = 'Acknowledged';
  const last = leg.passes.at(-1)!;
  if (!last.arrivedAt) last.arrivedAt = iso(at);
  // AK-05: stock posts only after acknowledgement, and only at the final destination (intermediate = transfer, Q-P1)
  const isFinal = wh?.id === sh.warehouseId;
  if (input.postStock !== false && isFinal) {
    for (const l of input.lines) {
      db.stockMoves.push({ warehouseId: ack.warehouseId, productId: l.productId, kind: 'received', qty: l.received, at: ack.at, ref: sh.ref });
      if (l.damaged) db.stockMoves.push({ warehouseId: ack.warehouseId, productId: l.productId, kind: 'damaged', qty: l.damaged, at: ack.at, ref: sh.ref });
    }
  }
  if (hasDiscrepancy) notify('Delivery discrepancy', `${sh.ref} leg ${leg.seq}: ${input.lines.map((l) => `${l.expected - l.received + l.damaged} cases short/damaged`).join(', ')}`, `#/shipments/${sh.id}`, ['director', 'operations', 'accounts']);
  sh.status = deriveShipmentStatus(sh);
  return ack;
}

export function findLeg(legId: ID) {
  for (const sh of db.shipments) { const leg = sh.legs.find((l) => l.id === legId); if (leg) return { sh, leg }; }
  throw new Error('Leg not found');
}
export const truckReg = (id: ID) => db.trucks.find((t) => t.id === id)?.reg ?? '—';

export function addIssue(legId: ID, issue: Omit<TruckIssue, 'id'>) {
  const { sh, leg } = findLeg(legId);
  leg.issues.push({ id: uid('iss'), ...issue });
  notify('Truck issue reported', `${truckReg(leg.truckId)}: ${issue.reason} at ${issue.place}`, `#/shipments/${sh.id}`, ['fleet', 'operations', 'director']);
  sh.status = deriveShipmentStatus(sh);
}

// ---- Inventory (§7.5) & analytics (§9): see rules.ts --------------------------
const priceOf = (pid: ID) => seed.priceList.find((x) => x.productId === pid)?.price ?? 0;
export function stock(): StockRow[] { return R.computeStock(db.stockMoves, db.shipments, priceOf); }
export const thresholds = { ...R.defaultThresholds };
export function velocity(): VelocityRow[] { return R.computeVelocity(stock(), db.sales, thresholds); }
export function flags(): Flag[] { return R.flagsFrom(velocity()); }
