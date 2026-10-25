// Tenancy: cross-company leak (IDOR) matrix. Staff of one company must never read or change another company's
// records, whatever id they send; X-Entity-Id is checked against the user's companies; the Group view is read-only
// for new records and for directors only.
import { client, expectStatus, ok, section, type Env } from './harness';

const COMPANIES = { 'e-btw': 'btw', 'e-nud': 'nud', 'e-kivu': 'kvd' } as const;
/** Single-company staff (docs/12 roster): the loaders. The office side of a company is a director narrowed to it (X-Entity-Id). */
const LOADER = { 'e-btw': 'joel', 'e-nud': 'moses', 'e-kivu': 'sbl-loader' } as const;
type Ent = keyof typeof COMPANIES;
const ENTS = Object.keys(COMPANIES) as Ent[];
const DENIED = [403, 404];

export async function tenancySuite(env: Env) {
  const c = client(env.base);
  const tok = async (u: string) => (await c.login(u)).accessToken;
  const dir = await tok('daniel');
  const get = async (p: string, token = dir, headers: Record<string, string> = {}) => (await c.req('GET', p, { token, headers })).body as any;

  // ---- one record of every kind per company (as the director, Group view) ----
  const plans = await get('/plans'), pos = await get('/pos'), shipments = await get('/shipments'), loadings = await get('/loadings');
  const trips = await get('/finance/trips'), sales = await get('/sales'), waiting = await get('/waiting'), stock = await get('/stock');
  const of = <T extends { entityId: string }>(xs: T[], e: Ent) => xs.find((x) => x.entityId === e);
  const facts: Record<Ent, any> = {} as never;
  for (const e of ENTS) {
    const sh = shipments.find((s: any) => s.entityId === e && s.legs.some((l: any) => l.ackId));
    const live = shipments.find((s: any) => s.entityId === e && s.legs.some((l: any) => !['Acknowledged', 'Cancelled'].includes(l.status)));
    const trip = trips.find((t: any) => t.shipment.entityId === e && t.costs.length);
    facts[e] = {
      plan: of(plans, e), po: of(pos, e), sh, ack: sh?.legs.find((l: any) => l.ackId)?.ackId, liveLeg: live?.legs.find((l: any) => !['Acknowledged', 'Cancelled'].includes(l.status)),
      loading: of(loadings, e), trip, cost: trip?.costs[0], payment: trips.find((t: any) => t.shipment.entityId === e && t.payments.length)?.payments[0],
      sale: of(sales, e), waiting: of(waiting, e), stock: of(stock, e),
    };
  }
  section('Tenancy · seed covers all three companies');
  for (const e of ENTS) ok(Object.entries(facts[e]).every(([, v]) => v), `${e}: plan, PO, shipment, ack, loading, trip cost/payment, sale, waiting entry, stock`, Object.entries(facts[e]).filter(([, v]) => !v).map(([k]) => k));

  // ---- X-Entity-Id and /me ----
  section('Tenancy · active company header');
  const staff: Record<Ent, { plan: string; acc: string }> = {} as never;
  for (const e of ENTS) staff[e] = { plan: await tok(LOADER[e]), acc: dir };
  const H = (who: string, e: Ent) => (who === 'acc' ? { 'x-entity-id': e } : {});
  for (const e of ENTS) {
    const me = await get('/me', staff[e].plan);
    ok(JSON.stringify(me.allowedEntityIds) === JSON.stringify([e]) && me.canGroup === false && JSON.stringify(me.scope) === JSON.stringify([e]), `${COMPANIES[e]} loader: allowed = scope = [${e}], no group`);
    for (const o of ENTS.filter((x) => x !== e)) expectStatus(await c.req('GET', '/plans', { token: staff[e].plan, headers: { 'x-entity-id': o } }), 403, `${COMPANIES[e]} loader with X-Entity-Id ${o}`);
    expectStatus(await c.req('GET', '/plans', { token: staff[e].plan, headers: { 'x-entity-id': 'e-unknown' } }), 403, `${COMPANIES[e]} loader with an unknown company id`);
    expectStatus(await c.req('GET', '/reports/group', { token: staff[e].plan }), 403, `${COMPANIES[e]} loader: group report`);
  }
  expectStatus(await c.req('GET', '/plans', { token: dir, headers: { 'x-entity-id': 'e-unknown' } }), 403, 'director with an unknown company id');
  expectStatus(await c.req('GET', '/plans', { token: dir, headers: { 'x-entity-id': 'GROUP' } }), 200, 'director with X-Entity-Id GROUP');

  // ---- lists never contain another company's rows ----
  section('Tenancy · lists are company-scoped');
  for (const e of ENTS) for (const [who, t] of Object.entries(staff[e])) {
    for (const p of ['/plans', '/pos', '/shipments', '/loadings', '/sales', '/waiting', '/stock', '/analytics/velocity', '/analytics/flags']) {
      const r = await c.req('GET', p, { token: t, headers: H(who, e) });
      if (r.status === 403) { ok(true, `${COMPANIES[e]} ${who} ${p} → 403 (role)`); continue; }
      const rows = r.body as any[];
      ok(r.status === 200 && Array.isArray(rows) && rows.every((x) => x.entityId === e), `${COMPANIES[e]} ${who} ${p}: only ${e} (${rows?.length ?? 0} rows)`, rows?.find?.((x: any) => x.entityId !== e));
    }
    const tr = await c.req('GET', '/finance/trips', { token: t, headers: H(who, e) });
    if (tr.status === 200) ok((tr.body as any[]).every((x) => x.shipment.entityId === e && x.costs.every((k: any) => k.entityId === e)), `${COMPANIES[e]} ${who} /finance/trips: only ${e}`);
    const notes = (await c.req('GET', '/notifications', { token: t, headers: H(who, e) })).body as any[];
    ok(notes.every((n) => !n.entityId || n.entityId === e), `${COMPANIES[e]} ${who} notifications: none about other companies`);
  }

  // ---- reads by id (IDOR) ----
  section('Tenancy · reading another company\'s records by id');
  for (const e of ENTS) for (const o of ENTS.filter((x) => x !== e)) {
    const f = facts[o]; const t = staff[e].plan; const a = staff[e].acc; const tag = `${COMPANIES[e]} → ${COMPANIES[o]}`;
    const reads: [string, string][] = [
      [`/plans/${f.plan.id}`, t], [`/plans/${f.plan.id}/versions`, t], [`/pos/${f.po.id}`, t], [`/pos/${f.po.id}/pdf`, t],
      [`/shipments/${f.sh.id}`, t], [`/shipments/${f.sh.id}/acks`, t], [`/acks/${f.ack}`, t], [`/acks/${f.ack}/pdf`, t], [`/shipments/${f.sh.id}`, a],
      [`/stock/ledger?warehouseId=${f.stock.warehouseId}&productId=${f.stock.productId}`, a],
      [`/reports/sales?entityId=${o}`, a], [`/reports/dashboard?entityId=${o}`, t],
    ];
    for (const [p, tk] of reads) {
      const r = await c.req('GET', p, { token: tk, headers: tk === dir ? { 'x-entity-id': e } : {} });
      if (p.startsWith('/stock/ledger')) ok(r.status !== 200 || (r.body as any[]).every((m) => m.entityId === e), `${tag} GET ${p.split('?')[0]} → no foreign moves (${r.status})`);
      else expectStatus(r, DENIED, `${tag} GET ${p.split('?')[0]}`);
    }
    // the director narrowed to one company is held to it too
    expectStatus(await c.req('GET', `/shipments/${f.sh.id}`, { token: dir, headers: { 'x-entity-id': e } }), DENIED, `director in ${COMPANIES[e]} → ${COMPANIES[o]} shipment`);
  }

  // ---- writes on another company's records ----
  section('Tenancy · changing another company\'s records');
  for (const e of ENTS) for (const o of ENTS.filter((x) => x !== e)) {
    const f = facts[o]; const t = staff[e].plan; const a = staff[e].acc; const tag = `${COMPANIES[e]} → ${COMPANIES[o]}`;
    expectStatus(await c.req('PUT', `/plans/${f.plan.id}`, { token: t, body: { ...f.plan, title: 'hijack' } }), DENIED, `${tag} PUT plan`);
    expectStatus(await c.req('POST', `/plans/${f.plan.id}/submit`, { token: t }), DENIED, `${tag} submit plan`);
    expectStatus(await c.req('POST', `/plans/${f.plan.id}/amendments`, { token: t, body: { reason: 'x' } }), DENIED, `${tag} amend plan`);
    expectStatus(await c.req('POST', '/plans', { token: t, body: { entityId: o, supplierId: 's-kbl' } }), DENIED, `${tag} create a plan for the other company`);
    expectStatus(await c.req('POST', `/pos/${f.po.id}/sent`, { token: t }), DENIED, `${tag} mark PO sent`);
    expectStatus(await c.req('POST', `/loadings/${f.loading.id}/confirm`, { token: t, body: { truckId: 't1', driverId: 'd1', loadedQty: {}, agreedTransport: 100 } }), DENIED, `${tag} confirm loading`);
    expectStatus(await c.req('POST', `/legs/${f.liveLeg.id}/passes`, { token: t, body: { checkpointId: f.liveLeg.passes[1]?.checkpointId ?? f.liveLeg.toId, kind: 'arrived' } }), DENIED, `${tag} check-in on a trip`);
    expectStatus(await c.req('POST', `/legs/${f.liveLeg.id}/issues`, { token: t, body: { place: 'x', reason: 'x' } }), DENIED, `${tag} report a truck issue`);
    expectStatus(await c.req('POST', `/waiting/${f.waiting.id}/move`, { token: t, body: { dir: 1 } }), DENIED, `${tag} reorder the waiting list`);
    expectStatus(await c.req('DELETE', `/waiting/${f.waiting.id}`, { token: t }), DENIED, `${tag} remove from the waiting list`);
    expectStatus(await c.req('POST', '/finance/costs', { token: a, headers: { 'x-entity-id': e }, body: { shipmentId: f.sh.id, kind: 'Other', amount: 1, currency: 'USD' } }), DENIED, `${tag} add a trip cost`);
    expectStatus(await c.req('POST', '/finance/payments', { token: a, headers: { 'x-entity-id': e }, body: { shipmentId: f.trip.shipment.id, costId: f.cost.id, amount: 1, reference: 'x' } }), DENIED, `${tag} pay a trip cost`);
    // a payment against own trip but the other company's cost line
    const own = facts[e];
    expectStatus(await c.req('POST', '/finance/payments', { token: a, headers: { 'x-entity-id': e }, body: { shipmentId: own.trip.shipment.id, costId: f.cost.id, amount: 1, reference: 'x' } }), [403, 404, 422], `${tag} pay own trip with a foreign cost line`);
    expectStatus(await c.req('POST', `/finance/payments/${f.payment.id}/approve`, { token: dir, headers: { 'x-entity-id': e } }), [403, 404, 409], `director in ${COMPANIES[e]} approves a ${COMPANIES[o]} payment`);
    expectStatus(await c.req('POST', '/finance/costs', { token: a, headers: { 'x-entity-id': e }, body: { entityId: o, shipmentId: own.sh.id, kind: 'Other', amount: 1, currency: 'USD' } }), DENIED, `${tag} cost on own trip tagged with the other company`);
  }

  // ---- Group view: read-only for new records; sales draw only own stock ----
  section('Tenancy · Group view and stock ownership');
  const sale = (extra: object) => ({ at: new Date().toISOString(), warehouseId: 'w-kgl', customer: 'QA', salespersonId: 'u-daniel', kind: 'Cash', lines: [{ productId: facts['e-btw'].stock.productId, qty: 1, price: 1 }], currency: 'USD', paid: 1, ...extra });
  expectStatus(await c.req('POST', '/sales', { token: dir, body: sale({}) }), 422, 'Group view: new sale without a company');
  expectStatus(await c.req('POST', '/plans', { token: dir, body: { supplierId: 's-kbl' } }), 422, 'Group view: new plan without a company');
  expectStatus(await c.req('POST', '/loading-points/s-kbl/waiting', { token: await tok('kabonge'), body: { truckId: 't1', driverId: 'd1', entityId: 'e-unknown' } }), 403, 'waiting entry for a company outside the scope');
  const btwSku = (stock as any[]).find((r) => r.entityId === 'e-btw' && r.warehouseId === 'w-kgl' && r.closing > 0 && !(stock as any[]).some((x) => x.entityId === 'e-nud' && x.warehouseId === 'w-kgl' && x.productId === r.productId && x.closing > 0));
  if (btwSku) {
    const r = await c.req('POST', '/sales', { token: dir, headers: { 'x-entity-id': 'e-nud' }, body: sale({ lines: [{ productId: btwSku.productId, qty: 1, price: 1 }] }) });
    expectStatus(r, 422, 'NUD cannot sell BTW stock in the shared Gisenyi warehouse');
  } else ok(false, 'found a BTW-only SKU in Gisenyi for the stock-ownership check');
  expectStatus(await c.req('POST', '/sales', { token: dir, headers: { 'x-entity-id': 'e-nud' }, body: sale({ counterpartyEntityId: 'e-nud' }) }), 422, 'intercompany sale must name a different company');
  expectStatus(await c.req('PUT', '/settings/fx', { token: staff['e-btw'].plan, body: { currency: 'KES', month: '2026-10', avg: 1, closing: 1 } }), 403, 'only directors set exchange rates');
}
