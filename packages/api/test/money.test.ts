// docs/14 workstream B — pure money math (landed cost v2 worked example, fee ageing, target margin, warehouse stock) and the
// in-browser mock end to end (warehouse expenses, stock counts, re-export Asie → Yonas, selling prices, performance, access).
import { landedCostV2, landedByTruck, performanceReport } from '../src/performance';
import * as M from '../src/money';
import type { Acknowledgement, Plan, PurchaseOrder, Shipment, TripCost } from '../src/types';

let fails = 0;
const ok = (c: unknown, m: string, detail?: unknown) => { if (!c) { fails++; console.log('FAIL', m, detail === undefined ? '' : JSON.stringify(detail)?.slice(0, 400)); } else console.log('ok  ', m); };
const near = (a: number | null | undefined, b: number, eps = 0.005) => a !== null && a !== undefined && Math.abs(a - b) <= eps;
const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 20, 12);
const iso = (ms: number) => new Date(ms).toISOString();

// ---- worked example (docs/14 §4) -------------------------------------------------------------------------------------
// One truck: 1,000 cases of A at $10 and 500 cases of B at $20 (goods $20,000). Truck costs $2,700 (transport 1,500,
// duties 900, clearing 300). Received at W: A 990 (10 short) with 5 damaged → 985 good; B 500, none damaged → 500 good.
// Warehouse expenses that month: $1,485 (rent 1,000 + offloading 485). Nothing else received there that month.
const plan: Plan = { id: 'pl', ref: 'PO-1', title: '', entityId: 'e', supplierId: 's', currency: 'USD', date: '2026-10-01', requiredBy: '2026-10-10', status: 'Approved', version: 1, history: [], createdById: 'u', poId: 'po',
  lines: [{ id: 'l1', truckNo: 1, productId: 'A', qty: 1000, price: 10, deliveredToId: 'rc', routeId: 'r' }, { id: 'l2', truckNo: 1, productId: 'B', qty: 500, price: 20, deliveredToId: 'rc', routeId: 'r' }] };
const po = { id: 'po', planId: 'pl' } as PurchaseOrder;
const ackAt = Date.UTC(2026, 9, 5, 10);
const sh: Shipment = { id: 'sh1', entityId: 'e', ref: 'SHP-1', poId: 'po', truckNo: 1, receivingCompanyId: 'rc', warehouseId: 'W', status: 'Acknowledged',
  legs: [{ id: 'g1', seq: 1, routeId: 'r', fromId: 'c0', toId: 'cW', truckId: 't1', driverId: 'd', status: 'Acknowledged', plannedArrival: iso(ackAt), passes: [], issues: [], ackId: 'a1', departedAt: iso(ackAt - 3 * DAY),
    lines: [{ productId: 'A', loadedQty: 1000 }, { productId: 'B', loadedQty: 500 }] }] };
const ack: Acknowledgement = { id: 'a1', entityId: 'e', legId: 'g1', shipmentId: 'sh1', warehouseId: 'W', receiverName: 'R', at: iso(ackAt), photos: [], hasDiscrepancy: true,
  lines: [{ productId: 'A', expected: 1000, received: 990, damaged: 5, reason: 'Breakage in transit' }, { productId: 'B', expected: 500, received: 500, damaged: 0 }] };
const costs: TripCost[] = [
  { id: 'c1', entityId: 'e', shipmentId: 'sh1', kind: 'Transport', amount: 1500, currency: 'USD', amountUsd: 1500 },
  { id: 'c2', entityId: 'e', shipmentId: 'sh1', kind: 'Taxes & duties', amount: 900, currency: 'USD', amountUsd: 900 },
  { id: 'c3', entityId: 'e', shipmentId: 'sh1', kind: 'Clearing & forwarding', amount: 300, currency: 'USD', amountUsd: 300 },
];
const expenses = [{ warehouseId: 'W', date: '2026-10-01', amountUsd: 1000 }, { warehouseId: 'W', date: '2026-10-05', amountUsd: 485 }, { warehouseId: 'W', date: '2026-09-15', amountUsd: 300 }];
const input = { shipments: [sh], acks: [ack], costs, plans: [plan], pos: [po], priceList: [], expenses };

