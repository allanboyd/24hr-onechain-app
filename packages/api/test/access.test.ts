// docs/12 against the in-browser mock: the roster, the §7 access matrix (person × feature), price hiding, the agreed
// price recorded after loading, static-data editing and the audit search. Same rules as the API (src/access.ts).
import * as api from '../src/index';
import { featuresFor } from '../src/rules';
import { canEditQueue, canRecordLoading, orderAccess, seesPair, seesPrices } from '../src/access';
import { validateEntity, validateProduct, validateSupplier, MASTER_LIMITS } from '../src/static-data';

let failed = 0;
const ok = (c: unknown, m: string) => { if (!c) { failed++; console.log('FAIL', m); } else console.log('ok  ', m); };
const rejects = async (p: Promise<unknown>, re: RegExp, m: string) => {
  try { await p; ok(false, `${m} (no error)`); } catch (e) { const msg = `${(e as Error).message} ${(e as { status?: number }).status ?? ''}`; ok(re.test(msg), `${m} → ${msg.trim()}`); }
};
const as = async (id: string) => { await api.auth.login(id, ''); api.entities.setActive(null); };

// ---- roster ------------------------------------------------------------------------------------------------------
api.demo.reset();
const ids = api.auth.demoUsers().map((u) => u.id);
ok(['u-daniel', 'u-michael', 'u-kabonge', 'u-testfie', 'u-joel', 'u-eric', 'u-moses', 'u-sbl-loader', 'u-asie', 'u-yonas', 'u-drv1', 'u-drv2', 'u-drv3'].every((x) => ids.includes(x)), 'roster: directors, Kabonge, Testfie, loaders, receivers, drivers');
ok(!['u-dir', 'u-btw-plan', 'u-nud-plan', 'u-kvd-plan', 'u-acc', 'u-btw-acc', 'u-admin', 'u-btw-trucks', 'u-trucks', 'u-tesfie', 'u-zonas'].some((x) => ids.includes(x)), 'made-up demo users retired');
ok(api.ref().receivingCompanies.map((r) => r.name).join() === 'Asie Company,Yonas Company' && api.ref().entities.map((e) => e.shortName).join() === 'BTW,Nihna,Kivu', 'receiving companies and display names');
ok(['r-kla-goma', 'r-msa-goma', 'r-mwz-goma'].every((id) => api.ref().routes.find((r) => r.id === id)?.stops.at(-1)?.checkpointId === 'cp-goma') && api.ref().routes.find((r) => r.id === 'r-nbo-goma')?.name === 'Nairobi → Congo (Goma)', 'routes to Congo from Uganda, Mombasa and Tanzania (via the Gisenyi/Goma border)');

// ---- pure access rules ---------------------------------------------------------------------------------------------
const kab = api.auth.demoUsers().find((u) => u.id === 'u-kabonge')!;
ok(seesPair(kab, 'e-btw', 's-kbl') && seesPair(kab, 'e-nud', 's-ubl') && seesPair(kab, 'e-kivu', 's-sbl') && !seesPair(kab, 'e-nud', 's-gbi'), 'Kabonge pairs: BTW–KBL, Nihna–UBL, Kivu–SBL — not Nihna–GBI');
ok(orderAccess(kab, { entityId: 'e-nud', supplierId: 's-gbi' }) === null && orderAccess(kab, { entityId: 'e-btw', supplierId: 's-kbl' }) === 'edit', 'orders: edit his pairs, nothing of Nihna–GBI');
ok(!seesPrices({ roles: ['loader'] }) && !seesPrices({ roles: ['receiver', 'reexport'] }) && !seesPrices({ roles: ['driver'] }) && seesPrices({ roles: ['truck_planner'] }), 'no prices for loaders, receivers, drivers');
ok(canRecordLoading({ roles: ['loader'], loadingPointIds: ['s-kbl'] }, 's-kbl') && !canRecordLoading({ roles: ['director'], loadingPointIds: [] }, 's-kbl'), 'directors view loadings; loaders record at their point');
ok(canEditQueue({ roles: ['planner'], loadingPointIds: [], pairs: kab.pairs }, 's-kbl') && !canEditQueue({ roles: ['planner'], loadingPointIds: [], pairs: kab.pairs }, 's-gbi') && !canEditQueue({ roles: ['director'], loadingPointIds: [] }, 's-kbl'), 'queue order: Kabonge on his pairs\' points, Testfie everywhere (to confirm); directors view');

