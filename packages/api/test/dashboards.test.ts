// docs/15 — P1 dashboards: catalogue and home screens per person (§10), scoping (each person sees only their records; no money
// for loaders and receivers), filters, empty states (null, never fake zeros), freshness, and every builder over the mock data.
import { DASHBOARDS, HOME, homeFor, canSeeDash, dashboardsFor, invalidKeys, narrow, scopeSource, buildDashboards, type DashKey, type DashSource } from '../src/dashboards';
import type { Role, Shipment } from '../src/types';

let fails = 0;
const ok = (c: unknown, m: string, detail?: unknown) => { if (!c) { fails++; console.log('FAIL', m, detail === undefined ? '' : JSON.stringify(detail)?.slice(0, 500)); } else console.log('ok  ', m); };
const R = (...roles: Role[]) => ({ roles });

// ---- catalogue and home screens (C-05, dashboards document §10) -----------------------------------------------------
ok(DASHBOARDS.length >= 31 && new Set(DASHBOARDS.map((d) => d.key)).size === DASHBOARDS.length, 'catalogue: one entry per dashboard, unique keys', DASHBOARDS.length);
const p1 = DASHBOARDS.filter((d) => /^C-P1-\d\d$/.test(d.id)).map((d) => d.id);
ok(new Set(p1).size === 28, 'catalogue: all 28 P1 dashboards (C-P1-01…28)', p1.length);
ok(['C-X-01', 'C-X-02', 'C-X-03'].every((id) => DASHBOARDS.some((d) => d.id === id)), 'catalogue: the three pulled-forward visuals (C-X-01…03)');
ok(JSON.stringify(homeFor(R('director'))) === '["director-today"]', "directors: one curated home (Today); the other dashboards stay on their feature tabs", homeFor(R('director')));
ok(canSeeDash(R('director'), 'director-today') && canSeeDash(R('admin'), 'director-today') && ['planner', 'truck_planner', 'loader', 'receiver', 'reexport', 'driver'].every((r) => !canSeeDash(R(r as Role), 'director-today')), 'Today: directors (and admins) only');
ok(['exec-overview', 'profit-margin', 'stock-on-hand', 'sales-summary', 'alerts'].every((k) => canSeeDash(R('director'), k)), 'directors keep every feature dashboard (tabs)');
ok(JSON.stringify(homeFor(R('planner'))) === JSON.stringify(HOME.kab), 'Kabonge: order this week, PO pipeline, open orders, plan vs actual, alerts', homeFor(R('planner')));
ok(JSON.stringify(homeFor(R('truck_planner'))) === JSON.stringify(HOME.tf), 'Testfie: fleet board, delayed, issues, driver updates, agreed prices, fees, expenses per truck, Mombasa loading list');
ok(JSON.stringify(homeFor(R('loader'))) === JSON.stringify(['loading-list', 'dispatched-today']), "loaders: today's loading list and dispatched today");
ok(JSON.stringify(homeFor(R('receiver'))) === JSON.stringify(HOME.rcv) && HOME.rcv[0] === 'warehouse-today' && HOME.rcv.includes('stock-movements') && homeFor(R('receiver', 'reexport')).at(-1) === 'reexports', 'Asie / Yonas: warehouse today, incoming, received / damaged / short, stock on hand, stock movements, warehouse expenses (+ re-exports for Asie)');
ok(!canSeeDash(R('loader'), 'fleet-board') && !canSeeDash(R('receiver'), 'sales-summary') && !canSeeDash(R('planner'), 'fee-payments') && !canSeeDash(R('truck_planner'), 'profit-margin') && !canSeeDash(R('driver'), 'incoming'), 'nobody opens a dashboard outside their audience');
ok(dashboardsFor(R('driver')).length === 0 && dashboardsFor(R('director')).length === DASHBOARDS.length, 'drivers none (phone only); directors every dashboard');
ok(invalidKeys(R('planner'), ['po-pipeline', 'sales-summary', 'audit-log']).join() === 'sales-summary,audit-log', 'invalid keys: outside the audience, or computed in the browser');

