<script lang="ts">
  // Analysis sections of a Home tab (docs/17 Phase 2): the reports of the retired Reports and Sales velocity pages and the
  // charts of the removed page Overview tabs, each once, under the tab's dashboards. Browser-built from the report
  // endpoints (same server gates as before); the Home filter bar's period, warehouse and product apply.
  import type { DashFilter, DashKey, ReportFilter, User } from '@btw/api';
  import { dashDef } from '@btw/api/dashboards';
  import '../../components/charts';
  let { keys, filter, user }: { keys: DashKey[]; filter: DashFilter; user: User } = $props();
  const DAY = 864e5;
  // Home's default period is the last 30 days
  const rf = $derived<ReportFilter>({
    from: filter.from ? `${filter.from}T00:00:00.000Z` : new Date(Date.now() - 30 * DAY).toISOString(),
    ...(filter.to ? { to: `${filter.to}T00:00:00.000Z` } : {}),
    ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
    ...(filter.productId ? { productId: filter.productId } : {}),
  });
  const LOAD: Partial<Record<DashKey, () => Promise<{ default: any }>>> = {
    'orders-analysis': () => import('./analysis/Orders.svelte'),
    'plan-vs-actual-report': () => import('../../components/reports/PlannedVsActualTab.svelte'),
    'purchase-planning': () => import('../../components/reports/PlanningTab.svelte'),
    'loading-queues': () => import('./analysis/Queues.svelte'),
    'shipment-analysis': () => import('./analysis/Shipments.svelte'),
    'logistics-report': () => import('../../components/reports/LogisticsTab.svelte'),
    'trip-costs': () => import('./analysis/TripCosts.svelte'),
    'finance-report': () => import('../../components/reports/FinanceTab.svelte'),
    'stock-analysis': () => import('./analysis/Stock.svelte'),
    'inventory-report': () => import('../../components/reports/InventoryTab.svelte'),
    'sales-velocity': () => import('../../components/reports/VelocityTab.svelte'),
    'sales-report': () => import('../../components/reports/SalesTab.svelte'),
    'quarterly-review': () => import('../../components/reports/QuarterlyTab.svelte'),
  };
  // the sales report can filter itself by a clicked brand / warehouse
  let extra = $state<{ wh?: string; prod?: string }>({});
  const salesFilter = $derived<ReportFilter>({ ...rf, ...(extra.wh ? { warehouseId: extra.wh } : {}), ...(extra.prod ? { productId: extra.prod } : {}) });
  const onfilter = (k: 'wh' | 'prod', v: string) => (extra = { ...extra, [k]: extra[k] === v ? undefined : v });
</script>

{#each keys as k (k)}
  {@const def = dashDef(k)}
  {@const load = LOAD[k]}
  {#if def && load}
    <section class="an" aria-labelledby="an-{k}">
      <header><h2 id="an-{k}">{def.title}</h2><p class="caption">{def.question}{#if def.link} · <a href={def.link}>Open the list</a>{/if}</p></header>
      {#await load() then M}
        {#key JSON.stringify(k === 'sales-report' ? salesFilter : rf)}
          <M.default {user} filter={k === 'sales-report' ? salesFilter : rf} group="" {onfilter} />
        {/key}
      {/await}
    </section>
  {/if}
{/each}

<style>
  .an { margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--border); }
  .an header { margin-bottom: var(--space-3); }
  .an h2 { margin: 0; font-size: var(--fs-h3); line-height: var(--lh-h3); }
</style>
