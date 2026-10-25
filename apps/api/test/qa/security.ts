// Security: auth, sessions, role × endpoint matrix, scope (IDOR), brute force, validation.
import { createHmac } from 'node:crypto';
import { client, expectStatus, ok, section, type Env } from './harness';

export const JWT_SECRET = 'qa-secret-not-for-prod';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const signJwt = (payload: Record<string, unknown>, secret = JWT_SECRET, alg = 'HS256') => {
  const head = b64({ alg, typ: 'JWT' }); const body = b64(payload);
  const sig = alg === 'none' ? '' : createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};

// The client's roster (docs/12): directors Daniel and Michael, Kabonge, Testfie, loaders Joel / Eric / Moses, receivers
// Asie and Yonas, ETS Sabrina drivers. `dir` = Daniel, `admin` = Michael (user admin is the directors').
type Who = 'dir' | 'admin' | 'kabonge' | 'testfie' | 'joel' | 'eric' | 'moses' | 'asie' | 'yonas' | 'drv1' | 'drv2' | 'anon';
const LOGINS: Record<Exclude<Who, 'anon'>, [string, string]> = {
  dir: ['daniel', 'demo1234'], admin: ['michael', 'demo1234'], kabonge: ['kabonge', 'demo1234'], testfie: ['testfie', 'demo1234'],
  joel: ['joel', 'demo1234'], eric: ['+254700000004', '1234'], moses: ['+256700000005', '1234'], asie: ['asie', 'demo1234'], yonas: ['yonas', 'demo1234'],
  drv1: ['+254702750019', '1234'], drv2: ['+256711000002', '1234'],
};

