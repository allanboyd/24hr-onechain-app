// docs/15 — P1 dashboards over HTTP: GET /v1/dashboards scoped by the caller. Each person gets their own home set and only
// their own records (Kabonge his pairs, loaders their loading point, receivers their warehouses), loaders and receivers never
// see a price or a value, filters stay inside the scope, unknown / foreign dashboards are refused, results match the mock's builders.
import { client, expectStatus, ok, section, type Env } from './harness';

export async function dashboardsSuite(env: Env) {
  const c = client(env.base);
  const T: Record<string, string> = {};
  for (const u of ['daniel', 'michael', 'kabonge', 'testfie', 'joel', 'eric', 'moses', 'asie', 'yonas']) T[u] = (await c.login(u)).accessToken;
  T.drv = (await c.login('+254702750019', '1234')).accessToken;
  const get = (who: string, q = '', headers: Record<string, string> = {}) => c.req('GET', `/dashboards${q}`, { token: T[who], headers });
  const money = /"(value|revenue|profit|agreed|paid|balance|price|landed|total|goods|truck|warehouse|amount|cogs|stockValue|actual|variance)":\s*-?\d/;

  section('Dashboards · home sets per person (C-05)');
  const homes: Record<string, string[]> = {};
  for (const u of ['daniel', 'kabonge', 'testfie', 'joel', 'asie', 'yonas']) {
    const r = await get(u);
    ok(r.status === 200 && Array.isArray(r.body.home) && r.body.home.length > 0, `${u}: GET /dashboards (no keys) → home set`, r.status === 200 ? r.body.home : r.body);
    homes[u] = r.body.home ?? [];
    ok(Object.keys(r.body.results ?? {}).every((k) => homes[u].includes(k)), `${u}: builds only their own home dashboards`, Object.keys(r.body.results ?? {}));
  }
  ok(homes.daniel[0] === 'exec-overview' && homes.daniel.includes('profit-margin') && homes.daniel.includes('sales-summary'), 'Daniel: executive overview first, then profit, …, sales, alerts', homes.daniel);
  ok(homes.kabonge.join() === 'po-pipeline,ordered-loaded-delivered,open-orders,plan-vs-actual,alerts', 'Kabonge: PO pipeline, ordered/loaded/delivered, open orders, plan vs actual, alerts', homes.kabonge);
  ok(homes.testfie.includes('fleet-board') && homes.testfie.includes('fee-payments') && homes.testfie.includes('loading-list') && !homes.testfie.includes('profit-margin'), 'Testfie: fleet, fees, Mombasa loading list — no profit', homes.testfie);
  ok(homes.joel.join() === 'loading-list,dispatched-today', "Joel: today's loading list and dispatched today", homes.joel);
  ok(homes.asie.includes('reexports') && !homes.yonas.includes('reexports') && homes.yonas.includes('incoming'), 'Asie: + re-exports; Yonas: incoming, stock, expenses', [homes.asie, homes.yonas]);
  expectStatus(await get('drv'), 403, 'a driver has no web dashboards');
  expectStatus(await c.req('GET', '/dashboards'), 401, 'signed out → 401');

  section('Dashboards · directors (every builder, filters, freshness)');
  const ALL = 'exec-overview,combined-performance,profit-margin,landed-product,landed-truck,selling-price,fast-slow,po-pipeline,ordered-loaded-delivered,open-orders,loading-list,loading-status,dispatched-today,fleet-board,delayed-trucks,truck-issues,driver-updates,border-stops,agreed-vs-actual,fee-payments,unpaid-fees,truck-expenses,incoming,received-damaged-short,delivery-losses,stock-on-hand,stock-in-transit,warehouse-expenses,reexports,sales-summary,customer-balances,alerts,users-logins';
  let r = await get('daniel', `?keys=${ALL}`);
  ok(r.status === 200 && Object.keys(r.body.results).length === ALL.split(',').length, 'Daniel: all 33 server-built dashboards in one call', r.status === 200 ? Object.keys(r.body.results).length : r.body);
  const D = r.body.results ?? {};
  for (const k of ALL.split(',')) { const x = D[k]; ok(x && x.definition && 'freshness' in x && typeof x.empty === 'boolean' && x.title, `${k}: definition, freshness, empty marker`, x && { empty: x.empty, freshness: x.freshness }); }
  const filled = ALL.split(',').filter((k) => D[k] && !D[k].empty);
  ok(filled.length >= 28, 'the seeded history fills the dashboards', ALL.split(',').filter((k) => D[k]?.empty));
  ok(D['exec-overview']?.data.kpis.find((k: any) => k.key === 'sales')?.value > 0 && D['exec-overview'].currency === 'USD', 'executive overview: sales this period (USD) with the previous period');
  const wf = D['profit-margin']?.data.waterfall ?? [];
  ok(wf[0]?.label === 'Revenue' && wf.at(-1)?.label === 'Profit' && Math.abs(wf.slice(1, -1).reduce((a: number, s: any) => a + s.value, wf[0].value) - wf.at(-1).value) < 1, 'profit waterfall adds up', wf);
  ok(D['delivery-losses']?.data.items.length >= 3, 'delivery losses Pareto from the seeded reasons', D['delivery-losses']?.data.items);
  ok(D['users-logins']?.data.rows.some((u: any) => u.name.startsWith('Daniel') && u.lastLoginAt), 'users and logins: last sign-in recorded', D['users-logins']?.data.counts);
  r = await get('daniel', '?keys=po-pipeline&entityId=e-btw');
  const btw = r.body.results?.['po-pipeline']?.data.stages.flatMap((s: any) => s.items) ?? [];
  ok(r.status === 200 && btw.length > 0 && btw.every((x: any) => x.pair.startsWith('BTW')), 'company filter: BTW orders only', [...new Set(btw.map((x: any) => x.pair))]);
  r = await get('daniel', '?keys=po-pipeline', { 'x-entity-id': 'e-nud' });
  const nud = r.body.results?.['po-pipeline']?.data.stages.flatMap((s: any) => s.items) ?? [];
  ok(r.status === 200 && nud.every((x: any) => x.pair.startsWith('Nihna')), 'active company header (X-Entity-Id) scopes the data', [...new Set(nud.map((x: any) => x.pair))]);
  r = await get('daniel', '?keys=received-damaged-short,sales-summary&from=2019-01-01&to=2019-02-01');
  ok(r.status === 200 && r.body.results['received-damaged-short'].empty === true && r.body.results['received-damaged-short'].data.rows.length === 0, 'a period with no records → empty, no zero rows');
  r = await get('daniel', '?keys=fleet-board&routeId=r-nbo-juba');
  ok(r.status === 200 && r.body.results['fleet-board'].data.cards.every((x: any) => /Juba/.test(x.group)), 'route filter', r.body.results?.['fleet-board']?.data.cards.map((x: any) => x.group));
  r = await c.req('GET', '/dashboards/exec-overview', { token: T.daniel });
  ok(r.status === 200 && r.body.key === 'exec-overview' && r.body.data?.kpis?.length >= 7 && r.body.options, 'GET /dashboards/:key → one dashboard + filter options');
  expectStatus(await get('daniel', '?keys=no-such-board'), 404, 'unknown dashboard → 404');
  expectStatus(await get('daniel', '?keys=audit-log'), 403, 'browser-computed dashboards (audit log) are not served here');
  r = await get('michael', '?keys=exec-overview,alerts');
  ok(r.status === 200 && r.body.results['exec-overview'] && r.body.results.alerts, 'Michael: same as Daniel');

  section('Dashboards · Kabonge (his pairs, values allowed)');
  r = await get('kabonge', '?keys=po-pipeline,ordered-loaded-delivered,open-orders,loading-status,alerts');
  ok(r.status === 200, 'Kabonge: his dashboards', r.body);
  const kItems = r.body.results?.['po-pipeline']?.data.stages.flatMap((s: any) => s.items) ?? [];
  ok(kItems.length > 0 && kItems.every((x: any) => ['BTW–KBL Nairobi', 'Nihna–UBL Kampala', 'Kivu–SBL Mwanza'].includes(x.pair)), 'Kabonge: orders of BTW–KBL, Nihna–UBL, Kivu–SBL only (never Nihna–GBI)', [...new Set(kItems.map((x: any) => x.pair))]);
  const gbi = (await env.sql`select ref from pos where entity_id = 'e-nud' and supplier_id = 's-gbi'`).map((x) => x.ref);
  ok(!JSON.stringify(r.body).includes(gbi[0] ?? '§none§'), 'no Nihna–GBI order reference anywhere in his dashboards', gbi.slice(0, 2));
  ok(r.body.results?.['po-pipeline']?.data.stages.some((s: any) => s.value > 0) && !r.body.results['po-pipeline'].pricesHidden, 'Kabonge sees order values (he raises the POs)');
  ok(!r.body.results?.alerts?.data.items.some((a: any) => a.kind === 'Unpaid fee'), 'Kabonge: no fee alerts (no truck money)');
  for (const k of ['sales-summary', 'profit-margin', 'fee-payments', 'stock-on-hand', 'users-logins']) expectStatus(await get('kabonge', `?keys=${k}`), 403, `Kabonge: ${k} refused`);
  expectStatus(await get('kabonge', '?keys=po-pipeline&entityId=e-nope'), 403, 'Kabonge: a company outside his scope → 403');
  r = await get('kabonge', '?keys=po-pipeline');
  ok(r.body.options.suppliers.every((s: string) => ['s-kbl', 's-ubl', 's-sbl'].includes(s)), 'Kabonge: filter options = his suppliers only', r.body.options.suppliers);

  section('Dashboards · Testfie (every truck, fees, GBI loading; no goods value)');
  r = await get('testfie', '?keys=fleet-board,delayed-trucks,truck-issues,driver-updates,agreed-vs-actual,fee-payments,truck-expenses,loading-list');
  ok(r.status === 200 && Object.keys(r.body.results).length === 8, 'Testfie: her eight dashboards');
  ok(r.body.results?.['fleet-board']?.data.cards.length > 0 && r.body.results['fee-payments'].data.rows.length > 0, 'Testfie: trucks on the board and fee rows');
  ok((r.body.results?.['loading-list']?.data.rows ?? []).every((x: any) => x.loadingPoint.startsWith('GBI')), 'Testfie: the Mombasa (GBI) loading list only');
  for (const k of ['profit-margin', 'landed-product', 'sales-summary', 'po-pipeline', 'unpaid-fees']) expectStatus(await get('testfie', `?keys=${k}`), 403, `Testfie: ${k} refused`);

  section('Dashboards · loaders (their point, no prices)');
  for (const [u, lp] of [['joel', 'KBL'], ['eric', 'KBL'], ['moses', 'UBL']] as const) {
    r = await get(u, '?keys=loading-list,dispatched-today');
    ok(r.status === 200 && (r.body.results['loading-list'].data.rows as any[]).every((x) => x.loadingPoint.startsWith(lp)) && (r.body.results['dispatched-today'].data.rows as any[]).every((x) => x.from.startsWith(lp)), `${u}: ${lp} only`, r.body.results?.['loading-list']?.data.rows.map((x: any) => x.loadingPoint));
    ok(!money.test(JSON.stringify(r.body)) && r.body.results['loading-list'].pricesHidden === true, `${u}: no prices, values or payments in the response`);
    for (const k of ['po-pipeline', 'fleet-board', 'stock-on-hand', 'fee-payments']) expectStatus(await get(u, `?keys=${k}`), 403, `${u}: ${k} refused`);
  }

  section('Dashboards · receivers (own warehouses, quantities only)');
  r = await get('yonas', '?keys=incoming,received-damaged-short,stock-on-hand,stock-in-transit,delivery-losses,warehouse-expenses');
  ok(r.status === 200, 'Yonas: his dashboards', r.body);
  ok((r.body.results?.incoming?.data.rows ?? []).every((x: any) => /Juba/.test(x.warehouse)) && (r.body.results?.['received-damaged-short']?.data.rows ?? []).every((x: any) => /Juba/.test(x.warehouse)), 'Yonas: Juba deliveries only');
  ok((r.body.results?.['warehouse-expenses']?.data.byWarehouse ?? []).every((x: any) => x.warehouseId === 'w-juba'), 'Yonas: Juba expenses only');
  const y = { ...r.body.results }; delete y['warehouse-expenses']; delete y['delivery-losses'];
  ok(!money.test(JSON.stringify(y)), 'Yonas: no purchase prices, landed cost or values');
  r = await get('asie', '?keys=incoming,stock-on-hand,reexports,stock-in-transit');
  ok(r.status === 200 && (r.body.results.incoming.data.rows as any[]).every((x) => !/Juba/.test(x.warehouse)) && (r.body.results['stock-in-transit'].data.rows as any[]).every((x) => !/Juba/.test(x.warehouse) || x.ref.startsWith('ASIE-RX')), 'Asie: Gisenyi / Goma, never Yonas\'s deliveries (only her own re-exports to Juba)');
  ok((r.body.results.reexports?.data.rows ?? []).length >= 4, 'Asie: her re-export orders');
  ok(!money.test(JSON.stringify(r.body)), 'Asie: no values');
  for (const k of ['sales-summary', 'fleet-board', 'po-pipeline', 'fee-payments', 'loading-list']) expectStatus(await get('asie', `?keys=${k}`), 403, `Asie: ${k} refused`);
  r = await get('yonas', '?keys=incoming&warehouseId=w-kgl');
  ok(r.status === 200 && (r.body.results.incoming.data.rows as any[]).every((x) => /Juba/.test(x.warehouse)), 'Yonas: a Gisenyi filter cannot widen his scope (only trucks from Gisenyi to Juba)', r.body.results?.incoming?.data.rows.map((x: any) => x.warehouse));
  ok((await get('yonas', '?keys=incoming')).body.options.warehouses.every((w: string) => w === 'w-juba'), 'Yonas: warehouse filter options = Juba only');
}
