<script lang="ts">
  // Rows × columns matrix. Magnitude → one-hue sequential ramp; or `classes` for discrete states (e.g. velocity).
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { baseLayout } from './theme.svelte';
  import { compact } from './scale';
  let { rows, cols, values, text, classes, format = compact, height, label, filename = 'heatmap', onselect }: {
    rows: string[]; cols: string[]; values: (number | null)[][]; text?: string[][];
    /** discrete states: values are indexes into this list */ classes?: { label: string; tone: 'success' | 'info' | 'warning' | 'danger' | 'other' }[];
    format?: (n: number) => string; height?: number; label: string; filename?: string; onselect?: (row: string, col: string) => void;
  } = $props();
  const h = $derived(height ?? Math.max(180, rows.length * 34 + 70));
  function spec(t: any, ctx: { narrow: boolean }) {
    let colorscale: any[]; let zmin: number | undefined; let zmax: number | undefined;
    if (classes) {
      const tone = (k: string) => ({ success: t.tint.success, info: t.tint.info, warning: t.tint.warning, danger: t.tint.danger, other: t.grid } as Record<string, string>)[k];
      const n = classes.length;
      colorscale = classes.flatMap((c, i) => [[i / n, tone(c.tone)], [(i + 1) / n, tone(c.tone)]]);
      zmin = -0.5; zmax = n - 0.5;
    } else {
      colorscale = t.seq.map((c: string, i: number) => [i / (t.seq.length - 1), c]);
    }
    const txt = text ?? values.map((r) => r.map((v) => (v == null ? '' : classes ? classes[v]?.label ?? '' : format(v))));
    const lay = baseLayout(t, { height: h });
    lay.xaxis = { ...lay.xaxis, side: 'top', showline: false, fixedrange: true, tickangle: 0, ticks: '', ...(ctx.narrow ? { tickmode: 'array', tickvals: cols, ticktext: cols.map((c) => c.replace(' ', '<br>')) } : {}) };
    if (ctx.narrow && rows.some((r) => r.length > 16)) lay.yaxis = { ...lay.yaxis, tickmode: 'array', tickvals: rows, ticktext: rows.map((r) => (r.length > 16 ? `${r.slice(0, 15)}…` : r)) };
    lay.yaxis = { ...lay.yaxis, autorange: 'reversed', fixedrange: true, showgrid: false, ticks: '', ticklabelstandoff: 6 };
    return {
      data: [{
        type: 'heatmap', x: cols, y: rows, z: values, text: txt, texttemplate: '%{text}', textfont: { size: 11, color: classes ? t.text : undefined },
        colorscale, zmin, zmax, showscale: false, xgap: 2, ygap: 2, hoverongaps: false,
        hovertemplate: '<b>%{text}</b>  %{y} · %{x}<extra></extra>',
      }],
      layout: lay,
    };
  }
</script>
<PlotlyChart {spec} height={h} {label} {filename} zoom={false} onselect={onselect ? (p: PlotPoint) => onselect(String(p.y), String(p.x)) : undefined} />
