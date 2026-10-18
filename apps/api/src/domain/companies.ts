// Company records (tenants) and approved exchange rates.
import { fxFor } from '@btw/api/rules';
import type { Currency, Entity, FxRate } from '@btw/api/types';
import { db, schema as t, type Tx } from '../db/client';
import { fail } from '../common/errors';
import type { PdfEntity } from '../integrations/ports';

type Q = typeof db | Tx;
export const toEntity = (r: typeof t.entities.$inferSelect): Entity => ({ ...r, website: r.website ?? undefined, reportingCurrency: r.reportingCurrency as Currency, letterhead: { ...r.letterhead } });
export async function loadEntities(q: Q = db) { return (await q.select().from(t.entities)).map(toEntity).sort((a, b) => a.id.localeCompare(b.id)); }
export async function entityById(q: Q, id: string) { return (await loadEntities(q)).find((e) => e.id === id); }
/** Letterhead data for the PDF adapter (brand kit chosen by code; legal/contact from the record). */
export const pdfEntity = (e: Entity): PdfEntity => ({
  name: e.name, code: e.code, shortName: e.shortName, address: e.address.join(', '), addressLines: e.address, phone: e.phones.join(' / '), phones: e.phones,
  email: e.email, website: e.website, kraPin: e.kraPin, registrationNo: e.registrationNo, registeredOffice: e.registeredOffice, tagline: e.tagline, footerLine: e.footerLine,
});

export async function fxRates(q: Q = db): Promise<FxRate[]> {
  return (await q.select().from(t.fxRates)).map((r) => ({ currency: r.currency as Currency, month: r.month, avg: r.avg, closing: r.closing }));
}
/** Month-average rate for a non-USD amount (units per USD) and its USD value, as stored on costs and payments. */
export async function usdOf(q: Q, amount: number, currency: string, at: string | number = Date.now()) {
  if (currency === 'USD') return { fxRate: 1, amountUsd: amount };
  let rate: number;
  try { rate = fxFor(await fxRates(q), currency, at, 'avg'); } catch { return fail(`No approved exchange rate for ${currency} — a director adds it under Settings → Exchange rates`); }
  return { fxRate: rate, amountUsd: Math.round((amount / rate) * 100) / 100 };
}
