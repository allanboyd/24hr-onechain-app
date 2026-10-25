// Chart → image for PDF export (lazy chunk; never in the web entry). Re-renders each Plotly chart in the light theme on white.
import { figures, loadPlotly } from './PlotlyChart.svelte';
import { readTheme, type Theme } from './theme.svelte';

function merge(a: Record<string, any>, b: Record<string, any> = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof a[k] === 'object' ? merge(a[k], v) : v;
  return out;
}
/** Light-theme tokens regardless of the current mode (flips data-theme synchronously, reads, restores). */
export function lightTheme(): Theme {
  const html = document.documentElement, prev = html.getAttribute('data-theme');
  html.setAttribute('data-theme', 'light');
  try { return readTheme(); } finally { prev == null ? html.removeAttribute('data-theme') : html.setAttribute('data-theme', prev); }
}
/** JPEG snapshots (white background, light theme, 2× scale) of every Plotly chart inside `root`. */
export async function chartImages(root: Element, width = 1100): Promise<{ url: string; width: number; height: number }[]> {
  const plots = [...root.querySelectorAll('.plot')].filter((p) => figures.has(p));
  if (!plots.length) return [];
  const Plotly = await loadPlotly();
  const t = lightTheme();
  const out: { url: string; width: number; height: number }[] = [];
  for (const p of plots) {
    const { spec, height } = figures.get(p)!();
    const s = spec(t, { narrow: false });
    const layout = merge(merge({ height }, s.layout), { width, height, paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff' });
    const url: string = await Plotly.toImage({ data: s.data, layout }, { format: 'jpeg', width, height, scale: 2 });
    out.push({ url, width: width * 2, height: height * 2 });
  }
  return out;
}
