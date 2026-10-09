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

type Who = 'dir' | 'kabonge' | 'joel' | 'tesfie' | 'asie' | 'zonas' | 'acc' | 'admin' | 'drv1' | 'drv2' | 'anon';
const LOGINS: Record<Exclude<Who, 'anon'>, [string, string]> = {
  dir: ['dir', 'demo1234'], kabonge: ['kabonge', 'demo1234'], joel: ['joel', 'demo1234'], tesfie: ['tesfie', 'demo1234'], asie: ['asie', 'demo1234'],
  zonas: ['zonas', 'demo1234'], acc: ['acc', 'demo1234'], admin: ['admin', 'demo1234'], drv1: ['+254711000001', '1234'], drv2: ['+256711000002', '1234'],
};

export async function securitySuite(env: Env) {
  const c = client(env.base);
  const tok: Partial<Record<Who, string>> = {};
  for (const [w, [u, s]] of Object.entries(LOGINS)) tok[w as Who] = (await c.login(u, s)).accessToken;
  const as = (w: Who) => (w === 'anon' ? undefined : tok[w]);

  // Seed facts
  const shipments = (await c.req('GET', '/shipments', { token: tok.dir })).body as any[];
  const byReg = async (reg: string) => { const { body: ref } = await c.req('GET', '/ref', { token: tok.dir }); const truck = ref.trucks.find((x: any) => x.reg === reg); return shipments.find((s) => s.legs.some((l: any) => l.truckId === truck.id && !['Acknowledged'].includes(l.status))); };
  const kda = await byReg('KDA 123A'); const uba = await byReg('UBA 789C'); const rae = await byReg('RAE 551F');
  const kdaLeg = kda.legs.find((l: any) => l.status !== 'Acknowledged'); const ubaLeg = uba.legs.find((l: any) => l.status !== 'Acknowledged'); const raeLeg = rae.legs.find((l: any) => l.status !== 'Acknowledged');

  section('Security · authentication & sessions');
  expectStatus(await c.req('GET', '/me'), 401, 'no token → 401');
  expectStatus(await c.req('GET', '/me', { token: 'garbage' }), 401, 'garbage token → 401');
  expectStatus(await c.req('GET', '/me', { token: signJwt({ sub: 'u-dir', tv: 0, exp: Math.floor(Date.now() / 1000) + 600 }, 'wrong-secret') }), 401, 'token signed with another secret → 401');
  expectStatus(await c.req('GET', '/me', { token: signJwt({ sub: 'u-dir', tv: 0, exp: Math.floor(Date.now() / 1000) + 600 }, '', 'none') }), 401, 'alg=none token → 401');
  expectStatus(await c.req('GET', '/me', { token: signJwt({ sub: 'u-dir', tv: 0, iat: Math.floor(Date.now() / 1000) - 3600, exp: Math.floor(Date.now() / 1000) - 60 }) }), 401, 'expired token → 401');
  expectStatus(await c.req('GET', '/me', { token: signJwt({ sub: 'u-dir', tv: 0, exp: Math.floor(Date.now() / 1000) + 600 }) }), 200, 'well-formed token with our secret → 200 (control)');
  expectStatus(await c.req('GET', '/me', { token: signJwt({ sub: 'u-nobody', tv: 0, exp: Math.floor(Date.now() / 1000) + 600 }) }), 401, 'token for unknown user → 401');
  expectStatus(await c.req('POST', '/auth/login', { body: { username: 'dir', password: 'nope' } }), 401, 'wrong password → 401');
  expectStatus(await c.req('POST', '/auth/login', { body: {} }), 400, 'empty login body → 400');
  expectStatus(await c.req('POST', '/auth/login', { raw: '{bad json' }), 400, 'malformed JSON → 400');
  const lr = await c.req('POST', '/auth/login', { body: { username: 'dir', password: 'demo1234' } });
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
  const s2 = await c.login('acc', 'demo1234');
  expectStatus(await c.req('POST', '/auth/logout', { token: s2.accessToken }), 204, 'logout');
  expectStatus(await c.req('POST', '/auth/refresh', { body: { refreshToken: s2.refreshToken } }), 401, 'refresh after logout → 401');
  // late logout of an old session must not kill a newer session on the same device (web re-login race)
  const old = await c.login('acc', 'demo1234', { deviceId: 'dev-qa-race' });
  const fresh = await c.login('acc', 'demo1234', { deviceId: 'dev-qa-race' });
  await c.req('POST', '/auth/logout', { token: old.accessToken });
  expectStatus(await c.req('POST', '/auth/refresh', { body: { refreshToken: fresh.refreshToken } }), 200, 'late logout of an older session leaves the newer session alive');

  // remote device revoke (MA-08)
  const phone = await c.login('+254711000001', '1234', { deviceId: 'dev-qa-phone', platform: 'android' });
  expectStatus(await c.req('POST', '/auth/devices/dev-qa-phone/revoke', { token: tok.joel }), 403, "loader cannot revoke someone else's device");
  expectStatus(await c.req('POST', '/auth/devices/dev-qa-phone/revoke', { token: tok.admin }), 204, 'admin revokes a lost phone');
  const rv = await c.req('GET', '/me', { token: phone.accessToken });
  ok(rv.status === 401 && /signed out remotely/i.test(JSON.stringify(rv.body)), 'revoked device: access token rejected with a clear message', rv);
  expectStatus(await c.req('POST', '/auth/refresh', { body: { refreshToken: phone.refreshToken } }), 401, 'revoked device: refresh rejected');

  // deactivation + secret reset invalidate sessions
  const z = await c.login('zonas', 'demo1234');
  await c.req('PATCH', '/users/u-zonas', { token: tok.admin, body: { active: false } });
  expectStatus(await c.req('GET', '/me', { token: z.accessToken }), 401, 'deactivated user: existing token rejected');
  expectStatus(await c.req('POST', '/auth/login', { body: { username: 'zonas', password: 'demo1234' } }), 403, 'deactivated user cannot sign in');
  await c.req('PATCH', '/users/u-zonas', { token: tok.admin, body: { active: true } });
  tok.zonas = (await c.login('zonas', 'demo1234')).accessToken;
  const d2 = await c.login('+256711000002', '1234');
  expectStatus(await c.req('POST', '/users/u-drv2/secret', { token: tok.admin, body: { pin: '4321' } }), 200, 'admin resets a PIN');
  expectStatus(await c.req('GET', '/me', { token: d2.accessToken }), 401, 'PIN reset signs out existing sessions');
  expectStatus(await c.req('POST', '/auth/login', { body: { phone: '+256711000002', pin: '1234' } }), 401, 'old PIN no longer works');
  await c.req('POST', '/users/u-drv2/secret', { token: tok.admin, body: { pin: '1234' } });
  tok.drv2 = (await c.login('+256711000002', '1234')).accessToken;

  // brute force (4-digit PIN = 10,000 combinations)
  const tries: number[] = [];
  for (let i = 0; i < 8; i++) tries.push((await c.req('POST', '/auth/login', { body: { phone: '+254700000004', pin: String(1000 + i) } })).status);
  ok(tries.includes(429), `PIN guessing is rate-limited (statuses ${tries.join(',')})`, tries);
  const right = await c.req('POST', '/auth/login', { body: { phone: '+254700000004', pin: '1234' } });
  ok(right.status === 429, 'even the right PIN is refused while locked out', right.status);
  ok((await c.req('POST', '/auth/login', { body: { phone: '+254700000003', pin: '1234' } })).status === 200, 'lockout is per account (another loader still signs in)');

  section('Security · role × endpoint matrix');
  const plans = (await c.req('GET', '/plans', { token: tok.dir })).body as any[];
  const submitted = plans.find((p) => p.status === 'Submitted'); const draft = plans.find((p) => p.status === 'Draft');
  const pending = ((await c.req('GET', '/loadings', { token: tok.dir })).body as any[]).find((l) => l.status === 'Pending' && l.loadingPointId === 's-kbl');
  const allow = (r: { status: number }) => ![401, 403].includes(r.status) && r.status < 500;
  const matrix: { name: string; method: string; path: string; body?: unknown; allowed: Who[] }[] = [
    { name: 'list users', method: 'GET', path: '/users', allowed: ['dir', 'admin'] },
    { name: 'create user', method: 'POST', path: '/users', body: { name: 'QA Probe', phone: '+254799999999', roles: ['driver'] }, allowed: ['dir', 'admin'] },
    { name: 'create plan', method: 'POST', path: '/plans', body: { entityId: 'e-btw', supplierId: 's-kbl' }, allowed: ['dir', 'kabonge', 'admin'] },
    { name: 'edit draft plan', method: 'PUT', path: `/plans/${draft.id}`, body: { title: 'qa' }, allowed: ['dir', 'kabonge', 'admin'] },
    { name: 'decide plan', method: 'POST', path: `/plans/${submitted.id}/decision`, body: { action: 'returned', comment: 'qa matrix' }, allowed: ['dir'] },
    { name: 'set velocity thresholds', method: 'PUT', path: '/analytics/thresholds', body: { fast: 120 }, allowed: ['dir'] },
    { name: 'trip financials', method: 'GET', path: '/finance/trips', allowed: ['dir', 'acc', 'admin', 'kabonge', 'tesfie'] },
    { name: 'record payment', method: 'POST', path: '/finance/payments', body: { shipmentId: kda.id, costId: 'none', amount: 1, reference: 'qa' }, allowed: ['dir', 'acc'] },
    { name: 'add truck (master data)', method: 'POST', path: '/masterdata/trucks', body: {}, allowed: ['dir', 'kabonge', 'tesfie', 'admin'] },
    { name: 'edit route timings', method: 'PATCH', path: '/masterdata/routes/r-nbo-kgl', body: { stops: [] }, allowed: ['dir', 'kabonge', 'tesfie', 'admin'] },
    { name: 'record loading at KBL', method: 'POST', path: `/loadings/${pending.id}/confirm`, body: { truckId: 'nope', driverId: 'd3', loadedQty: {}, agreedTransport: 1 }, allowed: ['dir', 'admin', 'kabonge', 'joel', 'tesfie'] },
    { name: 'queue a truck at UBL', method: 'POST', path: '/loading-points/s-ubl/waiting', body: { truckId: 'nope', driverId: 'nope' }, allowed: ['dir', 'admin', 'kabonge', 'tesfie'] },
    { name: "check in on drv1's leg", method: 'POST', path: `/legs/${kdaLeg.id}/passes`, body: { checkpointId: 'cp-nowhere', kind: 'arrived' }, allowed: ['dir', 'admin', 'kabonge', 'drv1', 'joel', 'asie'] },
    { name: 'acknowledge a Kigali leg', method: 'POST', path: `/legs/${kdaLeg.id}/acknowledgement`, body: { receiverName: '', lines: [] }, allowed: ['dir', 'admin', 'kabonge', 'asie'] },
    { name: 'acknowledge a Juba leg', method: 'POST', path: `/legs/${ubaLeg.id}/acknowledgement`, body: { receiverName: '', lines: [] }, allowed: ['dir', 'admin', 'kabonge', 'zonas'] },
    { name: 'sell from Juba', method: 'POST', path: '/sales', body: { warehouseId: 'w-juba', customer: 'x', lines: [], currency: 'USD', paid: 0, kind: 'Cash', at: new Date().toISOString(), salespersonId: 'x' }, allowed: ['zonas', 'dir', 'admin'] }, // directors may record a sale (above-stock override, SL-02)
    { name: 'PO PDF', method: 'GET', path: '/pos/po-1/pdf', allowed: ['dir', 'admin', 'kabonge', 'joel', 'acc'] },
    { name: 'shipment detail (Juba truck)', method: 'GET', path: `/shipments/${uba.id}`, allowed: ['dir', 'admin', 'kabonge', 'joel', 'acc', 'zonas', 'drv2'] },
    { name: 'stock ledger Juba', method: 'GET', path: '/stock/ledger?warehouseId=w-juba&productId=p-a300', allowed: ['dir', 'admin', 'kabonge', 'tesfie', 'acc', 'zonas'] },
    { name: 'devices of another user', method: 'GET', path: '/users/u-drv1/devices', allowed: ['dir', 'admin'] },
    { name: 'reset demo data', method: 'POST', path: '/dev/reset', allowed: ['dir', 'admin'] },
  ];
  const everyone: Who[] = ['dir', 'kabonge', 'joel', 'tesfie', 'asie', 'zonas', 'acc', 'admin', 'drv1', 'drv2', 'anon'];
  for (const m of matrix) {
    const wrong: string[] = [];
    for (const w of everyone) {
      if (m.path === '/dev/reset' && m.allowed.includes(w)) continue; // don't actually wipe mid-run
      const r = await c.req(m.method, m.path, { token: as(w), body: m.body });
      const want = m.allowed.includes(w);
      if (r.status >= 500) wrong.push(`${w}:500`);
      else if (want !== allow(r)) wrong.push(`${w}:${r.status}`);
      else if (w === 'anon' && r.status !== 401) wrong.push(`anon:${r.status}(want 401)`);
    }
    ok(!wrong.length, `${m.name} — allowed only for ${m.allowed.join('/')}`, wrong.join(' '));
  }

  section('Security · data scoping (lists)');
  const shipsOf = async (w: Who) => ((await c.req('GET', '/shipments', { token: tok[w] })).body as any[]).map((s) => s.id);
  ok((await shipsOf('drv1')).every((id) => id === kda.id), 'driver sees only his own trips', await shipsOf('drv1'));
  ok(!(await shipsOf('zonas')).includes(kda.id) && (await shipsOf('zonas')).includes(uba.id), 'Zonas sees Juba trucks, not Kigali ones');
  ok(!(await shipsOf('asie')).includes(uba.id), 'Asie does not see the Juba truck');
  const stockAsie = (await c.req('GET', '/stock', { token: tok.asie })).body as any[];
  ok(stockAsie.length > 0 && stockAsie.every((r) => ['w-kgl', 'w-goma'].includes(r.warehouseId)), 'Asie stock limited to Kigali + Goma');
  ok(((await c.req('GET', '/stock', { token: tok.drv1 })).body as any[]).length === 0, 'driver sees no stock');
  ok(((await c.req('GET', '/sales', { token: tok.zonas })).body as any[]).every((s) => s.warehouseId === 'w-juba'), 'Zonas sees only Juba sales');
  ok(((await c.req('GET', '/waiting?loadingPointId=s-ubl', { token: tok.joel })).body as any[]).length === 0, 'KBL loader cannot read the UBL queue');
  ok(((await c.req('GET', '/plans', { token: tok.drv1 })).body as any[]).length === 0, 'driver sees no plans');
  ok(((await c.req('GET', '/plans', { token: tok.joel })).body as any[]).every((p) => p.entityId === 'e-btw'), 'BTW loader sees only BTW plans');
  const note = (await c.req('GET', '/notifications', { token: tok.drv1 })).body as any[];
  ok(note.every((n) => !/payment|approval/i.test(n.title)), 'driver gets no finance/approval notifications', note.map((n) => n.title));
  const fw = await c.req('GET', '/field/receiver', { token: tok.zonas });
  ok(fw.body.incoming.every((x: any) => x.leg.toId === 'cp-juba'), 'receiver working set limited to own warehouse');

  section('Security · cross-scope writes (IDOR)');
  expectStatus(await c.req('POST', `/legs/${kdaLeg.id}/passes`, { token: tok.drv2, body: { checkpointId: kdaLeg.passes.at(-1).checkpointId, kind: 'arrived' } }), 403, "driver cannot check in on another driver's truck");
  expectStatus(await c.req('POST', `/legs/${kdaLeg.id}/acknowledgement`, { token: tok.zonas, body: { receiverName: 'x', lines: kdaLeg.lines.map((l: any) => ({ productId: l.productId, expected: l.loadedQty, received: l.loadedQty, damaged: 0 })) } }), 403, 'Zonas cannot acknowledge a truck for Asie Kigali');
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
    const who = /sales/.test(p) ? tok.asie : /finance/.test(p) ? tok.acc : /positions|passes/.test(p) ? tok.dir : tok.dir;
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
  const dirTok = (await c.login('dir')).accessToken;
  expectStatus(await c.req('POST', '/dev/reset', { token: dirTok }), 404, 'POST /dev/reset unavailable in production, even for a director');
  const wh = await c.req('POST', '/webhooks/sms', { form: { from: '+254711000001', text: 'ARR MBARARA KDA123A' } });
  ok(wh.status === 403 || wh.status === 503, `webhook refused in production without a configured secret (${wh.status})`, wh.body);
}

export async function webhookSecretSuite(env: Env, secret: string) {
  const c = client(env.base);
  section('Security · webhook secret');
  expectStatus(await c.req('POST', '/webhooks/sms', { form: { from: '+254711000001', text: 'ARR MBARARA KDA123A' } }), 403, 'webhook without key → 403');
  expectStatus(await c.req('POST', '/webhooks/sms?key=wrong', { form: { from: '+254711000001', text: 'ARR MBARARA KDA123A' } }), 403, 'webhook with wrong key → 403');
  expectStatus(await c.req('POST', `/webhooks/sms?key=${secret}`, { form: { from: '+254711000001', text: 'ARR MBARARA KDA123A' } }), 200, 'webhook with key → 200');
}
