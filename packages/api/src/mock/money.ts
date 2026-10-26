// docs/14 (workstream B) — the mock's warehouse-money operations: warehouse expenses, stock counts / adjustments, re-export
// orders Asie → Yonas, selling prices, transport-fee tracking and the combined performance report. Same rules as the API
// (packages/api/src/money.ts, performance.ts). Lazily imported by mock-client.ts so it stays out of the apps' entry chunks.
import * as m from './db';
import * as seed from './seed';
import * as R from '../rules';
import * as M from '../money';
import { performanceReport, type PerfFilter } from '../performance';
import { buildMoneyHistory } from './money-history';
import { mockSane } from './sanity';
import type { ReportData } from '../reports';
import type { Subject } from '../access';
import type {
  AckLine, AppConfig, ExpenseFilter, ID, ReexportInput, ReexportLoadInput, ReexportOrder, SellingPrice, SellingPriceInput, Shipment, StockAdjustInput, StockAdjustment, User,
  WarehouseExpense, WarehouseExpenseInput, WarehouseStockRow,
} from '../types';

export interface Ctx {
  current: User | null; me: () => Subject; ensure: () => void;
  log: (method: string, path: string, x?: Parameters<typeof m.audit>[3]) => void;
  commit: <T>(v: T) => Promise<T>; wait: <T>(v: T) => Promise<T>; httpErr: (msg: string, code: number) => Error;
  inScope: (e: ID | undefined | null) => boolean; writeEntity: (e?: ID | null) => ID; config: AppConfig;
  seesSh: (sh: Shipment) => boolean; reportData: () => ReportData;
}
/** Adds the three months of warehouse-money history to a dataset built without it (first boot / demo reset). */
export function fill() { if (!m.db.reexports) { buildMoneyHistory(m.db, m.db.builtAt ?? Date.now()); m.save(); } }
const start = (c: Ctx) => { c.ensure(); fill(); };
const feat = (c: Ctx, f: Parameters<typeof R.hasFeature>[1], msg = 'Not available for your role') => { if (!c.current || !R.hasFeature(c.current.roles, f)) throw c.httpErr(msg, 403); };
const u = (c: Ctx) => ({ ...c.me(), id: c.current?.id });
const wh = (id: ID) => seed.warehouses.find((w) => w.id === id);
const day = () => new Date().toISOString().slice(0, 10);

// ---- B-08 acknowledgement reasons -----------------------------------------------------------------------------------
export function checkAckReasons(c: Pick<Ctx, 'httpErr'>, lines: AckLine[]) {
  if (!lines.every((l) => M.validAckReason(l.reason))) throw c.httpErr(`Pick a reason from the list: ${M.ACK_REASONS.join(', ')}`, 422);
}

