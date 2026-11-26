<script lang="ts" module>
  // Management pages' filter bar (the report's): Combined / one warehouse, and Day · Week · 30 days · Year to date.
  // Kept in the address (?wh= ?p=). Shared by every live Management page (V3-10).
  import { queryFilters } from '../../components/page';
  import { datesOf } from '../dash/period';
  export const reportFilters = () => queryFilters({ wh: '', p: '30' });
  export type ReportF = ReturnType<typeof reportFilters>;
  /** the dashboards API filter for these choices */
  export const apiFilter = (f: ReportF) => ({ ...datesOf(f.values.p), warehouseId: f.values.wh || undefined });
  export const CHOICES = [{ key: 'today', label: 'Day' }, { key: '7', label: 'Week' }, { key: '30', label: '30 days' }, { key: 'ytd', label: 'Year to date' }];
</script>

<script lang="ts">
  import { ref } from '@btw/api';
  import { destinationLabel } from '../../lib/planning';
  let { f, periods = CHOICES }: { f: ReportF; periods?: { key: string; label: string }[] } = $props();
  const warehouses = $derived(ref().warehouses);
</script>

<div class="ctl card">
  <div class="sel-seg" role="group" aria-label="Warehouse">
    <button type="button" aria-pressed={!f.values.wh} onclick={() => f.set('wh', '')}>Combined</button>
    {#each warehouses as x (x.id)}<button type="button" aria-pressed={f.values.wh === x.id} onclick={() => f.set('wh', x.id)}>{destinationLabel(x.id)}</button>{/each}
  </div>
  <div class="sel-seg" role="group" aria-label="Period">
    {#each periods as c (c.key)}<button type="button" aria-pressed={f.values.p === c.key} onclick={() => f.set('p', c.key)}>{c.label}</button>{/each}
  </div>
</div>

<style>
  .ctl { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: center; padding: var(--space-3); position: sticky; top: 68px; z-index: 5; }
</style>
