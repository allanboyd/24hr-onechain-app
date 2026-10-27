// docs/18 (CHECKLIST F-0b, docs/17 F3): one metric registry — every shared figure computed through each surface's own code
// path (Home dashboards builders, the web page tile helpers, the team app helpers, the summary call, the reports) for
// several scopes (Group, BTW, Kabonge, Testfie, Asie) must be identical. Plus the registry itself and the definitions.
import * as MXF from '../src/metrics';
import * as REG from '../src/metric-registry';
const MX = { ...MXF, ...REG };
import { deskKpis, truckDesk } from '../src/trucks';
import { feesConfig } from '../src/money';
import { expenseTiles, feeTiles, inventoryTiles, planTiles, poStageTiles, poTiles, queueTiles, reexportTiles, salesTiles, shipmentTiles, tripMoneyTiles } from '../../../apps/web/src/lib/tiles';
import { directorFigures, truckFigures } from '../../../apps/field/src/team/figures';

let fails = 0, checks = 0;
const ok = (c: unknown, m: string, detail?: unknown) => { checks++; if (!c) { fails++; console.log('FAIL', m, detail === undefined ? '' : JSON.stringify(detail)?.slice(0, 600)); } else console.log('ok  ', m); };
/** every value equal (numbers to the cent); nulls / undefined are surfaces without that figure and are skipped */
const same = (name: string, vals: Record<string, number | null | undefined>) => {
  const xs = Object.entries(vals).filter(([, v]) => v !== null && v !== undefined) as [string, number][];
  const eq = xs.every(([, v]) => Math.abs(v - xs[0][1]) < 0.011);
  ok(xs.length >= 2 && eq, `${name}: ${xs.map(([k, v]) => `${k} ${Math.round(v * 100) / 100}`).join(' = ')}`, xs.length < 2 ? 'fewer than two surfaces' : vals);
};

// ---- the registry ---------------------------------------------------------------------------------------------------------
const keys = Object.values(MX.METRICS).map((m) => m.key);
ok(keys.length >= 25 && new Set(keys).size === keys.length, 'registry: one entry per shared figure, unique keys', keys.length);
ok(Object.values(MX.METRICS).every((m) => m.label && m.definition.length > 30 && !/§|docs\/|\b[A-Z]{2}-\d{2}\b/.test(m.definition) && typeof m.compute === 'function'), 'registry: label, plain-English definition (no spec codes), unit and compute function');
ok(Object.values(MX.computeAll({ now: Date.now() })).every((v) => v === null), 'no data → null for every figure (never a fake zero)');

const api = await import('../src/index');
api.demo.reset(); await api.ready();
const stopsOf = (id: string) => api.ref().routes.find((r) => r.id === id)?.stops ?? [];
const as = async (id: string, entity: string | null = null) => { await api.auth.login(id, ''); api.entities.setActive(entity); };
const cfg = feesConfig(api.ref().config);
const D = 864e5; const now = Date.now(); const d0 = new Date(now);
const monthFrom = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1)).toISOString(), monthTo = new Date(Math.floor(now / D) * D + D).toISOString();
const settle = <T>(f: () => Promise<T>) => Promise.resolve().then(f).catch(() => null);

