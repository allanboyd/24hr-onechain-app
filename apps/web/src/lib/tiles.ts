// docs/18 (CHECKLIST F-0b): the page summary tiles and chips of the web pages, computed with the shared metric registry
// (packages/api/src/metrics.ts) so a figure is the same here, on Home and on the phone. Pure functions — the pages pass
// what they loaded; the consistency test (packages/api/test/metrics.test.ts) calls these same functions.
import * as MX from '@btw/api/metrics';
import type { ID, Loading, PurchaseOrder, RouteStop, SalesReport, Shipment, StockRow, TransportFeeRow, VelocityRow } from '@btw/api';

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
  return { balance: MX.transportOwed(rows), open: MX.openFees(rows).length, amber: MX.feesOlderThan(rows, amberDays).length, red: MX.feesOlderThan(rows, redDays).length, missing: MX.priceNotRecorded(rows), pending: rows.reduce((a, r) => a + r.pendingUsd, 0) };
}
/** Trip financials and the truck desk (finance.trips): the same transport figures from the trips' cost lines and payments. */
export function tripMoneyTiles(trips: Parameters<typeof MX.feeOfTrip>[0][]) {
  const fees = trips.map(MX.feeOfTrip);
  return { owed: MX.transportOwed(fees), missing: MX.priceNotRecorded(fees), agreed: Math.round(fees.reduce((a, f) => a + (f.agreedUsd ?? 0), 0) * 100) / 100 };
}
/** Sales page and its overview: sales, cases sold and what customers owe, from the sales report (every sale, USD,
 *  intercompany removed in the Group view — computed with the shared definitions in reports.salesReport). */
export const salesTiles = (rep: Pick<SalesReport, 'totals' | 'receivables'>) => ({ sales: rep.totals.revenue, cases: rep.totals.cases, owed: rep.receivables.total });
