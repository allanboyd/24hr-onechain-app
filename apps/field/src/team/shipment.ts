// Shipment helpers for team screens.
import { lookup, shipments, type Leg, type Shipment } from '@btw/api';
import { fmtShortDate } from '@btw/ui';
import { since } from '../lib';

/** The leg that matters now: the first one not yet received, else the last. */
export const currentLeg = (s: Shipment): Leg => s.legs.find((l) => !['Acknowledged', 'Cancelled'].includes(l.status)) ?? s.legs[s.legs.length - 1];
export const truckReg = (leg?: Leg) => (leg ? lookup.truck(leg.truckId)?.reg ?? '' : '');
export function etaText(leg: Leg): string {
  if (leg.status === 'Acknowledged') return 'Delivered';
  if (leg.status === 'Planned' || leg.status === 'Loaded') return `Leaves soon · due ${fmtShortDate(leg.plannedArrival)}`;
  try {
    const e = shipments.eta(leg);
    return e.state === 'Late' ? `ETA ${fmtShortDate(e.eta)} · ${since(e.hours)} late` : e.state === 'Early' ? `ETA ${fmtShortDate(e.eta)} · early` : `ETA ${fmtShortDate(e.eta)} · on time`;
  } catch { return `Due ${fmtShortDate(leg.plannedArrival)}`; }
}
export const cargo = (leg: Leg) => leg.lines.reduce((a, l) => a + l.loadedQty, 0);
