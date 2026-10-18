// Number and date formatting for small screens (EAT dates, compact money).
const nf = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat('en-US', o);
export const usd = (n: number) => (Math.abs(n) >= 10_000 ? `$${nf({ notation: 'compact', maximumFractionDigits: 1 }).format(n)}` : `$${nf({ maximumFractionDigits: 0 }).format(n)}`);
export const usdFull = (n: number, cur = 'USD') => `${cur === 'USD' ? '$' : cur + ' '}${nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
export const num = (n: number) => nf({ maximumFractionDigits: 0 }).format(n);
export const compact = (n: number) => nf({ notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const pct = (n: number | null | undefined, dp = 0) => (n == null ? '—' : `${(n * 100).toFixed(dp)}%`);
/** Relative change a vs b (null when b is 0). */
export const change = (a: number, b: number | null | undefined) => (b ? (a - b) / Math.abs(b) : null);
export const points = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
const TZ = 'Africa/Nairobi';
export const dayLabel = (d: string | number) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(d));
export const longToday = () => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date());
export function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: TZ }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
export const firstName = (name: string) => name.replace(/\s*\(.*\)$/, '').split(' ')[0];
export const plural = (n: number, one: string, many = one + 's') => `${num(n)} ${n === 1 ? one : many}`;