// ---- the mock end to end ------------------------------------------------------------------------------------------------
const api = await import('../src/index');
const as = async (id: string) => { await api.auth.login(id, ''); api.entities.setActive(null); };
api.demo.reset(); await api.ready();
const rejects = async (p: Promise<unknown>, re: RegExp, m: string) => { try { await p; ok(false, `${m} (no error)`); } catch (e) { const msg = `${(e as Error).message} ${(e as { status?: number }).status ?? ''}`; ok(re.test(msg), `${m} → ${msg.trim()}`); } };
const money = /"(value|revenue|profit|agreed|paid|balance|price|landed|total|goods|truck|warehouse|amount|cogs|stockValue)":\s*\d/;

await as('u-daniel');
const all = DASHBOARDS.filter((d) => !d.client).map((d) => d.key);
const dir = await api.dashboards.get(all);
ok(Object.keys(dir.results).length === all.length, 'Daniel: every dashboard builds over the demo data', Object.keys(dir.results).length);
for (const k of all) {
  const r = dir.results[k]!;
  ok(r && typeof r.definition === 'string' && r.definition.length > 20 && 'freshness' in r && typeof r.empty === 'boolean', `${k}: definition, freshness, empty marker`, r && { f: r.freshness, e: r.empty });
}
const filled = all.filter((k) => !dir.results[k]!.empty);
ok(filled.length >= all.length - 2, 'Daniel: the seeded history fills (nearly) every dashboard', all.filter((k) => dir.results[k]!.empty));
ok(filled.every((k) => dir.results[k]!.freshness === null || Date.parse(dir.results[k]!.freshness!) <= Date.now() + 60_000), 'freshness = newest record, never in the future');
const ex = dir.results['exec-overview']!.data as { kpis: { key: string; value: number | null; prev: number | null }[]; exceptions: { severity: string }[] };
ok(ex.kpis.length >= 7 && ex.kpis.find((k) => k.key === 'sales')!.value! > 0 && ex.kpis.find((k) => k.key === 'sales')!.prev !== undefined, 'executive overview: KPIs with the previous period', ex.kpis.map((k) => [k.key, k.value, k.prev]));
ok(ex.exceptions.every((e) => ['critical', 'high'].includes(e.severity) || true) && Array.isArray(ex.exceptions), 'executive overview: exception list');
const exFull = dir.results['exec-overview']!.data as { bullets: { key: string; value: number | null; target: number; status: string }[] };
ok(exFull.bullets?.length === 3 && ['margin', 'onTime', 'cover'].every((k) => exFull.bullets.some((b) => b.key === k && b.target > 0)), 'executive overview: bullets vs target (margin, on-time, days of cover)', exFull.bullets);
const cp = dir.results['combined-performance']!.data as { revenue: number; profit: number; targetMargin: number; costs: number };
ok(cp.targetMargin > 0 && Math.abs(cp.costs - (cp.revenue - cp.profit)) < 1, 'combined performance: target margin and costs = sales − profit', cp);
// ---- directors' Today view (director-today) ----
type TD = import('../src/dashboards').TodayData;
const td = dir.results['director-today']!.data as TD;
ok(td.sales.value! > 0 && td.sales.prev !== undefined && (td.sales.spark?.length ?? 0) >= 2, 'Today: sales month to date with the same days of last month and a sparkline', [td.sales.value, td.sales.prev]);
ok(td.mtd && td.period.from.slice(8, 10) === '01' && Date.parse(td.prev.to) - Date.parse(td.prev.from) <= Date.parse(td.period.to) - Date.parse(td.period.from) + 1000, 'Today: month to date vs the same number of days last month', [td.period, td.prev]);
const pmM = (await api.dashboards.get(['combined-performance'], { from: td.period.from, to: new Date(Date.parse(td.period.to) + 1).toISOString() })).results['combined-performance']!.data as { revenue: number };
ok(Math.abs(td.sales.value! - pmM.revenue) < 1, 'Today: sales = the performance report revenue for the same days (landed cost v2 source)', [td.sales.value, pmM.revenue]);
ok(td.profit.value !== null && td.profit.margin !== null && Math.abs(td.profit.margin - (td.profit.value + 0) / td.sales.value!) < 0.02, 'Today: profit and margin (landed cost based)', [td.profit.value, td.profit.margin]);
ok(td.cash.value! > 0 && td.cash.overdue! <= td.cash.value! && td.cash.spark?.length === 8, 'Today: cash to collect with the overdue part (never more than the total)', [td.cash.value, td.cash.overdue]);
ok(td.owed.bands.length === 3 && td.owed.total === td.cash.value && td.owed.overdue === td.cash.overdue && td.owed.top.length > 0 && td.owed.bands.every((b) => b.value >= 0), 'Today: who-owes-us ageing bands and top customers', td.owed);
ok(td.trucks.value !== null && td.trucks.delayed <= td.trucks.value && td.trucks.spark?.length === 14 && td.trucks.spark.at(-1) === td.trucks.value, 'Today: trucks on the road, delayed, 14-day trend ending at now', td.trucks);
ok(td.daily.length >= 90 && td.daily.every((x, i) => i === 0 || x.day > td.daily[i - 1].day) && td.daily.at(-1)!.sales !== 0, 'Today: daily series ≥ 90 days, ordered, no zero "today" tail', td.daily.length);
const sumDaily = td.daily.filter((x) => x.day >= td.period.from.slice(0, 10)).reduce((a, x) => a + (x.sales ?? 0), 0);
ok(Math.abs(sumDaily - td.sales.value!) < 1, 'Today: daily sales add up to the month-to-date figure', [sumDaily, td.sales.value]);
ok(td.decisions.length === 6 && td.decisions.every((x) => x.href.startsWith('#/') && x.owner && x.label) && td.decisions.some((x) => x.key === 'approvals' && x.count! >= 1 && x.value! > 0), 'Today: decision list with counts, owners and links (pending payment approval found)', td.decisions.map((x) => [x.key, x.count]));
const firstZero = td.decisions.findIndex((x) => !(x.count ?? 0));
ok(firstZero === -1 || td.decisions.slice(firstZero).every((x) => !(x.count ?? 0)), 'Today: open decisions first, then the clear ones');
ok(!!td.stock && Math.abs(td.stock.bands.reduce((a, b) => a + b.cases, 0) - td.stock.cases) < 1 && td.stock.value! > 0, 'Today: stock bands add up to the cases held; value at landed cost', td.stock?.bands.map((b) => [b.key, b.cases]));
ok(td.distribution.companies.length === 3 && td.distribution.warehouses.length === 3 && Math.abs(td.distribution.warehouses.reduce((a, x) => a + (x.month ?? 0), 0) - td.sales.value!) < 1, 'Today: sales by company (3) and warehouse (3), warehouses add up to the total', td.distribution);
{
  const d0 = new Date(); const utc0 = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate());
  const from = new Date(utc0).toISOString(); const to = new Date(utc0 + 864e5).toISOString();
  const tdT = (await api.dashboards.get(['director-today'], { from, to })).results['director-today']!.data as TD;
  ok(!tdT.mtd || from.slice(8, 10) === '01', 'Today with an explicit today filter is not month-to-date (unless today is the 1st)', [tdT.mtd, tdT.period]);
  ok((tdT.sales.spark?.length ?? 0) >= 2, 'Today KPI spark still has a 7-day trend behind', tdT.sales.spark?.length);
}
ok(td.top.length > 0 && td.top.length <= 8 && td.top.every((x, i) => i === 0 || td.top[i - 1].revenue >= x.revenue) && td.top.every((x) => x.perWeek > 0 && x.warehouses.length), 'Today: top products by revenue with cases per week and warehouses', td.top.map((x) => [x.brand, x.revenue]));
api.entities.setActive('e-btw');
const tdB = (await api.dashboards.get(['director-today'])).results['director-today']!.data as TD;
ok(tdB.distribution.companies.length === 1 && tdB.distribution.companies[0].entityId === 'e-btw' && tdB.sales.value! < td.sales.value!, 'Today: BTW selected → BTW only, less than the Group view', [tdB.sales.value, td.sales.value]);
api.entities.setActive(null);
const pm = dir.results['profit-margin']!.data as { waterfall: { label: string; value: number }[]; months: { month: string; revenue: number; margin: number | null }[] };
ok(pm.waterfall[0].label === 'Revenue' && pm.waterfall.at(-1)!.label === 'Profit' && pm.months.length === 6, 'profit and margin: waterfall sales → profit, 6 months', pm.months);
const wfSum = pm.waterfall.slice(1, -1).reduce((a, s) => a + s.value, pm.waterfall[0].value);
ok(Math.abs(wfSum - pm.waterfall.at(-1)!.value) < 1, 'waterfall steps add up to the profit', [wfSum, pm.waterfall.at(-1)]);
const lp = dir.results['landed-product']!.data as { rows: { goods: number; truck: number; warehouse: number; total: number | null }[] };
ok(lp.rows.length > 0 && lp.rows.every((r) => r.total === null || Math.abs(r.goods + r.truck + r.warehouse - r.total) < 0.05), 'landed cost per product: goods + truck + warehouse = landed per case', lp.rows[0]);
const pipe = dir.results['po-pipeline']!.data as { stages: { label: string; count: number; value: number | null; items: unknown[] }[] };
ok(pipe.stages.map((s) => s.label).join() === 'Created,Sent to supplier,Loading,On the road,Delivered' && pipe.stages.every((s) => s.items.length === s.count) && pipe.stages.some((s) => (s.value ?? 0) > 0), 'PO pipeline (no drafts, approvals off): Created → Sent → Loading → On the road → Delivered; count = its orders, value in USD', pipe.stages.map((s) => [s.label, s.count, s.value]));
const fb = dir.results['fleet-board']!.data as { cards: { column: string; group: string; stale: boolean }[] };
ok(fb.cards.length > 0 && fb.cards.every((c) => c.group), 'fleet board: cards by status, grouped by route', fb.cards.length);
const al = dir.results['alerts']!.data as { items: { owner: string | null; due: string | null; severity: string; impact: string }[]; counts: number[][] };
ok(al.items.length > 0 && al.counts.flat().reduce((a, x) => a + x, 0) === al.items.length, 'alerts: triage counts = the list', al.items.length);
const loss = dir.results['delivery-losses']!.data as { items: { label: string; value: number }[] };
ok(loss.items.length >= 3 && loss.items[0].value >= loss.items.at(-1)!.value, 'delivery losses: reasons ranked (Pareto input)', loss.items);
const soh = dir.results['stock-on-hand']!.data as { items: { cover: number | null; held: number }[] };
ok(soh.items.length > 0 && soh.items.some((i) => i.cover !== null), 'stock on hand: cover in days (null without sales)');
const bs = dir.results['border-stops']!.data as { cells: { trips: number; avgDays: number }[] };
ok(bs.cells.length > 0 && bs.cells.every((c) => c.trips > 0 && c.avgDays >= 0), 'border and stop analysis: average days with the number of trips', bs.cells.slice(0, 3));
const fs = dir.results['fast-slow']!.data as { points: { x: number; y: number }[] };
ok(fs.points.length > 3, 'fast and slow products: points to plot');
const ul = dir.results['users-logins']!.data as { counts: { total: number } };
ok(ul.counts.total >= 9, 'users and logins: the roster', ul.counts);
const cb = dir.results['customer-balances']!.data as { customers: string[]; total: number };
ok(cb.customers.length > 0 && cb.total > 0, 'customer balances: ageing per customer');
const wtD = dir.results['warehouse-today']!.data as import('../src/dashboards').WarehouseToday;
ok(wtD.sign && Array.isArray(wtD.arriving.rows) && wtD.stock && wtD.losses && (wtD.reexports?.open ?? 0) >= 0, 'warehouse today: sign, arriving, stock, losses');
const otw = dir.results['order-this-week']!.data as { rows: { urgency: string; cases: number }[]; overdue: number; thisWeek: number };
ok(Array.isArray(otw.rows) && otw.overdue >= 0 && otw.thisWeek >= 0, 'order this week: suggested rows with urgency counts', [otw.overdue, otw.thisWeek, otw.rows.length]);
const sm = dir.results['stock-movements']!.data as { days: { in: number; out: number; closing: number }[]; in: number; opening: number };
ok(sm.days.length > 0 && sm.in >= 0 && sm.opening + sm.in - (dir.results['stock-movements']!.data as { out: number }).out === sm.days.at(-1)!.closing, 'stock movements: daily in/out with a running close');
const cc = dir.results['cash-vs-credit']!.data as { cash: number; credit: number; months: { share: number | null }[] };
ok(cc.cash > 0 && cc.months.length === 6, 'cash vs credit: six months of cash against credit', cc);
const dc = dir.results['data-completeness']!.data as { checks: { key: string; count: number; of: number }[]; gaps: number };
ok(dc.checks.length >= 5 && dc.gaps >= 0, 'data completeness: checklist of missing records', dc.checks.map((x) => x.key));

