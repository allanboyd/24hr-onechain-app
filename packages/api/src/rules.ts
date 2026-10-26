// Pure business rules shared by the in-browser mock, the HTTP client (for derived values such as ETA)
// and the NestJS server. No I/O, no globals: every input is a parameter, `now` included.
import type {
  Acknowledgement, AppConfig, CheckpointPass, Currency, EtaInfo, FeatureKey, Flag, FxRate, ID, JourneyStep, Leg, LegStatus, Loading, LoadingAlternative, LoadingLine, PeriodKind, PeriodPlan, Plan, PlanLine, PlanLineContext, PoLineChange, PoLineSnap, PoRevisionChange, PoStage, Product, PurchaseOrder,
  PvThresholds, Role, RouteStop, Sale, Shipment, StockRow, VelocityClass, VelocityRow, WarehouseInput,
} from './types';

export const H = 36e5;
const fmtN = (n: number) => n.toLocaleString('en-US');
export const DAY = 864e5;
const iso = (t: number) => new Date(t).toISOString();

// ---- Companies (tenants) ---------------------------------------------------------------------------
/** Roles that see every company and may open the consolidated Group view. */
export const GROUP_ROLES: Role[] = ['director', 'admin'];
/** Which companies a user may work in. Directors/admins: all three. Drivers with no company list drive for any
 *  company (their own trips scope them). Everyone else: exactly their `entityIds`. */
export function entityAccess(u: { roles: Role[]; entityIds: ID[] }, allEntityIds: ID[]) {
  const group = u.roles.some((r) => GROUP_ROLES.includes(r));
  const driverOnly = u.roles.length > 0 && u.roles.every((r) => r === 'driver');
  const allowedEntityIds = group || (driverOnly && !u.entityIds.length) ? [...allEntityIds] : u.entityIds.filter((e) => allEntityIds.includes(e));
  return { allowedEntityIds, canGroup: group };
}
/** Effective company scope of one request: the active company (must be allowed), or every allowed company
 *  when none is active (Group for directors; the union for multi-company staff). `null` = refused. */
export function resolveScope(allowed: ID[], active: ID | null | undefined): ID[] | null {
  if (!active || active === 'GROUP') return [...allowed];
  return allowed.includes(active) ? [active] : null;
}

// ---- Currency (all reporting in USD) ------------------------------------------------------------------
export const monthOf = (at: string | number) => new Date(at).toISOString().slice(0, 7);
/** Units of `currency` per 1 USD for the month of `at` (falls back to the nearest earlier approved month).
 *  'avg' = month average (P&L, costs, sales); 'closing' = month-end (stock value, balances). */
export function fxFor(rates: FxRate[], currency: Currency | string, at: string | number, basis: 'avg' | 'closing' = 'avg'): number {
  if (currency === 'USD') return 1;
  const m = monthOf(at);
  const mine = rates.filter((r) => r.currency === currency).sort((a, b) => a.month.localeCompare(b.month));
  const hit = mine.filter((r) => r.month <= m).at(-1) ?? mine[0];
  if (!hit) throw new Error(`No approved ${currency} rate — a director must add one (Settings → Exchange rates)`);
  return basis === 'avg' ? hit.avg : hit.closing;
}
export const toUsd = (amount: number, currency: Currency | string, rates: FxRate[], at: string | number, basis: 'avg' | 'closing' = 'avg') =>
  currency === 'USD' ? amount : Math.round((amount / fxFor(rates, currency, at, basis)) * 100) / 100;

/** Amount = qty × price, rounded to cents (§7.2: never typed). */
export const amount = (qty: number, price: number) => Math.round(qty * price * 100) / 100;

/** Next sequential reference for an entity prefix and year, e.g. BTW-PO-2026-0003 (PO-02). */
export function nextRef(existingRefs: string[], prefix: string, year: number) {
  // revision refs (BTW-PO-2026-0002-rev001) share the number of their original and are skipped
  const nums = existingRefs.filter((r) => r.startsWith(`${prefix}-${year}-`)).map((r) => +r.slice(prefix.length + 6)).filter((n) => Number.isInteger(n));
  return `${prefix}-${year}-${String(Math.max(0, ...nums) + 1).padStart(4, '0')}`;
}

export function makePasses(stops: RouteStop[], departAt: number): CheckpointPass[] {
  return stops.map((s) => ({ checkpointId: s.checkpointId, plannedAt: iso(departAt + s.plannedHours * H) }));
}

/** TR-04 rule-based ETA: the delay at the last passed checkpoint carries forward; an overdue next check-in
 *  adds its lateness; an open issue with a new due date wins if later. */
export function etaOf(leg: Leg, stops: RouteStop[], now = Date.now()): EtaInfo {
  const lastIdx = leg.passes.reduce((acc, p, i) => (p.arrivedAt ? i : acc), -1);
  const plannedEnd = Date.parse(leg.plannedArrival);
  if (leg.status === 'Acknowledged' || leg.status === 'Arrived') {
    const arr = Date.parse(leg.passes.at(-1)!.arrivedAt ?? leg.plannedArrival);
    const h = (arr - plannedEnd) / H;
    return { state: h > 1 ? 'Late' : h < -1 ? 'Early' : 'On time', hours: Math.abs(Math.round(h)), eta: iso(arr) };
  }
  if (lastIdx < 0) return { state: 'On time', hours: 0, eta: leg.plannedArrival, nextCheckpointId: leg.passes[0]?.checkpointId };
  const p = leg.passes[lastIdx];
  const st = stops[lastIdx] ?? { plannedDwellHours: 0 };
  const actualOut = p.departedAt ? Date.parse(p.departedAt) : Math.max(now, Date.parse(p.arrivedAt!) + st.plannedDwellHours * H);
  const plannedOut = Date.parse(p.plannedAt) + st.plannedDwellHours * H;
  let delay = actualOut - plannedOut;
  const nx = leg.passes[lastIdx + 1];
  if (p.departedAt && nx && !nx.arrivedAt) { const due = Date.parse(nx.plannedAt) + delay; if (now > due) delay += now - due; }
  const issue = leg.issues.find((i) => !i.fixedAt && i.newDueDate);
  let eta = plannedEnd + delay;
  if (issue) { eta = Math.max(eta, Date.parse(issue.newDueDate!)); delay = eta - plannedEnd; }
  const h = delay / H;
  return { state: h > 1 ? 'Late' : h < -1 ? 'Early' : 'On time', hours: Math.abs(Math.round(h)), eta: iso(eta), nextCheckpointId: leg.passes[lastIdx + 1]?.checkpointId };
}

/** DS-05: shipment status derived from its legs. `finalCheckpointId` = checkpoint of the destination warehouse. */
export function deriveShipmentStatus(sh: Shipment, finalCheckpointId: ID | undefined, stopsOf: (routeId: ID) => RouteStop[], now = Date.now()): LegStatus {
  if (!sh.legs.length) return 'Planned';
  const last = sh.legs.at(-1)!;
  if (last.status === 'Acknowledged' && last.toId === finalCheckpointId) return 'Acknowledged';
  if (sh.legs.some((l) => { if (l.status === 'Delayed') return true; if (l.status === 'Acknowledged') return false; const e = etaOf(l, stopsOf(l.routeId), now); return e.state === 'Late' && e.hours >= 6; })) return 'Delayed';
  const active = sh.legs.find((l) => l.status !== 'Acknowledged') ?? last;
  return active.status;
}

