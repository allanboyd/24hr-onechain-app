import * as api from '../src/index';
const ok = (c: any, m: string) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
await api.auth.login('u-kabonge', '');
// docs/09 §4: no drafts — "Create purchase order" with its lines. Approvals on (config.toml approvals.purchase_orders = true):
// the PO starts awaiting approval and a director approves it.
api.demo.setConfig({ approvals: { purchaseOrders: true } });
let po = await api.pos.create({ entityId: 'e-kivu', supplierId: 's-sbl', title: 'Test order', lines: [{ ...api.pos.newLine('s-sbl', 1), qty: 1800, routeId: 'r-mwz-kgl' }] });
ok(po.ref.startsWith('KVD-PO-'), 'ref auto-numbered ' + po.ref);
ok(po.status === 'Awaiting approval' && po.stage === 'Awaiting approval', 'approvals on: created awaiting approval');
await api.auth.login('u-daniel', '');
po = await api.pos.decide(po.id, 'approved', '', 'sig');
ok(po.status === 'Issued', 'approved → PO issued ' + po.ref);
api.demo.setConfig({ approvals: { purchaseOrders: false } });
await api.auth.login('u-kabonge', '');
let locked = false; try { await api.pos.update(po.id, { title: 'Test order', lines: [], reason: '' }); } catch { locked = true; } ok(locked, 'an update needs a reason');
const p = { ref: po.ref, poId: po.id };
// the loader at SBL records the loading (directors only view loadings, §7)
await api.auth.login('u-sbl-loader', '');
const ld = (await api.loading.list('s-sbl')).find((l) => l.poId === p.poId)!;
ok(ld && !('agreedTransport' in ld), 'loader sees the truck to load without the agreed transport price');
let cap = false; try { await api.loading.confirm(ld.id, { truckId: 't6', driverId: 'd6', loadedQty: { [ld.lines[0].planLineId]: 1900 }, agreedTransport: 900, documents: [] }); } catch (e) { cap = /capacity/.test((e as Error).message); }
ok(cap, 'truck capacity enforced (1800 max)');
const sh = await api.loading.confirm(ld.id, { truckId: 't6', driverId: 'd6', loadedQty: { [ld.lines[0].planLineId]: 1780 }, agreedTransport: 900, documents: ['dn.jpg'] });
ok(sh.legs[0].lines[0].loadedQty === 1780, 'shipment created with loaded qty');
ok(api.lookup.poRef(sh.poId) === `${p.ref}-rev001`, 'loaded 1,780 of 1,800 → PO revised automatically to ' + api.lookup.poRef(sh.poId));
const leg = sh.legs[0];
// the receiver sees Gisenyi stock; the truck follow-up officer follows the trip
await api.auth.login('u-asie', '');
const before = (await api.inventory.stock()).find((r) => r.warehouseId === 'w-kgl' && r.productId === 'p-e330')!;
await api.auth.login('u-testfie', '');
await api.shipments.pass(leg.id, 'cp-sbl', 'departed');
for (const cp of ['cp-nyakanazi', 'cp-rusumo', 'cp-kayonza', 'cp-kigali']) { await api.shipments.pass(leg.id, cp, 'arrived', 'geofence'); await api.shipments.pass(leg.id, cp, 'departed', 'geofence'); }
await api.shipments.pass(leg.id, 'cp-gisenyi-wh', 'arrived');
let s2 = (await api.shipments.get(sh.id))!;
ok(s2.legs[0].status === 'Arrived', 'leg arrived at destination');
ok(['Early','On time','Late'].includes(api.shipments.eta(s2.legs[0]).state), 'ETA state ' + api.shipments.eta(s2.legs[0]).state);
await api.auth.login('u-asie', '');
const mid = (await api.inventory.stock()).find((r) => r.warehouseId === 'w-kgl' && r.productId === 'p-e330')!;
ok(mid.received === before.received, 'no stock posted before acknowledgement (AK-05)');
await api.shipments.acknowledge(leg.id, { receiverName: 'Test', lines: [{ productId: 'p-e330', expected: 1780, received: 1770, damaged: 4 }] });
const after = (await api.inventory.stock()).find((r) => r.warehouseId === 'w-kgl' && r.productId === 'p-e330')!;
ok(after.received - before.received === 1770 && after.damaged - before.damaged === 4, 'stock posted on ack: +1770 received, 4 damaged');
s2 = (await api.shipments.get(sh.id))!; ok(s2.status === 'Acknowledged', 'shipment status derived = Acknowledged');
await api.auth.login('u-daniel', ''); api.entities.setActive('e-kivu');
const n = await api.notifications.list(); ok(n.some((x) => x.title === 'Delivery discrepancy' && x.body.includes(s2.ref)), 'discrepancy alert raised');
let blocked = false; try { await api.sales.create({ at: new Date().toISOString(), warehouseId: 'w-kgl', customer: 'X', salespersonId: 'u-asie', kind: 'Cash', lines: [{ productId: 'p-e330', qty: 999999, price: 1 }], currency: 'USD', paid: 0 }); } catch { blocked = true; }
ok(blocked, 'sale above stock blocked (SL-02)');
const v = await api.analytics.velocity(); ok(v.length > 0 && v.every((r) => ['Fast','Normal','Slow','Stagnant'].includes(r.cls)), `velocity rows ${v.length}`);
let t = (await api.finance.trips()).find((x) => x.shipment.id === sh.id)!;
ok(t.transport === 0 && t.agreedRecorded === false, 'loaded without a price: agreed transport "not recorded yet"');
await api.auth.login('u-testfie', ''); api.entities.setActive('e-kivu');
await api.finance.setAgreedPrice(sh.id, { amount: 900, currency: 'USD' });
await api.auth.login('u-daniel', ''); api.entities.setActive('e-kivu');
t = (await api.finance.trips()).find((x) => x.shipment.id === sh.id)!; ok(t.transport === 900 && t.agreedRecorded && t.landing > t.goods, 'agreed price recorded after loading; landing cost = goods + expenses');
api.entities.setActive(null);
await api.auth.login('u-testfie', '');