// ---- B-01 warehouse expenses ------------------------------------------------------------------------------------------
export async function expenses(c: Ctx, f: ExpenseFilter = {}): Promise<WarehouseExpense[]> {
  start(c); feat(c, 'warehouse-expenses', 'Warehouse expenses are recorded by the receivers and the directors');
  if (f.warehouseId && !M.seesWarehouse(u(c), f.warehouseId)) throw c.httpErr('Not your warehouse', 403);
  return c.wait(M.filterExpenses((m.db.expenses ?? []).filter((e) => M.seesWarehouse(u(c), e.warehouseId)), f));
}
/** audit words per input ("unusual amount confirmed …") */
const notes = new WeakMap<object, string>();
function expenseFrom(c: Ctx, input: Partial<WarehouseExpenseInput>, cur?: WarehouseExpense): WarehouseExpense {
  const v = { ...(cur ? { warehouseId: cur.warehouseId, date: cur.date, category: cur.category, amount: cur.amount, currency: cur.currency, reference: cur.reference, note: cur.note } : {}), ...input };
  const errs = M.validateExpense(v, { warehouseIds: seed.warehouses.map((w) => w.id) });
  if (errs.length) throw c.httpErr(errs.join('; '), 422);
  if (!M.canRecordWarehouse(u(c), v.warehouseId!)) throw c.httpErr('You record expenses for your own warehouses only', 403);
  // docs/17 F4: plausible amount for its currency (when the amount or currency is entered or changed)
  const sane = !cur || input.amount !== undefined || input.currency !== undefined ? mockSane('warehouse-expense', v.amount, v.currency, v.date!, input.confirmUnusual) : null;
  notes.set(input, sane?.note ?? '');
  const currency = v.currency!;
  const rate = R.fxFor(m.db.fxRates ?? seed.seedFxRates(), currency, v.date!);
  const receipt = input.receiptFileId ? { id: input.receiptFileId, kind: 'receipt' as const, name: input.receiptName || 'receipt.jpg', ...(input.receiptUrl ? { url: input.receiptUrl } : {}) } : input.receiptFileId === null ? null : cur?.receipt ?? null;
  return {
    id: cur?.id ?? m.uid('wx'), warehouseId: v.warehouseId!, receivingCompanyId: wh(v.warehouseId!)!.receivingCompanyId, date: v.date!, category: v.category!, amount: v.amount!, currency, fxRate: rate,
    amountUsd: Math.round((v.amount! / rate) * 100) / 100, reference: v.reference?.trim() || null, note: v.note?.trim() || null, receipt, byUserId: cur?.byUserId ?? c.current!.id, at: cur?.at ?? new Date().toISOString(),
  };
}
export async function addExpense(c: Ctx, input: WarehouseExpenseInput): Promise<WarehouseExpense> {
  start(c); feat(c, 'warehouse-expenses');
  const x = expenseFrom(c, input);
  (m.db.expenses ??= []).push(x);
  c.log('POST', '/warehouse/expenses', { recordType: 'warehouse-expense', recordId: x.id, summary: `${wh(x.warehouseId)?.name}: ${x.category} ${x.currency} ${x.amount}${notes.get(input) ?? ''}`, after: { category: x.category, amount: x.amount, currency: x.currency, date: x.date } });
  return c.commit(x);
}
export async function updateExpense(c: Ctx, id: ID, input: Partial<WarehouseExpenseInput>): Promise<WarehouseExpense> {
  start(c); feat(c, 'warehouse-expenses');
  const cur = (m.db.expenses ?? []).find((e) => e.id === id);
  if (!cur || !M.seesWarehouse(u(c), cur.warehouseId)) throw c.httpErr('Expense not found', 404);
  if (!M.canEditExpense(u(c), cur)) throw c.httpErr('Only the person who recorded it or a director changes an expense', 403);
  const x = expenseFrom(c, input, cur);
  Object.assign(cur, x);
  c.log('PATCH', `/warehouse/expenses/${id}`, { recordType: 'warehouse-expense', recordId: id, summary: `${x.category} ${x.currency} ${x.amount}${notes.get(input) ?? ''}` });
  return c.commit(cur);
}
export async function deleteExpense(c: Ctx, id: ID): Promise<boolean> {
  start(c); feat(c, 'warehouse-expenses');
  const cur = (m.db.expenses ?? []).find((e) => e.id === id);
  if (!cur || !M.seesWarehouse(u(c), cur.warehouseId)) throw c.httpErr('Expense not found', 404);
  if (!M.canEditExpense(u(c), cur)) throw c.httpErr('Only the person who recorded it or a director removes an expense', 403);
  m.db.expenses = m.db.expenses!.filter((e) => e.id !== id);
  c.log('DELETE', `/warehouse/expenses/${id}`, { recordType: 'warehouse-expense', recordId: id, summary: `removed ${cur.category} ${cur.currency} ${cur.amount}`, before: { category: cur.category, amount: cur.amount, currency: cur.currency, date: cur.date } });
  return c.commit(true);
}

