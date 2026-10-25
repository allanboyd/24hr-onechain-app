<script lang="ts">
  // Two measures per item with threshold lines and labelled quadrants (e.g. sales speed × days of stock → "Slow & overstocked").
  // Optional bubble size; colour by group in fixed slot order. Hover names the item; click → onselect(point).
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { baseLayout, colorOf } from './theme.svelte';
  import { compact } from './scale';
  import { statusFill, statusInk, STATUS, type Status } from './status';
  export interface QuadPoint { id?: string; label: string; x: number; y: number; size?: number; group?: string }
  export interface Quadrant { label: string; status?: Status }
  let { points, xLabel, yLabel, xThreshold, yThreshold, quadrants, groups, formatX = compact, formatY = compact, sizeLabel = 'Size',
    height = 340, label, filename = 'quadrants', onselect }: {
    points: QuadPoint[]; xLabel: string; yLabel: string; xThreshold?: number; yThreshold?: number;
    /** corner labels; the quadrant with a status gets a subtle tint and a glyph */
    quadrants?: { topLeft?: Quadrant; topRight?: Quadrant; bottomLeft?: Quadrant; bottomRight?: Quadrant };
    /** fixed group order (colour follows the group, never its rank) */ groups?: string[];
    formatX?: (n: number) => string; formatY?: (n: number) => string; sizeLabel?: string;
    height?: number; label: string; filename?: string; onselect?: (p: QuadPoint) => void;
  } = $props();
  const order = $derived(groups ?? [...new Set(points.map((p) => p.group ?? ''))]);

  function spec(t: any, ctx: { narrow: boolean }) {
    const maxSize = Math.max(1, ...points.map((p) => p.size ?? 0));
    const data = order.map((g, gi) => {
      const ps = points.filter((p) => (p.group ?? '') === g);
      const c = colorOf(t, gi);
      return {
        type: 'scatter', mode: 'markers', name: g || 'Items', x: ps.map((p) => p.x), y: ps.map((p) => p.y),
        marker: { color: c, opacity: 0.85, size: ps.map((p) => (p.size != null ? 9 + 23 * Math.sqrt(p.size / maxSize) : 11)), line: { color: t.surface, width: 2 } },
        customdata: ps.map((p) => [p.label, formatX(p.x), formatY(p.y), p.size != null ? `${sizeLabel} ${compact(p.size)}` : '', points.indexOf(p)]),
        hovertemplate: `<b>%{customdata[0]}</b><br>${xLabel}: %{customdata[1]}<br>${yLabel}: %{customdata[2]}<br>%{customdata[3]}<extra>${g}</extra>`,
      };
    });
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const xr = [0, Math.max(xThreshold ?? 0, ...xs) * 1.12], yr = [0, Math.max(yThreshold ?? 0, ...ys) * 1.12];
    const lay = baseLayout(t, { legend: order.length > 1, height });
    lay.hovermode = 'closest';
    lay.xaxis = { ...lay.xaxis, title: { ...lay.xaxis.title, text: xLabel }, range: xr, showgrid: true, gridcolor: t.grid, zeroline: false, fixedrange: true };
    lay.yaxis = { ...lay.yaxis, title: { ...lay.yaxis.title, text: yLabel }, range: yr, showgrid: true, gridcolor: t.grid, fixedrange: true };
    const shapes: any[] = [], ann: any[] = [];
    const xt = xThreshold ?? (xr[1] / 2), yt = yThreshold ?? (yr[1] / 2);
    const corner = (q: Quadrant | undefined, x0: number, x1: number, y0: number, y1: number, xa: 'left' | 'right', ya: 'top' | 'bottom') => {
      if (!q) return;
      if (q.status && q.status !== 'good') shapes.push({ type: 'rect', layer: 'below', xref: 'x', yref: 'y', x0, x1, y0, y1, line: { width: 0 }, fillcolor: statusFill(t, q.status), opacity: 0.08 });
      ann.push({ xref: 'x', yref: 'y', x: xa === 'left' ? x0 : x1, y: ya === 'top' ? y1 : y0, xanchor: xa, yanchor: ya, showarrow: false, xshift: xa === 'left' ? 6 : -6, yshift: ya === 'top' ? -4 : 4,
        text: `${q.status ? STATUS[q.status].glyph + ' ' : ''}${q.label}`, font: { size: ctx.narrow ? 10 : 11, color: q.status && q.status !== 'none' ? statusInk(t, q.status) : t.muted } });
    };
    corner(quadrants?.topLeft, xr[0], xt, yt, yr[1], 'left', 'top');
    corner(quadrants?.topRight, xt, xr[1], yt, yr[1], 'right', 'top');
    corner(quadrants?.bottomLeft, xr[0], xt, yr[0], yt, 'left', 'bottom');
    corner(quadrants?.bottomRight, xt, xr[1], yr[0], yt, 'right', 'bottom');
    if (xThreshold != null) shapes.push({ type: 'line', xref: 'x', yref: 'paper', x0: xThreshold, x1: xThreshold, y0: 0, y1: 1, line: { color: t.axis, width: 1, dash: 'dash' } });
    if (yThreshold != null) shapes.push({ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: yThreshold, y1: yThreshold, line: { color: t.axis, width: 1, dash: 'dash' } });
    lay.shapes = shapes; lay.annotations = ann;
    return { data, layout: lay };
  }
</script>
<PlotlyChart {spec} {height} {label} {filename} zoom={false} onselect={onselect ? (p: PlotPoint) => { const i = p.customdata?.[4]; if (i != null && points[i]) onselect(points[i]); } : undefined} />
