<script lang="ts">
  // Columns / horizontal bars; grouped or stacked; ranked lists. Click a bar → onselect(category, series).
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { baseLayout, colorOf } from './theme.svelte';
  import { autoTick, compact } from './scale';
  export interface BarSeries { name: string; values: number[]; slot?: number }
  let { categories, series, horizontal = false, stacked = false, format = compact, height, label, labels = true, filename = 'bars', onselect, tickformat }: {
    categories: string[]; series: BarSeries[]; horizontal?: boolean; stacked?: boolean; format?: (n: number) => string;
    height?: number; label: string; /** value at the bar tip (single series only) */ labels?: boolean; filename?: string;
    onselect?: (category: string, seriesName: string) => void;
    /** d3 format for the value axis; default picks SI units only for values ≥ 1,000. */ tickformat?: string;
  } = $props();
  const h = $derived(height ?? (horizontal ? Math.max(160, categories.length * (categories.some((c) => c.includes(' — ')) ? 42 : 34) + 40) : 260));
  const cut = (c: string, n: number) => (c.length > n ? `${c.slice(0, n - 1)}…` : c);
  /** "A — B" labels go on two lines when narrow, so the distinguishing half isn't truncated away. */
  const short = (c: string, n: number, narrow: boolean) => (narrow && c.includes(' — ') ? c.split(' — ').map((x) => cut(x, n)).join('<br>') : cut(c, n));
  function spec(t: any, ctx: { narrow: boolean }) {
    const tip = labels && series.length === 1;
    const data = series.map((s, i) => ({
      type: 'bar', name: s.name, orientation: horizontal ? 'h' : 'v',
      x: horizontal ? s.values : categories, y: horizontal ? categories : s.values,
      marker: { color: colorOf(t, s.slot ?? i), line: { color: t.surface, width: stacked ? 1 : 0 } },
      text: s.values.map((v) => format(v)), texttemplate: tip ? '%{text}' : '', textposition: tip ? 'outside' : 'none', cliponaxis: false,
      textfont: { color: t.text, size: 11 }, hovertemplate: `<b>%{text}</b>  ${series.length > 1 ? s.name + ' · ' : ''}%{${horizontal ? 'y' : 'x'}}<extra></extra>`,
    }));
    const lay = baseLayout(t, { legend: series.length > 1, height: h });
    lay.barmode = stacked ? 'stack' : 'group';
    // Thin marks: wider gaps when there are few categories (Plotly can't cap bar thickness in px).
    lay.bargap = categories.length <= 2 ? 0.7 : categories.length <= 4 ? 0.55 : 0.35;
    lay.legend = { ...lay.legend, traceorder: 'normal' };
    // Room for the value at the tip of the longest bar.
    const peak = stacked ? Math.max(0, ...categories.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0))) : Math.max(0, ...series.flatMap((s) => s.values));
    lay.hovermode = 'closest';
    const cat = { ...(horizontal ? lay.yaxis : lay.xaxis), type: 'category', showgrid: false, showline: !horizontal, fixedrange: true, automargin: true };
    const val: Record<string, any> = { ...(horizontal ? lay.xaxis : lay.yaxis), showgrid: true, gridcolor: t.grid, showline: false, tickformat: tickformat ?? autoTick(stacked ? categories.map((_, i) => series.reduce((a, x) => a + (x.values[i] ?? 0), 0)) : series.flatMap((x) => x.values)), rangemode: 'tozero', fixedrange: true };
    if (tip && peak > 0) val.range = [0, peak * (horizontal ? (ctx.narrow ? 1.45 : 1.22) : 1.12)];
    const maxLen = ctx.narrow ? 16 : 34;
    if (categories.some((c) => c.length > maxLen)) Object.assign(cat, { tickmode: 'array', tickvals: categories, ticktext: categories.map((c) => short(c, maxLen, ctx.narrow)) });
    if (horizontal) { lay.yaxis = { ...cat, autorange: 'reversed', ticks: '', ticklabelstandoff: 6 }; lay.xaxis = val; }
    else { lay.xaxis = cat; lay.yaxis = val; }
    return { data, layout: lay };
  }
</script>
<PlotlyChart {spec} height={h} {label} {filename} zoom={false} onselect={onselect ? (p: PlotPoint) => onselect(String(horizontal ? p.y : p.x), p.seriesName ?? '') : undefined} />
