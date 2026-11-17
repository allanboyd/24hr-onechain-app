// Chart theme read from the app's CSS tokens at render time. `themeTick.v` changes when light/dark flips,
// so charts re-render with the new colours.
export const themeTick = $state({ v: 0 });
let watching = false;
export function watchTheme() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  const bump = () => { themeTick.v++; };
  new MutationObserver(bump).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', bump);
}

export interface Theme {
  text: string; muted: string; subtle: string; grid: string; axis: string; surface: string; tipBg: string; tipBorder: string;
  series: string[]; other: string; seq: string[]; success: string; warning: string; danger: string; info: string; font: string;
  /** Control-room inks: profit, cost steps, planned vs issued. */
  vizGood: string; vizWarn: string; vizBad: string; cost: string; planned: string; allowed: string;
  /** subtle status fills (state heatmaps) — pair with `text` ink */ tint: { success: string; info: string; warning: string; danger: string };
  /** status text colours (readable on the surface; `warning` above is the solid fill) */ ink?: { success: string; warning: string; danger: string };
}
export function readTheme(): Theme {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, fb = '#888') => cs.getPropertyValue(n).trim() || fb;
  return {
    text: v('--text'), muted: v('--text-muted'), subtle: v('--text-subtle'), grid: v('--viz-grid'), axis: v('--viz-axis'),
    surface: v('--surface', '#fff'), tipBg: v('--surface-raised', '#fff'), tipBorder: v('--border'),
    series: Array.from({ length: 8 }, (_, i) => v(`--viz-${i + 1}`)), other: v('--viz-other'),
    seq: Array.from({ length: 7 }, (_, i) => v(`--seq-${i + 1}`)),
    success: v('--success'), warning: v('--warning-solid'), danger: v('--danger'), info: v('--info'),
    vizGood: v('--viz-good', '#1b7f5c'), vizWarn: v('--viz-warn', '#b7791f'), vizBad: v('--viz-bad', '#b42318'),
    cost: v('--viz-cost', '#d9625b'), planned: v('--viz-planned', '#6b8cae'), allowed: v('--viz-allowed', '#c5d0de'),
    font: "'Inter Variable', Inter, system-ui, sans-serif",
    tint: { success: v('--success-subtle'), info: v('--info-subtle'), warning: v('--warning-subtle'), danger: v('--danger-subtle') },
    ink: { success: v('--success'), warning: v('--warning'), danger: v('--danger') },
  };
}
/** #rrggbb → rgba() with alpha (area washes). */
export function alpha(hex: string, a: number) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : hex;
}
export const colorOf = (t: Theme, i: number) => (i < t.series.length ? t.series[i] : t.other);
/** A named control-room ink, or series slot `i` when unset. */
export type Ink = 'navy' | 'good' | 'warn' | 'bad' | 'cost' | 'planned' | 'allowed' | 'teal' | 'slate';
export function mark(t: Theme, i: number, ink?: Ink) {
  switch (ink) {
    case 'navy': return t.series[0] ?? colorOf(t, i);
    case 'good': return t.vizGood;
    case 'warn': return t.vizWarn;
    case 'bad': return t.vizBad;
    case 'cost': return t.cost;
    case 'planned': return t.planned;
    case 'allowed': return t.allowed;
    case 'teal': return t.series[1] ?? colorOf(t, i);
    case 'slate': return t.series[3] ?? t.other;
    default: return colorOf(t, i);
  }
}

/** Shared layout: transparent, tokens, Inter, recessive grid, one y-axis. */
export function baseLayout(t: Theme, o: { legend?: boolean; height: number }) {
  const axis = { gridcolor: t.grid, linecolor: t.axis, zeroline: false, tickfont: { color: t.muted, size: 11 }, title: { font: { color: t.muted, size: 11 } }, automargin: true };
  return {
    height: o.height, autosize: true, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: t.font, size: 12, color: t.muted }, margin: { l: 8, r: 8, t: 8, b: 8, pad: 4 },
    xaxis: { ...axis, showgrid: false, showline: true }, yaxis: { ...axis, showline: false },
    hoverlabel: { bgcolor: t.tipBg, bordercolor: t.tipBorder, font: { family: t.font, color: t.text, size: 12 }, align: 'left' },
    showlegend: !!o.legend, legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { color: t.text, size: 12 }, itemclick: 'toggle', itemdoubleclick: 'toggleothers' },
    barcornerradius: 6, bargap: 0.35, bargroupgap: 0.08, dragmode: 'zoom',
  } as Record<string, any>;
}
