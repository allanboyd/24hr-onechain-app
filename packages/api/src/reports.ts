// Reports & planning — pure functions shared by the in-browser mock, the HTTP client and the NestJS server.
// Every input is a parameter (`now` included), so the same numbers come out everywhere and tests are exact.
// Definitions used throughout:
//   revenue = Σ cases × price on sales · gross margin = revenue − cases × landing cost per case of that SKU
//   on-time = a delivery whose final arrival is no later than planned arrival + 6 h
//   transit days = departure from the loading point → arrival at the final warehouse (all legs)
//   damage/short % = (expected − received + damaged) ÷ expected on acknowledgements
//   landing cost per case = (goods value + every trip cost) ÷ cases loaded, averaged over delivered trucks
//   (landed cost v2 — goods + truck + warehouse-expense share ÷ good cases received — and the combined performance
//   report, docs/14 B-06/B-07, live in ./performance.ts and use the same scoping via scopeReportData)
import { DAY, H, ORDER_COUNTS, coveringPlans, defaultPvThresholds, etaOf, fxFor, monthsIn, overdue, type StockMove } from './rules';
import type {
  Acknowledgement, Checkpoint, Driver, Entity, FxRate, ID, Plan, PriceListItem, Product, Provider, PurchaseOrder, Route, Sale, Shipment,
  StockRow, Supplier, Truck, TripCost, TripPayment, Warehouse, Loading, PeriodPlan, PeriodPlanLine, PvThresholds,
} from './types';

// ---- inputs --------------------------------------------------------------------------------------------
export interface ReportData {
  now: number;
  sales: Sale[]; shipments: Shipment[]; acks: Acknowledgement[]; costs: TripCost[]; payments: TripPayment[];
  plans: Plan[]; pos: PurchaseOrder[]; loadings: Loading[]; moves: StockMove[]; stock: StockRow[];
  products: Product[]; priceList: PriceListItem[]; warehouses: Warehouse[]; routes: Route[]; checkpoints: Checkpoint[];
  suppliers: Supplier[]; trucks: Truck[]; drivers: Driver[]; providers: Provider[]; entities: Entity[];
  /** Approved rates (units per USD) to convert non-USD sales and costs; amounts already carrying amountUsd use it. */
  fxRates?: FxRate[];
  /** Period plans (§8.3) and the planned-vs-actual flag thresholds (§8.14); optional for older callers. */
  periodPlans?: PeriodPlan[]; pvThresholds?: PvThresholds;
  /** Companies the caller may see (set by the server / mock); reports consolidate across them. null/absent = all. */
  entityScope?: ID[] | null;
  /** Set by scopeData: companies in scope and what consolidation removed. */
  scope?: { entityIds: ID[] | null; lessIntercompany: { revenue: number; cases: number; sales: number } };
}
export interface ReportFilter { from?: string; to?: string; warehouseId?: ID; productId?: ID; entityId?: ID }
export type GroupBy = 'day' | 'week' | 'month' | 'quarter';
export type PeriodPreset = 'last-30' | 'last-90' | 'this-month' | 'last-month' | 'this-quarter' | 'last-quarter' | 'ytd' | 'last-12m'
  | 'next-30' | 'next-60' | 'next-90' | 'next-quarter';

// ---- company scope, consolidation and currency ---------------------------------------------------------
/** Everything in USD: costs/payments use their stored amountUsd (else the approved month-average rate);
 *  non-USD sales are converted line by line. Idempotent. */
function inUsd(dt: ReportData): ReportData {
  const rates = dt.fxRates ?? [];
  const cv = (amount: number, ccy: string, at: string | number) => (ccy === 'USD' ? amount : r2(amount / fxFor(rates, ccy, at, 'avg')));
  const needSales = dt.sales.some((x) => x.currency !== 'USD');
  return {
    ...dt,
    costs: dt.costs.map((c) => (c.currency === 'USD' ? c : { ...c, amount: c.amountUsd ?? cv(c.amount, c.currency, dt.shipments.find((x) => x.id === c.shipmentId)?.legs[0]?.departedAt ?? dt.now), currency: 'USD' })),
    payments: dt.payments.map((p) => (p.amountUsd !== undefined && p.amountUsd !== p.amount ? { ...p, amount: p.amountUsd } : p)),
    sales: needSales ? dt.sales.map((x) => (x.currency === 'USD' ? x : { ...x, currency: 'USD', paid: cv(x.paid, x.currency, x.at), lines: x.lines.map((l) => ({ ...l, price: cv(l.price, x.currency, x.at) })) })) : dt.sales,
  };
}
const inSet = (ids: ID[] | null, e: ID | undefined) => !ids || (e !== undefined && ids.includes(e));
/** Restrict report inputs to companies (null = all) and consolidate: a sale between two in-scope sibling companies
 *  is removed together with its stock movements (seller's "sold", buyer's "transfer in"), so a multi-company view
 *  equals Σ companies − intercompany. Single-company views keep their intercompany sales (they are real revenue there). */
export function scopeData(dt: ReportData, entityIds: ID[] | null): ReportData {
  const all = dt.entities.map((e) => e.id);
  const ids = entityIds && entityIds.length ? entityIds : null;
  const multi = (ids ?? all).length > 1;
  const ic = dt.sales.filter((x) => x.counterpartyEntityId && multi && inSet(ids, x.entityId) && inSet(ids, x.counterpartyEntityId));
  const icRefs = new Set(ic.map((x) => x.ref));
  const icIds = new Set(ic.map((x) => x.id));
  const prev = dt.scope?.lessIntercompany ?? { revenue: 0, cases: 0, sales: 0 };
  const shipments = dt.shipments.filter((x) => inSet(ids, (x as Shipment & { entityId?: ID }).entityId));
  const shipIds = new Set(shipments.map((x) => x.id));
  const scoped: ReportData = {
    ...dt,
    sales: dt.sales.filter((x) => inSet(ids, x.entityId) && !icIds.has(x.id)),
    shipments, acks: dt.acks.filter((a) => shipIds.has(a.shipmentId)),
    costs: dt.costs.filter((c) => shipIds.has(c.shipmentId)), payments: dt.payments.filter((p) => shipIds.has(p.shipmentId)),
    // PO revisions made at loading: only the latest revision counts (superseded orders/POs stay viewable, never counted twice)
    plans: dt.plans.filter((x) => inSet(ids, x.entityId) && !x.supersededById), pos: dt.pos.filter((x) => inSet(ids, x.entityId) && !x.supersededById && x.status !== 'Deleted'),
    periodPlans: (dt.periodPlans ?? []).filter((x) => inSet(ids, x.entityId)), loadings: dt.loadings.filter((x) => inSet(ids, x.entityId)),
    moves: dt.moves.filter((m) => inSet(ids, m.entityId) && !icRefs.has(m.ref)),
    stock: icRefs.size ? stockWithoutIntercompany(dt, ids, icRefs) : dt.stock.filter((r) => inSet(ids, r.entityId)),
    scope: { entityIds: ids, lessIntercompany: { revenue: r2(prev.revenue + sum(ic, saleTotal)), cases: prev.cases + sum(ic, (x) => sum(x.lines, (l) => l.qty)), sales: prev.sales + ic.length } },
  };
  return inUsd(scoped);
}
/** Group stock rows with intercompany transfers netted out: the buyer's transfer-in and the seller's sale cancel. */
function stockWithoutIntercompany(dt: ReportData, ids: ID[] | null, icRefs: Set<string>) {
  const rows = dt.stock.filter((r) => inSet(ids, r.entityId)).map((r) => ({ ...r }));
  for (const m of dt.moves) {
    if (!icRefs.has(m.ref) || !inSet(ids, m.entityId)) continue;
    const r = rows.find((x) => x.entityId === m.entityId && x.warehouseId === m.warehouseId && x.productId === m.productId);
    if (!r) continue;
    if (m.kind === 'sold') { r.sold -= m.qty; r.closing += m.qty; }
    if (m.kind === 'transferIn') { r.transfersIn -= m.qty; r.closing -= m.qty; }
  }
  return rows;
}
/** Scope raw report data once: the filter's company if given (it must be inside the caller's scope), else the
 *  caller's whole scope (consolidated). Already-scoped data (nested report calls) is only narrowed. */
function prep(dt: ReportData, f: { entityId?: ID }): ReportData {
  if (dt.scope) {
    const cur = dt.scope.entityIds;
    if (!f.entityId || (cur?.length === 1 && cur[0] === f.entityId)) return dt;
    return scopeData(dt, [f.entityId]);
  }
  if (f.entityId && dt.entityScope && !dt.entityScope.includes(f.entityId)) return scopeData(dt, ['—none—']);
  return scopeData(dt, f.entityId ? [f.entityId] : dt.entityScope ?? null);
}

/** Scoping for report modules outside this file (performance.ts — landed cost v2 and the combined performance report,
 *  docs/14; a separate module so the apps' entry chunks stay small). */
export { prep as scopeReportData };

// ---- small helpers ------------------------------------------------------------------------------------
const r2 = (x: number) => Math.round(x * 100) / 100;
const r1 = (x: number) => Math.round(x * 10) / 10;
const pctChange = (cur: number, prev: number) => (prev ? (cur - prev) / Math.abs(prev) : null);
const saleTotal = (s: Sale) => s.lines.reduce((a, l) => a + l.qty * l.price, 0);
const t = (x?: string) => (x ? Date.parse(x) : NaN);
const dayStart = (ms: number) => Math.floor(ms / DAY) * DAY;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export function quantile(xs: number[], q: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b); const pos = (s.length - 1) * q; const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
const median = (xs: number[]) => quantile(xs, 0.5);
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

