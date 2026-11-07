// Shared dashboard period chips. Every Home tab (and the directors' Today view) starts on the last 30 days, so a
// fresh demo or a quiet morning never opens on empty panels (docs/19 D2).
export const DAY = 864e5;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export function utcDay(ms = Date.now()) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export type PeriodKey = 'today' | '7' | '30' | 'month' | 'last-month' | '90' | 'ytd';
export const DEFAULT_PERIOD: PeriodKey = '30';

export const PERIODS: { key: PeriodKey; label: string; short: string; range: () => [number, number] }[] = [
  { key: 'today', label: 'Today', short: 'Today', range: () => { const a = utcDay(); return [a, a]; } },
  { key: '7', label: 'Last 7 days', short: 'Last 7 days', range: () => { const a = utcDay(); return [a - 6 * DAY, a]; } },
  { key: '30', label: 'Last 30 days', short: 'Last 30 days', range: () => { const a = utcDay(); return [a - 29 * DAY, a]; } },
  { key: 'month', label: 'This month', short: 'This month', range: () => { const d = new Date(); return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), utcDay()]; } },
  { key: 'last-month', label: 'Last month', short: 'Last month', range: () => { const d = new Date(); return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1), Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - DAY]; } },
  { key: '90', label: 'Last 90 days', short: 'Last 90 days', range: () => { const a = utcDay(); return [a - 89 * DAY, a]; } },
  { key: 'ytd', label: 'Year to date', short: 'This year', range: () => { const d = new Date(); return [Date.UTC(d.getUTCFullYear(), 0, 1), utcDay()]; } },
];

/** Inclusive calendar range as `from` / exclusive `to` date strings (what the dashboards API accepts). */
export function datesOf(key: PeriodKey | string): { from: string; to: string } {
  const p = PERIODS.find((x) => x.key === key) ?? PERIODS[0];
  const [a, b] = p.range();
  return { from: iso(a), to: iso(b + DAY) };
}
