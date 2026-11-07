<script lang="ts">
  // A set of dashboards (docs/15): one GET /v1/dashboards call for every key (scoped by the caller and the filters), then each
  // panel from its feature group. Browser-computed panels (plan vs actual, audit log) render without server data.
  import { dashboards, type DashFilter, type DashKey, type DashResponse } from '@btw/api';
  import { dashDef } from '@btw/api/dashboards';
  import { DashboardGrid } from '../../components/dashboard';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import Business from './panels/Business.svelte';
  import Purchasing from './panels/Purchasing.svelte';
  import Fleet from './panels/Fleet.svelte';
  import Money from './panels/Money.svelte';
  import Stock from './panels/Stock.svelte';
  import Admin from './panels/Admin.svelte';
  let { keys: allKeys, filter, cols = 2, onload }: { keys: DashKey[]; filter: DashFilter; cols?: 1 | 2 | 3; onload?: (r: DashResponse) => void } = $props();
  // analysis sections (docs/17 Phase 2) render under the grid (Analysis.svelte), not as panels
  const keys = $derived(allKeys.filter((k) => !dashDef(k)?.analysis));
  let res = $state<DashResponse | null>(null);
  const serverKeys = $derived(keys.filter((k) => !dashDef(k)?.client));
  const w = watch(async () => {
    const r = serverKeys.length ? await dashboards.get(serverKeys, filter) : null;
    res = r; if (r) onload?.(r);
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
    {#each keys as k (k)}
      {@const def = dashDef(k)}
      {@const r = res?.results[k]}
      {#if def && (r || def.client)}
        {@const P = C[k === 'fast-slow' ? 'business' : k === 'warehouse-today' ? 'warehouse' : k === 'order-this-week' ? 'purchasing' : def.group]}
        <P key={k} {r} link={def.link} span={spans[k]} />
      {/if}
    {/each}
  </DashboardGrid>
{/if}
