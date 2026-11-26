// Warehouse and money data (docs/14-warehouse-money.md, workstream B): constants, validators, access rules and pure
// calculations shared by the NestJS server, the in-browser mock (lazy chunk mock/money.ts) and the screens.
// Kept out of rules.ts / access.ts so the apps' entry chunks don't grow: only the screens and the mock's lazy module import it.
import type {
  AckLine, Acknowledgement, AppConfig, Currency, FeeFlag, FeeStatus, ID, ReexportOrder, Role, SellingPrice, Shipment, StockAdjustKind,
  StockAdjustment, TransportFeeRow, TripCost, TripPayment, WarehouseExpense, WarehouseExpenseCategory, WarehouseExpenseInput, WarehouseStockRow,
} from './types';
import type { StockMove } from './rules';
import { fxFor } from './rules';
import type { FxRate, Loading, Plan, PurchaseOrder, SupplierEntry, SupplierEntryInput } from './types';

const DAY = 864e5;
const r2 = (x: number) => Math.round(x * 100) / 100;
const has = (u: { roles: Role[] }, ...roles: Role[]) => u.roles.some((r) => roles.includes(r));
const isDirector = (u: { roles: Role[] }) => has(u, 'director', 'admin');

// ---- Lists (to confirm with the client) --------------------------------------------------------------------------
/** B-01 categories from the roles document §9 (+ Other). */
export const WAREHOUSE_EXPENSE_CATEGORIES: WarehouseExpenseCategory[] = ['Offloading', 'Storage', 'Salary', 'Rent', 'Utilities', 'Damaged goods', 'Other'];
/** B-08 shortage / damage reasons (plan 11 Q12, to confirm). */
export const ACK_REASONS = ['Breakage in transit', 'Poor stacking', 'Theft/pilferage', 'Leakage', 'Border inspection', 'Short-loaded at supplier', 'Other'] as const;
export type AckReason = typeof ACK_REASONS[number];
/** B-02 adjustment kinds: label shown to the receiver and the reason stored on the stock move. */
export const ADJUST_KINDS: { kind: StockAdjustKind; label: string; reason: string; sign: 1 | -1 | 0 }[] = [
  { kind: 'count', label: 'Stock count', reason: 'Count difference', sign: 0 },
  { kind: 'damaged', label: 'Damaged write-off', reason: 'Damaged write-off', sign: -1 },
  { kind: 'moved-out', label: 'Moved out (not a sale or re-export)', reason: 'Moved out', sign: -1 },
  { kind: 'found', label: 'Found stock', reason: 'Found', sign: 1 },
];
export const CURRENCIES: Currency[] = ['USD', 'KES', 'UGX', 'TZS', 'RWF'];
/** Re-export lane: Asie's Gisenyi warehouse → Yonas Juba (route "Rwanda → Juba"). */
export const REEXPORT_ROUTE = 'r-kgl-juba';

// ---- Access (roles document §7; docs/14 §2) ---------------------------------------------------------------------
type U = { roles: Role[]; warehouseIds: ID[] };
/** Warehouse expenses and inventory of `wh`: directors all; receivers their own warehouses ("Own"). */
export const seesWarehouse = (u: U, wh: ID) => isDirector(u) || (has(u, 'receiver') && u.warehouseIds.includes(wh));
/** Record an expense / a stock count at `wh`: the warehouse's receiver; directors (Full). */
export const canRecordWarehouse = (u: U, wh: ID) => seesWarehouse(u, wh);
/** Change or delete an expense: directors, or the person who recorded it (own warehouse). */
export const canEditExpense = (u: U & { id?: ID }, e: Pick<WarehouseExpense, 'warehouseId' | 'byUserId'>) => isDirector(u) || (seesWarehouse(u, e.warehouseId) && !!u.id && e.byUserId === u.id);
/** Raise / load a re-export from `wh`: the re-export planner of that warehouse (Asie). */
export const canRaiseReexport = (u: U, wh: ID) => has(u, 'reexport') && u.warehouseIds.includes(wh);
/** Who sees a re-export order: directors, Testfie (follow-up, Q3 to confirm), Asie (from her warehouse), Yonas (to his). */
export const seesReexport = (u: U, o: Pick<ReexportOrder, 'fromWarehouseId' | 'toWarehouseId'>) =>
  isDirector(u) || has(u, 'truck_planner', 'fleet', 'operations') || (has(u, 'receiver', 'reexport') && (u.warehouseIds.includes(o.fromWarehouseId) || u.warehouseIds.includes(o.toWarehouseId)));
