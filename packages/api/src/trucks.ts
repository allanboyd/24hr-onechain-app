// Truck desk (docs/10-truck-planner-role.md): every truck by state with where it is, plus what each truck and provider
// costs. Pure functions over data the clients already load (ref, waiting list, shipments, finance trips) — no I/O,
// `now` is a parameter — so the web desk, the team app and the tests compute exactly the same thing.
import { DAY, H, etaOf } from './rules';
import type { Checkpoint, Driver, EtaInfo, ID, Leg, Provider, RouteStop, Shipment, Supplier, TripCost, TripPayment, Truck, TruckIssue, WaitingEntry } from './types';

export type TruckState = 'Waiting' | 'Loading' | 'In transit' | 'At border' | 'Delayed' | 'Arrived' | 'Idle';
/** Display order (most urgent first) and the words used in filters and chips. */
export const TRUCK_STATES: { state: TruckState; label: string; tone: 'danger' | 'warning' | 'info' | 'success' | 'neutral' | 'accent' }[] = [
  { state: 'Delayed', label: 'Delayed', tone: 'danger' },
  { state: 'At border', label: 'At border', tone: 'warning' },
  { state: 'In transit', label: 'In transit', tone: 'info' },
  { state: 'Loading', label: 'Loading', tone: 'accent' },
  { state: 'Waiting', label: 'Waiting at loading point', tone: 'neutral' },
  { state: 'Arrived', label: 'Arrived at warehouse', tone: 'success' },
  { state: 'Idle', label: 'Idle', tone: 'neutral' },
];
export const ON_ROAD: TruckState[] = ['In transit', 'At border', 'Delayed'];

export interface TruckRow {
  truck: Truck; provider?: Provider; driver?: Driver;
  state: TruckState;
  /** company of the current trip / queue entry (none when idle) */
  entityId?: ID;
  /** "Malaba border (KE/UG)", "Queue at KBL Nairobi (#2)", "Asie warehouse Gisenyi" … */
  where: string;
  /** last known position: GPS ping, else the last checkpoint reached, else the loading point */
  position?: { lat: number; lng: number; at?: string; source: 'gps' | 'checkpoint' | 'loading point' };
  loadingPointId?: ID; queueEntryId?: ID; queuePosition?: number; waitingHours?: number;
  shipmentId?: ID; shipmentRef?: string; legId?: ID; routeId?: ID; eta?: EtaInfo; toId?: ID;
  /** open (not fixed) issues on the current trip */
  issues: TruckIssue[];
  lastMoveAt?: string; daysSinceMove?: number;
}

export interface DeskInput {
  trucks: Truck[]; providers: Provider[]; drivers: Driver[]; waiting: WaitingEntry[]; shipments: Shipment[];
  checkpoints: Checkpoint[]; suppliers: Supplier[]; stopsOf: (routeId: ID) => RouteStop[]; now?: number;
}

const ACTIVE = (l: Leg) => !['Acknowledged', 'Cancelled'].includes(l.status);
const t = (x?: string) => (x ? Date.parse(x) : NaN);

/** State of a truck from its active leg (if any) and its queue entry (if any). */
function legState(leg: Leg, eta: EtaInfo): TruckState {
  if (leg.status === 'Planned' || leg.status === 'Loaded') return 'Loading';
  if (leg.status === 'Arrived') return 'Arrived';
  // an open issue or ≥ 6 h behind plan (same rule as the shipment status) = delayed, wherever it stands
  if (leg.status === 'Delayed' || leg.issues.some((i) => !i.fixedAt) || (eta.state === 'Late' && eta.hours >= 6)) return 'Delayed';
  if (leg.status === 'At border') return 'At border';
  return 'In transit';
}

