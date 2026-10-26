// In-browser mock backend. Mirrors the business rules the real server must enforce (§12: rules run on the server),
// so screens built against it behave the same when switched to HTTP. State persists in localStorage.
import * as seed from './seed';
import { buildHistory } from './history';
import { buildPeriodPlans } from './period';
import * as PO from './po';
import * as R from '../rules';
import { landedCostMap } from '../landed';
import type {
  Acknowledgement, AckLine, AuditEntry, ReexportOrder, SellingPrice, WarehouseExpense, Checkpoint, CheckpointPass, Entity, PriceListItem, Product, ReceivingCompany, Supplier, EtaInfo, Flag, FxRate, ID, Leg, LegStatus, Loading, Notification, PeriodPlan, Plan,
  PoVersion, PurchaseOrder, PvThresholds, Role, Sale, Shipment, StockRow, TripCost, TripPayment, TruckIssue, User, VelocityRow, Warehouse, WaitingEntry,
} from '../types';

const KEY = 'btw-mock-v7'; // v7: POs never drafted — created / updated (revisions with version snapshots) / deleted (docs/09 §4); v6: warehouse money (expenses, selling prices, re-exports, ack reasons — docs/14); v5: client roster + access matrix, editable static data, audit log (docs/12); v4: editable providers / drivers (truck planner, docs/10); v3: client master data (doc 08) + shipment chains; v2: rows carry entityId
// Browser storage when present (the server imports this module only for the demo snapshot).
const ls = () => (globalThis as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } }).localStorage;
const H = 36e5;
const iso = (t: number) => new Date(t).toISOString();
let seq = Date.now() % 100000;
export const uid = (p: string) => `${p}-${(++seq).toString(36)}`;

export interface DB {
  plans: Plan[]; pos: PurchaseOrder[]; waiting: WaitingEntry[]; loadings: Loading[]; shipments: Shipment[];
  /** docs/09 §4: immutable snapshot of every PO version (original + each revision). Optional so older saved data still loads. */
  poVersions?: PoVersion[];
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
  /** docs/12 A-05: companies, suppliers, goods (+ prices) and receiving companies added or edited (applied over the seed). */
  entityEdits?: Entity[]; supplierEdits?: Supplier[]; productEdits?: Product[]; priceEdits?: PriceListItem[]; receivingCompanyEdits?: ReceivingCompany[];
  /** docs/12 A-07: audit log (who did what, when; before/after for record edits). Newest last. */
  audit?: AuditEntry[];
  /** docs/12 A-08: last sign-in per user id (mock). */
  lastLogin?: Record<string, string>;
  /** docs/14 (workstream B): warehouse expenses, selling prices (with history) and re-export orders. */
  expenses?: WarehouseExpense[]; sellingPrices?: SellingPrice[]; reexports?: ReexportOrder[];
  /** when this dataset was built (the money history is relative to it) */ builtAt?: number;
}

