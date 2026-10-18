<script lang="ts">
  import { destinationLabel } from '../../lib/planning';
  // One filter row above the charts: period preset (or custom dates), warehouse, brand, and grouping where it applies.
  import { ref, reports, type GroupBy, type PeriodPreset } from '@btw/api';
  let {
    preset = $bindable('last-90'), from = $bindable(''), to = $bindable(''), wh = $bindable(''), prod = $bindable(''), group = $bindable<GroupBy | ''>(''),
    presets = ['last-30', 'last-90', 'this-quarter', 'last-quarter', 'ytd', 'last-12m'] as (PeriodPreset | 'custom')[], showGroup = false, showBrand = true, showWarehouse = true, showPeriod = true,
  }: {
    preset?: PeriodPreset | 'custom'; from?: string; to?: string; wh?: string; prod?: string; group?: GroupBy | '';
    presets?: (PeriodPreset | 'custom')[]; showGroup?: boolean; showBrand?: boolean; showWarehouse?: boolean; showPeriod?: boolean;
  } = $props();
  const r = ref();
  const label = (p: PeriodPreset | 'custom') => (p === 'custom' ? 'Custom dates' : reports.resolvePeriod(p, Date.now()).label);
  const all = $derived([...presets, ...(presets.includes('custom') ? [] : ['custom' as const])]);
  function pick(p: PeriodPreset | 'custom') {
    preset = p;
    if (p !== 'custom') { const x = reports.resolvePeriod(p, Date.now()); from = x.from.slice(0, 10); to = new Date(Date.parse(x.to) - 864e5).toISOString().slice(0, 10); }
  }
  $effect(() => { if (!from && preset !== 'custom') pick(preset); });
</script>
<div class="filters" role="group" aria-label="Report filters">
  {#if showPeriod}
  <label class="field"><span>Period</span>
    <select class="select" value={preset} onchange={(e) => pick((e.currentTarget as HTMLSelectElement).value as PeriodPreset)}>
      {#each all as p}<option value={p}>{label(p)}</option>{/each}
    </select></label>
  <label class="field dt"><span>From</span><input class="input" type="date" bind:value={from} oninput={() => (preset = 'custom')} /></label>
  <label class="field dt"><span>To</span><input class="input" type="date" bind:value={to} oninput={() => (preset = 'custom')} /></label>
  {/if}
  {#if showWarehouse}<label class="field"><span>Warehouse</span><select class="select" bind:value={wh}><option value="">All warehouses</option>{#each r.warehouses as w}<option value={w.id}>{destinationLabel(w.id)}</option>{/each}</select></label>{/if}
  {#if showBrand}<label class="field"><span>Brand</span><select class="select" bind:value={prod}><option value="">All brands</option>{#each r.products as p}<option value={p.id}>{p.brand} · {p.pack}</option>{/each}</select></label>{/if}
  {#if showGroup}<label class="field"><span>Group by</span><select class="select" bind:value={group}><option value="">Automatic</option><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option><option value="quarter">Quarter</option></select></label>{/if}
</div>
<style>
  .filters { display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: flex-end; }
  .filters .field { min-width: 150px; flex: 0 1 auto; }
  .filters .dt { min-width: 140px; }
  @media (max-width: 600px) { .filters .field { flex: 1 1 140px; } }
</style>
