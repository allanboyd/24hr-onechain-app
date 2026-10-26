// Truck planner role (docs/10) against the in-browser mock: permissions, provider / truck / driver onboarding with
// validation, queue reorder / remove with a reason, and the truck desk (pure functions in src/trucks.ts).
import * as api from '../src/index';
import { FEATURES, featuresFor, hasFeature, normPhone, reorderQueue, seesLoadingPoint, validateDriver, validateProvider, validateTruck } from '../src/rules';
import { costsByProvider, costsByTruck, deskKpis, sortDesk, truckDesk } from '../src/trucks';
import { canRecordLoading } from '../src/access';

let failed = 0;
const ok = (c: unknown, m: string) => { if (!c) { failed++; console.log('FAIL', m); } else console.log('ok  ', m); };
const rejects = async (p: Promise<unknown>, re: RegExp, m: string) => {
  try { await p; ok(false, `${m} (no error)`); } catch (e) { const msg = `${(e as Error).message} ${(e as { status?: number }).status ?? ''}`; ok(re.test(msg), `${m} → ${msg.trim()}`); }
};

// ---- the role × feature matrix (docs/12: the truck planner role is now Testfie's "Truck follow-up officer") ------
const tp = featuresFor(['truck_planner']);
ok(['logistics', 'loading', 'fleet', 'trucks', 'truck-expenses', 'purchase-orders', 'master-data', 'transport-fees'].every((f) => tp.includes(f as never)), 'truck follow-up: shipments, loading, fleet, truck desk, truck expenses, POs (GBI), transport view');
ok(!['purchase-orders.approve', 'finance', 'finance.approve', 'sales', 'master-data.transport', 'master-data.static', 'users', 'period-plans', 'inventory', 'dashboard', 'reports', 'audit'].some((f) => tp.includes(f as never)), 'truck follow-up: no trip financials, sales, static-data edits, users, plans, stock or reports');
const fleet = featuresFor(['fleet']);
ok(['logistics', 'finance', 'trucks', 'master-data.transport'].every((f) => fleet.includes(f as never)), 'fleet (unassigned) keeps its features');
ok(!hasFeature(['truck_planner'], 'finance.approve') && FEATURES['finance.approve'].length === 1, 'only directors approve payments');
ok(seesLoadingPoint({ roles: ['truck_planner'], loadingPointIds: ['s-gbi'] }, 's-kbl') && seesLoadingPoint({ roles: ['loader'], loadingPointIds: ['s-kbl'] }, 's-kbl') && !seesLoadingPoint({ roles: ['loader'], loadingPointIds: ['s-kbl'] }, 's-ubl'), 'truck follow-up sees every queue; loaders only their own point');
ok(canRecordLoading({ roles: ['truck_planner'], loadingPointIds: ['s-gbi'] }, 's-gbi') && !canRecordLoading({ roles: ['truck_planner'], loadingPointIds: ['s-gbi'] }, 's-kbl') && !canRecordLoading({ roles: ['director'], loadingPointIds: [] }, 's-kbl'), 'loading recorded only at the points on the profile (Testfie: GBI); directors view');

// ---- pure validators ------------------------------------------------------------------------------------
const providers = [{ id: 'pr-1', name: 'ETS Sabrina Ltd' }];
ok(validateProvider({ name: 'ets sabrina ltd', kind: 'company' }, providers).some((e) => /already registered/.test(e)), 'provider names are unique (case-insensitive)');
ok(validateProvider({ name: 'New Sacco', kind: 'sacco', phone: '0712 345 678' }, providers).length === 0, 'local phone 0712… accepted (→ +254712…)');
ok(validateProvider({ name: 'X', kind: 'cooperative' as never }, providers).length === 1, 'provider kind must be company / sacco / individual / market');
ok(validateProvider({ name: 'X', kind: 'company', phone: '12' }, providers).some((e) => /Phone/.test(e)), 'provider phone format checked');
ok(validateProvider({ name: 'X', kind: 'company', email: 'not-an-email' }, providers).some((e) => /Email/.test(e)), 'provider email format checked');
const tctx = { providers: [{ id: 'pr-1' }], trucks: [{ id: 't1', reg: 'KBV 894T' }], drivers: [{ id: 'd1', providerId: 'pr-1' }] };
ok(validateTruck({ providerId: 'pr-1', reg: 'kbv894t', capacityCases: 2000 }, tctx).some((e) => /already registered/.test(e)), 'truck registrations unique (case / spaces ignored)');
ok(validateTruck({ providerId: 'pr-1', reg: 'KBV 894T', capacityCases: 1800 }, tctx, 't1').length === 0, 'editing a truck keeps its own registration');
ok(validateTruck({ providerId: 'pr-1', reg: 'KDA 1A', capacityCases: 0 }, tctx).some((e) => /Capacity/.test(e)), 'capacity must be a whole number of cases');
ok(validateTruck({ providerId: 'pr-x', reg: 'KDA 1A', capacityCases: 10 }, tctx).some((e) => /provider/.test(e)), 'truck needs a known provider');
ok(validateDriver({ providerId: 'pr-1', name: 'A', phone: '+254702750019' }, { providers: [{ id: 'pr-1' }], drivers: [{ id: 'd1', phone: '+254702750019' }] }).some((e) => /already uses/.test(e)), 'driver phone numbers unique');
ok(normPhone('0712 345 678') === '+254712345678' && normPhone('+256 711 000 002') === '+256711000002', 'phones normalised to E.164');
ok(reorderQueue(['a', 'b', 'c', 'd'], 'd', 1).join('') === 'dabc' && reorderQueue(['a', 'b', 'c'], 'a', 99).join('') === 'bca', 'reorderQueue: move to a position (clamped)');

