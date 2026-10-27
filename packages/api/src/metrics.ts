// docs/18 (CHECKLIST F-0b, docs/17 F3): ONE definition for every figure that appears on more than one surface — Home
// dashboards (dashboards.ts, incl. the directors' Today view), the page summary tiles (web), the team app homes
// (apps/field/src/team/glance.ts), the server / mock summary and the exports. Each surface passes the data it already
// has for the person's scope; the functions below never re-scope, so the same scope and period give the same number.
// Pure, no I/O; `now` is always a parameter. Lazy-loaded with the pages that use it (not in the apps' entry chunks).
import { DAY, H, etaOf, overdue } from './rules';
import type { EtaInfo, ID, Leg, Loading, PeriodPlan, PoStage, PurchaseOrder, ReexportOrder, ReexportStatus, RouteStop, Sale, Shipment, StockRow, TripCost, TripPayment, WaitingEntry, WarehouseExpense } from './types';

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const t = (x?: string | null) => (x ? Date.parse(x) : NaN);
/** [from, to) in ms */
export interface Period { from: number; to: number }
const inP = (ms: number, p?: Period | null) => !p || (ms >= p.from && ms < p.to);
/** Start of the (UTC) day of `now` — "today" everywhere. */
export const dayStartOf = (now: number) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };

// =====================================================================================================================
// Fleet (now)
// =====================================================================================================================
/** Hours behind plan from which a truck on the road counts as delayed (same rule as the shipment status). */
export const DELAY_HOURS = 6;
/** A next check-in this many hours overdue = "no check-in". */
export const CHECKIN_GRACE_HOURS = 3;
/** Leg statuses of a truck that has left the loading point and not yet arrived. */
export const LEFT_LOADING: Leg['status'][] = ['Dispatched', 'In transit', 'At border', 'Delayed'];
export type RoadState = 'Delayed' | 'At border' | 'In transit';
/** The leg a shipment is on now: the first leg not yet signed for (none when delivered or cancelled). */
export const currentLeg = (sh: Pick<Shipment, 'legs' | 'status'>): Leg | undefined =>
  sh.status === 'Cancelled' || sh.status === 'Acknowledged' ? undefined : sh.legs.find((l) => l.status !== 'Acknowledged' && l.status !== 'Cancelled');
/** Where a leg on the road stands (exclusive: delayed first, then at a border, else in transit); null = not on the road. */
export function roadState(leg: Leg, eta: Pick<EtaInfo, 'state' | 'hours'>): RoadState | null {
  if (!LEFT_LOADING.includes(leg.status)) return null;
  if (leg.status === 'Delayed' || leg.issues.some((i) => !i.fixedAt) || (eta.state === 'Late' && eta.hours >= DELAY_HOURS)) return 'Delayed';
  if (leg.status === 'At border') return 'At border';
  return 'In transit';
}
export interface FleetSource { shipments: Shipment[]; stopsOf: (routeId: ID) => RouteStop[]; now: number }
export interface RoadTruck { sh: Shipment; leg: Leg; state: RoadState; eta: EtaInfo; noCheckin: boolean }
/** Every truck on the road now, one per shipment (its current leg). */
export function onTheRoad(s: FleetSource): RoadTruck[] {
  const out: RoadTruck[] = [];
  for (const sh of s.shipments) {
    const leg = currentLeg(sh); if (!leg) continue;
    const stops = s.stopsOf(leg.routeId);
    const eta = etaOf(leg, stops, s.now);
    const state = roadState(leg, eta); if (!state) continue;
    out.push({ sh, leg, state, eta, noCheckin: !!overdue(leg, stops, CHECKIN_GRACE_HOURS, s.now) });
  }
  return out;
}
export interface FleetFigures { onRoad: number; delayed: number; atBorder: number; inTransit: number; noCheckin: number; arrivingToday: number }
export function fleetFigures(s: FleetSource): FleetFigures {
  const xs = onTheRoad(s); const d0 = dayStartOf(s.now);
  return {
    onRoad: xs.length, delayed: xs.filter((x) => x.state === 'Delayed').length, atBorder: xs.filter((x) => x.state === 'At border').length,
    inTransit: xs.filter((x) => x.state === 'In transit').length, noCheckin: xs.filter((x) => x.noCheckin).length,
    arrivingToday: xs.filter((x) => { const e = t(x.eta.eta); return e >= d0 && e < d0 + DAY; }).length,
  };
}
/** Trucks on the road at a past moment `at` (left the loading point before, not yet arrived at its destination). */
export function onRoadAt(shipments: Shipment[], at: number): number {
  let n = 0;
  for (const sh of shipments) {
    if (sh.status === 'Cancelled') continue;
    const legs = sh.legs.filter((l) => l.status !== 'Cancelled');
    if (legs.some((l) => { const a = t(l.departedAt ?? l.passes[0]?.departedAt), b = t(arrivalOf(l)); return a <= at && !(b <= at); })) n++;
  }
  return n;
}

