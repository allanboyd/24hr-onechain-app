<script lang="ts">
  // Dashboard filters: period first (Today by default), then supplier, route, warehouse, product — only choices
  // inside the person's scope. The company is the switcher in the top bar. Directors also pick a currency.
  import { lookup, type DashFilter, type DashResponse } from '@btw/api';
  import { company, GROUP } from '../../lib/company.svelte';
  import { CODES, currency, setCurrency } from './fmt.svelte';
  import { DEFAULT_PERIOD, PERIODS, datesOf, type PeriodKey } from './period';
  let {
    filter = $bindable(),
    options,
    money = false,
    embedded = false,
    active = $bindable(false),
    chip = $bindable(''),
  }: {
    filter: DashFilter;
    options: DashResponse['options'] | null;
    money?: boolean;
    /** plain field stack for FilterPanel (no filter bar card) */ embedded?: boolean;
    /** true when anything differs from defaults */ active?: boolean;
    /** short label for toolbar chips */ chip?: string;
  } = $props();
  let preset = $state<PeriodKey>(DEFAULT_PERIOD);
  function setPreset(k: PeriodKey) {
    preset = k;
    filter = { ...filter, ...datesOf(k) };
  }
  const set = (k: keyof DashFilter, v: string) => (filter = { ...filter, [k]: v || undefined });
  const name = {
    suppliers: (id: string) => {
      const s = lookup.supplier(id);
      return s ? `${s.code} ${s.city}` : id;
    },
    routes: (id: string) => lookup.route(id)?.name ?? id,
    warehouses: (id: string) => lookup.warehouse(id)?.name ?? id,
    products: (id: string) => {
      const p = lookup.product(id);
      return p ? `${p.brand} ${p.pack}` : id;
    },
  };
  const BAR: { key: PeriodKey; label: string }[] = [
    { key: 'today', label: 'Day' },
    { key: '7', label: 'Week' },
    { key: '30', label: '30 days' },
    { key: 'ytd', label: 'Year to date' },
  ];
  const extra: { k: keyof DashFilter; o: keyof DashResponse['options']; label: string; all: string }[] = [
    { k: 'supplierId', o: 'suppliers', label: 'Supplier', all: 'All suppliers' },
    { k: 'routeId', o: 'routes', label: 'Route', all: 'All routes' },
    { k: 'productId', o: 'products', label: 'Product', all: 'All products' },
  ];
  const sorted = (o: keyof DashResponse['options']) => [...(options?.[o] ?? [])].sort((a, b) => name[o](a).localeCompare(name[o](b)));
  const dim = $derived(!!(filter.supplierId || filter.routeId || filter.warehouseId || filter.productId));
  const any = $derived(dim || preset !== DEFAULT_PERIOD);
  $effect(() => {
    active = any;
    if (!any) chip = '';
    else {
      const p = PERIODS.find((x) => x.key === preset)?.short ?? preset;
      chip = dim ? `${p} · filtered` : p;
    }
  });
  export function reset() {
    preset = DEFAULT_PERIOD;
    filter = { ...datesOf(DEFAULT_PERIOD) };
  }
</script>

{#snippet fields()}
  <label>Period <select class="select" value={preset} onchange={(e) => setPreset(e.currentTarget.value as PeriodKey)}>{#each PERIODS as p}<option value={p.key}>{p.label}</option>{/each}</select></label>
  <label>Warehouse <select class="select" value={filter.warehouseId ?? ''} onchange={(e) => set('warehouseId', e.currentTarget.value)}><option value="">All warehouses</option>{#each sorted('warehouses') as id}<option value={id}>{name.warehouses(id)}</option>{/each}</select></label>
  {#each extra as f}
    {#if (options?.[f.o]?.length ?? 0) > 1 || filter[f.k]}
      <label
        >{f.label}
        <select class="select" value={filter[f.k] ?? ''} onchange={(e) => set(f.k, e.currentTarget.value)}
          ><option value="">{f.all}</option>{#each sorted(f.o) as id}<option value={id}>{name[f.o](id)}</option>{/each}</select
        ></label
      >
    {/if}
  {/each}
  {#if money}<label>Currency <select class="select" value={currency.code} onchange={(e) => setCurrency(e.currentTarget.value)}>{#each CODES as c}<option>{c}</option>{/each}</select></label>{/if}
  {#if !embedded && any}<button class="btn btn-ghost btn-sm" onclick={reset}>Clear</button>{/if}
  <span class="caption scope">Company: {company.active === GROUP ? 'Group (all companies, read-only)' : (lookup.entity(company.active)?.shortName ?? 'yours')} · change it at the top{#if currency.code !== 'USD' && currency.month} · {currency.code} at the {currency.month} rate{/if}</span>
{/snippet}

{#if embedded}
  <div class="embed" role="group" aria-label="Dashboard filters">
    {@render fields()}
  </div>
{:else}
  <div class="fbar card" role="group" aria-label="Dashboard filters">
    <div class="sel-seg" role="group" aria-label="Warehouse">
      <button type="button" aria-pressed={!filter.warehouseId} onclick={() => set('warehouseId', '')}>Combined</button>
      {#each sorted('warehouses') as id (id)}<button type="button" aria-pressed={filter.warehouseId === id} onclick={() => set('warehouseId', id)}>{name.warehouses(id)}</button>{/each}
    </div>
    <div class="sel-seg" role="group" aria-label="Period">
      {#each BAR as c (c.key)}<button type="button" aria-pressed={preset === c.key} onclick={() => setPreset(c.key)}>{c.label}</button>{/each}
    </div>
    {#each extra as f (f.k)}
      {#if (options?.[f.o]?.length ?? 0) > 1 || filter[f.k]}
        <label>{f.label}
          <select class="select" value={filter[f.k] ?? ''} onchange={(e) => set(f.k, e.currentTarget.value)}><option value="">{f.all}</option>{#each sorted(f.o) as id}<option value={id}>{name[f.o](id)}</option>{/each}</select>
        </label>
      {/if}
    {/each}
    {#if money}<label>Currency <select class="select" value={currency.code} onchange={(e) => setCurrency(e.currentTarget.value)}>{#each CODES as c}<option>{c}</option>{/each}</select></label>{/if}
    {#if any}<button class="btn btn-ghost btn-sm" type="button" onclick={reset}>Clear</button>{/if}
  </div>
{/if}

<style>
  .fbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-3) var(--space-4);
    margin-top: var(--space-3);
  }
  .embed {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-3) var(--space-4);
    align-items: end;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 600;
  }
  .select {
    height: 32px;
    min-width: 130px;
    max-width: 220px;
  }
  .embed .select {
    max-width: none;
    width: 100%;
  }
  .scope {
    grid-column: 1 / -1;
    margin-top: var(--space-1);
  }
  .fbar .sel-seg { flex-wrap: wrap; max-width: 100%; }
  @media (max-width: 600px) {
    .select {
      min-width: 0;
      width: 100%;
      max-width: none;
    }
    .fbar label {
      flex: 1 1 45%;
    }
    .embed {
      grid-template-columns: 1fr;
    }
  }
</style>