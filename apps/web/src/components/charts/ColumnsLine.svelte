<script lang="ts">
  // Stacked columns (parts of a total, e.g. goods cost · expenses · profit per month) with a line on a second axis
  // (e.g. margin %). Added for the profit-and-margin dashboard (docs/15, C-P1-03). Click a column → onselect(category).
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { baseLayout, colorOf } from './theme.svelte';
  import { compact } from './scale';
  let { categories, parts, line, format = compact, formatLine = (n: number) => `${(n * 100).toFixed(1)}%`, height = 300, label, filename = 'columns-line', onselect }: {
    categories: string[]; parts: { name: string; values: number[]; slot?: number }[];
    /** values on the right axis (null = no value, gap in the line) */ line?: { name: string; values: (number | null)[] };
    format?: (n: number) => string; formatLine?: (n: number) => string; height?: number; label: string; filename?: string; onselect?: (category: string) => void;
  } = $props();
  function spec(t: any) {
    const data: any[] = parts.map((p, i) => ({
      type: 'bar', name: p.name, x: categories, y: p.values, marker: { color: colorOf(t, p.slot ?? i), line: { color: t.surface, width: 1 } },
      text: p.values.map((v) => format(v)), hovertemplate: `<b>%{text}</b>  ${p.name} · %{x}<extra></extra>`, texttemplate: '', textposition: 'none',
    }));
    if (line) data.push({ type: 'scatter', mode: 'lines+markers', name: line.name, x: categories, y: line.values, yaxis: 'y2', connectgaps: false,
      line: { color: t.text, width: 2 }, marker: { size: 7, color: t.text }, text: line.values.map((v) => (v == null ? 'No data yet' : formatLine(v))), hovertemplate: `<b>%{text}</b>  ${line.name} · %{x}<extra></extra>` });
    const lay = baseLayout(t, { legend: true, height });
    lay.barmode = 'relative'; lay.hovermode = 'closest';
    lay.xaxis = { ...lay.xaxis, type: 'category', fixedrange: true };
    lay.yaxis = { ...lay.yaxis, showgrid: true, fixedrange: true, tickformat: '~s' };
    const lv = (line?.values ?? []).filter((v): v is number => v != null);
    if (line) lay.yaxis2 = { overlaying: 'y', side: 'right', showgrid: false, zeroline: false, fixedrange: true, tickformat: '.0%', tickfont: { color: t.muted, size: 11 }, automargin: true,
      range: [Math.min(0, ...lv) * 1.2, Math.max(0.05, ...lv) * 1.3] };
    return { data, layout: lay };
  }
</script>
<PlotlyChart {spec} {height} {label} {filename} zoom={false} onselect={onselect ? (p: PlotPoint) => onselect(String(p.x)) : undefined} />