// =====================================================================================================================
// Deliveries (period)
// =====================================================================================================================
/** Arrival at the end of a leg (the last check-in is the destination). */
export const arrivalOf = (l: Leg) => (l.passes.length > 1 || l.status === 'Arrived' || l.status === 'Acknowledged' ? l.passes.at(-1)?.arrivedAt : undefined);
/** When a delivered shipment arrived at its destination (falls back to the planned arrival). */
export const deliveredAt = (sh: Shipment) => { const last = sh.legs.at(-1); return last ? t(arrivalOf(last) ?? last.plannedArrival) : NaN; };
/** Shipments delivered (signed for at their destination), dated by their arrival there. Every truck trip counts:
 *  first trips from the supplier, onward trips between our warehouses and re-exports. */
export const deliveredIn = (shipments: Shipment[], p?: Period | null) => shipments.filter((s) => s.status === 'Acknowledged' && inP(deliveredAt(s), p));
export const onTimeOf = (sh: Shipment) => { const last = sh.legs.at(-1)!; return deliveredAt(sh) <= t(last.plannedArrival) + DELAY_HOURS * H; };
/** Share of the deliveries of the period that arrived at most 6 h after the planned time; null without deliveries. */
export function onTimeShare(shipments: Shipment[], p?: Period | null): number | null {
  const xs = deliveredIn(shipments, p);
  return xs.length ? Math.round((xs.filter(onTimeOf).length / xs.length) * 10000) / 10000 : null;
}

// =====================================================================================================================
// Orders to load
// =====================================================================================================================
/** A purchase order that can be loaded: not deleted, not waiting for a director, not replaced by a newer revision. */
export const liveOrder = (po: Pick<PurchaseOrder, 'status' | 'supersededById'>) => po.status !== 'Deleted' && po.status !== 'Awaiting approval' && !po.supersededById;
/** Truck lines still to load (pending loadings) of live orders. Loadings whose order is not in `pos` count (the API
 *  already hides orders the person may not see). */
export function trucksToLoad(loadings: Pick<Loading, 'poId' | 'status'>[], pos?: Pick<PurchaseOrder, 'id' | 'status' | 'supersededById'>[] | null) {
  const byId = new Map((pos ?? []).map((p) => [p.id, p]));
  return loadings.filter((l) => l.status === 'Pending' && (!byId.has(l.poId) || liveOrder(byId.get(l.poId)!)));
}
export const ordersToLoad = (loadings: Pick<Loading, 'poId' | 'status'>[], pos?: Pick<PurchaseOrder, 'id' | 'status' | 'supersededById'>[] | null) =>
  new Set(trucksToLoad(loadings, pos).map((l) => l.poId)).size;

