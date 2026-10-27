// Transport costs page (docs/17 §4 "Trip financials + Transport fees"): shared shapes and helpers for the Fees, Trips and
// Expenses tabs, the trip drawer and the record dialog. A "trip" here is one shipment with its cost lines and payments.
import * as MX from '@btw/api/metrics';
import type { QueryFilters } from '../page';
import { lookup, type finance, type CostKind, type Currency, type FeeStatus, type ID, type TransportFeeRow } from '@btw/api';

export type Trip = Awaited<ReturnType<typeof finance.trips>>[number];
export type CostAct = 'price' | 'expense' | 'pay';

/** What the record dialog needs of a trip — built from a fee row (Fees) or from a trip (Trips / Expenses). */
export interface TripRef {
  shipmentId: ID; ref: string; entityId: ID; truckId: ID;
  legs: { id: ID; seq: number; routeId: ID }[];
  costs: { id: ID; kind: CostKind; amount: number; currency: Currency; amountUsd?: number; fxRate?: number }[];
  agreed: { amount: number; currency: Currency } | null;
  status: FeeStatus; balanceUsd: number | null; paidAny: boolean;
}

export const COST_KINDS: CostKind[] = ['Transport', 'Taxes & duties', 'Clearing & forwarding', 'Loading & offloading', 'Storage', 'Other'];
/** Expenses a trip can get besides the agreed transport price (that one is recorded as the agreed price). */
export const EXPENSE_KINDS: CostKind[] = COST_KINDS.filter((k) => k !== 'Transport');
/** Payments above this (USD) wait for a director (set by the directors; the server decides). */
export const PAY_THRESHOLD = 500;
/** Trips tab: follow up an unpaid balance this many days after loading. */
export const FOLLOW_UP_DAYS = 30;

export const truckReg = (id: ID | undefined) => (id ? lookup.truck(id)?.reg ?? '—' : '—');
export const providerName = (id: ID | null | undefined) => (id ? lookup.provider(id)?.name ?? id : '—');
export const routeName = (id: ID | undefined) => (id ? lookup.route(id)?.name ?? '—' : '—');
export const providerOfTruck = (truckId: ID | undefined) => (truckId ? lookup.truck(truckId)?.providerId ?? null : null);

/** When the trip was loaded (first leg): the same fallbacks the fee rows use when there is no loading record. */
export const tripLoadedAt = (t: Trip): string | null => { const l = t.shipment.legs[0]; return l?.passes[0]?.departedAt ?? l?.departedAt ?? l?.passes[0]?.arrivedAt ?? null; };
export const tripAgeDays = (t: Trip, now = Date.now()) => { const a = tripLoadedAt(t); return a ? Math.max(0, Math.floor((now - Date.parse(a)) / 864e5)) : 0; };

/** Fee status of a trip — same words as the fee rows. */
export function tripStatus(t: Trip): FeeStatus {
  const f = MX.feeOfTrip(t);
  if (f.agreedUsd === null) return 'Not recorded';
  if (f.paidUsd >= f.agreedUsd - 0.005) return 'Paid';
  return f.paidUsd > 0 ? 'Part paid' : 'Unpaid';
}
/** Registry fee figure of a trip, with its age (for the strip of people who don't see the Fees tab). */
export const tripFee = (t: Trip, now = Date.now()): MX.FeeLike => ({ ...MX.feeOfTrip(t), ageDays: tripAgeDays(t, now) });
export const hasPending = (t: Trip) => t.payments.some((p) => p.status === 'Pending approval');

export const STATUS_TONE: Record<FeeStatus, string> = { Paid: 'good', 'Part paid': 'warn', Unpaid: 'bad', 'Not recorded': 'none' };

export function refOfFee(r: TransportFeeRow): TripRef {
  return { shipmentId: r.shipmentId, ref: r.ref, entityId: r.entityId, truckId: r.truckId, legs: r.legs, costs: r.costs, agreed: r.agreed, status: r.status, balanceUsd: r.balanceUsd, paidAny: r.paidUsd > 0 || r.pendingUsd > 0 };
}
export function refOfTrip(t: Trip): TripRef {
  const tr = t.costs.filter((c) => c.kind === 'Transport');
  const f = MX.feeOfTrip(t);
  return {
    shipmentId: t.shipment.id, ref: t.shipment.ref, entityId: t.shipment.entityId, truckId: t.shipment.legs[0]?.truckId ?? '',
    legs: t.shipment.legs.map((l) => ({ id: l.id, seq: l.seq, routeId: l.routeId })), costs: t.costs,
    agreed: tr.length ? { amount: tr.reduce((a, c) => a + c.amount, 0), currency: tr[0].currency } : null,
    status: tripStatus(t), balanceUsd: f.agreedUsd === null ? null : Math.max(0, Math.round((f.agreedUsd - f.paidUsd) * 100) / 100), paidAny: t.payments.length > 0,
  };
}

/** Which record actions a trip offers (the same rules as before the merge). */
export const canSetPrice = (r: TripRef) => r.status === 'Not recorded' || (r.status === 'Unpaid' && !r.paidAny);
export const canPayTrip = (r: TripRef) => !!r.agreed && r.status !== 'Paid';

/** List filters of the page, kept in the hash query (shared by the tabs; `show` = the summary strip). Old Transport fees
 *  links used `q` (reference search); `status`, `flag`, `provider` are the Fees filters, `pay` the Trips payment filter,
 *  `kind`, `route`, `period` (YYYY-MM) the Expenses filters. */
export const FILTER_KEYS = { show: '', q: '', status: '', flag: '', provider: '', pay: '', kind: '', route: '', period: '' };
export type FilterKey = keyof typeof FILTER_KEYS;
export type CostFilters = QueryFilters<FilterKey>;
