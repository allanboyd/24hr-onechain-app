// In-browser mock backend. Mirrors the business rules the real server must enforce (§12: rules run on the server),
// so screens built against it behave the same when switched to HTTP. State persists in localStorage.
import * as seed from './seed';
import { buildHistory } from './history';
import { buildPeriodPlans } from './period';
import * as R from '../rules';
import type {
  Acknowledgement, AckLine, Checkpoint, CheckpointPass, EtaInfo, Flag, FxRate, ID, Leg, LegStatus, Loading, Notification, PeriodPlan, Plan,
  PurchaseOrder, PvThresholds, Role, Sale, Shipment, StockRow, TripCost, TripPayment, TruckIssue, User, VelocityRow, Warehouse, WaitingEntry,
} from '../types';

const KEY = 'btw-mock-v4'; // v4: editable providers / drivers (truck planner, docs/10); v3: client master data (doc 08) + shipment chains; v2: rows carry entityId
// Browser storage when present (the server imports this module only for the demo snapshot).
const ls = () => (globalThis as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } }).localStorage;
const H = 36e5;
const iso = (t: number) => new Date(t).toISOString();
let seq = Date.now() % 100000;
export const uid = (p: string) => `${p}-${(++seq).toString(36)}`;

export interface DB {
  plans: Plan[]; pos: PurchaseOrder[]; waiting: WaitingEntry[]; loadings: Loading[]; shipments: Shipment[];
  acks: Acknowledgement[]; sales: Sale[]; costs: TripCost[]; payments: TripPayment[]; notifications: Notification[];
  stockMoves: R.StockMove[];
  /** Approved monthly FX rates (units per USD); directors edit them. Optional so older saved data still loads. */
  fxRates?: FxRate[];
  /** Period plans (§8.3) and planned-vs-actual thresholds (§8.14); optional so older saved data still loads. */
  periodPlans?: PeriodPlan[]; pvThresholds?: PvThresholds;
  trucks: typeof seed.trucks; routes: typeof seed.routes;
  /** Transport master data, editable by truck planners / fleet / planners (docs/10). */
  providers: typeof seed.providers; drivers: typeof seed.drivers;
  /** Field-app logins created for new drivers with the app (mock only; the API stores them in users). */
  extraUsers?: User[];
  /** @deprecated v3 data: market trucks added on the fly (now in providers / drivers). */
  extraDrivers?: typeof seed.drivers; extraProviders?: typeof seed.providers;
  /** Doc 08 §3: warehouses / checkpoints added or edited by an admin (applied over the seed on load). */
  warehouseEdits?: Warehouse[]; checkpointEdits?: Checkpoint[];
}

const SEED_WAREHOUSES = seed.warehouses.map((w) => ({ ...w }));
const SEED_CHECKPOINTS = seed.checkpoints.map((c) => ({ ...c }));
/** Rebuild the live warehouse / checkpoint lists = seed + this demo's admin edits (the arrays are shared by reference). */
export function applyMasterEdits() {
  const put = <T extends { id: ID }>(arr: T[], base: T[], edits: T[] | undefined) => {
    arr.splice(0, arr.length, ...base.map((x) => ({ ...x })));
    for (const e of edits ?? []) { const i = arr.findIndex((x) => x.id === e.id); if (i >= 0) arr[i] = { ...e }; else arr.push({ ...e }); }
  };
  put(seed.warehouses, SEED_WAREHOUSES, db.warehouseEdits);
  put(seed.checkpoints, SEED_CHECKPOINTS, db.checkpointEdits);
}

function routeStops(routeId: ID) { return db.routes.find((r) => r.id === routeId)!.stops; }

function makePasses(routeId: ID, departedAt: number): CheckpointPass[] {
  return R.makePasses(routeStops(routeId), departedAt);
}