// ---- B-02 warehouse inventory (quantities only) --------------------------------------------------------------------------
const myWarehouses = (c: Ctx) => seed.warehouses.filter((w) => M.seesWarehouse(u(c), w.id)).map((w) => w.id);
export async function warehouseStock(c: Ctx, f: { warehouseId?: ID; from?: string; to?: string } = {}): Promise<WarehouseStockRow[]> {
  start(c); feat(c, 'warehouse-stock', 'Warehouse inventory is for the receivers and the directors');
  if (f.warehouseId && !M.seesWarehouse(u(c), f.warehouseId)) throw c.httpErr('Not your warehouse', 403);
  const whs = f.warehouseId ? [f.warehouseId] : myWarehouses(c);
  const from = f.from ? Date.parse(f.from) : Date.now() - 30 * 864e5;
  const rows = M.warehouseStock(m.db.stockMoves.filter((x) => c.inScope(x.entityId)), m.db.acks.filter((a) => c.inScope(a.entityId)), { warehouseIds: whs, from, to: f.to ? Date.parse(f.to) : undefined });
  return c.wait(rows.filter((r) => r.held || r.received || r.transfersIn || r.sold || r.opening));
}
const heldOf = (c: Ctx, e: ID, w: ID, p: ID) => M.warehouseStock(m.db.stockMoves.filter((x) => x.entityId === e && x.warehouseId === w && x.productId === p), [], { warehouseIds: [w] })[0]?.held ?? 0;
export async function adjust(c: Ctx, input: StockAdjustInput): Promise<StockAdjustment> {
  start(c); feat(c, 'warehouse-stock');
  if (!wh(input?.warehouseId)) throw c.httpErr('Pick the warehouse', 422);
  if (!M.canRecordWarehouse(u(c), input.warehouseId)) throw c.httpErr('You record stock for your own warehouses only', 403);
  const errs = M.validateAdjust(input); if (errs.length) throw c.httpErr(errs.join('; '), 422);
  if (!seed.products.some((p) => p.id === input.productId)) throw c.httpErr('Unknown product', 422);
  const entityId = input.entityId ?? seed.entityOfProduct(input.productId);
  if (!c.inScope(entityId)) throw c.httpErr('That belongs to another company', 403);
  const held = heldOf(c, entityId, input.warehouseId, input.productId);
  const mv = M.adjustmentMove(input, held);
  if (held + mv.effect < 0) throw c.httpErr(`Only ${held} cases held — you cannot take out ${-mv.effect}`, 422);
  const at = new Date().toISOString();
  const ref = `ADJ-${at.slice(0, 10).replace(/-/g, '')}-${input.warehouseId.slice(2).toUpperCase()}`;
  const note = input.note?.trim() || null;
  m.db.stockMoves.push({ entityId, warehouseId: input.warehouseId, productId: input.productId, kind: mv.kind, qty: mv.qty, at, ref, reason: mv.reason, note, byUserId: c.current!.id });
  c.log('POST', '/warehouse/stock-adjustments', { recordType: 'stock', recordId: `${input.warehouseId}/${input.productId}`, entityId, summary: `${mv.reason}: ${mv.effect >= 0 ? '+' : ''}${mv.effect} ${seed.products.find((p) => p.id === input.productId)?.brand ?? ''}`, before: { held }, after: { held: held + mv.effect } });
  return c.commit({ entityId, warehouseId: input.warehouseId, productId: input.productId, kind: input.kind, qty: mv.effect, counted: input.kind === 'count' ? input.counted ?? null : null, reason: mv.reason, note, at, byUserId: c.current!.id, ref });
}
export async function adjustments(c: Ctx, f: { warehouseId?: ID } = {}): Promise<StockAdjustment[]> {
  start(c); feat(c, 'warehouse-stock');
  const whs = f.warehouseId ? [f.warehouseId] : myWarehouses(c);
  if (f.warehouseId && !M.seesWarehouse(u(c), f.warehouseId)) throw c.httpErr('Not your warehouse', 403);
  return c.wait(M.adjustmentsOf(m.db.stockMoves.filter((x) => whs.includes(x.warehouseId) && c.inScope(x.entityId))).slice(0, 200));
}