/** Leg status after a checkpoint event (mirrors recordPass). */
export function applyPass(leg: Leg, checkpointId: ID, kind: 'arrived' | 'departed', source: CheckpointPass['source'], checkpointKind: string, at: number) {
  const p = leg.passes.find((x) => x.checkpointId === checkpointId);
  if (!p) throw new Error('Checkpoint is not on this leg’s route');
  if (kind === 'arrived') { p.arrivedAt = iso(at); p.source = source; } else { p.departedAt = iso(at); if (!p.arrivedAt) { p.arrivedAt = iso(at); p.source = source; } }
  const isFirst = leg.passes[0].checkpointId === checkpointId;
  const isLast = checkpointId === leg.toId;
  let event: 'dispatched' | 'arrived' | 'border' | 'moving' = 'moving';
  if (kind === 'departed' && isFirst) { leg.departedAt = iso(at); leg.status = 'In transit'; event = 'dispatched'; }
  else if (kind === 'arrived' && isLast) { leg.status = 'Arrived'; event = 'arrived'; }
  else if (kind === 'arrived' && checkpointKind === 'border') { leg.status = 'At border'; event = 'border'; }
  else if (kind === 'departed') leg.status = 'In transit';
  return event;
}

/** Correct the latest check-in on a leg (driver mis-tap synced before the local undo window closed).
 *  Only the most recent event can be undone; the leg status is recomputed from what remains. */
export function undoPass(leg: Leg, checkpointId: ID, kind: 'arrived' | 'departed', kindOf: (checkpointId: ID) => string) {
  const i = leg.passes.findIndex((x) => x.checkpointId === checkpointId);
  const p = leg.passes[i];
  if (!p) throw new Error('Checkpoint is not on this leg’s route');
  const lastIdx = leg.passes.reduce((a, x, k) => (x.arrivedAt ? k : a), -1);
  if (leg.status === 'Acknowledged') throw new Error('The delivery is already acknowledged');
  if (kind === 'departed') {
    if (!p.departedAt) throw new Error('There is no departure to undo here');
    if (i !== lastIdx) throw new Error('Only the latest check-in can be undone');
    p.departedAt = undefined;
    if (i === 0) { leg.departedAt = undefined; leg.status = 'Loaded'; }
    else leg.status = kindOf(checkpointId) === 'border' ? 'At border' : 'In transit';
  } else {
    if (!p.arrivedAt) throw new Error('There is no arrival to undo here');
    if (p.departedAt) throw new Error('Undo the departure first');
    if (i !== lastIdx) throw new Error('Only the latest check-in can be undone');
    p.arrivedAt = undefined; p.source = undefined;
    leg.status = i === 0 ? 'Loaded' : 'In transit';
  }
}

/** Truck stopped at a checkpoint: how long, versus planned dwell. */
export function dwell(leg: Leg, stops: RouteStop[], now = Date.now()) {
  const i = leg.passes.reduce((a, p, k) => (p.arrivedAt ? k : a), -1);
  if (i < 0 || leg.passes[i].departedAt || i === leg.passes.length - 1) return null;
  const stop = stops[i] ?? { plannedDwellHours: 0 };
  const hours = (now - Date.parse(leg.passes[i].arrivedAt!)) / H;
  return { checkpointId: leg.passes[i].checkpointId, hours: Math.round(hours), plannedDwellHours: stop.plannedDwellHours, over: hours > stop.plannedDwellHours + 2 };
}

/** TR-05 "no check-in": next checkpoint expected more than `graceHours` ago with nothing recorded. */
export function overdue(leg: Leg, stops: RouteStop[], graceHours = 3, now = Date.now()) {
  if (['Acknowledged', 'Arrived', 'Cancelled', 'Planned', 'Loaded'].includes(leg.status)) return null;
  const i = leg.passes.reduce((a, p, k) => (p.arrivedAt ? k : a), -1);
  if (i < 0 || !leg.passes[i].departedAt) return null;
  const next = leg.passes[i + 1]; if (!next) return null;
  const delay = Date.parse(leg.passes[i].departedAt!) - (Date.parse(leg.passes[i].plannedAt) + (stops[i]?.plannedDwellHours ?? 0) * H);
  const expected = Date.parse(next.plannedAt) + delay;
  const late = (now - expected) / H;
  return late > graceHours ? { checkpointId: next.checkpointId, expectedAt: iso(expected), hours: Math.round(late) } : null;
}

// ---- Inventory (§7.5) ----------------------------------------------------
export type MoveKind = 'received' | 'damaged' | 'sold' | 'transferIn' | 'transferOut' | 'adjustment';
/** Stock is owned per company even inside a shared warehouse: every move carries its entity. */
export interface StockMove { entityId: ID; warehouseId: ID; productId: ID; kind: MoveKind; qty: number; at: string; ref: string; /** docs/14 B-02: why (adjustments, write-offs) */ reason?: string | null; note?: string | null; byUserId?: string | null }

/** §7.5 rows keyed by (company, warehouse, product). */
/** Doc 08 §2: the chain of shipments (origin → … → last) containing `id`, with loaded / received / damaged per shipment. */
export function journeyOf(all: Shipment[], acks: Pick<Acknowledgement, 'id' | 'at' | 'lines'>[], id: ID): JourneyStep[] {
  const byId = new Map(all.map((s) => [s.id, s]));
  const start = byId.get(id);
  if (!start) return [];
  const originId = start.originShipmentId ?? start.id;
  const chain = all.filter((s) => s.id === originId || s.originShipmentId === originId);
  const order: Shipment[] = [];
  for (let cur = byId.get(originId); cur && !order.includes(cur); cur = chain.find((s) => s.parentShipmentId === cur!.id)) order.push(cur);
  for (const s of chain) if (!order.includes(s)) order.push(s); // branches (goods split on to two places) follow in creation order
  return order.map((s) => {
    const first = s.legs[0], last = s.legs.at(-1);
    const ack = last?.ackId ? acks.find((a) => a.id === last.ackId) : undefined;
    return {
      shipmentId: s.id, ref: s.ref, status: s.status, fromWarehouseId: s.fromWarehouseId ?? null, warehouseId: s.warehouseId, parentShipmentId: s.parentShipmentId ?? null,
      loaded: first?.lines.reduce((n, l) => n + l.loadedQty, 0) ?? 0, received: ack?.lines.reduce((n, l) => n + l.received, 0) ?? 0,
      damaged: ack?.lines.reduce((n, l) => n + l.damaged, 0) ?? 0, ackedAt: ack?.at ?? null,
    };
  });
}

export function computeStock(moves: StockMove[], shipments: (Shipment & { entityId: ID })[], priceOf: (productId: ID) => number, now = Date.now()): StockRow[] {
  const rows = new Map<string, StockRow>();
  const since = now - 30 * DAY;
  const get = (e: ID, w: ID, p: ID) => {
    const k = `${e}|${w}|${p}`;
    if (!rows.has(k)) rows.set(k, { entityId: e, warehouseId: w, productId: p, opening: 0, received: 0, transfersIn: 0, transfersOut: 0, damaged: 0, adjustments: 0, sold: 0, closing: 0, inTransit: 0, landedCostPerCase: 0 });
    return rows.get(k)!;
  };
  for (const m of moves) {
    const r = get(m.entityId, m.warehouseId, m.productId);
    const sign = m.kind === 'received' || m.kind === 'transferIn' || m.kind === 'adjustment' ? 1 : -1;
    if (Date.parse(m.at) < since) { r.opening += sign * m.qty; continue; }
    if (m.kind === 'received') r.received += m.qty; else if (m.kind === 'sold') r.sold += m.qty;
    else if (m.kind === 'damaged') r.damaged += m.qty; else if (m.kind === 'transferIn') r.transfersIn += m.qty;
    else if (m.kind === 'transferOut') r.transfersOut += m.qty; else r.adjustments += m.qty;
  }
  for (const sh of shipments) {
    if (sh.status === 'Acknowledged') continue;
    const active = sh.legs.find((l) => l.status !== 'Acknowledged');
    if (!active) continue;
    for (const l of active.lines) get(sh.entityId, sh.warehouseId, l.productId).inTransit += l.loadedQty;
  }
  for (const r of rows.values()) {
    r.closing = r.opening + r.received + r.transfersIn - r.transfersOut - r.damaged + r.adjustments - r.sold;
    r.landedCostPerCase = Math.round(priceOf(r.productId) * 1.21 * 100) / 100; // placeholder until allocation rule agreed (Q-P3)
  }
  return [...rows.values()];
}

