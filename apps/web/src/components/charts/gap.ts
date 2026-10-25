// Gap between two quantities (ordered → loaded → delivered): absolute, share and a status by tolerance.
import type { Status } from './status';
export interface Gap { abs: number; pct: number | null; status: Status }
/** `to` vs `from`. Within `tolerance` (fraction) = good, up to 2× = warn, beyond = bad; shortfalls and excesses both count. */
export function gapOf(from: number | null | undefined, to: number | null | undefined, tolerance = 0.005): Gap {
  if (from == null || to == null) return { abs: 0, pct: null, status: 'none' };
  const abs = to - from, pct = from ? abs / from : null;
  const p = Math.abs(pct ?? (abs ? 1 : 0));
  return { abs, pct, status: p <= tolerance ? 'good' : p <= tolerance * 2 ? 'warn' : 'bad' };
}
const sgn = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±');
/** "−40 (−3.3%)" */
export const gapText = (g: Gap, format: (n: number) => string = (n) => n.toLocaleString('en-US')) =>
  g.pct == null && g.status === 'none' ? '—' : `${sgn(g.abs)}${format(Math.abs(g.abs))}${g.pct != null ? ` (${sgn(g.pct)}${Math.abs(g.pct * 100).toFixed(1)}%)` : ''}`;