const SEED_WAREHOUSES = seed.warehouses.map((w) => ({ ...w }));
const SEED_CHECKPOINTS = seed.checkpoints.map((c) => ({ ...c }));
const SEED_ENTITIES = seed.entities.map((x) => ({ ...x }));
const SEED_SUPPLIERS = seed.suppliers.map((x) => ({ ...x }));
const SEED_PRODUCTS = seed.products.map((x) => ({ ...x }));
const SEED_PRICES = seed.priceList.map((x) => ({ ...x }));
const SEED_RCS = seed.receivingCompanies.map((x) => ({ ...x }));
/** Rebuild the live warehouse / checkpoint lists = seed + this demo's admin edits (the arrays are shared by reference). */
export function applyMasterEdits() {
  const put = <T extends { id: ID }>(arr: T[], base: T[], edits: T[] | undefined) => {
    arr.splice(0, arr.length, ...base.map((x) => ({ ...x })));
    for (const e of edits ?? []) { const i = arr.findIndex((x) => x.id === e.id); if (i >= 0) arr[i] = { ...e }; else arr.push({ ...e }); }
  };
  put(seed.warehouses, SEED_WAREHOUSES, db.warehouseEdits);
  put(seed.checkpoints, SEED_CHECKPOINTS, db.checkpointEdits);
  put(seed.entities, SEED_ENTITIES, db.entityEdits);
  put(seed.suppliers, SEED_SUPPLIERS, db.supplierEdits);
  put(seed.products, SEED_PRODUCTS, db.productEdits);
  put(seed.receivingCompanies, SEED_RCS, db.receivingCompanyEdits);
  // price list rows are keyed by product
  seed.priceList.splice(0, seed.priceList.length, ...SEED_PRICES.map((x) => ({ ...x })));
  for (const e of db.priceEdits ?? []) { const i = seed.priceList.findIndex((x) => x.productId === e.productId); if (i >= 0) seed.priceList[i] = { ...e }; else seed.priceList.push({ ...e }); }
}
/** docs/12 A-07: one audit row (mock). `path` mirrors the API route so the screen reads the same either way. */
export function audit(userId: ID | null, method: string, path: string, x: { status?: number; entityId?: ID | null; recordType?: string; recordId?: string; summary?: string; before?: unknown; after?: unknown; at?: number } = {}) {
  const log = (db.audit ??= []);
  log.push({ id: `a-${log.length + 1}`, at: iso(x.at ?? Date.now()), userId, channel: 'web', method, path, status: x.status ?? 200, entityId: x.entityId ?? null,
    feature: R.auditFeature(path), recordType: x.recordType ?? null, recordId: x.recordId ?? null, summary: x.summary ?? null, before: x.before, after: x.after });
  if (log.length > 5000) log.splice(0, log.length - 5000);
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
    id: 'r-kgl-goma', code: 'GIS-GOM', name: 'Rwanda → Congo (Gisenyi → Goma transfer)', distanceKm: 20,
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
    sentAt: '2026-09-08T10:30:00Z', approvedById: 'u-daniel', approvedAt: '2026-09-08T10:02:00Z', signature: 'sig:director', approval: 'director',
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
      instruction: 'Kindly process and avail stock for loading.', version: 1, sentAt: sent ?? undefined, approvedById: pl.history[1].byUserId, approvedAt: pl.history[1].at, signature: 'sig:director', approval: 'director' });
    createLoadingsForPO(d.pos.at(-1)!);
  }
  const ldN = d.loadings.find((l) => l.poId === 'po-2')!; ldN.transportCurrency = 'UGX';
  completeLoading(ldN, 't9', 'd4', 3_150_000, now - 20 * H);
  const legN = d.shipments.at(-1)!.legs[0];
  legN.status = 'In transit'; legN.departedAt = iso(now - 18 * H); legN.passes = makePasses(legN.routeId, now - 18 * H);
  [[0, 0], [6.2, 6.6]].forEach(([a0, b0], i) => Object.assign(legN.passes[i], { arrivedAt: iso(now - 18 * H + a0 * H), departedAt: iso(now - 18 * H + b0 * H), source: i ? 'sms' : 'office' }));
  // docs/12 A-04: loaded by the loader without a price — Testfie records the agreed transport price afterwards
  const ldK = d.loadings.find((l) => l.poId === 'po-3')!; ldK.transportCurrency = 'TZS';
  completeLoading(ldK, 't10', 'd7', null, now - 16 * H);
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
  // docs/14: the warehouse-money history (expenses, ack reasons, selling prices, counts, re-exports) is added by
  // mock/money-history.ts — lazily (mock-client ready() / the money module) so it stays out of the apps' entry chunks
  { const sh3Ack = d.acks.find((x) => x.shipmentId === sh3.id); if (sh3Ack) sh3Ack.lines[0].reason = 'Poor stacking'; }
  seedPurchaseOrders(d, now); // docs/09 §4: no drafts — issued, updated (revisions), deleted
  d.builtAt = now;

  notify('Truck stopped at border', 'UBA 789C at Elegu/Nimule for 20 h — clearing documents pending', `#/shipments/${d.shipments.find((x) => x.legs[0]?.truckId === 't3' && x.status !== 'Acknowledged')?.id}`, ['director', 'fleet', 'operations'], 'e-btw');
  notify('Delivery discrepancy', `${sh3.ref} leg 1: 6 cases damaged at Asie Gisenyi`, `#/shipments/${sh3.id}`, ['director', 'operations', 'accounts'], sh3.entityId);
  notify('Payment needs approval', 'USD 850 transport balance · KBV 894T', '#/finance', ['director', 'accounts'], sh1.entityId);
  notify('Agreed price not recorded', `T 733 DKL · ${d.shipments.find((x) => x.poId === 'po-3')?.ref} loaded without a transport price — record the agreed price`, `#/trucks`, ['truck_planner', 'director'], 'e-kivu');
  notify('Truck at border', 'T 733 DKL reached Rusumo', `#/shipments/${d.shipments.find((x) => x.poId === 'po-3')?.id}`, ['fleet', 'operations'], 'e-kivu');
  seedAudit(d, now);
  return d;
}

/**
 * docs/09 §4 demo: purchase orders are never drafted. The orders seeded as submitted / draft become POs issued on create
 * ("Approved automatically"); then a few office updates and a loading revision so the Versions panel has content:
 * - BTW-PO-2026-0002: trucks 1–3 loaded, the office adds a fifth truck → rev001 (updated).
 * - NUD-PO-2026-0009: office update → rev001 (truck 2 less, truck 3 added), then truck 1 loads short → rev002 (revised at loading).
 * - KVD-PO-2026-0011: deleted before loading (raised twice).
 */
