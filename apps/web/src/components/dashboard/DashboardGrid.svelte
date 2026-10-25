<script lang="ts">
  // Responsive layout for DashboardPanels: N columns on desktop, two on tablets (when N ≥ 3), one chart per screen width on phones.
  import type { Snippet } from 'svelte';
  let { cols = 2, children, label }: { cols?: 1 | 2 | 3; children: Snippet; label?: string } = $props();
</script>
<div class="dash-grid" class:c3={cols === 3} style:--cols={cols} role={label ? 'region' : undefined} aria-label={label}>{@render children()}</div>
<style>
  .dash-grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: var(--space-4); margin-top: var(--space-4); align-items: stretch; }
  @media (max-width: 1200px) { .dash-grid.c3 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 900px) { .dash-grid { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); } }
</style>