// ---- Analytics (§9) ------------------------------------------------------
export interface Thresholds { fast: number; normal: number; slow: number; overstockDays: number; stockOutDays: number; deadDays: number }
export const defaultThresholds: Thresholds = { fast: 120, normal: 80, slow: 40, overstockDays: 60, stockOutDays: 7, deadDays: 30 };

export function computeVelocity(stockRows: StockRow[], sales: Pick<Sale, 'entityId' | 'warehouseId' | 'at' | 'lines'>[], t: Thresholds, now = Date.now()): VelocityRow[] {
  const since = now - 30 * DAY;
  const sold = new Map<string, { q: number; last: number }>();
  const key = (e: ID, w: ID, p: ID) => `${e}|${w}|${p}`;
  for (const s of sales) for (const l of s.lines) {
    const k = key(s.entityId, s.warehouseId, l.productId); const at = Date.parse(s.at);
    const cur = sold.get(k) ?? { q: 0, last: 0 };
    if (at >= since) cur.q += l.qty;
    cur.last = Math.max(cur.last, at); sold.set(k, cur);
  }
  const rows = stockRows.filter((r) => r.closing > 0 || sold.has(key(r.entityId, r.warehouseId, r.productId))).map((r) => {
    const s = sold.get(key(r.entityId, r.warehouseId, r.productId)) ?? { q: 0, last: 0 };
    return { r, perDay: s.q / 30, sold30: s.q, days: s.last ? Math.floor((now - s.last) / DAY) : 99 };
  });
  const bench = new Map<ID, number>(); // average velocity of the same SKU across warehouses (Q-P7 placeholder)
  for (const pid of new Set(rows.map((x) => x.r.productId))) {
    const xs = rows.filter((x) => x.r.productId === pid); bench.set(pid, xs.reduce((a, x) => a + x.perDay, 0) / xs.length || 1);
  }
  const out: VelocityRow[] = rows.map(({ r, perDay, sold30, days }) => {
    const index = Math.round((perDay / bench.get(r.productId)!) * 100);
    const cover = perDay ? Math.round(r.closing / perDay) : 999;
    let cls: VelocityClass = index >= t.fast ? 'Fast' : index >= t.normal ? 'Normal' : index >= t.slow ? 'Slow' : 'Stagnant';
    if (days >= t.deadDays && r.closing > 0) cls = 'Stagnant';
    const flags: VelocityRow['flags'] = [];
    if (cover > t.overstockDays) flags.push('overstock');
    if (cls === 'Fast' && cover < t.stockOutDays) flags.push('stock-out-risk');
    if (days >= t.deadDays && r.closing > 0) flags.push('dead-stock');
    if (cls === 'Slow' || cls === 'Stagnant') flags.push('slow-moving');
    return { entityId: r.entityId, productId: r.productId, warehouseId: r.warehouseId, sold30, perDay: Math.round(perDay * 10) / 10, index, cover, daysSinceSale: days, cls, flags };
  });
  for (const row of out) if (row.cls === 'Slow' || row.cls === 'Stagnant')
    if (out.some((o) => o.productId === row.productId && o.entityId === row.entityId && o.cls === 'Fast')) row.flags.push('cross-compare'); // a transfer stays inside one company
  return out;
}

const FLAG_TEXT: Record<string, string> = { 'slow-moving': 'Slow moving', overstock: 'Overstock', 'stock-out-risk': 'Stock-out risk', 'dead-stock': 'Dead stock', 'cross-compare': 'Fast elsewhere — consider transfer' };
export function flagsFrom(rows: VelocityRow[], now = Date.now()): Flag[] {
  return rows.flatMap((v) => v.flags.map((f) => ({ id: `${v.entityId}-${v.warehouseId}-${v.productId}-${f}`, entityId: v.entityId, kind: f, productId: v.productId, warehouseId: v.warehouseId, text: FLAG_TEXT[f], at: iso(now) })));
}

/** Sale payment status from amount paid vs total (SL-03). */
export function saleStatus(lines: { qty: number; price: number }[], paid: number) {
  const total = lines.reduce((a, l) => a + amount(l.qty, l.price), 0);
  return paid >= total ? 'Paid' as const : paid > 0 ? 'Part-paid' as const : 'Unpaid' as const;
}

/** Checkpoint short code for SMS/USSD ("Malaba border (KE/UG)" → MALABA; warehouses use their town). */
export function checkpointCodes(name: string, kind: string): string[] {
  const words = name.replace(/\(.*?\)/g, '').split(/[\s/]+/).filter(Boolean).map((w) => w.toUpperCase());
  if (kind === 'warehouse') return [words.at(-1)!];
  if (kind === 'border') return words.filter((w) => w !== 'BORDER');
  return [words[0]];
}

// ---- Flexible warehouses & routes (doc 08 §3) -------------------------------------------------------
const COUNTRY_CODES: Record<string, string> = { rwanda: 'RW', congo: 'CD', 'dr congo': 'CD', drc: 'CD', uganda: 'UG', kenya: 'KE', 'south sudan': 'SS', tanzania: 'TZ', burundi: 'BI' };
export const countryCode = (country: string) => COUNTRY_CODES[country.trim().toLowerCase()] ?? country.trim().slice(0, 2).toUpperCase();
/** Problems with a warehouse form, empty when it can be saved. */
export function validateWarehouse(w: Partial<WarehouseInput>, receivingCompanyIds: ID[]): string[] {
  const e: string[] = [];
  for (const k of ['name', 'country', 'town'] as const) if (typeof w[k] !== 'string' || !w[k]!.trim()) e.push(`Enter the ${k === 'town' ? 'town or city' : k}`);
  if (!receivingCompanyIds.includes(w.receivingCompanyId as ID)) e.push('Pick the receiving company');
  if (!(typeof w.lat === 'number' && w.lat >= -90 && w.lat <= 90 && typeof w.lng === 'number' && w.lng >= -180 && w.lng <= 180)) e.push('Set the location (latitude and longitude)');
  if (w.radiusM !== undefined && !(Number.isInteger(w.radiusM) && w.radiusM >= 50 && w.radiusM <= 20000)) e.push('Geofence radius must be 50–20,000 m');
  return e;
}
/** Problems with a new route: at least two known checkpoints, planned hours increasing (including dwell). */
export function validateRoute(r: { name?: string; stops?: RouteStop[] }, checkpointIds: ID[]): string[] {
  const e: string[] = [];
  if (typeof r.name !== 'string' || !r.name.trim()) e.push('Enter the route name');
  const st = Array.isArray(r.stops) && r.stops.every((s) => s && typeof s === 'object') ? r.stops : [];
  if (st.length < 2) e.push('A route needs at least two checkpoints');
  if (st.some((s) => !checkpointIds.includes(s?.checkpointId))) e.push('Unknown checkpoint on the route');
  if (st.some((s, i) => !(s.plannedHours >= 0 && s.plannedDwellHours >= 0) || (i > 0 && s.plannedHours < st[i - 1].plannedHours + st[i - 1].plannedDwellHours))) e.push('Planned hours must increase along the route (including dwell)');
  if (st.length && st[0].plannedHours !== 0) e.push('The first checkpoint starts at hour 0');
  return e;
}

// ---- Role × feature matrix (roles document §7, docs/12-roles-access.md) ---------------------------------------
/** Who may open each feature. The API enforces the same keys plus the "Own" scopes in ./access.ts (pairs, loading
 *  points, warehouses, routes). Roles: director (Daniel, Michael), planner (Kabonge), truck_planner (Testfie — "Truck
 *  follow-up officer"), loader (Joel, Eric, Moses), receiver (Asie, Yonas), reexport (Asie), driver. The fleet,
 *  operations, accounts, sales and admin roles stay in code, unassigned. */