const q = landedCostV2({ ...input, allocation: 'quantity' });
const A = q.lines.find((l) => l.productId === 'A')!, B = q.lines.find((l) => l.productId === 'B')!;
ok(A.good === 985 && A.short === 10 && A.damaged === 5 && B.good === 500, 'quantity received = received − damaged (short never received): A 985, B 500');
ok(A.goods === 10000 && B.goods === 10000, 'goods cost = cases loaded × PO price: A $10,000, B $10,000');
ok(A.truck === 1800 && B.truck === 900, 'truck cost $2,700 split by cases (1,000 : 500): A $1,800, B $900', [A.truck, B.truck]);
ok(near(A.warehouse, 985) && near(B.warehouse, 500), 'warehouse $1,485 over 1,485 good cases = $1/case: A $985, B $500', [A.warehouse, B.warehouse]);
ok(A.total === 12785 && near(A.perUnit, 12.9797, 1e-4), 'A landed $12,785 → $12.98 per case', [A.total, A.perUnit]);
ok(B.total === 11400 && near(B.perUnit, 22.8, 1e-4), 'B landed $11,400 → $22.80 per case', [B.total, B.perUnit]);
ok(q.unallocated.length === 1 && q.unallocated[0].month === '2026-09' && q.unallocated[0].amount === 300, 'September expenses with nothing received stay unallocated ($300)', q.unallocated);
const truck = landedByTruck(q.lines)[0];
ok(truck.total === 24185 && truck.good === 1485 && near(truck.perUnit, 16.2862, 1e-4), 'per truck: $24,185 over 1,485 good cases', truck);
const v = landedCostV2({ ...input, allocation: 'value' });
const Av = v.lines.find((l) => l.productId === 'A')!;
ok(Av.truck === 1350 && near(Av.warehouse, 742.5) && near(Av.perUnit, 12.2766, 1e-4), 'by value: truck $1,350 each, warehouse share $742.50, A $12.28 per case', Av);
// profit on a sale at the selling price, and the target-margin helper
ok(M.priceForMargin(12.9797, 0.2) === 16.22 && M.priceForMargin(0, 0.2) === null && M.priceForMargin(10, 1) === null, 'target margin 20 %: price needed = 12.98 ÷ (1 − 0.2) = $16.22');
const rep = performanceReport({
  now: NOW, sales: [{ id: 's1', entityId: 'e', ref: 'S1', at: iso(ackAt + 2 * DAY), warehouseId: 'W', customer: 'c', salespersonId: 'u', kind: 'Cash', lines: [{ productId: 'A', qty: 600, price: 15 }], currency: 'USD', paid: 9000, status: 'Paid' }],
  shipments: [sh], acks: [ack], costs, payments: [], plans: [plan], pos: [{ ...po, entityId: 'e' } as PurchaseOrder], loadings: [], moves: [],
  stock: [{ entityId: 'e', warehouseId: 'W', productId: 'A', opening: 0, received: 990, transfersIn: 0, transfersOut: 0, damaged: 5, adjustments: 0, sold: 600, closing: 385, inTransit: 0, landedCostPerCase: 0 }],
  products: [], priceList: [], warehouses: [{ id: 'W', name: 'W', receivingCompanyId: 'rc', checkpointId: 'cW', country: 'X', town: 'W' }], routes: [], checkpoints: [], suppliers: [], trucks: [], drivers: [], providers: [],
  entities: [{ id: 'e' } as never], expenses: expenses.map((e, i) => ({ ...e, id: `x${i}`, receivingCompanyId: 'rc', category: 'Rent', amount: e.amountUsd, currency: 'USD', fxRate: 1, byUserId: 'u', at: iso(NOW) })),
  sellingPrices: [{ id: 'sp', entityId: 'e', productId: 'A', warehouseId: null, price: 15, currency: 'USD', from: '2026-09-01', byUserId: 'u', at: iso(NOW) }],
}, { from: '2026-09-01T00:00:00Z', to: '2026-10-21T00:00:00Z', level: 'product', targetMargin: 0.2 });
const ra = rep.rows.find((r) => r.productId === 'A')!;
ok(ra.qtyReceived === 985 && ra.revenue === 9000 && near(ra.cogs, 7787.82, 0.01) && near(ra.profit, 1212.18, 0.01) && near(ra.margin, 0.1347, 1e-4), 'A: 600 sold at $15 → revenue $9,000, cost of units sold $7,787.82, profit $1,212.18, margin 13.47 %', ra);
ok(ra.sellingPrice === 15 && ra.priceForTarget === 16.22 && ra.stockOnHand === 385, 'A: selling price $15, price for 20 % = $16.22, 385 cases on hand', ra);
ok(rep.otherCosts === 300 && rep.waterfall[0].value === 9000 && near(rep.waterfall.at(-1)!.value, 912.18, 0.01), 'waterfall: revenue 9,000 → … → other −300 → profit $912.18', rep.waterfall);

// ---- fee ageing (B-04) ----------------------------------------------------------------------------------------------
const cfg = { amberDays: 14, redDays: 30 };
ok(M.feeStatus(null, 0) === 'Not recorded' && M.feeStatus(1000, 0) === 'Unpaid' && M.feeStatus(1000, 400) === 'Part paid' && M.feeStatus(1000, 1000) === 'Paid', 'fee status: not recorded / unpaid / part paid / paid');
ok(M.feeFlag('Unpaid', 13, cfg) === 'ok' && M.feeFlag('Unpaid', 14, cfg) === 'amber' && M.feeFlag('Part paid', 29, cfg) === 'amber' && M.feeFlag('Part paid', 30, cfg) === 'red' && M.feeFlag('Paid', 90, cfg) === 'ok' && M.feeFlag('Not recorded', 90, cfg) === 'none', 'fee flags: amber from 14 days, red from 30 days while unpaid');
const fr = M.feeRows({ shipments: [sh], costs, payments: [{ id: 'p1', entityId: 'e', shipmentId: 'sh1', costId: 'c1', amount: 500, at: iso(NOW), reference: 'MPESA X1', status: 'Paid', amountUsd: 500 }, { id: 'p2', entityId: 'e', shipmentId: 'sh1', costId: 'c1', amount: 600, at: iso(NOW), reference: 'TT-2', status: 'Pending approval', amountUsd: 600 }],
  loadedAt: () => iso(NOW - 20 * DAY), providerOf: () => 'pr', now: NOW, cfg: { fees: cfg } })[0];
ok(fr.status === 'Part paid' && fr.agreedUsd === 1500 && fr.paidUsd === 500 && fr.pendingUsd === 600 && fr.balanceUsd === 1000 && fr.flag === 'amber' && fr.ageDays === 20 && fr.references.includes('MPESA X1'), 'fee row: agreed 1,500, paid 500 (+600 waiting approval), 20 days → amber', fr);

// ---- selling prices, warehouse stock, ack reasons ------------------------------------------------------------------------
const sp = [{ entityId: 'e', productId: 'A', warehouseId: null, price: 14, from: '2026-08-01', at: iso(NOW) }, { entityId: 'e', productId: 'A', warehouseId: null, price: 15, from: '2026-10-01', at: iso(NOW) }, { entityId: 'e', productId: 'A', warehouseId: 'W2', price: 16.5, from: '2026-09-01', at: iso(NOW) }];
ok(M.sellingPriceFor(sp, 'e', 'W', 'A', '2026-09-15') === 14 && M.sellingPriceFor(sp, 'e', 'W', 'A', '2026-10-02') === 15 && M.sellingPriceFor(sp, 'e', 'W2', 'A', '2026-10-02') === 16.5 && M.sellingPriceFor(sp, 'e', 'W', 'A', '2026-07-01') === null, 'selling price: effective dates, warehouse price over the company-wide one');
const moves = [
  { entityId: 'e', warehouseId: 'W', productId: 'A', kind: 'received' as const, qty: 990, at: iso(ackAt), ref: 'SHP-1' }, { entityId: 'e', warehouseId: 'W', productId: 'A', kind: 'damaged' as const, qty: 5, at: iso(ackAt), ref: 'SHP-1' },
  { entityId: 'e', warehouseId: 'W', productId: 'A', kind: 'sold' as const, qty: 600, at: iso(ackAt + DAY), ref: 'S1' }, { entityId: 'e', warehouseId: 'W', productId: 'A', kind: 'transferOut' as const, qty: 100, at: iso(ackAt + DAY), ref: 'ASIE-RX-2026-0001' },
  { entityId: 'e', warehouseId: 'W', productId: 'A', kind: 'adjustment' as const, qty: -20, at: iso(ackAt + 2 * DAY), ref: 'ADJ', reason: 'Moved out', note: 'samples' },
  { entityId: 'e', warehouseId: 'W', productId: 'A', kind: 'adjustment' as const, qty: -3, at: iso(ackAt + 3 * DAY), ref: 'ADJ', reason: 'Count difference' },
];
const ws = M.warehouseStock(moves, [ack])[0];
ok(ws.received === 990 && ws.damaged === 5 && ws.short === 10 && ws.sold === 600 && ws.transfersOut === 100 && ws.movedOut === 20 && ws.adjusted === -3 && ws.held === 262 && ws.lastCountAt === iso(ackAt + 3 * DAY), 'warehouse stock: received, damaged, short, re-exported, moved out, count difference, held 262', ws);
ok(M.adjustmentMove({ kind: 'count', counted: 250 }, 262).qty === -12 && M.adjustmentMove({ kind: 'found', qty: 4 }, 0).qty === 4 && M.adjustmentMove({ kind: 'damaged', qty: 2 }, 0).kind === 'damaged', 'adjustments: a count posts the difference; found adds; damaged writes off');
ok(M.validateAdjust({ kind: 'moved-out', qty: 5 }).length === 1 && M.validateAdjust({ kind: 'count', counted: -1 }).length === 1 && M.validateAdjust({ kind: 'found', qty: 2 }).length === 0, 'adjustment form validated (moved out needs a note)');
ok(M.lossByReason([ack])[0].label === 'Breakage in transit' && M.lossByReason([ack])[0].value === 15 && M.validAckReason('Leakage') && !M.validAckReason('Aliens'), 'loss by reason (short + damaged), reason list enforced');
ok(M.nextReexportRef(['ASIE-RX-2026-0001', 'ASIE-RX-2025-0007'], 'Asie Company', 2026) === 'ASIE-RX-2026-0002', 're-export refs: ASIE-RX-2026-0002');
ok(M.validateExpense({ warehouseId: 'W', category: 'Rent', amount: 100, currency: 'USD', date: '2026-10-01' }, { warehouseIds: ['W'], now: NOW }).length === 0
  && M.validateExpense({ warehouseId: 'X', category: 'Fun' as never, amount: 0, date: '2027-01-01' }, { warehouseIds: ['W'], now: NOW }).length === 5, 'expense form validated (warehouse, category, amount, currency always explicit, date)');
