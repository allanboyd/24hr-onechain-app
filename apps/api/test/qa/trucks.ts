// Truck planner role (docs/10): permissions, company / loading-point scope, provider / truck / driver onboarding with
// validation and driver app logins, queue reorder / remove with a reason (loader notified, audited).
import { client, expectStatus, ok, section, type Env } from './harness';

export async function trucksSuite(env: Env) {
  const c = client(env.base);
  const T = {
    tp: (await c.login('btw-trucks')).accessToken, all: (await c.login('trucks')).accessToken, dir: (await c.login('dir')).accessToken,
    joel: (await c.login('joel')).accessToken, moses: (await c.login('moses')).accessToken, asie: (await c.login('asie')).accessToken, acc: (await c.login('acc')).accessToken, kabonge: (await c.login('kabonge')).accessToken,
  };
  const get = async (p: string, t = T.tp, h: Record<string, string> = {}) => (await c.req('GET', p, { token: t, headers: h })).body;

  section('Truck planner · role and features');
  const me = await get('/me');
  ok(me.roles?.join() === 'truck_planner' && me.allowedEntityIds?.join() === 'e-btw' && me.canGroup === false, 'btw-trucks: truck planner for BTW only', me);
  ok(['logistics', 'finance', 'trucks', 'master-data.transport'].every((f) => me.features.includes(f)), 'features: logistics, finance (read), truck desk, transport master data', me.features);
  ok(!['purchase-orders', 'finance.approve', 'sales', 'master-data', 'users', 'dashboard', 'reports'].some((f) => me.features.includes(f)), 'no POs, payment approval, sales, full master data, users, dashboard or reports', me.features);
  const all = await get('/me', T.all);
  ok(all.allowedEntityIds.length === 3 && all.loadingPointIds.length === 0, 'trucks: group-wide truck planner (all companies, every loading point)', all);

  section('Truck planner · what it may not do');
  expectStatus(await c.req('POST', '/plans', { token: T.tp, body: { entityId: 'e-btw', supplierId: 's-kbl' } }), 403, 'cannot create a purchase order');
  ok((await get('/plans')).length === 0 && (await get('/pos')).length === 0, 'sees no purchase orders (empty lists)');
  expectStatus(await c.req('GET', '/pos/po-1', { token: T.tp }), 403, 'cannot open a PO');
  const trips = (await get('/finance/trips')) as any[];
  ok(trips.length > 0 && trips.every((x) => x.shipment.entityId === 'e-btw'), 'reads BTW trip costs only', trips.map((x) => x.shipment.entityId));
  const pending = trips.flatMap((x) => x.payments).find((x: any) => x.status === 'Pending approval');
  expectStatus(await c.req('POST', `/finance/payments/${pending.id}/approve`, { token: T.tp }), 403, 'cannot approve a payment');
  const tcost = trips[0].costs.find((x: any) => x.kind === 'Transport');
  expectStatus(await c.req('POST', '/finance/payments', { token: T.tp, body: { shipmentId: trips[0].shipment.id, costId: tcost.id, amount: 1, reference: 'qa' } }), 403, 'cannot record a payment');
  const addCost = await c.req('POST', '/finance/costs', { token: T.tp, body: { shipmentId: trips[0].shipment.id, kind: 'Other', amount: 40, currency: 'USD', docRef: 'QA police fine' } });
  ok(addCost.status === 201 && addCost.body.entityId === 'e-btw' && addCost.body.amountUsd === 40, 'adds a trip expense (goes into the trip costs)', addCost);
  const nudTrip = ((await get('/finance/trips', T.dir)) as any[]).find((x) => x.shipment.entityId === 'e-nud');
  expectStatus(await c.req('POST', '/finance/costs', { token: T.tp, body: { shipmentId: nudTrip.shipment.id, kind: 'Other', amount: 5, currency: 'USD' } }), [403, 404], "cannot add an expense to another company's trip");
  expectStatus(await c.req('GET', '/shipments', { token: T.tp, headers: { 'x-entity-id': 'e-nud' } }), 403, 'cannot switch to another company');
  ok(((await get('/shipments')) as any[]).every((s) => s.entityId === 'e-btw'), 'sees BTW shipments only');
  ok(((await get('/sales')) as any[]).length === 0 && ((await get('/stock')) as any[]).length === 0, 'sees no sales and no stock');
  expectStatus(await c.req('GET', '/reports/finance', { token: T.tp }), 403, 'finance report (sales margins) refused');
  expectStatus(await c.req('GET', '/reports/logistics', { token: T.tp }), 200, 'logistics report allowed');
  expectStatus(await c.req('GET', '/users', { token: T.tp }), 403, 'cannot manage users');
  expectStatus(await c.req('POST', '/masterdata/warehouses', { token: T.tp, body: { name: 'X', country: 'Congo', town: 'Uvira', receivingCompanyId: 'rc-asie', lat: -3.4, lng: 29.1 } }), 403, 'cannot add warehouses (not transport)');
  const sum = await get('/analytics/summary');
  ok(sum.sales30 === 0 && sum.trucksActive > 0, 'summary: trucks, no sales figures', sum);

  section('Truck planner · loading-point scope');
  const wq = (await get('/waiting')) as any[];
  ok(wq.length > 0 && wq.every((w) => w.loadingPointId === 's-kbl'), 'sees only the KBL queue', wq.map((w) => w.loadingPointId));
  expectStatus(await c.req('POST', '/loading-points/s-ubl/waiting', { token: T.tp, body: { truckId: 't3', driverId: 'd2' } }), 403, 'cannot queue at UBL (not on the profile)');
  const lds = (await get('/loadings?loadingPointId=s-kbl')) as any[];
  ok(lds.length > 0 && lds.every((l) => typeof l.poRef === 'string' && l.poRef.startsWith('BTW-PO')), 'loadings carry their PO ref', lds.map((l) => l.poRef));
  ok(((await get('/waiting', T.all)) as any[]).some((w) => w.loadingPointId === 's-sbl'), 'group-wide truck planner sees the other loading points');

  section('Truck planner · onboarding providers, trucks and drivers');
  const ref0 = await get('/ref');
  const ets = ref0.providers.find((x: any) => x.id === 'pr-ets'); const umoja = ref0.providers.find((x: any) => x.kind === 'sacco');
  ok(ets?.kind === 'company' && ets.contactName && ets.active === true, 'ETS Sabrina Ltd: kind, contact, active', ets);
  ok(umoja && ref0.trucks.filter((x: any) => x.providerId === umoja.id).length === 2, 'sample sacco with 2 trucks', umoja);
  const pr = await c.req('POST', '/masterdata/providers', { token: T.tp, body: { name: 'QA Haulage Sacco', kind: 'sacco', phone: '0722 000 999', contactName: 'QA Contact', email: 'qa@sacco.example', notes: 'qa' } });
  ok(pr.status === 201 && pr.body.kind === 'sacco' && pr.body.phone === '+254722000999' && pr.body.active === true && pr.body.regular === true, 'adds a sacco (phone → +254…)', pr);
  expectStatus(await c.req('POST', '/masterdata/providers', { token: T.tp, body: { name: 'qa haulage SACCO', kind: 'company' } }), 409, 'duplicate provider name');
  expectStatus(await c.req('POST', '/masterdata/providers', { token: T.tp, body: { name: 'QA Bad', kind: 'cooperative' } }), 422, 'unknown provider kind');
  expectStatus(await c.req('POST', '/masterdata/providers', { token: T.tp, body: { name: 'QA Bad 2', kind: 'company', phone: '123' } }), 422, 'bad provider phone');
  expectStatus(await c.req('POST', '/masterdata/providers', { token: T.tp, body: { name: 'QA Bad 3', kind: 'company', email: 'nope' } }), 422, 'bad provider email');
  const ed = await c.req('PATCH', `/masterdata/providers/${pr.body.id}`, { token: T.tp, body: { contactName: 'New Contact', regular: false } });
  ok(ed.status === 200 && ed.body.contactName === 'New Contact' && ed.body.regular === false && ed.body.name === 'QA Haulage Sacco', 'edits a provider (other fields kept)', ed);
  const dr = await c.req('POST', '/masterdata/drivers', { token: T.tp, body: { providerId: pr.body.id, name: 'Qa Driverson', phone: '0733 999 001', licence: 'DL-QA-1', hasApp: true, appLogin: true } });
  ok(dr.status === 201 && dr.body.phone === '+254733999001' && /^\d{4}$/.test(dr.body.login?.pin ?? '') && dr.body.login.username, 'new driver with the app gets a field-app login and a PIN (shown once)', dr);
  const drvLogin = await c.req('POST', '/auth/login', { body: { phone: '+254733999001', pin: dr.body.login.pin } });
  ok(drvLogin.status === 200 && drvLogin.body.user.roles.join() === 'driver', 'the new driver signs in with phone + PIN', drvLogin.status);
  const fw = (await c.req('GET', '/field/driver', { token: drvLogin.body.accessToken })).body;
  ok(fw.driver?.id === dr.body.id, 'the login is linked to the driver record (field app knows the driver)', fw.driver);
  expectStatus(await c.req('POST', '/masterdata/drivers', { token: T.tp, body: { providerId: pr.body.id, name: 'Other', phone: '+254733999001' } }), 409, 'duplicate driver phone');
  expectStatus(await c.req('POST', '/masterdata/drivers', { token: T.tp, body: { providerId: pr.body.id, name: 'Office clash', phone: '+254700000003', hasApp: true, appLogin: true } }), 409, "a driver login cannot take an office user's phone");
  expectStatus(await c.req('POST', '/masterdata/drivers', { token: T.tp, body: { providerId: 'pr-nope', name: 'X', phone: '+254733999009' } }), 422, 'driver needs a known provider');
  const tk = await c.req('POST', '/masterdata/trucks', { token: T.tp, body: { providerId: pr.body.id, reg: 'kqa 123x', trailer: 'zqa 1', capacityCases: 1900, defaultDriverId: dr.body.id } });
  ok(tk.status === 201 && tk.body.reg === 'KQA 123X' && tk.body.active === true, 'adds a truck (registration normalised)', tk);
  expectStatus(await c.req('POST', '/masterdata/trucks', { token: T.tp, body: { providerId: pr.body.id, reg: 'KQA123X', capacityCases: 1000 } }), 409, 'duplicate registration (spacing ignored)');
  expectStatus(await c.req('POST', '/masterdata/trucks', { token: T.tp, body: { providerId: pr.body.id, reg: 'KQA 124X', capacityCases: 0 } }), 422, 'capacity must be above zero');
  expectStatus(await c.req('POST', '/masterdata/trucks', { token: T.tp, body: { providerId: pr.body.id, reg: 'KQA 125X', capacityCases: 100, defaultDriverId: 'd-nope' } }), 422, 'unknown default driver');
  const tk2 = await c.req('PATCH', `/masterdata/trucks/${tk.body.id}`, { token: T.tp, body: { capacityCases: 2100, documents: [{ name: 'Insurance 2026.pdf' }] } });
  ok(tk2.status === 200 && tk2.body.capacityCases === 2100 && tk2.body.reg === 'KQA 123X' && tk2.body.documents?.[0]?.name === 'Insurance 2026.pdf', 'edits a truck and attaches a document', tk2);
  ok((await get('/ref')).trucks.some((x: any) => x.id === tk.body.id), 'new truck is in the reference data at once');
  for (const [who, tok] of [['receiver', T.asie], ['accounts', T.acc]] as const) {
    expectStatus(await c.req('POST', '/masterdata/providers', { token: tok, body: { name: `QA ${who}`, kind: 'company' } }), 403, `${who} cannot add providers`);
    expectStatus(await c.req('PATCH', `/masterdata/trucks/${tk.body.id}`, { token: tok, body: { capacityCases: 1 } }), 403, `${who} cannot edit trucks`);
  }
  expectStatus(await c.req('POST', '/masterdata/drivers', { token: T.kabonge, body: { providerId: 'pr-joly', name: 'Fleet Added', phone: '+254744000077' } }), 201, 'fleet / planner still add drivers');

  section('Truck planner · loading queue');
  const add = await c.req('POST', '/loading-points/s-kbl/waiting', { token: T.tp, body: { truckId: tk.body.id, driverId: dr.body.id } });
  expectStatus(add, 201, 'queues the new truck at KBL');
  expectStatus(await c.req('POST', '/loading-points/s-kbl/waiting', { token: T.tp, body: { truckId: tk.body.id, driverId: dr.body.id } }), 409, 'the same truck cannot queue twice');
  expectStatus(await c.req('PATCH', `/masterdata/trucks/${tk.body.id}`, { token: T.tp, body: { active: false } }), 409, 'a queued truck cannot be deactivated');
  const moved = await c.req('POST', `/waiting/${add.body.id}/move`, { token: T.tp, body: { position: 1 } });
  let q = ((await get('/waiting?loadingPointId=s-kbl')) as any[]).filter((w) => w.status === 'Waiting');
  ok(moved.status === 200 && q[0].id === add.body.id && q.every((w, i) => w.position === i + 1), 'moved to the front; positions renumbered 1…n', q.map((w) => [w.truckId, w.position]));
  await c.req('POST', `/waiting/${add.body.id}/move`, { token: T.tp, body: { dir: 1 } });
  q = ((await get('/waiting?loadingPointId=s-kbl')) as any[]).filter((w) => w.status === 'Waiting');
  ok(q[1].id === add.body.id, 'moved down one place', q.map((w) => w.truckId));
  expectStatus(await c.req('POST', `/waiting/${add.body.id}/move`, { token: T.tp, body: { position: 'x' } }), 400, 'position must be a number');
  const nJoel = (await get('/notifications', T.joel)) as any[];
  ok(nJoel.some((n) => n.title === 'Loading queue changed' && /KQA 123X moved/.test(n.body)), 'the KBL loader is notified of the new order', nJoel.slice(0, 3));
  const sbl = ((await get('/waiting?loadingPointId=s-sbl', T.all)) as any[]).find((w) => w.status === 'Waiting');
  ok(!!sbl, 'group-wide truck planner sees the SBL (Kivu) queue');
  expectStatus(await c.req('POST', `/waiting/${sbl.id}/move`, { token: T.tp, body: { position: 1 } }), [403, 404], 'btw-trucks cannot reorder the SBL (Kivu) queue');
  expectStatus(await c.req('POST', `/waiting/${sbl.id}/move`, { token: T.all, body: { position: 1 } }), 200, 'group-wide truck planner reorders the SBL queue');
  expectStatus(await c.req('POST', `/waiting/${sbl.id}/move`, { token: T.asie, body: { position: 1 } }), [403, 404], 'a receiver cannot reorder a queue');
  expectStatus(await c.req('DELETE', `/waiting/${add.body.id}`, { token: T.tp, body: { reason: 'x'.repeat(201) } }), 400, 'removal reason is at most 200 characters');
  expectStatus(await c.req('DELETE', `/waiting/${add.body.id}`, { token: T.tp, body: { reason: 'Breakdown' } }), 200, 'removes the truck with a reason');
  q = ((await get('/waiting?loadingPointId=s-kbl')) as any[]).filter((w) => w.status === 'Waiting');
  ok(!q.some((w) => w.id === add.body.id) && q.every((w, i) => w.position === i + 1), 'gone from the queue; the rest renumbered');
  ok(((await get('/notifications', T.joel)) as any[]).some((n) => n.title === 'Truck removed from the queue' && /Breakdown/.test(n.body)), 'the loader sees why');
  const [audit] = await env.sql`SELECT detail FROM audit_log WHERE path = ${`/waiting/${add.body.id}`} AND method = 'DELETE' AND detail ? 'reason' ORDER BY id DESC LIMIT 1`;
  ok(audit?.detail?.reason === 'Breakdown', 'removal and reason kept in the audit log', audit);
  const offT = await c.req('PATCH', `/masterdata/trucks/${tk.body.id}`, { token: T.tp, body: { active: false } });
  ok(offT.status === 200 && offT.body.active === false, 'deactivates the truck once out of the queue', offT);
  expectStatus(await c.req('POST', '/loading-points/s-kbl/waiting', { token: T.tp, body: { truckId: tk.body.id, driverId: dr.body.id } }), 409, 'a deactivated truck cannot be queued');
  const offP = await c.req('PATCH', `/masterdata/providers/${pr.body.id}`, { token: T.tp, body: { active: false } });
  ok(offP.status === 200 && offP.body.active === false, 'deactivates the provider (kept for history)', offP);
  const mkt = await c.req('POST', '/loading-points/s-kbl/market-trucks', { token: T.tp, body: { company: 'QA Market Co', reg: 'KMK 001Q', trailer: 'ZMK 1', capacityCases: 1500, driverName: 'Market Driver', driverPhone: '+254755000001' } });
  ok(mkt.status === 201 && (await get('/ref')).providers.find((x: any) => x.id === mkt.body.truck.providerId)?.kind === 'market', 'market truck registered on the spot gets a market provider', mkt);
  void T.moses;
}