export const FEATURES: Record<FeatureKey, Role[]> = {
  'dashboard': ['director', 'admin', 'fleet', 'operations', 'accounts', 'sales'],
  'period-plans': ['director', 'admin', 'planner', 'fleet', 'operations', 'accounts'],
  'purchase-orders': ['director', 'admin', 'planner', 'truck_planner', 'loader', 'receiver', 'fleet', 'operations', 'accounts'],
  'purchase-orders.approve': ['director'],
  'planned-vs-actual': ['director', 'admin', 'planner', 'accounts'],
  // shipments & legs (Dispatch and multi-leg shipments): everyone but drivers, each within their scope
  'logistics': ['director', 'admin', 'planner', 'truck_planner', 'loader', 'receiver', 'reexport', 'fleet', 'operations', 'accounts'],
  'loading': ['director', 'admin', 'planner', 'truck_planner', 'loader', 'fleet', 'operations', 'accounts'],
  'fleet': ['director', 'admin', 'planner', 'truck_planner', 'receiver', 'fleet', 'operations'],
  'inventory': ['director', 'admin', 'receiver', 'accounts', 'sales'],
  // sales, selling prices and trip financials: directors only until someone else is named (§7)
  'sales': ['director', 'admin', 'accounts', 'sales'],
  'finance': ['director', 'admin', 'fleet', 'operations', 'accounts'],
  'finance.approve': ['director'],
  'reports': ['director', 'admin', 'fleet', 'operations', 'accounts'],
  // the Master data screen (read); edits need .static or .transport
  'master-data': ['director', 'admin', 'planner', 'truck_planner', 'loader', 'reexport', 'fleet'],
  'master-data.transport': ['director', 'admin', 'planner', 'fleet'],
  'master-data.static': ['director', 'admin', 'planner'],
  'users': ['director', 'admin'],
  'integrations': ['director', 'admin'],
  'trucks': ['director', 'admin', 'planner', 'truck_planner', 'fleet', 'operations'],
  'truck-expenses': ['director', 'admin', 'truck_planner', 'fleet', 'operations'],
  'audit': ['director', 'admin'],
  // workstream B (docs/14): directors only for money; receivers their own warehouses (no values)
  'performance': ['director', 'admin'],
  'selling-prices': ['director', 'admin'],
  'warehouse-expenses': ['director', 'admin', 'receiver'],
  'warehouse-stock': ['director', 'admin', 'receiver'],
  // re-export orders: Asie raises and loads (reexport); Yonas sees what comes to Juba; Testfie follows up (Q3, to confirm)
  're-export': ['director', 'admin', 'reexport', 'receiver', 'truck_planner'],
  'transport-fees': ['director', 'admin', 'truck_planner'],
};
export const featuresFor = (roles: Role[]): FeatureKey[] => (Object.keys(FEATURES) as FeatureKey[]).filter((k) => FEATURES[k].some((r) => roles.includes(r)));
export const hasFeature = (roles: Role[], f: FeatureKey) => FEATURES[f].some((r) => roles.includes(r));

// ---- Period plans (§8.3 PL-06..PL-12) ------------------------------------------------------------------
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
/** 'YYYY-MM' shifted by n months. */
export function shiftMonth(ym: string, n: number) { const [y, m] = ym.split('-').map(Number); const d = utc(y, m - 1 + n, 1); return d.toISOString().slice(0, 7); }
/** Months a date range touches, inclusive ('YYYY-MM'). */
export function monthsIn(from: string, to: string): string[] {
  const out: string[] = []; let m = from.slice(0, 7); const end = to.slice(0, 7);
  for (let i = 0; m <= end && i < 60; i++) { out.push(m); m = shiftMonth(m, 1); }
  return out;
}
/** Preset period containing `anchor` (YYYY-MM-DD): calendar month, quarter, half or year. 'custom' returns the anchor day. */
export function periodRange(kind: PeriodKind, anchor: string): { from: string; to: string } {
  const a = new Date(anchor.slice(0, 10) + 'T00:00:00Z'); const y = a.getUTCFullYear(); const m = a.getUTCMonth();
  const span = (m0: number, n: number) => ({ from: ymd(utc(y, m0, 1)), to: ymd(utc(y, m0 + n, 0)) });
  if (kind === 'month') return span(m, 1);
  if (kind === 'quarter') return span(Math.floor(m / 3) * 3, 3);
  if (kind === 'half') return span(m < 6 ? 0 : 6, 6);
  if (kind === 'year') return span(0, 12);
  return { from: anchor.slice(0, 10), to: anchor.slice(0, 10) };
}
/** Spread `cases` evenly over the months; the remainder goes to the first months (whole cases). */
export function evenSplit(cases: number, months: string[]): Record<string, number> {
  const n = Math.max(1, months.length); const base = Math.floor(cases / n); let rest = cases - base * n;
  return Object.fromEntries(months.map((mo) => [mo, base + (rest-- > 0 ? 1 : 0)]));
}
/** Problems that stop a period plan from being submitted (empty = OK). */
export function validatePeriodPlan(p: Pick<PeriodPlan, 'from' | 'to' | 'lines'>, products: Pick<Product, 'id' | 'supplierId'>[]): string[] {
  const errs: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.from) || !/^\d{4}-\d{2}-\d{2}$/.test(p.to)) errs.push('Give the period as dates (YYYY-MM-DD)');
  else if (p.from > p.to) errs.push('The period ends before it starts');
  if (!p.lines.length) errs.push('Add at least one line');
  const months = monthsIn(p.from, p.to);
  p.lines.forEach((l, i) => {
    const n = `Line ${i + 1}`;
    const prod = products.find((x) => x.id === l.productId);
    if (!prod) errs.push(`${n}: unknown brand/package`);
    else if (prod.supplierId !== l.supplierId) errs.push(`${n}: that brand is not supplied by the chosen supplier`);
    if (!(l.cases > 0) || !Number.isInteger(l.cases)) errs.push(`${n}: planned cases must be a whole number above zero`);
    if (!(l.price >= 0)) errs.push(`${n}: price must be zero or more`);
    if (!l.destinationId) errs.push(`${n}: choose a destination`);
    if (l.months) {
      const keys = Object.keys(l.months);
      if (keys.some((k) => !months.includes(k))) errs.push(`${n}: monthly split has a month outside the period`);
      const sum = keys.reduce((a, k) => a + (Number(l.months![k]) || 0), 0);
      if (keys.some((k) => !(Number(l.months![k]) >= 0))) errs.push(`${n}: monthly quantities cannot be negative`);
      else if (sum !== l.cases) errs.push(`${n}: monthly split adds up to ${sum}, not ${l.cases}`);
    }
  });
  return errs;
}
/** Who saves period plans (they are suggestions: no approval) and who raises / issues purchase orders. */
export const PERIOD_PLAN_EDITORS: Role[] = ['planner', 'director', 'admin']; // + pairs (access.periodLineVisible)
export const PO_EDITORS: Role[] = ['planner', 'director', 'admin'];
/** Plans never overlap: the Active plans of the same company whose [from, to] overlaps this one (itself excluded). */
export function overlapsOf(plan: Pick<PeriodPlan, 'id' | 'entityId' | 'from' | 'to'>, all: PeriodPlan[]): PeriodPlan[] {
  return all.filter((o) => o.id !== plan.id && o.entityId === plan.entityId && o.status === 'Active' && o.from <= plan.to && plan.from <= o.to);
}
/** "BTW-PP-2026-0001 already covers 2026-08-01 – 2026-10-31" — the 409 text when a new/changed plan overlaps. */
export const overlapMessage = (conflicts: Pick<PeriodPlan, 'ref' | 'from' | 'to'>[]) =>
  `${conflicts.map((c) => `${c.ref} already covers ${c.from} – ${c.to}`).join('; ')}. Replace it?`;