function seedPurchaseOrders(d: DB, now: number) {
  db = d;
  const kab = seed.users.find((u) => u.id === 'u-kabonge')!;
  const ctx = (at: number, by: { id: string; name: string; roles: Role[] } = kab): PO.PoCtx => ({ d, by, config: R.defaultConfig, price: (pid) => seed.priceList.find((x) => x.productId === pid)?.price ?? 0, at: iso(at) });
  for (const id of ['plan-2', 'plan-3', 'plan-6']) {
    const pl = d.plans.find((x) => x.id === id)!;
    const at = pl.history[0]?.at ?? `${pl.date}T08:00:00Z`;
    pl.status = 'Approved';
    pl.history = [{ at, byUserId: pl.createdById, action: 'created' }, { at, byUserId: pl.createdById, action: 'issued', comment: 'Approved automatically' }];
    const po: PurchaseOrder = { id: `po-${id.slice(5) === '2' ? 4 : id.slice(5) === '3' ? 5 : 6}`, ref: pl.ref, planId: pl.id, entityId: pl.entityId, supplierId: pl.supplierId, currency: pl.currency, date: pl.date, title: pl.title,
      instruction: PO.INSTRUCTION, version: 1, approvedById: pl.createdById, approvedAt: at, approval: 'issued', status: 'Issued', ...(id === 'plan-2' ? { sentAt: iso(Date.parse(at) + H) } : {}) };
    pl.poId = po.id; d.pos.push(po); createLoadingsForPO(po);
  }
  for (const po of d.pos) { po.status ??= 'Issued'; PO.snapshotOriginal(d, po); }
  // BTW-PO-2026-0002: three trucks on the road; the office adds a fifth truck
  const po1 = d.pos.find((x) => x.id === 'po-1')!;
  const pl1 = d.plans.find((x) => x.id === po1.planId)!;
  PO.updatePo(ctx(now - 30 * H), po1.id, { title: pl1.title, lines: [...pl1.lines, { truckNo: 5, productId: 'p-b500', qty: 1500, deliveredToId: 'rc-asie', routeId: 'r-nbo-kgl' }], reason: 'Asie Gisenyi needs more Tusker Malt — fifth truck added' });
  audit('u-kabonge', 'PUT', `/pos/${po1.id}`, { at: now - 30 * H, recordType: 'po', recordId: po1.id, entityId: po1.entityId, summary: `${po1.ref} updated → ${po1.ref}-rev001: fifth truck added (Tusker Malt for Gisenyi)`, after: { truck5: 1500 } });
  // NUD-PO-2026-0009: office update (rev001), then truck 1 loads 50 cases short (rev002, revised at loading)
  const po4 = d.pos.find((x) => x.id === 'po-4')!;
  const pl4 = d.plans.find((x) => x.id === po4.planId)!;
  const lines = pl4.lines.map((l) => (l.truckNo === 2 ? { ...l, qty: 1800 } : l));
  const rev1 = PO.updatePo(ctx(now - 26 * H), po4.id, { title: pl4.title, lines: [...lines, { truckNo: 3, productId: 'p-c200', qty: 1500, deliveredToId: 'rc-asie', routeId: 'r-kla-kgl' }], reason: 'UBL can load a third truck of Bell Lager; Guinness truck 2 reduced to 1,800' });
  audit('u-kabonge', 'PUT', `/pos/${po4.id}`, { at: now - 26 * H, recordType: 'po', recordId: rev1.id, entityId: po4.entityId, summary: `${po4.ref} updated → ${rev1.ref}: third truck added, truck 2 reduced` });
  const ld = d.loadings.find((l) => l.poId === rev1.id && l.truckNo === 1)!;
  const short = ld.lines.find((l) => l.productId === 'p-c200')!;
  const loadedQty = { [short.planLineId]: short.orderedQty - 50 };
  const truck = d.trucks.find((x) => x.id === 't5')!;
  const check = R.loadingCheck(ld.lines, loadedQty, [], truck.capacityCases, R.defaultConfig.loading);
  for (const l of ld.lines) l.loadedQty = loadedQty[l.planLineId] ?? l.orderedQty;
  const moses = seed.users.find((u) => u.id === 'u-moses') ?? kab;
  PO.reviseAtLoading(ctx(now - 5 * H, moses), ld, { loadedQty }, check, truck.reg);
  // agreed in Uganda shillings: the currency must be on the loading BEFORE completeLoading writes the Transport cost line
  // (it was set afterwards, so the cost was stored as USD 3,050,000 — docs/17 F4)
  ld.transportCurrency = 'UGX';
  completeLoading(ld, 't5', 'd5', 3_050_000, now - 5 * H);
  // KVD-PO-2026-0011: raised twice — deleted before anything was loaded (kept with its ref and reason)
  PO.deletePo(ctx(now - 20 * H), 'po-5', 'Raised twice — duplicate of KVD-PO-2026-0010; the trucks are on that order');
  audit('u-kabonge', 'POST', '/pos/po-5/delete', { at: now - 20 * H, recordType: 'po', recordId: 'po-5', entityId: 'e-kivu', summary: 'KVD-PO-2026-0011 deleted: raised twice' });
}

