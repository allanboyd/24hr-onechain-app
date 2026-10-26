// docs/18 (CHECKLIST F-0b, docs/17 F3): ONE definition for every figure that appears on more than one surface — Home
// dashboards (dashboards.ts, incl. the directors' Today view), the page summary tiles (web), the team app homes
// (apps/field/src/team/glance.ts), the server / mock summary and the exports. Each surface passes the data it already
// has for the person's scope; the functions below never re-scope, so the same scope and period give the same number.
// Pure, no I/O; `now` is always a parameter. Lazy-loaded with the pages that use it (not in the apps' entry chunks).
import { DAY, H, etaOf, overdue } from './rules';
import type { EtaInfo, ID, Leg, Loading, PurchaseOrder, RouteStop, Sale, Shipment, StockRow, TripCost, TripPayment } from './types';

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
export interface FeeLike { agreedUsd: number | null; paidUsd: number; ageDays?: number; reexport?: boolean }
/** From a trip with its cost lines and payments (finance.trips): the same rule as the fee rows (money.feeRows). */
export function feeOfTrip(x: { costs: (Pick<TripCost, 'id' | 'kind' | 'amount'> & { amountUsd?: number })[]; payments: Pick<TripPayment, 'costId' | 'status' | 'amount' | 'amountUsd'>[] }): FeeLike {
  const tr = x.costs.filter((c) => c.kind === 'Transport'); const ids = new Set(tr.map((c) => c.id));
  return {
    agreedUsd: tr.length ? r2(sum(tr, (c) => c.amountUsd ?? c.amount)) : null,
    paidUsd: r2(sum(x.payments.filter((p) => ids.has(p.costId) && p.status !== 'Pending approval'), (p) => p.amountUsd ?? p.amount)),
  };
}
const balanceOf = (f: FeeLike) => (f.agreedUsd === null ? 0 : Math.max(0, r2(f.agreedUsd - f.paidUsd)));
/** Trips with an agreed price not fully paid. */
export const openFees = <F extends FeeLike>(fees: F[]) => fees.filter((f) => balanceOf(f) > 0.005);
/** Transport owed = Σ (agreed − approved payments) over trips not fully paid. */
export const transportOwed = (fees: FeeLike[]) => r2(sum(openFees(fees), balanceOf));
/** Open fees at least `days` old (days since loading). */
export const feesOlderThan = <F extends FeeLike>(fees: F[], days: number) => openFees(fees).filter((f) => (f.ageDays ?? 0) >= days);
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
// The registry: key, label, plain-English definition and unit of each shared figure (docs/18).
// =====================================================================================================================
export type MetricUnit = 'trucks' | 'orders' | 'cases' | 'usd' | 'share' | 'stock lines' | 'trips';
/** What a surface hands to `compute`: only the parts that figure needs, already cut to the person's scope (sales in
 *  USD, intercompany removed in the Group view). Missing data → null ("No data yet"), never 0. */
