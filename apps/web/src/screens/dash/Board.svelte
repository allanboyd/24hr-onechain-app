<script lang="ts">
  // A set of dashboards (docs/15): one GET /v1/dashboards call for every key (scoped by the caller and the filters), then each
  // panel from its feature group. Browser-computed panels (plan vs actual, audit log) render without server data.
  import { dashboards, type DashFilter, type DashKey, type DashResponse } from '@btw/api';
  import { DASH_GROUPS, dashDef } from '@btw/api/dashboards';
  import { DashboardGrid } from '../../components/dashboard';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import Business from './panels/Business.svelte';
  import Purchasing from './panels/Purchasing.svelte';
  import Fleet from './panels/Fleet.svelte';
  import Money from './panels/Money.svelte';
  import Stock from './panels/Stock.svelte';
  import Admin from './panels/Admin.svelte';
  let { keys: allKeys, filter, cols = 2, sections = false, room = false, onload }: { keys: DashKey[]; filter: DashFilter; cols?: 1 | 2 | 3; /** a heading when the feature group changes */ sections?: boolean; /** control-room page names on the section headings */ room?: boolean; onload?: (r: DashResponse) => void } = $props();
const sectionOf = (k?: string) => (k === 'order-this-week' ? 'purchasing' : k === 'warehouse-today' ? 'warehouse' : (k ? dashDef(k)?.group : '') ?? '');
const ROOM: Record<string, string> = {
  business: 'Overview and executive report',
  purchasing: 'Plans, orders and supplier balances',
  loading: 'Loading',
  fleet: 'Fleet and delays',
  fees: 'Expenses, bills and cash',
  deliveries: 'Received, damaged and short',
  warehouse: 'Stock run-out and warehouse performance',
  sales: 'Sales and clients',
  admin: 'Documents and alerts',
};
const groupLabel = (g: string) => (room && ROOM[g]) || DASH_GROUPS.find((x) => x.key === g)?.label || 'Your desk';
  // analysis sections (docs/17 Phase 2) render under the grid (Analysis.svelte), not as panels
  const keys = $derived(allKeys.filter((k) => !dashDef(k)?.analysis));
  let res = $state<DashResponse | null>(null);
  const serverKeys = $derived(keys.filter((k) => !dashDef(k)?.client));
  const w = watch(async () => {
    // An empty key list still returns the filter choices, so a tab of client-built reports keeps the filter bar.
    const r = await dashboards.get(serverKeys, filter);
    res = r; onload?.(r);
  }, () => JSON.stringify([serverKeys, filter]));
  // Wide charts and opening summaries keep the whole row. Paired charts stay one column each, so a short card is not stretched.
  const FULL = ['exec-overview', 'fleet-board', 'alerts', 'fast-slow', 'border-stops', 'warehouse-today', 'order-this-week', 'stock-movements', 'data-completeness'];
  const spans = $derived.by(() => {
    const out: Record<string, 'full' | undefined> = {};
    if (cols !== 2) return out;
    for (const k of keys) if (FULL.includes(k)) out[k] = 'full';
    return out;
  });
  // V3-11 LD-1: the Fleet tab fits the screen. Board + delayed on top, issues · updates · borders below; each panel scrolls
  // inside its own cell, so the page itself doesn't need to scroll (phones: stacked, each with its own max height).
  const FIT_AREAS: Record<string, string> = { 'fleet-board': 'board', 'delayed-trucks': 'delayed', 'truck-issues': 'issues', 'driver-updates': 'updates', 'border-stops': 'borders' };
  const fit = $derived(keys.includes('fleet-board') && keys.every((k) => k in FIT_AREAS));
  let fitEl = $state<HTMLDivElement>();
  let fitH = $state(0);
  $effect(() => {
    if (!fit || !fitEl) return;
    const size = () => { const room = innerHeight - fitEl!.getBoundingClientRect().top - 16; fitH = Math.max(240, room); };
    size(); addEventListener('resize', size);
    return () => removeEventListener('resize', size);
  });
  const C: Record<string, any> = { business: Business, purchasing: Purchasing, loading: Purchasing, fleet: Fleet, fees: Money, sales: Money, deliveries: Stock, warehouse: Stock, admin: Admin };
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
{#if !res && w.loading && serverKeys.length}
  <DashboardGrid {cols}>{#each keys.slice(0, 4) as _}<div class="card"><div class="skeleton" style="width:40%"></div><div class="skeleton" style="height:200px;margin-top:12px"></div></div>{/each}</DashboardGrid>
{:else if fit}
  <div class="fit" bind:this={fitEl} style:--fit-h="{fitH}px" role="region" aria-label="Fleet board">
    {#each keys as k (k)}
      {@const def = dashDef(k)}
      {@const r = res?.results[k]}
      {#if def && r}<div class="cell" style:grid-area={FIT_AREAS[k]}><Fleet key={k} {r} link={def.link} span={1} /></div>{/if}
    {/each}
  </div>
{:else}
  <DashboardGrid {cols}>
    {#each keys as k, i (k)}
      {@const def = dashDef(k)}
      {@const r = res?.results[k]}
      {#if sections && def && sectionOf(keys[i - 1]) !== sectionOf(k)}
        <h2 class="grp">{groupLabel(sectionOf(k))}</h2>
      {/if}
      {#if def && (r || def.client)}
        {@const P = C[k === 'fast-slow' ? 'business' : k === 'warehouse-today' ? 'warehouse' : k === 'order-this-week' ? 'purchasing' : def.group]}
        <P key={k} {r} link={def.link} span={spans[k]} />
      {/if}
    {/each}
  </DashboardGrid>
{/if}

<style>
  /* V3-11 LD-1 Fleet fit layout */
  .fit { display: grid; gap: var(--space-4); margin-top: var(--space-4); height: var(--fit-h, 80vh);
    grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-rows: minmax(0, 1.15fr) minmax(0, 1fr);
    grid-template-areas: 'board board board delayed' 'issues updates borders borders'; }
  .fit .cell { min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
  .fit .cell > :global(.dash-panel) { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .fit .cell :global(.dash-panel > header), .fit .cell :global(.dash-panel > footer) { flex: none; }
  .fit .cell :global(.dash-panel .body) { flex: 1; min-height: 0; overflow: auto; }
  .fit .cell :global(.dash-panel .body thead th) { position: sticky; top: 0; z-index: 1; }
  .fit .cell :global(.table-wrap) { max-height: none !important; overflow: visible !important; }
  @media (max-width: 1100px) { .fit { height: auto; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: none; grid-auto-rows: 70vh; grid-template-areas: 'board board' 'delayed issues' 'updates borders'; } }
  @media (max-width: 700px) { .fit { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'board' 'delayed' 'issues' 'updates' 'borders'; } }
  .grp { grid-column: 1 / -1; margin: var(--space-5) 0 0; font-size: var(--fs-h2); line-height: var(--lh-h2); }
</style>
