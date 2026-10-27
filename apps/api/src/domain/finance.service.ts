import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema as t } from '../db/client';
import type { Currency, TripCost } from '@btw/api/types';
import { canRecordPayment, seesShipment } from '@btw/api/access';
import { auditNote } from '../common/audit-context';
import { fail, forbidden, notFound } from '../common/errors';
import { hasFeature } from '@btw/api/rules';
import { iso, uid } from '../common/ids';
import { assertEntity, canSeeEntity, has, type Principal } from '../auth/principal';
import { saneAmount, usdOf } from './companies';
import { unusualNote } from '@btw/api/amounts';
import { NotifyService } from './notify.service';
import { RefService } from './ref.service';
import { loadShipments, map, publicShipment } from './store';

/** FN-01..04 + §17.6 landing cost per truck. */
@Injectable()
export class FinanceService {
  constructor(private ref: RefService, private notify: NotifyService) {}
  /** Roles document §7: trip financials (goods value, landed cost, payments approval) are the directors'; the truck
   *  follow-up officer reads the transport side (agreed price, expenses, payments against references) and adds expenses. */
  private assert(p: Principal) { if (!hasFeature(p.roles, 'finance') && !hasFeature(p.roles, 'truck-expenses')) forbidden(); }
  private assertExpenses(p: Principal) { if (!hasFeature(p.roles, 'truck-expenses')) forbidden('Truck expenses are recorded by the truck follow-up officer and the directors'); }