const sum = M.expenseSummary([{ warehouseId: 'W', date: '2026-10-01', category: 'Rent', amountUsd: 1000 }, { warehouseId: 'W', date: '2026-10-05', category: 'Offloading', amountUsd: 485 }, { warehouseId: 'W', date: '2026-09-15', category: 'Salary', amountUsd: 300 }]);
ok(sum.total === 1785 && sum.byMonth.length === 2 && sum.byMonth[1].byCategory.Rent === 1000 && sum.byCategory[0].category === 'Offloading', 'expense summary: monthly totals by category');

// ======================================================================================================
// The in-browser mock end to end (same rules as the API)
// ======================================================================================================
const api = await import('../src/index');
const rejects = async (p: Promise<unknown>, re: RegExp, m: string) => {
  try { await p; ok(false, `${m} (no error)`); } catch (e) { const msg = `${(e as Error).message} ${(e as { status?: number }).status ?? ''}`; ok(re.test(msg), `${m} → ${msg.trim()}`); }
};
const as = async (id: string) => { await api.auth.login(id, ''); api.entities.setActive(null); };
api.demo.reset(); await api.ready();

// ---- seeded history -----------------------------------------------------------------------------------------------
await as('u-daniel');
const allX = await api.warehouse.expenses();
ok(['w-kgl', 'w-goma', 'w-juba'].every((w) => allX.some((x) => x.warehouseId === w)) && M.WAREHOUSE_EXPENSE_CATEGORIES.slice(0, 6).every((c) => allX.some((x) => x.category === c)), 'seed: 3 months of expenses at Gisenyi, Goma and Juba in every category', allX.length);
ok(allX.some((x) => x.currency === 'RWF' && x.amountUsd < x.amount) && allX.every((x) => x.amountUsd > 0 && x.fxRate > 0), 'seed: Gisenyi pays in RWF, converted to USD at the approved rate');
const months = M.expenseSummary(allX).months;
ok(months.length === 4, 'seed: three full months + this month', months);
const rxs = await api.reexports.list();
ok(rxs.length === 4 && rxs.filter((o) => o.status === 'Delivered').length === 2 && rxs.some((o) => o.status === 'In transit') && rxs.some((o) => o.status === 'Open') && rxs.every((o) => /^ASIE-RX-\d{4}-\d{4}$/.test(o.ref)), 'seed: re-exports — 2 delivered, 1 on the road, 1 waiting to load (ASIE-RX-…)', rxs.map((o) => [o.ref, o.status]));
const prices = await api.pricing.list();
ok(prices.length >= 12 && prices.some((p) => p.warehouseId === 'w-juba'), 'seed: selling prices with history and a Juba price', prices.length);
const allAcks = (await api.shipments.list()).length;
void allAcks;

// ---- B-01 expenses: access and recording --------------------------------------------------------------------------------
await as('u-asie');
const ax = await api.warehouse.expenses();
ok(ax.length > 0 && ax.every((x) => ['w-kgl', 'w-goma'].includes(x.warehouseId)), 'Asie sees the expenses of Gisenyi and Goma only');
await rejects(api.warehouse.expenses({ warehouseId: 'w-juba' }), /403/, 'Asie cannot read Juba expenses');
const today = new Date().toISOString().slice(0, 10);
const nx = await api.warehouse.addExpense({ warehouseId: 'w-kgl', date: today, category: 'Utilities', amount: 141800, currency: 'RWF', reference: 'REG-123', note: 'Water', receiptFileId: 'file-abc', receiptName: 'water.jpg' });
ok(nx.amountUsd > 90 && nx.amountUsd < 110 && nx.receipt?.id === 'file-abc' && nx.receivingCompanyId === 'rc-asie' && nx.byUserId === 'u-asie', 'Asie records an RWF expense with a receipt photo (USD at the month rate)', nx);
await rejects(api.warehouse.addExpense({ warehouseId: 'w-juba', date: today, category: 'Rent', amount: 10, currency: 'USD' }), /403/, 'Asie cannot record for Juba');
await rejects(api.warehouse.addExpense({ warehouseId: 'w-kgl', date: today, category: 'Party' as never, amount: -1 }), /422/, 'expense form validated');
const ed = await api.warehouse.updateExpense(nx.id, { amount: 150000 });
ok(ed.amount === 150000 && ed.category === 'Utilities', 'she corrects her own expense');
await as('u-yonas');
await rejects(api.warehouse.updateExpense(nx.id, { amount: 1 }), /404|403/, 'Yonas cannot touch a Gisenyi expense');
for (const who of ['u-testfie', 'u-kabonge', 'u-joel']) { await as(who); await rejects(api.warehouse.expenses(), /403/, `${who}: no warehouse expenses`); }
await as('u-daniel'); ok(await api.warehouse.deleteExpense(nx.id), 'a director removes an expense');

