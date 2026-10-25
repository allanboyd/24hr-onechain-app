// C-04 — one status palette for every dashboard, always paired with an icon/glyph and a text label (never colour alone).
//   good = on track / paid · warn = at risk / part paid · bad = delayed / short / damaged / unpaid · none = no data / not started
import CircleCheck from '@lucide/svelte/icons/circle-check';
import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
import OctagonX from '@lucide/svelte/icons/octagon-x';
import CircleDashed from '@lucide/svelte/icons/circle-dashed';
import Info from '@lucide/svelte/icons/info';
import type { Theme } from './theme.svelte';

export type Status = 'good' | 'warn' | 'bad' | 'none';

export interface StatusMeta {
  status: Status; label: string; icon: any;
  /** text glyph for places an icon can't go (Plotly labels, PDF, CSV) */ glyph: string;
  /** ink for text/icons */ ink: string; /** solid fill for marks */ fill: string; /** subtle background (chips, cells) */ bg: string;
  /** badge class from the design system */ tone: 'success' | 'warning' | 'danger' | 'neutral';
}

export const STATUS: Record<Status, StatusMeta> = {
  good: { status: 'good', label: 'On track', icon: CircleCheck, glyph: '✓', ink: 'var(--success)', fill: 'var(--success)', bg: 'var(--success-subtle)', tone: 'success' },
  warn: { status: 'warn', label: 'At risk', icon: TriangleAlert, glyph: '!', ink: 'var(--warning)', fill: 'var(--warning-solid)', bg: 'var(--warning-subtle)', tone: 'warning' },
  bad: { status: 'bad', label: 'Delayed', icon: OctagonX, glyph: '✕', ink: 'var(--danger)', fill: 'var(--danger)', bg: 'var(--danger-subtle)', tone: 'danger' },
  none: { status: 'none', label: 'No data', icon: CircleDashed, glyph: '–', ink: 'var(--text-muted)', fill: 'var(--viz-other)', bg: 'var(--surface-sunken)', tone: 'neutral' },
};

/** Business words → status, so screens can pass their own state names. */
const WORDS: Record<string, Status> = {
  'on track': 'good', 'on time': 'good', paid: 'good', ok: 'good', delivered: 'good', arrived: 'good', acknowledged: 'good', complete: 'good', good: 'good',
  'at risk': 'warn', 'part paid': 'warn', 'part-paid': 'warn', partial: 'warn', 'at border': 'warn', warning: 'warn', warn: 'warn', low: 'warn', slow: 'warn', pending: 'warn',
  delayed: 'bad', late: 'bad', short: 'bad', damaged: 'bad', unpaid: 'bad', overdue: 'bad', stopped: 'bad', critical: 'bad', bad: 'bad', 'stock-out risk': 'bad',
  'no data': 'none', 'not started': 'none', unknown: 'none', none: 'none',
};
export const statusOf = (word: string | Status | null | undefined): Status => (word ? WORDS[String(word).toLowerCase()] ?? (word in STATUS ? (word as Status) : 'none') : 'none');

/** Status meta with an optional label override (e.g. statusMeta('bad', 'Unpaid')). */
export const statusMeta = (s: Status | string, label?: string): StatusMeta => {
  const m = STATUS[statusOf(s)];
  return label ? { ...m, label } : m;
};

/** Plotly fill for a status from the resolved theme (CSS vars don't work inside Plotly). */
export function statusFill(t: Theme, s: Status): string {
  return s === 'good' ? t.success : s === 'warn' ? t.warning : s === 'bad' ? t.danger : t.other;
}
/** Plotly text colour for a status (amber text uses the darker warning ink, not the fill). */
export function statusInk(t: Theme, s: Status): string {
  return s === 'good' ? t.ink?.success ?? t.success : s === 'warn' ? t.ink?.warning ?? t.warning : s === 'bad' ? t.ink?.danger ?? t.danger : t.muted;
}
export function statusTint(t: Theme, s: Status): string {
  return s === 'none' ? t.grid : t.tint[s === 'good' ? 'success' : s === 'warn' ? 'warning' : 'danger'];
}

/** Alert severity (exception lists, triage): icon + label + status colour. */
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export const SEVERITY: Record<Severity, { label: string; status: Status; icon: any; rank: number }> = {
  critical: { label: 'Critical', status: 'bad', icon: OctagonX, rank: 4 },
  high: { label: 'High', status: 'bad', icon: TriangleAlert, rank: 3 },
  medium: { label: 'Medium', status: 'warn', icon: TriangleAlert, rank: 2 },
  low: { label: 'Low', status: 'none', icon: Info, rank: 1 },
};
