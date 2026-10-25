<script lang="ts">
  // Horizontal stacked bars — composition of a total per category (e.g. landed cost per unit = goods + truck + warehouse).
  // Share labels inside segments (≥ 8 %), the total at the bar end, 2px surface gap between segments.
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { baseLayout, colorOf } from './theme.svelte';
  import { autoTick, compact } from './scale';
  import { wrapLabel } from './labels';
  export interface StackPart { name: string; values: number[]; slot?: number }
  let { categories, parts, format = compact, shareLabels = true, totals = true, height, label, filename = 'composition', onselect }: {
    categories: string[]; parts: StackPart[]; format?: (n: number) => string; shareLabels?: boolean; totals?: boolean;
    height?: number; label: string; filename?: string; onselect?: (category: string, part: string) => void;
  } = $props();
  const sums = $derived(categories.map((_, i) => parts.reduce((a, p) => a + (p.values[i] ?? 0), 0)));
  const h = $derived(height ?? Math.max(180, categories.length * 46 + 70));

  function spec(t: any, ctx: { narrow: boolean }) {
    const data = parts.map((p, pi) => ({
      type: 'bar', orientation: 'h', name: p.name, y: categories, x: p.values,
      marker: { color: colorOf(t, p.slot ?? pi), line: { color: t.surface, width: 2 } },
      text: p.values.map((v, i) => (shareLabels && sums[i] && v / sums[i] >= (ctx.narrow ? 0.2 : 0.08) ? `${Math.round((v / sums[i]) * 100)}%` : '')),
      texttemplate: '%{text}', textposition: 'inside', textangle: 0, insidetextanchor: 'middle', textfont: { size: 11 },
      customdata: p.values.map((v, i) => [format(v), sums[i] ? Math.round((v / sums[i]) * 100) : 0, format(sums[i])]),
      hovertemplate: `<b>%{customdata[0]}</b>  ${p.name} · %{customdata[1]}% of %{customdata[2]}<br>%{y}<extra></extra>`,
    }));
    const lay = baseLayout(t, { legend: true, height: h });
    lay.barmode = 'stack';
    lay.bargap = categories.length <= 3 ? 0.55 : 0.35;
    lay.hovermode = 'closest';
    lay.legend = { ...lay.legend, traceorder: 'normal' };
    const max = Math.max(0, ...sums);
    lay.xaxis = { ...lay.xaxis, showgrid: true, gridcolor: t.grid, showline: false, tickformat: autoTick(sums), range: [0, max * (totals ? (ctx.narrow ? 1.35 : 1.18) : 1.02)], fixedrange: true };
    lay.yaxis = { ...lay.yaxis, type: 'category', autorange: 'reversed', fixedrange: true, ticks: '', ticklabelstandoff: 6, tickmode: 'array', tickvals: categories, ticktext: categories.map((c) => wrapLabel(c, ctx.narrow ? 14 : 22)) };
    if (totals) lay.annotations = categories.map((c, i) => ({ x: sums[i], y: c, xanchor: 'left', xshift: 6, showarrow: false, text: `<b>${format(sums[i])}</b>`, font: { size: 11, color: t.text } }));
    return { data, layout: lay };
  }
</script>
<PlotlyChart {spec} height={h} {label} {filename} zoom={false} onselect={onselect ? (p: PlotPoint) => onselect(String(p.y), p.seriesName ?? '') : undefined} />
