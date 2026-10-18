<script lang="ts">
  // Part-to-whole (≤ 6 slices; extra folds into "Other"). Click a slice → onselect(label).
  import PlotlyChart, { type PlotPoint } from './PlotlyChart.svelte';
  import { baseLayout, colorOf } from './theme.svelte';
  import { compact, foldOther } from './scale';
  let { data, format = compact, height = 260, label, center = '', filename = 'share', onselect }: {
    data: { label: string; value: number }[]; format?: (n: number) => string; height?: number; label: string;
    /** text in the hole, e.g. the total */ center?: string; filename?: string; onselect?: (label: string) => void;
  } = $props();
  const items = $derived(foldOther(data.filter((d) => d.value > 0), 6));
  function spec(t: any) {
    const total = items.reduce((a, d) => a + d.value, 0);
    const lay = baseLayout(t, { legend: true, height });
    lay.legend = { ...lay.legend, orientation: 'v', x: 1, xanchor: 'left', y: 0.5, yanchor: 'middle' };
    lay.margin = { l: 8, r: 8, t: 8, b: 8 };
    lay.annotations = center ? [{ text: `<b>${center}</b>`, showarrow: false, font: { size: 16, color: t.text, family: t.font }, x: 0.5, y: 0.5, xref: 'paper', yref: 'paper' }] : [];
    return {
      data: [{
        type: 'pie', hole: 0.62, sort: false, direction: 'clockwise', labels: items.map((d) => d.label), values: items.map((d) => d.value),
        marker: { colors: items.map((d, i) => (d.label === 'Other' ? t.other : colorOf(t, i))), line: { color: t.surface, width: 2 } },
        text: items.map((d) => `${format(d.value)} · ${total ? Math.round((d.value / total) * 100) : 0}%`), textinfo: 'none',
        hovertemplate: '<b>%{text}</b>  %{label}<extra></extra>',
      }],
      layout: lay,
    };
  }
</script>
<PlotlyChart {spec} {height} {label} {filename} zoom={false} onselect={onselect ? (p: PlotPoint) => onselect(String(p.label)) : undefined} />