// ---- mock: Testfie, the truck follow-up officer ---------------------------------------------------------------------
api.demo.reset();
await api.auth.login('u-testfie', '');
const me = api.auth.me()!;
ok(me.roles.includes('truck_planner') && me.allowedEntityIds.length === 3 && !me.canGroup, 'Testfie: all three companies, no Group view');
ok((await api.plans.list()).every((x) => x.supplierId === 's-gbi') && (await api.pos.list()).every((x) => x.supplierId === 's-gbi'), 'sees only the purchase orders loading at GBI Mombasa');
await rejects(api.pos.create({ entityId: 'e-nud', supplierId: 's-gbi', title: 'x', lines: [{ ...api.pos.newLine('s-gbi', 1), qty: 100 }] }), /planners|403/, 'cannot create a purchase order');
const trips = await api.finance.trips();
ok(trips.length > 0 && new Set(trips.map((x) => (x.shipment as { entityId: string }).entityId)).size === 3, 'reads trip costs of every company');
ok(trips.every((x) => x.goods === undefined && x.landing === undefined), 'no goods value or landed cost (trip financials are the directors\')');
const pending = trips.flatMap((x) => x.payments).find((x) => x.status === 'Pending approval');
await rejects(api.finance.approve(pending!.id), /director|403/, 'cannot approve a payment');
await rejects(api.finance.pay(trips[0].shipment.id, trips[0].costs[0].id, 1, 'qa'), /directors|403/, 'cannot record a payment');
api.entities.setActive('e-btw');
const btwTrip = trips.find((x) => (x.shipment as { entityId: string }).entityId === 'e-btw')!;
const cost = await api.finance.addCost({ shipmentId: btwTrip.shipment.id, kind: 'Other', amount: 35, currency: 'USD', docRef: 'Police fine (receipt)' });
ok(cost.amountUsd === 35 && cost.entityId === 'e-btw', 'adds a truck expense to a BTW trip');
const nudTrip = trips.find((x) => (x.shipment as { entityId: string }).entityId === 'e-nud')!;
await rejects(api.finance.addCost({ shipmentId: nudTrip.shipment.id, kind: 'Other', amount: 5, currency: 'USD' }), /another company|403/, 'BTW active: cannot add an expense to a Nihna trip');
api.entities.setActive(null);
// agreed transport price after loading (A-04): the Kivu truck was loaded without one
const missing = trips.find((x) => x.agreedRecorded === false && !x.shipment.fromWarehouseId)!;
ok(!!missing && missing.transport === 0, `${missing?.shipment.ref}: agreed price not recorded yet`);
const ap = await api.finance.setAgreedPrice(missing.shipment.id, { amount: 2_400_000, currency: 'TZS' });
ok(ap.kind === 'Transport' && ap.currency === 'TZS' && (ap.amountUsd ?? 0) > 0, 'Testfie records the agreed price after loading (Transport cost, USD at the month rate)');
ok((await api.finance.trips()).find((x) => x.shipment.id === missing.shipment.id)!.agreedRecorded === true, 'the trip now counts as recorded');
ok(new Set((await api.shipments.list()).map((s) => s.entityId)).size === 3, 'follows every truck of every company');
ok((await api.loading.waiting()).some((w) => w.loadingPointId === 's-kbl') && (await api.loading.waiting()).some((w) => w.loadingPointId === 's-ubl'), 'sees every loading queue');
ok((await api.loading.list('s-kbl')).every((l) => !!l.poRef), 'loadings carry their PO ref');
await rejects((async () => api.reports.finance())(), /role|403/, 'finance report (sales margins) not available');
ok(!!(await api.reports.logistics()), 'logistics report available');
await rejects(api.masterdata.saveProvider(null, { name: 'Nope Sacco', kind: 'sacco' }), /Kabonge|403/, 'transport master data is view-only for Testfie');

