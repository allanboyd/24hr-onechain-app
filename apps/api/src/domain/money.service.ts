// docs/14 (workstream B) — warehouse expenses, warehouse inventory recording, re-export orders, selling prices, transport
// fees and the combined performance report. The rules and the math are the shared ones (@btw/api/money, /performance),
// so the server and the in-browser mock give the same answers.
import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema as t, type Tx } from '../db/client';
import * as M from '@btw/api/money';
import { performanceReport, type PerfFilter } from '@btw/api/performance';
import { hasFeature, normReg, TRUCK_CASES, type StockMove } from '@btw/api/rules';
import { orderAccess, seesPrices, seesShipment } from '@btw/api/access';
import { defaultMoneySettings, fxFor } from '@btw/api/rules';
import type { MoneySettings, SupplierEntry, SupplierEntryInput, SupplierMoney, ExpenseFilter, FeatureKey, ReexportInput, ReexportLoadInput, ReexportOrder, SellingPrice, SellingPriceInput, StockAdjustInput, StockAdjustment, WarehouseExpense, WarehouseExpenseInput } from '@btw/api/types';
import { auditNote } from '../common/audit-context';
import { fail, forbidden, notFound } from '../common/errors';
import { iso, uid } from '../common/ids';
import { canSeeEntity, isGlobal, writeEntity, type Principal } from '../auth/principal';
import { appConfig } from '../config/app-config';
import { fxRates, saneAmount, usdOf } from './companies';
import { unusualNote } from '@btw/api/amounts';
import { LogisticsService } from './logistics.service';
import { NotifyService } from './notify.service';
import { RefService } from './ref.service';
import { ReportsService } from './reports.service';
import { loadShipments, map, publicShipment, saveShipment, type ShipmentRow } from './store';

type Q = typeof db | Tx;
const H = 36e5;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDay = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);

const toExpense = (r: typeof t.warehouseExpenses.$inferSelect): WarehouseExpense => ({ ...r, category: r.category as WarehouseExpense['category'], currency: r.currency as WarehouseExpense['currency'], at: new Date(r.at).toISOString(), receipt: r.receipt ?? null });
const toPrice = (r: typeof t.sellingPrices.$inferSelect): SellingPrice => ({ ...r, currency: r.currency as SellingPrice['currency'], at: new Date(r.at).toISOString() });
const toOrder = (r: typeof t.reexportOrders.$inferSelect): ReexportOrder => ({
  ...r, status: r.status as ReexportOrder['status'], createdAt: new Date(r.createdAt).toISOString(),
  loadedAt: r.loadedAt ? new Date(r.loadedAt).toISOString() : null, deliveredAt: r.deliveredAt ? new Date(r.deliveredAt).toISOString() : null,
});
const toMove = (m: typeof t.stockMoves.$inferSelect): StockMove => ({ entityId: m.entityId, warehouseId: m.warehouseId, productId: m.productId, kind: m.kind as StockMove['kind'], qty: m.qty, at: new Date(m.at).toISOString(), ref: m.ref, reason: m.reason, note: m.note, byUserId: m.byUserId });

@Injectable()
export class MoneyService {
  constructor(private ref: RefService, private notify: NotifyService, private logistics: LogisticsService, private reports: ReportsService) {}

  private feat(p: Principal, f: FeatureKey, msg?: string) { if (!hasFeature(p.roles, f)) forbidden(msg); }
  private async warehouse(id: unknown) { const w = (await this.ref.get()).bundle.warehouses.find((x) => x.id === id); return w ?? fail('Pick the warehouse', 422); }
  private async myWarehouses(p: Principal) { return (await this.ref.get()).bundle.warehouses.filter((w) => M.seesWarehouse(p, w.id)).map((w) => w.id); }

