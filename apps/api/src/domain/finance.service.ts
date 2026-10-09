import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { db, schema as t } from '../db/client';
import type { TripCost } from '@btw/api/types';
import { fail, forbidden, notFound } from '../common/errors';
import { iso, uid } from '../common/ids';
import { canSeeEntity, has, type Principal } from '../auth/principal';
import { NotifyService } from './notify.service';
import { RefService } from './ref.service';
import { loadShipments, map, publicShipment } from './store';

/** FN-01..04 + §17.6 landing cost per truck. */
@Injectable()
export class FinanceService {
  constructor(private ref: RefService, private notify: NotifyService) {}
  private assert(p: Principal) { if (!has(p, 'accounts', 'director', 'fleet', 'admin')) forbidden(); }

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
      const c = costs.filter((x) => x.shipmentId === s.id).map(map.cost);
      const py = pays.filter((x) => x.shipmentId === s.id).map(map.payment);
      const transport = c.filter((x) => x.kind === 'Transport').reduce((a, x) => a + x.amount, 0);
      const paid = py.filter((x) => x.status !== 'Pending approval').reduce((a, x) => a + x.amount, 0);
      const po = pos.find((x) => x.id === s.poId); const plan = plans.find((x) => x.id === po?.planId);
      const goods = s.legs[0].lines.reduce((a, l) => a + l.loadedQty * (plan?.lines.find((pl) => pl.productId === l.productId)?.price ?? 0), 0);
      const cases = s.legs[0].lines.reduce((a, l) => a + l.loadedQty, 0);
      const expenses = c.reduce((a, x) => a + x.amount, 0);
      return { shipment: publicShipment(s), costs: c, payments: py, transport, paid, balance: transport - paid, goods, expenses, landing: goods + expenses, cases, perCase: cases ? (goods + expenses) / cases : 0 };
    });
  }
  private async shipmentScope(p: Principal, shipmentId: string) {
    const [s] = await db.select().from(t.shipments).where(eq(t.shipments.id, shipmentId));
    if (!s) return notFound('Shipment');
    if (!canSeeEntity(p, s.entityId)) forbidden();
    return s;
  }
  async addCost(p: Principal, c: Omit<TripCost, 'id'>) {
    this.assert(p);
    if (!(c.amount > 0)) fail('Amount must be above zero');
    await this.shipmentScope(p, c.shipmentId);
    const x = { ...c, id: uid('cost'), legId: c.legId ?? null, docRef: c.docRef ?? null, currency: c.currency ?? 'USD' };
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
    if (!cost || cost.shipmentId !== input.shipmentId) fail('Pick a cost line of this trip');
    const paidSoFar = (await db.select().from(t.tripPayments).where(eq(t.tripPayments.costId, cost!.id))).reduce((a, x) => a + x.amount, 0);
    if (input.amount > cost!.amount - paidSoFar + 0.005) fail(`That is more than the balance of USD ${(cost!.amount - paidSoFar).toFixed(2)} on this cost`);
    const threshold = (await this.ref.get()).bundle.settings.paymentApprovalThreshold;
    const status = input.amount > threshold ? 'Pending approval' : 'Paid';
    const row = { id: uid('pay'), shipmentId: input.shipmentId, costId: input.costId, amount: input.amount, at: iso(), reference: input.reference.trim(), status, approvedById: null, receiptFileId: input.receiptFileId ?? null };
    await db.transaction(async (tx) => {
      await tx.insert(t.tripPayments).values(row);
      if (status === 'Pending approval') await this.notify.notify(tx, 'Payment needs approval', `USD ${input.amount} · ${input.reference} · ${s.ref}`, '#/finance', ['director'], { email: true });
    });
    return map.payment(row as typeof t.tripPayments.$inferSelect);
  }
  async approve(p: Principal, paymentId: string) {
    if (!has(p, 'director')) forbidden('Only directors approve payments above the threshold (FN-03)');
    const [x] = await db.select().from(t.tripPayments).where(eq(t.tripPayments.id, paymentId));
    if (!x) return notFound('Payment');
    if (x.status !== 'Pending approval') fail('This payment is not waiting for approval', 409, 'state');
    await db.update(t.tripPayments).set({ status: 'Paid', approvedById: p.id }).where(eq(t.tripPayments.id, paymentId));
    return map.payment({ ...x, status: 'Paid', approvedById: p.id });
  }
}
