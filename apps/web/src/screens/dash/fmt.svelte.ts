// Shared bits of the P1 dashboard screens (docs/15): money in the directors' chosen currency (one selector, converted from
// USD at the latest approved month-average rate), number / date formats, and the frame props every panel takes from a result.
import { settings, type DashResult } from '@btw/api';
import { compact } from '../../components/charts/scale';

export const currency = $state<{ code: string; rate: number; month: string }>({ code: 'USD', rate: 1, month: '' });
export const CODES = ['USD', 'KES', 'UGX', 'TZS', 'RWF'];
let rates: { currency: string; month: string; avg: number }[] | null = null;
export async function setCurrency(code: string) {
  if (code === 'USD') { Object.assign(currency, { code, rate: 1, month: '' }); return; }
  rates ??= await settings.fx().catch(() => []);
  const r = rates.filter((x) => x.currency === code).sort((a, b) => b.month.localeCompare(a.month))[0];
  if (r) Object.assign(currency, { code, rate: r.avg, month: r.month });
}
/** USD → the chosen currency. */
export const cv = (usd: number) => usd * currency.rate;
export const money = (usd: number | null | undefined) => (usd == null ? 'No data yet' : `${currency.code} ${compact(cv(usd))}`);
export const money2 = (usd: number | null | undefined) => (usd == null ? 'No data yet' : `${currency.code} ${cv(usd).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`);
export const moneyFull = (usd: number) => `${currency.code} ${Math.round(cv(usd)).toLocaleString('en-US')}`;
/** Value cell for exports: a number in the chosen currency (or empty). */
export const cvRow = (usd: number | null | undefined) => (usd == null ? '' : Math.round(cv(usd) * 100) / 100);
export const unitMoney = () => currency.code;
export const n0 = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 0 }));
export const pctF = (x: number | null | undefined, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
export const day = (at: string | null | undefined) => (at ? new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—');
export const dayTime = (at: string | null | undefined) => (at ? new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
/** Common DashboardPanel props from a builder result (money units follow the currency selector). */
export function frame(r: DashResult | undefined) {
  if (!r) return { definition: '', unit: '', period: '', updatedAt: undefined, empty: false };
  return {
    definition: r.definition, unit: r.currency ? r.unit.replace('USD', currency.code) : r.unit, period: r.period?.label ?? 'Now',
    // freshness = the newest record; amber only when nothing new for 30 days (live panels pass a shorter limit)
    updatedAt: r.freshness ?? null, empty: r.empty, staleAfter: 30 * 24 * 60,
  };
}
