// Aggregate persistence: rows ↔ the shared domain shapes in @btw/api/types (so the shared rules apply unchanged).
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema as t, type Tx } from '../db/client';
import type { Acknowledgement, Leg, Loading, Plan, PurchaseOrder, Sale, Shipment, TripCost, TripPayment, WaitingEntry } from '@btw/api/types';
import { notFound } from '../common/errors';

type Q = typeof db | Tx;
export const toIso = (x: string | null | undefined) => (x ? new Date(x).toISOString() : undefined);
const und = <T>(x: T | null | undefined) => (x ?? undefined) as T | undefined;

export type ShipmentRow = Shipment & { entityId: string; loadingPointId: string };

export const map = {
  plan: (r: typeof t.plans.$inferSelect): Plan => ({ ...r, poId: und(r.poId), currency: r.currency as Plan['currency'], status: r.status as Plan['status'] }) as Plan,
  po: (r: typeof t.pos.$inferSelect): PurchaseOrder => ({ ...r, sentAt: toIso(r.sentAt), approvedAt: toIso(r.approvedAt)!, signature: und(r.signature), currency: r.currency as PurchaseOrder['currency'] }),
  waiting: (r: typeof t.waitingEntries.$inferSelect): WaitingEntry => ({ ...r, arrivedAt: toIso(r.arrivedAt)!, status: r.status as WaitingEntry['status'] }),
  loading: (r: typeof t.loadings.$inferSelect): Loading => ({ ...r, loadedAt: toIso(r.loadedAt), status: r.status as Loading['status'], transportCurrency: r.transportCurrency as Loading['transportCurrency'] }),
  leg: (r: typeof t.legs.$inferSelect): Leg => {
    const { shipmentId: _s, ...l } = r;
    return { ...l, status: l.status as Leg['status'], departedAt: toIso(l.departedAt), plannedArrival: toIso(l.plannedArrival)!, lastPing: und(l.lastPing), ackId: und(l.ackId) };
  },
  ack: (r: typeof t.acks.$inferSelect): Acknowledgement => { const { byUserId: _b, ...a } = r; return { ...a, at: toIso(a.at)!, signature: und(a.signature) }; },
  sale: (r: typeof t.sales.$inferSelect): Sale => ({ ...r, at: toIso(r.at)!, kind: r.kind as Sale['kind'], currency: r.currency as Sale['currency'], status: r.status as Sale['status'] }),
  cost: (r: typeof t.tripCosts.$inferSelect): TripCost => ({ ...r, legId: und(r.legId), docRef: und(r.docRef), kind: r.kind as TripCost['kind'], currency: r.currency as TripCost['currency'] }),
  payment: (r: typeof t.tripPayments.$inferSelect): TripPayment => ({ id: r.id, shipmentId: r.shipmentId, costId: r.costId, amount: r.amount, at: toIso(r.at)!, reference: r.reference, approvedById: und(r.approvedById), status: r.status as TripPayment['status'] }),
};

export async function loadShipments(q: Q, ids?: string[]): Promise<ShipmentRow[]> {
  const shs = ids ? (ids.length ? await q.select().from(t.shipments).where(inArray(t.shipments.id, ids)) : []) : await q.select().from(t.shipments).orderBy(asc(t.shipments.createdAt));
  if (!shs.length) return [];
  const legs = await q.select().from(t.legs).where(inArray(t.legs.shipmentId, shs.map((s) => s.id))).orderBy(asc(t.legs.seq));
  return shs.map((s) => ({ id: s.id, ref: s.ref, poId: s.poId, truckNo: s.truckNo, receivingCompanyId: s.receivingCompanyId, warehouseId: s.warehouseId, status: s.status as Shipment['status'], entityId: s.entityId, loadingPointId: s.loadingPointId, legs: legs.filter((l) => l.shipmentId === s.id).map(map.leg) }));
}

export async function loadShipment(q: Q, id: string, lock = false): Promise<ShipmentRow> {
  if (lock) await q.execute(sql`SELECT 1 FROM shipments WHERE id = ${id} FOR UPDATE`);
  const [sh] = await loadShipments(q, [id]);
  return sh ?? notFound('Shipment');
}

export async function shipmentIdOfLeg(q: Q, legId: string) {
  const [l] = await q.select({ shipmentId: t.legs.shipmentId }).from(t.legs).where(eq(t.legs.id, legId));
  return l?.shipmentId ?? notFound('Leg');
}

export async function saveShipment(q: Q, sh: ShipmentRow) {
  await q.update(t.shipments).set({ status: sh.status }).where(eq(t.shipments.id, sh.id));
  for (const l of sh.legs) {
    const row = { id: l.id, shipmentId: sh.id, seq: l.seq, routeId: l.routeId, fromId: l.fromId, toId: l.toId, truckId: l.truckId, driverId: l.driverId, status: l.status, departedAt: l.departedAt ?? null, plannedArrival: l.plannedArrival, passes: l.passes, lastPing: l.lastPing ?? null, lines: l.lines, ackId: l.ackId ?? null, issues: l.issues };
    await q.insert(t.legs).values(row).onConflictDoUpdate({ target: t.legs.id, set: row });
  }
}

/** Strip server-only scope columns before sending a shipment out. */
export const publicShipment = ({ entityId: _e, loadingPointId: _l, ...s }: ShipmentRow): Shipment => s;