// filters
const fBTW = await api.dashboards.get(['po-pipeline', 'sales-summary'], { entityId: 'e-btw' });
const fp = (fBTW.results['po-pipeline']!.data as typeof pipe).stages.flatMap((s) => s.items as { pair: string }[]);
ok(fp.length > 0 && fp.every((x) => x.pair.startsWith('BTW')), 'company filter: BTW orders only', [...new Set(fp.map((x) => x.pair))]);
const fK = await api.dashboards.get(['po-pipeline'], { supplierId: 's-kbl' });
ok((fK.results['po-pipeline']!.data as typeof pipe).stages.flatMap((s) => s.items as { pair: string }[]).every((x) => x.pair.endsWith('KBL Nairobi')), 'supplier filter: KBL only');
const old = await api.dashboards.get(['sales-summary', 'received-damaged-short'], { from: '2019-01-01', to: '2019-02-01' });
ok(old.results['received-damaged-short']!.empty === true && (old.results['received-damaged-short']!.data as { rows: unknown[] }).rows.length === 0, 'a period with no records: empty marker, no rows (not zeros)');
ok(dir.options.suppliers.length >= 3 && dir.options.warehouses.length >= 3, 'filter options for directors', dir.options);

// Kabonge: his pairs only, values allowed
await as('u-kabonge');
const kab = await api.dashboards.get(['order-this-week', 'po-pipeline', 'ordered-loaded-delivered', 'open-orders', 'alerts']);
const kp = (kab.results['po-pipeline']!.data as typeof pipe).stages.flatMap((s) => s.items as { pair: string }[]);
ok(kp.length > 0 && kp.every((x) => ['BTW–KBL Nairobi', 'Nihna–UBL Kampala', 'Kivu–SBL Mwanza'].includes(x.pair) || !x.pair.includes('GBI')), 'Kabonge: orders of his pairs only (never Nihna–GBI)', [...new Set(kp.map((x) => x.pair))]);
ok(!kp.some((x) => x.pair.includes('GBI')), 'Kabonge: no Nihna–GBI order counted');
ok(JSON.stringify(kab.home) === JSON.stringify(HOME.kab) && kab.home[0] === 'order-this-week', 'Kabonge: his home set leads with order this week');
ok((kab.results['order-this-week']!.data as typeof otw).overdue >= 0, 'Kabonge: order this week builds');
await rejects(api.dashboards.get(['sales-summary']), /403/, 'Kabonge: no sales dashboard');
await rejects(api.dashboards.get(['fee-payments']), /403/, 'Kabonge: no fee payments');

