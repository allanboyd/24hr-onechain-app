// V3-15: one reading of a leg for the live pages (cards, progress bar, journey, map): where the truck is, what is next,
// how late, and in words. Built on the shared ETA / overdue rules (shipments.eta, tracking.overdue), so the figures are
// the same as the Shipments table, Home and the Truck desk.
import { lookup, shipments, tracking, type Leg, type Shipment } from '@btw/api';
import { ago, hoursLabel } from '@btw/ui';

export const activeLeg = (sh: Shipment): Leg => sh.legs.find((l) => l.status !== 'Acknowledged') ?? sh.legs.at(-1)!;
export const shortName = (id?: string | null) => (id ? lookup.checkpoint(id)?.name?.split(' (')[0] ?? '' : '');
const SRC: Record<string, string> = { driver: 'driver app', geofence: 'geofence', 'gps-provider': 'GPS', sms: 'SMS', office: 'office' };

export interface LegView {
  /** index of the last checkpoint reached (-1 = still at loading) */ at: number;
  /** checkpoints in order: name, planned, arrived, departed, kind */
  stops: { id: string; name: string; kind: string; planned: string; arrived?: string; departed?: string; state: 'done' | 'here' | 'next' | 'later' }[];
  where: string; last: string; next: string | null; nextPlanned: string | null;
  eta: ReturnType<typeof shipments.eta>; late: boolean; delivered: boolean;
  /** the one-line problem, if any: no check-in, waiting too long at a checkpoint, an open issue */
  problem: string | null; tone: 'ok' | 'warn' | 'bad';
  done: number; total: number;
}
export function view(sh: Shipment): LegView {
  const leg = activeLeg(sh);
  const at = leg.passes.reduce((a, p, k) => (p.arrivedAt ? k : a), -1);
  const delivered = sh.status === 'Acknowledged';
  const stops = leg.passes.map((p, k) => ({
    id: p.checkpointId, name: shortName(p.checkpointId), kind: lookup.checkpoint(p.checkpointId)?.kind ?? 'town', planned: p.plannedAt, arrived: p.arrivedAt, departed: p.departedAt,
    state: (k < at || (k === at && (p.departedAt || delivered)) ? 'done' : k === at ? 'here' : k === at + 1 ? 'next' : 'later') as LegView['stops'][number]['state'],
  }));
  const cur = at >= 0 ? leg.passes[at] : undefined;
  const nxt = leg.passes[at + 1];
  const eta = shipments.eta(leg);
  const od = delivered ? null : tracking.overdue(leg);
  const dw = delivered ? null : tracking.dwell(leg);
  const issue = leg.issues.find((x) => !x.fixedAt);
  const late = !delivered && (sh.status === 'Delayed' || eta.state === 'Late');
  const problem = delivered ? null : od ? `No check-in for ${hoursLabel(od.hours)}: call the driver` : issue ? `${issue.reason}` : dw?.over ? `${hoursLabel(dw.hours)} at ${shortName(dw.checkpointId)} (plan ${hoursLabel(dw.plannedDwellHours)})` : null;
  return {
    at, stops, eta, late, delivered, problem,
    tone: problem || late ? (od || issue || sh.status === 'Delayed' ? 'bad' : 'warn') : 'ok',
    where: delivered ? `Delivered to ${shortName(leg.toId) || 'the warehouse'}` : cur ? `${cur.departedAt ? 'Left' : 'At'} ${shortName(cur.checkpointId)}` : 'At the loading point',
    last: cur ? `${ago(cur.departedAt ?? cur.arrivedAt)} via ${SRC[cur.source ?? 'office']}` : leg.departedAt ? `left ${ago(leg.departedAt)}` : 'not dispatched yet',
    next: nxt ? shortName(nxt.checkpointId) : null, nextPlanned: nxt?.plannedAt ?? null,
    done: Math.max(0, at + (cur?.departedAt || delivered ? 1 : 0)), total: leg.passes.length,
  };
}
