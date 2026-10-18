// Shipment chains (doc 08 §2): a truck's first destination is a warehouse — goods are received into its stock — and
// the next move is a NEW shipment from that warehouse. Shipments link with parentShipmentId / originShipmentId.
// Until the API exposes `shipments.sendOn`, the older model (several legs inside one shipment) is shown the same way.
import { lookup, shipments, type ID, type Leg, type Shipment } from '@btw/api';
import { destinationLabel } from './planning';

export type ChainShipment = Shipment & { parentShipmentId?: ID | null; originShipmentId?: ID | null; fromWarehouseId?: ID | null };
type SendOnApi = { sendOn?: (fromShipmentId: ID, input: { routeId: ID; truckId: ID; driverId: ID }) => Promise<Shipment | { id: ID } | unknown> };
const api = shipments as unknown as SendOnApi;
export const chainModel = () => typeof api.sendOn === 'function';

/** Ordered chain origin → … → last, containing `sh` (parents up, then children down). */
export function chainOf(all: Shipment[], sh: Shipment): ChainShipment[] {
  const byId = new Map(all.map((s) => [s.id, s as ChainShipment]));
  let head = sh as ChainShipment;
  for (let i = 0; i < 20 && head.parentShipmentId && byId.has(head.parentShipmentId); i++) head = byId.get(head.parentShipmentId)!;
  const out = [head];
  for (let i = 0; i < 20; i++) {
    const next = all.find((s) => (s as ChainShipment).parentShipmentId === out.at(-1)!.id) as ChainShipment | undefined;
    if (!next) break;
    out.push(next);
  }
  return out;
}
export const inChain = (all: Shipment[], sh: Shipment) => chainOf(all, sh).length > 1;

export interface JourneyStep {
  key: string; shipmentId: ID; ref: string; legId?: ID; truck: string; driver: string; status: Shipment['status'];
  from: string; to: string; loaded: number; received?: number; damaged?: number; current: boolean;
}

/** Steps for the Journey card: one per shipment in the chain (new model) or per leg (older model). */
export function journeySteps(chain: ChainShipment[], current: ID, ackFor: (legId: ID) => { received: number; damaged: number } | undefined): JourneyStep[] {
  return chain.flatMap((s) => s.legs.map((l: Leg) => {
    const a = ackFor(l.id);
    return {
      key: `${s.id}-${l.id}`, shipmentId: s.id, ref: chain.length > 1 || s.legs.length === 1 ? s.ref : `${s.ref} · leg ${l.seq}`, legId: l.id,
      truck: lookup.truck(l.truckId)?.reg ?? '—', driver: lookup.driver(l.driverId)?.name ?? '—', status: s.legs.length > 1 ? l.status : s.status,
      from: s.fromWarehouseId && l.seq === 1 ? destinationLabel(s.fromWarehouseId) : (lookup.checkpoint(l.fromId)?.name ?? '—'),
      to: lookup.checkpoint(l.toId)?.name ?? '—', loaded: l.lines.reduce((x, y) => x + y.loadedQty, 0),
      received: a?.received, damaged: a?.damaged, current: s.id === current,
    };
  }));
}

/** Where a shipment starts: its source warehouse (chain model) or the first leg's loading point. */
export const fromLabel = (s: Shipment) => {
  const c = s as ChainShipment;
  return c.fromWarehouseId ? destinationLabel(c.fromWarehouseId) : (lookup.checkpoint(s.legs[0]?.fromId ?? '')?.name ?? '—');
};

/** Send goods on from an intermediate warehouse: a NEW shipment (chain model) or the older next-leg call. */
export async function sendOn(sh: Shipment, input: { routeId: ID; truckId: ID; driverId: ID }): Promise<ID | null> {
  if (api.sendOn) {
    const r = (await api.sendOn(sh.id, input)) as { id?: ID } | undefined;
    return r?.id ?? null;
  }
  await shipments.addLeg(sh.id, input.routeId, input.truckId, input.driverId);
  return null;
}
