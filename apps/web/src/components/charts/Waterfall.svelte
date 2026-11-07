<script lang="ts">
  // Bridge from a start total through signed steps (and optional subtotals) to an end total — e.g. Sales → costs → Profit.
  // Floating bars (Plotly `base`), signed value labels, dashed connectors. Decreases/increases also carry a sign, never colour alone.
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { baseLayout } from './theme.svelte';
  import { statusFill } from './status';
  import { autoTick, compact } from './scale';
  import { wrapLabel } from './labels';
  export interface WaterfallStep {
    label: string;
    /** signed change for a step; for a total/subtotal the absolute level (omit to use the running total) */ value?: number;
    kind?: 'step' | 'total' | 'subtotal';
  }
  let { steps, format = compact, height = 300, label, filename = 'waterfall', onselect }: {
    steps: WaterfallStep[]; /** currency belongs in the format, e.g. (n) => `KES ${compact(n)}` */ format?: (n: number) => string;
    height?: number; label: string; filename?: string; onselect?: (step: string) => void;
  } = $props();

  /** Resolved bars: base, length, running level after the bar. */
  const bars = $derived.by(() => {
    let run = 0;
    return steps.map((s, i) => {
      const kind = s.kind ?? (i === 0 || i === steps.length - 1 ? 'total' : 'step');
      if (kind === 'step') {
        const v = s.value ?? 0, from = run; run += v;
        return { ...s, kind, delta: v, base: Math.min(from, run), len: Math.abs(v), level: run };
      }
      run = s.value ?? run;
      return { ...s, kind, delta: run, base: Math.min(0, run), len: Math.abs(run), level: run };
    });
  });
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');

  function spec(t: any, ctx: { narrow: boolean }) {
    const b = bars;
    const fill = (k: string, d: number) => (k !== 'step' ? t.series[0] : d < 0 ? statusFill(t, 'bad') : statusFill(t, 'good'));
    const text = b.map((x) => (x.kind === 'step' ? `${sign(x.delta)}${format(Math.abs(x.delta))}` : format(x.delta)));
    const data = [{
      type: 'bar', x: b.map((x) => x.label), y: b.map((x) => x.len || 0.0001), base: b.map((x) => x.base),
      marker: { color: b.map((x) => fill(x.kind, x.delta)), line: { width: 0 } },
      text, texttemplate: '%{text}', textposition: 'outside', cliponaxis: false, constraintext: 'none', textfont: { color: t.text, size: ctx.narrow ? 10 : 11 },
      customdata: b.map((x) => [x.kind === 'step' ? (x.delta < 0 ? 'Decrease' : 'Increase') : x.kind === 'subtotal' ? 'Subtotal' : 'Total', format(x.level)]),
      hovertemplate: '<b>%{text}</b>  %{x}<br>%{customdata[0]} · running total %{customdata[1]}<extra></extra>', showlegend: false,
    }];
    const lay = baseLayout(t, { height });
    lay.bargap = 0.35;
    lay.hovermode = 'closest';
    // connectors: from the top/bottom of each bar to the next bar at the running level
    lay.shapes = b.slice(0, -1).map((x, i) => ({ type: 'line', xref: 'x', yref: 'y', x0: i + 0.33, x1: i + 0.67, y0: x.level, y1: x.level, line: { color: t.axis, width: 1, dash: 'dot' } }));
    const lo = Math.min(0, ...b.map((x) => x.base)), hi = Math.max(0, ...b.map((x) => x.base + x.len));
    lay.yaxis = { ...lay.yaxis, showgrid: true, gridcolor: t.grid, tickformat: autoTick([hi]), range: [lo < 0 ? lo * 1.15 : 0, hi * 1.12], fixedrange: true, zeroline: lo < 0, zerolinecolor: t.axis };
    const x = b.map((s) => s.label);
    lay.xaxis = { ...lay.xaxis, type: 'category', fixedrange: true, tickangle: 0, automargin: true, tickmode: 'array', tickvals: x, ticktext: x.map((c) => wrapLabel(c, ctx.narrow ? 9 : 14)) };
    return { data, layout: lay };
  }
</script>
<PlotlyChart {spec} {height} {label} {filename} zoom={false} onselect={onselect ? (p: PlotPoint) => onselect(String(p.x)) : undefined} />
<ul class="legend wf-key" aria-hidden="true">
  <li><span class="viz-key rect" style:background="var(--viz-1)"></span>Total</li>
  <li><span class="viz-key rect" style:background="var(--danger)"></span>− Decrease</li>
  {#if bars.some((x) => x.kind === 'step' && x.delta > 0)}<li><span class="viz-key rect" style:background="var(--success)"></span>+ Increase</li>{/if}
</ul>
<style>
  .wf-key { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); font-size: var(--fs-caption); color: var(--text-muted); }
  .wf-key li { display: inline-flex; align-items: center; gap: 6px; }
</style>