// onboarding: Kabonge (static data) adds provider → truck → driver with app login
await api.auth.login('u-kabonge', '');
const sacco = await api.masterdata.saveProvider(null, { name: 'Mlolongo Haulage Sacco', kind: 'sacco', phone: '0722 000 111', contactName: 'J. Mwangi', email: 'info@mlolongo.example', notes: 'QA sacco' });
ok(sacco.kind === 'sacco' && sacco.phone === '+254722000111' && sacco.regular && sacco.active, 'adds a sacco (phone normalised, regular, active)');
await rejects(api.masterdata.saveProvider(null, { name: 'mlolongo haulage sacco', kind: 'company' }), /already registered/, 'duplicate provider name refused');
const drv = await api.masterdata.saveDriver(null, { providerId: sacco.id, name: 'Juma Said', phone: '0733 111 222', licence: 'DL-KE-1', hasApp: true, appLogin: true });
ok(drv.phone === '+254733111222' && drv.login?.pin === '1234' && !!drv.login.userId, 'new driver with the app gets a field-app login (demo PIN)');
ok(api.auth.demoUsers().some((u) => u.phone === '+254733111222' && u.roles.join() === 'driver'), 'the driver can now sign in to the field app');
await rejects(api.masterdata.saveDriver(null, { providerId: sacco.id, name: 'Other', phone: '+254733111222' }), /already uses/, 'duplicate driver phone refused');
await rejects(api.masterdata.saveDriver(null, { providerId: sacco.id, name: 'Bad', phone: '12345' }), /Phone/, 'bad driver phone refused');
const trk = await api.masterdata.saveTruck(null, { providerId: sacco.id, reg: 'kdc 777m', trailer: 'zh 1', capacityCases: 1900, defaultDriverId: drv.id });
ok(trk.reg === 'KDC 777M' && trk.trailer === 'ZH 1' && trk.active, 'adds a truck (registration upper-cased)');
await rejects(api.masterdata.saveTruck(null, { providerId: sacco.id, reg: 'KDC777M', capacityCases: 1000 }), /already registered/, 'duplicate registration refused');
const ed = await api.masterdata.saveTruck(trk.id, { capacityCases: 2100 });
ok(ed.capacityCases === 2100 && ed.reg === 'KDC 777M', 'edits a truck');
ok(api.ref().trucks.some((t) => t.id === trk.id) && api.lookup.provider(sacco.id)?.name === 'Mlolongo Haulage Sacco', 'new provider and truck appear in reference data');

// queue: add, reorder (up/down and to a position), remove with a reason → loader notified
const e = await api.loading.addWaiting('s-kbl', trk.id, drv.id);
let q = await api.loading.waiting('s-kbl');
ok(q.at(-1)!.id === e.id, 'new truck joins the end of the KBL queue');
await rejects(api.loading.addWaiting('s-kbl', trk.id, drv.id), /already in a waiting list/, 'the same truck cannot queue twice');
await api.queue.moveTo(e.id, 1);
q = await api.loading.waiting('s-kbl');
ok(q[0].id === e.id && q.map((w) => w.position).join() === q.map((_, i) => i + 1).join(), 'moved to the front; positions renumbered');
await api.queue.move(e.id, 1);
q = await api.loading.waiting('s-kbl');
ok(q[1].id === e.id, 'moved down one place');
await rejects(api.masterdata.saveTruck(trk.id, { active: false }), /queue/, 'a queued truck cannot be deactivated');
await api.auth.login('u-joel', '');
const note = (await api.notifications.list()).find((n) => n.title === 'Loading queue changed');
ok(!!note && /KDC 777M moved/.test(note.body), 'the KBL loader is notified of the new order');
await api.auth.login('u-testfie', '');
await api.queue.moveTo(e.id, 1);
ok((await api.loading.waiting('s-kbl'))[0].id === e.id, 'Testfie also reorders the KBL queue (Q11: both, to confirm)');
await api.queue.remove(e.id, 'Breakdown');
q = await api.loading.waiting('s-kbl');
ok(!q.some((w) => w.id === e.id), 'removed from the queue');
await api.auth.login('u-joel', '');
ok((await api.notifications.list()).some((n) => n.title === 'Truck removed from the queue' && /Breakdown/.test(n.body)), 'the loader sees why it was removed');
await api.auth.login('u-kabonge', '');
const off = await api.masterdata.saveTruck(trk.id, { active: false });
ok(off.active === false, 'deactivates the truck');
await rejects(api.loading.addWaiting('s-kbl', trk.id, drv.id), /deactivated/, 'a deactivated truck cannot be queued');
const pOff = await api.masterdata.saveProvider(sacco.id, { active: false });
ok(pOff.active === false && pOff.name === 'Mlolongo Haulage Sacco', 'deactivates the provider (kept for history)');