// ---- B-02 inventory recording (no values) --------------------------------------------------------------------------------
await as('u-yonas');
const ys = await api.warehouse.stock();
ok(ys.length > 0 && ys.every((r) => r.warehouseId === 'w-juba') && ys.every((r) => !('landedCostPerCase' in r) && !('value' in r)), 'Yonas: Juba stock, quantities only');
const a300 = ys.find((r) => r.productId === 'p-a300' && r.entityId === 'e-btw')!;
ok(a300 && a300.transfersIn > 0, 'Juba received re-exported Tusker cans (transfer in)', a300);
const cnt = await api.warehouse.adjust({ warehouseId: 'w-juba', productId: 'p-a300', entityId: 'e-btw', kind: 'count', counted: a300.held - 4, note: 'Month-end count' });
ok(cnt.qty === -4 && cnt.reason === 'Count difference', 'a count 4 cases under posts −4 (count difference)', cnt);
const after = (await api.warehouse.stock({ warehouseId: 'w-juba' })).find((r) => r.productId === 'p-a300' && r.entityId === 'e-btw')!;
ok(after.held === a300.held - 4 && !!after.lastCountAt, 'held stock follows the count; last count date shown');
await rejects(api.warehouse.adjust({ warehouseId: 'w-juba', productId: 'p-a300', entityId: 'e-btw', kind: 'moved-out', qty: 5 }), /422/, 'moved out needs a note');
await rejects(api.warehouse.adjust({ warehouseId: 'w-juba', productId: 'p-a300', entityId: 'e-btw', kind: 'damaged', qty: 1e6 - 1, note: 'x' }), /422/, 'cannot write off more than held');
await rejects(api.warehouse.adjust({ warehouseId: 'w-kgl', productId: 'p-a300', kind: 'found', qty: 1 }), /403/, 'Yonas cannot adjust Gisenyi');
const adjs = await api.warehouse.adjustments();
ok(adjs[0].reason === 'Count difference' && adjs.every((x) => x.warehouseId === 'w-juba'), 'adjustment history (newest first, own warehouse)');
await as('u-testfie'); await rejects(api.warehouse.stock(), /403/, 'Testfie: no warehouse inventory');

// ---- B-03 re-export Asie → Yonas end to end ------------------------------------------------------------------------------
await as('u-asie');
const g0 = (await api.warehouse.stock({ warehouseId: 'w-kgl' })).find((r) => r.productId === 'p-b500' && r.entityId === 'e-btw')!;
await rejects(api.reexports.create({ fromWarehouseId: 'w-kgl', entityId: 'e-btw', lines: [{ productId: 'p-b500', qty: g0.held + 1 }] }), /422/, 'cannot re-export more than held');
await rejects(api.reexports.create({ fromWarehouseId: 'w-juba', entityId: 'e-btw', lines: [{ productId: 'p-b500', qty: 1 }] }), /403/, 'not from a warehouse that is not hers');
const o = await api.reexports.create({ fromWarehouseId: 'w-kgl', entityId: 'e-btw', lines: [{ productId: 'p-b500', qty: 120 }], note: 'QA re-export' });
ok(o.status === 'Open' && o.toWarehouseId === 'w-juba' && o.routeId === 'r-kgl-juba' && /^ASIE-RX-/.test(o.ref) && o.followUpById === 'u-testfie', 'Asie raises ASIE-RX-… Gisenyi → Juba (follow-up Testfie, to confirm)', o);
const lo = await api.reexports.load(o.id, { market: { company: 'Gisenyi Movers', reg: 'RAD 777Q', driverName: 'Jean Bosco', driverPhone: '+250788000111' }, loadedQty: { 'p-b500': 118 } });
ok(lo.status === 'Loaded' && lo.shipmentId && lo.lines[0].loadedQty === 118, 'she loads it on a market truck (118 cases) — a new shipment', lo);
const g1 = (await api.warehouse.stock({ warehouseId: 'w-kgl' })).find((r) => r.productId === 'p-b500' && r.entityId === 'e-btw')!;
ok(g1.held === g0.held - 118 && g1.transfersOut === g0.transfersOut + 118, 'Gisenyi stock down by 118 (re-exported)');
const sh2 = await api.shipments.get(lo.shipmentId!);
ok(sh2?.ref === o.ref && sh2.fromWarehouseId === 'w-kgl' && sh2.warehouseId === 'w-juba' && sh2.legs[0].routeId === 'r-kgl-juba', 'the shipment carries the order ref, Gisenyi → Juba');
await api.tracking.dispatch(sh2!.legs[0].id);
ok((await api.reexports.get(o.id))?.status === 'In transit', 'Asie hands over: order in transit');
await as('u-yonas');
ok((await api.reexports.list()).some((x) => x.id === o.id), 'Yonas sees the incoming re-export');
const leg = (await api.shipments.get(lo.shipmentId!))!.legs[0];
await rejects(api.shipments.acknowledge(leg.id, { receiverName: 'Yonas', lines: [{ productId: 'p-b500', expected: 118, received: 116, damaged: 1, reason: 'Aliens' }] }), /422/, 'ack reason must come from the list');
await api.shipments.acknowledge(leg.id, { receiverName: 'Yonas', lines: [{ productId: 'p-b500', expected: 118, received: 116, damaged: 1, reason: 'Theft/pilferage' }] });
ok((await api.reexports.get(o.id))?.status === 'Delivered', 'Yonas acknowledges: delivered');
const ack2 = (await api.tracking.acks(lo.shipmentId!))[0];
ok(ack2.lines[0].reason === 'Theft/pilferage', 'the reason is stored on the acknowledgement line');
const j = (await api.warehouse.stock({ warehouseId: 'w-juba' })).find((r) => r.productId === 'p-b500' && r.entityId === 'e-btw')!;
const jb = ys.find((r) => r.productId === 'p-b500' && r.entityId === 'e-btw');
ok(j.transfersIn - (jb?.transfersIn ?? 0) === 116 && j.short - (jb?.short ?? 0) === 2, 'Juba: +116 transferred in, 2 short, 1 damaged');
await as('u-testfie');
ok((await api.reexports.list()).some((x) => x.id === o.id), 'Testfie follows the re-export');
await rejects(api.reexports.create({ fromWarehouseId: 'w-kgl', lines: [{ productId: 'p-b500', qty: 1 }] }), /403/, 'Testfie cannot raise one');
for (const who of ['u-kabonge', 'u-joel']) { await as(who); await rejects(api.reexports.list(), /403/, `${who}: no re-exports`); }