// ---- B-03 re-export orders -------------------------------------------------------------------------------------------------
const orderOut = (o: ReexportOrder): ReexportOrder => ({ ...o, status: M.reexportStatus(o, o.shipmentId ? m.db.shipments.find((s) => s.id === o.shipmentId) : null) });
const seesOrder = (c: Ctx, o: ReexportOrder) => c.inScope(o.entityId) && M.seesReexport(u(c), o);
export async function listReexports(c: Ctx): Promise<ReexportOrder[]> {
  start(c); feat(c, 're-export', 'Re-export orders are for Asie, Yonas, the truck follow-up officer and the directors');
  m.db.shipments.forEach((s) => (s.status = m.deriveShipmentStatus(s)));
  return c.wait((m.db.reexports ?? []).filter((o) => seesOrder(c, o)).map(orderOut).reverse());
}
export async function getReexport(c: Ctx, id: ID): Promise<ReexportOrder | null> {
  start(c); feat(c, 're-export');
  const o = (m.db.reexports ?? []).find((x) => x.id === id);
  return c.wait(o && seesOrder(c, o) ? orderOut(o) : null);
}
function checkLines(c: Ctx, entityId: ID, from: ID, lines: { productId: ID; qty: number }[]) {
  if (!Array.isArray(lines) || !lines.length) throw c.httpErr('Add at least one product', 422);
  const seen = new Set<ID>();
  for (const l of lines) {
    if (!seed.products.some((p) => p.id === l?.productId)) throw c.httpErr('Unknown product', 422);
    if (seen.has(l.productId)) throw c.httpErr('Each product once per order', 422); seen.add(l.productId);
    if (!(Number.isInteger(l.qty) && l.qty > 0)) throw c.httpErr('Each line needs a whole number of cases above zero', 422);
    const held = heldOf(c, entityId, from, l.productId);
    if (l.qty > held) throw c.httpErr(`Only ${held} cases of ${seed.products.find((p) => p.id === l.productId)?.brand} in stock at ${wh(from)?.name}`, 422);
  }
}
export async function createReexport(c: Ctx, input: ReexportInput): Promise<ReexportOrder> {
  start(c); feat(c, 're-export');
  const from = wh(input?.fromWarehouseId); if (!from) throw c.httpErr('Pick the warehouse the goods leave from', 422);
  if (!M.canRaiseReexport(u(c), from.id)) throw c.httpErr('Re-export orders are raised by the re-export planner of that warehouse', 403);
  const routeId = input.routeId ?? M.REEXPORT_ROUTE;
  const route = m.db.routes.find((r) => r.id === routeId); if (!route) throw c.httpErr('Route not found', 422);
  const to = seed.warehouses.find((w) => w.id === (input.toWarehouseId ?? '') || (!input.toWarehouseId && w.checkpointId === route.stops.at(-1)!.checkpointId));
  if (!to || to.id === from.id) throw c.httpErr('Pick the warehouse the goods go to', 422);
  if (route.stops[0].checkpointId !== from.checkpointId || route.stops.at(-1)!.checkpointId !== to.checkpointId) throw c.httpErr(`The route must run from ${from.name} to ${to.name}`, 422);
  const entityId = c.writeEntity(input.entityId ?? null);
  checkLines(c, entityId, from.id, input.lines);
  if (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 500)) throw c.httpErr('Note must be text (500 characters at most)', 422);
  const at = new Date().toISOString();
  const rc = seed.receivingCompanies.find((x) => x.id === from.receivingCompanyId)?.name ?? 'RX';
  const o: ReexportOrder = { id: m.uid('rx'), ref: M.nextReexportRef((m.db.reexports ?? []).map((x) => x.ref), rc, new Date().getFullYear()), entityId, fromWarehouseId: from.id, toWarehouseId: to.id, routeId,
    lines: input.lines.map((l) => ({ productId: l.productId, qty: l.qty })), status: 'Open', note: input.note?.trim() || null, createdById: c.current!.id, createdAt: at,
    followUpById: seed.users.find((x) => x.roles.includes('truck_planner'))?.id ?? null, truckId: input.truckId ?? null, driverId: input.driverId ?? null };
  (m.db.reexports ??= []).push(o);
  m.notify('Re-export raised', `${o.ref}: ${o.lines.reduce((a, l) => a + l.qty, 0).toLocaleString('en-US')} cases ${from.name} → ${to.name}`, `#/re-exports`, ['truck_planner', 'director'], entityId);
  c.log('POST', '/reexports', { recordType: 'reexport', recordId: o.id, entityId, summary: `${o.ref} raised`, after: { lines: o.lines } });
  return c.commit(o);
}
export async function loadReexport(c: Ctx, id: ID, input: ReexportLoadInput): Promise<ReexportOrder> {
  start(c); feat(c, 're-export');
  const o = (m.db.reexports ?? []).find((x) => x.id === id);
  if (!o || !seesOrder(c, o)) throw c.httpErr('Re-export order not found', 404);
  if (!M.canRaiseReexport(u(c), o.fromWarehouseId)) throw c.httpErr('The re-export planner of that warehouse loads it', 403);
  if (o.status !== 'Open') throw c.httpErr('This order is already loaded', 409);
  let truckId = input?.truckId, driverId = input?.driverId;
  if (input?.market) {
    const reg = R.normReg(input.market.reg);
    if (!reg || !input.market.driverName?.trim()) throw c.httpErr('Truck registration and driver name are required', 422);
    if (m.db.trucks.some((t) => R.normReg(t.reg).replace(/\s/g, '') === reg.replace(/\s/g, ''))) throw c.httpErr(`${reg} is already registered — pick it from the list`, 409);
    const name = input.market.company?.trim() || 'Market truck';
    const provider = m.db.providers.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? (() => { const p = { id: m.uid('pr'), name, kind: 'market' as const, regular: false, phone: '', active: true }; m.db.providers.push(p); return p; })();
    const driver = { id: m.uid('d'), name: input.market.driverName.trim(), phone: input.market.driverPhone?.trim() ?? '', licence: '', providerId: provider.id, hasApp: false };
    m.db.drivers.push(driver);
    const truck = { id: m.uid('t'), providerId: provider.id, reg, trailer: (input.market.trailer ?? '').trim().toUpperCase(), capacityCases: input.market.capacityCases || 2000, defaultDriverId: driver.id };
    m.db.trucks.push(truck); truckId = truck.id; driverId = driver.id;
  }
  if (!m.db.trucks.some((t) => t.id === truckId)) throw c.httpErr('Pick the truck', 422);
  if (!m.db.drivers.some((d) => d.id === driverId)) throw c.httpErr('Pick the driver', 422);
  const lines = o.lines.map((l) => { const q = input.loadedQty?.[l.productId]; return { productId: l.productId, qty: q === undefined ? l.qty : Math.round(Number(q)) }; });
  if (lines.some((l) => !(Number.isInteger(l.qty) && l.qty >= 0))) throw c.httpErr('Loaded cases must be whole numbers ≥ 0', 422);
  const loaded = lines.filter((l) => l.qty > 0);
  checkLines(c, o.entityId, o.fromWarehouseId, loaded);
  const to = wh(o.toWarehouseId)!, from = wh(o.fromWarehouseId)!;
  const at = Date.now();
  const sh: Shipment = { id: m.uid('shp'), entityId: o.entityId, ref: o.ref, poId: o.id, truckNo: 1, receivingCompanyId: to.receivingCompanyId, warehouseId: to.id, legs: [], status: 'Loaded', fromWarehouseId: from.id, parentShipmentId: null, originShipmentId: null };
  m.db.shipments.push(sh);
  for (const l of loaded) m.db.stockMoves.push({ entityId: o.entityId, warehouseId: from.id, productId: l.productId, kind: 'transferOut', qty: l.qty, at: new Date(at).toISOString(), ref: o.ref });
  const leg = m.addLeg(sh.id, o.routeId, truckId!, driverId!, at + 2 * 36e5, loaded.map((l) => ({ productId: l.productId, loadedQty: l.qty })));
  leg.status = 'Loaded'; sh.status = m.deriveShipmentStatus(sh);
  Object.assign(o, { status: 'Loaded', shipmentId: sh.id, truckId, driverId, loadedById: c.current!.id, loadedAt: new Date(at).toISOString(), lines: o.lines.map((l) => ({ ...l, loadedQty: lines.find((x) => x.productId === l.productId)!.qty })) });
  m.notify('Re-export loaded', `${o.ref}: ${m.truckReg(truckId!)} loaded at ${from.name} for ${to.name}`, `#/shipments/${sh.id}`, ['receiver', 'truck_planner', 'director'], o.entityId);
  c.log('POST', `/reexports/${id}/load`, { recordType: 'reexport', recordId: id, entityId: o.entityId, summary: `${o.ref} loaded on ${m.truckReg(truckId!)}` });
  return c.commit(orderOut(o));
}
export async function cancelReexport(c: Ctx, id: ID, reason?: string): Promise<ReexportOrder> {
  start(c); feat(c, 're-export');
  const o = (m.db.reexports ?? []).find((x) => x.id === id);
  if (!o || !seesOrder(c, o)) throw c.httpErr('Re-export order not found', 404);
  if (!(M.canRaiseReexport(u(c), o.fromWarehouseId) || A_isDirector(c))) throw c.httpErr('Only the re-export planner or a director cancels it', 403);
  if (o.status !== 'Open') throw c.httpErr('Only an order not loaded yet can be cancelled', 409);
  o.status = 'Cancelled'; o.note = [o.note, reason ? `Cancelled: ${reason}` : 'Cancelled'].filter(Boolean).join(' · ');
  c.log('POST', `/reexports/${id}/cancel`, { recordType: 'reexport', recordId: id, entityId: o.entityId, summary: `${o.ref} cancelled` });
  return c.commit(orderOut(o));
}
const A_isDirector = (c: Ctx) => !!c.current?.roles.some((r) => r === 'director' || r === 'admin');

