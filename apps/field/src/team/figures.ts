// docs/18 (CHECKLIST F-0b): the team app homes' shared figures, computed with the metric registry
// (packages/api/src/metrics.ts) from the calls the homes already make — the same numbers as Home on the web and the
// page tiles. Pure (no Svelte, no I/O) so the consistency test (packages/api/test/metrics.test.ts) calls these too.
import * as MX from '@btw/api/metrics';
import type { InventoryReport, Loading, PerformanceReport, Shipment, TransportFeeRow, analytics } from '@btw/api';
import type { TruckRow } from '@btw/api/trucks';

type Summary = Awaited<ReturnType<typeof analytics.summary>>;
const DAY = 864e5;

/** Directors' scorecard: trucks (server summary = metrics.fleetFigures), orders to load, stock value, sales, profit, fees. */
export function directorFigures(d: { sum: Summary | null; ships: Shipment[] | null; loadings: Loading[] | null; inv: InventoryReport | null; perf: PerformanceReport | null; fees: TransportFeeRow[] | null }, now = Date.now(), feeDays = { amber: 14, red: 30 }) {
  return {
    onRoad: d.sum?.trucksActive ?? null, delayed: d.sum?.trucksDelayed ?? null, atBorder: d.sum?.trucksAtBorder ?? null,
    weekAgo: d.ships ? MX.onRoadAt(d.ships, now - 7 * DAY) : null,
    ordersToLoad: d.loadings ? MX.ordersToLoad(d.loadings) : null, trucksToLoad: d.loadings ? MX.trucksToLoad(d.loadings).length : null,
    stockValue: d.inv ? d.inv.totalValue : d.sum ? d.sum.stockValue : null,
    sales: d.perf ? d.perf.totals.revenue : null, profit: MX.profitOf(d.perf), margin: MX.marginOf(d.perf),
    feesRed: d.fees ? MX.feesOlderThan(d.fees, feeDays.red) : null, feesAmber: d.fees ? MX.feesOlderThan(d.fees, feeDays.amber) : null,
    priceNotRecorded: d.fees ? MX.priceNotRecorded(d.fees) : null, transportOwed: d.fees ? MX.transportOwed(d.fees) : null,
  };
}
/** Truck follow-up home (desk rows use the shared road state, metrics.roadState). */
export function truckFigures(rows: TruckRow[]) {
  const on = rows.filter((r) => r.state === 'In transit' || r.state === 'At border' || r.state === 'Delayed');
  return { onRoad: on.length, delayed: on.filter((r) => r.state === 'Delayed').length, atBorder: on.filter((r) => r.state === 'At border').length };
}
/** Trucks shown as delayed in the directors' exceptions: the delayed trucks on the road (metrics.onTheRoad). */
export const delayedShipments = (ships: Shipment[], stopsOf: MX.FleetSource['stopsOf'], now = Date.now()) => MX.onTheRoad({ shipments: ships, stopsOf, now }).filter((x) => x.state === 'Delayed');