// ---- B-04 fees ------------------------------------------------------------------------------------------------------------------
await as('u-testfie');
const fees = await api.finance.fees();
ok(fees.length > 20 && fees.some((f) => f.flag === 'red') && fees.some((f) => f.flag === 'amber') && fees.some((f) => f.status === 'Paid') && fees.some((f) => f.status === 'Not recorded'), 'Testfie: fees paid / part paid / unpaid / not recorded, amber and red flags', fees.length);
ok(fees.every((f) => !('goods' in f)) && fees.some((f) => f.reexport), 'no goods value; re-export trucks included');
const nr = fees.find((f) => f.status === 'Not recorded')!;
await api.finance.setAgreedPrice(nr.shipmentId, { amount: 1800, currency: 'USD', docRef: 'AGR-1' });
const nr2 = (await api.finance.fees()).find((f) => f.shipmentId === nr.shipmentId)!;
ok(nr2.status === 'Unpaid' && nr2.agreedUsd === 1800, 'after the agreed price: unpaid');
const legId = nr2.legs[0].id;
await api.finance.addCost({ shipmentId: nr.shipmentId, legId, kind: 'Taxes & duties', amount: 200, currency: 'USD', docRef: 'RRA-9' } as never);
ok((await api.finance.fees()).find((f) => f.shipmentId === nr.shipmentId)!.costs.some((c) => c.legId === legId && c.kind === 'Taxes & duties'), 'Testfie adds a truck expense on a leg');
await rejects(api.finance.pay(nr.shipmentId, nr2.costs.find((c) => c.kind === 'Transport')!.id, 100, 'X'), /403/, 'Testfie cannot record payments');
await as('u-daniel');
await api.finance.pay(nr.shipmentId, nr2.costs.find((c) => c.kind === 'Transport')!.id, 400, 'MPESA QA1');
const nr3 = (await api.finance.fees()).find((f) => f.shipmentId === nr.shipmentId)!;
ok(nr3.status === 'Part paid' && nr3.paidUsd === 400 && nr3.references.includes('MPESA QA1'), 'a director pays $400 against a reference: part paid');
for (const who of ['u-kabonge', 'u-asie']) { await as(who); await rejects(api.finance.fees(), /403/, `${who}: no transport fees`); }

// ---- B-05 selling prices, B-06/B-07 performance ---------------------------------------------------------------------------------------
await as('u-daniel');
api.entities.setActive('e-btw');
const sp1 = await api.pricing.set({ productId: 'p-a300', warehouseId: 'w-kgl', price: 16.4, from: today, note: 'QA' });
ok(sp1.entityId === 'e-btw' && M.sellingPriceFor(await api.pricing.list(), 'e-btw', 'w-kgl', 'p-a300', today) === 16.4, 'a director sets a Gisenyi price; it is the current one');
api.entities.setActive(null);
await rejects(api.pricing.set({ productId: 'p-a300', price: 0 }), /422/, 'price validated');
const perf = await api.reports.performance({ level: 'product' });
const pa = perf.rows.find((r) => r.productId === 'p-a300')!;
ok(perf.rows.length >= 5 && pa.qtyReceived > 0 && pa.goodsCost > 0 && pa.truckCost > 0 && pa.warehouseCost > 0 && pa.revenue > 0 && pa.landedPerUnit! > 0, 'performance by product: received, goods, truck, warehouse, revenue, landed per case', pa);
ok(pa.margin! > 0.02 && pa.margin! < 0.4 && Math.abs(pa.profit - (pa.revenue - pa.cogs)) < 0.02, 'margins are plausible and profit = revenue − cost of units sold', pa.margin);
ok(Math.abs(perf.waterfall[0].value - perf.totals.revenue) < 0.01 && Math.abs(perf.waterfall.at(-1)!.value - perf.netProfit) < 0.01, 'waterfall revenue → profit matches the totals');
const byLevel = await Promise.all((['warehouse', 'company', 'receiving', 'business'] as const).map((level) => api.reports.performance({ level })));
const rev = (r: typeof perf) => Math.round(r.rows.reduce((a, x) => a + x.revenue, 0));
ok(byLevel.every((r) => Math.abs(rev(r) - rev(perf)) <= 2) && byLevel[3].rows.length === 1, 'the four levels add up to the same revenue', byLevel.map(rev));
ok(Math.abs(byLevel[3].rows[0].qtyReceived - perf.totals.qtyReceived) <= 1 && byLevel[1].rows.length === 3, 'company level: BTW, Nihna, Kivu; whole business counts transfers once');
ok(perf.fast.length > 0 && perf.slow.length > 0 && perf.byTruck.length > 0, 'fast / slow products and landed cost per truck');
for (const who of ['u-kabonge', 'u-testfie', 'u-asie', 'u-yonas']) { await as(who); await rejects(api.reports.performance(), /403/, `${who}: no performance report`); await rejects(api.pricing.list(), /403/, `${who}: no selling prices`); }

// ---- V3-12 step 0: Management settings and money notifications ----------------------------------------------------------
{
  const R2 = await import('../src/rules');
  const people = [
    { id: 'd1', roles: ['director'] as const, email: 'd1@x', phone: '+1', notifyEmail: true, notifySms: false },
    { id: 'd2', roles: ['director'] as const, email: null, phone: '+2', notifyEmail: true, notifySms: true },
    { id: 'd3', roles: ['director'] as const, active: false, email: 'd3@x', phone: '+3', notifyEmail: true, notifySms: true },
    { id: 'p1', roles: ['planner'] as const, email: 'p1@x', phone: '+4', notifyEmail: true, notifySms: true },
  ].map((u) => ({ ...u, roles: [...u.roles] }));
  const to = R2.moneyRecipients(people);
  ok(JSON.stringify(to) === JSON.stringify({ inApp: ['d1', 'd2'], email: ['d1@x'], sms: ['+2'] }), 'money news: active directors in-app; email / SMS only to those who turned it on and have an address', to);
  ok(R2.canChangeSettings(['director']) && R2.canChangeSettings(['admin']) && !R2.canChangeSettings(['accounts', 'operations']), 'settings: directors and the system administrator change them');

  await as('u-daniel');
  ok((await api.settings.money()).advanceApproval === false, 'settings: advance approval is off by default (26 Nov)');
  ok((await api.settings.setMoney({ advanceApproval: true })).advanceApproval === true && (await api.settings.money()).advanceApproval === true, 'settings: a director turns advance approval on');
  await api.settings.setMoney({ advanceApproval: false });
  const n0 = await api.settings.myNotify();
  ok(n0.email === false && n0.sms === false, 'my notifications: email and SMS off by default');
  const n1 = await api.settings.setMyNotify({ sms: true });
  ok(n1.sms === true && n1.email === false && (await api.settings.myNotify()).sms === true, 'my notifications: turning SMS on keeps email as it was');
  await as('u-yonas');
  await rejects(api.settings.setMoney({ advanceApproval: true }), /403|Only directors/, 'settings: a warehouse user cannot change approvals');
  ok((await api.settings.myNotify()).sms === false, 'my notifications: each person has their own choices');
  await as('u-daniel'); await api.settings.setMyNotify({ sms: false });
}

