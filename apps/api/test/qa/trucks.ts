// Truck follow-up officer (Testfie; role id truck_planner, docs/10 reshaped by docs/12): every truck and queue, truck
// expenses, the agreed transport price after loading, loading at GBI Mombasa only; transport master data view-only —
// onboarding is Kabonge's (static data). Queue reorder / remove with a reason (loader notified, audited).
import { client, expectStatus, ok, section, type Env } from './harness';

export async function trucksSuite(env: Env) {
  const c = client(env.base);
  const T = {
    tp: (await c.login('testfie')).accessToken, dir: (await c.login('daniel')).accessToken,
    joel: (await c.login('joel')).accessToken, moses: (await c.login('moses')).accessToken, asie: (await c.login('asie')).accessToken, acc: (await c.login('yonas')).accessToken, kabonge: (await c.login('kabonge')).accessToken,
  };
  const get = async (p: string, t = T.tp, h: Record<string, string> = {}) => (await c.req('GET', p, { token: t, headers: h })).body;

  section('Truck follow-up (Testfie) · role and features');
  const me = await get('/me');
  ok(me.roles?.join() === 'truck_planner' && me.allowedEntityIds?.length === 3 && me.canGroup === false && me.loadingPointIds?.join() === 's-gbi', 'Testfie: truck follow-up officer, all companies, loads at GBI Mombasa only', me);
  ok(['logistics', 'loading', 'fleet', 'trucks', 'truck-expenses', 'purchase-orders', 'master-data', 'transport-fees'].every((f) => me.features.includes(f)), 'features: shipments, loading, fleet, truck desk, truck expenses, POs (GBI), transport (view)', me.features);
  ok(!['finance', 'finance.approve', 'sales', 'master-data.transport', 'master-data.static', 'users', 'dashboard', 'reports', 'period-plans', 'inventory', 'audit'].some((f) => me.features.includes(f)), 'no trip financials, sales, static-data edits, users, dashboard, reports, plans, stock or audit', me.features);

  section('Truck follow-up · what Testfie may not do');
  expectStatus(await c.req('POST', '/plans', { token: T.tp, body: { entityId: 'e-nud', supplierId: 's-gbi' } }), 403, 'cannot create a purchase order');
  const tpPos = (await get('/pos')) as any[];
  ok(tpPos.length > 0 && tpPos.every((x) => x.supplierId === 's-gbi'), 'sees only the POs loading at GBI Mombasa', tpPos.map((x) => x.supplierId));
  expectStatus(await c.req('GET', '/pos/po-1', { token: T.tp }), 403, 'cannot open a KBL PO');
  const trips = (await get('/finance/trips')) as any[];
  ok(trips.length > 0 && new Set(trips.map((x) => x.shipment.entityId)).size === 3, 'reads the trip costs of every company', [...new Set(trips.map((x) => x.shipment.entityId))]);
  ok(trips.every((x) => x.goods === undefined && x.landing === undefined && x.perCase === undefined), 'no goods value or landed cost (trip financials are the directors\')');
  const pending = trips.flatMap((x) => x.payments).find((x: any) => x.status === 'Pending approval');
  expectStatus(await c.req('POST', `/finance/payments/${pending.id}/approve`, { token: T.tp }), 403, 'cannot approve a payment');
  const paidTrip = trips.find((x) => x.payments.length && x.costs.some((k: any) => k.kind === 'Transport' && x.payments.some((p: any) => p.costId === k.id)));
  const tcost = paidTrip.costs.find((x: any) => x.kind === 'Transport');
  expectStatus(await c.req('POST', '/finance/payments', { token: T.tp, body: { shipmentId: paidTrip.shipment.id, costId: tcost.id, amount: 1, reference: 'qa' } }), 403, 'cannot record a payment');
  const btwTrip = trips.find((x) => x.shipment.entityId === 'e-btw');
  const addCost = await c.req('POST', '/finance/costs', { token: T.tp, body: { shipmentId: btwTrip.shipment.id, kind: 'Other', amount: 40, currency: 'USD', docRef: 'QA police fine' } });
  ok(addCost.status === 201 && addCost.body.entityId === 'e-btw' && addCost.body.amountUsd === 40, 'adds a truck expense (goes into the trip costs)', addCost);
  const nudTrip = trips.find((x) => x.shipment.entityId === 'e-nud');
  expectStatus(await c.req('POST', '/finance/costs', { token: T.tp, headers: { 'x-entity-id': 'e-btw' }, body: { shipmentId: nudTrip.shipment.id, kind: 'Other', amount: 5, currency: 'USD' } }), [403, 404], 'BTW active: cannot add an expense to a Nihna trip');
  ok(new Set(((await get('/shipments')) as any[]).map((s) => s.entityId)).size === 3, 'follows the shipments of all three companies');
  ok(((await get('/sales')) as any[]).length === 0 && ((await get('/stock')) as any[]).length === 0, 'sees no sales and no stock');
  expectStatus(await c.req('GET', '/reports/finance', { token: T.tp }), 403, 'finance report (sales margins) refused');
  expectStatus(await c.req('GET', '/reports/logistics', { token: T.tp }), 200, 'logistics report allowed (own: trucks)');
  expectStatus(await c.req('GET', '/users', { token: T.tp }), 403, 'cannot manage users');
  expectStatus(await c.req('GET', '/audit', { token: T.tp }), 403, 'cannot read the audit log');
  expectStatus(await c.req('POST', '/masterdata/warehouses', { token: T.tp, body: { name: 'X', country: 'Congo', town: 'Uvira', receivingCompanyId: 'rc-asie', lat: -3.4, lng: 29.1 } }), 403, 'cannot add warehouses');
  expectStatus(await c.req('POST', '/masterdata/providers', { token: T.tp, body: { name: 'QA Testfie Sacco', kind: 'sacco' } }), 403, 'transport master data is view-only (moved to Kabonge)');
  expectStatus(await c.req('PATCH', '/masterdata/trucks/t3', { token: T.tp, body: { capacityCases: 1 } }), 403, 'cannot edit trucks');
  const sum = await get('/analytics/summary');
  ok(sum.sales30 === 0 && sum.stockValue === 0 && sum.trucksActive > 0, 'summary: trucks, no sales or stock value', sum);

  section('Truck follow-up · loading points');
  const wq = (await get('/waiting')) as any[];
  ok(new Set(wq.map((w) => w.loadingPointId)).size >= 3, 'sees every loading queue', [...new Set(wq.map((w) => w.loadingPointId))]);
  const kblPending = ((await get('/loadings?loadingPointId=s-kbl', T.joel)) as any[]).find((l) => l.status === 'Pending');
  expectStatus(await c.req('POST', `/loadings/${kblPending.id}/confirm`, { token: T.tp, body: { truckId: 't2', driverId: 'd3', loadedQty: {} } }), 403, 'cannot record a loading at KBL (GBI Mombasa only)');
  const lds = (await get('/loadings?loadingPointId=s-kbl')) as any[];
  ok(lds.length > 0 && lds.every((l) => typeof l.poRef === 'string' && l.poRef.startsWith('BTW-PO')), 'loadings carry their PO ref', lds.map((l) => l.poRef));
  // a Nihna–GBI order (raised by a director — who raises them is to confirm) loaded by Testfie at GBI Mombasa
  let gp = (await c.req('POST', '/plans', { token: T.dir, headers: { 'x-entity-id': 'e-nud' }, body: { entityId: 'e-nud', supplierId: 's-gbi' } })).body;
  expectStatus(await c.req('POST', '/plans', { token: T.kabonge, body: { entityId: 'e-nud', supplierId: 's-gbi' } }), 403, 'Kabonge cannot raise a Nihna–GBI order (not his pair)');
  gp = (await c.req('PUT', `/plans/${gp.id}`, { token: T.dir, headers: { 'x-entity-id': 'e-nud' }, body: { title: 'QA GBI', lines: [{ truckNo: 1, productId: 'p-f330', qty: 1000, price: 10.75, deliveredToId: 'rc-yonas', routeId: 'r-msa-juba' }] } })).body;
  const gi = await c.req('POST', `/plans/${gp.id}/submit`, { token: T.dir, headers: { 'x-entity-id': 'e-nud' } });
  expectStatus(gi, 200, 'director issues the Nihna–GBI order');
  const gld = ((await get('/loadings?loadingPointId=s-gbi')) as any[]).find((l) => l.poId === gi.body.poId);
  ok(gld && gld.status === 'Pending', 'Testfie sees the GBI truck to load', gld);
  const gl = await c.req('POST', `/loadings/${gld.id}/confirm`, { token: T.tp, body: { truckId: 't4', driverId: 'd4', loadedQty: {}, agreedTransport: 2300, transportCurrency: 'USD', documents: ['dn.jpg'] } });
  ok(gl.status === 201 && gl.body.legs[0].status === 'Loaded', 'Testfie records the loading at GBI Mombasa', gl.body);
  const glTrip = ((await get('/finance/trips')) as any[]).find((x) => x.shipment.id === gl.body.id);
  ok(glTrip?.agreedRecorded && glTrip.transport === 2300, 'her agreed price at GBI is recorded with the loading (she has truck expenses)', glTrip && { agreed: glTrip.agreedRecorded, transport: glTrip.transport });
  expectStatus(await c.req('POST', `/legs/${gl.body.legs[0].id}/dispatch`, { token: T.tp, body: {} }), 200, 'and marks it dispatched');

  section('Truck follow-up · agreed transport price after loading (A-04)');
  const missing = trips.find((x) => x.agreedRecorded === false && !x.shipment.fromWarehouseId);
  ok(!!missing && missing.transport === 0, 'a truck loaded without a price shows "not recorded" (counted, never a zero price)', missing?.shipment.ref);
  for (const [who, tk] of [['loader', T.joel], ['Kabonge', T.kabonge], ['receiver', T.asie]] as const) expectStatus(await c.req('POST', `/shipments/${missing.shipment.id}/agreed-price`, { token: tk, body: { amount: 1000 } }), [403, 404], `${who} cannot record the agreed price`);
  expectStatus(await c.req('POST', `/shipments/${missing.shipment.id}/agreed-price`, { token: T.tp, body: { amount: -5 } }), 422, 'the price must be above zero');
  const ap = await c.req('POST', `/shipments/${missing.shipment.id}/agreed-price`, { token: T.tp, body: { amount: 2_400_000, currency: 'TZS', docRef: 'QA call with provider' } });
  ok(ap.status === 200 && ap.body.kind === 'Transport' && ap.body.currency === 'TZS' && ap.body.amountUsd > 0, 'Testfie records it: a Transport cost in TZS with its USD value', ap.body);
  const ap2 = await c.req('POST', `/shipments/${missing.shipment.id}/agreed-price`, { token: T.tp, body: { amount: 2_500_000, currency: 'TZS' } });
  ok(ap2.status === 200 && ap2.body.id === ap.body.id && ap2.body.amount === 2_500_000, 'corrected while nothing is paid (same cost line)', ap2.body);
  let au: any; // the audit row is written right after the response: give it a moment
  for (let i = 0; i < 20 && !(au?.after?.amount === 2_500_000); i++) { [au] = await env.sql`SELECT before, after, record_id FROM audit_log WHERE path = ${`/v1/shipments/${missing.shipment.id}/agreed-price`} OR path = ${`/shipments/${missing.shipment.id}/agreed-price`} ORDER BY id DESC LIMIT 1`; if (!(au?.after?.amount === 2_500_000)) await new Promise((r) => setTimeout(r, 150)); }
  ok(au?.before?.amount === 2_400_000 && au?.after?.amount === 2_500_000, 'the correction is in the audit log with before / after', au);
  expectStatus(await c.req('POST', `/shipments/${paidTrip.shipment.id}/agreed-price`, { token: T.tp, body: { amount: 1 } }), 409, 'a price with payments against it is not overwritten');
  ok(((await get('/finance/trips')) as any[]).find((x) => x.shipment.id === missing.shipment.id)?.agreedRecorded === true, 'the trip now counts as recorded');
  const ldK = ((await get('/loadings', T.dir)) as any[]).find((l) => l.poId === missing.shipment.poId && l.truckNo === missing.shipment.truckNo);
  ok(ldK?.agreedTransport === 2_500_000, 'the loading record carries the agreed price', ldK?.agreedTransport);
  ok(((await get('/loadings', T.joel)) as any[]).every((l) => !('agreedTransport' in l)), 'loaders never see the agreed price');

  section('Static data (Kabonge) · onboarding providers, trucks and drivers');
  const ref0 = await get('/ref', T.kabonge);
  const ets = ref0.providers.find((x: any) => x.id === 'pr-ets'); const umoja = ref0.providers.find((x: any) => x.kind === 'sacco');
  ok(ets?.kind === 'company' && ets.contactName && ets.active === true, 'ETS Sabrina Ltd: kind, contact, active', ets);
  ok(umoja && ref0.trucks.filter((x: any) => x.providerId === umoja.id).length === 2, 'sample sacco with 2 trucks', umoja);
  const pr = await c.req('POST', '/masterdata/providers', { token: T.kabonge, body: { name: 'QA Haulage Sacco', kind: 'sacco', phone: '0722 000 999', contactName: 'QA Contact', email: 'qa@sacco.example', notes: 'qa' } });
  ok(pr.status === 201 && pr.body.kind === 'sacco' && pr.body.phone === '+254722000999' && pr.body.active === true && pr.body.regular === true, 'adds a sacco (phone → +254…)', pr);
  expectStatus(await c.req('POST', '/masterdata/providers', { token: T.kabonge, body: { name: 'qa haulage SACCO', kind: 'company' } }), 409, 'duplicate provider name');
  expectStatus(await c.req('POST', '/masterdata/providers', { token: T.kabonge, body: { name: 'QA Bad', kind: 'cooperative' } }), 422, 'unknown provider kind');
  expectStatus(await c.req('POST', '/masterdata/providers', { token: T.kabonge, body: { name: 'QA Bad 2', kind: 'company', phone: '123' } }), 422, 'bad provider phone');
  expectStatus(await c.req('POST', '/masterdata/providers', { token: T.kabonge, body: { name: 'QA Bad 3', kind: 'company', email: 'nope' } }), 422, 'bad provider email');
  const ed = await c.req('PATCH', `/masterdata/providers/${pr.body.id}`, { token: T.kabonge, body: { contactName: 'New Contact', regular: false } });
  ok(ed.status === 200 && ed.body.contactName === 'New Contact' && ed.body.regular === false && ed.body.name === 'QA Haulage Sacco', 'edits a provider (other fields kept)', ed);
  const dr = await c.req('POST', '/masterdata/drivers', { token: T.kabonge, body: { providerId: pr.body.id, name: 'Qa Driverson', phone: '0733 999 001', licence: 'DL-QA-1', hasApp: true, appLogin: true } });
  ok(dr.status === 201 && dr.body.phone === '+254733999001' && /^\d{4}$/.test(dr.body.login?.pin ?? '') && dr.body.login.username, 'new driver with the app gets a field-app login and a PIN (shown once)', dr);
  const drvLogin = await c.req('POST', '/auth/login', { body: { phone: '+254733999001', pin: dr.body.login.pin } });
  ok(drvLogin.status === 200 && drvLogin.body.user.roles.join() === 'driver', 'the new driver signs in with phone + PIN', drvLogin.status);
  const fw = (await c.req('GET', '/field/driver', { token: drvLogin.body.accessToken })).body;
  ok(fw.driver?.id === dr.body.id, 'the login is linked to the driver record (field app knows the driver)', fw.driver);
  expectStatus(await c.req('POST', '/masterdata/drivers', { token: T.kabonge, body: { providerId: pr.body.id, name: 'Other', phone: '+254733999001' } }), 409, 'duplicate driver phone');
  expectStatus(await c.req('POST', '/masterdata/drivers', { token: T.kabonge, body: { providerId: pr.body.id, name: 'Office clash', phone: '+254700000003', hasApp: true, appLogin: true } }), 409, "a driver login cannot take an office user's phone");
  expectStatus(await c.req('POST', '/masterdata/drivers', { token: T.kabonge, body: { providerId: 'pr-nope', name: 'X', phone: '+254733999009' } }), 422, 'driver needs a known provider');
  const tk = await c.req('POST', '/masterdata/trucks', { token: T.kabonge, body: { providerId: pr.body.id, reg: 'kqa 123x', trailer: 'zqa 1', capacityCases: 1900, defaultDriverId: dr.body.id } });
  ok(tk.status === 201 && tk.body.reg === 'KQA 123X' && tk.body.active === true, 'adds a truck (registration normalised)', tk);
  expectStatus(await c.req('POST', '/masterdata/trucks', { token: T.kabonge, body: { providerId: pr.body.id, reg: 'KQA123X', capacityCases: 1000 } }), 409, 'duplicate registration (spacing ignored)');
  expectStatus(await c.req('POST', '/masterdata/trucks', { token: T.kabonge, body: { providerId: pr.body.id, reg: 'KQA 124X', capacityCases: 0 } }), 422, 'capacity must be above zero');
  expectStatus(await c.req('POST', '/masterdata/trucks', { token: T.kabonge, body: { providerId: pr.body.id, reg: 'KQA 125X', capacityCases: 100, defaultDriverId: 'd-nope' } }), 422, 'unknown default driver');
  const tk2 = await c.req('PATCH', `/masterdata/trucks/${tk.body.id}`, { token: T.kabonge, body: { capacityCases: 2100, documents: [{ name: 'Insurance 2026.pdf' }] } });
  ok(tk2.status === 200 && tk2.body.capacityCases === 2100 && tk2.body.reg === 'KQA 123X' && tk2.body.documents?.[0]?.name === 'Insurance 2026.pdf', 'edits a truck and attaches a document', tk2);
  ok((await get('/ref')).trucks.some((x: any) => x.id === tk.body.id), 'new truck is in the reference data at once');
  for (const [who, tok] of [['receiver', T.asie], ['Testfie', T.tp]] as const) {
    expectStatus(await c.req('POST', '/masterdata/providers', { token: tok, body: { name: `QA ${who}`, kind: 'company' } }), 403, `${who} cannot add providers`);
    expectStatus(await c.req('PATCH', `/masterdata/trucks/${tk.body.id}`, { token: tok, body: { capacityCases: 1 } }), 403, `${who} cannot edit trucks`);
  }
  expectStatus(await c.req('POST', '/masterdata/drivers', { token: T.dir, body: { providerId: 'pr-joly', name: 'Director Added', phone: '+254744000077' } }), 201, 'directors add drivers too');

  section('Loading queue · Kabonge adds, Testfie orders (Q11: both, to confirm)');
  const add = await c.req('POST', '/loading-points/s-kbl/waiting', { token: T.kabonge, body: { truckId: tk.body.id, driverId: dr.body.id } });
  expectStatus(add, 201, 'queues the new truck at KBL');
  expectStatus(await c.req('POST', '/loading-points/s-kbl/waiting', { token: T.tp, body: { truckId: tk.body.id, driverId: dr.body.id } }), 409, 'the same truck cannot queue twice');
  expectStatus(await c.req('PATCH', `/masterdata/trucks/${tk.body.id}`, { token: T.kabonge, body: { active: false } }), 409, 'a queued truck cannot be deactivated');
  const moved = await c.req('POST', `/waiting/${add.body.id}/move`, { token: T.tp, body: { position: 1 } });
  let q = ((await get('/waiting?loadingPointId=s-kbl')) as any[]).filter((w) => w.status === 'Waiting');
  ok(moved.status === 200 && q[0].id === add.body.id && q.every((w, i) => w.position === i + 1), 'moved to the front; positions renumbered 1…n', q.map((w) => [w.truckId, w.position]));
  await c.req('POST', `/waiting/${add.body.id}/move`, { token: T.tp, body: { dir: 1 } });
  q = ((await get('/waiting?loadingPointId=s-kbl')) as any[]).filter((w) => w.status === 'Waiting');
  ok(q[1].id === add.body.id, 'moved down one place', q.map((w) => w.truckId));
  expectStatus(await c.req('POST', `/waiting/${add.body.id}/move`, { token: T.tp, body: { position: 'x' } }), 400, 'position must be a number');
  const nJoel = (await get('/notifications', T.joel)) as any[];
  ok(nJoel.some((n) => n.title === 'Loading queue changed' && /KQA 123X moved/.test(n.body)), 'the KBL loader is notified of the new order', nJoel.slice(0, 3));
  const sbl = ((await get('/waiting?loadingPointId=s-sbl')) as any[]).find((w) => w.status === 'Waiting');
  ok(!!sbl, 'Testfie sees the SBL (Kivu) queue');
  expectStatus(await c.req('POST', `/waiting/${sbl.id}/move`, { token: T.tp, body: { position: 1 } }), 200, 'Testfie reorders the SBL queue');
  expectStatus(await c.req('POST', `/waiting/${sbl.id}/move`, { token: T.kabonge, body: { position: 1 } }), 200, 'Kabonge reorders the SBL queue (Kivu–SBL is his pair)');
  expectStatus(await c.req('POST', `/waiting/${sbl.id}/move`, { token: T.dir, body: { position: 1 } }), 403, 'directors view queues but do not reorder them (§7 Loading = View)');
  expectStatus(await c.req('POST', `/waiting/${sbl.id}/move`, { token: T.joel, body: { position: 1 } }), [403, 404], 'the KBL loader cannot reorder the SBL queue');
  expectStatus(await c.req('POST', `/waiting/${sbl.id}/move`, { token: T.asie, body: { position: 1 } }), [403, 404], 'a receiver cannot reorder a queue');
  expectStatus(await c.req('DELETE', `/waiting/${add.body.id}`, { token: T.tp, body: { reason: 'x'.repeat(201) } }), 400, 'removal reason is at most 200 characters');
  expectStatus(await c.req('DELETE', `/waiting/${add.body.id}`, { token: T.tp, body: { reason: 'Breakdown' } }), 200, 'removes the truck with a reason');
  q = ((await get('/waiting?loadingPointId=s-kbl')) as any[]).filter((w) => w.status === 'Waiting');
  ok(!q.some((w) => w.id === add.body.id) && q.every((w, i) => w.position === i + 1), 'gone from the queue; the rest renumbered');
  ok(((await get('/notifications', T.joel)) as any[]).some((n) => n.title === 'Truck removed from the queue' && /Breakdown/.test(n.body)), 'the loader sees why');
  const [audit] = await env.sql`SELECT detail, summary FROM audit_log WHERE path = ${`/waiting/${add.body.id}`} AND method = 'DELETE' AND detail ? 'reason' ORDER BY id DESC LIMIT 1`;
  ok(audit?.detail?.reason === 'Breakdown', 'removal and reason kept in the audit log', audit);
  const offT = await c.req('PATCH', `/masterdata/trucks/${tk.body.id}`, { token: T.kabonge, body: { active: false } });
  ok(offT.status === 200 && offT.body.active === false, 'deactivates the truck once out of the queue', offT);
  expectStatus(await c.req('POST', '/loading-points/s-kbl/waiting', { token: T.tp, body: { truckId: tk.body.id, driverId: dr.body.id } }), 409, 'a deactivated truck cannot be queued');
  const offP = await c.req('PATCH', `/masterdata/providers/${pr.body.id}`, { token: T.kabonge, body: { active: false } });
  ok(offP.status === 200 && offP.body.active === false, 'deactivates the provider (kept for history)', offP);
  const mkt = await c.req('POST', '/loading-points/s-kbl/market-trucks', { token: T.tp, body: { company: 'QA Market Co', reg: 'KMK 001Q', trailer: 'ZMK 1', capacityCases: 1500, driverName: 'Market Driver', driverPhone: '+254755000001' } });
  ok(mkt.status === 201 && (await get('/ref')).providers.find((x: any) => x.id === mkt.body.truck.providerId)?.kind === 'market', 'market truck registered on the spot gets a market provider', mkt);
  void T.moses;
}
