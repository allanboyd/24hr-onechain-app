// Landed cost v2 (B-06) and the combined performance report with profit margins (B-07) — roles document §6.2–6.4,
// docs/14-warehouse-money.md. Pure functions shared by the NestJS server and the in-browser mock (lazy chunk), next to
// reports.ts (kept in its own module so the apps' entry chunks don't grow).
//
//   goods cost      = cases loaded × PO price (onward / re-exported goods: the landed cost per case at the warehouse they left)
//   truck cost      = every trip cost of the shipment (transport, duties, clearing, loading, storage, other — all legs),
//                     split over its products by cases ("quantity") or by goods value ("value"), config [costs] allocation
//   warehouse share = the warehouse's expenses of the month ÷ what it received that month (good cases, or value), × the line's share
//   quantity received = received − damaged (short cases are never received)
//   landed cost per unit = (goods + truck + warehouse share) ÷ quantity received
//   profit = revenue − landed cost of the units sold · margin % = profit ÷ revenue
//   price for a target margin = landed cost per unit ÷ (1 − target margin)
import { resolvePeriod, scopeReportData, type ReportData, type ReportFilter } from './reports';
import { priceForMargin, sellingPriceFor } from './money';
import type {
  Acknowledgement, CostAllocation, ID, Plan, PriceListItem, PurchaseOrder, SellingPrice, Shipment, TripCost, Warehouse, WarehouseExpense,
} from './types';

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const DAY = 864e5;

// ======================================================================================================
// LANDED COST V2
// ======================================================================================================
export interface LandedInput {
  shipments: Shipment[]; acks: Acknowledgement[]; /** USD (amountUsd) */ costs: Pick<TripCost, 'shipmentId' | 'amount' | 'amountUsd' | 'kind'>[];
  plans: Pick<Plan, 'id' | 'lines'>[]; pos: Pick<PurchaseOrder, 'id' | 'planId'>[]; priceList: Pick<PriceListItem, 'productId' | 'price'>[];
  expenses: Pick<WarehouseExpense, 'warehouseId' | 'date' | 'amountUsd'>[]; allocation?: CostAllocation;
}
/** One product line of one received shipment, with its landed cost. */
export interface ReceiptLine {
  shipmentId: ID; ref: string; entityId: ID; warehouseId: ID; fromWarehouseId: ID | null; productId: ID; truckId: ID; at: string; month: string;
  loaded: number; received: number; damaged: number; short: number; /** received − damaged */ good: number;
  goodsUnit: number; goods: number; truck: number; warehouse: number; total: number; perUnit: number | null;
  /** goods that came from another of our warehouses (send-on or re-export) */ transfer: boolean; reexport: boolean;
}
export interface WarehouseRate { warehouseId: ID; month: string; expenses: number; base: number; rate: number | null }
export interface LandedResult { lines: ReceiptLine[]; rates: WarehouseRate[]; unallocated: { warehouseId: ID; month: string; amount: number }[]; allocation: CostAllocation }

const finalAck = (sh: Shipment, acks: Map<ID, Acknowledgement>) => { const last = sh.legs.at(-1); return last?.ackId ? acks.get(last.ackId) : undefined; };