// ---- §7 features per person (what /me.features says; the UI and API gate on the same keys) -------------------------------
const M: Record<string, string> = { // feature: daniel kabonge testfie joel moses asie yonas driver (F/O/V = has it, - = not)
  users: 'F-------', 'master-data.static': 'FF------', 'master-data.transport': 'FF------', 'master-data': 'FFVVVV--', 'period-plans': 'FO------',
  'purchase-orders': 'FOVVVVV-', loading: 'VVOOO---', logistics: 'VVFOOOV-', fleet: 'VVF--VV-', 'truck-expenses': 'F-F-----', inventory: 'F----OO-',
  'warehouse-expenses': 'F----OO-', sales: 'F-------', finance: 'F-------', reports: 'F-------', performance: 'F-------', audit: 'F-------',
};
const people = ['director', 'planner', 'truck_planner', 'loader', 'loader', ['receiver', 'reexport'], 'receiver', 'driver'] as const;
for (const [f, row] of Object.entries(M)) {
  const bad = people.map((r, i) => ({ i, has: featuresFor((Array.isArray(r) ? r : [r]) as never).includes(f as never), want: row[i] !== '-' })).filter((x) => x.has !== x.want);
  ok(!bad.length, `§7 ${f}: ${row}`);
}

// ---- prices hidden ---------------------------------------------------------------------------------------------------
await as('u-joel');
const jp = await api.plans.list();
ok(jp.length > 0 && jp.every((p) => p.pricesHidden && p.lines.every((l) => l.price === undefined) && p.supplierId === 's-kbl'), 'Joel: KBL orders only, no prices');
ok(api.ref().priceList.length === 0 && (await api.loading.list()).every((l) => !('agreedTransport' in l)), 'Joel: no price list, no agreed transport price');
await as('u-yonas');
const yp = await api.plans.list();
ok(yp.length > 0 && yp.every((p) => p.pricesHidden && p.lines.every((l) => l.deliveredToId === 'rc-yonas')), 'Yonas: orders delivering to her, only her lines, no prices');
ok((await api.inventory.stock()).every((r) => r.warehouseId === 'w-juba' && r.landedCostPerCase === undefined), 'Yonas: Juba stock without landed cost');
await rejects(api.finance.trips(), /role|403/, 'Yonas: no trip money');

// ---- loading without a price → Testfie records it afterwards ------------------------------------------------------------------
await as('u-kabonge'); api.entities.setActive('e-btw');
const o0 = await api.pos.create({ entityId: 'e-btw', supplierId: 's-kbl', title: 'QA', lines: [{ ...api.pos.newLine('s-kbl', 1), qty: 1000, routeId: 'r-nbo-kgl' }] });
const o = { poId: o0.id };
await rejects(api.pos.create({ entityId: 'e-nud', supplierId: 's-gbi', title: 'QA', lines: [{ ...api.pos.newLine('s-gbi', 1), qty: 1000 }] }), /pairs|403/, 'Kabonge cannot raise a Nihna–GBI order');
await as('u-daniel');
const ld0 = (await api.loading.list('s-kbl')).find((l) => l.poId === o.poId)!;
await rejects(api.loading.confirm(ld0.id, { truckId: 't2', driverId: 'd3', loadedQty: {}, documents: [] }), /loaders|403/, 'a director views loadings but does not record them');
await as('u-joel');
const sh = await api.loading.confirm(ld0.id, { truckId: 't2', driverId: 'd3', loadedQty: {}, agreedTransport: 999, documents: ['dn.jpg'] });
await as('u-daniel');
let trip = (await api.finance.trips()).find((x) => x.shipment.id === sh.id)!;
ok(trip.agreedRecorded === false && trip.transport === 0, 'the loader\'s price is ignored: agreed price "not recorded yet"');
await as('u-joel');
await rejects(api.finance.setAgreedPrice(sh.id, { amount: 1500 }), /role|403/, 'the loader cannot record the agreed price');
await as('u-testfie');
await api.finance.setAgreedPrice(sh.id, { amount: 1650, currency: 'USD', docRef: 'agreed by phone' });
await as('u-daniel');
trip = (await api.finance.trips()).find((x) => x.shipment.id === sh.id)!;
ok(trip.agreedRecorded && trip.transport === 1650, 'Testfie records it after loading → the trip\'s Transport cost');

// ---- acknowledgement: receivers only ------------------------------------------------------------------------------------
await rejects(api.shipments.acknowledge(sh.legs[0].id, { receiverName: 'x', lines: [] }), /not coming|403/, 'a director cannot acknowledge (View)');
await as('u-testfie');
ok((await api.tracking.acks(api.ref().warehouses.length ? (await api.shipments.list()).find((s) => s.status === 'Acknowledged')!.id : '')).length === 0, 'Testfie sees no acknowledgement records (§7 —)');

