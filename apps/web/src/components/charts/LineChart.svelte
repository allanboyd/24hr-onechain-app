<script lang="ts">
  // Trend / comparison lines (and areas). Time axes get range buttons (1M…All), a range slider, zoom/pan and double-click reset.
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { alpha, baseLayout, colorOf } from './theme.svelte';
  import { autoTick, compact } from './scale';
  export interface LineSeries { name: string; values: (number | null)[]; slot?: number; dashed?: boolean; area?: boolean }
  let { labels, series, format = compact, height = 280, label, yTitle = '', time, rangeslider, filename = 'trend', onselect, tickformat }: {
    labels: string[]; series: LineSeries[]; format?: (n: number) => string; height?: number; label: string; yTitle?: string;
    /** Treat labels as dates (auto when they look like YYYY-MM…). */ time?: boolean; rangeslider?: boolean; filename?: string;
    onselect?: (x: string, seriesName: string) => void;
    /** d3 format for the value axis; default picks SI units only for values ≥ 1,000. */ tickformat?: string;
  } = $props();
  const isTime = $derived(time ?? /^\d{4}-\d{2}/.test(labels[0] ?? ''));
  const slider = $derived(rangeslider ?? (isTime && labels.length > 20));
  function spec(t: any, o: { narrow?: boolean } = {}) {
    const data = series.map((s, i) => {
      const c = colorOf(t, s.slot ?? i);
      return {
        type: 'scatter', mode: labels.length > 60 ? 'lines' : 'lines+markers', name: s.name, x: labels, y: s.values,
        line: { color: c, width: 2, dash: s.dashed ? 'dash' : 'solid', shape: 'linear' }, marker: { size: 7, color: c, line: { color: t.surface, width: 2 } },
        fill: s.area ? 'tozeroy' : 'none', fillcolor: alpha(c, 0.1), connectgaps: false,
        text: s.values.map((v) => (v == null ? '—' : format(v))), hovertemplate: `<b>%{text}</b>  ${s.name}<extra></extra>`,
      };
    });
    const lay = baseLayout(t, { legend: series.length > 1, height });
    lay.hovermode = 'x unified';
    lay.yaxis = { ...lay.yaxis, title: { ...lay.yaxis.title, text: yTitle }, rangemode: 'tozero', tickformat: tickformat ?? autoTick(series.flatMap((x) => x.values)) };
    lay.xaxis = { ...lay.xaxis, type: isTime ? 'date' : 'category', showspikes: true, spikemode: 'across', spikethickness: 1, spikecolor: t.axis, spikedash: 'solid' };
    if (isTime) {
      lay.xaxis.rangeselector = {
        x: 0, y: 1.02, yanchor: 'bottom', bgcolor: 'rgba(0,0,0,0)', activecolor: alpha(t.series[0], 0.18), bordercolor: t.grid, borderwidth: 1,
        font: { color: t.text, size: 11 },
        buttons: [
          { count: 1, label: '1M', step: 'month', stepmode: 'backward' }, { count: 3, label: '3M', step: 'month', stepmode: 'backward' },
          { count: 6, label: '6M', step: 'month', stepmode: 'backward' }, { count: 1, label: 'YTD', step: 'year', stepmode: 'todate' },
          { count: 1, label: '1Y', step: 'year', stepmode: 'backward' }, { step: 'all', label: 'All' },
        ],
      };
      if (slider) lay.xaxis.rangeslider = { visible: true, thickness: 0.07, bgcolor: 'rgba(0,0,0,0)', bordercolor: t.grid, borderwidth: 1 };
      // Range buttons sit top-left; the legend goes top-right, or below the plot on narrow screens so they never overlap.
      if (series.length > 1) lay.legend = o.narrow
        ? { ...lay.legend, x: 0, xanchor: 'left', y: slider ? -0.42 : -0.16, yanchor: 'top' }
        : { ...lay.legend, x: 1, xanchor: 'right' };
      if (series.length > 1 && o.narrow) lay.margin = { ...(lay.margin ?? {}), b: ((lay.margin as { b?: number })?.b ?? 40) + 22 * Math.ceil(series.length / 2) };
    }
    return { data, layout: lay };
  }
</script>
<PlotlyChart {spec} {height} {label} {filename} onselect={onselect ? (p: PlotPoint) => onselect(String(p.x), p.seriesName ?? '') : undefined} />
