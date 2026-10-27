// docs/18 (CHECKLIST F-0b): the metric registry — key, label, plain-English definition, unit and compute function of every
// shared figure, built on the functions in ./metrics. Separate module so the definitions stay out of the apps' entry chunks
// (screens, Home and the tests import it; the mock / server summaries only need ./metrics).
import {
  CHECKIN_GRACE_HOURS, COVER_DAYS, DELAY_HOURS, TERMS_DAYS, casesInTransit, casesOnHand, casesSold, deliveredIn, expensesIn, feesOlderThan, fleetFigures,
  landedPerCaseOf, loadedToday, longestWaitHours, marginOf, monthOf, needsAttention, onTimeShare, ordersAtStage, ordersToLoad, overdueByCustomers,
  owedByCustomers, planUsed, plansInForce, plansUpcoming, priceNotRecorded, pricesBelowTarget, pricesMissing, profitOf, reexportsAt, salesValue, stockValue,
  topExpenseCategory, transportOwed, trucksToLoad, trucksWaiting,
  type ExpenseLike, type FeeLike, type OrderLike, type PerfLike, type Period, type PlanLike, type PriceLike, type PvLike, type WaitLike,
} from './metrics';
import type { ID, Loading, PurchaseOrder, ReexportOrder, RouteStop, Sale, Shipment, StockRow } from './types';
type SaleL = Pick<Sale, 'at' | 'lines' | 'paid' | 'status'>;

// =====================================================================================================================
// The registry: key, label, plain-English definition and unit of each shared figure (docs/18).
// =====================================================================================================================
export type MetricUnit = 'trucks' | 'orders' | 'cases' | 'usd' | 'share' | 'stock lines' | 'trips' | 'plans' | 'hours' | 'products';
/** What a surface hands to `compute`: only the parts that figure needs, already cut to the person's scope (sales in
 *  USD, intercompany removed in the Group view). Missing data → null ("No data yet"), never 0. */