// =====================================================================================================================
// Stock (now)
// =====================================================================================================================
export type StockLike = Pick<StockRow, 'closing' | 'inTransit'> & { landedCostPerCase?: number | null };
/** Cases on hand (negative balances count as zero). */
export const casesOnHand = (rows: StockLike[]) => sum(rows, (r) => Math.max(0, r.closing));
export const casesInTransit = (rows: StockLike[]) => sum(rows, (r) => r.inTransit);
/** Σ cases on hand × landed cost per case (USD); null when the values are hidden from this person. */
export function stockValue(rows: StockLike[]): number | null {
  if (rows.some((r) => r.landedCostPerCase === undefined || r.landedCostPerCase === null)) return null;
  return r2(sum(rows, (r) => r2(Math.max(0, r.closing) * (r.landedCostPerCase ?? 0))));
}
/** Stock cover bands (days of cover = cases on hand ÷ cases sold per day over the last 30 days). */
export const COVER_DAYS = { atRisk: 7, low: 14, over: 60, noSaleDays: 30 };
export type StockRisk = 'out' | 'stock-out risk' | 'low' | 'ok' | 'overstock' | 'dead';
export function stockRisk(closing: number, perDay: number, daysSinceSale: number): StockRisk {
  const cover = perDay ? closing / perDay : null;
  return closing <= 0 ? 'out' : daysSinceSale >= COVER_DAYS.noSaleDays ? 'dead' : cover !== null && cover < COVER_DAYS.atRisk ? 'stock-out risk'
    : cover !== null && cover < COVER_DAYS.low ? 'low' : cover !== null && cover > COVER_DAYS.over ? 'overstock' : 'ok';
}
/** Per stock row (company × warehouse × product): cases sold per day (30 days) and days since the last sale. */
export function salesPace(rows: Pick<StockRow, 'entityId' | 'warehouseId' | 'productId'>[], sales: Pick<Sale, 'entityId' | 'warehouseId' | 'at' | 'lines'>[], now: number) {
  const since = now - 30 * DAY; const by = new Map<string, { q: number; last: number }>();
  for (const s of sales) for (const l of s.lines) { const k = `${s.entityId}|${s.warehouseId}|${l.productId}`; const c = by.get(k) ?? { q: 0, last: 0 }; const at = t(s.at); if (at >= since && at <= now) c.q += l.qty; if (at <= now) c.last = Math.max(c.last, at); by.set(k, c); }
  return (r: Pick<StockRow, 'entityId' | 'warehouseId' | 'productId'>) => { const c = by.get(`${r.entityId}|${r.warehouseId}|${r.productId}`); return { perDay: (c?.q ?? 0) / 30, daysSinceSale: c?.last ? (now - c.last) / DAY : 999 }; };
}
type Pace = (r: Pick<StockRow, 'entityId' | 'warehouseId' | 'productId'>) => { perDay: number; daysSinceSale: number };
/** The same pace from the server's velocity rows (for screens without the sales list, e.g. receivers). */
export function paceFromVelocity(vel: { entityId: ID; warehouseId: ID; productId: ID; perDay: number; daysSinceSale: number }[]): Pace {
  const by = new Map(vel.map((v) => [`${v.entityId}|${v.warehouseId}|${v.productId}`, v]));
  return (r) => { const v = by.get(`${r.entityId}|${r.warehouseId}|${r.productId}`); return v ? { perDay: v.perDay, daysSinceSale: v.daysSinceSale } : { perDay: 0, daysSinceSale: 999 }; };
}
/** Stock rows out of stock, under 14 days of cover, over 60 days, or without a sale in 30 days. */
export const needsAttentionBy = <R extends Pick<StockRow, 'entityId' | 'warehouseId' | 'productId' | 'closing'>>(rows: R[], pace: Pace) =>
  rows.filter((r) => { const p = pace(r); return stockRisk(r.closing, p.perDay, p.daysSinceSale) !== 'ok'; });
export const needsAttention = (rows: StockRow[], sales: Pick<Sale, 'entityId' | 'warehouseId' | 'at' | 'lines'>[], now: number) => needsAttentionBy(rows, salesPace(rows, sales, now));

// =====================================================================================================================
// Sales and customer balances (USD; pass sales already scoped and converted — intercompany removed in the Group view)
// =====================================================================================================================
type SaleL = Pick<Sale, 'at' | 'lines' | 'paid' | 'status'>;
/** Customer payment terms (days) before a balance is overdue — to confirm. */
export const TERMS_DAYS = 14;
export const saleValue = (s: Pick<Sale, 'lines'>) => sum(s.lines, (l) => l.qty * l.price);
export const salesValue = (sales: SaleL[], p?: Period | null) => r2(sum(sales.filter((s) => inP(t(s.at), p)), saleValue));
export const casesSold = (sales: SaleL[], p?: Period | null) => sum(sales.filter((s) => inP(t(s.at), p)), (s) => sum(s.lines, (l) => l.qty));
/** Open customer balances now: value − paid of every sale not fully paid. */
export const openSales = <S extends SaleL>(sales: S[], now: number) => sales.filter((s) => s.status !== 'Paid' && t(s.at) <= now).map((s) => ({ s, bal: saleValue(s) - s.paid, age: (now - t(s.at)) / DAY })).filter((x) => x.bal > 0.005);
export const owedByCustomers = (sales: SaleL[], now: number) => r2(sum(openSales(sales, now), (x) => x.bal));
export const overdueByCustomers = (sales: SaleL[], now: number) => r2(sum(openSales(sales, now).filter((x) => x.age > TERMS_DAYS), (x) => x.bal));