export function truckDesk(d: DeskInput): TruckRow[] {
  const now = d.now ?? Date.now();
  const cp = (id?: ID) => d.checkpoints.find((c) => c.id === id);
  const legsOf = new Map<ID, { sh: Shipment; leg: Leg }[]>();
  for (const sh of d.shipments) for (const leg of sh.legs) { const a = legsOf.get(leg.truckId) ?? []; a.push({ sh, leg }); legsOf.set(leg.truckId, a); }
  return d.trucks.map((truck) => {
    const provider = d.providers.find((p) => p.id === truck.providerId);
    const mine = legsOf.get(truck.id) ?? [];
    const active = mine.filter((x) => ACTIVE(x.leg)).sort((a, b) => (t(b.leg.departedAt) || t(b.leg.plannedArrival)) - (t(a.leg.departedAt) || t(a.leg.plannedArrival)))[0];
    const q = d.waiting.filter((w) => w.truckId === truck.id && w.status === 'Waiting').sort((a, b) => t(b.arrivedAt) - t(a.arrivedAt))[0];
    // last movement: any check-in, GPS ping or queue arrival of this truck
    let last = q ? t(q.arrivedAt) : NaN;
    for (const { leg } of mine) {
      for (const p of leg.passes) for (const x of [p.arrivedAt, p.departedAt]) { const v = t(x); if (v > (last || 0)) last = v; }
      const v = t(leg.lastPing?.at); if (v > (last || 0)) last = v;
    }
    const lastMoveAt = Number.isFinite(last) ? new Date(last).toISOString() : undefined;
    const daysSinceMove = Number.isFinite(last) ? Math.max(0, Math.floor((now - last) / DAY)) : undefined;
    const base = { truck, provider, issues: [] as TruckIssue[], lastMoveAt, daysSinceMove };
    // delivered (awaiting the receiver's signature) and already back in a loading queue: the queue is where it is
    if (active && !(q && active.leg.status === 'Arrived')) {
      const { sh, leg } = active;
      const eta = etaOf(leg, d.stopsOf(leg.routeId), now);
      const state = legState(leg, eta);
      const i = leg.passes.reduce((a, p, k) => (p.arrivedAt ? k : a), -1);
      const here = i >= 0 ? cp(leg.passes[i].checkpointId) : cp(leg.fromId);
      const ping = leg.lastPing && (i < 0 || t(leg.lastPing.at) >= t(leg.passes[i].departedAt ?? leg.passes[i].arrivedAt)) ? leg.lastPing : undefined;
      const position = ping ? { lat: ping.lat, lng: ping.lng, at: ping.at, source: 'gps' as const } : here ? { lat: here.lat, lng: here.lng, at: i >= 0 ? leg.passes[i].arrivedAt : undefined, source: 'checkpoint' as const } : undefined;
      const stopped = i >= 0 && !leg.passes[i].departedAt;
      const where = state === 'Loading' ? `Loading at ${cp(leg.fromId)?.name ?? 'the loading point'}`
        : stopped ? `At ${here?.name ?? '—'}`
        : i >= 0 ? `Left ${here?.name ?? '—'} → ${cp(leg.passes[i + 1]?.checkpointId)?.name ?? cp(leg.toId)?.name ?? ''}` : `${cp(leg.fromId)?.name ?? ''}`;
      return {
        ...base, driver: d.drivers.find((x) => x.id === leg.driverId), state, entityId: sh.entityId, where, position,
        shipmentId: sh.id, shipmentRef: sh.ref, legId: leg.id, routeId: leg.routeId, eta, toId: leg.toId, issues: leg.issues.filter((x) => !x.fixedAt),
        ...(q ? { loadingPointId: q.loadingPointId, queueEntryId: q.id, queuePosition: q.position, waitingHours: Math.max(0, (now - t(q.arrivedAt)) / H) } : {}),
      };
    }
    if (q) {
      const lp = d.suppliers.find((s) => s.id === q.loadingPointId); const c = cp(lp?.checkpointId);
      return {
        ...base, driver: d.drivers.find((x) => x.id === q.driverId), state: 'Waiting' as const, entityId: q.entityId,
        where: `Queue at ${lp ? `${lp.code} ${lp.city}` : q.loadingPointId} (#${q.position})`, position: c ? { lat: c.lat, lng: c.lng, at: q.arrivedAt, source: 'loading point' as const } : undefined,
        loadingPointId: q.loadingPointId, queueEntryId: q.id, queuePosition: q.position, waitingHours: Math.max(0, (now - t(q.arrivedAt)) / H),
      };
    }
    // idle: where its last trip ended (if any)
    const lastLeg = mine.sort((a, b) => t(b.leg.plannedArrival) - t(a.leg.plannedArrival))[0]?.leg;
    const end = lastLeg ? cp(lastLeg.passes.filter((p) => p.arrivedAt).at(-1)?.checkpointId ?? lastLeg.toId) : undefined;
    return {
      ...base, driver: d.drivers.find((x) => x.id === truck.defaultDriverId), state: 'Idle' as const,
      where: end ? `Last at ${end.name}` : 'No trips yet', position: end ? { lat: end.lat, lng: end.lng, at: lastMoveAt, source: 'checkpoint' as const } : undefined,
    };
  });
}

/** Sort: most urgent state first, then the longest wait / the oldest movement. */
export function sortDesk(rows: TruckRow[]): TruckRow[] {
  const rank = (s: TruckState) => TRUCK_STATES.findIndex((x) => x.state === s);
  return [...rows].sort((a, b) => rank(a.state) - rank(b.state) || (b.waitingHours ?? 0) - (a.waitingHours ?? 0) || (b.daysSinceMove ?? 0) - (a.daysSinceMove ?? 0) || a.truck.reg.localeCompare(b.truck.reg));
}