export interface MetricSource {
  now: number; period?: Period | null;
  shipments?: Shipment[]; stopsOf?: (routeId: ID) => RouteStop[];
  loadings?: Pick<Loading, 'poId' | 'status'>[]; pos?: Pick<PurchaseOrder, 'id' | 'status' | 'supersededById'>[] | null;
  stock?: StockRow[]; sales?: (SaleL & Pick<Sale, 'entityId' | 'warehouseId'>)[];
  fees?: FeeLike[]; feeDays?: { amber: number; red: number };
  perf?: PerfLike | null;
  /** purchase orders with their stage (pos.list) */ orders?: OrderLike[];
  plans?: PlanLike[]; pv?: PvLike | null; waiting?: WaitLike[]; loaded?: Pick<Loading, 'status' | 'loadedAt'>[];
  reexports?: Pick<ReexportOrder, 'status'>[]; expenses?: ExpenseLike[]; priceLines?: PriceLike[]; targetMargin?: number;
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
  // work-page strips (docs/17 Phase 1)
  poAwaiting: /* @__PURE__ */ def('orders-awaiting-approval', 'Awaiting approval', 'orders', false, 'Purchase orders (latest revision, not deleted) waiting for a director to approve them before they go to the supplier. Only used when approvals are switched on.', (s) => has(s.orders, (x) => ordersAtStage(x, 'Awaiting approval'))),
  poNotSent: /* @__PURE__ */ def('orders-not-sent', 'Not sent', 'orders', false, 'Purchase orders (latest revision, not deleted) created and approved but not sent to the supplier yet.', (s) => has(s.orders, (x) => ordersAtStage(x, 'Created'))),
  poSent: /* @__PURE__ */ def('orders-sent', 'Sent, waiting to load', 'orders', false, 'Purchase orders (latest revision, not deleted) sent to the supplier with no truck loaded yet.', (s) => has(s.orders, (x) => ordersAtStage(x, 'Sent'))),
  poLoading: /* @__PURE__ */ def('orders-loading', 'Loading', 'orders', false, 'Purchase orders (latest revision, not deleted) with some trucks loaded and some still to load.', (s) => has(s.orders, (x) => ordersAtStage(x, 'Loading'))),
  poOnRoad: /* @__PURE__ */ def('orders-on-the-road', 'Orders on the road', 'orders', false, 'Purchase orders (latest revision, not deleted) with every truck loaded and at least one trip not yet signed for at its destination.', (s) => has(s.orders, (x) => ordersAtStage(x, 'On the road'))),
  plansInForce: /* @__PURE__ */ def('plans-in-force', 'In force', 'plans', false, 'Active period plans whose period covers today (plans replaced by a newer one are not counted).', (s) => has(s.plans, (x) => plansInForce(x, s.now).length)),
  plansUpcoming: /* @__PURE__ */ def('plans-upcoming', 'Upcoming', 'plans', false, 'Active period plans whose period starts after today.', (s) => has(s.plans, (x) => plansUpcoming(x, s.now).length)),
  planUsed: /* @__PURE__ */ def('plan-used', 'Plan used', 'share', true, 'Cases ordered on purchase orders in the period ÷ cases planned on the period plans for it (this quarter), compared with the share expected by today if orders were spread evenly.', (s) => planUsed(s.pv)),
  trucksWaiting: /* @__PURE__ */ def('trucks-waiting', 'Trucks waiting', 'trucks', false, 'Trucks in a loading point queue now: arrived and registered, not yet given an order to load.', (s) => has(s.waiting, (x) => trucksWaiting(x).length)),
  longestWait: /* @__PURE__ */ def('longest-wait', 'Longest wait', 'hours', false, 'Hours since the truck that has waited longest in a loading queue arrived (0 when nobody waits).', (s) => has(s.waiting, (x) => longestWaitHours(x, s.now))),
  loadedToday: /* @__PURE__ */ def('loaded-today', 'Loaded today', 'trucks', false, 'Trucks whose loading was completed today (UTC day).', (s) => has(s.loaded, (x) => loadedToday(x, s.now))),
  rxOpen: /* @__PURE__ */ def('reexports-open', 'Open', 'orders', false, 'Re-export orders raised and not loaded yet.', (s) => has(s.reexports, (x) => reexportsAt(x, 'Open'))),
  rxLoaded: /* @__PURE__ */ def('reexports-loaded', 'Loaded', 'orders', false, 'Re-export orders loaded on a truck that has not left yet.', (s) => has(s.reexports, (x) => reexportsAt(x, 'Loaded'))),
  rxInTransit: /* @__PURE__ */ def('reexports-in-transit', 'In transit', 'orders', false, 'Re-export orders on the road to the destination warehouse, not signed for yet.', (s) => has(s.reexports, (x) => reexportsAt(x, 'In transit'))),
  rxDelivered: /* @__PURE__ */ def('reexports-delivered', 'Delivered', 'orders', false, 'Re-export orders signed for at the destination warehouse (all time).', (s) => has(s.reexports, (x) => reexportsAt(x, 'Delivered'))),
  expensesMonth: /* @__PURE__ */ def('expenses-this-month', 'This month', 'usd', true, 'Warehouse expenses dated this calendar month (rent, salaries, utilities, …), USD at the approved month rate.', (s) => has(s.expenses, (x) => expensesIn(x, s.period ?? monthOf(s.now)))),
  expensesLastMonth: /* @__PURE__ */ def('expenses-last-month', 'Last month', 'usd', true, 'Warehouse expenses dated last calendar month, USD at the approved month rate.', (s) => has(s.expenses, (x) => expensesIn(x, monthOf(s.now, -1)))),
  expensesTop: /* @__PURE__ */ def('expenses-top-category', 'Largest category', 'usd', true, 'The expense category with the most spent this month, and how much, USD.', (s) => has(s.expenses, (x) => topExpenseCategory(x, s.period ?? monthOf(s.now))?.usd ?? null)),
  pricesMissing: /* @__PURE__ */ def('prices-missing', 'Missing prices', 'products', false, 'Product lines (company price and each warehouse that holds or sells the product) with no selling price in force today.', (s) => has(s.priceLines, (x) => pricesMissing(x).length)),
  pricesBelow: /* @__PURE__ */ def('prices-below-target', 'Below target margin', 'products', false, 'Product lines whose selling price in force earns less than the target margin over the landed cost per case (last 90 days). Margin = (price − landed cost) ÷ price.', (s) => has(s.priceLines, (x) => pricesBelowTarget(x, s.targetMargin ?? 0.2).length)),
} satisfies Record<string, MetricDef>;
export type MetricName = keyof typeof METRICS;
/** Every figure of the registry for one source (null where the source lacks the data). */
export const computeAll = (s: MetricSource) => Object.fromEntries(Object.entries(METRICS).map(([k, m]) => [k, m.compute(s)])) as Record<MetricName, number | null>;
