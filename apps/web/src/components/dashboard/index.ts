// Dashboard kit (workstream C step 1). Import from here in new dashboards; nothing here is in the web entry unless a screen in the
// entry imports it. Plotly charts load Plotly lazily; Excel and PDF writers load on first export.
import '../charts/charts.css';
export { default as DashboardPanel } from './DashboardPanel.svelte';
export { default as DashboardGrid } from './DashboardGrid.svelte';
export { default as ExportMenu } from './ExportMenu.svelte';
export { default as Freshness, ago, freshnessText } from './Freshness.svelte';
export type { ExportMeta, Rows } from './export/meta';
// charts (C-01)
export { default as Waterfall, type WaterfallStep } from '../charts/Waterfall.svelte';
export { default as QuadrantScatter, type QuadPoint, type Quadrant } from '../charts/QuadrantScatter.svelte';
export { default as Pareto, paretoRows } from '../charts/Pareto.svelte';
export { default as StackedBarH, type StackPart } from '../charts/StackedBarH.svelte';
export { default as StageBars, type Stage } from '../charts/StageBars.svelte';
export { default as GroupedBars, type GroupSeries } from '../charts/GroupedBars.svelte';
export { default as GapTable } from '../charts/GapTable.svelte';
export { default as AgeingBars, type AgeBand } from '../charts/AgeingBars.svelte';
export { default as StockCoverBars, coverStatus, type CoverItem } from '../charts/StockCoverBars.svelte';
export { default as StockCoverBands, bandCounts, DEFAULT_BANDS, type CoverBand } from '../charts/StockCoverBands.svelte';
export { default as TriageMatrix, defaultAction, type TriageAction } from '../charts/TriageMatrix.svelte';
export { default as KanbanBoard, type KanbanColumn, type KanbanCard } from '../charts/KanbanBoard.svelte';
export { default as BoxPlot } from '../charts/BoxPlot.svelte';
export { default as KpiScorecard, type Kpi, type KpiChange } from '../charts/KpiScorecard.svelte';
export { default as ExceptionList, type ExceptionItem } from '../charts/ExceptionList.svelte';
export { default as TrendLine } from '../charts/TrendLine.svelte';
export { default as StatusBadge } from '../charts/StatusBadge.svelte';
// C-04
export { STATUS, SEVERITY, statusOf, statusMeta, statusFill, statusTint, type Status, type StatusMeta, type Severity } from '../charts/status';
export { gapOf, gapText, type Gap } from '../charts/gap';