/** A few weeks of plausible audit rows so the directors' audit screen has something to search (docs/12 A-07). */
function seedAudit(d: DB, now: number) {
  db = d;
  const r = seed.rng(1207);
  const who: [string, string, string, string][] = [
    ['u-kabonge', 'PUT', '/pos/po-1', 'po'], ['u-kabonge', 'POST', '/pos', 'po'], ['u-kabonge', 'PATCH', '/masterdata/trucks/t3', 'truck'],
    ['u-testfie', 'POST', '/waiting/wl1/move', 'waiting'], ['u-testfie', 'POST', '/finance/costs', 'cost'], ['u-testfie', 'POST', '/legs/leg/issues', 'issue'],
    ['u-joel', 'POST', '/loadings/ld/confirm', 'loading'], ['u-eric', 'POST', '/legs/leg/dispatch', 'leg'], ['u-moses', 'POST', '/loadings/ld/confirm', 'loading'],
    ['u-asie', 'POST', '/legs/leg/acknowledgement', 'ack'], ['u-yonas', 'POST', '/legs/leg/acknowledgement', 'ack'], ['u-daniel', 'POST', '/finance/payments/pay/approve', 'payment'],
    ['u-michael', 'PUT', '/settings/fx', 'fx'], ['u-drv1', 'POST', '/legs/leg/passes', 'leg'], ['u-drv2', 'POST', '/legs/leg/passes', 'leg'],
  ];
  for (let day = 27; day >= 1; day--) {
    const n = 3 + Math.floor(r() * 6);
    for (let k = 0; k < n; k++) {
      const [u, method, path, type] = who[Math.floor(r() * who.length)];
      audit(u, method, path, { at: now - day * 864e5 + (6 + r() * 10) * H, recordType: type, entityId: ['e-btw', 'e-nud', 'e-kivu'][Math.floor(r() * 3)] });
    }
  }
  audit('u-kabonge', 'PATCH', '/masterdata/products/p-a300', { at: now - 3 * 864e5, recordType: 'product', recordId: 'p-a300', summary: 'Tusker Lager Cans: pack corrected',
    before: { pack: '24 x 330ml' }, after: { pack: '24 x 330 ml cans' } });
  audit('u-daniel', 'PATCH', '/users/u-testfie', { at: now - 2 * 864e5, recordType: 'user', recordId: 'u-testfie', summary: 'Testfie: loading point GBI Mombasa',
    before: { loadingPointIds: [] }, after: { loadingPointIds: ['s-gbi'] } });
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
      agreedTransport: null, transportCurrency: 'USD', documents: [],
    });
  }
}

/** `transport` null = the loader recorded no price (docs/12 A-04): no Transport cost until the agreed price is recorded. */
export function completeLoading(ld: Loading, truckId: ID, driverId: ID, transport: number | null, at = Date.now()) {
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
  if (transport !== null) { const rate = R.fxFor(db.fxRates ?? seed.seedFxRates(at), ld.transportCurrency, at); db.costs.push({ id: uid('cost'), entityId: sh.entityId, shipmentId: sh.id, legId: leg.id, kind: 'Transport', amount: transport, currency: ld.transportCurrency, docRef: `Agreed at loading ${ld.loadedAt.slice(0, 10)}`, fxRate: rate, amountUsd: Math.round((transport / rate) * 100) / 100 }); }
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
/** docs/18: each row carries the landed cost per case behind every "stock value" (same as the server). */
export function stock(): StockRow[] {
  const landed = landedCostMap({ shipments: db.shipments, costs: db.costs, plans: db.plans, pos: db.pos, priceList: seed.priceList, products: seed.products });
  return R.computeStock(db.stockMoves, db.shipments, priceOf, Date.now(), (pid) => landed.get(pid));
}
export const thresholds = { ...R.defaultThresholds };
export function velocity(): VelocityRow[] { return R.computeVelocity(stock(), db.sales, thresholds); }
export function flags(): Flag[] { return R.flagsFrom(velocity()); }
