// End-to-end over HTTP: migrates + seeds an isolated `btw_test` database, boots the API on :3199,
// then drives the same 14-step workflow as packages/api/test/workflow.e2e.ts through the real client
// (@btw/api/http), plus auth, scope, idempotency, geofence and SMS checks.
// Run: pnpm --filter @btw/server test   (needs `docker compose up -d db`)
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import postgres from 'postgres';
import * as api from '@btw/api/http';

const ROOT = path.resolve(__dirname, '..');
const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://btw:btw@localhost:55433/btw';
const TEST_URL = ADMIN_URL.replace(/\/[^/]+$/, '/btw_test');
const PORT = 3199;
const BASE = `http://localhost:${PORT}/v1`;

let failed = 0;
const ok = (c: unknown, m: string) => { if (!c) { failed++; console.log('FAIL', m); } else console.log('ok  ', m); };
const rejects = async (p: Promise<unknown>, re: RegExp, m: string) => { try { await p; ok(false, `${m} (no error)`); } catch (e) { ok(re.test(String((e as Error).message)) || re.test(String((e as { status?: number }).status)), `${m} → ${(e as Error).message}`); } };
const raw = async (method: string, p: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(`${BASE}${p}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

async function main() {
  // 1. Fresh test database: create, migrate, seed
  const admin = postgres(ADMIN_URL, { onnotice: () => {} });
  await admin.unsafe('DROP DATABASE IF EXISTS btw_test WITH (FORCE)');
  await admin.unsafe('CREATE DATABASE btw_test');
  await admin.end();
  execSync('pnpm exec drizzle-kit migrate', { cwd: ROOT, env: { ...process.env, DATABASE_URL: TEST_URL }, stdio: 'ignore' });
  execSync('node -r @swc-node/register src/db/seed.ts', { cwd: ROOT, env: { ...process.env, DATABASE_URL: TEST_URL }, stdio: 'ignore' });

  // 2. Boot the API against it
  const server = spawn(process.execPath, ['-r', '@swc-node/register', 'src/main.ts'], { cwd: ROOT, env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', (d) => (log += d)); server.stderr.on('data', (d) => (log += d));
  const stop = () => { try { server.kill(); } catch { /* gone */ } };
  process.on('exit', stop);
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 500)); }
  api.configure({ baseUrl: BASE, channel: 'web' });
  const db = postgres(TEST_URL, { onnotice: () => {} });

  try {
    // ---- auth & scope ----
    await rejects(api.auth.signIn({ username: 'kabonge', password: 'wrong' }), /Wrong username or password/, 'wrong password rejected');
    await api.auth.signIn({ username: 'kabonge', password: 'demo1234' });
    ok(api.auth.me()?.id === 'u-kabonge' && api.ref().checkpoints.length > 20, 'planner signed in; reference cache loaded');

    // ---- workflow (mirrors packages/api/test/workflow.e2e.ts) ----
    let p = await api.plans.create('e-kivu', 's-sbl');
    ok(/^KVD-PO-\d{4}-\d{4}$/.test(p.ref), `ref auto-numbered ${p.ref}`);
    p.title = 'Test order'; p.lines = [{ ...api.plans.newLine(p, 1), qty: 1800, routeId: 'r-mwz-kgl' }];
    p = await api.plans.save(p); p = await api.plans.submit(p.id);
    await api.auth.signIn({ username: 'dir', password: 'demo1234' });
    p = await api.plans.decide(p.id, 'approved', '', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
    ok(p.status === 'Approved' && p.poId, `approved → PO ${p.poId}`);
    await api.auth.signIn({ username: 'kabonge', password: 'demo1234' });
    await rejects(api.plans.save(p), /locked/, 'approved plan locked (409)');

    await api.auth.signIn({ phone: '+254700000006', pin: '1234' }); // Tesfie: loader at SBL/GBI
    ok(api.auth.me()?.id === 'u-tesfie', 'loader signs in with phone + PIN');
    const ld = (await api.loading.list('s-sbl')).find((l) => l.poId === p.poId)!;
    await rejects(api.loading.confirm(ld.id, { truckId: 't6', driverId: 'd6', loadedQty: { [ld.lines[0].planLineId]: 1900 }, agreedTransport: 900, documents: [] }), /capacity/, 'truck capacity enforced (1800 max)');
    const sh = await api.loading.confirm(ld.id, { truckId: 't6', driverId: 'd6', loadedQty: { [ld.lines[0].planLineId]: 1780 }, agreedTransport: 900, documents: ['dn.jpg'] });
    ok(sh.legs[0].lines[0].loadedQty === 1780 && sh.legs[0].status === 'Loaded', 'shipment created with loaded qty');
    const leg = sh.legs[0];
    const sms = await (await fetch(`${BASE}/dev/sms?phone=${encodeURIComponent('+255711000006')}`)).json() as { text: string }[];
    ok(sms.some((x) => /ARR NYAKANAZI T512DFG/.test(x.text)), 'driver without app gets loading SMS with check-in code');

    await api.auth.signIn({ username: 'asie', password: 'demo1234' });
    const before = (await api.inventory.stock()).find((r) => r.warehouseId === 'w-kgl' && r.productId === 'p-e330')!;

    await api.auth.signIn({ phone: '+254700000006', pin: '1234' });
    await api.tracking.dispatch(leg.id, 'office');
    // GPS pings into the geofences (PostGIS) at Nyakanazi, then away from it
    const g = await api.tracking.positions([{ legId: leg.id, lat: -3.0301, lng: 31.2502 }, { legId: leg.id, lat: -2.9, lng: 31.0 }]);
    ok(g.events.some((e) => e.checkpointId === 'cp-nyakanazi' && e.kind === 'arrived') && g.events.some((e) => e.kind === 'departed'), 'geofence: arrival + departure from GPS pings');
    // SMS check-in at the Rusumo border (Africa's Talking stand-in → INBOUND_HANDLER)
    const inbound = await raw('POST', '/dev/sms/inbound', { from: '+255711000006', text: 'ARR RUSUMO T512DFG' });
    ok(inbound.body?.ok === true, `SMS check-in applied: "${inbound.body?.reply}"`);
    await api.shipments.pass(leg.id, 'cp-rusumo', 'departed', 'office');
    await api.shipments.pass(leg.id, 'cp-kayonza', 'arrived', 'office');
    await api.shipments.pass(leg.id, 'cp-kayonza', 'departed', 'office');
    await api.shipments.pass(leg.id, 'cp-kigali', 'arrived', 'office');
    let s2 = (await api.shipments.get(sh.id))!;
    ok(s2.legs[0].status === 'Arrived', 'leg arrived at destination');
    ok(['Early', 'On time', 'Late'].includes(api.shipments.eta(s2.legs[0]).state), `ETA state ${api.shipments.eta(s2.legs[0]).state}`);

    await api.auth.signIn({ username: 'zonas', password: 'demo1234' });
    await rejects(api.shipments.acknowledge(leg.id, { receiverName: 'X', lines: [{ productId: 'p-e330', expected: 1780, received: 1780, damaged: 0 }] }), /Not allowed|not coming to your warehouse/, 'receiver of another warehouse cannot acknowledge (403)');

    await api.auth.signIn({ username: 'asie', password: 'demo1234' });
    const mid = (await api.inventory.stock()).find((r) => r.warehouseId === 'w-kgl' && r.productId === 'p-e330')!;
    ok(mid.received === before.received, 'no stock posted before acknowledgement (AK-05)');
    await api.shipments.acknowledge(leg.id, { receiverName: 'Test', lines: [{ productId: 'p-e330', expected: 1780, received: 1770, damaged: 4 }] });
    const after = (await api.inventory.stock()).find((r) => r.warehouseId === 'w-kgl' && r.productId === 'p-e330')!;
    ok(after.received - before.received === 1770 && after.damaged - before.damaged === 4, 'stock posted on ack: +1770 received, 4 damaged');
    s2 = (await api.shipments.get(sh.id))!;
    ok(s2.status === 'Acknowledged', 'shipment status derived = Acknowledged');
    await rejects(api.shipments.acknowledge(leg.id, { receiverName: 'Again', lines: [{ productId: 'p-e330', expected: 1780, received: 1770, damaged: 4 }] }), /Already acknowledged/, 'second acknowledgement rejected (409)');

    await api.auth.signIn({ username: 'dir', password: 'demo1234' });
    const n = await api.notifications.list();
    ok(n.some((x) => x.title === 'Delivery discrepancy' && x.body.includes(s2.ref)), 'discrepancy alert raised');

    await api.auth.signIn({ username: 'asie', password: 'demo1234' });
    await rejects(api.sales.create({ at: new Date().toISOString(), warehouseId: 'w-kgl', customer: 'X', salespersonId: 'u-asie', kind: 'Cash', lines: [{ productId: 'p-e330', qty: 999999, price: 1 }], currency: 'USD', paid: 0 }), /in stock/, 'sale above stock blocked (SL-02)');
    await rejects(api.sales.create({ at: new Date().toISOString(), warehouseId: 'w-kgl', customer: 'X', salespersonId: 'u-asie', kind: 'Cash', lines: [{ productId: 'p-e330', qty: 999999, price: 1 }], currency: 'USD', paid: 0 }, true), /director/, 'override only for directors');

    await api.auth.signIn({ username: 'dir', password: 'demo1234' });
    const v = await api.analytics.velocity();
    ok(v.length > 0 && v.every((r) => ['Fast', 'Normal', 'Slow', 'Stagnant'].includes(r.cls)), `velocity rows ${v.length}`);
    const t = (await api.finance.trips()).find((x) => x.shipment.id === sh.id)!;
    ok(t.transport === 900 && t.landing > t.goods, 'landing cost = goods + expenses');

    // ---- platform checks ----
    const drv = await raw('POST', '/auth/login', { phone: '+254711000001', pin: '1234' });
    const dh = { authorization: `Bearer ${drv.body.accessToken}` };
    ok((await raw('GET', '/users', undefined, dh)).status === 403, 'driver cannot list users (403)');
    ok((await raw('GET', '/plans', undefined, dh)).body?.length === 0, 'driver sees no plans (scope)');
    const work = await raw('GET', '/field/driver', undefined, dh);
    ok(work.body?.trips?.[0]?.truck?.reg === 'KDA 123A' && work.body.trips[0].overdue, 'driver working set: own trip with overdue check-in');

    // Hand-over → push + in-app notification to the driver (Peter registers a push token first)
    await raw('POST', '/devices', { pushToken: 'tok-peter-e2e', platform: 'android', appVersion: '0.2.0' }, dh);
    const jh = { authorization: `Bearer ${(await raw('POST', '/auth/login', { phone: '+254700000003', pin: '1234' })).body.accessToken}` }; // Joel, KBL
    const pend = (await raw('GET', '/loadings?loadingPointId=s-kbl', undefined, jh)).body.find((l: { status: string }) => l.status === 'Pending');
    const handed = await raw('POST', `/loadings/${pend.id}/confirm`, { truckId: 't2', driverId: 'd1', loadedQty: {}, agreedTransport: 1500, documents: [] }, jh);
    ok(handed.status === 201, `giver records loading for Peter's truck (${handed.status})`);
    await new Promise((r) => setTimeout(r, 300));
    const pushes = (await raw('GET', '/dev/push')).body as { tokens?: string[]; title?: string; to?: string[] }[];
    ok(JSON.stringify(pushes).includes('tok-peter-e2e') && JSON.stringify(pushes).includes('trip assigned'), 'hand-over pushes the driver');
    ok((await raw('GET', '/notifications', undefined, dh)).body.some((n: { title: string }) => /trip assigned/.test(n.title)), 'driver gets a personal in-app notification');

    // Undo an already-synced check-in (driver, within 10 min) — audited, status recomputed
    const legId = work.body.trips[0].leg.id;
    const tapped = await raw('POST', `/legs/${legId}/passes`, { checkpointId: 'cp-mbarara', kind: 'arrived' }, { ...dh, 'x-channel': 'app' });
    const undone = await raw('POST', `/legs/${legId}/passes/cp-mbarara/undo`, { kind: 'arrived' }, { ...dh, 'x-channel': 'app' });
    const mb = undone.body?.passes?.find((x: { checkpointId: string }) => x.checkpointId === 'cp-mbarara');
    ok(tapped.status === 200 && undone.status === 200 && !mb?.arrivedAt && undone.body.status === 'In transit', 'driver undoes a synced check-in; status recomputed');
    ok((await raw('POST', `/legs/${legId}/passes/cp-mbarara/undo`, { kind: 'arrived' }, dh)).status === 422, 'nothing left to undo → 422');
    const audit = await db`SELECT 1 FROM audit_log WHERE method = 'UNDO' AND path = ${`/legs/${legId}/passes`}`;
    ok(audit.length === 1, 'undo is audited');

    const item = { idempotencyKey: '7f6c2a8e-0000-4000-8000-000000000001', op: 'leg.issue', payload: { legId: work.body.trips[0].leg.id, issue: { at: new Date().toISOString(), place: 'Mbarara', reason: 'Breakdown' } } };
    const b1 = await raw('POST', '/sync/batch', [item], dh); const b2 = await raw('POST', '/sync/batch', [item], dh);
    ok(b1.body?.[0]?.status === 'applied' && b2.body?.[0]?.status === 'duplicate', 'sync/batch idempotent (applied → duplicate)');
    const issues = (await raw('GET', `/shipments/${work.body.trips[0].shipment.id}`, undefined, dh)).body.legs[0].issues;
    ok(issues.filter((i: { reason: string }) => i.reason === 'Breakdown').length === 1, 'replayed issue stored once');

    const r1 = await raw('POST', '/auth/refresh', { refreshToken: drv.body.refreshToken });
    const r2 = await raw('POST', '/auth/refresh', { refreshToken: drv.body.refreshToken });
    ok(r1.status === 200 && r2.status === 401, 'refresh tokens rotate (reuse rejected)');
    await raw('POST', `/auth/devices/${drv.body.deviceId}/revoke`, {}, { authorization: `Bearer ${r1.body.accessToken}` });
    ok((await raw('GET', '/me', undefined, { authorization: `Bearer ${r1.body.accessToken}` })).status === 401, 'remote device logout blocks the session (MA-08)');

    await db`UPDATE settings SET value = '"2.0.0"'::jsonb WHERE key = 'minAppVersion'`;
    await new Promise((r) => setTimeout(r, 100));
    const v426 = await raw('POST', '/auth/login', { phone: '+254711000001', pin: '1234' }, { 'x-app-version': '1.0.0' });
    ok(v426.status === 426, `outdated app gets 426 (got ${v426.status})`);
  } finally {
    await db.end();
    stop();
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  if (failed && process.env.DEBUG_API) console.log(log.slice(-4000));
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
