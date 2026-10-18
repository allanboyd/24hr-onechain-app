// Trip financials helpers (transport owed per trip, payments waiting for a director).
import { lookup, type Shipment } from '@btw/api';
import type { Trip } from './insights';

export const transporter = (s: Shipment) => { const t = lookup.truck(s.legs[0]?.truckId ?? ''); return lookup.provider(t?.providerId ?? '')?.name ?? '—'; };
export const pendingOf = (t: Trip) => t.payments.filter((p) => p.status === 'Pending approval');
export const costLabel = (t: Trip, costId: string) => { const c = t.costs.find((x) => x.id === costId); return c ? `${c.kind}${c.docRef ? ` · ${c.docRef}` : ''}` : 'Cost'; };
/** Paid or waiting against one cost line, in its own currency. */
export const paidOn = (t: Trip, costId: string) => t.payments.filter((p) => p.costId === costId).reduce((a, p) => a + p.amount, 0);