export interface MetricSource {
  now: number; period?: Period | null;
  shipments?: Shipment[]; stopsOf?: (routeId: ID) => RouteStop[];
  loadings?: Pick<Loading, 'poId' | 'status'>[]; pos?: Pick<PurchaseOrder, 'id' | 'status' | 'supersededById'>[] | null;
  stock?: StockRow[]; sales?: (SaleL & Pick<Sale, 'entityId' | 'warehouseId'>)[];
  fees?: FeeLike[]; feeDays?: { amber: number; red: number };
  perf?: PerfLike | null;
}
export interface MetricDef { key: string; label: string; definition: string; unit: MetricUnit; period: boolean; compute: (s: MetricSource) => number | null }
const def = (key: string, label: string, unit: MetricUnit, period: boolean, definition: string, compute: (s: MetricSource) => number | null): MetricDef => ({ key, label, unit, period, definition, compute });
const fleet = (s: MetricSource) => (s.shipments && s.stopsOf ? fleetFigures({ shipments: s.shipments, stopsOf: s.stopsOf, now: s.now }) : null);
const has = <T>(x: T | undefined | null, f: (x: T) => number | null) => (x ? f(x) : null);
export const METRICS = {
  onRoad: /* @__PURE__ */ def('trucks-on-road', 'Trucks on the road', 'trucks', false, 'Trucks that have left the loading point and not yet arrived at the destination warehouse: the current leg is dispatched, in transit, at a border or delayed. Trucks still at the loading point (loaded, not left) and trucks that arrived but are not signed for yet are not counted.', (s) => fleet(s)?.onRoad ?? null),
  delayed: /* @__PURE__ */ def('trucks-delayed', 'Delayed', 'trucks', false, `Trucks on the road that are ${DELAY_HOURS} h or more behind the planned time, marked delayed, or with an open issue (breakdown, border hold, documents…).`, (s) => fleet(s)?.delayed ?? null),
  atBorder: /* @__PURE__ */ def('trucks-at-border', 'At a border', 'trucks', false, 'Trucks on the road stopped at a border now (delayed ones are counted as delayed).', (s) => fleet(s)?.atBorder ?? null),
  inTransit: /* @__PURE__ */ def('trucks-in-transit', 'In transit', 'trucks', false, 'Trucks on the road moving on plan: neither delayed nor at a border.', (s) => fleet(s)?.inTransit ?? null),
  noCheckin: /* @__PURE__ */ def('trucks-no-checkin', 'No check-in', 'trucks', false, `Trucks on the road whose next checkpoint check-in is more than ${CHECKIN_GRACE_HOURS} h overdue.`, (s) => fleet(s)?.noCheckin ?? null),
  arrivingToday: /* @__PURE__ */ def('arriving-today', 'Arriving today', 'trucks', false, 'Trucks on the road expected at their destination today (latest expected arrival).', (s) => fleet(s)?.arrivingToday ?? null),
  delivered: /* @__PURE__ */ def('delivered', 'Delivered', 'trucks', true, 'Truck trips signed for at their destination, counted on the day they arrived there. First trips from the supplier, onward trips between our warehouses and re-exports all count.', (s) => has(s.shipments, (x) => deliveredIn(x, s.period).length)),
  onTime: /* @__PURE__ */ def('on-time', 'On time', 'share', true, `Share of the trips delivered in the period that arrived at most ${DELAY_HOURS} h after the planned arrival.`, (s) => has(s.shipments, (x) => onTimeShare(x, s.period))),
  ordersToLoad: /* @__PURE__ */ def('orders-to-load', 'Orders awaiting loading', 'orders', false, 'Purchase orders (latest revision, not deleted, not waiting for approval) with at least one truck still to load.', (s) => has(s.loadings, (x) => ordersToLoad(x, s.pos))),
  trucksToLoad: /* @__PURE__ */ def('trucks-to-load', 'Trucks to load', 'trucks', false, 'Truck lines of those purchase orders not loaded yet.', (s) => has(s.loadings, (x) => trucksToLoad(x, s.pos).length)),
  stockValue: /* @__PURE__ */ def('stock-value', 'Stock value', 'usd', false, 'Cases on hand × landed cost per case of each product (goods + all trip costs ÷ cases loaded, over its deliveries; list price × 1.21 before its first delivery), USD.', (s) => has(s.stock, stockValue)),
  casesOnHand: /* @__PURE__ */ def('cases-on-hand', 'Cases on hand', 'cases', false, 'Cases in our warehouses now (received + transfers in − transfers out − damaged ± counts − sold), per company, warehouse and product; a negative balance counts as zero.', (s) => has(s.stock, casesOnHand)),
  stockInTransit: /* @__PURE__ */ def('stock-in-transit', 'In transit', 'cases', false, 'Cases loaded on trucks that are not signed for yet.', (s) => has(s.stock, casesInTransit)),
  needsAttention: /* @__PURE__ */ def('stock-needs-attention', 'Needs attention', 'stock lines', false, `Stock lines (company × warehouse × product) out of stock, under ${COVER_DAYS.low} days of cover, over ${COVER_DAYS.over} days, or without a sale in ${COVER_DAYS.noSaleDays} days. Cover = cases on hand ÷ cases sold per day over the last 30 days.`, (s) => (s.stock && s.sales ? needsAttention(s.stock, s.sales, s.now).length : null)),
  sales: /* @__PURE__ */ def('sales', 'Sales', 'usd', true, 'Cases × price of every sale dated in the period, USD at the approved month rate; sales between our own companies removed in the Group view.', (s) => has(s.sales, (x) => salesValue(x, s.period))),
  casesSold: /* @__PURE__ */ def('cases-sold', 'Cases sold', 'cases', true, 'Cases on every sale dated in the period (sales between our own companies removed in the Group view).', (s) => has(s.sales, (x) => casesSold(x, s.period))),
  owed: /* @__PURE__ */ def('owed-by-customers', 'Owed by customers', 'usd', false, 'Unpaid and part-paid sales now: sale value − amount paid, USD.', (s) => has(s.sales, (x) => owedByCustomers(x, s.now))),
  overdue: /* @__PURE__ */ def('overdue-by-customers', 'Overdue', 'usd', false, `The part of what customers owe on sales older than the ${TERMS_DAYS}-day payment terms.`, (s) => has(s.sales, (x) => overdueByCustomers(x, s.now))),
  transportOwed: /* @__PURE__ */ def('transport-owed', 'Transport owed', 'usd', false, 'Open balance to transporters: agreed transport price − approved payments, over trips not fully paid (payments waiting for a director are not deducted yet), USD.', (s) => has(s.fees, transportOwed)),
  feesAmber: /* @__PURE__ */ def('fees-over-amber', 'Unpaid over 14 days', 'trips', false, 'Trips with an open transport balance loaded at least the amber number of days ago (config [fees] amber_days, 14).', (s) => has(s.fees, (x) => feesOlderThan(x, s.feeDays?.amber ?? 14).length)),
  feesRed: /* @__PURE__ */ def('fees-over-red', 'Unpaid over 30 days', 'trips', false, 'Trips with an open transport balance loaded at least the red number of days ago (config [fees] red_days, 30).', (s) => has(s.fees, (x) => feesOlderThan(x, s.feeDays?.red ?? 30).length)),
  priceNotRecorded: /* @__PURE__ */ def('price-not-recorded', 'Agreed price not recorded', 'trips', false, 'Loaded trips (re-exports included) without an agreed transport price yet.', (s) => has(s.fees, priceNotRecorded)),
  landedPerCase: /* @__PURE__ */ def('landed-per-case', 'Landed cost per case', 'usd', true, 'Goods + truck costs + warehouse share of the goods received in the period ÷ cases received good (landed cost v2).', (s) => landedPerCaseOf(s.perf)),
  profit: /* @__PURE__ */ def('profit', 'Profit', 'usd', true, 'Sales − cost of units sold at landed cost v2 − warehouse costs of months with nothing received ("other"), USD.', (s) => profitOf(s.perf)),
  margin: /* @__PURE__ */ def('margin', 'Margin', 'share', true, 'Profit ÷ sales (the same profit as above).', (s) => marginOf(s.perf)),
} satisfies Record<string, MetricDef>;
export type MetricName = keyof typeof METRICS;
/** Every figure of the registry for one source (null where the source lacks the data). */
export const computeAll = (s: MetricSource) => Object.fromEntries(Object.entries(METRICS).map(([k, m]) => [k, m.compute(s)])) as Record<MetricName, number | null>;