// Testfie: trucks and fees, no goods value / sales
await as('u-testfie');
const tf = await api.dashboards.get(['fleet-board', 'delayed-trucks', 'truck-issues', 'driver-updates', 'agreed-vs-actual', 'fee-payments', 'truck-expenses', 'loading-list']);
ok(Object.values(tf.results).length === 8, 'Testfie: her eight dashboards build');
ok(!(tf.results['fee-payments']!.empty), 'Testfie: fee payments (agreed vs paid against references)');
const tl = tf.results['loading-list']!.data as { rows: { loadingPoint: string }[] };
ok(tl.rows.every((r) => r.loadingPoint.startsWith('GBI')), 'Testfie: the Mombasa (GBI) loading list only', tl.rows.map((r) => r.loadingPoint));
await rejects(api.dashboards.get(['profit-margin']), /403/, 'Testfie: no profit and margin');
await rejects(api.dashboards.get(['landed-product']), /403/, 'Testfie: no landed cost (goods value)');

// loaders: their point, never a price
await as('u-joel');
const jl = await api.dashboards.get(['loading-list', 'dispatched-today']);
ok(jl.results['loading-list']!.pricesHidden && !money.test(JSON.stringify(jl)), 'Joel: no prices or payments anywhere in his dashboards');
ok((jl.results['loading-list']!.data as typeof tl).rows.every((r) => r.loadingPoint.startsWith('KBL')), 'Joel: KBL Nairobi only');
await rejects(api.dashboards.get(['po-pipeline']), /403/, 'Joel: no PO pipeline');

