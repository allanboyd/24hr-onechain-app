<script lang="ts">
  // Centred bars, widest at the top: a pyramid of a ranked result. The inner bar is the second figure (profit inside sales).
  import PlotlyChart from './PlotlyChart.svelte';
  import { baseLayout } from './theme.svelte';
  let { rows, format, height = 320, label, filename = 'pyramid' }: {
    rows: { label: string; outer: number; inner: number }[];
    format: (n: number) => string;
    height?: number;
    label: string;
    filename?: string;
  } = $props();

  function spec(t: any) {
    const peak = Math.max(1, ...rows.map((r) => Math.abs(r.outer)));
    const lay = baseLayout(t, { legend: true, height });
    lay.bargap = 0.28;
    lay.hovermode = 'closest';
    lay.xaxis = { ...lay.xaxis, visible: false, range: [peak * -0.62, peak * 0.62], fixedrange: true };
    lay.yaxis = { ...lay.yaxis, type: 'category', autorange: 'reversed', showgrid: false, fixedrange: true };
    lay.legend = { ...lay.legend, orientation: 'h', x: 0, y: 1.08 };
    const bar = (name: string, key: 'outer' | 'inner', color: string) => ({
      type: 'bar',
      orientation: 'h',
      name,
      y: rows.map((r) => r.label),
      x: rows.map((r) => r[key]),
      base: rows.map((r) => -r[key] / 2),
      marker: { color, line: { color: t.surface, width: 1 } },
      customdata: rows.map((r) => [format(r.outer), format(r.inner)]),
      hovertemplate: '<b>%{y}</b><br>Sales %{customdata[0]}<br>Profit %{customdata[1]}<extra></extra>',
      showlegend: true,
    });
    return { data: [bar('Sales', 'outer', t.series[0]), bar('Profit', 'inner', t.vizGood)], layout: lay };
  }
</script>

<PlotlyChart {spec} {height} {label} {filename} zoom={false} />
<p class="caption">Widest at the top is the biggest day. Profit sits inside sales.</p>