/** PL-11: start a new draft from an earlier plan; monthly splits move with the period. */
export function copyPeriodPlan(src: PeriodPlan, to: { from: string; to: string; title?: string }, ids: { id: string; ref: string; lineId: () => string }, byUserId: ID): PeriodPlan {
  const shift = (Number(to.from.slice(0, 4)) - Number(src.from.slice(0, 4))) * 12 + (Number(to.from.slice(5, 7)) - Number(src.from.slice(5, 7)));
  const months = monthsIn(to.from, to.to);
  return {
    id: ids.id, ref: ids.ref, entityId: src.entityId, title: to.title ?? `${src.title} (copy)`, periodKind: src.periodKind, from: to.from, to: to.to,
    status: 'Active', version: 1, history: [{ at: new Date().toISOString(), byUserId, action: 'created', comment: `copied from ${src.ref}` }], createdById: byUserId, copiedFromId: src.id,
    lines: src.lines.map((l) => {
      let split: Record<string, number> | undefined = l.months ? Object.fromEntries(Object.entries(l.months).map(([k, v]) => [shiftMonth(k, shift), v] as [string, number]).filter(([k]) => months.includes(k))) : undefined;
      if (split && Object.values(split).reduce((a, v) => a + v, 0) !== l.cases) split = evenSplit(l.cases, months);
      return { ...l, id: ids.lineId(), months: split };
    }),
  };
}

// ---- Purchase orders against the plan (§8.4 PO-06..PO-08) ---------------------------------------------
/** Orders that count as "already ordered" against a plan: submitted or issued/approved, and not superseded by a
 *  later revision (the latest revision stands for the whole order, so nothing is counted twice). */
export const ORDER_COUNTS = (o: Plan['status'] | Pick<Plan, 'status' | 'supersededById'>) => {
  const x = typeof o === 'string' ? { status: o } as Pick<Plan, 'status' | 'supersededById'> : o; // a bare status: superseded copies can't be told apart
  return (x.status === 'Submitted' || x.status === 'Approved') && !x.supersededById;
};
/** Active period plans of the order's company whose period covers the order date (informational only — plans gate nothing). */
export const coveringPlans = (order: Pick<Plan, 'entityId' | 'date'>, plans: PeriodPlan[]) =>
  plans.filter((p) => p.status === 'Active' && p.entityId === order.entityId && p.from <= order.date.slice(0, 10) && order.date.slice(0, 10) <= p.to);
/**
 * PO-06/07: each order line against the plan. A line links to the period-plan line of the same supplier and SKU in an
 * approved plan covering the order date (its stored link wins; a matching destination is preferred). Remaining =
 * planned − ordered on other submitted/approved orders − this order so far. No plan line → 'unplanned'; below zero → 'over'.
 * `destOf` maps an order line to its destination warehouse (from the route), when known.
 */
export function planContext(order: Plan, periodPlans: PeriodPlan[], orders: Plan[], destOf: (l: Plan['lines'][number]) => ID | undefined = () => undefined): PlanLineContext[] {
  const cover = coveringPlans(order, periodPlans);
  const cands = cover.flatMap((pp) => pp.lines.filter((l) => l.supplierId === order.supplierId).map((l) => ({ pp, l })));
  const pick = (line: Plan['lines'][number]) => {
    const same = cands.filter((c) => c.l.productId === line.productId);
    return same.find((c) => c.l.id === line.periodLineId) ?? same.find((c) => c.l.destinationId === destOf(line)) ?? same[0];
  };
  const linkOf = (o: Plan, line: Plan['lines'][number]) => {
    if (line.periodLineId) return line.periodLineId;
    if (o.entityId !== order.entityId || o.supplierId !== order.supplierId) return undefined;
    const hit = coveringPlans(o, periodPlans).flatMap((pp) => pp.lines).find((l) => l.supplierId === o.supplierId && l.productId === line.productId);
    return hit?.id;
  };
  const before = new Map<string, number>();
  for (const o of orders) if (o.id !== order.id && ORDER_COUNTS(o) && !(order.revisionOf && (o.id === order.revisionOf || o.revisionOf === order.revisionOf))) for (const l of o.lines) {
    const k = linkOf(o, l); if (k) before.set(k, (before.get(k) ?? 0) + l.qty);
  }
  const running = new Map<string, number>();
  return order.lines.map((line) => {
    const c = pick(line);
    if (!c) return { lineId: line.id, planned: 0, orderedBefore: 0, thisPo: line.qty, remaining: -line.qty, exception: 'unplanned' as const, reason: line.exceptionReason };
    const cum = (running.get(c.l.id) ?? 0) + line.qty; running.set(c.l.id, cum);
    const ob = before.get(c.l.id) ?? 0;
    const remaining = c.l.cases - ob - cum;
    return { lineId: line.id, periodLineId: c.l.id, periodPlanId: c.pp.id, periodPlanRef: c.pp.ref, planned: c.l.cases, orderedBefore: ob, thisPo: line.qty, remaining,
      ...(remaining < 0 ? { exception: 'over' as const, reason: line.exceptionReason } : {}) };
  });
}
/** Stamp each order line with its plan link and exception mark (reasons kept only where an exception remains). */
export function applyPlanLinks<T extends Plan>(order: T, periodPlans: PeriodPlan[], orders: Plan[], destOf?: (l: Plan['lines'][number]) => ID | undefined): T {
  const ctx = planContext(order, periodPlans, orders, destOf);
  return { ...order, lines: order.lines.map((l, i) => {
    const c = ctx[i];
    const out = { ...l, periodLineId: c.periodLineId, exception: c.exception };
    if (!c.exception) { delete out.exceptionReason; delete out.exception; }
    if (!out.periodLineId) delete out.periodLineId;
    return out;
  }) };
}
/** PO-07 (informational): lines over plan or unplanned without a note. Nothing is refused for it — plans are suggestions. */
export const missingReasons = (ctx: PlanLineContext[]) => ctx.filter((c) => c.exception && !c.reason?.trim());

// ---- Server config (apps/api/config.toml) ---------------------------------------------------------------
/** Defaults when config.toml is missing or a key is absent. The mock client uses the same. */
export const defaultConfig: AppConfig = { approvals: { purchaseOrders: false }, loading: { allowancePct: 10, allowAlternatives: true, revisionSuffix: '-rev' }, fees: { amberDays: 14, redDays: 30 }, costs: { allocation: 'quantity' } };
/** Label of an order's state for the UI. POs are not drafted: Issued (approved automatically or by a director), Awaiting
 *  approval (approvals on), Revised (a later revision replaced it) or Deleted. */
export function planStatusLabel(p: Pick<Plan, 'status' | 'history' | 'revision' | 'supersededById'>, _cfg: AppConfig = defaultConfig): string {
  if (p.status === 'Approved') return p.supersededById ? 'Revised' : 'Issued';
  if (p.status === 'Submitted') return 'Awaiting approval';
  if (p.status === 'Deleted' || p.status === 'Rejected') return 'Deleted';
  return p.status;
}

// ---- Purchase orders: create, update (= revision), delete (docs/09 §4) ------------------------------------------------
/** The supplier-facing part of an order line. */
export const poLineSnap = (l: Pick<PlanLine, 'truckNo' | 'productId' | 'qty' | 'price' | 'routeId' | 'deliveredToId'>): PoLineSnap =>
  ({ truckNo: l.truckNo, productId: l.productId, qty: l.qty, ...(l.price !== undefined ? { price: l.price } : {}), routeId: l.routeId, deliveredToId: l.deliveredToId });
