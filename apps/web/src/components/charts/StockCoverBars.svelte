<script lang="ts" module>
  import type { Status } from './status';
  export interface CoverItem { label: string; /** days of stock (null = no data) */ days: number | null; /** minimum target days */ min: number; /** above this = slow / overstock */ max?: number }
  export function coverStatus(it: CoverItem): { status: Status; label: string } {
    if (it.days == null) return { status: 'none', label: 'No data yet' };
    if (it.days < it.min) return { status: 'bad', label: 'Below minimum' };
    if (it.max != null && it.days > it.max) return { status: 'warn', label: 'Slow / overstock' };
    return { status: 'good', label: 'Within target' };
  }
</script>
<script lang="ts">
  // Bullet-style days-of-stock bars: one bar per product against its own minimum target (tick), coloured and labelled by state:
  // ✕ below minimum (stock-out risk) · ! above the slow-moving limit · ✓ within target · – no data. Click → onselect(item).
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { baseLayout } from './theme.svelte';
  import { STATUS, statusFill } from './status';
  import { wrapLabel } from './labels';
  let { items, height, label, filename = 'stock-cover', onselect }: {
    items: CoverItem[]; height?: number; label: string; filename?: string; onselect?: (item: CoverItem) => void;
  } = $props();
  const h = $derived(height ?? Math.max(180, items.length * 40 + 90));
  const order: Status[] = ['bad', 'warn', 'good', 'none'];

  function spec(t: any, ctx: { narrow: boolean }) {
    const cats = items.map((i) => i.label);
    const axisMax = Math.max(30, ...items.map((i) => Math.max(i.days ?? 0, i.min, i.max ?? 0))) * (ctx.narrow ? 1.35 : 1.2);
    const data: any[] = [
      // track to the axis end, like the paper bullet chart
      { type: 'bar', orientation: 'h', y: cats, x: cats.map(() => axisMax), marker: { color: t.grid }, hoverinfo: 'skip', showlegend: false, width: 0.62 },
    ];
    for (const s of order) {
      const idx = items.map((it, i) => (coverStatus(it).status === s ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) continue;
      data.push({
        type: 'bar', orientation: 'h', name: `${STATUS[s].glyph} ${coverStatus(items[idx[0]]).label}`, y: idx.map((i) => cats[i]), x: idx.map((i) => items[i].days ?? 0), width: 0.62,
        marker: { color: statusFill(t, s) },
        text: idx.map((i) => (items[i].days == null ? 'No data yet' : `${STATUS[s].glyph} ${Math.round(items[i].days!)} d`)), textposition: 'none', customdata: idx.map((i) => [items[i].min, items[i].max ?? '—', i]),
        hovertemplate: `<b>%{text}</b>  %{y}<br>Minimum %{customdata[0]} d · slow above %{customdata[1]} d<extra></extra>`,
      });
    }
    const lay = baseLayout(t, { legend: true, height: h });
    lay.barmode = 'overlay';
    lay.hovermode = 'closest';
    lay.legend = { ...lay.legend, traceorder: 'normal' };
    lay.xaxis = { ...lay.xaxis, showgrid: true, gridcolor: t.grid, showline: false, range: [0, axisMax], fixedrange: true, title: { ...lay.xaxis.title, text: 'Days of stock cover' } };
    lay.yaxis = { ...lay.yaxis, type: 'category', categoryorder: 'array', categoryarray: cats, autorange: 'reversed', fixedrange: true, ticks: '', ticklabelstandoff: 6,
      tickmode: 'array', tickvals: cats, ticktext: cats.map((c) => wrapLabel(c, ctx.narrow ? 14 : 22)) };
    // value + state at the end of each track: one aligned column that never collides with the target ticks
    lay.annotations = items.map((it, i) => { const s = coverStatus(it).status; return { x: axisMax, y: cats[i], xanchor: 'right', xshift: -6, showarrow: false,
      text: it.days == null ? 'No data yet' : `<b>${STATUS[s].glyph} ${Math.round(it.days)} d</b>`, font: { size: 11, color: t.text } }; });
    // minimum target tick on each row (and the slow-moving limit, dotted)
    lay.shapes = items.flatMap((it, i) => [
      { type: 'line', xref: 'x', yref: 'y', x0: it.min, x1: it.min, y0: i - 0.42, y1: i + 0.42, line: { color: t.text, width: 2.5 } },
      ...(it.max != null ? [{ type: 'line', xref: 'x', yref: 'y', x0: it.max, x1: it.max, y0: i - 0.42, y1: i + 0.42, line: { color: t.muted, width: 1.5, dash: 'dot' } }] : []),
    ]);
    return { data, layout: lay };
  }
</script>
<PlotlyChart {spec} height={h} {label} {filename} zoom={false} onselect={onselect ? (p: PlotPoint) => { const i = p.customdata?.[2]; if (i != null && items[i]) onselect(items[i]); } : undefined} />
<p class="caption">Solid tick = minimum target for that product · dotted tick = slow-moving limit.</p>