// =====================================================================================================================
// Transport fees (USD)
// =====================================================================================================================
/** One loaded trip's transport money: agreed price (null = not recorded) and approved payments against it. */
export interface FeeLike { agreedUsd: number | null; paidUsd: number; ageDays?: number; reexport?: boolean; /** recorded payments waiting for a director's approval (USD) */ pendingUsd?: number }
/** From a trip with its cost lines and payments (finance.trips): the same rule as the fee rows (money.feeRows). */
export function feeOfTrip(x: { costs: (Pick<TripCost, 'id' | 'kind' | 'amount'> & { amountUsd?: number })[]; payments: Pick<TripPayment, 'costId' | 'status' | 'amount' | 'amountUsd'>[] }): FeeLike {
  const tr = x.costs.filter((c) => c.kind === 'Transport'); const ids = new Set(tr.map((c) => c.id));
  return {
    agreedUsd: tr.length ? r2(sum(tr, (c) => c.amountUsd ?? c.amount)) : null,
    paidUsd: r2(sum(x.payments.filter((p) => ids.has(p.costId) && p.status !== 'Pending approval'), (p) => p.amountUsd ?? p.amount)),
    pendingUsd: r2(sum(x.payments.filter((p) => ids.has(p.costId) && p.status === 'Pending approval'), (p) => p.amountUsd ?? p.amount)),
  };
}
const balanceOf = (f: FeeLike) => (f.agreedUsd === null ? 0 : Math.max(0, r2(f.agreedUsd - f.paidUsd)));
/** Trips with an agreed price not fully paid. */
export const openFees = <F extends FeeLike>(fees: F[]) => fees.filter((f) => balanceOf(f) > 0.005);
/** Transport owed = Σ (agreed − approved payments) over trips not fully paid. */
export const transportOwed = (fees: FeeLike[]) => r2(sum(openFees(fees), balanceOf));
/** Open fees at least `days` old (days since loading). */
export const feesOlderThan = <F extends FeeLike>(fees: F[], days: number) => openFees(fees).filter((f) => (f.ageDays ?? 0) >= days);
/** Trips with a transport payment recorded and waiting for a director's approval (it counts as paid only once approved). */
export const awaitingApproval = <F extends FeeLike>(fees: F[]) => fees.filter((f) => (f.pendingUsd ?? 0) > 0.005);
/** USD of those payments. */
export const awaitingApprovalUsd = (fees: FeeLike[]) => r2(sum(awaitingApproval(fees), (f) => f.pendingUsd ?? 0));
/** Loaded trips without an agreed transport price yet. */
export const priceNotRecorded = (fees: FeeLike[]) => fees.filter((f) => f.agreedUsd === null).length;

// =====================================================================================================================
// Profit (performance report, landed cost v2)
// =====================================================================================================================
export interface PerfLike { totals: { revenue: number; qtyReceived: number; landedCost: number; margin: number | null }; netProfit: number }
/** Profit = sales − cost of units sold (landed cost v2) − other warehouse costs; null without sales. */
export const profitOf = (p: PerfLike | null | undefined) => (p && p.totals.revenue ? p.netProfit : null);
/** Margin = profit ÷ sales (the same profit). */
export const marginOf = (p: PerfLike | null | undefined) => (p && p.totals.revenue ? Math.round((p.netProfit / p.totals.revenue) * 10000) / 10000 : null);
/** Landed cost per case of the goods received in the period. */
export const landedPerCaseOf = (p: PerfLike | null | undefined) => (p && p.totals.qtyReceived ? r2(p.totals.landedCost / p.totals.qtyReceived) : null);

