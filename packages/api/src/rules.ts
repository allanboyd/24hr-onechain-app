// Pure business rules shared by the in-browser mock, the HTTP client (for derived values such as ETA)
// and the NestJS server. No I/O, no globals: every input is a parameter, `now` included.
import type {
  CheckpointPass, EtaInfo, Flag, ID, Leg, LegStatus, RouteStop, Sale, Shipment, StockRow, VelocityClass, VelocityRow,
} from './types';

export const H = 36e5;
export const DAY = 864e5;
const iso = (t: number) => new Date(t).toISOString();

/** Amount = qty × price, rounded to cents (§7.2: never typed). */
export const amount = (qty: number, price: number) => Math.round(qty * price * 100) / 100;

/** Next sequential reference for an entity prefix and year, e.g. BTW-PO-2026-0003 (PO-02). */
export function nextRef(existingRefs: string[], prefix: string, year: number) {
  const nums = existingRefs.filter((r) => r.startsWith(`${prefix}-${year}`)).map((r) => +r.split('-').at(-1)!);
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
export interface StockMove { warehouseId: ID; productId: ID; kind: MoveKind; qty: number; at: string; ref: string }

export function computeStock(moves: StockMove[], shipments: Shipment[], priceOf: (productId: ID) => number, now = Date.now()): StockRow[] {
  const rows = new Map<string, StockRow>();
  const since = now - 30 * DAY;
  const get = (w: ID, p: ID) => {
    const k = `${w}|${p}`;
    if (!rows.has(k)) rows.set(k, { warehouseId: w, productId: p, opening: 0, received: 0, transfersIn: 0, transfersOut: 0, damaged: 0, adjustments: 0, sold: 0, closing: 0, inTransit: 0, landedCostPerCase: 0 });
    return rows.get(k)!;
  };
  for (const m of moves) {
    const r = get(m.warehouseId, m.productId);
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
    for (const l of active.lines) get(sh.warehouseId, l.productId).inTransit += l.loadedQty;
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

export function computeVelocity(stockRows: StockRow[], sales: Pick<Sale, 'warehouseId' | 'at' | 'lines'>[], t: Thresholds, now = Date.now()): VelocityRow[] {
  const since = now - 30 * DAY;
  const sold = new Map<string, { q: number; last: number }>();
  for (const s of sales) for (const l of s.lines) {
    const k = `${s.warehouseId}|${l.productId}`; const at = Date.parse(s.at);
    const cur = sold.get(k) ?? { q: 0, last: 0 };
    if (at >= since) cur.q += l.qty;
    cur.last = Math.max(cur.last, at); sold.set(k, cur);
  }
  const rows = stockRows.filter((r) => r.closing > 0 || sold.has(`${r.warehouseId}|${r.productId}`)).map((r) => {
    const s = sold.get(`${r.warehouseId}|${r.productId}`) ?? { q: 0, last: 0 };
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
    return { productId: r.productId, warehouseId: r.warehouseId, sold30, perDay: Math.round(perDay * 10) / 10, index, cover, daysSinceSale: days, cls, flags };
  });
  for (const row of out) if (row.cls === 'Slow' || row.cls === 'Stagnant')
    if (out.some((o) => o.productId === row.productId && o.cls === 'Fast')) row.flags.push('cross-compare');
  return out;
}

const FLAG_TEXT: Record<string, string> = { 'slow-moving': 'Slow moving', overstock: 'Overstock', 'stock-out-risk': 'Stock-out risk', 'dead-stock': 'Dead stock', 'cross-compare': 'Fast elsewhere — consider transfer' };
export function flagsFrom(rows: VelocityRow[], now = Date.now()): Flag[] {
  return rows.flatMap((v) => v.flags.map((f) => ({ id: `${v.warehouseId}-${v.productId}-${f}`, kind: f, productId: v.productId, warehouseId: v.warehouseId, text: FLAG_TEXT[f], at: iso(now) })));
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