// ---- V3-12 step 1: clients and credit days ------------------------------------------------------------------------------
{
  const MX = await import('../src/metrics');
  const R3 = await import('../src/rules');
  const now = Date.UTC(2026, 10, 26, 12), at = (d: number) => iso(now - d * DAY);
  const sale = (d: number, termsDays?: number) => ({ at: at(d), lines: [{ productId: 'p', qty: 10, price: 10 }], paid: 0, status: 'Unpaid' as const, termsDays });
  ok(MX.termsOf({}) === 14 && MX.termsOf({ termsDays: 30 }) === 30 && MX.termsOf({ termsDays: 0 }) === 0, 'credit days: the sale\'s own, else 14');
  ok(MX.overdueByCustomers([sale(20)], now) === 100 && MX.overdueByCustomers([sale(20, 30)], now) === 0 && MX.overdueByCustomers([sale(31, 30)], now) === 100, 'overdue: 20 days old is overdue on 14 days, not on 30; 31 days is overdue on 30');
  ok(MX.overdueByCustomers([sale(1, 0)], now) === 100 && MX.owedByCustomers([sale(20), sale(20, 30)], now) === 200, 'overdue: "pay at once" (0 days) is overdue the next day; owed counts every open sale');
  ok(R3.clientKey('  Kimironko   Wholesale ') === R3.clientKey('kimironko wholesale') && R3.cleanClientName('  Kimironko   Wholesale ') === 'Kimironko Wholesale', 'client names: same client whatever the spacing or capitals');
  ok(R3.validTermsDays(0) && R3.validTermsDays(180) && !R3.validTermsDays(-1) && !R3.validTermsDays(181) && !R3.validTermsDays(7.5), 'credit days: whole days from 0 to 180');
  ok(R3.canSetCreditDays(['director']) && R3.canSetCreditDays(['accounts']) && !R3.canSetCreditDays(['sales']), 'credit days: set by directors and accounts, not by sales staff');

  await as('u-daniel');
  const before = await api.dashboards.get(['director-today', 'mgmt-clients'], {});
  const cl = await api.clients.list();
  const all = await api.sales.list();
  ok(cl.length > 0 && all.filter((s) => s.customer.trim()).every((s) => !!s.clientId && cl.some((c) => c.id === s.clientId && c.name === s.customer)), 'backfill: every sale points to a client with its name', cl.length);
  ok(cl.every((c) => c.name.trim()) && all.filter((s) => !s.customer.trim()).every((s) => !s.clientId), 'backfill: a sale without a client name stays without a client (still flagged as missing data)');

  ok(cl.every((c) => c.termsDays === 14) && new Set(cl.map((c) => `${c.entityId}|${R3.clientKey(c.name)}`)).size === cl.length, 'backfill: one client per name and company, 14 credit days');
  const after = await api.dashboards.get(['director-today', 'mgmt-clients'], {});
  // the figures, not the period's end (it is "now", a few ms later on the second call)
  const fig = (r: typeof before, k: string) => JSON.stringify({ ...((r.results as Record<string, { data: object }>)[k]?.data ?? {}), period: null, prev: null });
  ok(fig(before, 'mgmt-clients') === fig(after, 'mgmt-clients') && fig(before, 'director-today') === fig(after, 'director-today'), 'backfill keeps the figures: Today and Sales and clients are the same before and after');
  const mc = (after.results['mgmt-clients']!.data) as import('../src/dashboards').MgmtClients;
  // the Clients tab adds up to the company totals, apart from the sales recorded without a client (no client to show them on)
  const mdb = (await import('../src/mock/db')).db, MXc = await import('../src/metrics');
  const noClient = mdb.sales.filter((x) => !x.clientId);
  const sumOf = (k: 'owed' | 'overdue') => cl.reduce((a, c) => a + c[k], 0);
  ok(Math.abs(sumOf('owed') + MXc.owedByCustomers(noClient, Date.now()) - MXc.owedByCustomers(mdb.sales, Date.now())) < 1
    && Math.abs(sumOf('overdue') + MXc.overdueByCustomers(noClient, Date.now()) - MXc.overdueByCustomers(mdb.sales, Date.now())) < 1, 'Clients tab: owed and overdue over all sales add up to the totals (with the sales that have no client)');
  ok(Math.abs(mc.termsMix.reduce((a, x) => a + x.owed, 0) - (mc.kpis.owed ?? 0)) < 1 && Math.abs(mc.termsMix.reduce((a, x) => a + x.overdue, 0) - (mc.kpis.overdue ?? 0)) < 1, 'Management: credit days in use add up to owed and overdue', mc.termsMix);

  const stockRow = (await api.inventory.stock()).find((r) => r.entityId === 'e-btw' && r.closing > 5)!;
  api.entities.setActive('e-btw');
  const line = [{ productId: stockRow.productId, qty: 1, price: 10 }];
  const mk = (customer: string, clientId?: string) => api.sales.create({ entityId: 'e-btw', at: new Date().toISOString(), warehouseId: stockRow.warehouseId, customer, clientId, salespersonId: 'u-daniel', kind: 'Credit', lines: line, currency: 'USD', paid: 0 });
  const n0 = (await api.clients.list()).length;
  const s1 = await mk('  Nyabugogo   Traders ');
  const c1 = (await api.clients.list()).find((c) => c.id === s1.clientId)!;
  ok(c1 && c1.name === 'Nyabugogo Traders' && c1.termsDays === 14 && s1.termsDays === 14 && s1.customer === 'Nyabugogo Traders' && (await api.clients.list()).length === n0 + 1, 'a sale to a new name adds the client with 14 credit days');
  const s2 = await mk('nyabugogo traders');
  ok(s2.clientId === c1.id && (await api.clients.list()).length === n0 + 1, 'the same name again (other capitals) is the same client');
  const c1b = await api.clients.update(c1.id, { termsDays: 30 });
  const s3 = await mk('Nyabugogo Traders', c1.id);
  ok(c1b.termsDays === 30 && s3.termsDays === 30 && (await api.sales.list()).find((x) => x.id === s1.id)!.termsDays === 14, 'new credit days apply to the next sales; earlier sales keep theirs');
  await rejects(api.clients.update(c1.id, { termsDays: 200 }), /0 to 180/, 'credit days over 180 are refused');
  await rejects(api.clients.create({ entityId: 'e-btw', name: 'NYABUGOGO traders' }), /already a client/, 'a second client with the same name is refused');
  await api.clients.update(c1.id, { active: false });
  await rejects(mk('Nyabugogo Traders'), /deactivated/, 'a deactivated client cannot be picked on a new sale');
  await api.clients.update(c1.id, { active: true });
  api.entities.setActive(null);
}