// =====================================================================================================================
// Work-page summary strips (docs/17 Phase 1): orders by stage, period plans, loading queues, re-exports, warehouse
// expenses, selling prices. One definition each, so the page strip, Home and the phone agree.
// =====================================================================================================================
export type OrderLike = Pick<PurchaseOrder, 'status' | 'supersededById'> & { stage?: PoStage };
/** Purchase orders (latest revision, not deleted) at one stage now. */
export const ordersAtStage = (pos: OrderLike[], stage: PoStage) => pos.filter((p) => p.status !== 'Deleted' && !p.supersededById && p.stage === stage).length;

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export type PlanLike = Pick<PeriodPlan, 'status' | 'from' | 'to'>;
/** Active period plans covering today. */
export const plansInForce = <P extends PlanLike>(plans: P[], now: number) => plans.filter((p) => p.status === 'Active' && p.from <= ymd(now) && p.to >= ymd(now));
/** Active period plans that start after today. */
export const plansUpcoming = <P extends PlanLike>(plans: P[], now: number) => plans.filter((p) => p.status === 'Active' && p.from > ymd(now));
/** Planned vs actual measures (reports.plannedVsActual) → ordered ÷ planned and expected-by-today ÷ planned. */
export interface PvLike { planned: number; ordered: number; expectedToDate: number }
export const planUsed = (m: PvLike | null | undefined) => (m && m.planned ? Math.round((m.ordered / m.planned) * 1000) / 1000 : null);
export const planExpected = (m: PvLike | null | undefined) => (m && m.planned ? Math.round((m.expectedToDate / m.planned) * 1000) / 1000 : null);

export type WaitLike = Pick<WaitingEntry, 'status' | 'arrivedAt'> & { loadingPointId?: ID };
/** Trucks in a loading queue now (arrived, not yet given an order). */
export const trucksWaiting = <W extends WaitLike>(w: W[]) => w.filter((x) => x.status === 'Waiting');
/** Longest wait in a queue now, hours (0 when nobody waits). */
export const longestWaitHours = (w: WaitLike[], now: number) => Math.round(Math.max(0, ...trucksWaiting(w).map((x) => (now - t(x.arrivedAt)) / H)) * 10) / 10;
/** Trucks loaded today (UTC day). */
export const loadedToday = (loadings: Pick<Loading, 'status' | 'loadedAt'>[], now: number) => loadings.filter((l) => l.status === 'Loaded' && t(l.loadedAt) >= dayStartOf(now)).length;

/** Re-export orders at one status now. */
export const reexportsAt = (list: Pick<ReexportOrder, 'status'>[], status: ReexportStatus) => list.filter((x) => x.status === status).length;

export type ExpenseLike = Pick<WarehouseExpense, 'date' | 'amountUsd' | 'category'>;
/** Calendar month [from, to) containing `now`, shifted by `n` months. */
export const monthOf = (now: number, n = 0): Period => { const d = new Date(now); return { from: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1), to: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n + 1, 1) }; };
/** Warehouse expenses dated in the period, USD. */
export const expensesIn = (list: ExpenseLike[], p?: Period | null) => r2(sum(list.filter((x) => inP(t(x.date + 'T00:00:00Z'), p)), (x) => x.amountUsd));
/** The largest expense category in the period (null when nothing was spent). */
export function topExpenseCategory(list: ExpenseLike[], p?: Period | null): { category: string; usd: number } | null {
  const m = new Map<string, number>();
  for (const x of list) if (inP(t(x.date + 'T00:00:00Z'), p)) m.set(x.category, (m.get(x.category) ?? 0) + x.amountUsd);
  const [c, v] = [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return c === undefined ? null : { category: c, usd: r2(v!) };
}

/** A product's price line: selling price in force (null = none) and landed cost per case (null = unknown). */
export interface PriceLike { price: number | null; unit: number | null }
/** Products that sell or hold stock with no selling price in force. */
export const pricesMissing = <L extends PriceLike>(lines: L[]) => lines.filter((l) => l.price === null);
/** Prices in force whose margin over landed cost is under the target margin (share, e.g. 0.2). */
export const pricesBelowTarget = <L extends PriceLike>(lines: L[], target: number) => lines.filter((l) => l.price !== null && l.unit !== null && l.price > 0 && (l.price - l.unit) / l.price < target);

// The registry (key, label, definition, unit, compute) is in ./metric-registry.ts: kept out of this module so the
// definitions' text never lands in an app entry chunk that only needs these functions (the mock imports this module lazily).