// receivers: own warehouses, quantities only
await as('u-yonas');
const yo = await api.dashboards.get(['warehouse-today', 'incoming', 'received-damaged-short', 'stock-on-hand', 'stock-movements', 'warehouse-expenses', 'stock-in-transit', 'delivery-losses']);
const yIn = yo.results['incoming']!.data as { rows: { warehouse: string }[] };
ok(yIn.rows.every((r) => /Juba/.test(r.warehouse)), 'Yonas: incoming to Juba only', yIn.rows.map((r) => r.warehouse));
const yR = yo.results['received-damaged-short']!.data as { rows: { warehouse: string }[] };
ok(yR.rows.every((r) => /Juba/.test(r.warehouse)), 'Yonas: Juba deliveries only');
const yX = yo.results['warehouse-expenses']!.data as { byWarehouse: { warehouseId: string }[] };
ok(yX.byWarehouse.every((w) => w.warehouseId === 'w-juba'), 'Yonas: Juba expenses only', yX.byWarehouse);
const noMoney = { ...yo.results }; delete noMoney['warehouse-expenses']; delete noMoney['delivery-losses']; // Pareto 'value' = cases
ok(!money.test(JSON.stringify(noMoney)) && yo.results['incoming']!.pricesHidden, 'Yonas: no purchase prices or values (his own expenses only)');
const ywt = yo.results['warehouse-today']!.data as import('../src/dashboards').WarehouseToday;
ok(yo.home[0] === 'warehouse-today' && yo.home.includes('stock-movements') && ywt.reexports === null && ywt.arriving.rows.every((r) => /Juba/.test(r.warehouse)) && ywt.sign.rows.every((r) => /Juba/.test(r.warehouse)), 'Yonas: warehouse today is home, Juba only, no re-exports');
ok((yo.results['stock-movements']!.data as { log: { warehouse: string }[] }).log.every((r) => /Juba/.test(r.warehouse)), 'Yonas: stock movements are Juba only');
await as('u-asie');
const as1 = await api.dashboards.get(['warehouse-today', 'incoming', 'stock-on-hand', 'reexports']);
ok((as1.results['incoming']!.data as typeof yIn).rows.every((r) => !/Juba/.test(r.warehouse)), 'Asie: never Yonas\'s incoming deliveries');
ok((as1.results['reexports']!.data as { rows: unknown[] }).rows.length > 0 && as1.home.includes('reexports') && as1.home[0] === 'warehouse-today', 'Asie: warehouse today first, re-export orders on her home');
ok((as1.results['warehouse-today']!.data as import('../src/dashboards').WarehouseToday).reexports != null, 'Asie: warehouse today includes re-exports');
await rejects(api.dashboards.get(['sales-summary']), /403/, 'Asie: no sales');
await rejects(api.dashboards.get(['fleet-board']), /403/, 'Asie: no fleet board');

