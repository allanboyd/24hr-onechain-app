<script lang="ts">
  // Balances by age band per entity (provider, customer): horizontal stacked bars, youngest band first, total at the bar end.
  // Bands are ordinal, so they default to one-hue light → dark; pass `tones` to use the status palette (e.g. overdue = red) — the band name stays in the legend.
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { baseLayout } from './theme.svelte';
  import { autoTick, compact } from './scale';
  import { statusFill, STATUS, type Status } from './status';
  import { wrapLabel } from './labels';
  export interface AgeBand { name: string; values: number[] }
  let { entities, bands, tones, format = compact, height, label, filename = 'ageing', onselect }: {
    entities: string[]; /** youngest → oldest */ bands: AgeBand[]; /** status per band (same order) */ tones?: Status[];
    format?: (n: number) => string; height?: number; label: string; filename?: string; onselect?: (entity: string, band: string) => void;
  } = $props();
  const sums = $derived(entities.map((_, i) => bands.reduce((a, b) => a + (b.values[i] ?? 0), 0)));
  const h = $derived(height ?? Math.max(180, entities.length * 40 + 80));

  function spec(t: any, ctx: { narrow: boolean }) {
    const n = bands.length;
    const color = (i: number) => (tones?.[i] ? statusFill(t, tones[i]) : t.seq[Math.min(6, Math.round(2 + (i / Math.max(1, n - 1)) * 4))]);
    const data = bands.map((b, bi) => ({
      type: 'bar', orientation: 'h', name: tones?.[bi] ? `${STATUS[tones[bi]].glyph} ${b.name}` : b.name, y: entities, x: b.values,
      marker: { color: color(bi), line: { color: t.surface, width: 2 } }, textposition: 'none',
      customdata: b.values.map((v, i) => [format(v), sums[i] ? Math.round((v / sums[i]) * 100) : 0]),
      hovertemplate: `<b>%{customdata[0]}</b>  ${b.name} · %{customdata[1]}%<br>%{y}<extra></extra>`,
    }));
    const lay = baseLayout(t, { legend: true, height: h });
    lay.barmode = 'stack';
    lay.bargap = entities.length <= 3 ? 0.55 : 0.35;
    lay.hovermode = 'closest';
    lay.legend = { ...lay.legend, traceorder: 'normal' };
    const max = Math.max(0, ...sums);
    lay.xaxis = { ...lay.xaxis, showgrid: true, gridcolor: t.grid, showline: false, tickformat: autoTick(sums), range: [0, max * (ctx.narrow ? 1.35 : 1.18)], fixedrange: true };
    lay.yaxis = { ...lay.yaxis, type: 'category', autorange: 'reversed', fixedrange: true, ticks: '', ticklabelstandoff: 6, tickmode: 'array', tickvals: entities, ticktext: entities.map((c) => wrapLabel(c, ctx.narrow ? 14 : 22)) };
    lay.annotations = entities.map((c, i) => ({ x: sums[i], y: c, xanchor: 'left', xshift: 6, showarrow: false, text: `<b>${format(sums[i])}</b>`, font: { size: 11, color: t.text } }));
    return { data, layout: lay };
  }
</script>
<PlotlyChart {spec} height={h} {label} {filename} zoom={false} onselect={onselect ? (p: PlotPoint) => onselect(String(p.y), (p.seriesName ?? '').replace(/^[✓!✕–] /, '')) : undefined} />
