// Period planning, PO-against-plan and planned-vs-actual (docs/07-amendments-plan.md §A–C).
// Thin layer over @btw/api (periodPlans, plans.planContext, reports.plannedVsActual, settings.pvThresholds)
// plus the period / month / destination helpers the screens share.
import { amount, lookup, onChange, periodPlans, plans, ref, reports, settings, type ID, type PeriodKind, type PeriodPlan, type PeriodPlanLine, type PlanLineContext, type PvThresholds } from '@btw/api';
import type { PlannedVsActual, PvFilter, PvFlag, PvLine } from '@btw/api';
export type { PeriodKind, PeriodPlan, PeriodPlanLine, PvThresholds, PlannedVsActual, PvFilter, PvFlag, PvLine };
export { periodPlans };

export type LineContext = PlanLineContext;
export const planContext = (planId: ID) => plans.planContext(planId);
export const plannedVsActual = (f: PvFilter = {}) => reports.plannedVsActual(f);
export const pvThresholds = () => settings.pvThresholds();
export const setPvThresholds = (t: PvThresholds) => settings.setPvThresholds(t);
/** Re-run on any data change (saves, approvals, threshold edits). */
export const onPlanningChange = (fn: () => void) => onChange(fn);

// ---------------------------------------------------------------- periods
export const KIND_LABEL: Record<PeriodKind, string> = { month: '1 month', quarter: 'Quarter', half: 'Half year', year: 'Year', custom: 'Custom' };
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const lastDay = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0));
/** Period [from, to] for a kind starting in the month of `start` (quarters/halves/years follow the calendar). */
export function periodFor(kind: PeriodKind, start: string): { from: string; to: string } {
  const d = new Date(start.slice(0, 10) + 'T00:00:00Z'); const y = d.getUTCFullYear(); let m = d.getUTCMonth();
  const span = kind === 'quarter' ? 3 : kind === 'half' ? 6 : kind === 'year' ? 12 : 1;
  if (kind === 'quarter') m -= m % 3; else if (kind === 'half') m -= m % 6; else if (kind === 'year') m = 0;
  return { from: ymd(new Date(Date.UTC(y, m, 1))), to: ymd(lastDay(y, m + span - 1)) };
}
/** 'YYYY-MM' months covered by [from, to]. */
export function monthsOf(from: string, to: string): string[] {
  const out: string[] = []; let y = +from.slice(0, 4), m = +from.slice(5, 7);
  const ey = +to.slice(0, 4), em = +to.slice(5, 7);
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${pad(m)}`); if (++m > 12) { m = 1; y++; } }
  return out;
}
export const monthLabel = (k: string) => new Date(k.slice(0, 7) + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
export function periodLabel(p: { from: string; to: string; periodKind?: PeriodKind }) {
  const ms = monthsOf(p.from, p.to);
  if (p.periodKind === 'quarter') return `Q${Math.floor((+p.from.slice(5, 7) - 1) / 3) + 1} ${p.from.slice(0, 4)}`;
  if (p.periodKind === 'half') return `H${+p.from.slice(5, 7) <= 6 ? 1 : 2} ${p.from.slice(0, 4)}`;
  if (p.periodKind === 'year') return p.from.slice(0, 4);
  return ms.length === 1 ? monthLabel(ms[0]) : `${monthLabel(ms[0])} – ${monthLabel(ms.at(-1)!)}`;
}
/** Even split of `total` over `months` (remainder on the first months), summing exactly to total. */
export function evenSplit(total: number, months: string[]): Record<string, number> {
  const base = Math.floor(total / months.length); let rest = total - base * months.length;
  return Object.fromEntries(months.map((k) => [k, base + (rest-- > 0 ? 1 : 0)]));
}
export const splitSum = (s?: Record<string, number>) => Object.values(s ?? {}).reduce((a, b) => a + (+b || 0), 0);
export const lineValue = (l: PeriodPlanLine) => amount(l.cases, l.price);
export const planTotals = (p: PeriodPlan) => ({ cases: p.lines.reduce((a, l) => a + l.cases, 0), value: p.lines.reduce((a, l) => a + lineValue(l), 0) });

// ---------------------------------------------------------------- destinations ("Country – Town", §D)
export function destinationLabel(warehouseId?: ID | null): string {
  if (!warehouseId) return '—';
  const w = lookup.warehouse(warehouseId);
  if (!w) return warehouseId;
  return w.country && w.town ? `${w.country} – ${w.town}` : w.name;
}
export const destinations = () => ref().warehouses.map((w) => ({ id: w.id, label: destinationLabel(w.id) })).sort((a, b) => a.label.localeCompare(b.label));

export const flagTone = (f: PvFlag) => (f === 'On track' ? 'success' : f === 'Behind plan' ? 'warning' : f === 'Over plan' ? 'danger' : 'info');

// ---------------------------------------------------------------- editing & overlaps (plans are suggestions)
/** Period plans are saved directly (no approval) by planners, directors and admins. */
export const canEditPeriodPlans = (u: { roles: string[] } | null) => !!u && u.roles.some((r) => r === 'planner' || r === 'director' || r === 'admin');
export type PlanConflict = { id: ID; ref: string; from: string; to: string; title: string };
/** The Active plans a save collided with (409 'overlap'), from either client (mock Error or http ApiError). */
export function conflictsOf(err: unknown): PlanConflict[] | null {
  const e = err as { status?: number; conflicts?: PlanConflict[] };
  return e?.status === 409 && Array.isArray(e.conflicts) && e.conflicts.length ? e.conflicts : null;
}
/** Run a save; on an overlap ask `confirm(conflicts)` and, if the user agrees, run it again with replace = true. Null = cancelled. */
export async function withReplace<T>(run: (replace: boolean) => Promise<T>, confirm: (c: PlanConflict[]) => Promise<boolean>): Promise<T | null> {
  try { return await run(false); }
  catch (err) {
    const c = conflictsOf(err);
    if (!c) throw err;
    if (!(await confirm(c))) return null;
    return run(true);
  }
}