// ---- V3-12 step 2: client payments ------------------------------------------------------------------------------------
{
  const R4 = await import('../src/rules');
  ok(R4.paymentError(100, { amount: 40, method: 'Cash' }) === null && /more than the balance/.test(R4.paymentError(100, { amount: 100.02, method: 'Cash' }) ?? '') && R4.paymentError(100, { amount: 100.004, method: 'Bank' }) === null, 'payment: up to the balance (a cent of rounding allowed)');
  ok(/amount/.test(R4.paymentError(100, { amount: 0, method: 'Cash' }) ?? '') && /how the client paid/.test(R4.paymentError(100, { amount: 5, method: 'Cheque' }) ?? ''), 'payment: above zero and a known method');

  await as('u-daniel'); api.entities.setActive(null);
  const per = { from: new Date(Date.now() - 30 * DAY).toISOString(), to: new Date(Date.now() + DAY).toISOString() };
  const cash0 = (await api.dashboards.get(['mgmt-cash'], per)).results['mgmt-cash']!.data as import('../src/dashboards').MgmtCash;
  const pays = await api.sales.payments();
  const all = await api.sales.list();
  const bySale = new Map<string, number>(); for (const x of pays) bySale.set(x.saleId, (bySale.get(x.saleId) ?? 0) + x.amount);
  ok(pays.length > 0 && all.filter((x) => x.paid > 0).every((x) => Math.abs((bySale.get(x.id) ?? 0) - x.paid) < 0.01), 'backfill: each sale\'s payments add up to what it says is paid', pays.length);
  const allSales = (await import('../src/mock/db')).db.sales; // every sale (the list returns the latest 200)
  const cp = (await import('../src/mock/db')).db.clientPayments!;
  ok(cp.every((x) => x.method !== null || allSales.find((y) => y.id === x.saleId)?.at === x.at) && allSales.filter((x) => x.paid > 0).every((x) => cp.some((y) => y.saleId === x.id)), 'backfill: every sale with money paid has a payment; copied payments are dated at the sale, method not recorded');
  ok(!cash0.notRecorded.includes('paymentDates'), 'Cash and closing: payment dates are recorded now');

  const row = (await api.inventory.stock()).find((r) => r.entityId === 'e-btw' && r.closing > 5)!;
  api.entities.setActive('e-btw');
  const credit = await api.sales.create({ entityId: 'e-btw', at: new Date(Date.now() - 2 * DAY).toISOString(), warehouseId: row.warehouseId, customer: 'Payment Test Client', salespersonId: 'u-daniel', kind: 'Credit', lines: [{ productId: row.productId, qty: 2, price: 50 }], currency: 'USD', paid: 30, payMethod: 'Mobile money' });
  const first = (await api.sales.payments(credit.id));
  ok(first.length === 1 && first[0].amount === 30 && first[0].method === 'Mobile money' && credit.status === 'Part-paid', 'a sale with money paid writes its first payment, with how it was paid');
  const r1 = await api.sales.recordPayment(credit.id, { amount: 50, method: 'Bank', reference: 'TT-123' });
  ok(r1.sale.paid === 80 && r1.sale.status === 'Part-paid' && r1.payment.amountUsd === 50 && (await api.sales.list()).find((x) => x.id === credit.id)!.paid === 80, 'Record payment: paid and status follow (30 + 50 of 100 → part-paid)');
  await rejects(api.sales.recordPayment(credit.id, { amount: 25, method: 'Cash' }), /more than the balance/, 'Record payment: not more than the balance (20 left)');
  await rejects(api.sales.recordPayment(credit.id, { amount: 5, method: 'Cash', at: new Date(Date.now() - 10 * DAY).toISOString() }), /between the sale and today/, 'Record payment: not dated before the sale');
  const r2 = await api.sales.recordPayment(credit.id, { amount: 20, method: 'Cash' });
  ok(r2.sale.status === 'Paid' && (await api.sales.payments(credit.id)).length === 3, 'Record payment: the last 20 makes it paid; three payments on the sale');
  await rejects(api.sales.recordPayment(credit.id, { amount: 1, method: 'Cash' }), /more than the balance/, 'a paid sale takes no more payments');
  api.entities.setActive(null);
  const cash1 = (await api.dashboards.get(['mgmt-cash'], per)).results['mgmt-cash']!.data as import('../src/dashboards').MgmtCash;
  ok(Math.abs(cash1.kpis.received - cash0.kpis.received - 100) < 0.02, 'Cash and closing: received goes up by the 100 paid in the period (30 on the sale + 50 + 20)', [cash0.kpis.received, cash1.kpis.received]);
  const clientsD = (await api.dashboards.get(['mgmt-clients'], per)).results['mgmt-clients']!.data as import('../src/dashboards').MgmtClients;
  ok(!!clientsD.methods && Math.abs(clientsD.methods.reduce((a, x) => a + x.total, 0) - cash1.kpis.received) < 0.05 && clientsD.methods.some((x) => x.method === 'Bank'), 'Sales and clients: money by how clients paid adds up to Cash received', clientsD.methods);
  await as('u-yonas');
  await rejects(api.sales.recordPayment(credit.id, { amount: 1, method: 'Cash' }), /404|403|not found|Not/, 'a warehouse user outside the sale cannot record a payment');
  await as('u-daniel');
}

