// Page kit (docs/17 §3, §5 step 4; usage in docs/13-dashboard-kit.md "Page kit"). Import from screens only — never
// from App.svelte or other entry code, so it stays out of the entry bundle.
export { default as PageHeader } from './PageHeader.svelte';
export { default as SummaryStrip, type SummaryTile } from './SummaryStrip.svelte';
export { default as FilterBar } from './FilterBar.svelte';
export { default as ChipGroup } from './ChipGroup.svelte';
export { default as Tabs } from './Tabs.svelte';
export { default as ActionInCompany } from './ActionInCompany.svelte';
export { default as WorkPage } from './WorkPage.svelte';
export { default as DetailDrawer } from './DetailDrawer.svelte';
export { default as AnalysisLink } from './AnalysisLink.svelte';
export { default as EmptyState } from './EmptyState.svelte';
export { default as NeedsActionBadge } from './NeedsActionBadge.svelte';
export { default as InfoTip } from './InfoTip.svelte';
export { queryFilters, readQuery, writeQuery, hashQuery, takeIntent, RESERVED_KEYS, type QueryFilters } from './query.svelte';
