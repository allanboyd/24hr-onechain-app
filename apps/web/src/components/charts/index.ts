// Chart kit. Plotly-backed charts load Plotly lazily (never in the web entry); StatTile / Meter / Gauge / Legend are pure SVG.
import './charts.css';
export { default as ChartCard } from './ChartCard.svelte';
export { default as StatTile } from './StatTile.svelte';
export { default as LineChart } from './LineChart.svelte';
export { default as BarChart } from './BarChart.svelte';
export { default as Donut } from './Donut.svelte';
export { default as Heatmap } from './Heatmap.svelte';
export { default as Meter } from './Meter.svelte';
export { default as Gauge } from './Gauge.svelte';
export { default as Legend } from './Legend.svelte';
export { default as PlotlyChart, loadPlotly } from './PlotlyChart.svelte';
export { compact, usd, pct, foldOther, niceMax, slot, seq, toCsv, downloadCsv, monthKey, monthLabel, byMonth, type Rows } from './scale';
export { readTheme, alpha, baseLayout, type Theme } from './theme.svelte';