  // ---- B-01 warehouse expenses --------------------------------------------------------------------------------------
  async expenses(p: Principal, f: ExpenseFilter) {
    this.feat(p, 'warehouse-expenses', 'Warehouse expenses are recorded by the receivers and the directors');
    if (f.warehouseId && !M.seesWarehouse(p, f.warehouseId)) forbidden('Not your warehouse');
    const whs = f.warehouseId ? [f.warehouseId] : await this.myWarehouses(p);
    if (!whs.length) return [];
    const rows = (await db.select().from(t.warehouseExpenses).where(inArray(t.warehouseExpenses.warehouseId, whs)).orderBy(desc(t.warehouseExpenses.date))).map(toExpense);
    return M.filterExpenses(rows, { from: isoDay(f.from), to: isoDay(f.to), category: typeof f.category === 'string' ? f.category : undefined });
  }
  private async expenseRow(p: Principal, input: Partial<WarehouseExpenseInput>, cur?: WarehouseExpense) {
    const { bundle } = await this.ref.get();
    const v = { ...(cur ? { warehouseId: cur.warehouseId, date: cur.date, category: cur.category, amount: cur.amount, currency: cur.currency, reference: cur.reference, note: cur.note } : {}), ...(input ?? {}) };
    const errs = M.validateExpense(v, { warehouseIds: bundle.warehouses.map((w) => w.id) });
    if (errs.length) fail(errs.join('; '));
    if (!M.canRecordWarehouse(p, v.warehouseId!)) forbidden('You record expenses for your own warehouses only');
    // docs/17 F4: plausible amount for its currency (checked when the amount or currency is entered or changed)
    const check = !cur || input?.amount !== undefined || input?.currency !== undefined ? await saneAmount(db, 'warehouse-expense', v.amount, v.currency, v.date!, input?.confirmUnusual) : null;
    const currency = v.currency!;
    const fx = await usdOf(db, v.amount!, currency, v.date!);
    const receipt = input?.receiptFileId ? { id: input.receiptFileId, kind: 'receipt' as const, name: input.receiptName || 'receipt.jpg', ...(typeof input.receiptUrl === 'string' && input.receiptUrl.length < 2000 ? { url: input.receiptUrl } : {}) } : input?.receiptFileId === null ? null : cur?.receipt ?? null;
    const row = {
      id: cur?.id ?? uid('wx'), warehouseId: v.warehouseId!, receivingCompanyId: bundle.warehouses.find((w) => w.id === v.warehouseId)!.receivingCompanyId, date: v.date!, category: v.category!, amount: v.amount!, currency,
      fxRate: fx.fxRate, amountUsd: fx.amountUsd, reference: v.reference?.trim() || null, note: v.note?.trim() || null, receipt, byUserId: cur?.byUserId ?? p.id, at: cur?.at ?? iso(),
    };
    /** audit words when an unusual amount was confirmed */
    return [row, check ? unusualNote(check) : ''] as const;
  }
  async addExpense(p: Principal, input: WarehouseExpenseInput) {
    this.feat(p, 'warehouse-expenses');
    const [x, note] = await this.expenseRow(p, input);
    await db.insert(t.warehouseExpenses).values(x);
    auditNote({ recordType: 'warehouse-expense', recordId: x.id, summary: `${x.warehouseId}: ${x.category} ${x.currency} ${x.amount}${note}`, after: { category: x.category, amount: x.amount, currency: x.currency, date: x.date } });
    return toExpense({ ...x, at: x.at } as typeof t.warehouseExpenses.$inferSelect);
  }
  private async expenseOf(p: Principal, id: string) {
    const [r] = await db.select().from(t.warehouseExpenses).where(eq(t.warehouseExpenses.id, id));
    if (!r || !M.seesWarehouse(p, r.warehouseId)) return notFound('Expense');
    const e = toExpense(r);
    if (!M.canEditExpense(p, e)) forbidden('Only the person who recorded it or a director changes an expense');
    return e;
  }
  async updateExpense(p: Principal, id: string, input: Partial<WarehouseExpenseInput>) {
    this.feat(p, 'warehouse-expenses');
    const cur = await this.expenseOf(p, id);
    const [x, note] = await this.expenseRow(p, input, cur);
    await db.update(t.warehouseExpenses).set(x).where(eq(t.warehouseExpenses.id, id));
    auditNote({ recordType: 'warehouse-expense', recordId: id, summary: `${x.category} ${x.currency} ${x.amount}${note}`, before: { amount: cur.amount, category: cur.category, date: cur.date }, after: { amount: x.amount, category: x.category, date: x.date } });
    return toExpense(x as typeof t.warehouseExpenses.$inferSelect);
  }
  async deleteExpense(p: Principal, id: string) {
    this.feat(p, 'warehouse-expenses');
    const cur = await this.expenseOf(p, id);
    await db.delete(t.warehouseExpenses).where(eq(t.warehouseExpenses.id, id));
    auditNote({ recordType: 'warehouse-expense', recordId: id, summary: `removed ${cur.category} ${cur.currency} ${cur.amount}`, before: { category: cur.category, amount: cur.amount, currency: cur.currency, date: cur.date } });
  }

