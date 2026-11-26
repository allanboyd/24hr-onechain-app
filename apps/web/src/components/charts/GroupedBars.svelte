<script lang="ts">
  // Grouped columns per item (e.g. ordered / loaded / delivered per PO line) with the end-to-end gap labelled above each group.
  // Pair with <GapTable> for the exact absolute and % gaps at each step.
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { baseLayout, mark, type Ink } from './theme.svelte';
  import { autoTick, compact } from './scale';
  import { gapOf, gapText } from './gap';
  import { STATUS, statusInk } from './status';
  import { wrapLabel } from './labels';
  export interface GroupSeries { name: string; values: (number | null)[]; slot?: number; ink?: Ink }
  let { categories, series, format = compact, tolerance = 0.005, unit = '', height = 300, label, filename = 'grouped', gaps = true, onselect }: {
    categories: string[]; series: GroupSeries[]; format?: (n: number) => string;
    /** gap within this share counts as on track (default 0.5 %) */ tolerance?: number; /** e.g. "cases" */ unit?: string;
    height?: number; label: string; filename?: string; /** label the gap between the first and last series */ gaps?: boolean; onselect?: (category: string, series: string) => void;
  } = $props();

  function tick(c: string): string {
    const parts = c.split('-');
    if (parts.length >= 3 && c.length > 16) {
      const tail = parts.slice(-2).join('-');
      if (tail.length <= 18) return tail;
    }
    return wrapLabel(c, 14);
  }
  function spec(t: any, ctx: { narrow: boolean }) {
    const data = series.map((s, i) => ({
      type: 'bar', name: s.name, x: categories, y: s.values, marker: { color: mark(t, s.slot ?? i, s.ink) },
      text: s.values.map((v) => (v == null ? '' : format(v))), hovertemplate: `<b>%{text}${unit ? ' ' + unit : ''}</b>  ${s.name} · %{x}<extra></extra>`, textposition: 'none',
    }));
    const lay = baseLayout(t, { legend: true, height });
    lay.barmode = 'group';
    lay.bargap = categories.length <= 3 ? 0.45 : 0.28;
    lay.hovermode = 'closest';
    const all = series.flatMap((s) => s.values.map((v) => v ?? 0));
    const max = Math.max(1, ...all);
    lay.yaxis = { ...lay.yaxis, showgrid: true, gridcolor: t.grid, range: [0, max * 1.22], tickformat: autoTick(all), fixedrange: true, title: { ...lay.yaxis.title, text: ctx.narrow ? '' : unit } };
    const crowded = categories.length > 4 || categories.some((c) => c.length > 16);
    lay.xaxis = { ...lay.xaxis, type: 'category', fixedrange: true, tickangle: crowded ? -40 : 0, tickmode: 'array', tickvals: categories, ticktext: categories.map((c) => tick(c)) };
    const first = series[0], last = series.at(-1);
    if (gaps && first && last && first !== last) lay.annotations = categories.map((c, i) => {
      const g = gapOf(first.values[i], last.values[i], tolerance);
      const top = Math.max(...series.map((s) => s.values[i] ?? 0));
      return { x: c, y: top, yanchor: 'bottom', yshift: 4, showarrow: false, text: `${STATUS[g.status].glyph} ${gapText(g, format)}`, font: { size: 11, color: g.status === 'good' ? t.muted : statusInk(t, g.status) } };
    });
    return { data, layout: lay };
  }
</script>
<PlotlyChart {spec} {height} {label} {filename} zoom={false} onselect={onselect ? (p: PlotPoint) => onselect(String(p.x), p.seriesName ?? '') : undefined} />
{#if gaps && series.length > 1}<p class="caption">Label above each group: {series.at(-1)!.name.toLowerCase()} against {series[0].name.toLowerCase()} (✓ within {(tolerance * 100).toFixed(1)}%, ! up to {(tolerance * 200).toFixed(1)}%, ✕ beyond).</p>{/if}