for (const [who, id, entity] of [['Group (Daniel)', 'u-daniel', null], ['BTW (Daniel)', 'u-daniel', 'e-btw'], ['Kabonge', 'u-kabonge', null], ['Testfie', 'u-testfie', null], ['Asie', 'u-asie', null]] as const) {
  await as(id, entity);
  console.log(`\n== ${who}`);
  const dir = id === 'u-daniel';
  const [ships, loads, orders, stock, vel, sum, fees, trips, waiting, inv] = await Promise.all([
    settle(() => api.shipments.list()), settle(() => api.loading.list()), settle(() => api.pos.list({ all: true })), settle(() => api.inventory.stock()), settle(() => api.analytics.velocity()), settle(() => api.analytics.summary()),
    settle(() => api.finance.fees()), settle(() => api.finance.trips()), settle(() => api.loading.waiting()), settle(() => api.reports.inventory()),
  ]);
  const dash = await settle(() => api.dashboards.get(dir ? ['director-today', 'exec-overview', 'fleet-board', 'customer-balances'] : ['fleet-board'], dir ? { from: monthFrom, to: monthTo } : {}));
  type Kpi = { key: string; value: number | null };
  const exec = (dash?.results['exec-overview']?.data as { kpis: Kpi[] } | undefined)?.kpis;
  const ek = (k: string) => exec?.find((x) => x.key === k)?.value;
  const today = dash?.results['director-today']?.data as { sales: { value: number | null }; profit: { value: number | null; margin: number | null }; cash: { value: number | null; overdue: number | null }; trucks: { value: number | null; delayed: number; arrivingToday: number } } | undefined;
  const board = dash?.results['fleet-board']?.data as { cards: { column: string }[] } | undefined;
  const col = (k: string) => (board ? board.cards.filter((c) => c.column === k).length : undefined);
  const ref = api.ref();
  const rows = ships && waiting ? truckDesk({ trucks: ref.trucks, providers: ref.providers, drivers: ref.drivers, waiting, shipments: ships, checkpoints: ref.checkpoints, suppliers: ref.suppliers, stopsOf, now }) : null;
  const desk = rows ? deskKpis(rows, trips) : null;
  const sh = ships ? shipmentTiles(ships, stopsOf, now) : null;
  const perf = dir ? await settle(() => api.reports.performance({ from: monthFrom, to: monthTo, level: 'company' })) : null;
  const phone = directorFigures({ sum, ships, loadings: loads, inv, perf, fees }, now, { amber: cfg.amberDays, red: cfg.redDays });
  const reg = MX.computeAll({ now, shipments: ships ?? undefined, stopsOf, loadings: loads ?? undefined, pos: orders, stock: stock ?? undefined, fees: fees ?? undefined, feeDays: { amber: cfg.amberDays, red: cfg.redDays }, perf });

  // ---- fleet
  if (ships) {
    same(`${who} · trucks on the road`, { registry: reg.onRoad, 'Shipments page': sh!.onRoad, 'Truck desk': desk?.onRoad, 'phone desk': rows ? truckFigures(rows).onRoad : null, summary: sum?.trucksActive, 'phone director': dir ? phone.onRoad : null, 'Home exec': ek('onRoad'), 'Home Today': today?.trucks.value, 'fleet board': board ? (col('transit') ?? 0) + (col('border') ?? 0) + (col('delayed') ?? 0) : null });
    same(`${who} · delayed`, { registry: reg.delayed, 'Shipments page': sh!.delayed, 'Truck desk': desk?.delayed, 'phone desk': rows ? truckFigures(rows).delayed : null, summary: sum?.trucksDelayed, 'Home exec': ek('delayed'), 'Home Today': today?.trucks.delayed, 'fleet board': col('delayed') });
    same(`${who} · at a border`, { registry: reg.atBorder, 'Shipments page': sh!.atBorder, 'phone desk': rows ? truckFigures(rows).atBorder : null, summary: sum?.trucksAtBorder, 'fleet board': col('border') });
    same(`${who} · no check-in`, { registry: reg.noCheckin, 'Shipments page': sh!.noCheckin });
    same(`${who} · arriving today`, { registry: reg.arrivingToday, 'Home Today': today?.trucks.arrivingToday, 'Shipments page': sh!.arrivingToday });
    same(`${who} · delivered`, { registry: reg.delivered, 'Shipments page': sh!.delivered, 'Purchase orders page': orders && loads ? poTiles(orders, loads, ships, stopsOf, now).delivered : null });
    same(`${who} · on time (all deliveries)`, { registry: reg.onTime, 'Shipments page': sh!.onTime });
  }
  // ---- orders
  if (loads) {
    same(`${who} · trucks to load`, { registry: reg.trucksToLoad, 'Purchase orders page': orders ? poTiles(orders, loads, ships ?? [], stopsOf, now).toLoad : null, 'phone director': dir ? phone.trucksToLoad : null });
    same(`${who} · orders awaiting loading`, { registry: reg.ordersToLoad, 'Purchase orders page': orders ? poTiles(orders, loads, ships ?? [], stopsOf, now).ordersToLoad : null, 'Home exec': ek('waiting'), 'phone director': dir ? phone.ordersToLoad : null });
  }
  // ---- stock
  if (stock) {
    const money = dir;
    const it = inventoryTiles(stock, vel ?? [], money);
    if (money) same(`${who} · stock value`, { registry: reg.stockValue, 'Inventory page': it.value, 'stock report': inv?.totalValue, summary: sum?.stockValue, 'Home exec': ek('stock'), 'phone director': phone.stockValue });
    same(`${who} · cases on hand`, { registry: reg.casesOnHand, 'Inventory page': it.cases, 'stock report': inv?.totalCases, summary: sum?.stockCases });
    same(`${who} · in transit`, { registry: reg.stockInTransit, 'Inventory page': it.transit, 'stock report': inv?.inTransitCases, summary: sum?.inTransitCases });
    if (inv) same(`${who} · needs attention`, { 'Inventory page': it.attention, 'stock report': inv.rows.filter((r) => r.risk !== 'ok').length });
  }
  // ---- sales and balances (directors)
  if (dir) {
    const rep = await api.reports.sales({ from: monthFrom, to: monthTo });
    same(`${who} · sales (month to date)`, { 'Sales page': salesTiles(rep).sales, 'Home Today': today?.sales.value, 'Home exec': ek('sales'), 'phone director': phone.sales });
    same(`${who} · owed by customers`, { 'Sales page': salesTiles(rep).owed, 'Home Today': today?.cash.value, 'Home customer balances': (dash?.results['customer-balances']?.data as { total: number } | undefined)?.total, summary: sum?.unpaidBalance });
    same(`${who} · overdue`, { 'Sales page': salesTiles(rep).overdue, 'Home Today': today?.cash.overdue, 'Home customer balances': (dash?.results['customer-balances']?.data as { overdue: number } | undefined)?.overdue });
    same(`${who} · profit (month to date)`, { registry: reg.profit, 'Home Today': today?.profit.value, 'Home exec': ek('profit'), 'phone director': phone.profit });
    same(`${who} · margin (month to date)`, { registry: reg.margin, 'Home Today': today?.profit.margin, 'Home exec': ek('margin'), 'phone director': phone.margin });
  }
  // ---- transport fees
  if (fees) {
    const ft = feeTiles(fees, cfg.amberDays, cfg.redDays);
    same(`${who} · transport owed`, { registry: reg.transportOwed, 'Transport fees page': ft.balance, 'Trip financials': trips ? tripMoneyTiles(trips).owed : null, 'Truck desk': trips ? desk?.owed : null, 'phone director': dir ? phone.transportOwed : null });
    same(`${who} · price not recorded`, { registry: reg.priceNotRecorded, 'Transport fees page': ft.missing, 'Trip financials': trips ? tripMoneyTiles(trips).missing : null, 'Truck desk': trips ? desk?.agreedMissing : null, 'phone director': dir ? phone.priceNotRecorded : null });
    same(`${who} · unpaid over ${cfg.amberDays} d`, { registry: reg.feesAmber, 'Transport fees page': ft.amber, 'phone': dir ? phone.feesAmber?.length : MX.feesOlderThan(fees, cfg.amberDays).length });
    same(`${who} · payments waiting for approval (trips)`, { registry: reg.feesAwaiting, 'Transport fees page': ft.awaiting, 'Trip financials': trips ? tripMoneyTiles(trips).awaiting : null });
    same(`${who} · payments waiting for approval (USD)`, { 'Transport fees page': ft.pending, 'Trip financials': trips ? tripMoneyTiles(trips).pending : null, registry: MX.awaitingApprovalUsd(fees) });
    same(`${who} · unpaid over ${cfg.redDays} d`, { registry: reg.feesRed, 'Transport fees page': ft.red, 'phone': dir ? phone.feesRed?.length : MX.feesOlderThan(fees, cfg.redDays).length });
  }
  // ---- docs/17 Phase 1: the work-page summary strips (page tile helper = registry, per scope)
  const [plansL, pv, rx, exp] = await Promise.all([settle(() => api.periodPlans.list()), settle(() => api.reports.plannedVsActual(api.reports.resolvePeriod('this-quarter', now) as never)), settle(() => api.reexports.list()), settle(() => api.warehouse.expenses({}))]);
  const reg2 = MX.computeAll({ now, orders: orders ?? undefined, plans: plansL ?? undefined, pv: pv?.measures ?? null, waiting: waiting ?? undefined, loaded: loads ?? undefined, reexports: rx ?? undefined, expenses: exp ?? undefined });
  if (orders) { const t = poStageTiles(orders); same(`${who} · POs not sent`, { registry: reg2.poNotSent, 'POs strip': t.notSent }); same(`${who} · POs loading`, { registry: reg2.poLoading, 'POs strip': t.loading }); same(`${who} · POs on the road`, { registry: reg2.poOnRoad, 'POs strip': t.onRoad }); }
  if (plansL) { const t = planTiles(plansL, pv?.measures ?? null, now); same(`${who} · plans in force`, { registry: reg2.plansInForce, 'Period plans strip': t.inForce }); same(`${who} · plans upcoming`, { registry: reg2.plansUpcoming, 'Period plans strip': t.upcoming }); if (t.used !== null) same(`${who} · plan used`, { registry: reg2.planUsed, 'Period plans strip': t.used }); }
  if (waiting && loads) { const t = queueTiles(waiting, loads, orders, now); same(`${who} · trucks waiting`, { registry: reg2.trucksWaiting, 'Queues strip': t.waiting }); same(`${who} · loaded today`, { registry: reg2.loadedToday, 'Queues strip': t.loadedToday }); same(`${who} · trucks to load (queues)`, { registry: reg.trucksToLoad, 'Queues strip': t.toLoad }); }
  if (rx) { const t = reexportTiles(rx); same(`${who} · re-exports open`, { registry: reg2.rxOpen, 'Re-exports strip': t.open }); same(`${who} · re-exports delivered`, { registry: reg2.rxDelivered, 'Re-exports strip': t.delivered }); }
  if (exp) { const t = expenseTiles(exp, now); same(`${who} · expenses this month`, { registry: reg2.expensesMonth, 'Warehouse expenses strip': t.month }); same(`${who} · expenses last month`, { registry: reg2.expensesLastMonth, 'Warehouse expenses strip': t.last }); }

}

// ---- docs/17 F3: the two disagreements that started this ------------------------------------------------------------------
await as('u-daniel');
const ships = await api.shipments.list();
const naive = ships.filter((s) => s.status !== 'Acknowledged').length;
const road = MX.fleetFigures({ shipments: ships, stopsOf, now }).onRoad;
ok(naive > road, `"on the road" no longer counts trucks still at the loading point or waiting to be signed for (old Shipments count ${naive} → ${road})`);

console.log(`\n${checks - fails} / ${checks} metric checks`);
if (fails) { console.log(`${fails} metric check(s) FAILED`); process.exit(1); }
console.log('all metric checks passed');
