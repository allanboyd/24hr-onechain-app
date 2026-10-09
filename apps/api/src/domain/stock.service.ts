import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema as t } from '../db/client';
import { amount, computeStock, computeVelocity, DAY, flagsFrom, saleStatus, type StockMove, type Thresholds } from '@btw/api/rules';
import type { Sale } from '@btw/api/types';
import { fail, forbidden } from '../common/errors';
import { iso, uid } from '../common/ids';
import { canSeeWarehouse, has, isGlobal, type Principal } from '../auth/principal';
import { RefService } from './ref.service';
import { loadShipments, map } from './store';

@Injectable()
export class StockService {
  constructor(private ref: RefService) {}

  /** §7.5 rows. Moves are aggregated in SQL (opening = everything before the 30-day window), then the shared rule fills the rest. */
  async stock(p: Principal | null, now = Date.now()) {
    const since = iso(now - 30 * DAY);
    const agg = await db.execute<{ warehouse_id: string; product_id: string; kind: string; before: boolean; qty: number }>(sql`
      SELECT warehouse_id, product_id, kind, (at < ${since}) AS before, SUM(qty)::int AS qty FROM stock_moves GROUP BY 1, 2, 3, 4`);
    const moves: StockMove[] = agg.map((r) => ({ warehouseId: r.warehouse_id, productId: r.product_id, kind: r.kind as StockMove['kind'], qty: r.qty, at: r.before ? iso(0) : iso(now), ref: '' }));
    const shipments = await loadShipments(db);
    const rows = computeStock(moves, shipments, await this.ref.priceOf(), now);
    return p ? rows.filter((r) => canSeeWarehouse(p, r.warehouseId)) : rows;
  }
  async ledger(p: Principal, warehouseId: string, productId: string) {
    if (!warehouseId || !productId) fail('warehouseId and productId are required', 400, 'bad-request');
    if (!canSeeWarehouse(p, warehouseId)) forbidden();
    return (await db.select().from(t.stockMoves).where(and(eq(t.stockMoves.warehouseId, warehouseId), eq(t.stockMoves.productId, productId))).orderBy(desc(t.stockMoves.at)).limit(50))
      .map((m) => ({ warehouseId: m.warehouseId, productId: m.productId, kind: m.kind, qty: m.qty, at: new Date(m.at).toISOString(), ref: m.ref }));
  }