  // ---- B-02 warehouse inventory (quantities only) --------------------------------------------------------------------------
  async stock(p: Principal, f: { warehouseId?: string; from?: string; to?: string }) {
    this.feat(p, 'warehouse-stock', 'Warehouse inventory is for the receivers and the directors');
    if (f.warehouseId && !M.seesWarehouse(p, f.warehouseId)) forbidden('Not your warehouse');
    const whs = f.warehouseId ? [f.warehouseId] : await this.myWarehouses(p);
    if (!whs.length) return [];
    const [moves, acks] = await Promise.all([
      db.select().from(t.stockMoves).where(and(inArray(t.stockMoves.warehouseId, whs), inArray(t.stockMoves.entityId, p.scope))),
      db.select().from(t.acks).where(and(inArray(t.acks.warehouseId, whs), inArray(t.acks.entityId, p.scope))),
    ]);
    const from = f.from && !Number.isNaN(Date.parse(f.from)) ? Date.parse(f.from) : Date.now() - 30 * 864e5;
    const to = f.to && !Number.isNaN(Date.parse(f.to)) ? Date.parse(f.to) : undefined;
    return M.warehouseStock(moves.map(toMove), acks.map(map.ack), { warehouseIds: whs, from, to }).filter((r) => r.held || r.received || r.transfersIn || r.sold || r.opening);
  }
  private async held(q: Q, entityId: string, warehouseId: string, productId: string) {
    const [r] = await q.select({ n: sql<number>`coalesce(sum(case when ${t.stockMoves.kind} in ('received','transferIn','adjustment') then ${t.stockMoves.qty} else -${t.stockMoves.qty} end), 0)::int` })
      .from(t.stockMoves).where(and(eq(t.stockMoves.entityId, entityId), eq(t.stockMoves.warehouseId, warehouseId), eq(t.stockMoves.productId, productId)));
    return r?.n ?? 0;
  }
  async adjust(p: Principal, input: StockAdjustInput): Promise<StockAdjustment> {
    this.feat(p, 'warehouse-stock');
    const w = await this.warehouse(input?.warehouseId);
    if (!M.canRecordWarehouse(p, w.id)) forbidden('You record stock for your own warehouses only');
    const errs = M.validateAdjust(input); if (errs.length) fail(errs.join('; '));
    const { bundle } = await this.ref.get();
    const product = bundle.products.find((x) => x.id === input.productId); if (!product) fail('Unknown product');
    const entityId = writeEntity(p, typeof input.entityId === 'string' ? input.entityId : null);
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'stock:' + w.id}))`);
      const held = await this.held(tx, entityId, w.id, input.productId);
      const mv = M.adjustmentMove(input, held);
      if (held + mv.effect < 0) fail(`Only ${held} cases held — you cannot take out ${-mv.effect}`);
      const at = iso();
      const ref = `ADJ-${at.slice(0, 10).replace(/-/g, '')}-${w.id.slice(2).toUpperCase()}`;
      const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;
      await tx.insert(t.stockMoves).values({ entityId, warehouseId: w.id, productId: input.productId, kind: mv.kind, qty: mv.qty, at, ref, reason: mv.reason, note, byUserId: p.id });
      auditNote({ recordType: 'stock', recordId: `${w.id}/${input.productId}`, entityId, summary: `${mv.reason}: ${mv.effect >= 0 ? '+' : ''}${mv.effect} ${product!.brand}`, before: { held }, after: { held: held + mv.effect } });
      return { entityId, warehouseId: w.id, productId: input.productId, kind: input.kind, qty: mv.effect, counted: input.kind === 'count' ? input.counted ?? null : null, reason: mv.reason, note, at, byUserId: p.id, ref };
    });
  }
  async adjustments(p: Principal, f: { warehouseId?: string }) {
    this.feat(p, 'warehouse-stock');
    if (f.warehouseId && !M.seesWarehouse(p, f.warehouseId)) forbidden('Not your warehouse');
    const whs = f.warehouseId ? [f.warehouseId] : await this.myWarehouses(p);
    if (!whs.length) return [];
    const rows = await db.select().from(t.stockMoves).where(and(inArray(t.stockMoves.warehouseId, whs), inArray(t.stockMoves.entityId, p.scope), sql`${t.stockMoves.reason} is not null`)).orderBy(desc(t.stockMoves.at)).limit(200);
    return M.adjustmentsOf(rows.map(toMove));
  }

  // ---- B-03 re-export orders ---------------------------------------------------------------------------------------------------
  private async orderOut(o: ReexportOrder, q: Q = db) {
    if (!o.shipmentId) return o;
    const [sh] = await loadShipments(q, [o.shipmentId]);
    if (sh) await this.logistics.derive(sh);
    return { ...o, status: M.reexportStatus(o, sh) };
  }
  async listReexports(p: Principal) {
    this.feat(p, 're-export', 'Re-export orders are for Asie, Yonas, the truck follow-up officer and the directors');
    const rows = (await db.select().from(t.reexportOrders).orderBy(desc(t.reexportOrders.createdAt))).map(toOrder).filter((o) => canSeeEntity(p, o.entityId) && M.seesReexport(p, o));
    const ships = new Map((await loadShipments(db, rows.map((o) => o.shipmentId).filter((x): x is string => !!x))).map((s) => [s.id, s]));
    const out = [];
    for (const o of rows) { const sh = o.shipmentId ? ships.get(o.shipmentId) : undefined; if (sh) await this.logistics.derive(sh); out.push({ ...o, status: M.reexportStatus(o, sh) }); }
    return out;
  }
  private async order(p: Principal, id: string, q: Q = db) {
    const [r] = await q.select().from(t.reexportOrders).where(eq(t.reexportOrders.id, id));
    const o = r ? toOrder(r) : null;
    if (!o || !canSeeEntity(p, o.entityId) || !M.seesReexport(p, o)) return notFound('Re-export order');
    return o;
  }
  async getReexport(p: Principal, id: string) { this.feat(p, 're-export'); return this.orderOut(await this.order(p, id)); }
  private async checkLines(q: Q, entityId: string, fromWh: string, lines: { productId: string; qty: number }[]) {
    const { bundle } = await this.ref.get();
    if (!Array.isArray(lines) || !lines.length) fail('Add at least one product');
    const seen = new Set<string>();
    for (const l of lines) {
      if (!bundle.products.some((x) => x.id === l?.productId)) fail('Unknown product');
      if (seen.has(l.productId)) fail('Each product once per order'); seen.add(l.productId);
      if (!(Number.isInteger(l.qty) && l.qty > 0)) fail('Each line needs a whole number of cases above zero');
      const held = await this.held(q, entityId, fromWh, l.productId);
      if (l.qty > held) fail(`Only ${held} cases of ${bundle.products.find((x) => x.id === l.productId)?.brand} in stock at ${bundle.warehouses.find((w) => w.id === fromWh)?.name}`);
    }
  }
  async createReexport(p: Principal, input: ReexportInput) {
    this.feat(p, 're-export');
    const { bundle } = await this.ref.get();
    const from = bundle.warehouses.find((w) => w.id === input?.fromWarehouseId); if (!from) fail('Pick the warehouse the goods leave from');
    if (!M.canRaiseReexport(p, from!.id)) forbidden('Re-export orders are raised by the re-export planner of that warehouse');
    const routeId = typeof input.routeId === 'string' ? input.routeId : M.REEXPORT_ROUTE;
    const route = bundle.routes.find((r) => r.id === routeId); if (!route) fail('Route not found');
    const to = bundle.warehouses.find((w) => (input.toWarehouseId ? w.id === input.toWarehouseId : w.checkpointId === route!.stops.at(-1)!.checkpointId));
    if (!to || to.id === from!.id) fail('Pick the warehouse the goods go to');
    if (route!.stops[0].checkpointId !== from!.checkpointId || route!.stops.at(-1)!.checkpointId !== to!.checkpointId) fail(`The route must run from ${from!.name} to ${to!.name}`);
    if (input.note !== undefined && input.note !== null && (typeof input.note !== 'string' || input.note.length > 500)) fail('Note must be text (500 characters at most)');
    const entityId = writeEntity(p, typeof input.entityId === 'string' ? input.entityId : null);
    const rc = bundle.receivingCompanies.find((x) => x.id === from!.receivingCompanyId)?.name ?? 'RX';
    const testfie = (await db.select({ id: t.users.id, roles: t.users.roles }).from(t.users).where(eq(t.users.active, true))).find((u) => u.roles.includes('truck_planner'))?.id ?? null;
    const o = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'stock:' + from!.id}))`);
      await this.checkLines(tx, entityId, from!.id, input.lines);
      const refs = (await tx.select({ ref: t.reexportOrders.ref }).from(t.reexportOrders)).map((r) => r.ref);
      const row = { id: uid('rx'), ref: M.nextReexportRef(refs, rc, new Date().getFullYear()), entityId, fromWarehouseId: from!.id, toWarehouseId: to!.id, routeId,
        lines: input.lines.map((l) => ({ productId: l.productId, qty: l.qty })), status: 'Open', note: input.note?.trim() || null, createdById: p.id, createdAt: iso(), followUpById: testfie,
        truckId: typeof input.truckId === 'string' ? input.truckId : null, driverId: typeof input.driverId === 'string' ? input.driverId : null };
      await tx.insert(t.reexportOrders).values(row);
      await this.notify.notify(tx, 'Re-export raised', `${row.ref}: ${row.lines.reduce((a, l) => a + l.qty, 0).toLocaleString('en-US')} cases ${from!.name} → ${to!.name}`, '#/re-exports', ['truck_planner', 'director'], { entityId });
      return row;
    });
    auditNote({ recordType: 'reexport', recordId: o.id, entityId, summary: `${o.ref} raised`, after: { lines: o.lines } });
    return toOrder(o as typeof t.reexportOrders.$inferSelect);
  }
  async loadReexport(p: Principal, id: string, input: ReexportLoadInput) {
    this.feat(p, 're-export');
    const { bundle } = await this.ref.get();
    let truckId = typeof input?.truckId === 'string' ? input.truckId : undefined, driverId = typeof input?.driverId === 'string' ? input.driverId : undefined;
    const result = await db.transaction(async (tx) => {
      const [r] = await tx.select().from(t.reexportOrders).where(eq(t.reexportOrders.id, id)).for('update');
      const o = r ? toOrder(r) : null;
      if (!o || !canSeeEntity(p, o.entityId) || !M.seesReexport(p, o)) return notFound('Re-export order');
      if (!M.canRaiseReexport(p, o.fromWarehouseId)) forbidden('The re-export planner of that warehouse loads it');
      if (o.status !== 'Open') fail('This order is already loaded', 409, 'state');
      if (input?.market) {
        const reg = normReg(input.market.reg);
        if (!reg || typeof input.market.driverName !== 'string' || !input.market.driverName.trim()) fail('Truck registration and driver name are required');
        if ((await tx.select({ id: t.trucks.id }).from(t.trucks).where(sql`upper(replace(${t.trucks.reg}, ' ', '')) = ${reg.replace(/\s/g, '')}`)).length) fail(`${reg} is already registered — pick it from the list`, 409, 'duplicate');
        const company = (typeof input.market.company === 'string' && input.market.company.trim()) || 'Market truck';
        let [provider] = await tx.select().from(t.providers).where(sql`lower(${t.providers.name}) = ${company.toLowerCase()}`);
        if (!provider) { provider = { id: uid('pr'), name: company, regular: false, phone: '', kind: 'market', contactName: '', email: '', notes: '', active: true }; await tx.insert(t.providers).values(provider); }
        const driver = { id: uid('d'), name: input.market.driverName.trim(), phone: typeof input.market.driverPhone === 'string' ? input.market.driverPhone.trim() : '', licence: '', providerId: provider.id, hasApp: false };
        await tx.insert(t.drivers).values(driver);
        const cap = Number.isInteger(input.market.capacityCases) && input.market.capacityCases! > 0 ? input.market.capacityCases! : TRUCK_CASES;
        const truck = { id: uid('t'), providerId: provider.id, reg, trailer: typeof input.market.trailer === 'string' ? input.market.trailer.trim().toUpperCase() : '', capacityCases: cap, defaultDriverId: driver.id };
        await tx.insert(t.trucks).values(truck);
        truckId = truck.id; driverId = driver.id;
      } else {
        if (!bundle.trucks.some((x) => x.id === truckId)) fail('Pick the truck');
        if (!bundle.drivers.some((x) => x.id === driverId)) fail('Pick the driver');
      }
      const lines = o.lines.map((l) => { const q = input?.loadedQty?.[l.productId]; return { productId: l.productId, qty: q === undefined ? l.qty : Number(q) }; });
      if (lines.some((l) => !(Number.isInteger(l.qty) && l.qty >= 0))) fail('Loaded cases must be whole numbers ≥ 0');
      const loaded = lines.filter((l) => l.qty > 0);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'stock:' + o.fromWarehouseId}))`);
      await this.checkLines(tx, o.entityId, o.fromWarehouseId, loaded);
      const to = bundle.warehouses.find((w) => w.id === o.toWarehouseId)!;
      const stops = bundle.routes.find((x) => x.id === o.routeId)?.stops ?? [];
      if (!stops.length) fail('Route not found');
      const at = Date.now();
      const sh: ShipmentRow = { id: uid('shp'), ref: o.ref, poId: o.id, truckNo: 1, receivingCompanyId: to.receivingCompanyId, warehouseId: to.id, legs: [], status: 'Loaded', entityId: o.entityId, loadingPointId: o.fromWarehouseId, parentShipmentId: null, originShipmentId: null, fromWarehouseId: o.fromWarehouseId };
      await tx.insert(t.shipments).values({ id: sh.id, ref: sh.ref, poId: sh.poId, truckNo: 1, receivingCompanyId: sh.receivingCompanyId, warehouseId: sh.warehouseId, status: 'Loaded', entityId: sh.entityId, loadingPointId: sh.loadingPointId, fromWarehouseId: sh.fromWarehouseId });
      for (const l of loaded) await tx.insert(t.stockMoves).values({ entityId: o.entityId, warehouseId: o.fromWarehouseId, productId: l.productId, kind: 'transferOut', qty: l.qty, at: iso(at), ref: o.ref, byUserId: p.id });
      const leg = this.logistics.newLeg(sh, o.routeId, stops, truckId!, driverId!, at + 2 * H, loaded.map((l) => ({ productId: l.productId, loadedQty: l.qty })));
      leg.status = 'Loaded';
      await this.logistics.derive(sh); await saveShipment(tx, sh);
      const next = { status: 'Loaded', shipmentId: sh.id, truckId, driverId, loadedById: p.id, loadedAt: iso(at), lines: o.lines.map((l) => ({ ...l, loadedQty: lines.find((x) => x.productId === l.productId)!.qty })) };
      await tx.update(t.reexportOrders).set(next).where(eq(t.reexportOrders.id, id));
      const reg = input?.market ? normReg(input.market.reg) : bundle.trucks.find((x) => x.id === truckId)?.reg ?? '';
      await this.notify.notify(tx, 'Re-export loaded', `${o.ref}: ${reg} loaded at ${bundle.warehouses.find((w) => w.id === o.fromWarehouseId)?.name} for ${to.name}`, `#/shipments/${sh.id}`, ['receiver', 'truck_planner', 'director'], { entityId: o.entityId });
      auditNote({ recordType: 'reexport', recordId: id, entityId: o.entityId, summary: `${o.ref} loaded on ${reg}` });
      return { ...o, ...next, status: 'Loaded' as const };
    });
    if (input?.market) this.ref.invalidate();
    void this.notify.pushToDriver(driverId!, 'Trip assigned', `${result.ref}: re-export to ${bundle.warehouses.find((w) => w.id === result.toWarehouseId)?.name}. Slide “I’m leaving” when you depart.`, `#/trip/${result.shipmentId}`);
    return result as ReexportOrder;
  }
  async cancelReexport(p: Principal, id: string, reason?: string) {
    this.feat(p, 're-export');
    const o = await this.order(p, id);
    if (!(M.canRaiseReexport(p, o.fromWarehouseId) || isGlobal(p))) forbidden('Only the re-export planner or a director cancels it');
    if (o.status !== 'Open') fail('Only an order not loaded yet can be cancelled', 409, 'state');
    const note = [o.note, typeof reason === 'string' && reason.trim() ? `Cancelled: ${reason.trim().slice(0, 200)}` : 'Cancelled'].filter(Boolean).join(' · ');
    await db.update(t.reexportOrders).set({ status: 'Cancelled', note }).where(eq(t.reexportOrders.id, id));
    auditNote({ recordType: 'reexport', recordId: id, entityId: o.entityId, summary: `${o.ref} cancelled` });
    return { ...o, status: 'Cancelled' as const, note };
  }

  // ---- B-05 selling prices ------------------------------------------------------------------------------------------------------------
  async prices(p: Principal) {
    this.feat(p, 'selling-prices', 'Selling prices are set by the directors');
    return (await db.select().from(t.sellingPrices).where(inArray(t.sellingPrices.entityId, p.scope)).orderBy(desc(t.sellingPrices.from), desc(t.sellingPrices.at))).map(toPrice);
  }
  async setPrice(p: Principal, input: SellingPriceInput) {
    this.feat(p, 'selling-prices', 'Selling prices are set by the directors');
    const { bundle } = await this.ref.get();
    const errs = M.validateSellingPrice(input ?? {}, { productIds: bundle.products.map((x) => x.id), warehouseIds: bundle.warehouses.map((w) => w.id) });
    if (errs.length) fail(errs.join('; '));
    const entityId = writeEntity(p, typeof input.entityId === 'string' ? input.entityId : null);
    const all = (await db.select().from(t.sellingPrices).where(and(eq(t.sellingPrices.entityId, entityId), eq(t.sellingPrices.productId, input.productId)))).map(toPrice);
    const row = { id: uid('sp'), entityId, productId: input.productId, warehouseId: input.warehouseId ?? null, price: Math.round(input.price * 100) / 100, currency: 'USD', from: input.from && DATE.test(input.from) ? input.from : iso().slice(0, 10), note: typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null, byUserId: p.id, at: iso() };
    await db.insert(t.sellingPrices).values(row);
    auditNote({ recordType: 'selling-price', recordId: `${row.productId}/${row.warehouseId ?? 'all'}`, entityId, summary: `${bundle.products.find((x) => x.id === row.productId)?.brand}: USD ${row.price} from ${row.from}`, before: { price: M.sellingPriceFor(all, entityId, row.warehouseId, row.productId, row.from) }, after: { price: row.price, from: row.from } });
    return toPrice(row as typeof t.sellingPrices.$inferSelect);
  }

  // ---- B-04 transport fees -----------------------------------------------------------------------------------------------------------------
  async fees(p: Principal) {
    if (!hasFeature(p.roles, 'transport-fees')) forbidden('Transport fees are for the truck follow-up officer and the directors');
    const { bundle } = await this.ref.get();
    const cps = bundle.warehouses.filter((w) => p.warehouseIds.includes(w.id)).map((w) => w.checkpointId);
    const shs = (await loadShipments(db)).filter((s) => canSeeEntity(p, s.entityId) && s.legs.length && seesShipment(p, s, { loadingPointId: s.loadingPointId, myWarehouseCps: cps }));
    for (const s of shs) await this.logistics.derive(s);
    const ids = shs.map((s) => s.id);
    if (!ids.length) return [];
    const [costs, pays, loadings, orders] = await Promise.all([
      db.select().from(t.tripCosts).where(inArray(t.tripCosts.shipmentId, ids)), db.select().from(t.tripPayments).where(inArray(t.tripPayments.shipmentId, ids)),
      db.select({ poId: t.loadings.poId, truckNo: t.loadings.truckNo, loadedAt: t.loadings.loadedAt, status: t.loadings.status }).from(t.loadings), db.select({ shipmentId: t.reexportOrders.shipmentId, loadedAt: t.reexportOrders.loadedAt }).from(t.reexportOrders),
    ]);
    const rx = new Map(orders.filter((o) => o.shipmentId).map((o) => [o.shipmentId!, o.loadedAt]));
    const byId = new Map(shs.map((s) => [s.id, s]));
    const loadedAt = (id: string) => {
      const s = byId.get(id)!;
      const r = rx.get(id); if (r) return new Date(r).toISOString();
      const ld = !s.fromWarehouseId ? loadings.find((l) => l.poId === s.poId && l.truckNo === s.truckNo && l.status === 'Loaded') : undefined;
      return ld?.loadedAt ? new Date(ld.loadedAt).toISOString() : s.legs[0].passes[0]?.departedAt ?? s.legs[0].departedAt ?? null;
    };
    return M.feeRows({ shipments: shs.map(publicShipment), costs: costs.map(map.cost), payments: pays.map(map.payment), loadedAt, providerOf: (tid) => bundle.trucks.find((x) => x.id === tid)?.providerId ?? null, now: Date.now(), cfg: appConfig, reexportIds: new Set(rx.keys()) }).reverse();
  }

  // ---- B-06/B-07 combined performance report ---------------------------------------------------------------------------------------------
  async performance(p: Principal, f: PerfFilter) {
    this.feat(p, 'performance', 'The combined performance report is for the directors');
    const data = await this.reports.data(p, { entityId: f.entityId, report: 'reports' });
    const [expenses, prices] = await Promise.all([db.select().from(t.warehouseExpenses).orderBy(asc(t.warehouseExpenses.date)), db.select().from(t.sellingPrices).where(inArray(t.sellingPrices.entityId, p.scope))]);
    return performanceReport({ ...data, expenses: expenses.map(toExpense), sellingPrices: prices.map(toPrice), allocation: appConfig.costs?.allocation ?? 'quantity' }, f);
  }

  // ---- Supplier money (V3-12 step 3) ---------------------------------------------------------------------------------
  private entryOut(r: typeof t.supplierEntries.$inferSelect): SupplierEntry {
    return { id: r.id, entityId: r.entityId, supplierId: r.supplierId, poId: r.poId ?? undefined, poRef: r.poRef ?? undefined, kind: r.kind as SupplierEntry['kind'],
      amount: r.amount, currency: r.currency as SupplierEntry['currency'], fxRate: r.fxRate, amountUsd: r.amountUsd, date: r.date, reference: r.reference ?? undefined, note: r.note ?? undefined,
      document: r.document ?? null, status: r.status as SupplierEntry['status'], linkedId: r.linkedId ?? undefined, byUserId: r.byUserId, at: new Date(r.at).toISOString(), decidedById: r.decidedById ?? undefined, decidedAt: r.decidedAt ? new Date(r.decidedAt).toISOString() : undefined };
  }
  /** The base PO of the chain (revisions share one pro-forma), after the same access check as the PO page; prices only. */
  private async supplierPo(p: Principal, poId: string) {
    const [r] = await db.select().from(t.pos).where(eq(t.pos.id, poId));
    const [b] = r?.revisionOf ? await db.select().from(t.pos).where(eq(t.pos.id, r.revisionOf)) : [r];
    if (!b || !canSeeEntity(p, b.entityId) || !hasFeature(p.roles, 'purchase-orders') || !seesPrices(p)) notFound('Purchase order');
    const [plan] = await db.select().from(t.plans).where(eq(t.plans.id, b!.planId));
    const { bundle } = await this.ref.get();
    const rc = [...new Set(bundle.warehouses.filter((w) => p.warehouseIds.includes(w.id)).map((w) => w.receivingCompanyId))];
    if (!orderAccess(p, { entityId: b!.entityId, supplierId: b!.supplierId, lines: plan ? map.plan(plan).lines : [] }, rc)) notFound('Purchase order');
    return map.po(b!);
  }
  private async moneySettings(): Promise<MoneySettings> {
    const [r] = await db.select().from(t.settings).where(eq(t.settings.key, 'money'));
    return { ...defaultMoneySettings, ...(r?.value as Partial<MoneySettings> | undefined) };
  }
  private async supplierMoneyOf(p: Principal, poId: string, q: Q = db): Promise<{ po: Awaited<ReturnType<MoneyService['supplierPo']>>; money: SupplierMoney }> {
    const po = await this.supplierPo(p, poId);
    const pair = and(eq(t.supplierEntries.entityId, po.entityId), eq(t.supplierEntries.supplierId, po.supplierId));
    const [rows, pos, loadings, rates, st] = await Promise.all([
      q.select().from(t.supplierEntries).where(pair),
      q.select().from(t.pos).where(and(eq(t.pos.entityId, po.entityId), eq(t.pos.supplierId, po.supplierId))),
      q.select().from(t.loadings).where(eq(t.loadings.entityId, po.entityId)),
      fxRates(), this.moneySettings(),
    ]);
    const poList = pos.map(map.po);
    const plans = poList.length ? (await q.select().from(t.plans).where(inArray(t.plans.id, [...new Set(poList.map((x) => x.planId))]))).map(map.plan) : [];
    const entries = rows.map((r) => this.entryOut(r));
    const shorts = M.shortLoadRows({ loadings: loadings.map(map.loading).filter((l) => poList.some((x) => x.id === l.poId)), pos: poList, plans, fxRates: rates });
    return { po, money: { entityId: po.entityId, supplierId: po.supplierId, currency: po.currency, po: M.poMoney(entries, po.id), held: M.supplierHeld(shorts, entries, po.entityId, po.supplierId),
      entries: entries.filter((e) => e.poId === po.id || e.kind === 'credit-note' || e.kind === 'use').sort((a, b) => (a.at < b.at ? 1 : -1)),
      canRecord: M.canRecordSupplierMoney(p, po.entityId, po.supplierId), canDecide: p.roles.includes('director'), approvalOn: st.advanceApproval } };
  }
  async supplierMoney(p: Principal, poId: string) { return (await this.supplierMoneyOf(p, poId)).money; }
  /** Pro-forma, advance (with any part from money the supplier holds) or credit note, on the PO. Advances wait for a director
   *  when Management → Settings says so. Advances and credit notes tell the directors (in-app; email / SMS as they chose). */
  async recordSupplierMoney(p: Principal, poId: string, input: SupplierEntryInput) {
    const out = await db.transaction(async (tx) => {
      const base = await this.supplierPo(p, poId);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'supplier:' + base.entityId + ':' + base.supplierId}))`);
      const { po, money } = await this.supplierMoneyOf(p, poId, tx);
      if (!money.canRecord) forbidden('Supplier money is recorded by the directors, accounts and the planner of this supplier');
      if (po.status === 'Deleted' || po.status === 'Awaiting approval') fail('Record supplier money on an issued purchase order', 422);
      const date = input?.date ?? iso().slice(0, 10);
      const rate = po.currency === 'USD' ? 1 : fxFor(await fxRates(), po.currency, `${date}T12:00:00Z`);
      const usd = (x: number) => Math.round((x / rate) * 100) / 100;
      const err = M.supplierEntryError(input ?? {}, money.po, money.held.available, usd);
      if (err) fail(err, 422);
      const status = input.kind === 'advance' && money.approvalOn ? 'Pending approval' : 'Recorded';
      const doc = input.documentFileId ? { id: input.documentFileId, kind: 'invoice' as const, name: input.documentName ?? 'Document', url: input.documentUrl ?? undefined } : null;
      const common = { entityId: po.entityId, supplierId: po.supplierId, poId: po.id, poRef: po.ref, currency: po.currency, fxRate: rate, date, reference: input.reference?.trim() || null, note: input.note?.trim() || null, status, byUserId: p.id };
      const amt = Number(input.amount ?? 0), use = Number(input.useHeld ?? 0);
      const ids = { main: uid('se'), use: uid('se') };
      const rows: (typeof t.supplierEntries.$inferInsert)[] = [];
      if (input.kind !== 'advance' || amt > 0) rows.push({ ...common, id: ids.main, kind: input.kind, amount: amt, amountUsd: usd(amt), document: doc, linkedId: input.kind === 'advance' && use > 0 ? ids.use : null });
      if (input.kind === 'advance' && use > 0) rows.push({ ...common, id: ids.use, kind: 'use', amount: use, amountUsd: usd(use), document: null, linkedId: amt > 0 ? ids.main : null });
      const saved = (await tx.insert(t.supplierEntries).values(rows).returning()).map((r) => this.entryOut(r));
      const what = input.kind === 'proforma' ? 'Pro-forma' : input.kind === 'credit-note' ? 'Credit note' : 'Advance payment';
      const total = amt + use;
      auditNote({ recordType: 'po', recordId: po.id, entityId: po.entityId, summary: `${po.ref}: ${what.toLowerCase()} ${po.currency} ${total}${use ? ` (${po.currency} ${use} from money the supplier holds)` : ''}${status === 'Pending approval' ? ' · waiting for a director' : ''}`, after: saved });
      if (input.kind !== 'proforma') {
        const sup = (await this.ref.get()).bundle.suppliers.find((x) => x.id === po.supplierId)?.code ?? '';
        await this.notify.notifyMoney(tx, status === 'Pending approval' ? `${what} to approve` : `${what} recorded`,
          `${po.ref} · ${sup}: ${po.currency} ${total.toLocaleString('en-US')} by ${p.name}${use ? ` (${po.currency} ${use.toLocaleString('en-US')} from money the supplier holds)` : ''}`, `#/pos/${po.id}`, po.entityId);
      }
      return saved;
    });
    return out;
  }
  /** A director approves or rejects a waiting advance (and the held money it uses). */
  async decideSupplierEntry(p: Principal, id: string, approve: boolean) {
    if (!p.roles.includes('director')) forbidden('A director approves advance payments');
    return db.transaction(async (tx) => {
      const [e] = await tx.select().from(t.supplierEntries).where(eq(t.supplierEntries.id, id));
      if (!e || !canSeeEntity(p, e.entityId)) notFound('Advance');
      if (e!.status !== 'Pending approval') fail('Already decided', 409, 'conflict');
      const ids = [e!.id, e!.linkedId].filter((x): x is string => !!x);
      const rows = await tx.update(t.supplierEntries).set({ status: approve ? 'Recorded' : 'Rejected', decidedById: p.id, decidedAt: iso() }).where(inArray(t.supplierEntries.id, ids)).returning();
      auditNote({ recordType: 'po', recordId: e!.poId ?? e!.id, entityId: e!.entityId, summary: `${e!.poRef ?? ''}: advance ${approve ? 'approved' : 'rejected'}` });
      return rows.map((r) => this.entryOut(r));
    });
  }
  async supplierEntries(p: Principal) {
    if (!seesPrices(p) || !hasFeature(p.roles, 'purchase-orders')) return [];
    return (await db.select().from(t.supplierEntries).where(inArray(t.supplierEntries.entityId, p.scope)).orderBy(desc(t.supplierEntries.at)).limit(1000)).map((r) => this.entryOut(r));
  }

}