function initial(): DB {
  const now = Date.now();
  const trucks = [...seed.trucks, { id: 't8', providerId: 'pr-x', reg: 'RAE 551F', trailer: 'RL 0102', capacityCases: 2200, defaultDriverId: 'd5' },
    { id: 't9', providerId: 'pr-joly', reg: 'UBG 118H', trailer: 'UZ 1207', capacityCases: 2000, defaultDriverId: 'd4' },
    { id: 't10', providerId: 'pr-y', reg: 'T 733 DKL', trailer: 'T 140 ZZU', capacityCases: 1800, defaultDriverId: 'd7' }];
  const routes = [...seed.routes, {
    id: 'r-kgl-goma', code: 'GIS-GOM', name: 'Gisenyi → Goma', distanceKm: 20,
    stops: [{ checkpointId: 'cp-gisenyi-wh', plannedHours: 0, plannedDwellHours: 0 }, { checkpointId: 'cp-gisenyi', plannedHours: 0.5, plannedDwellHours: 10 }, { checkpointId: 'cp-goma', plannedHours: 11.5, plannedDwellHours: 0 }],
  }];
  const d: DB = {
    plans: structuredClone(seed.plans), pos: [], waiting: structuredClone(seed.waitingList), loadings: [], shipments: [],
    acks: [], sales: seed.seedSales(now), costs: [], payments: [], notifications: [], stockMoves: [], trucks, routes, fxRates: seed.seedFxRates(now),
    providers: structuredClone(seed.providers), drivers: structuredClone(seed.drivers),
  };
  db = d;
  const plan1 = d.plans[0];
  d.pos.push({
    id: 'po-1', ref: plan1.ref, planId: plan1.id, entityId: plan1.entityId, supplierId: plan1.supplierId, currency: 'USD',
    date: plan1.date, title: plan1.title, instruction: 'Kindly process and avail stock for loading.', version: 1,
    sentAt: '2026-09-08T10:30:00Z', approvedById: 'u-dir', approvedAt: '2026-09-08T10:02:00Z', signature: 'sig:director', approval: 'director',
  });
  createLoadingsForPO(d.pos[0]);

  // Truck 1: Nairobi → Gisenyi (via Kigali), in transit and running late after a long Malaba dwell.
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

  // Truck 3: Nairobi → Gisenyi (received into stock), then a new shipment Gisenyi → Goma (in transit).
  const l3 = d.loadings.find((l) => l.truckNo === 3)!;
  completeLoading(l3, 't5', 'd5', 1700, now - 110 * H);
  const sh3 = d.shipments.at(-1)!;
  const a = sh3.legs[0];
  a.status = 'In transit'; a.departedAt = iso(now - 108 * H);
  // the Nairobi→Goma order is split: the first shipment ends at the Gisenyi warehouse
  a.routeId = 'r-nbo-kgl'; a.toId = 'cp-gisenyi-wh';
  a.passes = makePasses(a.routeId, now - 108 * H);
  a.passes.forEach((p, i) => { const t = now - 108 * H + routeStops(a.routeId)[i].plannedHours * H * 0.97; Object.assign(p, { arrivedAt: iso(t), departedAt: iso(t + routeStops(a.routeId)[i].plannedDwellHours * H), source: 'geofence' }); });
  acknowledge(a.id, { receiverName: 'Asie Gisenyi – J. Uwase', lines: [{ productId: 'p-b500', expected: 2000, received: 1994, damaged: 6, remarks: '6 cases crushed (photo)' }], photos: [], signature: 'sig:uwase' }, now - 50 * H);
  // doc 08 §2: received into Gisenyi stock, then a NEW shipment carries the goods on to Goma
  const sh3b = sendOn(sh3.id, { routeId: 'r-kgl-goma', truckId: 't8', driverId: 'd5' }, now - 6 * H);
  const leg3b = sh3b.legs[0];
  leg3b.status = 'In transit';
  Object.assign(leg3b.passes[0], { arrivedAt: iso(now - 7 * H), departedAt: iso(now - 6 * H), source: 'office' });
  leg3b.lastPing = { lat: -1.78, lng: 29.6, at: iso(now - 0.2 * H) };
  sh3b.status = deriveShipmentStatus(sh3b);

  // NUD: Kampala → Gisenyi, past Mbarara. Kivu: Mwanza → Gisenyi, clearing at Rusumo (transport agreed in local currency).
  for (const [planId, poId, sent] of [['plan-4', 'po-2', '2026-10-01T09:20:00Z'], ['plan-5', 'po-3', null]] as const) {
    const pl = d.plans.find((x) => x.id === planId)!;
    d.pos.push({ id: poId, ref: pl.ref, planId: pl.id, entityId: pl.entityId, supplierId: pl.supplierId, currency: 'USD', date: pl.date, title: pl.title,
      instruction: 'Kindly process and avail stock for loading.', version: 1, sentAt: sent ?? undefined, approvedById: 'u-dir', approvedAt: pl.history[1].at, signature: 'sig:director', approval: 'director' });
    createLoadingsForPO(d.pos.at(-1)!);
  }
  const ldN = d.loadings.find((l) => l.poId === 'po-2')!; ldN.transportCurrency = 'UGX';
  completeLoading(ldN, 't9', 'd4', 3_150_000, now - 20 * H);
  const legN = d.shipments.at(-1)!.legs[0];
  legN.status = 'In transit'; legN.departedAt = iso(now - 18 * H); legN.passes = makePasses(legN.routeId, now - 18 * H);
  [[0, 0], [6.2, 6.6]].forEach(([a0, b0], i) => Object.assign(legN.passes[i], { arrivedAt: iso(now - 18 * H + a0 * H), departedAt: iso(now - 18 * H + b0 * H), source: i ? 'sms' : 'office' }));
  const ldK = d.loadings.find((l) => l.poId === 'po-3')!; ldK.transportCurrency = 'TZS';
  completeLoading(ldK, 't10', 'd7', 2_400_000, now - 16 * H);
  const legK = d.shipments.at(-1)!.legs[0];
  legK.status = 'At border'; legK.departedAt = iso(now - 14 * H); legK.passes = makePasses(legK.routeId, now - 14 * H);
  [[0, 0], [5.8, 6.1], [10.2, null]].forEach(([a0, b0], i) => Object.assign(legK.passes[i], { arrivedAt: iso(now - 14 * H + a0! * H), ...(b0 !== null ? { departedAt: iso(now - 14 * H + b0 * H) } : {}), source: 'geofence' }));
  legK.lastPing = { lat: -2.39, lng: 30.78, at: iso(now - 0.5 * H) };

  // Costs for truck 1 (landing cost demo)
  const c = (shipmentId: ID, kind: TripCost['kind'], amount: number, docRef?: string) => d.costs.push({ id: uid('cost'), entityId: d.shipments.find((x) => x.id === shipmentId)!.entityId, shipmentId, kind, amount, currency: 'USD', docRef, fxRate: 1, amountUsd: amount });
  c(sh1.id, 'Taxes & duties', 2100, 'RRA-2026-88120'); c(sh1.id, 'Clearing & forwarding', 450, 'CF-0912'); c(sh1.id, 'Loading & offloading', 180);
  c(sh3.id, 'Taxes & duties', 2600, 'RRA-2026-87001'); c(sh3.id, 'Clearing & forwarding', 520, 'CF-0899'); c(sh3.id, 'Storage', 90);
  const tcost = d.costs.find((x) => x.shipmentId === sh1.id && x.kind === 'Transport')!;
  d.payments.push({ id: uid('pay'), entityId: sh1.entityId, shipmentId: sh1.id, costId: tcost.id, amount: 800, at: iso(now - 48 * H), reference: 'MPESA QJ81K2', status: 'Paid', fxRate: 1, amountUsd: 800 });
  d.payments.push({ id: uid('pay'), entityId: sh1.entityId, shipmentId: sh1.id, costId: tcost.id, amount: 850, at: iso(now - 2 * H), reference: 'BANK TT-55102', status: 'Pending approval', fxRate: 1, amountUsd: 850 });

  // ~15 months of completed operations (opening stock, receipts, costs, payments) behind the live demo
  buildHistory(d, now);
  buildPeriodPlans(d, now); // one approved 3-month plan per company; the orders above are linked to it
  for (const s of d.sales) for (const l of s.lines) d.stockMoves.push({ entityId: s.entityId, warehouseId: s.warehouseId, productId: l.productId, kind: 'sold', qty: l.qty, at: s.at, ref: s.ref });

  notify('Order ready', 'NUD-PO-2026-0009 · October ’26 Order · 4,000 cases · over plan', '#/plans/plan-2', ['planner', 'director'], 'e-nud');
  notify('Order ready', `${d.plans.find((x) => x.id === 'plan-6')!.ref} · top-up · 2,000 cases`, '#/plans/plan-6', ['planner', 'director'], 'e-btw');
  notify('Truck stopped at border', 'UBA 789C at Elegu/Nimule for 20 h — clearing documents pending', `#/shipments/${d.shipments.find((x) => x.legs[0]?.truckId === 't3' && x.status !== 'Acknowledged')?.id}`, ['director', 'fleet', 'operations'], 'e-btw');
  notify('Delivery discrepancy', `${sh3.ref} leg 1: 6 cases damaged at Asie Gisenyi`, `#/shipments/${sh3.id}`, ['director', 'operations', 'accounts'], sh3.entityId);
  notify('Payment needs approval', 'USD 850 transport balance · KBV 894T', '#/finance', ['director', 'accounts'], sh1.entityId);
  notify('Truck at border', 'T 733 DKL reached Rusumo', `#/shipments/${d.shipments.find((x) => x.poId === 'po-3')?.id}`, ['fleet', 'operations'], 'e-kivu');
  return d;
}