export function quarterOf(ms: number) { const d = new Date(ms); return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`; }
export function quarterRange(q: string) {
  const [y, n] = q.split('-Q').map(Number);
  return { from: Date.UTC(y, (n - 1) * 3, 1), to: Date.UTC(y, n * 3, 1) };
}
const shiftQuarter = (q: string, by: number) => { const [y, n] = q.split('-Q').map(Number); const i = y * 4 + (n - 1) + by; return `${Math.floor(i / 4)}-Q${(i % 4) + 1}`; };
export const quarterLabel = (q: string) => { const [y, n] = q.split('-Q'); return `Q${n} ${y}`; };

/** Resolve a preset to an ISO range [from, to). Future presets start today. */
export function resolvePeriod(p: PeriodPreset, now: number): { from: string; to: string; label: string } {
  const d0 = dayStart(now), d = new Date(now);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), q = Math.floor(m / 3);
  const R = (f: number, to: number, label: string) => ({ from: new Date(f).toISOString(), to: new Date(to).toISOString(), label });
  switch (p) {
    case 'last-30': return R(d0 - 29 * DAY, d0 + DAY, 'Last 30 days');
    case 'last-90': return R(d0 - 89 * DAY, d0 + DAY, 'Last 90 days');
    case 'this-month': return R(Date.UTC(y, m, 1), d0 + DAY, 'This month');
    case 'last-month': return R(Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1), 'Last month');
    case 'this-quarter': return R(Date.UTC(y, q * 3, 1), d0 + DAY, 'This quarter');
    case 'last-quarter': return R(Date.UTC(y, q * 3 - 3, 1), Date.UTC(y, q * 3, 1), 'Last quarter');
    case 'ytd': return R(Date.UTC(y, 0, 1), d0 + DAY, 'Year to date');
    case 'last-12m': return R(Date.UTC(y - 1, m + 1, 1), d0 + DAY, 'Last 12 months');
    case 'next-30': return R(d0 + DAY, d0 + 31 * DAY, 'Next 30 days');
    case 'next-60': return R(d0 + DAY, d0 + 61 * DAY, 'Next 60 days');
    case 'next-90': return R(d0 + DAY, d0 + 91 * DAY, 'Next 90 days');
    case 'next-quarter': return R(Date.UTC(y, q * 3 + 3, 1), Date.UTC(y, q * 3 + 6, 1), 'Next quarter');
  }
}
function rangeOf(f: ReportFilter, now: number, fallback: PeriodPreset = 'last-90') {
  const def = resolvePeriod(fallback, now);
  const from = f.from ? t(f.from) : t(def.from); const to = f.to ? t(f.to) : t(def.to);
  return { from, to };
}
function bucketKey(ms: number, g: GroupBy) {
  const d = new Date(ms);
  if (g === 'day') return ymd(ms);
  if (g === 'week') { const dow = (d.getUTCDay() + 6) % 7; return ymd(dayStart(ms) - dow * DAY); } // Monday
  if (g === 'month') return ymd(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  return ymd(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
}
function bucketLabel(key: string, g: GroupBy) {
  const d = new Date(key + 'T00:00:00Z');
  if (g === 'quarter') return quarterLabel(quarterOf(d.getTime()));
  if (g === 'month') return d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}
function nextBucket(key: string, g: GroupBy) {
  const d = new Date(key + 'T00:00:00Z');
  if (g === 'day') return ymd(d.getTime() + DAY);
  if (g === 'week') return ymd(d.getTime() + 7 * DAY);
  if (g === 'month') return ymd(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return ymd(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1));
}

export { landedCostMap } from './landed';
import { casesOnHand, deliveredAt, onTimeOf, openSales, owedByCustomers, salesPace, stockRisk, stockValue as stockValueOf } from './metrics';
import { landedCostMap } from './landed';

const finalAck = (sh: Shipment, acks: Acknowledgement[]) => { const last = sh.legs.at(-1); return last?.ackId ? acks.find((a) => a.id === last.ackId) : undefined; };
/** Completed deliveries with their timings (final acknowledgement inside the range). */
function deliveries(dt: ReportData, from: number, to: number, f: ReportFilter = {}) {
  const stopsOf = (id: ID) => dt.routes.find((r) => r.id === id)?.stops ?? [];
  const out: { sh: Shipment; ack: Acknowledgement; arrived: number; planned: number; departed: number; transitDays: number; onTime: boolean; lateHours: number; expected: number; lost: number; laneKey: string; laneName: string }[] = [];
  for (const sh of dt.shipments) {
    if (f.warehouseId && sh.warehouseId !== f.warehouseId) continue;
    if (f.productId && !sh.legs[0]?.lines.some((l) => l.productId === f.productId)) continue;
    // docs/18: a delivery = a trip signed for at its destination, dated by its arrival there (metrics.deliveredIn / onTimeOf)
    const ack = finalAck(sh, dt.acks); if (!ack || sh.status !== 'Acknowledged') continue;
    const arrived = deliveredAt(sh); if (!(arrived >= from && arrived < to)) continue;
    const last = sh.legs.at(-1)!; const first = sh.legs[0];
    const planned = t(last.plannedArrival);
    const departed = t(first.departedAt) || t(first.passes[0]?.departedAt);
    const lateHours = (arrived - planned) / H;
    const expected = sum(ack.lines, (l) => l.expected);
    const lost = sum(ack.lines, (l) => l.expected - l.received + l.damaged);
    const laneKey = sh.legs.map((l) => l.routeId).join('+');
    const laneName = sh.legs.map((l) => dt.routes.find((r) => r.id === l.routeId)?.name ?? l.routeId).join(' + ');
    void stopsOf;
    out.push({ sh, ack, arrived, planned, departed, transitDays: (arrived - departed) / DAY, onTime: onTimeOf(sh), lateHours, expected, lost, laneKey, laneName });
  }
  return out;
}

function salesIn(dt: ReportData, from: number, to: number, f: ReportFilter) {
  return dt.sales.filter((s) => { const at = t(s.at); return at >= from && at < to && (!f.warehouseId || s.warehouseId === f.warehouseId); })
    .map((s) => (f.productId ? { ...s, lines: s.lines.filter((l) => l.productId === f.productId) } : s)).filter((s) => s.lines.length);
}
function totals(xs: Sale[]) {
  const revenue = sum(xs, saleTotal); const paid = sum(xs, (s) => Math.min(s.paid, saleTotal(s)));
  return { revenue: r2(revenue), cases: sum(xs, (s) => sum(s.lines, (l) => l.qty)), orders: xs.length, paid: r2(paid), outstanding: r2(revenue - paid), avgPrice: 0 };
}

// ======================================================================================================
// SALES
// ======================================================================================================
export interface SalesReport {
  range: { from: string; to: string }; groupBy: GroupBy;
  totals: ReturnType<typeof totals>; prev: ReturnType<typeof totals>; lastYear: ReturnType<typeof totals>;
  series: { key: string; label: string; revenue: number; cases: number; lyRevenue: number | null; lyCases: number | null }[];
  byBrand: { productId: ID; brand: string; pack: string; revenue: number; cases: number; share: number; change: number | null }[];
  byWarehouse: { warehouseId: ID; name: string; revenue: number; cases: number; share: number; change: number | null }[];
  byKind: { kind: Sale['kind']; revenue: number; orders: number }[];
  topCustomers: { customer: string; revenue: number; cases: number; outstanding: number; orders: number }[];
  receivables: { buckets: { label: string; amount: number; count: number }[]; total: number };
  avgDailyCases: number;
}
export function salesReport(dt: ReportData, f: ReportFilter & { groupBy?: GroupBy } = {}): SalesReport {
  dt = prep(dt, f);
  const { from, to } = rangeOf(f, dt.now);
  const g: GroupBy = f.groupBy ?? (to - from > 120 * DAY ? 'month' : to - from > 35 * DAY ? 'week' : 'day');
  const len = to - from;
  const cur = salesIn(dt, from, to, f), prev = salesIn(dt, from - len, from, f), ly = salesIn(dt, from - 365 * DAY, to - 365 * DAY, f);
  const T = totals(cur); T.avgPrice = T.cases ? r2(T.revenue / T.cases) : 0;
  const P = totals(prev), L = totals(ly);
  // series with same-period-last-year values in the matching bucket
  const bucket = new Map<string, { revenue: number; cases: number }>(); const lyB = new Map<string, { revenue: number; cases: number }>();
  for (const s of cur) { const k = bucketKey(t(s.at), g); const b = bucket.get(k) ?? { revenue: 0, cases: 0 }; b.revenue += saleTotal(s); b.cases += sum(s.lines, (l) => l.qty); bucket.set(k, b); }
  for (const s of ly) { const k = bucketKey(t(s.at) + 365 * DAY, g); const b = lyB.get(k) ?? { revenue: 0, cases: 0 }; b.revenue += saleTotal(s); b.cases += sum(s.lines, (l) => l.qty); lyB.set(k, b); }
  const series: SalesReport['series'] = [];
  const firstSale = dt.sales.reduce((a, s) => Math.min(a, t(s.at)), Infinity);
  for (let k = bucketKey(from, g); t(k + 'T00:00:00Z') < to; k = nextBucket(k, g)) {
    const b = bucket.get(k), l = lyB.get(k);
    const lyKnown = t(nextBucket(k, g) + 'T00:00:00Z') - 365 * DAY > firstSale; // no history that far back → no comparison (not zero)
    series.push({ key: k, label: bucketLabel(k, g), revenue: r2(b?.revenue ?? 0), cases: b?.cases ?? 0, lyRevenue: lyKnown ? r2(l?.revenue ?? 0) : null, lyCases: lyKnown ? l?.cases ?? 0 : null });
  }
  const group = <K extends string>(xs: Sale[], key: (s: Sale, line: Sale['lines'][number]) => K) => {
    const m = new Map<K, { revenue: number; cases: number }>();
    for (const s of xs) for (const l of s.lines) { const k = key(s, l); const b = m.get(k) ?? { revenue: 0, cases: 0 }; b.revenue += l.qty * l.price; b.cases += l.qty; m.set(k, b); }
    return m;
  };
  const bb = group(cur, (_, l) => l.productId), bbp = group(prev, (_, l) => l.productId);
  const byBrand = [...bb].map(([productId, v]) => { const p = dt.products.find((x) => x.id === productId); return { productId, brand: p?.brand ?? productId, pack: p?.pack ?? '', revenue: r2(v.revenue), cases: v.cases, share: T.revenue ? v.revenue / T.revenue : 0, change: pctChange(v.revenue, bbp.get(productId)?.revenue ?? 0) }; }).sort((a, b) => b.revenue - a.revenue);
  const bw = group(cur, (s) => s.warehouseId), bwp = group(prev, (s) => s.warehouseId);
  const byWarehouse = [...bw].map(([warehouseId, v]) => ({ warehouseId, name: dt.warehouses.find((w) => w.id === warehouseId)?.name ?? warehouseId, revenue: r2(v.revenue), cases: v.cases, share: T.revenue ? v.revenue / T.revenue : 0, change: pctChange(v.revenue, bwp.get(warehouseId)?.revenue ?? 0) })).sort((a, b) => b.revenue - a.revenue);
  const kinds = new Map<Sale['kind'], { revenue: number; orders: number }>();
  for (const s of cur) { const k = kinds.get(s.kind) ?? { revenue: 0, orders: 0 }; k.revenue += saleTotal(s); k.orders++; kinds.set(s.kind, k); }
  const custs = new Map<string, { revenue: number; cases: number; outstanding: number; orders: number }>();
  for (const s of cur) { const name = s.customer || '(no customer recorded)'; const c = custs.get(name) ?? { revenue: 0, cases: 0, outstanding: 0, orders: 0 }; c.revenue += saleTotal(s); c.cases += sum(s.lines, (l) => l.qty); c.outstanding += Math.max(0, saleTotal(s) - s.paid); c.orders++; custs.set(name, c); }
  // receivables ageing as of the end of the range (all unpaid sales up to then)
  const asOf = Math.min(to, dt.now);
  // docs/18: owed by customers = metrics.openSales (unpaid and part-paid sales, value − paid)
  const recSales = dt.sales.filter((s) => !f.warehouseId || s.warehouseId === f.warehouseId);
  const unpaid = openSales(recSales, asOf);
  const bucketsDef = [{ label: '0–30 days', max: 30 }, { label: '31–60 days', max: 60 }, { label: '61–90 days', max: 90 }, { label: 'Over 90 days', max: Infinity }];
  const buckets = bucketsDef.map((b) => ({ label: b.label, amount: 0, count: 0 }));
  for (const x of unpaid) { const i = bucketsDef.findIndex((b) => x.age <= b.max); buckets[i].amount += x.bal; buckets[i].count++; }
  buckets.forEach((b) => (b.amount = r2(b.amount)));
  return {
    range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, groupBy: g, totals: T, prev: P, lastYear: L, series, byBrand, byWarehouse,
    byKind: [...kinds].map(([kind, v]) => ({ kind, revenue: r2(v.revenue), orders: v.orders })).sort((a, b) => b.revenue - a.revenue),
    topCustomers: [...custs].map(([customer, v]) => ({ customer, revenue: r2(v.revenue), cases: v.cases, outstanding: r2(v.outstanding), orders: v.orders })).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    receivables: { buckets, total: owedByCustomers(recSales, asOf) },
    avgDailyCases: r1(T.cases / Math.max(1, (Math.min(to, dt.now) - from) / DAY)),
  };
}

// ======================================================================================================
// QUARTERLY REVIEW
// ======================================================================================================
export interface Kpi { key: string; label: string; value: number; prev: number | null; ly: number | null; unit: 'usd' | 'cases' | 'pct' | 'days' | 'x'; upIsGood: boolean }
export interface QuarterlyReport {
  quarter: string; label: string; range: { from: string; to: string }; complete: boolean; elapsedPct: number;
  kpis: Kpi[];
  months: { key: string; label: string; revenue: number; lyRevenue: number; cases: number; margin: number }[];
  topBrands: { productId: ID; brand: string; pack: string; revenue: number; change: number | null; marginPct: number }[];
  bottomBrands: { productId: ID; brand: string; pack: string; revenue: number; change: number | null; marginPct: number }[];
  warehouses: { warehouseId: ID; name: string; revenue: number; change: number | null; marginPct: number; onTimePct: number | null; deliveries: number }[];
  highlights: string[];
  quarters: string[];
}
/** Stock (cases) per SKU at an instant, from the ledger. */
function stockAt(moves: StockMove[], at: number, wh?: ID) {
  let n = 0;
  for (const m of moves) { if (t(m.at) >= at || (wh && m.warehouseId !== wh)) continue; n += (m.kind === 'received' || m.kind === 'transferIn' || m.kind === 'adjustment' ? 1 : -1) * m.qty; }
  return n;
}
function periodMetrics(dt: ReportData, from: number, to: number, f: ReportFilter, landed: Map<ID, number>) {
  const xs = salesIn(dt, from, to, f);
  const T = totals(xs);
  const cogs = sum(xs, (s) => sum(s.lines, (l) => l.qty * (landed.get(l.productId) ?? 0)));
  const dl = deliveries(dt, from, to, f);
  const onTime = dl.length ? dl.filter((x) => x.onTime).length / dl.length : null;
  const transit = dl.length ? sum(dl, (x) => x.transitDays) / dl.length : null;
  const expected = sum(dl, (x) => x.expected), lost = sum(dl, (x) => x.lost);
  const sold = T.cases;
  const avgStock = (stockAt(dt.moves, from, f.warehouseId) + stockAt(dt.moves, Math.min(to, dt.now), f.warehouseId)) / 2;
  const end = Math.min(to, dt.now);
  const outstanding = sum(dt.sales.filter((s) => t(s.at) < end && (!f.warehouseId || s.warehouseId === f.warehouseId)), (s) => Math.max(0, saleTotal(s) - s.paid));
  return {
    revenue: T.revenue, cases: T.cases, margin: r2(T.revenue - cogs), marginPct: T.revenue ? (T.revenue - cogs) / T.revenue : 0,
    onTime, transit, damagePct: expected ? lost / expected : null, turns: avgStock > 0 ? sold / avgStock : null,
    cash: T.paid, outstanding: r2(outstanding), deliveries: dl.length,
  };
}
export function quarterlyReport(dt: ReportData, quarter?: string, f: ReportFilter = {}): QuarterlyReport {
  dt = prep(dt, f);
  // Default: the current quarter once it is at least a quarter done, otherwise the last complete one.
  const cq = quarterOf(dt.now); const cr = quarterRange(cq);
  const q = quarter ?? ((dt.now - cr.from) / (cr.to - cr.from) < 0.25 ? shiftQuarter(cq, -1) : cq);
  const { from, to } = quarterRange(q);
  const pq = quarterRange(shiftQuarter(q, -1)), lq = quarterRange(shiftQuarter(q, -4));
  const landed = landedCostMap(dt);
  const elapsed = Math.max(0, Math.min(1, (dt.now - from) / (to - from)));
  // A quarter in progress is compared like-for-like: the same number of days of the previous quarter / last year.
  const cut = (r: { from: number; to: number }) => ({ from: r.from, to: elapsed < 1 ? r.from + (r.to - r.from) * elapsed : r.to });
  const C = periodMetrics(dt, from, Math.min(to, dt.now), f, landed), P = periodMetrics(dt, cut(pq).from, cut(pq).to, f, landed), L = periodMetrics(dt, cut(lq).from, cut(lq).to, f, landed);
  const hasLy = dt.sales.some((s) => t(s.at) < lq.to && t(s.at) >= lq.from);
  const k = (key: string, label: string, unit: Kpi['unit'], get: (m: typeof C) => number | null, upIsGood = true): Kpi =>
    ({ key, label, unit, upIsGood, value: get(C) ?? 0, prev: get(P), ly: hasLy ? get(L) : null });
  const kpis: Kpi[] = [
    k('revenue', 'Sales revenue', 'usd', (m) => m.revenue), k('cases', 'Cases sold', 'cases', (m) => m.cases),
    k('margin', 'Gross margin', 'usd', (m) => m.margin), k('marginPct', 'Gross margin %', 'pct', (m) => m.marginPct),
    k('onTime', 'On-time deliveries', 'pct', (m) => m.onTime), k('transit', 'Average transit', 'days', (m) => m.transit, false),
    k('damage', 'Damaged or short', 'pct', (m) => m.damagePct, false), k('turns', 'Stock turns', 'x', (m) => m.turns),
    k('cash', 'Cash collected', 'usd', (m) => m.cash), k('outstanding', 'Outstanding (end)', 'usd', (m) => m.outstanding, false),
  ];
  // months of the quarter
  const months: QuarterlyReport['months'] = [];
  for (let i = 0; i < 3; i++) {
    const a = Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth() + i, 1), b = Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth() + i + 1, 1);
    const m = periodMetrics(dt, a, Math.min(b, dt.now), f, landed), ly = totals(salesIn(dt, a - 365 * DAY, b - 365 * DAY, f));
    months.push({ key: ymd(a), label: new Date(a).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }), revenue: a > dt.now ? 0 : m.revenue, lyRevenue: ly.revenue, cases: a > dt.now ? 0 : m.cases, margin: a > dt.now ? 0 : m.margin });
  }
  // brands
  const cur = salesIn(dt, from, Math.min(to, dt.now), f), prev = salesIn(dt, cut(pq).from, cut(pq).to, f);
  const byP = (xs: Sale[]) => { const mm = new Map<ID, { revenue: number; cases: number }>(); for (const s of xs) for (const l of s.lines) { const b = mm.get(l.productId) ?? { revenue: 0, cases: 0 }; b.revenue += l.qty * l.price; b.cases += l.qty; mm.set(l.productId, b); } return mm; };
  const bc = byP(cur), bp = byP(prev);
  const brands = [...bc].map(([productId, v]) => { const p = dt.products.find((x) => x.id === productId); const cogs = v.cases * (landed.get(productId) ?? 0); return { productId, brand: p?.brand ?? productId, pack: p?.pack ?? '', revenue: r2(v.revenue), change: pctChange(v.revenue, bp.get(productId)?.revenue ?? 0), marginPct: v.revenue ? (v.revenue - cogs) / v.revenue : 0 }; });
  const byChange = [...brands].filter((b) => b.change !== null).sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
  // warehouses
  const warehouses = dt.warehouses.filter((w) => !f.warehouseId || w.id === f.warehouseId).map((w) => {
    const ff = { ...f, warehouseId: w.id };
    const c = periodMetrics(dt, from, Math.min(to, dt.now), ff, landed), p = periodMetrics(dt, cut(pq).from, cut(pq).to, ff, landed);
    return { warehouseId: w.id, name: w.name, revenue: c.revenue, change: pctChange(c.revenue, p.revenue), marginPct: c.marginPct, onTimePct: c.onTime, deliveries: c.deliveries };
  }).sort((a, b) => b.revenue - a.revenue);
  // narrative
  const pc = (x: number | null) => (x === null ? 'n/a' : `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`);
  const usd = (x: number) => `USD ${x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? Math.round(x / 1e3) + 'K' : Math.round(x)}`;
  const highlights: string[] = [];
  const rv = kpis[0];
  highlights.push(`Sales ${usd(rv.value)}${elapsed < 1 ? ` so far (${Math.round(elapsed * 100)}% of the quarter)` : ''}: ${pc(pctChange(rv.value, rv.prev ?? 0))} on the previous quarter${rv.ly !== null ? `, ${pc(pctChange(rv.value, rv.ly))} on last year` : ''}.`);
  if (byChange[0]) {
    const best = byChange[0];
    const whBest = dt.warehouses.map((w) => ({ w, c: byP(cur.filter((s) => s.warehouseId === w.id)).get(best.productId)?.revenue ?? 0, p: byP(prev.filter((s) => s.warehouseId === w.id)).get(best.productId)?.revenue ?? 0 })).sort((a, b) => (b.c - b.p) - (a.c - a.p))[0];
    highlights.push(`${best.brand} ${best.pack} grew ${pc(best.change)} on the previous quarter${whBest && whBest.c > whBest.p ? `, driven by ${whBest.w.name}` : ''}.`);
  }
  const worst = byChange.at(-1);
  if (worst && (worst.change ?? 0) < -0.05) highlights.push(`${worst.brand} ${worst.pack} fell ${pc(worst.change)} — check stock availability and pricing.`);
  const ot = kpis.find((x) => x.key === 'onTime')!;
  const pp = (a: number, b: number | null) => (b === null ? '' : ` (${a - b >= 0 ? '+' : '−'}${Math.abs(Math.round((a - b) * 100))} points vs previous quarter)`);
  if (C.deliveries) highlights.push(`${Math.round(ot.value * 100)}% of ${C.deliveries} deliver${C.deliveries === 1 ? 'y' : 'ies'} arrived on time${pp(ot.value, ot.prev)}; average transit ${r1(C.transit ?? 0)} days.`);
  const dmg = kpis.find((x) => x.key === 'damage')!;
  if (dmg.value) highlights.push(`Damaged or short cases: ${(dmg.value * 100).toFixed(2)}% of received goods${dmg.prev !== null ? ` (previous quarter ${(dmg.prev * 100).toFixed(2)}%)` : ''}.`);
  highlights.push(`Outstanding customer balances ${usd(C.outstanding)} at ${elapsed < 1 ? 'today' : 'quarter end'}.`);
  const first = dt.sales.reduce((a, s) => Math.min(a, t(s.at)), dt.now);
  const quarters: string[] = []; for (let x = quarterOf(first); quarterRange(x).from <= dt.now; x = shiftQuarter(x, 1)) quarters.push(x);
  return {
    quarter: q, label: quarterLabel(q), range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, complete: elapsed >= 1, elapsedPct: elapsed,
    kpis, months, topBrands: [...brands].sort((a, b) => b.revenue - a.revenue).slice(0, 5), bottomBrands: byChange.slice(-3).reverse(), warehouses, highlights, quarters: quarters.reverse(),
  };
}

// ======================================================================================================
// LOGISTICS
// ======================================================================================================
export interface LogisticsReport {
  range: { from: string; to: string };
  delivered: number; onTimePct: number | null; prevOnTimePct: number | null; avgTransitDays: number | null; damagePct: number | null;
  lanes: { lane: string; name: string; trips: number; medianDays: number; p80Days: number; onTimePct: number; damagePct: number }[];
  borders: { checkpointId: ID; name: string; crossings: number; medianHours: number; p80Hours: number; plannedHours: number }[];
  delays: { reason: string; count: number; hours: number }[];
  drivers: { driverId: ID; name: string; trips: number; onTimePct: number; lostCases: number }[];
  trucks: { truckId: ID; reg: string; provider: string; trips: number; daysOnRoad: number; utilisationPct: number; avgLoadPct: number }[];
  open: { active: number; delayed: number; atBorder: number; overdue: number };
  trend: { key: string; label: string; onTimePct: number | null; deliveries: number; transitDays: number | null }[];
}
export function logisticsReport(dt: ReportData, f: ReportFilter = {}): LogisticsReport {
  dt = prep(dt, f);
  const { from, to } = rangeOf(f, dt.now);
  const dl = deliveries(dt, from, to, f), prev = deliveries(dt, from - (to - from), from, f);
  const lanes = new Map<string, typeof dl>();
  for (const x of dl) { if (!lanes.has(x.laneKey)) lanes.set(x.laneKey, []); lanes.get(x.laneKey)!.push(x); }
  const legsIn = dt.shipments.filter((sh) => !f.warehouseId || sh.warehouseId === f.warehouseId).flatMap((sh) => sh.legs.map((l) => ({ sh, l })))
    .filter(({ l }) => { const a = t(l.passes.at(-1)?.arrivedAt); return a >= from && a < to; });
  const border = new Map<ID, number[]>();
  for (const { l } of legsIn) for (const p of l.passes) {
    const cp = dt.checkpoints.find((c) => c.id === p.checkpointId);
    if (cp?.kind !== 'border' || !p.arrivedAt || !p.departedAt) continue;
    if (!border.has(cp.id)) border.set(cp.id, []); border.get(cp.id)!.push((t(p.departedAt) - t(p.arrivedAt)) / H);
  }
  const planned = (cpId: ID) => { for (const r of dt.routes) { const s = r.stops.find((x) => x.checkpointId === cpId); if (s) return s.plannedDwellHours; } return 0; };
  const delays = new Map<string, { count: number; hours: number }>();
  for (const { l } of legsIn) for (const i of l.issues) { const d = delays.get(i.reason) ?? { count: 0, hours: 0 }; d.count++; d.hours += i.fixedAt ? (t(i.fixedAt) - t(i.at)) / H : 0; delays.set(i.reason, d); }
  const drivers = new Map<ID, { trips: number; onTime: number; lost: number }>();
  for (const x of dl) for (const l of x.sh.legs) { const d = drivers.get(l.driverId) ?? { trips: 0, onTime: 0, lost: 0 }; d.trips++; d.onTime += x.onTime ? 1 : 0; const a = dt.acks.find((k) => k.id === l.ackId); d.lost += a ? sum(a.lines, (y) => y.expected - y.received + y.damaged) : 0; drivers.set(l.driverId, d); }
  const days = Math.max(1, (Math.min(to, dt.now) - from) / DAY);
  const trucks = new Map<ID, { trips: number; road: number; load: number[] }>();
  for (const { l } of legsIn) {
    const tr = trucks.get(l.truckId) ?? { trips: 0, road: 0, load: [] }; tr.trips++;
    tr.road += (t(l.passes.at(-1)?.arrivedAt) - (t(l.departedAt) || t(l.passes[0].departedAt))) / DAY;
    const cap = dt.trucks.find((x) => x.id === l.truckId)?.capacityCases ?? 2200; tr.load.push(sum(l.lines, (y) => y.loadedQty) / cap);
    trucks.set(l.truckId, tr);
  }
  const stopsOf = (id: ID) => dt.routes.find((r) => r.id === id)?.stops ?? [];
  const active = dt.shipments.filter((s) => s.status !== 'Acknowledged' && s.status !== 'Cancelled' && (!f.warehouseId || s.warehouseId === f.warehouseId));
  const activeLegs = active.map((s) => s.legs.find((l) => l.status !== 'Acknowledged')).filter(Boolean) as Shipment['legs'];
  // monthly trend (last 12 months up to the end of the range)
  const trend: LogisticsReport['trend'] = [];
  const endM = new Date(Math.min(to, dt.now));
  for (let i = 11; i >= 0; i--) {
    const a = Date.UTC(endM.getUTCFullYear(), endM.getUTCMonth() - i, 1), b = Date.UTC(endM.getUTCFullYear(), endM.getUTCMonth() - i + 1, 1);
    const xs = deliveries(dt, a, b, f);
    trend.push({ key: ymd(a), label: new Date(a).toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), onTimePct: xs.length ? xs.filter((x) => x.onTime).length / xs.length : null, deliveries: xs.length, transitDays: xs.length ? r1(sum(xs, (x) => x.transitDays) / xs.length) : null });
  }
  const expected = sum(dl, (x) => x.expected);
  return {
    range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
    delivered: dl.length, onTimePct: dl.length ? dl.filter((x) => x.onTime).length / dl.length : null,
    prevOnTimePct: prev.length ? prev.filter((x) => x.onTime).length / prev.length : null,
    avgTransitDays: dl.length ? r1(sum(dl, (x) => x.transitDays) / dl.length) : null, damagePct: expected ? sum(dl, (x) => x.lost) / expected : null,
    lanes: [...lanes].map(([lane, xs]) => ({ lane, name: xs[0].laneName, trips: xs.length, medianDays: r1(median(xs.map((x) => x.transitDays))), p80Days: r1(quantile(xs.map((x) => x.transitDays), 0.8)), onTimePct: xs.filter((x) => x.onTime).length / xs.length, damagePct: sum(xs, (x) => x.expected) ? sum(xs, (x) => x.lost) / sum(xs, (x) => x.expected) : 0 })).sort((a, b) => b.trips - a.trips),
    borders: [...border].map(([id, hs]) => ({ checkpointId: id, name: dt.checkpoints.find((c) => c.id === id)?.name ?? id, crossings: hs.length, medianHours: r1(median(hs)), p80Hours: r1(quantile(hs, 0.8)), plannedHours: planned(id) })).sort((a, b) => b.medianHours - a.medianHours),
    delays: [...delays].map(([reason, v]) => ({ reason, count: v.count, hours: Math.round(v.hours) })).sort((a, b) => b.hours - a.hours),
    drivers: [...drivers].map(([driverId, v]) => ({ driverId, name: dt.drivers.find((d) => d.id === driverId)?.name ?? driverId, trips: v.trips, onTimePct: v.trips ? v.onTime / v.trips : 0, lostCases: v.lost })).sort((a, b) => b.trips - a.trips),
    trucks: [...trucks].map(([truckId, v]) => { const tr = dt.trucks.find((x) => x.id === truckId); return { truckId, reg: tr?.reg ?? truckId, provider: dt.providers.find((p) => p.id === tr?.providerId)?.name ?? '', trips: v.trips, daysOnRoad: r1(v.road), utilisationPct: Math.min(1, v.road / days), avgLoadPct: v.load.length ? sum(v.load, (x) => x) / v.load.length : 0 }; }).sort((a, b) => b.daysOnRoad - a.daysOnRoad),
    open: {
      active: active.length, delayed: active.filter((s) => s.status === 'Delayed' || s.legs.some((l) => l.status !== 'Acknowledged' && etaOf(l, stopsOf(l.routeId), dt.now).state === 'Late' && etaOf(l, stopsOf(l.routeId), dt.now).hours >= 6)).length,
      atBorder: activeLegs.filter((l) => l.status === 'At border').length, overdue: activeLegs.filter((l) => overdue(l, stopsOf(l.routeId), 3, dt.now)).length,
    },
    trend,
  };
}

// ======================================================================================================
// INVENTORY
// ======================================================================================================
export type StockRisk = 'out' | 'stock-out risk' | 'low' | 'ok' | 'overstock' | 'dead';
export interface InventoryReport {
  totalValue: number; totalCases: number; inTransitCases: number; inTransitValue: number;
  byWarehouse: { warehouseId: ID; name: string; cases: number; value: number; coverDays: number | null; risks: number }[];
  rows: { warehouseId: ID; productId: ID; brand: string; pack: string; closing: number; inTransit: number; value: number; perDay: number; coverDays: number | null; risk: StockRisk; ageDays: number }[];
  ageing: { label: string; cases: number; value: number }[];
  riskCounts: Record<StockRisk, number>;
}
export function inventoryReport(dt: ReportData, f: ReportFilter = {}): InventoryReport {
  dt = prep(dt, f);
  const landed = landedCostMap(dt);
  // docs/18: pace, risk and value are the shared definitions (metrics.ts) — per company × warehouse × product
  const pace = salesPace(dt.stock, dt.sales, dt.now);
  const ageBuckets = [{ label: '0–30 days', max: 30 }, { label: '31–60 days', max: 60 }, { label: '61–90 days', max: 90 }, { label: 'Over 90 days', max: Infinity }];
  const ageing = ageBuckets.map((b) => ({ label: b.label, cases: 0, value: 0 }));
  const rows = dt.stock.filter((r) => (!f.warehouseId || r.warehouseId === f.warehouseId) && (!f.productId || r.productId === f.productId)).map((r) => {
    const { perDay, daysSinceSale } = pace(r); const cover = perDay ? r.closing / perDay : null;
    const cpc = r.landedCostPerCase ?? landed.get(r.productId) ?? 0;
    const risk: StockRisk = stockRisk(r.closing, perDay, daysSinceSale);
    // FIFO ageing: the closing stock is the most recent receipts; walk back through inbound moves
    let left = Math.max(0, r.closing), age = 0;
    const inbound = dt.moves.filter((m) => m.warehouseId === r.warehouseId && m.productId === r.productId && (m.kind === 'received' || m.kind === 'transferIn' || (m.kind === 'adjustment' && m.qty > 0))).sort((a, b) => t(b.at) - t(a.at));
    for (const m of inbound) {
      if (left <= 0) break;
      const take = Math.min(left, m.qty); const a = (dt.now - t(m.at)) / DAY;
      const i = ageBuckets.findIndex((b) => a <= b.max); ageing[i].cases += take; ageing[i].value += take * cpc;
      age = Math.max(age, a); left -= take;
    }
    const p = dt.products.find((x) => x.id === r.productId);
    return { warehouseId: r.warehouseId, productId: r.productId, brand: p?.brand ?? r.productId, pack: p?.pack ?? '', closing: r.closing, inTransit: r.inTransit, value: r2(Math.max(0, r.closing) * cpc), perDay: r1(perDay), coverDays: cover === null ? null : Math.round(cover), risk, ageDays: Math.round(age) };
  });
  const riskCounts = { out: 0, 'stock-out risk': 0, low: 0, ok: 0, overstock: 0, dead: 0 } as Record<StockRisk, number>;
  for (const r of rows) riskCounts[r.risk]++;
  const byWarehouse = dt.warehouses.filter((w) => !f.warehouseId || w.id === f.warehouseId).map((w) => {
    const xs = rows.filter((r) => r.warehouseId === w.id); const perDay = sum(xs, (r) => r.perDay); const cases = sum(xs, (r) => Math.max(0, r.closing));
    return { warehouseId: w.id, name: w.name, cases, value: r2(sum(xs, (r) => r.value)), coverDays: perDay ? Math.round(cases / perDay) : null, risks: xs.filter((r) => r.risk !== 'ok').length };
  });
  ageing.forEach((a) => (a.value = r2(a.value)));
  return {
    totalValue: r2(sum(rows, (r) => r.value)), totalCases: sum(rows, (r) => Math.max(0, r.closing)), inTransitCases: sum(rows, (r) => r.inTransit),
    inTransitValue: r2(sum(rows, (r) => r.inTransit * (landed.get(r.productId) ?? 0))), byWarehouse, rows: rows.sort((a, b) => b.value - a.value), ageing, riskCounts,
  };
}

// ======================================================================================================
// PLANNING — forecast, stock-out dates, suggested orders (plan earlier)
// ======================================================================================================
export const FORECAST_METHOD = 'Seasonal moving average: the average cases sold per day over the last 8 weeks, scaled for each future day by last year\'s pattern (that month\'s daily sales ÷ the same 8-week window last year). Without last-year data the 8-week average is used flat.';
export interface Lane { routeIds: ID[]; supplierId: ID; name: string; leadDays: number; transitDays: number; capacity: number }
export interface ForecastRow {
  warehouseId: ID; productId: ID; brand: string; pack: string; perDay: number; stock: number; inTransit: number;
  next30: number; next60: number; next90: number; stockOutDate: string | null; daysToStockOut: number | null; lane: Lane | null;
}
export interface Suggestion {
  warehouseId: ID; warehouse: string; productId: ID; brand: string; pack: string; supplierId: ID; supplier: string; lane: string; routeIds: ID[];
  trucks: number; cases: number; orderBy: string; arriveBy: string; stockOutDate: string | null; leadTimeDays: number;
  urgency: 'overdue' | 'this week' | 'soon'; estValue: number; text: string;
}
export interface PlanningReport { method: string; generatedAt: string; horizonDays: number; forecasts: ForecastRow[]; suggestions: Suggestion[]; byLane: { supplierId: ID; supplier: string; lane: string; trucks: number; cases: number; firstOrderBy: string }[] }

/** Daily forecast function for a warehouse × SKU (see FORECAST_METHOD). */
export function forecaster(dt: Pick<ReportData, 'sales' | 'now'>, wh: ID, pid: ID) {
  const daily = new Map<number, number>();
  for (const s of dt.sales) { if (s.warehouseId !== wh) continue; for (const l of s.lines) if (l.productId === pid) { const d = dayStart(t(s.at)); daily.set(d, (daily.get(d) ?? 0) + l.qty); } }
  const today = dayStart(dt.now);
  const win = (a: number, b: number) => { let n = 0; for (let d = a; d < b; d += DAY) n += daily.get(d) ?? 0; return n / Math.max(1, (b - a) / DAY); };
  const base = win(today - 56 * DAY, today);
  const lyWin = win(today - 365 * DAY - 56 * DAY, today - 365 * DAY);
  const monthLy = new Map<string, number>();
  const ly = (ms: number) => { const d = new Date(ms - 365 * DAY); const k = `${d.getUTCFullYear()}-${d.getUTCMonth()}`; if (!monthLy.has(k)) { const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); monthLy.set(k, win(a, b)); } return monthLy.get(k)!; };
  const hasLy = lyWin > 0;
  return { base, perDay: (ms: number) => (hasLy ? base * (ly(ms) / lyWin) : base) };
}

/** Lead time per lane: median actual transit on that lane from delivered history + 4 days to order and load. */
export function laneFor(dt: ReportData, wh: ID, pid: ID): Lane | null {
  const supplierId = dt.products.find((p) => p.id === pid)?.supplierId; if (!supplierId) return null;
  const hist = dt.shipments.filter((s) => s.warehouseId === wh && s.status === 'Acknowledged' && s.legs[0]?.lines.some((l) => l.productId === pid));
  let routeIds: ID[] | null = hist.length ? hist[hist.length - 1].legs.map((l) => l.routeId) : null;
  if (!routeIds) {
    const sup = dt.suppliers.find((s) => s.id === supplierId); const whCp = dt.warehouses.find((w) => w.id === wh)?.checkpointId;
    const direct = dt.routes.find((r) => r.stops[0]?.checkpointId === sup?.checkpointId && r.stops.at(-1)?.checkpointId === whCp);
    if (!direct) return null; routeIds = [direct.id];
  }
  const key = routeIds.join('+');
  const transits = hist.filter((s) => s.legs.map((l) => l.routeId).join('+') === key).map((s) => {
    const a = t(s.legs.at(-1)!.passes.at(-1)?.arrivedAt), dep = t(s.legs[0].departedAt); return (a - dep) / DAY;
  }).filter((x) => x > 0);
  const planned = routeIds.reduce((a, id) => { const r = dt.routes.find((x) => x.id === id); return a + (r ? r.stops.at(-1)!.plannedHours / 24 : 0); }, 0) + (routeIds.length - 1);
  const transitDays = transits.length ? median(transits) : planned;
  const capacity = Math.round(median(dt.trucks.map((x) => x.capacityCases)) || 2200);
  const name = routeIds.map((id) => dt.routes.find((r) => r.id === id)?.name ?? id).join(' + ');
  return { routeIds, supplierId, name, transitDays: r1(transitDays), leadDays: Math.ceil(transitDays + 4), capacity };
}

/** Cases arriving into each warehouse × SKU from shipments still on the road, by expected arrival day. */
function arrivals(dt: ReportData) {
  const stopsOf = (id: ID) => dt.routes.find((r) => r.id === id)?.stops ?? [];
  const out: { wh: ID; pid: ID; day: number; qty: number }[] = [];
  for (const s of dt.shipments) {
    if (s.status === 'Acknowledged' || s.status === 'Cancelled') continue;
    const leg = s.legs.find((l) => l.status !== 'Acknowledged'); if (!leg) continue;
    let eta = t(etaOf(leg, stopsOf(leg.routeId), dt.now).eta);
    if (leg.toId !== dt.warehouses.find((w) => w.id === s.warehouseId)?.checkpointId) eta += 2 * DAY; // a transfer leg still to come
    for (const l of leg.lines) out.push({ wh: s.warehouseId, pid: l.productId, day: Math.max(dayStart(dt.now), dayStart(eta)), qty: l.loadedQty });
  }
  return out;
}

export function planningReport(dt: ReportData, f: ReportFilter & { horizonDays?: number } = {}): PlanningReport {
  dt = prep(dt, f);
  const horizon = f.horizonDays ?? 90;
  const today = dayStart(dt.now);
  const arr = arrivals(dt);
  const forecasts: ForecastRow[] = []; const suggestions: Suggestion[] = [];
  const price = (pid: ID) => dt.priceList.find((x) => x.productId === pid)?.price ?? 0;
  const fmt = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  for (const r of dt.stock) {
    if ((f.warehouseId && r.warehouseId !== f.warehouseId) || (f.productId && r.productId !== f.productId)) continue;
    const fc = forecaster(dt, r.warehouseId, r.productId); const p = dt.products.find((x) => x.id === r.productId);
    const lane = laneFor(dt, r.warehouseId, r.productId);
    let stock = r.closing, out: number | null = r.closing <= 0 ? today : null;
    let n30 = 0, n60 = 0, n90 = 0;
    for (let i = 0; i < Math.max(horizon, 120); i++) {
      const day = today + i * DAY; const dem = fc.perDay(day);
      if (i < 30) n30 += dem; if (i < 60) n60 += dem; if (i < 90) n90 += dem;
      stock += sum(arr.filter((a) => a.wh === r.warehouseId && a.pid === r.productId && a.day === day), (a) => a.qty) - dem;
      if (out === null && stock <= 0) out = day;
    }
    const row: ForecastRow = { warehouseId: r.warehouseId, productId: r.productId, brand: p?.brand ?? r.productId, pack: p?.pack ?? '', perDay: r1(fc.base), stock: r.closing, inTransit: r.inTransit, next30: Math.round(n30), next60: Math.round(n60), next90: Math.round(n90), stockOutDate: out === null ? null : new Date(out).toISOString(), daysToStockOut: out === null ? null : Math.round((out - today) / DAY), lane };
    forecasts.push(row);
    if (out === null || !lane || fc.base <= 0) continue;
    const orderBy = out - (lane.leadDays + 3) * DAY;
    if (orderBy - today > 28 * DAY || out - today > horizon * DAY) continue; // nothing to decide yet
    // Order enough to cover the lead time + 30 days after arrival, net of stock and what is on the road.
    let need = 0; for (let i = 0; i < lane.leadDays + 30; i++) need += fc.perDay(today + i * DAY);
    need -= r.closing + r.inTransit;
    const trucks = Math.max(1, Math.ceil(need / lane.capacity));
    const urgency: Suggestion['urgency'] = orderBy < today ? 'overdue' : orderBy - today <= 7 * DAY ? 'this week' : 'soon';
    const sup = dt.suppliers.find((s) => s.id === lane.supplierId); const wh = dt.warehouses.find((w) => w.id === r.warehouseId);
    const ob = Math.max(orderBy, today);
    suggestions.push({
      warehouseId: r.warehouseId, warehouse: wh?.name ?? r.warehouseId, productId: r.productId, brand: row.brand, pack: row.pack, supplierId: lane.supplierId, supplier: sup?.code ?? lane.supplierId,
      lane: lane.name, routeIds: lane.routeIds, trucks, cases: trucks * lane.capacity, orderBy: new Date(ob).toISOString(), arriveBy: new Date(ob + lane.leadDays * DAY).toISOString(),
      stockOutDate: new Date(out).toISOString(), leadTimeDays: lane.leadDays, urgency, estValue: r2(trucks * lane.capacity * price(r.productId)),
      text: `Order ${trucks} truck${trucks > 1 ? 's' : ''} of ${row.brand} ${row.pack} from ${sup?.code ?? ''} by ${fmt(ob)} to avoid a stock-out in ${wh?.name ?? ''} on ${fmt(out)}.`,
    });
  }
  const byLane = new Map<string, { supplierId: ID; supplier: string; lane: string; trucks: number; cases: number; firstOrderBy: string }>();
  for (const s of suggestions) { const k = `${s.supplierId}|${s.lane}`; const b = byLane.get(k) ?? { supplierId: s.supplierId, supplier: s.supplier, lane: s.lane, trucks: 0, cases: 0, firstOrderBy: s.orderBy }; b.trucks += s.trucks; b.cases += s.cases; if (s.orderBy < b.firstOrderBy) b.firstOrderBy = s.orderBy; byLane.set(k, b); }
  const order = { overdue: 0, 'this week': 1, soon: 2 };
  return { method: FORECAST_METHOD, generatedAt: new Date(dt.now).toISOString(), horizonDays: horizon, forecasts: forecasts.sort((a, b) => (a.daysToStockOut ?? 999) - (b.daysToStockOut ?? 999)), suggestions: suggestions.sort((a, b) => order[a.urgency] - order[b.urgency] || a.orderBy.localeCompare(b.orderBy)), byLane: [...byLane.values()].sort((a, b) => a.firstOrderBy.localeCompare(b.firstOrderBy)) };
}

// ======================================================================================================
// FINANCE
// ======================================================================================================
export interface FinanceReport {
  range: { from: string; to: string };
  /** `agreedMissing` = trips whose agreed transport price is not recorded yet (docs/12 A-04): counted, never treated as zero. */
  totals: { goods: number; expenses: number; landing: number; transport: number; paid: number; balance: number; trips: number; perCase: number; agreedMissing: number };
  trend: { key: string; label: string; perCase: number | null; transportPerCase: number | null; trips: number }[];
  byLane: { lane: string; name: string; trips: number; perCase: number; transportPerCase: number }[];
  byBrand: { productId: ID; brand: string; pack: string; revenue: number; cogs: number; margin: number; marginPct: number }[];
  byProvider: { providerId: ID; name: string; trips: number; agreed: number; paid: number; balance: number; /** trips with no agreed price yet */ agreedMissing: number }[];
  payments: { dueAmount: number; dueTrips: number; overdueAmount: number; overdueTrips: number; pendingApproval: number; pendingCount: number };
  costMix: { kind: TripCost['kind']; amount: number }[];
}
function tripsOf(dt: ReportData) {
  const planOfPo = new Map(dt.pos.map((p) => [p.id, dt.plans.find((x) => x.id === p.planId)]));
  return dt.shipments.filter((s) => s.legs.length).map((s) => {
    const plan = planOfPo.get(s.poId);
    const cases = sum(s.legs[0].lines, (l) => l.loadedQty);
    const goods = sum(s.legs[0].lines, (l) => l.loadedQty * (plan?.lines.find((x) => x.productId === l.productId)?.price ?? dt.priceList.find((x) => x.productId === l.productId)?.price ?? 0));
    const costs = dt.costs.filter((c) => c.shipmentId === s.id);
    const transport = sum(costs.filter((c) => c.kind === 'Transport'), (c) => c.amount);
    const pays = dt.payments.filter((p) => p.shipmentId === s.id);
    const paid = sum(pays.filter((p) => p.status !== 'Pending approval'), (p) => p.amount);
    const loadedAt = t(s.legs[0].passes[0]?.departedAt) || t(s.legs[0].departedAt);
    const ack = finalAck(s, dt.acks);
    return { s, cases, goods, costs, agreedRecorded: costs.some((c) => c.kind === 'Transport'), expenses: sum(costs, (c) => c.amount), transport, paid, pending: sum(pays.filter((p) => p.status === 'Pending approval'), (p) => p.amount), pendingCount: pays.filter((p) => p.status === 'Pending approval').length, loadedAt, deliveredAt: ack ? t(ack.at) : NaN, lane: s.legs.map((l) => l.routeId).join('+'), laneName: s.legs.map((l) => dt.routes.find((r) => r.id === l.routeId)?.name ?? l.routeId).join(' + ') };
  });
}
export function financeReport(dt: ReportData, f: ReportFilter = {}): FinanceReport {
  dt = prep(dt, f);
  const { from, to } = rangeOf(f, dt.now);
  const all = tripsOf(dt).filter((x) => !f.warehouseId || x.s.warehouseId === f.warehouseId);
  const inR = all.filter((x) => x.loadedAt >= from && x.loadedAt < to);
  const T = { goods: r2(sum(inR, (x) => x.goods)), expenses: r2(sum(inR, (x) => x.expenses)), landing: 0, transport: r2(sum(inR, (x) => x.transport)), paid: r2(sum(inR, (x) => x.paid)), balance: 0, trips: inR.length, perCase: 0, agreedMissing: inR.filter((x) => !x.agreedRecorded).length };
  T.landing = r2(T.goods + T.expenses); T.balance = r2(T.transport - T.paid); T.perCase = r2(T.landing / Math.max(1, sum(inR, (x) => x.cases)));
  const trend: FinanceReport['trend'] = [];
  const endM = new Date(Math.min(to, dt.now));
  for (let i = 11; i >= 0; i--) {
    const a = Date.UTC(endM.getUTCFullYear(), endM.getUTCMonth() - i, 1), b = Date.UTC(endM.getUTCFullYear(), endM.getUTCMonth() - i + 1, 1);
    const xs = all.filter((x) => x.loadedAt >= a && x.loadedAt < b); const c = sum(xs, (x) => x.cases);
    trend.push({ key: ymd(a), label: new Date(a).toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), perCase: c ? r2((sum(xs, (x) => x.goods) + sum(xs, (x) => x.expenses)) / c) : null, transportPerCase: (() => { const rec = xs.filter((x) => x.agreedRecorded), rc = sum(rec, (x) => x.cases); return rc ? r2(sum(rec, (x) => x.transport) / rc) : null; })(), trips: xs.length });
  }
  const lanes = new Map<string, typeof inR>(); for (const x of inR) { if (!lanes.has(x.lane)) lanes.set(x.lane, []); lanes.get(x.lane)!.push(x); }
  const landed = landedCostMap(dt);
  const sx = salesIn(dt, from, to, f); const bp = new Map<ID, { revenue: number; cases: number }>();
  for (const s of sx) for (const l of s.lines) { const b = bp.get(l.productId) ?? { revenue: 0, cases: 0 }; b.revenue += l.qty * l.price; b.cases += l.qty; bp.set(l.productId, b); }
  const prov = new Map<ID, { trips: number; agreed: number; paid: number; missing: number }>();
  for (const x of inR) { const tr = dt.trucks.find((y) => y.id === x.s.legs[0].truckId); const id = tr?.providerId ?? '—'; const b = prov.get(id) ?? { trips: 0, agreed: 0, paid: 0, missing: 0 }; b.trips++; b.agreed += x.transport; b.paid += x.paid; if (!x.agreedRecorded) b.missing++; prov.set(id, b); }
  const open = all.filter((x) => x.transport - x.paid > 1);
  const overdueT = open.filter((x) => dt.now - x.loadedAt > 30 * DAY); // §17.5 follow-up period
  const mix = new Map<TripCost['kind'], number>(); for (const x of inR) for (const c of x.costs) mix.set(c.kind, (mix.get(c.kind) ?? 0) + c.amount);
  return {
    range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, totals: T, trend,
    byLane: [...lanes].map(([lane, xs]) => { const c = sum(xs, (x) => x.cases); return { lane, name: xs[0].laneName, trips: xs.length, perCase: r2((sum(xs, (x) => x.goods) + sum(xs, (x) => x.expenses)) / Math.max(1, c)), transportPerCase: r2(sum(xs, (x) => x.transport) / Math.max(1, c)) }; }).sort((a, b) => b.trips - a.trips),
    byBrand: [...bp].map(([productId, v]) => { const p = dt.products.find((x) => x.id === productId); const cogs = r2(v.cases * (landed.get(productId) ?? 0)); return { productId, brand: p?.brand ?? productId, pack: p?.pack ?? '', revenue: r2(v.revenue), cogs, margin: r2(v.revenue - cogs), marginPct: v.revenue ? (v.revenue - cogs) / v.revenue : 0 }; }).sort((a, b) => b.margin - a.margin),
    byProvider: [...prov].map(([providerId, v]) => ({ providerId, name: dt.providers.find((p) => p.id === providerId)?.name ?? providerId, trips: v.trips, agreed: r2(v.agreed), paid: r2(v.paid), balance: r2(v.agreed - v.paid), agreedMissing: v.missing })).sort((a, b) => b.balance - a.balance),
    payments: { dueAmount: r2(sum(open, (x) => x.transport - x.paid)), dueTrips: open.length, overdueAmount: r2(sum(overdueT, (x) => x.transport - x.paid)), overdueTrips: overdueT.length, pendingApproval: r2(sum(all, (x) => x.pending)), pendingCount: sum(all, (x) => x.pendingCount) },
    costMix: [...mix].map(([kind, amount]) => ({ kind, amount: r2(amount) })).sort((a, b) => b.amount - a.amount),
  };
}

// ======================================================================================================
// PERIOD — PLAN a future window
// ======================================================================================================
export interface PeriodForecastRow {
  warehouseId: ID; warehouse: string; productId: ID; brand: string; pack: string; supplierId: ID | null; supplier: string; lane: string; routeIds: ID[];
  demand: number; startStock: number; arriving: number; alreadyPlanned: number; projectedClosing: number; stockOutDate: string | null;
  requiredCases: number; gapCases: number; gapTrucks: number; orderBy: string | null; leadTimeDays: number | null; capacity: number;
  estPurchase: number; estLanding: number; plannedRefs: string[];
}
export interface PeriodForecast {
  range: { from: string; to: string }; days: number; method: string;
  rows: PeriodForecastRow[];
  totals: { demand: number; requiredCases: number; plannedCases: number; gapCases: number; gapTrucks: number; estPurchase: number; estLanding: number; budgetTransport: number };
  byLane: { supplierId: ID; supplier: string; lane: string; routeIds: ID[]; gapTrucks: number; gapCases: number; orderBy: string | null; text: string }[];
  alreadyPlanned: { ref: string; planId: ID; status: string; supplier: string; trucks: number; cases: number; arriveBy: string }[];
}
/** Plans/POs not yet loaded whose trucks would arrive in the window (Draft/Submitted/Approved). */
function plannedSupply(dt: ReportData) {
  const loadedLines = new Set(dt.loadings.filter((l) => l.status === 'Loaded').flatMap((l) => l.lines.map((x) => x.planLineId)));
  const out: { planId: ID; ref: string; status: string; supplierId: ID; whCp: ID | undefined; productId: ID; qty: number; arrive: number; routeId: ID }[] = [];
  for (const p of dt.plans) {
    if (!['Draft', 'Submitted', 'Approved'].includes(p.status)) continue;
    for (const l of p.lines) {
      if (loadedLines.has(l.id)) continue;
      const r = dt.routes.find((x) => x.id === l.routeId);
      const ready = Math.max(dayStart(dt.now), t(p.requiredBy) || dt.now);
      out.push({ planId: p.id, ref: p.ref, status: p.status, supplierId: p.supplierId, whCp: r?.stops.at(-1)?.checkpointId, productId: l.productId, qty: l.qty, arrive: ready + (r ? r.stops.at(-1)!.plannedHours * H : 4 * DAY), routeId: l.routeId });
    }
  }
  return out;
}
export function periodPlan(dt: ReportData, f: ReportFilter = {}): PeriodForecast {
  dt = prep(dt, f);
  const def = resolvePeriod('next-30', dt.now);
  const from = Math.max(dayStart(dt.now), f.from ? t(f.from) : t(def.from)); const to = f.to ? t(f.to) : t(def.to);
  const today = dayStart(dt.now);
  const arr = arrivals(dt); const planned = plannedSupply(dt); const landed = landedCostMap(dt);
  const price = (pid: ID) => dt.priceList.find((x) => x.productId === pid)?.price ?? 0;
  const fmt = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const rows: PeriodForecastRow[] = [];
  for (const r of dt.stock) {
    if ((f.warehouseId && r.warehouseId !== f.warehouseId) || (f.productId && r.productId !== f.productId)) continue;
    const fc = forecaster(dt, r.warehouseId, r.productId); if (fc.base <= 0 && r.closing <= 0) continue;
    const lane = laneFor(dt, r.warehouseId, r.productId);
    const wh = dt.warehouses.find((w) => w.id === r.warehouseId);
    const myPlanned = planned.filter((x) => x.productId === r.productId && x.whCp === wh?.checkpointId && x.arrive < to);
    // stock at the start of the window = today's stock − demand until then + arrivals until then
    let stock = r.closing, startStock = r.closing, demand = 0, arriving = 0, out: number | null = null;
    for (let day = today; day < to; day += DAY) {
      const inArr = sum(arr.filter((a) => a.wh === r.warehouseId && a.pid === r.productId && a.day === day), (a) => a.qty);
      const dem = fc.perDay(day);
      if (day === from) startStock = stock;
      if (day >= from) { demand += dem; arriving += inArr; }
      stock += inArr - dem;
      if (day >= from && out === null && stock <= 0) out = day;
    }
    if (from <= today) startStock = r.closing;
    const alreadyPlanned = sum(myPlanned, (x) => x.qty);
    // Required: end the window with 14 days of cover; supply = start stock + arrivals + already-planned trucks
    let endCover = 0; for (let i = 0; i < 14; i++) endCover += fc.perDay(to + i * DAY);
    const requiredCases = Math.max(0, Math.round(demand + endCover - startStock - arriving));
    const gapCases = Math.max(0, requiredCases - alreadyPlanned);
    const cap = lane?.capacity ?? 2200;
    const gapTrucks = gapCases > cap * 0.15 ? Math.ceil(gapCases / cap) : 0;
    const orderBy = !gapTrucks || !lane ? null : out !== null ? Math.max(today, out - (lane.leadDays + 3) * DAY) : Math.max(today, to - lane.leadDays * DAY - 14 * DAY);
    const sup = dt.suppliers.find((s) => s.id === lane?.supplierId);
    const cases = gapTrucks * cap;
    rows.push({
      warehouseId: r.warehouseId, warehouse: wh?.name ?? r.warehouseId, productId: r.productId, brand: dt.products.find((p) => p.id === r.productId)?.brand ?? r.productId, pack: dt.products.find((p) => p.id === r.productId)?.pack ?? '',
      supplierId: lane?.supplierId ?? null, supplier: sup?.code ?? '—', lane: lane?.name ?? 'No lane on record', routeIds: lane?.routeIds ?? [],
      demand: Math.round(demand), startStock: Math.round(startStock), arriving, alreadyPlanned, projectedClosing: Math.round(stock + alreadyPlanned),
      stockOutDate: out === null ? null : new Date(out).toISOString(), requiredCases, gapCases, gapTrucks, orderBy: orderBy === null ? null : new Date(orderBy).toISOString(), leadTimeDays: lane?.leadDays ?? null, capacity: cap,
      estPurchase: r2(cases * price(r.productId)), estLanding: r2(cases * (landed.get(r.productId) ?? price(r.productId) * 1.21)), plannedRefs: [...new Set(myPlanned.map((x) => x.ref))],
    });
  }
  const lanes = new Map<string, PeriodForecast['byLane'][number]>();
  for (const r of rows.filter((x) => x.gapTrucks && x.supplierId)) {
    const k = `${r.supplierId}|${r.lane}`; const b = lanes.get(k) ?? { supplierId: r.supplierId!, supplier: r.supplier, lane: r.lane, routeIds: r.routeIds, gapTrucks: 0, gapCases: 0, orderBy: r.orderBy, text: '' };
    b.gapTrucks += r.gapTrucks; b.gapCases += r.gapTrucks * r.capacity; if (r.orderBy && (!b.orderBy || r.orderBy < b.orderBy)) b.orderBy = r.orderBy; lanes.set(k, b);
  }
  for (const b of lanes.values()) {
    const items = rows.filter((r) => r.gapTrucks && `${r.supplierId}|${r.lane}` === `${b.supplierId}|${b.lane}`).map((r) => `${r.gapTrucks} × ${r.brand} ${r.pack}`).join(', ');
    b.text = `Still need ${b.gapTrucks} truck${b.gapTrucks > 1 ? 's' : ''} from ${b.supplier} (${items})${b.orderBy ? `, order by ${fmt(t(b.orderBy))}` : ''}.`;
  }
  const plansById = new Map<string, PeriodForecast['alreadyPlanned'][number]>();
  for (const x of planned.filter((y) => y.arrive >= from && y.arrive < to)) {
    const b = plansById.get(x.planId) ?? { ref: x.ref, planId: x.planId, status: x.status, supplier: dt.suppliers.find((s) => s.id === x.supplierId)?.code ?? '', trucks: 0, cases: 0, arriveBy: new Date(x.arrive).toISOString() };
    b.trucks++; b.cases += x.qty; plansById.set(x.planId, b);
  }
  const transportRate = (ids: ID[]) => sum(ids, (id) => { const xs = dt.costs.filter((c) => c.kind === 'Transport' && dt.shipments.find((s) => s.id === c.shipmentId)?.legs.some((l) => l.routeId === id && l.id === c.legId)); return xs.length ? median(xs.map((c) => c.amount)) : 1500; });
  return {
    range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, days: Math.round((to - from) / DAY), method: FORECAST_METHOD + ' Required cases leave 14 days of cover at the end of the window.',
    rows: rows.sort((a, b) => b.gapTrucks - a.gapTrucks || (a.stockOutDate ?? 'z').localeCompare(b.stockOutDate ?? 'z')),
    totals: {
      demand: sum(rows, (r) => r.demand), requiredCases: sum(rows, (r) => r.requiredCases), plannedCases: sum(rows, (r) => r.alreadyPlanned), gapCases: sum(rows, (r) => r.gapCases), gapTrucks: sum(rows, (r) => r.gapTrucks),
      estPurchase: r2(sum(rows, (r) => r.estPurchase)), estLanding: r2(sum(rows, (r) => r.estLanding)), budgetTransport: r2(sum([...lanes.values()], (b) => b.gapTrucks * transportRate(b.routeIds))),
    },
    byLane: [...lanes.values()].sort((a, b) => (a.orderBy ?? '').localeCompare(b.orderBy ?? '')),
    alreadyPlanned: [...plansById.values()],
  };
}

// ======================================================================================================
// PERIOD — CHECK a past window (capture audit / data completeness)
// ======================================================================================================
export type CaptureArea = 'Tracking' | 'Receiving' | 'Loading' | 'Purchase orders' | 'Transport payments' | 'Sales' | 'Stock ledger' | 'Quantities';
export interface CaptureIssue { id: string; area: CaptureArea; kind: string; severity: 'high' | 'medium' | 'low'; text: string; at: string; link: string; ref?: string }
export interface CaptureCheck {
  range: { from: string; to: string };
  score: number; // 0..1 overall
  areas: { area: CaptureArea; checked: number; issues: number; score: number }[];
  issues: CaptureIssue[];
  kinds: { kind: string; area: CaptureArea; count: number; severity: CaptureIssue['severity'] }[];
}
export function captureCheck(dt: ReportData, f: ReportFilter = {}): CaptureCheck {
  dt = prep(dt, f);
  const def = resolvePeriod('last-90', dt.now);
  const from = f.from ? t(f.from) : t(def.from); const to = Math.min(f.to ? t(f.to) : t(def.to), dt.now);
  const inR = (ms: number) => ms >= from && ms < to;
  const issues: CaptureIssue[] = []; const checked: Partial<Record<CaptureArea, number>> = {};
  const count = (a: CaptureArea, n = 1) => (checked[a] = (checked[a] ?? 0) + n);
  const add = (i: Omit<CaptureIssue, 'id'>) => issues.push({ ...i, id: `${i.kind}:${i.ref ?? i.link}:${issues.length}` });
  const reg = (id: ID) => dt.trucks.find((x) => x.id === id)?.reg ?? id;
  const cpName = (id: ID) => dt.checkpoints.find((c) => c.id === id)?.name ?? id;
  const whOk = (wh: ID) => !f.warehouseId || wh === f.warehouseId;
  const iso = (ms: number) => new Date(ms).toISOString();
  const fmt = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  // Tracking: dispatched legs whose passed checkpoints have no check-in
  for (const sh of dt.shipments) {
    if (!whOk(sh.warehouseId)) continue;
    for (const l of sh.legs) {
      const dep = t(l.departedAt) || t(l.passes[0]?.departedAt); if (!dep || !inR(dep)) continue;
      count('Tracking');
      const lastIdx = l.passes.reduce((a, p, i) => (p.arrivedAt ? i : a), -1);
      const missing = l.passes.slice(1, lastIdx).filter((p) => !p.arrivedAt);
      if (missing.length) add({ area: 'Tracking', kind: 'Missing check-ins', severity: 'medium', text: `${reg(l.truckId)} (${sh.ref}) passed ${missing.map((p) => cpName(p.checkpointId)).join(', ')} with no check-in recorded.`, at: iso(dep), link: `#/shipments/${sh.id}`, ref: sh.ref });
      // Receiving: arrived at the end of the leg but never acknowledged
      const arr = t(l.passes.at(-1)?.arrivedAt);
      if (l.status === 'Arrived' && !l.ackId && arr && dt.now - arr > DAY) add({ area: 'Receiving', kind: 'Arrived, not acknowledged', severity: 'high', text: `${reg(l.truckId)} (${sh.ref}) arrived at ${cpName(l.toId)} on ${fmt(arr)} and has no acknowledgement.`, at: iso(arr), link: `#/shipments/${sh.id}`, ref: sh.ref });
    }
  }
  // Receiving: discrepancies with no explanation
  for (const a of dt.acks) {
    if (!inR(t(a.at)) || !whOk(a.warehouseId)) continue;
    count('Receiving');
    const bad = a.lines.filter((l) => (l.received !== l.expected || l.damaged > 0) && !l.remarks?.trim());
    if (bad.length) { const sh = dt.shipments.find((s) => s.id === a.shipmentId); add({ area: 'Receiving', kind: 'Discrepancy not explained', severity: 'medium', text: `${sh?.ref ?? a.shipmentId}: ${bad.map((l) => `${l.expected - l.received + l.damaged} cases short/damaged`).join(', ')} at ${dt.warehouses.find((w) => w.id === a.warehouseId)?.name} with no remark.`, at: a.at, link: `#/shipments/${a.shipmentId}`, ref: sh?.ref }); }
  }
  // Loading: missing documents / transport price; quantity mismatches vs PO
  for (const ld of dt.loadings) {
    if (ld.status !== 'Loaded' || !inR(t(ld.loadedAt))) continue;
    count('Loading'); count('Quantities');
    const po = dt.pos.find((p) => p.id === ld.poId); const sh = dt.shipments.find((s) => s.poId === ld.poId && s.truckNo === ld.truckNo);
    const link = sh ? `#/shipments/${sh.id}` : '#/loading';
    if (!ld.documents?.length) add({ area: 'Loading', kind: 'No loading documents', severity: 'medium', text: `${po?.ref ?? ''} truck ${ld.truckNo} (${reg(ld.truckId)}) loaded with no delivery note, invoice or gate-pass photo.`, at: ld.loadedAt!, link, ref: po?.ref });
    // docs/12 A-04: the agreed price is recorded after loading (Truck desk) — flag it while it is still missing
    const agreed = Number(ld.agreedTransport) > 0 || (!!sh && dt.costs.some((c) => c.shipmentId === sh.id && c.kind === 'Transport'));
    if (!agreed) add({ area: 'Loading', kind: 'Agreed transport price not recorded', severity: 'high', text: `${po?.ref ?? ''} truck ${ld.truckNo} (${reg(ld.truckId)}): agreed transport price not recorded yet — record it on the Truck desk.`, at: ld.loadedAt!, link: '#/trucks', ref: po?.ref });
    for (const l of ld.lines) if (l.orderedQty && Math.abs(l.loadedQty - l.orderedQty) / l.orderedQty > 0.02)
      add({ area: 'Quantities', kind: 'Loaded ≠ ordered', severity: 'low', text: `${po?.ref ?? ''} truck ${ld.truckNo}: ordered ${l.orderedQty}, loaded ${l.loadedQty} cases of ${dt.products.find((p) => p.id === l.productId)?.brand ?? l.productId}.`, at: ld.loadedAt!, link, ref: po?.ref });
  }
  // Purchase orders approved but not sent
  for (const po of dt.pos) {
    if (!inR(t(po.approvedAt))) continue;
    count('Purchase orders');
    if (!po.sentAt && dt.now - t(po.approvedAt) > DAY) add({ area: 'Purchase orders', kind: 'PO not sent to supplier', severity: 'high', text: `${po.ref} was issued on ${fmt(t(po.approvedAt))} but never sent to the supplier export section.`, at: po.approvedAt, link: `#/pos/${po.id}`, ref: po.ref });
  }
  // Transport payments: overdue balances, payments without reference
  for (const tr of tripsOf(dt)) {
    if (!inR(tr.loadedAt) || !whOk(tr.s.warehouseId)) continue;
    count('Transport payments');
    if (tr.transport - tr.paid > 1 && dt.now - tr.loadedAt > 45 * DAY) add({ area: 'Transport payments', kind: 'Transport unpaid > 45 days', severity: 'medium', text: `${tr.s.ref}: USD ${Math.round(tr.transport - tr.paid)} of agreed transport still unpaid ${Math.round((dt.now - tr.loadedAt) / DAY)} days after loading.`, at: iso(tr.loadedAt), link: '#/finance', ref: tr.s.ref });
  }
  for (const p of dt.payments) {
    if (!inR(t(p.at))) continue;
    if (!p.reference?.trim()) { const sh = dt.shipments.find((s) => s.id === p.shipmentId); add({ area: 'Transport payments', kind: 'Payment without reference', severity: 'medium', text: `USD ${p.amount} paid on ${fmt(t(p.at))} for ${sh?.ref ?? p.shipmentId} has no M-Pesa or bank reference.`, at: p.at, link: '#/finance', ref: sh?.ref }); }
  }
  // Sales: missing customer, inconsistent payment status, silent days
  const salesR = dt.sales.filter((s) => inR(t(s.at)) && whOk(s.warehouseId));
  count('Sales', salesR.length);
  for (const s of salesR) {
    if (!s.customer?.trim()) add({ area: 'Sales', kind: 'Sale without customer', severity: 'low', text: `${s.ref} (${fmt(t(s.at))}) has no customer recorded.`, at: s.at, link: '#/sales?tab=list', ref: s.ref });
    const tot = saleTotal(s); const should = s.paid >= tot - 0.01 ? 'Paid' : s.paid > 0 ? 'Part-paid' : 'Unpaid';
    if (should !== s.status) add({ area: 'Sales', kind: 'Payment status inconsistent', severity: 'medium', text: `${s.ref}: marked ${s.status} but USD ${r2(s.paid)} of ${r2(tot)} recorded as paid.`, at: s.at, link: '#/sales?tab=list', ref: s.ref });
  }
  for (const w of dt.warehouses.filter((x) => whOk(x.id))) {
    const days = new Set(dt.sales.filter((s) => s.warehouseId === w.id).map((s) => ymd(t(s.at))));
    const usual = dt.sales.filter((s) => s.warehouseId === w.id && t(s.at) >= from - 60 * DAY && t(s.at) < to).length / Math.max(1, (to - from + 60 * DAY) / DAY);
    if (usual < 0.5) continue;
    for (let d = dayStart(from); d < dayStart(to); d += DAY) {
      if (days.has(ymd(d))) continue;
      add({ area: 'Sales', kind: 'No sales recorded on a trading day', severity: 'medium', text: `${w.name} recorded no sales on ${new Date(d).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })} (usually ${Math.round(usual)} a day) — possible missed capture.`, at: iso(d), link: '#/sales?tab=list', ref: w.name });
    }
  }
  // Stock ledger: rows without reference; balances that went negative
  const byKey = new Map<string, StockMove[]>();
  for (const m of dt.moves) { if (!whOk(m.warehouseId)) continue; const k = `${m.warehouseId}|${m.productId}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k)!.push(m); }
  for (const [k, ms] of byKey) {
    ms.sort((a, b) => t(a.at) - t(b.at));
    let run = 0, flagged = false;
    for (const m of ms) {
      run += (m.kind === 'received' || m.kind === 'transferIn' || m.kind === 'adjustment' ? 1 : -1) * m.qty;
      if (!inR(t(m.at))) continue;
      count('Stock ledger');
      const [wh, pid] = k.split('|');
      if (!m.ref?.trim()) add({ area: 'Stock ledger', kind: 'Ledger entry without reference', severity: 'medium', text: `${m.kind} of ${m.qty} cases of ${dt.products.find((p) => p.id === pid)?.brand ?? pid} at ${dt.warehouses.find((w) => w.id === wh)?.name ?? wh} on ${fmt(t(m.at))} has no document reference.`, at: m.at, link: '#/inventory?tab=list' });
      if (run < 0 && !flagged) { flagged = true; add({ area: 'Stock ledger', kind: 'Stock went negative', severity: 'high', text: `${dt.products.find((p) => p.id === pid)?.brand ?? pid} at ${dt.warehouses.find((w) => w.id === wh)?.name ?? wh} fell to ${run} cases on ${fmt(t(m.at))} — a receipt was probably not captured.`, at: m.at, link: '#/inventory?tab=list' }); }
    }
  }
  const areasAll: CaptureArea[] = ['Tracking', 'Receiving', 'Loading', 'Purchase orders', 'Transport payments', 'Sales', 'Stock ledger', 'Quantities'];
  const areas = areasAll.map((area) => { const n = checked[area] ?? 0; const k = issues.filter((i) => i.area === area).length; return { area, checked: n, issues: k, score: n ? Math.max(0, 1 - k / n) : 1 }; });
  const totalChecked = sum(areas, (a) => a.checked);
  const kinds = new Map<string, CaptureCheck['kinds'][number]>();
  for (const i of issues) { const b = kinds.get(i.kind) ?? { kind: i.kind, area: i.area, count: 0, severity: i.severity }; b.count++; kinds.set(i.kind, b); }
  const sev = { high: 0, medium: 1, low: 2 };
  return {
    range: { from: iso(from), to: iso(to) },
    // overall = average of the area scores (a few hundred clean sales must not hide a broken receiving process)
    score: totalChecked ? sum(areas.filter((a) => a.checked), (a) => a.score) / areas.filter((a) => a.checked).length : 1,
    areas, issues: issues.sort((a, b) => sev[a.severity] - sev[b.severity] || b.at.localeCompare(a.at)),
    kinds: [...kinds.values()].sort((a, b) => sev[a.severity] - sev[b.severity] || b.count - a.count),
  };
}

// ======================================================================================================
// DASHBOARD — one call for the director's command view
// ======================================================================================================
export interface DashboardReport {
  asOf: string;
  kpis: { revenue30: number; revenuePrev30: number; revenueLy30: number | null; cases30: number; casesPrev30: number; marginPct30: number; marginPctPrev30: number; onTimePct: number | null; onTimePrev: number | null; outstanding: number; outstandingPrev: number; stockValue: number; stockCover: number | null };
  spark: { revenue: number[]; cases: number[]; onTime: (number | null)[] };
  trend: { key: string; label: string; revenue: number; lyRevenue: number | null }[];
  quarter: { quarter: string; label: string; elapsedPct: number; revenue: number; prevSamePoint: number; lyFull: number | null; projected: number };
  logistics: { active: number; delayed: number; atBorder: number; overdue: number; onTimeTrend: { key: string; label: string; onTimePct: number | null }[] };
  suggestions: Suggestion[];
  movers: { up: { productId: ID; brand: string; pack: string; warehouse: string; change: number; revenue: number }[]; down: { productId: ID; brand: string; pack: string; warehouse: string; change: number; revenue: number }[] };
  capture: { score: number; issues: number; high: number };
  receivables: { label: string; amount: number }[];
}
export function dashboardReport(dt: ReportData, f: { entityId?: ID } = {}): DashboardReport {
  dt = prep(dt, f);
  const today = dayStart(dt.now);
  const a = today - 29 * DAY, b = today + DAY;
  const landed = landedCostMap(dt);
  const m = periodMetrics(dt, a, b, {}, landed), p = periodMetrics(dt, a - 30 * DAY, a, {}, landed);
  const lyS = salesIn(dt, a - 365 * DAY, b - 365 * DAY, {});
  const weekly = salesReport(dt, { from: new Date(today - 7 * 12 * DAY).toISOString(), to: new Date(b).toISOString(), groupBy: 'week' });
  // Trends end at the last complete month (a 10-day-old month would look like a collapse).
  const nowD = new Date(dt.now); const monthStart = Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), 1);
  const monthly = salesReport(dt, { from: new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - 12, 1)).toISOString(), to: new Date(monthStart).toISOString(), groupBy: 'month' });
  const logi = logisticsReport(dt, resolvePeriod('last-90', dt.now));
  const inv = inventoryReport(dt);
  const plan = planningReport(dt, { horizonDays: 60 });
  const q = quarterOf(dt.now); const qr = quarterRange(q);
  const elapsed = Math.max(0.01, Math.min(1, (dt.now - qr.from) / (qr.to - qr.from)));
  const qNow = totals(salesIn(dt, qr.from, b, {})).revenue;
  const pq = quarterRange(shiftQuarter(q, -1));
  const prevSame = totals(salesIn(dt, pq.from, pq.from + (pq.to - pq.from) * elapsed, {})).revenue;
  const lyq = quarterRange(shiftQuarter(q, -4)); const lyFull = dt.sales.some((s) => t(s.at) < lyq.from) ? totals(salesIn(dt, lyq.from, lyq.to, {})).revenue : null;
  // movers: brand × warehouse, last 30 days vs previous 30
  const pairs = new Map<string, { c: number; p: number }>();
  for (const s of dt.sales) { const at = t(s.at); const w = at >= a && at < b ? 'c' : at >= a - 30 * DAY && at < a ? 'p' : null; if (!w) continue; for (const l of s.lines) { const k = `${s.warehouseId}|${l.productId}`; const x = pairs.get(k) ?? { c: 0, p: 0 }; x[w] += l.qty * l.price; pairs.set(k, x); } }
  const mv = [...pairs].filter(([, v]) => v.p > 500).map(([k, v]) => { const [wh, pid] = k.split('|'); const pr = dt.products.find((x) => x.id === pid); return { productId: pid, brand: pr?.brand ?? pid, pack: pr?.pack ?? '', warehouse: dt.warehouses.find((w) => w.id === wh)?.name ?? wh, change: (v.c - v.p) / v.p, revenue: r2(v.c) }; }).sort((x, y) => y.change - x.change);
  const cap = captureCheck(dt, resolvePeriod('last-30', dt.now));
  const sr = salesReport(dt, resolvePeriod('last-30', dt.now));
  const perDay = sum(inv.rows, (r) => r.perDay);
  return {
    asOf: new Date(dt.now).toISOString(),
    kpis: { revenue30: m.revenue, revenuePrev30: p.revenue, revenueLy30: lyS.length ? totals(lyS).revenue : null, cases30: m.cases, casesPrev30: p.cases, marginPct30: m.marginPct, marginPctPrev30: p.marginPct, onTimePct: logi.onTimePct, onTimePrev: logi.prevOnTimePct, outstanding: m.outstanding, outstandingPrev: p.outstanding, stockValue: inv.totalValue, stockCover: perDay ? Math.round(inv.totalCases / perDay) : null },
    spark: { revenue: weekly.series.map((x) => x.revenue), cases: weekly.series.map((x) => x.cases), onTime: logi.trend.filter((x) => Date.parse(x.key) < monthStart).map((x) => x.onTimePct) },
    trend: monthly.series.map((x) => ({ key: x.key, label: x.label, revenue: x.revenue, lyRevenue: x.lyRevenue })),
    quarter: { quarter: q, label: quarterLabel(q), elapsedPct: elapsed, revenue: qNow, prevSamePoint: prevSame, lyFull, projected: r2(qNow / elapsed) },
    logistics: { ...logi.open, onTimeTrend: logi.trend.filter((x) => Date.parse(x.key) < monthStart).map((x) => ({ key: x.key, label: x.label, onTimePct: x.onTimePct })) },
    suggestions: plan.suggestions.slice(0, 6),
    movers: { up: mv.slice(0, 4).filter((x) => x.change > 0), down: mv.slice(-4).reverse().filter((x) => x.change < 0) },
    capture: { score: cap.score, issues: cap.issues.length, high: cap.issues.filter((i) => i.severity === 'high').length },
    receivables: sr.receivables.buckets.map((x) => ({ label: x.label, amount: x.amount })),
  };
}

// ======================================================================================================
// GROUP (directors): three sibling companies side by side, consolidated = Σ companies − intercompany
// ======================================================================================================
export interface CompanyKpis {
  revenue: number; cases: number; cogs: number; grossMargin: number; marginPct: number;
  stockValue: number; stockCases: number; stockTurns: number | null; onTimePct: number | null; deliveries: number;
  receivables: number; cashCollected: number; transportSpend: number; landingCostPerCase: number | null;
}
export interface GroupReport {
  range: { from: string; to: string };
  /** Consolidated: intercompany sales and their stock movements removed. */
  total: CompanyKpis;
  byEntity: Record<ID, CompanyKpis>;
  /** What was removed between the plain sum of companies and the consolidated total. */
  lessIntercompany: { revenue: number; cases: number; sales: number };
  league: ({ entityId: ID; code: string; name: string; shortName: string; share: number; revenueChange: number | null } & CompanyKpis)[];
  trend: { key: string; label: string; total: number; byEntity: Record<ID, number> }[];
  fxBasis: string;
}
function companyKpis(dt: ReportData, from: number, to: number): CompanyKpis {
  const landed = landedCostMap(dt);
  const m = periodMetrics(dt, from, to, {}, landed);
  const cogs = r2(m.revenue - m.margin);
  const stockValue = stockValueOf(dt.stock.map((r) => ({ ...r, landedCostPerCase: r.landedCostPerCase ?? landed.get(r.productId) ?? 0 }))) ?? 0;
  const stockCases = casesOnHand(dt.stock);
  const days = Math.max(1, (Math.min(to, dt.now) - from) / DAY);
  const dl = deliveries(dt, from, to);
  const ids = new Set(dl.map((x) => x.sh.id));
  const transport = sum(dt.costs.filter((c) => ids.has(c.shipmentId) && c.kind === 'Transport'), (c) => c.amount);
  const allCost = sum(dt.costs.filter((c) => ids.has(c.shipmentId)), (c) => c.amount);
  const plans = new Map(dt.pos.map((p) => [p.id, dt.plans.find((x) => x.id === p.planId)]));
  const goods = sum(dl, (x) => sum(x.sh.legs[0].lines, (l) => l.loadedQty * (plans.get(x.sh.poId)?.lines.find((pl) => pl.productId === l.productId)?.price ?? 0)));
  const cases = sum(dl, (x) => sum(x.sh.legs[0].lines, (l) => l.loadedQty));
  return {
    revenue: m.revenue, cases: m.cases, cogs, grossMargin: m.margin, marginPct: m.marginPct,
    stockValue, stockCases, stockTurns: stockValue > 0 ? r2((cogs / days) * 365 / stockValue) : null,
    onTimePct: m.onTime, deliveries: m.deliveries, receivables: m.outstanding, cashCollected: m.cash,
    transportSpend: r2(transport), landingCostPerCase: cases ? r2((goods + allCost) / cases) : null,
  };
}
export function groupReport(raw: ReportData, f: ReportFilter = {}): GroupReport {
  const { from, to } = rangeOf(f, raw.now);
  const ids = (raw.entityScope && raw.entityScope.length ? raw.entityScope : raw.entities.map((e) => e.id));
  const total = scopeData(raw, ids);
  const byEntity: Record<ID, CompanyKpis> = {};
  const prevRev: Record<ID, number> = {};
  const len = to - from;
  for (const e of ids) {
    const one = scopeData(raw, [e]);
    byEntity[e] = companyKpis(one, from, to);
    prevRev[e] = totals(salesIn(one, from - len, from, {})).revenue;
  }
  const T = companyKpis(total, from, to);
  // intercompany inside the period: Σ companies − this = consolidated total
  const icIn = raw.sales.filter((x) => x.counterpartyEntityId && ids.includes(x.entityId) && ids.includes(x.counterpartyEntityId) && t(x.at) >= from && t(x.at) < to);
  const usd = (amount: number, ccy: string, at: string) => (ccy === 'USD' ? amount : amount / fxFor(raw.fxRates ?? [], ccy, at, 'avg'));
  // shares of the plain sum of companies (so they add up to 100 %); intercompany is shown separately
  const gross = sum(ids, (e) => byEntity[e].revenue);
  const league = ids.map((e) => {
    const ent = raw.entities.find((x) => x.id === e);
    return { entityId: e, code: ent?.code ?? e, name: ent?.name ?? e, shortName: ent?.shortName ?? ent?.name ?? e, share: gross ? byEntity[e].revenue / gross : 0, revenueChange: pctChange(byEntity[e].revenue, prevRev[e]), ...byEntity[e] };
  }).sort((a, b) => b.revenue - a.revenue);
  // monthly revenue per company (last 12 complete months + current), consolidated total
  const nowD = new Date(raw.now);
  const trend: GroupReport['trend'] = [];
  for (let i = 12; i >= 0; i--) {
    const a = Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - i, 1), b = Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - i + 1, 1);
    const key = ymd(a); const row = { key, label: bucketLabel(key, 'month'), total: totals(salesIn(total, a, b, {})).revenue, byEntity: {} as Record<ID, number> };
    for (const e of ids) row.byEntity[e] = totals(salesIn(scopeData(raw, [e]), a, b, {})).revenue;
    trend.push(row);
  }
  return {
    range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, total: T, byEntity,
    lessIntercompany: { revenue: r2(sum(icIn, (x) => usd(saleTotal(x), x.currency, x.at))), cases: sum(icIn, (x) => sum(x.lines, (l) => l.qty)), sales: icIn.length }, league, trend,
    fxBasis: 'USD. Sales and costs at the approved month-average rate; stock and balances at the month-end (closing) rate.',
  };
}

// ---- Planned vs actual (§8.14 PV-01..PV-07, §10.1) -------------------------------------------------------
export type PvFlag = 'Behind plan' | 'On track' | 'Over plan' | 'Unplanned';
export interface PvFilter extends ReportFilter { supplierId?: ID }
/** usedPct is a PERCENTAGE (ordered ÷ planned × 100, e.g. 68.75), here and in byBrand[].usedPct. */
export interface PvMeasures { planned: number; ordered: number; variance: number; usedPct: number; expectedToDate: number; remaining: number }
export interface PvLine {
  planId: ID | null; planRef: string | null; lineId: ID | null; entityId: ID; supplierId: ID; productId: ID; destinationId: ID | null;
  planned: number; expectedToDate: number; ordered: number; remaining: number; variance: number; flag: PvFlag;
  pos: { id: ID; ref: string; date: string; cases: number }[];
}
export interface PlannedVsActual {
  range: { from: string; to: string; label: string }; thresholds: PvThresholds; method: string;
  measures: PvMeasures;
  months: { month: string; planned: number; ordered: number; cumPlanned: number; cumOrdered: number }[];
  today: string;
  /** usedPct is a percentage (0–100+), like measures.usedPct. */
  byBrand: { productId: ID; planned: number; ordered: number; usedPct: number; flag: PvFlag }[];
  lines: PvLine[];
  byEntity?: Record<ID, PvMeasures>;
}
export const PV_METHOD = 'Expected to date follows each line\'s monthly split (whole past months plus the elapsed share of the current month); lines without a split are spread evenly over the days of the plan. Ordered = cases on submitted, issued or approved purchase orders dated in the period (a PO revised at loading counts once, as its latest revision).';
const dms = (d: string) => Date.parse(d.slice(0, 10) + 'T00:00:00Z');
/** Share of a line planned inside [from, to] by month (monthly split, else even per day). */
function lineByMonth(pp: PeriodPlan, l: PeriodPlanLine): Record<string, number> {
  if (l.months && Object.keys(l.months).length) return { ...l.months };
  const days = Math.max(1, Math.round((dms(pp.to) - dms(pp.from)) / DAY) + 1);
  const out: Record<string, number> = {};
  for (let d = dms(pp.from); d <= dms(pp.to); d += DAY) { const m = ymd(d).slice(0, 7); out[m] = (out[m] ?? 0) + l.cases / days; }
  return out;
}
function expectedBy(pp: PeriodPlan, l: PeriodPlanLine, now: number): number {
  const today = ymd(now);
  if (today < pp.from) return 0;
  if (today >= pp.to) return l.cases;
  if (l.months && Object.keys(l.months).length) {
    const cur = today.slice(0, 7);
    const y = Number(cur.slice(0, 4)), mo = Number(cur.slice(5, 7));
    const daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const frac = Number(today.slice(8, 10)) / daysIn;
    return Object.entries(l.months).reduce((a, [m, v]) => a + (m < cur ? v : m === cur ? v * frac : 0), 0);
  }
  const days = Math.max(1, Math.round((dms(pp.to) - dms(pp.from)) / DAY) + 1);
  return l.cases * Math.min(1, (Math.round((dms(today) - dms(pp.from)) / DAY) + 1) / days);
}
function pvFlag(planned: number, ordered: number, expected: number, th: PvThresholds): PvFlag {
  if (planned <= 0) return 'Unplanned';
  if (ordered > planned * th.over) return 'Over plan';
  if (ordered < expected * th.behind) return 'Behind plan';
  return 'On track';
}
const measuresOf = (rows: PvLine[]): PvMeasures => {
  const planned = sum(rows, (r) => r.planned), ordered = sum(rows, (r) => r.ordered), expectedToDate = sum(rows, (r) => r.expectedToDate);
  return { planned: Math.round(planned), ordered, variance: Math.round(ordered - planned), usedPct: planned ? r1((ordered / planned) * 100) : 0, expectedToDate: Math.round(expectedToDate), remaining: Math.round(planned - sum(rows.filter((r) => r.planId), (r) => r.ordered)) };
};
export function plannedVsActual(raw: ReportData, f: PvFilter = {}): PlannedVsActual {
  const dt = prep(raw, f);
  const th = dt.pvThresholds ?? defaultPvThresholds;
  const today = ymd(dt.now);
  const approved = (dt.periodPlans ?? []).filter((p) => p.status === 'Active');
  // Default range: the active plans running today (else the current quarter).
  let from: string, to: string;
  {
    const live = approved.filter((p) => p.from <= today && today <= p.to);
    const q = quarterRange(quarterOf(dt.now));
    from = f.from?.slice(0, 10) ?? (live.length ? live.map((p) => p.from).sort()[0] : ymd(q.from));
    to = f.to?.slice(0, 10) ?? (live.length ? live.map((p) => p.to).sort().at(-1)! : ymd(q.to - 1));
  }
  const months = monthsIn(from, to);
  const keep = (l: { supplierId: ID; productId: ID }) => (!f.supplierId || l.supplierId === f.supplierId) && (!f.productId || l.productId === f.productId);
  const plans = approved.filter((p) => p.from <= to && from <= p.to);
  const rows: PvLine[] = []; const lineIndex = new Map<string, PvLine>();
  const monthPlanned: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
  for (const pp of plans) for (const l of pp.lines) {
    if (!keep(l)) continue;
    const bm = lineByMonth(pp, l);
    const planned = Object.entries(bm).reduce((a, [m, v]) => a + (months.includes(m) ? v : 0), 0);
    for (const [m, v] of Object.entries(bm)) if (m in monthPlanned) monthPlanned[m] += v;
    const row: PvLine = { planId: pp.id, planRef: pp.ref, lineId: l.id, entityId: pp.entityId, supplierId: l.supplierId, productId: l.productId, destinationId: l.destinationId,
      planned: Math.round(planned), expectedToDate: Math.round(expectedBy(pp, l, dt.now) * (l.cases ? planned / l.cases : 0)), ordered: 0, remaining: 0, variance: 0, flag: 'On track', pos: [] };
    rows.push(row); lineIndex.set(l.id, row);
  }
  // Ordered: submitted/approved orders dated in the range, linked to a plan line (stored link, else same company/supplier/SKU in a covering plan).
  const monthOrdered: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
  const unplanned = new Map<string, PvLine>();
  const destOf = (routeId: ID) => { const cp = dt.routes.find((r) => r.id === routeId)?.stops.at(-1)?.checkpointId; return dt.warehouses.find((w) => w.checkpointId === cp)?.id ?? null; };
  for (const o of dt.plans) {
    const d = o.date.slice(0, 10);
    if (!ORDER_COUNTS(o) || d < from || d > to) continue;
    const cover = coveringPlans(o, approved);
    for (const l of o.lines) {
      if (!keep({ supplierId: o.supplierId, productId: l.productId })) continue;
      const dest = destOf(l.routeId);
      const same = cover.flatMap((pp) => pp.lines).filter((x) => x.supplierId === o.supplierId && x.productId === l.productId && lineIndex.has(x.id));
      const link = l.periodLineId && lineIndex.has(l.periodLineId) ? l.periodLineId : (same.find((x) => x.destinationId === dest) ?? same[0])?.id;
      const po = { id: o.poId ?? o.id, ref: o.ref, date: d, cases: l.qty };
      if (d.slice(0, 7) in monthOrdered) monthOrdered[d.slice(0, 7)] += l.qty;
      const target = link ? lineIndex.get(link)! : (() => {
        const k = `${o.entityId}|${o.supplierId}|${l.productId}|${dest}`;
        if (!unplanned.has(k)) unplanned.set(k, { planId: null, planRef: null, lineId: null, entityId: o.entityId, supplierId: o.supplierId, productId: l.productId, destinationId: dest, planned: 0, expectedToDate: 0, ordered: 0, remaining: 0, variance: 0, flag: 'Unplanned', pos: [] });
        return unplanned.get(k)!;
      })();
      target.ordered += l.qty;
      const ex = target.pos.find((x) => x.id === po.id); if (ex) ex.cases += l.qty; else target.pos.push(po);
    }
  }
  for (const r of rows) { r.remaining = r.planned - r.ordered; r.variance = r.ordered - r.planned; r.flag = pvFlag(r.planned, r.ordered, r.expectedToDate, th); }
  for (const r of unplanned.values()) { r.remaining = -r.ordered; r.variance = r.ordered; rows.push(r); }
  let cp = 0, co = 0;
  const series = months.map((m) => { cp += monthPlanned[m]; co += monthOrdered[m]; return { month: m, planned: Math.round(monthPlanned[m]), ordered: monthOrdered[m], cumPlanned: Math.round(cp), cumOrdered: co }; });
  const brands = new Map<ID, { planned: number; ordered: number; expected: number }>();
  for (const r of rows) { const b = brands.get(r.productId) ?? { planned: 0, ordered: 0, expected: 0 }; b.planned += r.planned; b.ordered += r.ordered; b.expected += r.expectedToDate; brands.set(r.productId, b); }
  const byBrand = [...brands].map(([productId, b]) => ({ productId, planned: b.planned, ordered: b.ordered, usedPct: b.planned ? r1((b.ordered / b.planned) * 100) : 0, flag: pvFlag(b.planned, b.ordered, b.expected, th) }))
    .sort((a, b) => b.planned - a.planned);
  const ids = dt.scope?.entityIds ?? dt.entities.map((e) => e.id);
  const byEntity = ids.length > 1 ? Object.fromEntries(ids.map((e) => [e, measuresOf(rows.filter((r) => r.entityId === e))])) : undefined;
  return {
    range: { from, to, label: `${from} – ${to}` }, thresholds: th, method: PV_METHOD, measures: measuresOf(rows), months: series, today,
    byBrand, lines: rows.sort((a, b) => (a.flag === b.flag ? b.planned - a.planned : a.flag.localeCompare(b.flag))), ...(byEntity ? { byEntity } : {}),
  };
}