// ---- V3-12 step 3: supplier money on the purchase order ----------------------------------------------------------------
{
  const M3 = await import('../src/money');
  const mdb = (await import('../src/mock/db')).db;
  await as('u-daniel'); api.entities.setActive(null);
  const per = { from: new Date(Date.now() - 30 * DAY).toISOString(), to: new Date(Date.now() + DAY).toISOString() };
  const sup0 = (await api.dashboards.get(['mgmt-suppliers'], per)).results['mgmt-suppliers']!.data as import('../src/dashboards').MgmtSuppliers;
  const shorts = M3.shortLoadRows({ loadings: mdb.loadings, pos: mdb.pos, plans: mdb.plans, fxRates: mdb.fxRates });
  ok(Math.abs(sup0.kpis.held - shorts.reduce((a, x) => a + x.value, 0)) < 0.05 && sup0.notRecorded.length === 0, 'Supplier balances: before any entry, what suppliers hold = the short loads (one source with the PO page)', [sup0.kpis.held]);

  // an issued USD purchase order of BTW
  const po = mdb.pos.find((x) => x.entityId === 'e-btw' && x.currency === 'USD' && x.status === 'Issued' && !x.revisionOf && !x.supersededById)!;
  const m0 = await api.supplierMoney.forPo(po.id);
  ok(m0.po.proforma === 0 && m0.canRecord && m0.canDecide && !m0.approvalOn, 'a new PO has no pro-forma; a director may record and decide; approval is off');
  await rejects(api.supplierMoney.record(po.id, { kind: 'advance', amount: 100 }), /pro-forma first/, 'an advance needs the supplier\'s pro-forma first');
  const n0 = mdb.notifications.length;
  await api.supplierMoney.record(po.id, { kind: 'proforma', amount: 10000, reference: 'PF-1' });
  await api.supplierMoney.record(po.id, { kind: 'advance', amount: 4000, reference: 'TT-1' });
  const m1 = await api.supplierMoney.forPo(po.id);
  ok(m1.po.proforma === 10000 && m1.po.advances === 4000 && m1.po.open === 6000, 'pro-forma 10,000, advance 4,000 counted at once (approval off): 6,000 open', m1.po);
  ok(mdb.notifications.length === n0 + 1 && /Advance payment recorded/.test(mdb.notifications[0].title) && mdb.notifications[0].forRoles.includes('director'), 'the advance tells the directors (who recorded it is in the message)');
  await rejects(api.supplierMoney.record(po.id, { kind: 'advance', amount: 6000.5 }), /more than the open pro-forma/, 'an advance cannot be more than the open pro-forma');

  const held0 = m1.held.balance;
  await api.supplierMoney.record(po.id, { kind: 'credit-note', amount: 500, reference: 'CN-9', note: 'Promotion' });
  const m2 = await api.supplierMoney.forPo(po.id);
  ok(Math.abs(m2.held.balance - held0 - 500) < 0.01 && m2.held.creditNotes >= 500, 'a credit note of 500 adds to what the supplier holds', [held0, m2.held.balance]);
  await rejects(api.supplierMoney.record(po.id, { kind: 'advance', amount: 0, useHeld: m2.held.available + 50 }), /holds USD/, 'money used from the supplier cannot be more than it holds');
  await api.supplierMoney.record(po.id, { kind: 'advance', amount: 1000, useHeld: 300 });
  const m3 = await api.supplierMoney.forPo(po.id);
  ok(m3.po.advances === 5300 && m3.po.open === 4700 && Math.abs(m3.held.balance - (m2.held.balance - 300)) < 0.01, 'an advance of 1,000 paid + 300 from what the supplier holds: 4,700 open, the supplier holds 300 less');

  // approval on: the advance waits for a director and sets its money aside
  await api.settings.setMoney({ advanceApproval: true });
  await api.supplierMoney.record(po.id, { kind: 'advance', amount: 700, useHeld: 100 });
  const m4 = await api.supplierMoney.forPo(po.id);
  const pend = m4.entries.find((e) => e.kind === 'advance' && e.status === 'Pending approval')!;
  ok(m4.po.pending === 800 && m4.po.advances === 5300 && m4.po.open === 3900 && m4.held.pendingUse === 100 && m4.held.balance === m3.held.balance, 'approval on: 800 waits (700 + 100 held), set aside from the open pro-forma and the held money');
  ok(/to approve/.test(mdb.notifications[0].title), 'the directors are told an advance is waiting');
  const supP = (await api.dashboards.get(['mgmt-suppliers'], per)).results['mgmt-suppliers']!.data as import('../src/dashboards').MgmtSuppliers;
  ok(supP.pendingAdvances.some((x) => x.id === pend.id && Math.abs(x.amountUsd - 800) < 0.01), 'Management → Supplier balances lists the advance waiting for a director');
  await as('u-kabonge');
  await rejects(api.supplierMoney.decide(pend.id, true), /director/, 'a planner cannot approve an advance');
  await as('u-daniel');
  await api.supplierMoney.decide(pend.id, false);
  const m5 = await api.supplierMoney.forPo(po.id);
  ok(m5.po.pending === 0 && m5.po.open === 4700 && m5.held.pendingUse === 0, 'rejected: the 800 is free again');
  await api.supplierMoney.record(po.id, { kind: 'advance', amount: 200 });
  await api.supplierMoney.decide(m5.entries.length ? (await api.supplierMoney.forPo(po.id)).entries.find((e) => e.status === 'Pending approval')!.id : '', true);
  ok((await api.supplierMoney.forPo(po.id)).po.advances === 5500, 'approved: the 200 counts');
  await api.settings.setMoney({ advanceApproval: false });

  const sup1 = (await api.dashboards.get(['mgmt-suppliers'], per)).results['mgmt-suppliers']!.data as import('../src/dashboards').MgmtSuppliers;
  ok(Math.abs(sup1.kpis.held - (sup0.kpis.held + 500 - 300)) < 0.05 && Math.abs(sup1.kpis.creditNotes - 500) < 0.01 && Math.abs(sup1.kpis.advancesPaid - 5500) < 0.01, 'Supplier balances: held + 500 credit note − 300 used; advances paid 5,500 in the period', sup1.kpis);
  ok(Math.abs(sup1.bySupplier.reduce((a, x) => a + x.held, 0) - sup1.kpis.held) < 0.05 && sup1.statement.some((x) => x.kind === 'credit-note') && sup1.statement.some((x) => x.kind === 'use' && x.added === -300), 'by supplier adds up; the statement shows the credit note and the money used');
  await as('u-yonas');
  await rejects(api.supplierMoney.forPo(po.id), /not found|404/, 'a warehouse user does not see supplier money');
  await as('u-daniel');
}

console.log(fails ? `\n${fails} money check(s) FAILED` : '\nall money checks passed');
if (fails) process.exitCode = 1;
