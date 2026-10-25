// docs/12: static data (A-05), the audit log search (A-07), price hiding (A-04) and the missing agreed price in reports.
import { client, expectStatus, ok, section, type Env } from './harness';

export async function accessSuite(env: Env) {
  const c = client(env.base);
  const T = {
    dir: (await c.login('daniel')).accessToken, kab: (await c.login('kabonge')).accessToken, tf: (await c.login('testfie')).accessToken,
    joel: (await c.login('joel')).accessToken, asie: (await c.login('asie')).accessToken, yonas: (await c.login('yonas')).accessToken, drv1: (await c.login('+254702750019', '1234')).accessToken,
  };
  const req = (m: string, p: string, token: string, body?: unknown, headers: Record<string, string> = {}) => c.req(m, p, { token, body, headers });

  section('Access · static data: companies (room for 5)');
  for (const [who, t] of [['Testfie', T.tf], ['a loader', T.joel], ['a receiver', T.asie]] as const) expectStatus(await req('POST', '/masterdata/entities', t, { code: 'QAX', name: 'QA X Ltd' }), 403, `${who} cannot add a company`);
  expectStatus(await req('POST', '/masterdata/entities', T.kab, { code: 'btw', name: 'Another' }), 409, 'company code must be unique');
  expectStatus(await req('POST', '/masterdata/entities', T.kab, { code: '1X', name: '' }), 422, 'company form validated');
  let r = await req('POST', '/masterdata/entities', T.kab, { code: 'QAD', name: 'QA Distributors Ltd', shortName: 'QA Dist', email: 'info@qa.example', reportingCurrency: 'USD' });
  ok(r.status === 201 && r.body.id && r.body.poPrefix === 'QAD-PO' && r.body.active === true, 'Kabonge adds a company (PO prefix from the code)', r.body);
  const ent = r.body;
  r = await req('POST', '/masterdata/entities', T.dir, { code: 'QAE', name: 'QA Exporters Ltd' });
  expectStatus(r, 201, 'a director adds the fifth company');
  expectStatus(await req('POST', '/masterdata/entities', T.dir, { code: 'QAF', name: 'QA Full Ltd' }), 422, 'no room for a sixth company (limit 5, to confirm)');
  r = await req('PATCH', `/masterdata/entities/${ent.id}`, T.kab, { tagline: 'QA tagline', active: false });
  ok(r.status === 200 && r.body.active === false && r.body.tagline === 'QA tagline' && r.body.name === 'QA Distributors Ltd', 'edits and deactivates it (other fields kept)', r.body);
  const dm = (await req('GET', '/me', T.dir)).body;
  ok(dm.allowedEntityIds.includes(ent.id), 'directors reach the new company at once (group-wide)', dm.allowedEntityIds);

  section('Access · static data: suppliers (room for 7), goods, receiving companies');
  expectStatus(await req('POST', '/masterdata/suppliers', T.kab, { code: 'QAS', name: 'QA Supplier', city: 'Arusha', country: 'Tanzania' }), 422, 'a new supplier needs its loading-point location');
  r = await req('POST', '/masterdata/suppliers', T.kab, { code: 'QAS', name: 'QA Supplier', city: 'Arusha', country: 'Tanzania', email: 'sales@qas.example', lat: -3.37, lng: 36.68 });
  ok(r.status === 201 && r.body.checkpointId, 'adds a supplier with a loading-point checkpoint', r.body);
  const sup = r.body;
  const cp = (await req('GET', '/ref', T.kab)).body.checkpoints.find((x: any) => x.id === sup.checkpointId);
  ok(cp?.kind === 'loading' && cp.country === 'TZ', 'its loading point is a TZ loading checkpoint', cp);
  expectStatus(await req('POST', '/masterdata/suppliers', T.kab, { code: 'kbl', name: 'Dup', city: 'x', country: 'Kenya', lat: 0, lng: 0 }), 409, 'supplier code must be unique');
  for (const code of ['QT1', 'QT2']) await req('POST', '/masterdata/suppliers', T.dir, { code, name: `QA ${code}`, city: 'x', country: 'Kenya', lat: 0, lng: 0 });
  expectStatus(await req('POST', '/masterdata/suppliers', T.dir, { code: 'QT3', name: 'QA QT3', city: 'x', country: 'Kenya', lat: 0, lng: 0 }), 422, 'no room for an eighth supplier (limit 7, to confirm)');
  expectStatus(await req('POST', '/masterdata/products', T.kab, { sku: 'KBL-42', brand: 'x', pack: 'x', unitsPerCase: 1, sizeMl: 1, supplierId: 's-kbl' }), 409, 'SKU must be unique');
  expectStatus(await req('POST', '/masterdata/products', T.kab, { sku: 'QA-1', brand: 'QA', pack: '24 x 330 ml', unitsPerCase: 0, sizeMl: 330, supplierId: 's-nope' }), 422, 'goods form validated (supplier, case size)');
  r = await req('POST', '/masterdata/products', T.kab, { sku: 'qa-1', brand: 'QA Lager', pack: '24 x 330 ml cans', unitsPerCase: 24, sizeMl: 330, supplierId: sup.id, category: 'beer', price: 9.5 });
  ok(r.status === 201 && r.body.sku === 'QA-1' && r.body.category === 'beer', 'adds goods (pack, supplier, category)', r.body);
  const prod = r.body;
  const pl = (await req('GET', '/ref', T.kab)).body.priceList.find((x: any) => x.productId === prod.id);
  ok(pl?.price === 9.5, 'with its purchase price in the price list', pl);
  r = await req('PATCH', `/masterdata/products/${prod.id}`, T.kab, { pack: '24 x 330 ml bottles', price: 9.9 });
  ok(r.status === 200 && r.body.pack === '24 x 330 ml bottles', 'edits the pack and price', r.body);
  r = await req('POST', '/masterdata/receiving-companies', T.kab, { name: 'QA Receivers', countries: ['Burundi'] });
  ok(r.status === 201 && r.body.active === true, 'adds a receiving company', r.body);
  expectStatus(await req('POST', '/masterdata/receiving-companies', T.kab, { name: 'asie company', countries: ['Rwanda'] }), 409, 'receiving company names are unique');
  expectStatus(await req('PATCH', `/masterdata/receiving-companies/${r.body.id}`, T.kab, { countries: [] }), 422, 'needs at least one country');
  expectStatus(await req('PATCH', '/masterdata/receiving-companies/rc-yonas', T.tf, { name: 'x' }), 403, 'Testfie cannot edit receiving companies');
  expectStatus(await req('PATCH', `/masterdata/suppliers/${sup.id}`, T.kab, { active: false }), 200, 'deactivates the supplier (kept for history)');
  expectStatus(await req('POST', '/plans', T.dir, { entityId: 'e-nud', supplierId: sup.id }, { 'x-entity-id': 'e-nud' }), 409, 'no new orders from a deactivated supplier');

  section('Access · audit log (A-07)');
  for (const [who, t] of [['Kabonge', T.kab], ['Testfie', T.tf], ['a loader', T.joel], ['a receiver', T.asie], ['a driver', T.drv1]] as const) expectStatus(await req('GET', '/audit', t), 403, `${who} cannot read the audit log`);
  r = await req('GET', '/audit?pageSize=5', T.dir);
  ok(r.status === 200 && r.body.rows.length === 5 && r.body.total > 100 && r.body.byDay.length > 10, 'directors page through the log (seeded history + this run), with activity per day', { total: r.body.total, days: r.body.byDay.length });
  r = await req('GET', `/audit?userId=u-kabonge&feature=masterdata&q=${prod.id}`, T.dir);
  const edit = r.body.rows.find((x: any) => x.method === 'PATCH');
  ok(r.status === 200 && r.body.rows.length === 2 && r.body.rows.every((x: any) => x.userId === 'u-kabonge' && x.feature === 'masterdata' && x.recordId === prod.id), 'search by user, feature and record: the product\'s create + edit', r.body.rows.map((x: any) => [x.method, x.recordId]));
  ok(edit?.before?.pack === '24 x 330 ml cans' && edit.after?.pack === '24 x 330 ml bottles' && edit.before?.price === 9.5 && edit.after?.price === 9.9 && edit.userName === 'Kabonge', 'before / after values on the edit', edit);
  const today = new Date().toISOString().slice(0, 10);
  r = await req('GET', `/audit?from=${today}&to=${today}&pageSize=200`, T.dir);
  ok(r.status === 200 && r.body.rows.every((x: any) => x.at.slice(0, 10) === today) && r.body.byDay.length === 1, 'date filter (today only)', r.body.byDay);
  r = await req('GET', `/audit?q=Kabonge&pageSize=200`, T.dir);
  ok(r.body.rows.length > 0 && r.body.rows.every((x: any) => x.userId === 'u-kabonge' || /Kabonge/i.test(`${x.summary} ${x.path}`)), 'free-text search matches the user name');
  expectStatus(await req('GET', '/audit?from=yesterday', T.dir), 400, 'bad dates refused');
  r = await req('PATCH', '/users/u-joel', T.dir, { loadingPointIds: ['s-kbl', 's-ubl'] });
  const ua = (await req('GET', '/audit?userId=u-daniel&q=u-joel', T.dir)).body.rows[0];
  ok(ua?.recordType === 'user' && JSON.stringify(ua.before?.loadingPointIds) === '["s-kbl"]' && ua.after?.loadingPointIds?.length === 2, 'user scope changes keep before / after', ua);
  await req('PATCH', '/users/u-joel', T.dir, { loadingPointIds: ['s-kbl'] });
  T.joel = (await c.login('joel')).accessToken; // a scope change ends the user's sessions
  const noSecrets = (await req('GET', '/audit?feature=users&pageSize=200', T.dir)).body.rows;
  ok(!JSON.stringify(noSecrets).match(/"pin"|"password"/), 'no PINs or passwords in the audit log');

  section('Access · prices hidden for loaders, receivers and drivers (A-04)');
  const plan1 = (await req('GET', '/plans/plan-1', T.joel)).body;
  ok(plan1.pricesHidden === true && plan1.lines.every((l: any) => l.price === undefined), 'loader: order lines without prices');
  const yplan = (await req('GET', '/plans/plan-1', T.yonas)).body;
  ok(yplan.pricesHidden && yplan.lines.length > 0 && yplan.lines.every((l: any) => l.deliveredToId === 'rc-yonas' && l.price === undefined), 'receiver: only the lines delivered to her company, without prices', yplan.lines?.length);
  expectStatus(await req('GET', '/plans/plan-1/versions', T.joel), 200, 'versions endpoint answers…');
  ok(((await req('GET', '/plans/plan-1/versions', T.joel)).body as any[]).length === 0, '…but a loader gets no price-bearing snapshots');
  ok(((await req('GET', '/field/giver', T.joel)).body.toLoad as any[]).every((l) => !('agreedTransport' in l)), 'loader working set: no agreed transport price');
  ok(((await req('GET', '/stock', T.asie)).body as any[]).every((r0) => r0.landedCostPerCase === undefined), 'receiver stock: no landed cost per case');
  const sumA = (await req('GET', '/analytics/summary', T.asie)).body;
  ok(sumA.stockValue === 0 && sumA.sales30 === 0 && sumA.stockCases > 0, 'receiver summary: cases, no money', sumA);
  ok(((await req('GET', '/ref', T.drv1)).body.priceList as any[]).length === 0, 'driver reference data: no price list');
  expectStatus(await req('GET', '/finance/trips', T.drv1), 403, 'driver: no trip money');

  section('Access · a missing agreed price is counted, not zero');
  const fin = (await req('GET', '/reports/finance', T.dir)).body;
  ok(fin.totals.agreedMissing >= 1 && fin.byProvider.some((x: any) => x.agreedMissing >= 1), `finance report counts ${fin.totals.agreedMissing} trip(s) without an agreed price`, fin.totals);
  const cc = (await req('GET', `/reports/capture-check?from=${new Date(Date.now() - 7 * 864e5).toISOString()}`, T.dir)).body;
  ok(cc.kinds.some((k: any) => k.kind === 'Agreed transport price not recorded'), 'capture check flags it for the Truck desk');
  const tr = ((await req('GET', '/finance/trips', T.dir)).body as any[]).find((x) => x.agreedRecorded === false && !x.shipment.fromWarehouseId);
  ok(tr && tr.transport === 0 && tr.balance === 0, 'the trip has no Transport cost line (nothing invented)', tr && { transport: tr.transport });
  await req('POST', `/shipments/${tr.shipment.id}/agreed-price`, T.tf, { amount: 2_400_000, currency: 'TZS' });
  const fin2 = (await req('GET', '/reports/finance', T.dir)).body;
  ok(fin2.totals.agreedMissing === fin.totals.agreedMissing - 1 && fin2.totals.transport > fin.totals.transport, 'once recorded it counts as transport and leaves the missing count');
}
