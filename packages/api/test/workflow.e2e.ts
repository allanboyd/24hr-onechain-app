import * as api from '../src/index';
const ok = (c: any, m: string) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
await api.auth.login('u-kabonge', '');
let p = await api.plans.create('e-kivu', 's-sbl');
ok(p.ref.startsWith('KVD-PO-'), 'ref auto-numbered ' + p.ref);
p.title = 'Test order'; p.lines = [ { ...api.plans.newLine(p, 1), qty: 1800, routeId: 'r-mwz-kgl' } ];
p = await api.plans.save(p); p = await api.plans.submit(p.id);
await api.auth.login('u-dir', '');
p = await api.plans.decide(p.id, 'approved', '', 'sig');
ok(p.status === 'Approved' && p.poId, 'approved → PO ' + p.poId);
let locked = false; try { await api.plans.save(p); } catch { locked = true; } ok(locked, 'approved plan locked');
const ld = (await api.loading.list('s-sbl')).find((l) => l.poId === p.poId)!;
let cap = false; try { await api.loading.confirm(ld.id, { truckId: 't6', driverId: 'd6', loadedQty: { [ld.lines[0].planLineId]: 1900 }, agreedTransport: 900, documents: [] }); } catch (e) { cap = /capacity/.test((e as Error).message); }
ok(cap, 'truck capacity enforced (1800 max)');
const sh = await api.loading.confirm(ld.id, { truckId: 't6', driverId: 'd6', loadedQty: { [ld.lines[0].planLineId]: 1780 }, agreedTransport: 900, documents: ['dn.jpg'] });
ok(sh.legs[0].lines[0].loadedQty === 1780, 'shipment created with loaded qty');
const leg = sh.legs[0];
const before = (await api.inventory.stock()).find((r) => r.warehouseId === 'w-kgl' && r.productId === 'p-e330')!;
await api.shipments.pass(leg.id, 'cp-sbl', 'departed');
for (const cp of ['cp-nyakanazi', 'cp-rusumo', 'cp-kayonza']) { await api.shipments.pass(leg.id, cp, 'arrived', 'geofence'); await api.shipments.pass(leg.id, cp, 'departed', 'geofence'); }
await api.shipments.pass(leg.id, 'cp-kigali', 'arrived');
let s2 = (await api.shipments.get(sh.id))!;
ok(s2.legs[0].status === 'Arrived', 'leg arrived at destination');
ok(['Early','On time','Late'].includes(api.shipments.eta(s2.legs[0]).state), 'ETA state ' + api.shipments.eta(s2.legs[0]).state);
const mid = (await api.inventory.stock()).find((r) => r.warehouseId === 'w-kgl' && r.productId === 'p-e330')!;
ok(mid.received === before.received, 'no stock posted before acknowledgement (AK-05)');
await api.shipments.acknowledge(leg.id, { receiverName: 'Test', lines: [{ productId: 'p-e330', expected: 1780, received: 1770, damaged: 4 }] });
const after = (await api.inventory.stock()).find((r) => r.warehouseId === 'w-kgl' && r.productId === 'p-e330')!;
ok(after.received - before.received === 1770 && after.damaged - before.damaged === 4, 'stock posted on ack: +1770 received, 4 damaged');
s2 = (await api.shipments.get(sh.id))!; ok(s2.status === 'Acknowledged', 'shipment status derived = Acknowledged');
const n = await api.notifications.list(); ok(n.some((x) => x.title === 'Delivery discrepancy' && x.body.includes(s2.ref)), 'discrepancy alert raised');
let blocked = false; try { await api.sales.create({ at: new Date().toISOString(), warehouseId: 'w-kgl', customer: 'X', salespersonId: 'u-asie', kind: 'Cash', lines: [{ productId: 'p-e330', qty: 999999, price: 1 }], currency: 'USD', paid: 0 }); } catch { blocked = true; }
ok(blocked, 'sale above stock blocked (SL-02)');
const v = await api.analytics.velocity(); ok(v.length > 0 && v.every((r) => ['Fast','Normal','Slow','Stagnant'].includes(r.cls)), `velocity rows ${v.length}`);
const t = (await api.finance.trips()).find((x) => x.shipment.id === sh.id)!; ok(t.transport === 900 && t.landing > t.goods, 'landing cost = goods + expenses');
