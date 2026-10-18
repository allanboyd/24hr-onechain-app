import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { db, schema as t } from '../db/client';
import type { TripCost } from '@btw/api/types';
import { fail, forbidden, notFound } from '../common/errors';
import { hasFeature } from '@btw/api/rules';
import { iso, uid } from '../common/ids';
import { assertEntity, canSeeEntity, has, type Principal } from '../auth/principal';
import { usdOf } from './companies';
import { NotifyService } from './notify.service';
import { RefService } from './ref.service';
import { loadShipments, map, publicShipment } from './store';

/** FN-01..04 + §17.6 landing cost per truck. */
@Injectable()
export class FinanceService {
  constructor(private ref: RefService, private notify: NotifyService) {}
  /** Role × feature matrix (docs/07 §E): trip costs and payments are the Finance feature. */
  private assert(p: Principal) { if (!hasFeature(p.roles, 'finance')) forbidden(); }

  async trips(p: Principal) {
    this.assert(p);
    const shs = (await loadShipments(db)).filter((s) => canSeeEntity(p, s.entityId));
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
      return { shipment: publicShipment(s), costs: c, payments: py, transport, paid, balance: transport - paid, goods, expenses, landing: goods + expenses, cases, perCase: cases ? (goods + expenses) / cases : 0 };
    });
  }
  private async shipmentScope(p: Principal, shipmentId: string) {
    const [s] = await db.select().from(t.shipments).where(eq(t.shipments.id, shipmentId));
    if (!s) return notFound('Shipment');
    assertEntity(p, s.entityId);
    return s;
  }
  async addCost(p: Principal, c: Omit<TripCost, 'id'>) {
    this.assert(p);
    if (!(c.amount > 0)) fail('Amount must be above zero');
    const s = await this.shipmentScope(p, c.shipmentId);
    // a cost belongs to the trip's company; naming another one is refused
    if (c.entityId && c.entityId !== s.entityId) fail('That trip belongs to another company', 403, 'forbidden');
    const currency = c.currency ?? 'USD';
    const x = { id: uid('cost'), entityId: s.entityId, shipmentId: c.shipmentId, legId: c.legId ?? null, kind: c.kind, amount: c.amount, currency, docRef: c.docRef ?? null, ...(await usdOf(db, c.amount, currency)) };
    await db.insert(t.tripCosts).values(x);
    return map.cost(x as typeof t.tripCosts.$inferSelect);
  }
  /** FN-02/03: payments above the director-set threshold wait for approval. */
  async pay(p: Principal, input: { shipmentId: string; costId: string; amount: number; reference: string; receiptFileId?: string }) {
    if (!has(p, 'accounts', 'director')) forbidden('Only accounts record payments');
    if (!(input.amount > 0)) fail('Amount must be above zero');
    if (!input.reference?.trim()) fail('Enter the payment reference');
    const s = await this.shipmentScope(p, input.shipmentId);
    const [cost] = await db.select().from(t.tripCosts).where(eq(t.tripCosts.id, input.costId ?? ''));
    if (!cost || cost.shipmentId !== input.shipmentId || cost.entityId !== s.entityId) fail('Pick a cost line of this trip');
    const paidSoFar = (await db.select().from(t.tripPayments).where(eq(t.tripPayments.costId, cost!.id))).reduce((a, x) => a + x.amount, 0);
    if (input.amount > cost!.amount - paidSoFar + 0.005) fail(`That is more than the balance of ${cost!.currency} ${(cost!.amount - paidSoFar).toFixed(2)} on this cost`);
    // paid in the cost's currency at the cost's rate; the approval threshold is in USD
    const fxRate = cost!.fxRate || 1, amountUsd = Math.round((input.amount / fxRate) * 100) / 100;
    const threshold = (await this.ref.get()).bundle.settings.paymentApprovalThreshold;
    const status = amountUsd > threshold ? 'Pending approval' : 'Paid';
    const row = { id: uid('pay'), entityId: s.entityId, fxRate, amountUsd, shipmentId: input.shipmentId, costId: input.costId, amount: input.amount, at: iso(), reference: input.reference.trim(), status, approvedById: null, receiptFileId: input.receiptFileId ?? null };
    await db.transaction(async (tx) => {
      await tx.insert(t.tripPayments).values(row);
      if (status === 'Pending approval') await this.notify.notify(tx, 'Payment needs approval', `${cost!.currency} ${input.amount} · ${input.reference} · ${s.ref}`, '#/finance', ['director'], { email: true, entityId: s.entityId });
    });
    return map.payment(row as typeof t.tripPayments.$inferSelect);
  }
  async approve(p: Principal, paymentId: string) {
    if (!has(p, 'director')) forbidden('Only directors approve payments above the threshold (FN-03)');
    const [x] = await db.select().from(t.tripPayments).where(eq(t.tripPayments.id, paymentId));
    if (!x) return notFound('Payment');
    assertEntity(p, x.entityId);
    if (x.status !== 'Pending approval') fail('This payment is not waiting for approval', 409, 'state');
    await db.update(t.tripPayments).set({ status: 'Paid', approvedById: p.id }).where(eq(t.tripPayments.id, paymentId));
    return map.payment({ ...x, status: 'Paid', approvedById: p.id });
  }
}