/**
 * Line-by-line difference between two versions (matched by line id): `kind` for a changed line is 'updated' (office edit)
 * or 'revised at loading'; lines only in `next` are 'added', lines only in `prev` are 'removed'. Unchanged lines are left out.
 */
export function diffPoLines(prev: PlanLine[], next: PlanLine[], kind: 'updated' | 'revised at loading'): PoLineChange[] {
  const out: PoLineChange[] = [];
  const same = (a: PlanLine, b: PlanLine) => a.truckNo === b.truckNo && a.productId === b.productId && a.qty === b.qty && (a.price ?? null) === (b.price ?? null) && a.routeId === b.routeId && a.deliveredToId === b.deliveredToId;
  for (const b of next) {
    const a = prev.find((x) => x.id === b.id);
    if (!a) out.push({ lineId: b.id, truckNo: b.truckNo, kind: 'added', after: poLineSnap(b) });
    else if (!same(a, b)) out.push({ lineId: b.id, truckNo: b.truckNo, kind, before: poLineSnap(a), after: poLineSnap(b) });
  }
  for (const a of prev) if (!next.some((x) => x.id === a.id)) out.push({ lineId: a.id, truckNo: a.truckNo, kind: 'removed', before: poLineSnap(a) });
  return out.sort((x, y) => x.truckNo - y.truckNo);
}
/** "Truck 4: Tusker 2,000 → 1,800; Truck 5 added: Pilsner 1,000" — one text per change (letters, notifications). */
export function lineChangeText(c: PoLineChange, name: (productId: ID) => string): string {
  const a = c.before, b = c.after;
  if (c.kind === 'added' && b) return `Truck ${c.truckNo}: ${name(b.productId)} ${fmtN(b.qty)} cases added`;
  if (c.kind === 'removed' && a) return `Truck ${c.truckNo}: ${name(a.productId)} ${fmtN(a.qty)} cases removed`;
  if (!a || !b) return `Truck ${c.truckNo}: changed`;
  const parts: string[] = [];
  if (a.productId !== b.productId) parts.push(`${name(a.productId)} → ${name(b.productId)}`);
  if (a.qty !== b.qty) parts.push(`${a.productId === b.productId ? name(b.productId) + ' ' : ''}${fmtN(a.qty)} → ${fmtN(b.qty)} cases`);
  if ((a.price ?? null) !== (b.price ?? null) && a.price !== undefined && b.price !== undefined) parts.push(`price ${a.price} → ${b.price}`);
  if (a.routeId !== b.routeId) parts.push('route changed');
  if (a.deliveredToId !== b.deliveredToId) parts.push('delivered-to changed');
  if (a.truckNo !== b.truckNo) parts.push(`moved from truck ${a.truckNo}`);
  return `Truck ${c.truckNo}: ${parts.join(', ') || 'changed'}${c.kind === 'revised at loading' ? ' (at loading)' : ''}`;
}
/** Next revision number of a PO chain: one counter for office updates and loading revisions, from the ORIGINAL ref. */
export const nextRevisionNo = (chain: Pick<PurchaseOrder, 'revision'>[]) => chain.reduce((a, x) => Math.max(a, x.revision ?? 0), 0) + 1;
/** Where a PO stands: Deleted / Awaiting approval (stored), else Delivered (every truck acknowledged), On the road (a truck
 *  left), Loading (a truck loaded), Sent (emailed to the supplier) or Created. Loadings and shipments are those of the chain. */
export function poStage(po: Pick<PurchaseOrder, 'status' | 'sentAt'>, loadings: Pick<Loading, 'status'>[], shipments: Pick<Shipment, 'status' | 'fromWarehouseId' | 'legs'>[]): PoStage {
  if (po.status === 'Deleted') return 'Deleted';
  if (po.status === 'Awaiting approval') return 'Awaiting approval';
  const shs = shipments.filter((s) => !s.fromWarehouseId);
  const loaded = loadings.filter((l) => l.status === 'Loaded');
  if (loadings.length && loaded.length === loadings.length && shs.length >= loadings.length && shs.every((s) => s.status === 'Acknowledged')) return 'Delivered';
  const left = (s: (typeof shs)[number]) => (s.status !== 'Loaded' && s.status !== 'Planned') || s.legs.some((l) => !!l.departedAt);
  if (shs.some(left)) return 'On the road';
  if (loaded.length) return 'Loading';
  return po.sentAt ? 'Sent' : 'Created';
}
/** A PO may be deleted only while nothing was loaded against it (no loading Loaded, no shipment). `null` = allowed. */
export function poDeleteBlock(po: Pick<PurchaseOrder, 'status'>, loadings: Pick<Loading, 'status'>[], shipments: unknown[]): string | null {
  if (po.status === 'Deleted') return 'This purchase order is already deleted';
  if (loadings.some((l) => l.status === 'Loaded') || shipments.length) return 'Trucks have been loaded against this purchase order — it can no longer be deleted. Update it instead (the change is kept as a revision).';
  return null;
}
/**
 * May the office change the order to `next`? Every truck loaded → refused. On a loaded truck no line may drop below the
 * cases loaded, change product / route / delivered-to, or be added. `loaded` = cases loaded per order line id; `loadedTrucks`
 * = truck numbers already loaded. `null` = allowed.
 */
export function poUpdateBlock(po: Pick<PurchaseOrder, 'status'>, prev: PlanLine[], next: Pick<PlanLine, 'id' | 'truckNo' | 'productId' | 'qty' | 'routeId' | 'deliveredToId'>[], loadedTrucks: number[], loaded: Record<ID, number>, truckCount: number): string | null {
  if (po.status === 'Deleted') return 'A deleted purchase order cannot be updated';
  if (truckCount > 0 && loadedTrucks.length >= truckCount) return 'Every truck of this purchase order is loaded — it can no longer be updated';
  for (const a of prev) {
    if (!loadedTrucks.includes(a.truckNo)) continue;
    const b = next.find((x) => x.id === a.id);
    const got = loaded[a.id] ?? 0;
    if (!b) { if (got > 0) return `Truck ${a.truckNo} is already loaded — its ${fmtN(got)} loaded cases can't be removed`; continue; }
    if (b.qty < got) return `Truck ${a.truckNo} already loaded ${fmtN(got)} cases on this line — the quantity can't go below that`;
    if (b.productId !== a.productId || b.routeId !== a.routeId || b.deliveredToId !== a.deliveredToId || b.truckNo !== a.truckNo) return `Truck ${a.truckNo} is already loaded — its lines can't change product, truck, route or destination`;
  }
  for (const b of next) if (!prev.some((a) => a.id === b.id) && loadedTrucks.includes(b.truckNo)) return `Truck ${b.truckNo} is already loaded — add the goods on another truck`;
  return null;
}
/** The audit / letter line of how a PO was approved: "Approved automatically · Kabonge · 26 Oct 2026". */
export const approvalText = (po: Pick<PurchaseOrder, 'approval' | 'approvedAt'>, name: string) =>
  po.approval === 'director' ? `Approved by ${name} · ${po.approvedAt.slice(0, 10)}`
    : po.approval === 'revision' ? `Revised at loading · ${name} · ${po.approvedAt.slice(0, 10)}`
      : po.approval === 'update' ? `Updated by ${name} · ${po.approvedAt.slice(0, 10)}`
        : `Approved automatically · ${name} · ${po.approvedAt.slice(0, 10)}`;

// ---- Loading against the PO: allowance, alternatives, automatic revisions -----------------------------------
/** BTW-PO-2026-0002 + "-rev" + 1 → BTW-PO-2026-0002-rev001 (always numbered from the ORIGINAL ref). */
export const revisionRef = (baseRef: string, suffix: string, n: number) => `${baseRef}${suffix}${String(n).padStart(3, '0')}`;
export interface LoadingCheck {
  ordered: number; loaded: number; diff: number; diffPct: number; allowancePct: number; min: number; max: number; capacity: number;
  within: boolean; overCapacity: boolean; deviates: boolean; changes: Omit<PoRevisionChange, 'truckNo'>[]; error?: string;
}
/**
 * What the loader is about to record against the PO truck: the loaded total may differ from the ordered total by at most
 * ±allowancePct and never exceed the truck's capacity. Any difference (a quantity, a missing item, an alternative) is a
 * deviation → the server writes a PO revision in the same transaction. `error` is the refusal text (nothing recorded).
 */
