// docs/14 (workstream B): warehouse expenses (B-01), inventory recording (B-02), re-export Asie → Yonas end to end (B-03),
// transport fees with ageing flags (B-04), selling prices (B-05), landed cost v2 + combined performance (B-06/B-07) and
// shortage / damage reasons on acknowledgements (B-08) — each with its access rules (receivers own warehouse only and no
// values; Testfie no goods value; directors only for prices and performance).
import { client, expectStatus, ok, section, type Env } from './harness';

export async function moneySuite(env: Env) {
  const c = client(env.base);
  const T = {
    dir: (await c.login('daniel')).accessToken, mic: (await c.login('michael')).accessToken, kab: (await c.login('kabonge')).accessToken, tf: (await c.login('testfie')).accessToken,
    joel: (await c.login('joel')).accessToken, asie: (await c.login('asie')).accessToken, yonas: (await c.login('yonas')).accessToken, drv1: (await c.login('+254702750019', '1234')).accessToken,
  };
  const req = (m: string, p: string, token: string, body?: unknown, headers: Record<string, string> = {}) => c.req(m, p, { token, body, headers });
  const today = new Date().toISOString().slice(0, 10);

  section('Money · seed (3 months) and config');
  const ref = (await req('GET', '/ref', T.dir)).body;
  ok(ref.config?.fees?.amberDays === 14 && ref.config.fees.redDays === 30 && ref.config.costs?.allocation === 'quantity', 'config.toml [fees] 14 / 30 days and [costs] allocation = quantity reach the apps', ref.config);
  const seeded = (await env.sql`select count(*)::int n, count(distinct warehouse_id)::int w, count(distinct substr(date, 1, 7))::int m from warehouse_expenses`)[0];
  ok(seeded.n > 40 && seeded.w === 3 && seeded.m === 4, 'seed: warehouse expenses at 3 warehouses over 3 months + this month', seeded);
  const reasons = (await env.sql`select count(*)::int n from acks, jsonb_array_elements(lines) l where l->>'reason' is not null`)[0].n;
  ok(reasons > 15, 'seed: acknowledgement lines carry shortage / damage reasons (for the Pareto)', reasons);
  const rx0 = (await env.sql`select ref, status from reexport_orders order by ref`);
  ok(rx0.length === 4 && rx0.every((r) => /^ASIE-RX-\d{4}-\d{4}$/.test(r.ref)), 'seed: four re-export orders ASIE-RX-…', rx0);

  section('Money · B-01 warehouse expenses');
  let r = await req('GET', '/warehouse/expenses', T.asie);
  ok(r.status === 200 && r.body.length > 0 && r.body.every((x: any) => ['w-kgl', 'w-goma'].includes(x.warehouseId)), 'Asie: Gisenyi and Goma expenses only', r.status);
  expectStatus(await req('GET', '/warehouse/expenses?warehouseId=w-juba', T.asie), 403, 'Asie cannot read Juba expenses');
  r = await req('GET', '/warehouse/expenses', T.yonas);
  ok(r.status === 200 && r.body.every((x: any) => x.warehouseId === 'w-juba'), 'Yonas: Juba only');
  for (const [who, t] of [['Testfie', T.tf], ['Kabonge', T.kab], ['a loader', T.joel], ['a driver', T.drv1]] as const) expectStatus(await req('GET', '/warehouse/expenses', t), 403, `${who}: no warehouse expenses`);
  const up = await req('POST', '/files', T.asie, { kind: 'photo', name: 'water-bill.jpg', contentType: 'image/png', dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' });
  r = await req('POST', '/warehouse/expenses', T.asie, { warehouseId: 'w-kgl', date: today, category: 'Utilities', amount: 141800, currency: 'RWF', reference: 'REG-123', note: 'Water', receiptFileId: up.body?.id, receiptName: 'water-bill.jpg' });
  ok(r.status === 201 && r.body.amountUsd > 80 && r.body.amountUsd < 120 && r.body.fxRate > 1000 && r.body.receivingCompanyId === 'rc-asie' && r.body.receipt?.id === up.body?.id && r.body.byUserId === 'u-asie', 'Asie records an RWF expense with a receipt photo (USD at the month rate)', r.body);
  const ex = r.body;
  expectStatus(await req('POST', '/warehouse/expenses', T.asie, { warehouseId: 'w-juba', date: today, category: 'Rent', amount: 10 }), 403, 'Asie cannot record for Juba');
  expectStatus(await req('POST', '/warehouse/expenses', T.asie, { warehouseId: 'w-kgl', date: '2099-01-01', category: 'Party', amount: -5 }), 422, 'expense validated (category, amount, date)');
  expectStatus(await req('POST', '/warehouse/expenses', T.tf, { warehouseId: 'w-kgl', date: today, category: 'Rent', amount: 10 }), 403, 'Testfie cannot record warehouse expenses');
  r = await req('PATCH', `/warehouse/expenses/${ex.id}`, T.asie, { amount: 150000 });
  ok(r.status === 200 && r.body.amount === 150000 && r.body.category === 'Utilities', 'she corrects her own expense');
  expectStatus(await req('PATCH', `/warehouse/expenses/${ex.id}`, T.yonas, { amount: 1 }), [403, 404], 'Yonas cannot change a Gisenyi expense');
  r = await req('GET', `/warehouse/expenses?category=Rent&from=${today.slice(0, 8)}01`, T.dir);
  ok(r.status === 200 && r.body.length >= 1 && r.body.every((x: any) => x.category === 'Rent' && x.date >= `${today.slice(0, 8)}01`), 'directors filter by category and date', r.body.length);
  const aud = (await req('GET', '/audit?feature=warehouse&pageSize=5', T.dir)).body;
  ok(aud.rows?.some((x: any) => x.recordId === ex.id), 'expense changes are in the audit log', aud.rows?.map((x: any) => x.path));
  expectStatus(await req('DELETE', `/warehouse/expenses/${ex.id}`, T.dir), 204, 'a director removes it');

  section('Money · B-02 warehouse inventory recording (no values)');
  r = await req('GET', '/warehouse/stock', T.yonas);
  ok(r.status === 200 && r.body.length > 0 && r.body.every((x: any) => x.warehouseId === 'w-juba' && !('landedCostPerCase' in x) && !('value' in x)), 'Yonas: Juba stock, quantities only (received, damaged, short, moved out, held)', r.body[0]);
  const a300 = r.body.find((x: any) => x.productId === 'p-a300' && x.entityId === 'e-btw');
  ok(a300 && a300.held > 100, 'Juba holds Tusker cans', a300);
  expectStatus(await req('GET', '/warehouse/stock?warehouseId=w-kgl', T.yonas), 403, 'Yonas cannot read Gisenyi stock');
  for (const [who, t] of [['Testfie', T.tf], ['Kabonge', T.kab], ['a loader', T.joel]] as const) expectStatus(await req('GET', '/warehouse/stock', t), 403, `${who}: no warehouse inventory`);
  r = await req('POST', '/warehouse/stock-adjustments', T.yonas, { warehouseId: 'w-juba', productId: 'p-a300', entityId: 'e-btw', kind: 'count', counted: a300.held - 4, note: 'Month-end count' });
  ok(r.status === 201 && r.body.qty === -4 && r.body.reason === 'Count difference', 'a count 4 under posts −4 (count difference)', r.body);
  const a1 = (await req('GET', '/warehouse/stock?warehouseId=w-juba', T.yonas)).body.find((x: any) => x.productId === 'p-a300' && x.entityId === 'e-btw');
  ok(a1.held === a300.held - 4 && a1.lastCountAt, 'held follows the count; last count date', a1);
  expectStatus(await req('POST', '/warehouse/stock-adjustments', T.yonas, { warehouseId: 'w-juba', productId: 'p-a300', entityId: 'e-btw', kind: 'moved-out', qty: 5 }), 422, 'moved out needs a note');
  expectStatus(await req('POST', '/warehouse/stock-adjustments', T.yonas, { warehouseId: 'w-juba', productId: 'p-a300', entityId: 'e-btw', kind: 'damaged', qty: 999999, note: 'x' }), 422, 'cannot write off more than held');
  expectStatus(await req('POST', '/warehouse/stock-adjustments', T.yonas, { warehouseId: 'w-kgl', productId: 'p-a300', entityId: 'e-btw', kind: 'found', qty: 1 }), 403, 'Yonas cannot adjust Gisenyi');
  r = await req('POST', '/warehouse/stock-adjustments', T.yonas, { warehouseId: 'w-juba', productId: 'p-a300', entityId: 'e-btw', kind: 'damaged', qty: 2, note: 'Dropped from the pallet' });
  ok(r.status === 201 && r.body.qty === -2 && r.body.reason === 'Damaged write-off', 'damaged write-off');
  const dmg = (await env.sql`select kind, qty, reason, note, by_user_id from stock_moves where reason = 'Damaged write-off' and by_user_id = 'u-yonas' order by id desc limit 1`)[0];
  ok(dmg?.kind === 'damaged' && dmg.qty === 2 && dmg.note === 'Dropped from the pallet', 'stored as a stock move with reason, note and who', dmg);
  r = await req('GET', '/warehouse/stock-adjustments', T.yonas);
  ok(r.status === 200 && r.body[0]?.reason === 'Damaged write-off' && r.body.every((x: any) => x.warehouseId === 'w-juba'), 'adjustment history, newest first, own warehouse');
  r = await req('GET', '/warehouse/stock', T.dir);
  ok(r.status === 200 && new Set(r.body.map((x: any) => x.warehouseId)).size === 3, 'directors see every warehouse');

  section('Money · B-03 re-export Asie → Yonas end to end');
  const g0 = (await req('GET', '/warehouse/stock?warehouseId=w-kgl', T.asie)).body.find((x: any) => x.productId === 'p-b500' && x.entityId === 'e-btw');
  const j0 = (await req('GET', '/warehouse/stock?warehouseId=w-juba', T.yonas)).body.find((x: any) => x.productId === 'p-b500' && x.entityId === 'e-btw');
  expectStatus(await req('POST', '/reexports', T.asie, { fromWarehouseId: 'w-kgl', entityId: 'e-btw', lines: [{ productId: 'p-b500', qty: g0.held + 1 }] }), 422, 'cannot re-export more than held');
  expectStatus(await req('POST', '/reexports', T.asie, { fromWarehouseId: 'w-juba', entityId: 'e-btw', lines: [{ productId: 'p-b500', qty: 1 }] }), 403, 'not from a warehouse that is not hers');
  for (const [who, t] of [['Testfie', T.tf], ['Yonas', T.yonas], ['a director', T.dir]] as const) expectStatus(await req('POST', '/reexports', t, { fromWarehouseId: 'w-kgl', entityId: 'e-btw', lines: [{ productId: 'p-b500', qty: 1 }] }), 403, `${who} cannot raise a re-export`);
  r = await req('POST', '/reexports', T.asie, { fromWarehouseId: 'w-kgl', entityId: 'e-btw', lines: [{ productId: 'p-b500', qty: 120 }], note: 'QA re-export' });
  ok(r.status === 201 && /^ASIE-RX-\d{4}-0005$/.test(r.body.ref) && r.body.toWarehouseId === 'w-juba' && r.body.routeId === 'r-kgl-juba' && r.body.status === 'Open' && r.body.followUpById === 'u-testfie', 'Asie raises ASIE-RX-…-0005 Gisenyi → Juba (follow-up Testfie, to confirm)', r.body);
  const o = r.body;
  expectStatus(await req('POST', `/reexports/${o.id}/load`, T.yonas, { truckId: 't2', driverId: 'd3' }), 403, 'Yonas cannot load it');
  r = await req('POST', `/reexports/${o.id}/load`, T.asie, { market: { company: 'Gisenyi Movers', reg: 'RAD 777Q', driverName: 'Jean Bosco', driverPhone: '+250788000111' }, loadedQty: { 'p-b500': 118 } });
  ok(r.status === 200 && r.body.status === 'Loaded' && r.body.shipmentId && r.body.lines[0].loadedQty === 118 && !('price' in r.body.lines[0]), 'she loads it on a market truck (118 cases, no prices) — a new shipment', r.body);
  const lo = r.body;
  expectStatus(await req('POST', `/reexports/${o.id}/load`, T.asie, { truckId: 't2', driverId: 'd3' }), 409, 'cannot load twice');
  const g1 = (await req('GET', '/warehouse/stock?warehouseId=w-kgl', T.asie)).body.find((x: any) => x.productId === 'p-b500' && x.entityId === 'e-btw');
  ok(g1.held === g0.held - 118 && g1.transfersOut === g0.transfersOut + 118, 'Gisenyi stock down by 118 (re-exported)', [g0.held, g1.held]);
  const sh = (await req('GET', `/shipments/${lo.shipmentId}`, T.asie)).body;
  ok(sh.ref === o.ref && sh.fromWarehouseId === 'w-kgl' && sh.warehouseId === 'w-juba' && sh.legs[0].routeId === 'r-kgl-juba' && sh.legs[0].status === 'Loaded', 'the shipment carries the order ref, Gisenyi → Juba', sh.ref);
  const give = (await req('GET', '/field/giver', T.asie)).body;
  ok(give.handover.some((v: any) => v.shipment.id === lo.shipmentId), 'it is on Asie\'s hand-over list (phone)');
  expectStatus(await req('POST', `/legs/${sh.legs[0].id}/dispatch`, T.asie, {}), [200, 201], 'Asie hands over (dispatch)');
  ok((await req('GET', `/reexports/${o.id}`, T.asie)).body.status === 'In transit', 'order: in transit');
  const inc = (await req('GET', '/field/receiver', T.yonas)).body;
  ok(inc.incoming.some((v: any) => v.shipment.id === lo.shipmentId), 'Yonas sees it coming (phone)');
  ok((await req('GET', '/reexports', T.yonas)).body.some((x: any) => x.id === o.id), 'Yonas lists the incoming re-export');
  ok((await req('GET', '/reexports', T.tf)).body.some((x: any) => x.id === o.id), 'Testfie follows it up');
  for (const [who, t] of [['Kabonge', T.kab], ['a loader', T.joel], ['a driver', T.drv1]] as const) expectStatus(await req('GET', '/reexports', t), 403, `${who}: no re-exports`);
  expectStatus(await req('POST', `/legs/${sh.legs[0].id}/acknowledgement`, T.yonas, { receiverName: 'Yonas', lines: [{ productId: 'p-b500', received: 116, damaged: 1, reason: 'Aliens' }] }), 422, 'B-08: a reason must come from the list');
  r = await req('POST', `/legs/${sh.legs[0].id}/acknowledgement`, T.yonas, { receiverName: 'Yonas', lines: [{ productId: 'p-b500', received: 116, damaged: 1, reason: 'Theft/pilferage', remarks: '2 short, 1 broken' }] });
  ok(r.status === 201 && r.body.lines[0].reason === 'Theft/pilferage' && r.body.lines[0].expected === 118, 'Yonas acknowledges with a reason (stored)', r.body.lines);
  ok((await req('GET', `/reexports/${o.id}`, T.yonas)).body.status === 'Delivered', 'order: delivered');
  const j1 = (await req('GET', '/warehouse/stock?warehouseId=w-juba', T.yonas)).body.find((x: any) => x.productId === 'p-b500' && x.entityId === 'e-btw');
  ok(j1.transfersIn - (j0?.transfersIn ?? 0) === 116 && j1.short - (j0?.short ?? 0) === 2 && j1.held - (j0?.held ?? 0) === 115, 'Juba: +116 in, 2 short, 1 damaged → +115 held', [j0, j1]);
  const mv = await env.sql`select warehouse_id, kind, qty from stock_moves where ref = ${o.ref} order by id`;
  ok(mv.length === 3 && mv[0].kind === 'transferOut' && mv[0].warehouse_id === 'w-kgl' && mv[1].kind === 'transferIn' && mv[1].warehouse_id === 'w-juba' && mv[2].kind === 'damaged', 'stock moves: transfer out Gisenyi → transfer in + damaged Juba', mv);
  r = await req('POST', '/reexports', T.asie, { fromWarehouseId: 'w-kgl', entityId: 'e-btw', lines: [{ productId: 'p-b500', qty: 10 }] });
  ok((await req('POST', `/reexports/${r.body.id}/cancel`, T.asie, { reason: 'Truck not available' })).body.status === 'Cancelled', 'an order not loaded can be cancelled');

  section('Money · B-04 agreed price and transport-fee tracking');
  r = await req('GET', '/finance/fees', T.tf);
  ok(r.status === 200 && r.body.length > 20 && ['Paid', 'Part paid', 'Not recorded'].every((s) => r.body.some((f: any) => f.status === s)), 'Testfie: fee status per trip (paid / part paid / not recorded)', r.body.length);
  ok(r.body.some((f: any) => f.flag === 'red') && r.body.some((f: any) => f.flag === 'amber') && r.body.every((f: any) => !('goods' in f) && !('landing' in f)), 'ageing flags amber / red; no goods value for Testfie');
  ok(r.body.some((f: any) => f.reexport && f.ref === o.ref), 're-export trucks are tracked too');
  const red = r.body.find((f: any) => f.flag === 'red');
  ok(red.ageDays >= 30 && ['Unpaid', 'Part paid'].includes(red.status), 'red = unpaid 30 days or more after loading', red);
  const nr = r.body.find((f: any) => f.status === 'Not recorded');
  expectStatus(await req('POST', `/shipments/${nr.shipmentId}/agreed-price`, T.tf, { amount: 1800, currency: 'USD', docRef: 'AGR-QA' }), 200, 'Testfie records the agreed price after loading');
  let fr = (await req('GET', '/finance/fees', T.tf)).body.find((f: any) => f.shipmentId === nr.shipmentId);
  ok(fr.status === 'Unpaid' && fr.agreedUsd === 1800, 'then the fee is unpaid', fr);
  r = await req('POST', '/finance/costs', T.tf, { shipmentId: nr.shipmentId, legId: fr.legs[0].id, kind: 'Taxes & duties', amount: 210, currency: 'USD', docRef: 'RRA-QA' });
  ok(r.status === 201 && r.body.legId === fr.legs[0].id, 'Testfie adds a truck expense on a leg', r.body);
  const tcost = fr.costs.find((x: any) => x.kind === 'Transport');
  expectStatus(await req('POST', '/finance/payments', T.tf, { shipmentId: nr.shipmentId, costId: tcost.id, amount: 100, reference: 'X' }), 403, 'Testfie cannot record payments');
  expectStatus(await req('POST', '/finance/payments', T.dir, { shipmentId: nr.shipmentId, costId: tcost.id, amount: 400, reference: 'MPESA QA1' }), 201, 'a director records a payment against a reference');
  fr = (await req('GET', '/finance/fees', T.dir)).body.find((f: any) => f.shipmentId === nr.shipmentId);
  ok(fr.status === 'Part paid' && fr.paidUsd === 400 && fr.balanceUsd === 1400 && fr.references.includes('MPESA QA1'), 'part paid, balance 1,400, reference searchable', fr);
  for (const [who, t] of [['Kabonge', T.kab], ['Asie', T.asie], ['a loader', T.joel]] as const) expectStatus(await req('GET', '/finance/fees', t), 403, `${who}: no transport fees`);

  section('Money · B-05 selling prices (directors) and new sales');
  r = await req('GET', '/selling-prices', T.dir);
  ok(r.status === 200 && r.body.length >= 12 && r.body.some((x: any) => x.warehouseId === 'w-juba'), 'seeded prices with history and a Juba price', r.body.length);
  for (const [who, t] of [['Kabonge', T.kab], ['Testfie', T.tf], ['Asie', T.asie], ['Yonas', T.yonas]] as const) {
    expectStatus(await req('GET', '/selling-prices', t), 403, `${who}: no selling prices`);
    expectStatus(await req('POST', '/selling-prices', t, { entityId: 'e-btw', productId: 'p-a300', price: 1 }), 403, `${who} cannot set a price`);
  }
  expectStatus(await req('POST', '/selling-prices', T.dir, { productId: 'p-a300', price: 16 }), 422, 'Group view: a price must name its company');
  expectStatus(await req('POST', '/selling-prices', T.dir, { entityId: 'e-btw', productId: 'p-a300', price: -1, from: 'x' }), 422, 'price and date validated');
  r = await req('POST', '/selling-prices', T.dir, { entityId: 'e-btw', productId: 'p-a300', warehouseId: 'w-kgl', price: 16.4, from: today, note: 'QA' });
  ok(r.status === 201 && r.body.price === 16.4 && r.body.warehouseId === 'w-kgl' && r.body.byUserId === 'u-daniel', 'a director sets a Gisenyi price from today', r.body);
  r = await req('POST', '/selling-prices', T.mic, { entityId: 'e-btw', productId: 'p-a300', price: 15.9, from: today }, { 'x-entity-id': 'e-btw' });
  ok(r.status === 201 && r.body.warehouseId === null, 'Michael sets the company-wide price (BTW)');

  section('Money · B-06/B-07 landed cost v2 and combined performance (directors)');
  r = await req('GET', '/reports/performance?level=product&targetMargin=0.2', T.dir);
  ok(r.status === 200 && r.body.rows.length >= 5 && r.body.allocation === 'quantity' && r.body.targetMargin === 0.2, 'performance by product', r.status);
  const pa = r.body.rows.find((x: any) => x.productId === 'p-a300');
  ok(pa.qtyReceived > 0 && pa.goodsCost > 0 && pa.truckCost > 0 && pa.warehouseCost > 0 && Math.abs(pa.landedCost - (pa.goodsCost + pa.truckCost + pa.warehouseCost)) < 0.05, 'landed = goods + truck + warehouse share', pa);
  ok(Math.abs(pa.landedPerUnit - pa.landedCost / pa.qtyReceived) < 0.001 && Math.abs(pa.profit - (pa.revenue - pa.cogs)) < 0.05 && pa.margin > 0 && pa.margin < 0.5, 'per unit = landed ÷ received; profit = revenue − cost of units sold', pa);
  ok(Math.abs(pa.priceForTarget - Math.round((pa.landedPerUnit / 0.8) * 100) / 100) < 0.011, 'target margin 20 %: price needed = landed per unit ÷ 0.8', pa.priceForTarget);
  const perf = r.body;
  ok(Math.abs(perf.waterfall[0].value - perf.totals.revenue) < 0.01 && Math.abs(perf.waterfall.at(-1).value - perf.netProfit) < 0.01 && perf.waterfall.map((s: any) => s.label).join() === 'Revenue,Goods,Truck,Warehouse,Other,Profit', 'waterfall revenue → goods → truck → warehouse → other → profit');
  const lv = await Promise.all(['warehouse', 'company', 'receiving', 'business'].map((level) => req('GET', `/reports/performance?level=${level}`, T.dir).then((x) => x.body)));
  const rev = (b: any) => Math.round(b.rows.reduce((a: number, x: any) => a + x.revenue, 0));
  ok(lv.every((b) => Math.abs(rev(b) - rev(perf)) <= 2), 'the levels add up to the same revenue', lv.map(rev));
  ok(lv[1].rows.length === 3 && lv[2].rows.map((x: any) => x.key).sort().join() === 'rc-asie,rc-yonas' && lv[3].rows.length === 1, 'levels: 3 companies, Asie / Yonas, whole business');
  ok(perf.byTruck.length > 0 && perf.byTruck.every((x: any) => Math.abs(x.total - (x.goods + x.truck + x.warehouse)) < 0.05), 'landed cost per truck');
  const one = (await req('GET', '/reports/performance?level=product', T.dir, undefined, { 'x-entity-id': 'e-kivu' })).body;
  ok(one.rows.every((x: any) => x.productId === 'p-e330' || x.revenue === 0), 'company scope (Kivu) narrows the report', one.rows.map((x: any) => x.productId));
  for (const [who, t] of [['Kabonge', T.kab], ['Testfie', T.tf], ['Asie', T.asie], ['Yonas', T.yonas], ['a loader', T.joel]] as const) expectStatus(await req('GET', '/reports/performance', t), 403, `${who}: no performance report`);
}
