<script lang="ts">
  // Spread per group (e.g. hours from truck arrival to dispatch, by loading point): box = middle half, line = median, whiskers, every point shown.
  // Sample size goes in the label so a handful of trips isn't read as a stable pattern. Optional target line.
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { baseLayout, colorOf, alpha } from './theme.svelte';
  import { autoTick } from './scale';
  import { wrapLabel } from './labels';
  let { groups, unit = '', target, targetLabel = 'Target', format = (n: number) => `${Math.round(n * 10) / 10}`, height = 300, label, filename = 'spread', onselect }: {
    groups: { label: string; values: number[]; slot?: number }[]; /** e.g. "hours" */ unit?: string; target?: number; targetLabel?: string;
    format?: (n: number) => string; height?: number; label: string; filename?: string; onselect?: (group: string) => void;
  } = $props();
  const name = (g: { label: string; values: number[] }) => `${g.label} (n=${g.values.length})`;

  function spec(t: any, ctx: { narrow: boolean }) {
    const data = groups.map((g, i) => {
      const c = colorOf(t, g.slot ?? i);
      return {
        type: 'box', name: name(g), y: g.values, boxpoints: 'all', jitter: 0.35, pointpos: 0, boxmean: false,
        marker: { color: c, size: 6, opacity: 0.7, line: { color: t.surface, width: 1 } }, line: { color: c, width: 2 }, fillcolor: alpha(c, 0.14),
        hoverinfo: 'y+name', hoveron: 'boxes+points', showlegend: false,
      };
    });
    const lay = baseLayout(t, { height });
    lay.hovermode = 'closest';
    const all = groups.flatMap((g) => g.values);
    lay.yaxis = { ...lay.yaxis, showgrid: true, gridcolor: t.grid, rangemode: 'tozero', tickformat: autoTick(all), fixedrange: true, title: { ...lay.yaxis.title, text: ctx.narrow ? '' : unit } };
    lay.xaxis = { ...lay.xaxis, fixedrange: true, tickangle: 0, ...(ctx.narrow ? { tickmode: 'array', tickvals: groups.map(name), ticktext: groups.map((g) => `${wrapLabel(g.label, 10)}<br>n=${g.values.length}`) } : {}) };
    if (target != null) {
      lay.shapes = [{ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: target, y1: target, line: { color: t.danger, width: 1.5, dash: 'dash' } }];
      lay.annotations = [{ xref: 'paper', yref: 'y', x: 1, y: target, xanchor: 'right', yanchor: 'bottom', showarrow: false, text: `${targetLabel} ${format(target)}${unit ? ' ' + unit : ''}`, font: { size: 11, color: t.ink?.danger ?? t.danger }, bgcolor: t.surface, borderpad: 2 }];
    }
    return { data, layout: lay };
  }
</script>
<PlotlyChart {spec} {height} {label} {filename} zoom={false} onselect={onselect ? (p: PlotPoint) => onselect(String(p.seriesName ?? p.x).replace(/ \(n=\d+\)$/, '')) : undefined} />
<p class="caption">Box = middle half of trips, line = median, dots = each trip.</p>
