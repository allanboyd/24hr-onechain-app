<script lang="ts">
  // Dashboard filters: period first (Today by default), then supplier, route, warehouse, product — only choices
  // inside the person's scope. The company is the switcher in the top bar. Directors also pick a currency.
  import { lookup, type DashFilter, type DashResponse } from '@btw/api';
  import { company, GROUP } from '../../lib/company.svelte';
  import { CODES, currency, setCurrency } from './fmt.svelte';
  import { DEFAULT_PERIOD, PERIODS, datesOf, type PeriodKey } from './period';
  let { filter = $bindable(), options, money = false }: { filter: DashFilter; options: DashResponse['options'] | null; money?: boolean } = $props();
  let preset = $state<PeriodKey>(DEFAULT_PERIOD);
  function setPreset(k: PeriodKey) {
    preset = k;
    filter = { ...filter, ...datesOf(k) };
  }
  const set = (k: keyof DashFilter, v: string) => (filter = { ...filter, [k]: v || undefined });
  const name = {
    suppliers: (id: string) => { const s = lookup.supplier(id); return s ? `${s.code} ${s.city}` : id; },
    routes: (id: string) => lookup.route(id)?.name ?? id,
    warehouses: (id: string) => lookup.warehouse(id)?.name ?? id,
    products: (id: string) => { const p = lookup.product(id); return p ? `${p.brand} ${p.pack}` : id; },
  };
  const FIELDS: { k: keyof DashFilter; o: keyof DashResponse['options']; label: string; all: string }[] = [
    { k: 'supplierId', o: 'suppliers', label: 'Supplier', all: 'All suppliers' }, { k: 'routeId', o: 'routes', label: 'Route', all: 'All routes' },
    { k: 'warehouseId', o: 'warehouses', label: 'Warehouse', all: 'All warehouses' }, { k: 'productId', o: 'products', label: 'Product', all: 'All products' },
  ];
  const sorted = (o: keyof DashResponse['options']) => [...(options?.[o] ?? [])].sort((a, b) => name[o](a).localeCompare(name[o](b)));
  const any = $derived(!!(filter.supplierId || filter.routeId || filter.warehouseId || filter.productId || preset !== DEFAULT_PERIOD));
</script>

<div class="fbar card" role="group" aria-label="Dashboard filters">
  <label>Period <select class="select" value={preset} onchange={(e) => setPreset(e.currentTarget.value as PeriodKey)}>{#each PERIODS as p}<option value={p.key}>{p.label}</option>{/each}</select></label>
  {#each FIELDS as f}
    {#if (options?.[f.o]?.length ?? 0) > 1 || filter[f.k]}
      <label>{f.label} <select class="select" value={filter[f.k] ?? ''} onchange={(e) => set(f.k, e.currentTarget.value)}><option value="">{f.all}</option>{#each sorted(f.o) as id}<option value={id}>{name[f.o](id)}</option>{/each}</select></label>
    {/if}
  {/each}
  {#if money}<label>Currency <select class="select" value={currency.code} onchange={(e) => setCurrency(e.currentTarget.value)}>{#each CODES as c}<option>{c}</option>{/each}</select></label>{/if}
  {#if any}<button class="btn btn-ghost btn-sm" onclick={() => { preset = DEFAULT_PERIOD; filter = { ...datesOf(DEFAULT_PERIOD) }; }}>Clear</button>{/if}
  <span class="caption scope">Company: {company.active === GROUP ? 'Group (all companies, read-only)' : lookup.entity(company.active)?.shortName ?? 'yours'} · change it at the top{#if currency.code !== 'USD' && currency.month} · {currency.code} at the {currency.month} rate{/if}</span>
</div>

<style>
  .fbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-2) var(--space-3); padding: var(--space-3) var(--space-4); margin-top: var(--space-3); }
  label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--text-muted); font-weight: 600; }
  .select { height: 32px; min-width: 130px; max-width: 220px; }
  .scope { margin-left: auto; align-self: center; }
  @media (max-width: 600px) { .select { min-width: 0; width: 100%; max-width: none; } label { flex: 1 1 45%; } .scope { margin-left: 0; } }
</style>
