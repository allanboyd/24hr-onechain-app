import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema as t } from '../db/client';
import { amount, computeStock, computeVelocity, DAY, flagsFrom, hasFeature, saleStatus, toUsd, type StockMove, type Thresholds } from '@btw/api/rules';
import { fxRates } from './companies';
import { canSell, seesPrices, seesShipment } from '@btw/api/access';
import { landedCostMap } from '@btw/api/landed';
import { casesInTransit, casesOnHand, fleetFigures, owedByCustomers, stockValue } from '@btw/api/metrics';
import type { Sale } from '@btw/api/types';
import { fail, forbidden } from '../common/errors';
import { iso, uid } from '../common/ids';
import { canSeeEntity, canSeeWarehouse, has, isGlobal, writeEntity, type Principal } from '../auth/principal';
import { RefService } from './ref.service';
import { appConfig } from '../config/app-config';
import { loadShipments, map } from './store';

@Injectable()
export class StockService {
  constructor(private ref: RefService) {}

  /** §7.5 rows. Moves are aggregated in SQL (opening = everything before the 30-day window), then the shared rule fills the rest. */
  async stock(p: Principal | null, now = Date.now()) {
    const since = iso(now - 30 * DAY);
    // stock = f(company, warehouse, product): shared warehouses hold each company's own stock
    const agg = await db.execute<{ entity_id: string; warehouse_id: string; product_id: string; kind: string; before: boolean; qty: number }>(sql`
      SELECT entity_id, warehouse_id, product_id, kind, (at < ${since}) AS before, SUM(qty)::int AS qty FROM stock_moves GROUP BY 1, 2, 3, 4, 5`);
    const moves: StockMove[] = agg.map((r) => ({ entityId: r.entity_id, warehouseId: r.warehouse_id, productId: r.product_id, kind: r.kind as StockMove['kind'], qty: r.qty, at: r.before ? iso(0) : iso(now), ref: '' }));
    const shipments = await loadShipments(db);
    // docs/18: stock value = cases on hand × landed cost per case (landed.ts), the same figure on every surface
    const { bundle } = await this.ref.get();
    const [costs, plans, pos] = await Promise.all([db.select().from(t.tripCosts), db.select().from(t.plans), db.select().from(t.pos)]);
    const landed = landedCostMap({ shipments, costs: costs.map(map.cost), plans: plans.map(map.plan), pos: pos.map(map.po), priceList: bundle.priceList as never, products: bundle.products as never });
    const rows = computeStock(moves, shipments, await this.ref.priceOf(), now, (pid) => landed.get(pid));
    if (!p) return rows;
    const mine = rows.filter((r) => canSeeEntity(p, r.entityId) && canSeeWarehouse(p, r.warehouseId));
    // A-04: receivers see quantities, not purchase prices / landed cost
    return seesPrices(p) ? mine : mine.map((r) => { const { landedCostPerCase: _x, ...rest } = r; return rest as typeof r; });
  }
  async ledger(p: Principal, warehouseId: string, productId: string) {
    if (!warehouseId || !productId) fail('warehouseId and productId are required', 400, 'bad-request');
    if (!canSeeWarehouse(p, warehouseId)) forbidden();
    return (await db.select().from(t.stockMoves).where(and(inArray(t.stockMoves.entityId, p.scope), eq(t.stockMoves.warehouseId, warehouseId), eq(t.stockMoves.productId, productId))).orderBy(desc(t.stockMoves.at)).limit(50))
      .map((m) => ({ entityId: m.entityId, warehouseId: m.warehouseId, productId: m.productId, kind: m.kind, qty: m.qty, at: new Date(m.at).toISOString(), ref: m.ref }));
  }