// ---- doc 08 §2: onward move = a NEW shipment from the warehouse where the goods were received -------------------
const stockAs = async (who: string) => { const back = api.auth.me()!.id; await api.auth.login(who, ''); const r = await api.inventory.stock(); await api.auth.login(back, ''); return r; };
const st0 = (await stockAs('u-asie')).filter((r) => r.entityId === sh.entityId && r.productId === 'p-e330');
const gis0 = st0.find((r) => r.warehouseId === 'w-kgl')!.closing, goma0 = st0.find((r) => r.warehouseId === 'w-goma')?.closing ?? 0;
let early = false; try { await api.shipments.sendOn(sh.id, { routeId: 'r-nbo-kgl', truckId: 't8', driverId: 'd5' }); } catch { early = true; }
ok(early, 'send-on must start at the warehouse where the goods were received');
const nx = await api.shipments.sendOn(sh.id, { routeId: 'r-kgl-goma', truckId: 't8', driverId: 'd5', lines: [{ productId: 'p-e330', loadedQty: 500 }] });
ok(nx.id !== sh.id && nx.parentShipmentId === sh.id && nx.originShipmentId === sh.id && nx.fromWarehouseId === 'w-kgl' && nx.warehouseId === 'w-goma' && nx.ref !== sh.ref, `send-on = new shipment ${nx.ref} linked to ${sh.ref}`);
const gis1 = (await stockAs('u-asie')).find((r) => r.entityId === sh.entityId && r.warehouseId === 'w-kgl' && r.productId === 'p-e330')!.closing;
ok(gis0 - gis1 === 500, 'stock leaves Gisenyi on dispatch (transferOut 500)');
let over = false; try { await api.shipments.sendOn(sh.id, { routeId: 'r-kgl-goma', truckId: 't7', driverId: 'd7', lines: [{ productId: 'p-e330', loadedQty: 999999 }] }); } catch { over = true; }
ok(over, 'send-on above stock blocked');
const nl = nx.legs[0];
for (const cp of ['cp-gisenyi']) { await api.shipments.pass(nl.id, cp, 'arrived', 'geofence'); await api.shipments.pass(nl.id, cp, 'departed', 'geofence'); }
await api.shipments.pass(nl.id, 'cp-goma', 'arrived');
await api.auth.login('u-asie', '');
await api.shipments.acknowledge(nl.id, { receiverName: 'Goma', lines: [{ productId: 'p-e330', expected: 500, received: 498, damaged: 1 }] });
const goma1 = (await api.inventory.stock()).find((r) => r.entityId === sh.entityId && r.warehouseId === 'w-goma' && r.productId === 'p-e330')!;
ok(goma1.closing - goma0 === 497 && goma1.transfersIn >= 498, 'stock posts into Goma on acknowledgement (transferIn 498, 1 damaged)');
const jr = await api.shipments.journey(nx.id);
ok(jr.length === 2 && jr[0].shipmentId === sh.id && jr[1].shipmentId === nx.id && jr[0].received === 1770 && jr[1].loaded === 500 && jr[1].received === 498, 'journey: origin → onward, loaded vs received per shipment');
const seeded = (await api.shipments.list()).find((x) => x.parentShipmentId && x.fromWarehouseId === 'w-kgl' && x.warehouseId === 'w-goma');
ok(!!seeded, 'demo data: Nairobi → Gisenyi then a new shipment Gisenyi → Goma');