// ---- other roles ----------------------------------------------------------------------------------------
await api.auth.login('u-asie', '');
await rejects(api.masterdata.saveProvider(null, { name: 'Nope', kind: 'company' }), /Kabonge|403/, 'receivers cannot onboard providers');
await rejects(api.queue.moveTo(q[0].id, 2), /loading point|not found|403|404/, 'receivers cannot reorder a queue');
await api.auth.login('u-testfie', '');
await rejects(api.masterdata.saveTruck(null, { providerId: 'pr-ets', reg: 'KAA 1A', capacityCases: 10 }), /Kabonge|403/, 'Testfie cannot add trucks (view only)');
await api.auth.login('u-daniel', '');
ok(!!(await api.masterdata.saveDriver(null, { providerId: 'pr-joly', name: 'Director Added', phone: '+254744000001' })), 'directors add drivers too');
await rejects(api.queue.moveTo(q[0].id, 2), /403|change the waiting list/, 'directors view queues but do not reorder them (§7 Loading = View)');
await api.auth.login('u-testfie', '');

// ---- truck desk ---------------------------------------------------------------------------------------------
const r = api.ref();
const rows = sortDesk(truckDesk({ trucks: r.trucks, providers: r.providers, drivers: r.drivers, waiting: await api.loading.waiting(), shipments: await api.shipments.list(), checkpoints: r.checkpoints, suppliers: r.suppliers, stopsOf: (id) => r.routes.find((x) => x.id === id)?.stops ?? [] }));
const by = (reg: string) => rows.find((x) => x.truck.reg === reg)!;
ok(by('UBA 789C').state === 'Delayed' && by('UBA 789C').issues.length === 1, 'UBA 789C (border, clearing issue) is delayed with its open issue');
ok(by('KCX 220D').state === 'Waiting' && by('KCX 220D').queuePosition === 2 && (by('KCX 220D').waitingHours ?? 0) > 0, 'KCX 220D waits at KBL (#2) with its wait time');
ok(['In transit', 'Delayed'].includes(by('RAE 551F').state) && by('RAE 551F').position?.source === 'gps' && !!by('RAE 551F').eta, 'RAE 551F on the road (Gisenyi → Goma), located by GPS, with an ETA');
ok(by('T 733 DKL').state === 'At border' && /Rusumo/.test(by('T 733 DKL').where), 'T 733 DKL at the Rusumo border');
ok(by('SSD 410K').state === 'Waiting', 'a truck back in a queue after delivering counts as waiting');
ok(by('KDA 101S').state === 'Idle', 'the sacco truck with no trips is idle');
ok(rows[0].state === 'Delayed', 'desk sorted most urgent first');
const allTrips = await api.finance.trips();
const k = deskKpis(rows, allTrips);
ok(k.inQueue >= 4 && k.delayed >= 1 && k.openIssues >= 1 && k.avgWaitHours > 0 && k.owed > 0, `KPIs: ${k.inQueue} in queue, ${k.onRoad} on the road, ${k.delayed} delayed, owed USD ${k.owed}`);
ok(k.agreedMissing === 0, 'no trip left without an agreed price after Testfie recorded it');
const pc = costsByProvider(allTrips, r.trucks, r.providers);
const ets = pc.find((x) => x.id === 'pr-ets')!;
ok(ets && ets.trips > 0 && Math.abs(ets.balance - (ets.agreed - ets.paid)) < 0.01 && ets.perCase > 0, `ETS Sabrina: ${ets.trips} trips, agreed ${ets.agreed}, paid ${ets.paid}, balance ${ets.balance}, ${ets.perCase}/case`);
const ct = costsByTruck(allTrips, r.trucks);
ok(Math.abs(ct.reduce((a, x) => a + x.agreed, 0) - pc.reduce((a, x) => a + x.agreed, 0)) < 0.01, 'per-truck and per-provider totals agree');

console.log(failed ? `\n${failed} truck planner check(s) FAILED` : '\nall truck planner checks passed');
if (failed) process.exitCode = 1;
