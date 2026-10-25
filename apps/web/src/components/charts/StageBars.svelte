<script lang="ts">
  // Pipeline / funnel stages as columns: count and value per stage, drop-off % between stages. Click a stage → onselect(stage).
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { baseLayout } from './theme.svelte';
  import { autoTick, compact } from './scale';
  export interface Stage { label: string; count: number; value?: number }
  let { stages, formatValue = compact, countLabel = 'items', height = 300, label, filename = 'stages', onselect }: {
    stages: Stage[]; /** money per stage, e.g. (n) => `KES ${compact(n)}` */ formatValue?: (n: number) => string;
    /** noun for the count, e.g. "orders" */ countLabel?: string; height?: number; label: string; filename?: string;
    onselect?: (stage: Stage) => void;
  } = $props();
  /** Share lost from the previous stage (null for the first stage or when the previous is 0). */
  const drop = (i: number) => (i > 0 && stages[i - 1].count > 0 ? 1 - stages[i].count / stages[i - 1].count : null);

  function spec(t: any, ctx: { narrow: boolean }) {
    const x = stages.map((s) => s.label);
    const max = Math.max(1, ...stages.map((s) => s.count));
    const data = [{
      type: 'bar', x, y: stages.map((s) => s.count), marker: { color: t.series[0] },
      text: stages.map((s) => `<b>${s.count}</b>${s.value != null ? `<br>${formatValue(s.value)}` : ''}`), texttemplate: '%{text}', textposition: 'outside', cliponaxis: false,
      textfont: { color: t.text, size: ctx.narrow ? 10 : 12 },
      customdata: stages.map((s, i) => [s.value != null ? formatValue(s.value) : '—', drop(i) == null ? '' : `${Math.round(drop(i)! * 100)}% fewer than ${stages[i - 1].label.toLowerCase()}`]),
      hovertemplate: `<b>%{y} ${countLabel}</b>  %{x}<br>Value %{customdata[0]}<br>%{customdata[1]}<extra></extra>`, showlegend: false,
    }];
    const lay = baseLayout(t, { height });
    lay.bargap = 0.3;
    lay.hovermode = 'closest';
    lay.xaxis = { ...lay.xaxis, type: 'category', fixedrange: true, tickangle: 0, ...(ctx.narrow ? { tickmode: 'array', tickvals: x, ticktext: x.map((c) => c.replace(' ', '<br>')) } : {}) };
    lay.yaxis = { ...lay.yaxis, showgrid: true, gridcolor: t.grid, tickformat: autoTick([max]), range: [0, max * 1.3], fixedrange: true, title: { ...lay.yaxis.title, text: ctx.narrow ? '' : countLabel[0].toUpperCase() + countLabel.slice(1) } };
    // drop-off chips between columns
    lay.annotations = stages.slice(1).map((s, j) => {
      const d = drop(j + 1);
      return d == null || d <= 0 ? null : { x: j + 0.5, xref: 'x', y: max * 1.22, yref: 'y', showarrow: false, text: `▼ ${Math.round(d * 100)}%`,
        font: { size: 11, color: t.muted }, bgcolor: t.surface, bordercolor: t.grid, borderwidth: 1, borderpad: 3 };
    }).filter(Boolean);
    return { data, layout: lay };
  }
</script>
<PlotlyChart {spec} {height} {label} {filename} zoom={false} onselect={onselect ? (p: PlotPoint) => { const s = stages.find((x) => x.label === String(p.x)); if (s) onselect(s); } : undefined} />
<p class="caption">▼ = share lost between stages. Click a stage to open its {countLabel}.</p>
