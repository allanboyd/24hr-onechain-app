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
  // Row filling (2 columns): panels per key and full-width ones; a single panel that would sit alone takes the whole row.
  const TWO = ['stock-on-hand', 'profit-margin', 'sales-summary'];
  const FULL = ['exec-overview', 'fleet-board', 'alerts', 'fee-payments', 'fast-slow', 'border-stops', 'warehouse-today', 'order-this-week', 'stock-movements', 'data-completeness'];
  const spans = $derived.by(() => {
    const out: Record<string, 'full' | undefined> = {};
    if (cols !== 2) return out;
    const shown = keys.filter((k) => dashDef(k)?.client || res?.results[k]);
    let pos = 0;
    shown.forEach((k, i) => {
      if (FULL.includes(k)) { pos = 0; return; }
      const n = TWO.includes(k) ? 2 : 1;
      const next = shown[i + 1];
      if (n === 1 && pos === 0 && (!next || FULL.includes(next))) { out[k] = 'full'; return; }
      pos = (pos + n) % 2;
    });
    return out;
  });
  const C: Record<string, any> = { business: Business, purchasing: Purchasing, loading: Purchasing, fleet: Fleet, fees: Money, sales: Money, deliveries: Stock, warehouse: Stock, admin: Admin };
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
{#if !res && w.loading && serverKeys.length}
  <DashboardGrid {cols}>{#each keys.slice(0, 4) as _}<div class="card"><div class="skeleton" style="width:40%"></div><div class="skeleton" style="height:200px;margin-top:12px"></div></div>{/each}</DashboardGrid>
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
  .grp { grid-column: 1 / -1; margin: var(--space-5) 0 0; font-size: var(--fs-h2); line-height: var(--lh-h2); }
</style>
