// Display formatting. Times shown in East Africa Time; dates as DD Month YYYY (§12 Localisation).
const TZ = 'Africa/Nairobi';
export const fmtDate = (d?: string | number) => (d == null ? '—' : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(d)));
export const fmtShortDate = (d?: string | number) => (d == null ? '—' : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: TZ }).format(new Date(d)));
export const fmtTime = (d?: string | number) => (d == null ? '—' : new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(d)));
export const fmtDateTime = (d?: string | number) => (d == null ? '—' : `${fmtShortDate(d)}, ${fmtTime(d)}`);
export const fmtNum = (n: number, dp = 0) => new Intl.NumberFormat('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
export const fmtMoney = (n: number, cur = 'USD') => `${cur} ${fmtNum(n, 2)}`;
export const fmtCompact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export function ago(d?: string) {
  if (!d) return '—';
  const m = Math.round((Date.now() - Date.parse(d)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
export const hoursLabel = (h: number) => (h >= 48 ? `${Math.round(h / 24)} d` : `${h} h`);