/** Selling prices and the combined performance report: directors only (§7, until someone else is named — Q6). */
export const canSetSellingPrice = (u: { roles: Role[] }) => isDirector(u);
/** Transport fees: Testfie and the directors see them; payments are recorded / approved by the directors. */
export const seesTransportFees = (u: { roles: Role[] }) => isDirector(u) || has(u, 'truck_planner', 'fleet', 'operations', 'accounts');

// ---- Validation --------------------------------------------------------------------------------------------------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
/** Problems with an expense form (empty = can be saved). `now` bounds the date (no future expenses beyond tomorrow). */
export function validateExpense(e: Partial<WarehouseExpenseInput>, ctx: { warehouseIds: ID[]; now?: number }): string[] {
  const out: string[] = [];
  if (!ctx.warehouseIds.includes(e.warehouseId as ID)) out.push('Pick the warehouse');
  if (!WAREHOUSE_EXPENSE_CATEGORIES.includes(e.category as WarehouseExpenseCategory)) out.push('Pick the category');
  if (!(typeof e.amount === 'number' && Number.isFinite(e.amount) && e.amount > 0 && e.amount < 1e10)) out.push('Enter the amount (above zero)');
  if (e.currency === undefined || e.currency === null) out.push('Choose the currency');
  else if (!CURRENCIES.includes(e.currency)) out.push('Unknown currency');
  if (typeof e.date !== 'string' || !DATE.test(e.date) || Number.isNaN(Date.parse(e.date))) out.push('Enter the date (YYYY-MM-DD)');
  else if (Date.parse(e.date) > (ctx.now ?? Date.now()) + DAY) out.push('The date cannot be in the future');
  else if (Date.parse(e.date) < (ctx.now ?? Date.now()) - 400 * DAY) out.push('The date is more than a year ago');
  if (e.receiptUrl !== undefined && e.receiptUrl !== null && (typeof e.receiptUrl !== 'string' || e.receiptUrl.length > 400_000)) out.push('The receipt photo is too large');
  for (const k of ['reference', 'note', 'receiptFileId', 'receiptName'] as const) { const v = e[k]; if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > (k === 'note' ? 1000 : 200))) out.push(`${k === 'receiptFileId' || k === 'receiptName' ? 'Receipt' : k[0].toUpperCase() + k.slice(1)} must be text (${k === 'note' ? '1,000' : '200'} characters at most)`); }
  return out;
}
export function validateAdjust(a: { kind?: unknown; qty?: unknown; counted?: unknown; note?: unknown }): string[] {
  const out: string[] = [];
  if (!ADJUST_KINDS.some((k) => k.kind === a.kind)) out.push('Pick what happened: count, damaged, moved out or found');
  if (a.kind === 'count') { if (!(Number.isInteger(a.counted) && (a.counted as number) >= 0 && (a.counted as number) < 1e7)) out.push('Enter the number of cases counted (whole number ≥ 0)'); }
  else if (!(Number.isInteger(a.qty) && (a.qty as number) > 0 && (a.qty as number) < 1e7)) out.push('Enter the number of cases (whole number above zero)');
  if (a.note !== undefined && a.note !== null && (typeof a.note !== 'string' || a.note.length > 500)) out.push('Note must be text (500 characters at most)');
  if ((a.kind === 'moved-out' || a.kind === 'damaged') && !text(a.note)) out.push(a.kind === 'moved-out' ? 'Say where the goods went' : 'Say what was damaged and how');
  return out;
}
/** An acknowledgement line's reason: optional, but if given it must be one of the list. */
export const validAckReason = (r: unknown) => r === undefined || r === null || r === '' || (ACK_REASONS as readonly string[]).includes(r as string);