// ---- static data -----------------------------------------------------------------------------------------------------------
ok(validateEntity({ code: 'BTW', name: 'x' }, api.ref().entities).some((e) => /already used/.test(e)) && validateSupplier({ code: 'NEW', name: 'N', city: 'c', country: 'Kenya' }, api.ref().suppliers).some((e) => /location/.test(e)) && validateProduct({ sku: 'X-1', brand: 'b', pack: 'p', unitsPerCase: 24, sizeMl: 330, supplierId: 's-kbl', category: 'soda' }, { products: [], supplierIds: ['s-kbl'] }).some((e) => /Category/.test(e)), 'static-data validators');
await rejects(api.masterdata.saveProduct(null, { sku: 'QA-9', brand: 'QA', pack: '24 x 500 ml', unitsPerCase: 24, sizeMl: 500, supplierId: 's-kbl' }), /Kabonge|403/, 'Testfie cannot edit goods');
await as('u-kabonge');
const ne = await api.masterdata.saveEntity(null, { code: 'QAC', name: 'QA Company Ltd' });
ok(ne.poPrefix === 'QAC-PO' && api.ref().entities.length === 4, 'Kabonge adds a company (4 of 5)');
await api.masterdata.saveEntity(null, { code: 'QAD', name: 'QA D Ltd' });
await rejects(api.masterdata.saveEntity(null, { code: 'QAE', name: 'QA E Ltd' }), new RegExp(`room for ${MASTER_LIMITS.entities}`), 'no room for a sixth company');
const np = await api.masterdata.saveProduct(null, { sku: 'qa-9', brand: 'QA Stout', pack: '24 x 500 ml', unitsPerCase: 24, sizeMl: 500, supplierId: 's-kbl', category: 'beer', price: 12 });
await api.masterdata.saveProduct(np.id, { pack: '12 x 500 ml', unitsPerCase: 12 });
ok(api.lookup.product(np.id)?.pack === '12 x 500 ml' && api.lookup.price(np.id) === 12, 'adds and edits goods with a price');
const rc = await api.masterdata.saveReceivingCompany(null, { name: 'QA Receivers', countries: ['Burundi'] });
await api.masterdata.saveReceivingCompany(rc.id, { active: false });
ok(api.ref().receivingCompanies.find((x) => x.id === rc.id)?.active === false, 'deactivates a receiving company');

// ---- audit search (directors) ----------------------------------------------------------------------------------------------
await rejects(api.audit.list(), /directors|403/, 'Kabonge cannot read the audit log');
await as('u-daniel');
const pg = await api.audit.list({ userId: 'u-kabonge', feature: 'masterdata', q: np.id });
ok(pg.total === 2 && pg.rows[0].method === 'PATCH' && (pg.rows[0].before as { pack?: string })?.pack === '24 x 500 ml' && (pg.rows[0].after as { pack?: string })?.pack === '12 x 500 ml', 'audit: Kabonge\'s product create + edit with before / after');
const all = await api.audit.list({ pageSize: 10 });
ok(all.rows.length === 10 && all.total > 100 && all.byDay.length > 10, `audit: ${all.total} rows (seeded history + this run), activity by day`);
ok((await api.audit.list({ q: 'agreed transport' })).rows.some((r) => r.userId === 'u-testfie'), 'audit: the agreed price Testfie recorded');

// ---- users: pairs, routes, last login --------------------------------------------------------------------------------------
const us = await api.users.list();
ok(us.find((u) => u.id === 'u-daniel')?.lastLoginAt && us.find((u) => u.id === 'u-kabonge')?.pairs?.length === 3, 'users list: last sign-in, pairs');
const up = await api.users.update('u-testfie', { routeIds: ['r-msa-juba', 'r-msa-goma'] });
ok(up.routeIds?.length === 2, 'routes assignable to a user (optional route scope)');
await as('u-testfie');
ok((await api.shipments.list()).every((s) => s.legs.some((l) => ['r-msa-juba', 'r-msa-goma'].includes(l.routeId))), 'route scope narrows Testfie\'s shipments');
await as('u-daniel'); await api.users.update('u-testfie', { routeIds: [] });

console.log(failed ? `\n${failed} access check(s) FAILED` : '\nall access checks passed');
if (failed) process.exitCode = 1;