// ---- B-05 selling prices --------------------------------------------------------------------------------------------------
export async function listPrices(c: Ctx): Promise<SellingPrice[]> {
  start(c); feat(c, 'selling-prices', 'Selling prices are set by the directors');
  return c.wait((m.db.sellingPrices ?? []).filter((p) => c.inScope(p.entityId)).slice().sort((a, b) => (a.from < b.from ? 1 : -1)));
}
export async function setPrice(c: Ctx, input: SellingPriceInput): Promise<SellingPrice> {
  start(c); feat(c, 'selling-prices', 'Selling prices are set by the directors');
  const errs = M.validateSellingPrice(input ?? {}, { productIds: seed.products.map((p) => p.id), warehouseIds: seed.warehouses.map((w) => w.id) });
  if (errs.length) throw c.httpErr(errs.join('; '), 422);
  const entityId = c.writeEntity(input.entityId ?? null);
  const x: SellingPrice = { id: m.uid('sp'), entityId, productId: input.productId, warehouseId: input.warehouseId ?? null, price: Math.round(input.price * 100) / 100, currency: 'USD', from: input.from ?? day(), note: input.note?.trim() || null, byUserId: c.current!.id, at: new Date().toISOString() };
  const before = M.sellingPriceFor(m.db.sellingPrices ?? [], entityId, x.warehouseId, x.productId, x.from);
  (m.db.sellingPrices ??= []).push(x);
  c.log('POST', '/selling-prices', { recordType: 'selling-price', recordId: `${x.productId}/${x.warehouseId ?? 'all'}`, entityId, summary: `${seed.products.find((p) => p.id === x.productId)?.brand}: USD ${x.price} from ${x.from}`, before: { price: before }, after: { price: x.price, from: x.from } });
  return c.commit(x);
}