export function landedCostV2(x: LandedInput): LandedResult {
  const allocation: CostAllocation = x.allocation === 'value' ? 'value' : 'quantity';
  const ackById = new Map(x.acks.map((a) => [a.id, a]));
  const planOfPo = new Map(x.pos.map((p) => [p.id, x.plans.find((q) => q.id === p.planId)]));
  const list = new Map(x.priceList.map((p) => [p.productId, p.price]));
  const costOf = new Map<ID, number>();
  for (const c of x.costs) costOf.set(c.shipmentId, (costOf.get(c.shipmentId) ?? 0) + (c.amountUsd ?? c.amount));
  const byId = new Map(x.shipments.map((s) => [s.id, s]));
  const done = x.shipments.map((sh) => ({ sh, ack: finalAck(sh, ackById) })).filter((d): d is { sh: Shipment; ack: Acknowledgement } => !!d.ack)
    .sort((a, b) => Date.parse(a.ack.at) - Date.parse(b.ack.at));
  const expByWm = new Map<string, number>();
  for (const e of x.expenses) { const k = `${e.warehouseId}|${e.date.slice(0, 7)}`; expByWm.set(k, (expByWm.get(k) ?? 0) + e.amountUsd); }
  const poPrice = (sh: Shipment, pid: ID): number => {
    let cur: Shipment | undefined = sh;
    for (let i = 0; cur?.parentShipmentId && i < 10; i++) cur = byId.get(cur.parentShipmentId);
    return planOfPo.get(cur?.poId ?? sh.poId)?.lines.find((l) => l.productId === pid)?.price ?? list.get(pid) ?? 0;
  };
  // Onward and re-exported goods take the landed cost per case of the warehouse they left, which itself includes that
  // warehouse's share of expenses — so the calculation is repeated until the chain (supplier → warehouse → warehouse) settles.
  let unitOf = new Map<string, number>(); // shipmentId|productId → per unit (previous pass)
  let avgOf = new Map<string, number>();  // entity|warehouse|product → average per unit of goods received there (previous pass)
  let out: LandedResult = { lines: [], rates: [], unallocated: [], allocation };
  for (let pass = 0; pass < 4; pass++) {
    const lines: ReceiptLine[] = [];
    for (const { sh, ack } of done) {
      const loadedOf = new Map((sh.legs[0]?.lines ?? []).map((l) => [l.productId, l.loadedQty]));
      const reexport = !sh.parentShipmentId && !!sh.fromWarehouseId;
      const own = ack.lines.map((l) => {
        const loaded = loadedOf.get(l.productId) ?? l.expected;
        const goodsUnit = sh.parentShipmentId ? unitOf.get(`${sh.parentShipmentId}|${l.productId}`) ?? poPrice(sh, l.productId)
          : reexport ? avgOf.get(`${sh.entityId}|${sh.fromWarehouseId}|${l.productId}`) ?? list.get(l.productId) ?? 0
          : poPrice(sh, l.productId);
        return {
          shipmentId: sh.id, ref: sh.ref, entityId: sh.entityId, warehouseId: ack.warehouseId, fromWarehouseId: sh.fromWarehouseId ?? null, productId: l.productId,
          truckId: sh.legs[0]?.truckId ?? '', at: ack.at, month: ack.at.slice(0, 7), loaded, received: l.received, damaged: l.damaged, short: Math.max(0, l.expected - l.received),
          good: Math.max(0, l.received - l.damaged), goodsUnit, goods: loaded * goodsUnit, truck: 0, warehouse: 0, total: 0, perUnit: null as number | null,
          transfer: !!sh.fromWarehouseId, reexport,
        };
      });
      const truck = costOf.get(sh.id) ?? 0;
      const base = allocation === 'value' ? sum(own, (l) => l.goods) : sum(own, (l) => l.loaded);
      for (const l of own) l.truck = base > 0 ? truck * (allocation === 'value' ? l.goods : l.loaded) / base : (own.length ? truck / own.length : 0);
      lines.push(...own);
    }
    // warehouse expenses of each month over what that warehouse received that month
    const baseWm = new Map<string, number>();
    for (const l of lines) { const k = `${l.warehouseId}|${l.month}`; baseWm.set(k, (baseWm.get(k) ?? 0) + (allocation === 'value' ? l.goods + l.truck : l.good)); }
    const rates: WarehouseRate[] = []; const unallocated: LandedResult['unallocated'] = [];
    for (const k of new Set([...expByWm.keys(), ...baseWm.keys()])) {
      const [warehouseId, month] = k.split('|'); const expenses = expByWm.get(k) ?? 0; const b = baseWm.get(k) ?? 0;
      rates.push({ warehouseId, month, expenses: r2(expenses), base: r2(b), rate: b > 0 ? expenses / b : null });
      if (expenses > 0 && !(b > 0)) unallocated.push({ warehouseId, month, amount: r2(expenses) });
    }
    const rateOf = new Map(rates.map((r) => [`${r.warehouseId}|${r.month}`, r.rate ?? 0]));
    for (const l of lines) {
      l.warehouse = (rateOf.get(`${l.warehouseId}|${l.month}`) ?? 0) * (allocation === 'value' ? l.goods + l.truck : l.good);
      l.total = l.goods + l.truck + l.warehouse;
      l.perUnit = l.good > 0 ? l.total / l.good : null;
    }
    unitOf = new Map(lines.filter((l) => l.perUnit !== null).map((l) => [`${l.shipmentId}|${l.productId}`, l.perUnit!]));
    const acc = new Map<string, { t: number; q: number }>();
    for (const l of lines) { if (l.reexport) continue; const k = `${l.entityId}|${l.warehouseId}|${l.productId}`; const a = acc.get(k) ?? { t: 0, q: 0 }; a.t += l.total; a.q += l.good; acc.set(k, a); }
    avgOf = new Map([...acc].filter(([, a]) => a.q > 0).map(([k, a]) => [k, a.t / a.q]));
    out = { lines, rates: rates.sort((a, b) => (a.month + a.warehouseId).localeCompare(b.month + b.warehouseId)), unallocated, allocation };
  }
  for (const l of out.lines) { l.goodsUnit = r4(l.goodsUnit); l.goods = r2(l.goods); l.truck = r2(l.truck); l.warehouse = r2(l.warehouse); l.total = r2(l.total); l.perUnit = l.perUnit === null ? null : r4(l.perUnit); }
  return out;
}