  async trips(p: Principal) {
    this.assert(p);
    const full = hasFeature(p.roles, 'finance');
    const cps = (await this.ref.get()).bundle.warehouses.filter((w) => p.warehouseIds.includes(w.id)).map((w) => w.checkpointId);
    const shs = (await loadShipments(db)).filter((s) => canSeeEntity(p, s.entityId) && seesShipment(p, s, { loadingPointId: s.loadingPointId, myWarehouseCps: cps }));
    if (!shs.length) return [];
    const ids = shs.map((s) => s.id);
    const [costs, pays, plans, pos] = await Promise.all([
      db.select().from(t.tripCosts).where(inArray(t.tripCosts.shipmentId, ids)), db.select().from(t.tripPayments).where(inArray(t.tripPayments.shipmentId, ids)),
      db.select().from(t.plans), db.select().from(t.pos),
    ]);
    return shs.map((s) => {
      // totals in USD (stored amountUsd at the approved month-average rate); lines keep their own currency
      const c = costs.filter((x) => x.shipmentId === s.id).map(map.cost).map((x) => ({ ...x, amountUsd: x.amountUsd ?? x.amount }));
      const py = pays.filter((x) => x.shipmentId === s.id).map(map.payment);
      const transport = c.filter((x) => x.kind === 'Transport').reduce((a, x) => a + x.amountUsd, 0);
      const paid = py.filter((x) => x.status !== 'Pending approval').reduce((a, x) => a + (x.amountUsd ?? x.amount), 0);
      const po = pos.find((x) => x.id === s.poId); const plan = plans.find((x) => x.id === po?.planId);
      const goods = s.legs[0].lines.reduce((a, l) => a + l.loadedQty * (plan?.lines.find((pl) => pl.productId === l.productId)?.price ?? 0), 0);
      const cases = s.legs[0].lines.reduce((a, l) => a + l.loadedQty, 0);
      const expenses = c.reduce((a, x) => a + x.amountUsd, 0);
      // A-04: no agreed price yet → `agreedRecorded: false` (shown as "not recorded", never as a zero price)
      const row = { shipment: publicShipment(s), costs: c, payments: py, transport, paid, balance: transport - paid, goods, expenses, landing: goods + expenses, cases, perCase: cases ? (goods + expenses) / cases : 0, agreedRecorded: c.some((x) => x.kind === 'Transport') };
      if (full) return row;
      const { goods: _g, landing: _l, perCase: _pc, ...transportSide } = row;
      return transportSide;
    });
  }
  /** docs/12 A-04: the agreed transport price of a loaded truck, recorded after loading (Testfie, directors). Creates the
   *  trip's Transport cost line, or corrects it while nothing has been paid against it. */
  async setAgreedPrice(p: Principal, shipmentId: string, input: { amount?: number; currency?: string; docRef?: string; confirmUnusual?: boolean }) {
    this.assertExpenses(p);
    const s = await this.shipmentScope(p, shipmentId);
    const amount = Number(input?.amount);
    if (!(amount > 0)) fail('Enter the agreed transport price (above zero)');
    if (input?.docRef !== undefined && (typeof input.docRef !== 'string' || input.docRef.length > 120)) fail('Reference must be text (120 characters at most)', 400, 'bad-request');
    // docs/17 F4: the currency is always explicit (never taken from a default) and the amount must be plausible for it
    const check = await saneAmount(db, 'transport', amount, input?.currency, Date.now(), input?.confirmUnusual);
    const [ld] = await db.select().from(t.loadings).where(eq(t.loadings.poId, s.poId)).then((rows) => rows.filter((x) => x.truckNo === s.truckNo && x.status === 'Loaded'));
    const currency = check.currency as Currency;
    return db.transaction(async (tx) => {
      const [cur] = await tx.select().from(t.tripCosts).where(and(eq(t.tripCosts.shipmentId, s.id), eq(t.tripCosts.kind, 'Transport')));
      if (cur && (await tx.select({ id: t.tripPayments.id }).from(t.tripPayments).where(eq(t.tripPayments.costId, cur.id))).length) fail('Payments were made against this price — record a correction as another cost instead', 409, 'state');
      const [leg] = await tx.select({ id: t.legs.id }).from(t.legs).where(eq(t.legs.shipmentId, s.id)).orderBy(t.legs.seq).limit(1);
      const x = { id: cur?.id ?? uid('cost'), entityId: s.entityId, shipmentId: s.id, legId: leg?.id ?? null, kind: 'Transport', amount, currency, docRef: input?.docRef?.trim() || `Agreed after loading ${iso().slice(0, 10)}`, ...(await usdOf(tx, amount, currency)) };
      if (cur) await tx.update(t.tripCosts).set(x).where(eq(t.tripCosts.id, cur.id)); else await tx.insert(t.tripCosts).values(x);
      if (ld && !s.fromWarehouseId) await tx.update(t.loadings).set({ agreedTransport: amount, transportCurrency: currency }).where(eq(t.loadings.id, ld.id));
      auditNote({ recordType: 'shipment', recordId: s.id, summary: `${s.ref}: agreed transport ${currency} ${amount}${unusualNote(check)}`, entityId: s.entityId, before: cur ? { amount: cur.amount, currency: cur.currency } : null, after: { amount, currency } });
      return map.cost(x as typeof t.tripCosts.$inferSelect);
    });
  }
  private async shipmentScope(p: Principal, shipmentId: string) {
    const [s] = await db.select().from(t.shipments).where(eq(t.shipments.id, shipmentId));
    if (!s) return notFound('Shipment');
    assertEntity(p, s.entityId);
    return s;
  }
  async addCost(p: Principal, c: Omit<TripCost, 'id'> & { confirmUnusual?: boolean }) {
    this.assertExpenses(p);
    if (!(c.amount > 0)) fail('Amount must be above zero');
    const s = await this.shipmentScope(p, c.shipmentId);
    // a cost belongs to the trip's company; naming another one is refused
    if (c.entityId && c.entityId !== s.entityId) fail('That trip belongs to another company', 403, 'forbidden');
    const check = await saneAmount(db, c.kind === 'Transport' ? 'transport' : 'trip-expense', c.amount, c.currency, Date.now(), c.confirmUnusual);
    const currency = check.currency as Currency;
    const x = { id: uid('cost'), entityId: s.entityId, shipmentId: c.shipmentId, legId: c.legId ?? null, kind: c.kind, amount: c.amount, currency, docRef: c.docRef ?? null, ...(await usdOf(db, c.amount, currency)) };
    await db.insert(t.tripCosts).values(x);
    auditNote({ recordType: 'cost', recordId: x.id, entityId: s.entityId, summary: `${s.ref}: ${x.kind} ${currency} ${x.amount}${unusualNote(check)}`, after: { kind: x.kind, amount: x.amount, currency, ...(check.level === 'unusual' ? { confirmUnusual: true } : {}) } });
    return map.cost(x as typeof t.tripCosts.$inferSelect);
  }
  /** FN-02/03: payments above the director-set threshold wait for approval. */
  async pay(p: Principal, input: { shipmentId: string; costId: string; amount: number; reference: string; receiptFileId?: string; confirmUnusual?: boolean }) {
    if (!canRecordPayment(p)) forbidden('Only the directors record payments');
    if (!(input.amount > 0)) fail('Amount must be above zero');
    if (!input.reference?.trim()) fail('Enter the payment reference');
    const s = await this.shipmentScope(p, input.shipmentId);
    const [cost] = await db.select().from(t.tripCosts).where(eq(t.tripCosts.id, input.costId ?? ''));
    if (!cost || cost.shipmentId !== input.shipmentId || cost.entityId !== s.entityId) fail('Pick a cost line of this trip');
    const paidSoFar = (await db.select().from(t.tripPayments).where(eq(t.tripPayments.costId, cost!.id))).reduce((a, x) => a + x.amount, 0);
    if (input.amount > cost!.amount - paidSoFar + 0.005) fail(`That is more than the balance of ${cost!.currency} ${(cost!.amount - paidSoFar).toFixed(2)} on this cost`);
    const check = await saneAmount(db, 'payment', input.amount, cost!.currency, Date.now(), input.confirmUnusual);
    // paid in the cost's currency at the cost's rate; the approval threshold is in USD
    const fxRate = cost!.fxRate || 1, amountUsd = Math.round((input.amount / fxRate) * 100) / 100;
    const threshold = (await this.ref.get()).bundle.settings.paymentApprovalThreshold;
    const status = amountUsd > threshold ? 'Pending approval' : 'Paid';
    const row = { id: uid('pay'), entityId: s.entityId, fxRate, amountUsd, shipmentId: input.shipmentId, costId: input.costId, amount: input.amount, at: iso(), reference: input.reference.trim(), status, approvedById: null, receiptFileId: input.receiptFileId ?? null };
    auditNote({ recordType: 'payment', recordId: row.id, entityId: s.entityId, summary: `${s.ref}: paid ${cost!.currency} ${input.amount} · ${row.reference}${unusualNote(check)}` });
    await db.transaction(async (tx) => {
      await tx.insert(t.tripPayments).values(row);
      if (status === 'Pending approval') await this.notify.notify(tx, 'Payment needs approval', `${cost!.currency} ${input.amount} · ${input.reference} · ${s.ref}`, '#/transport-costs?tab=trips', ['director'], { email: true, entityId: s.entityId });
    });
    return map.payment(row as typeof t.tripPayments.$inferSelect);
  }
  async approve(p: Principal, paymentId: string) {
    if (!has(p, 'director')) forbidden('Only directors approve payments above the threshold');
    const [x] = await db.select().from(t.tripPayments).where(eq(t.tripPayments.id, paymentId));
    if (!x) return notFound('Payment');
    assertEntity(p, x.entityId);
    if (x.status !== 'Pending approval') fail('This payment is not waiting for approval', 409, 'state');
    await db.update(t.tripPayments).set({ status: 'Paid', approvedById: p.id }).where(eq(t.tripPayments.id, paymentId));
    return map.payment({ ...x, status: 'Paid', approvedById: p.id });
  }
}