// ---- doc 08 §3: flexible warehouses (admin/director) and a route ending there ----------------------------------
await api.auth.login('u-daniel', '');
let bad = false; try { await api.masterdata.addWarehouse({ name: '', country: 'Congo', town: 'Bukavu', receivingCompanyId: 'rc-asie', lat: 0, lng: 0 }); } catch { bad = true; }
ok(bad, 'warehouse form validated (name required)');
const bk = await api.masterdata.addWarehouse({ name: 'Asie Bukavu', country: 'Congo', town: 'Bukavu', receivingCompanyId: 'rc-asie', lat: -2.5083, lng: 28.8608, radiusM: 400 });
const bkCp = api.ref().checkpoints.find((c) => c.id === bk.checkpointId);
ok(api.ref().warehouses.some((w) => w.id === bk.id) && bkCp?.kind === 'warehouse' && bkCp.country === 'CD' && bkCp.radiusM === 400, 'new warehouse + its geofence checkpoint appear in master data');
const rt = await api.masterdata.addRoute({ name: 'Goma → Bukavu', stops: [{ checkpointId: 'cp-goma', plannedHours: 0, plannedDwellHours: 0 }, { checkpointId: bk.checkpointId, plannedHours: 6, plannedDwellHours: 0 }] });
await api.auth.login('u-testfie', '');
const nx2 = await api.shipments.sendOn(nx.id, { routeId: rt.id, truckId: 't7', driverId: 'd7', lines: [{ productId: 'p-e330', loadedQty: 100 }] });
ok(nx2.warehouseId === bk.id && nx2.originShipmentId === sh.id && (await api.shipments.journey(nx2.id)).length === 3, 'new route ends at the new warehouse; journey has three shipments');
await api.auth.login('u-daniel', '');
await api.masterdata.updateWarehouse(bk.id, { active: false });
ok(api.ref().warehouses.find((w) => w.id === bk.id)?.active === false, 'warehouse deactivated');
let inactive = false; try { await api.shipments.sendOn(nx.id, { routeId: rt.id, truckId: 't7', driverId: 'd7', lines: [{ productId: 'p-e330', loadedQty: 1 }] }); } catch (e) { inactive = /not active/.test((e as Error).message); }
await api.auth.login('u-testfie', '');
let inactive2 = false; try { await api.shipments.sendOn(nx.id, { routeId: rt.id, truckId: 't7', driverId: 'd7', lines: [{ productId: 'p-e330', loadedQty: 1 }] }); } catch (e) { inactive2 = /not active/.test((e as Error).message); }
ok(inactive || inactive2, 'cannot send goods to an inactive warehouse');