// ---- Stock adjustments ----------------------------------------------------------------------------------------------
/** The stock move a recorded adjustment becomes (count → the difference to what is held). */
export function adjustmentMove(a: { kind: StockAdjustKind; qty?: number; counted?: number; note?: string }, held: number): { kind: StockMove['kind']; qty: number; reason: string; effect: number } {
  const def = ADJUST_KINDS.find((k) => k.kind === a.kind)!;
  if (a.kind === 'count') { const diff = (a.counted ?? 0) - held; return { kind: 'adjustment', qty: diff, reason: def.reason, effect: diff }; }
  if (a.kind === 'damaged') return { kind: 'damaged', qty: a.qty!, reason: def.reason, effect: -a.qty! };
  if (a.kind === 'moved-out') return { kind: 'adjustment', qty: -a.qty!, reason: def.reason, effect: -a.qty! };
  return { kind: 'adjustment', qty: a.qty!, reason: def.reason, effect: a.qty! };
}
const kindOfReason = (reason?: string | null): StockAdjustKind | null => ADJUST_KINDS.find((k) => k.reason === reason)?.kind ?? null;
/** Recorded adjustments (moves with an adjustment reason), newest first. */
export function adjustmentsOf(moves: StockMove[]): StockAdjustment[] {
  return moves.filter((m) => kindOfReason(m.reason)).map((m) => {
    const kind = kindOfReason(m.reason)!;
    return { entityId: m.entityId, warehouseId: m.warehouseId, productId: m.productId, kind, qty: m.kind === 'damaged' ? -m.qty : m.qty, reason: m.reason!, note: m.note ?? null, at: m.at, byUserId: m.byUserId ?? null, ref: m.ref };
  }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
/** B-02: per company × warehouse × product — received, damaged, short, moved out, re-exported / sent on, sold, adjusted,
 *  held — over [from, to) (opening = everything before `from`). Quantities only. */
export function warehouseStock(moves: StockMove[], acks: Pick<Acknowledgement, 'warehouseId' | 'entityId' | 'at' | 'lines'>[], f: { warehouseIds?: ID[] | null; from?: number; to?: number } = {}): WarehouseStockRow[] {
  const from = f.from ?? 0, to = f.to ?? Infinity;
  const rows = new Map<string, WarehouseStockRow>();
  const inWh = (w: ID) => !f.warehouseIds || f.warehouseIds.includes(w);
  const get = (e: ID, w: ID, p: ID) => {
    const k = `${e}|${w}|${p}`;
    let r = rows.get(k);
    if (!r) rows.set(k, (r = { entityId: e, warehouseId: w, productId: p, opening: 0, received: 0, transfersIn: 0, damaged: 0, short: 0, movedOut: 0, transfersOut: 0, sold: 0, adjusted: 0, held: 0, lastCountAt: null }));
    return r;
  };
  for (const m of moves) {
    if (!inWh(m.warehouseId)) continue;
    const at = Date.parse(m.at); if (at >= to) continue;
    const r = get(m.entityId, m.warehouseId, m.productId);
    const sign = m.kind === 'received' || m.kind === 'transferIn' || m.kind === 'adjustment' ? 1 : -1;
    if (m.reason === 'Count difference' && (!r.lastCountAt || at > Date.parse(r.lastCountAt))) r.lastCountAt = m.at;
    if (at < from) { r.opening += sign * m.qty; continue; }
    if (m.kind === 'received') r.received += m.qty;
    else if (m.kind === 'transferIn') r.transfersIn += m.qty;
    else if (m.kind === 'damaged') r.damaged += m.qty;
    else if (m.kind === 'transferOut') r.transfersOut += m.qty;
    else if (m.kind === 'sold') r.sold += m.qty;
    else if (m.reason === 'Moved out') r.movedOut += -m.qty;
    else r.adjusted += m.qty;
  }
  for (const a of acks) {
    if (!inWh(a.warehouseId)) continue;
    const at = Date.parse(a.at); if (at < from || at >= to) continue;
    for (const l of a.lines) { const s = l.expected - l.received; if (s > 0) get(a.entityId, a.warehouseId, l.productId).short += s; }
  }
  for (const r of rows.values()) r.held = r.opening + r.received + r.transfersIn - r.damaged - r.transfersOut - r.sold - r.movedOut + r.adjusted;
  return [...rows.values()];
}

// ---- Expenses -------------------------------------------------------------------------------------------------------
/** Monthly totals (USD) per category and warehouse — the expense screens' summary and stacked columns. */
export function expenseSummary(rows: Pick<WarehouseExpense, 'date' | 'category' | 'amountUsd' | 'warehouseId'>[]) {
  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
  const byMonth = months.map((m) => {
    const xs = rows.filter((r) => r.date.startsWith(m));
    const byCategory = Object.fromEntries(WAREHOUSE_EXPENSE_CATEGORIES.map((c) => [c, r2(xs.filter((x) => x.category === c).reduce((a, x) => a + x.amountUsd, 0))])) as Record<WarehouseExpenseCategory, number>;
    return { month: m, total: r2(xs.reduce((a, x) => a + x.amountUsd, 0)), byCategory };
  });
  const byCategory = WAREHOUSE_EXPENSE_CATEGORIES.map((c) => ({ category: c, total: r2(rows.filter((x) => x.category === c).reduce((a, x) => a + x.amountUsd, 0)) })).filter((x) => x.total > 0);
  const warehouses = [...new Set(rows.map((r) => r.warehouseId))];
  const byWarehouse = warehouses.map((w) => ({ warehouseId: w, total: r2(rows.filter((x) => x.warehouseId === w).reduce((a, x) => a + x.amountUsd, 0)) }));
  return { months, byMonth, byCategory, byWarehouse, total: r2(rows.reduce((a, x) => a + x.amountUsd, 0)), count: rows.length };
}
export const filterExpenses = <T extends Pick<WarehouseExpense, 'warehouseId' | 'date' | 'category'>>(rows: T[], f: { warehouseId?: ID; from?: string; to?: string; category?: string }) =>
  rows.filter((r) => (!f.warehouseId || r.warehouseId === f.warehouseId) && (!f.from || r.date >= f.from.slice(0, 10)) && (!f.to || r.date <= f.to.slice(0, 10)) && (!f.category || r.category === f.category))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

// ---- Re-exports -------------------------------------------------------------------------------------------------------
/** "ASIE-RX-2026-0001": the receiving company's first word, RX, year, running number. */
export function nextReexportRef(existing: string[], companyName: string, year: number): string {
  const prefix = `${(companyName.split(/\s+/)[0] || 'RX').toUpperCase().replace(/[^A-Z0-9]/g, '')}-RX-${year}-`;
  const n = existing.filter((r) => r.startsWith(prefix)).map((r) => Number(r.slice(prefix.length)) || 0);
  return `${prefix}${String(Math.max(0, ...n) + 1).padStart(4, '0')}`;
}
/** Order status from its shipment: Loaded → In transit (dispatched) → Delivered (acknowledged). */
export function reexportStatus(o: Pick<ReexportOrder, 'status'>, sh?: Pick<Shipment, 'status' | 'legs'> | null): ReexportOrder['status'] {
  if (o.status === 'Open' || o.status === 'Cancelled' || !sh) return o.status;
  if (sh.status === 'Acknowledged') return 'Delivered';
  if (sh.legs.some((l) => l.departedAt || l.passes?.[0]?.departedAt)) return 'In transit';
  return 'Loaded';
}

// ---- Transport fees (B-04) ----------------------------------------------------------------------------------------------
export const feesConfig = (c?: Pick<AppConfig, 'fees'> | null) => ({ amberDays: c?.fees?.amberDays ?? 14, redDays: c?.fees?.redDays ?? 30 });
/** Paid / part paid / unpaid against the agreed transport price (USD); "not recorded" when no agreed price yet. */
export function feeStatus(agreedUsd: number | null, paidUsd: number): FeeStatus {
  if (agreedUsd === null) return 'Not recorded';
  if (paidUsd >= agreedUsd - 0.01) return 'Paid';
  return paidUsd > 0 ? 'Part paid' : 'Unpaid';
}
/** Ageing flag: amber after `amberDays`, red after `redDays` since loading while a balance is open (config [fees], to confirm Q9). */
export function feeFlag(status: FeeStatus, ageDays: number, cfg: { amberDays: number; redDays: number }): FeeFlag {
  if (status === 'Paid') return 'ok';
  if (status === 'Not recorded') return 'none';
  return ageDays >= cfg.redDays ? 'red' : ageDays >= cfg.amberDays ? 'amber' : 'ok';
}
/** Fee rows for trips: Transport cost lines vs payments (Paid only; pending approvals shown apart). */
export function feeRows(input: {
  shipments: (Pick<Shipment, 'id' | 'ref' | 'entityId' | 'legs' | 'warehouseId' | 'status'> & { fromWarehouseId?: ID | null; poId?: ID })[];
  costs: TripCost[]; payments: TripPayment[]; loadedAt: (shipmentId: ID) => string | null; providerOf: (truckId: ID) => ID | null; now: number; cfg?: Pick<AppConfig, 'fees'> | null; reexportIds?: Set<ID>;
}): TransportFeeRow[] {
  const cfg = feesConfig(input.cfg);
  return input.shipments.map((s) => {
    const costs = input.costs.filter((c) => c.shipmentId === s.id).map((c) => ({ id: c.id, legId: c.legId, kind: c.kind, amount: c.amount, currency: c.currency, amountUsd: c.amountUsd ?? c.amount, docRef: c.docRef }));
    const transport = costs.filter((c) => c.kind === 'Transport');
    const tIds = new Set(transport.map((c) => c.id));
    const pays = input.payments.filter((p) => p.shipmentId === s.id && tIds.has(p.costId));
    const agreedUsd = transport.length ? r2(transport.reduce((a, c) => a + c.amountUsd, 0)) : null;
    const paidUsd = r2(pays.filter((p) => p.status !== 'Pending approval').reduce((a, p) => a + (p.amountUsd ?? p.amount), 0));
    const pendingUsd = r2(pays.filter((p) => p.status === 'Pending approval').reduce((a, p) => a + (p.amountUsd ?? p.amount), 0));
    const loadedAt = input.loadedAt(s.id);
    const ageDays = loadedAt ? Math.max(0, Math.floor((input.now - Date.parse(loadedAt)) / DAY)) : 0;
    const status = feeStatus(agreedUsd, paidUsd);
    const leg0 = s.legs[0];
    return {
      shipmentId: s.id, ref: s.ref, entityId: s.entityId, truckId: leg0?.truckId ?? '', providerId: leg0 ? input.providerOf(leg0.truckId) : null, routeId: leg0?.routeId ?? '', warehouseId: s.warehouseId,
      loadedAt, ageDays, agreed: transport.length ? { amount: transport.reduce((a, c) => a + c.amount, 0), currency: transport[0].currency } : null,
      agreedUsd, paidUsd, pendingUsd, balanceUsd: agreedUsd === null ? null : r2(agreedUsd - paidUsd), status, flag: feeFlag(status, ageDays, cfg),
      references: [...new Set([...pays.map((p) => p.reference), ...transport.map((c) => c.docRef ?? '')].filter(Boolean))],
      ...(input.reexportIds?.has(s.id) ? { reexport: true } : {}),
      costs, legs: s.legs.map((l) => ({ id: l.id, seq: l.seq, routeId: l.routeId, status: l.status })),
    };
  });
}
/** Ageing bands for the fee chart: open balances (USD) per provider in 0–13, 14–29, 30+ days (with the configured limits). */
export function feeAgeing(rows: TransportFeeRow[], cfg?: Pick<AppConfig, 'fees'> | null) {
  const c = feesConfig(cfg);
  const open = rows.filter((r) => (r.status === 'Unpaid' || r.status === 'Part paid') && (r.balanceUsd ?? 0) > 0);
  const providers = [...new Set(open.map((r) => r.providerId ?? '—'))];
  const band = (lo: number, hi: number) => providers.map((p) => r2(open.filter((r) => (r.providerId ?? '—') === p && r.ageDays >= lo && r.ageDays < hi).reduce((a, r) => a + (r.balanceUsd ?? 0), 0)));
  return { providers, bands: [{ name: `Under ${c.amberDays} days`, values: band(0, c.amberDays) }, { name: `${c.amberDays}–${c.redDays - 1} days`, values: band(c.amberDays, c.redDays) }, { name: `${c.redDays}+ days`, values: band(c.redDays, Infinity) }] };
}

// ---- Selling prices (B-05) -------------------------------------------------------------------------------------------------
/** The price in force on `at` (YYYY-MM-DD or ISO): the warehouse's own price, else the company-wide one; latest `from` wins. */
export function sellingPriceFor(prices: Pick<SellingPrice, 'entityId' | 'productId' | 'warehouseId' | 'price' | 'from' | 'at'>[], entityId: ID, warehouseId: ID | null, productId: ID, at: string = new Date().toISOString()): number | null {
  const day = at.slice(0, 10);
  const pick = (wh: ID | null) => prices.filter((p) => p.entityId === entityId && p.productId === productId && (p.warehouseId ?? null) === wh && p.from <= day)
    .sort((a, b) => (a.from === b.from ? Date.parse(b.at) - Date.parse(a.at) : a.from < b.from ? 1 : -1))[0];
  return (warehouseId ? pick(warehouseId) : undefined)?.price ?? pick(null)?.price ?? null;
}
/** Any company's price for a product at a warehouse (sales screens default the line price from it). */
export const sellingPriceAny = (prices: SellingPrice[], entityIds: ID[], warehouseId: ID, productId: ID, at?: string) => {
  for (const e of entityIds) { const p = sellingPriceFor(prices, e, warehouseId, productId, at); if (p !== null) return p; }
  return null;
};
/** Target-margin helper (roles document §6.4): price needed = landed cost per unit ÷ (1 − target margin). */
export function priceForMargin(landedPerUnit: number, targetMargin: number): number | null {
  if (!(landedPerUnit > 0) || !(targetMargin < 1) || !(targetMargin > -10)) return null;
  return r2(landedPerUnit / (1 - targetMargin));
}
/** Margin of a price over the landed cost per unit: (price − landed) ÷ price. */
export const marginAt = (price: number, landedPerUnit: number) => (price > 0 ? (price - landedPerUnit) / price : null);
export function validateSellingPrice(x: { productId?: unknown; price?: unknown; from?: unknown; warehouseId?: unknown; note?: unknown }, ctx: { productIds: ID[]; warehouseIds: ID[] }): string[] {
  const out: string[] = [];
  if (!ctx.productIds.includes(x.productId as ID)) out.push('Pick the product');
  if (!(typeof x.price === 'number' && Number.isFinite(x.price) && x.price > 0 && x.price < 1e7)) out.push('Enter the selling price (above zero)');
  if (x.from !== undefined && (typeof x.from !== 'string' || !DATE.test(x.from) || Number.isNaN(Date.parse(x.from)))) out.push('Effective date must be YYYY-MM-DD');
  if (x.warehouseId !== undefined && x.warehouseId !== null && !ctx.warehouseIds.includes(x.warehouseId as ID)) out.push('Unknown warehouse');
  if (x.note !== undefined && x.note !== null && (typeof x.note !== 'string' || x.note.length > 300)) out.push('Note must be text (300 characters at most)');
  return out;
}

// ---- Delivery losses (B-08 → C-X-03 Pareto) ------------------------------------------------------------------------------------
/** Cases lost (short + damaged) per reason over acknowledgements; lines with a loss and no reason count as "Not given". */
export function lossByReason(acks: Pick<Acknowledgement, 'lines'>[]): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const a of acks) for (const l of a.lines as AckLine[]) {
    const lost = (l.expected - l.received) + l.damaged;
    if (lost <= 0) continue;
    const k = l.reason || 'Not given';
    m.set(k, (m.get(k) ?? 0) + lost);
  }
  return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}