export function loadingCheck(
  lines: Pick<LoadingLine, 'planLineId' | 'productId' | 'orderedQty'>[], loadedQty: Record<ID, number> | undefined, alternatives: LoadingAlternative[] | undefined,
  capacity: number, cfg: AppConfig['loading'] = defaultConfig.loading,
  opts: { supplierId?: ID; products?: Pick<Product, 'id' | 'supplierId' | 'brand' | 'pack'>[] } = {},
): LoadingCheck {
  const alts = (alternatives ?? []).filter((a) => a && Number(a.qty) > 0);
  let error: string | undefined;
  const qty = (l: Pick<LoadingLine, 'planLineId' | 'orderedQty'>) => { const v = loadedQty?.[l.planLineId]; return v === undefined || v === null || !Number.isFinite(Number(v)) ? l.orderedQty : Math.max(0, Math.round(Number(v))); };
  const changes: LoadingCheck['changes'] = [];
  for (const l of lines) { const q = qty(l); if (q !== l.orderedQty) changes.push({ planLineId: l.planLineId, productId: l.productId, ordered: l.orderedQty, loaded: q, kind: q === 0 ? 'missing' : 'qty' }); }
  for (const a of alts) {
    const q = Math.round(Number(a.qty));
    if (!cfg.allowAlternatives) error ??= 'Alternatives are switched off — load what the PO says, or ask the planner to change the PO';
    if (!Number.isInteger(Number(a.qty)) || q <= 0) error ??= 'An alternative needs a whole number of cases above zero';
    const prod = opts.products?.find((x) => x.id === a.productId);
    if (opts.products && !prod) error ??= 'Unknown alternative product';
    else if (prod && opts.supplierId && prod.supplierId !== opts.supplierId) error ??= `${prod.brand} ${prod.pack} is not on this supplier's price list`;
    if (a.replacesPlanLineId && !lines.some((l) => l.planLineId === a.replacesPlanLineId)) error ??= 'The line an alternative replaces is not on this truck';
    changes.push({ productId: a.productId, ordered: 0, loaded: q, kind: 'alternative', ...(a.replacesPlanLineId ? { replacesPlanLineId: a.replacesPlanLineId } : {}) });
  }
  const ordered = lines.reduce((s, l) => s + l.orderedQty, 0);
  const loaded = lines.reduce((s, l) => s + qty(l), 0) + alts.reduce((s, a) => s + Math.max(0, Math.round(Number(a.qty))), 0);
  const pct = Math.max(0, Number(cfg.allowancePct) || 0);
  const min = Math.ceil(ordered * (1 - pct / 100)), max = Math.floor(ordered * (1 + pct / 100));
  const diff = loaded - ordered; const diffPct = ordered ? Math.round((diff / ordered) * 1000) / 10 : 0;
  const overCapacity = capacity > 0 && loaded > capacity;
  const within = loaded >= min && loaded <= max;
  if (!error && overCapacity) error = `Over truck capacity: ${loaded} > ${capacity} cases (§7.3 #3)`;
  if (!error && loaded <= 0) error = 'Loaded quantity must be above zero';
  if (!error && loaded > max) error = `Over the ${pct}% loading allowance — ask the planner to change the PO (${fmtN(loaded)} loaded vs ${fmtN(ordered)} ordered; at most ${fmtN(max)})`;
  if (!error && loaded < min) error = `Below the ${pct}% loading allowance — ask the planner to change the PO (${fmtN(loaded)} loaded vs ${fmtN(ordered)} ordered; at least ${fmtN(min)})`;
  return { ordered, loaded, diff, diffPct, allowancePct: pct, min, max, capacity, within, overCapacity, deviates: changes.length > 0, changes, ...(error ? { error } : {}) };
}
/** "Tusker −200, Tusker Lite +200": net change per product of a revision. */
export function revisionSummary(changes: Pick<PoRevisionChange, 'productId' | 'ordered' | 'loaded'>[], name: (productId: ID) => string) {
  const net = new Map<ID, number>();
  for (const c of changes) net.set(c.productId, (net.get(c.productId) ?? 0) + c.loaded - c.ordered);
  return [...net].filter(([, d]) => d !== 0).map(([pid, d]) => `${name(pid)} ${d > 0 ? '+' : '−'}${fmtN(Math.abs(d))}`).join(', ');
}
/**
 * The order behind the next PO revision: a copy of the LATEST revision (so it reflects everything loaded so far) where
 * this truck's lines carry what was actually loaded (missing lines dropped) plus any alternatives; other trucks unchanged.
 * Line ids are kept, so loadings keep pointing at the right lines.
 */
export function revisePlan(prev: Plan, truckNo: number, loading: Pick<LoadingLine, 'planLineId' | 'productId' | 'orderedQty'>[], loadedQty: Record<ID, number> | undefined,
  alternatives: LoadingAlternative[] | undefined, ids: { id: ID; ref: string; poId: ID; lineId: () => ID; basePlanId: ID; revision: number }, priceOf: (productId: ID) => number, byUserId: ID, at: string): { plan: Plan; altLines: { planLineId: ID; productId: ID; qty: number; alternativeFor?: ID }[] } {
  const qty = (id: ID, ordered: number) => { const v = loadedQty?.[id]; return v === undefined || v === null || !Number.isFinite(Number(v)) ? ordered : Math.max(0, Math.round(Number(v))); };
  const truck = prev.lines.filter((l) => l.truckNo === truckNo);
  const lines = prev.lines.flatMap((l) => {
    if (l.truckNo !== truckNo) return [{ ...l }];
    const ld = loading.find((x) => x.planLineId === l.id);
    const q = ld ? qty(l.id, ld.orderedQty) : l.qty;
    return q > 0 ? [{ ...l, qty: q }] : [];
  });
  const altLines: { planLineId: ID; productId: ID; qty: number; alternativeFor?: ID }[] = [];
  for (const a of alternatives ?? []) {
    if (!(Number(a.qty) > 0)) continue;
    const like = truck.find((l) => l.id === a.replacesPlanLineId) ?? truck[0];
    const id = ids.lineId();
    lines.push({ id, truckNo, productId: a.productId, qty: Math.round(Number(a.qty)), price: priceOf(a.productId), deliveredToId: like.deliveredToId, routeId: like.routeId, ...(a.replacesPlanLineId ? { alternativeFor: a.replacesPlanLineId } : {}) });
    altLines.push({ planLineId: id, productId: a.productId, qty: Math.round(Number(a.qty)), ...(a.replacesPlanLineId ? { alternativeFor: a.replacesPlanLineId } : {}) });
  }
  const plan: Plan = {
    ...prev, id: ids.id, ref: ids.ref, lines, status: 'Approved', poId: ids.poId, revisionOf: ids.basePlanId, revision: ids.revision,
    history: [{ at, byUserId, action: 'revised', comment: `Revised at loading (truck ${truckNo})` }],
  };
  delete plan.supersededById;
  return { plan, altLines };
}
export const defaultPvThresholds: PvThresholds = { behind: 0.85, over: 1.05 };
/** Reports a role may open: the general Reports feature, or the feature the report belongs to (e.g. a sales clerk's sales overview). */
export const REPORT_FEATURES: Record<string, FeatureKey[]> = {
  // inventory shows stock values (purchase prices): not for receivers (A-04) — their own reports come with the dashboards
  dashboard: ['dashboard'], sales: ['reports', 'sales'], quarterly: ['reports'], logistics: ['reports', 'trucks'], inventory: ['reports'],
  // finance shows sales margins: the general Reports feature only (the truck planner reads trip costs, not sales)
  planning: ['reports', 'period-plans'], finance: ['reports'], 'period-plan': ['reports', 'period-plans'], 'capture-check': ['reports'],
  'planned-vs-actual': ['planned-vs-actual'],
};
export const canOpenReport = (roles: Role[], report: string) => (REPORT_FEATURES[report] ?? ['reports']).some((f) => hasFeature(roles, f));

