// Small, dependency-free helpers shared by the chart kit.
export const SLOTS = 8;
/** Series colour by slot (0-based). Slots never cycle: callers fold extras into "Other" first. */
export const slot = (i: number) => (i < SLOTS ? `var(--viz-${i + 1})` : 'var(--viz-other)');
export const seq = (t: number) => `var(--seq-${Math.min(7, Math.max(1, Math.round(1 + t * 6)))})`;

/** Clean upper bound for an axis (1, 2, 2.5, 5 × 10ⁿ). */
export function niceMax(max: number) {
  if (!(max > 0)) return 1;
  const e = 10 ** Math.floor(Math.log10(max));
  const f = max / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}
export const ticks = (max: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);

const cmp = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const compact = (n: number) => (Math.abs(n) < 10_000 ? whole.format(n) : cmp.format(n));
export const usd = (n: number) => `USD ${compact(n)}`;
export const pct = (n: number, dp = 0) => `${(n * 100).toFixed(dp)}%`;

/** Keep the largest `max - 1` items and fold the rest into "Other". */
export function foldOther<T extends { label: string; value: number }>(items: T[], max = 6): { label: string; value: number }[] {
  const s = [...items].sort((a, b) => b.value - a.value);
  if (s.length <= max) return s;
  const head = s.slice(0, max - 1);
  return [...head, { label: 'Other', value: s.slice(max - 1).reduce((a, x) => a + x.value, 0) }];
}

export type Rows = (string | number)[][];
const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows: Rows) => rows.map((r) => r.map(cell).join(',')).join('\n');
export function downloadCsv(name: string, rows: Rows) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.csv` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 'YYYY-MM' month key and a short label ("Oct 26"). */
export const monthKey = (iso: string) => iso.slice(0, 7);
export const monthLabel = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
/** Group items into months (sorted), returning [key, items][]. */
export function byMonth<T>(items: T[], at: (x: T) => string | undefined): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of items) { const a = at(x); if (!a) continue; const k = monthKey(a); (m.get(k) ?? m.set(k, []).get(k)!).push(x); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Plotly axis tick format: SI units (12k, 1.2M) only once values reach 1,000; plain numbers below (no "500m" for 0.5). */
export function autoTick(values: (number | null | undefined)[]): string {
  const max = Math.max(0, ...values.map((v) => Math.abs(v ?? 0)));
  return max >= 1000 ? '~s' : max >= 10 ? ',~d' : ',.2~f';
}