// ---- B-04 transport fees ----------------------------------------------------------------------------------------------------
export async function fees(c: Ctx) {
  start(c);
  if (!c.current || !R.hasFeature(c.current.roles, 'transport-fees')) throw c.httpErr('Transport fees are for the truck follow-up officer and the directors', 403);
  const shs = m.db.shipments.filter((s) => c.inScope(s.entityId) && c.seesSh(s) && s.legs.length);
  shs.forEach((s) => (s.status = m.deriveShipmentStatus(s)));
  const rx = new Map((m.db.reexports ?? []).filter((o) => o.shipmentId).map((o) => [o.shipmentId!, o]));
  const loadedAt = (id: ID) => {
    const s = shs.find((x) => x.id === id)!;
    return rx.get(id)?.loadedAt ?? m.db.loadings.find((l) => l.poId === s.poId && l.truckNo === s.truckNo && l.status === 'Loaded' && !s.fromWarehouseId)?.loadedAt ?? s.legs[0].passes[0]?.departedAt ?? s.legs[0].departedAt ?? null;
  };
  return c.wait(M.feeRows({ shipments: shs, costs: m.db.costs, payments: m.db.payments, loadedAt, providerOf: (t) => m.db.trucks.find((x) => x.id === t)?.providerId ?? null, now: Date.now(), cfg: c.config, reexportIds: new Set(rx.keys()) }).reverse());
}

// ---- B-06/B-07 combined performance report (directors) ----------------------------------------------------------------------
export async function performance(c: Ctx, f: PerfFilter = {}) {
  start(c); feat(c, 'performance', 'The combined performance report is for the directors');
  if (f.entityId && !c.inScope(f.entityId)) throw c.httpErr('That belongs to another company', 403);
  return c.wait(performanceReport({ ...c.reportData(), expenses: m.db.expenses ?? [], sellingPrices: m.db.sellingPrices ?? [], allocation: c.config.costs?.allocation ?? 'quantity' }, f));
}