  async sales(p: Principal, warehouseId?: string) {
    if (!hasFeature(p.roles, 'sales')) return [];
    const rows = await db.select().from(t.sales).where(and(inArray(t.sales.entityId, p.scope), warehouseId ? eq(t.sales.warehouseId, warehouseId) : undefined)).orderBy(desc(t.sales.at)).limit(200);
    return rows.map(map.sale).filter((s) => canSeeWarehouse(p, s.warehouseId));
  }
  /** SL-01..03: stock reduces at once; above-stock sales are blocked unless a director overrides (SL-02). */
  async createSale(p: Principal, input: Omit<Sale, 'id' | 'ref' | 'status' | 'entityId'> & { entityId?: string }, override = false) {
    // Sales staff/receivers record sales; a director may also record one (that is how an above-stock override happens, SL-02).
    // §7: sales, selling prices and trip financials are the directors' until someone else is named
    if (typeof input?.warehouseId !== 'string') fail('Pick the warehouse', 400, 'bad-request');
    if (!canSell(p, input.warehouseId)) forbidden('Sales are recorded by the directors');
    if (!Array.isArray(input.lines) || !input.lines.length || input.lines.some((l) => !Number.isInteger(l?.qty) || l.qty <= 0)) fail('Each line needs a whole number of cases above zero');
    if (input.lines.some((l) => !(Number(l.price) >= 0))) fail('Price must be a number ≥ 0');
    if (input.paid !== undefined && !(Number(input.paid) >= 0)) fail('Paid amount must be ≥ 0');
    if (override && !has(p, 'director') && !isGlobal(p)) forbidden('Only a director can sell above stock');
    const entityId = writeEntity(p, typeof input.entityId === 'string' ? input.entityId : undefined);
    const cp = input.counterpartyEntityId;
    { const { bundle } = await this.ref.get();
      if (cp !== undefined && cp !== null && (typeof cp !== 'string' || cp === entityId || !bundle.entities.some((e) => e.id === cp))) fail('An intercompany sale must name a different sibling company');
      if (!bundle.warehouses.some((w) => w.id === input.warehouseId)) fail('Unknown warehouse');
      for (const l of input.lines) if (!bundle.products.some((x) => x.id === l.productId)) fail(`Unknown product ${l.productId}`); }
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'stock:' + input.warehouseId}))`);
      // a sale draws only its own company's stock, even in a shared warehouse
      const st = (await this.stock(null)).filter((r) => r.entityId === entityId && r.warehouseId === input.warehouseId);
      const { bundle } = await this.ref.get();
      for (const l of input.lines) {
        const avail = st.find((r) => r.productId === l.productId)?.closing ?? 0;
        if (l.qty > avail && !override) fail(`Only ${avail} cases of ${bundle.products.find((x) => x.id === l.productId)?.brand} in stock`);
      }
      const n = (await tx.select({ c: sql<number>`count(*)::int` }).from(t.sales))[0].c;
      const sale: Sale = { ...input, entityId, counterpartyEntityId: cp || undefined, at: input.at ?? iso(), id: uid('sale'), ref: `SAL-${String(n + 1).padStart(5, '0')}`, salespersonId: p.id, status: saleStatus(input.lines, input.paid ?? 0), paid: input.paid ?? 0, currency: input.currency ?? 'USD' };
      await tx.insert(t.sales).values({ ...sale, counterpartyEntityId: sale.counterpartyEntityId ?? null });
      for (const l of sale.lines) await tx.insert(t.stockMoves).values({ entityId, warehouseId: sale.warehouseId, productId: l.productId, kind: 'sold', qty: l.qty, at: sale.at, ref: sale.ref });
      // intercompany: the buying sibling receives the goods in the same warehouse (eliminated in group totals)
      if (sale.counterpartyEntityId) for (const l of sale.lines) await tx.insert(t.stockMoves).values({ entityId: sale.counterpartyEntityId, warehouseId: sale.warehouseId, productId: l.productId, kind: 'transferIn', qty: l.qty, at: sale.at, ref: sale.ref });
      return sale;
    });
  }

  // ---- Analytics (§9, §10) ------------------------------------------------------
  /** Sales per (warehouse, SKU) from 'sold' moves: 30-day sum + last sale date, shaped for the shared velocity rule. */
  private async salesShape(now: number) {
    const since = iso(now - 30 * DAY);
    const rows = await db.execute<{ entity_id: string; warehouse_id: string; product_id: string; q30: number; last: string }>(sql`
      SELECT entity_id, warehouse_id, product_id, COALESCE(SUM(qty) FILTER (WHERE at >= ${since}), 0)::int AS q30, MAX(at) AS last FROM stock_moves WHERE kind = 'sold' GROUP BY 1, 2, 3`);
    // The rule needs (at, qty) pairs: one entry at the last sale date (qty 0) + the 30-day total placed inside the window.
    return rows.flatMap((r) => [
      { entityId: r.entity_id, warehouseId: r.warehouse_id, at: new Date(r.last).toISOString(), lines: [{ productId: r.product_id, qty: 0, price: 0 }] },
      ...(r.q30 ? [{ entityId: r.entity_id, warehouseId: r.warehouse_id, at: iso(now - 30 * DAY + 1000), lines: [{ productId: r.product_id, qty: r.q30, price: 0 }] }] : []),
    ]);
  }
  async velocity(p: Principal | null, now = Date.now()) {
    const t0 = (await this.ref.get()).bundle.settings.thresholds;
    const rows = computeVelocity(await this.stock(null, now), await this.salesShape(now), t0, now);
    return p ? rows.filter((r) => canSeeEntity(p, r.entityId) && canSeeWarehouse(p, r.warehouseId)) : rows;
  }
  async flags(p: Principal | null) { return flagsFrom(await this.velocity(p)); }
  async setThresholds(p: Principal, th: Partial<Thresholds>) {
    if (!has(p, 'director')) forbidden('Only directors change thresholds');
    const cur = (await this.ref.get()).bundle.settings.thresholds;
    const next = { ...cur, ...Object.fromEntries(Object.entries(th).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])) } as Thresholds;
    if (!(next.fast > next.normal && next.normal > next.slow)) fail('Thresholds must be fast > normal > slow');
    await this.ref.setSetting('thresholds', next);
    return next;
  }

  async summary(p: Principal, now = Date.now()) {
    const st = await this.stock(p, now);
    const since = iso(now - 30 * DAY);
    const scope = (isGlobal(p) || has(p, 'fleet', 'operations', 'accounts')) ? undefined : p.warehouseIds;
    const whFilter = scope ? (scope.length ? inArray(t.sales.warehouseId, scope) : sql`false`) : undefined;
    const money = seesPrices(p);
    const salesRows = hasFeature(p.roles, 'sales') ? await db.select({ at: t.sales.at, lines: t.sales.lines, paid: t.sales.paid, currency: t.sales.currency }).from(t.sales).where(and(inArray(t.sales.entityId, p.scope), whFilter)) : [];
    const total = (s: { lines: { qty: number; price: number }[] }) => s.lines.reduce((b, l) => b + l.qty * l.price, 0);
    const rates = await fxRates();
    const sales30 = salesRows.filter((s) => s.at >= since || Date.parse(s.at) >= Date.parse(since)).reduce((a, s) => a + total(s), 0);
    const days = Array.from({ length: 30 }, (_, i) => iso(now - (29 - i) * DAY).slice(0, 10));
    const byDay = new Map<string, number>();
    for (const s of salesRows) { const d = new Date(s.at).toISOString().slice(0, 10); byDay.set(d, (byDay.get(d) ?? 0) + s.lines.reduce((b, l) => b + l.qty, 0)); }
    const { bundle } = await this.ref.get();
    const stops = (id: string) => bundle.routes.find((r) => r.id === id)?.stops ?? [];
    const { deriveShipmentStatus } = await import('@btw/api/rules');
    const cps = bundle.warehouses.filter((w) => p.warehouseIds.includes(w.id)).map((w) => w.checkpointId);
    const shipments = (await loadShipments(db)).filter((sh) => canSeeEntity(p, sh.entityId) && seesShipment(p, sh, { loadingPointId: sh.loadingPointId, myWarehouseCps: cps })).map((sh) => ({ ...sh, status: deriveShipmentStatus(sh, bundle.warehouses.find((w) => w.id === sh.warehouseId)?.checkpointId, stops, now) }));
    // docs/18: the shared fleet and stock figures (metrics.ts)
    const fleet = fleetFigures({ shipments, stopsOf: stops, now });
    // POs awaiting a director (approvals on); never drafts (docs/09 §4)
    const [plansPending] = await db.select({ c: sql<number>`count(*)::int` }).from(t.pos).where(and(eq(t.pos.status, 'Awaiting approval'), inArray(t.pos.entityId, p.scope)));
    const [paymentsPending] = await db.select({ c: sql<number>`count(*)::int` }).from(t.tripPayments).where(and(eq(t.tripPayments.status, 'Pending approval'), inArray(t.tripPayments.entityId, p.scope)));
    return {
      stockValue: money ? stockValue(st) ?? 0 : 0, stockCases: casesOnHand(st), inTransitCases: casesInTransit(st),
      sales30: amount(1, sales30), daily: days.map((day) => ({ day, cases: byDay.get(day) ?? 0 })),
      trucksActive: fleet.onRoad, trucksDelayed: fleet.delayed, trucksAtBorder: fleet.atBorder,
      // only meaningful when a director approves POs (config.toml approvals.purchase_orders)
      plansPending: appConfig.approvals.purchaseOrders ? plansPending.c : 0, paymentsPending: hasFeature(p.roles, 'finance') ? paymentsPending.c : 0,
      // docs/18: owed by customers in USD (approved month rate), as on Home and the sales pages
      unpaidBalance: owedByCustomers(salesRows.map((s) => { const at = new Date(s.at).toISOString(); const cv = (v: number) => toUsd(v, s.currency, rates, at); return { at, paid: cv(s.paid), lines: s.lines.map((l) => ({ ...l, price: cv(l.price) })), status: (total(s) - s.paid > 0.005 ? 'Unpaid' : 'Paid') as Sale['status'] }; }), now),
    };
  }
}
