// docs/18 (CHECKLIST F-0b): the page summary tiles and chips of the web pages, computed with the shared metric registry
// (packages/api/src/metrics.ts) so a figure is the same here, on Home and on the phone. Pure functions — the pages pass
// what they loaded; the consistency test (packages/api/test/metrics.test.ts) calls these same functions.
import * as MX from '@btw/api/metrics';
import { METRICS, type MetricName } from '@btw/api/metric-registry';
import type { ID, Loading, PurchaseOrder, ReexportOrder, RouteStop, SalesReport, Shipment, StockRow, TransportFeeRow, VelocityRow } from '@btw/api';

export type StopsOf = (routeId: ID) => RouteStop[];

/** Shipments page chips and overview tiles (now; delivered = all time). */
export function shipmentTiles(list: Shipment[], stopsOf: StopsOf, now = Date.now()) {
  const road = MX.onTheRoad({ shipments: list, stopsOf, now });
  const state = new Map(road.map((x) => [x.sh.id, x]));
  return {
    ...MX.fleetFigures({ shipments: list, stopsOf, now }),
    delivered: MX.deliveredIn(list).length, onTime: MX.onTimeShare(list),
    /** chip filters, one per figure */
    is: {
      road: (s: Shipment) => state.has(s.id), delayed: (s: Shipment) => state.get(s.id)?.state === 'Delayed', border: (s: Shipment) => state.get(s.id)?.state === 'At border',
      noCheckin: (s: Shipment) => !!state.get(s.id)?.noCheckin, delivered: (s: Shipment) => s.status === 'Acknowledged',
    },
  };
}
/** Purchase orders page: trucks to load on live orders, delivered trips, trucks on the road. */
export function poTiles(orders: PurchaseOrder[], loads: Loading[], ships: Shipment[], stopsOf: StopsOf, now = Date.now()) {
  return { toLoad: MX.trucksToLoad(loads, orders).length, ordersToLoad: MX.ordersToLoad(loads, orders), delivered: MX.deliveredIn(ships).length, onRoad: MX.fleetFigures({ shipments: ships, stopsOf, now }).onRoad };
}
/** Loading page: truck lines still to load at these loading points. */
export const loadingTiles = (loads: Loading[], pointIds: Set<ID>) => ({ toLoad: MX.trucksToLoad(loads.filter((l) => pointIds.has(l.loadingPointId))).length });
/** Inventory: stock value (null without prices), cases on hand, in transit, lines needing attention. */
export function inventoryTiles(rows: StockRow[], vel: VelocityRow[], money: boolean) {
  return { value: money ? MX.stockValue(rows) : null, cases: MX.casesOnHand(rows), transit: MX.casesInTransit(rows), attention: MX.needsAttentionBy(rows, MX.paceFromVelocity(vel)).length };
}
/** Transport fees page. */
export function feeTiles(rows: TransportFeeRow[], amberDays: number, redDays: number) {
  return { balance: MX.transportOwed(rows), open: MX.openFees(rows).length, amber: MX.feesOlderThan(rows, amberDays).length, red: MX.feesOlderThan(rows, redDays).length, missing: MX.priceNotRecorded(rows), awaiting: MX.awaitingApproval(rows).length, pending: MX.awaitingApprovalUsd(rows) };
}
/** Trip financials and the truck desk (finance.trips): the same transport figures from the trips' cost lines and payments. */
export function tripMoneyTiles(trips: Parameters<typeof MX.feeOfTrip>[0][]) {
  const fees = trips.map(MX.feeOfTrip);
  return { owed: MX.transportOwed(fees), missing: MX.priceNotRecorded(fees), awaiting: MX.awaitingApproval(fees).length, pending: MX.awaitingApprovalUsd(fees), agreed: Math.round(fees.reduce((a, f) => a + (f.agreedUsd ?? 0), 0) * 100) / 100 };
}
/** Sales page and its overview: sales, cases sold and what customers owe, from the sales report (every sale, USD,
 *  intercompany removed in the Group view — computed with the shared definitions in reports.salesReport). */
export const salesTiles = (rep: Pick<SalesReport, 'totals' | 'receivables'>) => ({ sales: rep.totals.revenue, cases: rep.totals.cases, owed: rep.receivables.total, overdue: rep.receivables.overdue ?? null });

// ---- docs/17 Phase 1: summary strips of the work pages (each value from the registry; `info` = its definition) ----
/** ⓘ text of a registry figure (the same definition as on Home and in the dashboard exports). */
export const infoOf = (k: MetricName) => METRICS[k].definition;
/** Purchase orders by stage (latest revision, not deleted). */
export function poStageTiles(orders: MX.OrderLike[]) {
  return { awaiting: MX.ordersAtStage(orders, 'Awaiting approval'), notSent: MX.ordersAtStage(orders, 'Created'), sent: MX.ordersAtStage(orders, 'Sent'), loading: MX.ordersAtStage(orders, 'Loading'), onRoad: MX.ordersAtStage(orders, 'On the road') };
}
/** Period plans: in force, upcoming, and this quarter's plan used vs expected by today (null without a plan). */
export function planTiles(plans: MX.PlanLike[], pv: MX.PvLike | null, now = Date.now()) {
  return { inForce: MX.plansInForce(plans, now).length, upcoming: MX.plansUpcoming(plans, now).length, used: MX.planUsed(pv), expected: MX.planExpected(pv) };
}
/** Loading queues (Truck desk · Queues): trucks waiting, longest wait (h), truck lines to load, loaded today. */
export function queueTiles(waiting: MX.WaitLike[], loads: Loading[], orders?: PurchaseOrder[] | null, now = Date.now()) {
  return { waiting: MX.trucksWaiting(waiting).length, longest: MX.longestWaitHours(waiting, now), toLoad: MX.trucksToLoad(loads, orders).length, loadedToday: MX.loadedToday(loads, now) };
}
/** Re-export orders by status. */
export const reexportTiles = (list: Pick<ReexportOrder, 'status'>[]) => ({ open: MX.reexportsAt(list, 'Open'), loaded: MX.reexportsAt(list, 'Loaded'), transit: MX.reexportsAt(list, 'In transit'), delivered: MX.reexportsAt(list, 'Delivered') });
/** Warehouse expenses: this month, last month, change (share, null without last month) and the largest category this month. */
export function expenseTiles(list: MX.ExpenseLike[], now = Date.now()) {
  const month = MX.expensesIn(list, MX.monthOf(now)), last = MX.expensesIn(list, MX.monthOf(now, -1));
  return { month, last, change: last ? Math.round(((month - last) / last) * 1000) / 1000 : null, top: MX.topExpenseCategory(list, MX.monthOf(now)) };
}
/** Selling prices: lines with no price in force, and prices under the target margin (share). */
export const priceTiles = <L extends MX.PriceLike>(lines: L[], target: number) => ({ missing: MX.pricesMissing(lines).length, below: MX.pricesBelowTarget(lines, target).length, isMissing: (l: L) => l.price === null, isBelow: (l: L) => MX.pricesBelowTarget([l], target).length > 0 });