export let db: DB;

/** Fresh demo dataset (same as a mock reset). Used by the server seed so DB and mock demos match. */
export function demoSnapshot(): DB { const d = initial(); return structuredClone(d); }

export function load() {
  try { const raw = ls()?.getItem(KEY); if (raw) { db = JSON.parse(raw); upgrade(); applyMasterEdits(); return; } } catch { /* fall through */ }
  db = initial(); applyMasterEdits(); save();
}
/** Saved demo data from before a field existed. */
function upgrade() {
  db.providers ??= [...structuredClone(seed.providers), ...(db.extraProviders ?? [])];
  db.drivers ??= [...structuredClone(seed.drivers), ...(db.extraDrivers ?? [])];
}
export function save() { try { ls()?.setItem(KEY, JSON.stringify(db)); } catch { /* quota / private mode */ } }
export function reset() { try { ls()?.removeItem(KEY); } catch { /* ignore */ } db = initial(); applyMasterEdits(); save(); }

export function notify(title: string, body: string, link: string | undefined, forRoles: Role[], entityId: ID | null = null) {
  db.notifications.unshift({ id: uid('n'), at: iso(Date.now()), title, body, link, read: false, forRoles: R.withTruckPlanner(forRoles), entityId });
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
      id: uid('ld'), entityId: po.entityId, poId: po.id, truckNo: no, truckId: '', driverId: '', loadingPointId: po.supplierId, status: 'Pending',
      lines: lines.map((l) => ({ planLineId: l.id, productId: l.productId, orderedQty: l.qty, loadedQty: l.qty })),
      agreedTransport: 0, transportCurrency: 'USD', documents: [],
    });
  }
}

