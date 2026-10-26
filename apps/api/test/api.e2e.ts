// End-to-end over HTTP: migrates + seeds an isolated `btw_test` database, boots the API on :3199,
// then drives the same 14-step workflow as packages/api/test/workflow.e2e.ts through the real client
// (@btw/api/http), plus auth, scope, idempotency, geofence and SMS checks.
// Run: pnpm --filter @btw/server test   (needs `docker compose up -d db`)
import type { PeriodPlan } from '@btw/api/types';
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
    // docs/09 §4: no drafts — "Create purchase order" issues it at once (approvals off)
    ok(api.ref().config?.approvals.purchaseOrders === false && api.ref().config.loading.allowancePct === 10, 'GET /ref carries config.toml (no PO approval, ±10 % loading allowance)');
    const created = await api.pos.create({ entityId: 'e-kivu', supplierId: 's-sbl', title: 'Test order', lines: [{ ...api.pos.newLine('s-sbl', 1), qty: 1800, routeId: 'r-mwz-kgl' }] });
    ok(/^KVD-PO-\d{4}-\d{4}$/.test(created.ref), `ref auto-numbered ${created.ref}`);
    ok(created.status === 'Issued' && created.approval === 'issued' && created.stage === 'Created', `created → PO ${created.ref} issued at once (approved automatically)`);
    const p = { ref: created.ref, poId: created.id };
    await api.auth.signIn({ username: 'daniel', password: 'demo1234' });
    await rejects(api.pos.decide(p.poId, 'approved', '', 'x'), /switched off|409/, 'director decision refused while approvals are off');
    await api.auth.signIn({ username: 'kabonge', password: 'demo1234' });
    await rejects(api.pos.update(p.poId, { title: 'Test order', lines: [], reason: '' }), /reason/, 'an update needs a reason');
    const draftGone = await raw('POST', '/plans', { entityId: 'e-kivu', supplierId: 's-sbl' }, { authorization: `Bearer ${(await raw('POST', '/auth/login', { username: 'kabonge', password: 'demo1234' })).body?.accessToken}` });
    ok(draftGone.status === 404, 'POST /plans (drafts) is gone', draftGone.status);

    await api.auth.signIn({ phone: '+255700000021', pin: '1234' }); // the SBL loader (to confirm, roles document Q2)
    ok(api.auth.me()?.id === 'u-sbl-loader', 'loader signs in with phone + PIN');
    const ld = (await api.loading.list('s-sbl')).find((l) => l.poId === p.poId)!;
    ok(ld && !('agreedTransport' in ld) && api.ref().priceList.length === 0, 'loader: loadings and reference data carry no prices (A-04)');
    await rejects(api.loading.confirm(ld.id, { truckId: 't6', driverId: 'd6', loadedQty: { [ld.lines[0].planLineId]: 1900 }, agreedTransport: 900, documents: [] }), /capacity/, 'truck capacity enforced (1800 max)');
    const sh = await api.loading.confirm(ld.id, { truckId: 't6', driverId: 'd6', loadedQty: { [ld.lines[0].planLineId]: 1780 }, agreedTransport: 900, documents: ['dn.jpg'] });
    ok(sh.legs[0].lines[0].loadedQty === 1780 && sh.legs[0].status === 'Loaded', 'shipment created with loaded qty');
    ok(sh.poId !== p.poId && (await api.pos.get(sh.poId))?.po.ref === `${p.ref}-rev001`, 'loaded 1,780 of 1,800 → PO revised automatically (…-rev001), shipment linked to it');
    const leg = sh.legs[0];
    const sms = await (await fetch(`${BASE}/dev/sms?phone=${encodeURIComponent('+255711000006')}`)).json() as { text: string }[];
    ok(sms.some((x) => /ARR NYAKANAZI T512DFG/.test(x.text)), 'driver without app gets loading SMS with check-in code');

    await api.auth.signIn({ username: 'asie', password: 'demo1234' });
    const before = (await api.inventory.stock()).find((r) => r.warehouseId === 'w-kgl' && r.productId === 'p-e330')!;

    await api.auth.signIn({ phone: '+255700000021', pin: '1234' });
    await api.tracking.dispatch(leg.id, 'office'); // the loader marks the shipment dispatched (§4)
    await api.auth.signIn({ phone: '+254700000006', pin: '1234' }); // Testfie follows the truck
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
    await api.shipments.pass(leg.id, 'cp-kigali', 'departed', 'office');
    await api.shipments.pass(leg.id, 'cp-gisenyi-wh', 'arrived', 'office');
    let s2 = (await api.shipments.get(sh.id))!;
    ok(s2.legs[0].status === 'Arrived', 'leg arrived at destination');
    ok(['Early', 'On time', 'Late'].includes(api.shipments.eta(s2.legs[0]).state), `ETA state ${api.shipments.eta(s2.legs[0]).state}`);

    await api.auth.signIn({ username: 'yonas', password: 'demo1234' });
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
    // doc 08 §2: onward move = a new shipment from the warehouse (stock out now, in on acknowledgement)
    const kgl0 = (await api.inventory.stock()).find((r) => r.entityId === sh.entityId && r.warehouseId === 'w-kgl' && r.productId === 'p-e330')!.closing;
    const on = await api.shipments.sendOn(sh.id, { routeId: 'r-kgl-goma', truckId: 't8', driverId: 'd5', lines: [{ productId: 'p-e330', loadedQty: 100 }] });
    ok(on.parentShipmentId === sh.id && on.fromWarehouseId === 'w-kgl' && on.warehouseId === 'w-goma' && on.legs[0].lines[0].loadedQty === 100, `send-on → new shipment ${on.ref}`);
    const kgl1 = (await api.inventory.stock()).find((r) => r.entityId === sh.entityId && r.warehouseId === 'w-kgl' && r.productId === 'p-e330')!.closing;
    ok(kgl0 - kgl1 === 100, 'send-on takes 100 cases out of Gisenyi');
    const jr = await api.shipments.journey(on.id);
    ok(jr.length === 2 && jr[0].shipmentId === sh.id && jr[0].received === 1770 && jr[1].loaded === 100, 'journey origin → onward');
    // doc 08 §3: flexible warehouses (admin/director only) + a route ending there
    await rejects(api.masterdata.addWarehouse({ name: 'Nope', country: 'Congo', town: 'Bukavu', receivingCompanyId: 'rc-asie', lat: -2.5, lng: 28.86 }), /admin or director/, 'receiver cannot add a warehouse (403)');
    await api.auth.signIn({ username: 'daniel', password: 'demo1234' });
    await rejects(api.masterdata.addWarehouse({ name: 'X', country: 'Congo', town: '', receivingCompanyId: 'rc-asie', lat: -2.5, lng: 28.86 }), /town/, 'warehouse form validated (422)');
    const bk = await api.masterdata.addWarehouse({ name: 'Asie Bukavu', country: 'Congo', town: 'Bukavu', receivingCompanyId: 'rc-asie', lat: -2.5083, lng: 28.8608, radiusM: 400 });
    const bkCp = api.ref().checkpoints.find((c) => c.id === bk.checkpointId);
    ok(api.ref().warehouses.some((w) => w.id === bk.id && w.active) && bkCp?.kind === 'warehouse' && bkCp.country === 'CD', 'new warehouse + geofence checkpoint in master data');
    const near = await db`SELECT id FROM checkpoints WHERE ST_DWithin(geog, ST_SetSRID(ST_MakePoint(28.861, -2.5085), 4326)::geography, radius_m)`;
    ok(near.some((r: { id: string }) => r.id === bk.checkpointId), 'its geofence works with PostGIS');
    const rt = await api.masterdata.addRoute({ name: 'Goma → Bukavu', stops: [{ checkpointId: 'cp-goma', plannedHours: 0, plannedDwellHours: 0 }, { checkpointId: bk.checkpointId, plannedHours: 6, plannedDwellHours: 0 }] });
    ok(api.ref().routes.some((r) => r.id === rt.id && r.stops.at(-1)!.checkpointId === bk.checkpointId), 'route can end at the new warehouse');
    await api.masterdata.updateWarehouse(bk.id, { active: false, name: 'Asie Bukavu (old)' });
    ok(api.ref().warehouses.find((w) => w.id === bk.id)?.active === false && api.ref().checkpoints.find((c) => c.id === bk.checkpointId)?.name === 'Asie Bukavu (old)', 'warehouse edited and deactivated');
    await api.auth.signIn({ username: 'asie', password: 'demo1234' });

    await api.auth.signIn({ username: 'daniel', password: 'demo1234' });
    const n = await api.notifications.list();
    ok(n.some((x) => x.title === 'Delivery discrepancy' && x.body.includes(s2.ref)), 'discrepancy alert raised');

    await api.auth.signIn({ username: 'asie', password: 'demo1234' });
    await rejects(api.sales.create({ entityId: 'e-kivu', at: new Date().toISOString(), warehouseId: 'w-kgl', customer: 'X', salespersonId: 'u-asie', kind: 'Cash', lines: [{ productId: 'p-e330', qty: 1, price: 1 }], currency: 'USD', paid: 0 }), /directors|403/, 'receivers do not record sales (§7: directors only)');
    await api.auth.signIn({ username: 'daniel', password: 'demo1234' });
    await rejects(api.sales.create({ entityId: 'e-kivu', at: new Date().toISOString(), warehouseId: 'w-kgl', customer: 'X', salespersonId: 'u-daniel', kind: 'Cash', lines: [{ productId: 'p-e330', qty: 999999, price: 1 }], currency: 'USD', paid: 0 }), /in stock/, 'sale above stock blocked (SL-02)');

    await api.auth.signIn({ username: 'daniel', password: 'demo1234' });
    const v = await api.analytics.velocity();
    ok(v.length > 0 && v.every((r) => ['Fast', 'Normal', 'Slow', 'Stagnant'].includes(r.cls)), `velocity rows ${v.length}`);
    let t = (await api.finance.trips()).find((x) => x.shipment.id === sh.id)!;
    ok(t.transport === 0 && t.agreedRecorded === false, 'loaded without a price → agreed transport "not recorded yet" (A-04)');
    await api.auth.signIn({ phone: '+254700000006', pin: '1234' });
    await api.finance.setAgreedPrice(sh.id, { amount: 900, currency: 'USD' });
    await api.auth.signIn({ username: 'daniel', password: 'demo1234' });
    t = (await api.finance.trips()).find((x) => x.shipment.id === sh.id)!;
    ok(t.transport === 900 && t.agreedRecorded && t.landing > t.goods, 'Testfie records the agreed price after loading; landing cost = goods + expenses');

    // ---- platform checks ----
    const drv = await raw('POST', '/auth/login', { phone: '+254702750019', pin: '1234' });
    const dh = { authorization: `Bearer ${drv.body.accessToken}` };
    ok((await raw('GET', '/users', undefined, dh)).status === 403, 'driver cannot list users (403)');
    ok((await raw('GET', '/plans', undefined, dh)).body?.length === 0, 'driver sees no plans (scope)');
    const work = await raw('GET', '/field/driver', undefined, dh);
    ok(work.body?.trips?.[0]?.truck?.reg === 'KBV 894T' && work.body.trips[0].overdue, 'driver working set: own trip with overdue check-in');

    // Hand-over → push + in-app notification to the driver (Peter registers a push token first)
    await raw('POST', '/devices', { pushToken: 'tok-peter-e2e', platform: 'android', appVersion: '0.2.0' }, dh);
    const jh = { authorization: `Bearer ${(await raw('POST', '/auth/login', { phone: '+254700000003', pin: '1234' })).body.accessToken}` }; // Joel, KBL
    const pend = (await raw('GET', '/loadings?loadingPointId=s-kbl', undefined, jh)).body.find((l: { status: string }) => l.status === 'Pending');
    const handed = await raw('POST', `/loadings/${pend.id}/confirm`, { truckId: 't2', driverId: 'd1', loadedQty: {}, agreedTransport: 1500, documents: [] }, jh);
    ok(handed.status === 201, `giver records loading for Peter's truck (${handed.status})`);
    // pushToDriver runs after the response (fire-and-forget): poll for up to 5 s instead of a fixed sleep
    const poll = async (f: () => Promise<boolean>) => { for (let i = 0; i < 25; i++) { if (await f()) return true; await new Promise((r) => setTimeout(r, 200)); } return f(); };
    ok(await poll(async () => { const s = JSON.stringify((await raw('GET', '/dev/push')).body); return s.includes('tok-peter-e2e') && s.includes('trip assigned'); }), 'hand-over pushes the driver');
    ok(await poll(async () => (await raw('GET', '/notifications', undefined, dh)).body.some((n: { title: string }) => /trip assigned/.test(n.title))), 'driver gets a personal in-app notification');

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

    // ---- reports & planning (shared pure functions, role-scoped) ----
    const dirH = { authorization: `Bearer ${(await raw('POST', '/auth/login', { username: 'daniel', password: 'demo1234' })).body.accessToken}` };
    const dash = await raw('GET', '/reports/dashboard', undefined, dirH);
    ok(dash.status === 200 && dash.body.kpis.revenue30 > 0 && dash.body.trend.length === 12, `dashboard report (${dash.status}): 30-day revenue + 12-month trend`);
    const yr = new Date(Date.now() - 365 * 864e5).toISOString(), nw = new Date().toISOString();
    const sr = await raw('GET', `/reports/sales?from=${yr}&to=${nw}&groupBy=month`, undefined, dirH);
    const seriesSum = Math.round(sr.body.series.reduce((a: number, x: { revenue: number }) => a + x.revenue, 0));
    ok(sr.status === 200 && Math.abs(seriesSum - Math.round(sr.body.totals.revenue)) <= 1 && sr.body.byWarehouse.length === 3, 'sales report: monthly series sums to the total; 3 warehouses');
    ok((await raw('GET', '/reports/quarterly?quarter=2026-13', undefined, dirH)).status === 400, 'bad quarter → 400');
    const q = await raw('GET', `/reports/quarterly`, undefined, dirH);
    ok(q.status === 200 && q.body.kpis.length === 10 && q.body.highlights.length >= 3, 'quarterly review: 10 KPIs + highlights');
    for (const r of ['logistics', 'inventory', 'planning', 'finance', 'period-plan']) {
      const x = await raw('GET', `/reports/${r}`, undefined, dirH); ok(x.status === 200 && x.body && typeof x.body === 'object', `/reports/${r} → ${x.status}`);
    }
    const cc = await raw('GET', `/reports/capture-check?from=${new Date(Date.now() - 90 * 864e5).toISOString()}`, undefined, dirH);
    ok(cc.status === 200 && cc.body.kinds.some((k: { kind: string }) => k.kind === 'PO not sent to supplier') && cc.body.kinds.some((k: { kind: string }) => k.kind === 'Arrived, not acknowledged'), 'capture check finds planted gaps via the API');
    const asieH = { authorization: `Bearer ${(await raw('POST', '/auth/login', { username: 'asie', password: 'demo1234' })).body.accessToken}` };
    ok((await raw('GET', `/reports/sales?from=${yr}&to=${nw}`, undefined, asieH)).status === 403, 'receiver: no sales report (sales are the directors\', §7)');
    const ast = (await raw('GET', '/stock', undefined, asieH)).body as { warehouseId: string; landedCostPerCase?: number }[];
    ok(ast.length > 0 && ast.every((r) => ['w-kgl', 'w-goma'].includes(r.warehouseId) && r.landedCostPerCase === undefined), 'receiver: own warehouses only, no landed cost (A-04)');
    ok((await raw('GET', '/reports/dashboard', undefined, dh)).status === 403, 'driver cannot open reports (403)');

    // ---- companies (tenants): per-company scope, Group, intercompany, FX ----
    const tok = async (username: string) => ({ authorization: `Bearer ${(await raw('POST', '/auth/login', { username, password: 'demo1234' })).body.accessToken}` });
    for (const [user, ent, lp] of [['joel', 'e-btw', 's-kbl'], ['moses', 'e-nud', 's-ubl'], ['sbl-loader', 'e-kivu', 's-sbl']] as const) {
      const h = await tok(user);
      const me = (await raw('GET', '/me', undefined, h)).body;
      ok(JSON.stringify(me.allowedEntityIds) === JSON.stringify([ent]) && me.canGroup === false, `${user}: one company (${ent}), no group`);
      const [shs, pls, st] = await Promise.all([raw('GET', '/shipments', undefined, h), raw('GET', '/plans', undefined, h), raw('GET', '/stock', undefined, h)]);
      ok(shs.body.every((x: { entityId: string }) => x.entityId === ent) && pls.body.every((x: { entityId: string; supplierId: string; lines: { price?: number }[] }) => x.entityId === ent && x.supplierId === lp && x.lines.every((l) => l.price === undefined)) && st.body.length === 0, `${user}: own company and loading point only; orders without prices; no stock`);
      const other = ent === 'e-btw' ? 'e-nud' : 'e-btw';
      ok((await raw('GET', `/reports/sales?entityId=${other}`, undefined, h)).status === 403, `${user}: report for ${other} → 403`);
      ok((await raw('GET', '/shipments', undefined, { ...h, 'x-entity-id': other })).status === 403, `${user}: X-Entity-Id ${other} → 403`);
      ok((await raw('GET', '/reports/group', undefined, h)).status === 403, `${user}: group report → 403`);
    }
    const dme = (await raw('GET', '/me', undefined, dirH)).body;
    ok(dme.canGroup && dme.allowedEntityIds.length === 3 && dme.activeEntityId === null, 'director: all three companies, Group view');
    const ents = (await raw('GET', '/entities', undefined, dirH)).body;
    ok(ents.length === 3 && ents.every((e: { shortName: string; colors: { primary: string }; kraPin: string; address: string[] }) => e.shortName && e.colors.primary && /to confirm/.test(e.kraPin) && e.address.length), '/entities: company records with brand/contact/legal fields');
    const nudShs = await raw('GET', '/shipments', undefined, { ...dirH, 'x-entity-id': 'e-nud' });
    ok(nudShs.body.length > 0 && nudShs.body.every((x: { entityId: string }) => x.entityId === 'e-nud'), 'director with X-Entity-Id e-nud sees only NUD');
    const sale = { at: new Date().toISOString(), warehouseId: 'w-kgl', customer: 'Kivu sister co', salespersonId: 'u-daniel', kind: 'Credit', lines: [{ productId: 'p-c200', qty: 10, price: 11 }], currency: 'USD', paid: 0 };
    ok((await raw('POST', '/sales', sale, dirH)).status === 422, 'Group view: a new sale must name its company (422)');
    const gr0 = (await raw('GET', '/reports/group?from=' + new Date(Date.now() - 30 * 864e5).toISOString(), undefined, dirH)).body;
    const ic = await raw('POST', '/sales', { ...sale, counterpartyEntityId: 'e-btw' }, { ...dirH, 'x-entity-id': 'e-nud' });
    ok(ic.status === 201 && ic.body.entityId === 'e-nud' && ic.body.counterpartyEntityId === 'e-btw', `intercompany sale NUD → BTW recorded (${ic.status})`);
    const led = (await raw('GET', '/stock/ledger?warehouseId=w-kgl&productId=p-c200', undefined, { ...dirH, 'x-entity-id': 'e-btw' })).body;
    ok(led.some((m: { kind: string; ref: string; entityId: string }) => m.kind === 'transferIn' && m.ref === ic.body.ref && m.entityId === 'e-btw'), 'buyer company receives the goods (transfer in, same warehouse)');
    const gr = await raw('GET', '/reports/group?from=' + new Date(Date.now() - 30 * 864e5).toISOString(), undefined, dirH);
    const sumRev = Object.values(gr.body.byEntity as Record<string, { revenue: number }>).reduce((a, k) => a + k.revenue, 0);
    ok(gr.status === 200 && Object.keys(gr.body.byEntity).length === 3 && Math.abs(sumRev - gr.body.lessIntercompany.revenue - gr.body.total.revenue) < 0.05, `group = Σ companies − intercompany (${Math.round(gr.body.lessIntercompany?.revenue ?? 0)})`);
    ok(Math.abs(gr.body.lessIntercompany.revenue - gr0.lessIntercompany.revenue - 110) < 0.01 && Math.abs(gr.body.total.revenue - gr0.total.revenue) < 0.01, 'the new intercompany sale is eliminated from the group total');
    ok(gr.body.league.length === 3 && gr.body.trend.length === 13 && /USD/.test(gr.body.fxBasis), 'group league table, 13-month trend, FX basis');
    ok((await raw('PUT', '/settings/fx', { currency: 'KES', month: '2026-10', avg: 129.5, closing: 129.9 }, dirH)).status === 200, 'director approves an exchange rate');
    ok((await raw('PUT', '/settings/fx', { currency: 'KES', month: '2026-10', avg: 1, closing: 1 }, await tok('kabonge'))).status === 403, 'only directors change exchange rates (403)');
    ok((await raw('GET', '/settings/fx', undefined, dirH)).body.some((r: { currency: string; month: string; avg: number }) => r.currency === 'KES' && r.month === '2026-10' && r.avg === 129.5), 'exchange rate stored');
    // the HTTP client honours the active company like the mock
    await api.auth.signIn({ username: 'daniel', password: 'demo1234' });
    api.configure({ entityId: 'e-kivu' });
    ok((await api.shipments.list()).every((x) => x.entityId === 'e-kivu') && api.entities.active() === 'e-kivu', 'client configure({ entityId }) scopes every call (X-Entity-Id)');
    ok((await api.reports.group()).league.length === 3, 'client reports.group works while a company is active');
    api.configure({ entityId: null });
    await api.auth.signIn({ username: 'sbl-loader', password: 'demo1234' });
    ok(api.entities.active() === 'e-kivu' && (await api.shipments.list()).every((x) => x.entityId === 'e-kivu'), 'single-company user starts in their company');
    let threw = false; try { api.configure({ entityId: 'e-btw' }); } catch { threw = true; } ok(threw, 'client refuses a company outside the allowed set');

    // ---- period plans (PL-06..12), orders against the plan (PO-06..08), planned vs actual (PV-01..07), features ----
    const me = await raw('GET', '/me', undefined, await tok('kabonge'));
    ok(me.body.features?.includes('period-plans') && me.body.features.includes('master-data.static') && !me.body.features.includes('finance') && !me.body.features.includes('period-plans.approve') && me.body.pairs?.length === 3, 'me.features: Kabonge plans + static data, no finance; three buyer–supplier pairs');
    ok(!(await raw('POST', '/auth/login', { username: 'daniel', password: 'demo1234' })).body.user.features.includes('period-plans.approve'), 'no period-plan approval feature any more');
    const nudH = { ...dirH, 'x-entity-id': 'e-nud' };
    const pps = (await raw('GET', '/period-plans', undefined, nudH)).body as PeriodPlan[];
    const nudLive = pps.find((x) => x.status === 'Active')!;
    ok(nudLive?.ref === 'NUD-PP-2026-0001' && pps.every((x) => x.entityId === 'e-nud') && nudLive.lines.every((l) => Object.values(l.months ?? {}).reduce((a, b) => a + b, 0) === l.cases), 'seeded: active NUD plan with a monthly split (company-scoped)');
    const pvN = await raw('GET', '/reports/planned-vs-actual', undefined, nudH);
    ok(pvN.status === 200 && pvN.body.lines.some((l: { flag: string }) => l.flag === 'Over plan') && pvN.body.lines.some((l: { flag: string }) => l.flag === 'Unplanned'), 'PV (NUD): over plan + unplanned from the seeded cycle (Active plans)');
    const ctx2 = await raw('GET', '/plans/plan-2/plan-context', undefined, nudH);
    ok(ctx2.status === 200 && ctx2.body.some((c: { exception?: string; reason?: string }) => c.exception === 'over' && c.reason), 'plan context: the pending NUD order is over plan, with its note');
    // planner: period plans are suggestions — saved directly; never overlapping (409 unless replace)
    const kH = { ...(await tok('kabonge')), 'x-entity-id': 'e-kivu' };
    const kD = { ...dirH, 'x-entity-id': 'e-kivu' };
    const range = { from: nudLive.to.slice(0, 8) + '01', to: nudLive.to };
    let np = await raw('POST', '/period-plans', { periodKind: 'month', ...range, title: 'Kivu top-up month' }, kH);
    ok(np.status === 409 && np.body.conflicts?.some((x: { ref: string }) => x.ref === 'KVD-PP-2026-0001'), 'a month inside the running Kivu plan → 409 with the conflicting ref', np.body);
    const ov = await raw('POST', '/period-plans/overlaps', { entityId: 'e-kivu', ...range }, kH);
    ok(ov.status === 200 && ov.body.some((x: PeriodPlan) => x.ref === 'KVD-PP-2026-0001'), 'overlaps preview reports the running Kivu plan');
    np = await raw('POST', '/period-plans', { periodKind: 'month', from: '2027-02-01', to: '2027-02-28', title: 'Kivu Feb 2027' }, kH);
    ok(np.status === 201 && /^KVD-PP-\d{4}-\d{4}$/.test(np.body.ref) && np.body.status === 'Active', `planner creates a period plan ${np.body.ref} (Active, no approval)`);
    const pid = np.body.id;
    np = await raw('PUT', `/period-plans/${pid}`, { ...np.body, lines: [{ supplierId: 's-sbl', productId: 'p-e330', cases: 1200, price: 13.1, destinationId: 'w-kgl' }] }, kH);
    ok(np.status === 200 && np.body.lines[0].id && np.body.version === 2, 'lines saved (version 2)');
    ok((await raw('PUT', `/period-plans/${pid}`, { title: 'Director edit' }, kD)).body.title === 'Director edit', 'directors edit plans directly');
    const vers = await raw('GET', `/period-plans/${pid}/versions`, undefined, kH);
    ok(vers.status === 200 && vers.body.some((v: { version: number }) => v.version === 1), 'earlier versions kept (edit history)');
    let cpy = await raw('POST', `/period-plans/${pid}/copy`, { from: '2027-02-15', to: '2027-03-31' }, kH);
    ok(cpy.status === 409, 'copy onto a covered period → 409');
    cpy = await raw('POST', `/period-plans/${pid}/copy`, { from: '2027-03-01', to: '2027-03-31' }, kH);
    ok(cpy.status === 201 && cpy.body.copiedFromId === pid && cpy.body.status === 'Active' && cpy.body.lines.length === 1, 'copy into the next period (PL-11)');
    const rep = await raw('POST', '/period-plans', { periodKind: 'custom', from: '2027-02-20', to: '2027-03-10', title: 'Kivu bridge', replace: true }, kH);
    const repd = (await raw('GET', '/period-plans?all=1', undefined, kH)).body as PeriodPlan[];
    ok(rep.status === 201 && repd.filter((x) => x.replacedById === rep.body.id).length === 2 && !((await raw('GET', '/period-plans', undefined, kH)).body as PeriodPlan[]).some((x) => x.id === pid), 'replace: true → both overlapped plans Replaced (kept, hidden by default)');
    ok((await raw('POST', `/period-plans/${pid}/submit`, {}, kH)).status === 404, 'no period-plan submit/approval any more');
    ok((await raw('POST', '/period-plans', { periodKind: 'month', ...range, title: 'x' }, { ...dirH })).status === 422, 'Group view cannot create (entity required)');
    // orders against the plan: informational only — an over-plan order is issued without a reason (PO-07 no longer blocks)
    const kl = (n: number) => ({ truckNo: n, productId: 'p-e330', qty: 2000, price: 13.1, deliveredToId: 'rc-asie', routeId: 'r-mwz-kgl' });
    const sub = await raw('POST', '/pos', { entityId: 'e-kivu', supplierId: 's-sbl', title: 'Kivu over plan', lines: [kl(1), kl(2), kl(3)] }, kH);
    ok(sub.status === 201 && sub.body.status === 'Issued', 'over-plan PO without a reason is issued on create (plans gate nothing)', sub.body);
    const ko = (await raw('GET', `/plans/${sub.body.planId}`, undefined, kH)).body;
    const kc = (await raw('GET', `/plans/${sub.body.planId}/plan-context`, undefined, kH)).body;
    ok(kc[0].periodPlanRef === 'KVD-PP-2026-0001' && kc[0].planned > 0 && kc.at(-1).exception === 'over' && ko.lines.at(-1).exception === 'over', 'PO lines linked to the plan; planned / ordered / remaining; over marked');
    // planned vs actual + thresholds + feature gates
    const pvK = (await raw('GET', '/reports/planned-vs-actual', undefined, kD)).body;
    ok(pvK.measures.planned === pvK.lines.reduce((a: number, l: { planned: number }) => a + l.planned, 0) && pvK.months.at(-1).cumPlanned === pvK.measures.planned && pvK.today, 'PV measures, running totals, today marker');
    ok((await raw('GET', '/reports/planned-vs-actual', undefined, await tok('asie'))).status === 403, 'receiver: no planned vs actual (403)');
    ok((await raw('GET', '/period-plans', undefined, await tok('testfie'))).status === 403 && (await raw('POST', '/period-plans', { periodKind: 'month', ...range, title: 'x', entityId: 'e-btw' }, await tok('testfie'))).status === 403, 'truck follow-up: no period plans (403)');
    ok((await raw('GET', '/finance/trips', undefined, await tok('kabonge'))).status === 403, 'planner: no trip financials (§7)');
    ok((await raw('PUT', '/settings/pv-thresholds', { behind: 0.9, over: 1.1 }, await tok('kabonge'))).status === 403, 'only directors change PV thresholds');
    ok((await raw('PUT', '/settings/pv-thresholds', { behind: 1.5, over: 1.1 }, dirH)).status === 400, 'PV thresholds validated');
    ok((await raw('PUT', '/settings/pv-thresholds', { behind: 0.9, over: 1.1 }, dirH)).status === 200 && (await raw('GET', '/reports/planned-vs-actual', undefined, kD)).body.thresholds.behind === 0.9, 'director sets thresholds; the report uses them');

    const r1 = await raw('POST', '/auth/refresh', { refreshToken: drv.body.refreshToken });
    const r2 = await raw('POST', '/auth/refresh', { refreshToken: drv.body.refreshToken });
    ok(r1.status === 200 && r2.status === 401, 'refresh tokens rotate (reuse rejected)');
    await raw('POST', `/auth/devices/${drv.body.deviceId}/revoke`, {}, { authorization: `Bearer ${r1.body.accessToken}` });
    ok((await raw('GET', '/me', undefined, { authorization: `Bearer ${r1.body.accessToken}` })).status === 401, 'remote device logout blocks the session (MA-08)');

    await db`UPDATE settings SET value = '"2.0.0"'::jsonb WHERE key = 'minAppVersion'`;
    await new Promise((r) => setTimeout(r, 100));
    const v426 = await raw('POST', '/auth/login', { phone: '+254702750019', pin: '1234' }, { 'x-app-version': '1.0.0' });
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