  async sales(p: Principal, warehouseId?: string) {
    const rows = await db.select().from(t.sales).where(warehouseId ? eq(t.sales.warehouseId, warehouseId) : undefined).orderBy(desc(t.sales.at)).limit(200);
    return rows.map(map.sale).filter((s) => canSeeWarehouse(p, s.warehouseId));
  }
  /** SL-01..03: stock reduces at once; above-stock sales are blocked unless a director overrides (SL-02). */
  async createSale(p: Principal, input: Omit<Sale, 'id' | 'ref' | 'status'>, override = false) {
    // Sales staff/receivers record sales; a director may also record one (that is how an above-stock override happens, SL-02).
    if (!has(p, 'sales', 'receiver') && !isGlobal(p)) forbidden('Only sales staff record sales');
    if (typeof input?.warehouseId !== 'string') fail('Pick the warehouse', 400, 'bad-request');
    if (!canSeeWarehouse(p, input.warehouseId)) forbidden('Not your warehouse');
    if (!Array.isArray(input.lines) || !input.lines.length || input.lines.some((l) => !Number.isInteger(l?.qty) || l.qty <= 0)) fail('Each line needs a whole number of cases above zero');
    if (input.lines.some((l) => !(Number(l.price) >= 0))) fail('Price must be a number ≥ 0');
    if (input.paid !== undefined && !(Number(input.paid) >= 0)) fail('Paid amount must be ≥ 0');
    if (override && !has(p, 'director') && !isGlobal(p)) forbidden('Only a director can sell above stock');
    { const { bundle } = await this.ref.get();
      if (!bundle.warehouses.some((w) => w.id === input.warehouseId)) fail('Unknown warehouse');
      for (const l of input.lines) if (!bundle.products.some((x) => x.id === l.productId)) fail(`Unknown product ${l.productId}`); }
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'stock:' + input.warehouseId}))`);
      const st = (await this.stock(null)).filter((r) => r.warehouseId === input.warehouseId);
      const { bundle } = await this.ref.get();
      for (const l of input.lines) {
        const avail = st.find((r) => r.productId === l.productId)?.closing ?? 0;
        if (l.qty > avail && !override) fail(`Only ${avail} cases of ${bundle.products.find((x) => x.id === l.productId)?.brand} in stock (SL-02)`);
      }
      const n = (await tx.select({ c: sql<number>`count(*)::int` }).from(t.sales))[0].c;
      const sale: Sale = { ...input, at: input.at ?? iso(), id: uid('sale'), ref: `SAL-${String(n + 1).padStart(5, '0')}`, salespersonId: p.id, status: saleStatus(input.lines, input.paid ?? 0), paid: input.paid ?? 0, currency: input.currency ?? 'USD' };
      await tx.insert(t.sales).values(sale);
      for (const l of sale.lines) await tx.insert(t.stockMoves).values({ warehouseId: sale.warehouseId, productId: l.productId, kind: 'sold', qty: l.qty, at: sale.at, ref: sale.ref });
      return sale;
    });
  }

  // ---- Analytics (§9, §10) ------------------------------------------------------
  /** Sales per (warehouse, SKU) from 'sold' moves: 30-day sum + last sale date, shaped for the shared velocity rule. */
  private async salesShape(now: number) {
    const since = iso(now - 30 * DAY);
    const rows = await db.execute<{ warehouse_id: string; product_id: string; q30: number; last: string }>(sql`
      SELECT warehouse_id, product_id, COALESCE(SUM(qty) FILTER (WHERE at >= ${since}), 0)::int AS q30, MAX(at) AS last FROM stock_moves WHERE kind = 'sold' GROUP BY 1, 2`);
    // The rule needs (at, qty) pairs: one entry at the last sale date (qty 0) + the 30-day total placed inside the window.
    return rows.flatMap((r) => [
      { warehouseId: r.warehouse_id, at: new Date(r.last).toISOString(), lines: [{ productId: r.product_id, qty: 0, price: 0 }] },
      ...(r.q30 ? [{ warehouseId: r.warehouse_id, at: iso(now - 30 * DAY + 1000), lines: [{ productId: r.product_id, qty: r.q30, price: 0 }] }] : []),
    ]);
  }
  async velocity(p: Principal | null, now = Date.now()) {
    const t0 = (await this.ref.get()).bundle.settings.thresholds;
    const rows = computeVelocity(await this.stock(null, now), await this.salesShape(now), t0, now);
    return p ? rows.filter((r) => canSeeWarehouse(p, r.warehouseId)) : rows;
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
    const scope = (isGlobal(p) || has(p, 'planner', 'fleet', 'operations', 'accounts')) ? undefined : p.warehouseIds;
    const whFilter = scope ? (scope.length ? inArray(t.sales.warehouseId, scope) : sql`false`) : undefined;
    const salesRows = await db.select({ at: t.sales.at, lines: t.sales.lines, paid: t.sales.paid }).from(t.sales).where(whFilter);
    const total = (s: { lines: { qty: number; price: number }[] }) => s.lines.reduce((b, l) => b + l.qty * l.price, 0);
    const sales30 = salesRows.filter((s) => s.at >= since || Date.parse(s.at) >= Date.parse(since)).reduce((a, s) => a + total(s), 0);
    const days = Array.from({ length: 30 }, (_, i) => iso(now - (29 - i) * DAY).slice(0, 10));
    const byDay = new Map<string, number>();
    for (const s of salesRows) { const d = new Date(s.at).toISOString().slice(0, 10); byDay.set(d, (byDay.get(d) ?? 0) + s.lines.reduce((b, l) => b + l.qty, 0)); }
    const { bundle } = await this.ref.get();
    const stops = (id: string) => bundle.routes.find((r) => r.id === id)?.stops ?? [];
    const { deriveShipmentStatus } = await import('@btw/api/rules');
    const shipments = (await loadShipments(db)).map((sh) => ({ ...sh, status: deriveShipmentStatus(sh, bundle.warehouses.find((w) => w.id === sh.warehouseId)?.checkpointId, stops, now) }));
    const active = shipments.filter((s) => s.status !== 'Acknowledged');
    const [plansPending] = await db.select({ c: sql<number>`count(*)::int` }).from(t.plans).where(eq(t.plans.status, 'Submitted'));
    const [paymentsPending] = await db.select({ c: sql<number>`count(*)::int` }).from(t.tripPayments).where(eq(t.tripPayments.status, 'Pending approval'));
    return {
      stockValue: amount(1, st.reduce((a, r) => a + r.closing * r.landedCostPerCase, 0)), stockCases: st.reduce((a, r) => a + r.closing, 0), inTransitCases: st.reduce((a, r) => a + r.inTransit, 0),
      sales30: amount(1, sales30), daily: days.map((day) => ({ day, cases: byDay.get(day) ?? 0 })),
      trucksActive: active.length, trucksDelayed: active.filter((s) => s.status === 'Delayed').length, trucksAtBorder: active.filter((s) => s.legs.some((l) => l.status === 'At border')).length,
      plansPending: plansPending.c, paymentsPending: paymentsPending.c,
      unpaidBalance: amount(1, salesRows.reduce((a, s) => a + total(s) - s.paid, 0)),
    };
  }
}