// ---- Truck planning (docs/10-truck-planner-role.md, reshaped by docs/12) ------------------------------------------
/** Who onboards transport providers, trucks and drivers (add / edit / deactivate). The truck follow-up officer views only (§7). */
export const TRANSPORT_EDITORS: Role[] = ['planner', 'fleet', 'director', 'admin'];
export const canEditTransport = (roles: Role[]) => roles.some((r) => TRANSPORT_EDITORS.includes(r));
/** Who may change a loading queue at all (scope per point: access.canEditQueue). Directors view (§7 Loading = View). */
export const QUEUE_EDITORS: Role[] = ['loader', 'truck_planner', 'planner', 'fleet', 'operations'];
/** May this user see the queue / loadings of loading point `lp`? (access.seesLoadingPoint; loaders: their own points.) */
export { seesLoadingPoint } from './access';
/** Notifications meant for fleet follow-up also reach truck planners (they took over the trucks). */
export const withTruckPlanner = (roles: Role[]): Role[] => (roles.includes('fleet') && !roles.includes('truck_planner') ? [...roles, 'truck_planner'] : roles);

/** Feature area of an API path for the audit log ("/v1/masterdata/products/p-1" → "masterdata"). */
export const auditFeature = (path: string) => path.replace(/^\/?(v1\/)?/, '').split('/')[0] || 'other';

export const PROVIDER_KINDS: { kind: import('./types').ProviderKind; label: string }[] = [
  { kind: 'company', label: 'Transport company' }, { kind: 'sacco', label: 'Sacco' }, { kind: 'individual', label: 'Individual owner' }, { kind: 'market', label: 'Market (hired on the spot)' },
];
/** "kbv  894t" → "KBV 894T" (registrations compare case- and space-insensitively). */
export const normReg = (reg: unknown) => (typeof reg === 'string' ? reg.trim().toUpperCase().replace(/\s+/g, ' ') : '');
const regKey = (reg: string) => normReg(reg).replace(/\s/g, '');
/** Phone to E.164: "0712 345 678" → "+254712345678" (Kenyan local numbers assumed), "+256 711…" kept. */
export function normPhone(phone: unknown): string {
  if (typeof phone !== 'string') return '';
  const p = phone.replace(/[^\d+]/g, '');
  if (!p) return '';
  if (p.startsWith('+')) return p;
  if (p.startsWith('00')) return `+${p.slice(2)}`;
  if (p.startsWith('0')) return `+254${p.slice(1)}`;
  return `+${p}`;
}
export const PHONE_RE = /^\+\d{9,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
/** Problems with a provider form (empty = can be saved). `others` = the other providers (unique name). */
export function validateProvider(p: Partial<import('./types').ProviderInput>, others: { id: ID; name: string }[], id?: ID | null): string[] {
  const e: string[] = [];
  const name = str(p.name);
  if (!name) e.push('Enter the provider name');
  else if (name.length > 120) e.push('The name is too long');
  else if (others.some((o) => o.id !== id && o.name.trim().toLowerCase() === name.toLowerCase())) e.push(`${name} is already registered`);
  if (!PROVIDER_KINDS.some((k) => k.kind === p.kind)) e.push('Pick the kind: company, sacco, individual or market');
  if (str(p.phone) && !PHONE_RE.test(normPhone(p.phone))) e.push('Phone must be a full number, e.g. +254712345678');
  if (str(p.email) && !EMAIL_RE.test(str(p.email))) e.push('Email does not look right');
  if (p.notes !== undefined && typeof p.notes !== 'string') e.push('Notes must be text');
  if (typeof p.notes === 'string' && p.notes.length > 2000) e.push('Notes are too long (2,000 characters at most)');
  if (p.active !== undefined && typeof p.active !== 'boolean') e.push('active must be true or false');
  return e;
}
/** Problems with a truck form. Registrations are unique (case/space-insensitive); the default driver must exist. */
export function validateTruck(t: Partial<import('./types').TruckInput>, ctx: { providers: { id: ID }[]; trucks: { id: ID; reg: string }[]; drivers: { id: ID; providerId: ID }[] }, id?: ID | null): string[] {
  const e: string[] = [];
  const reg = normReg(t.reg);
  if (!ctx.providers.some((p) => p.id === t.providerId)) e.push('Pick the transport provider');
  if (!reg) e.push('Enter the truck registration');
  else if (!/^[A-Z0-9][A-Z0-9 -]{2,14}$/.test(reg)) e.push('Registration looks wrong (letters and digits, e.g. KBV 894T)');
  else if (ctx.trucks.some((x) => x.id !== id && regKey(x.reg) === regKey(reg))) e.push(`${reg} is already registered`);
  if (t.trailer !== undefined && t.trailer !== null && typeof t.trailer !== 'string') e.push('Trailer must be text');
  if (!(Number.isInteger(t.capacityCases) && (t.capacityCases as number) > 0 && (t.capacityCases as number) <= 10000)) e.push('Capacity must be a whole number of cases (1–10,000)');
  if (t.defaultDriverId && !ctx.drivers.some((d) => d.id === t.defaultDriverId)) e.push('Unknown default driver');
  if (t.active !== undefined && typeof t.active !== 'boolean') e.push('active must be true or false');
  if (t.documents !== undefined && !(Array.isArray(t.documents) && t.documents.length <= 20 && t.documents.every((d) => d && typeof d.name === 'string'))) e.push('Documents must be a list of named files (20 at most)');
  return e;
}
/** Problems with a driver form. Phone numbers are unique among drivers (it is how they sign in and SMS). */
export function validateDriver(d: Partial<import('./types').DriverInput>, ctx: { providers: { id: ID }[]; drivers: { id: ID; phone: string }[] }, id?: ID | null): string[] {
  const e: string[] = [];
  const phone = normPhone(d.phone);
  if (!ctx.providers.some((p) => p.id === d.providerId)) e.push('Pick the transport provider');
  if (!str(d.name)) e.push("Enter the driver's name");
  if (!PHONE_RE.test(phone)) e.push('Phone must be a full number, e.g. +254712345678');
  else if (ctx.drivers.some((x) => x.id !== id && normPhone(x.phone) === phone)) e.push('Another driver already uses this phone number');
  if (d.licence !== undefined && typeof d.licence !== 'string') e.push('Licence must be text');
  if (d.hasApp !== undefined && typeof d.hasApp !== 'boolean') e.push('hasApp must be true or false');
  if (d.active !== undefined && typeof d.active !== 'boolean') e.push('active must be true or false');
  return e;
}
/** Removing a truck from a queue: why (shown to the loader and kept in the audit log). */
export const QUEUE_REMOVE_REASONS = ['Left the queue', 'Breakdown', 'Driver not available', 'Documents not in order', 'Sent to another loading point', 'Duplicate entry', 'Other'] as const;
/** New queue order with `entryId` moved to `position` (1-based, clamped). Returns the ids in order. */
export function reorderQueue(ids: ID[], entryId: ID, position: number): ID[] {
  const i = ids.indexOf(entryId);
  if (i < 0) return ids;
  const rest = ids.filter((x) => x !== entryId);
  const to = Math.max(0, Math.min(rest.length, Math.round(position) - 1));
  rest.splice(to, 0, entryId);
  return rest;
}