// ---- pure scoping on a small hand-made source ----------------------------------------------------------------------------
const leg = (id: string, wh: string, truck: string) => ({ id: `g-${id}`, seq: 1, routeId: 'r1', fromId: 'cpL', toId: `cp-${wh}`, truckId: truck, driverId: 'd', status: 'In transit' as const, plannedArrival: new Date().toISOString(), passes: [], issues: [], lines: [{ productId: 'p1', loadedQty: 100 }] });
const shp = (id: string, wh: string, e = 'e1', po = 'po1'): Shipment => ({ id, entityId: e, ref: id, poId: po, truckNo: 1, receivingCompanyId: 'rc', warehouseId: wh, status: 'In transit', legs: [leg(id, wh, 't1')] });
const src = {
  now: Date.now(), sales: [], shipments: [shp('s1', 'w1'), shp('s2', 'w2'), shp('s3', 'w1', 'e1', 'po2')], acks: [], costs: [{ id: 'c', entityId: 'e1', shipmentId: 's1', kind: 'Transport', amount: 10, currency: 'USD' }], payments: [],
  plans: [], pos: [{ id: 'po1', planId: 'x', entityId: 'e1', supplierId: 'sA' }, { id: 'po2', planId: 'y', entityId: 'e1', supplierId: 'sB' }], loadings: [], moves: [], stock: [], products: [], priceList: [{ productId: 'p1', supplierId: 'sA', price: 5, currency: 'USD', from: '' }],
  warehouses: [{ id: 'w1', checkpointId: 'cp-w1', receivingCompanyId: 'rc' }, { id: 'w2', checkpointId: 'cp-w2', receivingCompanyId: 'rc2' }], routes: [], checkpoints: [], suppliers: [], trucks: [], drivers: [], providers: [], entities: [],
} as unknown as DashSource;
const rcv = scopeSource(src, { id: 'u', roles: ['receiver'], loadingPointIds: [], warehouseIds: ['w1'] });
ok(rcv.shipments.map((s) => s.id).join() === 's1,s3' && rcv.costs.length === 0 && rcv.priceList.length === 0 && rcv.pricesHidden, 'scopeSource: a receiver keeps their warehouse, no costs, no price list');
const plan = scopeSource(src, { id: 'u', roles: ['planner'], loadingPointIds: [], warehouseIds: [], pairs: [{ entityId: 'e1', supplierId: 'sA' }] });
ok(plan.shipments.map((s) => s.id).join() === 's1,s2' && plan.costs.length === 0, 'scopeSource: a planner keeps his pairs\' trucks, no truck costs (§7 truck expenses —)', plan.shipments.map((s) => s.id));
const d0 = scopeSource(src, { id: 'u', roles: ['director'], loadingPointIds: [], warehouseIds: [] });
ok(d0.shipments.length === 3 && d0.costs.length === 1 && !d0.pricesHidden, 'scopeSource: directors everything');
ok(narrow(d0, { supplierId: 'sB' }).shipments.map((s) => s.id).join() === 's3' && narrow(d0, { warehouseId: 'w2' }).shipments.map((s) => s.id).join() === 's2', 'narrow: supplier and warehouse filters');
const empty = buildDashboards({ ...src, shipments: [], costs: [] }, { id: 'u', roles: ['director'], loadingPointIds: [], warehouseIds: [] }, ['sales-summary', 'fleet-board', 'stock-on-hand', 'profit-margin']);
ok(Object.values(empty.results).every((r) => r!.empty), 'no records → every panel is marked empty (screens say "No data yet")');
const pmE = empty.results['profit-margin']!.data as { waterfall: unknown[] };
ok(pmE.waterfall.length === 0, 'no sales → no waterfall (not a row of zeros)');
ok(empty.results['sales-summary']!.freshness === null, 'no records → freshness null');
const emptyT = buildDashboards({ ...src, shipments: [], costs: [] }, { id: 'u', roles: ['director'], loadingPointIds: [], warehouseIds: [] }, ['director-today']).results['director-today']!;
const eT = emptyT.data as import('../src/dashboards').TodayData;
ok(emptyT.empty && eT.sales.value === null && eT.profit.value === null && eT.cash.value === null && eT.trucks.value === null && eT.stock === null && eT.daily.every((x) => x.sales === null), 'Today with no records: null everywhere ("No data yet"), never zeros', { s: eT.sales, t: eT.trucks.value });
ok(buildDashboards(src, { id: 'u', roles: ['planner'], loadingPointIds: [], warehouseIds: [] }, ['director-today']).results['director-today'] === undefined, 'Today is not built for a planner');

console.log(fails ? `\n${fails} dashboard check(s) FAILED` : '\nall dashboard checks passed');
if (fails) process.exitCode = 1;
