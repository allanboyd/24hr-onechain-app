// Report math: small hand-made datasets with known answers, then the seeded demo (planted capture gaps must be found).
import * as RP from '../src/reports';
import { demoSnapshot } from '../src/mock/db';
import * as seed from '../src/mock/seed';
import { computeStock, fxFor, toUsd, resolveScope, entityAccess } from '../src/rules';
import type { Acknowledgement, Leg, Plan, PurchaseOrder, Sale, Shipment, StockRow } from '../src/types';

let fails = 0;
const ok = (c: unknown, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const near = (a: number | null | undefined, b: number, eps = 1e-6) => a !== null && a !== undefined && Math.abs(a - b) <= eps;
const DAY = 864e5, H = 36e5;
const NOW = Date.UTC(2026, 9, 10, 12); // 10 Oct 2026 noon (Q4, 10 days in)
const iso = (ms: number) => new Date(ms).toISOString();

// ---- fixtures ---------------------------------------------------------------------------------------
const products = [{ id: 'p1', sku: 'S1', brand: 'Lager', pack: '24 x 300 ml', unitsPerCase: 24, sizeMl: 300, supplierId: 's1' }, { id: 'p2', sku: 'S2', brand: 'Stout', pack: '24 x 500 ml', unitsPerCase: 24, sizeMl: 500, supplierId: 's1' }];
const priceList = [{ productId: 'p1', supplierId: 's1', price: 10, currency: 'USD' as const, from: '2025-01-01' }, { productId: 'p2', supplierId: 's1', price: 20, currency: 'USD' as const, from: '2025-01-01' }];
const warehouses = [{ id: 'w1', name: 'Kigali', receivingCompanyId: 'rc', checkpointId: 'c-w1' }];
const checkpoints = [
  { id: 'c-s1', name: 'Supplier', kind: 'loading' as const, country: 'KE', lat: 0, lng: 0, radiusM: 100 },
  { id: 'c-b', name: 'Border X', kind: 'border' as const, country: 'KE', lat: 0, lng: 1, radiusM: 100 },
  { id: 'c-w1', name: 'Kigali WH', kind: 'warehouse' as const, country: 'RW', lat: 0, lng: 2, radiusM: 100 },
];
const routes = [{ id: 'r1', code: 'R1', name: 'Supplier → Kigali', distanceKm: 800, stops: [{ checkpointId: 'c-s1', plannedHours: 0, plannedDwellHours: 0 }, { checkpointId: 'c-b', plannedHours: 10, plannedDwellHours: 10 }, { checkpointId: 'c-w1', plannedHours: 48, plannedDwellHours: 0 }] }];
const suppliers = [{ id: 's1', code: 'SUP', name: 'Supplier', city: 'Nairobi', country: 'KE', checkpointId: 'c-s1', email: 'x@y' }];
const trucks = [{ id: 't1', providerId: 'pr', reg: 'KAA 1', trailer: 'Z', capacityCases: 2000 }];
const sale = (n: number, at: number, pid: string, qty: number, price: number, paid = qty * price, customer = 'Shop'): Sale =>
  ({ id: `s${n}`, entityId: 'e', ref: `S${n}`, at: iso(at), warehouseId: 'w1', customer, salespersonId: 'u', kind: 'Cash', lines: [{ productId: pid, qty, price }], currency: 'USD', paid, status: paid >= qty * price ? 'Paid' : paid > 0 ? 'Part-paid' : 'Unpaid' });
const base = (): RP.ReportData => ({
  now: NOW, sales: [], shipments: [], acks: [], costs: [], payments: [], plans: [], pos: [], loadings: [], moves: [], stock: [],
  products, priceList, warehouses, routes, checkpoints, suppliers, trucks, drivers: [{ id: 'd1', name: 'Driver', phone: '1', licence: '', providerId: 'pr', hasApp: true }], providers: [{ id: 'pr', name: 'Prov', regular: true, phone: '' }], entities: [],
});

// ---- periods ---------------------------------------------------------------------------------------
{
  const q = RP.resolvePeriod('last-quarter', NOW); ok(q.from.startsWith('2026-07-01') && q.to.startsWith('2026-10-01'), 'last quarter = Jul–Sep 2026');
  ok(RP.resolvePeriod('today', NOW).from.startsWith('2026-10-10') && RP.resolvePeriod('today', NOW).to.startsWith('2026-10-11'), 'today = 10 Oct 2026');
  ok(RP.resolvePeriod('last-7', NOW).from.startsWith('2026-10-04') && RP.resolvePeriod('last-7', NOW).to.startsWith('2026-10-11'), 'last-7 = 4–10 Oct 2026');
  ok(RP.resolvePeriod('next-30', NOW).from.startsWith('2026-10-11'), 'next-30 starts tomorrow');
  ok(RP.quarterOf(NOW) === '2026-Q4' && RP.quarterRange('2026-Q4').from === Date.UTC(2026, 9, 1), 'quarter helpers');
  ok(near(RP.quantile([1, 2, 3, 4, 5], 0.8), 4.2) && RP.quantile([], 0.5) === 0, 'quantile (linear) incl. empty');
}

// ---- sales: totals, previous period, last year, receivables --------------------------------------------
{
  const d = base();
  const from = Date.UTC(2026, 8, 1), to = Date.UTC(2026, 9, 1); // September
  d.sales = [
    sale(1, from + 2 * DAY, 'p1', 100, 10), sale(2, from + 10 * DAY, 'p2', 50, 20, 0, 'Bar'), // Sep: 1000 + 1000 (unpaid)
    sale(3, from - 5 * DAY, 'p1', 80, 10), // Aug (previous period)
    sale(4, from + 2 * DAY - 365 * DAY, 'p1', 40, 10), // Sep last year
  ];
  const r = RP.salesReport(d, { from: iso(from), to: iso(to), groupBy: 'month' });
  ok(r.totals.revenue === 2000 && r.totals.cases === 150 && r.totals.outstanding === 1000, 'sales totals: 2000 revenue, 150 cases, 1000 outstanding');
  ok(r.prev.revenue === 800 && r.lastYear.revenue === 400, 'previous period 800, same period last year 400');
  ok(r.byBrand[0].productId === 'p1' || r.byBrand[0].revenue === 1000, 'by brand ranked');
  ok(r.series.length === 1 && r.series[0].revenue === 2000 && r.series[0].lyRevenue === 400, 'monthly series with last-year value');
  ok(r.receivables.total === 1000 && r.receivables.buckets[0].amount === 1000, 'receivables ageing: 1000 in 0–30 days at 30 Sep');
  ok(r.topCustomers.find((c) => c.customer === 'Bar')?.outstanding === 1000, 'top customers carry outstanding');
}

// ---- landing cost, logistics on-time and border dwell ----------------------------------------------------
const mkShipment = (n: number, depart: number, lateHours: number, dwellH: number, received: number, damaged: number) => {
  const leg: Leg = {
    id: `l${n}`, seq: 1, routeId: 'r1', fromId: 'c-s1', toId: 'c-w1', truckId: 't1', driverId: 'd1', status: 'Acknowledged', departedAt: iso(depart), plannedArrival: iso(depart + 48 * H),
    passes: [
      { checkpointId: 'c-s1', plannedAt: iso(depart), arrivedAt: iso(depart - H), departedAt: iso(depart) },
      { checkpointId: 'c-b', plannedAt: iso(depart + 10 * H), arrivedAt: iso(depart + 10 * H), departedAt: iso(depart + (10 + dwellH) * H) },
      { checkpointId: 'c-w1', plannedAt: iso(depart + 48 * H), arrivedAt: iso(depart + (48 + lateHours) * H) },
    ], lines: [{ productId: 'p1', loadedQty: 1000 }], issues: [], ackId: `a${n}`,
  };
  const sh: Shipment = { id: `sh${n}`, entityId: 'e', ref: `SHP${n}`, poId: 'po1', truckNo: n, receivingCompanyId: 'rc', warehouseId: 'w1', legs: [leg], status: 'Acknowledged' };
  const ack: Acknowledgement = { id: `a${n}`, entityId: 'e', legId: leg.id, shipmentId: sh.id, warehouseId: 'w1', receiverName: 'R', at: iso(depart + (50 + lateHours) * H), lines: [{ productId: 'p1', expected: 1000, received, damaged, remarks: received < 1000 || damaged ? 'noted' : undefined }], photos: [], hasDiscrepancy: received < 1000 || damaged > 0 };
  return { sh, ack };
};
{
  const d = base();
  const plan: Plan = { id: 'pl1', ref: 'X-1', title: '', entityId: 'e', supplierId: 's1', currency: 'USD', date: '2026-09-01', requiredBy: '2026-09-10', status: 'Approved', version: 1, lines: [{ id: 'ln1', truckNo: 1, productId: 'p1', qty: 1000, price: 9, deliveredToId: 'rc', routeId: 'r1' }], history: [], createdById: 'u', poId: 'po1' };
  const po: PurchaseOrder = { id: 'po1', ref: 'X-1', planId: 'pl1', entityId: 'e', supplierId: 's1', currency: 'USD', date: '2026-09-01', title: '', instruction: '', version: 1, approvedById: 'u', approvedAt: iso(Date.UTC(2026, 8, 1)), sentAt: iso(Date.UTC(2026, 8, 1)) };
  d.plans = [plan]; d.pos = [po];
  const a = mkShipment(1, Date.UTC(2026, 8, 5), 2, 8, 1000, 0);   // on time (2 h late ≤ 6 h)
  const b = mkShipment(2, Date.UTC(2026, 8, 12), 30, 30, 990, 5);  // late; 10 short + 5 damaged = 15 lost
  d.shipments = [a.sh, b.sh]; d.acks = [a.ack, b.ack];
  d.costs = [{ id: 'c1', entityId: 'e', shipmentId: 'sh1', kind: 'Transport', amount: 1000, currency: 'USD' }, { id: 'c2', entityId: 'e', shipmentId: 'sh2', kind: 'Transport', amount: 1000, currency: 'USD' }];
  const lc = RP.landedCostMap(d);
  ok(lc.get('p1') === 10, 'landing cost per case = (9 × 1000 + 1000) / 1000 = 10');
  ok(lc.get('p2') === 24.2, 'no deliveries → list price × 1.21 fallback');
  const l = RP.logisticsReport(d, { from: iso(Date.UTC(2026, 8, 1)), to: iso(Date.UTC(2026, 9, 1)) });
  ok(l.delivered === 2 && near(l.onTimePct, 0.5), 'logistics: 2 deliveries, 50% on time');
  ok(near(l.damagePct, 15 / 2000), 'damage/short = 15 of 2000 expected');
  ok(l.borders[0].crossings === 2 && l.borders[0].medianHours === 19 && l.borders[0].plannedHours === 10, 'border dwell median 19 h vs planned 10 h');
}

// ---- planning: stock-out date and order-by from lane lead time -------------------------------------------
{
  const d = base();
  // 100 cases/day for the last 70 days, no last-year data → flat 100/day forecast
  for (let i = 1; i <= 70; i++) d.sales.push(sale(i, NOW - i * DAY, 'p1', 100, 15));
  d.stock = [{ entityId: 'e', warehouseId: 'w1', productId: 'p1', opening: 0, received: 0, transfersIn: 0, transfersOut: 0, damaged: 0, adjustments: 0, sold: 0, closing: 1200, inTransit: 0, landedCostPerCase: 12 }];
  const p = RP.planningReport(d, { horizonDays: 90 });
  const f = p.forecasts[0];
  ok(near(f.perDay, 100) && f.next30 === 3000, 'forecast 100/day flat, 3,000 in 30 days');
  ok(f.daysToStockOut === 11, 'stock-out on day 11 (1,200 cases at 100/day, counting today)');
  ok(f.lane?.leadDays === 6 && f.lane.transitDays === 2, 'lane lead time = planned transit 2 days + 4 days to order and load');
  const s = p.suggestions[0];
  ok(s && s.trucks === 2 && s.urgency === 'this week' && s.text.includes('Order 2 trucks of Lager'), `suggest 2 trucks this week: ${s?.text}`);
  ok(s && Date.parse(s.orderBy) === Date.UTC(2026, 9, 12), 'order by = stock-out − (lead 6 + 3 safety days)');
  // period plan for the next 30 days, one truck already planned
  d.plans = [{ id: 'pl9', ref: 'X-9', title: '', entityId: 'e', supplierId: 's1', currency: 'USD', date: '2026-10-09', requiredBy: '2026-10-15', status: 'Submitted', version: 1, lines: [{ id: 'q1', truckNo: 1, productId: 'p1', qty: 2000, price: 10, deliveredToId: 'rc', routeId: 'r1' }], history: [], createdById: 'u' }];
  const pp = RP.periodPlan(d, RP.resolvePeriod('next-30', NOW));
  const row = pp.rows[0];
  ok(row.demand === 3000 && row.alreadyPlanned === 2000, 'period plan: 3,000 demand, 2,000 already planned');
  ok(row.requiredCases === 3000 + 1400 - row.startStock && row.gapCases === row.requiredCases - 2000, 'required = demand + 14-day cover − start stock; gap = required − planned');
  ok(row.gapTrucks === Math.ceil(row.gapCases / 2000) && pp.byLane[0]?.text.startsWith('Still need'), `gap in trucks + lane text: ${pp.byLane[0]?.text}`);
  ok(pp.alreadyPlanned[0]?.ref === 'X-9', 'already-planned list includes the submitted plan');
}

// ---- companies: FX, consolidation, intercompany elimination ---------------------------------------------
{
  const rates = [{ currency: 'KES' as const, month: '2026-08', avg: 130, closing: 131 }, { currency: 'KES' as const, month: '2026-09', avg: 125, closing: 126 }];
  ok(fxFor(rates, 'USD', NOW) === 1 && fxFor(rates, 'KES', '2026-09-15') === 125 && fxFor(rates, 'KES', '2026-09-15', 'closing') === 126, 'fx: month average vs closing');
  ok(fxFor(rates, 'KES', '2026-10-02') === 125 && fxFor(rates, 'KES', '2026-01-02') === 130, 'fx: nearest earlier month, else the first');
  ok(toUsd(13000, 'KES', rates, '2026-08-20') === 100 && toUsd(50, 'USD', rates, NOW) === 50, 'toUsd: 13,000 KES @130 = 100 USD');
  let threw = false; try { fxFor(rates, 'UGX', NOW); } catch { threw = true; } ok(threw, 'fx: missing currency is an error, not 1');
  ok(JSON.stringify(resolveScope(['a', 'b'], null)) === '["a","b"]' && JSON.stringify(resolveScope(['a', 'b'], 'b')) === '["b"]' && resolveScope(['a'], 'b') === null, 'scope: group = all allowed; outside allowed = refused');
  const dir = entityAccess({ roles: ['director'], entityIds: [] }, ['a', 'b']), staff = entityAccess({ roles: ['planner'], entityIds: ['a', 'zz'] }, ['a', 'b']);
  ok(dir.canGroup && dir.allowedEntityIds.length === 2 && !staff.canGroup && JSON.stringify(staff.allowedEntityIds) === '["a"]', 'access: directors see the group, staff only their (known) company');

  const d = base();
  d.entities = [{ id: 'A', code: 'A', name: 'Alpha Ltd', shortName: 'Alpha' }, { id: 'B', code: 'B', name: 'Beta Ltd', shortName: 'Beta' }] as unknown as RP.ReportData['entities'];
  d.fxRates = rates;
  const at = NOW - 5 * DAY;
  const mk = (n: number, entityId: string, qty: number, price: number, extra: Partial<Sale> = {}): Sale => ({ ...sale(n, at, 'p1', qty, price), entityId, ...extra });
  d.sales = [mk(1, 'A', 100, 10), mk(2, 'B', 50, 10), mk(3, 'A', 30, 8, { counterpartyEntityId: 'B', ref: 'IC-1' }), mk(4, 'B', 10, 1250, { currency: 'KES', paid: 12500 })];
  d.moves = [{ entityId: 'A', warehouseId: 'w1', productId: 'p1', kind: 'sold', qty: 30, at: iso(at), ref: 'IC-1' }, { entityId: 'B', warehouseId: 'w1', productId: 'p1', kind: 'transferIn', qty: 30, at: iso(at), ref: 'IC-1' }];
  d.stock = [{ entityId: 'A', warehouseId: 'w1', productId: 'p1', opening: 500, received: 0, transfersIn: 0, transfersOut: 0, damaged: 0, adjustments: 0, sold: 130, closing: 370, inTransit: 0, landedCostPerCase: 7 },
    { entityId: 'B', warehouseId: 'w1', productId: 'p1', opening: 100, received: 0, transfersIn: 30, transfersOut: 0, damaged: 0, adjustments: 0, sold: 60, closing: 70, inTransit: 0, landedCostPerCase: 7 }];
  const f = { from: iso(NOW - 30 * DAY), to: iso(NOW) };
  const a = RP.salesReport(d, { ...f, entityId: 'A' }), b = RP.salesReport(d, { ...f, entityId: 'B' }), g = RP.salesReport(d, f);
  ok(a.totals.revenue === 1240 && a.totals.cases === 130, 'company A keeps its intercompany sale (1,000 + 240)');
  ok(b.totals.revenue === 600, 'company B: 500 USD + 12,500 KES @125 (Sep avg, nearest earlier) = 100 USD');
  ok(g.totals.revenue === 1600 && g.totals.revenue === a.totals.revenue + b.totals.revenue - 240, 'group = Σ companies − intercompany 240');
  const gr = RP.groupReport({ ...d, entityScope: ['A', 'B'] }, f);
  ok(gr.byEntity.A.revenue === 1240 && gr.byEntity.B.revenue === 600 && gr.total.revenue === 1600, 'group report: byEntity + consolidated total');
  ok(gr.lessIntercompany.revenue === 240 && gr.lessIntercompany.cases === 30 && gr.lessIntercompany.sales === 1, 'group report: explicit "less intercompany" line');
  ok(near(gr.league[0].share + gr.league[1].share, 1) && near(gr.league[0].share, 1240 / 1840) && gr.league[0].entityId === 'A', 'league table sorted by revenue with share of group');
  ok(gr.trend.length === 13 && gr.trend.at(-1)!.byEntity.B === 600, 'trend per company per month');
  ok(gr.total.stockCases === 440 && gr.byEntity.A.stockCases === 370 && gr.byEntity.B.stockCases === 70, 'stock owned per company; group nets intercompany transfer (370 + 30 back − 30 = 440)');
  const nb = RP.salesReport({ ...d, entityScope: ['B'] }, { ...f, entityId: 'A' });
  ok(nb.totals.revenue === 0, 'a company outside the caller\'s scope returns nothing');
}

// ---- seeded demo: history shape and planted capture gaps ---------------------------------------------------
{
  const db = demoSnapshot();
  const priceOf = (p: string) => seed.priceList.find((x) => x.productId === p)?.price ?? 0;
  const stock: StockRow[] = computeStock(db.stockMoves, db.shipments, priceOf);
  const data: RP.ReportData = {
    now: Date.now(), sales: db.sales, shipments: db.shipments, acks: db.acks, costs: db.costs, payments: db.payments, plans: db.plans, pos: db.pos, loadings: db.loadings,
    moves: db.stockMoves, stock, products: seed.products, priceList: seed.priceList, warehouses: seed.warehouses, routes: db.routes, checkpoints: seed.checkpoints,
    suppliers: seed.suppliers, trucks: db.trucks, drivers: seed.drivers, providers: seed.providers, entities: seed.entities,
  };
  const first = Math.min(...db.sales.map((s) => Date.parse(s.at)));
  ok((Date.now() - first) / DAY > 440, 'demo has ~15 months of sales history');
  ok(db.shipments.filter((s) => s.status === 'Acknowledged').length >= 80, `≥ 80 completed historical shipments (${db.shipments.length} total)`);
  ok(stock.every((r) => r.closing >= 0), 'no SKU closes negative');
  const q = RP.quarterlyReport(data, RP.quarterOf(Date.now() - 100 * DAY));
  ok(q.kpis.length === 10 && q.kpis.every((k) => Number.isFinite(k.value)) && q.highlights.length >= 3, 'quarterly pack: 10 KPIs + highlights');
  const c = RP.captureCheck(data, RP.resolvePeriod('last-90', Date.now()));
  const has = (k: string) => c.kinds.some((x) => x.kind === k);
  for (const k of ['Missing check-ins', 'Arrived, not acknowledged', 'Discrepancy not explained', 'No loading documents', 'Agreed transport price not recorded', 'PO not sent to supplier', 'Payment without reference', 'Sale without customer', 'Payment status inconsistent', 'Ledger entry without reference', 'No sales recorded on a trading day', 'Loaded ≠ ordered'])
    ok(has(k), `capture check finds planted gap: ${k}`);
  ok(c.score > 0 && c.score < 1 && c.areas.every((a) => a.score >= 0 && a.score <= 1), `completeness score ${Math.round(c.score * 100)}%`);
  const gd = RP.groupReport({ ...data, fxRates: seed.seedFxRates() }, RP.resolvePeriod('last-30', Date.now()));
  const sumRev = Object.values(gd.byEntity).reduce((x, k) => x + k.revenue, 0);
  ok(Object.keys(gd.byEntity).length === 3 && Object.values(gd.byEntity).every((k) => k.revenue > 0), 'demo: all three companies trade');
  ok(gd.lessIntercompany.sales === 1 && Math.abs(sumRev - gd.lessIntercompany.revenue - gd.total.revenue) < 0.05, `demo: group = Σ companies − intercompany (${gd.lessIntercompany.revenue})`);
  const dash = RP.dashboardReport(data);
  ok(dash.trend.length === 12 && dash.kpis.revenue30 > 0 && dash.suggestions.every((s) => s.trucks >= 1), 'dashboard report builds (12-month trend, KPIs, suggestions)');
}

// doc 08 §2: landing cost accumulates along a chain (Nairobi → Gisenyi, then Gisenyi → Goma)
{
  const leg = (id: string, qty: number) => ({ id, seq: 1, routeId: 'r', fromId: 'a', toId: 'b', truckId: 't', driverId: 'd', status: 'Acknowledged', plannedArrival: '', passes: [], issues: [], lines: [{ productId: 'p1', loadedQty: qty }] }) as unknown as Leg;
  const a = { id: 'A', entityId: 'e', ref: 'A', poId: 'po', truckNo: 1, receivingCompanyId: 'rc', warehouseId: 'w1', legs: [leg('la', 1000)], status: 'Acknowledged' } as Shipment;
  const b = { ...a, id: 'B', ref: 'B', warehouseId: 'w2', legs: [leg('lb', 500)], parentShipmentId: 'A', originShipmentId: 'A', fromWarehouseId: 'w1' } as Shipment;
  const costs = [{ shipmentId: 'A', amount: 2000, amountUsd: 2000 }, { shipmentId: 'B', amount: 500, amountUsd: 500 }] as never;
  const plans = [{ id: 'pl', lines: [{ productId: 'p1', price: 10 }] }] as unknown as Plan[];
  const pos = [{ id: 'po', planId: 'pl' }] as unknown as PurchaseOrder[];
  const only = (shs: Shipment[]) => RP.landedCostMap({ shipments: shs, costs, plans, pos, priceList: [], products: [{ id: 'p1' }] as never }).get('p1');
  ok(only([a]) === 12, 'first shipment: 10 goods + 2000/1000 expenses = 12 per case');
  ok(only([b, { ...a, status: 'Loaded' } as Shipment]) === 13, 'onward shipment: 12 carried + 500/500 own = 13 per case');
}

console.log(fails ? `\n${fails} FAILED` : '\nall report checks passed');
process.exitCode = fails ? 1 : 0;