// ---- V3-12 step 3: supplier money ------------------------------------------------------------------------------------
/** One short line on a loaded truck: ordered − loaded × the PO line price, USD at the average rate of the loading month.
 *  That value stays with the supplier (Management → Supplier balances; the PO page). */
export interface ShortLoadRow { id: string; at: string; poId: ID; poRef: string; entityId: ID; supplierId: ID; productId: ID; ordered: number; loaded: number; short: number; value: number }
export function shortLoadRows(d: { loadings: Loading[]; pos: PurchaseOrder[]; plans: Plan[]; fxRates?: FxRate[] }): ShortLoadRow[] {
  const pos = new Map(d.pos.map((p) => [p.id, p]));
  const plans = new Map(d.plans.map((p) => [p.id, p]));
  const rows: ShortLoadRow[] = [];
  for (const l of d.loadings) {
    if (l.status !== 'Loaded' || !l.loadedAt) continue;
    const po = pos.get(l.poId); if (!po) continue;
    const plan = plans.get(po.planId);
    for (const x of l.lines) {
      const short = Math.max(0, x.orderedQty - x.loadedQty);
      if (!short || x.alternativeFor) continue;
      const price = plan?.lines.find((y) => y.id === x.planLineId)?.price ?? 0;
      const value = r2((short * price) / (po.currency === 'USD' ? 1 : fxFor(d.fxRates ?? [], po.currency, l.loadedAt, 'avg')));
      rows.push({ id: `${l.id}:${x.planLineId}`, at: l.loadedAt, poId: po.id, poRef: po.ref, entityId: po.entityId, supplierId: po.supplierId, productId: x.productId, ordered: x.orderedQty, loaded: x.loadedQty, short, value });
    }
  }
  return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
/** What a supplier holds for one company (USD): short loads + credit notes − money used on advances. Pending uses are
 *  set aside, so the same money can't be used twice while a director decides. */
export function supplierHeld(shorts: ShortLoadRow[], entries: SupplierEntry[], entityId: ID, supplierId: ID) {
  const mine = (x: { entityId: ID; supplierId: ID }) => x.entityId === entityId && x.supplierId === supplierId;
  const es = entries.filter(mine);
  const shortLoads = r2(shorts.filter(mine).reduce((a, x) => a + x.value, 0));
  const creditNotes = r2(es.filter((e) => e.kind === 'credit-note' && e.status === 'Recorded').reduce((a, e) => a + e.amountUsd, 0));
  const used = r2(es.filter((e) => e.kind === 'use' && e.status === 'Recorded').reduce((a, e) => a + e.amountUsd, 0));
  const pendingUse = r2(es.filter((e) => e.kind === 'use' && e.status === 'Pending approval').reduce((a, e) => a + e.amountUsd, 0));
  const balance = r2(shortLoads + creditNotes - used);
  return { shortLoads, creditNotes, used, pendingUse, balance, available: r2(balance - pendingUse) };
}
/** One PO's pro-forma and what is paid against it (PO currency): advances + uses, recorded or waiting for a director. */
export function poMoney(entries: SupplierEntry[], poId: ID) {
  const es = entries.filter((e) => e.poId === poId && e.status !== 'Rejected');
  const sumOf = (f: (e: SupplierEntry) => boolean) => r2(es.filter(f).reduce((a, e) => a + e.amount, 0));
  const proforma = sumOf((e) => e.kind === 'proforma');
  const advances = sumOf((e) => (e.kind === 'advance' || e.kind === 'use') && e.status === 'Recorded');
  const pending = sumOf((e) => (e.kind === 'advance' || e.kind === 'use') && e.status === 'Pending approval');
  return { proforma, advances, pending, open: r2(Math.max(0, proforma - advances - pending)) };
}
/** Who records supplier money: directors, accounts, the system administrator, and the planner of that buyer–supplier pair. */
export const canRecordSupplierMoney = (u: { roles: Role[]; pairs?: { entityId: ID; supplierId: ID }[] }, entityId: ID, supplierId: ID) =>
  has(u, 'director', 'accounts', 'admin') || (has(u, 'planner') && (!u.pairs?.length || u.pairs.some((p) => p.entityId === entityId && p.supplierId === supplierId)));
/** Checks a pro-forma / advance / credit note. `usd(x)` converts PO currency to USD at the entry date. Returns the error or null. */
export function supplierEntryError(input: Partial<SupplierEntryInput>, po: { proforma: number; open: number }, available: number, usd: (x: number) => number): string | null {
  const amt = Number(input.amount ?? 0), use = Number(input.useHeld ?? 0);
  if (!['proforma', 'advance', 'credit-note'].includes(String(input.kind))) return 'Pick what you are recording';
  if (!(amt >= 0) || !(use >= 0) || !Number.isFinite(amt) || !Number.isFinite(use)) return 'Amounts must be numbers of zero or more';
  if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return 'Give the date as YYYY-MM-DD';
  if (input.kind === 'proforma' || input.kind === 'credit-note') return amt > 0 ? null : 'Enter the amount';
  if (!(amt + use > 0)) return 'Enter the amount paid';
  if (!(po.proforma > 0)) return 'Add the supplier\'s pro-forma first: an advance is paid against it';
  if (use > 0 && usd(use) > available + 0.005) return `The supplier holds USD ${available.toFixed(2)} for this company`;
  if (amt + use > po.open + 0.005) return `That is more than the open pro-forma (${po.open.toFixed(2)})`;
  return null;
}