export async function securitySuite(env: Env) {
  const c = client(env.base);
  const tok: Partial<Record<Who, string>> = {};
  for (const [w, [u, s]] of Object.entries(LOGINS)) tok[w as Who] = (await c.login(u, s)).accessToken;
  const as = (w: Who) => (w === 'anon' ? undefined : tok[w]);

  // Seed facts
  const shipments = (await c.req('GET', '/shipments', { token: tok.dir })).body as any[];
  const byReg = async (reg: string) => { const { body: ref } = await c.req('GET', '/ref', { token: tok.dir }); const truck = ref.trucks.find((x: any) => x.reg === reg); return shipments.find((s) => s.legs.some((l: any) => l.truckId === truck.id && !['Acknowledged'].includes(l.status))); };
  const kda = await byReg('KBV 894T'); const uba = await byReg('UBA 789C'); const rae = await byReg('RAE 551F');
  const kdaLeg = kda.legs.find((l: any) => l.status !== 'Acknowledged'); const ubaLeg = uba.legs.find((l: any) => l.status !== 'Acknowledged'); const raeLeg = rae.legs.find((l: any) => l.status !== 'Acknowledged');

  section('Security · authentication & sessions');
  expectStatus(await c.req('GET', '/me'), 401, 'no token → 401');
  expectStatus(await c.req('GET', '/me', { token: 'garbage' }), 401, 'garbage token → 401');
  expectStatus(await c.req('GET', '/me', { token: signJwt({ sub: 'u-daniel', tv: 0, exp: Math.floor(Date.now() / 1000) + 600 }, 'wrong-secret') }), 401, 'token signed with another secret → 401');
  expectStatus(await c.req('GET', '/me', { token: signJwt({ sub: 'u-daniel', tv: 0, exp: Math.floor(Date.now() / 1000) + 600 }, '', 'none') }), 401, 'alg=none token → 401');
  expectStatus(await c.req('GET', '/me', { token: signJwt({ sub: 'u-daniel', tv: 0, iat: Math.floor(Date.now() / 1000) - 3600, exp: Math.floor(Date.now() / 1000) - 60 }) }), 401, 'expired token → 401');
  expectStatus(await c.req('GET', '/me', { token: signJwt({ sub: 'u-daniel', tv: 0, exp: Math.floor(Date.now() / 1000) + 600 }) }), 200, 'well-formed token with our secret → 200 (control)');
  expectStatus(await c.req('GET', '/me', { token: signJwt({ sub: 'u-nobody', tv: 0, exp: Math.floor(Date.now() / 1000) + 600 }) }), 401, 'token for unknown user → 401');
  expectStatus(await c.req('POST', '/auth/login', { body: { username: 'daniel', password: 'nope' } }), 401, 'wrong password → 401');
  expectStatus(await c.req('POST', '/auth/login', { body: {} }), 400, 'empty login body → 400');
  expectStatus(await c.req('POST', '/auth/login', { raw: '{bad json' }), 400, 'malformed JSON → 400');
  const lr = await c.req('POST', '/auth/login', { body: { username: 'daniel', password: 'demo1234' } });
  ok(!JSON.stringify(lr.body).match(/passwordHash|pinHash|tokenVersion/), 'login response leaks no secrets');
  const users = await c.req('GET', '/users', { token: tok.admin });
  ok(!JSON.stringify(users.body).match(/passwordHash|pinHash|"\$2[aby]\$/), 'user list leaks no hashes');

  // refresh rotation + reuse detection
  const s1 = await c.login('kabonge', 'demo1234');
  const r1 = await c.req('POST', '/auth/refresh', { body: { refreshToken: s1.refreshToken } });
  expectStatus(r1, 200, 'refresh rotates');
  expectStatus(await c.req('POST', '/auth/refresh', { body: { refreshToken: s1.refreshToken } }), 401, 'reusing a rotated refresh token → 401');
  expectStatus(await c.req('POST', '/auth/refresh', { body: { refreshToken: r1.body.refreshToken } }), 401, 'reuse detection revokes the newer token of that device too');
  expectStatus(await c.req('POST', '/auth/refresh', { body: {} }), 401, 'refresh without token → 401');

  // logout
  const s2 = await c.login('michael', 'demo1234');
  expectStatus(await c.req('POST', '/auth/logout', { token: s2.accessToken }), 204, 'logout');
  expectStatus(await c.req('POST', '/auth/refresh', { body: { refreshToken: s2.refreshToken } }), 401, 'refresh after logout → 401');
  // late logout of an old session must not kill a newer session on the same device (web re-login race)
  const old = await c.login('michael', 'demo1234', { deviceId: 'dev-qa-race' });
  const fresh = await c.login('michael', 'demo1234', { deviceId: 'dev-qa-race' });
  await c.req('POST', '/auth/logout', { token: old.accessToken });
  expectStatus(await c.req('POST', '/auth/refresh', { body: { refreshToken: fresh.refreshToken } }), 200, 'late logout of an older session leaves the newer session alive');

  // remote device revoke (MA-08)
  const phone = await c.login('+254702750019', '1234', { deviceId: 'dev-qa-phone', platform: 'android' });
  expectStatus(await c.req('POST', '/auth/devices/dev-qa-phone/revoke', { token: tok.joel }), 403, "loader cannot revoke someone else's device");
  expectStatus(await c.req('POST', '/auth/devices/dev-qa-phone/revoke', { token: tok.admin }), 204, 'admin revokes a lost phone');
  const rv = await c.req('GET', '/me', { token: phone.accessToken });
  ok(rv.status === 401 && /signed out remotely/i.test(JSON.stringify(rv.body)), 'revoked device: access token rejected with a clear message', rv);
  expectStatus(await c.req('POST', '/auth/refresh', { body: { refreshToken: phone.refreshToken } }), 401, 'revoked device: refresh rejected');

  // deactivation + secret reset invalidate sessions
  const z = await c.login('yonas', 'demo1234');
  await c.req('PATCH', '/users/u-yonas', { token: tok.admin, body: { active: false } });
  expectStatus(await c.req('GET', '/me', { token: z.accessToken }), 401, 'deactivated user: existing token rejected');
  expectStatus(await c.req('POST', '/auth/login', { body: { username: 'yonas', password: 'demo1234' } }), 403, 'deactivated user cannot sign in');
  await c.req('PATCH', '/users/u-yonas', { token: tok.admin, body: { active: true } });
  tok.yonas = (await c.login('yonas', 'demo1234')).accessToken;
  expectStatus(await c.req('PATCH', '/users/u-daniel', { token: tok.dir, body: { active: false } }), 409, 'a director cannot deactivate himself');
  const ul = (await c.req('GET', '/users', { token: tok.dir })).body as any[];
  ok(ul.find((u) => u.id === 'u-daniel')?.lastLoginAt && ul.find((u) => u.id === 'u-kabonge')?.pairs?.length === 3, 'users list shows last sign-in and buyer–supplier pairs (A-08)', ul.find((u) => u.id === 'u-kabonge'));
  expectStatus(await c.req('PATCH', '/users/u-kabonge', { token: tok.dir, body: { pairs: [{ entityId: 'e-nud', supplierId: 's-nope' }] } }), 422, 'a pair must name a known company and supplier');
  expectStatus(await c.req('PATCH', '/users/u-kabonge', { token: tok.dir, body: { routeIds: ['r-nope'] } }), 422, 'routes must be known');
  const d2 = await c.login('+256711000002', '1234');
  expectStatus(await c.req('POST', '/users/u-drv2/secret', { token: tok.admin, body: { pin: '4321' } }), 200, 'admin resets a PIN');
  expectStatus(await c.req('GET', '/me', { token: d2.accessToken }), 401, 'PIN reset signs out existing sessions');
  expectStatus(await c.req('POST', '/auth/login', { body: { phone: '+256711000002', pin: '1234' } }), 401, 'old PIN no longer works');
  await c.req('POST', '/users/u-drv2/secret', { token: tok.admin, body: { pin: '1234' } });
  tok.drv2 = (await c.login('+256711000002', '1234')).accessToken;

  // brute force (4-digit PIN = 10,000 combinations) — on the SBL placeholder loader (not used in the matrix below)
  const tries: number[] = [];
  for (let i = 0; i < 8; i++) tries.push((await c.req('POST', '/auth/login', { body: { phone: '+255700000021', pin: String(1000 + i) } })).status);
  ok(tries.includes(429), `PIN guessing is rate-limited (statuses ${tries.join(',')})`, tries);
  const right = await c.req('POST', '/auth/login', { body: { phone: '+255700000021', pin: '1234' } });
  ok(right.status === 429, 'even the right PIN is refused while locked out', right.status);
  ok((await c.req('POST', '/auth/login', { body: { phone: '+254700000003', pin: '1234' } })).status === 200, 'lockout is per account (another loader still signs in)');

  // ---- Roles document §7: one check per person × feature (Full / Own / View / —) ------------------------------------
  // F = view + change; O = view and change only their own scope (and nothing of anyone else's); V = read only; - = no access.
  // A "write" probe is sent with a body the server refuses AFTER the access check (422 / 404 record / 409), so an allowed
  // write never changes data; a denial is 401/403 or a 404 "Not found" (no existence oracle).
  section('Security · access matrix §7 (person × feature)');
  const nud = await byReg('UBG 118H'); const nudLeg = nud.legs.find((l: any) => l.status !== 'Acknowledged');
  const acked = shipments.find((s) => s.entityId === 'e-btw' && s.warehouseId === 'w-kgl' && s.legs.every((l: any) => l.status === 'Acknowledged'));
  const pendKbl = ((await c.req('GET', '/loadings', { token: tok.dir })).body as any[]).find((l) => l.status === 'Pending' && l.loadingPointId === 's-kbl');
  const plans = (await c.req('GET', '/plans', { token: tok.dir })).body as any[];
  const submitted = plans.find((p) => p.status === 'Submitted'); const draft = plans.find((p) => p.status === 'Draft');
  // trucks to load at UBL (Kabonge issues the pending Nihna–UBL order) and at GBI Mombasa (a director raises a Nihna–GBI order)
  expectStatus(await c.req('POST', '/plans/plan-2/submit', { token: tok.kabonge }), 200, 'setup: Kabonge issues the Nihna–UBL order');
  let gp = (await c.req('POST', '/plans', { token: tok.dir, headers: { 'x-entity-id': 'e-nud' }, body: { entityId: 'e-nud', supplierId: 's-gbi' } })).body;
  gp = (await c.req('PUT', `/plans/${gp.id}`, { token: tok.dir, headers: { 'x-entity-id': 'e-nud' }, body: { title: 'QA GBI', lines: [{ truckNo: 1, productId: 'p-f330', qty: 1000, price: 10.75, deliveredToId: 'rc-yonas', routeId: 'r-msa-juba' }] } })).body;
  expectStatus(await c.req('POST', `/plans/${gp.id}/submit`, { token: tok.dir, headers: { 'x-entity-id': 'e-nud' } }), 200, 'setup: a director issues a Nihna–GBI order');
  const allLd = (await c.req('GET', '/loadings', { token: tok.dir })).body as any[];
  const pendUbl = allLd.find((l) => l.status === 'Pending' && l.loadingPointId === 's-ubl');
  const pendGbi = allLd.find((l) => l.status === 'Pending' && l.loadingPointId === 's-gbi');
  const jubaAcked = shipments.find((s) => s.warehouseId === 'w-juba' && s.legs.every((l: any) => l.status === 'Acknowledged'));
  ok(pendKbl && pendUbl && pendGbi && acked && jubaAcked && nudLeg, 'setup: a truck to load at KBL, UBL and GBI; delivered shipments at Gisenyi and Juba', { pendKbl: !!pendKbl, pendUbl: !!pendUbl, pendGbi: !!pendGbi, acked: !!acked, jubaAcked: !!jubaAcked, nudLeg: !!nudLeg });
  const allow = (r: { status: number; body?: any }) => ![401, 403].includes(r.status) && !(r.status === 404 && r.body?.title === 'Not found') && r.status < 500;
  const nonEmpty = (r: { status: number; body?: any }) => r.status === 200 && (!Array.isArray(r.body) || r.body.length > 0) && !(Array.isArray(r.body?.rows) && !r.body.rows.length);
  type Lvl = 'F' | 'O' | 'V' | '-';
  type Req = { method: string; path: string; body?: unknown };
  const me = new Map<Who, string[]>();
  for (const w of Object.keys(LOGINS) as Who[]) me.set(w, (await c.req('GET', '/me', { token: tok[w] })).body.features ?? []);
  const feat = (f: string): Req & { feature: string } => ({ method: 'FEATURE', path: f, feature: f });
  interface Row {
    feature: string; levels: Record<Exclude<Who, 'anon'>, Lvl>;
    /** read probe (allowed = 200 with data); a list scoped to the user may also be checked with `own` */ view?: (w: Who) => Req | null;
    /** what the person's own scope looks like in the read (Own rows) */ own?: (w: Who, body: any) => boolean;
    /** change probe on the person's own record (Own) or any record (Full) */ write?: (w: Who) => Req | null;
    /** change probe on someone else's record — must be denied for Own */ other?: (w: Who) => Req | null;
    note?: string;
  }
  const L = (dir: Lvl, kabonge: Lvl, testfie: Lvl, joelEric: Lvl, moses: Lvl, asie: Lvl, yonas: Lvl, drivers: Lvl) =>
    ({ dir, admin: dir, kabonge, testfie, joel: joelEric, eric: joelEric, moses, asie, yonas, drv1: drivers, drv2: drivers }) as Row['levels'];
  const ownLeg = (w: Who) => (w === 'moses' ? nudLeg : w === 'drv2' ? ubaLeg : w === 'asie' ? raeLeg : kdaLeg);
  const otherLeg = (w: Who) => (w === 'moses' || w === 'drv2' ? kdaLeg : w === 'asie' ? ubaLeg : nudLeg);
  const rows: Row[] = [
    { feature: 'Users and roles', levels: L('F', '-', '-', '-', '-', '-', '-', '-'),
      view: () => ({ method: 'GET', path: '/users' }), write: () => ({ method: 'PATCH', path: '/users/u-drv2', body: { roles: ['nope'] } }) },
    { feature: 'Companies, suppliers, goods, receivers', levels: L('F', 'F', '-', '-', '-', '-', '-', '-'),
      view: (w) => feat('master-data.static'), write: () => ({ method: 'POST', path: '/masterdata/products', body: {} }),
      note: 'reading names via /ref stays open to every signed-in app (needed to show product / company names)' },
    { feature: 'Transport providers, trucks, trailers, drivers', levels: L('F', 'F', 'V', 'V', 'V', 'V', '-', '-'),
      view: () => feat('master-data'), write: () => ({ method: 'PATCH', path: '/masterdata/drivers/d4', body: { phone: 'x' } }) },
    { feature: 'Purchase plans', levels: L('F', 'O', '-', '-', '-', '-', '-', '-'),
      view: () => ({ method: 'GET', path: '/period-plans' }), own: (_w, b) => b.every((pp: any) => pp.lines.every((l: any) => l.supplierId !== 's-gbi')),
      write: () => ({ method: 'POST', path: '/period-plans', body: { entityId: 'e-nud', periodKind: 'month', from: 'bad', to: 'bad', lines: [{ supplierId: 's-ubl', productId: 'p-c200', cases: 1, price: 1, destinationId: 'w-kgl' }] } }),
      other: () => ({ method: 'PUT', path: '/period-plans/pp-nud-1', body: { lines: [{ supplierId: 's-gbi', productId: 'p-f330', cases: 1, price: 1, destinationId: 'w-juba' }] } }),
      note: "Asie's \"Own\" purchase plans are her re-export orders (workstream B, not built yet)" },
    { feature: 'Purchase orders', levels: L('F', 'O', 'V', 'V', 'V', 'V', 'V', '-'),
      view: () => ({ method: 'GET', path: '/pos' }),
      own: (w, b) => (w === 'kabonge' ? b.every((p: any) => p.supplierId !== 's-gbi') : w === 'testfie' ? b.every((p: any) => p.supplierId === 's-gbi') : w === 'joel' || w === 'eric' ? b.every((p: any) => p.supplierId === 's-kbl' && p.pricesHidden) : w === 'moses' ? b.every((p: any) => p.supplierId === 's-ubl' && p.pricesHidden) : w === 'asie' || w === 'yonas' ? b.every((p: any) => p.pricesHidden) : true),
      write: () => ({ method: 'PUT', path: `/plans/${draft.id}`, body: { lines: 'x' } }), other: () => ({ method: 'POST', path: '/plans', body: { entityId: 'e-nud', supplierId: 's-gbi' } }),
      note: 'Asie: View (orders delivering to her); her "Own" re-export orders come with workstream B' },
    { feature: 'Loading', levels: L('V', 'V', 'O', 'O', 'O', '-', '-', '-'),
      view: () => ({ method: 'GET', path: '/loadings' }),
      own: (w, b) => (w === 'kabonge' ? b.every((l: any) => l.loadingPointId !== 's-gbi') : w === 'joel' || w === 'eric' ? b.every((l: any) => l.loadingPointId === 's-kbl' && !('agreedTransport' in l)) : w === 'moses' ? b.every((l: any) => l.loadingPointId === 's-ubl' && !('agreedTransport' in l)) : true),
      write: (w) => ({ method: 'POST', path: `/loadings/${w === 'moses' ? pendUbl.id : w === 'testfie' ? pendGbi.id : pendKbl.id}/confirm`, body: { truckId: 'nope', driverId: 'd3', loadedQty: {} } }),
      other: (w) => ({ method: 'POST', path: `/loadings/${w === 'joel' || w === 'eric' ? pendUbl.id : pendKbl.id}/confirm`, body: { truckId: 'nope', driverId: 'd3', loadedQty: {} } }),
      note: "Asie's \"Own\" loading is loading her re-exports (workstream B); today she hands goods on with Send on (Dispatch row)" },
    { feature: 'Dispatch and multi-leg shipments', levels: L('V', 'V', 'F', 'O', 'O', 'O', 'V', 'O'),
      view: () => ({ method: 'GET', path: '/shipments' }),
      own: (w, b) => (w === 'yonas' ? b.every((s: any) => s.warehouseId === 'w-juba') : w === 'asie' ? !b.some((s: any) => s.id === uba.id) : w === 'drv1' ? b.every((s: any) => s.legs.some((l: any) => l.driverId === 'd1')) : true),
      write: (w) => ({ method: 'POST', path: `/legs/${ownLeg(w).id}/dispatch`, body: {} }), other: (w) => ({ method: 'POST', path: `/legs/${otherLeg(w).id}/dispatch`, body: {} }) },
    { feature: 'Fleet follow-up and truck issues', levels: L('V', 'V', 'F', '-', '-', 'V', 'V', 'O'),
      view: (w) => (w === 'drv1' || w === 'drv2' ? { method: 'GET', path: '/field/driver' } : feat('fleet')), write: (w) => ({ method: 'POST', path: `/legs/${ownLeg(w).id}/issues`, body: { reason: '' } }), other: (w) => ({ method: 'POST', path: `/legs/${otherLeg(w).id}/issues`, body: { reason: '' } }) },
    { feature: 'Truck expenses', levels: L('F', '-', 'F', '-', '-', '-', '-', '-'),
      view: () => ({ method: 'GET', path: '/finance/trips' }), write: () => ({ method: 'POST', path: '/finance/costs', body: { shipmentId: kda.id, kind: 'Other', amount: -1, currency: 'USD' } }) },
    { feature: 'Delivery acknowledgement', levels: L('V', 'V', '-', '-', '-', 'O', 'O', '-'),
      view: (w) => ({ method: 'GET', path: `/shipments/${w === 'yonas' ? jubaAcked.id : acked.id}/acks` }),
      write: (w) => ({ method: 'POST', path: `/legs/${w === 'yonas' ? ubaLeg.id : kdaLeg.id}/acknowledgement`, body: { receiverName: '', lines: [] } }),
      other: (w) => ({ method: 'POST', path: `/legs/${w === 'yonas' ? kdaLeg.id : ubaLeg.id}/acknowledgement`, body: { receiverName: '', lines: [] } }) },
    { feature: 'Warehouse inventory', levels: L('F', '-', '-', '-', '-', 'O', 'O', '-'),
      view: () => ({ method: 'GET', path: '/stock' }), own: (w, b) => b.every((r: any) => (w === 'asie' ? ['w-kgl', 'w-goma'] : ['w-juba']).includes(r.warehouseId) && r.landedCostPerCase === undefined),
      note: 'counts / adjustments: workstream B (docs/14) — probed in the money suite' },
    { feature: 'Warehouse expenses', levels: L('F', '-', '-', '-', '-', 'O', 'O', '-'), view: () => feat('warehouse-expenses'), note: 'built in workstream B (docs/14) — Own / Full probed in the money suite' },
    { feature: 'Sales, selling prices and trip financials', levels: L('F', '-', '-', '-', '-', '-', '-', '-'),
      view: () => ({ method: 'GET', path: '/sales' }), write: () => ({ method: 'POST', path: '/finance/payments', body: { shipmentId: kda.id, costId: 'none', amount: 1, reference: 'qa' } }) },
    { feature: 'Report of each feature', levels: L('F', 'O', 'O', '-', '-', 'O', 'O', '-'),
      view: (w) => (w === 'asie' || w === 'yonas' ? { method: 'GET', path: '/field/receiver' } : w === 'kabonge' ? { method: 'GET', path: '/reports/planned-vs-actual' } : { method: 'GET', path: '/reports/logistics' }),
      write: (w) => (w === 'dir' || w === 'admin' ? { method: 'GET', path: '/reports/finance' } : null), other: (w) => (w === 'dir' || w === 'admin' ? null : { method: 'GET', path: '/reports/finance' }),
      note: "receivers' own report = their incoming deliveries (the feature dashboards come in workstream C)" },
    { feature: 'Combined performance report and profit margins', levels: L('F', '-', '-', '-', '-', '-', '-', '-'), view: () => feat('performance'), note: 'GET /reports/performance (docs/14) — probed in the money suite' },
    { feature: 'Notifications and alerts', levels: L('F', 'O', 'O', 'O', 'O', 'O', 'O', 'O'),
      view: () => ({ method: 'GET', path: '/notifications', body: 'any' }), own: (_w, b) => b.every((n: any) => n.title !== 'Payment needs approval') },
    { feature: 'Audit log', levels: L('V', '-', '-', '-', '-', '-', '-', '-'), view: () => ({ method: 'GET', path: '/audit?pageSize=5' }) },
  ];
  const send = async (w: Who, r: Req) => (r.method === 'FEATURE' ? { status: me.get(w)!.includes(r.path) ? 200 : 403, body: {} } : c.req(r.method, r.path, { token: as(w), body: r.body }));
  for (const row of rows) for (const w of Object.keys(row.levels) as Exclude<Who, 'anon'>[]) {
    const lvl = row.levels[w]; const bad: string[] = [];
    if (row.view) { const q = row.view(w); if (q) { const r = await send(w, { ...q, body: undefined }); const seen = q.method === 'FEATURE' || q.body === 'any' ? r.status === 200 : nonEmpty(r);
      if (lvl === '-' ? seen : !seen) bad.push(`view ${q.method} ${q.path} → ${r.status}${Array.isArray(r.body) ? ` (${r.body.length})` : ''}`);
      else if (lvl === 'O' && row.own && seen && !row.own(w, r.body)) bad.push(`view ${q.path}: rows outside the own scope`); } }
    if (row.write) { const q = row.write(w); if (q) { const r = await send(w, q); const yes = allow(r);
      if ((lvl === 'F' || lvl === 'O') !== yes) bad.push(`${lvl === 'F' || lvl === 'O' ? 'may' : 'may not'} change: ${q.method} ${q.path} → ${r.status} ${r.body?.title ?? ''}`); } }
    if (row.other && lvl !== 'F') { const q = row.other(w); if (q) { const r = await send(w, q); if (allow(r)) bad.push(`must not reach others': ${q.method} ${q.path} → ${r.status} ${r.body?.title ?? ''}`); } }
    const label = { F: 'Full', O: 'Own', V: 'View', '-': '—' }[lvl];
    ok(!bad.length, `§7 ${row.feature} · ${w}: ${label}${row.note && (lvl === 'O' || lvl === '-') ? ` (${row.note})` : ''}`, bad.join('; '));
  }
  // nobody without a sign-in gets anything
  for (const p of ['/users', '/pos', '/loadings', '/shipments', '/finance/trips', '/stock', '/sales', '/audit', '/notifications']) expectStatus(await c.req('GET', p), 401, `anonymous GET ${p}`);
  for (const w of ['asie', 'yonas', 'drv1'] as Who[]) ok(((await c.req('GET', '/plans', { token: as(w) })).body as any[]).every((p) => p.pricesHidden && p.lines.every((l: any) => l.price === undefined)), `${w}: orders (if any) carry no prices`);
  ok(((await c.req('GET', '/ref', { token: tok.joel })).body.priceList as any[]).length === 0 && ((await c.req('GET', '/ref', { token: tok.kabonge })).body.priceList as any[]).length > 0, 'reference data: no price list for loaders (planners keep it)');
  expectStatus(await c.req('GET', '/pos/po-1/pdf', { token: tok.joel }), 403, 'loaders cannot download the PO letter (it shows prices)');
  expectStatus(await c.req('POST', `/plans/${submitted.id}/decision`, { token: tok.kabonge, body: { action: 'returned', comment: 'qa' } }), 403, 'only directors decide orders');
  expectStatus(await c.req('POST', '/dev/reset', { token: tok.kabonge }), 403, 'only directors reset the demo data');

  section('Security · data scoping (lists)');
  const shipsOf = async (w: Who) => ((await c.req('GET', '/shipments', { token: tok[w] })).body as any[]).map((s) => s.id);
  { // every shipment a driver sees must have a leg he drove (history included), and his live trip must be there
    const mine = (await c.req('GET', '/shipments', { token: tok.drv1 })).body as { id: string; legs: { driverId: string }[] }[];
    const foreign = mine.filter((s) => !s.legs.some((l) => l.driverId === 'd1')).map((s) => s.id);
    ok(!foreign.length && mine.some((s) => s.id === kda.id), 'driver sees only his own trips', foreign);
  }
  ok(!(await shipsOf('yonas')).includes(kda.id) && (await shipsOf('yonas')).includes(uba.id), 'Yonas sees Juba trucks, not Gisenyi ones');
  ok(!(await shipsOf('asie')).includes(uba.id), 'Asie does not see the Juba truck');
  const stockAsie = (await c.req('GET', '/stock', { token: tok.asie })).body as any[];
  ok(stockAsie.length > 0 && stockAsie.every((r) => ['w-kgl', 'w-goma'].includes(r.warehouseId)), 'Asie stock limited to Gisenyi + Goma');
  ok(((await c.req('GET', '/stock', { token: tok.drv1 })).body as any[]).length === 0, 'driver sees no stock');
  ok(((await c.req('GET', '/sales', { token: tok.yonas })).body as any[]).length === 0 && ((await c.req('GET', '/sales', { token: tok.dir })).body as any[]).length > 0, 'sales are the directors\' (receivers see none, §7)');
  ok(((await c.req('GET', '/waiting?loadingPointId=s-ubl', { token: tok.joel })).body as any[]).length === 0, 'KBL loader cannot read the UBL queue');
  ok(new Set(((await c.req('GET', '/waiting', { token: tok.testfie })).body as any[]).map((w) => w.loadingPointId)).size >= 3, 'Testfie follows every loading queue');
  ok(new Set(((await c.req('GET', '/shipments', { token: tok.testfie })).body as any[]).map((s) => s.entityId)).size === 3, 'Testfie follows the trucks of all three companies');
  ok(((await c.req('GET', '/sales', { token: tok.testfie })).body as any[]).length === 0 && ((await c.req('GET', '/stock', { token: tok.testfie })).body as any[]).length === 0, 'Testfie sees no sales and no stock');
  ok(((await c.req('GET', '/loadings', { token: tok.kabonge })).body as any[]).every((l) => !(l.entityId === 'e-nud' && l.loadingPointId === 's-gbi')) && ((await c.req('GET', '/plans', { token: tok.kabonge })).body as any[]).every((p) => p.supplierId !== 's-gbi'), 'Kabonge sees nothing of Nihna–GBI (not his pair)');
  ok(((await c.req('GET', '/shipments', { token: tok.moses })).body as any[]).every((s) => s.entityId === 'e-nud'), 'Moses sees only Nihna (UBL) trucks');
  ok(((await c.req('GET', '/plans', { token: tok.drv1 })).body as any[]).length === 0, 'driver sees no plans');
  ok(((await c.req('GET', '/plans', { token: tok.joel })).body as any[]).every((p) => p.entityId === 'e-btw'), 'BTW loader sees only BTW plans');
  const note = (await c.req('GET', '/notifications', { token: tok.drv1 })).body as any[];
  ok(note.every((n) => !/payment|approval/i.test(n.title)), 'driver gets no finance/approval notifications', note.map((n) => n.title));
  const fw = await c.req('GET', '/field/receiver', { token: tok.yonas });
  ok(fw.body.incoming.every((x: any) => x.leg.toId === 'cp-juba'), 'receiver working set limited to own warehouse');

  section('Security · cross-scope writes (IDOR)');
  expectStatus(await c.req('POST', `/legs/${kdaLeg.id}/passes`, { token: tok.drv2, body: { checkpointId: kdaLeg.passes.at(-1).checkpointId, kind: 'arrived' } }), 403, "driver cannot check in on another driver's truck");
  expectStatus(await c.req('POST', `/legs/${kdaLeg.id}/acknowledgement`, { token: tok.yonas, body: { receiverName: 'x', lines: kdaLeg.lines.map((l: any) => ({ productId: l.productId, expected: l.loadedQty, received: l.loadedQty, damaged: 0 })) } }), 403, 'Yonas cannot acknowledge a truck for Asie Gisenyi');
  expectStatus(await c.req('POST', `/legs/${kdaLeg.id}/issues`, { token: tok.drv2, body: { reason: 'x', place: 'x' } }), 403, "driver cannot log an issue on another driver's truck");
  expectStatus(await c.req('POST', '/positions', { token: tok.drv2, body: [{ legId: kdaLeg.id, lat: -1, lng: 30 }] }), 403, "driver cannot post GPS for another driver's truck");
  const sb = await c.req('POST', '/sync/batch', { token: tok.drv2, body: [{ idempotencyKey: crypto.randomUUID(), op: 'leg.pass', payload: { legId: kdaLeg.id, checkpointId: kdaLeg.passes.at(-1).checkpointId, kind: 'arrived' } }] });
  ok(sb.status === 200 && sb.body[0]?.status === 'rejected' && sb.body[0]?.error?.status === 403, "sync batch: another driver's leg rejected with 403", sb.body);
  expectStatus(await c.req('POST', '/sales', { token: tok.asie, body: { warehouseId: 'w-juba', customer: 'x', kind: 'Cash', lines: [{ productId: 'p-a300', qty: 1, price: 1 }], currency: 'USD', paid: 0, at: new Date().toISOString(), salespersonId: 'u-asie' } }), 403, 'Asie cannot sell Juba stock');
  expectStatus(await c.req('POST', `/legs/${raeLeg.id}/issues/nope/fix`, { token: tok.drv1 }), 403, "driver cannot fix an issue on another driver's truck");
  // idempotency keys are per user: another user's key must not return their stored result
  const key = crypto.randomUUID();
  const first = await c.req('POST', '/sync/batch', { token: tok.drv1, body: [{ idempotencyKey: key, op: 'leg.issue', payload: { legId: kdaLeg.id, issue: { reason: 'QA flat tyre', place: 'QA' } } }] });
  const stolen = await c.req('POST', '/sync/batch', { token: tok.drv2, body: [{ idempotencyKey: key, op: 'leg.issue', payload: { legId: kdaLeg.id, issue: { reason: 'x', place: 'x' } } }] });
  ok(first.body[0].status === 'applied' && stolen.body[0].status === 'rejected' && !JSON.stringify(stolen.body).includes('QA flat tyre'), "replaying another user's idempotency key is rejected and leaks nothing", stolen.body);

  section('Security · input validation (4xx, never 500)');
  const bad: [string, string, unknown, string][] = [
    ['POST', '/plans', { entityId: 'e-nope', supplierId: 's-kbl' }, 'unknown entity'],
    ['PUT', `/plans/${draft.id}`, { lines: 'not-an-array' }, 'plan lines not an array'],
    ['PUT', `/plans/${draft.id}`, { lines: [{ truckNo: 1, productId: 'p-e330', qty: -5, price: 10, deliveredToId: 'rc-asie', routeId: 'r-mwz-kgl' }] }, 'negative quantity'],
    ['PUT', `/plans/${draft.id}`, { lines: [{ truckNo: 1, productId: 'p-a300', qty: 5, price: 10, deliveredToId: 'rc-asie', routeId: 'r-mwz-kgl' }] }, 'product from another supplier'],
    ['POST', `/legs/${kdaLeg.id}/passes`, { checkpointId: kdaLeg.passes.at(-1).checkpointId, kind: 'teleported' }, 'invalid pass kind'],
    ['POST', '/legs/leg-nope/passes', { checkpointId: 'cp-malaba', kind: 'arrived' }, 'unknown leg'],
    ['POST', '/positions', [{ legId: kdaLeg.id, lat: 999, lng: 30 }], 'latitude out of range'],
    ['POST', '/positions', { not: 'an array' }, 'positions not an array'],
    ['POST', '/sync/batch', { items: 'x' }, 'sync body not a list'],
    ['POST', '/finance/payments', { shipmentId: kda.id, costId: 'x', amount: -100, reference: 'neg' }, 'negative payment'],
    ['POST', '/sales', { warehouseId: 'w-kgl', customer: 'x', kind: 'Cash', lines: [{ productId: 'p-a300', qty: -10, price: 1 }], currency: 'USD', paid: 0, at: new Date().toISOString(), salespersonId: 'u-asie' }, 'negative sale qty'],
    ['POST', '/sales', { warehouseId: 'w-kgl', customer: 'x', kind: 'Cash', lines: [{ productId: 'p-nope', qty: 1, price: 1 }], currency: 'USD', paid: 0, at: new Date().toISOString(), salespersonId: 'u-asie' }, 'unknown product in sale'],
    ['POST', '/files', { kind: 'photo', contentType: 'image/jpeg', dataBase64: '!!!' }, 'garbage upload'],
    ['GET', '/stock/ledger', undefined, 'ledger without params'],
    ['GET', '/masterdata/nope', undefined, 'unknown master data kind'],
  ];
  for (const [m, p, body, name] of bad) {
    const who = /sales/.test(p) ? tok.dir : /finance/.test(p) ? tok.admin : /positions|passes/.test(p) ? tok.testfie : tok.dir;
    const r = await c.req(m, p, { token: who, body });
    ok(r.status >= 400 && r.status < 500, `${name} → ${r.status}`, r.body);
  }
  const ack = await c.req('POST', `/legs/${raeLeg.id}/acknowledgement`, { token: tok.asie, body: { receiverName: 'QA', lines: [{ productId: 'p-a300', expected: 5, received: 999999, damaged: 0 }] } });
  ok(ack.status === 422, 'acknowledging a product that is not on the truck is refused', ack.body);
  // 16 MB body (limit 15 MB): the server answers 413 or closes the connection before reading it — both are fine.
  const big = await c.req('POST', '/plans', { token: tok.kabonge, raw: JSON.stringify({ entityId: 'e-btw', supplierId: 's-kbl', pad: 'x'.repeat(16 * 1024 * 1024) }) }).catch(() => ({ status: 413 }));
  ok(big.status === 413, `oversized body refused (${big.status})`, big.status);
  expectStatus(await c.req('GET', '/health'.replace('/health', '/me'), { token: tok.dir }), 200, 'server still healthy after oversized body');

  return { kda, uba, rae, kdaLeg, ubaLeg, raeLeg, tok };
}

export async function productionSuite(env: Env) {
  const c = client(env.base);
  section('Security · production mode');
  for (const [m, p] of [['GET', '/dev/integrations'], ['GET', '/dev/sms'], ['POST', '/dev/sms/inbound'], ['GET', '/auth/demo-users']] as const)
    expectStatus(await c.req(m, p, { body: m === 'POST' ? {} : undefined }), 404, `${m} ${p} hidden in production`);
  const dirTok = (await c.login('daniel')).accessToken;
  expectStatus(await c.req('POST', '/dev/reset', { token: dirTok }), 404, 'POST /dev/reset unavailable in production, even for a director');
  const wh = await c.req('POST', '/webhooks/sms', { form: { from: '+254702750019', text: 'ARR MBARARA KBV894T' } });
  ok(wh.status === 403 || wh.status === 503, `webhook refused in production without a configured secret (${wh.status})`, wh.body);
}

export async function webhookSecretSuite(env: Env, secret: string) {
  const c = client(env.base);
  section('Security · webhook secret');
  expectStatus(await c.req('POST', '/webhooks/sms', { form: { from: '+254702750019', text: 'ARR MBARARA KBV894T' } }), 403, 'webhook without key → 403');
  expectStatus(await c.req('POST', '/webhooks/sms?key=wrong', { form: { from: '+254702750019', text: 'ARR MBARARA KBV894T' } }), 403, 'webhook with wrong key → 403');
  expectStatus(await c.req('POST', `/webhooks/sms?key=${secret}`, { form: { from: '+254702750019', text: 'ARR MBARARA KBV894T' } }), 200, 'webhook with key → 200');
}