// ---- Expenses: per trip, per truck, per provider --------------------------------------------------------
/** One finance trip (finance.trips()): costs and payments in USD totals. */
export interface TripLike { shipment: Shipment; costs: (TripCost & { amountUsd?: number })[]; payments: TripPayment[]; transport: number; paid: number; balance: number; expenses: number; cases: number; /** false = agreed price not recorded yet (docs/12) */ agreedRecorded?: boolean }
/** Has the agreed transport price of this trip been recorded (a Transport cost line exists)? */
export const agreedRecorded = (x: Pick<TripLike, 'costs' | 'agreedRecorded'>) => x.agreedRecorded ?? x.costs.some((c) => c.kind === 'Transport');
export interface CostLine {
  id: ID; label: string; trips: number;
  /** agreed transport (USD) */ agreed: number;
  /** other trip costs: clearing, loading, storage … (USD) */ extras: number;
  /** payments made (approved / paid, USD) */ paid: number;
  /** payments waiting for a director (USD) */ pending: number;
  /** agreed transport − paid (USD) */ balance: number;
  cases: number; /** (transport + extras) per case (USD), over trips with an agreed price */ perCase: number;
  /** trips whose agreed transport price is not recorded yet — shown as "not recorded", never as zero */ notRecorded: number;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const usdOf = (c: { amount: number; amountUsd?: number }) => c.amountUsd ?? c.amount;
/** The truck a trip is paid for: the truck of its first leg (as in trip financials). */
export const tripTruck = (trip: TripLike) => trip.shipment.legs[0]?.truckId ?? '';

function line(id: ID, label: string, trips: TripLike[]): CostLine {
  const agreed = trips.reduce((a, x) => a + x.transport, 0);
  const extras = trips.reduce((a, x) => a + x.costs.filter((c) => c.kind !== 'Transport').reduce((b, c) => b + usdOf(c), 0), 0);
  const paid = trips.reduce((a, x) => a + x.paid, 0);
  const pending = trips.reduce((a, x) => a + x.payments.filter((p) => p.status === 'Pending approval').reduce((b, p) => b + (p.amountUsd ?? p.amount), 0), 0);
  const cases = trips.reduce((a, x) => a + x.cases, 0);
  const rec = trips.filter(agreedRecorded), recCases = rec.reduce((a, x) => a + x.cases, 0);
  const recCost = rec.reduce((a, x) => a + x.transport + x.costs.filter((c) => c.kind !== 'Transport').reduce((b, c) => b + usdOf(c), 0), 0);
  return { id, label, trips: trips.length, agreed: r2(agreed), extras: r2(extras), paid: r2(paid), pending: r2(pending), balance: r2(agreed - paid), cases, perCase: recCases ? r2(recCost / recCases) : 0, notRecorded: trips.length - rec.length };
}
export function costsByTruck(trips: TripLike[], trucks: Truck[]): CostLine[] {
  const by = new Map<ID, TripLike[]>();
  for (const x of trips) { const k = tripTruck(x); by.set(k, [...(by.get(k) ?? []), x]); }
  return [...by].map(([id, xs]) => line(id, trucks.find((tr) => tr.id === id)?.reg ?? id, xs)).sort((a, b) => b.balance - a.balance || b.agreed - a.agreed);
}
export function costsByProvider(trips: TripLike[], trucks: Truck[], providers: Provider[]): CostLine[] {
  const by = new Map<ID, TripLike[]>();
  for (const x of trips) { const k = trucks.find((tr) => tr.id === tripTruck(x))?.providerId ?? ''; by.set(k, [...(by.get(k) ?? []), x]); }
  return [...by].map(([id, xs]) => line(id, providers.find((p) => p.id === id)?.name ?? 'Unknown provider', xs)).sort((a, b) => b.balance - a.balance || b.agreed - a.agreed);
}

export interface DeskKpis { inQueue: number; loading: number; onRoad: number; delayed: number; openIssues: number; avgWaitHours: number; longWaits: number; idle: number; owed: number; pending: number; /** loaded trips with no agreed transport price yet */ agreedMissing: number }
/** Headline numbers for the desk (long wait = more than `longWaitHours` in a queue). */
export function deskKpis(rows: TruckRow[], trips: TripLike[] | null, longWaitHours = 24): DeskKpis {
  const queued = rows.filter((r) => r.state === 'Waiting');
  const waits = queued.map((r) => r.waitingHours ?? 0);
  return {
    inQueue: queued.length, loading: rows.filter((r) => r.state === 'Loading').length,
    onRoad: rows.filter((r) => ON_ROAD.includes(r.state)).length, delayed: rows.filter((r) => r.state === 'Delayed').length,
    openIssues: rows.reduce((a, r) => a + r.issues.length, 0),
    avgWaitHours: waits.length ? Math.round((waits.reduce((a, x) => a + x, 0) / waits.length) * 10) / 10 : 0,
    longWaits: waits.filter((h) => h > longWaitHours).length, idle: rows.filter((r) => r.state === 'Idle').length,
    owed: r2((trips ?? []).reduce((a, x) => a + Math.max(0, x.balance), 0)),
    pending: r2((trips ?? []).reduce((a, x) => a + x.payments.filter((p) => p.status === 'Pending approval').reduce((b, p) => b + (p.amountUsd ?? p.amount), 0), 0)),
    agreedMissing: (trips ?? []).filter((x) => !agreedRecorded(x) && !x.shipment.fromWarehouseId).length,
  };
}
/** "5 h", "2 d 3 h" */
export function waitLabel(hours?: number) {
  if (hours === undefined || !Number.isFinite(hours)) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  const d = Math.floor(hours / 24), h = Math.round(hours % 24);
  return h ? `${d} d ${h} h` : `${d} d`;
}