/** Landed cost per truck (shipment): sums of its lines. */
export function landedByTruck(lines: ReceiptLine[]) {
  const m = new Map<ID, { shipmentId: ID; ref: string; entityId: ID; warehouseId: ID; truckId: ID; at: string; transfer: boolean; reexport: boolean; loaded: number; good: number; goods: number; truck: number; warehouse: number; total: number; perUnit: number | null }>();
  for (const l of lines) {
    const t = m.get(l.shipmentId) ?? { shipmentId: l.shipmentId, ref: l.ref, entityId: l.entityId, warehouseId: l.warehouseId, truckId: l.truckId, at: l.at, transfer: l.transfer, reexport: l.reexport, loaded: 0, good: 0, goods: 0, truck: 0, warehouse: 0, total: 0, perUnit: null };
    t.loaded += l.loaded; t.good += l.good; t.goods += l.goods; t.truck += l.truck; t.warehouse += l.warehouse; t.total += l.total;
    m.set(l.shipmentId, t);
  }
  return [...m.values()].map((t) => ({ ...t, goods: r2(t.goods), truck: r2(t.truck), warehouse: r2(t.warehouse), total: r2(t.total), perUnit: t.good ? r4(t.total / t.good) : null }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

// ======================================================================================================
// COMBINED PERFORMANCE REPORT (directors)
// ======================================================================================================
export type PerfLevel = 'product' | 'warehouse' | 'company' | 'receiving' | 'business';
export interface PerfFilter extends ReportFilter { level?: PerfLevel; /** 0.2 = 20 % */ targetMargin?: number; receivingCompanyId?: ID }
export interface PerformanceData extends ReportData { expenses?: WarehouseExpense[]; sellingPrices?: SellingPrice[]; allocation?: CostAllocation; receivingCompanies?: { id: ID; name: string }[] }
export interface PerfRow {
  key: string; label: string; entityId?: ID; warehouseId?: ID; productId?: ID; receivingCompanyId?: ID;
  qtyReceived: number; goodsCost: number; truckCost: number; warehouseCost: number; landedCost: number; landedPerUnit: number | null;
  sellingPrice: number | null; avgSalePrice: number | null; qtySold: number; revenue: number;
  cogs: number; cogsGoods: number; cogsTruck: number; cogsWarehouse: number; profit: number; margin: number | null;
  stockOnHand: number; stockValue: number | null; priceForTarget: number | null; marginAtPrice: number | null;
  /** cost of units sold uses an estimate (no receipts with a landed cost for this product yet) */ estimated: boolean;
}
export interface FastSlow { productId: ID; perDay: number; held: number; cover: number | null; qtySold: number }
export interface PerformanceReport {
  generatedAt: string; from: string; to: string; level: PerfLevel; allocation: CostAllocation; targetMargin: number; method: string;
  rows: PerfRow[]; totals: PerfRow;
  /** Revenue → goods → truck → warehouse → other → profit (USD) */ waterfall: { label: string; value: number; kind: 'total' | 'step' }[];
  /** warehouse expenses of months with no goods received (not in any landed cost) */ otherCosts: number; netProfit: number;
  byTruck: ReturnType<typeof landedByTruck>; fast: FastSlow[]; slow: FastSlow[];
  rates: WarehouseRate[];
}
export const PERFORMANCE_METHOD = 'Landed cost = goods (cases loaded × PO price) + truck costs of the shipment (all legs; split by cases or value) + the warehouse\'s monthly expenses spread over what it received that month, ÷ cases received good (received − damaged). Cost of units sold = cases sold × landed cost per case (this period\'s receipts, else all receipts of that product there, else of the product anywhere; else list price × 1.21, marked estimated). Profit = revenue − cost of units sold; margin = profit ÷ revenue. Goods moved between our own warehouses count once in company and business totals (their extra truck and warehouse costs are kept). Other = warehouse expenses of months with no goods received.';

const blank = (key: string, label: string): PerfRow => ({ key, label, qtyReceived: 0, goodsCost: 0, truckCost: 0, warehouseCost: 0, landedCost: 0, landedPerUnit: null, sellingPrice: null, avgSalePrice: null, qtySold: 0, revenue: 0, cogs: 0, cogsGoods: 0, cogsTruck: 0, cogsWarehouse: 0, profit: 0, margin: null, stockOnHand: 0, stockValue: null, priceForTarget: null, marginAtPrice: null, estimated: false });

export function performanceReport(raw: PerformanceData, f: PerfFilter = {}): PerformanceReport {
  const dt = scopeReportData(raw, f) as PerformanceData;
  const now = dt.now;
  const def = resolvePeriod('last-90', now);
  const from = f.from ? Date.parse(f.from) : Date.parse(def.from), to = f.to ? Date.parse(f.to) : Date.parse(def.to);
  const level: PerfLevel = f.level ?? 'product';
  const tm = typeof f.targetMargin === 'number' && f.targetMargin > -1 && f.targetMargin < 1 ? f.targetMargin : 0.2;
  const whOk = (w: ID) => !f.warehouseId || w === f.warehouseId;
  const rcOf = new Map((dt.warehouses as Warehouse[]).map((w) => [w.id, w.receivingCompanyId]));
  const rcOk = (w: ID) => !f.receivingCompanyId || rcOf.get(w) === f.receivingCompanyId;
  const pOk = (p: ID) => !f.productId || p === f.productId;
  const landed = landedCostV2({ shipments: dt.shipments, acks: dt.acks, costs: dt.costs, plans: dt.plans, pos: dt.pos, priceList: dt.priceList, expenses: raw.expenses ?? [], allocation: raw.allocation });
  const all = landed.lines;
  const inPeriod = all.filter((l) => { const t = Date.parse(l.at); return t >= from && t < to && whOk(l.warehouseId) && rcOk(l.warehouseId) && pOk(l.productId); });

  // unit cost for cost of units sold: period receipts at the key → all receipts at the key → the product anywhere → estimate
  type Unit = { u: number; g: number; t: number; w: number; est: boolean };
  const agg = (xs: typeof all) => { const q = sum(xs, (l) => l.good); return q > 0 ? { u: sum(xs, (l) => l.total) / q, g: sum(xs, (l) => l.goods) / q, t: sum(xs, (l) => l.truck) / q, w: sum(xs, (l) => l.warehouse) / q, est: false } : null; };
  const group = <K>(xs: typeof all, k: (l: typeof all[number]) => K) => { const m = new Map<K, typeof all>(); for (const l of xs) { const key = k(l); m.set(key, [...(m.get(key) ?? []), l]); } return m; };
  const periodBy = group(inPeriod, (l) => `${l.entityId}|${l.warehouseId}|${l.productId}`);
  const allBy = group(all, (l) => `${l.entityId}|${l.warehouseId}|${l.productId}`);
  const prodBy = group(all, (l) => l.productId);
  const listPrice = new Map(dt.priceList.map((p) => [p.productId, p.price]));
  const unitCache = new Map<string, Unit>();
  const unitFor = (e: ID, w: ID, p: ID): Unit => {
    const k = `${e}|${w}|${p}`; const c = unitCache.get(k); if (c) return c;
    const u = agg(periodBy.get(k) ?? []) ?? agg(allBy.get(k) ?? []) ?? agg(prodBy.get(p) ?? []) ?? (() => { const lp = (listPrice.get(p) ?? 0) * 1.21; return { u: lp, g: lp / 1.21, t: lp - lp / 1.21, w: 0, est: true }; })();
    unitCache.set(k, u); return u;
  };

  // base grain: company × warehouse × product
  const base = new Map<string, PerfRow & { _from: (ID | null)[] }>();
  const row = (e: ID, w: ID, p: ID) => { const k = `${e}|${w}|${p}`; let r = base.get(k); if (!r) base.set(k, (r = { ...blank(k, k), entityId: e, warehouseId: w, productId: p, receivingCompanyId: rcOf.get(w), _from: [] })); return r; };
  const receipts: { r: ReturnType<typeof row>; l: typeof all[number] }[] = [];
  for (const l of inPeriod) receipts.push({ r: row(l.entityId, l.warehouseId, l.productId), l });
  for (const s of dt.sales) {
    const t = Date.parse(s.at); if (t < from || t >= to || !whOk(s.warehouseId) || !rcOk(s.warehouseId)) continue;
    for (const ln of s.lines) {
      if (!pOk(ln.productId)) continue;
      const r = row(s.entityId, s.warehouseId, ln.productId); const u = unitFor(s.entityId, s.warehouseId, ln.productId);
      r.qtySold += ln.qty; r.revenue += ln.qty * ln.price; r.cogs += ln.qty * u.u; r.cogsGoods += ln.qty * u.g; r.cogsTruck += ln.qty * u.t; r.cogsWarehouse += ln.qty * u.w; r.estimated ||= u.est;
    }
  }
  for (const st of dt.stock) {
    if (!whOk(st.warehouseId) || !rcOk(st.warehouseId) || !pOk(st.productId) || !st.closing) continue;
    const r = row(st.entityId, st.warehouseId, st.productId); r.stockOnHand += st.closing;
  }
  const prices = raw.sellingPrices ?? [];
  const today = new Date(now).toISOString();

  // groups by level; goods moved between warehouses of the same group count once (their qty and goods cost are dropped)
  const allWh = (dt.warehouses as Warehouse[]).map((w) => w.id);
  const scopeWh = (r: PerfRow): ID[] => {
    if (level === 'warehouse') return [r.warehouseId!];
    if (level === 'receiving') return allWh.filter((w) => rcOf.get(w) === r.receivingCompanyId && whOk(w));
    return allWh.filter(whOk);
  };
  const keyOf = (r: PerfRow) => (level === 'product' ? r.productId! : level === 'warehouse' ? r.warehouseId! : level === 'company' ? r.entityId! : level === 'receiving' ? r.receivingCompanyId ?? '—' : 'all');
  const labelOf = (r: PerfRow) => keyOf(r); // screens resolve names
  const groups = new Map<string, PerfRow>();
  const sellers = new Map<string, Set<number | null>>();
  const add = (g: PerfRow, r: PerfRow) => {
    for (const k of ['qtySold', 'revenue', 'cogs', 'cogsGoods', 'cogsTruck', 'cogsWarehouse', 'stockOnHand'] as const) g[k] += r[k];
    g.estimated ||= r.estimated;
  };
  for (const r of base.values()) {
    const k = keyOf(r);
    let g = groups.get(k);
    if (!g) { g = { ...blank(k, labelOf(r)) }; if (level === 'product') g.productId = r.productId; if (level === 'warehouse') { g.warehouseId = r.warehouseId; g.receivingCompanyId = r.receivingCompanyId; } if (level === 'company') g.entityId = r.entityId; if (level === 'receiving') g.receivingCompanyId = r.receivingCompanyId; groups.set(k, g); }
    add(g, r);
    const sp = sellingPriceFor(prices, r.entityId!, r.warehouseId!, r.productId!, today);
    const set = sellers.get(k) ?? new Set(); set.add(sp); sellers.set(k, set);
  }
  for (const { r, l } of receipts) {
    const g = groups.get(keyOf(r))!;
    const internal = l.transfer && !!l.fromWarehouseId && scopeWh(r).includes(l.fromWarehouseId) && level !== 'warehouse';
    if (!internal) { g.qtyReceived += l.good; g.goodsCost += l.goods; }
    g.truckCost += l.truck; g.warehouseCost += l.warehouse;
  }
  const finish = (g: PerfRow, sp: number | null) => {
    g.landedCost = g.goodsCost + g.truckCost + g.warehouseCost;
    g.landedPerUnit = g.qtyReceived > 0 ? r4(g.landedCost / g.qtyReceived) : null;
    g.profit = g.revenue - g.cogs; g.margin = g.revenue > 0 ? r4(g.profit / g.revenue) : null;
    g.avgSalePrice = g.qtySold > 0 ? r2(g.revenue / g.qtySold) : null;
    g.sellingPrice = sp;
    const unit = g.landedPerUnit ?? (g.qtySold > 0 ? g.cogs / g.qtySold : null);
    g.stockValue = unit !== null ? r2(g.stockOnHand * unit) : null;
    g.priceForTarget = unit !== null ? priceForMargin(unit, tm) : null;
    g.marginAtPrice = sp !== null && unit !== null ? r4((sp - unit) / sp) : null;
    for (const k of ['goodsCost', 'truckCost', 'warehouseCost', 'landedCost', 'revenue', 'cogs', 'cogsGoods', 'cogsTruck', 'cogsWarehouse', 'profit'] as const) g[k] = r2(g[k]);
    return g;
  };
  const rows = [...groups.values()].map((g) => { const s = sellers.get(g.key); const one = s && s.size === 1 ? [...s][0] : null; return finish(g, level === 'product' || level === 'warehouse' ? one ?? null : null); })
    .sort((a, b) => b.revenue - a.revenue || b.landedCost - a.landedCost);

  // totals across everything in the filter (goods moved between our warehouses counted once)
  const totals = { ...blank('total', 'Total') };
  for (const r of base.values()) add(totals, r);
  for (const { l } of receipts) { const internal = l.transfer && !!l.fromWarehouseId && allWh.filter(whOk).includes(l.fromWarehouseId) && !f.warehouseId; if (!internal) { totals.qtyReceived += l.good; totals.goodsCost += l.goods; } totals.truckCost += l.truck; totals.warehouseCost += l.warehouse; }
  finish(totals, null);
  const months = new Set<string>(); for (let t = from; t < to; t += DAY) months.add(new Date(t).toISOString().slice(0, 7));
  const otherCosts = f.entityId || f.productId ? 0 : r2(sum(landed.unallocated.filter((u) => months.has(u.month) && whOk(u.warehouseId) && rcOk(u.warehouseId)), (u) => u.amount));
  const netProfit = r2(totals.profit - otherCosts);
  const waterfall = [
    { label: 'Revenue', value: totals.revenue, kind: 'total' as const },
    { label: 'Goods', value: -totals.cogsGoods, kind: 'step' as const },
    { label: 'Truck', value: -totals.cogsTruck, kind: 'step' as const },
    { label: 'Warehouse', value: -totals.cogsWarehouse, kind: 'step' as const },
    { label: 'Other', value: -otherCosts, kind: 'step' as const },
    { label: 'Profit', value: netProfit, kind: 'total' as const },
  ];

  // fast / slow products (cases sold per day vs days of stock held)
  const days = Math.max(1, (to - from) / DAY);
  const byP = new Map<ID, { sold: number; held: number }>();
  for (const r of base.values()) { const x = byP.get(r.productId!) ?? { sold: 0, held: 0 }; x.sold += r.qtySold; x.held += r.stockOnHand; byP.set(r.productId!, x); }
  const fs: FastSlow[] = [...byP].map(([productId, x]) => { const perDay = x.sold / days; return { productId, perDay: r2(perDay), held: x.held, cover: perDay > 0 ? Math.round(x.held / perDay) : null, qtySold: x.sold }; });
  const fast = fs.filter((x) => x.perDay > 0).sort((a, b) => b.perDay - a.perDay).slice(0, 5);
  const slow = fs.filter((x) => x.held > 0).sort((a, b) => (b.cover ?? 1e9) - (a.cover ?? 1e9)).slice(0, 5);

  return {
    generatedAt: new Date(now).toISOString(), from: new Date(from).toISOString(), to: new Date(to).toISOString(), level, allocation: landed.allocation, targetMargin: tm, method: PERFORMANCE_METHOD,
    rows, totals, waterfall, otherCosts, netProfit, byTruck: landedByTruck(inPeriod).slice(0, 300), fast, slow,
    rates: landed.rates.filter((r) => months.has(r.month) && whOk(r.warehouseId)),
  };
}