// ---- companies (tenants): active company, scoping, write checks, group --------------------------------------
const forbidden = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch (e) { return [403, 404, 422].includes((e as { status?: number }).status ?? 0) || /another company|Choose a company/.test((e as Error).message); } };
await api.auth.login('u-joel', '');
const me = api.auth.me()!;
ok(JSON.stringify(me.allowedEntityIds) === '["e-btw"]' && !me.canGroup && api.entities.active() === 'e-btw', 'BTW loader: one company, active by default, no group');
ok((await api.plans.list()).every((x) => x.entityId === 'e-btw' && x.supplierId === 's-kbl') && (await api.shipments.list()).every((x) => x.entityId === 'e-btw'), 'BTW loader sees only BTW (KBL) orders and shipments');
ok((await api.inventory.stock()).length === 0 && (await api.sales.list()).length === 0, 'loader sees no stock and no sales');
ok(await forbidden(async () => api.configure({ entityId: 'e-nud' })), 'cannot switch to a company outside the allowed set');
ok(await forbidden(() => api.pos.create({ entityId: 'e-btw', supplierId: 's-kbl', title: 'x', lines: [{ ...api.pos.newLine('s-kbl', 1), qty: 100 }] })), 'a loader cannot create a purchase order');
ok(await forbidden(() => api.reports.group()), 'group report is for directors');
ok(await forbidden(() => api.reports.sales({ entityId: 'e-kivu' })), 'report filter outside scope refused');
ok((await api.entities.list()).length === 1, 'entities.list = allowed companies only');
await api.auth.login('u-daniel', '');
ok(api.auth.me()!.canGroup && api.entities.active() === null, 'director starts in Group');
const all = await api.shipments.list();
ok(new Set(all.map((x) => x.entityId)).size === 3, 'Group lists all three companies');
const kv = all.find((x) => x.entityId === 'e-kivu')!;
ok(await forbidden(() => api.sales.create({ at: new Date().toISOString(), warehouseId: 'w-kgl', customer: 'X', salespersonId: 'u-daniel', kind: 'Cash', lines: [{ productId: 'p-c200', qty: 1, price: 1 }], currency: 'USD', paid: 0 })), 'Group: a new record must name its company');
api.entities.setActive('e-nud');
ok((await api.shipments.list()).every((x) => x.entityId === 'e-nud') && (await api.shipments.get(kv.id)) === null, 'NUD active: Kivu shipment hidden');
const ents = await (api.configure({ entityId: null }), api.entities.list());
ok(ents.length === 3 && ents.every((e) => e.shortName && e.colors.primary && e.kraPin.includes('to confirm') && e.letterhead.header), 'company records carry contact/brand/legal fields');
const gr = await api.reports.group({ ...api.reports.resolvePeriod('last-30', Date.now()) });
const sumRev = Object.values(gr.byEntity).reduce((a, k) => a + k.revenue, 0);
ok(Math.abs(sumRev - gr.lessIntercompany.revenue - gr.total.revenue) < 0.05 && gr.lessIntercompany.sales >= 1, `group report consolidates (less intercompany ${gr.lessIntercompany.revenue})`);
api.entities.setActive('e-kivu');
const trips = await api.finance.trips();
ok(trips.length > 0 && trips.every((x) => x.shipment.entityId === 'e-kivu'), 'Kivu active: only Kivu trips');
const btwTrip = all.find((x) => x.entityId === 'e-btw')!;
ok(await forbidden(() => api.finance.addCost({ entityId: 'e-btw', shipmentId: btwTrip.id, kind: 'Other', amount: 1, currency: 'USD' })), 'cannot post a cost on another company\'s trip');