export function completeLoading(ld: Loading, truckId: ID, driverId: ID, transport: number, at = Date.now()) {
  ld.truckId = truckId; ld.driverId = driverId; ld.agreedTransport = transport; ld.loadedAt = iso(at); ld.status = 'Loaded';
  const po = db.pos.find((p) => p.id === ld.poId)!;
  const plan = db.plans.find((p) => p.id === po.planId)!;
  // the first line actually loaded (a missing line is dropped from a PO revision; alternatives inherit its route)
  const pl = plan.lines.find((l) => l.id === ld.lines.find((x) => x.loadedQty > 0)?.planLineId) ?? plan.lines.find((l) => l.truckNo === ld.truckNo)!;
  const wh = seed.warehouses.find((w) => w.receivingCompanyId === pl.deliveredToId && routeStops(pl.routeId).at(-1)!.checkpointId === w.checkpointId)
    ?? seed.warehouses.find((w) => w.receivingCompanyId === pl.deliveredToId)!;
  const sh: Shipment = {
    id: uid('shp'), entityId: po.entityId, ref: `SHP-${new Date(at).getFullYear()}-${String(db.shipments.length + 41).padStart(4, '0')}`,
    poId: po.id, truckNo: ld.truckNo, receivingCompanyId: pl.deliveredToId, warehouseId: wh.id, legs: [], status: 'Loaded',
  };
  db.shipments.push(sh);
  const leg = addLeg(sh.id, pl.routeId, truckId, driverId, at + 2 * H, ld.lines.filter((l) => l.loadedQty > 0).map((l) => ({ productId: l.productId, loadedQty: l.loadedQty })));
  leg.status = 'Loaded'; sh.status = deriveShipmentStatus(sh);
  { const rate = R.fxFor(db.fxRates ?? seed.seedFxRates(at), ld.transportCurrency, at); db.costs.push({ id: uid('cost'), entityId: sh.entityId, shipmentId: sh.id, legId: leg.id, kind: 'Transport', amount: transport, currency: ld.transportCurrency, docRef: `Agreed at loading ${ld.loadedAt.slice(0, 10)}`, fxRate: rate, amountUsd: Math.round((transport / rate) * 100) / 100 }); }
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

/** Doc 08 §2: move goods on from the warehouse where `fromShipmentId` was received, as a NEW shipment. Stock leaves that
 *  warehouse now (transferOut) and posts into the next one when it is acknowledged (transferIn). */
export function sendOn(fromShipmentId: ID, input: { routeId: ID; truckId: ID; driverId: ID; lines?: Leg['lines'] }, at = Date.now()): Shipment {
  const from = db.shipments.find((s) => s.id === fromShipmentId);
  if (!from) throw new Error('Shipment not found');
  const prev = from.legs.at(-1)!;
  if (prev.status !== 'Acknowledged') throw new Error('Acknowledge the delivery before sending the goods on');
  const fromWh = seed.warehouses.find((w) => w.checkpointId === prev.toId);
  if (!fromWh) throw new Error('Goods can only be sent on from a warehouse');
  const stops = routeStops(input.routeId);
  if (!stops.length) throw new Error('Route not found');
  if (stops[0].checkpointId !== prev.toId) throw new Error('The onward route must start at the warehouse where the goods were received');
  const toWh = seed.warehouses.find((w) => w.checkpointId === stops.at(-1)!.checkpointId);
  if (!toWh) throw new Error('The onward route must end at a warehouse');
  if (toWh.active === false) throw new Error(`${toWh.name} is not active`);
  const ack = db.acks.find((a) => a.id === prev.ackId);
  const lines = (input.lines ?? ack?.lines.map((l) => ({ productId: l.productId, loadedQty: l.received - l.damaged })) ?? prev.lines).filter((l) => l.loadedQty > 0);
  if (!lines.length) throw new Error('Nothing to send on');
  const onHand = stock();
  for (const l of lines) {
    const have = onHand.find((r) => r.entityId === from.entityId && r.warehouseId === fromWh.id && r.productId === l.productId)?.closing ?? 0;
    if (!Number.isInteger(l.loadedQty) || l.loadedQty > have) throw new Error(`Only ${have} cases of ${seed.products.find((p) => p.id === l.productId)?.brand ?? l.productId} in stock at ${fromWh.name}`);
  }
  const sh: Shipment = {
    id: uid('shp'), entityId: from.entityId, ref: `SHP-${new Date(at).getFullYear()}-${String(db.shipments.length + 41).padStart(4, '0')}`,
    poId: from.poId, truckNo: from.truckNo, receivingCompanyId: toWh.receivingCompanyId, warehouseId: toWh.id, legs: [], status: 'Loaded',
    parentShipmentId: from.id, originShipmentId: from.originShipmentId ?? from.id, fromWarehouseId: fromWh.id,
  };
  db.shipments.push(sh);
  for (const l of lines) db.stockMoves.push({ entityId: sh.entityId, warehouseId: fromWh.id, productId: l.productId, kind: 'transferOut', qty: l.loadedQty, at: iso(at), ref: sh.ref });
  const leg = addLeg(sh.id, input.routeId, input.truckId, input.driverId, at, lines);
  leg.status = 'Loaded'; sh.status = deriveShipmentStatus(sh);
  notify('Goods sent on', `${sh.ref}: ${truckReg(input.truckId)} from ${fromWh.name} to ${toWh.name} (after ${from.ref})`, `#/shipments/${sh.id}`, ['operations', 'fleet', 'receiver'], sh.entityId);
  return sh;
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
  if (ev === 'dispatched') notify('Truck dispatched', `${truckReg(leg.truckId)} left ${cp.name}`, `#/shipments/${sh.id}`, ['operations', 'fleet'], sh.entityId);
  else if (ev === 'arrived') notify('Truck arrived', `${truckReg(leg.truckId)} at ${cp.name} — awaiting acknowledgement`, `#/shipments/${sh.id}`, ['receiver', 'operations', 'director'], sh.entityId);
  sh.status = deriveShipmentStatus(sh);
}

export function acknowledge(legId: ID, input: { receiverName: string; lines: AckLine[]; photos: Acknowledgement['photos']; signature?: string; postStock?: boolean }, at = Date.now()) {
  const { sh, leg } = findLeg(legId);
  const wh = seed.warehouses.find((w) => w.checkpointId === leg.toId);
  const hasDiscrepancy = input.lines.some((l) => l.received !== l.expected || l.damaged > 0);
  const ack: Acknowledgement = { id: uid('ack'), entityId: sh.entityId, legId, shipmentId: sh.id, warehouseId: wh?.id ?? sh.warehouseId, receiverName: input.receiverName, at: iso(at), lines: input.lines, signature: input.signature, photos: input.photos, hasDiscrepancy };
  db.acks.push(ack);
  leg.ackId = ack.id; leg.status = 'Acknowledged';
  const last = leg.passes.at(-1)!;
  if (!last.arrivedAt) last.arrivedAt = iso(at);
  // AK-05 + doc 08 §2: stock posts on acknowledgement at ANY warehouse. Received short of the planned destination =
  // the shipment ends here (the next move is a new shipment, see sendOn).
  if (wh && wh.id !== sh.warehouseId) { sh.plannedWarehouseId = sh.warehouseId; sh.warehouseId = wh.id; }
  if (input.postStock !== false && wh) {
    for (const l of input.lines) {
      db.stockMoves.push({ entityId: sh.entityId, warehouseId: ack.warehouseId, productId: l.productId, kind: sh.fromWarehouseId ? 'transferIn' : 'received', qty: l.received, at: ack.at, ref: sh.ref });
      if (l.damaged) db.stockMoves.push({ entityId: sh.entityId, warehouseId: ack.warehouseId, productId: l.productId, kind: 'damaged', qty: l.damaged, at: ack.at, ref: sh.ref });
    }
  }
  if (hasDiscrepancy) notify('Delivery discrepancy', `${sh.ref} leg ${leg.seq}: ${input.lines.map((l) => `${l.expected - l.received + l.damaged} cases short/damaged`).join(', ')}`, `#/shipments/${sh.id}`, ['director', 'operations', 'accounts'], sh.entityId);
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
  notify('Truck issue reported', `${truckReg(leg.truckId)}: ${issue.reason} at ${issue.place}`, `#/shipments/${sh.id}`, ['fleet', 'operations', 'director'], sh.entityId);
  sh.status = deriveShipmentStatus(sh);
}

// ---- Inventory (§7.5) & analytics (§9): see rules.ts --------------------------
const priceOf = (pid: ID) => seed.priceList.find((x) => x.productId === pid)?.price ?? 0;
export function stock(): StockRow[] { return R.computeStock(db.stockMoves, db.shipments, priceOf); }
export const thresholds = { ...R.defaultThresholds };
export function velocity(): VelocityRow[] { return R.computeVelocity(stock(), db.sales, thresholds); }
export function flags(): Flag[] { return R.flagsFrom(velocity()); }
