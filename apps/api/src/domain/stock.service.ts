import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema as t, type Tx } from '../db/client';
type Q = typeof db | Tx;
import { amount, canSetCreditDays, fxFor, paymentError, saleBalance, cleanClientName, clientKey, validTermsDays, computeStock, computeVelocity, DAY, flagsFrom, hasFeature, saleStatus, toUsd, type StockMove, type Thresholds } from '@btw/api/rules';
import { fxRates } from './companies';
import { canSell, seesPrices, seesShipment } from '@btw/api/access';
import { landedCostMap } from '@btw/api/landed';
import { casesInTransit, casesOnHand, clientFigures, fleetFigures, owedByCustomers, stockValue } from '@btw/api/metrics';
import type { Client, ClientInput, ClientPayment, ClientPaymentInput, ClientRow, Sale } from '@btw/api/types';
import { auditNote } from '../common/audit-context';
import { fail, forbidden, notFound } from '../common/errors';
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
  // ---- Client payments (V3-12 step 2) ----------------------------------------------------------------------------------
  private paymentOut(r: typeof t.clientPayments.$inferSelect, s: { ref: string; customer: string }): ClientPayment {
    return { id: r.id, entityId: r.entityId, saleId: r.saleId, saleRef: s.ref, clientId: r.clientId ?? undefined, customer: s.customer, warehouseId: r.warehouseId,
      amount: r.amount, currency: r.currency as Sale['currency'], amountUsd: r.amountUsd, at: new Date(r.at).toISOString(), method: (r.method as ClientPayment['method']) ?? null,
      reference: r.reference ?? undefined, byUserId: r.byUserId ?? undefined };
  }
  private async insertPayment(q: Q, s: Pick<Sale, 'id' | 'entityId' | 'clientId' | 'warehouseId' | 'currency'>, amt: number, at: string, method: ClientPayment['method'], reference: string | undefined, byUserId: string) {
    const rate = s.currency === 'USD' ? 1 : fxFor(await fxRates(), s.currency, at);
    const [row] = await q.insert(t.clientPayments).values({ id: uid('cp'), entityId: s.entityId, saleId: s.id, clientId: s.clientId ?? null, warehouseId: s.warehouseId,
      amount: Math.round(amt * 100) / 100, currency: s.currency, fxRate: rate, amountUsd: Math.round((amt / rate) * 100) / 100, at, method, reference: reference ?? null, byUserId }).returning();
    return row;
  }
  /** Money received against a sale: not more than the balance, dated between the sale and now; the sale's paid amount
   *  and status change in the same transaction, so every screen that reads `sales.paid` stays right. */
  async recordPayment(p: Principal, saleId: string, input: ClientPaymentInput) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'sale:' + saleId}))`);
      const [r] = await tx.select().from(t.sales).where(eq(t.sales.id, saleId));
      if (!r || !p.scope.includes(r.entityId) || !canSeeWarehouse(p, r.warehouseId)) notFound('Sale');
      if (!canSell(p, r!.warehouseId)) forbidden('Payments are recorded by the people who sell');
      const s = map.sale(r!);
      const err = paymentError(saleBalance(s), input ?? {});
      if (err) fail(err, 422);
      const at = input.at ?? iso();
      if (!(Date.parse(at) >= Date.parse(s.at)) || Date.parse(at) > Date.now() + 60_000) fail('The payment date must be between the sale and today', 422);
      const row = await this.insertPayment(tx, s, Number(input.amount), at, input.method, input.reference?.trim() || undefined, p.id);
      const paid = Math.round((s.paid + row.amount) * 100) / 100;
      const status = saleStatus(s.lines, paid);
      await tx.update(t.sales).set({ paid, status }).where(eq(t.sales.id, s.id));
      auditNote({ recordType: 'sale', recordId: s.id, entityId: s.entityId, summary: `${s.ref}: received ${s.currency} ${row.amount} (${row.method})${row.reference ? ` · ${row.reference}` : ''}`, before: { paid: s.paid, status: s.status }, after: { paid, status } });
      return { sale: { ...s, paid, status }, payment: this.paymentOut(row, s) };
    });
  }
  /** Payments the caller may see (one sale, or all; newest first). */
  async payments(p: Principal, saleId?: string): Promise<ClientPayment[]> {
    if (!hasFeature(p.roles, 'sales')) return [];
    const rows = await db.select({ p: t.clientPayments, ref: t.sales.ref, customer: t.sales.customer }).from(t.clientPayments).innerJoin(t.sales, eq(t.sales.id, t.clientPayments.saleId))
      .where(and(inArray(t.clientPayments.entityId, p.scope), saleId ? eq(t.clientPayments.saleId, saleId) : undefined)).orderBy(desc(t.clientPayments.at)).limit(saleId ? 100 : 500);
    return rows.filter((x) => canSeeWarehouse(p, x.p.warehouseId)).map((x) => this.paymentOut(x.p, x));
  }

  // ---- Clients (V3-12 step 1) ------------------------------------------------------------------------------------
  private clientOut(r: typeof t.clients.$inferSelect): Client {
    return { id: r.id, entityId: r.entityId, name: r.name, phone: r.phone ?? undefined, warehouseId: r.warehouseId ?? undefined, termsDays: r.termsDays, active: r.active, createdAt: new Date(r.createdAt).toISOString() };
  }
  /** Clients with their figures over all their sales (USD at the approved month rate, the same rule as Sales and Today). */
  async clients(p: Principal): Promise<ClientRow[]> {
    if (!hasFeature(p.roles, 'sales') && !hasFeature(p.roles, 'reports')) return [];
    const [rows, sold, rates] = await Promise.all([
      db.select().from(t.clients).where(inArray(t.clients.entityId, p.scope)).orderBy(t.clients.name),
      db.select({ clientId: t.sales.clientId, at: t.sales.at, lines: t.sales.lines, paid: t.sales.paid, status: t.sales.status, currency: t.sales.currency, termsDays: t.sales.termsDays }).from(t.sales).where(inArray(t.sales.entityId, p.scope)),
      fxRates(),
    ]);
    const usd = sold.map((s) => { const at = new Date(s.at).toISOString(); const cv = (v: number) => toUsd(v, s.currency, rates, at); return { clientId: s.clientId ?? undefined, at, termsDays: s.termsDays, paid: cv(s.paid), status: s.status as Sale['status'], lines: s.lines.map((l) => ({ ...l, price: cv(l.price) })) }; });
    const fig = clientFigures(usd, Date.now());
    return rows.map((r) => ({ ...this.clientOut(r), sales: 0, lastSaleAt: null, owed: 0, overdue: 0, ...fig.get(r.id) }));
  }
  private async checkClient(q: Q, input: Partial<ClientInput>, entityId: string, selfId?: string) {
    if (input.name !== undefined) {
      const name = cleanClientName(String(input.name ?? ''));
      if (name.length < 1) fail('Enter the client name', 422);
      const [dup] = await q.select({ id: t.clients.id }).from(t.clients).where(and(eq(t.clients.entityId, entityId), eq(t.clients.nameKey, clientKey(name))));
      if (dup && dup.id !== selfId) fail(`${name} is already a client`, 409, 'conflict');
    }
    if (input.termsDays !== undefined && !validTermsDays(input.termsDays)) fail('Credit days must be a whole number from 0 to 180', 422);
    if (input.warehouseId && !(await this.ref.get()).bundle.warehouses.some((w) => w.id === input.warehouseId)) fail('Unknown warehouse', 422);
  }
  async createClient(p: Principal, input: ClientInput) {
    if (!hasFeature(p.roles, 'sales')) forbidden('Clients are added by the people who sell');
    const entityId = writeEntity(p, typeof input?.entityId === 'string' ? input.entityId : undefined);
    if (input.termsDays !== undefined && input.termsDays !== 14 && !canSetCreditDays(p.roles)) forbidden('Credit days are set by the directors or accounts');
    await this.checkClient(db, input, entityId);
    const name = cleanClientName(input.name);
    const [row] = await db.insert(t.clients).values({ id: uid('cl'), entityId, name, nameKey: clientKey(name), phone: input.phone?.trim() || null, warehouseId: input.warehouseId || null, termsDays: input.termsDays ?? 14, byUserId: p.id }).returning();
    auditNote({ recordType: 'client', recordId: row.id, entityId, summary: `${name} · ${row.termsDays} credit days`, after: this.clientOut(row) });
    return this.clientOut(row);
  }
  async updateClient(p: Principal, id: string, input: Partial<ClientInput>) {
    if (!hasFeature(p.roles, 'sales')) forbidden('Clients are changed by the people who sell');
    const [cur] = await db.select().from(t.clients).where(eq(t.clients.id, id));
    if (!cur || !p.scope.includes(cur.entityId)) notFound('Client');
    if (input.termsDays !== undefined && input.termsDays !== cur!.termsDays && !canSetCreditDays(p.roles)) forbidden('Credit days are set by the directors or accounts');
    await this.checkClient(db, input, cur!.entityId, id);
    const set: Partial<typeof t.clients.$inferInsert> = {};
    if (input.name !== undefined) { set.name = cleanClientName(input.name); set.nameKey = clientKey(input.name); }
    if (input.phone !== undefined) set.phone = input.phone?.trim() || null;
    if (input.warehouseId !== undefined) set.warehouseId = input.warehouseId || null;
    if (input.termsDays !== undefined) set.termsDays = input.termsDays;
    if (input.active !== undefined) set.active = !!input.active;
    const [row] = Object.keys(set).length ? await db.update(t.clients).set(set).where(eq(t.clients.id, id)).returning() : [cur!];
    // a new name is kept on the sales too, so lists and reports show one client
    if (set.name) await db.update(t.sales).set({ customer: set.name }).where(eq(t.sales.clientId, id));
    auditNote({ recordType: 'client', recordId: id, entityId: cur!.entityId, summary: row.name, before: this.clientOut(cur!), after: this.clientOut(row) });
    return this.clientOut(row);
  }
  /** A sale's client: the one picked, else the same name in the company, else a new client with the default days. */
  private async clientForSale(q: Q, p: Principal, entityId: string, input: { clientId?: string; customer?: string; warehouseId: string }) {
    if (input.clientId) {
      const [c] = await q.select().from(t.clients).where(and(eq(t.clients.id, input.clientId), eq(t.clients.entityId, entityId)));
      if (!c) fail('Pick a client of this company', 422);
      if (!c!.active) fail(`${c!.name} is deactivated`, 422);
      return c!;
    }
    const name = cleanClientName(String(input.customer ?? ''));
    if (name.length < 1) fail('Enter the client', 422);
    const [same] = await q.select().from(t.clients).where(and(eq(t.clients.entityId, entityId), eq(t.clients.nameKey, clientKey(name))));
    if (same) { if (!same.active) fail(`${same.name} is deactivated`, 422); return same; }
    const [row] = await q.insert(t.clients).values({ id: uid('cl'), entityId, name, nameKey: clientKey(name), warehouseId: input.warehouseId, byUserId: p.id }).returning();
    auditNote({ recordType: 'client', recordId: row.id, entityId, summary: `${name} · added with a sale`, after: this.clientOut(row) });
    return row;
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
      const cl = await this.clientForSale(tx, p, entityId, input);
      const sale: Sale = { ...input, customer: cl.name, clientId: cl.id, termsDays: cl.termsDays, entityId, counterpartyEntityId: cp || undefined, at: input.at ?? iso(), id: uid('sale'), ref: `SAL-${String(n + 1).padStart(5, '0')}`, salespersonId: p.id, status: saleStatus(input.lines, input.paid ?? 0), paid: input.paid ?? 0, currency: input.currency ?? 'USD' };
      const { payMethod, ...row } = sale;
      await tx.insert(t.sales).values({ ...row, counterpartyEntityId: sale.counterpartyEntityId ?? null });
      // V3-12 step 2: what was paid when the sale was made is its first payment
      if (sale.paid > 0) await this.insertPayment(tx, sale, sale.paid, sale.at, payMethod ?? 'Cash', undefined, p.id);
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
