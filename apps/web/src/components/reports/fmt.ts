// Formatting shared by the dashboard and the report tabs.
import { compact, pct, usd } from '../charts';
import type { Kpi } from '@btw/api';

export { compact, pct, usd };
/** Relative change (0.12 = +12%); null when there is nothing to compare with. */
export const change = (cur: number | null | undefined, prev: number | null | undefined) => (cur == null || prev == null || prev === 0 ? null : (cur - prev) / Math.abs(prev));
/** Difference in points for rates (0.03 = +3 points). */
export const points = (cur: number | null | undefined, prev: number | null | undefined) => (cur == null || prev == null ? null : cur - prev);
export const kpiValue = (k: Pick<Kpi, 'unit'>, v: number | null) =>
  v == null ? '—' : k.unit === 'usd' ? usd(v) : k.unit === 'cases' ? `${compact(v)} cases` : k.unit === 'pct' ? pct(v, 1) : k.unit === 'days' ? `${v.toFixed(1)} days` : `${v.toFixed(2)}×`;
/** Delta for a KPI: percentage points for rates, relative change otherwise. */
export const kpiDelta = (k: Kpi, base: number | null) => (k.unit === 'pct' ? points(k.value, base) : change(k.value, base));
export const deltaText = (k: Kpi, base: number | null) => {
  const d = kpiDelta(k, base); if (d == null) return '—';
  const s = `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(k.unit === 'pct' ? 1 : 0)}${k.unit === 'pct' ? ' pts' : '%'}`;
  return s;
};
export const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' }) : '—');
export const dayLong = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi' }) : '—');
