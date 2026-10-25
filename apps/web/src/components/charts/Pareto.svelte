<script lang="ts" module>
  /** Sorted rows with cumulative share and the vital-few flag. */
  export function paretoRows(list: { label: string; value: number }[], cut = 0.8) {
    const s = [...list].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
    const total = s.reduce((a, d) => a + d.value, 0) || 1;
    let run = 0, reached = false;
    return s.map((d) => {
      run += d.value;
      const vital = !reached; // include the cause that crosses the line
      if (run / total >= cut - 1e-9) reached = true;
      return { ...d, share: d.value / total, cum: run / total, vital };
    });
  }
</script>
<script lang="ts">
  // Ranked causes (bars, descending) + cumulative share (line, right axis) + a reference line (default 80 %).
  // The two axes are linked (right 100 % = left total), so the line reads against the same bars. "Vital few" = the causes up to the line.
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { baseLayout } from './theme.svelte';
  import { autoTick, compact } from './scale';
  import { wrapLabel } from './labels';
  let { items, threshold = 0.8, format = compact, valueLabel = 'Count', height = 320, label, filename = 'pareto', onselect }: {
    items: { label: string; value: number }[]; /** reference share, 0–1 */ threshold?: number; format?: (n: number) => string;
    /** what the bars count, e.g. "Cases lost" */ valueLabel?: string; height?: number; label: string; filename?: string;
    onselect?: (label: string) => void;
  } = $props();

  const rows = $derived(paretoRows(items, threshold));
  const vitalCount = $derived(rows.filter((r) => r.vital).length);

  function spec(t: any, ctx: { narrow: boolean }) {
    const total = rows.reduce((a, d) => a + d.value, 0);
    const x = rows.map((r) => r.label);
    const bars = (vital: boolean, name: string, color: string) => {
      const sub = rows.filter((r) => r.vital === vital);
      return { type: 'bar', name, x: sub.map((r) => r.label), y: sub.map((r) => r.value), marker: { color },
        text: sub.map((r) => format(r.value)), texttemplate: '%{text}', textposition: 'auto', textangle: 0, insidetextanchor: 'end', textfont: { size: 11 }, outsidetextfont: { size: 11, color: t.text }, cliponaxis: false,
        customdata: sub.map((r) => [Math.round(r.share * 100), Math.round(r.cum * 100)]), hovertemplate: `<b>%{text}</b>  %{x}<br>%{customdata[0]}% of total · cumulative %{customdata[1]}%<extra>${valueLabel}</extra>` };
    };
    const data = [
      bars(true, `Vital few (${vitalCount})`, t.series[0]),
      ...(vitalCount < rows.length ? [bars(false, 'Others', t.other)] : []),
      { type: 'scatter', mode: 'lines+markers', name: 'Cumulative %', x, y: rows.map((r) => r.cum), yaxis: 'y2', line: { color: t.text, width: 2 },
        marker: { size: 8, color: t.text, line: { color: t.surface, width: 2 } }, hovertemplate: 'Cumulative <b>%{y:.0%}</b>  %{x}<extra></extra>' },
    ];
    const lay = baseLayout(t, { legend: true, height });
    lay.barmode = 'overlay';
    lay.hovermode = 'closest';
    lay.xaxis = { ...lay.xaxis, type: 'category', categoryorder: 'array', categoryarray: x, fixedrange: true, tickmode: 'array', tickvals: x, ...(ctx.narrow && rows.length > 4
      ? { ticktext: x.map((c) => (c.length > 14 ? `${c.slice(0, 13)}…` : c)), tickangle: -45 }
      : { ticktext: x.map((c) => wrapLabel(c, rows.length > 6 ? 11 : 14)), tickangle: 0 }) };
    lay.yaxis = { ...lay.yaxis, title: { ...lay.yaxis.title, text: ctx.narrow ? '' : valueLabel }, range: [0, total * 1.02], showgrid: true, gridcolor: t.grid, tickformat: autoTick([total]), fixedrange: true };
    lay.yaxis2 = { overlaying: 'y', side: 'right', range: [0, 1.02], tickformat: '.0%', tickvals: [0, 0.2, 0.4, 0.6, 0.8, 1], showgrid: false, zeroline: false, fixedrange: true, tickfont: { color: t.muted, size: 11 }, automargin: true };
    lay.shapes = [{ type: 'line', xref: 'paper', yref: 'y2', x0: 0, x1: 1, y0: threshold, y1: threshold, line: { color: t.danger, width: 1.5, dash: 'dash' } }];
    lay.annotations = [{ xref: 'paper', yref: 'y2', x: 1, y: threshold, xanchor: 'right', yanchor: 'bottom', showarrow: false, text: `${Math.round(threshold * 100)}% line`, font: { size: 11, color: t.danger } }];
    return { data, layout: lay };
  }
</script>
<PlotlyChart {spec} {height} {label} {filename} zoom={false} onselect={onselect ? (p: PlotPoint) => onselect(String(p.x)) : undefined} />
<p class="caption">{#if rows.length}<b>{vitalCount} of {rows.length}</b> causes make up {Math.round((rows[vitalCount - 1]?.cum ?? 0) * 100)}% of the total — the vital few.{/if}</p>
