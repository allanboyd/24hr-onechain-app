// docs/17 F4 / CHECKLIST F-0a: amount sanity rules shared by the server, the mock and the screens.
// Each kind of money entry has a plausible range in USD; other currencies are converted with the approved
// month-average rate (rules.fxFor). Outside the range → "unusual": the screen asks "are you sure?" and the server only
// accepts it with `confirmUnusual: true` (audited). Far outside (> IMPOSSIBLE_FACTOR × the upper bound), negative, zero
// or without a currency → "impossible": refused with 422. A large USD amount that would be plausible in a local
// currency is flagged as "looks like <local currency> entered as USD".
import { fxFor } from './rules';
import type { Currency, FxRate } from './types';

export type AmountKind = 'transport' | 'trip-expense' | 'warehouse-expense' | 'payment';

/** Plausible range per entry in USD (to confirm with the client). */
export const AMOUNT_RANGES_USD: Record<AmountKind, { min: number; max: number; label: string }> = {
  transport: { min: 100, max: 20_000, label: 'an agreed transport price per truck' },
  'trip-expense': { min: 1, max: 15_000, label: 'a trip expense' },
  'warehouse-expense': { min: 1, max: 25_000, label: 'a warehouse expense' },
  payment: { min: 1, max: 20_000, label: 'a transport payment' },
};
/** Above this many times the upper bound the amount is refused outright. */
export const IMPOSSIBLE_FACTOR = 50;
/** A USD amount at or above this (5 × the upper bound; transport 100,000) is probably a local currency typed as USD. */
export const localAsUsdFrom = (kind: AmountKind) => AMOUNT_RANGES_USD[kind].max * 5;

export const CURRENCIES: Currency[] = ['USD', 'KES', 'UGX', 'TZS', 'RWF'];

export interface AmountCheck {
  level: 'ok' | 'unusual' | 'impossible';
  kind: AmountKind; amount: number; currency: string;
  /** USD equivalent (null when it cannot be converted) */
  usd: number | null;
  min: number; max: number;
  direction?: 'high' | 'low';
  /** USD amounts that would be plausible in a local currency: e.g. [{ currency: 'UGX', usd: 822 }] */
  looksLocal?: { currency: Currency; usd: number }[];
  /** plain-English text for the person; empty when ok */
  message: string;
}

const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const money = (cur: string, v: number) => `${cur} ${v >= 100 ? n0(v) : v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export function checkAmount(kind: AmountKind, amount: unknown, currency: unknown, rates: FxRate[], at: string | number = Date.now()): AmountCheck {
  const { min, max, label } = AMOUNT_RANGES_USD[kind];
  const a = Number(amount);
  const cur = typeof currency === 'string' ? currency : '';
  const base = { kind, amount: a, currency: cur, usd: null as number | null, min, max };
  if (!/^[A-Z]{3}$/.test(cur) || !CURRENCIES.includes(cur as Currency)) return { ...base, level: 'impossible', message: 'Choose the currency of the amount (USD, KES, UGX, TZS or RWF)' };
  if (!Number.isFinite(a) || a <= 0) return { ...base, level: 'impossible', message: 'Enter an amount above zero' };
  let usd: number;
  try { usd = cur === 'USD' ? a : Math.round((a / fxFor(rates, cur, at)) * 100) / 100; } catch { return { ...base, level: 'impossible', message: `No approved exchange rate for ${cur} — a director adds it under Settings → Exchange rates` }; }
  const looksLocal = cur === 'USD' && a >= localAsUsdFrom(kind) ? localReadings(kind, a, rates, at) : [];
  const hint = looksLocal.length ? ` It looks like a local currency entered as USD: ${looksLocal.map((x) => `${money(x.currency, a)} ≈ USD ${n0(x.usd)}`).join(' or ')}. Check the currency.` : '';
  const shown = cur === 'USD' ? money('USD', a) : `${money(cur, a)} ≈ USD ${usd >= 100 ? n0(usd) : usd.toFixed(2)}`;
  const usual = `usual USD ${n0(min)}–${n0(max)}`;
  if (usd > max * IMPOSSIBLE_FACTOR) return { ...base, usd, level: 'impossible', direction: 'high', looksLocal, message: `${shown} is far too high for ${label} (${usual}) and cannot be saved.${hint}` };
  if (usd > max || usd < min) {
    const direction = usd > max ? 'high' as const : 'low' as const;
    return { ...base, usd, level: 'unusual', direction, looksLocal, message: `This is unusually ${direction} for ${label}: ${shown} (${usual}).${hint} Are you sure?` };
  }
  return { ...base, usd, level: 'ok', message: '' };
}

/** Local currencies in which this number would be a plausible amount. */
function localReadings(kind: AmountKind, a: number, rates: FxRate[], at: string | number) {
  const { min, max } = AMOUNT_RANGES_USD[kind];
  const out: { currency: Currency; usd: number }[] = [];
  for (const c of CURRENCIES) {
    if (c === 'USD') continue;
    try { const u = Math.round((a / fxFor(rates, c, at)) * 100) / 100; if (u >= min && u <= max) out.push({ currency: c, usd: u }); } catch { /* no rate */ }
  }
  return out;
}

/** What the server / mock does with a check: null = save; otherwise refuse with 422 and this code. */
export function amountRefusal(check: AmountCheck, confirmUnusual?: unknown): null | { status: 422; code: 'impossible-amount' | 'unusual-amount'; message: string } {
  if (check.level === 'impossible') return { status: 422, code: 'impossible-amount', message: check.message };
  if (check.level === 'unusual' && confirmUnusual !== true) return { status: 422, code: 'unusual-amount', message: check.message };
  return null;
}
/** Words added to the audit summary when an unusual amount was confirmed. */
export const unusualNote = (check: AmountCheck) => check.level === 'unusual' ? ` · unusual amount confirmed (≈ USD ${check.usd === null ? '?' : n0(check.usd)}, usual ${n0(check.min)}–${n0(check.max)})` : '';

/** Screens: run a save; when the server (or mock) answers "unusual amount", ask the person and, if they confirm, run it
 *  again with `confirmUnusual: true`. Returns undefined when the person says no. */
export async function withUnusualConfirm<T>(save: (confirmUnusual: boolean) => Promise<T>, ask: (message: string) => boolean | Promise<boolean> = (m) => (globalThis as { confirm?: (m: string) => boolean }).confirm?.(m) ?? false): Promise<T | undefined> {
  try { return await save(false); } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code !== 'unusual-amount') throw e;
    if (!(await ask(err.message ?? 'This amount is unusual. Are you sure?'))) return undefined;
    return save(true);
  }
}
